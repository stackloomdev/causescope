# CauseScope

**Click any UI. Trace the cause.**

CauseScope is a local-first evidence inspector for React and Vite. It connects a selected DOM element to its exact TSX, live expression values, deciding conditions, state transitions, props, network requests, React Query data, Zustand stores, and browser storage.

> **Vite-first:** React 18/19 on Vite 5–8 is supported today. Next.js is not supported yet; its Client Component feasibility track is documented in the repository roadmap.

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

Start the Vite development server, click **Inspect**, and select an element. Buttons, text, inputs, lists, and other ordinary DOM elements are supported; when no dynamic decision exists, CauseScope shows the exact source instead of inventing a cause.

CauseScope supports React 18–19 and Vite 5–8. It applies only to the development server and is absent from production builds.

Optional adapters are available from `causescope/adapters/react-query` and `causescope/adapters/zustand`.

[Try the live lab](https://stackblitz.com/fork/github/stackloomdev/causescope/tree/main/examples/stackblitz?title=CauseScope%20Live%20Lab), read the [documentation](https://stackloomdev.github.io/causescope/), or explore the [repository](https://github.com/stackloomdev/causescope).

MIT © stackloomdev
