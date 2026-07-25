export type ReleaseChannel = "beta" | "rc" | "latest";

export interface ReleaseVersion {
  channel: ReleaseChannel;
  core: string;
  prereleaseNumber: number | null;
  raw: string;
}

const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(beta|rc)\.([1-9]\d*))?$/;
const installCommandPattern = /\b(?:pnpm\s+add|npm\s+(?:install|i)|yarn\s+add|bun\s+add)\b[^\n]*/gi;
const commandPackagePattern = /\bcausescope(?:@[0-9A-Za-z][0-9A-Za-z.-]*)?(?![0-9A-Za-z/_-])/g;
const inlinePackagePattern = /`(causescope(?:@[0-9A-Za-z][0-9A-Za-z.-]*)?)`/g;
const channelPrecedence: Record<ReleaseChannel, number> = {
  beta: 0,
  rc: 1,
  latest: 2,
};

export function parseReleaseVersion(version: string): ReleaseVersion {
  const match = releaseVersionPattern.exec(version);
  if (!match) {
    throw new Error(
      `Unsupported release version ${JSON.stringify(version)}. Expected x.y.z, x.y.z-beta.n, or x.y.z-rc.n.`,
    );
  }

  const channel = (match[4] ?? "latest") as ReleaseChannel;
  return {
    channel,
    core: `${match[1]}.${match[2]}.${match[3]}`,
    prereleaseNumber: match[5] === undefined ? null : Number(match[5]),
    raw: version,
  };
}

export function installSpecifier(channel: ReleaseChannel): string {
  if (channel === "latest") return "causescope";
  return `causescope@${channel}`;
}

function documentedInstallSpecifiers(contents: string): string[] {
  const commandSpecifiers = [...contents.matchAll(installCommandPattern)]
    .flatMap((match) => [...match[0].matchAll(commandPackagePattern)].map((packageMatch) => packageMatch[0]));
  const inlineSpecifiers = [...contents.matchAll(inlinePackagePattern)]
    .map((match) => match[1] ?? "");
  return [...new Set([...commandSpecifiers, ...inlineSpecifiers])];
}

export function assertInstallDocumentation(contents: string, channel: ReleaseChannel, label: string): void {
  const expected = installSpecifier(channel);
  const documented = documentedInstallSpecifiers(contents);
  if (documented.length === 0) {
    throw new Error(`${label} must document the install specifier ${expected}.`);
  }
  const unexpected = documented.filter((specifier) => specifier !== expected);
  if (unexpected.length > 0 || !documented.includes(expected)) {
    throw new Error(
      `${label} must use only ${expected} for public installation; found ${documented.join(", ")}.`,
    );
  }
}

function compareCoreIdentifier(left: string, right: string): number {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function compareReleaseVersions(leftVersion: string, rightVersion: string): number {
  const left = parseReleaseVersion(leftVersion);
  const right = parseReleaseVersion(rightVersion);
  const leftCore = left.core.split(".");
  const rightCore = right.core.split(".");

  for (let index = 0; index < 3; index += 1) {
    const comparison = compareCoreIdentifier(leftCore[index] ?? "", rightCore[index] ?? "");
    if (comparison !== 0) return comparison;
  }

  const channelComparison = channelPrecedence[left.channel] - channelPrecedence[right.channel];
  if (channelComparison !== 0) return channelComparison;
  return (left.prereleaseNumber ?? 0) - (right.prereleaseNumber ?? 0);
}

export function assertDescendingReleaseHistory(releaseHistory: readonly string[]): void {
  if (releaseHistory.length === 0) {
    throw new Error("CHANGELOG.md must contain at least one dated release.");
  }
  for (let index = 1; index < releaseHistory.length; index += 1) {
    const newer = releaseHistory[index - 1] ?? "";
    const older = releaseHistory[index] ?? "";
    if (compareReleaseVersions(newer, older) <= 0) {
      throw new Error(
        `CHANGELOG.md releases must be strictly newest-to-oldest by SemVer; ${newer} cannot appear before ${older}.`,
      );
    }
  }
}

export function allowedLiveLabVersions(repositoryVersion: string, releaseHistory: readonly string[]): string[] {
  parseReleaseVersion(repositoryVersion);
  assertDescendingReleaseHistory(releaseHistory);
  if (releaseHistory[0] !== repositoryVersion) {
    throw new Error(
      `The package version ${repositoryVersion} must match the newest dated changelog release ${releaseHistory[0]}.`,
    );
  }

  const predecessor = releaseHistory[1];
  if (predecessor === undefined) return [repositoryVersion];
  parseReleaseVersion(predecessor);
  return [repositoryVersion, predecessor];
}

export function assertLiveLabVersion(
  repositoryVersion: string,
  liveLabVersion: string,
  releaseHistory: readonly string[],
): void {
  const allowed = allowedLiveLabVersions(repositoryVersion, releaseHistory);
  if (allowed.includes(liveLabVersion)) return;
  throw new Error(
    `The live lab pins causescope@${liveLabVersion}; expected the current release or its immediate predecessor: ${allowed.join(", ")}.`,
  );
}
