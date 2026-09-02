'use client';

import React, { useState } from 'react';
import { Activity, BoundaryStressTestVisualData } from '@/lib/types';
import { Gauge, AlertOctagon, HelpCircle, Sparkles, Sliders, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function BoundaryStressTestVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};
  const [sliderValues, setSliderValues] = useState<Record<number, number>>({ 0: 85, 1: 95 });
  const [showClue, setShowClue] = useState(false);

  const defaultGauges = [
    {
      variable: 'Primary Parameter X',
      normalRange: 'Normal physiological or operational range',
      extremeCase: 'Approaches 0 or Infinity (Extreme Limit)',
      breakdownResult: 'Linear assumptions collapse, runaway saturation or failure occurs.'
    }
  ];

  const gauges = visualData.boundaryGauges && visualData.boundaryGauges.length > 0
    ? visualData.boundaryGauges
    : defaultGauges;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "Push the main variable to its mathematical or physical limit (e.g. 0, infinity, extreme temp). What breaks first?",
    clue: "Which underlying assumption relies on a non-zero denominator or finite energy budget?",
    missingRoleOrTarget: "Breakdown Threshold & Failure Mode",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const handleSliderChange = (idx: number, val: number) => {
    setSliderValues(prev => ({ ...prev, [idx]: val }));
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-red-500/30 bg-gradient-to-br from-red-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-red-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-red-500/20 text-red-400">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-red-300">
            Boundary Value Stress-Test & Failure Envelopes
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-red-300 bg-red-950/40 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Sliders className="w-2.5 h-2.5" /> Interactive Sliders
        </span>
      </div>

      {/* Generation Effect: Boundary Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-red-950/30 border border-red-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-red-300 block">
                Asymptotic Boundary Challenge
              </span>
              <p className="text-xs text-red-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-red-400 hover:text-red-300 bg-red-900/30 px-2 py-1 rounded border border-red-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Edge Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-red-500/20 text-[11px] text-red-200/90 italic font-serif">
            💡 <strong>Limit Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Parameter Gauges with Live Sliders */}
      <div className="space-y-3">
        {gauges.map((gauge, idx) => {
          const currentVal = sliderValues[idx] ?? 80;
          const isOverCritical = currentVal > 75;

          return (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border transition-all ${
                isOverCritical
                  ? 'border-red-500/60 bg-red-950/30 ring-1 ring-red-500/30'
                  : 'border-slate-700/60 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-red-400" />
                  Parameter: {gauge.variable}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    isOverCritical
                      ? 'bg-red-950/80 text-red-300 border-red-500/60 animate-pulse'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isOverCritical ? 'CRITICAL ASYMPTOTE / FAILURE' : 'NORMAL ENVELOPE'}
                </span>
              </div>

              {/* Interactive Range Slider */}
              <div className="my-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                  <span>Baseline: {gauge.normalRange}</span>
                  <span className="text-red-300 font-bold">{currentVal}% Stress Level</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentVal}
                  onChange={e => handleSliderChange(idx, Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>

              {/* Extreme Case & Breakdown Output */}
              <div className="mt-2 pt-2 border-t border-red-500/20 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                  <span className="text-[9px] font-mono text-slate-400 uppercase block mb-0.5">
                    Extreme Bound Tested
                  </span>
                  <p className="text-slate-200 text-[11px]">{gauge.extremeCase}</p>
                </div>
                <div className="p-2 rounded bg-red-950/40 border border-red-500/30">
                  <span className="text-[9px] font-mono text-red-400 uppercase block mb-0.5 flex items-center gap-1">
                    <AlertOctagon className="w-2.5 h-2.5" /> Failure Mechanism
                  </span>
                  <p className="text-red-200 text-[11px] font-medium">{gauge.breakdownResult}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Generated Boundary Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-red-950/40 via-amber-950/30 to-slate-900/50 border border-red-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-red-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-400" />
              Your Boundary Stress Analysis
            </span>
            <span className="text-[9px] font-mono text-red-400 bg-red-950/60 border border-red-500/30 px-1.5 py-0.5 rounded">
              Limit Deduction
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Extreme Variable:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-red-300">2. Breakdown Point: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-amber-300">3. Physical Reason: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
