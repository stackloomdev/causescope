import type { ReactElement } from "react";
import styles from "../pages/StabilityPage.module.css";

let reportResolved = false;
let completeReport: (() => void) | undefined;

function createPendingReport(): Promise<void> {
  return new Promise((resolve) => {
    completeReport = () => {
      reportResolved = true;
      resolve();
    };
  });
}

let reportPromise = createPendingReport();

export function resolveSuspenseReport(): void {
  completeReport?.();
}

export function resetSuspenseReport(): void {
  reportResolved = false;
  reportPromise = createPendingReport();
}

export function SuspenseReport(): ReactElement {
  if (!reportResolved) throw reportPromise;

  return (
    <article className={styles.stage}>
      <h2>Suspense report resolved</h2>
      <p>The deferred component kept its original file and component boundary after React retried it.</p>
    </article>
  );
}
