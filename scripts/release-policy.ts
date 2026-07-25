export type ReleaseChannel = "beta" | "rc" | "latest";

export interface ReleaseVersion {
  channel: ReleaseChannel;
  core: string;
  prereleaseNumber: number | null;
  raw: string;
}

const releaseVersionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-(beta|rc)\.([1-9]\d*))?$/;

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

export function assertInstallDocumentation(contents: string, channel: ReleaseChannel, label: string): void {
  const expected = installSpecifier(channel);
  const documentedChannels = [...contents.matchAll(/\bcausescope@(beta|rc)\b/g)].map((match) => match[1]);

  if (channel === "latest") {
    if (documentedChannels.length > 0) {
      throw new Error(`${label} still points stable users to a prerelease npm channel.`);
    }
    if (!contents.includes("causescope")) throw new Error(`${label} must mention the stable package.`);
    return;
  }

  if (!contents.includes(expected)) throw new Error(`${label} must document ${expected}.`);
  if (documentedChannels.some((documentedChannel) => documentedChannel !== channel)) {
    throw new Error(`${label} documents the wrong npm prerelease channel.`);
  }
}

export function allowedLiveLabVersions(repositoryVersion: string, releaseHistory: readonly string[]): string[] {
  parseReleaseVersion(repositoryVersion);
  if (releaseHistory.length === 0) {
    throw new Error("CHANGELOG.md must contain at least one dated release.");
  }
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
