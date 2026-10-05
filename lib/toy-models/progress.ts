import type { Activity, StageResponse } from '../types';
import { buildToyChallenge, modelFingerprint, restoreToyProgress, variablesFor } from './engine';
import { validateToyModelConfig } from './validation';
import type { ToyModelConfig, ToyModelProgress } from './types';

const STORAGE_KEY = 'deepencode_toy_progress_v1';
const LIMIT = 100;
/** Called only by interaction/timer handlers, never while deriving render output. */
export function stampToyProgress(progress: ToyModelProgress): ToyModelProgress {
  return { ...progress, updatedAt: Date.now() };
}
export function loadToyProgress(activityId: string, config: ToyModelConfig): ToyModelProgress {
  if (typeof window === 'undefined') return restoreToyProgress(config);
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return restoreToyProgress(config, raw[activityId]);
  } catch { return restoreToyProgress(config); }
}
export function saveToyProgress(activityId: string, config: ToyModelConfig, progress: ToyModelProgress): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    const entries = Object.entries(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}) as [string, ToyModelProgress][];
    const value = restoreToyProgress(config, progress);
    const merged = [[activityId, value] as [string, ToyModelProgress], ...entries.filter(([key]) => key !== activityId)]
      .sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0)).slice(0, LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(merged)));
    return true;
  } catch { return false; }
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
