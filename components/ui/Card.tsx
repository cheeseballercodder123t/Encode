'use client';

import React, { HTMLAttributes, forwardRef, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', hoverEffect = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`ui-card relative rounded-2xl border border-edge/70 bg-deck shadow-panel ${hoverEffect ? 'ui-card-hover' : ''} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet-head px-5 py-4 rounded-t-2xl ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-mono text-[11px] uppercase tracking-[0.2em] text-slate-ink ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-solder mt-1.5 leading-relaxed ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`sheet-head px-5 py-3 border-t border-edge/50 rounded-b-2xl flex items-center justify-end gap-2 ${className}`}>
      {children}
    </div>
  );
}
