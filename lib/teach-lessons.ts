import type { TeachLesson, TeachScope } from './types';

// ─── Saved Teach Me lessons ("save it for later") ────────────────────────────
//
// Encoding is deliberately deferred out of a lesson: you learn, the lesson
// ends, and then you choose. Choosing "save it for later" has to mean
// something, so the whole lesson travels with its progress (segment pointer,
// XP, streak, scope) plus the encoding seeds it generated — reopening Teach Me
// for the same topic offers to resume it, and the workbench prompts are still
// there when you finally encode.
//
// Storage is localStorage, same as the rest of the app's light-weight
// preferences (`lib/storage.ts`): a lesson is small (a few KB of JSON), and
// losing it costs nothing because it can be regenerated.

const STORAGE_KEY = 'encode.teachme.library.v1';

/**
 * The key, under a name the backup can import.
 *
 * `lib/backup.ts` shipped a backup of the saved lessons under a second spelling
 * (`deepencode_teach_lessons_v1`) that this module has never written, so the
 * lessons a learner parked with "save it for later" were missing from every
 * backup file and gone after a restore (defect 58). Exported so the two modules
 * cannot drift apart again, matching `lib/forge-recipes.ts`.
 */
export { STORAGE_KEY as TEACH_LESSONS_STORAGE_KEY };

/** How many lessons stay resumable before the oldest are dropped. */
export const MAX_SAVED_TEACH_LESSONS = 20;

export interface SavedTeachLesson {
  id: string;
  savedAt: number;
  scope: TeachScope;
  /** Topic summary for notes scope, stage title for stage scope. */
  topic: string;
  stageIndex: number;
  lesson: TeachLesson;
  /** Where the learner stopped, so resume drops them back in place. */
  segmentIndex: number;
  xpEarned: number;
  bestStreak: number;
  /** True once the lesson was played to the end before being parked. */
  completed: boolean;
}

/**
 * Current timestamp, wrapped so React components never call `Date.now` while
 * rendering (the react-hooks purity rule cannot tell an event handler from a
 * render path).
 */
export function nowTimestamp(): number {
  return Date.now();
}

/** Stable id for a lesson slot: one saved lesson per (scope, topic) pair. */
export function teachLessonId(scope: TeachScope, topic: string): string {
  return `${scope}::${(topic || 'untitled').trim().toLowerCase().slice(0, 160)}`;
}

/** Reads the whole library, newest first. Never throws (private mode, quota). */
export function loadSavedTeachLessons(): SavedTeachLesson[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry: any): entry is SavedTeachLesson =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof entry.id === 'string' &&
              entry.lesson &&
              Array.isArray(entry.lesson.segments)
          )
      )
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  } catch {
    return [];
  }
}

function persist(entries: SavedTeachLesson[]): SavedTeachLesson[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* private mode / quota — the in-memory copy still works this session */
    }
  }
  return entries;
}

/**
 * Inserts or replaces the lesson for its (scope, topic) slot and returns the
 * new library, newest first, capped at {@link MAX_SAVED_TEACH_LESSONS}.
 */
export function saveTeachLesson(entry: SavedTeachLesson): SavedTeachLesson[] {
  const without = loadSavedTeachLessons().filter((e) => e.id !== entry.id);
  const next = [entry, ...without].slice(0, MAX_SAVED_TEACH_LESSONS);
  return persist(next);
}

export function deleteSavedTeachLesson(id: string): SavedTeachLesson[] {
  return persist(loadSavedTeachLessons().filter((e) => e.id !== id));
}

export function clearSavedTeachLessons(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The resumable lesson for this slot, or null when there is nothing parked. */
export function findSavedTeachLesson(scope: TeachScope, topic: string): SavedTeachLesson | null {
  const id = teachLessonId(scope, topic);
  return loadSavedTeachLessons().find((e) => e.id === id) ?? null;
}

/** One-line summary for the pre-roll list. */
export function describeSavedTeachLesson(entry: SavedTeachLesson): string {
  const total = entry.lesson.segments.length;
  const where = entry.completed
    ? 'lesson complete'
    : `stopped at ${Math.min(entry.segmentIndex + 1, total)}/${total}`;
  const seeds = entry.lesson.encodingSeeds?.length || 0;
  return `${where} · ${entry.xpEarned} XP${seeds > 0 ? ` · ${seeds} encode prompt${seeds === 1 ? '' : 's'}` : ''}`;
}
