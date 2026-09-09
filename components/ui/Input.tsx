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
      <div className="space-y-1 w-full">
        {label && <label className="block text-[10px] font-bold text-solder uppercase tracking-wider font-mono">{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-2 text-solder pointer-events-none shrink-0">{leftIcon}</div>}
          <input
            ref={ref}
            className={`w-full bg-chassis border text-xs text-bone placeholder-solder rounded-none px-3 py-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed font-mono ${leftIcon ? 'pl-7' : ''} ${rightIcon ? 'pr-7' : ''} ${error ? 'border-hazard' : 'border-steel focus:border-amber'} ${className}`}
            {...props}
          />
          {rightIcon && <div className="absolute right-2 text-solder pointer-events-none shrink-0">{rightIcon}</div>}
        </div>
        {error && <p className="text-[10px] text-hazard font-mono">{error}</p>}
        {!error && helperText && <p className="text-[10px] text-solder font-mono">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
