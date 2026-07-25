# Performance budgets

CauseScope is development-only, but development tooling still belongs in the inner loop. CI therefore treats artifact growth as a regression instead of relying on an occasional manual size check.

## Enforced limits

After the package build, `pnpm verify:performance` follows the relative module graphs for the browser runtime and Vite plugin entries, measures the optional adapter entries, compresses every emitted module deterministically, packs the exact npm artifact without rerunning lifecycle scripts, and applies these ceilings:

| Surface | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| Browser public entry graphs | 165 KiB | 36 KiB | 32 KiB |
| Vite plugin graph | 52 KiB | 11 KiB | 10 KiB |
| Optional adapters combined | 6 KiB | 3 KiB | 3 KiB |

The complete publishable file set, including source maps and declarations, is limited to 600 KiB unpacked. The npm tarball is limited to 128 KiB.

These ceilings include modest headroom above the measured beta baseline. Raising one requires an explicit code review change to [`scripts/verify-performance.ts`](https://github.com/stackloomdev/causescope/blob/main/scripts/verify-performance.ts), so growth cannot slip through an unrelated feature PR.

The entry budgets measure code emitted by CauseScope; third-party dependencies remain visible in the lockfile and audit gate. The package budgets cover the published tarball itself rather than the consumer's complete `node_modules` tree.

## What ships to production

The production budget remains zero. `pnpm verify:production` scans every example build for the virtual runtime, overlay root, open-in-editor endpoint, debug attributes, and instrumentation helpers. The Vite plugin only activates while serving in development mode.

## Why wall-clock timing is reported separately

CI does not fail on a single transform-duration number because shared-runner hardware and cold filesystem caches make that threshold noisy. Deterministic bytes and production absence are hard gates; browser interaction and transform correctness are covered by the real Vite and Playwright matrix.

## Lightweight live lab

The public StackBlitz link imports only [`examples/stackblitz`](https://github.com/stackloomdev/causescope/tree/main/examples/stackblitz). It has its own frozen pnpm lockfile and installs the published `causescope` package instead of building the monorepo. CI copies that directory outside the workspace, installs it with `--ignore-workspace`, verifies a real development transform and source map through its Vite config, runs its TypeScript and production builds, and confirms the production output is clean.

The repository deliberately accepts a frozen live-lab dependency that is either the current package version or the immediate previous dated release in `CHANGELOG.md`. A release PR must merge before its target can exist on npm, so the lab stays on that exact predecessor during beta, RC, and stable promotion. After publishing, maintainers update the lab package and lockfile; CI rejects another release while the previous sync is still missing.
