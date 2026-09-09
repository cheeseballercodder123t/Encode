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
    <div className={`space-y-1 w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="font-bold text-solder uppercase tracking-wider">{label}</span>
          <span className="font-bold text-amber">{value}{unit}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-none appearance-none cursor-pointer focus:outline-none bg-steel"
        style={{ background: `linear-gradient(to right, #C8782A 0%, #C8782A ${percentage}%, #2B2D31 ${percentage}%, #2B2D31 100%)` }}
      />
    </div>
  );
}
