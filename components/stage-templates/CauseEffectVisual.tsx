'use client';

import React, { useState } from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Flame, AlertTriangle, ArrowRight, Activity as ActivityIcon, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function CauseEffectVisual({ activity, field1, field2, field3 }: Props) {
  const [isPerturbed, setIsPerturbed] = useState(false);
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultNodes = [
    { id: '1', label: 'Initial Perturbation', subtext: 'Trigger or variable change (e.g. Depolarization to -55mV)', type: 'input' as const },
    { id: '2', label: 'Causal Chain Cascade', subtext: 'Voltage-gated channel activation & ion flux', type: 'mechanism' as const },
    { id: '3', label: 'Systemic Consequence', subtext: 'Action potential generation & propagation', type: 'outcome' as const },
    { id: '4', label: 'Counterfactual Breakdown', subtext: 'If Na+ channels blocked by TTX -> No action potential fires', type: 'danger' as const }
  ];

  const nodes = visualData.nodes && visualData.nodes.length > 0 ? visualData.nodes : defaultNodes;
  const standardNodes = nodes.filter(n => n.type !== 'danger');
  const brokenNode = nodes.find(n => n.type === 'danger') || defaultNodes[3];

  return (
    <div className="rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-rose-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-rose-500/20 text-rose-400">
            <ActivityIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">
            Perturbation & Counterfactual Domino
          </span>
        </div>

        {/* Interactive Perturbation Simulator Toggle */}
        <button
          type="button"
          onClick={() => setIsPerturbed(!isPerturbed)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition-all flex items-center gap-1.5 border cursor-pointer ${
            isPerturbed
              ? 'bg-rose-600/30 border-rose-500 text-rose-300 shadow-md shadow-rose-500/20 animate-pulse'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
          }`}
        >
          <Flame className={`w-3 h-3 ${isPerturbed ? 'text-rose-400 fill-rose-400' : 'text-slate-400'}`} />
          <span>{isPerturbed ? 'Perturbation Active (Stress State)' : 'Simulate Counterfactual Shock'}</span>
        </button>
      </div>

      {/* Visual Domino Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-3">
        {standardNodes.slice(0, 3).map((node, index) => {
          return (
            <div
              key={node.id || index}
              className={`p-3 rounded-xl border transition-all duration-300 relative ${
                isPerturbed
                  ? 'bg-slate-900/80 border-slate-800 text-slate-500 opacity-60'
                  : index === 0
                  ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                  : index === 1
                  ? 'bg-purple-950/20 border-purple-500/30 text-purple-200'
                  : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                  Step {index + 1}
                </span>
                {!isPerturbed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              </div>
              <div className="font-bold text-xs text-white leading-snug">
                {node.label}
              </div>
              {node.subtext && (
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight font-sans line-clamp-2">
                  {node.subtext}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Counterfactual Broken State Banner */}
      <div
        className={`p-3 rounded-xl border transition-all duration-300 flex items-start gap-2.5 ${
          isPerturbed
            ? 'bg-rose-950/40 border-rose-500 text-rose-100 shadow-xl shadow-rose-950/50'
            : 'bg-slate-900/40 border-slate-800/80 text-slate-400'
        }`}
      >
        <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${isPerturbed ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-500'}`}>
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isPerturbed ? 'text-rose-300' : 'text-slate-400'}`}>
              Counterfactual Failure Mode (What-If Condition)
            </span>
            {isPerturbed && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-black text-[9px] font-black rounded uppercase">
                System Compromised
              </span>
            )}
          </div>
          <p className="text-xs font-serif leading-relaxed mt-0.5">
            {brokenNode.subtext || brokenNode.label}
          </p>
          {field2 && (
            <div className="mt-1.5 pt-1.5 border-t border-rose-500/20 text-[10px] text-rose-300 italic">
              <strong className="not-italic font-mono text-[9px] text-rose-400">Your Breakdown Explanation: </strong>
              &ldquo;{field2.slice(0, 80)}{field2.length > 80 ? '...' : ''}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
