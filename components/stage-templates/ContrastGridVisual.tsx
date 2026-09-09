'use client';

import React, { useState } from 'react';
import { Activity, ContrastGridVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function ContrastGridVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
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
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-bone">
            <span className="text-amber font-bold font-mono">[ GRID ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-bone">
            2x2 Discriminative Matrix & Disambiguation Grid
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-bone bg-steel/40 border border-steel/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ OK ]</span> Trap Disambiguation
        </span>
      </div>

      {/* Generation Effect: Contrast Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-bone block">
                Lookalike Disambiguation Challenge
              </span>
              <p className="text-xs text-bone font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-bone hover:text-bone bg-steel/30 px-2 py-1 border border-steel/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Contrast Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-bone/90 italic font-mono">
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
              className={`p-3.5  border transition-none-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-steel/80 bg-steel/50 ring-1 ring-indigo-400/50 '
                  : 'border-steel/60 bg-deck/60 hover:border-steel/40'
              }`}
            >
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-bone bg-steel/60 border border-steel/30 px-1.5 py-0.5 block w-fit mb-1.5">
                  Quadrant 0{qIdx + 1}
                </span>

                <h4 className="text-xs font-bold text-bone mb-2">
                  {quad.title}
                </h4>

                <div className="flex flex-wrap gap-1 mb-2">
                  {quad.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="text-[10px] font-mono px-2 py-0.5 bg-chassis/80 border border-steel text-bone"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {quad.trapWarning && (
                <div className="mt-2 pt-1.5 border-t border-steel/20 text-[10px] text-amber/90 flex items-start gap-1 font-mono">
                  <span className="text-amber font-bold font-mono">[ ! ]</span>
                  <span>{quad.trapWarning}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Contrast Model */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-bone flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Disambiguation Rule
            </span>
            <span className="text-[9px] font-mono text-bone bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
              Trap Avoided
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Discriminating Test:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">2. Trap Warning: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
