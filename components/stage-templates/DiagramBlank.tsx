'use client';

import React, { useState } from 'react';
import { CompletionSlot, gradeCompletion } from '@/lib/visual-completion';
import { playSound } from '@/lib/audio';

/**
 * The missing cell of a diagram, turned into the exercise.
 *
 * The learner sees the familiar side and an empty slot; they produce the link
 * themselves. Getting it wrong reveals the truth immediately — that is the
 * prediction error worth having — and the corrected link can then go onto the
 * card. Getting it right puts THEIR wording on the card, not the model's.
 */

interface DiagramBlankProps {
  slot: CompletionSlot;
  /** Receives the validated wording (the learner's own when they got it right). */
  onAdopt?: (text: string) => void;
  accent?: 'amber' | 'flux';
}

const ACCENT = {
  amber: {
    box: 'border-amber-500/40 bg-amber-950/20',
    label: 'text-amber-300',
    button: 'bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30',
    ok: 'text-signal-300',
    miss: 'text-hazard-300',
  },
  flux: {
    box: 'border-flux-500/40 bg-flux-500/[0.08]',
    label: 'text-flux-300',
    button: 'bg-flux-500/20 border-flux-500/50 text-flux-300 hover:bg-flux-500/30',
    ok: 'text-signal-300',
    miss: 'text-hazard-300',
  },
} as const;

export function DiagramBlank({ slot, onAdopt, accent = 'amber' }: DiagramBlankProps) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<'hit' | 'miss' | null>(null);
  const tokens = ACCENT[accent];

  const submit = () => {
    if (!value.trim()) return;
    const hit = gradeCompletion(value, slot.answer);
    setResult(hit ? 'hit' : 'miss');
    playSound(hit ? 'success' : 'wrong');
    if (hit && onAdopt) onAdopt(value.trim());
  };

  return (
    <div className={`rounded-md border p-2.5 space-y-2 ${tokens.box}`} data-testid="diagram-blank">
      <span className={`text-[10px] font-mono font-bold uppercase tracking-widest block ${tokens.label}`}>
        [ ? ] Fill the blank
      </span>
      <p className="text-[11px] text-bone leading-relaxed">{slot.prompt}</p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Your link…"
          data-testid="diagram-blank-input"
          className="flex-1 min-w-0 px-2 py-1.5 bg-inset border border-edge text-bone placeholder-solder text-[11px] font-mono outline-none focus:border-solder rounded transition-colors duration-150"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          data-testid="diagram-blank-check"
          className={`px-2.5 py-1.5 text-[10px] font-semibold rounded border transition-colors duration-150 disabled:opacity-40 cursor-pointer shrink-0 ${tokens.button}`}
        >
          Check
        </button>
      </div>

      {result === 'hit' && (
        <p className={`text-[11px] leading-relaxed ${tokens.ok}`} data-testid="diagram-blank-verdict">
          That is the link — it just went onto your card.
        </p>
      )}

      {result === 'miss' && (
        <div className="space-y-1.5" data-testid="diagram-blank-verdict">
          <p className={`text-[11px] leading-relaxed ${tokens.miss}`}>
            Not yet. The link is: <span className="text-bone">{slot.answer}</span>
          </p>
          {slot.hint && <p className="text-[10px] text-solder leading-relaxed">Why: {slot.hint}</p>}
          {onAdopt && (
            <button
              type="button"
              onClick={() => {
                onAdopt(slot.answer);
                playSound('success');
              }}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded border transition-colors duration-150 cursor-pointer ${tokens.button}`}
            >
              Add the corrected link
            </button>
          )}
        </div>
      )}
    </div>
  );
}
