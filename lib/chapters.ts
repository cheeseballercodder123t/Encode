// ─── Chapter-level progress for YouTube sessions ────────────────────────────
//
// A 90-minute lecture is not one sitting. The failure mode of video mode was
// all-or-nothing: nine chapter workouts, and no way to say "two today" that
// survives a reload. The session already autosaves per video, and the activities
// already carry their video timestamps — this module derives the one thing the
// UI was missing: which chapters are actually encoded, where the resume point
// is, and a single line that says so.
//
// "Encoded" means the learner produced something for that chapter in this
// session: submitted wording, or an examiner grade on wording they typed (the
// response record only commits the raw fields on mastery, so the graded-but-not-
// yet-mastered case has to count or the rail would under-report real work).
// Nothing is inferred from timers or watch position.

import type { Activity, StageResponse } from './types';

export type ChapterStatus = 'done' | 'current' | 'pending';

export interface ChapterProgress {
  /** Index into the activities array. */
  index: number;
  stageNumber: number;
  title: string;
  /** Chapter label for the rail: timestamp + title when the video has one. */
  label: string;
  /** Seconds into the video, when the activity is anchored to a timestamp. */
  seconds?: number;
  formatted?: string;
  status: ChapterStatus;
  done: boolean;
}

export interface ChapterSummary {
  chapters: ChapterProgress[];
  done: number;
  total: number;
  /** First unencoded chapter, or the last one when everything is encoded. */
  resumeIndex: number;
  resumeLabel: string;
  /** One line for the UI: "2 of 9 chapters encoded · resume at 3". */
  summaryLine: string;
}

function isEncoded(response: StageResponse | undefined): boolean {
  if (!response || response.skipped) return false;
  if ((response.field1 || '').trim() || (response.field2 || '').trim()) return true;
  // Graded (or explicitly re-checked) but not yet committed to the record.
  return Boolean(response.feynmanReview) || (response.checkCount ?? 0) > 0;
}

export function buildChapterSummary(
  activities: Activity[] | undefined,
  responses: Record<string, StageResponse> | undefined,
  currentIndex: number = 0
): ChapterSummary {
  const acts = activities || [];
  const resps = responses || {};

  const chapters: ChapterProgress[] = acts.map((act, index) => {
    const done = isEncoded(resps[act?.id]);
    const stamp = act?.videoTimestamp;
    const title = (act?.title || `Chapter ${index + 1}`).trim();
    const formatted = stamp?.formatted?.trim();
    return {
      index,
      stageNumber: act?.stageNumber ?? index + 1,
      title,
      label: formatted ? `${formatted} · ${title}` : title,
      seconds: typeof stamp?.seconds === 'number' ? stamp.seconds : undefined,
      formatted: formatted || undefined,
      status: done ? 'done' : index === currentIndex ? 'current' : 'pending',
      done,
    };
  });

  const done = chapters.filter((c) => c.done).length;
  const firstPending = chapters.findIndex((c) => !c.done);
  const resumeIndex = firstPending >= 0 ? firstPending : Math.max(0, chapters.length - 1);
  const resumeLabel = chapters[resumeIndex]?.label || '';

  const summaryLine =
    chapters.length === 0
      ? 'No chapters yet'
      : done >= chapters.length
        ? `${done} of ${chapters.length} chapters encoded · session complete`
        : `${done} of ${chapters.length} chapters encoded · resume at ${resumeIndex + 1} of ${chapters.length}`;

  return { chapters, done, total: chapters.length, resumeIndex, resumeLabel, summaryLine };
}
