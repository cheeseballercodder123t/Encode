// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';
import { buildToyChallenge, modelFingerprint } from '@/lib/toy-models/engine';
import {
  TOY_PROGRESS_LIMIT,
  TOY_PROGRESS_STORAGE_KEY,
  loadToyProgress,
  loadToyProgressStore,
  mergeToyProgressStores,
  saveToyProgress,
  saveToyProgressStore,
  toyProgressStoresEqual,
  toySessionId,
  trimToyProgressStore,
} from '@/lib/toy-models/progress';
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
    localStorage.setItem(TOY_PROGRESS_STORAGE_KEY, '{broken');
    expect(loadToyProgress('stage', config).revealed).toBe(false);
  });
  it('reports quota failure instead of falsely claiming durability', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(saveToyProgress('stage', config, progress)).toBe(false);
  });
  it(`caps history at the ${TOY_PROGRESS_LIMIT} newest lab snapshots`, () => {
    const overflow = TOY_PROGRESS_LIMIT + 5;
    for (let index = 0; index < overflow; index++) saveToyProgress(`stage-${index}`, config, { ...progress, updatedAt: index + 1 });
    const values = JSON.parse(localStorage.getItem(TOY_PROGRESS_STORAGE_KEY)!);
    expect(Object.keys(values)).toHaveLength(TOY_PROGRESS_LIMIT);
    expect(values['stage-0']).toBeUndefined();
    expect(values[`stage-${overflow - 1}`]).toBeDefined();
  });
  it('schema checkpoint IDs are stable, content-aware and absent for old static stages', () => {
    const activity = activityForToyExample(TOY_EXAMPLES[0]);
    expect(toySessionId([activity], 'Ohm')).toBe(toySessionId([structuredClone(activity)], 'Ohm'));
    expect(toySessionId([activity], 'Ohm')).not.toBe(toySessionId([activity], 'Other'));
    expect(toySessionId([{ ...activity, toyModel: undefined }], 'Ohm')).toBeUndefined();
  });
});

describe('lab progress store helpers (cloud mirror)', () => {
  it('unions the device cache with the account by newest update per key', () => {
    const cloud = { a: { ...progress, updatedAt: 50 }, b: { ...progress, updatedAt: 5 } };
    const local = { a: { ...progress, updatedAt: 10 }, c: { ...progress, updatedAt: 9 } };

    const merged = mergeToyProgressStores(local, cloud, 100);

    // Every key survives: the newer answer wins, a snapshot the device cache had
    // evicted is restored from the account, and a device-only one is kept.
    expect(Object.keys(merged).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.a.updatedAt).toBe(50);
    expect(merged.b.updatedAt).toBe(5);
    expect(merged.c.updatedAt).toBe(9);
  });

  it('trims the merge to the newest entries and never mutates its inputs', () => {
    const local = Object.fromEntries([1, 2, 3].map((n) => [`l${n}`, { ...progress, updatedAt: n }]));
    const remote = Object.fromEntries([4, 5, 6].map((n) => [`r${n}`, { ...progress, updatedAt: n }]));

    const merged = mergeToyProgressStores(local, remote, 2);

    expect(Object.keys(merged).sort()).toEqual(['r5', 'r6']);
    expect(Object.keys(local)).toHaveLength(3);
    expect(trimToyProgressStore(local, 1)).toHaveProperty('l3');
  });

  it('drops malformed snapshots on read, merge and write', () => {
    localStorage.setItem(TOY_PROGRESS_STORAGE_KEY, JSON.stringify({ good: progress, bad: { nope: true }, older: { version: 2, updatedAt: 1 } }));
    expect(Object.keys(loadToyProgressStore())).toEqual(['good']);

    const merged = mergeToyProgressStores({}, { junk: 'not a record' as unknown as ToyModelProgress }, 10);
    expect(merged).toEqual({});

    expect(saveToyProgressStore({ bad: { version: 2, updatedAt: 3 } as unknown as ToyModelProgress })).toBe(true);
    expect(JSON.parse(localStorage.getItem(TOY_PROGRESS_STORAGE_KEY)!)).toEqual({});
  });

  it('compares stores by value so a sync can report a real change', () => {
    const a = { k: progress };
    expect(toyProgressStoresEqual(a, { k: { ...progress } })).toBe(true);
    expect(toyProgressStoresEqual(a, { k: { ...progress, updatedAt: 101 } })).toBe(false);
    expect(toyProgressStoresEqual(a, {})).toBe(false);
  });
});
