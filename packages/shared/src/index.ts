export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface SourceNode {
  id: string;
  tagName?: string;
  componentName?: string;
  location: SourceLocation;
}

export type TraceNodeType =
  | "dom"
  | "jsx"
  | "expression"
  | "component"
  | "prop"
  | "state"
  | "store"
  | "network"
  | "storage"
  | "event"
  | "function";

export interface TraceNode {
  id: string;
  type: TraceNodeType;
  label: string;
  source?: SourceLocation;
  value?: SerializedValue;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export type TraceEdgeType =
  | "rendered-by"
  | "derived-from"
  | "passed-as-prop"
  | "updated-by"
  | "triggered-by"
  | "read-from"
  | "caused-render"
  | "returned-by";

export interface TraceEdge {
  from: string;
  to: string;
  type: TraceEdgeType;
}

export type SerializedValue =
  | { type: "primitive"; value: unknown }
  | { type: "date"; value: string }
  | { type: "array"; value: SerializedValue[]; truncated?: boolean }
  | { type: "object"; value: Record<string, SerializedValue>; truncated?: boolean }
  | { type: "function"; name?: string }
  | { type: "react-element"; component?: string }
  | { type: "dom-node"; tagName?: string }
  | { type: "unsupported"; reason: string };

export type ExpressionTraceKind = "attribute" | "children" | "spread";

export interface ExpressionTraceMetadata {
  id: string;
  nodeId: string;
  kind: ExpressionTraceKind;
  property: string;
  expression: string;
  source: SourceLocation;
  componentName?: string;
  decisionLabel?: string;
  instanceBinding?: "host-prop";
  condition?: ConditionDefinition;
  conditionalRender?: ConditionalRenderDefinition;
}

export type ConditionNodeType =
  | "identifier"
  | "member"
  | "literal"
  | "unary"
  | "logical"
  | "binary"
  | "conditional"
  | "call"
  | "unknown";

export interface ConditionDefinition {
  id: string;
  type: ConditionNodeType;
  expression: string;
  operator?: string;
  inputName?: string;
  literalValue?: unknown;
  children?: ConditionDefinition[];
}

export interface ConditionEvaluation extends ConditionDefinition {
  evaluated: boolean;
  shortCircuited?: boolean;
  deciding?: boolean;
  value?: unknown;
  children?: ConditionEvaluation[];
}

export interface ConditionalRenderDefinition {
  kind: "logical" | "conditional";
  conditionExpression: string;
  renderedBranch: string;
  alternateBranch?: string;
}

export interface ConditionalRenderResult extends ConditionalRenderDefinition {
  outcome: "rendered" | "hidden" | "consequent" | "alternate";
  skippedBranch?: string;
  failedCondition?: string;
}

export type OriginKind = "prop" | "network" | "react-query" | "zustand" | "storage";
export type OriginConfidence = "confirmed" | "possible" | "lost";

export interface ValueOrigin {
  id: string;
  kind: OriginKind;
  confidence: OriginConfidence;
  label: string;
  path?: string;
  source?: SourceLocation;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface CaptureOriginHint {
  origin?: ValueOrigin;
  originValue?: unknown;
  accessPath?: string;
}

export interface ExpressionResult extends ExpressionTraceMetadata {
  result: unknown;
  inputs: Record<string, unknown>;
  inputStateIds: Record<string, string>;
  inputOrigins: Record<string, ValueOrigin[]>;
  traceMode: "operands" | "result-only" | "selected-instance-result" | "ambiguous-instance";
  decidingBranch?: string;
  conditionEvaluation?: ConditionEvaluation;
  conditionalRenderResult?: ConditionalRenderResult;
  timestamp: number;
}

export interface EventContext {
  type: string;
  targetNodeId?: string;
  targetLabel?: string;
  source?: SourceLocation;
  handlerProperty?: string;
  handlerExpression?: string;
  timestamp: number;
}

export interface ReducerDispatchTrace {
  action: unknown;
  source: SourceLocation;
  event?: EventContext;
}

export interface StateUpdate {
  id: string;
  stateId: string;
  instanceId?: string;
  stateName: string;
  componentName?: string;
  previous: unknown;
  next: unknown;
  source: SourceLocation;
  event?: EventContext;
  timestamp: number;
  updateType: "value" | "functional" | "reducer";
  action?: unknown;
  reducerDispatches?: ReducerDispatchTrace[];
}

export interface StateSnapshot {
  stateId: string;
  instanceId: string;
  stateName: string;
  componentName?: string;
  initial: unknown;
  current: unknown;
  source: SourceLocation;
  relationship: "component" | "ancestor";
  hookType: "state" | "reducer";
  latestUpdate?: StateUpdate;
}

export interface RuntimeEvent {
  id: string;
  type: string;
  label: string;
  timestamp: number;
  source?: SourceLocation;
  metadata?: Record<string, unknown>;
}

export interface PropPassMetadata {
  id: string;
  componentName: string;
  parentComponentName?: string;
  property: string;
  expression: string;
  source: SourceLocation;
}

export interface PropSnapshot {
  name: string;
  value: unknown;
  componentName: string;
  relationship: "component" | "ancestor";
  passedFrom?: PropPassMetadata;
}

export interface NetworkTrace {
  id: string;
  transport: "fetch" | "xhr";
  method: string;
  url: string;
  startedAt: number;
  completedAt?: number;
  status?: number;
  responseType?: string;
  responseBody?: SerializedValue;
  responseBytes?: number;
  truncated?: boolean;
  error?: string;
}

export interface StorageTrace {
  id: string;
  storage: "localStorage" | "sessionStorage";
  operation: "getItem" | "setItem" | "removeItem";
  key: string;
  value?: string | null;
  timestamp: number;
}

export interface StoreUpdate {
  id: string;
  adapter: "zustand" | string;
  storeName: string;
  changedFields: string[];
  timestamp: number;
  source?: SourceLocation;
  event?: EventContext;
}

export interface TraceExport {
  version: 1;
  generatedAt: string;
  element: InspectionResult["element"];
  source?: SourceLocation;
  component?: {
    name?: string;
    parents: string[];
    props: PropSnapshot[];
  };
  expressions: ExpressionResult[];
  stateChanges: StateUpdate[];
  networkRequests: NetworkTrace[];
  storageAccesses: StorageTrace[];
  storeUpdates: StoreUpdate[];
  timeline: RuntimeEvent[];
}

export interface InspectionResult {
  nodeId: string;
  element: {
    tagName: string;
    label: string;
    attributes: Record<string, string>;
  };
  source?: SourceLocation;
  sourceSnippet?: string;
  componentName?: string;
  parentComponents: string[];
  expressions: ExpressionResult[];
  props: PropSnapshot[];
  origins: ValueOrigin[];
  states: StateSnapshot[];
  stateUpdates: StateUpdate[];
  correlatedStateUpdates: StateUpdate[];
  networkRequests: NetworkTrace[];
  storageAccesses: StorageTrace[];
  storeUpdates: StoreUpdate[];
  timeline: RuntimeEvent[];
}

export interface ComponentFrame {
  componentName: string;
  props: Record<string, unknown>;
}

export interface ReactRuntimeAdapter {
  findFiberFromElement(element: Element): unknown | null;
  getParentFiber(fiber: unknown): unknown | null;
  getComponentName(fiber: unknown): string | null;
  getCurrentProps(fiber: unknown, element?: Element): unknown;
  getComponentStack(element: Element): string[];
  getComponentFrames?(element: Element): ComponentFrame[];
  getComponentStateBindings?(element: Element): Array<{
    componentName: string;
    setterIdentities: object[];
  }>;
}

export interface TraceExpressionInput<T> {
  metadata: ExpressionTraceMetadata;
  evaluate: (capture: <Value>(name: string, value: Value, stateId?: string, originHint?: CaptureOriginHint) => Value) => T;
  inputs?: Record<string, unknown>;
}

export type TraceBooleanInput = TraceExpressionInput<boolean>;

export interface TraceValueInput<T> {
  metadata: ExpressionTraceMetadata;
  value: T;
}

export interface TraceStateUpdateInput<T> {
  stateId: string;
  stateName: string;
  componentName?: string;
  source: SourceLocation;
  setter: (value: T | ((previous: T) => T)) => void;
  previousValue: T;
  nextValue: T | ((previous: T) => T);
}

export interface TraceStateRegistrationInput<T> {
  stateId: string;
  stateName: string;
  componentName?: string;
  source: SourceLocation;
  /** Stable React setter or reducer dispatch identity; registration never invokes it. */
  setter: object;
  currentValue: T;
  hookType?: "state" | "reducer";
}

export interface TraceReducerDispatchInput<State, Action> {
  stateId: string;
  stateName: string;
  componentName?: string;
  source: SourceLocation;
  dispatch: (action: Action) => void;
  previousValue: State;
  action: Action;
}

export interface TracePropInput<T> {
  metadata: PropPassMetadata;
  value: T;
}

export interface RedactOptions {
  headers: string[];
  queryParams: string[];
  objectKeys: string[];
}

export interface CauseScopeAdapterApi {
  registerValueOrigin(value: unknown, origin: Omit<ValueOrigin, "id">, recursive?: boolean): void;
  recordStoreUpdate(update: Omit<StoreUpdate, "id">): void;
  getNetworkRequests(): NetworkTrace[];
}

export interface CauseScopeAdapter {
  name: string;
  install(api: CauseScopeAdapterApi): void | (() => void);
}

export interface CauseScopeRuntime {
  traceExpression<T>(input: TraceExpressionInput<T>): T;
  traceBoolean(input: TraceBooleanInput): boolean;
  traceValue<T>(input: TraceValueInput<T>): T;
  traceProp<T>(input: TracePropInput<T>): T;
  registerState<T>(input: TraceStateRegistrationInput<T>): void;
  setState<T>(input: TraceStateUpdateInput<T>): void;
  dispatchReducer<State, Action>(input: TraceReducerDispatchInput<State, Action>): void;
  recordEvent(event: Omit<RuntimeEvent, "id">): void;
  setEventContext(event: EventContext | null): void;
  setReactAdapter(adapter: ReactRuntimeAdapter): void;
  inspectElement(element: Element): InspectionResult;
  installAdapter(adapter: CauseScopeAdapter): () => void;
  registerValueOrigin(value: unknown, origin: Omit<ValueOrigin, "id">, recursive?: boolean): void;
  recordStoreUpdate(update: Omit<StoreUpdate, "id">): void;
  installBrowserInstrumentation(): void;
  exportTrace(inspection: InspectionResult): TraceExport;
  formatTraceMarkdown(inspection: InspectionResult): string;
  subscribe(listener: () => void): () => void;
  getTimeline(): RuntimeEvent[];
  getNetworkRequests(): NetworkTrace[];
}

export interface CauseScopeRuntimeOptions {
  maxTimelineEvents?: number;
  maxTraceNodes?: number;
  maxNetworkResponseBytes?: number;
  maxNetworkBytes?: number;
  traceNetwork?: boolean;
  traceStorage?: boolean;
  redact?: Partial<RedactOptions>;
}
