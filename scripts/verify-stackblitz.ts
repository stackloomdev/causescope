import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertLiveLabVersion } from "./release-policy.js";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = join(workspaceRoot, "examples/stackblitz");
const temporaryBase = process.env.RUNNER_TEMP ?? tmpdir();
const temporaryRoot = realpathSync.native(mkdtempSync(join(temporaryBase, "causescope-stackblitz-")));
const projectRoot = join(temporaryRoot, "project");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmEntry = process.env.npm_execpath;

interface PackageManifest {
  name?: unknown;
  version?: unknown;
  packageManager?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface IsolatedViteModule {
  createServer(config: {
    appType: "custom";
    logLevel: "silent";
    root: string;
    server: { middlewareMode: true };
  }): Promise<{
    close(): Promise<void>;
    transformRequest(url: string): Promise<{ code: string; map?: unknown } | null>;
  }>;
  normalizePath(path: string): string;
}

function filesWithin(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ["dist", "node_modules"].includes(entry.name) ? [] : filesWithin(path);
    return [path];
  });
}

function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join("/");
}

function runPnpm(args: string[], cwd: string): void {
  const command = pnpmEntry ? process.execPath : pnpmCommand;
  const commandArgs = pnpmEntry ? [pnpmEntry, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error([`Command failed: pnpm ${args.join(" ")}`, result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
}

try {
  const repositoryManifest = JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")) as PackageManifest;
  const packageManifest = JSON.parse(readFileSync(join(workspaceRoot, "packages/causescope/package.json"), "utf8")) as PackageManifest;
  const liveLabManifest = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8")) as PackageManifest;
  const stackBlitzConfig = JSON.parse(readFileSync(join(sourceRoot, ".stackblitzrc"), "utf8")) as { startCommand?: unknown };
  const changelog = readFileSync(join(workspaceRoot, "CHANGELOG.md"), "utf8");

  if (liveLabManifest.packageManager !== repositoryManifest.packageManager) {
    throw new Error("The live lab must use the repository's pinned pnpm version.");
  }
  const repositoryVersion = String(packageManifest.version);
  const liveLabVersion = liveLabManifest.dependencies?.causescope ?? "";
  const releaseHistory = [...changelog.matchAll(/^## \[([^\]]+)\] - \d{4}-\d{2}-\d{2}$/gm)]
    .map((match) => match[1] ?? "");
  // A release PR must merge before the target version exists on npm. During
  // that window the standalone lab may pin exactly the preceding release.
  assertLiveLabVersion(repositoryVersion, liveLabVersion, releaseHistory);
  const dependencyVersions = Object.values({ ...liveLabManifest.dependencies, ...liveLabManifest.devDependencies });
  if (dependencyVersions.some((version) => /^(?:file|link|workspace):/.test(version))) {
    throw new Error("The standalone live lab cannot depend on files outside its imported folder.");
  }
  if (liveLabManifest.scripts?.dev !== "vite --host 0.0.0.0" || stackBlitzConfig.startCommand !== "pnpm dev") {
    throw new Error("The StackBlitz live lab must auto-start its Vite development server with pnpm dev.");
  }

  const sourceFiles = filesWithin(sourceRoot);
  const authoredJavaScript = sourceFiles.filter((file) => [".js", ".jsx", ".mjs", ".cjs"].includes(extname(file)));
  if (authoredJavaScript.length > 0) {
    throw new Error(`The live lab must be TypeScript-only:\n${authoredJavaScript.map((file) => portableRelative(workspaceRoot, file)).join("\n")}`);
  }
  for (const required of [".stackblitzrc", "index.html", "package.json", "pnpm-lock.yaml", "src/App.tsx", "src/main.tsx", "vite.config.ts"]) {
    if (!sourceFiles.some((file) => portableRelative(sourceRoot, file) === required)) throw new Error(`Live lab is missing ${required}.`);
  }

  cpSync(sourceRoot, projectRoot, {
    recursive: true,
    filter: (source) => !["dist", "node_modules"].includes(basename(source)),
  });
  runPnpm([
    "install",
    "--ignore-workspace",
    "--frozen-lockfile",
    "--ignore-scripts",
    "--registry=https://registry.npmjs.org",
  ], projectRoot);

  const vite = await import(pathToFileURL(join(projectRoot, "node_modules/vite/dist/node/index.js")).href) as IsolatedViteModule;
  const appPath = vite.normalizePath(join(projectRoot, "src/App.tsx"));
  const server = await vite.createServer({
    appType: "custom",
    logLevel: "silent",
    root: projectRoot,
    server: { middlewareMode: true },
  });
  try {
    const transformed = await server.transformRequest(`/@fs/${appPath}`);
    if (!transformed?.code.includes("data-causescope-node") || !transformed.map) {
      throw new Error("The isolated StackBlitz Vite config did not instrument App.tsx with a source map.");
    }
  } finally {
    await server.close();
  }

  runPnpm(["run", "build"], projectRoot);

  const productionFiles = filesWithin(join(projectRoot, "dist"));
  if (!productionFiles.some((file) => basename(file) === "index.html")) throw new Error("Live lab production build is missing index.html.");
  const forbiddenMarkers = ["data-causescope-", "causescope-overlay-root", "virtual:causescope-runtime", "/__causescope/"];
  for (const file of productionFiles.filter((path) => [".css", ".html", ".js", ".map"].includes(extname(path)))) {
    const contents = readFileSync(file, "utf8");
    const marker = forbiddenMarkers.find((candidate) => contents.includes(candidate));
    if (marker) throw new Error(`Standalone production output contains development marker ${marker}.`);
  }

  const sourceBytes = sourceFiles.reduce((total, file) => total + statSync(file).size, 0);
  console.log(
    `Verified the standalone pnpm StackBlitz lab with causescope@${liveLabVersion} for repository release ${repositoryVersion}: development transform, source map, and clean production build (${sourceFiles.length} files, ${(sourceBytes / 1024).toFixed(1)} KiB source).`,
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
