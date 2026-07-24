# CauseScope

**Click any UI. Trace the cause.**

CauseScope is a local-first provenance inspector for React and Vite. It connects a selected DOM element to its exact TSX, live expression values, deciding conditions, state transitions, props, network requests, React Query data, Zustand stores, and browser storage.

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

Start the Vite development server, click **Inspect**, and select an element. CauseScope applies only to the development server and is absent from production builds.

Optional adapters are available from `causescope/adapters/react-query` and `causescope/adapters/zustand`.

Documentation, examples, privacy details, and contribution guidance live in the [CauseScope repository](https://github.com/stackloomdev/causescope).

MIT © stackloomdev
