import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = join(workspaceRoot, "packages/causescope");
const distRoot = join(packageRoot, "dist");
const kibibyte = 1024;

interface SizeSnapshot {
  raw: number;
  gzip: number;
  brotli: number;
}

interface PackageManifest {
  exports?: Record<string, { import?: unknown }>;
}

const maximums = {
  browserEntries: { raw: 165 * kibibyte, gzip: 36 * kibibyte, brotli: 32 * kibibyte },
  vitePlugin: { raw: 52 * kibibyte, gzip: 11 * kibibyte, brotli: 10 * kibibyte },
  adapters: { raw: 6 * kibibyte, gzip: 3 * kibibyte, brotli: 3 * kibibyte },
  unpackedPackage: 600 * kibibyte,
  // Raised from 128 KiB when breadth-budget recovery landed: a list element
  // past the hundredth had no provenance at all, which is a silent,
  // position-dependent failure. Raise this deliberately and say why; the
  // budget exists to catch growth nobody decided on.
  tarball: 130 * kibibyte,
} as const;

function filesWithin(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

function moduleGraph(entry: string): string[] {
  const discovered = new Set<string>();
  const pending = [resolve(distRoot, entry)];
  const importPatterns = [
    /\bfrom\s*["'](\.[^"']+\.js)["']/g,
    /\bimport\s*["'](\.[^"']+\.js)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+\.js)["']\s*\)/g,
  ];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || discovered.has(file)) continue;
    if (!statSync(file).isFile()) throw new Error(`Missing built module: ${relative(workspaceRoot, file)}`);
    discovered.add(file);
    const contents = readFileSync(file, "utf8");
    for (const pattern of importPatterns) {
      for (const match of contents.matchAll(pattern)) {
        const specifier = match[1];
        if (!specifier) continue;
        const dependency = resolve(dirname(file), specifier);
        if (relative(distRoot, dependency).startsWith("..")) {
          throw new Error(`Built module escapes dist: ${relative(workspaceRoot, dependency)}`);
        }
        pending.push(dependency);
      }
    }
  }

  return [...discovered].sort();
}

function snapshot(files: string[]): SizeSnapshot {
  return files.reduce<SizeSnapshot>((total, file) => {
    const contents = readFileSync(file);
    return {
      raw: total.raw + contents.byteLength,
      gzip: total.gzip + gzipSync(contents, { level: 9 }).byteLength,
      brotli: total.brotli + brotliCompressSync(contents, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
    };
  }, { raw: 0, gzip: 0, brotli: 0 });
}

function formatBytes(bytes: number): string {
  return `${(bytes / kibibyte).toFixed(1)} KiB`;
}

function uniqueFiles(graphs: string[][]): string[] {
  return [...new Set(graphs.flat())].sort();
}

const packageManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as PackageManifest;
const exportGroups = {
  browser: [".", "./runtime"],
  vite: ["./vite"],
  adapters: ["./adapters/react-query", "./adapters/zustand"],
} as const;
const trackedExports = new Set<string>(Object.values(exportGroups).flat());
const untrackedExports = Object.keys(packageManifest.exports ?? {}).filter((key) => !trackedExports.has(key));
if (untrackedExports.length > 0) {
  throw new Error(`Public exports need a performance-budget group: ${untrackedExports.join(", ")}`);
}

function exportEntry(key: string): string {
  const target = packageManifest.exports?.[key]?.import;
  if (typeof target !== "string" || !target.startsWith("./dist/") || !target.endsWith(".js")) {
    throw new Error(`Public export ${key} must point to a built JavaScript entry; received ${String(target)}.`);
  }
  return target.slice("./dist/".length);
}

const browserEntryFiles = uniqueFiles(exportGroups.browser.map((key) => moduleGraph(exportEntry(key))));
const vitePluginFiles = uniqueFiles(exportGroups.vite.map((key) => moduleGraph(exportEntry(key))));
const adapterFiles = uniqueFiles(exportGroups.adapters.map((key) => moduleGraph(exportEntry(key))));
const measurements = [
  { label: "Browser public entry graphs", files: browserEntryFiles, actual: snapshot(browserEntryFiles), maximum: maximums.browserEntries },
  { label: "Vite plugin graph", files: vitePluginFiles, actual: snapshot(vitePluginFiles), maximum: maximums.vitePlugin },
  { label: "Optional adapters", files: adapterFiles, actual: snapshot(adapterFiles), maximum: maximums.adapters },
];

const temporaryBase = process.env.RUNNER_TEMP ?? tmpdir();
const temporaryRoot = realpathSync.native(mkdtempSync(join(temporaryBase, "causescope-size-")));
const tarball = join(temporaryRoot, "causescope.tgz");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmEntry = process.env.npm_execpath;

try {
  const command = pnpmEntry ? process.execPath : pnpmCommand;
  const args = pnpmEntry
    ? [pnpmEntry, "--config.ignore-scripts=true", "--filter", "causescope", "pack", "--out", tarball]
    : ["--config.ignore-scripts=true", "--filter", "causescope", "pack", "--out", tarball];
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(["Could not pack CauseScope for the size budget.", result.stdout, result.stderr].filter(Boolean).join("\n"));
  }

  const tarballSize = statSync(tarball).size;
  const extractedRoot = join(temporaryRoot, "unpacked");
  mkdirSync(extractedRoot);
  const extractResult = spawnSync("tar", ["-xzf", tarball, "-C", extractedRoot], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (extractResult.status !== 0) {
    throw new Error(["Could not extract the packed artifact for its unpacked-size budget.", extractResult.stdout, extractResult.stderr].filter(Boolean).join("\n"));
  }
  const unpackedFiles = filesWithin(join(extractedRoot, "package"));
  const unpackedPackage = unpackedFiles.reduce((total, file) => total + statSync(file).size, 0);
  const violations: string[] = [];
  for (const measurement of measurements) {
    for (const encoding of ["raw", "gzip", "brotli"] as const) {
      if (measurement.actual[encoding] > measurement.maximum[encoding]) {
        violations.push(
          `${measurement.label} ${encoding} is ${formatBytes(measurement.actual[encoding])}; budget is ${formatBytes(measurement.maximum[encoding])}.`,
        );
      }
    }
  }
  if (unpackedPackage > maximums.unpackedPackage) {
    violations.push(`Publishable files are ${formatBytes(unpackedPackage)}; budget is ${formatBytes(maximums.unpackedPackage)}.`);
  }
  if (tarballSize > maximums.tarball) {
    violations.push(`npm tarball is ${formatBytes(tarballSize)}; budget is ${formatBytes(maximums.tarball)}.`);
  }

  console.log("CauseScope performance budgets");
  for (const measurement of measurements) {
    const fileLabel = measurement.files.length === 1 ? "file" : "files";
    console.log(
      `- ${measurement.label}: ${formatBytes(measurement.actual.raw)} raw, ${formatBytes(measurement.actual.gzip)} gzip, ${formatBytes(measurement.actual.brotli)} brotli (${measurement.files.length} ${fileLabel})`,
    );
  }
  console.log(`- Publishable files: ${formatBytes(unpackedPackage)}`);
  console.log(`- npm tarball: ${formatBytes(tarballSize)}`);

  if (violations.length > 0) throw new Error(`Performance budget exceeded:\n${violations.join("\n")}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
