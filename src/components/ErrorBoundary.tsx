import { Component, type ReactNode } from 'react';
import { captureError } from '../telemetry';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// Catches any render/runtime error in the tree so the user sees a recover
// prompt instead of a blank white screen (e.g. a stale bundle vs. updated API).
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('SprintDeck error:', error);
    captureError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="crash">
          <h2>Something went wrong</h2>
          <p className="muted">The app hit an unexpected error. Reloading usually fixes it.</p>
          <button className="primary" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
