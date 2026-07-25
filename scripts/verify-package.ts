import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "causescope-package-"));
const supportedViteVersions = ["5.4.21", "6.4.3", "7.3.6", "8.1.5"] as const;
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmEntry = process.env.npm_execpath;

function run(command: string, args: string[], cwd = workspaceRoot): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error([`Command failed: ${command} ${args.join(" ")}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function runPnpm(args: string[], cwd = workspaceRoot): string {
  return pnpmEntry
    ? run(process.execPath, [pnpmEntry, ...args], cwd)
    : run(pnpmCommand, args, cwd);
}

function filesWithin(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

try {
  // A packed release bundles the private workspace packages, whose dist files
  // do not exist in a fresh checkout. Build them here so this verifier cannot
  // pass only because another local command happened to leave artifacts behind.
  // Keep clean package builds deterministic on constrained Windows runners,
  // where starting every tsup/esbuild process concurrently can fail during
  // native DLL initialization.
  runPnpm(["build:stackblitz"]);
  const packDirectory = join(temporaryRoot, "pack");
  runPnpm(["--filter", "causescope", "pack", "--pack-destination", packDirectory]);
  const tarballName = readdirSync(packDirectory).find((file) => file.endsWith(".tgz"));
  if (!tarballName) throw new Error("CauseScope pack did not produce a tarball");
  const tarball = join(packDirectory, tarballName);
  const entries = run("tar", ["-tf", tarball]).trim().split(/\r?\n/);
  const forbiddenEntry = entries.find((entry) => /(?:^|\/)(?:\.turbo|src|tsconfig[^/]*|node_modules)(?:\/|$)/.test(entry));
  if (forbiddenEntry) throw new Error(`Tarball contains a non-release file: ${forbiddenEntry}`);
  for (const required of [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/vite.js",
    "package/dist/runtime.js",
    "package/dist/adapters/react-query.js",
    "package/dist/adapters/zustand.js",
    "package/types/index.d.ts",
    "package/types/vite.d.ts",
    "package/types/runtime.d.ts",
    "package/types/shared.d.ts",
    "package/types/adapters/react-query.d.ts",
    "package/types/adapters/zustand.d.ts",
  ]) {
    if (!entries.includes(required)) throw new Error(`Tarball is missing ${required}`);
  }

  const extracted = join(temporaryRoot, "extracted");
  mkdirSync(extracted, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", extracted]);
  const packageRoot = join(extracted, "package");
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    private?: boolean;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (manifest.private) throw new Error("Published manifest is still private");
  if (Object.keys(manifest.dependencies ?? {}).some((name) => name.startsWith("@causescope/"))) {
    throw new Error("Published manifest depends on private @causescope workspace packages");
  }
  if (Object.values({ ...manifest.dependencies, ...manifest.devDependencies }).some((version) => version.startsWith("workspace:"))) {
    throw new Error("Published manifest contains an unresolved workspace protocol");
  }

  const releaseFiles = [
    ...filesWithin(join(packageRoot, "dist")),
    ...filesWithin(join(packageRoot, "types")),
  ];
  for (const file of releaseFiles.filter((path) => /\.(?:js|d\.ts|map)$/.test(path))) {
    const contents = readFileSync(file, "utf8");
    if (!file.endsWith(".map") && contents.includes("@causescope/")) {
      throw new Error(`${file} still imports a private workspace package`);
    }
    if (contents.includes("/Users/") || contents.includes("\\Users\\")) throw new Error(`${file} exposes an absolute local path`);
  }

  const requestedViteVersion = process.env.CAUSESCOPE_VITE_VERSION;
  const viteVersions = requestedViteVersion ? [requestedViteVersion] : [...supportedViteVersions];

  for (const viteVersion of viteVersions) {
    if (!supportedViteVersions.includes(viteVersion as (typeof supportedViteVersions)[number])) {
      throw new Error(`Unsupported CAUSESCOPE_VITE_VERSION: ${viteVersion}`);
    }

    const consumer = join(temporaryRoot, `consumer-vite-${viteVersion}`);
    const sourceDirectory = join(consumer, "src");
    mkdirSync(sourceDirectory, { recursive: true });
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
    writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        lib: ["ESNext", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: "ESNext",
        types: ["node"],
      },
      include: ["index.ts", "verify-vite.ts"],
    }, null, 2));
    writeFileSync(join(consumer, "index.ts"), [
      'import { getCauseScopeRuntime, type CauseScopeRuntime } from "causescope";',
      'import { mountCauseScopeOverlay } from "causescope/runtime";',
      'import causeScope, { type CauseScopeOptions } from "causescope/vite";',
      'import { reactQueryAdapter } from "causescope/adapters/react-query";',
      'import { zustandAdapter } from "causescope/adapters/zustand";',
      'const options: CauseScopeOptions = { traceNetwork: false, traceStorage: false };',
      'const plugin = causeScope(options);',
      'const runtime: CauseScopeRuntime = getCauseScopeRuntime();',
      'mountCauseScopeOverlay(runtime);',
      'reactQueryAdapter({ queryClient: { getQueryCache: () => ({ getAll: () => [], subscribe: () => () => undefined }) } });',
      'zustandAdapter({ stores: { demo: { getState: () => ({}), subscribe: () => () => undefined } } });',
      'void plugin;',
    ].join("\n"));
    writeFileSync(join(sourceDirectory, "App.tsx"), [
      "const label = 'Trace me';",
      "export function App() {",
      "  return <button disabled>{label}</button>;",
      "}",
    ].join("\n"));
    writeFileSync(join(consumer, "verify-vite.ts"), [
      'import { fileURLToPath } from "node:url";',
      'import { createServer } from "vite";',
      'import causeScope from "causescope/vite";',
      "const server = await createServer({",
      "  appType: 'custom',",
      "  logLevel: 'silent',",
      "  plugins: [causeScope({ openInEditor: false })],",
      "  root: fileURLToPath(new URL('.', import.meta.url)),",
      "  server: { middlewareMode: true },",
      "});",
      "try {",
      "  const result = await server.transformRequest('/src/App.tsx');",
      "  if (!result?.code.includes('data-causescope-node')) {",
      "    throw new Error('CauseScope did not instrument TSX through Vite');",
      "  }",
      "  const sourceMap = result.map as { mappings?: string; sources?: string[]; sourcesContent?: Array<string | null> } | null;",
      "  const appSourceIndex = sourceMap?.sources?.findIndex((source) => {",
      "    const normalized = source.replaceAll('\\\\', '/');",
      "    return normalized === 'App.tsx' || normalized.endsWith('/src/App.tsx');",
      "  }) ?? -1;",
      "  if (!sourceMap?.mappings || appSourceIndex < 0) {",
      "    throw new Error(`CauseScope did not preserve an App.tsx source map through Vite: ${JSON.stringify(sourceMap)}`);",
      "  }",
      "  if (!sourceMap.sourcesContent?.[appSourceIndex]?.includes('<button disabled>')) {",
      "    throw new Error('CauseScope source map does not contain the original App.tsx source');",
      "  }",
      "} finally {",
      "  await server.close();",
      "}",
    ].join("\n"));
    runPnpm([
      "add",
      "--prefer-offline",
      "--ignore-scripts",
      "--registry=https://registry.npmjs.org",
      tarball,
      "@types/node@^22.10.2",
      "react@19.2.8",
      "tsx@4.23.1",
      "typescript@^5.7.2",
      `vite@${viteVersion}`,
    ], consumer);
    runPnpm(["exec", "tsc", "--project", "tsconfig.json"], consumer);
    runPnpm(["exec", "tsx", "verify-vite.ts"], consumer);
    run(process.execPath, [
      "--input-type=module",
      "--eval",
      [
        'const api = await import("causescope");',
        'const vite = await import("causescope/vite");',
        'const runtime = await import("causescope/runtime");',
        'const query = await import("causescope/adapters/react-query");',
        'const zustand = await import("causescope/adapters/zustand");',
        'if (typeof api.getCauseScopeRuntime !== "function") throw new Error("main export missing");',
        'if (typeof vite.default !== "function") throw new Error("Vite export missing");',
        'if (typeof runtime.mountCauseScopeOverlay !== "function") throw new Error("runtime export missing");',
        'if (typeof query.reactQueryAdapter !== "function") throw new Error("React Query export missing");',
        'if (typeof zustand.zustandAdapter !== "function") throw new Error("Zustand export missing");',
      ].join("\n"),
    ], consumer);
    console.log(`Verified ${tarballName} with Vite ${viteVersion}.`);
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
