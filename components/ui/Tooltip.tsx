'use client';

import React, { useState, ReactNode } from 'react';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, position = 'top', className = '' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };
  return (
    <div className={`relative inline-flex ${className}`} onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 pointer-events-none px-3 py-1.5 text-[10px] text-bone bg-chassis border border-edge/70 rounded-lg whitespace-nowrap font-mono shadow-panel ${positionStyles[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
