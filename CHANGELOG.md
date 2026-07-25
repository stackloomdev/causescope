# Changelog

All notable changes to CauseScope will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning.

## [Unreleased]

## [1.0.0-beta.2] - 2026-07-25

### Added

- Hosted documentation, a StackBlitz live lab, and a pinned Vite 5.4/6.4/7.3/8.1 compatibility matrix.

### Changed

- Expanded the public Vite peer range to include Vite 7 and 8.
- Made the source-opening action editor-agnostic.

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
