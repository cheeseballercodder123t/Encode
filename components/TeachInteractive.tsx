'use client';

import React from 'react';
import { LessonSegment, TeachLesson } from '@/lib/types';
import { ContinueButton, SegmentCallbacks } from './TeachSegments';
import { McqBody } from './TeachMcq';
import { OrderingBody, MatchingBody } from './TeachOrderMatch';
import { FillBlankBody, FreeResponseBody } from './TeachBlanks';

// ─── Top-level interactive dispatcher (state-safe) ─────────────────────────
// Must stay outside TeachMeModal: an inner component type remounts on every
// parent render and wipes the checkpoint state (selected option, typed
// answers) exactly when the learner interacts.

type Props = { seg: LessonSegment } & SegmentCallbacks & {
  isLast: boolean;
  finish: React.ReactNode;
};

export function TeachInteractiveSegment({ seg, isLast, finish, onCorrect, onWrong, onNext }: Props) {
  const q = seg.question;
  const cb = { onCorrect, onWrong, onNext };
  if (!q) {
    return (
      <div className="space-y-3">
        {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap">{seg.body}</p>}
        {seg.trapNote && <div className="px-3 py-2 bg-hazard/10 border border-hazard/30 text-[11px] text-hazard font-mono">{seg.trapNote}</div>}
        {isLast ? finish : <ContinueButton onNext={onNext} />}
      </div>
    );
  }
  switch (q.kind) {
    case 'ordering': return <OrderingBody seg={seg} {...cb} />;
    case 'matching': return <MatchingBody seg={seg} {...cb} />;
    case 'fillBlank': return <FillBlankBody seg={seg} {...cb} />;
    case 'freeResponse': return <FreeResponseBody seg={seg} {...cb} />;
    case 'mcq':
    case 'trueFalse':
    default: return <McqBody seg={seg} {...cb} />;
  }
}

export function TeachFinishPanel({
  lesson, isLast, totalXpEarned, bestStreak, onClose,
}: {
  lesson: TeachLesson | null;
  isLast: boolean;
  totalXpEarned: number;
  bestStreak: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      {isLast && lesson?.wrapup?.summary && (
        <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono">{lesson.wrapup.summary}</div>
      )}
      {isLast && lesson?.masteryCheck && (
        <div className="px-3 py-3 bg-deck border border-steel space-y-2">
          <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">[ MASTERY CHECK ]</span>
          <p className="text-xs text-bone font-mono leading-relaxed">{lesson.masteryCheck.prompt}</p>
          <textarea
            placeholder="Prove you can produce the mechanism yourself..."
            rows={4}
            className="w-full p-3 bg-chassis border border-steel text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
          />
        </div>
      )}
      {isLast && lesson?.wrapup?.callToAction && (
        <p className="text-[11px] text-bone font-mono">{lesson.wrapup.callToAction}</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-2.5 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
      >
        [ FINISH ] — earned {totalXpEarned} XP {bestStreak > 1 ? `(best streak ${bestStreak})` : ''}
      </button>
    </div>
  );
}
