import { describe, expect, it, vi } from "vitest";
import { CauseScopeRuntimeImpl } from "../src/index";
import { mergeRedaction, redactHeaders, redactUrl, serializeValue } from "../src/serialization";

const source = { file: "src/ProductEditor.tsx", line: 20, column: 7 };

describe("CauseScopeRuntimeImpl", () => {
  it("keeps default privacy rules when custom redaction keys are added", () => {
    const redaction = mergeRedaction({
      headers: ["x-workspace-secret"],
      queryParams: ["workspace_token"],
      objectKeys: ["private_note"],
    });

    expect(redaction.headers).toEqual(expect.arrayContaining(["authorization", "cookie", "x-api-key", "x-workspace-secret"]));
    expect(redactHeaders({ authorization: "Bearer secret", "x-workspace-secret": "hidden", accept: "json" }, redaction)).toEqual({
      accept: "json",
      authorization: "[REDACTED]",
      "x-workspace-secret": "[REDACTED]",
    });
    expect(redactHeaders({
      token: "one",
      access_token: "two",
      password: "three",
      secret: "four",
      "x-client-secret": "five",
    }, redaction)).toEqual({
      token: "[REDACTED]",
      access_token: "[REDACTED]",
      password: "[REDACTED]",
      secret: "[REDACTED]",
      "x-client-secret": "[REDACTED]",
    });
    expect(redactUrl("/api/items?token=one&workspace_token=two&view=all", redaction)).toBe(
      "/api/items?token=%5BREDACTED%5D&workspace_token=%5BREDACTED%5D&view=all",
    );
    expect(serializeValue({ password: "one", private_note: "two", title: "safe" }, redaction)).toMatchObject({
      type: "object",
      value: {
        password: { value: "[REDACTED]" },
        private_note: { value: "[REDACTED]" },
        title: { value: "safe" },
      },
    });
  });

  it("redacts common camelCase, snake_case, and kebab-case secret keys", () => {
    const redaction = mergeRedaction();
    const serialized = serializeValue({
      accessToken: "one",
      auth_token: "two",
      "client-secret": "three",
      apiKey: "four",
      user_password: "five",
      tokenCount: 6,
    }, redaction);

    expect(serialized).toMatchObject({
      type: "object",
      value: {
        accessToken: { value: "[REDACTED]" },
        auth_token: { value: "[REDACTED]" },
        "client-secret": { value: "[REDACTED]" },
        apiKey: { value: "[REDACTED]" },
        user_password: { value: "[REDACTED]" },
        tokenCount: { value: 6 },
      },
    });
    expect(redactUrl("/api?accessToken=one&client_secret=two&tokenCount=3", redaction)).toBe(
      "/api?accessToken=%5BREDACTED%5D&client_secret=%5BREDACTED%5D&tokenCount=3",
    );
  });

  it("serializes undefined with an explicit JSON-safe tag", () => {
    const redaction = mergeRedaction();
    const serialized = serializeValue({
      direct: undefined,
      values: [undefined, , Number.NaN],
    }, redaction);

    expect(serialized).toEqual({
      type: "object",
      value: {
        direct: { type: "undefined" },
        values: {
          type: "array",
          value: [
            { type: "undefined" },
            { type: "undefined" },
            { type: "unsupported", reason: "Non-finite number: NaN" },
          ],
        },
      },
    });
    expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
  });

  it("removes URL credentials, fragments, and malformed URL contents", () => {
    const redaction = mergeRedaction();
    const sanitized = redactUrl(
      "https://account:password@example.com/api?access_token=query-secret#access_token=fragment-secret",
      redaction,
    );

    expect(sanitized).toContain("example.com/api");
    expect(sanitized).not.toMatch(/account|password|query-secret|fragment-secret/);
    expect(sanitized).toContain("%5BREDACTED%5D");
    expect(redactUrl("http://[invalid?token=secret", redaction)).toBe("[REDACTED URL]");
    expect(redactUrl("data:text/plain,embedded-secret", redaction)).toBe("[REDACTED URL]");
  });

  it("does not invoke object getters while serializing or registering recursive origins", () => {
    const getter = vi.fn(() => "sensitive");
    const value = Object.defineProperty({ safe: "value" }, "computed", {
      enumerable: true,
      get: getter,
    });
    const redaction = mergeRedaction();
    const runtime = new CauseScopeRuntimeImpl();

    expect(serializeValue(value, redaction)).toMatchObject({
      type: "object",
      value: {
        safe: { type: "primitive", value: "value" },
        computed: { type: "unsupported", reason: "Accessor not evaluated" },
      },
    });
    runtime.registerValueOrigin(value, {
      kind: "network",
      confidence: "confirmed",
      label: "GET /api/safe",
    }, true);

    expect(getter).not.toHaveBeenCalled();
  });


  it("evaluates a boolean expression exactly once and preserves its result", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const evaluate = vi.fn(() => true);

    const result = runtime.traceBoolean({
      metadata: {
        id: "cs_expr_1",
        nodeId: "cs_node_1",
        kind: "attribute",
        property: "disabled",
        expression: "!isDirty",
        source,
      },
      evaluate,
      inputs: { isDirty: false },
    });

    expect(result).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("captures only operands reached by the original short-circuit evaluation", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let shouldEvaluateLater = false;
    const capture = vi.fn(
      (record: <T>(name: string, value: T) => T) => shouldEvaluateLater && record("later", true),
    );

    const result = runtime.traceBoolean({
      metadata: {
        id: "cs_expr_short_circuit",
        nodeId: "cs_node_short_circuit",
        kind: "attribute",
        property: "disabled",
        expression: "false && later",
        source,
      },
      evaluate: capture,
    });

    expect(result).toBe(false);
    expect(capture).toHaveBeenCalledTimes(1);
    const inspection = runtime.inspectElement({
      tagName: "BUTTON",
      textContent: "Publish",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_short_circuit";
        return null;
      },
    } as unknown as Element);
    expect(inspection.expressions[0]?.inputs).toEqual({});
  });

  it("collects multiple generic JSX expressions for the same DOM node", () => {
    const runtime = new CauseScopeRuntimeImpl();

    expect(runtime.traceExpression({
      metadata: {
        id: "cs_expr_class",
        nodeId: "cs_node_generic",
        kind: "attribute",
        property: "className",
        expression: "className",
        source,
      },
      evaluate: (capture) => capture("className", "featured"),
    })).toBe("featured");
    expect(runtime.traceExpression({
      metadata: {
        id: "cs_expr_children",
        nodeId: "cs_node_generic",
        kind: "children",
        property: "children",
        expression: "title",
        source,
      },
      evaluate: (capture) => capture("title", "Coffee mug"),
    })).toBe("Coffee mug");

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "Coffee mug",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_generic";
        if (name === "class") return "featured";
        return null;
      },
      getAttributeNames() {
        return ["class", "data-causescope-node"];
      },
    } as unknown as Element);

    expect(inspection.expressions.map((expression) => expression.property)).toEqual(["className", "children"]);
    expect(inspection.element.attributes).toEqual({ class: "featured" });
  });

  it("does not attach expression, state, or timeline claims to a static node", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let dirty = false;
    runtime.setState({
      stateId: "cs_state_dirty",
      stateName: "isDirty",
      componentName: "ProductEditor",
      source,
      setter: (write) => {
        dirty = typeof write === "function" ? write(dirty) : write;
      },
      previousValue: dirty,
      nextValue: true,
    });
    runtime.recordEvent({
      type: "click",
      label: "click static label",
      timestamp: 1,
      metadata: { targetNodeId: "cs_node_static" },
    });

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "Draft",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_static";
        if (name === "data-causescope-component") return "ProductEditor";
        if (name === "data-causescope-source") return '<span className="draft-badge">Draft</span>';
        return null;
      },
    } as unknown as Element);

    expect(inspection.expressions).toEqual([]);
    expect(inspection.sourceSnippet).toBe('<span className="draft-badge">Draft</span>');
    expect(inspection.stateUpdates).toEqual([]);
    expect(inspection.correlatedStateUpdates).toEqual([]);
    expect(inspection.timeline).toEqual([]);
  });

  it("batches render-time notifications and replaces an expression in the same source slot", async () => {
    const runtime = new CauseScopeRuntimeImpl();
    const listener = vi.fn();
    runtime.subscribe(listener);
    const metadata = {
      nodeId: "cs_node_status",
      kind: "children" as const,
      property: "children",
      source,
    };

    runtime.traceExpression({
      metadata: { ...metadata, id: "cs_expr_old", expression: "oldStatus" },
      evaluate: () => "Draft",
    });
    runtime.traceExpression({
      metadata: { ...metadata, id: "cs_expr_new", expression: "currentStatus" },
      evaluate: () => "Ready",
    });

    await Promise.resolve();
    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "Ready",
      getAttribute(name: string) {
        return name === "data-causescope-node" ? "cs_node_status" : null;
      },
    } as unknown as Element);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(inspection.expressions.map((expression) => expression.expression)).toEqual(["currentStatus"]);
  });

  it("does not add timeline noise when an inline handler gets a new function identity", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const metadata = {
      id: "cs_expr_handler",
      nodeId: "cs_node_handler",
      kind: "attribute" as const,
      property: "onClick",
      expression: "() => save()",
      source,
    };

    runtime.traceExpression({ metadata, evaluate: () => () => undefined });
    runtime.traceExpression({ metadata, evaluate: () => () => undefined });

    expect(runtime.getTimeline()).toEqual([]);
  });

  it("binds repeated JSX source results to the selected React host instance", () => {
    const runtime = new CauseScopeRuntimeImpl();
    type RowElement = {
      tagName: string;
      textContent: string;
      ownerDocument: { querySelectorAll: () => RowElement[] };
      reactProps: { children: string };
      getAttribute: (name: string) => string | null;
    };
    let firstElement: RowElement;
    let secondElement: RowElement;
    const ownerDocument = {
      querySelectorAll: () => [firstElement, secondElement],
    };
    const createElement = (children: string): RowElement => ({
      tagName: "SPAN",
      textContent: children,
      ownerDocument,
      reactProps: { children },
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_row";
        if (name === "data-causescope-component") return "Row";
        return null;
      },
    });
    firstElement = createElement("First");
    secondElement = createElement("Second");
    runtime.setReactAdapter({
      findFiberFromElement: (element) => element,
      getParentFiber: () => null,
      getComponentName: () => "Row",
      getCurrentProps: (fiber) => (fiber as { reactProps: unknown }).reactProps,
      getComponentStack: () => ["Row"],
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_row",
        nodeId: "cs_node_row",
        kind: "children",
        property: "children",
        expression: "item.label",
        source,
        instanceBinding: "host-prop",
      },
      evaluate: () => "First",
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_row",
        nodeId: "cs_node_row",
        kind: "children",
        property: "children",
        expression: "item.label",
        source,
        instanceBinding: "host-prop",
      },
      evaluate: () => "Second",
    });

    const firstInspection = runtime.inspectElement(firstElement as unknown as Element);
    const secondInspection = runtime.inspectElement(secondElement as unknown as Element);
    expect(firstInspection.expressions[0]).toMatchObject({
      result: "First",
      inputs: {},
      traceMode: "selected-instance-result",
    });
    expect(secondInspection.expressions[0]).toMatchObject({
      result: "Second",
      inputs: {},
      traceMode: "selected-instance-result",
    });
  });

  it("does not reuse the last row origin for a different repeated instance", () => {
    const runtime = new CauseScopeRuntimeImpl();
    type RowElement = {
      tagName: string;
      textContent: string;
      ownerDocument: { querySelectorAll: () => RowElement[] };
      reactProps: { children: string };
      getAttribute: (name: string) => string | null;
    };
    let firstElement: RowElement;
    let secondElement: RowElement;
    const ownerDocument = { querySelectorAll: () => [firstElement, secondElement] };
    const createElement = (children: string): RowElement => ({
      tagName: "SPAN",
      textContent: children,
      ownerDocument,
      reactProps: { children },
      getAttribute: (name) => name === "data-causescope-node" ? "cs_node_origin_row" : null,
    });
    firstElement = createElement("First");
    secondElement = createElement("Second");
    runtime.setReactAdapter({
      findFiberFromElement: (element) => element,
      getParentFiber: () => null,
      getComponentName: () => "Row",
      getCurrentProps: (fiber) => (fiber as { reactProps: unknown }).reactProps,
      getComponentStack: () => ["Row"],
    });
    const metadata = {
      id: "cs_expr_origin_row",
      nodeId: "cs_node_origin_row",
      kind: "children" as const,
      property: "children",
      expression: "item.name",
      source,
      instanceBinding: "host-prop" as const,
      condition: {
        id: "cs_condition_origin_row",
        type: "member" as const,
        expression: "item.active",
        inputName: "item.active",
      },
      conditionalRender: {
        kind: "conditional" as const,
        conditionExpression: "item.active",
        renderedBranch: "item.name",
        alternateBranch: "fallback",
      },
    };
    runtime.traceExpression({
      metadata,
      evaluate: (capture) => {
        capture("item.active", true);
        return capture("item.name", "First", undefined, {
          origin: {
            id: "cs_origin_first_row",
            kind: "network",
            confidence: "confirmed",
            label: "GET /api/first",
            path: "response.data[0].name",
            traceId: "cs_network_first",
          },
        });
      },
    });
    runtime.traceExpression({
      metadata,
      evaluate: (capture) => {
        capture("item.active", false);
        return capture("item.name", "Second", undefined, {
          origin: {
            id: "cs_origin_second_row",
            kind: "network",
            confidence: "confirmed",
            label: "GET /api/second",
            path: "response.data[1].name",
            traceId: "cs_network_second",
          },
        });
      },
    });

    const inspection = runtime.inspectElement(firstElement as unknown as Element);
    expect(inspection.expressions[0]).toMatchObject({
      result: "First",
      inputOrigins: {},
      inputStateIds: {},
      traceMode: "selected-instance-result",
    });
    expect(inspection.origins).toEqual([]);
    expect(inspection.networkRequests).toEqual([]);
    expect(inspection.expressions[0]?.conditionEvaluation).toBeUndefined();
    expect(inspection.expressions[0]?.conditionalRenderResult).toBeUndefined();
  });

  it("marks repeated multi-child and spread traces ambiguous instead of assigning a shared result", () => {
    const runtime = new CauseScopeRuntimeImpl();
    type RepeatedElement = {
      tagName: string;
      textContent: string;
      ownerDocument: { querySelectorAll: () => RepeatedElement[] };
      reactProps: { children: string[]; title: string };
      getAttribute: (name: string) => string | null;
    };
    let firstElement: RepeatedElement;
    let secondElement: RepeatedElement;
    const ownerDocument = { querySelectorAll: () => [firstElement, secondElement] };
    const createElement = (name: string): RepeatedElement => ({
      tagName: "SPAN",
      textContent: `Hello ${name}`,
      ownerDocument,
      reactProps: { children: ["Hello ", name], title: name },
      getAttribute: (attribute) => attribute === "data-causescope-node" ? "cs_node_multi_row" : null,
    });
    firstElement = createElement("First");
    secondElement = createElement("Second");
    runtime.setReactAdapter({
      findFiberFromElement: (element) => element,
      getParentFiber: () => null,
      getComponentName: () => "Row",
      getCurrentProps: (fiber) => (fiber as { reactProps: unknown }).reactProps,
      getComponentStack: () => ["Row"],
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_prefix",
        nodeId: "cs_node_multi_row",
        kind: "children",
        property: "children",
        expression: "prefix",
        source: { ...source, column: 8 },
        instanceBinding: "host-prop",
      },
      evaluate: () => "Hello ",
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_name",
        nodeId: "cs_node_multi_row",
        kind: "children",
        property: "children",
        expression: "item.name",
        source: { ...source, column: 18 },
        instanceBinding: "host-prop",
      },
      evaluate: () => "Second",
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_spread",
        nodeId: "cs_node_multi_row",
        kind: "spread",
        property: "spread",
        expression: "rowProps",
        source: { ...source, column: 28 },
      },
      evaluate: () => ({ title: "Second" }),
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_overridden_title",
        nodeId: "cs_node_multi_row",
        kind: "attribute",
        property: "title",
        expression: "item.title",
        source: { ...source, column: 38 },
        instanceBinding: "host-prop",
      },
      evaluate: () => "Second",
    });

    const inspection = runtime.inspectElement(firstElement as unknown as Element);
    expect(inspection.expressions).toHaveLength(4);
    expect(inspection.expressions.every((expression) => expression.traceMode === "ambiguous-instance")).toBe(true);
    expect(inspection.expressions.every((expression) => expression.result === undefined)).toBe(true);
  });

  it("remembers repeated source nodes after siblings unmount and suppresses cross-instance history", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new CauseScopeRuntimeImpl();
      type HistoricalElement = {
        tagName: string;
        textContent: string;
        ownerDocument: { querySelectorAll: () => HistoricalElement[] };
        reactProps: { children: string };
        getAttribute: (name: string) => string | null;
      };
      let mountedElements: HistoricalElement[] = [];
      const ownerDocument = { querySelectorAll: () => mountedElements };
      const createElement = (children: string): HistoricalElement => ({
        tagName: "SPAN",
        textContent: children,
        ownerDocument,
        reactProps: { children },
        getAttribute(name: string) {
          if (name === "data-causescope-node") return "cs_node_historical_row";
          if (name === "data-causescope-component") return "Row";
          return null;
        },
      });
      const firstElement = createElement("First");
      const secondElement = createElement("Second");
      mountedElements = [firstElement, secondElement];
      vi.stubGlobal("document", ownerDocument);
      runtime.setReactAdapter({
        findFiberFromElement: (element) => element,
        getParentFiber: () => null,
        getComponentName: () => "Row",
        getCurrentProps: (fiber) => (fiber as { reactProps: unknown }).reactProps,
        getComponentStack: () => ["Row"],
      });
      const metadata = {
        id: "cs_expr_historical_row",
        nodeId: "cs_node_historical_row",
        kind: "children" as const,
        property: "children",
        expression: "item.label",
        source,
        instanceBinding: "host-prop" as const,
      };
      runtime.traceExpression({ metadata, evaluate: () => "First" });
      runtime.traceExpression({ metadata, evaluate: () => "Second" });
      await vi.runAllTimersAsync();

      mountedElements = [firstElement];
      let rowState = false;
      runtime.setState({
        stateId: "cs_state_row",
        stateName: "selected",
        componentName: "Row",
        source,
        setter: (write) => { rowState = typeof write === "function" ? write(rowState) : write; },
        previousValue: rowState,
        nextValue: true,
      });
      runtime.recordEvent({
        type: "click",
        label: "click second row",
        timestamp: 1,
        metadata: { targetNodeId: "cs_node_historical_row" },
      });

      const inspection = runtime.inspectElement(firstElement as unknown as Element);
      expect(inspection.expressions[0]).toMatchObject({
        result: "First",
        traceMode: "selected-instance-result",
      });
      expect(inspection.stateUpdates).toEqual([]);
      expect(inspection.correlatedStateUpdates).toEqual([]);
      expect(inspection.timeline).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("records value and functional state updates without changing setter semantics", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let current = 1;
    const setter = (value: number | ((previous: number) => number)) => {
      current = typeof value === "function" ? value(current) : value;
    };

    runtime.setState({
      stateId: "cs_state_count",
      stateName: "count",
      componentName: "Counter",
      source,
      setter,
      previousValue: current,
      nextValue: 2,
    });
    runtime.setState({
      stateId: "cs_state_count",
      stateName: "count",
      componentName: "Counter",
      source,
      setter,
      previousValue: current,
      nextValue: (previous) => previous + 3,
    });

    expect(current).toBe(5);
    expect(runtime.getTimeline().map((event) => event.label)).toEqual([
      "count 1 → 2",
      "count 2 → 5",
    ]);
  });

  it("reports initial, current, setter, and triggering event for the selected component instance", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let priorityOnly = false;
    const setter = (write: boolean | ((previous: boolean) => boolean)) => {
      priorityOnly = typeof write === "function" ? write(priorityOnly) : write;
    };
    runtime.registerState({
      stateId: "cs_state_priority",
      stateName: "priorityOnly",
      componentName: "OrdersPage",
      source: { file: "src/pages/OrdersPage.tsx", line: 11, column: 3 },
      setter,
      currentValue: priorityOnly,
    });
    runtime.recordEvent({
      type: "click",
      label: 'click button "Priority only"',
      timestamp: 10,
      metadata: { targetNodeId: "cs_node_filter" },
    });
    runtime.setEventContext({
      type: "click",
      targetNodeId: "cs_node_filter",
      targetLabel: 'button "Priority only"',
      timestamp: 10,
    });
    runtime.setState({
      stateId: "cs_state_priority",
      stateName: "priorityOnly",
      componentName: "OrdersPage",
      source: { file: "src/pages/OrdersPage.tsx", line: 37, column: 27 },
      setter,
      previousValue: priorityOnly,
      nextValue: (current) => !current,
    });
    runtime.setEventContext(null);
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_visible_count",
        nodeId: "cs_node_visible_count",
        kind: "children",
        property: "children",
        expression: "visibleOrders.length",
        source: { file: "src/pages/OrdersPage.tsx", line: 24, column: 33 },
      },
      evaluate: (capture) => capture("visibleOrders", [{ id: 1 }, { id: 2 }]).length,
    });
    const element = {
      tagName: "SPAN",
      textContent: "2 visible orders",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_visible_count";
        if (name === "data-causescope-component") return "OrdersPage";
        return null;
      },
    } as unknown as Element;
    runtime.setReactAdapter({
      findFiberFromElement: () => ({}),
      getParentFiber: () => null,
      getComponentName: () => "OrdersPage",
      getCurrentProps: () => ({ children: 2 }),
      getComponentStack: () => ["OrdersPage"],
      getComponentStateBindings: () => [{ componentName: "OrdersPage", setterIdentities: [setter] }],
    });

    const inspection = runtime.inspectElement(element);
    expect(inspection.states).toHaveLength(1);
    expect(inspection.states[0]).toMatchObject({
      stateName: "priorityOnly",
      componentName: "OrdersPage",
      initial: false,
      current: true,
      relationship: "component",
      latestUpdate: {
        previous: false,
        next: true,
        updateType: "functional",
        event: { type: "click", targetNodeId: "cs_node_filter" },
      },
    });
    expect(inspection.stateUpdates).toHaveLength(1);
    expect(inspection.correlatedStateUpdates).toEqual([]);
    expect(inspection.timeline.map((event) => event.label)).toEqual([
      "priorityOnly false → true",
      'click button "Priority only"',
    ]);
  });

  it("keeps state history isolated between repeated component instances", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let firstSelected = false;
    let secondSelected = false;
    const firstSetter = (write: boolean | ((previous: boolean) => boolean)) => {
      firstSelected = typeof write === "function" ? write(firstSelected) : write;
    };
    const secondSetter = (write: boolean | ((previous: boolean) => boolean)) => {
      secondSelected = typeof write === "function" ? write(secondSelected) : write;
    };
    for (const [setter, currentValue] of [[firstSetter, firstSelected], [secondSetter, secondSelected]] as const) {
      runtime.registerState({
        stateId: "cs_state_selected",
        stateName: "selected",
        componentName: "Row",
        source,
        setter,
        currentValue,
      });
    }
    runtime.setState({
      stateId: "cs_state_selected",
      stateName: "selected",
      componentName: "Row",
      source,
      setter: secondSetter,
      previousValue: secondSelected,
      nextValue: true,
    });

    type RowElement = {
      tagName: string;
      textContent: string;
      setterIdentity: object;
      ownerDocument: { querySelectorAll: () => RowElement[] };
      getAttribute: (name: string) => string | null;
    };
    let firstElement: RowElement;
    let secondElement: RowElement;
    const ownerDocument = { querySelectorAll: () => [firstElement, secondElement] };
    const createElement = (textContent: string, setterIdentity: object): RowElement => ({
      tagName: "BUTTON",
      textContent,
      setterIdentity,
      ownerDocument,
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_repeated_state";
        if (name === "data-causescope-component") return "Row";
        return null;
      },
    });
    firstElement = createElement("First", firstSetter);
    secondElement = createElement("Second", secondSetter);
    runtime.setReactAdapter({
      findFiberFromElement: (element) => element,
      getParentFiber: () => null,
      getComponentName: () => "Row",
      getCurrentProps: () => ({ children: "Row" }),
      getComponentStack: () => ["Row"],
      getComponentStateBindings: (element) => [{
        componentName: "Row",
        setterIdentities: [(element as unknown as RowElement).setterIdentity],
      }],
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_repeated_state",
        nodeId: "cs_node_repeated_state",
        kind: "children",
        property: "children",
        expression: "selected",
        source,
        instanceBinding: "host-prop",
      },
      evaluate: (capture) => capture("selected", secondSelected, "cs_state_selected"),
    });

    const firstInspection = runtime.inspectElement(firstElement as unknown as Element);
    const secondInspection = runtime.inspectElement(secondElement as unknown as Element);
    expect(firstInspection.states[0]).toMatchObject({ current: false });
    expect(firstInspection.states[0]?.latestUpdate).toBeUndefined();
    expect(firstInspection.stateUpdates).toEqual([]);
    expect(secondInspection.states[0]).toMatchObject({ current: true, latestUpdate: { previous: false, next: true } });
    expect(secondInspection.stateUpdates).toHaveLength(1);
  });

  it("records one functional update when Strict Mode invokes the updater twice", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let current = 2;
    const strictModeSetter = (value: number | ((previous: number) => number)) => {
      if (typeof value !== "function") {
        current = value;
        return;
      }

      const previous = current;
      value(previous);
      current = value(previous);
    };

    runtime.setState({
      stateId: "cs_state_count",
      stateName: "count",
      componentName: "Counter",
      source,
      setter: strictModeSetter,
      previousValue: current,
      nextValue: (previous) => previous + 1,
    });

    expect(current).toBe(3);
    expect(runtime.getTimeline().map((event) => event.label)).toEqual(["count 2 → 3"]);
  });

  it("records the real previous value for batched sequential value updates", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const queue: Array<(previous: number) => number> = [];
    const setter = (value: number | ((previous: number) => number)) => {
      if (typeof value === "function") queue.push(value);
      else queue.push(() => value);
    };

    runtime.setState({
      stateId: "cs_state_count",
      stateName: "count",
      componentName: "Counter",
      source,
      setter,
      previousValue: 0,
      nextValue: 1,
    });
    runtime.setState({
      stateId: "cs_state_count",
      stateName: "count",
      componentName: "Counter",
      source,
      setter,
      previousValue: 0,
      nextValue: 2,
    });

    let current = 0;
    for (const update of queue) current = update(current);

    expect(current).toBe(2);
    expect(runtime.getTimeline().map((event) => event.label)).toEqual([
      "count 0 → 1",
      "count 1 → 2",
    ]);
  });

  it("keeps the originating event when React evaluates a queued updater later", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const queue: Array<(previous: boolean) => boolean> = [];
    runtime.setEventContext({
      type: "click",
      targetNodeId: "cs_node_publish",
      targetLabel: "button Publish",
      timestamp: 100,
    });
    runtime.setState({
      stateId: "cs_state_publishing",
      stateName: "isPublishing",
      componentName: "ProductEditor",
      source,
      setter: (write) => {
        if (typeof write === "function") queue.push(write);
        else queue.push(() => write);
      },
      previousValue: false,
      nextValue: true,
    });
    runtime.setEventContext(null);

    expect(queue[0]?.(false)).toBe(true);
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_publishing",
        nodeId: "cs_node_publish",
        kind: "attribute",
        property: "disabled",
        expression: "isPublishing",
        source,
      },
      evaluate: (capture) => capture("isPublishing", true, "cs_state_publishing"),
    });
    const inspection = runtime.inspectElement({
      tagName: "BUTTON",
      textContent: "Publish",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_publish";
        if (name === "data-causescope-component") return "ProductEditor";
        return null;
      },
    } as unknown as Element);
    expect(inspection.stateUpdates[0]?.event).toMatchObject({
      type: "click",
      targetNodeId: "cs_node_publish",
      timestamp: 100,
    });
  });

  it("caps the timeline at the configured limit", () => {
    const runtime = new CauseScopeRuntimeImpl({ maxTimelineEvents: 2 });
    runtime.recordEvent({ type: "test", label: "one", timestamp: 1 });
    runtime.recordEvent({ type: "test", label: "two", timestamp: 2 });
    runtime.recordEvent({ type: "test", label: "three", timestamp: 3 });

    expect(runtime.getTimeline().map((event) => event.label)).toEqual(["two", "three"]);
  });

  it("correlates an inspected expression only with state names it actually observed", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let isDirty = false;
    let unrelated = false;
    const setter = (write: boolean | ((previous: boolean) => boolean), current: () => boolean, assign: (next: boolean) => void) => {
      assign(typeof write === "function" ? write(current()) : write);
    };

    runtime.setState({
      stateId: "cs_state_unrelated",
      stateName: "unrelated",
      componentName: "ProductEditor",
      source,
      setter: (write) => setter(write, () => unrelated, (next) => { unrelated = next; }),
      previousValue: unrelated,
      nextValue: true,
    });
    runtime.setState({
      stateId: "cs_state_dirty",
      stateName: "isDirty",
      componentName: "ProductEditor",
      source,
      setter: (write) => setter(write, () => isDirty, (next) => { isDirty = next; }),
      previousValue: isDirty,
      nextValue: true,
    });
    runtime.traceBoolean({
      metadata: {
        id: "cs_expr_dirty",
        nodeId: "cs_node_dirty",
        kind: "attribute",
        property: "disabled",
        expression: "!isDirty",
        source,
      },
      evaluate: (captureValue) => !captureValue("isDirty", isDirty, "cs_state_dirty"),
    });

    const inspection = runtime.inspectElement({
      tagName: "BUTTON",
      textContent: "Publish",
      getAttribute(name: string) {
        if (name === "data-causescope-node") return "cs_node_dirty";
        if (name === "data-causescope-component") return "ProductEditor";
        return null;
      },
    } as unknown as Element);

    expect(inspection.stateUpdates.map((update) => update.stateName)).toEqual(["isDirty", "unrelated"]);
    expect(inspection.correlatedStateUpdates.map((update) => update.stateName)).toEqual(["isDirty"]);
  });

  it("records the actual useReducer transition after React applies the reducer", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let current = { count: 0 };
    const dispatch = (action: { amount: number }): void => {
      current = { count: current.count + action.amount };
    };
    runtime.registerState({
      stateId: "cs_state_reducer",
      stateName: "counter",
      componentName: "DiagnosticsPage",
      source,
      setter: dispatch,
      currentValue: current,
      hookType: "reducer",
    });
    runtime.setEventContext({ type: "click", targetLabel: 'button "Increment"', timestamp: 10 });
    runtime.dispatchReducer({
      stateId: "cs_state_reducer",
      stateName: "counter",
      componentName: "DiagnosticsPage",
      source,
      dispatch,
      previousValue: current,
      action: { amount: 2 },
    });
    runtime.registerState({
      stateId: "cs_state_reducer",
      stateName: "counter",
      componentName: "DiagnosticsPage",
      source,
      setter: dispatch,
      currentValue: current,
      hookType: "reducer",
    });

    expect(current).toEqual({ count: 2 });
    expect(runtime.getTimeline().find((event) => event.type === "state-update")).toMatchObject({
      type: "state-update",
      metadata: { updateType: "reducer" },
    });
    expect(runtime.getTimeline().at(-1)).toMatchObject({
      type: "component-render",
      metadata: { cause: "state-update" },
    });
  });

  it("reports multiple reducer dispatches as one truthful batch instead of assigning the final state to only the last action", () => {
    const runtime = new CauseScopeRuntimeImpl();
    let current = 0;
    const dispatch = (action: { amount: number }): void => {
      current += action.amount;
    };
    runtime.registerState({
      stateId: "cs_state_batched_reducer",
      stateName: "count",
      componentName: "Counter",
      source,
      setter: dispatch,
      currentValue: current,
      hookType: "reducer",
    });
    runtime.setEventContext({
      type: "click",
      targetNodeId: "cs_node_batch",
      targetLabel: 'button "Add twice"',
      handlerExpression: "addTwice",
      source,
      timestamp: 10,
    });
    for (const amount of [1, 2]) {
      runtime.dispatchReducer({
        stateId: "cs_state_batched_reducer",
        stateName: "count",
        componentName: "Counter",
        source,
        dispatch,
        previousValue: 0,
        action: { amount },
      });
    }
    runtime.registerState({
      stateId: "cs_state_batched_reducer",
      stateName: "count",
      componentName: "Counter",
      source,
      setter: dispatch,
      currentValue: current,
      hookType: "reducer",
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_batched_reducer",
        nodeId: "cs_node_batch_result",
        kind: "children",
        property: "children",
        expression: "count",
        source,
      },
      evaluate: (capture) => capture("count", current, "cs_state_batched_reducer"),
    });
    runtime.setReactAdapter({
      findFiberFromElement: () => ({}),
      getParentFiber: () => null,
      getComponentName: () => "Counter",
      getCurrentProps: () => ({ children: current }),
      getComponentStack: () => ["Counter"],
      getComponentStateBindings: () => [{ componentName: "Counter", setterIdentities: [dispatch] }],
    });

    const inspection = runtime.inspectElement({
      tagName: "STRONG",
      textContent: String(current),
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_batch_result" : null,
    } as unknown as Element);
    expect(inspection.states[0]?.latestUpdate).toMatchObject({
      previous: 0,
      next: 3,
      action: [{ amount: 1 }, { amount: 2 }],
      reducerDispatches: [
        { action: { amount: 1 }, event: { handlerExpression: "addTwice" } },
        { action: { amount: 2 }, event: { handlerExpression: "addTwice" } },
      ],
    });
    expect(runtime.getTimeline().find((event) => event.type === "state-update")).toMatchObject({
      metadata: { reducerActionCount: 2 },
    });
  });

  it("explains evaluated and short-circuited condition nodes without re-running operands", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_condition",
        nodeId: "cs_node_condition",
        kind: "attribute",
        property: "disabled",
        expression: "!isDirty || isPublishing",
        source,
        condition: {
          id: "root",
          type: "logical",
          expression: "!isDirty || isPublishing",
          operator: "||",
          children: [
            {
              id: "left",
              type: "unary",
              expression: "!isDirty",
              operator: "!",
              children: [{ id: "dirty", type: "identifier", expression: "isDirty", inputName: "isDirty" }],
            },
            { id: "publishing", type: "identifier", expression: "isPublishing", inputName: "isPublishing" },
          ],
        },
      },
      evaluate: (capture) => !capture("isDirty", false) || capture("isPublishing", true),
    });
    const inspection = runtime.inspectElement({
      tagName: "BUTTON",
      textContent: "Publish",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_condition" : null,
    } as unknown as Element);

    expect(inspection.expressions[0]?.inputs).toEqual({ isDirty: false });
    expect(inspection.expressions[0]?.decidingBranch).toBe("isDirty");
    expect(inspection.expressions[0]?.conditionEvaluation?.children?.[1]).toMatchObject({
      expression: "isPublishing",
      evaluated: false,
      shortCircuited: true,
    });
  });

  it("uses the captured function result to choose the real conditional-render branch", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_function_condition",
        nodeId: "cs_node_function_condition",
        kind: "children",
        property: "children",
        expression: "checkPermission() ? <Allowed /> : <Denied />",
        source,
        condition: {
          id: "cs_condition_function",
          type: "call",
          expression: "checkPermission()",
          inputName: "checkPermission()",
        },
        conditionalRender: {
          kind: "conditional",
          conditionExpression: "checkPermission()",
          renderedBranch: "Allowed",
          alternateBranch: "Denied",
        },
      },
      evaluate: (capture) => capture("checkPermission()", false) ? { branch: "Allowed" } : { branch: "Denied" },
    });
    const inspection = runtime.inspectElement({
      tagName: "SECTION",
      textContent: "Denied",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_function_condition" : null,
    } as unknown as Element);

    expect(inspection.expressions[0]?.conditionEvaluation).toMatchObject({ evaluated: true, value: false });
    expect(inspection.expressions[0]?.conditionalRenderResult).toMatchObject({
      outcome: "alternate",
      skippedBranch: "Allowed",
    });
  });

  it("shows current Fiber props, one-level callsites, and direct prop origins", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceProp({
      metadata: {
        id: "cs_prop_amount",
        componentName: "Price",
        parentComponentName: "Product",
        property: "amount",
        expression: "product.price",
        source: { file: "src/Product.tsx", line: 20, column: 15 },
      },
      value: 42,
    });
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_amount",
        nodeId: "cs_node_amount",
        kind: "children",
        property: "children",
        expression: "amount",
        source,
      },
      evaluate: (capture) => capture("amount", 42, undefined, {
        origin: {
          id: "cs_origin_prop",
          kind: "prop",
          confidence: "confirmed",
          label: "Price.props",
          path: "amount",
        },
      }),
    });
    runtime.setReactAdapter({
      findFiberFromElement: () => ({}),
      getParentFiber: () => null,
      getComponentName: () => "Price",
      getCurrentProps: () => ({ children: 42 }),
      getComponentStack: () => ["Price", "Product"],
      getComponentFrames: () => [{ componentName: "Price", props: { amount: 42 } }],
    });
    const inspection = runtime.inspectElement({
      tagName: "STRONG",
      textContent: "42",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_amount" : null,
    } as unknown as Element);

    expect(inspection.props[0]).toMatchObject({
      name: "amount",
      value: 42,
      passedFrom: { expression: "product.price", source: { file: "src/Product.tsx", line: 20 } },
    });
    expect(inspection.origins[0]).toMatchObject({
      kind: "prop",
      path: "amount",
      source: { file: "src/Product.tsx", line: 20 },
    });
  });

  it("matches a prop callsite by exact value identity instead of the latest component-wide pass", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const firstProduct = { price: 24 };
    const secondProduct = { price: 48 };
    runtime.traceProp({
      metadata: {
        id: "cs_prop_first",
        componentName: "Price",
        parentComponentName: "FirstProduct",
        property: "product",
        expression: "firstProduct",
        source: { file: "src/FirstProduct.tsx", line: 10, column: 8 },
      },
      value: firstProduct,
    });
    runtime.traceProp({
      metadata: {
        id: "cs_prop_second",
        componentName: "Price",
        parentComponentName: "SecondProduct",
        property: "product",
        expression: "secondProduct",
        source: { file: "src/SecondProduct.tsx", line: 20, column: 8 },
      },
      value: secondProduct,
    });
    runtime.setReactAdapter({
      findFiberFromElement: () => ({}),
      getParentFiber: () => null,
      getComponentName: () => "Price",
      getCurrentProps: () => ({ children: "$24" }),
      getComponentStack: () => ["Price"],
      getComponentFrames: () => [{ componentName: "Price", props: { product: firstProduct } }],
    });

    const inspection = runtime.inspectElement({
      tagName: "STRONG",
      textContent: "$24",
      getAttribute: () => null,
    } as unknown as Element);

    expect(inspection.props[0]?.passedFrom).toMatchObject({
      parentComponentName: "FirstProduct",
      source: { file: "src/FirstProduct.tsx", line: 10 },
    });
  });

  it("retains every value passed through one repeated component callsite", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const firstOrder = { id: "CS-1" };
    const secondOrder = { id: "CS-2" };
    const metadata = {
      id: "cs_prop_repeated_order",
      componentName: "OrderRow",
      parentComponentName: "OrdersPage",
      property: "order",
      expression: "order",
      source: { file: "src/pages/OrdersPage.tsx", line: 43, column: 51 },
    };
    runtime.traceProp({ metadata, value: firstOrder });
    runtime.traceProp({ metadata, value: secondOrder });
    runtime.setReactAdapter({
      findFiberFromElement: () => ({}),
      getParentFiber: () => null,
      getComponentName: () => "OrderRow",
      getCurrentProps: () => ({ children: "CS-1" }),
      getComponentStack: () => ["OrderRow", "OrdersPage"],
      getComponentFrames: () => [{ componentName: "OrderRow", props: { order: firstOrder } }],
    });

    const inspection = runtime.inspectElement({
      tagName: "STRONG",
      textContent: "CS-1",
      getAttribute: () => null,
    } as unknown as Element);

    expect(inspection.props[0]?.passedFrom).toMatchObject({
      parentComponentName: "OrdersPage",
      source: { file: "src/pages/OrdersPage.tsx", line: 43, column: 51 },
    });
  });

  it("preserves recursive network-style origin paths for member values", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const response = { data: { product: { price: 129 } } };
    runtime.registerValueOrigin(response, {
      kind: "network",
      confidence: "confirmed",
      label: "GET /api/products/42",
      path: "response",
      traceId: "cs_network_1",
    }, true);
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_price",
        nodeId: "cs_node_price",
        kind: "children",
        property: "children",
        expression: "product.price",
        source,
      },
      evaluate: (capture) => capture("product.price", response.data.product.price, undefined, {
        originValue: response.data.product,
        accessPath: "price",
      }),
    });
    const inspection = runtime.inspectElement({
      tagName: "STRONG",
      textContent: "129",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_price" : null,
    } as unknown as Element);

    expect(inspection.origins).toEqual([expect.objectContaining({
      kind: "network",
      path: "response.data.product.price",
      traceId: "cs_network_1",
    })]);
  });

  it("redacts sensitive runtime values before returning an inspector view", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_inspector_secret",
        nodeId: "cs_node_inspector_secret",
        kind: "children",
        property: "children",
        expression: "account.apiKey",
        source,
      },
      evaluate: (capture) => capture("apiKey", "top-secret", undefined, {
        origin: {
          id: "cs_origin_inspector_secret",
          kind: "react-query",
          confidence: "confirmed",
          label: "React Query",
          metadata: { apiKey: "origin-secret", status: "success" },
        },
      }),
    });
    runtime.recordEvent({
      type: "click",
      label: 'click span "top-secret"',
      timestamp: 1,
      metadata: { targetNodeId: "cs_node_inspector_secret", apiKey: "timeline-secret" },
    });

    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "top-secret",
      getAttributeNames: () => ["data-causescope-node", "value", "href"],
      getAttribute: (name: string) => ({
        "data-causescope-node": "cs_node_inspector_secret",
        value: "top-secret",
        href: "/callback?access_token=attribute-secret#fragment-secret",
      })[name] ?? null,
    } as unknown as Element);

    expect(inspection.element.label).toBe("[REDACTED]");
    expect(inspection.element.attributes.value).toBe("[REDACTED]");
    expect(inspection.element.attributes.href).not.toMatch(/attribute-secret|fragment-secret/);
    expect(inspection.expressions[0]?.result).toBe("[REDACTED]");
    expect(inspection.expressions[0]?.inputs.apiKey).toBe("[REDACTED]");
    expect(inspection.expressions[0]?.inputOrigins.apiKey?.[0]?.metadata?.apiKey).toBe("[REDACTED]");
    expect(inspection.timeline[0]?.label).not.toContain("top-secret");
    expect(inspection.timeline[0]?.metadata?.apiKey).toBe("[REDACTED]");
    expect(JSON.stringify(inspection)).not.toMatch(/top-secret|origin-secret|timeline-secret|attribute-secret|fragment-secret/);
  });

  it("redacts nested secrets copied into a derived string result", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const account = { password: "nested-secret", name: "Ada" };
    const rendered = JSON.stringify(account);
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_stringified_secret",
        nodeId: "cs_node_stringified_secret",
        kind: "children",
        property: "children",
        expression: "JSON.stringify(account)",
        source,
      },
      evaluate: (capture) => JSON.stringify(capture("account", account)),
    });

    const inspection = runtime.inspectElement({
      tagName: "PRE",
      textContent: rendered,
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_stringified_secret" : null,
    } as unknown as Element);

    expect(inspection.expressions[0]?.result).toBe('{"password":"[REDACTED]","name":"Ada"}');
    expect(inspection.expressions[0]?.inputs.account).toEqual({ password: "[REDACTED]", name: "Ada" });
    expect(inspection.element.label).not.toContain("nested-secret");
    expect(JSON.stringify(runtime.exportTrace(inspection))).not.toContain("nested-secret");
  });

  it("upgrades a shared object from non-sensitive to sensitive alias redaction", () => {
    const runtime = new CauseScopeRuntimeImpl();
    const shared = { value: "leaky-secret" };
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_sensitive_alias",
        nodeId: "cs_node_sensitive_alias",
        kind: "children",
        property: "children",
        expression: "account && userPassword && JSON.stringify(account)",
        source,
      },
      evaluate: (capture) => {
        const account = capture("account", shared);
        const userPassword = capture("userPassword", shared);
        return account && userPassword && JSON.stringify(account);
      },
    });

    const inspection = runtime.inspectElement({
      tagName: "PRE",
      textContent: JSON.stringify(shared),
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_sensitive_alias" : null,
    } as unknown as Element);

    expect(JSON.stringify(inspection)).not.toContain("leaky-secret");
    expect(JSON.stringify(runtime.exportTrace(inspection))).not.toContain("leaky-secret");
  });

  it("redacts sensitive React Query tuple keys in the inspector and exports", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_query_key_secret",
        nodeId: "cs_node_query_key_secret",
        kind: "children",
        property: "children",
        expression: "profile.name",
        source,
      },
      evaluate: (capture) => capture("profile.name", "Ada", undefined, {
        origin: {
          id: "cs_origin_query_key_secret",
          kind: "react-query",
          confidence: "confirmed",
          label: "React Query",
          path: "data.name",
          traceId: "react-query:safe-id",
          metadata: {
            queryKey: [
              "profile",
              "token",
              "super-secret-token",
              { password: "object-secret" },
              ["access_token", "nested-secret"],
            ],
            status: "success",
          },
        },
      }),
    });

    const inspection = runtime.inspectElement({
      tagName: "H2",
      textContent: "Ada",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_query_key_secret" : null,
    } as unknown as Element);

    expect(inspection.origins[0]?.metadata?.queryKey).toEqual([
      "profile",
      "token",
      "[REDACTED]",
      { password: "[REDACTED]" },
      ["access_token", "[REDACTED]"],
    ]);
    expect(JSON.stringify(inspection)).not.toMatch(/super-secret-token|object-secret|nested-secret/);
    expect(JSON.stringify(runtime.exportTrace(inspection))).not.toMatch(/super-secret-token|object-secret|nested-secret/);
  });

  it("redacts sensitive values again when exporting a trace", () => {
    const runtime = new CauseScopeRuntimeImpl();
    runtime.traceExpression({
      metadata: {
        id: "cs_expr_secret",
        nodeId: "cs_node_secret",
        kind: "children",
        property: "children",
        expression: "account.password",
        source,
        condition: {
          id: "cs_condition_secret",
          type: "member",
          expression: "account.password",
          inputName: "password",
        },
      },
      evaluate: (capture) => capture("password", "not-for-export", undefined, {
        origin: {
          id: "cs_origin_secret",
          kind: "react-query",
          confidence: "confirmed",
          label: "React Query",
          metadata: { token: "origin-token", status: "success" },
        },
      }),
    });
    runtime.recordEvent({
      type: "click",
      label: 'click span "not-for-export"',
      timestamp: 1,
      metadata: { targetNodeId: "cs_node_secret", password: "timeline-secret" },
    });
    const inspection = runtime.inspectElement({
      tagName: "SPAN",
      textContent: "not-for-export",
      getAttribute: (name: string) => name === "data-causescope-node" ? "cs_node_secret" : null,
    } as unknown as Element);
    inspection.stateUpdates.push({
      id: "cs_state_secret_update",
      stateId: "cs_state_secret",
      stateName: "password",
      previous: "previous-secret",
      next: "not-for-export",
      source,
      event: {
        type: "input",
        targetNodeId: "cs_node_secret",
        targetLabel: 'input "not-for-export"',
        handlerExpression: "updatePassword",
        source,
        timestamp: 1,
      },
      timestamp: 1,
      updateType: "value",
    });
    const exported = runtime.exportTrace(inspection);

    expect(exported.expressions[0]?.inputs.password).toEqual({ type: "primitive", value: "[REDACTED]" });
    expect(exported.expressions[0]?.result).toEqual({ type: "primitive", value: "[REDACTED]" });
    expect(exported.expressions[0]?.conditionEvaluation?.value).toEqual({ type: "primitive", value: "[REDACTED]" });
    expect(exported.expressions[0]?.inputOrigins.password?.[0]?.metadata?.token).toEqual({ type: "primitive", value: "[REDACTED]" });
    expect(exported.timeline[0]?.metadata?.password).toEqual({ type: "primitive", value: "[REDACTED]" });
    expect(exported.element.label).toBe("[REDACTED]");
    expect(exported.timeline[0]?.label).toBe('click span "[REDACTED]"');
    expect(exported.stateChanges[0]?.event?.targetLabel).toBe('input "[REDACTED]"');
    expect(JSON.stringify(exported)).not.toMatch(/not-for-export|origin-token|timeline-secret/);
    const markdown = runtime.formatTraceMarkdown(inspection);
    expect(markdown).toContain("# CauseScope Trace");
    expect(markdown).toContain("[REDACTED]");
    expect(markdown).not.toContain("not-for-export");
  });
});
