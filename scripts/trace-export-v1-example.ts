import type { TraceExport } from "../packages/shared/src/index";

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

export const traceExportV1Example = {
  version: 1,
  generatedAt: "2026-01-15T10:00:00.000Z",
  element: {
    tagName: "button",
    label: "Refund order",
    attributes: {
      disabled: "",
      "data-status": "pending",
    },
  },
  source: componentSource,
  component: {
    name: "RefundButton",
    parents: ["OrderActions", "OrderPage"],
    props: [
      {
        name: "orderStatus",
        value: { type: "primitive", value: "pending" },
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
  },
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
      result: { type: "primitive", value: true },
      inputs: {
        canRefund: { type: "primitive", value: false },
      },
      inputStateIds: {
        canRefund: "state-can-refund",
      },
      inputOrigins: {
        canRefund: [
          {
            id: "origin-order-request",
            kind: "network",
            confidence: "confirmed",
            label: "GET /api/orders/4821?token=%5BREDACTED%5D",
            path: "response.data.status",
            traceId: "request-order-4821",
          },
        ],
      },
      traceMode: "operands",
      decidingBranch: "!canRefund",
      timestamp: 1_768_470_000_000,
    },
  ],
  stateChanges: [
    {
      id: "state-update-order-status",
      stateId: "state-order-status",
      instanceId: "OrderPage:1",
      stateName: "orderStatus",
      componentName: "OrderPage",
      previous: { type: "primitive", value: "paid" },
      next: { type: "primitive", value: "pending" },
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
    },
  ],
  networkRequests: [
    {
      id: "request-order-4821",
      transport: "fetch",
      method: "GET",
      url: "/api/orders/4821?token=%5BREDACTED%5D",
      startedAt: 1_768_469_999_700,
      completedAt: 1_768_469_999_950,
      status: 200,
      responseType: "json",
      responseBody: {
        type: "object",
        value: {
          accessToken: { type: "primitive", value: "[REDACTED]" },
          status: { type: "primitive", value: "pending" },
        },
      },
      responseBytes: 52,
      truncated: false,
    },
  ],
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
        targetNodeId: "node-refresh-order",
        handlerProperty: "onClick",
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
} satisfies TraceExport;
