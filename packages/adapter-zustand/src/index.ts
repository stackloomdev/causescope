import type { CauseScopeAdapter, SourceLocation } from "@causescope/shared";

export interface ZustandStoreLike<State> {
  getState(): State;
  subscribe(listener: (state: State, previousState: State) => void): () => void;
}

export interface ZustandAdapterOptions {
  stores: Record<string, ZustandStoreLike<unknown>>;
  sources?: Record<string, SourceLocation>;
}

function changedFields(current: unknown, previous: unknown): string[] {
  if (typeof current !== "object" || current === null || typeof previous !== "object" || previous === null) {
    return Object.is(current, previous) ? [] : ["state"];
  }
  const currentRecord = current as Record<string, unknown>;
  const previousRecord = previous as Record<string, unknown>;
  const keys = new Set([...Object.keys(currentRecord), ...Object.keys(previousRecord)]);
  return [...keys].filter((key) => {
    const currentDescriptor = Object.getOwnPropertyDescriptor(currentRecord, key);
    const previousDescriptor = Object.getOwnPropertyDescriptor(previousRecord, key);
    if (!currentDescriptor || !previousDescriptor) return currentDescriptor !== previousDescriptor;
    const currentIsValue = Object.prototype.hasOwnProperty.call(currentDescriptor, "value");
    const previousIsValue = Object.prototype.hasOwnProperty.call(previousDescriptor, "value");
    if (currentIsValue && previousIsValue) return !Object.is(currentDescriptor.value, previousDescriptor.value);
    return currentDescriptor.get !== previousDescriptor.get || currentDescriptor.set !== previousDescriptor.set;
  });
}

export function zustandAdapter(options: ZustandAdapterOptions): CauseScopeAdapter {
  return {
    name: "zustand",
    install(api) {
      const cleanups: Array<() => void> = [];
      for (const [storeName, store] of Object.entries(options.stores)) {
        const source = options.sources?.[storeName];
        const register = (state: unknown): void => {
          api.registerValueOrigin(state, {
            kind: "zustand",
            confidence: "confirmed",
            label: storeName,
            path: "state",
            metadata: { storeName },
            ...(source ? { source } : {}),
          }, true);
        };
        register(store.getState());
        cleanups.push(store.subscribe((state, previousState) => {
          try {
            register(state);
            api.recordStoreUpdate({
              adapter: "zustand",
              storeName,
              changedFields: changedFields(state, previousState),
              timestamp: Date.now(),
              ...(source ? { source } : {}),
            });
          } catch {
            // Adapter diagnostics must not break the store update.
          }
        }));
      }
      return () => cleanups.forEach((cleanup) => cleanup());
    },
  };
}
