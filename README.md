<div align="center">

<img src="docs/public/mark.svg" width="72" alt="CauseScope logo" />

# CauseScope

**Click any UI. Trace the cause.**

Select any element in your React app and follow it back to the exact TSX, the decision that produced it, and the state or response behind that decision.

[![npm](https://img.shields.io/npm/v/causescope?label=npm&color=ff385c)](https://www.npmjs.com/package/causescope)
[![CI](https://github.com/stackloomdev/causescope/actions/workflows/ci.yml/badge.svg)](https://github.com/stackloomdev/causescope/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/stackloomdev/causescope?color=737077)](LICENSE)

[Try the live lab](https://stackblitz.com/fork/github/stackloomdev/causescope/tree/main/examples/stackblitz?title=CauseScope%20Live%20Lab) · [Documentation](https://stackloomdev.github.io/causescope/) · [60-second setup](https://stackloomdev.github.io/causescope/getting-started) · [Beta testing](https://stackloomdev.github.io/causescope/beta-testing) · [Roadmap](ROADMAP.md) · [Discussions](https://github.com/stackloomdev/causescope/discussions) · [中文](README.zh-CN.md)

</div>

```text
<button disabled={!canRefund}>Refund order</button>
                     │
                     ├─ canRefund → false
                     ├─ order.status === "paid" → false
                     ├─ order.status = "pending"
                     └─ GET /api/orders/4821 · 200
```

React DevTools can tell you that `canRefund` is `false`. CauseScope tells you why it is `false`.

![CauseScope tracing a disabled button from rendered UI to source, state, and the API response behind it](docs/assets/causescope-demo.gif)

> [!IMPORTANT]
> **Vite-first today.** CauseScope currently supports React 18/19 applications on Vite 5–8. Next.js is not supported yet; the bounded Client Component feasibility track and its release gates are explicit in the [roadmap](ROADMAP.md#nextjs-feasibility).

## Install in one minute

```bash
npm i -D causescope@beta
```

<details>
<summary>pnpm or Yarn</summary>

```bash
pnpm add -D causescope@beta
yarn add -D causescope@beta
```

</details>

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
```

Start the Vite development server, click **Inspect**, and select an element. Hold <kbd>Option</kbd>/<kbd>Alt</kbd> while clicking for a shortcut; while the drawer is open, select another page element directly. Keyboard users can focus **Inspect**, press <kbd>Enter</kbd>, focus a page element, and press <kbd>Enter</kbd> or <kbd>Space</kbd>; arrow keys navigate the inspector tabs and <kbd>Escape</kbd> closes it.

CauseScope only runs for `vite serve` in development. Production builds contain no instrumentation, overlay, editor endpoint, or debug attributes.

Testing before stable 1.0? Use the [beta testing guide](https://stackloomdev.github.io/causescope/beta-testing) to exercise multiple evidence paths and share a sanitized minimal TypeScript reproduction.

## What the inspector reports

A disabled button is one useful scenario, not the product model. CauseScope can select buttons, text, inputs, lists, and other DOM elements, and it reports the evidence that actually exists for that element. For static text or an element without a dynamic decision, it simply shows the exact source code and component location. Missing or ambiguous evidence is marked unavailable instead of being invented.

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
| React rendering | Portals, Suspense, Error Boundaries, and Vite Fast Refresh |
| Vite | 5, 6, 7, and 8 |
| React Vite plugin | Babel (`@vitejs/plugin-react`) and SWC (`@vitejs/plugin-react-swc`) |
| Automated browsers | Chromium (full suite); Firefox 153.0 (focused source, state, and export smoke) |
| Styling | CSS Modules and Tailwind CSS 4 |
| Node.js | 18.18+ for Vite 5; follow the selected Vite version’s Node.js requirement |
| TypeScript | First-class; authored application and tooling code uses TS/TSX, with no JS/JSX source files |
| Package managers | Any npm-compatible client; this repository uses **pnpm Workspace + Turborepo** |

CI installs the packed npm artifact into isolated Vite 5.4, 6.4, 7.3, and 8.1 consumers and performs a real TSX transform. [`examples/`](examples) adds React 18/19, Babel/SWC, multi-page, multi-component, multi-file, Portal, Suspense, Error Boundary, Fast Refresh, React Query, and Zustand browser scenarios.

Artifact growth is gated separately: the browser runtime graph, Vite plugin, optional adapters, publishable files, and npm tarball all have enforced [performance budgets](https://stackloomdev.github.io/causescope/performance).

The five supported npm entrypoints and their complete declaration graph are protected by a reviewable [public API snapshot](https://stackloomdev.github.io/causescope/public-api).

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

The full gate runs type checking, unit tests, every build, production-absence and performance-budget scans, public API and release-policy checks, an isolated StackBlitz build, packed-package Vite 5–8 consumers, and Playwright end-to-end coverage.

## Contributing

Issues and pull requests are welcome. Start with the [roadmap](ROADMAP.md), [contribution guide](CONTRIBUTING.md), [support policy](SUPPORT.md), [security policy](SECURITY.md), and [Code of Conduct](CODE_OF_CONDUCT.md). Use [Discussions](https://github.com/stackloomdev/causescope/discussions) for questions and early ideas.

Released under the [MIT License](LICENSE).
