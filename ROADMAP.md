# CauseScope roadmap

CauseScope is working toward a stable 1.0 release: a dependable, local-first way to trace rendered React UI back to source and runtime evidence.

This roadmap communicates direction, not a delivery promise. Priorities can change when browser behavior, ecosystem compatibility, privacy, or evidence quality reveals a better order of work.

## Now — stabilize 1.0

The current milestone focuses on making the existing React + Vite experience predictable before expanding the surface area.

- Keep exact source ownership stable across React 18 and 19, Babel and SWC, Vite 5–8, Fast Refresh, Portals, Suspense, and Error Boundaries.
- Expand browser and accessibility coverage for selecting, navigating, copying, and exporting evidence.
- Document and version the exported trace contract, including redaction and compatibility guarantees.
- Turn real-world provenance gaps into minimal public fixtures and regression tests.
- Freeze the public API only after package, production-absence, performance, and compatibility gates remain green.

Track the work in the [`1.0 stable` milestone](https://github.com/stackloomdev/causescope/milestone/1) and the [open issue list](https://github.com/stackloomdev/causescope/issues).

## Next — deepen evidence coverage

- Evaluate additional state and data adapters when they can expose deterministic provenance without scanning unrelated application state.
- Improve explanations for derived values and multi-step update chains while continuing to mark missing evidence as unavailable.
- Add focused fixtures for ecosystem patterns reported by users rather than claiming broad framework support without tests.
- Publish extension points only where the privacy boundary and production-removal contract can be enforced.

## Later — evaluate broader integrations

- Assess other development servers and React build pipelines against the same source-map and zero-production-code requirements.
- Explore richer editor handoffs and portable trace artifacts without introducing an account or hosted backend.

These are research directions. They are not supported integrations until they have public fixtures, automated checks, and documentation.

## Non-goals

- Production monitoring, analytics, or telemetry.
- Uploading application source, state, requests, or trace data to a CauseScope service.
- Guessing a convenient explanation when source or runtime evidence is missing.

## How to contribute

- Start with a [`good first issue`](https://github.com/stackloomdev/causescope/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) for a bounded fixture, test, or documentation change.
- Look for [`help wanted`](https://github.com/stackloomdev/causescope/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22) when you can own a larger compatibility or accessibility slice.
- Use [Discussions](https://github.com/stackloomdev/causescope/discussions) for early ideas and questions; open an issue after the evidence path and acceptance criteria are concrete.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending a pull request.
