'use client';

import React, { useState } from 'react';
import { Activity, FormulaSpatialVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function FormulaSpatialVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [selectedComp, setSelectedComp] = useState<number | null>(0);
  const [showClue, setShowClue] = useState(false);

  const defaultComponents = [
    { symbol: 'X', meaning: 'Primary Dependent Variable / Rate', role: 'variable' as const, unitDimension: 'Dimensionless / Standard Unit' },
    { symbol: '=', meaning: 'Equilibrium Equivalence Operator', role: 'operator' as const },
    { symbol: 'k', meaning: 'Specific Constant / Sensitivity Factor', role: 'constant' as const, unitDimension: 'Scaling Constant' },
    { symbol: 'Y', meaning: 'Driving Potential / Independent Variable', role: 'variable' as const, unitDimension: 'Fundamental Unit' }
  ];

  const components = visualData.formulaComponents && visualData.formulaComponents.length > 0
    ? visualData.formulaComponents
    : defaultComponents;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "In this equation, what physical intuition is encoded by the numerator vs the denominator?",
    clue: "Numerator = Driving force that increases output; Denominator = Resistance/Inertia that opposes it.",
    missingRoleOrTarget: "Intuitive Dimensional Relationship",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-steel">
            <span className="text-amber font-bold font-mono">[ BIN ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-steel">
            Formula Spatial Decomposition & Dimension Station
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-steel bg-steel/40 border border-steel/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ VAR ]</span> Equation Subway
        </span>
      </div>

      {/* Generation Effect: Formula Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-steel block">
                Mathematical Intuition Challenge
              </span>
              <p className="text-xs text-steel font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-steel hover:text-steel bg-steel/30 px-2 py-1 border border-steel/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Dimension Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-steel/90 italic font-mono">
            💡 <strong>Dimensional Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Formula Subway Line */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 p-4 bg-deck/70 border border-steel/20">
        {components.map((comp, idx) => {
          const isSelected = selectedComp === idx;
          const isOperator = comp.role === 'operator';

          return (
            <div
              key={idx}
              onClick={() => setSelectedComp(isSelected ? null : idx)}
              className={`p-3  border transition-none-all cursor-pointer flex flex-col items-center justify-center min-w-[75px] ${
                isSelected
                  ? 'border-steel/80 bg-steel/50 ring-1 ring-sky-400/50 '
                  : isOperator
                  ? 'border-steel bg-chassis/40 text-solder'
                  : 'border-steel/60 bg-deck/60 hover:border-steel/40'
              }`}
            >
              <div className="font-mono text-lg font-black text-bone">
                {comp.symbol}
              </div>

              <span className="text-[9px] font-mono uppercase text-steel mt-1 font-bold">
                {comp.role}
              </span>

              <p className="text-[10px] text-solder text-center mt-1 truncate max-w-[120px]">
                {comp.meaning}
              </p>
            </div>
          );
        })}
      </div>

      {/* User Generated Formula Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-steel flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Intuitive Equation Breakdown
            </span>
            <span className="text-[9px] font-mono text-steel bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
              Formula Decoded
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Numerator / Driving Variable:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-steel">2. Denominator / Resistance: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
