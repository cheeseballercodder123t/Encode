'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

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
        <div className=" border border-amber/30 via-[#0E111C]  p-4   text-left">
          <div className="flex items-center gap-2 text-amber mb-2">
            <span className="text-amber font-bold font-mono">[ ! ]</span>
            <span className="text-xs font-bold uppercase tracking-wider">
              Visual Template Render Fallback ({this.props.templateType || 'Interactive Stage'})
            </span>
          </div>
          <p className="text-xs text-solder mb-3">
            An unexpected error occurred while rendering the interactive visual diagram. The cognitive scaffold inputs below remain fully functional.
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber/20 hover:bg-amber/30 text-amber text-xs font-medium transition-none-colors border border-amber/30"
          >
            <span className="text-amber font-bold font-mono">[ RESET ]</span>
            Retry Interactive Render
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
