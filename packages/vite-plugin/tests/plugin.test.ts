import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { transformWithEsbuild, type ConfigEnv, type ResolvedConfig, type UserConfig, type ViteDevServer } from "vite";
import causeScope from "../src/index";

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

interface CallablePluginHooks {
  configResolved(config: ResolvedConfig): void;
  configureServer(server: ViteDevServer): void;
  resolveId(id: string): string | null;
  load(id: string): string | null;
  transform: {
    order: "pre";
    handler(code: string, id: string, options?: { ssr?: boolean }): Promise<{ code: string } | null>;
  };
}

describe("causeScope Vite plugin", () => {
  it("is restricted to the development server", () => {
    const apply = causeScope().apply;
    if (typeof apply !== "function") throw new Error("CauseScope must use an environment-aware apply hook");
    const config = {} as UserConfig;
    const environment = (command: ConfigEnv["command"], mode: string): ConfigEnv => ({
      command,
      mode,
      isSsrBuild: false,
      isPreview: false,
    });

    expect(apply(config, environment("serve", "development"))).toBe(true);
    expect(apply(config, environment("serve", "production"))).toBe(false);
    expect(apply(config, environment("build", "development"))).toBe(false);

    const disabledApply = causeScope({ enabled: false }).apply;
    if (typeof disabledApply !== "function") throw new Error("Disabled CauseScope must keep the guarded apply hook");
    expect(disabledApply(config, environment("serve", "development"))).toBe(false);
  });

  it("installs configured runtime limits, browser tracing, and component filters", () => {
    const plugin = causeScope({
      maxTimelineEvents: 75,
      traceNetwork: false,
      traceStorage: true,
      ignoreComponents: ["InternalWrapper"],
    }) as unknown as CallablePluginHooks;
    const runtimeId = plugin.resolveId("virtual:causescope-runtime");
    if (!runtimeId) throw new Error("CauseScope virtual runtime was not resolved");
    const source = plugin.load(runtimeId);

    expect(source).toContain('"maxTimelineEvents":75');
    expect(source).toContain('"traceNetwork":false');
    expect(source).toContain('"traceStorage":true');
    expect(source).toContain('ignoreComponents: ["InternalWrapper"]');
    expect(source).toContain("runtime.installBrowserInstrumentation()");
    expect(source).toContain('typeof window !== "undefined" && typeof document !== "undefined"');
  });

  it("rejects unsafe open-in-editor requests before launching an editor", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const plugin = causeScope() as unknown as CallablePluginHooks;
    let middleware: Middleware | undefined;
    plugin.configResolved({ root } as ResolvedConfig);
    plugin.configureServer({
      config: { logger: { error: vi.fn() } },
      middlewares: {
        use(handler: Middleware) {
          middleware = handler;
        },
      },
    } as unknown as ViteDevServer);
    if (!middleware) throw new Error("CauseScope middleware was not registered");

    const invoke = (method: string, file: string, headers: IncomingMessage["headers"] = {}): number => {
      const response = {
        statusCode: 200,
        setHeader: vi.fn(),
        end: vi.fn(),
      } as unknown as ServerResponse;
      const request = {
        method,
        headers,
        url: `/__causescope/open-in-editor?file=${encodeURIComponent(file)}`,
      } as IncomingMessage;
      middleware?.(request, response, vi.fn());
      return response.statusCode;
    };

    expect(invoke("GET", "package.json")).toBe(405);
    expect(invoke("POST", "package.json")).toBe(405);
    expect(invoke("POST", "../shared/package.json", { "x-causescope-request": "open-editor" })).toBe(400);
  });

  it("never instruments a file outside the configured project root", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const plugin = causeScope() as unknown as CallablePluginHooks;
    plugin.configResolved({ root } as ResolvedConfig);
    const source = "export function Example() { return <button disabled={!false}>Publish</button>; }";

    expect(plugin.transform.order).toBe("pre");
    await expect(plugin.transform.handler(source, resolve(root, "../outside.tsx"))).resolves.toBeNull();
    await expect(plugin.transform.handler(source, resolve(root, "src/inside.tsx"))).resolves.toMatchObject({
      code: expect.stringContaining("data-causescope-node"),
    });
  });

  it("never instruments server-rendered modules", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const plugin = causeScope() as unknown as CallablePluginHooks;
    plugin.configResolved({ root } as ResolvedConfig);
    const source = "export function Example() { return <p>Server output</p>; }";

    await expect(plugin.transform.handler(source, resolve(root, "src/server.tsx"), { ssr: true })).resolves.toBeNull();
  });

  it("skips component directories configured through ignoreComponents", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const plugin = causeScope({ ignoreComponents: ["src/components/ui"] }) as unknown as CallablePluginHooks;
    plugin.configResolved({ root } as ResolvedConfig);
    const source = "export function Button() { return <button>Run</button>; }";

    await expect(plugin.transform.handler(source, resolve(root, "src/components/ui/Button.tsx"))).resolves.toBeNull();
    await expect(plugin.transform.handler(source, resolve(root, "src/components/Button.tsx"))).resolves.toMatchObject({
      code: expect.stringContaining("data-causescope-node"),
    });
  });

  it("preserves exact file, line, and column metadata for a nested component file", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const plugin = causeScope() as unknown as CallablePluginHooks;
    plugin.configResolved({ root } as ResolvedConfig);
    const source = [
      'import type { ReactElement } from "react";',
      "",
      "export function AccountCard(): ReactElement {",
      "  return (",
      '    <section className="account-card">',
      "      <p>Plain account copy</p>",
      "    </section>",
      "  );",
      "}",
    ].join("\n");
    const result = await plugin.transform.handler(source, resolve(root, "src/components/AccountCard.tsx"));

    expect(result?.code).toContain('data-causescope-file="src/components/AccountCard.tsx"');
    expect(result?.code).toContain('data-causescope-line="5" data-causescope-column="5"');
    expect(result?.code).toContain('data-causescope-line="6" data-causescope-column="7"');
    expect(result?.code).toContain('data-causescope-source={"<p>Plain account copy</p>"}');
    const transformedLines = result?.code.split("\n") ?? [];
    expect(transformedLines[4]).toContain('<section className="account-card"');
    expect(transformedLines[5]).toContain("<p");

    const reactResult = await transformWithEsbuild(result?.code ?? "", "AccountCard.tsx", {
      loader: "tsx",
      jsx: "automatic",
      jsxDev: true,
    });
    expect(reactResult.code).toContain("Plain account copy");
    expect(reactResult.code).toMatch(/lineNumber:\s*6/);
  });
});
