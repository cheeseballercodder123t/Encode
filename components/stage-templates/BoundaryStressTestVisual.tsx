'use client';

import React, { useState } from 'react';
import { Activity, BoundaryStressTestVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function BoundaryStressTestVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
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
    <div className=" border border-hazard500/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-hazard500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-hazard500/20 text-hazard400">
            <span className="text-amber font-bold font-mono">[ GAUGE ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-hazard300">
            Boundary Value Stress-Test & Failure Envelopes
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-hazard300 bg-hazard950/40 border border-hazard500/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ SLIDERS ]</span> Interactive Sliders
        </span>
      </div>

      {/* Generation Effect: Boundary Challenge Card */}
      <div className="mb-3.5 p-3 bg-hazard950/30 border border-hazard500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-hazard300 block">
                Asymptotic Boundary Challenge
              </span>
              <p className="text-xs text-hazard100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-hazard400 hover:text-hazard300 bg-hazard900/30 px-2 py-1 border border-hazard500/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Edge Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-hazard500/20 text-[11px] text-hazard200/90 italic font-mono">
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
              className={`p-3.5  border transition-none-all ${
                isOverCritical
                  ? 'border-hazard500/60 bg-hazard950/30 ring-1 ring-red-500/30'
                  : 'border-steel/60 bg-deck/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-bone flex items-center gap-1.5">
                  <span className="text-amber font-bold font-mono">[ GAUGE ]</span>
                  Parameter: {gauge.variable}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5  border ${
                    isOverCritical
                      ? 'bg-hazard950/80 text-hazard300 border-hazard500/60 '
                      : 'bg-amber950/60 text-amber300 border-amber/40'
                  }`}
                >
                  {isOverCritical ? 'CRITICAL ASYMPTOTE / FAILURE' : 'NORMAL ENVELOPE'}
                </span>
              </div>

              {/* Interactive Range Slider */}
              <div className="my-2.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-solder mb-1">
                  <span>Baseline: {gauge.normalRange}</span>
                  <span className="text-hazard300 font-bold">{currentVal}% Stress Level</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={currentVal}
                  onChange={e => handleSliderChange(idx, Number(e.target.value))}
                  className="w-full h-1.5 bg-steel appearance-none cursor-pointer accent-red-500"
                />
              </div>

              {/* Extreme Case & Breakdown Output */}
              <div className="mt-2 pt-2 border-t border-hazard500/20 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-chassis/60 border border-steel">
                  <span className="text-[9px] font-mono text-solder uppercase block mb-0.5">
                    Extreme Bound Tested
                  </span>
                  <p className="text-bone text-[11px]">{gauge.extremeCase}</p>
                </div>
                <div className="p-2 bg-hazard950/40 border border-hazard500/30">
                  <span className="text-[9px] font-mono text-hazard400 uppercase block mb-0.5 flex items-center gap-1">
                    <span className="text-amber font-bold font-mono">[ ! ]</span> Failure Mechanism
                  </span>
                  <p className="text-hazard200 text-[11px] font-medium">{gauge.breakdownResult}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Generated Boundary Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-hazard500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-hazard300 flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Boundary Stress Analysis
            </span>
            <span className="text-[9px] font-mono text-hazard400 bg-hazard950/60 border border-hazard500/30 px-1.5 py-0.5 ">
              Limit Deduction
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Extreme Variable:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-hazard300">2. Breakdown Point: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-amber">3. Physical Reason: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
