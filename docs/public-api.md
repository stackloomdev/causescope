# Public API policy

CauseScope publishes one npm package with five supported entrypoints. Imports from workspace-only `@causescope/*` packages, generated chunks, `dist/` files, or unlisted subpaths are internal and are not part of the consumer contract.

| Entrypoint | Public purpose |
| --- | --- |
| `causescope` | Runtime access plus the adapter, runtime-options, and trace-export types |
| `causescope/vite` | The Vite plugin and `CauseScopeOptions` |
| `causescope/runtime` | Explicit runtime, React adapter, and overlay mounting APIs |
| `causescope/adapters/react-query` | React Query provenance adapter |
| `causescope/adapters/zustand` | Zustand provenance adapter |

## Reviewable API snapshot

[`api/causescope.api.md`](https://github.com/stackloomdev/causescope/blob/main/api/causescope.api.md) records the exports map, consumer-facing compatibility metadata, and every declaration file intended for the npm package. The snapshot is generated from the package manifest and declaration files rather than from a separately maintained list. The package-verification gate independently checks that every recorded entrypoint and declaration is present in the real tarball.

`pnpm check` rebuilds the package and fails when its public declaration graph differs from the checked snapshot. That turns a new export, removed export, changed signature, peer-range change, Node.js floor change, or entrypoint change into an explicit review decision.

For an intentional public API change:

1. Update the implementation, tests, documentation, and changelog.
2. Run `pnpm snapshot:public-api`.
3. Review the generated API diff as part of the pull request.
4. Run `pnpm check` and the relevant browser lane.

Do not refresh the snapshot merely to make CI green. First decide whether the change is backward compatible and belongs in the current release line.

## Beta and stable guarantees

The `1.0.0-beta.x` snapshot makes drift visible but does not promise that every beta signature is final. Any beta API adjustment must still be documented and represented by an intentional snapshot diff.

Starting with stable 1.0, removing or incompatibly changing a snapshotted entrypoint, export, option, or declaration requires a new major version. Additive APIs may ship in a backward-compatible minor release. Security fixes may narrow unsafe behavior, but their compatibility impact must be called out explicitly.

The snapshot does not turn internal source files into public APIs and does not broaden the supported React, Vite, Node.js, browser, or package-manager matrix beyond the separately automated compatibility evidence.
