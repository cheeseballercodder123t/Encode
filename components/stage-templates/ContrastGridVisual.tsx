'use client';

import React, { useState } from 'react';
import { Activity, ContrastGridVisualData } from '@/lib/types';
import { Grid, Sparkles, HelpCircle, AlertTriangle, Check, ShieldCheck } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function ContrastGridVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};
  const [selectedQuadrant, setSelectedQuadrant] = useState<number | null>(0);
  const [showClue, setShowClue] = useState(false);

  const defaultMatrix = {
    axisX: 'Property X (High vs Low)',
    axisY: 'Property Y (Active vs Passive)',
    quadrants: [
      { title: 'Quadrant I: High X / Active Y', items: ['Concept Alpha'], trapWarning: 'Commonly confused with Quadrant II in exams' },
      { title: 'Quadrant II: Low X / Active Y', items: ['Concept Beta'], trapWarning: 'Watch out for opposite reaction rates' },
      { title: 'Quadrant III: High X / Passive Y', items: ['Concept Gamma'], trapWarning: 'Requires distinct co-factors' },
      { title: 'Quadrant IV: Low X / Passive Y', items: ['Concept Delta'], trapWarning: 'Baseline inert state' }
    ]
  };

  const matrix = visualData.contrastMatrix && visualData.contrastMatrix.quadrants?.length === 4
    ? visualData.contrastMatrix
    : defaultMatrix;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "What is the single sharpest test or condition that distinguishes these two easily confused concepts?",
    clue: "Look for a zero vs non-zero property, reverse direction, or distinct substrate requirement.",
    missingRoleOrTarget: "Discriminative Disambiguation Rule",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-indigo-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-400">
            <Grid className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-indigo-300">
            2x2 Discriminative Matrix & Disambiguation Grid
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <ShieldCheck className="w-2.5 h-2.5" /> Trap Disambiguation
        </span>
      </div>

      {/* Generation Effect: Contrast Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-indigo-300 block">
                Lookalike Disambiguation Challenge
              </span>
              <p className="text-xs text-indigo-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 px-2 py-1 rounded border border-indigo-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Contrast Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-indigo-500/20 text-[11px] text-indigo-200/90 italic font-serif">
            💡 <strong>Contrast Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive 2x2 Matrix Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {matrix.quadrants?.map((quad, qIdx) => {
          const isSelected = selectedQuadrant === qIdx;

          return (
            <div
              key={qIdx}
              onClick={() => setSelectedQuadrant(isSelected ? null : qIdx)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-indigo-400/80 bg-indigo-950/50 ring-1 ring-indigo-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-indigo-500/40'
              }`}
            >
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-indigo-300 bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 rounded block w-fit mb-1.5">
                  Quadrant 0{qIdx + 1}
                </span>

                <h4 className="text-xs font-bold text-white mb-2">
                  {quad.title}
                </h4>

                <div className="flex flex-wrap gap-1 mb-2">
                  {quad.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-indigo-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {quad.trapWarning && (
                <div className="mt-2 pt-1.5 border-t border-indigo-500/20 text-[10px] text-amber-300/90 flex items-start gap-1 font-mono">
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <span>{quad.trapWarning}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Contrast Model */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/50 border border-indigo-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Your Disambiguation Rule
            </span>
            <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 rounded">
              Trap Avoided
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Discriminating Test:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-indigo-300">2. Trap Warning: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
