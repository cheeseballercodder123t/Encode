'use client';

import React, { useState } from 'react';
import { Activity, StateTransitionVisualData } from '@/lib/types';
import { RefreshCw, ArrowRight, Sparkles, HelpCircle, Play, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function StateTransitionVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [showClue, setShowClue] = useState(false);

  const defaultSteps = [
    { stepNumber: 1, title: 'State Alpha: Initiation / Priming', mechanism: 'Signal binds or baseline threshold reached' },
    { stepNumber: 2, title: 'State Beta: Peak Activation / Transformation', mechanism: 'Substrate converted or peak voltage discharge' },
    { stepNumber: 3, title: 'State Gamma: Refractory / Reset Phase', mechanism: 'System resets back to baseline state for next cycle' }
  ];

  const steps = visualData.flowSteps && visualData.flowSteps.length > 0
    ? visualData.flowSteps
    : defaultSteps;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "What exact event or biochemical threshold triggers the transition from State 1 to State 2, and what resets the cycle?",
    clue: "Look for the rate-limiting step or negative feedback threshold.",
    missingRoleOrTarget: "State Transition Trigger",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-blue-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-500/20 text-blue-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-blue-300">
            Cyclic State Machine & Feedback Loop
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-950/40 border border-blue-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Play className="w-2.5 h-2.5" /> Interactive Cycle Stepper
        </span>
      </div>

      {/* Generation Effect: State Transition Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-blue-950/30 border border-blue-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-blue-300 block">
                Cyclic State Transition Challenge
              </span>
              <p className="text-xs text-blue-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-blue-400 hover:text-blue-300 bg-blue-900/30 px-2 py-1 rounded border border-blue-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get State Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-blue-500/20 text-[11px] text-blue-200/90 italic font-serif">
            💡 <strong>State Transition Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive State Cycle Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((step, idx) => {
          const isSelected = activeStepIndex === idx;

          return (
            <div
              key={idx}
              onClick={() => setActiveStepIndex(idx)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-blue-400/80 bg-blue-950/40 ring-1 ring-blue-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-blue-500/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-mono font-bold uppercase text-blue-300 bg-blue-950/60 border border-blue-500/30 px-1.5 py-0.5 rounded">
                    State 0{step.stepNumber || idx + 1}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isSelected ? 'Active Focus' : 'Click to inspect'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white mb-1">
                  {step.title}
                </h4>

                {step.mechanism && (
                  <p className="text-[11px] text-slate-300 font-serif leading-relaxed">
                    {step.mechanism}
                  </p>
                )}
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden md:flex items-center justify-center text-blue-400 mt-2">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated State Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-slate-900/50 border border-blue-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-blue-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Your State Machine Model
            </span>
            <span className="text-[9px] font-mono text-blue-400 bg-blue-950/60 border border-blue-500/30 px-1.5 py-0.5 rounded">
              Cycle Mapped
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Transition Trigger:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-blue-300">2. Feedback / Reset: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
