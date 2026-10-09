// ─── The in-progress stage draft ─────────────────────────────────────────────
//
// The visible stage's typing lives in React state (`useSession`) and only
// reaches `userResponses` on Submit/Skip. A reload therefore used to return to
// empty fields and take the learner's unsubmitted paragraph with it, while the
// YouTube and lab paths survived the same reload because both checkpoint a
// schema as they go.
//
// This is that checkpoint for EVERY encode path: the live fields (plus the
// session they belong to) written while the learner types, so the launchpad can
// offer the stage back with its content intact.
//
// Kept in localStorage rather than IndexedDB on purpose, matching
// `lib/mr-m/ledger.ts` and `interference-traps.ts`: the launchpad reads it
// synchronously on the very first paint, before an async store could answer.
//
// One record, one writer: `saveStageDraft` from the session hub's own autosave.
// Readers only ever coerce what they find, so a hand-edited or half-written
// record degrades to "nothing to resume" instead of throwing inside a render.

import type {
  Activity,
  EncodingMode,
  GuidedPathModule,
  ResearchContextItem,
  StageResponse,
  YouTubeMetadata,
} from './types';

export const STAGE_DRAFT_KEY = 'deepencode_stage_draft_v1';

/**
 * How long an untouched draft stays offerable.
 *
 * A week, because "finish the lecture tomorrow" is the ordinary case and an
 * encode session spans days of study. Beyond that the stale fragment is more
 * likely to confuse than to help, and it is dropped rather than shown.
 */
export const STAGE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** The session the draft belongs to. Mirrors the fields a SavedSchema carries. */
export interface StageDraftSession {
  topicSummary: string;
  encodingMode: EncodingMode;
  xpEarned: number;
  activities: Activity[];
  userResponses: Record<string, StageResponse>;
  /** Index of the stage that was on screen. */
  currentActivityIndex: number;
  isGuidedPath?: boolean;
  guidedModules?: GuidedPathModule[];
  youtubeData?: YouTubeMetadata | null;
  researchContexts?: ResearchContextItem[];
  sourceFileName?: string;
}

/** A session plus the typing that has not been submitted yet (defect 37). */
export interface StageDraft extends StageDraftSession {
  /** When the draft was last written. Stamped by `saveStageDraft`. */
  savedAt: number;
  field1: string;
  field2: string;
  field3: string;
  selectedPreset: string;
  reflection: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** True when the visible stage holds typing that has never been submitted. */
export function stageDraftHasTyping(draft: Pick<StageDraft, 'field1' | 'field2' | 'field3' | 'reflection'>): boolean {
  return (
    (draft.field1 || '').trim().length > 0 ||
    (draft.field2 || '').trim().length > 0 ||
    (draft.field3 || '').trim().length > 0 ||
    (draft.reflection || '').trim().length > 0
  );
}

/** The 1-based stage number the draft was written on. */
export function stageDraftStageNumber(draft: Pick<StageDraft, 'currentActivityIndex'>): number {
  return Number.isFinite(draft.currentActivityIndex) ? Math.max(1, Math.floor(draft.currentActivityIndex) + 1) : 1;
}

/**
 * True when the draft is worth offering back.
 *
 * The session has to be replayable (at least one activity), and there has to be
 * something in it the learner would miss: unsubmitted typing, or stages already
 * submitted this session. A draft holding neither is noise — the launchpad
 * shows nothing rather than a resume button into an empty workbench.
 */
export function stageDraftHasProgress(draft: StageDraft): boolean {
  if (!Array.isArray(draft.activities) || draft.activities.length === 0) return false;
  if (stageDraftHasTyping(draft)) return true;
  return Object.keys(draft.userResponses || {}).length > 0;
}

/** A positive, finite stamp is the only thing that can be aged. */
function readStamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Whether the draft is recent enough to offer back.
 *
 * An unreadable stamp is not evidence of freshness: it reads as stale, exactly
 * as the cloud settings guard treats an unreadable stamp (`lib/settings-sync.ts`).
 * A stamp in the future (clock skew) is not stale.
 */
export function isStageDraftFresh(draft: { savedAt?: unknown }, now: number = Date.now()): boolean {
  const stamp = readStamp(draft?.savedAt);
  if (stamp === null) return false;
  return now - stamp <= STAGE_DRAFT_MAX_AGE_MS;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Coerces a stored record into a draft, or null when it is not one.
 *
 * Everything is re-read rather than trusted: a record written by an older
 * release, or edited by hand, must not be able to make the launchpad crash or
 * the workbench render a stage that is not there.
 */
function coerceStageDraft(raw: unknown): StageDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;

  const activities = Array.isArray(data.activities)
    ? (data.activities.filter(
        (activity) => !!activity && typeof activity === 'object' && typeof (activity as Activity).id === 'string'
      ) as Activity[])
    : null;
  if (!activities) return null;

  const userResponses =
    data.userResponses && typeof data.userResponses === 'object' && !Array.isArray(data.userResponses)
      ? (data.userResponses as Record<string, StageResponse>)
      : {};

  return {
    savedAt: readStamp(data.savedAt) ?? 0,
    topicSummary: asString(data.topicSummary),
    encodingMode: (asString(data.encodingMode) || 'conceptual') as EncodingMode,
    xpEarned: typeof data.xpEarned === 'number' && Number.isFinite(data.xpEarned) ? data.xpEarned : 0,
    activities,
    userResponses,
    currentActivityIndex:
      typeof data.currentActivityIndex === 'number' && Number.isFinite(data.currentActivityIndex)
        ? Math.max(0, Math.floor(data.currentActivityIndex))
        : 0,
    isGuidedPath: Boolean(data.isGuidedPath),
    guidedModules: Array.isArray(data.guidedModules) ? (data.guidedModules as GuidedPathModule[]) : undefined,
    youtubeData: (data.youtubeData as YouTubeMetadata | null | undefined) ?? null,
    researchContexts: Array.isArray(data.researchContexts)
      ? (data.researchContexts as ResearchContextItem[])
      : undefined,
    sourceFileName: typeof data.sourceFileName === 'string' ? data.sourceFileName : undefined,
    field1: asString(data.field1),
    field2: asString(data.field2),
    field3: asString(data.field3),
    selectedPreset: asString(data.selectedPreset),
    reflection: asString(data.reflection),
  };
}

/**
 * The draft worth recovering, or null when there is nothing to recover.
 *
 * One reader, one rule: a record that is unreadable, stale, or holds no work
 * the learner would miss is `null` rather than an empty workbench offered back
 * (see `stageDraftHasProgress`).
 */
export function loadStageDraft(now: number = Date.now()): StageDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STAGE_DRAFT_KEY);
    if (!raw) return null;
    const draft = coerceStageDraft(JSON.parse(raw));
    if (!draft) return null;
    if (!isStageDraftFresh(draft, now)) return null;
    if (!stageDraftHasProgress(draft)) return null;
    return draft;
  } catch {
    return null;
  }
}

/** Writes the draft, stamping it now. Best effort: a full quota must not block the stage. */
export function saveStageDraft(draft: StageDraft, now: number = Date.now()): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STAGE_DRAFT_KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    /* best-effort: the stage must never depend on persistence succeeding */
  }
}

/** Drops the draft — the session finished, or the learner discarded it. */
export function clearStageDraft(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STAGE_DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}
