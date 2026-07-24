# CauseScope repository instructions

- Use a pnpm Workspace with Turborepo. Do not introduce Bun, npm lockfiles, JavaScript, JSX, or MJS source files.
- Write project source, tests, build configuration, and scripts in TypeScript or TSX. JSON, YAML, CSS, and Markdown are allowed where native to the tool.
- Keep React Fiber access isolated in `packages/runtime-react`.
- Keep browser packages free of Node.js APIs and Node packages free of browser-only runtime assumptions.
- CauseScope must remain development-only and must disappear from production builds.
- Preserve the source-first overlay: warm dark surfaces, a resizable drawer, generous rounded geometry, and `#ff385c` as the only saturated accent.
- Treat provenance as evidence. Report ambiguous or unavailable data honestly instead of manufacturing a causal chain.
- Keep redaction defaults and bounded recording intact unless a change includes security-focused tests and documentation.
- Verify visible behavior in a real browser before handing off UI, instrumentation, or source-location changes.
