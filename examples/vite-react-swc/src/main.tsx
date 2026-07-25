import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/example.css";

function SwcCompatibilityExample(): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const status = enabled ? "SWC tracing enabled" : "SWC tracing paused";

  return (
    <main className="example-shell">
      <p className="example-kicker">React SWC compatibility</p>
      <h1>Keep source evidence through the SWC transform.</h1>
      <p className="example-lede">This fixture verifies CauseScope before Vite's React SWC transform.</p>
      <section className="example-card">
        <div className="example-row">
          <div>
            <h2>{status}</h2>
            <p>Rendered by a React 19 state transition.</p>
          </div>
          <button className="example-button" type="button" onClick={() => setEnabled((current) => !current)}>
            Toggle SWC tracing
          </button>
        </div>
        <span className="example-value">enabled = {String(enabled)}</span>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <React.StrictMode>
    <SwcCompatibilityExample />
  </React.StrictMode>,
);
