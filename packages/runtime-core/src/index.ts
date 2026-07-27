import type {
  CaptureOriginHint,
  ComponentFrame,
  ConditionEvaluation,
  EventContext,
  ExpressionTraceMetadata,
  ExpressionResult,
  InspectionResult,
  NetworkTrace,
  PropPassMetadata,
  PropSnapshot,
  ReactRuntimeAdapter,
  RedactOptions,
  CauseScopeAdapter,
  CauseScopeAdapterApi,
  CauseScopeRuntime,
  CauseScopeRuntimeOptions,
  RuntimeEvent,
  SerializedValue,
  SourceLocation,
  StateSnapshot,
  StateUpdate,
  StorageTrace,
  StoreUpdate,
  TraceExport,
  TraceExportConditionEvaluation,
  TraceExportExpression,
  TraceExportProp,
  TraceExportReducerDispatch,
  TraceExportRuntimeEvent,
  TraceExportStateChange,
  TraceExportValueOrigin,
  TraceBooleanInput,
  TraceExpressionInput,
  TracePropInput,
  TraceReducerDispatchInput,
  TraceStateRegistrationInput,
  TraceStateUpdateInput,
  TraceValueInput,
  ValueOrigin,
} from "@causescope/shared";
import { installBrowserInstrumentation } from "./browser-instrumentation";
import { evaluateCondition, evaluateConditionalRender, findDecidingBranch } from "./condition";
import {
  mergeRedaction,
  isSensitiveKey,
  redactHeaders,
  redactUrl,
  serializeValue,
  serializedByteLength,
} from "./serialization";

const DEFAULT_MAX_TIMELINE_EVENTS = 200;
const DEFAULT_MAX_TRACE_NODES = 10_000;
const DEFAULT_MAX_NETWORK_RESPONSE_BYTES = 1_000_000;
const DEFAULT_MAX_NETWORK_BYTES = 20_000_000;

interface AccessPathSegment {
  key: string;
  numeric: boolean;
}

function parseAccessPath(accessPath: string): AccessPathSegment[] | null {
  const segments: AccessPathSegment[] = [];
  const token = /(?:^|\.)([A-Za-z_$][\w$]*)|\[((?:"(?:\\.|[^"\\])*")|\d+)\]/gy;
  let cursor = 0;
  while (cursor < accessPath.length) {
    token.lastIndex = cursor;
    const match = token.exec(accessPath);
    if (!match || match.index !== cursor) return null;
    if (match[1]) {
      segments.push({ key: match[1], numeric: false });
    } else if (match[2]?.startsWith('"')) {
      try {
        segments.push({ key: JSON.parse(match[2]) as string, numeric: false });
      } catch {
        return null;
      }
    } else if (match[2]) {
      segments.push({ key: match[2], numeric: true });
    }
    cursor = token.lastIndex;
  }
  return segments;
}

function formatAccessPath(segments: AccessPathSegment[]): string {
  return segments.map((segment, index) => {
    if (segment.numeric) return `[${segment.key}]`;
    if (/^[A-Za-z_$][\w$]*$/.test(segment.key)) return index === 0 ? segment.key : `.${segment.key}`;
    return `[${JSON.stringify(segment.key)}]`;
  }).join("");
}

interface RegisteredState {
  stateId: string;
  instanceId: string;
  stateName: string;
  componentName?: string;
  initial: unknown;
  current: unknown;
  renderedCurrent: unknown;
  source: SourceLocation;
  hookType: "state" | "reducer";
}

interface PendingReducerDispatch {
  stateId: string;
  stateName: string;
  componentName?: string;
  source: SourceLocation;
  previous: unknown;
  action: unknown;
  event: EventContext | null;
}

interface ActiveExpressionCapture {
  metadata: ExpressionTraceMetadata;
  origins: Map<string, ValueOrigin[]>;
}

interface PropPassRecord {
  metadata: PropPassMetadata;
  value: unknown;
}

interface RecentPrimitiveOrigin {
  value: unknown;
  origin: ValueOrigin;
  timestamp: number;
  persistent?: boolean;
}

function createId(prefix: string, sequence: number): string {
  return `${prefix}_${sequence.toString(36)}`;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") {
    const truncated = value.length > 160 ? `${value.slice(0, 157)}…` : value;
    return JSON.stringify(truncated);
  }
  if (typeof value === "function") return value.name ? `[function ${value.name}]` : "[function]";
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.description ? `Symbol(${value.description})` : "Symbol()";
  if (Array.isArray(value)) return `[Array(${value.length})]`;
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? "[Invalid Date]" : value.toISOString();
  if (typeof value === "object") return "[Object]";
  return String(value);
}

function parseSource(element: Element): SourceLocation | undefined {
  const file = element.getAttribute("data-causescope-file");
  const line = Number(element.getAttribute("data-causescope-line"));
  const column = Number(element.getAttribute("data-causescope-column"));
  if (!file || !Number.isFinite(line) || !Number.isFinite(column)) return undefined;
  return { file, line, column };
}

function getElementLabel(element: Element): string {
  const accessibleLabel = element.getAttribute("aria-label");
  if (accessibleLabel) return accessibleLabel;

  const text = element.textContent?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);

  return element.tagName.toLowerCase();
}

