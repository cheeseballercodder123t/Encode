'use client';

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'amber'
  | 'hazard'
  | 'signal'
  | 'flux'
  | 'outline'
  | 'ghost';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Motion token: 150ms ease-out on colors only. Layout stays instant.
    const baseStyles =
      'inline-flex items-center justify-center font-medium border rounded-full transition-colors duration-150 ease-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-3 py-1 text-[10px] gap-1',
      sm: 'px-3.5 py-1.5 text-xs gap-1.5',
      md: 'px-5 py-2 text-xs gap-2',
      lg: 'px-7 py-2.5 text-sm gap-2',
    };

    // Semantic roles:
    //   amber   = primary action (gold leaf) · signal = success/verify
    //   flux    = AI/Teach · hazard = destructive
    //   primary/secondary/outline/ghost = neutral chrome
    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-deck border-edge/70 text-bone hover:bg-white/[0.04] hover:border-gilt/40',
      secondary:
        'bg-inset border-edge/70 text-slate-ink hover:text-bone hover:border-gilt/30',
      amber:
        'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-600/80 text-inset shadow-gilt hover:from-amber-300 hover:to-amber-500',
      hazard:
        'bg-hazard-600/90 border-hazard-500 text-bone hover:bg-hazard-500 hover:border-hazard-400',
      signal:
        'bg-signal-600 border-signal-500 text-bone hover:bg-signal-500 hover:border-signal-400',
      flux:
        'bg-flux-600 border-flux-500 text-bone hover:bg-flux-500 hover:border-flux-400',
      outline:
        'bg-transparent border-edge/70 text-slate-ink hover:bg-white/[0.04] hover:text-bone',
      ghost:
        'bg-transparent border-transparent text-solder hover:bg-white/[0.04] hover:text-bone',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="shrink-0 font-bold tracking-widest">[ BUSY ]</span>
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
