'use client';

import React, { useState } from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';

// ─── Two-way check (Mr M mode) ──────────────────────────────────────────────
//
// This learner does not learn from a monolithic explanation. They learn by
// ping-pong: state a hypothesis, get an immediate confirm-or-challenge, lock it
// in, and let the brain generate the next logical step on its own.
//
// So the examiner's edge-case question is not a lecture prompt here — it is
// half of a conversation. The learner has to commit to a sentence and then
// either ACCEPT the read or PUSH BACK on it. A challenge is not a failure
// state: an unresolved challenge is recorded on the card as an open question,
// because refusing to accept a rule until it has been stress-tested against a
// counterexample is the whole cognitive strategy this panel serves.
//
// Nothing here calls a network endpoint. The spar is local: the next step is
// the workbench's own Next control, and the panel never blocks it.

type SparMode = 'open' | 'challenged' | 'locked';

/**
 * Memoised: its only prop is the examiner's read, which changes when a check
 * runs and not when a field is typed into.
 */
export const SocraticSpar = React.memo(SocraticSparInner);

function SocraticSparInner({ feynmanResult }: InterventionProps) {
  const probe = feynmanResult?.counterProbe || '';
  const read = feynmanResult?.nailedIt || '';

  const [draft, setDraft] = useState('');
  const [committed, setCommitted] = useState('');
  const [mode, setMode] = useState<SparMode>('open');
  // A new examiner read is a new exchange. Reset as a during-render state
  // adjustment (the pattern the settings and export sheets already use) rather
  // than in an effect, so the panel never renders one probe's answer against
  // the next probe's question.
  const [seenProbe, setSeenProbe] = useState(probe);
  if (probe !== seenProbe) {
    setSeenProbe(probe);
    setDraft('');
    setCommitted('');
    setMode('open');
  }

  if (!probe) return null;

  const commit = () => {
    const sentence = draft.trim();
    if (!sentence) return;
    setCommitted(sentence);
    setMode('locked');
  };

  /**
   * A challenge is a committed sentence too. Freezing it here rather than
   * leaving `committed` empty is what makes the objection below the learner's
   * own words rather than a live echo of a box they can no longer edit — and it
   * is the difference between "still open" being a record and being a display.
   */
  const challenge = () => {
    const sentence = draft.trim();
    if (!sentence) return;
    setCommitted(sentence);
    setMode('challenged');
  };

  return (
    <section
      data-testid="mr-m-spar"
      className="rounded-2xl border border-edge/60 bg-deck/50 p-4 space-y-3"
    >
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-flux-300">
        Two-way check
      </span>
      <p className="text-[11px] text-solder leading-snug">
        Confirm or challenge, then take one step.
      </p>

      {mode === 'locked' ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p data-testid="mr-m-spar-locked" className="text-xs text-signal-300 font-mono">
            Locked in. It is on the card.
          </p>
          {committed ? (
            <p className="text-sm text-bone leading-relaxed border-l-2 border-signal-500/50 pl-3">
              {committed}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {/* The read comes first: it is the thing being confirmed or
              challenged, and without it the question has no anchor. */}
          {read ? (
            <div className="p-2.5 rounded-md border border-signal-500/35 bg-signal-950/30 text-xs text-signal-300 leading-relaxed">
              <span className="font-semibold">The read: </span>
              {read}
            </div>
          ) : null}

          <p className="text-sm text-bone leading-relaxed">{probe}</p>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Two words is a complete answer"
            aria-label="Answer the pressure test in one line"
            data-testid="mr-m-spar-input"
            disabled={mode === 'challenged'}
            className="w-full p-3 bg-chassis border border-edge/70 text-bone placeholder-solder text-xs outline-none focus:border-flux-500/60 rounded-lg transition-colors duration-150 font-sans disabled:opacity-50"
          />

          {/* Both controls demand a commitment: the input has to carry content
              before either is reachable. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="mr-m-spar-confirm"
              onClick={commit}
              disabled={mode === 'challenged' || !draft.trim()}
              className="px-4 py-2 text-[11px] font-mono font-bold tracking-wider rounded-full bg-flux-500 border border-flux-400/60 text-bone transition-colors duration-150 hover:bg-flux-400 disabled:opacity-40 cursor-pointer"
            >
              CONFIRM
            </button>
            <button
              type="button"
              data-testid="mr-m-spar-challenge"
              onClick={challenge}
              disabled={mode === 'challenged' || !draft.trim()}
              className="px-4 py-2 text-[11px] font-mono font-bold tracking-wider rounded-full border border-amber-500/60 text-amber-300 transition-colors duration-150 hover:bg-amber-500/10 disabled:opacity-40 cursor-pointer"
            >
              CHALLENGE
            </button>
          </div>

          {/* A challenge is information, not an error: the objection is kept in
              view and carried onto the card as an open question. */}
          {mode === 'challenged' ? (
            <div
              data-testid="mr-m-spar-objection"
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-md border border-amber-500/50 bg-amber-500/[0.07] text-xs text-bone leading-relaxed space-y-2"
            >
              <p>
                <span className="font-semibold text-amber-300">Still open. </span>
                Your objection is recorded on the card as an open question — not smoothed over.
              </p>
              <p className="text-slate-ink border-l-2 border-amber-500/40 pl-3">{committed}</p>
              <button
                type="button"
                data-testid="mr-m-spar-noted"
                onClick={commit}
                className="px-3 py-1.5 text-[11px] font-mono tracking-wider rounded-full border border-edge text-slate-ink transition-colors duration-150 hover:text-bone cursor-pointer"
              >
                NOTED
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
