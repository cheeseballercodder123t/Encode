'use client';

import React, { useEffect, useState } from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';

/**
 * The unresolved-paradox ledger.
 *
 * Most learners meet a contradiction in chemistry, shrug, and memorise the
 * exception for the test. This learner's cognition literally halts: nothing
 * downstream of `"did that problem give 1 mole or 2 moles?"` can be learned
 * until it is answered. So a contradiction is not a note in a margin — it is a
 * first-class record that stays on screen, with its age, until the sentence
 * that closes it exists.
 *
 * Two deliberate properties:
 *
 *   - It WARNS rather than blocks. The ledger is the loudest thing on the
 *     stage (hazard, not the neutral deck chrome) but the learner can carry on
 *     regardless, and the panel says so. A hard gate would be the same
 *     arbitrary authority this mode exists to remove.
 *   - It owns no state. `openParadoxes` arrives as props and resolving one
 *     calls back up; the coordinator's ledger decides what is still open, so
 *     this panel can never disagree with what is actually stored.
 */

/** Plain-language age of an open contradiction, e.g. "open 3 days". */
function ageLabel(raisedAt: number): string {
  const elapsed = Date.now() - raisedAt;
  // A clock skew or a hand-edited store must not render "open -4 days".
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return 'open just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `open ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `open ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `open ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Memoised: the ledger arrives as a stable array that only changes when a
 * contradiction is raised or closed, so a keystroke in an answer field cannot
 * redraw the list — nor reset the half-typed resolution in a row, which is
 * exactly what a redraw of a component holding `drafts` must never do.
 */
export const ParadoxLedgerPanel = React.memo(ParadoxLedgerPanelInner);

function ParadoxLedgerPanelInner({ openParadoxes, onResolveParadox }: InterventionProps) {
  // One draft per contradiction, keyed by id, so resolving one never disturbs
  // a half-typed sentence in another.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // The age is part of this panel's whole claim — a contradiction is held "with
  // its age" — and it is read at render time. Nothing re-renders the panel on
  // its own, so without a tick a paradox raised two hours ago still reads "open
  // just now" until some unrelated state moves elsewhere in the workbench. One
  // minute is the resolution `ageLabel` actually displays.
  const [, setMinute] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinute((minute) => minute + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!openParadoxes || openParadoxes.length === 0) return null;
  const count = openParadoxes.length;

  const resolve = (id: string) => {
    const resolution = (drafts[id] || '').trim();
    if (!resolution) return;
    onResolveParadox?.(id, resolution);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <section
      className="rounded-2xl border border-hazard-500/40 bg-hazard-950/25 p-4 space-y-3"
      role="region"
      aria-label="Unresolved paradoxes"
      data-testid="mr-m-paradox"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-hazard-300">
          Unresolved paradox
        </span>
        {/* Announced, because resolving one empties a row and the count is the
            only thing on screen that says the ledger actually moved. */}
        <span className="font-mono text-[10px] text-solder" role="status" aria-live="polite">
          {count} open
        </span>
      </div>
      <p className="text-[11px] text-solder leading-snug">
        Held here until you close it. You can carry on regardless — it stays on the list.
      </p>

      <div className="space-y-2.5">
        {openParadoxes.map((entry) => {
          const draft = drafts[entry.id] || '';
          return (
            <div
              key={entry.id}
              className="rounded-xl border border-hazard-500/30 bg-chassis/70 p-3 space-y-2.5"
              data-testid={`mr-m-paradox-${entry.id}`}
            >
              <p className="text-sm text-bone leading-relaxed">{entry.statement}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-solder">
                {entry.topic ? <span className="max-w-[16rem] truncate">{entry.topic}</span> : null}
                <span>{ageLabel(entry.raisedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      resolve(entry.id);
                    }
                  }}
                  aria-label="The sentence that resolves this"
                  placeholder="The sentence that closes it"
                  data-testid={`mr-m-paradox-input-${entry.id}`}
                  className="flex-1 min-w-0 p-3 bg-chassis border border-edge/70 text-bone placeholder-solder text-xs outline-none focus:border-hazard-500/60 rounded-lg font-sans"
                />
                <button
                  type="button"
                  onClick={() => resolve(entry.id)}
                  disabled={!draft.trim()}
                  data-testid={`mr-m-paradox-resolve-${entry.id}`}
                  className="shrink-0 px-4 py-2.5 text-xs font-semibold rounded-full bg-hazard-500 border border-hazard-400/60 text-bone transition-colors duration-150 hover:bg-hazard-400 disabled:opacity-40 cursor-pointer"
                >
                  [ RESOLVE ]
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
