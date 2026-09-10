'use client';

import React, { useState } from 'react';
import { playSound } from '@/lib/audio';
import { BodyProps, ContinueButton } from './TeachSegments';

export function GuidedProblemBody({ seg, onNext }: BodyProps) {
  const [revealed, setRevealed] = useState(0);
  const steps = seg.steps || [];
  return (
    <div className="space-y-3">
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed">{seg.body}</p>}
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <div key={i} className={`px-3 py-2 border text-[11px] font-mono ${i < revealed + 1 ? 'bg-chassis border-steel text-bone' : 'bg-deck border-steel/30 text-solder'}`}>
            <div className="flex items-center gap-2">
              <span className="text-amber font-bold">[{i + 1}]</span>
              <span className="font-bold uppercase tracking-wider">{step.title}</span>
            </div>
            {i < revealed + 1 && <p className="text-solder mt-1 leading-relaxed">{step.detail}</p>}
          </div>
        ))}
      </div>
      {revealed < steps.length - 1 ? (
        <button type="button" onClick={() => { playSound('pop'); setRevealed((r) => Math.min(steps.length - 1, r + 1)); }} className="px-3 py-1.5 bg-chassis border border-steel text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">
          [ REVEAL NEXT STEP ]
        </button>
      ) : (
        <div className="space-y-2">
          {seg.finalAnswer && (
            <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono">
              <span className="font-bold">Result : </span>{seg.finalAnswer}
            </div>
          )}
          <ContinueButton onNext={onNext} />
        </div>
      )}
    </div>
  );
}

export function YouTryBody({ seg, onCorrect, onNext }: BodyProps) {
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [hintIdx, setHintIdx] = useState(-1);
  const hints = seg.question?.hints || [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">
        {seg.question?.prompt || seg.body || 'Your turn — produce the answer yourself.'}
      </p>
      <textarea value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Type your answer in plain language..." rows={4} className="w-full p-3 bg-chassis border border-steel text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed" />
      {!revealed && hintIdx >= 0 && hints[hintIdx] && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono">{hints[hintIdx]}</div>
      )}
      {!revealed && hints.length > 0 && (
        <button type="button" onClick={() => { playSound('pop'); setHintIdx((i) => Math.min(hints.length - 1, i + 1)); }} className="px-3 py-1.5 bg-chassis border border-steel text-solder text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">
          {hintIdx < 0 ? '[ NEED A HINT? ]' : `[ HINT ${hintIdx + 1} ]`}
        </button>
      )}
      {!revealed ? (
        <button type="button" onClick={() => { playSound('click'); setRevealed(true); onCorrect(seg); }} disabled={!attempt.trim()} className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40">
          [ REVEAL SOLUTION ]
        </button>
      ) : (
        <div className="space-y-2">
          {seg.question?.modelAnswer && (
            <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono">
              <span className="font-bold">Model answer : </span>{seg.question.modelAnswer}
            </div>
          )}
          <ContinueButton onNext={onNext} />
        </div>
      )}
    </div>
  );
}
