'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';

/**
 * The boundary each secondary sheet stands behind.
 *
 * `app/error.tsx` (defect 27) is the *last* line of defence: by the time a throw
 * reaches it, the segment is already gone - the workbench, the stage the learner
 * was on and the session view with it. It was never meant to be the first thing
 * a sheet error touches, but for the twenty sheets mounted in `app/page.tsx` it
 * was: only the Mr M panels and the stage renderer had a boundary of their own,
 * so a payload that threw inside the analytics drawer, the history drawer or an
 * export sheet cost the whole session (defect 33 was one of those, in the
 * analytics sheet: a corrupt usage record threw during render and the segment
 * was replaced).
 *
 * This boundary sits at the mount site instead, so a sheet that throws is a sheet
 * that shows a fallback - the session behind it keeps its state, and every other
 * surface stays usable. It does not fix anything: it contains.
 *
 * `open` and `onClose` are required on purpose. A boundary that cannot dismiss
 * the sheet it stands in for would leave the learner staring at a fallback with
 * no way back, which is the failure it exists to prevent.
 */
interface Props {
  /** The sheet's own name, as the fallback refers to it. */
  name: string;
  /** The flag the parent uses to show the sheet. */
  open: boolean;
  /** Closes the sheet the boundary is standing in for. */
  onClose: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class SheetErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SheetErrorBoundary] Sheet "${this.props.name}" failed to render:`, error, errorInfo);
  }

  /**
   * A closed sheet that is re-opened starts clean. Without this, the error state
   * would outlive the sheet's own close control and the next open would show the
   * previous crash's fallback instead of the sheet.
   */
  public componentDidUpdate(prev: Props) {
    if (this.state.error && prev.open !== this.props.open) this.setState({ error: null });
  }

  /** Retry re-renders the sheet as it is - the learner's chance to get past a transient throw. */
  private retry = () => this.setState({ error: null });

  /**
   * Closing is the parent's move, and only the parent's: this asks it to close
   * and lets the `open` transition above clear the error. Clearing it *here*
   * would re-render the same throwing child before the parent had acted and put
   * the fallback straight back on screen - which is what the close control is
   * for avoiding.
   */
  private close = () => this.props.onClose();

  public render() {
    if (!this.state.error) return this.props.children;
    return <SheetErrorFallback name={this.props.name} error={this.state.error} onRetry={this.retry} onClose={this.close} />;
  }
}

/**
 * What the learner sees in place of the sheet. A function component so it can
 * take the shared sheet behaviour (Escape closes it, the page behind stops
 * scrolling, focus moves in) from the same hook every other overlay uses - a
 * fallback that cannot be dismissed with a key would be a smaller version of the
 * problem it is standing in for.
 */
function SheetErrorFallback({
  name,
  error,
  onRetry,
  onClose,
}: {
  name: string;
  error: Error;
  onRetry: () => void;
  onClose: () => void;
}) {
  const sheetRef = useModalA11y(true, onClose);

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} unavailable`}
      tabIndex={-1}
      data-testid="sheet-error-fallback"
      data-sheet={name}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-chassis/90 p-4"
    >
      <div className="w-full max-w-lg leaf-edge sheet-plate bg-deck p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rotate-45 bg-gradient-to-br from-hazard-400 to-hazard-600" aria-hidden />
          <span className="font-mono text-[10px] tracking-[0.2em] text-hazard-300">[ SHEET ERROR ]</span>
        </div>

        <h2 className="font-display text-[20px] leading-tight text-bone">
          The {name} sheet failed to render.
        </h2>

        <p className="text-xs text-solder italic leading-relaxed">
          Your session is untouched — the studio behind this panel still has every stage, answer and
          setting. Nothing was deleted. Retrying re-renders this sheet; closing returns you to the
          session.
        </p>

        {error?.message && (
          <p className="font-mono text-[11px] text-solder bg-inset border border-edge/70 rounded-md p-3 break-words">
            {error.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            data-testid="sheet-error-retry"
            onClick={onRetry}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-600/80 text-inset shadow-gilt transition-colors duration-150 cursor-pointer hover:from-amber-300 hover:to-amber-500"
          >
            Try again
          </button>
          <button
            type="button"
            data-testid="sheet-error-close"
            onClick={onClose}
            className="px-4 py-2 text-xs text-solder bg-inset border border-edge/70 rounded-full hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
          >
            Close this sheet
          </button>
        </div>
      </div>
    </div>
  );
}
