import { useReducer, type ReactElement } from "react";
import { AdvancedPanel } from "../components/AdvancedPanel";

interface DiagnosticState {
  advanced: boolean;
  hasPermission: boolean;
  count: number;
}

type DiagnosticAction =
  | { type: "toggle-advanced" }
  | { type: "toggle-permission" }
  | { type: "increment" };

const initialState: DiagnosticState = {
  advanced: false,
  hasPermission: false,
  count: 0,
};

function diagnosticReducer(state: DiagnosticState, action: DiagnosticAction): DiagnosticState {
  switch (action.type) {
    case "toggle-advanced": return { ...state, advanced: !state.advanced };
    case "toggle-permission": return { ...state, hasPermission: !state.hasPermission };
    case "increment": return { ...state, count: state.count + 1 };
  }
}

export function DiagnosticsPage(): ReactElement {
  const [diagnostics, dispatch] = useReducer(diagnosticReducer, initialState);

  return (
    <main className="playground scenario-page">
      <header className="page-header scenario-heading">
        <div>
          <div className="title-row">
            <h1>Diagnostics</h1>
            <span className="draft-badge">useReducer · hidden branches</span>
          </div>
          <p>Inspect the branch container before and after permissions allow the child to render.</p>
        </div>
        <span className="save-time">Reducer count {diagnostics.count}</span>
      </header>

      <section className="scenario-card diagnostics-card">
        <div className="diagnostic-actions">
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: "toggle-advanced" })}>
            {diagnostics.advanced ? "Disable advanced" : "Enable advanced"}
          </button>
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: "toggle-permission" })}>
            {diagnostics.hasPermission ? "Revoke permission" : "Grant permission"}
          </button>
          <button className="secondary-button" type="button" onClick={() => dispatch({ type: "increment" })}>Increment reducer</button>
        </div>

        <div className="conditional-stage" aria-label="Conditional rendering stage">
          {diagnostics.advanced && diagnostics.hasPermission && <AdvancedPanel count={diagnostics.count} mode="publish" />}
          {(!diagnostics.advanced || !diagnostics.hasPermission) ? (
            <p className="hidden-placeholder">AdvancedPanel is hidden until both conditions are true.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
