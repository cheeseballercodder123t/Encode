'use client';

import React, { useRef, useState } from 'react';
import { payloadFor, type InterventionProps } from '@/lib/mr-m/registry';

// ─── Mr M mode: the coordinate system, before any procedure ─────────────────
//
// Shown a formula, this learner's first instinct is "why THAT order? where is
// the zero? why did we define it this way?" — and if the app just emits the
// equation, they will not trust it. So the governing law and the reference
// point arrive BEFORE the procedure, not as a footnote under it.
//
// The edge-case block is the other half of the pillar, and it is not decorative.
// This learner does not accept a rule until they have personally stress-tested
// it against a counterexample ("then why does calcium hydroxide end in -ide?!"),
// so the counterexample is handed over upfront — and if the one they have is
// still unanswered, the stress-test control files it in the paradox ledger
// rather than letting it evaporate.

/**
 * Memoised: the workbench re-renders on every keystroke in the answer fields,
 * and nothing this panel draws depends on them. Every prop here is stable while
 * the learner types, so React can actually skip the work.
 */
export const AxiomFirstPanel = React.memo(AxiomFirstPanelInner);

function AxiomFirstPanelInner({ activity, onRaiseParadox }: InterventionProps) {
  const axiom = payloadFor(activity)?.axiomFirst;
  const [stressOpen, setStressOpen] = useState(false);
  const [stressDraft, setStressDraft] = useState('');
  // Focus goes back to the control that opened the field when it closes, so a
  // keyboard user is never dropped back at the top of the document.
  const stressTriggerRef = useRef<HTMLButtonElement | null>(null);

  // No axiom, no panel: a card reading "[no law stated]" is the arbitrary noise
  // this whole mode exists to remove.
  if (!axiom) return null;

  const submitStress = () => {
    const statement = stressDraft.trim();
    if (!statement) return;
    onRaiseParadox?.(statement);
    setStressDraft('');
    setStressOpen(false);
  };

  return (
    <section
      data-testid="mr-m-axiom"
      className="rounded-2xl border border-edge/60 bg-deck/50 p-4 space-y-3"
    >
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          Coordinate system first
        </span>
        <p className="text-[11px] text-solder leading-snug mt-1">
          The law and the zero point, before the procedure.
        </p>
      </div>

      {/* The governing law leads: the invariant, stated as physics. */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 space-y-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          Governing law
        </span>
        <p data-testid="mr-m-axiom-law" className="text-sm text-bone leading-relaxed">
          {axiom.governingLaw}
        </p>
      </div>

      {/* The coordinate frame: where zero is, and why the definition is ordered. */}
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-1">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-solder">
            Zero point
          </dt>
          <dd className="text-xs text-bone leading-relaxed">{axiom.coordinateOrigin}</dd>
        </div>
        <div className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-1">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-solder">
            Why that is the zero
          </dt>
          <dd className="text-xs text-slate-ink leading-relaxed">{axiom.zeroPoint}</dd>
        </div>
        <div className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-1 sm:col-span-2">
          <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-solder">
            Why it is defined this way round
          </dt>
          <dd className="text-xs text-slate-ink leading-relaxed">{axiom.whyThisDefinition}</dd>
        </div>
      </dl>

      {/* Labelled, because an unlabelled line of monospace under a definition
          is just another thing to interpret — and the point of this panel is
          that nothing has to be interpreted. */}
      {axiom.calculusTranslation ? (
        <div className="bg-inset/70 border border-edge/60 rounded-lg px-3 py-2 space-y-0.5">
          <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-solder">
            The same idea as an integral
          </span>
          <p data-testid="mr-m-axiom-calculus" className="font-mono text-xs text-slate-ink">
            {axiom.calculusTranslation}
          </p>
        </div>
      ) : null}

      {axiom.counterexample ? (
        <div
          data-testid="mr-m-axiom-counterexample"
          className="rounded-xl border border-flux-500/35 bg-flux-500/[0.06] p-3 space-y-1"
        >
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-flux-300">
            Edge case
          </span>
          <p className="text-xs text-bone leading-relaxed">{axiom.counterexample}</p>
        </div>
      ) : null}

      {/* The stress test. Filing a paradox is how a rule gets accepted here, so
          the control writes straight into the ledger instead of into a note. */}
      <div className="space-y-2">
        {stressOpen ? (
          <div id="mr-m-axiom-stress-field" className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={stressDraft}
              onChange={(e) => setStressDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitStress();
                }
                if (e.key === 'Escape') {
                  // The draft is kept, so closing by mistake costs nothing.
                  setStressOpen(false);
                  stressTriggerRef.current?.focus();
                }
              }}
              placeholder="What here does not add up yet?"
              aria-label="The contradiction this rule has not survived"
              data-testid="mr-m-axiom-stress-input"
              className="flex-1 min-w-0 p-3 bg-chassis border border-edge/70 text-bone placeholder-solder text-xs outline-none focus:border-amber-500/60 rounded-lg transition-colors duration-150 font-sans"
            />
            <button
              type="button"
              onClick={submitStress}
              disabled={!stressDraft.trim()}
              data-testid="mr-m-axiom-stress-submit"
              className="px-4 py-2.5 text-xs font-semibold rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border border-amber-600/80 text-inset shadow-gilt transition-colors duration-150 hover:from-amber-300 hover:to-amber-500 disabled:opacity-40 disabled:shadow-none cursor-pointer shrink-0"
            >
              Hold it
            </button>
          </div>
        ) : (
          <button
            type="button"
            ref={stressTriggerRef}
            onClick={() => setStressOpen(true)}
            aria-expanded={stressOpen}
            aria-controls="mr-m-axiom-stress-field"
            data-testid="mr-m-axiom-stress"
            title="Not accepting a rule until you have tried to break it: log the counterexample that still does not fit"
            className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider rounded-full border border-edge/70 text-solder hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
          >
            [ Stress-test this rule ]
          </button>
        )}
      </div>
    </section>
  );
}
