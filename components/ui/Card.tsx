'use client';

import React, { HTMLAttributes, forwardRef, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  hoverEffect?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', glass = true, hoverEffect = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border border-slate-800 ${
          glass ? 'bg-[#0F111A]/90 backdrop-blur-md shadow-xl' : 'bg-[#0F111A]'
        } ${
          hoverEffect ? 'transition-all duration-300 hover:border-slate-700 hover:shadow-2xl hover:shadow-indigo-500/5' : ''
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 border-b border-slate-800/80 bg-[#131622]/60 rounded-t-2xl ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-base font-bold text-white tracking-tight ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-slate-400 mt-0.5 leading-relaxed ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-4 border-t border-slate-800/80 bg-[#131622]/40 rounded-b-2xl flex items-center justify-end gap-3 ${className}`}>
      {children}
    </div>
  );
}
