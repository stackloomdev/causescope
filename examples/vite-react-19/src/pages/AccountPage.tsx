import { useState, type ReactElement } from "react";
import { PlanCard } from "../components/PlanCard";
import { SecurityNotice } from "../components/SecurityNotice";

export function AccountPage(): ReactElement {
  const [annual, setAnnual] = useState(true);

  return (
    <main className="playground scenario-page">
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>Account</h1>
            <span className="draft-badge">Nested components</span>
          </div>
          <p>Validate source ownership across parent and child component files.</p>
        </div>
        <span className="save-time">{annual ? "Annual billing" : "Monthly billing"}</span>
      </header>

      <section className="account-grid">
        <PlanCard annual={annual} onToggle={() => setAnnual((current) => !current)} />
        <SecurityNotice />
      </section>

      <p className="account-footnote">Billing notices are sent to the workspace owner seven days before renewal.</p>
    </main>
  );
}
