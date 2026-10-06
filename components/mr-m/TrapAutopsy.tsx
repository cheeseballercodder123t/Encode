'use client';

import React from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';
import { TRAP_LABELS, type TrapId } from '@/lib/mr-m/types';

// ─── Mr M mode: the post-mortem ─────────────────────────────────────────────
//
// A generic "Incorrect. The answer is C." is worse than nothing to this learner.
// What makes a correction permanent is seeing the STRUCTURAL reason and the
// arithmetic that proves it: 0.0336 ÷ 0.0168 = 2.00, and the missing factor of
// two becomes undeniable in one line.
//
// The two halves are kept visually distinct on purpose, because they come from
// different places and carry different kinds of authority. The label and the
// arithmetic are computed deterministically in `lib/mr-m/diagnostics.ts` — a
// ratio is a fact, so it is never left to a model. The narrative (why this is
// structural, and the corrected construction) is the model's, and is shown as
// the reading, not as the evidence.
//
// A secured stage gets no autopsy at all: there is nothing to dissect, and
// inspecting a correct answer teaches the learner to distrust it.

/**
 * Memoised: all three of its inputs are stable while the learner types (the
 * diagnosis is computed once by the workbench and handed down), so a keystroke
 * cannot redraw the autopsy.
 */
export const TrapAutopsy = React.memo(TrapAutopsyInner);

function TrapAutopsyInner({ feynmanResult, trapDiagnosis, autopsy }: InterventionProps) {
  if (feynmanResult?.secured !== false) return null;
  // Nothing to say ⇒ nothing on screen. A block that only restates "that was
  // wrong" is the verdict this panel exists to replace.
  if (!trapDiagnosis && !autopsy?.structuralReason) return null;

  const trapId = (trapDiagnosis?.trapId || autopsy?.trapId || '') as TrapId | '';
  const heading = trapId ? TRAP_LABELS[trapId] : 'Structural post-mortem';
  const reason = trapDiagnosis?.structuralReason || autopsy?.structuralReason || '';
  const whereItBreaks = trapDiagnosis?.whereItBreaks || autopsy?.whereItBreaks || '';
  const arithmeticReveal = trapDiagnosis?.arithmeticReveal || '';
  const correction = autopsy?.correctedConstruction || '';

  return (
    <section
      data-testid="mr-m-autopsy"
      className="rounded-2xl border border-hazard-500/40 bg-hazard-950/25 p-4 space-y-3"
    >
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-hazard-300">
          Autopsy · {heading}
        </span>
        <p className="text-[11px] text-solder leading-snug mt-1">
          The structural reason, not the verdict.
        </p>
      </div>

      {trapId ? (
        <span
          data-testid="mr-m-autopsy-trap"
          className="inline-block font-mono text-[10px] uppercase tracking-wider text-hazard-300 border border-hazard-500/40 rounded-full px-2.5 py-1"
        >
          {trapId}
        </span>
      ) : null}

      {/* The arithmetic is the moment of recognition, so it gets the most
          visual weight on the panel — and it is computed in code, never asked
          of the model, so it cannot be wrong about a number. */}
      {arithmeticReveal ? (
        <div className="space-y-1">
          <p
            data-testid="mr-m-autopsy-arithmetic"
            className="font-mono text-base font-bold text-bone bg-chassis border border-hazard-500/30 rounded-lg px-3 py-2.5 tracking-wide"
          >
            {arithmeticReveal}
          </p>
          {/* Said out loud, because the distinction is the reason to trust the
              line: this figure is arithmetic done on the learner's own numbers,
              and the sentence under it is the examiner's reading. A learner who
              has been burned by a confidently wrong model needs to know which
              half is which. */}
          <p data-testid="mr-m-autopsy-provenance" className="text-[10px] font-mono text-solder">
            computed from your numbers — not written by the model
          </p>
        </div>
      ) : null}

      {reason ? (
        <p data-testid="mr-m-autopsy-reason" className="text-xs text-bone leading-relaxed">
          {reason}
        </p>
      ) : null}

      {whereItBreaks ? (
        <p className="text-[11px] text-slate-ink leading-relaxed">
          <span className="text-solder font-mono uppercase tracking-wider mr-1">
            The chain breaks at:
          </span>
          {whereItBreaks}
        </p>
      ) : null}

      {correction ? (
        <div className="rounded-xl border border-signal-500/40 bg-signal-950/30 p-3 space-y-1">
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-signal-300">
            Written out correctly
          </span>
          <p data-testid="mr-m-autopsy-correction" className="text-xs text-bone leading-relaxed">
            {correction}
          </p>
        </div>
      ) : null}
    </section>
  );
}
