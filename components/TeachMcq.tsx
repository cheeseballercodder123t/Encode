'use client';

import React, { useState } from 'react';
import { BodyProps, ContinueButton } from './TeachSegments';

export function McqBody({ seg, onCorrect, onWrong, onNext }: BodyProps) {
  const q = seg.question!;
  const options = q.options || [];
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hintIdx, setHintIdx] = useState(-1);
  const isMultiTry = q.kind === 'mcq';
  const picked = options.find((o) => o.id === selected);
  const submit = (optId: string) => {
    setSelected(optId);
    setSubmitted(true);
    if (options.find((o) => o.id === optId)?.correct) onCorrect(seg);
    else onWrong();
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{q.prompt}</p>
      <div className="space-y-1.5">
        {options.map((opt) => {
          const isSel = selected === opt.id;
          let cls = 'bg-chassis border-steel text-bone hover:border-amber';
          if (submitted && isSel) cls = opt.correct ? 'bg-amber/15 border-amber text-bone' : 'bg-hazard/15 border-hazard text-bone';
          else if (submitted && opt.correct) cls = 'bg-amber/10 border-amber/50 text-bone';
          return (
            <button key={opt.id} type="button" disabled={submitted && !isMultiTry} onClick={() => !submitted && submit(opt.id)} className={`w-full text-left px-3 py-2 border cursor-pointer disabled:cursor-default ${cls}`}>
              <span className="text-[10px] font-mono font-bold mr-2">[{opt.id.toUpperCase()}]</span>
              <span className="text-[11px] font-mono">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {submitted && selected && (
        <div className={`px-3 py-2 border text-[11px] font-mono ${picked?.correct ? 'bg-amber/10 border-amber/40 text-amber' : 'bg-hazard/10 border-hazard/30 text-hazard'}`}>
          {picked?.explanation || (picked?.correct ? 'Correct.' : 'Not quite.')}
        </div>
      )}
      {submitted && !picked?.correct && seg.trapNote && (
        <div className="px-3 py-2 bg-hazard/10 border border-hazard/30 text-[11px] text-hazard font-mono">{seg.trapNote}</div>
      )}
      {!submitted && (q.hints?.length || 0) > 0 && (
        <button type="button" onClick={() => setHintIdx((i) => Math.min((q.hints?.length || 1) - 1, i + 1))} className="px-3 py-1.5 bg-chassis border border-steel text-solder text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">
          {hintIdx < 0 ? '[ NEED A HINT? ]' : `[ HINT ${hintIdx + 1} ]`}
        </button>
      )}
      {!submitted && hintIdx >= 0 && q.hints?.[hintIdx] && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono">{q.hints[hintIdx]}</div>
      )}
      <div className="flex items-center gap-2 pt-1">
        {submitted && picked?.correct && <ContinueButton onNext={onNext} />}
        {submitted && !picked?.correct && isMultiTry && (
          <button type="button" onClick={() => { setSelected(null); setSubmitted(false); }} className="px-4 py-2 bg-chassis border border-steel text-bone text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">
            [ TRY AGAIN ]
          </button>
        )}
        {submitted && !picked?.correct && !isMultiTry && <ContinueButton onNext={onNext} />}
      </div>
    </div>
  );
}
