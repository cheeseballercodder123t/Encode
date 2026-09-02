'use client';

import React, { useState } from 'react';
import { Activity, AnalogyMatrixVisualData, AnalogyMappingItem } from '@/lib/types';
import { GitCompare, ArrowLeftRight, HelpCircle, Eye, EyeOff, Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function AnalogyMatrixVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData: AnalogyMatrixVisualData = activity.visualData || {};
  const [showClue, setShowClue] = useState(false);
  const [showExpertSynthesis, setShowExpertSynthesis] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const defaultMappings: AnalogyMappingItem[] = [
    { sourceElement: 'Familiar Source Anchor', targetElement: 'Target Mechanism (Abstract Theory)', explanation: 'Structural correspondence' }
  ];

  const mappings: AnalogyMappingItem[] = visualData.analogyMappings && visualData.analogyMappings.length > 0 
    ? visualData.analogyMappings 
    : defaultMappings;

  const challenge = visualData.generationChallenge || {
    premisePrompt: `If the concept operates like ${selectedPreset || 'a familiar everyday system'}, how does the core mechanism correspond?`,
    clue: "Look at the flow of energy, information, or pressure across the boundary.",
    missingRoleOrTarget: "Core Relational Mapping",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-cyan-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-500/20 text-cyan-400">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
            Gentner Structure-Mapping & Generation Bridge
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded">
            Generation Effect Active
          </span>
        </div>
      </div>

      {/* Generation Effect: Partial Schema Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-cyan-300 block">
                Self-Generation Premise Challenge
              </span>
              <p className="text-xs text-cyan-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-900/30 px-2 py-1 rounded border border-cyan-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Socratic Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-cyan-500/20 text-[11px] text-cyan-200/90 italic font-serif">
            💡 <strong>Socratic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Cross-Domain Mapping Conduit Rows with Live Generation Fill-In */}
      <div className="space-y-2.5">
        {mappings.map((mapping, idx) => {
          const isTargetMissing = !mapping.targetElement || mapping.isPartialTarget;
          return (
            <div
              key={idx}
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors"
            >
              {/* Familiar Source Side */}
              <div className="flex-1 p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-left">
                <span className="text-[9px] font-mono font-bold uppercase text-cyan-400 block mb-0.5">
                  Familiar Source Anchor
                </span>
                <div className="text-xs font-bold text-white">
                  {mapping.sourceElement}
                </div>
              </div>

              {/* Connecting Bridge Arrow */}
              <div className="flex flex-col items-center justify-center shrink-0 text-cyan-400 px-1 py-0.5">
                <ArrowLeftRight className="w-4 h-4 transform rotate-90 sm:rotate-0" />
                <span className="text-[8px] font-mono text-slate-400 mt-0.5 hidden sm:inline">Maps To</span>
              </div>

              {/* Target Theory Side (User-Generated or Live Synced) */}
              <div className="flex-1 p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-left">
                <span className="text-[9px] font-mono font-bold uppercase text-indigo-400 block mb-0.5">
                  Target Science Concept
                </span>
                <div className="text-xs font-bold text-white">
                  {field2 ? (
                    <span className="text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 shrink-0" /> {field2}
                    </span>
                  ) : isTargetMissing ? (
                    <span className="text-amber-300 italic font-mono text-[11px] animate-pulse">
                      ? Type your mapping below...
                    </span>
                  ) : (
                    mapping.targetElement
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Live Analogical Synthesis Preview */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-slate-900/50 border border-cyan-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-cyan-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Your Self-Generated Mental Schema
            </span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded">
              Active Generation
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-indigo-300">Exact Mechanism Correspondence: </strong>
              {field2}
            </p>
          )}
        </div>
      )}

      {/* Interactive Limits & Breakdown Tab */}
      <div className="mt-3 pt-2.5 border-t border-cyan-500/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            Where does this analogy break down? (Boundary Test)
            {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {hasUserGenerated && (
            <button
              type="button"
              onClick={() => setShowExpertSynthesis(!showExpertSynthesis)}
              className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showExpertSynthesis ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showExpertSynthesis ? 'Hide Expert Synthesis' : 'Compare with Expert Synthesis'}
            </button>
          )}
        </div>

        {showBreakdown && (
          <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-200">
            <strong>Analogy Limit: </strong>
            {visualData.whereAnalogyBreaks || "Every analogy has limits—identify where the physical or structural laws diverge from the intuitive source."}
          </div>
        )}

        {showExpertSynthesis && challenge.expertCompletion && (
          <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200">
            <strong className="text-indigo-300 block mb-0.5">AI Expert Ground Truth Schema:</strong>
            {challenge.expertCompletion}
          </div>
        )}
      </div>
    </div>
  );
}
