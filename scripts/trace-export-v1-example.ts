import type { TraceExport } from "../packages/causescope/types/index.js";
import { CauseScopeRuntimeImpl } from "../packages/runtime-core/src/index";
import { mergeRedaction, serializedByteLength, serializeValue } from "../packages/runtime-core/src/serialization";
import type { InspectionResult, NetworkTrace, StateUpdate } from "../packages/shared/src/index";

const componentSource = {
  file: "src/components/RefundButton.tsx",
  line: 18,
  column: 7,
} as const;

const pageSource = {
  file: "src/pages/OrderPage.tsx",
  line: 42,
  column: 11,
} as const;

const generatedAt = "2026-01-15T10:00:00.000Z";

export function createTraceExportV1Example(): TraceExport {
  const runtime = new CauseScopeRuntimeImpl();
  const responseBody = serializeValue({
    accessToken: "synthetic-network-token",
    status: "pending",
  }, mergeRedaction());
  const networkRequest = {
    id: "request-order-4821",
    transport: "fetch",
    method: "GET",
    url: "/api/orders/4821?token=%5BREDACTED%5D",
    startedAt: 1_768_469_999_700,
    completedAt: 1_768_469_999_950,
    status: 200,
    responseType: "json",
    responseBody,
    responseBytes: serializedByteLength(responseBody),
    truncated: false,
  } satisfies NetworkTrace;
  const stateUpdate = {
    id: "state-update-order-status",
    stateId: "state-order-status",
    instanceId: "OrderPage:1",
    stateName: "orderStatus",
    componentName: "OrderPage",
    previous: "paid",
    next: "pending",
    source: pageSource,
    event: {
      type: "click",
      targetNodeId: "node-refresh-order",
      targetLabel: "button \"Refresh order\"",
      source: pageSource,
      handlerProperty: "onClick",
      handlerExpression: "refreshOrder",
      timestamp: 1_768_469_999_800,
    },
    timestamp: 1_768_470_000_000,
    updateType: "value",
  } satisfies StateUpdate;
  const inspection = {
    nodeId: "node-refund-button",
    element: {
      tagName: "button",
      label: "Refund order",
      attributes: {
        disabled: "",
        "data-status": "pending",
      },
    },
    source: componentSource,
    componentName: "RefundButton",
    parentComponents: ["OrderActions", "OrderPage"],
    expressions: [
      {
        id: "expression-can-refund",
        nodeId: "node-refund-button",
        kind: "attribute",
        property: "disabled",
        expression: "!canRefund",
        source: componentSource,
        componentName: "RefundButton",
        decisionLabel: "Refund availability",
        result: true,
        inputs: { canRefund: false },
        inputStateIds: { canRefund: "state-can-refund" },
        inputOrigins: {
          canRefund: [
            {
              id: "origin-order-request",
              kind: "network",
              confidence: "confirmed",
              label: "GET /api/orders/4821?token=%5BREDACTED%5D",
              path: "response.data.status",
              traceId: "request-order-4821",
              metadata: {
                accessToken: "synthetic-origin-token",
                status: 200,
              },
            },
          ],
        },
        traceMode: "operands",
        decidingBranch: "!canRefund",
        conditionEvaluation: {
          id: "condition-can-refund",
          type: "unary",
          expression: "!canRefund",
          operator: "!",
          evaluated: true,
          deciding: true,
          value: true,
          children: [
            {
              id: "condition-can-refund-input",
              type: "identifier",
              expression: "canRefund",
              inputName: "canRefund",
              evaluated: true,
              value: false,
            },
          ],
        },
        timestamp: 1_768_470_000_000,
      },
    ],
    props: [
      {
        name: "orderStatus",
        value: "pending",
        componentName: "RefundButton",
        relationship: "component",
        passedFrom: {
          id: "prop-order-status",
          componentName: "RefundButton",
          parentComponentName: "OrderActions",
          property: "orderStatus",
          expression: "order.status",
          source: pageSource,
        },
      },
    ],
    origins: [],
    states: [],
    stateUpdates: [stateUpdate],
    correlatedStateUpdates: [stateUpdate],
    networkRequests: [networkRequest],
    storageAccesses: [],
    storeUpdates: [],
    timeline: [
      {
        id: "timeline-refresh-click",
        type: "click",
        label: "click button \"Refresh order\" → refreshOrder",
        timestamp: 1_768_469_999_800,
        source: pageSource,
        metadata: {
          handlerProperty: "onClick",
          targetNodeId: "node-refresh-order",
        },
      },
      {
        id: "timeline-status-update",
        type: "state-update",
        label: "orderStatus changed from paid to pending",
        timestamp: 1_768_470_000_000,
        source: pageSource,
      },
    ],
  } satisfies InspectionResult;

  const exported: TraceExport = runtime.exportTrace(inspection);
  return { ...exported, generatedAt };
}

export const traceExportV1Example = createTraceExportV1Example();
