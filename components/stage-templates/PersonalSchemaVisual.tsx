'use client';

import React, { useState } from 'react';
import { Activity, PersonalSchemaVisualData } from '@/lib/types';
import { UserCheck, Sparkles, HelpCircle, Repeat, Lightbulb } from 'lucide-react';

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
    <div className="rounded-xl border border-pink-500/30 bg-gradient-to-br from-pink-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-pink-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-pink-500/20 text-pink-400">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-pink-300">
            Rogers Self-Reference Effect & SRS Deck Preview
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-pink-300 bg-pink-950/40 border border-pink-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Repeat className="w-2.5 h-2.5" /> Flip Flashcard
        </span>
      </div>

      {/* Generation Effect: Personal Schema Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-pink-950/30 border border-pink-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-pink-300 block">
                Self-Reference Intuition Challenge
              </span>
              <p className="text-xs text-pink-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-pink-400 hover:text-pink-300 bg-pink-900/30 px-2 py-1 rounded border border-pink-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Intuition Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-pink-500/20 text-[11px] text-pink-200/90 italic font-serif">
            💡 <strong>Self-Reference Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Spaced Repetition Flashcard Preview */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="p-4 rounded-xl border border-pink-500/40 bg-slate-900/80 hover:bg-slate-900 transition-all cursor-pointer text-center relative shadow-md"
      >
        <div className="flex items-center justify-between mb-2 text-[10px] font-mono text-pink-400">
          <span>{isFlipped ? 'Back (Answer & Mechanism)' : 'Front (Socratic Cue)'}</span>
          <span className="text-slate-400">Click to flip</span>
        </div>

        <div className="py-3">
          {isFlipped ? (
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-300 block">
                Core Causal Truth:
              </span>
              <p className="text-xs text-slate-200 font-serif leading-relaxed">
                {field2 || visualData.flashcardBack || activity.scaffold.exampleAnswer}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-bold text-pink-300 block">
                Active Retrieval Trigger:
              </span>
              <p className="text-xs text-white font-medium">
                {field1 || visualData.flashcardFront || activity.prompt}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* User Generated Personal Intuition */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-pink-950/40 via-purple-950/30 to-slate-900/50 border border-pink-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-pink-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              Your Personal Schema & Real-World Decision Rule
            </span>
            <span className="text-[9px] font-mono text-pink-400 bg-pink-950/60 border border-pink-500/30 px-1.5 py-0.5 rounded">
              Self-Reference Active
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>Personal Intuition:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-pink-300">Decision Anchor: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
