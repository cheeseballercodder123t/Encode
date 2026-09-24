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
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    // [OK]/verified → signal, AI/Teach → flux, warnings → amber, errors → hazard.
    amber: 'bg-amber-950/40 text-amber-300 border-amber/40',
    hazard: 'bg-hazard-950/40 text-hazard-300 border-hazard/40',
    signal: 'bg-signal-950/40 text-signal-300 border-signal/40',
    flux: 'bg-flux-950/40 text-flux-300 border-flux/40',
    edge: 'bg-deck text-solder border-edge',
    bone: 'bg-chassis text-bone border-edge',
  };

  return (
    <span
      className={`inline-flex items-center font-bold font-mono uppercase tracking-wider border ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
