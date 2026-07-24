import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/example.css";
import { useWorkspaceStore } from "./store";

if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { zustandAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/zustand"),
  ]);
  getCauseScopeRuntime().installAdapter(zustandAdapter({
    stores: { workspaceStore: useWorkspaceStore },
    sources: { workspaceStore: { file: "src/store.ts", line: 9, column: 34 } },
  }));
}

function ZustandExample(): React.ReactElement {
  const compact = useWorkspaceStore((state) => state.compact);
  const density = useWorkspaceStore((state) => state.density);
  const toggleDensity = useWorkspaceStore((state) => state.toggleDensity);

  return (
    <main className="example-shell">
      <p className="example-kicker">Zustand adapter</p>
      <h1>See the store update behind a render.</h1>
      <p className="example-lede">Select the status after toggling it to follow the click through the Store and back to this component.</p>
      <section className="example-card">
        <div className="example-row">
          <div>
            <h2>{compact ? "Compact workspace" : "Comfortable workspace"}</h2>
            <p>State from the explicitly configured workspace Store.</p>
          </div>
          <button className="example-button" type="button" onClick={toggleDensity}>Toggle density</button>
        </div>
        <span className="example-value">density = {density}</span>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(<StrictMode><ZustandExample /></StrictMode>);
