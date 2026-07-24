# Data adapters

Adapters attach source metadata to values that would otherwise look like ordinary objects or primitives at render time. Install them before the first React render.

## React Query

```ts
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { reactQueryAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/react-query"),
  ]);
  getCauseScopeRuntime().installAdapter(reactQueryAdapter({ queryClient }));
}
```

CauseScope observes the configured Query Cache. It records query key, status, fetch status, and data update time. Reused object references receive refreshed metadata. Primitive data is reported only when its registered source is unambiguous.

## Zustand

```ts
if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { zustandAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/zustand"),
  ]);

  getCauseScopeRuntime().installAdapter(zustandAdapter({
    stores: { preferencesStore },
    sources: {
      preferencesStore: { file: "src/stores/preferences.ts", line: 8, column: 27 },
    },
  }));
}
```

Stores must be passed explicitly. CauseScope records changed top-level fields and the latest triggering event when available, without scanning the application for other stores.
