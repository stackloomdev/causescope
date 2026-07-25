# Validation strategy

CauseScope treats browser-visible evidence as the acceptance boundary.

- Babel tests cover source coordinates, state and reducer wrapping, short-circuit semantics, conditional branches, props, storage origins, and snapshots.
- Runtime tests cover repeated component instances, static-text fallback, state transitions, provenance, redaction, export, and bounded recording.
- Adapter tests connect real runtime registration to React Query and Zustand-like sources.
- Vite tests cover development-only application, SSR exclusion, source-map coordinates, ignored directories, and editor endpoint boundaries.
- Playwright selects elements across multiple routes, components, and files; changes state; validates exact source locations; switches selection directly; and exports traces. A separate React 18/Vite 5 scenario verifies the supported compatibility floor.
- Packaging tests install the produced tarball into isolated Vite 5.4, 6.4, 7.3, and 8.1 consumers, type-check the public API, import every public entrypoint, and run a real TSX transform through each Vite generation.
- Production verification scans the example output for instrumentation, runtime, overlay, and endpoint markers.

The release gate is `pnpm check`.
