import { useState, type ReactElement } from "react";
import styles from "../pages/StabilityPage.module.css";

const hmrLabel = "HMR baseline";

export function HmrStatus(): ReactElement {
  const [refreshCount, setRefreshCount] = useState(0);

  return (
    <article className={styles.hmrCard}>
      <p>{hmrLabel}</p>
      <h2>Fast Refresh state: {refreshCount}</h2>
      <span className={styles.hmrValue}>refreshCount = {refreshCount}</span>
      <button className="secondary-button" type="button" onClick={() => setRefreshCount((current) => current + 1)}>
        Increment refresh-safe count
      </button>
    </article>
  );
}
