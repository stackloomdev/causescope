# Getting started

CauseScope instruments React TSX while Vite serves your development application. No browser extension or server account is required.

## Requirements

- Node.js 18.18 or newer
- React 18 or 19
- Vite 5, 6, 7, or 8

Vite 8 requires Node.js 20.19+ or 22.12+. CauseScope itself keeps a Node.js 18.18 compatibility floor for projects that remain on Vite 5.

## Install

Use any npm-compatible package manager. This repository uses pnpm.

```bash
pnpm add -D causescope@beta
```

Add CauseScope to `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
```

Run the development server. Click the **Inspect** control or hold <kbd>Option</kbd>/<kbd>Alt</kbd> while clicking an element. With a keyboard, move focus to **Inspect**, press <kbd>Enter</kbd>, move focus to a page element, then press <kbd>Enter</kbd> or <kbd>Space</kbd>. Use the arrow keys to move through inspector tabs. While the drawer is open, choose another page element to switch the selection. Press <kbd>Escape</kbd> to close; focus returns to **Inspect**.

## Validate production behavior

CauseScope is guarded by the Vite `serve + development` environment and does not instrument SSR modules. Build your application normally and verify that no CauseScope control appears.

Applications with custom build pipelines can additionally scan output for `data-causescope-`, `virtual:causescope-runtime`, and `/__causescope/open-in-editor`.

## Next steps

- Tune recording and filtering in [Configuration](configuration.md).
- Connect React Query or Zustand in [Adapters](adapters.md).
- Diagnose explicit unavailable states in [Troubleshooting](troubleshooting.md).
- Review the [Privacy and threat model](privacy.md).
