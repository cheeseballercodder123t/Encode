'use client';

import React, { useState } from 'react';
import { Activity, CauseEffectVisualData } from '@/lib/types';
import { Flame, ArrowRight, AlertTriangle, ShieldAlert, Sparkles, HelpCircle, ToggleLeft, ToggleRight } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function CauseEffectVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [isPerturbed, setIsPerturbed] = useState(true);
  const [showClue, setShowClue] = useState(false);

  const defaultNodes = [
    { id: '1', label: '1. Baseline Steady State', subtext: 'System in balanced equilibrium', type: 'input' as const },
    { id: '2', label: '2. Severe Perturbation Shock', subtext: 'Critical variable drops or spikes', type: 'mechanism' as const },
    { id: '3', label: '3. Cascading Failure / Breakdown', subtext: 'Systemic breakdown or fatal consequence', type: 'danger' as const }
  ];

  const nodes = visualData.nodes && visualData.nodes.length > 0 ? visualData.nodes : defaultNodes;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "If the central regulating factor is suddenly eliminated or doubled, what is the immediate ripple effect?",
    clue: "Think about the compensatory mechanisms. Can the system restore equilibrium or does it trigger a positive feedback loop into failure?",
    missingRoleOrTarget: "Cascading Failure Outcome",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-rose-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-rose-500/20 text-rose-400">
            <Flame className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-rose-300">
            Counterfactual Perturbation & Breakdown Dynamics
          </span>
        </div>

        {/* Interactive State Toggle */}
        <button
          type="button"
          onClick={() => setIsPerturbed(!isPerturbed)}
          className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-1 rounded bg-rose-950/50 border border-rose-500/30 text-rose-300 hover:bg-rose-900/40 transition-colors"
        >
          {isPerturbed ? (
            <>
              <ToggleRight className="w-4 h-4 text-rose-400" />
              <span>Simulation: Perturbation Active</span>
            </>
          ) : (
            <>
              <ToggleLeft className="w-4 h-4 text-slate-400" />
              <span>Simulation: Baseline State</span>
            </>
          )}
        </button>
      </div>

      {/* Generation Effect: Perturbation Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-rose-950/30 border border-rose-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-rose-300 block">
                Counterfactual Domino Challenge
              </span>
              <p className="text-xs text-rose-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-rose-400 hover:text-rose-300 bg-rose-900/30 px-2 py-1 rounded border border-rose-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Clue' : 'Socratic Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-rose-500/20 text-[11px] text-rose-200/90 italic font-serif">
            💡 <strong>Dynamic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Ripple Chain Nodes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {nodes.map((node, index) => {
          const isDanger = node.type === 'danger' || index === 2;
          const isUserMapped = index === 0 ? field1 : index === 1 ? field2 : field3;

          let cardClasses = isDanger && isPerturbed
            ? 'border-rose-500/60 bg-rose-950/40 text-rose-200 ring-1 ring-rose-500/40'
            : index === 1 && isPerturbed
            ? 'border-amber-500/50 bg-amber-950/30 text-amber-200'
            : 'border-slate-700/60 bg-slate-900/60 text-slate-300';

          return (
            <div
              key={node.id || index}
              className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${cardClasses}`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-950/50 text-rose-300 flex items-center gap-1">
                    {isDanger ? <ShieldAlert className="w-2.5 h-2.5 text-rose-400" /> : null}
                    Step 0{index + 1}: {index === 0 ? 'Equilibrium' : index === 1 ? 'Perturbation' : 'Consequence'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white mb-1">
                  {node.label}
                </h4>

                {node.subtext && (
                  <p className="text-[11px] text-slate-300 leading-relaxed font-serif">
                    {node.subtext}
                  </p>
                )}
              </div>

              {isUserMapped && (
                <div className="mt-2 pt-1.5 border-t border-rose-500/20 text-[10px] text-rose-300 font-mono flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-rose-400 shrink-0" />
                  <span className="truncate">Your insight: &ldquo;{isUserMapped}&rdquo;</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Counterfactual Model */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-rose-950/40 via-amber-950/30 to-slate-900/50 border border-rose-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-rose-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              Your Counterfactual Synthesis
            </span>
            <span className="text-[9px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 rounded">
              Active Simulation
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>Perturbation:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-amber-300">Cascading Domino: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-rose-300">Failure State: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
