# Troubleshooting unavailable evidence

`Unavailable` is a boundary, not a guess. It means CauseScope did not observe enough evidence to make the requested link with confidence. The missing evidence may be expected, or it may point to a setup problem.

Use the visible symptom to choose the smallest verification below. Do not enable CauseScope in production, disable redaction, or upload a private trace to diagnose these cases.

## The Inspect control is absent

**Visible symptom.** The page has no **Inspect** control and no CauseScope drawer.

**Why evidence is unavailable.** The Vite plugin activates only for `vite serve` in `development` mode. It intentionally does not run for builds, previews, SSR transforms, a development server started with another mode, or `enabled: false`. Production output contains no overlay, runtime, endpoint, or debug attributes.

**Smallest safe verification.** Start the application's normal Vite development command with the default `development` mode and confirm that **Inspect** appears. If the control appears there but not in a built or previewed page, CauseScope is behaving as designed. If it is still absent, confirm that `causeScope()` is present in `vite.config.ts` and that `enabled` is not false.

See [Getting started](/getting-started) for the supported configuration and [Performance budgets](/performance#what-ships-to-production) for the production-absence gate.

## A dependency-owned element has no source

**Visible symptom.** Selecting an element rendered inside a third-party component shows **Source unavailable**, no dynamic JSX expression, or an origin that remains unconfirmed. CauseScope still selects the nearest interactive DOM boundary instead of replacing it with a larger project-owned wrapper.

**Why evidence is unavailable.** CauseScope instruments project-owned JSX/TSX inside the configured Vite root. The default filter excludes `node_modules` and build output, and `include`, `exclude`, or `ignoreComponents` can narrow that set further. CauseScope does not invent coordinates for dependency internals that it did not transform.

**Smallest safe verification.** Select the nearest element rendered by one of your own `.tsx` files. If that element resolves to an exact file and line, the dependency boundary is expected. If your own element is also unavailable, check that its file is inside the Vite root and is not matched by `exclude` or `ignoreComponents` in [Configuration](/configuration).

Do not broaden instrumentation to all of `node_modules`; inspect a project-owned wrapper or create a small typed wrapper around the value you need to trace.

## A project element says Source unavailable

**Visible symptom.** CauseScope can observe the DOM or current runtime value, but the Source section has no project file, line, and column. **Open in editor** therefore has no exact target.

**Why evidence is unavailable.** Source ownership is compile-time metadata. The CauseScope transform adds the project-relative file and coordinates and returns a source map for the rest of Vite's transform chain. A file outside the Vite root, an excluded or ignored file, an SSR-only module, an unsupported extension, or a custom transform that removes the injected metadata cannot be assigned a source safely.

**Smallest safe verification.** In browser developer tools, inspect one known element authored directly in a project `.tsx` file. Its rendered element should contain `data-causescope-file`, `data-causescope-line`, and `data-causescope-column`. If those attributes are absent, verify the file and filters described above, then restart the Vite development server. If they are present but the drawer still reports unavailable, reduce the case to synthetic TSX before opening a bug; do not share application data or a private trace.

Static text is different: when source metadata exists but there is no dynamic expression, CauseScope intentionally shows the source snippet and location without manufacturing state or origin evidence.

## State is registered but has no setter call

**Visible symptom.** State provenance says **Component state is registered, but no setter call has been recorded yet**, or **No traced state setter is correlated with this expression yet**. The State tab may show the current and initial values without a latest update.

**Why evidence is unavailable.** CauseScope records real setter and reducer transitions during the current development-page run. It does not infer a transition from the current value, and it does not claim that unrelated component state caused the selected expression.

**Smallest safe verification.** Perform the real UI interaction that changes the state once, then select the affected element again. Keep the same page run while checking the result because a reload starts a new in-memory timeline. If the current value changes but the selected expression still has no correlation, check whether that expression actually reads the state binding; an unrelated update remains explicitly unconfirmed.

## A React Query or Zustand origin is unavailable

**Visible symptom.** The value renders correctly, but the Values tab says **Origin unavailable** or **origin unconfirmed**, and no React Query or Zustand origin appears.

**Why evidence is unavailable.** Adapters register current cache or store values and subscribe to later changes. If an adapter is installed after the first React render, the already-captured render happened before that provenance was registered. CauseScope does not rewrite historical expression evidence. Primitive origins also stay unconfirmed when the same value has more than one possible source.

**Smallest safe verification.** Await adapter installation before the first `createRoot(...).render(...)`, reload the development page, and let the value render again. This ordering matches the maintained fixtures:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { queryClient } from "./queryClient";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    const [{ getCauseScopeRuntime }, { reactQueryAdapter }] = await Promise.all([
      import("causescope"),
      import("causescope/adapters/react-query"),
    ]);

    getCauseScopeRuntime().installAdapter(reactQueryAdapter({ queryClient }));
  }

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
```

For Zustand, also pass each store explicitly; CauseScope never searches the application for unrelated stores. See [Data adapters](/adapters) for both maintained examples.

## Still unavailable?

Confirm the same behavior in the [public live lab](https://stackblitz.com/fork/github/stackloomdev/causescope/tree/main/examples/stackblitz?title=CauseScope%20Live%20Lab). If the lab works and a project-owned TSX element does not, create a minimal synthetic reproduction that keeps the same Vite plugin order and filters. Review [Privacy](/privacy) before sharing any diagnostic artifact.
