'use client';

import React, { useState, useMemo } from 'react';
import { BodyProps, ContinueButton } from './TeachSegments';

export function OrderingBody({ seg, onCorrect, onWrong, onNext }: BodyProps) {
  const q = seg.question!;
  const initial = (q.items || []).map((it, i) => ({ ...it, id: it.id || `it_${i}` }));
  const [order, setOrder] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const move = (idx: number, dir: -1 | 1) => {
    if (submitted) return;
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{q.prompt}</p>
      <div className="space-y-1">
        {order.map((it, i) => {
          const ok = submitted && (it.correctIndex ?? -1) === i;
          const bad = submitted && (it.correctIndex ?? -1) !== i;
          return (
            <div key={it.id} className={`flex items-center gap-2 px-3 py-2 border text-[11px] font-mono ${ok ? 'bg-amber/10 border-amber' : bad ? 'bg-hazard/10 border-hazard' : 'bg-chassis border-steel'}`}>
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => move(i, -1)} className="text-solder hover:text-bone text-[10px] cursor-pointer leading-none" disabled={submitted}>▲</button>
                <button type="button" onClick={() => move(i, 1)} className="text-solder hover:text-bone text-[10px] cursor-pointer leading-none" disabled={submitted}>▼</button>
              </div>
              <span className="text-bone flex-1">{it.label}</span>
            </div>
          );
        })}
      </div>
      {!submitted ? (
        <button type="button" onClick={() => { setSubmitted(true); if (order.every((it, i) => (it.correctIndex ?? i) === i)) onCorrect(seg); else onWrong(); }} className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">[ SUBMIT ORDER ]</button>
      ) : <ContinueButton onNext={onNext} />}
    </div>
  );
}

export function MatchingBody({ seg, onCorrect, onWrong, onNext }: BodyProps) {
  const q = seg.question!;
  const pairs = q.pairs || [];
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pickLeft, setPickLeft] = useState<string | null>(null);
  const rights = useMemo(() => {
    const arr = pairs.map((p) => p.right);
    const s = [...arr];
    for (let i = s.length - 1; i > 0; i--) { const j = (i * 2654435761) % (i + 1); [s[i], s[j]] = [s[j], s[i]]; }
    if (s.length > 1 && s.every((v, i) => v === arr[i])) { [s[0], s[1]] = [s[1], s[0]]; }
    return s;
  }, [pairs]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{q.prompt}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">left</span>
          {pairs.map((p) => (
            <button key={p.left} type="button" disabled={submitted} onClick={() => setPickLeft(matches[p.left] ? null : p.left)} className={`w-full text-left px-3 py-2 border text-[11px] font-mono cursor-pointer ${pickLeft === p.left ? 'bg-amber/15 border-amber text-bone' : 'bg-chassis border-steel text-bone hover:border-amber'}`}>
              {p.left}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">right</span>
          {rights.map((r: string) => (
            <button key={r} type="button" disabled={submitted || !pickLeft} onClick={() => { if (!pickLeft) return; const next = { ...matches }; Object.keys(next).forEach((k) => { if (k === pickLeft || next[k] === r) delete next[k]; }); if (matches[pickLeft] !== r) next[pickLeft] = r; setMatches(next); setPickLeft(null); }} className="w-full text-left px-3 py-2 border text-[11px] font-mono cursor-pointer disabled:cursor-default bg-chassis border-steel text-bone hover:border-amber">
              {r}
            </button>
          ))}
        </div>
      </div>
      {!submitted ? (
        <button type="button" onClick={() => { setSubmitted(true); if (pairs.every((p) => matches[p.left] === p.right)) onCorrect(seg); else onWrong(); }} className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer">[ SUBMIT MATCHES ]</button>
      ) : <ContinueButton onNext={onNext} />}
    </div>
  );
}
