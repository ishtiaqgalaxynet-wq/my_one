import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `${parsed.error} (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'resource'})`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application boundary caught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#1f1733] text-[#dec9e9] p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#2c2147] border border-[#c19ee0]/30 p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#d2b7e5]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
            </div>
            <p className="text-sm text-[#dec9e9]/85 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#dec9e9] text-[#352063] px-4 py-2 text-sm font-semibold hover:bg-[#dac3e8] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
