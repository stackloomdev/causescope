import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type {
  ConditionEvaluation,
  EventContext,
  ExpressionResult,
  InspectionResult,
  NetworkTrace,
  CauseScopeRuntime,
  RuntimeEvent,
  SourceLocation,
  StateSnapshot,
  StateUpdate,
} from "@causescope/shared";
import { overlayStyles } from "./styles";

const HOST_ID = "causescope-overlay-root";
const TABS = ["Why", "Values", "State", "Network", "Timeline"] as const;
type Tab = (typeof TABS)[number];

interface HighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    const truncated = value.length > 160 ? `${value.slice(0, 157)}…` : value;
    return JSON.stringify(truncated);
  }
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return value.name ? `[function ${value.name}]` : "[function]";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.description ? `Symbol(${value.description})` : "Symbol()";
  if (Array.isArray(value)) return `[Array(${value.length})]`;
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? "[Invalid Date]" : value.toISOString();
  if (typeof value === "object") return "[Object]";
  return String(value);
}

function formatMetadataValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return formatValue(value);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
  } catch {
    return formatValue(value);
  }
}

function formatExpressionValue(expression: ExpressionResult): string {
  return expression.traceMode === "ambiguous-instance"
    ? "Unavailable for selected instance"
    : formatValue(expression.result);
}

function expressionKindLabel(expression: ExpressionResult): string {
  if (expression.kind === "children") return "JSX child";
  if (expression.kind === "spread") return "JSX spread attribute";
  return "JSX attribute";
}

