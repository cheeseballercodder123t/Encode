'use client';

import React, { useState } from 'react';
import { Activity, CauseEffectVisualData } from '@/lib/types';

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
    <div className=" border border-hazard500/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-hazard500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-hazard500/20 text-hazard400">
            <span className="text-amber font-bold font-mono">[ FLAME ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-hazard300">
            Counterfactual Perturbation & Breakdown Dynamics
          </span>
        </div>

        {/* Interactive State Toggle */}
        <button
          type="button"
          onClick={() => setIsPerturbed(!isPerturbed)}
          className="flex items-center gap-1.5 text-[10px] font-mono font-bold px-2 py-1 bg-hazard950/50 border border-hazard500/30 text-hazard300 hover:bg-hazard900/40 transition-none-colors"
        >
          {isPerturbed ? (
            <>
              <span className="text-amber font-bold font-mono">[ ON ]</span>
              <span>Simulation: Perturbation Active</span>
            </>
          ) : (
            <>
              <span className="text-amber font-bold font-mono">[ OFF ]</span>
              <span>Simulation: Baseline State</span>
            </>
          )}
        </button>
      </div>

      {/* Generation Effect: Perturbation Challenge Card */}
      <div className="mb-3.5 p-3 bg-hazard950/30 border border-hazard500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-hazard300 block">
                Counterfactual Domino Challenge
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
            {showClue ? 'Hide Clue' : 'Socratic Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-hazard500/20 text-[11px] text-hazard200/90 italic font-mono">
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
            ? 'border-hazard500/60 bg-hazard950/40 text-hazard200 ring-1 ring-rose-500/40'
            : index === 1 && isPerturbed
            ? 'border-amber/50 bg-amber/30 text-amber'
            : 'border-steel/60 bg-deck/60 text-solder';

          return (
            <div
              key={node.id || index}
              className={`p-3  border transition-none-all flex flex-col justify-between ${cardClasses}`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 border border-hazard500/30 bg-hazard950/50 text-hazard300 flex items-center gap-1">
                    {isDanger ? <span className="text-amber font-bold font-mono">[ ! ]</span> : null}
                    Step 0{index + 1}: {index === 0 ? 'Equilibrium' : index === 1 ? 'Perturbation' : 'Consequence'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-bone mb-1">
                  {node.label}
                </h4>

                {node.subtext && (
                  <p className="text-[11px] text-solder leading-relaxed font-mono">
                    {node.subtext}
                  </p>
                )}
              </div>

              {isUserMapped && (
                <div className="mt-2 pt-1.5 border-t border-hazard500/20 text-[10px] text-hazard300 font-mono flex items-center gap-1">
                  <span className="text-amber font-bold font-mono">[ * ]</span>
                  <span className="truncate">Your insight: &ldquo;{isUserMapped}&rdquo;</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Counterfactual Model */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-hazard500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-hazard300 flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Counterfactual Synthesis
            </span>
            <span className="text-[9px] font-mono text-hazard400 bg-hazard950/60 border border-hazard500/30 px-1.5 py-0.5 ">
              Active Simulation
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>Perturbation:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-amber">Cascading Domino: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-hazard300">Failure State: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
