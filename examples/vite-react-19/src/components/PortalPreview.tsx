import { createPortal } from "react-dom";
import type { ReactElement } from "react";
import styles from "../pages/StabilityPage.module.css";

interface PortalPreviewProps {
  onClose: () => void;
}

function portalHost(): HTMLElement {
  const host = document.getElementById("causescope-portal-fixture");
  if (!host) throw new Error("Missing #causescope-portal-fixture element");
  return host;
}

export function PortalPreview({ onClose }: PortalPreviewProps): ReactElement {
  return createPortal(
    <div className={styles.portalBackdrop} role="presentation">
      <section className={styles.portalDialog} role="dialog" aria-modal="true" aria-labelledby="portal-title">
        <h2 id="portal-title">Portal evidence outside the app root</h2>
        <p>CauseScope should keep the component and TypeScript source even when React renders into document.body.</p>
        <button className="secondary-button" type="button" onClick={onClose}>Close portal fixture</button>
      </section>
    </div>,
    portalHost(),
  );
}
