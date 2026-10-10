import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI crashed', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login">
        <div className="card" style={{ width: 380 }}>
          <h3>Something went wrong</h3>
          <p className="muted">The screen hit an unexpected error. Your game is safe on the server.</p>
          <pre className="muted small" style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <button className="primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
