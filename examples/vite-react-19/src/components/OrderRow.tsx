import type { ReactElement } from "react";

export interface OrderRecord {
  id: string;
  customer: string;
  total: string;
  status: "ready" | "packing" | "hold";
  priority: boolean;
}

interface OrderRowProps {
  order: OrderRecord;
}

const statusLabels: Record<OrderRecord["status"], string> = {
  ready: "Ready to ship",
  packing: "Packing",
  hold: "Payment hold",
};

export function OrderRow({ order }: OrderRowProps): ReactElement {
  const statusLabel = statusLabels[order.status];
  const actionLabel = order.status === "ready" ? "Print label" : "Review order";

  return (
    <li className={order.priority ? "order-row order-row-priority" : "order-row"} data-order-id={order.id}>
      <div className="customer-block">
        <strong>{order.customer}</strong>
        <span>{order.id}</span>
      </div>
      <span className={`status-pill status-${order.status}`}>{statusLabel}</span>
      <span className="order-total">{order.total}</span>
      <button
        className="row-action"
        type="button"
        disabled={order.status === "hold"}
        title={order.status === "hold" ? "Resolve payment before continuing" : actionLabel}
      >
        {actionLabel}
      </button>
    </li>
  );
}
