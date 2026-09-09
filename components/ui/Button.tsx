'use client';

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'amber' | 'hazard' | 'outline' | 'ghost';
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
    const baseStyles =
      'inline-flex items-center justify-center font-bold font-mono uppercase tracking-wider border transition-none duration-0 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer rounded-none';

    const sizeStyles: Record<ButtonSize, string> = {
      xs: 'px-2 py-1 text-[10px] gap-1',
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-xs gap-2',
      lg: 'px-6 py-2.5 text-sm gap-2',
    };

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-chassis border-steel text-bone hover:bg-deck active:bg-amber active:text-chassis',
      secondary:
        'bg-deck border-steel text-solder hover:bg-chassis active:bg-amber active:text-chassis',
      amber:
        'bg-amber border-amber text-chassis hover:bg-amber active:bg-hazard active:text-bone',
      hazard:
        'bg-hazard border-hazard text-bone hover:bg-hazard active:bg-amber active:text-chassis',
      outline:
        'bg-transparent border-steel text-solder hover:bg-deck active:bg-amber active:text-chassis',
      ghost:
        'bg-transparent border-transparent text-solder hover:bg-deck active:bg-amber active:text-chassis',
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
