import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(".");
const examplesDirectory = resolve("examples");
const forbiddenMarkers = [
  "__CAUSESCOPE__",
  "data-causescope-",
  "virtual:causescope-runtime",
  "traceExpression",
  "traceValue",
  "traceProp",
  "mountCauseScopeOverlay",
  "causescope-overlay-root",
  "/__causescope/open-in-editor",
  "CauseScope inspector",
];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".map"]);

async function productionOutputDirectories(): Promise<string[]> {
  const entries = await readdir(examplesDirectory, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(examplesDirectory, entry.name, "dist");
    try {
      if ((await stat(candidate)).isDirectory()) directories.push(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (directories.length === 0) throw new Error("No example production builds were found. Run pnpm build first.");
  return directories;
}

async function textFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return textExtensions.has(extname(entry.name)) ? [path] : [];
  }));
  return files.flat();
}

const violations: string[] = [];
const outputDirectories = await productionOutputDirectories();
for (const outputDirectory of outputDirectories) {
  for (const file of await textFiles(outputDirectory)) {
    const contents = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      if (contents.includes(marker)) violations.push(`${relative(repositoryRoot, file)} contains ${marker}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Production build contains CauseScope development code:\n${violations.join("\n")}`);
}

console.log(`All ${outputDirectories.length} example production bundles contain no CauseScope runtime, overlay, endpoint, or instrumentation markers.`);
