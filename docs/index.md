---
layout: home

hero:
  name: CauseScope
  text: Click any UI. Trace the cause.
  tagline: A local-first provenance inspector for React and Vite.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/stackloomdev/causescope

features:
  - title: Exact source
    details: Move from a rendered element to the precise TSX file, line, column, source snippet, and component stack.
  - title: Runtime evidence
    details: See live operands, results, deciding branches, props, hook state, Store updates, and event chains.
  - title: Local by design
    details: No account, API key, telemetry, or upload path. Sensitive data is redacted again before export.
  - title: Development only
    details: Vite production builds contain no instrumentation, overlay, editor endpoint, or CauseScope debug attributes.
---

![CauseScope demo tracing an edited React element from UI to source and state](./assets/causescope-demo.gif)

## Install in one minute

```bash
pnpm add -D causescope@beta
```

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
```
