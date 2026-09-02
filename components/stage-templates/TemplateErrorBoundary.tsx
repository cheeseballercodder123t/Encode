'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  templateType?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class TemplateErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[TemplateErrorBoundary] Error in template "${this.props.templateType}":`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md text-left">
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Visual Template Render Fallback ({this.props.templateType || 'Interactive Stage'})
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3">
            An unexpected error occurred while rendering the interactive visual diagram. The cognitive scaffold inputs below remain fully functional.
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors border border-amber-500/30"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Interactive Render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
