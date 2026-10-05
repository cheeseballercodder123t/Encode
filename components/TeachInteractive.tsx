'use client';

import { LessonSegment, TeachLesson } from '@/lib/types';
import {
  ContinueButton,
  DeepDiveBody,
  MisconceptionBody,
  RecapBody,
  SegmentCallbacks,
  SelfExplainBody,
  TransferBody,
} from './TeachSegments';
import { McqBody } from './TeachMcq';
import { OrderingBody, MatchingBody } from './TeachOrderMatch';
import { FillBlankBody, FreeResponseBody } from './TeachBlanks';

// ─── Top-level interactive dispatcher (state-safe) ─────────────────────────
// Must stay outside TeachMeModal: an inner component type remounts on every
// parent render and wipes the checkpoint state (selected option, typed
// answers) exactly when the learner interacts.

type Props = { seg: LessonSegment } & SegmentCallbacks & {
  isLast: boolean;
};

export function TeachInteractiveSegment({ seg, isLast, onCorrect, onWrong, onNext }: Props) {
  const q = seg.question;
  const cb = { onCorrect, onWrong, onNext };
  if (!q) {
    return (
      <div className="space-y-3">
        {/* `break-words` keeps a model-written URL or `[[wikilink]]` from
            widening the lesson body past its container (see TeachSegments). */}
        {seg.body && <p className="text-xs text-bone font-mono leading-relaxed whitespace-pre-wrap break-words">{seg.body}</p>}
        {seg.trapNote && <div className="px-3 py-2 bg-hazard/10 border border-hazard/30 text-[11px] text-hazard font-mono">{seg.trapNote}</div>}
        {isLast ? null : <ContinueButton onNext={onNext} />}
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

/**
 * Routes a segment to the body that can actually render it.
 *
 * Depth segments (deepDive / misconception / selfExplain / transfer / recap)
 * live here rather than in the modal so React keeps their state while the
 * learner types: a component defined inside the modal is a NEW type on every
 * parent render, which unmounts the textarea mid-answer.
 */
export function TeachSegmentBody({ seg, isLast, onCorrect, onWrong, onNext }: Props) {
  switch (seg.type) {
    case 'deepDive': return <DeepDiveBody seg={seg} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
    case 'misconception': return <MisconceptionBody seg={seg} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
    case 'selfExplain': return <SelfExplainBody seg={seg} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
    case 'transfer': return <TransferBody seg={seg} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
    case 'recap': return <RecapBody seg={seg} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
    default: return <TeachInteractiveSegment seg={seg} isLast={isLast} onCorrect={onCorrect} onWrong={onWrong} onNext={onNext} />;
  }
}

// ─── End of lesson: the two exits ──────────────────────────────────────────
// Encoding is deliberately NOT part of the lesson. The lesson ends, the
// learner sees what they just earned, and then chooses: hand the lesson's own
// encoding seeds to the workbench now, or park the whole lesson (progress and
// all) and pick it up later.

export function TeachFinishPanel({
  lesson,
  isLast,
  totalXpEarned,
  bestStreak,
  savedAt,
  savedCount,
  onStartEncoding,
  onSaveForLater,
  onClose,
}: {
  lesson: TeachLesson | null;
  isLast: boolean;
  totalXpEarned: number;
  bestStreak: number;
  /** Timestamp of the last "save it for later" in this lesson, if any. */
  savedAt: number | null;
  /** How many learned facts the lesson handed to the encoder. */
  savedCount: number;
  onStartEncoding: () => void;
  onSaveForLater: () => void;
  onClose: () => void;
}) {
  const seeds = lesson?.encodingSeeds || [];
  return (
    <div className="space-y-3">
      {isLast && lesson?.masteryCheck && (
        <div className="px-3 py-3 bg-deck border border-edge space-y-2">
          <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">[ MASTERY CHECK ]</span>
          <p className="text-xs text-bone font-mono leading-relaxed">{lesson.masteryCheck.prompt}</p>
          <textarea
            placeholder="Prove you can produce the mechanism yourself..."
            rows={4}
            className="w-full p-3 bg-chassis border border-edge text-xs text-bone placeholder-solder focus:outline-none focus:border-amber resize-none font-mono leading-relaxed"
          />
        </div>
      )}

      {isLast && lesson?.wrapup?.summary && (
        <div className="px-3 py-2 bg-amber/10 border border-amber/40 text-[11px] text-amber font-mono leading-relaxed">
          {lesson.wrapup.summary}
        </div>
      )}

      {isLast && lesson?.wrapup?.connectionPrompt && (
        <div className="px-3 py-2 bg-chassis border border-edge/50 text-[11px] text-solder font-mono leading-relaxed">
          <span className="text-bone font-bold uppercase tracking-wider mr-1.5">Carry this with you</span>
          {lesson.wrapup.connectionPrompt}
        </div>
      )}

      <div className="p-3 bg-deck border border-amber/30 space-y-2" data-testid="teach-encoding-handoff">
        <span className="text-[10px] font-mono font-bold text-amber uppercase tracking-wider">
          [ LESSON COMPLETE ] Encoding is the next step, not part of this lesson
        </span>
        <p className="text-[11px] text-bone font-mono leading-relaxed">
          {seeds.length > 0
            ? `This lesson left ${seeds.length} ready-to-encode promp${seeds.length === 1 ? 't' : 'ts'} behind — answer them in your own words and the encoding is nearly done.`
            : 'You are pre-warmed: encoding now is mostly transcription of what you just reconstructed.'}
        </p>
        {seeds.length > 0 && (
          <ul className="space-y-1">
            {seeds.slice(0, 6).map((seed, i) => (
              <li key={i} className="text-[11px] font-mono text-solder leading-relaxed">
                <span className="text-amber font-bold">{i + 1}.</span> {seed.title}
                {seed.prompt ? <span className="text-solder/80"> — {seed.prompt}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="teach-start-encoding"
          onClick={onStartEncoding}
          className="px-4 py-3 bg-amber border border-amber text-chassis text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
        >
          [ START ENCODING ]
        </button>
        <button
          type="button"
          data-testid="teach-save-for-later"
          onClick={onSaveForLater}
          className="px-4 py-3 bg-chassis border border-edge text-bone text-xs font-mono font-bold uppercase tracking-wider cursor-pointer"
        >
          [ SAVE IT FOR LATER ]
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap text-[10px] font-mono text-solder">
        <span>
          Earned {totalXpEarned} XP{bestStreak > 1 ? ` · best streak ${bestStreak}` : ''}
          {savedCount > 0 ? ` · ${savedCount} prompt${savedCount === 1 ? '' : 's'} saved` : ''}
        </span>
        {savedAt ? (
          <span data-testid="teach-saved-note" className="text-signal">
            Saved for later · resume from the lesson pre-roll anytime
          </span>
        ) : null}
        <button
          type="button"
          data-testid="teach-close-without-saving"
          onClick={onClose}
          className="text-solder hover:text-bone cursor-pointer"
        >
          [ close without saving ]
        </button>
      </div>
    </div>
  );
}
