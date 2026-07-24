import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { transformAsync } from "@babel/core";
import causeScopeBabelPlugin from "@causescope/babel-plugin";
import { createFilter, type FilterPattern } from "@rollup/pluginutils";
import launchEditor from "launch-editor";
import type { Plugin, ResolvedConfig } from "vite";
import type { RedactOptions } from "@causescope/shared";

const VIRTUAL_RUNTIME_ID = "virtual:causescope-runtime";
const RESOLVED_RUNTIME_ID = "\0virtual:causescope-runtime";
const OPEN_IN_EDITOR_PATH = "/__causescope/open-in-editor";

export interface CauseScopeOptions {
  enabled?: boolean;
  include?: FilterPattern;
  exclude?: FilterPattern;
  openInEditor?: boolean;
  editor?: string;
  maxTimelineEvents?: number;
  maxTraceNodes?: number;
  maxNetworkResponseBytes?: number;
  maxNetworkBytes?: number;
  ignoreComponents?: string[];
  traceNetwork?: boolean;
  traceStorage?: boolean;
  redact?: Partial<RedactOptions>;
}

const defaults = {
  enabled: true,
  include: ["**/*.jsx", "**/*.tsx"] as FilterPattern,
  exclude: ["**/node_modules/**", "**/dist/**"] as FilterPattern,
  openInEditor: true,
  editor: undefined as string | undefined,
  maxTimelineEvents: 200,
  maxTraceNodes: 10_000,
  maxNetworkResponseBytes: 1_000_000,
  maxNetworkBytes: 20_000_000,
  traceNetwork: true,
  traceStorage: true,
};

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath !== "" && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath);
}

function respondJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function positiveInteger(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function matchesIgnoredComponentPath(root: string, file: string, patterns: string[]): boolean {
  const relativeFile = relative(root, file).split(sep).join("/");
  return patterns.some((pattern) => {
    const normalized = pattern.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\*+$/g, "").replace(/\/$/, "");
    return normalized.includes("/") && (relativeFile === normalized || relativeFile.startsWith(`${normalized}/`));
  });
}

export default function causeScope(userOptions: CauseScopeOptions = {}): Plugin {
  const options = { ...defaults, ...userOptions };
  const filter = createFilter(options.include, options.exclude);
  let config: ResolvedConfig;

  return {
    name: "causescope",
    apply(_config, environment) {
      return Boolean(options.enabled) && environment.command === "serve" && environment.mode === "development";
    },
    enforce: "pre",

    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },

    resolveId(id) {
      if (id === VIRTUAL_RUNTIME_ID) return RESOLVED_RUNTIME_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_RUNTIME_ID) return null;
      return `
        import { createReactRuntimeAdapter, getCauseScopeRuntime, mountCauseScopeOverlay } from "causescope/runtime";

        let runtime;
        if (typeof window !== "undefined" && typeof document !== "undefined") {
          runtime = getCauseScopeRuntime(${JSON.stringify({
          maxTimelineEvents: options.maxTimelineEvents,
          maxTraceNodes: options.maxTraceNodes,
          maxNetworkResponseBytes: options.maxNetworkResponseBytes,
          maxNetworkBytes: options.maxNetworkBytes,
          traceNetwork: options.traceNetwork,
          traceStorage: options.traceStorage,
          redact: options.redact,
          })});
          runtime.setReactAdapter(createReactRuntimeAdapter({ ignoreComponents: ${JSON.stringify(options.ignoreComponents ?? [])} }));
          runtime.installBrowserInstrumentation();
          mountCauseScopeOverlay(runtime);
        }

        export const __cs = runtime;
      `;
    },

    transform: {
      order: "pre",
      async handler(code, id, transformOptions) {
        if (transformOptions?.ssr) return null;
        const cleanId = id.split("?", 1)[0] ?? id;
        if (!isPathInsideRoot(config.root, cleanId)) return null;
        if (!filter(cleanId)) return null;
        if (matchesIgnoredComponentPath(config.root, cleanId, options.ignoreComponents ?? [])) return null;

        const isTypeScript = /\.tsx$/i.test(cleanId);
        const isJsx = /\.(jsx|tsx)$/i.test(cleanId);
        if (!isJsx) return null;

        const result = await transformAsync(code, {
          filename: cleanId,
          babelrc: false,
          configFile: false,
          sourceMaps: true,
          sourceFileName: cleanId,
          generatorOpts: {
            retainLines: true,
          },
          parserOpts: {
            sourceType: "module",
            plugins: isTypeScript ? ["typescript", "jsx"] : ["jsx"],
          },
          plugins: [[causeScopeBabelPlugin, { root: config.root }]],
        });

        if (!result?.code) return null;
        return {
          code: result.code,
          map: result.map ?? null,
        };
      },
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, "http://causescope.local");
        if (url.pathname !== OPEN_IN_EDITOR_PATH) return next();
        if (!options.openInEditor) return respondJson(response, 403, { error: "Open in editor is disabled" });
        if (request.method !== "POST" || request.headers["x-causescope-request"] !== "open-editor") {
          return respondJson(response, 405, { error: "Open in editor requires a CauseScope POST request" });
        }

        const file = url.searchParams.get("file");
        if (!file) return respondJson(response, 400, { error: "Missing file parameter" });
        const absoluteFile = resolve(config.root, file);
        if (!isPathInsideRoot(config.root, absoluteFile) || !existsSync(absoluteFile)) {
          return respondJson(response, 400, { error: "File must exist inside the project root" });
        }
        const realRoot = realpathSync(config.root);
        const realFile = realpathSync(absoluteFile);
        if (!isPathInsideRoot(realRoot, realFile)) {
          return respondJson(response, 400, { error: "File must resolve inside the project root" });
        }

        const line = positiveInteger(url.searchParams.get("line"));
        const column = positiveInteger(url.searchParams.get("column"));
        launchEditor(`${realFile}:${line}:${column}`, options.editor, (fileName, errorMessage) => {
          if (errorMessage) server.config.logger.error(`[causescope] Failed to open ${fileName}: ${errorMessage}`);
        });
        return respondJson(response, 200, { ok: true });
      });
    },
  };
}
