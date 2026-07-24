import type { ReactElement } from "react";

export function SecurityNotice(): ReactElement {
  return (
    <aside className="account-card security-card">
      <p className="card-eyebrow">Security</p>
      <h2>Local data boundary</h2>
      <p>Trace values stay in this browser session and are never uploaded by the example app.</p>
      <div className="security-detail">
        <span className="status-ring status-ring-small" />
        <span>Development runtime isolated</span>
      </div>
    </aside>
  );
}
