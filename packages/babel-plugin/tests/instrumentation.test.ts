import { transformSync } from "@babel/core";
import { describe, expect, it } from "vitest";
import causeScopeBabelPlugin from "../src/index";

function transform(source: string): string {
  const result = transformSync(source, {
    filename: "/workspace/src/ProductEditor.tsx",
    babelrc: false,
    configFile: false,
    parserOpts: {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    },
    plugins: [[causeScopeBabelPlugin, { root: "/workspace" }]],
  });
  return result?.code ?? "";
}

describe("CauseScope Babel instrumentation", () => {
  it("instruments a TSX host element, disabled expression, and bound useState setter", () => {
    const output = transform(`
      import { useState } from 'react';

      export function ProductEditor(): JSX.Element {
        const [isDirty, setIsDirty] = useState(false);
        return (
          <button disabled={!isDirty} onClick={() => setIsDirty(false)}>
            Publish
          </button>
        );
      }
    `);

    expect(output).toContain('from "virtual:causescope-runtime"');
    expect(output).toContain('data-causescope-node="cs_node_');
    expect(output).toContain('data-causescope-component="ProductEditor"');
    expect(output).toContain(".traceExpression");
    expect(output).toContain(".registerState");
    expect(output).toContain("currentValue: isDirty");
    expect(output).toContain("setter: setIsDirty");
    expect(output).toContain(".setState");
    expect(output).toMatch(/causeScopeCapture\d*\("isDirty", isDirty, "cs_state_/);
    expect(output).toMatchSnapshot();
  });

  it("instruments generic JSX attributes and child expressions without inventing disabled", () => {
    const output = transform(`
      export function ProductTitle({ title, tone }: { title: string; tone?: string }) {
        return <span className={tone ?? 'default'}>{title}</span>;
      }
    `);

    expect(output.match(/\.traceExpression/g) ?? []).toHaveLength(2);
    expect(output).toContain('kind: "attribute"');
    expect(output).toContain('property: "className"');
    expect(output).toContain('kind: "children"');
    expect(output).toContain('property: "children"');
    expect(output).not.toContain('property: "disabled"');
    expect(output).not.toContain("data-causescope-expression");
  });

  it("carries a local derived condition into the selected JSX expression without evaluating it twice", () => {
    const output = transform(`
      import { useState } from 'react';

      interface Order { status: 'paid' | 'pending' }

      export function RefundAction() {
        const [order] = useState<Order>({ status: 'pending' });
        const canRefund = order.status === "paid";
        return <button disabled={!canRefund}>Refund order</button>;
      }
    `);

    expect(output).toContain(".traceDerived");
    expect(output).toMatch(/derived: _canRefundDerivation\d*/);
    expect(output).toMatch(/causeScopeDerivedCapture\d*\("cs_derived_[^".]+:order\.status"[\s\S]*"order\.status"[\s\S]*=== ["']paid["']/);
    expect(output).toContain("condition:");
    expect(output).toContain('expression: "canRefund"');
    expect(output).toContain('expression: "order.status === \\"paid\\""');
    expect(() => transformSync(output, {
      filename: "/workspace/src/CompiledRefundAction.tsx",
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
    })).not.toThrow();
  });

  it("keeps await and yield derived initializers in their original function context", () => {
    const asyncOutput = transform(`
      declare function fetchStatus(): Promise<string>;
      export async function AsyncGate() {
        const paid = (await fetchStatus()) === "paid";
        return <button disabled={!paid}>Refund</button>;
      }
    `);
    const generatorOutput = transform(`
      export function* GeneratorGate() {
        const paid = (yield "pending") === "paid";
        return <button disabled={!paid}>Refund</button>;
      }
    `);

    expect(asyncOutput).not.toContain(".traceDerived");
    expect(generatorOutput).not.toContain(".traceDerived");
    for (const output of [asyncOutput, generatorOutput]) {
      expect(() => transformSync(output, {
        filename: "/workspace/src/CompiledAsyncGate.tsx",
        babelrc: false,
        configFile: false,
        parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
      })).not.toThrow();
    }
  });

  it("does not create an unused derivation for a custom component prop boundary", () => {
    const output = transform(`
      function RefundButton({ disabled }: { disabled: boolean }) {
        return <button disabled={disabled}>Refund</button>;
      }
      export function RefundGate({ order }: { order: { status: string } }) {
        const canRefund = order.status === "paid";
        return <RefundButton disabled={!canRefund} />;
      }
    `);

    expect(output).toContain(".traceProp");
    expect(output).not.toContain(".traceDerived");
  });

  it("bounds derived dependency expansion instead of duplicating a DAG exponentially", () => {
    const declarations = ["const d0 = seed === 'ok';"];
    for (let index = 1; index <= 12; index += 1) {
      declarations.push(`const d${index} = d${index - 1} && d${index - 1};`);
    }
    const output = transform(`
      export function DeepGate({ seed }: { seed: string }) {
        ${declarations.join("\n")}
        return <button disabled={!d12}>Continue</button>;
      }
    `);

    expect(output.match(/\.traceDerived/g) ?? []).toHaveLength(13);
    expect(output.length).toBeLessThan(300_000);
  });

  it("assigns occurrence-specific keys to repeated derived reads", () => {
    const output = transform(`
      export function GetterGate({ record }: { record: { readonly ready: boolean } }) {
        const ready = record.ready && record.ready;
        return <button disabled={!ready}>Continue</button>;
      }
    `);
    const keys = [...output.matchAll(/causeScopeDerivedCapture\d*\("(cs_derived_[^"]+:record\.ready)"/g)]
      .map((match) => match[1]);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("leaves TypeScript qualified names untouched while tracing runtime values", () => {
    const output = transform(`
      import * as React from 'react';

      export function Sidebar({ style }: React.ComponentProps<'div'>) {
        return (
          <div
            data-react-version={React.version}
            style={{ '--sidebar-width': '16rem', ...style } as React.CSSProperties}
          />
        );
      }
    `);

    expect(output).toContain("React.ComponentProps<'div'>");
    expect(output).toContain("as React.CSSProperties");
    expect(output).toMatch(/causeScopeCapture\d*\("React\.version"/);
    expect(output).toMatch(/causeScopeCapture\d*\("style", style,/);
    expect(() => transformSync(output, {
      filename: "/workspace/src/CompiledSidebar.tsx",
      babelrc: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      },
    })).not.toThrow();
  });

  it("keeps static JSX nodes factual and leaves key and ref untouched", () => {
    const output = transform(`
      export function Badge({ id, reference }: { id: string; reference: { current: HTMLSpanElement | null } }) {
        return <span key={id} ref={reference}>Draft</span>;
      }
    `);

    expect(output).not.toContain(".traceExpression");
    expect(output).not.toContain('property: "disabled"');
    expect(output).toContain("key={id}");
    expect(output).toContain("ref={reference}");
    expect(output).toContain('data-causescope-source={"<span key={id} ref={reference}>Draft</span>"}');
  });

  it("records an event-handler attribute without evaluating or capturing its body during render", () => {
    const output = transform(`
      import { useState } from 'react';
      export function Counter() {
        const [count, setCount] = useState(0);
        return <button onClick={(event) => setCount(count + event.detail)}>{count}</button>;
      }
    `);

    expect(output).toContain('property: "onClick"');
    expect(output).toContain(".setState");
    expect(output).not.toMatch(/causeScopeCapture\d*\("event", event\)/);
    expect(output).toContain('property: "children"');
  });

  it("traces JSX spread attributes as one semantics-preserving value", () => {
    const output = transform(`
      export function Action({ buttonProps }: { buttonProps: { disabled?: boolean; title?: string } }) {
        return <button {...buttonProps}>Run</button>;
      }
    `);

    expect(output).toContain('kind: "spread"');
    expect(output).toContain('property: "spread"');
    expect(output).toMatch(/\.traceExpression\(\{/);
    expect(output).toContain('evaluate: _causeScopeCapture');
  });

  it("only authorizes repeated-instance host-prop binding when no spread or duplicate can override it", () => {
    const output = transform(`
      export function AttributeOwners({ title, props }: { title: string; props: { title?: string } }) {
        return (
          <div>
            <button title={title}>Safe</button>
            <button title={title} {...props}>Spread override</button>
            <button title={title} title="Static override">Static override</button>
          </div>
        );
      }
    `);

    expect(output.match(/instanceBinding: "host-prop"/g) ?? []).toHaveLength(1);
  });

  it("keeps await and yield in their original function context", () => {
    const asyncOutput = transform(`
      export async function AsyncTitle({ title }: { title: Promise<string> }) {
        return <div title={await title}>Async</div>;
      }
    `);
    const generatorOutput = transform(`
      export function* GeneratorTitle() {
        return <div title={yield 'next'}>Generator</div>;
      }
    `);

    expect(asyncOutput).toContain(".traceValue");
    expect(asyncOutput).toContain("value: await title");
    expect(generatorOutput).toContain(".traceValue");
    expect(generatorOutput).toContain("value: yield 'next'");
    for (const output of [asyncOutput, generatorOutput]) {
      expect(() => transformSync(output, {
        filename: "/workspace/src/CompiledProductEditor.tsx",
        babelrc: false,
        configFile: false,
        parserOpts: {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
        },
      })).not.toThrow();
    }
  });

  it("does not rewrite a shadowed function parameter with the same setter name", () => {
    const output = transform(`
      import { useState } from 'react';
      export function ProductEditor() {
        const [isDirty, setIsDirty] = useState(false);
        const run = (setIsDirty: (value: boolean) => void) => setIsDirty(true);
        return <button disabled={!isDirty} onClick={() => run(setIsDirty)}>Publish</button>;
      }
    `);

    expect(output.match(/\.setState/g) ?? []).toHaveLength(0);
  });

  it("does not eagerly read an unbound identifier from a short-circuited branch", () => {
    const output = transform(`
      export function ProductEditor() {
        return <button disabled={false && missing}>Publish</button>;
      }
    `);

    expect(output).toMatch(/evaluate: _causeScopeCapture\d* => false && _causeScopeCapture\d*\("missing", missing\)/);
    expect(output).not.toContain("inputs:");
  });

  it("does not eagerly read a later lexical binding from a short-circuited branch", () => {
    const output = transform(`
      export function ProductEditor() {
        const button = <button disabled={false && later}>Publish</button>;
        const later = true;
        return button;
      }
    `);

    expect(output).toMatch(/evaluate: _causeScopeCapture\d* => false && _causeScopeCapture\d*\("later", later\)/);
    expect(output).not.toContain("inputs:");
  });

  it("captures an operand only where it is evaluated", () => {
    const output = transform(`
      export function ProductEditor() {
        let isDirty = false;
        const mutate = () => { isDirty = true; return true; };
        return <button disabled={mutate() && isDirty}>Publish</button>;
      }
    `);

    expect(output).toMatch(/_causeScopeCapture\d*\("mutate\(\)", mutate\(\)\) && _causeScopeCapture\d*\("isDirty", isDirty\)/);
  });

  it("tracks the imported useState binding rather than a shadowed name", () => {
    const output = transform(`
      import { useState } from 'react';
      function helper(useState: () => [boolean, (value: boolean) => void]) {
        const [value, setValue] = useState();
        setValue(true);
        return value;
      }
      export function ProductEditor() {
        const [isDirty, setIsDirty] = useState(false);
        return <button disabled={!isDirty} onClick={() => setIsDirty(true)}>Publish</button>;
      }
    `);

    expect(output.match(/\.setState/g) ?? []).toHaveLength(1);
    expect(output.match(/\.registerState/g) ?? []).toHaveLength(1);
  });

  it("finds an aliased hook setter before normal traversal reaches its declarator", () => {
    const output = transform(`
      import { useState as useLocalState } from 'react';
      export function ProductEditor() {
        const markDirty = () => setIsDirty(true);
        const [isDirty, setIsDirty] = useLocalState(false);
        return <button disabled={!isDirty} onClick={markDirty}>Publish</button>;
      }
    `);

    expect(output.match(/\.setState/g) ?? []).toHaveLength(1);
    expect(output.match(/\.registerState/g) ?? []).toHaveLength(1);
  });

  it("generates a collision-free runtime binding", () => {
    const output = transform(`
      const __cs = 'application value';
      export function ProductEditor() {
        const isDirty = false;
        return <button disabled={!isDirty} data-owner={__cs}>Publish</button>;
      }
    `);

    expect(output).toContain("const __cs = 'application value'");
    expect(output).toMatch(/import \{ __cs as _causeScopeRuntime\d* \}/);
  });

  it("keeps its generated runtime binding valid when the source already imports the virtual module", () => {
    const output = transform(`
      import { __cs as applicationRuntime } from 'virtual:causescope-runtime';
      export function ProductEditor() {
        const isDirty = false;
        return <button disabled={!isDirty} data-runtime={applicationRuntime}>Publish</button>;
      }
    `);

    expect(output.match(/from ['"]virtual:causescope-runtime['"]/g) ?? []).toHaveLength(2);
    expect(output).toMatch(/import \{ __cs as _causeScopeRuntime\d* \}/);
    expect(output).toMatch(/_causeScopeRuntime\d*\.traceExpression/);
  });

  it("preserves update-expression lvalues and emits compilable TSX", () => {
    const output = transform(`
      export function ProductEditor() {
        let count = 0;
        return (
          <div>
            <button disabled={count++ > 0}>Postfix</button>
            <button disabled={++count > 0}>Prefix</button>
          </div>
        );
      }
    `);

    expect(output).toContain("count++ > 0");
    expect(output).toContain("++count > 0");
    expect(output).not.toMatch(/causeScopeCapture\d*\("count", count\)/);
    expect(() => transformSync(output, {
      filename: "/workspace/src/CompiledProductEditor.tsx",
      babelrc: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      },
    })).not.toThrow();
  });

  it("preserves loop and destructuring assignment targets", () => {
    const output = transform(`
      export function ProductEditor() {
        let count = 0;
        const items = [1];
        const record = { first: 1 };
        return (
          <button disabled={(() => {
            for (count of items) {}
            for (count in record) {}
            [count] = items;
            return count > 0;
          })()}>
            Publish
          </button>
        );
      }
    `);

    expect(output).toContain("for (count of");
    expect(output).toContain("for (count in");
    expect(output).toContain("[count] =");
    expect(() => transformSync(output, {
      filename: "/workspace/src/CompiledProductEditor.tsx",
      babelrc: false,
      configFile: false,
      parserOpts: {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      },
    })).not.toThrow();
  });

  it("registers useReducer and traces dispatch without evaluating the reducer twice", () => {
    const output = transform(`
      import { useReducer as useLocalReducer } from 'react';
      function reducer(state: number, action: { type: 'increment' }) { return state + 1; }
      export function Counter() {
        const [count, dispatch] = useLocalReducer(reducer, 0);
        return <button onClick={() => dispatch({ type: 'increment' })}>{count}</button>;
      }
    `);

    expect(output).toContain('hookType: "reducer"');
    expect(output).toContain(".dispatchReducer");
    expect(output).toContain("dispatch: dispatch");
    expect(output).toContain("action: {");
    expect(output).not.toContain(".setState({\n      stateId");
  });

  it("does not instrument a shadowed useReducer binding", () => {
    const output = transform(`
      import { useReducer } from 'react';
      function helper(useReducer: () => [number, (action: string) => void]) {
        const [value, dispatch] = useReducer();
        dispatch('next');
        return value;
      }
      export function Counter() {
        const [count, dispatch] = useReducer((state: number) => state + 1, 0);
        return <button onClick={() => dispatch('next')}>{count}</button>;
      }
    `);

    expect(output.match(/\.dispatchReducer/g) ?? []).toHaveLength(1);
    expect(output.match(/hookType: "reducer"/g) ?? []).toHaveLength(1);
  });

  it("records one-level component prop callsites and direct prop origins", () => {
    const output = transform(`
      function Price({ amount }: { amount: number }) {
        return <strong>{amount}</strong>;
      }
      export function Product({ product }: { product: { price: number } }) {
        return <Price amount={product.price} />;
      }
    `);

    expect(output).toContain(".traceProp");
    expect(output).toContain('componentName: "Price"');
    expect(output).toContain('parentComponentName: "Product"');
    expect(output).toContain('property: "amount"');
    expect(output).toContain('kind: "prop"');
    expect(output).toContain('label: "Price.props"');
  });

  it("keeps local and session storage bindings distinct when primitive values are equal", () => {
    const output = transform(`
      export function Preferences() {
        const theme = localStorage.getItem('causescope-theme');
        const workspace = sessionStorage.getItem('causescope-workspace');
        return <section><h2>{theme ?? 'dark'}</h2><p>{workspace ?? 'primary'}</p></section>;
      }
    `);

    expect(output).toContain('kind: "storage"');
    expect(output).toContain('label: "localStorage"');
    expect(output).toContain('path: "causescope-theme"');
    expect(output).toContain('label: "sessionStorage"');
    expect(output).toContain('path: "causescope-workspace"');
  });

  it("emits a short-circuit condition tree and captures a member value once", () => {
    const output = transform(`
      export function Action({ state }: { state: { dirty: boolean; publishing: boolean } }) {
        return <button disabled={!state.dirty || state.publishing}>Publish</button>;
      }
    `);

    expect(output).toContain('type: "logical"');
    expect(output).toContain('operator: "||"');
    expect(output).toContain('expression: "state.dirty"');
    expect(output.match(/causeScopeCapture\d*\("state\.dirty", _stateOrigin\d*\.dirty/g) ?? []).toHaveLength(1);
    expect(output.match(/causeScopeCapture\d*\("state\.publishing", _stateOrigin\d*\.publishing/g) ?? []).toHaveLength(1);
  });

  it("records hidden logical and ternary JSX branches on their parent element", () => {
    const output = transform(`
      export function Gate({ ready, pro }: { ready: boolean; pro: boolean }) {
        return <section>{ready && <aside>Ready</aside>}{pro ? <strong>Pro</strong> : <span>Free</span>}</section>;
      }
    `);

    expect(output.match(/conditionalRender:/g) ?? []).toHaveLength(2);
    expect(output).toContain('renderedBranch: "aside"');
    expect(output).toContain('renderedBranch: "strong"');
    expect(output).toContain('alternateBranch: "span"');
  });

  it("keeps optional chaining and nullish coalescing semantics inside the traced expression", () => {
    const output = transform(`
      export function Label({ product }: { product?: { name?: string } }) {
        return <span>{product?.name ?? 'Unavailable'}</span>;
      }
    `);

    expect(output).toContain('operator: "??"');
    expect(output).toContain("product?.name");
    expect(() => transformSync(output, {
      filename: "/workspace/src/CompiledProductEditor.tsx",
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
    })).not.toThrow();
  });

  it("captures a condition call result once so ternary branch evaluation has the real test value", () => {
    const output = transform(`
      export function Gate({ checkPermission }: { checkPermission: () => boolean }) {
        return <section>{checkPermission() ? <strong>Allowed</strong> : <span>Denied</span>}</section>;
      }
    `);

    expect(output).toMatch(/causeScopeCapture\d*\("checkPermission\(\)", checkPermission\(\)\)/);
    expect(output.match(/checkPermission\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(output).toContain('inputName: "checkPermission()"');
  });

  it("evaluates a member root once while retaining the root object for provenance", () => {
    const output = transform(`
      export function Price({ product }: { product: { price: number } }) {
        return <strong>{product.price}</strong>;
      }
    `);

    expect(output).toMatch(/\(_productOrigin\d* => _causeScopeCapture\d*\("product\.price", _productOrigin\d*\.price,[\s\S]*originValue: _productOrigin\d*/);
    expect(output).toMatch(/\)\(product\)/);
  });

  it("does not wrap delete targets or tagged-template member tags", () => {
    const output = transform(`
      export function Semantics({ record, formatter }: {
        record: { temporary?: string };
        formatter: { tag(strings: TemplateStringsArray): string };
      }) {
        return <div data-deleted={delete record.temporary}>{formatter.tag\`value\`}</div>;
      }
    `);

    expect(output).not.toMatch(/causeScopeCapture\d*\("record\.temporary"/);
    expect(output).not.toMatch(/causeScopeCapture\d*\("formatter\.tag"/);
    expect(output).toContain("delete");
    expect(output).toContain("`value`");
  });

  it("registers hooks called through React default and namespace imports", () => {
    const output = transform(`
      import React from 'react';
      import * as ReactNamespace from 'react';
      function reducer(state: number) { return state + 1; }
      export function NamespaceHooks() {
        const [count, setCount] = React.useState(0);
        const [reduced, dispatch] = ReactNamespace.useReducer(reducer, 0);
        return <button onClick={() => { setCount(count + 1); dispatch(); }}>{count + reduced}</button>;
      }
    `);

    expect(output.match(/\.registerState/g) ?? []).toHaveLength(2);
    expect(output).toContain('hookType: "state"');
    expect(output).toContain('hookType: "reducer"');
    expect(output).toContain(".setState");
    expect(output).toContain(".dispatchReducer");
  });
});

describe("destructured alias provenance", () => {
  it("gives a destructured primitive the access path a direct member read would have had", () => {
    const output = transform(`
      export function RefundPage({ order }): JSX.Element {
        const { status } = order;
        return <button disabled={status !== "paid"}>Refund order</button>;
      }
    `);

    expect(output).toContain('accessPath: "status"');
    expect(output).toContain("originValue: order");
  });

  it("resolves a chained destructure back to the response root", () => {
    const output = transform(`
      export function RefundPage({ response }): JSX.Element {
        const { data } = response;
        const { order } = data;
        const { status } = order;
        return <span>{status}</span>;
      }
    `);

    expect(output).toContain('accessPath: "data.order.status"');
    expect(output).toContain("originValue: response");
  });

  it("carries the path through renamed, defaulted, and array destructuring", () => {
    const renamed = transform(`
      export function A({ order }): JSX.Element {
        const { status: current } = order;
        return <span>{current}</span>;
      }
    `);
    expect(renamed).toContain('accessPath: "status"');

    const defaulted = transform(`
      export function B({ order }): JSX.Element {
        const { status = "pending" } = order;
        return <span>{status}</span>;
      }
    `);
    expect(defaulted).toContain('accessPath: "status"');

    const indexed = transform(`
      export function C({ payload }): JSX.Element {
        const [first] = payload.items;
        return <span>{first}</span>;
      }
    `);
    expect(indexed).toContain('accessPath: "items[0]"');
  });

  it("refuses to emit a path when the root can be reassigned", () => {
    const output = transform(`
      export function D({ initial }): JSX.Element {
        let order = initial;
        const { status } = order;
        order = { status: "other" };
        return <span>{status}</span>;
      }
    `);

    expect(output).not.toContain('accessPath: "status"');
  });
});

describe("dynamic computed access provenance", () => {
  it("keeps the access path when the key is only known at render time", () => {
    const output = transform(`
      export function Cell({ row, columnId }): JSX.Element {
        return <td>{row[columnId]}</td>;
      }
    `);

    expect(output).toContain("originValue: _rowOrigin");
    expect(output).toContain('typeof _causeScopeKey === "number"');
    expect(output).toContain('JSON.stringify(String(_causeScopeKey))');
  });

  it("evaluates a dynamic key exactly once", () => {
    const output = transform(`
      export function Cell({ row, nextKey }): JSX.Element {
        return <td>{row[nextKey()]}</td>;
      }
    `);

    // The call is hoisted into the argument list, and both the member read and
    // the access path consume the parameter, so it cannot be invoked twice.
    // Textual occurrences elsewhere are string metadata, not evaluations.
    expect(output).toContain(")(row, nextKey())");
    expect(output).toContain("_rowOrigin[_causeScopeKey]");
    expect(output).not.toContain("_rowOrigin[nextKey()]");
  });

  it("joins dynamic and static segments into one path", () => {
    const output = transform(`
      export function Cell({ data, key }): JSX.Element {
        return <span>{data[key].status}</span>;
      }
    `);

    expect(output).toContain('+ ".status"');
    expect(output).toContain("originValue: _dataOrigin");
  });

  it("hoists every key of a multi-dimensional read in source order", () => {
    const output = transform(`
      export function Cell({ matrix, r, c }): JSX.Element {
        return <span>{matrix[r][c]}</span>;
      }
    `);

    expect(output).toContain("_causeScopeKey, _causeScopeKey2");
    expect(output).toContain(")(matrix, r, c)");
  });

  it("still emits a plain string path when no key is dynamic", () => {
    const output = transform(`
      export function Cell({ order }): JSX.Element {
        return <span>{order.items[0].name}</span>;
      }
    `);

    expect(output).toContain('accessPath: "items[0].name"');
    expect(output).not.toContain("_causeScopeKey");
  });
});
