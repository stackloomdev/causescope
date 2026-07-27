import { useEffect, useState, type ReactElement } from "react";

interface RefundOrder {
  id: string;
  customer: string;
  total: string;
  status: "paid" | "pending" | "refunded";
}

interface RefundOrderResponse {
  data: {
    order: RefundOrder;
  };
}

async function fetchRefundOrder(signal: AbortSignal): Promise<RefundOrderResponse> {
  const response = await fetch("/api/orders/4821", { signal });
  if (!response.ok) throw new Error(`Order request failed with ${response.status}`);
  return response.json() as Promise<RefundOrderResponse>;
}

export function RefundPage(): ReactElement {
  const [order, setOrder] = useState<RefundOrder | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchRefundOrder(controller.signal)
      .then((payload) => setOrder(payload.data.order))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Unable to load order");
      });
    return () => controller.abort();
  }, []);

  if (loadError) {
    return <main className="playground refund-page"><p className="refund-error">{loadError}</p></main>;
  }

  if (!order) {
    return <main className="playground refund-page"><p className="refund-loading">Loading order evidence…</p></main>;
  }

  const canRefund = order.status === "paid";

  return (
    <main className="playground refund-page">
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>Refund review</h1>
            <span className="draft-badge">Live API evidence</span>
          </div>
          <p>Inspect the blocked action to follow its decision back to the order response.</p>
        </div>
        <span className="save-time">Order #{order.id}</span>
      </header>

      <section className="scenario-card refund-card">
        <div className="refund-order-heading">
          <div>
            <p className="card-eyebrow">Order #{order.id}</p>
            <h2>{order.customer}</h2>
          </div>
          <strong>{order.total}</strong>
        </div>

        <div className="refund-decision">
          <div>
            <span>Payment status</span>
            <strong className="refund-status">{order.status}</strong>
          </div>
          <p>A refund becomes available after the payment status changes to paid.</p>
        </div>

        <footer className="refund-actions">
          <span>{canRefund ? "Refund available" : "Waiting for payment settlement"}</span>
          <button className="refund-button" type="button" disabled={!canRefund}>
            Refund order
          </button>
        </footer>
      </section>
    </main>
  );
}
