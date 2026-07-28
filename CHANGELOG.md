# Changelog

All notable changes to CauseScope will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning.

## [Unreleased]

### Added

- Kept the provenance of destructured primitives, so `const { status } = order` now resolves back to the same confirmed network origin that a direct `order.status` read in JSX already produced. Chained destructuring composes to the full path, and renamed, defaulted, and array patterns carry it too.
- Kept the access path across computed keys that are only known at render time, so `row[columnId]` and `items[index].name` reach the same confirmed origin as a literal read. Each key is hoisted and evaluated once, so the reported value and its path always come from the same read.
- Recovered the origin of a value whose container exceeded the per-object recording budget, so an element past the hundredth in a list explains itself the same way the first does. Registration stays bounded; the search runs only when a lookup misses, which is when someone inspects an element.

### Fixed

- Reported object keys that are not valid identifiers in bracket form, so a traced path stays the accessor it claims to be: `rows["row-7"].status` rather than `rows.row-7.status`.

### Changed

- Raised the npm tarball budget from 128 KiB to 130 KiB for the breadth-budget recovery above.
- Reframed the refund demo around the selected control and inspector evidence, with stable source and network holds that remain readable at README and social-feed sizes.
- Closed the StackBlitz live-lab predecessor window as soon as the target release is published to npm, so a lab left on the previous version fails `verify:stackblitz` instead of trailing silently until the next release.

## [1.0.0-beta.9] - 2026-07-28

### Added

- Added the `vite-plugin` npm keyword so CauseScope can be discovered by the official Vite Plugin Registry.
- Added a high-resolution MP4 demo export and a reproducible TypeScript/FFmpeg capture pipeline.

### Changed

- Re-recorded the refund demo as a complete, stable flow from element selection through the confirmed network response.

## [1.0.0-beta.8] - 2026-07-27

### Added

- Traced derived render conditions through local aliases to primitive inputs and confirmed network responses, with a refund fixture and public demo that show the full evidence chain.
- Documented the current Vite-first support boundary and a gated Next.js Client Component feasibility track without implying React Server Component support.

### Fixed

- Kept condition evaluation bounded and truthful across repeated reads, shared expression graphs, short-circuit paths, unsupported coercions, and repeated component instances.
- Preserved sensitive-value redaction across derived aliases, historical rows, repeated host props, and exported traces while distinguishing confirmed, possible, and lost network evidence.
- Coalesced selected-element refreshes without putting ordinary host interactions or closed inspectors on the full inspection path.

## [1.0.0-beta.7] - 2026-07-27

### Fixed

- Selected uninstrumented native and ARIA interactive controls before larger traced ancestors, while keeping unavailable dependency source locations explicit.

## [1.0.0-beta.6] - 2026-07-27

### Fixed

- Kept ordinary application interactions off the full element-inspection path by resolving event-handler source metadata through a lightweight runtime index.
- Stopped closed inspectors from rebuilding stale selections, and coalesced bursts of open-drawer updates into one refresh per animation frame.
- Hid optional Props with no current value from the Values panel while reporting how many unavailable entries were omitted.

## [1.0.0-beta.5] - 2026-07-27

### Fixed

- Prevented JSX expression instrumentation from rewriting qualified TypeScript type names such as `React.CSSProperties`, while keeping runtime values inside assertions traceable.

## [1.0.0-beta.4] - 2026-07-26

### Added

- Documented the versioned trace export contract, published a checked synthetic v1 example, and exposed its TypeScript types from the main package entrypoint.
- Added a symptom-first troubleshooting guide for expected unavailable evidence and common setup boundaries.
- Added keyboard target selection, visible inspector focus, arrow-key tab navigation coverage, and predictable focus return on close.
- Added a bounded Firefox 153.0 CI smoke lane for exact source selection, state transitions, and redacted trace exports.
- Added a deterministic public API snapshot and release gate for all five npm entrypoints and their published declaration graph.
- Added an external beta validation guide with scenario coverage, minimal public reproductions, feedback routing, and artifact sanitization rules.
- Added deterministic beta/RC/stable release-policy checks and a maintainer runbook without publishing a new package.

## [1.0.0-beta.3] - 2026-07-25

### Added

- Added React SWC browser coverage plus Node 18 and Windows package-verification lanes.
- Added browser fixtures for Portals, Suspense retries, Error Boundary recovery, Vite Fast Refresh, CSS Modules, and Tailwind CSS.
- Added enforced artifact-size budgets for the browser runtime, Vite plugin, adapters, publishable files, and npm tarball.
- Added a standalone TypeScript StackBlitz lab that installs only the published package and its minimal React/Vite toolchain.
- Added a public roadmap, support and community guides, focused issue forms, and contribution-ready project lanes.

### Fixed

- Replaced the monorepo-wide StackBlitz import with an isolated subdirectory project and a frozen pnpm lockfile.

## [1.0.0-beta.2] - 2026-07-25

### Added

- Hosted documentation, a StackBlitz live lab, and a pinned Vite 5.4/6.4/7.3/8.1 compatibility matrix.

### Changed

- Expanded the public Vite peer range to include Vite 7 and 8.
- Made the source-opening action editor-agnostic.

### Security

- Upgraded repository test, example, and documentation tooling to patched Vitest and Vite releases while retaining Vite 5 coverage in the isolated compatibility matrix.

## [1.0.0-beta.1] - 2026-07-24

First public beta.

### Added

- Public open-source repository documentation, security policy, contribution guide, issue templates, and CI release gates.
- Installable single-package distribution with React Query and Zustand entrypoints.
- React 18, React 19, React Query, and Zustand examples.

### Changed

- Renamed the product and every public/internal identifier from the original prototype name to CauseScope.
- Updated the tagline to “Click any UI. Trace the cause.”

### Fixed

- React Query provenance now supports primitive query data and refreshes metadata when object references are reused.
- Sensitive-key redaction recognizes camelCase, snake_case, and kebab-case variants.
- Vite SSR transforms and direct server imports no longer mount browser instrumentation.