function getElementAttributes(element: Element): Record<string, string> {
  if (typeof element.getAttributeNames !== "function") return {};

  const attributes: Record<string, string> = {};
  for (const name of element.getAttributeNames()) {
    if (name.startsWith("data-causescope-")) continue;
    const value = element.getAttribute(name);
    if (value !== null) attributes[name] = value;
  }
  return attributes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasRepeatedSourceNodeIn(
  root: Pick<Document, "querySelectorAll"> | null | undefined,
  nodeId: string,
): boolean {
  if (nodeId === "cs_uninstrumented" || !root?.querySelectorAll) return false;
  let matches = 0;
  for (const candidate of root.querySelectorAll("[data-causescope-node]")) {
    if (candidate.getAttribute("data-causescope-node") !== nodeId) continue;
    matches += 1;
    if (matches > 1) return true;
  }
  return false;
}

function readSelectedProp(
  props: unknown,
  expression: ExpressionResult,
): { found: true; value: unknown } | { found: false } {
  // A spread trace represents an object that may feed several host props, so
  // no single prop can prove the value of the original spread expression.
  if (expression.kind === "spread") return { found: false };
  if (!isRecord(props) || !Object.prototype.hasOwnProperty.call(props, expression.property)) {
    return { found: false };
  }
  const value = props[expression.property];
  // Multiple children become a React children array. Without a positional
  // compile-time mapping, assigning that whole array to one child expression
  // would be misleading.
  if (expression.kind === "children" && Array.isArray(value)) return { found: false };
  return { found: true, value };
}

export class CauseScopeRuntimeImpl implements CauseScopeRuntime {
  readonly #expressions = new Map<string, ExpressionResult>();
  readonly #expressionIdsByNode = new Map<string, Map<string, string>>();
  readonly #propPasses: PropPassRecord[] = [];
  readonly #stateUpdates: StateUpdate[] = [];
  readonly #statesBySetter = new WeakMap<object, RegisteredState>();
  readonly #pendingReducerDispatches = new WeakMap<object, PendingReducerDispatch[]>();
  readonly #valueOrigins = new WeakMap<object, ValueOrigin[]>();
  readonly #networkRequests: NetworkTrace[] = [];
  readonly #storageAccesses: StorageTrace[] = [];
  readonly #storeUpdates: StoreUpdate[] = [];
  readonly #recentPrimitiveOrigins: RecentPrimitiveOrigin[] = [];
  readonly #timeline: RuntimeEvent[] = [];
  readonly #listeners = new Set<() => void>();
  readonly #adapterCleanups = new Set<() => void>();
  readonly #repeatedNodeIds = new Set<string>();
  readonly #pendingMultiplicityChecks = new Set<string>();
  readonly #maxTimelineEvents: number;
  readonly #maxTraceNodes: number;
  readonly #maxNetworkResponseBytes: number;
  readonly #maxNetworkBytes: number;
  readonly #traceNetwork: boolean;
  readonly #traceStorage: boolean;
  readonly #redact: RedactOptions;
  #adapter: ReactRuntimeAdapter | null = null;
  #eventContext: EventContext | null = null;
  #activeExpressionCapture: ActiveExpressionCapture | null = null;
  #expressionNotifyScheduled = false;
  #multiplicityCheckScheduled = false;
  #sequence = 0;
  #stateInstanceSequence = 0;
  #networkBytes = 0;
  #browserInstrumentationInstalled = false;

  constructor(options: CauseScopeRuntimeOptions = {}) {
    this.#maxTimelineEvents = options.maxTimelineEvents ?? DEFAULT_MAX_TIMELINE_EVENTS;
    this.#maxTraceNodes = options.maxTraceNodes ?? DEFAULT_MAX_TRACE_NODES;
    this.#maxNetworkResponseBytes = options.maxNetworkResponseBytes ?? DEFAULT_MAX_NETWORK_RESPONSE_BYTES;
    this.#maxNetworkBytes = options.maxNetworkBytes ?? DEFAULT_MAX_NETWORK_BYTES;
    this.#traceNetwork = options.traceNetwork ?? true;
    this.#traceStorage = options.traceStorage ?? true;
    this.#redact = mergeRedaction(options.redact);
  }

  traceExpression<T>(input: TraceExpressionInput<T>): T {
    const inputs: Record<string, unknown> = { ...input.inputs };
    const inputStateIds: Record<string, string> = {};
    const inputOrigins: Record<string, ValueOrigin[]> = {};
    const activeCapture: ActiveExpressionCapture = { metadata: input.metadata, origins: new Map() };
    const capture = <Value>(name: string, value: Value, stateId?: string, originHint?: CaptureOriginHint): Value => {
      inputs[name] = value;
      if (stateId) inputStateIds[name] = stateId;
      const origins = this.#originsForValue(value, originHint);
      if (origins.length > 0) inputOrigins[name] = origins;
      return value;
    };
    const previousCapture = this.#activeExpressionCapture;
    this.#activeExpressionCapture = activeCapture;
    let result: T;
    try {
      result = input.evaluate(capture);
    } finally {
      this.#activeExpressionCapture = previousCapture;
    }
    for (const [name, origins] of activeCapture.origins) {
      inputOrigins[name] = [...(inputOrigins[name] ?? []), ...origins];
    }
    this.#recordExpression(input.metadata, result, inputs, inputStateIds, inputOrigins, "operands");
    return result;
  }

  traceBoolean(input: TraceBooleanInput): boolean {
    return this.traceExpression(input);
  }

  traceValue<T>(input: TraceValueInput<T>): T {
    this.#recordExpression(input.metadata, input.value, {}, {}, {}, "result-only");
    return input.value;
  }

  traceProp<T>(input: TracePropInput<T>): T {
    try {
      // A single JSX callsite can execute several times in one render (for
      // example inside Array.map). Keep every passed value so repeated child
      // instances can be matched by identity instead of letting the final row
      // overwrite all earlier rows from the same source location.
      this.#propPasses.push({ metadata: input.metadata, value: input.value });
      if (this.#propPasses.length > this.#maxTraceNodes) this.#propPasses.shift();
    } catch {
      // Prop tracing is diagnostic-only.
    }
    return input.value;
  }

  registerState<T>(input: TraceStateRegistrationInput<T>): void {
    try {
      const setterIdentity = input.setter as unknown as object;
      const existing = this.#statesBySetter.get(setterIdentity);
      if (existing) {
        const pendingDispatches = this.#pendingReducerDispatches.get(setterIdentity);
        if (pendingDispatches?.length) {
          const first = pendingDispatches[0];
          if (first) {
            this.#recordResolvedReducerUpdate(existing, first.previous, input.currentValue, pendingDispatches);
          }
          this.#pendingReducerDispatches.delete(setterIdentity);
        }
        const didRenderNewValue = !Object.is(existing.renderedCurrent, input.currentValue);
        existing.current = input.currentValue;
        existing.renderedCurrent = input.currentValue;
        if (didRenderNewValue) {
          this.recordEvent({
            type: "component-render",
            label: `${existing.componentName ?? "Component"} rendered after ${existing.stateName} changed`,
            timestamp: Date.now(),
            source: input.source,
            metadata: {
              stateId: existing.stateId,
              componentName: existing.componentName,
              instanceId: existing.instanceId,
              cause: "state-update",
            },
          });
        }
        return;
      }

      const state: RegisteredState = {
        stateId: input.stateId,
        instanceId: createId("cs_instance", ++this.#stateInstanceSequence),
        stateName: input.stateName,
        initial: input.currentValue,
        current: input.currentValue,
        renderedCurrent: input.currentValue,
        source: input.source,
        hookType: input.hookType ?? "state",
      };
      if (input.componentName) state.componentName = input.componentName;
      this.#statesBySetter.set(setterIdentity, state);
    } catch {
      // State registration is diagnostic-only and must not affect rendering.
    }
  }

  setState<T>(input: TraceStateUpdateInput<T>): void {
    const isFunctional = typeof input.nextValue === "function";
    const eventContext = this.#eventContext ? { ...this.#eventContext } : null;
    const updater = isFunctional
      ? input.nextValue as (previous: T) => T
      : () => input.nextValue as T;
    let recorded = false;

    // Always enqueue through React's functional form so `previous` reflects
    // the real update queue, including batched sequential setter calls.
    input.setter((previous: T) => {
      const next = updater(previous);
      // React Strict Mode may invoke an updater more than once. One setter
      // call still represents one user-level state update, so record it once.
      if (!recorded) {
        this.#recordStateUpdate(input, previous, next, isFunctional ? "functional" : "value", eventContext);
        recorded = true;
      }
      return next;
    });
  }

  dispatchReducer<State, Action>(input: TraceReducerDispatchInput<State, Action>): void {
    const dispatchIdentity = input.dispatch as unknown as object;
    const pending: PendingReducerDispatch = {
      stateId: input.stateId,
      stateName: input.stateName,
      source: input.source,
      previous: input.previousValue,
      action: input.action,
      event: this.#eventContext ? { ...this.#eventContext } : null,
    };
    if (input.componentName) pending.componentName = input.componentName;
    const queue = this.#pendingReducerDispatches.get(dispatchIdentity) ?? [];
    queue.push(pending);
    this.#pendingReducerDispatches.set(dispatchIdentity, queue.slice(-20));
    try {
      input.dispatch(input.action);
    } catch (error) {
      const currentQueue = this.#pendingReducerDispatches.get(dispatchIdentity);
      if (currentQueue) {
        const index = currentQueue.indexOf(pending);
        if (index >= 0) currentQueue.splice(index, 1);
        if (currentQueue.length === 0) this.#pendingReducerDispatches.delete(dispatchIdentity);
      }
      throw error;
    }
  }

  recordEvent(event: Omit<RuntimeEvent, "id">): void {
    const runtimeEvent: RuntimeEvent = {
      ...event,
      id: createId("cs_event", ++this.#sequence),
    };
    this.#timeline.push(runtimeEvent);
    this.#trimTimeline();
    this.#notify();
  }

  setEventContext(event: EventContext | null): void {
    this.#eventContext = event;
  }

  setReactAdapter(adapter: ReactRuntimeAdapter): void {
    this.#adapter = adapter;
  }

  findElementExpression(
    element: Element,
    properties: readonly string[],
  ): Pick<ExpressionTraceMetadata, "expression" | "property" | "source"> | undefined {
    const nodeId = element.getAttribute("data-causescope-node");
    if (!nodeId || properties.length === 0) return undefined;
    const expressionIds = this.#expressionIdsByNode.get(nodeId);
    if (!expressionIds) return undefined;

    for (const expressionId of expressionIds.values()) {
      const expression = this.#expressions.get(expressionId);
      if (!expression || !properties.includes(expression.property)) continue;
      return {
        expression: expression.expression,
        property: expression.property,
        source: expression.source,
      };
    }
    return undefined;
  }

  installAdapter(adapter: CauseScopeAdapter): () => void {
    let cleanup: void | (() => void);
    try {
      const api: CauseScopeAdapterApi = {
        registerValueOrigin: (value, origin, recursive) => this.registerValueOrigin(value, origin, recursive),
        recordStoreUpdate: (update) => this.recordStoreUpdate(update),
        getNetworkRequests: () => this.getNetworkRequests(),
      };
      cleanup = adapter.install(api);
    } catch (error) {
      this.recordEvent({
        type: "adapter-error",
        label: `${adapter.name} adapter failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
    }
    const dispose = (): void => {
      if (typeof cleanup === "function") cleanup();
      this.#adapterCleanups.delete(dispose);
    };
    this.#adapterCleanups.add(dispose);
    return dispose;
  }

  registerValueOrigin(value: unknown, origin: Omit<ValueOrigin, "id">, recursive = false): void {
    try {
      const registeredOrigin: ValueOrigin = { ...origin, id: createId("cs_origin", ++this.#sequence) };
      if ((typeof value === "object" && value !== null) || typeof value === "function") {
        this.#registerOrigin(value, registeredOrigin, recursive, 0, new WeakSet<object>(), true);
      } else {
        this.#registerPrimitiveOrigin(value, registeredOrigin, true);
      }
    } catch {
      // External adapters are isolated from the host application.
    }
  }

  recordStoreUpdate(update: Omit<StoreUpdate, "id">): void {
    try {
      const recorded: StoreUpdate = {
        ...update,
        id: createId("cs_store", ++this.#sequence),
        ...(update.event ? {} : this.#eventContext ? { event: { ...this.#eventContext } } : {}),
      };
      this.#storeUpdates.push(recorded);
      if (this.#storeUpdates.length > this.#maxTimelineEvents) this.#storeUpdates.shift();
      this.recordEvent({
        type: "store-update",
        label: `${recorded.storeName}.setState(${recorded.changedFields.join(", ") || "state"})`,
        timestamp: recorded.timestamp,
        ...(recorded.source ? { source: recorded.source } : {}),
        metadata: {
          adapter: recorded.adapter,
          storeName: recorded.storeName,
          triggerTargetNodeId: recorded.event?.targetNodeId,
        },
      });
    } catch {
      // Store adapters are best effort.
    }
  }

  installBrowserInstrumentation(): void {
    if (this.#browserInstrumentationInstalled) return;
    this.#browserInstrumentationInstalled = true;
    installBrowserInstrumentation({
      networkStart: (input) => this.#beginNetworkRequest(input),
      networkComplete: (input) => this.#completeNetworkRequest(input),
      networkBody: (id, value, responseType) => this.#recordNetworkBody(id, value, responseType),
      storageAccess: (input) => this.#recordStorageAccess(input),
    });
  }

  getNetworkRequests(): NetworkTrace[] {
    return this.#networkRequests.map((request) => ({ ...request }));
  }

  exportTrace(inspection: InspectionResult): TraceExport {
    const sensitiveTextValues = this.#collectSensitiveTextValues(inspection);
    const selectedValueIsSensitive = this.#inspectionContainsSensitiveValue(inspection);
    const redactEventContext = (event: EventContext): EventContext => this.#redactEventContext(
      event,
      sensitiveTextValues,
      selectedValueIsSensitive && event.targetNodeId === inspection.nodeId,
    );
    const expressions = inspection.expressions.map((expression): TraceExportExpression => {
      const {
        conditionEvaluation,
        inputOrigins,
        inputs,
        result,
        ...metadata
      } = expression;
      return {
        ...metadata,
        result: this.#redactExportValue(result, expression.expression),
        inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, this.#redactExportValue(value, key)])),
        inputOrigins: Object.fromEntries(Object.entries(inputOrigins).map(([key, origins]) => [
          key,
          origins.map((origin): TraceExportValueOrigin => {
            const { metadata: originMetadata, ...originFields } = origin;
            return {
              ...originFields,
              ...(originMetadata ? { metadata: this.#redactMetadata(originMetadata) } : {}),
            };
          }),
        ])),
        ...(conditionEvaluation ? {
          conditionEvaluation: this.#redactConditionEvaluation(conditionEvaluation),
        } : {}),
      };
    });
    const stateChanges = inspection.stateUpdates.map((update): TraceExportStateChange => {
      const {
        action,
        next,
        previous,
        reducerDispatches,
        ...updateFields
      } = update;
      return {
        ...updateFields,
        previous: this.#redactExportValue(previous, update.stateName),
        next: this.#redactExportValue(next, update.stateName),
        ...(action !== undefined ? { action: this.#redactExportValue(action) } : {}),
        ...(update.event ? { event: redactEventContext(update.event) } : {}),
        ...(reducerDispatches ? {
          reducerDispatches: reducerDispatches.map((dispatch): TraceExportReducerDispatch => ({
            ...dispatch,
            action: this.#redactExportValue(dispatch.action),
            ...(dispatch.event ? { event: redactEventContext(dispatch.event) } : {}),
          })),
        } : {}),
      };
    });
    const props = inspection.props.map((prop): TraceExportProp => {
      const { value, ...propFields } = prop;
      return {
        ...propFields,
        value: this.#redactExportValue(value, prop.name),
      };
    });
    const component: NonNullable<TraceExport["component"]> = {
      parents: [...inspection.parentComponents],
      props,
    };
    if (inspection.componentName) component.name = inspection.componentName;
    const trace: TraceExport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      element: {
        ...inspection.element,
        label: this.#redactTraceText(
          inspection.element.label,
          sensitiveTextValues,
          selectedValueIsSensitive,
        ),
        attributes: Object.fromEntries(Object.entries(inspection.element.attributes).map(([key, value]) => [
          key,
          this.#redactExportAttribute(key, value),
        ])),
      },
      component,
      expressions,
      stateChanges,
      networkRequests: inspection.networkRequests.map((request) => ({ ...request })),
      storageAccesses: inspection.storageAccesses.map((access) => ({
        ...access,
        ...(access.value !== undefined ? { value: this.#isSensitiveKey(access.key) ? "[REDACTED]" : access.value } : {}),
      })),
      storeUpdates: inspection.storeUpdates.map((update) => ({
        ...update,
        changedFields: [...update.changedFields],
        ...(update.event ? { event: redactEventContext(update.event) } : {}),
      })),
      timeline: inspection.timeline.map((event): TraceExportRuntimeEvent => {
        const { metadata, ...eventFields } = event;
        return {
          ...eventFields,
          label: this.#redactTraceText(
            event.label,
            sensitiveTextValues,
            selectedValueIsSensitive && (
              metadata?.targetNodeId === inspection.nodeId
              || metadata?.triggerTargetNodeId === inspection.nodeId
            ),
            event.type,
          ),
          ...(metadata ? { metadata: this.#redactMetadata(metadata) } : {}),
        };
      }),
    };
    if (inspection.source) trace.source = inspection.source;
    return trace;
  }

  formatTraceMarkdown(inspection: InspectionResult): string {
    const sensitiveTextValues = this.#collectSensitiveTextValues(inspection);
    const selectedValueIsSensitive = this.#inspectionContainsSensitiveValue(inspection);
    const lines = [
      "# CauseScope Trace",
      "",
      `- Element: <${inspection.element.tagName}> ${this.#redactTraceText(inspection.element.label, sensitiveTextValues, selectedValueIsSensitive)}`,
      `- Component: ${inspection.componentName ?? "Unknown"}`,
      `- Source: ${inspection.source ? `${inspection.source.file}:${inspection.source.line}:${inspection.source.column}` : "Unavailable"}`,
    ];
    for (const expression of inspection.expressions) {
      lines.push(
        "",
        `## ${expression.property}`,
        "",
        `- Expression: \`${expression.expression}\``,
        `- Result: \`${this.#displayExportValue(expression.result, expression.expression)}\``,
      );
      if (expression.decidingBranch) lines.push(`- Deciding branch: \`${expression.decidingBranch}\``);
      for (const origins of Object.values(expression.inputOrigins)) {
        for (const origin of origins) lines.push(`- ${origin.confidence === "confirmed" ? "Origin" : "Possible origin"}: ${origin.label}${origin.path ? ` \`${origin.path}\`` : ""}`);
      }
    }
    const update = inspection.correlatedStateUpdates[0] ?? inspection.stateUpdates[0];
    if (update) {
      lines.push(
        "",
        "## Last state change",
        "",
        `- State: \`${update.stateName}\``,
        `- Previous: \`${this.#displayExportValue(update.previous, update.stateName)}\``,
        `- Next: \`${this.#displayExportValue(update.next, update.stateName)}\``,
        `- Updated at: ${update.source.file}:${update.source.line}:${update.source.column}`,
        `- Triggered by: ${update.event?.type ?? "No captured event"}${update.event?.targetLabel ? ` · ${this.#redactTraceText(
          update.event.targetLabel,
          sensitiveTextValues,
          selectedValueIsSensitive && update.event.targetNodeId === inspection.nodeId,
        )}` : ""}`,
      );
    }
    return lines.join("\n");
  }

  inspectElement(element: Element): InspectionResult {
    const nodeId = element.getAttribute("data-causescope-node") ?? "cs_uninstrumented";
    const source = parseSource(element);
    const sourceSnippet = element.getAttribute("data-causescope-source") ?? undefined;
    let componentName = element.getAttribute("data-causescope-component") ?? undefined;
    let parentComponents: string[] = [];
    let currentHostProps: unknown;
    let componentStateBindings: Array<{ componentName: string; setterIdentities: object[] }> = [];
    let componentFrames: ComponentFrame[] = [];

    if (this.#adapter) {
      try {
        const fiber = this.#adapter.findFiberFromElement(element);
        if (fiber) currentHostProps = this.#adapter.getCurrentProps(fiber, element);
        const stack = this.#adapter.getComponentStack(element);
        parentComponents = stack;
        componentName = stack[0] ?? componentName;
        componentFrames = this.#adapter.getComponentFrames?.(element) ?? [];
        componentStateBindings = this.#adapter.getComponentStateBindings?.(element) ?? [];
      } catch {
        // Fiber is best-effort and isolated from the rest of the runtime.
      }
    }

    const sourceExpressions = [...(this.#expressionIdsByNode.get(nodeId)?.values() ?? [])]
      .map((id) => this.#expressions.get(id))
      .filter((expression): expression is ExpressionResult => Boolean(expression))
      .sort((left, right) => left.source.line - right.source.line || left.source.column - right.source.column);
    const currentlyRepeated = hasRepeatedSourceNodeIn(element.ownerDocument, nodeId);
    if (currentlyRepeated) this.#repeatedNodeIds.add(nodeId);
    const repeatedSourceNode = currentlyRepeated || this.#repeatedNodeIds.has(nodeId);
    const hasSpreadTrace = sourceExpressions.some((expression) => expression.kind === "spread");
    const traceCountByProperty = new Map<string, number>();
    for (const expression of sourceExpressions) {
      traceCountByProperty.set(expression.property, (traceCountByProperty.get(expression.property) ?? 0) + 1);
    }
    const expressions = repeatedSourceNode
      ? sourceExpressions.map((expression): ExpressionResult => {
        const {
          decidingBranch: _decidingBranch,
          conditionEvaluation: _conditionEvaluation,
          conditionalRenderResult: _conditionalRenderResult,
          inputOrigins: _inputOrigins,
          ...base
        } = expression;
        const selectedProp = expression.instanceBinding === "host-prop"
          && !(hasSpreadTrace && expression.kind === "attribute")
          && traceCountByProperty.get(expression.property) === 1
          ? readSelectedProp(currentHostProps, expression)
          : { found: false as const };
        return selectedProp.found
          ? {
            ...base,
            result: selectedProp.value,
            inputs: {},
            inputStateIds: {},
            inputOrigins: {},
            traceMode: "selected-instance-result",
          }
          : {
            ...base,
            result: undefined,
            inputs: {},
            inputStateIds: {},
            inputOrigins: {},
            traceMode: "ambiguous-instance",
          };
      })
      : sourceExpressions;
    const props: PropSnapshot[] = componentFrames.flatMap((frame, frameIndex) =>
      Object.entries(frame.props)
        .filter(([name]) => name !== "children")
        .map(([name, value]) => {
          const candidates = this.#propPasses.filter(
            (pass) => pass.metadata.componentName === frame.componentName
              && pass.metadata.property === name
              && Object.is(pass.value, value),
          );
          const snapshot: PropSnapshot = {
            name,
            value,
            componentName: frame.componentName,
            relationship: frameIndex === 0 ? "component" : "ancestor",
          };
          const callsites = new Map(candidates.map((candidate) => [candidate.metadata.id, candidate.metadata]));
          const singleCallsite = callsites.size === 1 ? [...callsites.values()][0] : undefined;
          if (singleCallsite) snapshot.passedFrom = singleCallsite;
          return snapshot;
        }),
    );
    for (const expression of expressions) {
      for (const originList of Object.values(expression.inputOrigins)) {
        for (const origin of originList) {
          if (origin.kind !== "prop") continue;
          const originComponent = origin.label.endsWith(".props") ? origin.label.slice(0, -6) : componentName;
          const propName = origin.path?.split(/[.\[]/, 1)[0];
          const prop = props.find((candidate) =>
            candidate.componentName === originComponent && (!propName || candidate.name === propName),
          );
          if (!prop?.passedFrom) continue;
          origin.source = prop.passedFrom.source;
          origin.traceId = prop.passedFrom.id;
          origin.metadata = {
            ...origin.metadata,
            parentComponentName: prop.passedFrom.parentComponentName,
            expression: prop.passedFrom.expression,
          };
        }
      }
    }
    const seenStateInstances = new Set<string>();
    const states: StateSnapshot[] = [];
    for (const [bindingIndex, binding] of componentStateBindings.entries()) {
      for (const setterIdentity of binding.setterIdentities) {
        const registered = this.#statesBySetter.get(setterIdentity);
        if (!registered || seenStateInstances.has(registered.instanceId)) continue;
        seenStateInstances.add(registered.instanceId);
        const latestUpdate = [...this.#stateUpdates]
          .reverse()
          .find((update) => update.instanceId === registered.instanceId);
        const snapshot: StateSnapshot = {
          stateId: registered.stateId,
          instanceId: registered.instanceId,
          stateName: registered.stateName,
          initial: registered.initial,
          current: registered.current,
          source: registered.source,
          relationship: bindingIndex === 0 ? "component" : "ancestor",
          hookType: registered.hookType,
        };
        if (registered.componentName ?? binding.componentName) {
          snapshot.componentName = registered.componentName ?? binding.componentName;
        }
        if (latestUpdate) snapshot.latestUpdate = latestUpdate;
        states.push(snapshot);
      }
    }
    const expressionStateIds = new Set(expressions.flatMap((expression) => Object.values(expression.inputStateIds)));
    const boundInstanceIds = new Set(states.map((state) => state.instanceId));
    const componentStateUpdates = expressions.length === 0
      ? []
      : this.#stateUpdates
        .filter((update) => {
          if (boundInstanceIds.size > 0) return Boolean(update.instanceId && boundInstanceIds.has(update.instanceId));
          if (repeatedSourceNode) return false;
          return !componentName || !update.componentName || update.componentName === componentName;
        })
        .slice(-8)
        .reverse();
    const correlatedStateUpdates = componentStateUpdates.filter((update) => expressionStateIds.has(update.stateId));
    const origins = this.#uniqueOrigins(expressions.flatMap((expression) => Object.values(expression.inputOrigins).flat()));
    const relatedNetworkIds = new Set(origins.flatMap((origin) => {
      const linkedNetworkId = origin.kind === "network"
        ? origin.traceId
        : typeof origin.metadata?.networkId === "string" ? origin.metadata.networkId : undefined;
      return linkedNetworkId ? [linkedNetworkId] : [];
    }));
    const networkRequests = this.#networkRequests.filter((request) => relatedNetworkIds.has(request.id));
    const directlyRelatedStorageIds = new Set(origins.filter((origin) => origin.kind === "storage").flatMap((origin) => origin.traceId ? [origin.traceId] : []));
    const relatedStorageKeys = new Set(origins.filter((origin) => origin.kind === "storage").map((origin) => `${origin.label}:${origin.path ?? ""}`));
    const storageAccesses = this.#storageAccesses.filter((access) =>
      directlyRelatedStorageIds.has(access.id)
      || relatedStorageKeys.has(`${access.storage}:${access.key}`),
    );
    const relatedStorageIds = new Set(storageAccesses.map((access) => access.id));
    const relatedStoreNames = new Set(origins.filter((origin) => origin.kind === "zustand").flatMap((origin) => {
      const storeName = origin.metadata?.storeName;
      return typeof storeName === "string" ? [storeName] : [];
    }));
    const storeUpdates = this.#storeUpdates.filter((update) => relatedStoreNames.has(update.storeName)).slice(-20).reverse();
    const relatedTriggerNodeIds = new Set(
      [...componentStateUpdates, ...storeUpdates].flatMap((update) =>
        update.event?.targetNodeId ? [update.event.targetNodeId] : [],
      ),
    );
    const relevantTimeline = expressions.length === 0
      ? []
      : this.#timeline
        .filter((event) => {
          const targetNodeId = event.metadata?.targetNodeId;
          const eventComponentName = event.metadata?.componentName;
          const eventInstanceId = event.metadata?.instanceId;
          const eventNetworkId = event.metadata?.networkId;
          const eventStorageId = event.metadata?.storageId;
          const eventStoreName = event.metadata?.storeName;
          return (!repeatedSourceNode && targetNodeId === nodeId)
            || Boolean(targetNodeId && relatedTriggerNodeIds.has(String(targetNodeId)))
            || Boolean(eventInstanceId && boundInstanceIds.has(String(eventInstanceId)))
            || Boolean(eventNetworkId && relatedNetworkIds.has(String(eventNetworkId)))
            || Boolean(eventStorageId && relatedStorageIds.has(String(eventStorageId)))
            || Boolean(eventStoreName && relatedStoreNames.has(String(eventStoreName)))
            || (!repeatedSourceNode && boundInstanceIds.size === 0 && Boolean(componentName && eventComponentName === componentName));
        })
        .slice(-20)
        .reverse();

    const inspection: InspectionResult = {
      nodeId,
      element: {
        tagName: element.tagName.toLowerCase(),
        label: getElementLabel(element),
        attributes: getElementAttributes(element),
      },
      parentComponents,
      expressions,
      props,
      origins,
      states,
      stateUpdates: componentStateUpdates,
      correlatedStateUpdates,
      networkRequests,
      storageAccesses,
      storeUpdates,
      timeline: relevantTimeline,
    };

    if (source) inspection.source = source;
    if (sourceSnippet) inspection.sourceSnippet = sourceSnippet;
    if (componentName) inspection.componentName = componentName;
    return this.#redactInspectionForDisplay(inspection);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getTimeline(): RuntimeEvent[] {
    return [...this.#timeline];
  }

  #recordStateUpdate<T>(
    input: TraceStateUpdateInput<T>,
    previous: T,
    next: T,
    updateType: StateUpdate["updateType"],
    eventContext: EventContext | null,
  ): void {
    try {
      const update: StateUpdate = {
        id: createId("cs_state", ++this.#sequence),
        stateId: input.stateId,
        stateName: input.stateName,
        previous,
        next,
        source: input.source,
        timestamp: Date.now(),
        updateType,
      };
      const registeredState = this.#statesBySetter.get(input.setter as unknown as object);
      if (registeredState) {
        registeredState.current = next;
        update.instanceId = registeredState.instanceId;
      }
      if (input.componentName) update.componentName = input.componentName;
      if (eventContext) update.event = eventContext;
      this.#stateUpdates.push(update);
      if (this.#stateUpdates.length > this.#maxTimelineEvents) this.#stateUpdates.shift();

      const label = `${input.stateName} ${this.#displayExportValue(previous, input.stateName)} → ${this.#displayExportValue(next, input.stateName)}`;
      this.recordEvent({
        type: "state-update",
        label,
        timestamp: update.timestamp,
        source: input.source,
        metadata: {
          stateId: input.stateId,
          componentName: input.componentName,
          instanceId: update.instanceId,
          triggerTargetNodeId: eventContext?.targetNodeId,
        },
      });
    } catch {
      // State tracing is best-effort. The setter still receives the original value.
    }
  }

  #recordResolvedReducerUpdate(
    registeredState: RegisteredState,
    previous: unknown,
    next: unknown,
    pendingDispatches: PendingReducerDispatch[],
  ): void {
    try {
      const first = pendingDispatches[0];
      if (!first) return;
      const reducerDispatches = pendingDispatches.map((pending) => ({
        action: pending.action,
        source: pending.source,
        ...(pending.event ? { event: pending.event } : {}),
      }));
      const sharedEvent = pendingDispatches.every((pending) =>
        pending.event?.type === first.event?.type
        && pending.event?.targetNodeId === first.event?.targetNodeId
        && pending.event?.timestamp === first.event?.timestamp,
      ) ? first.event : null;
      const update: StateUpdate = {
        id: createId("cs_state", ++this.#sequence),
        stateId: first.stateId,
        instanceId: registeredState.instanceId,
        stateName: first.stateName,
        previous,
        next,
        source: first.source,
        timestamp: Date.now(),
        updateType: "reducer",
        action: reducerDispatches.length === 1 ? first.action : reducerDispatches.map((dispatch) => dispatch.action),
        reducerDispatches,
      };
      if (first.componentName) update.componentName = first.componentName;
      if (sharedEvent) update.event = sharedEvent;
      registeredState.current = next;
      this.#stateUpdates.push(update);
      if (this.#stateUpdates.length > this.#maxTimelineEvents) this.#stateUpdates.shift();
      this.recordEvent({
        type: "state-update",
        label: `${first.stateName} ${this.#displayExportValue(previous, first.stateName)} → ${this.#displayExportValue(next, first.stateName)}`,
        timestamp: update.timestamp,
        source: first.source,
        metadata: {
          stateId: first.stateId,
          componentName: first.componentName,
          instanceId: registeredState.instanceId,
          triggerTargetNodeId: sharedEvent?.targetNodeId,
          updateType: "reducer",
          reducerActionCount: reducerDispatches.length,
        },
      });
    } catch {
      // Reducer tracing is best effort.
    }
  }

  #registerOrigin(
    value: unknown,
    origin: ValueOrigin,
    recursive: boolean,
    depth: number,
    seen: WeakSet<object>,
    primitivePersistent: boolean,
  ): void {
    if ((typeof value !== "object" || value === null) && typeof value !== "function") return;
    const objectValue = value as object;
    if (seen.has(objectValue)) return;
    seen.add(objectValue);
    const existing = this.#valueOrigins.get(objectValue) ?? [];
    const duplicateIndex = existing.findIndex((candidate) =>
      candidate.kind === origin.kind
      && candidate.traceId === origin.traceId
      && candidate.path === origin.path
      && candidate.label === origin.label,
    );
    const updated = [...existing];
    if (duplicateIndex >= 0) updated.splice(duplicateIndex, 1, origin);
    else updated.push(origin);
    this.#valueOrigins.set(objectValue, updated.slice(-12));
    if (!recursive || depth >= 5) return;

    let entries: Array<readonly [string, unknown]>;
    try {
      entries = Object.entries(Object.getOwnPropertyDescriptors(value))
        .filter(([, descriptor]) => descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value"))
        .slice(0, 100)
        .map(([key, descriptor]) => [key, descriptor.value] as const);
    } catch {
      return;
    }
    for (const [key, child] of entries) {
      const segment = Array.isArray(value) ? `[${key}]` : `.${key}`;
      const childOrigin: ValueOrigin = {
        ...origin,
        id: createId("cs_origin", ++this.#sequence),
        path: `${origin.path ?? "value"}${segment}`,
      };
      if ((typeof child === "object" && child !== null) || typeof child === "function") {
        this.#registerOrigin(child, childOrigin, true, depth + 1, seen, primitivePersistent);
      } else {
        this.#registerPrimitiveOrigin(child, childOrigin, primitivePersistent);
      }
    }
  }

  #originsForValue(value: unknown, hint?: CaptureOriginHint): ValueOrigin[] {
    const origins: ValueOrigin[] = [];
    if (hint?.origin) origins.push(this.#appendOriginAccessPath(hint.origin, hint.accessPath));
    const pathOrigins = hint?.originValue
      && ((typeof hint.originValue === "object" && hint.originValue !== null) || typeof hint.originValue === "function")
      && hint.accessPath
      ? this.#originsAlongAccessPath(hint.originValue as object, hint.accessPath)
      : [];
    if ((typeof value === "object" && value !== null) || typeof value === "function") {
      origins.push(...(this.#valueOrigins.get(value as object) ?? []));
    } else if (!hint?.origin && pathOrigins.length === 0) {
      const threshold = Date.now() - 50;
      const candidates: RecentPrimitiveOrigin[] = [];
      for (let index = this.#recentPrimitiveOrigins.length - 1; index >= 0; index -= 1) {
        const candidate = this.#recentPrimitiveOrigins[index];
        if (!candidate || (!candidate.persistent && candidate.timestamp < threshold)) continue;
        if (Object.is(candidate.value, value)) candidates.push(candidate);
      }
      // Primitive identity is not unique. Only infer provenance when every
      // recent match points to the same semantic source; otherwise report no
      // origin rather than attributing (for example) a localStorage null to a
      // later sessionStorage read that also returned null.
      const semanticSources = new Set(candidates.map((candidate) => [
        candidate.origin.kind,
        candidate.origin.traceId ?? "",
        candidate.origin.label,
        candidate.origin.path ?? "",
      ].join(":")));
      if (semanticSources.size === 1 && candidates[0]) {
        // JavaScript primitives have no identity. A value-only match can be a
        // useful lead, but it cannot prove that this render consumed the
        // adapter value instead of an unrelated equal literal.
        origins.push({ ...candidates[0].origin, confidence: "possible" });
      }
    }
    origins.push(...pathOrigins);
    return this.#uniqueOrigins(origins);
  }

  #originsAlongAccessPath(originValue: object, accessPath: string): ValueOrigin[] {
    const segments = parseAccessPath(accessPath);
    if (!segments) return [];
    let current: unknown = originValue;
    let deepest: ValueOrigin[] = [];

    for (let consumed = 0; consumed <= segments.length; consumed += 1) {
      if ((typeof current === "object" && current !== null) || typeof current === "function") {
        const candidates = this.#valueOrigins.get(current as object) ?? [];
        if (candidates.length > 0) {
          const remainingPath = formatAccessPath(segments.slice(consumed));
          deepest = candidates.map((origin) => this.#appendOriginAccessPath(origin, remainingPath));
        }
      }
      if (consumed === segments.length) break;
      if ((typeof current !== "object" || current === null) && typeof current !== "function") break;
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(current, segments[consumed]?.key ?? "");
      } catch {
        break;
      }
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) break;
      current = descriptor.value;
    }

    return deepest;
  }

  #appendOriginAccessPath(origin: ValueOrigin, accessPath: string | undefined): ValueOrigin {
    if (!accessPath) return origin;
    const basePath = origin.path ?? (origin.kind === "prop" ? "" : "value");
    const separator = !basePath || accessPath.startsWith("[") ? "" : ".";
    return {
      ...origin,
      id: createId("cs_origin", ++this.#sequence),
      path: `${basePath}${separator}${accessPath}`,
    };
  }

  #uniqueOrigins(origins: ValueOrigin[]): ValueOrigin[] {
    const seen = new Set<string>();
    return origins.filter((origin) => {
      const key = [origin.kind, origin.traceId, origin.label, origin.path, origin.confidence].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  #registerPrimitiveOrigin(value: unknown, origin: ValueOrigin, persistent = false): void {
    const duplicateIndex = this.#recentPrimitiveOrigins.findIndex((candidate) =>
      candidate.persistent === persistent
      && candidate.origin.kind === origin.kind
      && candidate.origin.traceId === origin.traceId
      && candidate.origin.path === origin.path
      && candidate.origin.label === origin.label,
    );
    if (duplicateIndex >= 0) this.#recentPrimitiveOrigins.splice(duplicateIndex, 1);
    this.#recentPrimitiveOrigins.push({ value, origin, timestamp: Date.now(), ...(persistent ? { persistent: true } : {}) });
    if (this.#recentPrimitiveOrigins.length > 100) this.#recentPrimitiveOrigins.shift();
  }

  #beginNetworkRequest(input: {
    transport: "fetch" | "xhr";
    method: string;
    url: string;
    headers?: HeadersInit;
  }): string | null {
    if (!this.#traceNetwork) return null;
    const request: NetworkTrace = {
      id: createId("cs_network", ++this.#sequence),
      transport: input.transport,
      method: input.method.toUpperCase(),
      url: redactUrl(input.url, this.#redact),
      startedAt: Date.now(),
    };
    this.#networkRequests.push(request);
    if (this.#networkRequests.length > this.#maxTimelineEvents) this.#networkRequests.shift();
    this.recordEvent({
      type: "network-start",
      label: `${request.method} ${request.url}`,
      timestamp: request.startedAt,
      metadata: {
        networkId: request.id,
        transport: request.transport,
        headers: redactHeaders(input.headers, this.#redact),
      },
    });
    return request.id;
  }

  #completeNetworkRequest(input: { id: string; status?: number; responseType?: string; error?: unknown }): void {
    if (!this.#traceNetwork) return;
    const request = this.#networkRequests.find((candidate) => candidate.id === input.id);
    if (!request) return;
    request.completedAt = Date.now();
    if (input.status !== undefined) request.status = input.status;
    if (input.responseType !== undefined) request.responseType = input.responseType;
    if (input.error !== undefined) request.error = input.error instanceof Error ? input.error.message : String(input.error);
    this.recordEvent({
      type: "network-complete",
      label: `${request.method} ${request.url} ${request.error ? "failed" : request.status ?? "complete"}`,
      timestamp: request.completedAt,
      metadata: { networkId: request.id, status: request.status, transport: request.transport },
    });
  }

  #recordNetworkBody(id: string, value: unknown, responseType: string): void {
    if (!this.#traceNetwork) return;
    const request = this.#networkRequests.find((candidate) => candidate.id === id);
    if (!request) return;
    const serialized = serializeValue(value, this.#redact);
    const bytes = serializedByteLength(serialized);
    request.responseType = responseType;
    if (request.responseBody === undefined) {
      request.responseBytes = bytes;
      const exceedsPerResponse = bytes > this.#maxNetworkResponseBytes;
      const exceedsTotal = this.#networkBytes + bytes > this.#maxNetworkBytes;
      if (exceedsPerResponse || exceedsTotal) {
        request.truncated = true;
        request.responseBody = { type: "unsupported", reason: exceedsPerResponse ? "Response exceeds 1 MB recording limit" : "Total network recording limit reached" };
      } else {
        request.responseBody = serialized;
        this.#networkBytes += bytes;
      }
    }
    const origin: ValueOrigin = {
      id: createId("cs_origin", ++this.#sequence),
      kind: "network",
      confidence: "confirmed",
      label: `${request.method} ${request.url}`,
      path: "response",
      traceId: request.id,
      metadata: { status: request.status, transport: request.transport },
    };
    if ((typeof value === "object" && value !== null) || typeof value === "function") {
      this.#registerOrigin(value, origin, true, 0, new WeakSet<object>(), false);
    } else {
      this.#registerPrimitiveOrigin(value, origin);
    }
    this.#notify();
  }

  #recordStorageAccess(input: {
    storage: "localStorage" | "sessionStorage";
    operation: "getItem" | "setItem" | "removeItem";
    key: string;
    value?: string | null;
  }): void {
    if (!this.#traceStorage) return;
    const access: StorageTrace = {
      id: createId("cs_storage", ++this.#sequence),
      storage: input.storage,
      operation: input.operation,
      key: input.key,
      timestamp: Date.now(),
    };
    if (input.value !== undefined) access.value = this.#isSensitiveKey(input.key) ? "[REDACTED]" : input.value;
    this.#storageAccesses.push(access);
    if (this.#storageAccesses.length > this.#maxTimelineEvents) this.#storageAccesses.shift();

    if (input.operation === "getItem") {
      const origin: ValueOrigin = {
        id: createId("cs_origin", ++this.#sequence),
        kind: "storage",
        confidence: this.#activeExpressionCapture ? "confirmed" : "possible",
        label: input.storage,
        path: input.key,
        traceId: access.id,
      };
      this.#registerPrimitiveOrigin(input.value ?? null, origin);
      if (this.#activeExpressionCapture) {
        this.#activeExpressionCapture.origins.set(`${input.storage}.${input.key}`, [origin]);
      }
    }
    this.recordEvent({
      type: "storage",
      label: `${input.storage}.${input.operation}("${input.key}")`,
      timestamp: access.timestamp,
      metadata: { storageId: access.id, storage: input.storage, key: input.key, operation: input.operation },
    });
  }

  #inspectionContainsSensitiveValue(inspection: InspectionResult): boolean {
    return inspection.expressions.some((expression) =>
      (expression.result !== undefined && (
        this.#isSensitiveKey(expression.expression)
        || this.#isSensitiveKey(expression.property)
      ))
      || Object.entries(expression.inputs).some(([key, value]) =>
        value !== undefined && this.#isSensitiveKey(key),
      ),
    )
      || inspection.props.some((prop) => prop.value !== undefined && this.#isSensitiveKey(prop.name))
      || inspection.states.some((state) => (
        state.initial !== undefined
        || state.current !== undefined
        || state.latestUpdate?.previous !== undefined
        || state.latestUpdate?.next !== undefined
        || state.latestUpdate?.action !== undefined
      ) && this.#isSensitiveKey(state.stateName))
      || inspection.storageAccesses.some((access) =>
        access.value !== undefined && this.#isSensitiveKey(access.key),
      );
  }

  #collectSensitiveTextValues(inspection: InspectionResult): string[] {
    const values = new Set<string>();
    const seen = [new WeakSet<object>(), new WeakSet<object>()] as const;
    const queryKeySeen = [new WeakSet<object>(), new WeakSet<object>()] as const;
    const add = (value: unknown, key: string, inheritedSensitive = false, depth = 0): void => {
      const sensitive = inheritedSensitive || this.#isSensitiveKey(key);
      if (
        typeof value === "string"
        || typeof value === "number"
        || typeof value === "bigint"
        || typeof value === "boolean"
      ) {
        if (!sensitive) return;
        const text = String(value);
        if (text && text !== "[REDACTED]") values.add(text);
        return;
      }
      if (value === null || typeof value !== "object" || depth >= 5) return;
      const seenForContext = seen[sensitive ? 1 : 0];
      if (seenForContext.has(value)) return;
      seenForContext.add(value);
      let descriptors: Record<string, PropertyDescriptor>;
      try {
        descriptors = Object.getOwnPropertyDescriptors(value);
      } catch {
        return;
      }
      for (const [property, descriptor] of Object.entries(descriptors)
        .filter(([, candidate]) => candidate.enumerable)
        .slice(0, 100)) {
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) continue;
        add(descriptor.value, property, sensitive, depth + 1);
      }
    };
    const addQueryKey = (value: unknown, inheritedSensitive = false, depth = 0): void => {
      if (
        typeof value === "string"
        || typeof value === "number"
        || typeof value === "bigint"
        || typeof value === "boolean"
      ) {
        if (!inheritedSensitive) return;
        const text = String(value);
        if (text && text !== "[REDACTED]") values.add(text);
        return;
      }
      if (value === null || typeof value !== "object" || depth >= 5) return;
      const seenForContext = queryKeySeen[inheritedSensitive ? 1 : 0];
      if (seenForContext.has(value)) return;
      seenForContext.add(value);
      let descriptors: Record<string, PropertyDescriptor>;
      try {
        descriptors = Object.getOwnPropertyDescriptors(value);
      } catch {
        return;
      }
      const entries = Object.entries(descriptors)
        .filter(([, descriptor]) => descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value"))
        .slice(0, 100);
      let previous: unknown;
      for (const [property, descriptor] of entries) {
        const tupleValueIsSensitive = Array.isArray(value)
          && typeof previous === "string"
          && this.#isSensitiveKey(previous);
        addQueryKey(
          descriptor.value,
          inheritedSensitive || tupleValueIsSensitive || (!Array.isArray(value) && this.#isSensitiveKey(property)),
          depth + 1,
        );
        previous = descriptor.value;
      }
    };
    for (const expression of inspection.expressions) {
      add(expression.result, expression.expression);
      for (const [key, value] of Object.entries(expression.inputs)) add(value, key);
    }
    for (const prop of inspection.props) add(prop.value, prop.name);
    for (const state of inspection.states) {
      add(state.initial, state.stateName);
      add(state.current, state.stateName);
      if (state.latestUpdate) {
        add(state.latestUpdate.previous, state.stateName);
        add(state.latestUpdate.next, state.stateName);
      }
    }
    for (const access of inspection.storageAccesses) add(access.value, access.key);
    for (const origin of inspection.origins) {
      if (origin.kind === "react-query" && origin.metadata?.queryKey !== undefined) {
        addQueryKey(origin.metadata.queryKey);
      }
    }
    return [...values].sort((left, right) => right.length - left.length);
  }

  #redactInspectionForDisplay(inspection: InspectionResult): InspectionResult {
    const sensitiveValues = this.#collectSensitiveTextValues(inspection);
    const selectedValueIsSensitive = this.#inspectionContainsSensitiveValue(inspection);
    const redactValue = (value: unknown, key?: string): unknown => this.#redactInspectionValue(
      value,
      key,
      sensitiveValues,
      0,
      new WeakSet<object>(),
    );
    const redactEvent = (event: EventContext): EventContext => this.#redactEventContext(
      event,
      sensitiveValues,
      selectedValueIsSensitive && event.targetNodeId === inspection.nodeId,
    );
    const redactUpdate = (update: StateUpdate): StateUpdate => ({
      ...update,
      previous: redactValue(update.previous, update.stateName),
      next: redactValue(update.next, update.stateName),
      ...(update.action !== undefined ? { action: redactValue(update.action) } : {}),
      ...(update.event ? { event: redactEvent(update.event) } : {}),
      ...(update.reducerDispatches ? {
        reducerDispatches: update.reducerDispatches.map((dispatch) => ({
          ...dispatch,
          action: redactValue(dispatch.action),
          ...(dispatch.event ? { event: redactEvent(dispatch.event) } : {}),
        })),
      } : {}),
    });
    const redactOrigin = (origin: ValueOrigin): ValueOrigin => ({
      ...origin,
      ...(origin.metadata ? {
        metadata: Object.fromEntries(Object.entries(origin.metadata).map(([key, value]) => [
          key,
          redactValue(value, key),
        ])),
      } : {}),
    });
    const redactCondition = (evaluation: ConditionEvaluation): ConditionEvaluation => ({
      ...evaluation,
      ...(Object.prototype.hasOwnProperty.call(evaluation, "value") ? {
        value: redactValue(evaluation.value, evaluation.expression),
      } : {}),
      ...(evaluation.children ? { children: evaluation.children.map(redactCondition) } : {}),
    });
    const redactExpression = (expression: ExpressionResult): ExpressionResult => ({
      ...expression,
      result: redactValue(expression.result, expression.expression),
      inputs: Object.fromEntries(Object.entries(expression.inputs).map(([key, value]) => [
        key,
        redactValue(value, key),
      ])),
      inputOrigins: Object.fromEntries(Object.entries(expression.inputOrigins).map(([key, origins]) => [
        key,
        origins.map(redactOrigin),
      ])),
      ...(expression.conditionEvaluation ? {
        conditionEvaluation: redactCondition(expression.conditionEvaluation),
      } : {}),
    });
    const redactState = (state: StateSnapshot): StateSnapshot => ({
      ...state,
      initial: redactValue(state.initial, state.stateName),
      current: redactValue(state.current, state.stateName),
      ...(state.latestUpdate ? { latestUpdate: redactUpdate(state.latestUpdate) } : {}),
    });
    const passwordInput = inspection.element.attributes.type?.toLowerCase() === "password";

    return {
      ...inspection,
      element: {
        ...inspection.element,
        label: this.#redactTraceText(inspection.element.label, sensitiveValues, selectedValueIsSensitive),
        attributes: Object.fromEntries(Object.entries(inspection.element.attributes).map(([name, value]) => [
          name,
          passwordInput && name.toLowerCase() === "value"
            ? "[REDACTED]"
            : this.#redactTraceText(this.#redactExportAttribute(name, value), sensitiveValues),
        ])),
      },
      expressions: inspection.expressions.map(redactExpression),
      props: inspection.props.map((prop) => ({ ...prop, value: redactValue(prop.value, prop.name) })),
      origins: inspection.origins.map(redactOrigin),
      states: inspection.states.map(redactState),
      stateUpdates: inspection.stateUpdates.map(redactUpdate),
      correlatedStateUpdates: inspection.correlatedStateUpdates.map(redactUpdate),
      networkRequests: inspection.networkRequests.map((request) => ({
        ...request,
        ...(request.error ? { error: this.#redactTraceText(request.error, sensitiveValues) } : {}),
      })),
      storageAccesses: inspection.storageAccesses.map((access) => ({
        ...access,
        ...(access.value !== undefined ? {
          value: redactValue(access.value, access.key) as string | null,
        } : {}),
      })),
      storeUpdates: inspection.storeUpdates.map((update) => ({
        ...update,
        ...(update.event ? { event: redactEvent(update.event) } : {}),
      })),
      timeline: inspection.timeline.map((event) => ({
        ...event,
        label: this.#redactTraceText(
          event.label,
          sensitiveValues,
          selectedValueIsSensitive && (
            event.metadata?.targetNodeId === inspection.nodeId
            || event.metadata?.triggerTargetNodeId === inspection.nodeId
          ),
          event.type,
        ),
        ...(event.metadata ? {
          metadata: Object.fromEntries(Object.entries(event.metadata).map(([key, value]) => [
            key,
            redactValue(value, key),
          ])),
        } : {}),
      })),
    };
  }

  #redactInspectionValue(
    value: unknown,
    key: string | undefined,
    sensitiveValues: string[],
    depth: number,
    seen: WeakSet<object>,
  ): unknown {
    if (value === undefined) return undefined;
    if (key && this.#isQueryKeyMetadataKey(key)) {
      const sanitized = this.#redactInspectionValue(value, undefined, sensitiveValues, depth, seen);
      return this.#redactQueryKeyTuples(sanitized);
    }
    if (key && this.#isSensitiveKey(key)) return "[REDACTED]";
    if (typeof value === "string") return this.#redactTraceText(value, sensitiveValues);
    if (value === null || typeof value !== "object") return value;
    if (value instanceof Date) return new Date(value.valueOf());
    if (typeof Element !== "undefined" && value instanceof Element) return "[DOM node]";
    if (seen.has(value)) return "[Circular reference]";
    if (depth >= 5) return "[Maximum depth reached]";
    seen.add(value);

    let descriptors: Record<string, PropertyDescriptor>;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return "[Properties unavailable]";
    }

    if (Array.isArray(value)) {
      const length = Math.min(value.length, 100);
      return Array.from({ length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return undefined;
        return Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? this.#redactInspectionValue(descriptor.value, undefined, sensitiveValues, depth + 1, seen)
          : "[Accessor not evaluated]";
      });
    }

    return Object.fromEntries(Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor.enumerable)
      .slice(0, 100)
      .map(([property, descriptor]) => [
        property,
        Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? this.#redactInspectionValue(descriptor.value, property, sensitiveValues, depth + 1, seen)
          : "[Accessor not evaluated]",
      ]));
  }

  #redactQueryKeyTuples(value: unknown, depth = 0): unknown {
    if (depth >= 5) return value;
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const previous = value[index - 1];
        if (index > 0 && typeof previous === "string" && this.#isSensitiveKey(previous)) {
          return "[REDACTED]";
        }
        return this.#redactQueryKeyTuples(item, depth + 1);
      });
    }
    if (isRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([property, item]) => [
        property,
        this.#redactQueryKeyTuples(item, depth + 1),
      ]));
    }
    return value;
  }

  #redactTraceText(text: string, sensitiveValues: string[], force = false, prefix?: string): string {
    let redacted = text;
    for (const sensitiveValue of sensitiveValues) {
      redacted = redacted.split(sensitiveValue).join("[REDACTED]");
    }
    if (force && redacted === text && !redacted.includes("[REDACTED]")) {
      const quotedLabel = redacted.match(/^(.*\")([^\"]*)(\")$/);
      if (quotedLabel) return `${quotedLabel[1]}[REDACTED]${quotedLabel[3]}`;
      return prefix ? `${prefix} [REDACTED]` : "[REDACTED]";
    }
    return redacted;
  }

  #redactEventContext(event: EventContext, sensitiveValues: string[], forceTargetLabel: boolean): EventContext {
    return {
      ...event,
      ...(event.targetLabel ? {
        targetLabel: this.#redactTraceText(event.targetLabel, sensitiveValues, forceTargetLabel),
      } : {}),
    };
  }

  #isSensitiveKey(key: string): boolean {
    return isSensitiveKey(key, [...this.#redact.objectKeys, ...this.#redact.queryParams]);
  }

  #isQueryKeyMetadataKey(key: string): boolean {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "") === "querykey";
  }

  #redactExportValue(value: unknown, key?: string): SerializedValue {
    if (value === undefined) return { type: "undefined" };
    if (key && this.#isSensitiveKey(key)) return { type: "primitive", value: "[REDACTED]" };
    if (key && this.#isQueryKeyMetadataKey(key)) {
      const sanitized = this.#redactInspectionValue(value, key, [], 0, new WeakSet<object>());
      return serializeValue(sanitized, this.#redact);
    }
    return serializeValue(value, this.#redact);
  }

  #redactMetadata(metadata: Record<string, unknown>): Record<string, SerializedValue> {
    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [
      key,
      this.#redactExportValue(value, key),
    ]));
  }

  #redactConditionEvaluation(evaluation: ConditionEvaluation): TraceExportConditionEvaluation {
    const { children, value, ...definition } = evaluation;
    return {
      ...definition,
      ...(Object.prototype.hasOwnProperty.call(evaluation, "value") ? {
        value: this.#redactExportValue(value, evaluation.expression),
      } : {}),
      ...(children ? {
        children: children.map((child) => this.#redactConditionEvaluation(child)),
      } : {}),
    };
  }

  #displayExportValue(value: unknown, key?: string): string {
    const serialized = this.#redactExportValue(value, key);
    if (serialized.type === "primitive") return displayValue(serialized.value);
    if (serialized.type === "undefined") return "undefined";
    if (serialized.type === "date") return serialized.value;
    if (serialized.type === "function") {
      return typeof serialized.name === "string" ? `[function ${serialized.name}]` : "[function]";
    }
    if (serialized.type === "array") return `[Array(${serialized.value.length})]`;
    if (serialized.type === "object") return "[Object]";
    if (serialized.type === "react-element") return "[React element]";
    if (serialized.type === "dom-node") return "[DOM node]";
    return `[${serialized.reason}]`;
  }

  #redactExportAttribute(name: string, value: string): string {
    if (this.#isSensitiveKey(name)) return "[REDACTED]";
    if (["href", "src", "action", "formaction"].includes(name.toLowerCase())) {
      return redactUrl(value, this.#redact);
    }
    return value;
  }

  #trimTimeline(): void {
    while (this.#timeline.length > this.#maxTimelineEvents) this.#timeline.shift();
  }

  #recordExpression(
    metadata: ExpressionTraceMetadata,
    result: unknown,
    inputs: Record<string, unknown>,
    inputStateIds: Record<string, string>,
    inputOrigins: Record<string, ValueOrigin[]>,
    traceMode: ExpressionResult["traceMode"],
  ): void {
    try {
      const conditionEvaluation = evaluateCondition(metadata.condition, inputs, result);
      const trace: ExpressionResult = {
        ...metadata,
        result,
        inputs,
        inputStateIds,
        inputOrigins,
        traceMode,
        timestamp: Date.now(),
      };
      if (conditionEvaluation) trace.conditionEvaluation = conditionEvaluation;
      const decidingBranch = findDecidingBranch(conditionEvaluation) ?? metadata.decisionLabel;
      if (typeof result === "boolean" && traceMode === "operands" && decidingBranch) trace.decidingBranch = decidingBranch;
      const conditionalRenderResult = evaluateConditionalRender(metadata.conditionalRender, conditionEvaluation, result);
      if (conditionalRenderResult) trace.conditionalRenderResult = conditionalRenderResult;
      const previousTrace = this.#expressions.get(metadata.id);
      this.#expressions.set(metadata.id, trace);
      const nodeExpressionIds = this.#expressionIdsByNode.get(metadata.nodeId) ?? new Map<string, string>();
      const expressionSlot = [
        metadata.kind,
        metadata.property,
        metadata.source.file,
        metadata.source.line,
        metadata.source.column,
      ].join(":");
      const previousExpressionId = nodeExpressionIds.get(expressionSlot);
      if (previousExpressionId && previousExpressionId !== metadata.id) {
        this.#expressions.delete(previousExpressionId);
      }
      nodeExpressionIds.set(expressionSlot, metadata.id);
      this.#expressionIdsByNode.set(metadata.nodeId, nodeExpressionIds);
      while (this.#expressions.size > this.#maxTraceNodes) {
        const oldest = this.#expressions.keys().next().value as string | undefined;
        if (!oldest) break;
        this.#expressions.delete(oldest);
      }
      const functionIdentityOnlyChange = typeof previousTrace?.result === "function" && typeof result === "function";
      if (previousTrace && !Object.is(previousTrace.result, result) && !functionIdentityOnlyChange) {
        this.recordEvent({
          type: "expression-update",
          label: `${metadata.property} ${this.#displayExportValue(previousTrace.result, metadata.expression)} → ${this.#displayExportValue(result, metadata.expression)}`,
          timestamp: trace.timestamp,
          source: metadata.source,
          metadata: {
            targetNodeId: metadata.nodeId,
            componentName: metadata.componentName,
            property: metadata.property,
          },
        });
      }
      this.#scheduleMultiplicityCheck(metadata.nodeId);
      this.#scheduleExpressionNotify();
    } catch {
      // Runtime failures must never change the host expression result.
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {
        // Subscribers are isolated from runtime recording.
      }
    }
  }

  #scheduleExpressionNotify(): void {
    if (this.#expressionNotifyScheduled) return;
    this.#expressionNotifyScheduled = true;
    queueMicrotask(() => {
      this.#expressionNotifyScheduled = false;
      this.#notify();
    });
  }

  #scheduleMultiplicityCheck(nodeId: string): void {
    if (typeof document === "undefined" || nodeId === "cs_uninstrumented") return;
    this.#pendingMultiplicityChecks.add(nodeId);
    if (this.#multiplicityCheckScheduled) return;
    this.#multiplicityCheckScheduled = true;
    setTimeout(() => {
      this.#multiplicityCheckScheduled = false;
      const pendingNodeIds = new Set(this.#pendingMultiplicityChecks);
      this.#pendingMultiplicityChecks.clear();
      const counts = new Map<string, number>();
      for (const candidate of document.querySelectorAll("[data-causescope-node]")) {
        const candidateNodeId = candidate.getAttribute("data-causescope-node");
        if (!candidateNodeId || !pendingNodeIds.has(candidateNodeId)) continue;
        counts.set(candidateNodeId, (counts.get(candidateNodeId) ?? 0) + 1);
      }
      let foundNewRepeatedNode = false;
      for (const pendingNodeId of pendingNodeIds) {
        if ((counts.get(pendingNodeId) ?? 0) < 2) continue;
        if (!this.#repeatedNodeIds.has(pendingNodeId)) foundNewRepeatedNode = true;
        this.#repeatedNodeIds.add(pendingNodeId);
      }
      if (foundNewRepeatedNode) this.#notify();
    }, 0);
  }
}

declare global {
  interface Window {
    __CAUSESCOPE__?: CauseScopeRuntime;
  }
}

let serverRuntime: CauseScopeRuntimeImpl | null = null;

export function getCauseScopeRuntime(options: CauseScopeRuntimeOptions = {}): CauseScopeRuntimeImpl {
  if (typeof window === "undefined") {
    serverRuntime ??= new CauseScopeRuntimeImpl(options);
    return serverRuntime;
  }

  if (window.__CAUSESCOPE__ instanceof CauseScopeRuntimeImpl) return window.__CAUSESCOPE__;
  const runtime = new CauseScopeRuntimeImpl(options);
  window.__CAUSESCOPE__ = runtime;
  return runtime;
}
