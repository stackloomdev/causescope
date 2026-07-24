import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/example.css";

function React18Example(): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const status = enabled ? "Tracing enabled" : "Tracing paused";

  return (
    <main className="example-shell">
      <p className="example-kicker">React 18 compatibility</p>
      <h1>Inspect the value behind the interface.</h1>
      <p className="example-lede">Select the status below to see its conditional expression and current hook state.</p>
      <section className="example-card">
        <div className="example-row">
          <div>
            <h2>{status}</h2>
            <p>Rendered by a React 18 state transition.</p>
          </div>
          <button className="example-button" type="button" onClick={() => setEnabled((current) => !current)}>
            Toggle tracing
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
    <React18Example />
  </React.StrictMode>,
);
