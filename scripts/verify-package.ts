import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temporaryRoot = mkdtempSync(join(tmpdir(), "causescope-package-"));

function run(command: string, args: string[], cwd = workspaceRoot): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error([`Command failed: ${command} ${args.join(" ")}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result.stdout;
}

function filesWithin(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

try {
  const packDirectory = join(temporaryRoot, "pack");
  run("pnpm", ["--filter", "causescope", "pack", "--pack-destination", packDirectory]);
  const tarballName = readdirSync(packDirectory).find((file) => file.endsWith(".tgz"));
  if (!tarballName) throw new Error("CauseScope pack did not produce a tarball");
  const tarball = join(packDirectory, tarballName);
  const entries = run("tar", ["-tf", tarball]).trim().split("\n");
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
  run("mkdir", ["-p", extracted]);
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

  const consumer = join(temporaryRoot, "consumer");
  run("mkdir", ["-p", consumer]);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: "ES2022",
    },
    include: ["index.ts"],
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
  run("pnpm", [
    "add",
    "--prefer-offline",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
    tarball,
    "typescript@^5.7.2",
    "vite@^6.0.5",
  ], consumer);
  run("pnpm", ["exec", "tsc", "--project", "tsconfig.json"], consumer);
  run("node", [
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

  console.log(`Verified installable package ${tarballName} in a clean consumer.`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
