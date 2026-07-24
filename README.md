<div align="center">

# CauseScope

**Click any UI. Trace the cause.**

A local-first provenance inspector for React and Vite. Select an element and follow the exact TSX, expression, state, props, store, and network data that produced it.

[Getting started](docs/getting-started.md) · [Configuration](docs/configuration.md) · [Adapters](docs/adapters.md) · [Privacy](docs/privacy.md) · [中文](README.zh-CN.md)

</div>

![CauseScope demo tracing an edited React element from UI to source and state](docs/assets/causescope-demo.gif)

## Why CauseScope?

React DevTools can tell you what a component contains. CauseScope focuses on the next question: **why did this exact UI appear?**

- Jump from a rendered element to its precise TSX file, line, and column.
- See the JSX expression, live operands, result, and deciding conditional branch.
- Follow real `useState` and `useReducer` transitions without inventing history.
- Trace one-level props back to the parent JSX callsite.
- Link values to Fetch, XHR, React Query, Zustand, LocalStorage, or SessionStorage.
- Export a second-pass-redacted JSON or Markdown trace for a bug report.
- Keep the entire inspector out of production builds.

CauseScope uses a Preact overlay inside an isolated Shadow DOM. It does not require an account, API key, browser extension, or remote service.

## Quick start

```bash
pnpm add -D causescope@beta
```

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
```

Start the Vite development server, click **Inspect**, then choose any element. You can also hold <kbd>Option</kbd>/<kbd>Alt</kbd> and click an element directly.

The plugin runs only for `vite serve` in development mode. Production builds contain no CauseScope instrumentation, overlay, endpoint, or debug attributes.

## Optional data adapters

Install adapters before the first React render so initial cache and store values keep their provenance.

```ts
// main.tsx
if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { reactQueryAdapter }, { zustandAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/react-query"),
    import("causescope/adapters/zustand"),
  ]);

  const runtime = getCauseScopeRuntime();
  runtime.installAdapter(reactQueryAdapter({ queryClient }));
  runtime.installAdapter(zustandAdapter({
    stores: { editorStore },
    sources: {
      editorStore: { file: "src/stores/editor.ts", line: 12, column: 28 },
    },
  }));
}
```

React Query provenance includes the query key, status, fetch status, and update time. Zustand stores are explicit by design; CauseScope never searches for unrelated stores.

## What the inspector reports

| View | Evidence |
| --- | --- |
| Why | Source snippet, expression result, operands, condition tree, hidden branch, data origins |
| Values | Current props and hook state for the selected component instance |
| State | Initial value, latest real setter or reducer transition, source, triggering event |
| Network | Recorded Fetch/XHR metadata and bounded, redacted response data |
| Timeline | DOM event → handler → state/store update → render → expression change |

Plain text and other nodes without a dynamic expression still show their exact source code. CauseScope reports missing or ambiguous evidence as unavailable instead of guessing.

## Compatibility

| Integration | Supported |
| --- | --- |
| React | 18 and 19 |
| Vite | 5 and 6 |
| TypeScript | First-class; all repository source and tests use TS/TSX |
| Package managers | Any npm-compatible client; this repository uses pnpm |

Runnable examples live in [`examples/`](examples): React 18, React 19, React Query, and Zustand. The React 19 lab contains multi-page, multi-component, and multi-file Playwright scenarios, and a separate React 18/Vite 5 smoke test verifies the compatibility floor end to end.

## Privacy and limits

CauseScope is local-first and has no telemetry or upload path. Network and storage tracing are enabled by default in development and can be disabled independently. It records only storage keys accessed during the current page run; it does not enumerate browser storage.

Authorization, cookie, API-key, token, password, and secret variants are redacted by default across headers, URLs, objects, the inspector, and exported traces. Recording is bounded to 10,000 trace nodes, 200 timeline events, 1 MB per response, and 20 MB total response data unless configured otherwise.

Read the full [privacy and threat model](docs/privacy.md) before using CauseScope with sensitive applications.

## Repository

CauseScope is a pnpm Workspace + Turborepo monorepo.

```text
packages/
  causescope/            public, self-contained npm package
  babel-plugin/          TSX instrumentation and stable source IDs
  vite-plugin/           dev-only transform and editor endpoint
  runtime-core/          provenance, timeline, redaction, and export
  runtime-react/         isolated React 18/19 Fiber adapter
  overlay/               Preact + Shadow DOM inspector
  adapter-react-query/   Query Cache provenance
  adapter-zustand/       explicit store provenance
  shared/                runtime contracts
```

```bash
pnpm install
pnpm check
```

The complete gate runs type checking, unit tests, all builds, the production-absence scan, an isolated tarball-consumer test, and Playwright end-to-end coverage.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

Released under the [MIT License](LICENSE).
