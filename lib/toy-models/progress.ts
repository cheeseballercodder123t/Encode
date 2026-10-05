import type { Activity, StageResponse } from '../types';
import { buildToyChallenge, modelFingerprint, restoreToyProgress, variablesFor } from './engine';
import { validateToyModelConfig } from './validation';
import type { ToyModelConfig, ToyModelProgress } from './types';

export const TOY_PROGRESS_STORAGE_KEY = 'deepencode_toy_progress_v1';
/**
 * The local copy is a bounded working set, not the whole semester. A student
 * who pastes 30 decks of 10 labs would otherwise cross 100 snapshots in a week
 * and start silently losing the oldest ones, so the cache holds far more than a
 * single term needs; anything past the cap is an archive concern, which is what
 * `progress-cloud.ts` is for (`syncToyProgressWithCloud` keeps the account's
 * full history and restores evicted snapshots on the next sign-in).
 */
export const TOY_PROGRESS_LIMIT = 500;
/** The account-side mirror keeps a longer history than the device cache. */
export const TOY_PROGRESS_CLOUD_LIMIT = 2000;

/** The whole lab cache: one entry per activity id, newest update wins. */
export type ToyProgressStore = Record<string, ToyModelProgress>;

function isProgress(value: unknown): value is ToyModelProgress {
  const record = value as ToyModelProgress | null;
  return Boolean(record && typeof record === 'object' && typeof record.updatedAt === 'number' && record.version === 1);
}

/** Newest-first, so trimming always drops the oldest snapshot. */
function newestFirst(entries: [string, ToyModelProgress][]): [string, ToyModelProgress][] {
  return [...entries].sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
}

/** Enforces the count cap without ever mutating the caller's object. */
export function trimToyProgressStore(store: ToyProgressStore, limit = TOY_PROGRESS_LIMIT): ToyProgressStore {
  const entries = newestFirst(Object.entries(store).filter((entry): entry is [string, ToyModelProgress] => isProgress(entry[1])));
  return Object.fromEntries(entries.slice(0, Math.max(0, limit)));
}

/**
 * Reads the device's cache. Never throws: corrupt JSON, a non-object payload,
 * or an unavailable `localStorage` all degrade to an empty store, because a lab
 * that cannot read its snapshot must still render its locked initial state.
 */
export function loadToyProgressStore(): ToyProgressStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOY_PROGRESS_STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, ToyModelProgress] => isProgress(entry[1])));
  } catch {
    return {};
  }
}

export function saveToyProgressStore(store: ToyProgressStore, limit = TOY_PROGRESS_LIMIT): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(TOY_PROGRESS_STORAGE_KEY, JSON.stringify(trimToyProgressStore(store, limit)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Unions a device cache with the account mirror. A snapshot is one learner's
 * keyed progress, so the merge is per key by `updatedAt` — a newer answer on
 * either side wins, and an entry evicted from the local cache survives because
 * the cloud still carries it. Copies are shallow (progress is a flat record),
 * so callers can compare the result against their input by value.
 */
export function mergeToyProgressStores(local: ToyProgressStore, remote: ToyProgressStore, limit = TOY_PROGRESS_LIMIT): ToyProgressStore {
  const merged: ToyProgressStore = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    if (!isProgress(value)) continue;
    const current = merged[key];
    if (!current || (value.updatedAt || 0) > (current.updatedAt || 0)) merged[key] = value;
  }
  return trimToyProgressStore(merged, limit);
}

/** Cheap by-value comparison so a sync can report whether anything changed. */
export function toyProgressStoresEqual(a: ToyProgressStore, b: ToyProgressStore): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

/** Called only by interaction/timer handlers, never while deriving render output. */
export function stampToyProgress(progress: ToyModelProgress): ToyModelProgress {
  return { ...progress, updatedAt: Date.now() };
}
export function loadToyProgress(activityId: string, config: ToyModelConfig): ToyModelProgress {
  if (typeof window === 'undefined') return restoreToyProgress(config);
  try {
    return restoreToyProgress(config, loadToyProgressStore()[activityId]);
  } catch {
    // A snapshot that cannot be re-verified against the model is not a snapshot
    // this lab can trust; the locked initial state is the honest fallback.
    return restoreToyProgress(config);
  }
}
export function saveToyProgress(activityId: string, config: ToyModelConfig, progress: ToyModelProgress): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = restoreToyProgress(config, progress);
    const store = loadToyProgressStore();
    // This write is authoritative for its own key: the caller hands over the
    // newest progress, so it replaces the stored entry directly instead of
    // losing an `updatedAt` tie to the snapshot it is being saved over.
    return saveToyProgressStore({ ...store, [activityId]: value });
  } catch {
    return false;
  }
}
export function toySessionId(activities: Activity[], topic: string): string | undefined {
  if (!activities.some((activity) => activity.toyModel)) return undefined;
  let hash = 2166136261;
  const identity = topic + activities.map((activity) => `${activity.id}:${activity.toyModel ? modelFingerprint(activity.toyModel) : ''}`).join('|');
  for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
  return `lab-session-${(hash >>> 0).toString(16)}`;
}

export interface ToyBoundaryCard { id: string; front: string; back: string; correctPrediction: boolean; type: ToyModelConfig['type'] }
export function toyBoundaryCard(activity: Activity, response?: StageResponse): ToyBoundaryCard | undefined {
  const validated = validateToyModelConfig(activity.toyModel);
  const config = validated.sanitizedConfig;
  if (!config || !response?.toyModelProgress) return undefined;
  const progress = restoreToyProgress(config, response.toyModelProgress);
  if (!progress.revealed) return undefined;
  const challenge = buildToyChallenge(config);
  const selected = challenge.choices.find((choice) => choice.id === progress.predictionId);
  const answer = challenge.choices.find((choice) => choice.id === challenge.correctId)!;
  return {
    id: `act-${activity.id}-toy-boundary`,
    front: challenge.question,
    back: `Prediction: ${selected?.label}. Observed: ${answer.label}. ${config.prediction.explanation} Boundary: ${config.takeaway}`,
    correctPrediction: progress.predictionId === challenge.correctId,
    type: config.type,
  };
}

export interface ToyDuelCard { id: string; front: string; back: string; type: ToyModelConfig['type'] }
/**
 * The Devil's Advocate duel as a trap card. It exists only when the engine
 * verifies the refutation (claim heard, inputs at the refutation configuration
 * after restore) — a stored `duelRefuted` flag alone never becomes a card.
 */
export function toyDuelCard(activity: Activity, response?: StageResponse): ToyDuelCard | undefined {
  const validated = validateToyModelConfig(activity.toyModel);
  const config = validated.sanitizedConfig;
  const duel = config?.devilsAdvocate;
  if (!config || !duel || !response?.toyModelProgress) return undefined;
  const progress = restoreToyProgress(config, response.toyModelProgress);
  if (!progress.revealed || progress.duelRefuted !== true) return undefined;
  const how = Object.entries(duel.refutationInputs).map(([key, value]) => {
    const slider = variablesFor(config).find((item) => item.key === key);
    return slider ? `${slider.label.toLowerCase()} to ${value} ${slider.unit}` : `${key} to ${value}`;
  }).join(' and ');
  return {
    id: `act-${activity.id}-toy-duel`,
    front: `${duel.speaker} claims: “${duel.claim}” What does the model show?`,
    back: `Refuted by setting ${how}. ${duel.refutationOutcome} Fallacy: ${duel.fallacy}.`,
    type: config.type,
  };
}
