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
        <div className="flex items-center justify-between">
          <span className="label-caps">{label}</span>
          <span className="font-mono text-[11px] text-amber-200">{value}{unit}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none cursor-pointer focus:outline-none rounded-full bg-inset"
        style={{ background: `linear-gradient(to right, #C79340 0%, #E3C285 ${percentage}%, #2A2E39 ${percentage}%, #2A2E39 100%)` }}
      />
    </div>
  );
}
