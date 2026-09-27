'use client';

import React, { useState } from 'react';
import { LessonSegment } from '@/lib/types';
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
      <WhyBlock seg={seg} />
      <MisconceptionList seg={seg} />
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
              <span className="px-2 py-0.5 bg-chassis border border-edge">{p.source}</span>
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
              {l.detail && <span className="text-solder">: {l.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {seg.keyTerms && seg.keyTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {seg.keyTerms.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-chassis border border-edge text-[10px] text-solder font-mono uppercase tracking-wider">
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
            <div key={i} className="flex items-center gap-2 px-2 py-1 bg-chassis border border-edge text-[11px] text-bone font-mono">
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
      <WhyBlock seg={seg} />
      <ContinueButton onNext={onNext} />
    </div>
  );
}

// ─── Depth layer ─────────────────────────────────────────────────────────────
// A "detailed" lesson is not a longer lesson: it is one whose every claim comes
// with its causal driver, its plausible wrong version, and a production step.
// These three blocks are the visible half of that contract.

/** The causal driver behind a segment's claim (`why`). */
export function WhyBlock({ seg }: { seg: LessonSegment }) {
  if (!seg.why) return null;
  return (
    <div className="px-3 py-2 bg-chassis border-l-2 border-amber/60 text-[11px] text-bone font-mono leading-relaxed">
      <span className="text-amber font-bold uppercase tracking-wider mr-1.5">Why</span>
      {seg.why}
    </div>
  );
}

/** Misconception radar: the wrong belief, then the correction that kills it. */
export function MisconceptionList({ seg }: { seg: LessonSegment }) {
  const items = seg.misconceptions || [];
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-mono font-bold text-hazard uppercase tracking-wider">
        misconception radar
      </span>
      {items.map((m, i) => (
        <div key={i} className="border border-hazard/30 bg-hazard/5 p-2.5 space-y-1">
          {m.claim && (
            <p className="text-[11px] font-mono text-hazard leading-relaxed">
              <span className="font-bold">[ WRONG ]</span> {m.claim}
            </p>
          )}
          {m.correction && (
            <p className="text-[11px] font-mono text-bone leading-relaxed">
              <span className="text-amber font-bold">[ ACTUALLY ]</span> {m.correction}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** A deeper pass over the same idea: body, mechanism, failure modes, the trap. */
export function DeepDiveBody({ seg, onNext }: BodyProps) {
  return (
    <div className="space-y-3">
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.body}</p>}
      <WhyBlock seg={seg} />
      <MisconceptionList seg={seg} />
      {seg.visual && <VisualBlock seg={seg} />}
      {seg.keyTerms && seg.keyTerms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seg.keyTerms.map((t) => (
            <span key={t} className="px-2 py-0.5 bg-chassis border border-edge text-[10px] text-solder font-mono uppercase tracking-wider">
              {t}
            </span>
          ))}
        </div>
      )}
      <ContinueButton onNext={onNext} />
    </div>
  );
}

/** The trap, on its own card, when the AI dedicates a segment to it. */
export function MisconceptionBody({ seg, onNext }: BodyProps) {
  return (
    <div className="space-y-3">
      <MisconceptionList seg={seg} />
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.body}</p>}
      {seg.trapNote && (
        <div className="px-3 py-2 bg-hazard/10 border border-hazard/30 text-[11px] text-hazard font-mono">{seg.trapNote}</div>
      )}
      <WhyBlock seg={seg} />
      <ContinueButton onNext={onNext} />
    </div>
  );
}

/** Feynman production: they explain it, then compare against the reference. */
export function SelfExplainBody({ seg, onCorrect, onNext }: BodyProps) {
  const task = seg.selfExplain;
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  const prompt = task?.prompt || seg.body || 'Explain the mechanism in your own words.';
  const hits = (task?.keywords || []).filter((k) =>
    attempt.toLowerCase().includes(String(k).toLowerCase())
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-bone font-mono leading-relaxed">{prompt}</p>
      {seg.body && task?.prompt && (
        <p className="text-[11px] text-solder font-mono leading-relaxed">{seg.body}</p>
      )}
      <textarea
        value={attempt}
        onChange={(e) => setAttempt(e.target.value)}
        placeholder="Teach it back in your own words..."
        rows={5}
        className="w-full p-3 bg-chassis border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
      />
      {(task?.keywords?.length || 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono text-solder uppercase tracking-wider">hit these:</span>
          {(task?.keywords || []).map((k) => (
            <span
              key={k}
              className={`px-2 py-0.5 border text-[10px] font-mono uppercase tracking-wider ${
                hits.includes(k) ? 'bg-amber/15 border-amber text-amber' : 'bg-chassis border-edge text-solder'
              }`}
            >
              {k}
            </span>
          ))}
        </div>
      )}
      {!revealed ? (
        <button
          type="button"
          onClick={() => { playSound('click'); setRevealed(true); onCorrect(seg); }}
          disabled={!attempt.trim()}
          className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
        >
          [ {task?.modelAnswer ? 'COMPARE WITH THE REFERENCE' : 'MARK AS EXPLAINED'} ]
        </button>
      ) : (
        <div className="space-y-2">
          {task?.modelAnswer && (
            <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono leading-relaxed">
              <span className="font-bold">Reference explanation : </span>{task.modelAnswer}
            </div>
          )}
          <ContinueButton onNext={onNext} />
        </div>
      )}
    </div>
  );
}

/** Same mechanism, unfamiliar surface: retrieval transfer. */
export function TransferBody({ seg, onCorrect, onNext }: BodyProps) {
  const task = seg.transfer;
  const [attempt, setAttempt] = useState('');
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-3">
      <span className="inline-block text-[10px] font-mono font-bold text-amber uppercase tracking-wider">[ TRANSFER ]</span>
      <p className="text-xs text-bone font-mono leading-relaxed">
        {task?.prompt || seg.body || 'Where else does this exact mechanism show up?'}
      </p>
      <textarea
        value={attempt}
        onChange={(e) => setAttempt(e.target.value)}
        placeholder="Apply the mechanism to the new surface..."
        rows={4}
        className="w-full p-3 bg-chassis border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
      />
      <WhyBlock seg={seg} />
      {!revealed ? (
        <button
          type="button"
          onClick={() => { playSound('click'); setRevealed(true); onCorrect(seg); }}
          disabled={!attempt.trim()}
          className="px-4 py-2 bg-amber border border-amber text-chassis text-[10px] font-mono font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
        >
          [ REVEAL THE TRANSFER ]
        </button>
      ) : (
        <div className="space-y-2">
          {task?.modelAnswer && (
            <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono leading-relaxed">
              <span className="font-bold">Same mechanism here : </span>{task.modelAnswer}
            </div>
          )}
          <ContinueButton onNext={onNext} />
        </div>
      )}
    </div>
  );
}

/** Consolidation before the exit: the load-bearing bullets only. */
export function RecapBody({ seg, onNext }: BodyProps) {
  const points = seg.recapPoints || [];
  return (
    <div className="space-y-3">
      {points.length > 0 && (
        <ol className="space-y-1.5">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[11px] font-mono text-bone leading-relaxed">
              <span className="text-amber font-bold">{i + 1}.</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      )}
      {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.body}</p>}
      <ContinueButton onNext={onNext} />
    </div>
  );
}

/** Shared mini-visual renderer (analogy pairs / causal lines / callout). */
export function VisualBlock({ seg }: { seg: LessonSegment }) {
  const visual = seg.visual;
  if (!visual) return null;
  return (
    <div className="space-y-2">
      {visual.callout && (
        <div className="px-3 py-2 bg-chassis border border-amber/30 text-[11px] text-amber font-mono">
          {visual.callout}
        </div>
      )}
      {visual.analogyPairs && visual.analogyPairs.length > 0 && (
        <div className="space-y-1">
          {visual.analogyPairs.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono text-bone">
              <span className="px-2 py-0.5 bg-chassis border border-edge">{p.source}</span>
              <span className="text-solder">&#8779;</span>
              <span className="px-2 py-0.5 bg-amber/10 border border-amber/30 text-amber">{p.target}</span>
            </div>
          ))}
        </div>
      )}
      {visual.lines && visual.lines.length > 0 && (
        <ol className="space-y-1 list-decimal list-inside">
          {visual.lines.map((l, i) => (
            <li key={i} className="text-[11px] text-bone font-mono">
              <span className="font-bold">{l.label}</span>
              {l.detail && <span className="text-solder">: {l.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
