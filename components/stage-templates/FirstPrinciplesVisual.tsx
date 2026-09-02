'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { ArrowRight, Layers, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function FirstPrinciplesVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};
  const defaultNodes = [
    { id: '1', label: 'Prerequisite Base State', subtext: 'Fundamental axiom or starting condition', type: 'input' as const },
    { id: '2', label: 'Underlying Mechanism', subtext: 'Physical interaction or rule of logic', type: 'mechanism' as const },
    { id: '3', label: 'Emergent Outcome', subtext: 'Macro phenomenon observed', type: 'outcome' as const },
  ];
  const nodes = visualData.nodes && visualData.nodes.length > 0 ? visualData.nodes : defaultNodes;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-400">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-indigo-300">
            First-Principles Causal Chain Diagram
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
          {nodes.length} Causal Milestones
        </span>
      </div>

      {/* Interactive Visual Node Sequence */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 relative">
        {nodes.map((node, index) => {
          const isFirst = index === 0;
          const isLast = index === nodes.length - 1;
          const isMech = !isFirst && !isLast;

          return (
            <React.Fragment key={node.id || index}>
              <div
                className={`flex-1 p-3 rounded-xl border transition-all duration-200 relative group ${
                  node.type === 'input' || isFirst
                    ? 'bg-blue-950/20 border-blue-500/30 text-blue-200 shadow-sm shadow-blue-500/10'
                    : node.type === 'outcome' || isLast
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200 shadow-sm shadow-emerald-500/10'
                    : 'bg-indigo-950/30 border-indigo-500/40 text-indigo-200 shadow-sm shadow-indigo-500/15'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                    Step {index + 1} • {node.type || (isFirst ? 'Axiom' : isLast ? 'Outcome' : 'Causal Engine')}
                  </span>
                  {isLast ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>

                <div className="font-bold text-xs text-white leading-snug">
                  {node.label}
                </div>

                {node.subtext && (
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight font-sans line-clamp-2">
                    {node.subtext}
                  </p>
                )}

                {/* Real-time live reflection from user input */}
                {isFirst && field1 && (
                  <div className="mt-2 pt-1.5 border-t border-blue-500/20 text-[10px] text-blue-300 italic">
                    <span className="not-italic font-mono text-[9px] text-blue-400 block font-bold">Your Core Axiom:</span>
                    &ldquo;{field1.slice(0, 70)}{field1.length > 70 ? '...' : ''}&rdquo;
                  </div>
                )}
                {isMech && field2 && (
                  <div className="mt-2 pt-1.5 border-t border-indigo-500/20 text-[10px] text-indigo-300 italic">
                    <span className="not-italic font-mono text-[9px] text-indigo-400 block font-bold">Your Mechanism:</span>
                    &ldquo;{field2.slice(0, 70)}{field2.length > 70 ? '...' : ''}&rdquo;
                  </div>
                )}
              </div>

              {index < nodes.length - 1 && (
                <div className="flex items-center justify-center text-slate-600 md:text-indigo-400 self-center">
                  <ArrowRight className="w-4 h-4 transform rotate-90 md:rotate-0" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
