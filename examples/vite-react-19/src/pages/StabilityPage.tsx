import { Suspense, useState, type ReactElement } from "react";
import { HmrStatus } from "../components/HmrStatus";
import { PortalPreview } from "../components/PortalPreview";
import { StabilityErrorBoundary } from "../components/StabilityErrorBoundary";
import { SuspenseReport, resetSuspenseReport, resolveSuspenseReport } from "../components/SuspenseReport";
import { UnstablePanel } from "../components/UnstablePanel";
import styles from "./StabilityPage.module.css";

export function StabilityPage(): ReactElement {
  const [portalOpen, setPortalOpen] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [shouldCrash, setShouldCrash] = useState(false);
  const [boundaryVersion, setBoundaryVersion] = useState(0);

  const resetBoundary = (): void => {
    setShouldCrash(false);
    setBoundaryVersion((current) => current + 1);
  };

  const resetReport = (): void => {
    setReportVisible(false);
    resetSuspenseReport();
  };

  return (
    <main className={`playground scenario-page ${styles.page}`}>
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>React stability lab</h1>
            <span
              className="inline-flex rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30"
              data-testid="tailwind-badge"
            >
              Tailwind pipeline
            </span>
          </div>
          <p>Exercise ownership and source coordinates across rendering boundaries and development refreshes.</p>
        </div>
        <span className="save-time">React 19 · Vite 8</span>
      </header>

      <div className="grid gap-5 md:grid-cols-2" data-testid="tailwind-grid">
        <section className={`scenario-card ${styles.moduleCard}`} data-testid="css-module-card">
          <p className="card-eyebrow">Portal · CSS Modules</p>
          <h2>Cross-root selection</h2>
          <p>Open content mounted outside #root, then select its ordinary text directly.</p>
          <div className={styles.controlRow}>
            <button className="secondary-button" type="button" onClick={() => setPortalOpen(true)}>Open portal fixture</button>
          </div>
        </section>

        <section className={`scenario-card ${styles.moduleCard}`}>
          <p className="card-eyebrow">Suspense</p>
          <h2>Deferred rendering</h2>
          <p>Keep the fallback visible until the test resolves a cached promise.</p>
          <div className={styles.controlRow}>
            <button className="secondary-button" type="button" onClick={() => setReportVisible(true)}>Start suspense report</button>
            <button className="secondary-button" type="button" onClick={resolveSuspenseReport}>Resolve suspense report</button>
            <button className="secondary-button" type="button" onClick={resetReport}>Reset suspense report</button>
          </div>
          <Suspense fallback={<p className={styles.loading}>Suspense report loading</p>}>
            {reportVisible ? <SuspenseReport /> : <div className={styles.stage}>Deferred report is idle.</div>}
          </Suspense>
        </section>

        <section className={`scenario-card ${styles.moduleCard}`}>
          <p className="card-eyebrow">Error Boundary</p>
          <h2>Contained failure</h2>
          <p>Crash a child component, inspect the fallback, then remount the boundary.</p>
          <div className={styles.controlRow}>
            <button className="secondary-button" type="button" onClick={() => setShouldCrash(true)}>Crash boundary child</button>
          </div>
          <StabilityErrorBoundary key={boundaryVersion} onReset={resetBoundary}>
            <UnstablePanel shouldCrash={shouldCrash} />
          </StabilityErrorBoundary>
        </section>

        <section className={`scenario-card ${styles.moduleCard}`}>
          <p className="card-eyebrow">Vite HMR</p>
          <h2>Fast Refresh continuity</h2>
          <p>The E2E suite changes a TSX label and verifies local hook state and source evidence survive.</p>
          <HmrStatus />
        </section>
      </div>

      {portalOpen ? <PortalPreview onClose={() => setPortalOpen(false)} /> : null}
    </main>
  );
}
