'use client';

import React, { ReactNode } from 'react';

export type BadgeVariant = 'amber' | 'hazard' | 'signal' | 'flux' | 'edge' | 'bone';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function Badge({
  children,
  variant = 'edge',
  size = 'sm',
  className = '',
}: BadgeProps) {
  const sizeStyles: Record<BadgeSize, string> = {
    xs: 'px-2 py-0.5 text-[10px]',
    sm: 'px-2.5 py-1 text-[10px]',
    md: 'px-3 py-1 text-xs',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    // [OK]/verified → signal, AI/Teach → flux, gold emphasis → amber, errors → hazard.
    amber: 'bg-amber-500/12 text-amber-200 border-gilt/35',
    hazard: 'bg-hazard-500/12 text-hazard-200 border-hazard-500/40',
    signal: 'bg-signal-500/12 text-signal-300 border-signal-500/40',
    flux: 'bg-flux-500/12 text-flux-300 border-flux-500/40',
    edge: 'bg-inset text-slate-ink border-edge/70',
    bone: 'bg-chassis text-bone border-edge/70',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-mono uppercase tracking-[0.16em] ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
