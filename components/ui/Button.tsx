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
      'inline-flex items-center justify-center font-medium border transition-colors duration-150 ease-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer rounded-md';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-2 py-1 text-[10px] gap-1',
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-xs gap-2',
      lg: 'px-6 py-2.5 text-sm gap-2',
    };

    // Semantic roles:
    //   amber   = primary action · signal = success/verify · flux = AI/Teach
    //   hazard  = destructive · primary/secondary/outline/ghost = neutral chrome
    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-chassis border-edge text-bone hover:bg-deck hover:border-solder active:bg-amber active:border-amber active:text-chassis',
      secondary:
        'bg-deck border-edge text-solder hover:bg-chassis hover:text-bone active:bg-amber active:border-amber active:text-chassis',
      amber:
        'bg-amber-500 border-amber-500 text-inset hover:bg-amber-400 hover:border-amber-400 active:bg-amber-600 active:border-amber-600',
      hazard:
        'bg-hazard border-hazard text-bone hover:bg-hazard-400 hover:border-hazard-400 active:bg-hazard-600 active:border-hazard-600',
      signal:
        'bg-signal border-signal text-chassis hover:bg-signal-400 hover:border-signal-400 active:bg-signal-600 active:border-signal-600',
      flux:
        'bg-flux border-flux text-bone hover:bg-flux-400 hover:border-flux-400 active:bg-flux-600 active:border-flux-600',
      outline:
        'bg-transparent border-edge text-solder hover:bg-deck hover:text-bone active:bg-amber active:border-amber active:text-chassis',
      ghost:
        'bg-transparent border-transparent text-solder hover:bg-deck hover:text-bone active:bg-amber active:border-amber active:text-chassis',
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
