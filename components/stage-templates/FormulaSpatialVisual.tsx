'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Sigma, ArrowRight, Sparkles } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function FormulaSpatialVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultComponents = [
    { symbol: 'A', meaning: 'Final Consolidated Result / Yield', role: 'state' as const },
    { symbol: '=', meaning: 'Equivalence / Equilibrium', role: 'operator' as const },
    { symbol: 'P', meaning: 'Initial Principal / Substrate', role: 'variable' as const },
    { symbol: '· (1 + r/n)', meaning: 'Compounding Factor / Rate Factor', role: 'operator' as const },
    { symbol: '^(nt)', meaning: 'Exponential Horizon / Time Scaling', role: 'variable' as const }
  ];

  const components = visualData.formulaComponents && visualData.formulaComponents.length > 0
    ? visualData.formulaComponents
    : defaultComponents;

  return (
    <div className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-teal-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-teal-500/20 text-teal-400">
            <Sigma className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-teal-300">
            Formula & Sequence Spatial Decomposition Track
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-teal-300 bg-teal-950/40 border border-teal-500/30 px-2 py-0.5 rounded">
          Mathematical & Sequential Rigor
        </span>
      </div>

      {/* Formula Component Track */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
        {components.map((comp, idx) => {
          const isVar = comp.role === 'variable';
          const isOp = comp.role === 'operator';
          const isState = comp.role === 'state';

          return (
            <div
              key={idx}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                isState
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : isVar
                  ? 'bg-teal-950/30 border-teal-500/40 text-teal-200'
                  : 'bg-indigo-950/30 border-indigo-500/40 text-indigo-200'
              }`}
            >
              <div className="text-base font-black font-mono text-white mb-0.5">
                {comp.symbol}
              </div>
              <div className="text-[9px] font-mono text-slate-300 max-w-[110px] leading-tight">
                {comp.meaning}
              </div>
            </div>
          );
        })}
      </div>

      {/* User Intuitive Equation Breakdown */}
      {field1 && (
        <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-500/30 flex items-start gap-2.5 text-xs">
          <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-teal-300 block">
              Your Causal Equation Interpretation:
            </span>
            <p className="text-slate-200 font-serif italic text-xs mt-0.5">
              &ldquo;{field1}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
