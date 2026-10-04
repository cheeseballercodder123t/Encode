// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';
import { buildToyChallenge, modelFingerprint } from '@/lib/toy-models/engine';
import { loadToyProgress, saveToyProgress, toySessionId } from '@/lib/toy-models/progress';
import type { ToyModelProgress } from '@/lib/toy-models/types';
const config = TOY_EXAMPLES[0].config;
const challenge = buildToyChallenge(config);
const progress: ToyModelProgress = { version: 1, modelKey: modelFingerprint(config), predictionId: challenge.correctId, inputs: challenge.targetInputs, explored: true, revealed: true, updatedAt: 100 };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe('lab progress persistence', () => {
  it('saves and restores exactly and rejects a different model under the same stage ID', () => {
    expect(saveToyProgress('stage', config, progress)).toBe(true);
    expect(loadToyProgress('stage', config)).toEqual(progress);
    expect(loadToyProgress('stage', TOY_EXAMPLES[1].config).predictionId).toBeUndefined();
  });
  it('corrupt local JSON restores the locked initial state', () => {
    localStorage.setItem('deepencode_toy_progress_v1', '{broken');
    expect(loadToyProgress('stage', config).revealed).toBe(false);
  });
  it('reports quota failure instead of falsely claiming durability', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(saveToyProgress('stage', config, progress)).toBe(false);
  });
  it('caps history at the 100 newest lab snapshots', () => {
    for (let index = 0; index < 105; index++) saveToyProgress(`stage-${index}`, config, { ...progress, updatedAt: index + 1 });
    const values = JSON.parse(localStorage.getItem('deepencode_toy_progress_v1')!);
    expect(Object.keys(values)).toHaveLength(100);
    expect(values['stage-0']).toBeUndefined();
    expect(values['stage-104']).toBeDefined();
  });
  it('schema checkpoint IDs are stable, content-aware and absent for old static stages', () => {
    const activity = activityForToyExample(TOY_EXAMPLES[0]);
    expect(toySessionId([activity], 'Ohm')).toBe(toySessionId([structuredClone(activity)], 'Ohm'));
    expect(toySessionId([activity], 'Ohm')).not.toBe(toySessionId([activity], 'Other'));
    expect(toySessionId([{ ...activity, toyModel: undefined }], 'Ohm')).toBeUndefined();
  });
});
