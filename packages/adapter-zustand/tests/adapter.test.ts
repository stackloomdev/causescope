import { describe, expect, it, vi } from "vitest";
import type { CauseScopeAdapterApi } from "@causescope/shared";
import { CauseScopeRuntimeImpl } from "@causescope/runtime-core";
import { zustandAdapter } from "../src/index";

describe("zustandAdapter", () => {
  it("registers store origins and reports changed fields", () => {
    let state = { isDirty: false, title: "Draft" };
    let listener = (_current: typeof state, _previous: typeof state): void => undefined;
    const api = {
      registerValueOrigin: vi.fn(),
      recordStoreUpdate: vi.fn(),
      getNetworkRequests: vi.fn(() => []),
    } satisfies CauseScopeAdapterApi;
    const adapter = zustandAdapter({
      stores: {
        editorStore: {
          getState: () => state,
          subscribe: (next) => {
            listener = next;
            return vi.fn();
          },
        },
      },
      sources: {
        editorStore: { file: "src/stores/editor.ts", line: 12, column: 4 },
      },
    });

    adapter.install(api);
    const previous = state;
    state = { ...state, isDirty: true };
    listener(state, previous);

    expect(api.registerValueOrigin).toHaveBeenCalledTimes(2);
    expect(api.registerValueOrigin).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        source: { file: "src/stores/editor.ts", line: 12, column: 4 },
      }),
      true,
    );
    expect(api.recordStoreUpdate).toHaveBeenCalledWith(expect.objectContaining({
      adapter: "zustand",
      storeName: "editorStore",
      changedFields: ["isDirty"],
      source: { file: "src/stores/editor.ts", line: 12, column: 4 },
    }));
  });

  it("isolates diagnostic failures from store subscriptions", () => {
    let listener = (_current: object, _previous: object): void => undefined;
    let registrationCount = 0;
    const api = {
      registerValueOrigin: vi.fn(() => {
        registrationCount += 1;
        if (registrationCount > 1) throw new Error("diagnostic failure");
      }),
      recordStoreUpdate: vi.fn(),
      getNetworkRequests: vi.fn(() => []),
    } satisfies CauseScopeAdapterApi;
    const adapter = zustandAdapter({
      stores: {
        editorStore: {
          getState: () => ({}),
          subscribe: (next) => {
            listener = next;
            return vi.fn();
          },
        },
      },
    });

    expect(() => adapter.install(api)).not.toThrow();
    // If a configured API fails later, the store's own notification still
    // must not throw.
    expect(() => listener({}, {})).not.toThrow();
  });

  it("keeps a selector primitive as a possible store origin", () => {
    const state = { compact: true };
    const runtime = new CauseScopeRuntimeImpl();
    runtime.installAdapter(zustandAdapter({
      stores: {
        workspaceStore: {
          getState: () => state,
          subscribe: () => () => undefined,
        },
      },
    }));
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_zustand_selector",
        nodeId: "cs_node_zustand_selector",
        kind: "children",
        property: "children",
        expression: "compact ? 'Compact' : 'Comfortable'",
        source: { file: "src/App.tsx", line: 18, column: 12 },
      },
      evaluate: (capture) => capture("compact", state.compact),
    });

    const inspection = runtime.inspectElement({
      tagName: "H2",
      textContent: "Compact",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_zustand_selector" : null,
    } as unknown as Element);
    expect(inspection.origins).toEqual([expect.objectContaining({
      kind: "zustand",
      confidence: "possible",
      label: "workspaceStore",
      path: "state.compact",
    })]);
  });
});
