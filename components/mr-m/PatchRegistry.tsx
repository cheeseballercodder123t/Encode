'use client';

import React, { useState } from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';
import { warningsFrom } from '@/lib/mr-m/ledger';
import { DISCREPANCY_LABELS, type PatchEntry } from '@/lib/mr-m/types';

// ─── Mr M mode: the engineering patch registry (the armory) ─────────────────
//
// A verdict is not a fix. "Incorrect" leaves the learner with the same mental
// compiler that produced the answer, so the same exception is thrown again —
// which is exactly what the hit counts in this panel are for. A fracture that
// has fired once is a slip. A fracture that has fired three times is a STANDING
// FAULT, and a standing fault is the one thing genuinely worth carrying into the
// next problem.
//
// So the panel does two things, and they are aimed at two different moments:
//
//   * BEFORE the attempt — the pre-flight tripwire, which is the only moment a
//     warning can still change the answer. It is deliberately short: a wall of
//     warnings is the same as none. One line, the tag that fired, how many
//     times, and the patch sentence.
//   * AFTER the attempt — the armory, every recorded fracture with its own
//     arithmetic and its own patch line, editable in place.
//
// The edit is the part that matters pedagogically. The statement arrives as a
// scaffold written in this file's voice (see `patchStatementFor`); the moment
// the learner rewrites it, it becomes a change they intend to make rather than a
// rule they were handed. So the field is always theirs, and it is never
// overwritten by a later hit — only the hit count and the arithmetic move.

const KIND_STYLES: Record<PatchEntry['kind'], string> = {
  SIGN_FLIP: 'border-hazard-500/50 text-hazard-300 bg-hazard-500/10',
  ORDER_INVERSION: 'border-hazard-500/50 text-hazard-300 bg-hazard-500/10',
  FACTOR_OF_TWO: 'border-amber-500/50 text-amber-300 bg-amber-500/10',
  STOICHIOMETRIC_RATIO: 'border-amber-500/50 text-amber-300 bg-amber-500/10',
  // A whole factor of seven and a dropped exponent are the same class of miss
  // as a factor of two: the shape is arithmetic, and it is the whole-number
  // factor or the power that went missing. The log constant shares the flux
  // treatment, because the missing step is the notation rather than a factor.
  POWER_LAW: 'border-amber-500/50 text-amber-300 bg-amber-500/10',
  SUBSCRIPT_DROPPED: 'border-flux-500/50 text-flux-300 bg-flux-500/10',
  LOG_SCALE: 'border-flux-500/50 text-flux-300 bg-flux-500/10',
  DIMENSIONAL_CONVERSION_ERROR: 'border-flux-500/50 text-flux-300 bg-flux-500/10',
};

/** Memoised: the patch list only changes when a check records one. */
export const PatchRegistry = React.memo(PatchRegistryInner);

function PatchRegistryInner({ patches, patchIndex, onEditPatch }: InterventionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (!patches || patches.length === 0) return null;

  const warnings = warningsFrom(patches);

  const beginEdit = (patch: PatchEntry) => {
    setEditingId(patch.id);
    setDraft(patch.statement);
  };

  const commitEdit = () => {
    if (editingId && draft.trim()) onEditPatch?.(editingId, draft.trim());
    setEditingId(null);
    setDraft('');
  };

  return (
    <section
      data-testid="mr-m-patch-registry"
      className="rounded-2xl border border-edge/70 bg-deck/40 p-4 space-y-3"
    >
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-solder">
          Standing faults
        </span>
        <p className="text-[11px] text-solder leading-snug mt-1">
          Fractures that have fired more than once on this topic. One hit is a slip; a repeat is a
          defect worth patching before the next attempt.
        </p>
      </div>

      {/* PRE-FLIGHT. The only moment a warning can still change the answer. */}
      {warnings.length > 0 && (
        <div
          data-testid="mr-m-patch-warning"
          className="rounded-xl border border-hazard-500/40 bg-hazard-950/25 p-3 space-y-2"
        >
          <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-hazard-300">
            ⚠ Pre-flight tripwire
          </span>
          {warnings.map((warning) => (
            <div key={warning.patch.id} className="space-y-0.5">
              <p className="text-[11px] text-bone leading-snug" data-testid="mr-m-patch-headline">
                {warning.headline}
              </p>
              <p className="text-[11px] text-hazard-200/90 leading-snug">{warning.line}</p>
            </div>
          ))}
        </div>
      )}

      <ul data-testid="mr-m-patch-list" className="space-y-2">
        {patches.map((patch) => {
          const number = patchIndex?.[patch.id];
          const editing = editingId === patch.id;
          return (
            <li
              key={patch.id}
              data-testid={`mr-m-patch-${patch.id}`}
              className="rounded-xl border border-edge/60 bg-inset/60 p-3 space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                {number !== undefined && (
                  <span className="font-mono text-[10px] text-solder">
                    [ PATCH #{String(number).padStart(2, '0')} ]
                  </span>
                )}
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${
                    KIND_STYLES[patch.kind]
                  }`}
                >
                  {DISCREPANCY_LABELS[patch.kind]}
                </span>
                <span className="font-mono text-[10px] text-solder">
                  ×{patch.hits} · last {new Date(patch.lastSeenAt).toLocaleDateString()}
                </span>
              </div>

              {patch.arithmeticReveal ? (
                <p className="font-mono text-[13px] font-bold text-bone bg-chassis border border-hazard-500/25 rounded-lg px-2.5 py-1.5 tracking-wide">
                  {patch.arithmeticReveal}
                </p>
              ) : null}

              {editing ? (
                <div className="space-y-1.5">
                  <textarea
                    data-testid={`mr-m-patch-input-${patch.id}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    className="w-full text-xs text-bone bg-chassis border border-edge/70 rounded-lg px-2.5 py-2 leading-relaxed focus:outline-none focus:border-gilt/50"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid={`mr-m-patch-save-${patch.id}`}
                      disabled={!draft.trim()}
                      onClick={commitEdit}
                      className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider rounded-full border border-signal-500/50 text-signal-300 bg-signal-500/10 hover:bg-signal-500/20 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      [ Save the patch ]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDraft('');
                      }}
                      className="px-2.5 py-1 text-[11px] font-mono text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p
                    data-testid={`mr-m-patch-statement-${patch.id}`}
                    className="text-xs text-bone leading-relaxed flex-1"
                  >
                    {patch.statement}
                  </p>
                  {onEditPatch && (
                    <button
                      type="button"
                      data-testid={`mr-m-patch-edit-${patch.id}`}
                      onClick={() => beginEdit(patch)}
                      className="shrink-0 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider rounded-full border border-edge/70 text-solder hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
                    >
                      [ edit ]
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
