'use client';

import React, { Component, Suspense, useState, type ErrorInfo, type ReactNode } from 'react';
import type { Activity, StageResponse } from '@/lib/types';
import type { ConfidenceTier } from '@/lib/interference-traps';
import { resolveInterventions, type InterventionProps } from '@/lib/mr-m/registry';
import type { ParadoxEntry, TrapAutopsy, TrapDiagnosis } from '@/lib/mr-m/types';

// ─── Mr M mode: the one surface that resolves them ──────────────────────────
//
// The sibling of `StageVisualRenderer`, and it answers exactly the same kind of
// question: not "how do I draw this?" but "which ids belong here?". The id →
// renderer table lives in `lib/mr-m/registry.ts`, so shipping a seventh
// intervention is "register it" and never "go edit the renderer".
//
// It is mounted TWICE, because the surfaces belong on opposite sides of the
// answer fields: the coordinate system, the letters, the decomposition and the
// sliders are preparation and sit above the mechanism answer, while the autopsy
// and the two-way check are post-mortems and sit beside the examiner's read.
// `phase` is derived from the pillar rather than declared per intervention, so
// the placement rule has exactly one home.

/** Pillars that only make sense once a check has run. */
const POST_CHECK_PILLARS = new Set(['autopsy', 'socratic']);

/**
 * The number of preparation panels at which the stack is offered folded. Below
 * this it is not in the way; at five it is a screen of reading between the
 * learner and the field they were asked to write in.
 */
const MIN_FOLDABLE = 3;

/**
 * A payload the registry could not read must never take the workbench down with
 * it. `resolveInterventions` already swallows a throwing `appliesWhen`; this
 * covers a panel that throws while rendering.
 */
class MrMErrorBoundary extends Component<{ children: ReactNode; id: string }, { failed: boolean }> {
  public state = { failed: false };

  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[MrMErrorBoundary] Mr M panel "${this.props.id}" failed:`, error, info);
  }

  public render() {
    if (this.state.failed) {
      return (
        <div className="rounded-2xl border border-edge/60 bg-deck/50 p-3 text-[11px] text-solder">
          This Mr M panel could not render. The stage itself is unaffected.
        </div>
      );
    }
    return this.props.children;
  }
}

function MrMSkeleton() {
  return (
    <div className="rounded-2xl border border-edge/40 bg-deck/40 p-4 space-y-2">
      <div className="h-3 w-40 bg-inset" />
      <div className="h-3 w-64 bg-inset/60" />
      <div className="h-3 w-52 bg-inset/60" />
    </div>
  );
}

export interface MisterMSurfaceProps {
  activity: Activity;
  /** Mr M mode. Off ⇒ the resolver returns nothing and this renders null. */
  enabled: boolean;
  feynmanResult?: StageResponse['feynmanReview'] | null;
  /** Deterministic trap read from `classifyTrap`. */
  trapDiagnosis?: TrapDiagnosis | null;
  /** The model's narrative half of the autopsy. */
  autopsy?: TrapAutopsy | null;
  openParadoxes?: ParadoxEntry[];
  onRaiseParadox?: (statement: string) => void;
  onResolveParadox?: (id: string, resolution: string) => void;
  /** Trap-card material: check-time snapshot + the save callback. */
  topic?: string;
  committedAnswer?: string;
  correctAnswer?: string;
  onSaveTrapCard?: (input: { tier: ConfidenceTier; flawLine: string }) => void;
  trapCardSaved?: boolean;
  /** 'pre' renders the preparation surfaces, 'post' the post-mortems. */
  phase: 'pre' | 'post';
}

export function MisterMSurface({
  activity,
  enabled,
  feynmanResult,
  trapDiagnosis,
  autopsy,
  openParadoxes,
  onRaiseParadox,
  onResolveParadox,
  topic,
  committedAnswer,
  correctAnswer,
  onSaveTrapCard,
  trapCardSaved,
  phase,
}: MisterMSurfaceProps) {
  const visible = resolveInterventions({
    activity,
    enabled,
    feynmanResult,
    trapDiagnosis,
    autopsy,
    hasOpenParadox: (openParadoxes?.length ?? 0) > 0,
  }).filter((intervention) => POST_CHECK_PILLARS.has(intervention.pillar) === (phase === 'post'));

  // Folding is offered for a DEEP preparation stack only, and it starts
  // expanded. Everything here is meant to be on screen; the complaint it
  // answers is not "too much" but "in the way right now", so the stack folds
  // to one line and unfolds in a click with nothing switched off.
  const [folded, setFolded] = useState(false);

  if (visible.length === 0) return null;

  const canFold = phase === 'pre' && visible.length >= MIN_FOLDABLE;
  const stackId = `mr-m-stack-${phase}`;

  const panelProps: InterventionProps = {
    activity,
    feynmanResult,
    trapDiagnosis,
    autopsy,
    openParadoxes,
    onRaiseParadox,
    onResolveParadox,
    topic,
    committedAnswer,
    correctAnswer,
    onSaveTrapCard,
    trapCardSaved,
  };

  const panels = (
    <div id={stackId} className="space-y-3">
      {visible.map((intervention) => {
        const Panel = intervention.component;
        return (
          <MrMErrorBoundary key={intervention.id} id={intervention.id}>
            {/* Keyed by stage as well as id: stepping to the next stage remounts
                each panel, so one stage's slider positions and ticked steps
                never leak onto the next. */}
            <Suspense fallback={<MrMSkeleton />}>
              <Panel key={`${intervention.id}-${activity.id}`} {...panelProps} />
            </Suspense>
          </MrMErrorBoundary>
        );
      })}
    </div>
  );

  if (!canFold) {
    return (
      <div className="space-y-3" data-testid={`mr-m-surface-${phase}`}>
        {panels}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid={`mr-m-surface-${phase}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-solder">
          Preparation · {visible.length} surfaces
        </span>
        <button
          type="button"
          onClick={() => setFolded((current) => !current)}
          aria-expanded={!folded}
          aria-controls={stackId}
          data-testid="mr-m-fold"
          title={
            folded
              ? 'Bring the preparation surfaces back'
              : 'Fold these away until you want them — nothing is switched off'
          }
          className="shrink-0 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider rounded-full border border-edge/70 text-solder hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
        >
          [ {folded ? 'show' : 'fold'} ]
        </button>
      </div>
      {folded ? (
        <p id={stackId} data-testid="mr-m-folded-note" className="text-[11px] text-solder leading-snug">
          Folded: {visible.map((intervention) => intervention.title).join(' · ')}. The stage
          underneath is unaffected.
        </p>
      ) : (
        panels
      )}
    </div>
  );
}
