# Releasing CauseScope

This is the maintainer runbook for prerelease and stable npm promotion. A completed checklist is evidence that a release artifact is internally consistent; it is not a substitute for real beta feedback or an explicit decision to publish.

## Release channels

| Package version | npm dist-tag | Public install specifier | GitHub release |
| --- | --- | --- | --- |
| `x.y.z-beta.n` | `beta` | `causescope@beta` | Prerelease |
| `x.y.z-rc.n` | `rc` | `causescope@rc` | Prerelease |
| `x.y.z` | `latest` | `causescope` | Latest stable |

Only numbered `beta` and `rc` prereleases are supported by the automated release policy. Add another channel only through a reviewed policy change.

## Before preparing a release

1. Triage open feedback for the target release and record every accepted defect as a reproducible Issue.
2. Confirm the target milestone has no unresolved blocker.
3. For stable 1.0, review the external beta results and obtain an explicit maintainer go-ahead. Do not infer approval from green CI or an empty Issue list.
4. Confirm the current package has already been synchronized into the public StackBlitz lab.

## Prepare one release pull request

1. Update the root and `packages/causescope` versions to the same target.
2. Move the relevant Unreleased notes into a dated Changelog section whose version exactly matches the package.
3. Update every public install surface to the target channel: `@beta`, `@rc`, or no suffix for stable.
4. Update compatibility, migration, public API, and privacy documentation when the release changes any of those contracts.
5. Do **not** point the live lab at the unpublished target. Keep it on the immediate previous release. The gate accepts that one-version gap only while the target is absent from npm, and rejects an older pin.
6. Run:

   ```bash
   pnpm verify:release
   pnpm check
   pnpm test:e2e:firefox
   ```

7. Review the packed-package contents, public API snapshot diff, Changelog, production-absence result, performance budget, and privacy scan in the PR.
8. Merge only after every required check and independent review passes.

## Publish from a tag

After the release commit is on `main` and main-branch CI is green, create `v<package-version>` on that exact commit and push only the tag. Tag creation and push are the publish boundary and require explicit maintainer approval.

The tag workflow:

1. rejects a tag whose commit is not already on `main`;
2. checks out full history and runs `pnpm check` again;
3. rejects a tag that does not exactly match the package version;
4. selects `beta`, `rc`, or `latest` from the version;
5. skips an npm version that already exists, making a partial rerun safe;
6. publishes through npm trusted publishing with provenance;
7. creates the matching GitHub prerelease or stable release.

No local npm token is part of this flow. Do not add tokens, passwords, recovery codes, or generated `.npmrc` files to the repository or release notes.

## Verify the published release

1. Confirm the workflow completed and the GitHub release points to the expected tag and commit.
2. Read the public registry state without authenticating:

   ```bash
   npm view causescope@<version> version dist-tags --json
   ```

3. Install the exact published version into a clean TypeScript + Vite consumer and exercise a development transform and production build.
4. Confirm the npm provenance statement is present.
5. Open the hosted docs and public live lab from a fresh browser session.

## Post-release synchronization

Open a separate PR that updates `examples/stackblitz/package.json` and its frozen lockfile to the version that now exists on npm. Run the isolated live-lab verifier and exercise the public StackBlitz URL.

This synchronization is required immediately, not merely before the next release. `verify:stackblitz` queries the registry: once the target version is published, the one-version predecessor gap closes and every subsequent run on `main` fails until the lab is bumped. If the registry cannot be reached the gap stays open, so an npm outage degrades the check rather than breaking unrelated builds.

For stable 1.0, also replace pre-1.0 install and testing language, close the completed milestone, and publish the stable announcement only after the registry, docs, and live lab checks succeed.

## Partial failure and rollback

- If npm publication succeeds but GitHub release creation fails, rerun the same tag workflow. It detects the existing npm version and continues without republishing it.
- Never reuse or overwrite a published version. Fix forward with the next prerelease or patch.
- Do not move `latest`, `rc`, or `beta` by hand unless recovering from a documented release incident.
- Never delete a published package as a routine rollback. Follow npm policy and the security process for exceptional cases.
