import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "../pages/StabilityPage.module.css";

interface StabilityErrorBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface StabilityErrorBoundaryState {
  error: Error | null;
}

export class StabilityErrorBoundary extends Component<StabilityErrorBoundaryProps, StabilityErrorBoundaryState> {
  state: StabilityErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StabilityErrorBoundaryState {
    return { error };
  }

  componentDidCatch(_error: Error, _details: ErrorInfo): void {
    // React reports the caught exception; the fixture only renders a stable recovery boundary.
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <article className={styles.stage} role="alert">
        <h2>Component failure contained</h2>
        <p>{this.state.error.message}</p>
        <button className="secondary-button" type="button" onClick={this.props.onReset}>Reset failed panel</button>
      </article>
    );
  }
}
