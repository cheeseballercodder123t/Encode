'use client';

import React, { useState, useMemo } from 'react';
import { LessonSegment, TeachLesson } from '@/lib/types';
import { playSound } from '@/lib/audio';

// ─── Top-level segment bodies (state-safe) ───────────────────────────────────
// These MUST live outside TeachMeModal. When defined inside the modal, React
// sees a new component type on every parent render and unmounts/remounts the
// segment — wiping useState (selected option, revealed steps, typed answers)
// exactly when the learner interacts. Top-level = stable identity + key.

export interface SegmentCallbacks {
  onCorrect: (seg: LessonSegment) => void;
  onWrong: () => void;
  onNext: () => void;
}

export function ContinueButton({ onNext }: { onNext: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        playSound('click');
        onNext();
      }}
      className="mt-2 px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer"
    >
      [ CONTINUE &#8984;&#9166; ]
    </button>
  );
}

export type BodyProps = { seg: LessonSegment } & SegmentCallbacks;

export function ConceptBody({ seg, onNext }: BodyProps) {
  return (
    <div className="space-y-3">
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.body}</p>}
      {seg.visual && seg.visual.callout && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono">
          {seg.visual.callout}
        </div>
      )}
      {seg.visual?.analogyPairs && seg.visual.analogyPairs.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-solder uppercase tracking-wider">analogy</span>
          {seg.visual.analogyPairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono text-bone">
              <span className="px-2 py-0.5 bg-chassis border border-steel">{p.source}</span>
              <span className="text-solder">&#8779;</span>
              <span className="px-2 py-0.5 bg-amber/10 border border-amber/30 text-amber">{p.target}</span>
            </div>
          ))}
        </div>
      )}
      {seg.visual?.lines && seg.visual.lines.length > 0 && (
        <ol className="space-y-1 list-decimal list-inside">
          {seg.visual.lines.map((l, i) => (
            <li key={i} className="text-[11px] text-bone font-mono">
              <span className="font-bold">{l.label}</span>
              {l.detail && <span className="text-solder"> — {l.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {seg.keyTerms && seg.keyTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {seg.keyTerms.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-chassis border border-steel text-[10px] text-solder font-mono uppercase tracking-wider">
              {t}
            </span>
          ))}
        </div>
      )}
      <ContinueButton onNext={onNext} />
    </div>
  );
}

export function MemoryHookBody({ seg, onNext }: BodyProps) {
  return (
    <div className="space-y-3">
      {seg.phrase && (
        <div className="px-4 py-3 bg-amber/10 border border-amber/40 text-sm text-amber font-mono font-bold text-center">
          {seg.phrase}
        </div>
      )}
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed">{seg.body}</p>}
      {seg.linkedList && seg.linkedList.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {seg.linkedList.map((item, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 bg-chassis border border-steel text-[11px] text-bone font-mono">
              <span className="text-amber font-bold">{i + 1}.</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
      <ContinueButton onNext={onNext} />
    </div>
  );
}

export function StoryBody({ seg, onNext }: BodyProps) {
  return (
    <div className="space-y-3">
      {seg.narrative && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.narrative}</p>}
      {seg.continuation && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono italic">
          {seg.continuation}
        </div>
      )}
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed">{seg.body}</p>}
      <ContinueButton onNext={onNext} />
    </div>
  );
}
