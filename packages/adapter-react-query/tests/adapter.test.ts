import { describe, expect, it, vi } from "vitest";
import type { CauseScopeAdapterApi } from "@causescope/shared";
import { CauseScopeRuntimeImpl } from "@causescope/runtime-core";
import { reactQueryAdapter } from "../src/index";

describe("reactQueryAdapter", () => {
  it("registers query data and refreshes it after cache updates", () => {
    const data = { product: { price: 42 } };
    let listener = (): void => undefined;
    const registerValueOrigin = vi.fn();
    const adapter = reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => [{
            queryKey: ["product", "42"],
            state: { data, status: "success", fetchStatus: "idle", dataUpdatedAt: 12 },
          }],
          subscribe: (next) => {
            listener = next;
            return vi.fn();
          },
        }),
      },
    });
    const api = {
      registerValueOrigin,
      recordStoreUpdate: vi.fn(),
      getNetworkRequests: vi.fn(() => []),
    } satisfies CauseScopeAdapterApi;

    adapter.install(api);
    listener();

    expect(registerValueOrigin).toHaveBeenCalledTimes(2);
    expect(registerValueOrigin).toHaveBeenLastCalledWith(data, expect.objectContaining({
      kind: "react-query",
      metadata: expect.objectContaining({ queryKey: ["product", "42"], status: "success" }),
    }), true);
  });

  it("isolates cache inspection failures from Query Cache notifications", () => {
    let listener = (): void => undefined;
    const adapter = reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => { throw new Error("unavailable cache"); },
          subscribe: (next) => {
            listener = next;
            return vi.fn();
          },
        }),
      },
    });
    const api = {
      registerValueOrigin: vi.fn(),
      recordStoreUpdate: vi.fn(),
      getNetworkRequests: vi.fn(() => []),
    } satisfies CauseScopeAdapterApi;

    expect(() => adapter.install(api)).not.toThrow();
    expect(() => listener()).not.toThrow();
  });

  it("refreshes metadata when React Query reuses the same object reference", () => {
    const data = { value: 42 };
    const state = { data, status: "pending", fetchStatus: "fetching", dataUpdatedAt: 1 };
    let listener = (): void => undefined;
    const runtime = new CauseScopeRuntimeImpl();
    runtime.installAdapter(reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => [{ queryKey: ["answer"], state }],
          subscribe: (next) => {
            listener = next;
            return () => undefined;
          },
        }),
      },
    }));

    state.status = "success";
    state.fetchStatus = "idle";
    state.dataUpdatedAt = 2;
    listener();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_query_object",
        nodeId: "cs_node_query_object",
        kind: "children",
        property: "children",
        expression: "query.data.value",
        source: { file: "src/QueryView.tsx", line: 8, column: 12 },
      },
      evaluate: (capture) => capture("query.data", data),
    });

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "42",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_query_object" : null,
    } as unknown as Element);
    expect(inspection.origins).toEqual([expect.objectContaining({
      kind: "react-query",
      traceId: expect.stringMatching(/^react-query:[a-z0-9]+-\d+$/),
      metadata: expect.objectContaining({ status: "success", fetchStatus: "idle", dataUpdatedAt: 2 }),
    })]);
  });

  it("follows a useQuery observer result through its registered data object", () => {
    const data = { name: "Traceable mug" };
    const observerResult = { data, status: "success" };
    const runtime = new CauseScopeRuntimeImpl();
    runtime.installAdapter(reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => [{
            queryKey: ["product", "42"],
            state: { data, status: "success", fetchStatus: "idle", dataUpdatedAt: 12 },
          }],
          subscribe: () => () => undefined,
        }),
      },
    }));
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_query_observer",
        nodeId: "cs_node_query_observer",
        kind: "children",
        property: "children",
        expression: "product.data?.name",
        source: { file: "src/QueryView.tsx", line: 8, column: 12 },
      },
      evaluate: (capture) => capture("product.data.name", data.name, undefined, {
        originValue: observerResult,
        accessPath: "data.name",
      }),
    });

    const inspection = runtime.inspectElement({
      tagName: "H2",
      textContent: data.name,
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_query_observer" : null,
    } as unknown as Element);
    expect(inspection.origins).toEqual([expect.objectContaining({
      kind: "react-query",
      confidence: "confirmed",
      path: "data.name",
      metadata: expect.objectContaining({ queryKey: ["product", "42"], dataUpdatedAt: 12 }),
    })]);
  });

  it("retains primitive query provenance as possible rather than claiming value identity", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.installAdapter(reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => [{
            queryKey: ["status"],
            state: { data: "ready", status: "success", fetchStatus: "idle", dataUpdatedAt: 9 },
          }],
          subscribe: () => () => undefined,
        }),
      },
    }));
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_query_primitive",
        nodeId: "cs_node_query_primitive",
        kind: "children",
        property: "children",
        expression: "query.data",
        source: { file: "src/QueryView.tsx", line: 9, column: 12 },
      },
      evaluate: (capture) => capture("query.data", "ready"),
    });

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "ready",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_query_primitive" : null,
    } as unknown as Element);
    expect(inspection.origins).toEqual([expect.objectContaining({
      kind: "react-query",
      confidence: "possible",
      traceId: expect.stringMatching(/^react-query:[a-z0-9]+-\d+$/),
      metadata: expect.objectContaining({ dataUpdatedAt: 9 }),
    })]);
  });

  it("does not attribute an equal primitive to one of multiple query identities", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.installAdapter(reactQueryAdapter({
      queryClient: {
        getQueryCache: () => ({
          getAll: () => [
            { queryKey: ["primary-status"], state: { data: "ready", status: "success" } },
            { queryKey: ["secondary-status"], state: { data: "ready", status: "success" } },
          ],
          subscribe: () => () => undefined,
        }),
      },
    }));
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_ambiguous_query_primitive",
        nodeId: "cs_node_ambiguous_query_primitive",
        kind: "children",
        property: "children",
        expression: "localStatus",
        source: { file: "src/QueryView.tsx", line: 10, column: 12 },
      },
      evaluate: (capture) => capture("localStatus", "ready"),
    });

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "ready",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_ambiguous_query_primitive" : null,
    } as unknown as Element);
    expect(inspection.origins).toEqual([]);
  });
});
