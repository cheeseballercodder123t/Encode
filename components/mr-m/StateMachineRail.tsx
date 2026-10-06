'use client';

import React, { useState } from 'react';
import { payloadFor, type InterventionProps } from '@/lib/mr-m/registry';

// ─── Mr M mode: linear decomposition ────────────────────────────────────────
//
// The learner freezes when a problem forces four separate rules to be held at
// once (convert mL→L, check the limiting reactant, apply the mole ratio,
// convert to grams). That is a working-memory bottleneck, not an intelligence
// problem. So the stage is split into a linear chain where each step consumes
// exactly ONE rule and hands forward a value — at no point does the learner
// hold two rules simultaneously.
//
// The rail is checkable on purpose. Ticking a step off is the learner
// confirming "I am holding that output now", which is the moment the rule
// leaves working memory and becomes a stored intermediate.

/** Three steps is the point at which a chain stops fitting in working memory. */
const MIN_STEPS = 3;

/**
 * Memoised: the workbench re-renders on every keystroke in the answer fields,
 * and nothing this panel draws depends on them. Its only prop is the stage, so
 * typing cannot disturb which steps are ticked or how they are drawn.
 */
export const StateMachineRail = React.memo(StateMachineRailInner);

function StateMachineRailInner({ activity }: InterventionProps) {
  // Hooks run before the early return: a stage without a decomposition still
  // renders this component, it just renders nothing.
  const [completed, setCompleted] = useState<string[]>([]);

  const steps = payloadFor(activity)?.stateMachine;
  if (!steps || steps.length < MIN_STEPS) return null;

  const toggle = (key: string) => {
    setCompleted((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const held = steps.filter((step) => completed.includes(`step-${step.stepNumber}`)).length;

  return (
    <section
      data-testid="mr-m-steps"
      className="rounded-2xl border border-edge/60 bg-deck/50 p-4 space-y-3"
    >
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
            Linear decomposition
          </span>
          {/* The count is the whole point of ticking a step off — it is how the
              chain stops being one undifferentiated problem — so it is stated
              and announced rather than left to be inferred from the colours. */}
          <span className="flex items-baseline gap-2 shrink-0" role="status" aria-live="polite">
            <span
              data-testid="mr-m-steps-progress"
              className="font-mono text-[10px] tracking-wider text-solder"
            >
              {held} of {steps.length} held
            </span>
            {held > 0 ? (
              <button
                type="button"
                onClick={() => setCompleted([])}
                data-testid="mr-m-steps-reset"
                title="Start the chain again from step 1"
                className="font-mono text-[10px] uppercase tracking-wider text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
              >
                [ reset ]
              </button>
            ) : null}
          </span>
        </div>
        <p className="text-[11px] text-solder leading-snug">
          One rule per step, so working memory never holds two.
        </p>
      </div>

      <ol className="space-y-2">
        {steps.map((step) => {
          const key = `step-${step.stepNumber}`;
          const isDone = completed.includes(key);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-pressed={isDone}
                data-testid={`mr-m-step-${step.stepNumber}`}
                className={`w-full text-left rounded-xl border p-3 space-y-1.5 transition-colors duration-150 cursor-pointer ${
                  isDone
                    ? 'border-signal-500/40 bg-signal-950/30'
                    : 'border-edge/60 bg-inset/50 hover:border-amber-500/40'
                }`}
              >
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]">
                  <span className={isDone ? 'text-signal-300' : 'text-amber-300'}>
                    Step {step.stepNumber}
                  </span>
                  <span className="text-solder" aria-hidden>
                    /
                  </span>
                  <span className="text-solder">{isDone ? 'held' : 'open'}</span>
                </span>
                <span className="block text-xs text-bone leading-relaxed">{step.action}</span>
                <span className="block text-[11px] text-slate-ink leading-snug">
                  <span className="text-solder">Rule consumed: </span>
                  {step.holdsInHead}
                </span>
                {step.output && (
                  <span className="block text-[11px] text-slate-ink leading-snug">
                    <span className="text-solder">Holding afterwards: </span>
                    {step.output}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
