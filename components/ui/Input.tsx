'use client';

import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-3 text-slate-400 pointer-events-none shrink-0">{leftIcon}</div>}
          <input
            ref={ref}
            className={`w-full bg-slate-900/80 border text-sm text-slate-100 placeholder-slate-500 rounded-xl px-3.5 py-2.5 transition-all focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} ${error ? 'border-rose-500/60 focus:ring-rose-500/40' : 'border-slate-700/80 focus:ring-indigo-500/40 focus:border-indigo-500'} ${className}`}
            {...props}
          />
          {rightIcon && <div className="absolute right-3 text-slate-400 pointer-events-none shrink-0">{rightIcon}</div>}
        </div>
        {error && <p className="text-xs text-rose-400 font-medium">{error}</p>}
        {!error && helperText && <p className="text-xs text-slate-400">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
