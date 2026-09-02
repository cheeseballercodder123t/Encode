'use client';

import React from 'react';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  className?: string;
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, unit = '%', className = '' }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  return (
    <div className={`space-y-2 w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">{label}</span>
          <span className="font-mono font-bold text-amber-300">{value}{unit}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        style={{ background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${percentage}%, #1e293b ${percentage}%, #1e293b 100%)` }}
      />
    </div>
  );
}
