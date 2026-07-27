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

## Next.js feasibility

**Conclusion:** a bounded Next.js integration is technically plausible for Client Components; it is not implemented or supported today. Source maps alone are not a fundamental blocker: [Next.js enables browser source maps by default in development](https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps), and Turbopack supports webpack loaders even though it does not support webpack plugins. The hard boundary is React Server Components, which do not expose the browser DOM, Fiber state, or server-side request execution used by CauseScope's current evidence model.

The first viable scope is deliberately narrower than “Next.js support”:

- Pages Router components that execute in the browser.
- App Router modules below an explicit [`"use client"` boundary](https://nextjs.org/docs/app/api-reference/directives/use-client).
- A compiler loader that works under both [Turbopack rules](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#rules) and the opt-in webpack path, without relying on webpack plugin APIs.
- Honest handling of Server Components: report the nearest confirmed Client Component boundary or unavailable evidence instead of claiming a server-side causal chain.

No Next.js support claim ships until a public synthetic fixture and automated checks prove all of the following:

1. Exact TSX file, line, and column survive the Next.js transform and source-map chain.
2. Selection, derived conditions, React state, Props, and browser Fetch/XHR provenance work in `next dev` for both Pages Router and App Router Client Components.
3. Turbopack and webpack paths produce the same evidence contract.
4. `next build` contains no CauseScope runtime, overlay, endpoint, or debug attribute.
5. Unsupported RSC and server-only evidence is labeled explicitly, with no inferred bridge across the server/client boundary.
6. Interaction latency and artifact budgets remain within the existing performance gates.

Until those gates pass, CauseScope remains explicitly **Vite-first**. A failed spike must record the exact source-map, bundler, production-removal, or RSC boundary that blocked support rather than leaving a vague framework promise.

## Next — deepen evidence coverage

- Evaluate additional state and data adapters when they can expose deterministic provenance without scanning unrelated application state.
- Improve explanations for derived values and multi-step update chains while continuing to mark missing evidence as unavailable.
- Add focused fixtures for ecosystem patterns reported by users rather than claiming broad framework support without tests.
- Publish extension points only where the privacy boundary and production-removal contract can be enforced.

## Later — evaluate broader integrations

- Assess development servers and React build pipelines beyond the explicit Next.js feasibility track against the same source-map and zero-production-code requirements.
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
