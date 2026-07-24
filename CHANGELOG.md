# Changelog

All notable changes to CauseScope will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning.

## [Unreleased]

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

## [1.0.0-beta.1] - Unreleased

First public beta.
