'use client';

import React, { useState } from 'react';
import { Activity, PersonalSchemaVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function PersonalSchemaVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [isFlipped, setIsFlipped] = useState(false);
  const [showClue, setShowClue] = useState(false);

  const challenge = visualData.generationChallenge || {
    premisePrompt: "How does this abstract principle directly alter how you make decisions, troubleshoot bugs, or diagnose problems in real life?",
    clue: "Connect the theory to a concrete mistake you or someone else might make without this knowledge.",
    missingRoleOrTarget: "Personal Schema Decision Anchor",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className=" border border-hazard/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-hazard/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-hazard/20 text-hazard">
            <span className="text-amber font-bold font-mono">[ USER ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-hazard">
            Rogers Self-Reference Effect & SRS Deck Preview
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-hazard bg-hazard/40 border border-hazard/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ REP ]</span> Flip Flashcard
        </span>
      </div>

      {/* Generation Effect: Personal Schema Challenge Card */}
      <div className="mb-3.5 p-3 bg-hazard/30 border border-hazard/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-hazard block">
                Self-Reference Intuition Challenge
              </span>
              <p className="text-xs text-hazard font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-hazard hover:text-hazard bg-hazard/30 px-2 py-1 border border-hazard/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Intuition Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-hazard/20 text-[11px] text-hazard/90 italic font-mono">
            💡 <strong>Self-Reference Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Spaced Repetition Flashcard Preview */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="p-4 border border-hazard/40 bg-deck/80 hover:bg-deck transition-none-all cursor-pointer text-center relative "
      >
        <div className="flex items-center justify-between mb-2 text-[10px] font-mono text-hazard">
          <span>{isFlipped ? 'Back (Answer & Mechanism)' : 'Front (Socratic Cue)'}</span>
          <span className="text-solder">Click to flip</span>
        </div>

        <div className="py-3">
          {isFlipped ? (
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber300 block">
                Core Causal Truth:
              </span>
              <p className="text-xs text-bone font-mono leading-relaxed">
                {field2 || visualData.flashcardBack || activity.scaffold.exampleAnswer}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-bold text-hazard block">
                Active Retrieval Trigger:
              </span>
              <p className="text-xs text-bone font-medium">
                {field1 || visualData.flashcardFront || activity.prompt}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* User Generated Personal Intuition */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-hazard/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-hazard flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Personal Schema & Real-World Decision Rule
            </span>
            <span className="text-[9px] font-mono text-hazard bg-hazard/60 border border-hazard/30 px-1.5 py-0.5 ">
              Self-Reference Active
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>Personal Intuition:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-hazard">Decision Anchor: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
