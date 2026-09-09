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
      <div className="space-y-1 w-full">
        {label && <label className="block text-[10px] font-bold text-solder uppercase tracking-wider font-mono">{label}</label>}
        <textarea
          ref={ref}
          rows={rows}
          className={`w-full bg-chassis border text-xs text-bone placeholder-solder rounded-none p-3 focus:outline-none resize-none disabled:opacity-50 font-mono ${isOverLimit || error ? 'border-hazard' : 'border-steel focus:border-amber'} ${className}`}
          {...props}
        />
        <div className="flex items-center justify-between text-[10px] font-mono">
          {error ? <p className="text-hazard">{error}</p> : helperText ? <p className="text-solder">{helperText}</p> : <span />}
          {wordLimit != null && currentWordCount != null && (
            <span className={`${isOverLimit ? 'text-hazard font-bold' : 'text-solder'}`}>
              {currentWordCount}/{wordLimit} words
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
