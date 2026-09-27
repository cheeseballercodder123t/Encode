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
        {label && <label className="block label-caps">{label}</label>}
        <textarea
          ref={ref}
          rows={rows}
          className={`w-full bg-inset border rounded-lg text-xs text-bone placeholder-solder p-3.5 leading-relaxed focus:outline-none resize-none disabled:opacity-50 font-mono transition-colors duration-150 ${isOverLimit || error ? 'border-hazard-500/70' : 'border-edge/70 focus:border-amber-500/60'} ${className}`}
          {...props}
        />
        <div className="flex items-center justify-between text-[10px] font-mono">
          {error ? <p className="text-hazard-300">{error}</p> : helperText ? <p className="text-solder">{helperText}</p> : <span />}
          {wordLimit != null && currentWordCount != null && (
            <span className={`${isOverLimit ? 'text-hazard-300 font-bold' : 'text-solder'}`}>
              {currentWordCount}/{wordLimit} words
            </span>
          )}
        </div>
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
