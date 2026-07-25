import { equal, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  assertInstallDocumentation,
  installSpecifier,
  parseReleaseVersion,
} from "./release-policy.js";

interface PackageManifest {
  files?: unknown;
  private?: unknown;
  publishConfig?: unknown;
  version?: unknown;
}

interface ChangelogRelease {
  date: string;
  version: string;
}

const workspaceRoot = resolve(import.meta.dirname, "..");
const publicPackageRoot = join(workspaceRoot, "packages/causescope");
const changelogPath = join(workspaceRoot, "CHANGELOG.md");
const installDocumentation = [
  "README.md",
  "README.zh-CN.md",
  "docs/getting-started.md",
  "docs/index.md",
  "docs/beta-testing.md",
  "packages/causescope/README.md",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
}

function manifestVersion(manifest: PackageManifest, label: string): string {
  ok(typeof manifest.version === "string", `${label} must define a string version`);
  return manifest.version;
}

function changelogReleases(contents: string): ChangelogRelease[] {
  return [...contents.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gm)].map((match) => ({
    date: match[2] ?? "",
    version: match[1] ?? "",
  }));
}

const rootManifest = readManifest(join(workspaceRoot, "package.json"));
const publicManifest = readManifest(join(publicPackageRoot, "package.json"));
const rootVersion = manifestVersion(rootManifest, "Root package.json");
const publicVersion = manifestVersion(publicManifest, "packages/causescope/package.json");
equal(rootVersion, publicVersion, "Root and public package versions must match");

const parsedVersion = parseReleaseVersion(publicVersion);
const releases = changelogReleases(readFileSync(changelogPath, "utf8"));
ok(releases.length > 0, "CHANGELOG.md must contain a dated release");
equal(
  releases[0]?.version,
  publicVersion,
  `The newest dated CHANGELOG.md release must be ${publicVersion}`,
);
equal(new Set(releases.map((release) => release.version)).size, releases.length, "Changelog versions must be unique");
for (const release of releases) {
  parseReleaseVersion(release.version);
  const parsedDate = new Date(`${release.date}T00:00:00.000Z`);
  ok(!Number.isNaN(parsedDate.valueOf()) && parsedDate.toISOString().startsWith(release.date), `Invalid changelog date ${release.date}`);
}

ok(publicManifest.private !== true, "The public CauseScope package cannot be private");
ok(Array.isArray(publicManifest.files), "The public package must define an explicit files allowlist");
for (const required of ["dist", "types", "LICENSE", "README.md"]) {
  ok(publicManifest.files.includes(required), `The public package files allowlist must include ${required}`);
}
ok(isRecord(publicManifest.publishConfig), "The public package must define publishConfig");
equal(publicManifest.publishConfig.access, "public", "The npm package must publish with public access");
equal(publicManifest.publishConfig.provenance, true, "The npm package must publish with provenance");

const expectedSpecifier = installSpecifier(parsedVersion.channel);
for (const documentationPath of installDocumentation) {
  const absolutePath = join(workspaceRoot, documentationPath);
  const contents = readFileSync(absolutePath, "utf8");
  assertInstallDocumentation(contents, parsedVersion.channel, documentationPath);
}

console.log([
  `Verified release metadata for ${publicVersion}.`,
  `- npm channel: ${parsedVersion.channel}`,
  `- install specifier: ${expectedSpecifier}`,
  `- changelog releases: ${releases.length}`,
  `- public install surfaces: ${installDocumentation.length}`,
  `- package allowlist and provenance: enabled`,
].join("\n"));
