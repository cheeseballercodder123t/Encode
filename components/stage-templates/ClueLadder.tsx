'use client';

import React, { useState } from 'react';
import { clueRungs } from '@/lib/clue-ladder';

// ─── The shared clue-ladder control ─────────────────────────────────────────
//
// Every generation challenge used to render its own one-shot hint toggle, and
// each of the thirteen templates had its own button wording for it. This is the
// one control they all use now: same affordance, same staging, same promise.
//
// The promise, stated in the UI because it is the point: the rungs get MORE
// specific, and there is still no answer key. A revealed answer ends the recall
// attempt, and the attempt is what encodes — so the ladder stops at the
// strongest scaffold instead of at the answer.

export interface ClueLadderProps {
  /** The single hint older payloads carry; becomes the first rung. */
  clue?: string;
  /** Ordered rungs, weakest first. */
  clues?: string[];
  /** The template's own wording for the first click ("Get Chunking Rule"). */
  label: string;
  /** The bold prefix shown before a rung ("Chunking Clue"). */
  title: string;
}

export function ClueLadder({ clue, clues, label, title }: ClueLadderProps) {
  const rungs = clueRungs(clue, clues);
  const [revealed, setRevealed] = useState(0);

  // A stage with no hints renders no control: a button that answers nothing is
  // worse than no button.
  if (rungs.length === 0) return null;

  const shown = rungs.slice(0, revealed);
  const exhausted = revealed >= rungs.length;
  const nextLabel = revealed === 0 ? label : 'Next clue';

  return (
    <div data-testid="clue-ladder" className="mt-2.5 pt-2 border-t border-amber/20">
      <button
        type="button"
        onClick={() => setRevealed((count) => Math.min(count + 1, rungs.length))}
        disabled={exhausted}
        aria-expanded={revealed > 0}
        aria-controls="clue-ladder-rungs"
        data-testid="clue-ladder-button"
        className="text-[10px] font-mono font-semibold text-amber bg-amber/30 px-2 py-1 border border-amber/20 transition-colors duration-150 disabled:opacity-60 disabled:cursor-default cursor-pointer"
      >
        {exhausted ? 'Strongest clue shown' : nextLabel}
      </button>

      {shown.length > 0 && (
        <ul id="clue-ladder-rungs" data-testid="clue-ladder-rungs" className="mt-2 space-y-1.5">
          {shown.map((rung) => (
            <li
              key={rung.index}
              data-testid={`clue-rung-${rung.index}`}
              className="text-[11px] text-amber/90 italic font-mono leading-relaxed"
            >
              💡 <strong>{title}{rungs.length > 1 ? ` ${rung.index} of ${rungs.length}` : ''}:</strong>{' '}
              {rung.text}
            </li>
          ))}
          {exhausted && (
            <li data-testid="clue-ladder-no-answer" className="text-[10px] font-mono text-solder">
              That is the strongest scaffold this stage carries — there is no answer key to
              reveal, because deriving it is the point.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
