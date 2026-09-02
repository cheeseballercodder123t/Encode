'use client';

import React, { useState } from 'react';
import { Activity, FirstPrinciplesVisualData } from '@/lib/types';
import { Network, ArrowDown, Sparkles, HelpCircle, CheckCircle2, ChevronRight, Zap } from 'lucide-react';

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
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-emerald-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
            <Network className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
            Axiomatic Causal Reduction & Causal Dominoes
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
          Generation Effect Active
        </span>
      </div>

      {/* Generation Effect: Partial Causal Premise Challenge */}
      <div className="mb-3.5 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-emerald-300 block">
                First-Principles Deduction Challenge
              </span>
              <p className="text-xs text-emerald-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 px-2 py-1 rounded border border-emerald-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Axiom Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-200/90 italic font-serif">
            💡 <strong>Axiomatic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Step-by-Step Causal Domino Chain */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {nodes.map((node, index) => {
          const isSelected = activeStep === index;
          const isUserLinked = index === 0 ? field1 : index === 1 ? field2 : field3;

          let colorClasses = 'border-slate-700/60 bg-slate-900/60 text-slate-300';
          let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';

          if (node.type === 'input') {
            colorClasses = 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:border-emerald-400';
            badgeColor = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
          } else if (node.type === 'mechanism') {
            colorClasses = 'border-cyan-500/40 bg-cyan-950/30 text-cyan-200 hover:border-cyan-400';
            badgeColor = 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40';
          } else if (node.type === 'outcome') {
            colorClasses = 'border-indigo-500/40 bg-indigo-950/30 text-indigo-200 hover:border-indigo-400';
            badgeColor = 'bg-indigo-950/60 text-indigo-300 border-indigo-500/40';
          }

          return (
            <div
              key={node.id || index}
              onClick={() => setActiveStep(isSelected ? null : index)}
              className={`p-3 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${colorClasses} ${
                isSelected ? 'ring-2 ring-emerald-400 scale-[1.02] shadow-md' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${badgeColor}`}>
                    Stage 0{index + 1}: {node.type || 'Causal Link'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isSelected ? 'Collapse' : 'Click to inspect'}
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

              {/* Dynamic User Generation Link Slot */}
              {isUserLinked && (
                <div className="mt-2 pt-1.5 border-t border-emerald-500/20 text-[10px] text-emerald-300 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">Your deduction: &ldquo;{isUserLinked}&rdquo;</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live User First-Principles Schema Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-slate-900/50 border border-emerald-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Live Axiomatic Deduction
            </span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded">
              Generated Model
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Axiom:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-cyan-300">2. Irreducible Mechanism: </strong>
              {field2}
            </p>
          )}
          {field3 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-indigo-300">3. Inevitable Consequence: </strong>
              {field3}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
