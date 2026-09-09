'use client';

import React, { useState } from 'react';
import { Activity, StateTransitionVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function StateTransitionVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
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
    premisePrompt: "What exact event or biochemical threshold triggers the transition-none from State 1 to State 2, and what resets the cycle?",
    clue: "Look for the rate-limiting step or negative feedback threshold.",
    missingRoleOrTarget: "State Transition Trigger",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-bone400">
            <span className="text-amber font-bold font-mono">[ RESET ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-bone300">
            Cyclic State Machine & Feedback Loop
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-bone300 bg-steel/40 border border-steel/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ PLAY ]</span> Interactive Cycle Stepper
        </span>
      </div>

      {/* Generation Effect: State Transition Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-bone300 block">
                Cyclic State Transition Challenge
              </span>
              <p className="text-xs text-bone100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-bone400 hover:text-bone300 bg-steel/30 px-2 py-1 border border-steel/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get State Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-bone200/90 italic font-mono">
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
              className={`p-3.5  border transition-none-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-steel/80 bg-steel/40 ring-1 ring-blue-400/50 '
                  : 'border-steel/60 bg-deck/60 hover:border-steel/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-mono font-bold uppercase text-bone300 bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
                    State 0{step.stepNumber || idx + 1}
                  </span>
                  <span className="text-[10px] text-solder">
                    {isSelected ? 'Active Focus' : 'Click to inspect'}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-bone mb-1">
                  {step.title}
                </h4>

                {step.mechanism && (
                  <p className="text-[11px] text-solder font-mono leading-relaxed">
                    {step.mechanism}
                  </p>
                )}
              </div>

              {idx < steps.length - 1 && (
                <div className="hidden md:flex items-center justify-center text-bone400 mt-2">
                  <span className="text-amber font-bold font-mono">[ NEXT ]</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated State Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-bone300 flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your State Machine Model
            </span>
            <span className="text-[9px] font-mono text-bone400 bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
              Cycle Mapped
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Transition Trigger:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone300">2. Feedback / Reset: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
