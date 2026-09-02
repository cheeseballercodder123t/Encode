'use client';

import React, { useState } from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { RotateCw, ArrowRight, CheckCircle2, Play, Sparkles } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function StateTransitionVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const defaultSteps = [
    { stepNumber: 1, title: 'State A: Baseline / Initial State', mechanism: 'System at rest or awaiting stimulus' },
    { stepNumber: 2, title: 'Transition: Catalyst / Active Trigger', mechanism: 'Threshold reached, enzymatic activation or signal packet' },
    { stepNumber: 3, title: 'State B: Transformed / Excited State', mechanism: 'Depolarized membrane, product released, or connection established' },
    { stepNumber: 4, title: 'Reset: Feedback / Return Loop', mechanism: 'Hyperpolarization, refractory period, or resource reclamation' }
  ];

  const steps = visualData.flowSteps && visualData.flowSteps.length > 0 
    ? visualData.flowSteps 
    : defaultSteps;

  return (
    <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-sky-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-sky-500/20 text-sky-400">
            <RotateCw className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-sky-300">
            Cyclic State Machine & Feedback Loop
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold text-sky-300 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded">
            State {activeStepIndex + 1} of {steps.length}
          </span>
        </div>
      </div>

      {/* Cyclic Step Carousel / Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {steps.map((step, idx) => {
          const isSelected = idx === activeStepIndex;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveStepIndex(idx)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-sky-600/20 border-sky-400 shadow-md shadow-sky-500/20 text-white'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-sky-400">
                  Step {step.stepNumber || idx + 1}
                </span>
                {isSelected && <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />}
              </div>
              <div className="font-bold text-xs line-clamp-1">
                {step.title}
              </div>
              {step.mechanism && (
                <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                  {step.mechanism}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active State Deep-Dive Card */}
      <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 flex items-start justify-between gap-3 text-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase text-sky-300">
              Active State Breakdown: {steps[activeStepIndex]?.title}
            </span>
          </div>
          <p className="text-slate-300 text-xs font-serif mt-1">
            {steps[activeStepIndex]?.mechanism || 'Continuous dynamic state transition ensuring homeostasis.'}
          </p>
          {field2 && (
            <div className="mt-1.5 pt-1.5 border-t border-sky-500/20 text-[10px] text-sky-200 italic font-serif">
              <strong className="not-italic font-mono text-[9px] text-sky-400 block">Your Transition Mechanism: </strong>
              &ldquo;{field2}&rdquo;
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setActiveStepIndex((prev) => (prev + 1) % steps.length)}
          className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold shrink-0 flex items-center gap-1 shadow-md shadow-sky-600/20 cursor-pointer"
        >
          <span>Cycle Next</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
