import type { ReactElement } from "react";
import styles from "../pages/StabilityPage.module.css";

interface UnstablePanelProps {
  shouldCrash: boolean;
}

export function UnstablePanel({ shouldCrash }: UnstablePanelProps): ReactElement {
  if (shouldCrash) throw new Error("Intentional fixture failure");

  return (
    <article className={styles.stage}>
      <h2>Boundary child healthy</h2>
      <p>The child lives in a separate TSX file so recovery keeps a real component boundary.</p>
    </article>
  );
}
