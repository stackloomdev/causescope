import type { ReactElement } from "react";
import { UninstrumentedControls } from "../components/UninstrumentedControls";

export function GranularityPage(): ReactElement {
  return (
    <main className="playground">
      <section className="editor-card" aria-labelledby="granularity-title">
        <h1 id="granularity-title">Selection granularity</h1>
        <UninstrumentedControls />
      </section>
    </main>
  );
}
