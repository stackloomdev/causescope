<div align="center">

<img src="docs/public/mark.svg" width="72" alt="CauseScope logo" />

# CauseScope

**Click any UI. Trace the cause.**

The local-first evidence inspector for React. Select an ordinary page element and follow it to the exact TSX, live decision, state transition, prop, store, or request that produced it.

[![npm](https://img.shields.io/npm/v/causescope?label=npm&color=ff385c)](https://www.npmjs.com/package/causescope)
[![CI](https://github.com/stackloomdev/causescope/actions/workflows/ci.yml/badge.svg)](https://github.com/stackloomdev/causescope/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/stackloomdev/causescope?color=737077)](LICENSE)

[Try the live lab](https://stackblitz.com/fork/github/stackloomdev/causescope?startScript=dev%3Astackblitz) · [Documentation](https://stackloomdev.github.io/causescope/) · [60-second setup](https://stackloomdev.github.io/causescope/getting-started) · [中文](README.zh-CN.md)

</div>

![CauseScope tracing a React element from rendered UI to source and live state](docs/assets/causescope-demo.gif)

## The answer behind the symptom

“Why is this button disabled?” is one useful scenario, not the product model. CauseScope can select buttons, text, inputs, lists, and other DOM elements. It reports the evidence that actually exists for that element:

```text
<button disabled={!canRefund}>Refund order</button>
                     │
                     ├─ canRefund → false
                     ├─ order.status === "paid" → false
                     ├─ order.status = "pending"
                     └─ GET /api/orders/4821 · 200
```

For static text or an element without a dynamic decision, CauseScope simply shows the exact source code and component location. Missing or ambiguous evidence is marked unavailable instead of being invented.

## Install in one minute

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

Start the Vite development server, click **Inspect**, and select an element. Hold <kbd>Option</kbd>/<kbd>Alt</kbd> while clicking for a shortcut; while the drawer is open, select another page element directly.

CauseScope only runs for `vite serve` in development. Production builds contain no instrumentation, overlay, editor endpoint, or debug attributes.

## What the inspector reports

| View | Evidence |
| --- | --- |
| Why | Source snippet, expression result, operands, condition tree, hidden branch, data origins |
| Values | Current props and hook state for the selected component instance |
| State | Initial value, latest real setter or reducer transition, source, triggering event |
| Network | Fetch/XHR metadata, response size, and correlated field paths |
| Timeline | DOM event → handler → state/store update → render → expression change |

It also provides exact file, line, and column coordinates plus an editor-agnostic **Open in editor** action.

## How it differs

CauseScope complements existing developer tools instead of replacing them.

| Tool category | Best at | Evidence depth |
| --- | --- | --- |
| React DevTools | Component tree, props, hooks | Component-level runtime view |
| Performance scanners | Finding expensive renders | Performance observations |
| Source locators | Opening a component file | UI → source location |
| **CauseScope** | Explaining why rendered UI has its current value or state | **UI → TSX → decision → update origin** |

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

## Compatibility

| Integration | Supported |
| --- | --- |
| React | 18 and 19 |
| Vite | 5, 6, 7, and 8 |
| React Vite plugin | Babel (`@vitejs/plugin-react`) and SWC (`@vitejs/plugin-react-swc`) |
| Node.js | 18.18+ for Vite 5; follow the selected Vite version’s Node.js requirement |
| TypeScript | First-class; authored application and tooling code uses TS/TSX, with no JS/JSX source files |
| Package managers | Any npm-compatible client; this repository uses **pnpm Workspace + Turborepo** |

CI installs the packed npm artifact into isolated Vite 5.4, 6.4, 7.3, and 8.1 consumers and performs a real TSX transform. [`examples/`](examples) adds React 18/19, Babel/SWC, multi-page, multi-component, multi-file, React Query, and Zustand browser scenarios.

## Privacy and limits

CauseScope has no account, telemetry, remote service, or upload path. Network and storage tracing are development-only and independently configurable. It records only storage keys accessed during the current page run; it does not enumerate browser storage.

Authorization, cookie, API-key, token, password, and secret variants are redacted across headers, URLs, objects, the inspector, and exported traces. Recording is bounded to 10,000 trace nodes, 200 timeline events, 1 MB per response, and 20 MB total response data unless configured otherwise.

Read the [privacy and threat model](https://stackloomdev.github.io/causescope/privacy) before using CauseScope with sensitive applications.

## Develop the monorepo

CauseScope uses pnpm Workspace + Turborepo.

```bash
pnpm install
pnpm check
```

The full gate runs type checking, unit tests, every build, the production-absence scan, packed-package Vite 5–8 consumers, and Playwright end-to-end coverage.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [Code of Conduct](CODE_OF_CONDUCT.md).

Released under the [MIT License](LICENSE).
