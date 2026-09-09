'use client';

import React, { useState } from 'react';
import { Activity, FirstPrinciplesVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function FirstPrinciplesVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [showClue, setShowClue] = useState(false);

  const defaultNodes = [
    { id: '1', label: '1. Irreducible Axiom / Input', subtext: 'Fundamental physical constraint or baseline law', type: 'input' as const },
    { id: '2', label: '2. Core Causal Mechanism', subtext: 'How force/information/reaction transitions', type: 'mechanism' as const },
    { id: '3', label: '3. Emergent Phenomenon / Output', subtext: 'Observable result derived from first principles', type: 'outcome' as const }
  ];

  const nodes = visualData.nodes && visualData.nodes.length > 0 ? visualData.nodes : defaultNodes;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "What is the foundational, irreducible premise that makes this entire system necessary?",
    clue: "Strip away all domain jargon. What is the fundamental physical or logical constraint?",
    missingRoleOrTarget: "Core Causal Mechanism",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className=" border border-amber/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-amber/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-amber/20 text-amber">
            <span className="text-amber font-bold font-mono">[ NET ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-amber300">
            Axiomatic Causal Reduction & Causal Dominoes
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-amber300 bg-amber950/40 border border-amber/30 px-2 py-0.5 ">
          Generation Effect Active
        </span>
      </div>

      {/* Generation Effect: Partial Causal Premise Challenge */}
      <div className="mb-3.5 p-3 bg-amber950/30 border border-amber/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-amber300 block">
                First-Principles Deduction Challenge
              </span>
              <p className="text-xs text-amber100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-amber hover:text-amber300 bg-amber900/30 px-2 py-1 border border-amber/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Axiom Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-amber/20 text-[11px] text-amber200/90 italic font-mono">
            💡 <strong>Axiomatic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Step-by-Step Causal Domino Chain */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {nodes.map((node, index) => {
          const isSelected = activeStep === index;
          const isUserLinked = index === 0 ? field1 : index === 1 ? field2 : field3;

          let colorClasses = 'border-steel/60 bg-deck/60 text-solder';
          let badgeColor = 'bg-steel text-solder border-steel';

          if (node.type === 'input') {
            colorClasses = 'border-amber/40 bg-amber950/30 text-amber200 hover:border-amber';
            badgeColor = 'bg-amber950/60 text-amber300 border-amber/40';
          } else if (node.type === 'mechanism') {
            colorClasses = 'border-steel/40 bg-steel/30 text-bone hover:border-steel';
            badgeColor = 'bg-steel/60 text-bone border-steel/40';
          } else if (node.type === 'outcome') {
            colorClasses = 'border-steel/40 bg-steel/30 text-bone hover:border-steel';
            badgeColor = 'bg-steel/60 text-bone border-steel/40';
          }

          return (
            <div
              key={node.id || index}
              onClick={() => setActiveStep(isSelected ? null : index)}
              className={`p-3  border transition-none-all cursor-pointer relative flex flex-col justify-between ${colorClasses} ${
                isSelected ? 'ring-2 ring-emerald-400 scale-[1.02] ' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5  border ${badgeColor}`}>
                    Stage 0{index + 1}: {node.type || 'Causal Link'}
                  </span>
                  <span className="text-[10px] text-solder">
                    {isSelected ? 'Collapse' : 'Click to inspect'}
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

              {/* Dynamic User Generation Link Slot */}
              {isUserLinked && (
                <div className="mt-2 pt-1.5 border-t border-amber/20 text-[10px] text-amber300 flex items-center gap-1 font-mono">
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                  <span className="truncate">Your deduction: &ldquo;{isUserLinked}&rdquo;</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live User First-Principles Schema Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-amber/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber300 flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Live Axiomatic Deduction
            </span>
            <span className="text-[9px] font-mono text-amber bg-amber950/60 border border-amber/30 px-1.5 py-0.5 ">
              Generated Model
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Axiom:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">2. Irreducible Mechanism: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">3. Inevitable Consequence: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
