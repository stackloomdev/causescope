# CauseScope live lab

This folder is a standalone TypeScript project used by the public StackBlitz link. It intentionally installs the published `causescope` package instead of reaching outside this directory, because StackBlitz imports only this subfolder.

```bash
pnpm install
pnpm dev
```

Open the CauseScope inspector and select the static heading, release status, progress bar, or disabled publish button. Unlock the review and add an approval to produce real React state transitions before inspecting the affected UI again.

## Why `@rolldown/binding-wasm32-wasi` is a direct dependency

Vite 8 bundles with rolldown, which loads a platform-specific native binding. StackBlitz reports `linux-x64`, so pnpm's platform filter installs the native Linux binding and skips the WebAssembly one. WebContainer cannot execute a native binary, so rolldown falls back to WebAssembly — and that fallback is not installed. The lab then fails to start:

```
Error: Cannot find native binding.
```

Declaring the WebAssembly binding directly defeats the platform filter, because pnpm only filters *optional* dependencies. Local development is unaffected: rolldown still prefers the native binding where one can run.

**Its version must match the rolldown that Vite resolves.** `pnpm verify:stackblitz` fails when they drift, so a Vite upgrade that moves rolldown cannot silently break the public link.

The lab also pins `@napi-rs/wasm-runtime` with a pnpm override. Rolldown 1.1.5 declares `^1.1.6`, but `1.2.0` changed its emnapi peer range to `2.x` while this binding still depends on emnapi `1.x`. A fresh StackBlitz install can otherwise resolve that incompatible minor version even when the committed lockfile is correct. Keep the override until the Rolldown binding itself moves to the matching emnapi runtime.
