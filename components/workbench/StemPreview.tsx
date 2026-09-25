'use client';

import React from 'react';
import { isStemContent, renderStemText } from '@/lib/stem-text';

/**
 * Shows what plain-ASCII STEM notation becomes, right under the input.
 *
 * Typing `r^{4}` or `threshold -> influx` in a plain box is how a physicist
 * actually thinks; the alternative (a formula editor) costs more attention than
 * the concept does. So the raw text stays the single source of truth — stored,
 * graded, exported — and this line just stops the notation from reading as
 * noise while it is being written.
 *
 * Renders nothing for prose, so it never adds chrome to a normal answer.
 */
export function StemPreview({ value, label }: { value: string; label?: string }) {
  if (!value.trim() || !isStemContent(value)) return null;
  return (
    <div className="flex items-baseline gap-2 px-1" data-testid="stem-preview">
      <span className="font-mono text-[10px] uppercase tracking-widest text-flux-300 shrink-0">
        [ STEM ]
      </span>
      <span
        className="text-[11px] text-bone leading-relaxed"
        data-testid="stem-preview-body"
        dangerouslySetInnerHTML={{ __html: renderStemText(value) }}
      />
      {label && <span className="text-[10px] text-solder font-mono shrink-0">{label}</span>}
    </div>
  );
}
