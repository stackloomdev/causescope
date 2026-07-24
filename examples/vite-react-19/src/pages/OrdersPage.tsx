import { useState, type ReactElement } from "react";
import { OrderRow, type OrderRecord } from "../components/OrderRow";

const orders: OrderRecord[] = [
  { id: "CS-1048", customer: "Mina Park", total: "$128.00", status: "ready", priority: true },
  { id: "CS-1049", customer: "Theo Martin", total: "$64.00", status: "packing", priority: false },
  { id: "CS-1050", customer: "Avery Chen", total: "$212.00", status: "hold", priority: true },
];

export function OrdersPage(): ReactElement {
  const [priorityOnly, setPriorityOnly] = useState(false);
  const visibleOrders = priorityOnly ? orders.filter((order) => order.priority) : orders;

  return (
    <main className="playground scenario-page">
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>Order queue</h1>
            <span className="draft-badge">Multi-instance</span>
          </div>
          <p>Inspect repeated components without mixing values between rows.</p>
        </div>
        <span className="save-time">{visibleOrders.length} visible orders</span>
      </header>

      <section className="scenario-card">
        <div className="scenario-toolbar">
          <div>
            <strong>Fulfillment review</strong>
            <p>Rows are grouped by fulfillment priority and update independently.</p>
          </div>
          <button
            className="secondary-button filter-button"
            type="button"
            aria-pressed={priorityOnly}
            onClick={() => setPriorityOnly((current) => !current)}
          >
            {priorityOnly ? "Show every order" : "Priority only"}
          </button>
        </div>
        <ul className="order-list" aria-label="Orders under review">
          {visibleOrders.map((order) => <OrderRow order={order} key={order.id} />)}
        </ul>
      </section>
    </main>
  );
}
