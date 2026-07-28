export interface Order {
  id: string;
  customer: string;
  amount: number;
  status: string;
}

interface RefundCardProps {
  order: Order | null;
  settled: boolean;
  onSettle: () => void;
}

export function RefundCard({ order, settled, onSettle }: RefundCardProps): React.ReactElement {
  // Read the field through the object so the inspector can walk the access path
  // back to the response that carried it.
  const canRefund = order?.status === "paid";

  return (
    <article className="approval-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Order #4821</p>
          <h2>{order ? order.customer : "Loading order…"}</h2>
        </div>
        <span className={canRefund ? "status-dot status-dot--ready" : "status-dot"}>
          {order ? order.status : "…"}
        </span>
      </div>

      <p className="approval-copy">
        {canRefund
          ? "Payment settled, so a refund is available."
          : "A refund becomes available after the payment status changes to paid."}
      </p>

      <div className="action-row">
        <button className="button button--secondary" type="button" disabled={settled} onClick={onSettle}>
          {settled ? "Settlement received" : "Simulate settlement"}
        </button>
        <button className="button button--primary" type="button" disabled={!canRefund}>
          Refund order
        </button>
      </div>
    </article>
  );
}
