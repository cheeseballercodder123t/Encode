'use client';

import React from 'react';
import { Activity, StageResponse } from '@/lib/types';
import { buildChapterSummary } from '@/lib/chapters';
import { playSound } from '@/lib/audio';

/**
 * Chapter rail for video sessions.
 *
 * A 90-minute lecture is not one sitting. The rail answers the question that
 * was previously unanswerable at a glance — "which chapters have I actually
 * encoded, and where do I pick up?" — and makes every chapter one click away,
 * seeking the embedded player to that timestamp when one exists.
 *
 * Status comes only from produced work (a non-skipped stage with wording), so
 * the rail cannot flatter a session that has not happened.
 */

interface ChapterRailProps {
  activities: Activity[];
  responses: Record<string, StageResponse>;
  currentIndex: number;
  /** Jump to a chapter stage (and seek the player when a timestamp exists). */
  onJump: (index: number, seconds?: number) => void;
}

export function ChapterRail({ activities, responses, currentIndex, onJump }: ChapterRailProps) {
  const summary = buildChapterSummary(activities, responses, currentIndex);
  if (summary.total === 0) return null;

  const allDone = summary.done >= summary.total;

  return (
    <div className="rounded-md border border-edge bg-deck/60 p-3 space-y-2.5" data-testid="chapter-rail">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-solder">
          Chapter progress
        </span>
        <span className="font-mono text-[10px] text-solder" data-testid="chapter-summary">
          {summary.summaryLine}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {summary.chapters.map((chapter) => {
          const isCurrent = chapter.index === currentIndex;
          const isResume = !allDone && chapter.index === summary.resumeIndex;
          return (
            <button
              key={chapter.index}
              type="button"
              data-testid={`chapter-chip-${chapter.index}`}
              aria-current={isCurrent ? 'step' : undefined}
              title={chapter.label}
              onClick={() => {
                playSound('click');
                onJump(chapter.index, chapter.seconds);
              }}
              className={`px-2 py-1 text-[11px] rounded border transition-colors duration-150 cursor-pointer flex items-center gap-1.5 ${
                chapter.done
                  ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
                  : isCurrent
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-inset border-edge text-slate-ink hover:text-bone hover:border-solder'
              } ${isResume && !isCurrent ? 'ring-1 ring-amber-500/40' : ''}`}
            >
              <span className="font-mono">{chapter.done ? '[ OK ]' : `${chapter.index + 1}.`}</span>
              <span className="max-w-[10rem] truncate">
                {chapter.formatted ? `${chapter.formatted} ` : ''}
                {chapter.title}
              </span>
            </button>
          );
        })}
      </div>

      {!allDone && (
        <button
          type="button"
          data-testid="chapter-resume"
          onClick={() => {
            playSound('click');
            const resume = summary.chapters[summary.resumeIndex];
            onJump(summary.resumeIndex, resume?.seconds);
          }}
          className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 transition-colors duration-150 cursor-pointer"
        >
          Resume chapter {summary.resumeIndex + 1}
        </button>
      )}
    </div>
  );
}
