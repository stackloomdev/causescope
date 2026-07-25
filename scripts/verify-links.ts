import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const repositoryRoot = resolve(".");
const expectedLiveDemo = "https://stackblitz.com/fork/github/stackloomdev/causescope?startScript=dev%3Astackblitz";
const expectedStartCommand = "pnpm dev:stackblitz";
const liveDemoPattern = /https?:\/\/(?:www\.)?stackblitz\.com\/[^\s"'<>)]*stackloomdev\/causescope[^\s"'<>)]*/gi;
const textExtensions = new Set([".md", ".ts"]);
const ignoredDirectories = new Set(["cache", "dist", "node_modules"]);
const expectedPublicFiles = [
  "README.md",
  "README.zh-CN.md",
  "docs/.vitepress/config.ts",
  "docs/index.md",
  "packages/causescope/README.md",
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : sourceFiles(path);
    return textExtensions.has(extname(entry.name)) ? [path] : [];
  }));
  return files.flat();
}

const files = [
  resolve("README.md"),
  resolve("README.zh-CN.md"),
  resolve("packages/causescope/README.md"),
  ...await sourceFiles(resolve("docs")),
];
const references: Array<{ file: string; url: string }> = [];
const contentsByFile = new Map<string, string>();

for (const file of files) {
  const contents = await readFile(file, "utf8");
  const relativeFile = relative(repositoryRoot, file).split(sep).join("/");
  contentsByFile.set(relativeFile, contents);
  for (const url of contents.match(liveDemoPattern) ?? []) {
    references.push({ file: relativeFile, url });
  }
}

const missingReferences = expectedPublicFiles.filter((file) => !contentsByFile.get(file)?.includes(expectedLiveDemo));
if (missingReferences.length > 0) {
  throw new Error(`Public files must include the canonical StackBlitz live-lab link:\n${missingReferences.join("\n")}`);
}

const invalidReferences = references.filter(({ url }) => url !== expectedLiveDemo);
if (invalidReferences.length > 0) {
  throw new Error(`StackBlitz live-lab links must use the WebContainer-safe startup script:\n${invalidReferences.map(({ file, url }) => `${file}: ${url}`).join("\n")}`);
}

const stackBlitzConfig = JSON.parse(await readFile(resolve(".stackblitzrc"), "utf8")) as { startCommand?: unknown };
if (stackBlitzConfig.startCommand !== expectedStartCommand) {
  throw new Error(`.stackblitzrc must start ${expectedStartCommand}; received ${String(stackBlitzConfig.startCommand)}.`);
}

console.log(`All ${references.length} public StackBlitz live-lab links and .stackblitzrc use dev:stackblitz.`);