function findCallBoundary(node: ConditionEvaluation | undefined): ConditionEvaluation | undefined {
  if (!node) return undefined;
  if (node.type === "call") return node;
  for (const child of node.children ?? []) {
    const boundary = findCallBoundary(child);
    if (boundary) return boundary;
  }
  return undefined;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function isOverlayTarget(target: EventTarget | null, host: HTMLElement): boolean {
  return target === host || (target instanceof Node && host.contains(target));
}

function resolveInspectableTarget(target: EventTarget | null, host: HTMLElement): Element | null {
  if (!(target instanceof Element) || isOverlayTarget(target, host)) return null;
  return target.closest("[data-causescope-node]") ?? target;
}

function targetLabel(target: Element): string {
  const text = target.textContent?.replace(/\s+/g, " ").trim();
  return text ? `${target.tagName.toLowerCase()} "${text.slice(0, 42)}"` : target.tagName.toLowerCase();
}

const EVENT_HANDLER_PROPERTIES: Record<string, string[]> = {
  beforeinput: ["onBeforeInput"],
  change: ["onChange"],
  click: ["onClick"],
  dblclick: ["onDoubleClick"],
  focusin: ["onFocus"],
  focusout: ["onBlur"],
  input: ["onInput", "onChange"],
  keydown: ["onKeyDown"],
  keyup: ["onKeyUp"],
  mousedown: ["onMouseDown"],
  mouseup: ["onMouseUp"],
  pointerdown: ["onPointerDown"],
  pointerup: ["onPointerUp"],
  reset: ["onReset"],
  submit: ["onSubmit"],
  touchend: ["onTouchEnd"],
  touchstart: ["onTouchStart"],
};

function findEventHandler(
  initialTarget: EventTarget | null,
  host: HTMLElement,
  runtime: CauseScopeRuntime,
  eventType: string,
): { target: Element; expression?: ExpressionResult } | null {
  const properties = EVENT_HANDLER_PROPERTIES[eventType] ?? [];
  let target = resolveInspectableTarget(initialTarget, host);
  while (target && !isOverlayTarget(target, host)) {
    if (properties.length > 0) {
      const expression = runtime.inspectElement(target).expressions.find((candidate) =>
        properties.includes(candidate.property),
      );
      if (expression) return { target, expression };
    }
    const parent = target.parentElement;
    if (!parent) break;
    target = parent.closest("[data-causescope-node]") ?? parent;
  }
  const fallback = resolveInspectableTarget(initialTarget, host);
  return fallback ? { target: fallback } : null;
}

function SourceCode({ inspection }: { inspection: InspectionResult }): JSX.Element {
  const source = inspection.source;
  const line = source?.line ?? 1;
  const tagName = inspection.element.tagName;
  const expressions = inspection.expressions;
  const isStatic = expressions.length === 0;

  return (
    <section class="cs-panel" aria-labelledby="cs-source-heading">
      <div class="cs-source-title">
        <h2 id="cs-source-heading">Source</h2>
        <span class="cs-mono">{source ? `${source.file}:${source.line}:${source.column}` : "Source unavailable"}</span>
      </div>
      {!isStatic ? <p class="cs-note">Element location and expressions come from compile-time metadata; unavailable source is never synthesized.</p> : null}
      <div class="cs-code" aria-label="Instrumented source expression">
        {isStatic ? (
          <div class="cs-code-row">
            <span class="cs-line-number">{line}</span>
            <span class="cs-code-text">{inspection.sourceSnippet ?? `<${tagName}>`}</span>
          </div>
        ) : expressions.map((expression) => {
          const inputs = Object.entries(expression.inputs);
          return (
            <div class="cs-code-expression" key={expression.id}>
              <div class="cs-code-row">
                <span class="cs-line-number">{expression.source.line}</span>
                <span class="cs-code-text">
                  {expression.kind === "children" ? (
                    <>&lt;{tagName}&gt;&#123;<span class="cs-code-mark">{expression.expression}</span>&#125;&lt;/{tagName}&gt;</>
                  ) : expression.kind === "spread" ? (
                    <>&lt;{tagName}&nbsp;&#123;...<span class="cs-code-mark">{expression.expression}</span>&#125;&gt;</>
                  ) : (
                    <>&lt;{tagName}&nbsp;<span class="cs-code-property">{expression.property}</span>=&#123;<span class="cs-code-mark">{expression.expression}</span>&#125;&gt;</>
                  )}
                </span>
              </div>
              {inputs.length > 0 ? (
                <div class="cs-inline-values">
                  {inputs.map(([name, value]) => (
                    <span class="cs-inline-value" key={name}>
                      <b>{name}</b>
                      <span>{formatValue(value)}</span>
                    </span>
                  ))}
                  <span class="cs-inline-value">
                    <b>result</b>
                    <span>{formatExpressionValue(expression)}</span>
                  </span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DomFacts({ inspection }: { inspection: InspectionResult }): JSX.Element {
  const attributes = Object.entries(inspection.element.attributes);
  return (
    <section class="cs-panel cs-facts" aria-labelledby="cs-facts-heading">
      <div class="cs-section-title">
        <h2 id="cs-facts-heading">Current DOM facts</h2>
        <span>browser observed</span>
      </div>
      <div class="cs-value-list">
        <div class="cs-value-row"><span>element</span><code>&lt;{inspection.element.tagName}&gt;</code></div>
        <div class="cs-value-row"><span>text</span><code>{formatValue(inspection.element.label)}</code></div>
        {attributes.map(([name, value]) => (
          <div class="cs-value-row" key={name}><span>{name}</span><code>{value === "" ? "present" : formatValue(value)}</code></div>
        ))}
      </div>
    </section>
  );
}

function ExpressionCard({ expression }: { expression: ExpressionResult }): JSX.Element {
  const isBoolean = typeof expression.result === "boolean";
  const decisionLabel = expression.property === "disabled" && expression.result === true
    ? "Blocking branch"
    : "Deciding branch";
  const callBoundary = findCallBoundary(expression.conditionEvaluation);
  return (
    <article class="cs-result">
      <span class="cs-expression-kind">{expressionKindLabel(expression)}</span>
      <strong>{expression.property} = {formatExpressionValue(expression)}</strong>
      <span>Expression: <code>{expression.expression}</code></span>
      {isBoolean && expression.decidingBranch ? (
        <span>{decisionLabel}: <code>{expression.decidingBranch}</code></span>
      ) : null}
      {expression.traceMode === "result-only" ? (
        <span>Operands were not moved out of their async or generator context; only the result was recorded.</span>
      ) : null}
      {expression.traceMode === "selected-instance-result" ? (
        <span>Repeated JSX source: result confirmed from this element's React host props; operand values are intentionally omitted.</span>
      ) : null}
      {expression.traceMode === "ambiguous-instance" ? (
        <span>Repeated JSX source: CauseScope could not bind the latest source trace to this exact DOM instance.</span>
      ) : null}
      {callBoundary ? (
        <div class="cs-trace-boundary">
          <b>Trace boundary</b>
          <span><code>{callBoundary.expression}</code> ran once with its original JavaScript semantics. Internal function execution was not instrumented.</span>
        </div>
      ) : null}
    </article>
  );
}

function ConditionNode({ node, depth = 0 }: { node: ConditionEvaluation; depth?: number }): JSX.Element {
  return (
    <li
      class="cs-condition-node"
      data-evaluated={node.evaluated ? "true" : "false"}
      data-deciding={node.deciding ? "true" : "false"}
      style={{ "--cs-condition-depth": depth }}
    >
      <div>
        <code>{node.expression}</code>
        <span>{node.shortCircuited ? "Not evaluated · short-circuit" : node.evaluated ? formatValue(node.value) : "Not evaluated"}</span>
      </div>
      {node.children?.length ? (
        <ol>{node.children.map((child) => <ConditionNode node={child} depth={depth + 1} key={child.id} />)}</ol>
      ) : null}
    </li>
  );
}

function ConditionExplanation({ expression }: { expression: ExpressionResult }): JSX.Element | null {
  const condition = expression.conditionEvaluation;
  if (!condition || (typeof expression.result !== "boolean" && !expression.conditionalRenderResult)) return null;
  return (
    <section class="cs-condition-tree" aria-label={`Condition tree for ${expression.property}`}>
      <div class="cs-section-title">
        <h3>Condition evaluation</h3>
        <span>runtime order</span>
      </div>
      <ol><ConditionNode node={condition} /></ol>
    </section>
  );
}

function HiddenBranches({ expressions }: { expressions: ExpressionResult[] }): JSX.Element | null {
  const branches = expressions.flatMap((expression) => expression.conditionalRenderResult
    ? [{ expression, result: expression.conditionalRenderResult }]
    : []);
  if (branches.length === 0) return null;
  return (
    <section class="cs-panel cs-hidden-branches" aria-labelledby="cs-hidden-heading">
      <div class="cs-section-title">
        <h2 id="cs-hidden-heading">Conditional branches</h2>
        <span>{branches.length} traced</span>
      </div>
      {branches.map(({ expression, result }) => (
        <article class="cs-result" key={`${expression.id}:branch`}>
          <span class="cs-expression-kind">{result.outcome === "hidden" ? "Hidden branch" : "Rendered branch"}</span>
          <strong>{result.outcome === "hidden" ? `${result.skippedBranch ?? result.renderedBranch} was not rendered` : `${result.outcome} rendered`}</strong>
          <span>Condition: <code>{result.conditionExpression}</code></span>
          {result.failedCondition ? <span>Failed condition: <code>{result.failedCondition}</code></span> : null}
          {result.skippedBranch && result.outcome !== "hidden" ? <span>Skipped: <code>{result.skippedBranch}</code></span> : null}
        </article>
      ))}
    </section>
  );
}

function updateTrigger(update: StateUpdate): string {
  if (!update.event) return "No captured event";
  const event = [update.event.type, update.event.targetLabel].filter(Boolean).join(" · ");
  return update.event.handlerExpression ? `${event} → ${update.event.handlerExpression}` : event;
}

function StateProvenance({
  update,
  componentUpdate,
  hasRegisteredState,
}: {
  update: StateUpdate | undefined;
  componentUpdate: StateUpdate | undefined;
  hasRegisteredState: boolean;
}): JSX.Element {
  const displayedUpdate = update ?? componentUpdate;
  const isDirectlyCorrelated = Boolean(update);
  return (
    <section class="cs-provenance" aria-labelledby="cs-provenance-heading">
      <div class="cs-section-title">
        <h2 id="cs-provenance-heading">State provenance</h2>
        <span>{isDirectlyCorrelated ? "correlated update" : displayedUpdate ? "render context" : hasRegisteredState ? "state registered" : "unconfirmed"}</span>
      </div>
      {displayedUpdate ? (
        <>
          <div class="cs-step">
            <span class="cs-step-index">1</span>
            <div>
              <div class="cs-step-title"><strong>Observed before setter</strong><span>runtime</span></div>
              <div class="cs-step-values"><code class="cs-chip">{displayedUpdate.stateName} = {formatValue(displayedUpdate.previous)}</code></div>
            </div>
          </div>
          <div class="cs-step">
            <span class="cs-step-index">2</span>
            <div>
              <div class="cs-step-title"><strong>Setter call</strong><span>{formatTime(displayedUpdate.timestamp)}</span></div>
              <div class="cs-step-values">
                <code class="cs-chip">{displayedUpdate.stateName} → {formatValue(displayedUpdate.next)}</code>
                <code class="cs-chip">{displayedUpdate.source.file}:{displayedUpdate.source.line}</code>
                <code class="cs-chip">{updateTrigger(displayedUpdate)}</code>
              </div>
            </div>
          </div>
          {!isDirectlyCorrelated ? (
            <p class="cs-note">This state changed in {displayedUpdate.componentName ?? "the component tree"} before the selected render. The selected expression does not directly reference that state binding, so CauseScope keeps the dependency link explicitly unconfirmed.</p>
          ) : null}
        </>
      ) : (
        <p class="cs-note">{hasRegisteredState ? "Component state is registered, but no setter call has been recorded yet." : "No traced state setter is correlated with this expression yet."}</p>
      )}
    </section>
  );
}

function WhyPanel({ inspection }: { inspection: InspectionResult }): JSX.Element {
  if (inspection.expressions.length === 0) return <SourceCode inspection={inspection} />;

  return (
    <>
      <SourceCode inspection={inspection} />
      <DomFacts inspection={inspection} />
      <section class="cs-panel cs-expression-section">
        <div class="cs-section-title">
          <h2>Render expressions</h2>
          <span>{inspection.expressions.length} traced</span>
        </div>
        {inspection.expressions.length > 0 ? (
          <div class="cs-expression-list">
            {inspection.expressions.map((expression) => (
              <div class="cs-expression-group" key={expression.id}>
                <ExpressionCard expression={expression} />
                <ConditionExplanation expression={expression} />
              </div>
            ))}
          </div>
        ) : (
          <div class="cs-inline-empty">
            <h2>No dynamic JSX expression</h2>
            <p>This element is currently explained by static JSX and observed DOM facts. CauseScope will not invent a missing expression.</p>
          </div>
        )}
        <StateProvenance
          update={inspection.correlatedStateUpdates[0]}
          componentUpdate={inspection.stateUpdates[0]}
          hasRegisteredState={inspection.states.length > 0}
        />
      </section>
      <HiddenBranches expressions={inspection.expressions} />
    </>
  );
}

function ValuesPanel({ inspection }: { inspection: InspectionResult }): JSX.Element {
  const entries = inspection.expressions.flatMap((expression) =>
    Object.entries(expression.inputs).map(([name, value]) => ({ expression, name, value })),
  );
  return (
    <section class="cs-panel">
      <p class="cs-eyebrow">Current evaluation</p>
      <h2 class="cs-panel-heading">Values at render time</h2>
      <div class="cs-value-list">
        {inspection.expressions.length === 0 ? (
          <div class="cs-value-row"><span>dynamic expressions</span><code>None traced</code></div>
        ) : inspection.expressions.map((expression) => (
          <div class="cs-value-row" key={expression.id}>
            <span>{expression.kind === "children" ? "children" : expression.property}</span>
            <code>{formatExpressionValue(expression)}</code>
          </div>
        ))}
        {entries.map(({ expression, name, value }) => (
          <div class="cs-value-row" key={`${expression.id}:${name}`}>
            <span>{expression.property} · {name}</span>
            <code>{formatValue(value)} · {expression.inputStateIds[name] ? "React State binding" : expression.inputOrigins[name]?.length ? "origin traced" : "origin unconfirmed"}</code>
          </div>
        ))}
      </div>
      <div class="cs-subsection">
        <div class="cs-section-title"><h3>Props</h3><span>{inspection.props.length} current</span></div>
        {inspection.props.length > 0 ? inspection.props.map((prop) => (
          <article class="cs-origin-card" key={`${prop.componentName}:${prop.name}:${prop.relationship}`}>
            <div><strong>{prop.componentName}.props.{prop.name}</strong><span>{prop.relationship}</span></div>
            <code>{formatValue(prop.value)}</code>
            {prop.passedFrom ? (
              <p>Passed from <code>{prop.passedFrom.source.file}:{prop.passedFrom.source.line}:{prop.passedFrom.source.column}</code> via <code>{prop.name}={prop.passedFrom.expression}</code></p>
            ) : <p>Current value confirmed from React Fiber; parent callsite unavailable.</p>}
          </article>
        )) : <p class="cs-note">No current component Props were found.</p>}
      </div>
      <div class="cs-subsection">
        <div class="cs-section-title"><h3>Value origins</h3><span>{inspection.origins.length} linked</span></div>
        {inspection.origins.length > 0 ? inspection.origins.map((origin) => (
          <article class="cs-origin-card" key={origin.id} data-confidence={origin.confidence}>
            <div><strong>{origin.label}</strong><span>{origin.confidence}</span></div>
            <code>{origin.path ?? "value"}</code>
            {origin.source ? <p>Passed from <code>{origin.source.file}:{origin.source.line}:{origin.source.column}</code></p> : null}
            {origin.kind === "react-query" ? (
              <>
                <p>Query key <code>{formatMetadataValue(origin.metadata?.queryKey)}</code> · {String(origin.metadata?.status ?? "unknown")} · {String(origin.metadata?.fetchStatus ?? "unknown")}</p>
                {typeof origin.metadata?.dataUpdatedAt === "number" && origin.metadata.dataUpdatedAt > 0 ? (
                  <p>Updated at <code>{formatTime(origin.metadata.dataUpdatedAt)}</code></p>
                ) : null}
              </>
            ) : null}
            {origin.kind === "zustand" ? <p>Store <code>{String(origin.metadata?.storeName ?? origin.label)}</code></p> : null}
          </article>
        )) : <p class="cs-note">Origin unavailable. The value may have been copied or transformed before rendering.</p>}
      </div>
      <p class="cs-note">Each value is captured during the latest render. Confirmed, possible, and unavailable origins stay explicitly separate.</p>
    </section>
  );
}

function StateSnapshotCard({ state }: { state: StateSnapshot }): JSX.Element {
  const update = state.latestUpdate;
  return (
    <article class="cs-state-card" data-relationship={state.relationship}>
      <div class="cs-state-card-title">
        <div><strong>{state.stateName}</strong><span>{state.componentName ?? "Unknown component"}</span></div>
        <span class="cs-state-relationship">{state.relationship === "component" ? "selected component" : "ancestor"} · use{state.hookType === "reducer" ? "Reducer" : "State"}</span>
      </div>
      <div class="cs-state-values">
        <div><span>Current</span><code>{formatValue(state.current)}</code></div>
        <div><span>Initial</span><code>{formatValue(state.initial)}</code></div>
      </div>
      <div class="cs-state-source"><span>Initialized at</span><code>{state.source.file}:{state.source.line}:{state.source.column}</code></div>
      {update ? (
        <div class="cs-state-update">
          <div class="cs-state-update-heading"><strong>Latest setter call</strong><time>{formatTime(update.timestamp)}</time></div>
          <div class="cs-state-values">
            <div><span>Previous</span><code>{formatValue(update.previous)}</code></div>
            <div><span>Next</span><code>{formatValue(update.next)}</code></div>
          </div>
          <div class="cs-state-source"><span>Updated at</span><code>{update.source.file}:{update.source.line}:{update.source.column}</code></div>
          <div class="cs-state-source"><span>Triggered by</span><code>{updateTrigger(update)}</code></div>
          <div class="cs-state-source"><span>Update type</span><code>{update.updateType}</code></div>
          {update.event?.handlerExpression ? (
            <div class="cs-state-source">
              <span>Handler</span>
              <code>{update.event.handlerExpression}{update.event.source ? ` · ${update.event.source.file}:${update.event.source.line}:${update.event.source.column}` : ""}</code>
            </div>
          ) : null}
          {update.action !== undefined ? <div class="cs-state-source"><span>{update.reducerDispatches && update.reducerDispatches.length > 1 ? `Reducer actions (${update.reducerDispatches.length})` : "Reducer action"}</span><code>{formatValue(update.action)}</code></div> : null}
        </div>
      ) : <p class="cs-note">No setter call recorded for this state instance.</p>}
    </article>
  );
}

function StatePanel({ inspection }: { inspection: InspectionResult }): JSX.Element {
  return (
    <section class="cs-panel">
      <p class="cs-eyebrow">{inspection.componentName ?? "Component"}</p>
      <h2 class="cs-panel-heading">Component state</h2>
      <p class="cs-note">Current hook values are matched to the selected React component instance. State from parent components is labeled as ancestor context.</p>
      {inspection.states.length > 0 ? (
        <div class="cs-state-list">
          {inspection.states.map((state) => <StateSnapshotCard state={state} key={state.instanceId} />)}
        </div>
      ) : inspection.stateUpdates.length > 0 ? (
        <div class="cs-value-list">
          {inspection.stateUpdates.map((update) => (
            <div class="cs-value-row" key={update.id}>
              <span>{update.stateName}</span>
              <code>{formatValue(update.previous)} → {formatValue(update.next)}</code>
            </div>
          ))}
        </div>
      ) : <div class="cs-inline-empty"><h2>No traced component state</h2><p>No useState hook instance was found for the selected component tree.</p></div>}
    </section>
  );
}

function NetworkRequestCard({ request, responsePaths }: { request: NetworkTrace; responsePaths: string[] }): JSX.Element {
  const duration = request.completedAt ? `${Math.max(0, request.completedAt - request.startedAt)} ms` : "pending";
  return (
    <article class="cs-network-card">
      <div class="cs-network-title">
        <strong>{request.method}</strong>
        <code>{request.url}</code>
        <span data-status={request.error ? "error" : request.status && request.status >= 400 ? "error" : "ok"}>{request.error ? "failed" : request.status ?? "pending"}</span>
      </div>
      <div class="cs-network-meta">
        <span>{request.transport.toUpperCase()}</span>
        <span>{duration}</span>
        <span>{request.responseType || "response pending"}</span>
        {request.responseBytes !== undefined ? <span>{request.responseBytes.toLocaleString()} bytes{request.truncated ? " · truncated" : ""}</span> : null}
      </div>
      {responsePaths.length > 0 ? (
        <div class="cs-network-path">
          <span>{responsePaths.length === 1 ? "Response field" : "Response fields"}</span>
          <code>{responsePaths.join(" · ")}</code>
        </div>
      ) : null}
      {request.error ? <p>{request.error}</p> : null}
    </article>
  );
}

function NetworkPanel({ inspection }: { inspection: InspectionResult }): JSX.Element {
  return (
    <section class="cs-panel">
      <p class="cs-eyebrow">Linked requests</p>
      <h2 class="cs-panel-heading">Network origin</h2>
      {inspection.networkRequests.length > 0 ? (
        <div class="cs-network-list">
          {inspection.networkRequests.map((request) => (
            <NetworkRequestCard
              request={request}
              responsePaths={[...new Set(inspection.origins
                .filter((origin) => origin.kind === "network" && origin.traceId === request.id && origin.path)
                .map((origin) => origin.path as string))]}
              key={request.id}
            />
          ))}
        </div>
      ) : (
        <div class="cs-inline-empty">
          <h2>No confirmed network origin</h2>
          <p>The selected value is not linked to a recorded Fetch or XMLHttpRequest response. CauseScope will not invent a request chain.</p>
        </div>
      )}
      {inspection.storageAccesses.length > 0 ? (
        <div class="cs-subsection">
          <div class="cs-section-title"><h3>Storage access</h3><span>{inspection.storageAccesses.length}</span></div>
          {inspection.storageAccesses.map((access) => (
            <div class="cs-value-row" key={access.id}>
              <span>{access.storage}.{access.operation}</span>
              <code>{access.key} = {access.value === undefined ? "—" : formatValue(access.value)}</code>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TimelinePanel({ timeline }: { timeline: RuntimeEvent[] }): JSX.Element {
  return (
    <section class="cs-panel">
      <p class="cs-eyebrow">Latest first</p>
      <h2 class="cs-panel-heading">Render timeline</h2>
      <ol class="cs-timeline">
        {timeline.length === 0 ? <li><time>—</time><span>No events recorded yet</span></li> : null}
        {timeline.map((event) => (
          <li key={event.id} data-accent={event.type === "state-update" ? "true" : "false"}>
            <time>{formatTime(event.timestamp)}</time>
            <span>{event.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface DrawerProps {
  activeTab: Tab;
  drawerWidth: number;
  selectionRevision: number;
  inspection: InspectionResult;
  notice: string;
  onClose: () => void;
  onCopyMarkdown: () => void;
  onExportJson: () => void;
  onOpenEditor: () => void;
  onResize: (width: number) => void;
  onTabChange: (tab: Tab) => void;
}

function Drawer({
  activeTab,
  drawerWidth,
  selectionRevision,
  inspection,
  notice,
  onClose,
  onCopyMarkdown,
  onExportJson,
  onOpenEditor,
  onResize,
  onTabChange,
}: DrawerProps): JSX.Element {
  const resizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const source = inspection.source;
  const isStatic = inspection.expressions.length === 0;

  useEffect(() => {
    (isStatic ? closeButtonRef.current : tabRefs.current[0])?.focus();
  }, [isStatic, selectionRevision]);

  const startResize = (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    resizeState.current = { startX: event.clientX, startWidth: drawerWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    if (!resizeState.current) return;
    const delta = resizeState.current.startX - event.clientX;
    onResize(Math.max(360, Math.min(640, resizeState.current.startWidth + delta)));
  };

  const endResize = (event: JSX.TargetedPointerEvent<HTMLButtonElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeState.current = null;
  };

  const resizeWithKeyboard = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 16 : -16;
    onResize(Math.max(360, Math.min(640, drawerWidth + delta)));
  };

  const moveTabFocus = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TABS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    const nextTab = TABS[nextIndex];
    if (!nextTab) return;
    onTabChange(nextTab);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <aside
      class="cs-drawer"
      data-static={isStatic ? "true" : "false"}
      style={{ "--cs-drawer-width": `${drawerWidth}px` }}
      aria-label="CauseScope inspector"
    >
      <button
        class="cs-resizer"
        type="button"
        aria-label="Resize CauseScope inspector"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onKeyDown={resizeWithKeyboard}
      />
      <header class="cs-header">
        <div class="cs-title-row">
          <div class="cs-brand"><h1 class="cs-title">CauseScope</h1></div>
          <div class="cs-header-actions">
            <button class="cs-text-button" type="button" ref={closeButtonRef} onClick={onClose}>Close</button>
          </div>
        </div>
        <div class="cs-summary">
          <div class="cs-summary-row"><span class="cs-summary-label">DOM Element</span><code class="cs-summary-value">{inspection.element.tagName}</code></div>
          <div class="cs-summary-row"><span class="cs-summary-label">Component</span><code class="cs-summary-value">{inspection.componentName ?? "Unknown"}</code></div>
          <div class="cs-summary-row"><span class="cs-summary-label">Source</span><code class="cs-summary-value">{source ? `${source.file}:${source.line}` : "Unavailable"}</code></div>
        </div>
        <div class="cs-export-actions">
          <button class="cs-open-editor" type="button" disabled={!source} onClick={onOpenEditor}>Open in editor</button>
          <button class="cs-export-button" type="button" onClick={onCopyMarkdown}>Copy Markdown</button>
          <button class="cs-export-button" type="button" onClick={onExportJson}>Export JSON</button>
        </div>
      </header>
      {!isStatic ? <nav class="cs-tabs" role="tablist" aria-label="CauseScope sections">
        {TABS.map((tab, index) => (
          <button
            class="cs-tab"
            type="button"
            role="tab"
            id={`cs-tab-${tab.toLowerCase()}`}
            aria-controls="cs-tabpanel"
            aria-selected={activeTab === tab}
            data-active={activeTab === tab ? "true" : "false"}
            tabIndex={activeTab === tab ? 0 : -1}
            ref={(element) => { tabRefs.current[index] = element; }}
            onClick={() => onTabChange(tab)}
            onKeyDown={(event) => moveTabFocus(event, index)}
            key={tab}
          >
            {tab}
          </button>
        ))}
      </nav> : null}
      <div
        class="cs-content"
        {...(!isStatic ? {
          role: "tabpanel",
          id: "cs-tabpanel",
          "aria-labelledby": `cs-tab-${activeTab.toLowerCase()}`,
          tabIndex: 0,
        } : {})}
      >
        {isStatic || activeTab === "Why" ? <WhyPanel inspection={inspection} /> : null}
        {!isStatic && activeTab === "Values" ? <ValuesPanel inspection={inspection} /> : null}
        {!isStatic && activeTab === "State" ? <StatePanel inspection={inspection} /> : null}
        {!isStatic && activeTab === "Network" ? <NetworkPanel inspection={inspection} /> : null}
        {!isStatic && activeTab === "Timeline" ? <TimelinePanel timeline={inspection.timeline} /> : null}
      </div>
      {notice ? <div class="cs-notice" role="status">{notice}</div> : null}
    </aside>
  );
}

function OverlayApp({ runtime, host }: { runtime: CauseScopeRuntime; host: HTMLElement }): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>("Why");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(420);
  const [highlight, setHighlight] = useState<HighlightBox | null>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const selectedElement = useRef<Element | null>(null);
  const suppressClickTarget = useRef<Element | null>(null);
  const toggleButton = useRef<HTMLButtonElement | null>(null);
  const selectionActive = inspectMode || drawerOpen;

  useEffect(() => runtime.subscribe(() => {
    if (selectedElement.current) setInspection(runtime.inspectElement(selectedElement.current));
  }), [runtime]);

  useEffect(() => {
    const inspect = (target: Element): void => {
      selectedElement.current = target;
      setInspection(runtime.inspectElement(target));
      setSelectionRevision((current) => current + 1);
      setActiveTab("Why");
      setDrawerOpen(true);
      setInspectMode(false);
      setHighlight(null);
      runtime.recordEvent({
        type: "inspect",
        label: `inspect ${targetLabel(target)}`,
        timestamp: Date.now(),
        metadata: { targetNodeId: target.getAttribute("data-causescope-node") ?? undefined },
      });
    };

    const highlightTarget = (target: Element | null): void => {
      if (!target) return setHighlight(null);
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return setHighlight(null);
      const component = target.getAttribute("data-causescope-component");
      setHighlight({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        label: `<${target.tagName.toLowerCase()}>${component ? ` · ${component}` : ""}`,
      });
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!selectionActive) return;
      const target = resolveInspectableTarget(event.target, host);
      highlightTarget(target);
    };

    const onFocusIn = (event: FocusEvent): void => {
      if (!selectionActive) return;
      highlightTarget(resolveInspectableTarget(event.target, host));
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!selectionActive && !event.altKey) return;
      const target = resolveInspectableTarget(event.target, host);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickTarget.current = target;
      inspect(target);
    };

    const onKeyboardSelect = (event: KeyboardEvent): void => {
      if (!selectionActive || (event.key !== "Enter" && event.key !== " ")) return;
      const target = resolveInspectableTarget(event.target, host);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      inspect(target);
    };

    const clearSuppressedClickAfterPointer = (): void => {
      const target = suppressClickTarget.current;
      if (!target) return;
      // A native click is dispatched synchronously after pointerup. Clearing in
      // the next task preserves that suppression even after a long press while
      // avoiding stale suppression when a disabled element emits no click.
      window.setTimeout(() => {
        if (suppressClickTarget.current === target) suppressClickTarget.current = null;
      }, 0);
    };

    const recordDomEvent = (event: Event): void => {
      if (event.defaultPrevented) return;
      const match = findEventHandler(event.target, host, runtime, event.type);
      if (!match) return;
      const { target, expression } = match;
      const context: EventContext = {
        type: event.type,
        targetLabel: targetLabel(target),
        timestamp: Date.now(),
      };
      const nodeId = target.getAttribute("data-causescope-node");
      if (nodeId) context.targetNodeId = nodeId;
      if (expression) {
        context.source = expression.source;
        context.handlerProperty = expression.property;
        context.handlerExpression = expression.expression;
      }
      runtime.setEventContext(context);
      runtime.recordEvent({
        type: event.type,
        label: `${event.type} ${context.targetLabel}${expression ? ` → ${expression.expression}` : ""}`,
        timestamp: context.timestamp,
        ...(expression ? { source: expression.source } : {}),
        metadata: {
          targetNodeId: context.targetNodeId,
          handlerProperty: expression?.property,
          handlerExpression: expression?.expression,
        },
      });
      window.setTimeout(() => runtime.setEventContext(null), 0);
    };

    const onClick = (event: MouseEvent): void => {
      const target = resolveInspectableTarget(event.target, host);
      if (target && suppressClickTarget.current === target) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClickTarget.current = null;
        return;
      }
      recordDomEvent(event);
    };

    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || (!drawerOpen && !inspectMode)) return;
      if (drawerOpen) setDrawerOpen(false);
      setInspectMode(false);
      setHighlight(null);
      window.setTimeout(() => toggleButton.current?.focus(), 0);
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", clearSuppressedClickAfterPointer, true);
    document.addEventListener("pointercancel", clearSuppressedClickAfterPointer, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyboardSelect, true);
    document.addEventListener("click", onClick, true);
    for (const eventType of Object.keys(EVENT_HANDLER_PROPERTIES).filter((type) => type !== "click")) {
      document.addEventListener(eventType, recordDomEvent, true);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", clearSuppressedClickAfterPointer, true);
      document.removeEventListener("pointercancel", clearSuppressedClickAfterPointer, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyboardSelect, true);
      document.removeEventListener("click", onClick, true);
      for (const eventType of Object.keys(EVENT_HANDLER_PROPERTIES).filter((type) => type !== "click")) {
        document.removeEventListener(eventType, recordDomEvent, true);
      }
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [drawerOpen, host, inspectMode, runtime, selectionActive]);

  const openEditor = async (): Promise<void> => {
    const source: SourceLocation | undefined = inspection?.source;
    if (!source) return;
    const parameters = new URLSearchParams({
      file: source.file,
      line: String(source.line),
      column: String(source.column),
    });
    try {
      const response = await fetch(`/__causescope/open-in-editor?${parameters.toString()}`, {
        method: "POST",
        headers: { "x-causescope-request": "open-editor" },
      });
      if (!response.ok) throw new Error("Open request failed");
      setNotice(`Editor open request sent for ${source.file}:${source.line}`);
    } catch {
      setNotice("Could not open the editor. Check the Vite terminal for details.");
    }
    window.setTimeout(() => setNotice(""), 2400);
  };

  const copyMarkdown = async (): Promise<void> => {
    if (!inspection) return;
    const markdown = runtime.formatTraceMarkdown(inspection);
    const copyWithSelection = (): boolean => {
      const textarea = document.createElement("textarea");
      textarea.value = markdown;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    };
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(markdown);
          copied = true;
        } catch {
          copied = copyWithSelection();
        }
      } else {
        copied = copyWithSelection();
      }
      if (!copied) throw new Error("Copy command failed");
      setNotice("Markdown trace copied");
    } catch {
      setNotice("Could not copy Markdown. Clipboard access may be blocked.");
    }
    window.setTimeout(() => setNotice(""), 2400);
  };

  const exportJson = (): void => {
    if (!inspection) return;
    try {
      const trace = runtime.exportTrace(inspection);
      const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `causescope-trace-${Date.now()}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("JSON trace exported");
    } catch {
      setNotice("Could not export this trace.");
    }
    window.setTimeout(() => setNotice(""), 2400);
  };

  return (
    <>
      {highlight ? (
        <div class="cs-highlight" style={{ top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height }}>
          <span class="cs-highlight-label">{highlight.label}</span>
        </div>
      ) : null}

      {!drawerOpen ? (
        <button
          class="cs-toggle"
          type="button"
          ref={toggleButton}
          data-active={inspectMode ? "true" : "false"}
          aria-pressed={inspectMode}
          aria-label={inspectMode ? "Select an element: move focus to a page element and press Enter" : "Inspect"}
          onClick={() => {
            setInspectMode((current) => !current);
            setHighlight(null);
          }}
        >
          <span class="cs-toggle-dot" />
          {inspectMode ? "Select an element" : "Inspect"}
          <span class="cs-shortcut" aria-hidden="true">{inspectMode ? "Tab · Enter" : "⌥ Click"}</span>
        </button>
      ) : null}

      {drawerOpen && inspection ? (
        <Drawer
          activeTab={activeTab}
          drawerWidth={drawerWidth}
          selectionRevision={selectionRevision}
          inspection={inspection}
          notice={notice}
          onClose={() => {
            setDrawerOpen(false);
            setInspectMode(false);
            setHighlight(null);
            window.setTimeout(() => toggleButton.current?.focus(), 0);
          }}
          onCopyMarkdown={() => void copyMarkdown()}
          onExportJson={exportJson}
          onOpenEditor={() => void openEditor()}
          onResize={setDrawerWidth}
          onTabChange={setActiveTab}
        />
      ) : null}
    </>
  );
}

export function mountCauseScopeOverlay(runtime: CauseScopeRuntime): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(HOST_ID);
  if (existing) return existing;

  const host = document.createElement("causescope-root");
  host.id = HOST_ID;
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = overlayStyles;
  const mountNode = document.createElement("div");
  shadowRoot.append(style, mountNode);
  document.body.append(host);
  render(<OverlayApp runtime={runtime} host={host} />, mountNode);
  return host;
}
