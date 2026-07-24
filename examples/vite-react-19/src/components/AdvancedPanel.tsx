import type { ReactElement } from "react";

interface AdvancedPanelProps {
  count: number;
  mode: "review" | "publish";
}

export function AdvancedPanel({ count, mode }: AdvancedPanelProps): ReactElement {
  return (
    <aside className="advanced-panel">
      <p className="card-eyebrow">Advanced controls</p>
      <h3>{mode === "publish" ? "Publishing enabled" : "Review mode"}</h3>
      <strong>Reducer count: {count}</strong>
    </aside>
  );
}
