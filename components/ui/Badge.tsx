'use client';

import React, { ReactNode } from 'react';

export type BadgeVariant = 'indigo' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate' | 'cyan';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function Badge({
  children,
  variant = 'indigo',
  size = 'sm',
  dot = false,
  icon,
  className = '',
}: BadgeProps) {
  const sizeStyles: Record<BadgeSize, string> = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2.5 py-0.5 text-xs gap-1.5',
    md: 'px-3 py-1 text-xs gap-2',
  };

  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    indigo: { container: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30', dot: 'bg-indigo-400' },
    emerald: { container: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    amber: { container: 'bg-amber-500/10 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
    violet: { container: 'bg-violet-500/10 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
    rose: { container: 'bg-rose-500/10 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
    slate: { container: 'bg-slate-800/60 text-slate-300 border-slate-700/60', dot: 'bg-slate-400' },
    cyan: { container: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30', dot: 'bg-cyan-400' },
  };

  return (
    <span
      className={`inline-flex items-center font-semibold border rounded-full ${sizeStyles[size]} ${variantStyles[variant].container} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${variantStyles[variant].dot}`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
