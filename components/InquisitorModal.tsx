'use client';

import React, { useEffect, useState } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { loadParadoxes, openParadoxesFor, raiseParadox } from '@/lib/mr-m/ledger';
import { loadInterferenceTraps, type InterferenceTrap } from '@/lib/interference-traps';
import { paradoxDraftFor } from '@/lib/inquisitor/parse';
import { VERDICT_LABELS, type InquisitorRead } from '@/lib/inquisitor/contract';
import type { ParadoxEntry } from '@/lib/mr-m/types';

/**
 * The interrogation cockpit.
 *
 * The learner states a claim they suspect is true (or fear is false) and gets
 * the verdict, the governing law behind it, and — when there is one — the exact
 * edge case where it stops holding. No score, no grade, no "great question".
 *
 * Two things make this a cockpit rather than a chat box:
 *
 *   * **The claim is quoted back.** A verdict on a claim the learner did not
 *     make is worse than no verdict, so what was interrogated is always on
 *     screen next to the answer, and a misreading is visible in one glance.
 *   * **A boundary becomes a record.** A named edge case is a live paradox for
 *     this learner: the claim holds AND there is a case where it does not. It
 *     goes into the same Mr M ledger every other contradiction goes into, so it
 *     stays visible until a sentence closes it. The claim never commits itself —
 *     the learner does, the way the autopsy offers a trap card and never writes
 *     one.
 */

export interface InquisitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What the learner is working on; scopes the ledger pre-flight. */
  topic?: string;
  /** The stage's own prompt or framework, when an interrogation starts mid-session. */
  domain?: string;
  /** Source text the verdict should stay inside, when one exists. */
  contextSnippet?: string;
}

/** The three readings, styled so the verdict is legible before it is read. */
const VERDICT_STYLES: Record<InquisitorRead['verdict'], { chip: string; glyph: string }> = {
  TRUE: { chip: 'bg-signal-500/15 border-signal-500/50 text-signal-300', glyph: '🟢' },
  FALSE: { chip: 'bg-hazard-500/15 border-hazard-500/50 text-hazard-300', glyph: '🔴' },
  TRUE_WITH_BOUNDARY_TRIPWIRE: {
    chip: 'bg-amber-500/15 border-amber-500/50 text-amber-200',
    glyph: '🟡',
  },
};

/** Pre-flight lists stay short: a warning you scroll past is not a warning. */
const MAX_PREFLIGHT = 3;

/** The scope a boundary takes when there is no session topic to hang it on. */
const UNTITLED_SCOPE = 'Untitled';

