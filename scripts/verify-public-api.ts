import { deepStrictEqual, ok } from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

interface PackageManifest {
  dependencies?: unknown;
  engines?: unknown;
  exports?: unknown;
  files?: unknown;
  name?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
  peerDependenciesMeta?: unknown;
  sideEffects?: unknown;
  type?: unknown;
  types?: unknown;
  typesVersions?: unknown;
}

interface PublicEntry {
  types: string;
  import: string;
}

const expectedEntrypoints = [
  ".",
  "./vite",
  "./runtime",
  "./adapters/react-query",
  "./adapters/zustand",
] as const;

const workspaceRoot = resolve(import.meta.dirname, "..");
const packageRoot = join(workspaceRoot, "packages/causescope");
const typesRoot = join(packageRoot, "types");
const snapshotPath = join(workspaceRoot, "api/causescope.api.md");
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as PackageManifest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function comparePortablePaths(left: string, right: string): number {
  const leftPath = portablePath(left);
  const rightPath = portablePath(right);
  if (leftPath < rightPath) return -1;
  if (leftPath > rightPath) return 1;
  return 0;
}

function previewLine(line: string | undefined): string {
  if (line === undefined) return "<missing>";
  const maxLength = 160;
  const preview = line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
  return JSON.stringify(preview);
}

function describeFirstDifference(checked: string, generated: string): string {
  const checkedLines = checked.split("\n");
  const generatedLines = generated.split("\n");
  const lineCount = Math.max(checkedLines.length, generatedLines.length);

  for (let index = 0; index < lineCount; index += 1) {
    if (checkedLines[index] === generatedLines[index]) continue;
    return [
      `First difference at snapshot line ${index + 1}.`,
      `Checked in: ${previewLine(checkedLines[index])}`,
      `Generated:  ${previewLine(generatedLines[index])}`,
    ].join("\n");
  }

  return "The checked-in and generated snapshots have different byte content.";
}

function declarationFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return declarationFiles(path);
      return entry.isFile() && entry.name.endsWith(".d.ts") ? [path] : [];
    })
    .sort(comparePortablePaths);
}

function readPublicEntries(): Record<string, PublicEntry> {
  const exportsMap = manifest.exports;
  ok(isRecord(exportsMap), "causescope package.json must define an exports map");
  deepStrictEqual(
    Object.keys(exportsMap),
    [...expectedEntrypoints],
    "The public entrypoint list or resolution order changed. Update the explicit API contract before refreshing the snapshot.",
  );

  return Object.fromEntries(expectedEntrypoints.map((entrypoint) => {
    const entry = exportsMap[entrypoint];
    ok(isRecord(entry), `${entrypoint} must use a conditional exports object`);
    deepStrictEqual(
      Object.keys(entry),
      ["types", "import"],
      `${entrypoint} export conditions or their resolution order changed. Update the explicit API contract before refreshing the snapshot.`,
    );
    ok(typeof entry.import === "string", `${entrypoint} must expose an ESM import target`);
    ok(typeof entry.types === "string", `${entrypoint} must expose a declaration target`);
    ok(entry.import.startsWith("./dist/"), `${entrypoint} import target must stay inside dist`);
    ok(entry.types.startsWith("./types/"), `${entrypoint} declaration target must stay inside types`);
    ok(existsSync(join(packageRoot, entry.import)), `${entrypoint} import target is missing; build packages first`);
    ok(existsSync(join(packageRoot, entry.types)), `${entrypoint} declaration target is missing; build packages first`);
    return [entrypoint, { types: entry.types, import: entry.import }];
  }));
}

function renderSnapshot(): string {
  const declarations = declarationFiles(typesRoot);
  ok(declarations.length > 0, "No published declaration files were found");

  const publicEntries = readPublicEntries();
  const referencedDeclarations = new Set(Object.values(publicEntries).map((entry) => entry.types.slice(2)));
  for (const declaration of referencedDeclarations) {
    ok(
      declarations.some((file) => portablePath(relative(packageRoot, file)) === declaration),
      `Exported declaration ${declaration} is missing from the snapshot graph`,
    );
  }

  const packageContract = {
    name: manifest.name,
    type: manifest.type,
    types: manifest.types,
    sideEffects: manifest.sideEffects,
    files: manifest.files,
    engines: manifest.engines,
    dependencies: manifest.dependencies,
    optionalDependencies: manifest.optionalDependencies,
    peerDependencies: manifest.peerDependencies,
    peerDependenciesMeta: manifest.peerDependenciesMeta,
    typesVersions: manifest.typesVersions,
    exports: publicEntries,
  };
  const sections = declarations.map((file) => {
    const path = portablePath(relative(packageRoot, file));
    const contents = readFileSync(file, "utf8").replaceAll("\r\n", "\n").trimEnd();
    return `### \`${path}\`\n\n\`\`\`ts\n${contents}\n\`\`\``;
  });

  return [
    "# CauseScope public API snapshot",
    "",
    "<!-- Generated by scripts/verify-public-api.ts. Update with pnpm snapshot:public-api; do not edit by hand. -->",
    "",
    "This file records the package-level consumer contract and the complete published declaration graph.",
    "",
    "## Package contract",
    "",
    "```json",
    JSON.stringify(packageContract, null, 2),
    "```",
    "",
    "## Published declarations",
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}

const generatedSnapshot = renderSnapshot();

if (process.argv.includes("--write")) {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, generatedSnapshot);
  console.log(`Updated ${portablePath(relative(workspaceRoot, snapshotPath))}.`);
} else {
  const checkedSnapshot = readFileSync(snapshotPath, "utf8").replaceAll("\r\n", "\n");
  if (checkedSnapshot !== generatedSnapshot) {
    throw new Error([
      "Public API drift detected. Review the declaration change, document it, then run pnpm snapshot:public-api.",
      describeFirstDifference(checkedSnapshot, generatedSnapshot),
    ].join("\n"));
  }
  console.log(`Verified ${expectedEntrypoints.length} public entrypoints and the published declaration graph.`);
}
