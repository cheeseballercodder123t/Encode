'use client';

import React, { useRef } from 'react';
import { CausalFrame, CausalFieldKey, frameSlots } from '@/lib/causal-frame';

/**
 * The scaffold as one connected sentence.
 *
 * Three separate boxes let the answers drift apart — box 1 describes a trigger,
 * box 2 a consequence, box 3 a definition, and none of them is the causal chain
 * the examiner is asking for. A mad-lib supplies the SYNTAX of the deduction and
 * only asks for the missing links, so the shape of the sentence forces the shape
 * of the thinking: trigger → physical motion → direct effect → macro consequence.
 *
 * Tab jumps to the next blank, Enter from the last blank runs the examiner — the
 * same keys the classic field view uses, so muscle memory carries over.
 */

interface CausalSentenceProps {
  frame: CausalFrame;
  values: Record<CausalFieldKey, string>;
  onChange: (field: CausalFieldKey, value: string) => void;
  onSubmit: () => void;
  /** Shown under the sentence: the examiner's note for the stage, if any. */
  isEvaluating?: boolean;
}

/** Grows with the text so the sentence keeps reading as a sentence. */
function blankWidth(value: string, placeholder: string): string {
  const chars = Math.max(value.length, placeholder.length, 12);
  return `${Math.min(chars + 2, 72)}ch`;
}

export function CausalSentence({ frame, values, onChange, onSubmit, isEvaluating }: CausalSentenceProps) {
  const slots = frameSlots(frame);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="rounded-md border border-edge bg-inset/40 p-3.5 space-y-2.5" data-testid="causal-sentence">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
          Causal scaffold
        </span>
        <span className="font-mono text-[10px] text-solder">
          {frame.source === 'ai' ? 'sentence supplied by the examiner' : 'structural chain'}
          {' · Tab moves to the next blank'}
        </span>
      </div>

      <p className="text-sm text-bone leading-loose" data-testid="causal-sentence-body">
        {frame.parts.map((part, i) => {
          if (part.kind === 'text') return <span key={`t-${i}`}>{part.text}</span>;
          const slot = part.slot;
          const order = slots.findIndex((s) => s.field === slot.field);
          const isLast = order === slots.length - 1;
          return (
            <span key={`s-${slot.field}`} className="inline-flex flex-col align-baseline mx-0.5">
              <span className="text-[9px] uppercase tracking-widest text-solder font-mono">
                {slot.label}
              </span>
              <input
                ref={(el) => {
                  refs.current[slot.field] = el;
                }}
                type="text"
                value={values[slot.field]}
                onChange={(e) => onChange(slot.field, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') return; // browser default already moves forward
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Enter advances to the next blank; the last one submits,
                    // mirroring the classic fields' Cmd/Ctrl+Enter behaviour.
                    const next = slots[order + 1];
                    if (next) refs.current[next.field]?.focus();
                    else if (!isEvaluating) onSubmit();
                  }
                }}
                placeholder={slot.placeholder || slot.label}
                aria-label={slot.label}
                // Lets the workbench's Ctrl+Z handler claim undo for scaffold edits.
                data-dg-field={slot.field}
                data-testid={`causal-slot-${slot.field}`}
                style={{ width: blankWidth(values[slot.field] || '', slot.placeholder || slot.label) }}
                className="bg-chassis border-b border-edge px-1.5 py-0.5 text-sm text-bone placeholder-solder outline-none focus:border-amber-500/60 transition-colors duration-150"
              />
              {!isLast && <span className="sr-only">then</span>}
            </span>
          );
        })}
      </p>

      {frame.constraint && (
        <p className="text-[11px] text-solder leading-relaxed">
          <span className="text-[10px] font-mono uppercase tracking-widest text-hazard-300 mr-1.5">
            [ UNLESS ]
          </span>
          {frame.constraint}
        </p>
      )}
    </div>
  );
}
