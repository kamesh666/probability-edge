import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in ProbabilityEdge:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0F17] text-white flex flex-col items-center justify-center p-6 font-mono text-xs">
          <div className="max-w-md w-full bg-[#111827] border border-rose-800 rounded-lg p-6 space-y-4">
            <h2 className="text-sm font-bold text-rose-400">ProbabilityEdge Engine Diagnostics</h2>
            <p className="text-slate-400">
              The application encountered a runtime initialization issue:
            </p>
            <div className="p-3 bg-black/60 rounded border border-rose-950 text-rose-300 font-mono text-[11px] overflow-auto">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <button
              onClick={() => {
                try {
                  window.localStorage?.clear();
                } catch (e) {}
                window.location.reload();
              }}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold transition-colors"
            >
              Reset Cache & Reload Engine
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
