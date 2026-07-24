import { describe, expect, it } from "vitest";
import { createReactRuntimeAdapter } from "../src/index";

function ProductEditor(): null {
  return null;
}

function ProductPage(): null {
  return null;
}

function QueryClientProvider(): null {
  return null;
}

describe("React runtime adapter", () => {
  it("finds the private Fiber pointer and returns the nearest business component stack", () => {
    const pageFiber = { type: ProductPage, return: null };
    const editorFiber = { type: ProductEditor, return: pageFiber };
    const hostFiber = { type: "button", return: editorFiber };
    const element = { __reactFiber$test: hostFiber } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.findFiberFromElement(element)).toBe(hostFiber);
    expect(adapter.getComponentStack(element)).toEqual(["ProductEditor", "ProductPage"]);
  });

  it("prefers the current host props stored on the DOM node over a stale Fiber pointer", () => {
    const hostFiber = { type: "span", memoizedProps: { children: "Previous" }, return: null };
    const currentProps = { children: "Current" };
    const element = {
      __reactFiber$test: hostFiber,
      __reactProps$test: currentProps,
    } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.getCurrentProps(hostFiber, element)).toBe(currentProps);
    expect(adapter.getCurrentProps(hostFiber)).toEqual({ children: "Previous" });
  });

  it("returns exact useState dispatch identities for the selected component and its ancestors", () => {
    const editorSetter = () => undefined;
    const pageSetter = () => undefined;
    const pageFiber = {
      type: ProductPage,
      memoizedState: { queue: { dispatch: pageSetter }, next: null },
      return: null,
    };
    const editorFiber = {
      type: ProductEditor,
      memoizedState: {
        queue: { dispatch: editorSetter },
        next: { queue: null, next: null },
      },
      alternate: {
        memoizedState: { queue: { dispatch: editorSetter }, next: null },
      },
      return: pageFiber,
    };
    const hostFiber = { type: "button", return: editorFiber };
    const element = { __reactFiber$test: hostFiber } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.getComponentStateBindings?.(element)).toEqual([
      { componentName: "ProductEditor", setterIdentities: [editorSetter] },
      { componentName: "ProductPage", setterIdentities: [pageSetter] },
    ]);
  });

  it("returns current props for the selected component and one-level ancestors", () => {
    const pageFiber = { type: ProductPage, memoizedProps: { workspaceId: "rw" }, return: null };
    const editorFiber = { type: ProductEditor, memoizedProps: { product: { price: 24 } }, return: pageFiber };
    const hostFiber = { type: "strong", memoizedProps: { children: "$24" }, return: editorFiber };
    const element = { __reactFiber$test: hostFiber } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.getComponentFrames?.(element)).toEqual([
      { componentName: "ProductEditor", props: { product: { price: 24 } } },
      { componentName: "ProductPage", props: { workspaceId: "rw" } },
    ]);
  });

  it("walks the committed alternate when the DOM Fiber pointer is stale", () => {
    const currentProps = { children: "1" };
    const currentPage = { type: ProductPage, memoizedProps: { version: 1 }, return: null as unknown };
    const currentEditor = { type: ProductEditor, memoizedProps: { count: 1 }, return: currentPage as unknown };
    const currentHost: {
      type: string;
      memoizedProps: typeof currentProps;
      return: unknown;
      alternate?: unknown;
    } = { type: "strong", memoizedProps: currentProps, return: currentEditor as unknown };
    const stalePage = { type: ProductPage, memoizedProps: { version: 0 }, return: null as unknown };
    const staleEditor = { type: ProductEditor, memoizedProps: { count: 0 }, return: stalePage as unknown };
    const staleHost = {
      type: "strong",
      memoizedProps: { children: "0" },
      return: staleEditor as unknown,
      alternate: currentHost,
    };
    currentHost.alternate = staleHost;
    const element = {
      __reactFiber$test: staleHost,
      __reactProps$test: currentProps,
    } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.findFiberFromElement(element)).toBe(currentHost);
    expect(adapter.getComponentFrames?.(element)).toEqual([
      { componentName: "ProductEditor", props: { count: 1 } },
      { componentName: "ProductPage", props: { version: 1 } },
    ]);
  });

  it("filters configured wrapper component names without breaking parent traversal", () => {
    const pageFiber = { type: ProductPage, memoizedProps: { workspaceId: "rw" }, return: null };
    const editorFiber = { type: ProductEditor, memoizedProps: { count: 1 }, return: pageFiber };
    const hostFiber = { type: "strong", memoizedProps: { children: "1" }, return: editorFiber };
    const element = { __reactFiber$test: hostFiber } as unknown as Element;
    const adapter = createReactRuntimeAdapter({ ignoreComponents: ["ProductEditor"] });

    expect(adapter.getComponentStack(element)).toEqual(["ProductPage"]);
    expect(adapter.getComponentFrames?.(element)).toEqual([
      { componentName: "ProductPage", props: { workspaceId: "rw" } },
    ]);
  });

  it("omits provider wrappers from the business component stack", () => {
    const pageFiber = { type: ProductPage, memoizedProps: {}, return: null };
    const providerFiber = { type: QueryClientProvider, memoizedProps: { client: {} }, return: pageFiber };
    const hostFiber = { type: "strong", memoizedProps: { children: "Product" }, return: providerFiber };
    const element = { __reactFiber$test: hostFiber } as unknown as Element;
    const adapter = createReactRuntimeAdapter();

    expect(adapter.getComponentStack(element)).toEqual(["ProductPage"]);
    expect(adapter.getComponentFrames?.(element)).toEqual([
      { componentName: "ProductPage", props: {} },
    ]);
  });
});
