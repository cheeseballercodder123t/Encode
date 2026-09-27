'use client';

import React from 'react';

interface BracketTagProps {
  /** The token between the brackets, e.g. 'X', 'DL', 'PEN'. */
  label: string;
  /** Tailwind color classes. Defaults to the workbench amber; pass '' to inherit. */
  tone?: string;
  /** Extra classes appended to the wrapper span. */
  className?: string;
}

/**
 * A bracket-dressed mono token (`[ DL ]`) used as button dressing across the
 * workbench chrome.
 *
 * It always renders inline on a single line — the literal `[ DL ]` string the
 * e2e specs and accessible names rely on. The token must never break: a wrapped
 * token reads as three stacked lines (`[` / `DL` / `]`) instead of one label,
 * and a narrow button is no reason to stop looking like `[ DL ]`.
 *
 * Decorative bracket markers that are NOT button labels (status chips like
 * `[ OK ]`, chevrons like `[ v ]`) stay plain spans that share the
 * `.font-bold.font-mono` rule in globals.css, so they are single-line too.
 */
export function BracketTag({ label, tone = 'text-amber', className = '' }: BracketTagProps) {
  return (
    <span className={`font-bold font-mono whitespace-nowrap ${tone} ${className}`}>
      {`[ ${label} ]`}
    </span>
  );
}
