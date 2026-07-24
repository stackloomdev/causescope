import type { ReactElement } from "react";

interface PlanCardProps {
  annual: boolean;
  onToggle: () => void;
}

export function PlanCard({ annual, onToggle }: PlanCardProps): ReactElement {
  const planName = annual ? "Studio annual" : "Studio monthly";
  const planPrice = annual ? "$240 / year" : "$24 / month";

  return (
    <article className="account-card plan-card">
      <p className="card-eyebrow">Workspace plan</p>
      <div className="plan-heading">
        <div>
          <h2>{planName}</h2>
          <p>Includes five collaborator seats and unlimited local traces.</p>
        </div>
        <span className={annual ? "billing-chip billing-chip-active" : "billing-chip"}>
          {annual ? "Annual" : "Monthly"}
        </span>
      </div>
      <strong className="plan-price">{planPrice}</strong>
      <button className="secondary-button plan-toggle" type="button" onClick={onToggle}>
        {annual ? "Switch to monthly" : "Switch to annual"}
      </button>
    </article>
  );
}
