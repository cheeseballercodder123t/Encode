'use client';

import React, { useEffect, useState } from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';
import type { ConfidenceTier } from '@/lib/interference-traps';
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
//
// ─── The card ───────────────────────────────────────────────────────────────
//
// The autopsy also never writes a card on its own: an InterferenceTrap demands
// a confidenceTier, and no panel can know how confident the learner WAS — only
// they can say that honestly. So the offer is explicit, the tier is theirs to
// declare, and the flaw line defaults to the structural reason but keeps
// whatever they actually type. Saved cards ship at the FRONT of the Anki deck
// (the hypercorrection funnel), tagged with the tier they declared.

const TIERS: { value: ConfidenceTier; label: string }[] = [
  { value: 'guess', label: 'I was guessing' },
  { value: 'half', label: 'Half sure' },
  { value: 'bet', label: "I'd have bet on it" },
];

/**
 * Memoised: its inputs are stable while the learner types — the diagnosis and
 * the committed-answer snapshot are computed once per check by the workbench
 * and handed down — so a keystroke cannot redraw the autopsy.
 */
export const TrapAutopsy = React.memo(TrapAutopsyInner);

function TrapAutopsyInner({
  feynmanResult,
  trapDiagnosis,
  autopsy,
  committedAnswer,
  onSaveTrapCard,
  trapCardSaved,
}: InterventionProps) {
  // The two learner inputs. Reset when the check result is replaced — a new
  // post-mortem deserves a fresh declaration, not last time's confidence.
  const [tier, setTier] = useState<ConfidenceTier | null>(null);
  const [flawDraft, setFlawDraft] = useState('');
  /* eslint-disable react-hooks/set-state-in-effect -- panel-local draft reset when the check result is replaced; the rule does not model the new-record-replaces-old exception */
  useEffect(() => {
    setTier(null);
    setFlawDraft('');
  }, [feynmanResult]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // The card is offered only when there is honest material to carry: the
  // answer they committed, and a structural read worth naming.
  const canMakeCard = !!onSaveTrapCard && !!committedAnswer?.trim() && !!reason;
  const effectiveFlaw = flawDraft.trim() || reason;

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

      {canMakeCard ? (
        <div
          data-testid="mr-m-autopsy-card-flow"
          className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-2.5"
        >
          {trapCardSaved ? (
            <p
              data-testid="mr-m-autopsy-card-saved"
              className="text-[11px] text-signal-300 leading-snug"
              role="status"
            >
              Saved. It ships at the front of your deck, tagged with the confidence you declared.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-solder leading-snug">
                Name this trap and it becomes a card at the front of your deck — a confident
                mistake corrected is the memory that sticks hardest.
              </p>

              <div role="group" aria-label="How confident were you when you committed?">
                <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-solder mb-1.5">
                  At the moment you answered, you were…
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {TIERS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={tier === option.value}
                      data-testid={`mr-m-autopsy-card-tier-${option.value}`}
                      onClick={() => setTier(option.value)}
                      className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors duration-150 cursor-pointer ${
                        tier === option.value
                          ? 'bg-hazard-500/20 border-hazard-500/50 text-hazard-200'
                          : 'bg-inset border-edge/70 text-solder hover:text-bone hover:border-gilt/40'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label
                htmlFor="mr-m-autopsy-card-flaw"
                className="block font-mono text-[10px] uppercase tracking-[0.2em] text-solder"
              >
                The flaw, in your words
              </label>
              <textarea
                id="mr-m-autopsy-card-flaw"
                data-testid="mr-m-autopsy-card-flaw"
                value={flawDraft}
                onChange={(event) => setFlawDraft(event.target.value)}
                rows={2}
                placeholder={reason}
                className="w-full text-xs text-bone bg-chassis border border-edge/70 rounded-lg px-2.5 py-2 leading-relaxed placeholder:text-slate-ink focus:outline-none focus:border-gilt/50"
              />

              <button
                type="button"
                data-testid="mr-m-autopsy-card-save"
                disabled={!tier || !effectiveFlaw}
                onClick={() => tier && onSaveTrapCard?.({ tier, flawLine: effectiveFlaw })}
                className="px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-full border border-hazard-500/50 text-hazard-200 bg-hazard-500/10 hover:bg-hazard-500/20 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                [ Make this a trap card ]
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
