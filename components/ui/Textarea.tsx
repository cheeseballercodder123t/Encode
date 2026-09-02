'use client';

import React, { forwardRef, TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  wordLimit?: number;
  currentWordCount?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, wordLimit, currentWordCount, className = '', rows = 3, ...props }, ref) => {
    const isOverLimit = wordLimit && currentWordCount != null && currentWordCount > wordLimit;
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</label>}
        <textarea
          ref={ref}
          rows={rows}
          className={`w-full bg-slate-900/80 border text-sm text-slate-100 placeholder-slate-500 rounded-xl p-3.5 transition-all focus:outline-none focus:ring-2 resize-none disabled:opacity-50 ${isOverLimit || error ? 'border-rose-500/60 focus:ring-rose-500/40' : 'border-slate-700/80 focus:ring-indigo-500/40 focus:border-indigo-500'} ${className}`}
          {...props}
        />
        <div className="flex items-center justify-between text-xs">
          {error ? <p className="text-rose-400 font-medium">{error}</p> : helperText ? <p className="text-slate-400">{helperText}</p> : <span />}
          {wordLimit != null && currentWordCount != null && (
            <span className={`font-mono text-[11px] ${isOverLimit ? 'text-rose-400 font-bold' : 'text-slate-500'}`}>
              {currentWordCount}/{wordLimit} words
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
