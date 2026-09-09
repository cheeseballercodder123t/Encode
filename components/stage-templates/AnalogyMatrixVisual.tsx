'use client';

import React, { useState } from 'react';
import { Activity, AnalogyMatrixVisualData, AnalogyMappingItem } from '@/lib/types';

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
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-bone">
            <span className="text-amber font-bold font-mono">[ COMPARE ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-bone">
            Gentner Structure-Mapping & Generation Bridge
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-bone bg-steel/40 border border-steel/30 px-2 py-0.5 ">
            Generation Effect Active
          </span>
        </div>
      </div>

      {/* Generation Effect: Partial Schema Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-bone block">
                Self-Generation Premise Challenge
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
            {showClue ? 'Hide Hint' : 'Get Socratic Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-bone/90 italic font-mono">
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
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 bg-deck/70 border border-steel/20 hover:border-steel/40 transition-none-colors"
            >
              {/* Familiar Source Side */}
              <div className="flex-1 p-2.5 bg-steel/40 border border-steel/30 text-left">
                <span className="text-[9px] font-mono font-bold uppercase text-bone block mb-0.5">
                  Familiar Source Anchor
                </span>
                <div className="text-xs font-bold text-bone">
                  {mapping.sourceElement}
                </div>
              </div>

              {/* Connecting Bridge Arrow */}
              <div className="flex flex-col items-center justify-center shrink-0 text-bone px-1 py-0.5">
                <span className="text-amber font-bold font-mono">[ SWAP ]</span>
                <span className="text-[8px] font-mono text-solder mt-0.5 hidden sm:inline">Maps To</span>
              </div>

              {/* Target Theory Side (User-Generated or Live Synced) */}
              <div className="flex-1 p-2.5 bg-steel/40 border border-steel/30 text-left">
                <span className="text-[9px] font-mono font-bold uppercase text-bone block mb-0.5">
                  Target Science Concept
                </span>
                <div className="text-xs font-bold text-bone">
                  {field2 ? (
                    <span className="text-amber300 flex items-center gap-1">
                      <span className="text-amber font-bold font-mono">[ * ]</span> {field2}
                    </span>
                  ) : isTargetMissing ? (
                    <span className="text-amber italic font-mono text-[11px] ">
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
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-bone flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Self-Generated Mental Schema
            </span>
            <span className="text-[9px] font-mono text-amber bg-amber950/60 border border-amber/30 px-1.5 py-0.5 ">
              Active Generation
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">Exact Mechanism Correspondence: </strong>
              {field2}
            </p>
          )}
        </div>
      )}

      {/* Interactive Limits & Breakdown Tab */}
      <div className="mt-3 pt-2.5 border-t border-steel/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center gap-1 text-[11px] font-mono text-solder hover:text-bone transition-none-colors"
          >
            <span className="text-amber font-bold font-mono">[ ! ]</span>
            Where does this analogy break down? (Boundary Test)
            {showBreakdown ? <span className="text-amber font-bold font-mono">[ ^ ]</span> : <span className="text-amber font-bold font-mono">[ v ]</span>}
          </button>

          {hasUserGenerated && (
            <button
              type="button"
              onClick={() => setShowExpertSynthesis(!showExpertSynthesis)}
              className="flex items-center gap-1 text-[10px] font-mono text-bone hover:text-bone transition-none-colors"
            >
              {showExpertSynthesis ? <span className="text-amber font-bold font-mono">[ HIDDEN ]</span> : <span className="text-amber font-bold font-mono">[ EYE ]</span>}
              {showExpertSynthesis ? 'Hide Expert Synthesis' : 'Compare with Expert Synthesis'}
            </button>
          )}
        </div>

        {showBreakdown && (
          <div className="p-2.5 bg-amber/20 border border-amber/30 text-[11px] text-amber">
            <strong>Analogy Limit: </strong>
            {visualData.whereAnalogyBreaks || "Every analogy has limits:identify where the physical or structural laws diverge from the intuitive source."}
          </div>
        )}

        {showExpertSynthesis && challenge.expertCompletion && (
          <div className="p-2.5 bg-steel/30 border border-steel/30 text-[11px] text-bone">
            <strong className="text-bone block mb-0.5">AI Expert Ground Truth Schema:</strong>
            {challenge.expertCompletion}
          </div>
        )}
      </div>
    </div>
  );
}
