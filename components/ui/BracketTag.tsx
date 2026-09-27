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
 * On sm+ it renders inline — the literal `[ DL ]` string the e2e specs and
 * accessible names rely on. On phones the brackets frame the token vertically
 * ( a `[` / token / `]` stack ), so a cramped one-line `[ DL ]` becomes a
 * thumb-shaped button instead of overflowing a ~360px row.
 *
 * Decorative bracket markers that are NOT button labels (status chips like
 * `[ OK ]`, chevrons like `[ v ]`) should stay plain spans.
 */
export function BracketTag({ label, tone = 'text-amber', className = '' }: BracketTagProps) {
  return (
    <span className={`font-bold font-mono ${tone} ${className}`}>
      {/* sm+ : the classic inline token. */}
      <span className="hidden sm:inline whitespace-nowrap">{`[ ${label} ]`}</span>
      {/* Phone : brackets frame the token vertically. */}
      <span className="inline-flex sm:hidden flex-col items-center leading-none">
        <span aria-hidden="true">[</span>
        <span>{label}</span>
        <span aria-hidden="true">]</span>
      </span>
    </span>
  );
}
