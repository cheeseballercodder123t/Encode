'use client';

import React, { useState } from 'react';
import { Activity, FormulaSpatialVisualData } from '@/lib/types';
import { Binary, Sparkles, HelpCircle, CheckCircle2, Variable } from 'lucide-react';

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
    <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-sky-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-sky-500/20 text-sky-400">
            <Binary className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-sky-300">
            Formula Spatial Decomposition & Dimension Station
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-sky-300 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Variable className="w-2.5 h-2.5" /> Equation Subway
        </span>
      </div>

      {/* Generation Effect: Formula Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-sky-950/30 border border-sky-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-sky-300 block">
                Mathematical Intuition Challenge
              </span>
              <p className="text-xs text-sky-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-sky-400 hover:text-sky-300 bg-sky-900/30 px-2 py-1 rounded border border-sky-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Dimension Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-sky-500/20 text-[11px] text-sky-200/90 italic font-serif">
            💡 <strong>Dimensional Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Formula Subway Line */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 p-4 rounded-xl bg-slate-900/70 border border-sky-500/20">
        {components.map((comp, idx) => {
          const isSelected = selectedComp === idx;
          const isOperator = comp.role === 'operator';

          return (
            <div
              key={idx}
              onClick={() => setSelectedComp(isSelected ? null : idx)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center min-w-[75px] ${
                isSelected
                  ? 'border-sky-400/80 bg-sky-950/50 ring-1 ring-sky-400/50 shadow-md'
                  : isOperator
                  ? 'border-slate-800 bg-slate-950/40 text-slate-400'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-sky-500/40'
              }`}
            >
              <div className="font-mono text-lg font-black text-white">
                {comp.symbol}
              </div>

              <span className="text-[9px] font-mono uppercase text-sky-400 mt-1 font-bold">
                {comp.role}
              </span>

              <p className="text-[10px] text-slate-300 text-center mt-1 truncate max-w-[120px]">
                {comp.meaning}
              </p>
            </div>
          );
        })}
      </div>

      {/* User Generated Formula Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-sky-950/40 via-blue-950/30 to-slate-900/50 border border-sky-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-sky-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Your Intuitive Equation Breakdown
            </span>
            <span className="text-[9px] font-mono text-sky-400 bg-sky-950/60 border border-sky-500/30 px-1.5 py-0.5 rounded">
              Formula Decoded
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Numerator / Driving Variable:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-sky-300">2. Denominator / Resistance: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
