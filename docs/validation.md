# Validation strategy

CauseScope treats browser-visible evidence as the acceptance boundary.

- Babel tests cover source coordinates, state and reducer wrapping, short-circuit semantics, conditional branches, props, storage origins, and snapshots.
- Runtime tests cover repeated component instances, static-text fallback, state transitions, provenance, redaction, export, and bounded recording.
- Adapter tests connect real runtime registration to React Query and Zustand-like sources.
- Vite tests cover development-only application, SSR exclusion, source-map coordinates, ignored directories, and editor endpoint boundaries.
- Playwright selects elements across multiple routes, components, and files; changes state; validates exact source locations; switches selection directly; and exports traces. A separate React 18/Vite 6 scenario verifies React 18 behavior end to end.
- Packaging tests install the produced tarball into isolated Vite 5.4, 6.4, 7.3, and 8.1 consumers, type-check the public API, import every public entrypoint, run a real TSX transform, and verify the original `App.tsx` source map through each Vite generation. This isolated matrix verifies the Vite 5 compatibility floor without retaining those older vulnerable development-tool dependencies in the workspace lockfile.
- Production verification scans the example output for instrumentation, runtime, overlay, and endpoint markers.

The release gate is `pnpm check`.
