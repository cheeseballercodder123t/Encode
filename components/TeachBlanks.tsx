'use client';

import React, { useState } from 'react';
import { playSound } from '@/lib/audio';
import { BodyProps, ContinueButton } from './TeachSegments';

export function FillBlankBody({ seg, onCorrect, onWrong, onNext }: BodyProps) {
  const q = seg.question!;
  const blanks = q.blanks || [];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(blanks.map((b) => [b.id || '', ''])));
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{q.prompt}</p>
      <div className="space-y-2">
        {blanks.map((b) => {
          const id = b.id || '';
          const correct = submitted && (values[id] || '').trim().toLowerCase() === b.answer.trim().toLowerCase();
          const wrong = submitted && !correct;
          return (
            <div key={id} className="text-xs text-bone font-mono leading-loose">
              <span className="text-solder">{b.before}</span>
              <input value={values[id] || ''} disabled={submitted} onChange={(e) => setValues({ ...values, [id]: e.target.value })} className={`mx-1 px-2 py-1 bg-chassis border text-bone focus:outline-none focus:border-amber font-mono text-xs ${correct ? 'border-amber' : wrong ? 'border-hazard' : 'border-steel'}`} placeholder="______" size={Math.max(8, b.answer.length + 2)} />
              <span className="text-solder">{b.after}</span>
            </div>
          );
        })}
      </div>
      {!submitted ? (
        <button type="button" onClick={() => { setSubmitted(true); if (blanks.every((b) => (values[b.id || ''] || '').trim().toLowerCase() === b.answer.trim().toLowerCase())) onCorrect(seg); else onWrong(); }} className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">[ CHECK BLANKS ]</button>
      ) : <ContinueButton onNext={onNext} />}
    </div>
  );
}

export function FreeResponseBody({ seg, onCorrect, onNext }: BodyProps) {
  const q = seg.question!;
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [hintIdx, setHintIdx] = useState(-1);
  const hints = q.hints || [];
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{q.prompt}</p>
      <textarea value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Type your answer in plain language..." rows={4} className="w-full p-3 bg-chassis border border-steel text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed" />
      {!revealed && hints.length > 0 && (
        <button type="button" onClick={() => { playSound('pop'); setHintIdx((i) => Math.min(hints.length - 1, i + 1)); }} className="px-3 py-1.5 bg-chassis border border-steel text-solder text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">
          {hintIdx < 0 ? '[ NEED A HINT? ]' : `[ HINT ${hintIdx + 1} ]`}
        </button>
      )}
      {hintIdx >= 0 && !revealed && hints[hintIdx] && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono">{hints[hintIdx]}</div>
      )}
      {!revealed ? (
        <button type="button" onClick={() => { setRevealed(true); onCorrect(seg); }} disabled={!attempt.trim()} className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40">[ REVEAL SOLUTION ]</button>
      ) : (
        <div className="space-y-2">
          {q.modelAnswer && (
            <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono"><span className="font-bold">Model answer : </span>{q.modelAnswer}</div>
          )}
          <ContinueButton onNext={onNext} />
        </div>
      )}
    </div>
  );
}
