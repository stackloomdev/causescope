import { describe, expect, it } from "vitest";
import {
  allowedLiveLabVersions,
  assertInstallDocumentation,
  assertLiveLabVersion,
  enforcesPublishedLiveLabPin,
  installSpecifier,
  parseReleaseVersion,
} from "./release-policy.js";

describe("release policy", () => {
  it("maps the supported version forms to npm channels", () => {
    expect(parseReleaseVersion("1.0.0-beta.3").channel).toBe("beta");
    expect(parseReleaseVersion("1.0.0-rc.1").channel).toBe("rc");
    expect(parseReleaseVersion("1.0.0").channel).toBe("latest");
    expect(installSpecifier("beta")).toBe("causescope@beta");
    expect(installSpecifier("rc")).toBe("causescope@rc");
    expect(installSpecifier("latest")).toBe("causescope");
  });

  it("rejects unsupported or unnumbered prerelease channels", () => {
    expect(() => parseReleaseVersion("1.0.0-next.1")).toThrow("Unsupported release version");
    expect(() => parseReleaseVersion("1.0.0-rc")).toThrow("Unsupported release version");
  });

  it("rejects public install documentation for the wrong npm channel", () => {
    expect(() => assertInstallDocumentation("pnpm add -D causescope@beta", "rc", "README.md")).toThrow(
      "must use only causescope@rc",
    );
    expect(() => assertInstallDocumentation("pnpm add -D causescope@beta", "latest", "README.md")).toThrow(
      "must use only causescope",
    );
    expect(() => assertInstallDocumentation("pnpm add -D causescope@rc", "rc", "README.md")).not.toThrow();
  });

  it("rejects every wrong install specifier even when the expected channel is also present", () => {
    expect(() => assertInstallDocumentation(
      "pnpm add -D causescope@beta\nnpm install causescope",
      "beta",
      "README.md",
    )).toThrow("found causescope@beta, causescope");
    expect(() => assertInstallDocumentation(
      "pnpm add -D causescope@rc\nUse `causescope@1.0.0-beta.3`.",
      "rc",
      "README.md",
    )).toThrow("causescope@1.0.0-beta.3");
    expect(() => assertInstallDocumentation("pnpm add -D causescope@1.0.0-rc.1", "latest", "README.md"))
      .toThrow("causescope@1.0.0-rc.1");
  });

  it("allows the published beta immediately before the first release candidate", () => {
    expect(allowedLiveLabVersions("1.0.0-rc.1", ["1.0.0-rc.1", "1.0.0-beta.3"])).toEqual([
      "1.0.0-rc.1",
      "1.0.0-beta.3",
    ]);
  });

  it("orders repeated beta and release-candidate versions by SemVer precedence", () => {
    expect(allowedLiveLabVersions(
      "1.0.0-rc.2",
      ["1.0.0-rc.2", "1.0.0-rc.1", "1.0.0-beta.4", "1.0.0-beta.3"],
    )).toEqual(["1.0.0-rc.2", "1.0.0-rc.1"]);
  });

  it("allows the published release candidate immediately before stable", () => {
    expect(allowedLiveLabVersions("1.0.0", ["1.0.0", "1.0.0-rc.1", "1.0.0-beta.3"])).toEqual([
      "1.0.0",
      "1.0.0-rc.1",
    ]);
  });

  it("rejects a live lab that is more than one published release behind", () => {
    expect(() => assertLiveLabVersion(
      "1.0.0",
      "1.0.0-beta.3",
      ["1.0.0", "1.0.0-rc.1", "1.0.0-beta.3"],
    )).toThrow("immediate predecessor");
  });

  it("closes the predecessor window once the repository version is published", () => {
    const history = ["1.0.0-beta.9", "1.0.0-beta.8"];
    expect(allowedLiveLabVersions("1.0.0-beta.9", history, { repositoryVersionPublished: true }))
      .toEqual(["1.0.0-beta.9"]);
    expect(() => assertLiveLabVersion("1.0.0-beta.9", "1.0.0-beta.8", history, {
      repositoryVersionPublished: true,
    })).toThrow("already published on npm");
    expect(() => assertLiveLabVersion("1.0.0-beta.9", "1.0.0-beta.9", history, {
      repositoryVersionPublished: true,
    })).not.toThrow();
  });

  it("keeps the predecessor window open while the release is unpublished or unverifiable", () => {
    const history = ["1.0.0-beta.9", "1.0.0-beta.8"];
    for (const repositoryVersionPublished of [false, undefined]) {
      expect(allowedLiveLabVersions("1.0.0-beta.9", history, { repositoryVersionPublished }))
        .toEqual(["1.0.0-beta.9", "1.0.0-beta.8"]);
      expect(() => assertLiveLabVersion("1.0.0-beta.9", "1.0.0-beta.8", history, {
        repositoryVersionPublished,
      })).not.toThrow();
    }
  });

  it("still rejects a lab two releases behind even when the release is published", () => {
    expect(() => assertLiveLabVersion(
      "1.0.0",
      "1.0.0-beta.3",
      ["1.0.0", "1.0.0-rc.1", "1.0.0-beta.3"],
      { repositoryVersionPublished: true },
    )).toThrow("already published on npm");
  });

  it("does not hold a tagged release run to the published pin", () => {
    // The tagged commit is immutable, and rerunning a tag after a successful
    // npm publish is the documented recovery path for a failed GitHub release.
    expect(enforcesPublishedLiveLabPin({ GITHUB_REF_TYPE: "tag" })).toBe(false);
    expect(enforcesPublishedLiveLabPin({ GITHUB_REF_TYPE: "branch" })).toBe(true);
    expect(enforcesPublishedLiveLabPin({})).toBe(true);
    expect(enforcesPublishedLiveLabPin()).toBe(true);
  });

  it("rejects out-of-order and future prereleases in changelog history", () => {
    expect(() => allowedLiveLabVersions(
      "1.0.0-beta.4",
      ["1.0.0-beta.4", "1.0.0-beta.2", "1.0.0-beta.3"],
    )).toThrow("strictly newest-to-oldest by SemVer");
    expect(() => allowedLiveLabVersions(
      "1.0.0-rc.1",
      ["1.0.0-rc.1", "1.0.0-rc.2", "1.0.0-beta.3"],
    )).toThrow("strictly newest-to-oldest by SemVer");
  });

  it("rejects duplicate changelog versions in the predecessor policy", () => {
    expect(() => allowedLiveLabVersions(
      "1.0.0-rc.1",
      ["1.0.0-rc.1", "1.0.0-rc.1", "1.0.0-beta.3"],
    )).toThrow("strictly newest-to-oldest by SemVer");
  });

  it("rejects release history that was not prepared for the package version", () => {
    expect(() => allowedLiveLabVersions("1.0.0-rc.1", ["1.0.0-beta.3"])).toThrow(
      "must match the newest dated changelog release",
    );
  });
});
