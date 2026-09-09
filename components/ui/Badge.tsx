'use client';

import React, { ReactNode } from 'react';

export type BadgeVariant = 'amber' | 'hazard' | 'steel' | 'bone';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export function Badge({
  children,
  variant = 'steel',
  size = 'sm',
  className = '',
}: BadgeProps) {
  const sizeStyles: Record<BadgeSize, string> = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantStyles: Record<BadgeVariant, string> = {
    amber: 'bg-amber/10 text-amber border-amber/40',
    hazard: 'bg-hazard/10 text-hazard border-hazard/40',
    steel: 'bg-deck text-solder border-steel',
    bone: 'bg-chassis text-bone border-steel',
  };

  return (
    <span
      className={`inline-flex items-center font-bold font-mono uppercase tracking-wider border rounded-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
