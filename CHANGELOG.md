# Changelog

All notable changes to CauseScope will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning.

## [Unreleased]

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
