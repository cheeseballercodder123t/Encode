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
        {label && <label className="block label-caps">{label}</label>}
        <div className="relative flex items-center">
          {leftIcon && <div className="absolute left-3 text-solder pointer-events-none shrink-0">{leftIcon}</div>}
          <input
            ref={ref}
            className={`w-full bg-inset border rounded-lg text-xs text-bone placeholder-solder px-3.5 py-2.5 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed font-mono transition-colors duration-150 ${leftIcon ? 'pl-8' : ''} ${rightIcon ? 'pr-8' : ''} ${error ? 'border-hazard-500/70' : 'border-edge/70 focus:border-amber-500/60'} ${className}`}
            {...props}
          />
          {rightIcon && <div className="absolute right-3 text-solder pointer-events-none shrink-0">{rightIcon}</div>}
        </div>
        {error && <p className="text-[10px] text-hazard-300 font-mono">{error}</p>}
        {!error && helperText && <p className="text-[10px] text-solder font-mono">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
