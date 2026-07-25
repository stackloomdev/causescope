import { useMemo, useState } from "react";
import { ApprovalCard } from "./components/ApprovalCard";
import { SignalCard } from "./components/SignalCard";

export function App(): React.ReactElement {
  const [approvals, setApprovals] = useState(2);
  const [locked, setLocked] = useState(true);
  const [published, setPublished] = useState(false);
  const canPublish = approvals >= 3 && !locked;
  const confidence = useMemo(() => `${Math.min(88 + approvals * 3, 100)}%`, [approvals]);

  return (
    <main className="page-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="https://github.com/stackloomdev/causescope" target="_blank" rel="noreferrer">
          <span className="brand-mark">C</span>
          <span>CauseScope</span>
        </a>
        <span className="lab-pill">Live lab</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Click any UI · trace the cause</p>
          <h1>See the evidence behind every rendered detail.</h1>
          <p className="hero-lede">
            Open the CauseScope inspector, then select a heading, status, progress bar, or button. Static text shows source;
            dynamic UI adds the live values and state transitions that produced it.
          </p>
          <div className="hero-actions">
            <button
              className="button button--primary button--wide"
              type="button"
              disabled={!canPublish}
              onClick={() => setPublished(true)}
            >
              {published ? "Snapshot published" : "Publish snapshot"}
            </button>
            <span>{canPublish ? "All checks are clear." : "Unlock and collect 3 approvals."}</span>
          </div>
        </div>

        <aside className="inspect-guide">
          <span className="guide-number">01</span>
          <p className="eyebrow">Try it now</p>
          <h2>Select ordinary text too.</h2>
          <p>This sentence has no disabled state or hidden condition. CauseScope should simply show its exact TSX location.</p>
          <div className="shortcut-row"><kbd>Alt</kbd><span>+</span><span>click any element</span></div>
        </aside>
      </section>

      <section className="signal-grid" aria-label="Trace signals">
        <SignalCard label="Source confidence" value={confidence} detail="Exact TSX location" />
        <SignalCard label="Runtime mode" value="Local only" detail="No account or upload" />
        <SignalCard label="Production cost" value="0 bytes" detail="Development is gated" />
      </section>

      <section className="workspace">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Interactive fixture</p>
            <h2>Release readiness</h2>
          </div>
          <p>Change the state, then inspect the affected text and controls again.</p>
        </div>
        <ApprovalCard
          approvals={approvals}
          locked={locked}
          onApprove={() => setApprovals((current) => Math.min(current + 1, 3))}
          onToggleLock={() => setLocked((current) => !current)}
        />
      </section>

      <footer>
        <span>TypeScript-only starter</span>
        <span>React 19 · Vite 8 · pnpm</span>
      </footer>
    </main>
  );
}