export function InquisitorModal({ isOpen, onClose, topic, domain, contextSnippet }: InquisitorModalProps) {
  const sheetRef = useModalA11y(isOpen, onClose);

  const [claim, setClaim] = useState('');
  const [read, setRead] = useState<InquisitorRead | null>(null);
  const [downgraded, setDowngraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [savedStatement, setSavedStatement] = useState<string | null>(null);
  const [openParadoxes, setOpenParadoxes] = useState<ParadoxEntry[]>([]);
  const [priorTraps, setPriorTraps] = useState<InterferenceTrap[]>([]);
  const [ledgerVersion, setLedgerVersion] = useState(0);

  /**
   * The ledgers are read in an effect, never during render.
   *
   * Both live in localStorage, which does not exist on the server: reading them
   * inline would render an empty list on the server and a populated one on the
   * client's first paint — the hydration mismatch this app has already been
   * bitten by once. Same pattern, and the same scoped exception, as the
   * workbench's read of this ledger in `StudioWorkbench.tsx`: the rule does not
   * model the external-system-on-mount case, and the alternative it would prefer
   * is the mismatch.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe localStorage sync; the rule does not model the external-system-on-mount exception */
  useEffect(() => {
    if (!isOpen) return;
    const cleanTopic = (topic || '').trim();
    // The cockpit is usable with no session at all — an interrogation starts
    // from a sentence, not from a source — so with no topic it holds its own
    // scope. `paradoxDraftFor` writes to the same one, which is what keeps a
    // held boundary visible when the modal is reopened from the launchpad.
    setOpenParadoxes(openParadoxesFor(cleanTopic || UNTITLED_SCOPE, loadParadoxes()));
    setPriorTraps(
      cleanTopic
        ? loadInterferenceTraps()
            .filter((trap) => trap.topic.trim().toLowerCase() === cleanTopic.toLowerCase())
            .slice(0, MAX_PREFLIGHT)
        : []
    );
  }, [isOpen, topic, ledgerVersion]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const interrogate = async () => {
    const text = claim.trim();
    if (!text || isReading) return;

    setIsReading(true);
    setError(null);
    setRead(null);
    setDowngraded(false);
    setSavedStatement(null);
    playSound('click');

    try {
      const res = await fetch('/api/inquisitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: text, topic, domain, contextSnippet, settings: loadAISettings() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The claim could not be interrogated.');

      setRead({
        verdict: data.verdict,
        claim: data.claim,
        proof: Array.isArray(data.proof) ? data.proof : [],
        tripwire: data.tripwire || '',
        correction: data.correction || '',
      });
      setDowngraded(Boolean(data.downgraded));
      playSound(data.verdict === 'FALSE' ? 'wrong' : 'success');
    } catch (e: any) {
      setError(e?.message || 'The claim could not be interrogated. Check your AI settings.');
      playSound('wrong');
    } finally {
      setIsReading(false);
    }
  };

  const draft = read ? paradoxDraftFor(read, topic || '') : null;

  const commitParadox = () => {
    if (!draft) return;
    const entry = raiseParadox(draft.topic, draft.statement);
    setSavedStatement(entry ? entry.statement : null);
    setLedgerVersion((v) => v + 1);
    playSound('pop');
  };

  if (!isOpen) return null;

  const cleanTopic = (topic || '').trim();

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Question-first inquisitor"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-inset/80 p-3 sm:p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-3xl rounded-lg border border-edge bg-deck mt-4 sm:mt-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-flux-500/15 text-flux-300">
              <span className="text-amber font-bold font-mono">[ ? ]</span>
            </span>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-bone block">
                Question-first inquisitor
              </span>
              <span className="text-[10px] font-mono text-solder">
                {cleanTopic ? `verifying claims about ${cleanTopic}` : 'state a claim and get the verdict'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inquisitor"
            className="shrink-0 px-2.5 py-1 text-[11px] font-mono border border-edge text-solder hover:text-bone hover:border-hazard-500/50 transition-colors duration-150 cursor-pointer"
          >
            [ X ]
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* The pre-flight: what this topic has already caught you on. */}
          {(openParadoxes.length > 0 || priorTraps.length > 0) && (
            <div className="space-y-2" data-testid="inquisitor-preflight">
              {openParadoxes.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.07] p-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 block mb-1.5">
                    [ OPEN ] {openParadoxes.length} contradiction{openParadoxes.length === 1 ? '' : 's'} still
                    unresolved here
                  </span>
                  <ul data-testid="inquisitor-open-paradoxes" className="space-y-1">
                    {openParadoxes.slice(0, MAX_PREFLIGHT).map((entry) => (
                      <li key={entry.id} className="text-[11px] text-bone/90 leading-relaxed">
                        · {entry.statement}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {priorTraps.length > 0 && (
                <div className="rounded-md border border-hazard-500/40 bg-hazard-500/[0.07] p-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-hazard-300 block mb-1.5">
                    [ TRAPS ] this topic has caught you on before
                  </span>
                  <ul data-testid="inquisitor-prior-traps" className="space-y-1">
                    {priorTraps.map((trap) => (
                      <li key={trap.id} className="text-[11px] text-bone/90 leading-relaxed">
                        · {trap.cardFront}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* The claim bar. */}
          <div className="space-y-2">
            <label
              htmlFor="inquisitor-claim"
              className="text-[10px] font-mono uppercase tracking-widest text-solder block"
            >
              The claim under interrogation
            </label>
            <textarea
              id="inquisitor-claim"
              data-testid="inquisitor-claim"
              data-autofocus
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={3}
              placeholder="e.g. Bond breaking requires energy, so ATP hydrolysis releasing energy means a bond breaks on its own."
              className="w-full rounded-md border border-edge bg-inset p-3 text-sm leading-relaxed text-bone placeholder-solder outline-none focus:border-flux-500/60 transition-colors duration-150 resize-none font-sans"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={interrogate}
                disabled={isReading || !claim.trim()}
                data-testid="inquisitor-submit"
                className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-400 text-inset transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isReading ? 'Interrogating…' : 'Interrogate the claim'}
              </button>
              {read && (
                <button
                  type="button"
                  onClick={() => {
                    setRead(null);
                    setDowngraded(false);
                    setSavedStatement(null);
                    playSound('click');
                  }}
                  className="px-3 py-2 text-[11px] font-medium rounded-md bg-inset border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Clear reading
                </button>
              )}
              <span className="text-[10px] font-mono text-solder">
                a claim, not a topic — something that could be false
              </span>
            </div>
          </div>

          {error && (
            <p
              data-testid="inquisitor-error"
              className="rounded-md border border-hazard-500/40 bg-hazard-500/10 p-2.5 text-[11px] leading-relaxed text-hazard-300"
            >
              {error}
            </p>
          )}

          {/* The reading. */}
          {read && (
            <div className="space-y-3" data-testid="inquisitor-reading">
              <div className="flex items-start gap-2 flex-wrap">
                <span
                  data-testid="inquisitor-verdict"
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold font-mono ${VERDICT_STYLES[read.verdict].chip}`}
                >
                  <span aria-hidden="true">{VERDICT_STYLES[read.verdict].glyph}</span>
                  [{read.verdict}] {VERDICT_LABELS[read.verdict]}
                </span>
                {downgraded && (
                  <span
                    data-testid="inquisitor-downgraded"
                    className="text-[10px] font-mono text-solder leading-relaxed"
                  >
                    no boundary was named, so this reads as true as far as the model could take it — not
                    as verified-with-a-limit
                  </span>
                )}
              </div>

              <div className="rounded-md border border-edge bg-inset p-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-solder block mb-1">
                  what was interrogated
                </span>
                <p data-testid="inquisitor-claim-echo" className="text-xs leading-relaxed text-bone">
                  {read.claim}
                </p>
              </div>

              <div className="rounded-md border border-edge/70 p-3">
                <span className="text-[10px] font-mono uppercase tracking-widest text-flux-300 block mb-1.5">
                  [ LAW ] why it holds — or does not
                </span>
                <ul data-testid="inquisitor-proof" className="space-y-1.5">
                  {read.proof.map((line, index) => (
                    <li key={index} className="text-xs leading-relaxed text-bone/90 flex gap-2">
                      <span className="shrink-0 font-mono text-[10px] text-solder pt-0.5">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {read.tripwire && (
                <div className="rounded-md border border-amber-500/45 bg-amber-500/[0.07] p-3 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 block">
                    [ EDGE ] where it stops holding
                  </span>
                  <p data-testid="inquisitor-tripwire" className="text-xs leading-relaxed text-bone">
                    {read.tripwire}
                  </p>
                  {draft && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={commitParadox}
                        data-testid="inquisitor-save-paradox"
                        className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-200 hover:bg-amber-500/25 transition-colors duration-150 cursor-pointer"
                      >
                        Hold this open in the paradox ledger
                      </button>
                      {savedStatement && (
                        <span
                          data-testid="inquisitor-saved"
                          className="text-[10px] font-mono text-amber-300"
                        >
                          held open — it stays visible until a sentence closes it
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {read.correction && (
                <div className="rounded-md border border-hazard-500/40 bg-hazard-500/[0.07] p-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-hazard-300 block mb-1">
                    [ FIX ] the construction that does hold
                  </span>
                  <p data-testid="inquisitor-correction" className="text-xs leading-relaxed text-bone">
                    {read.correction}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
