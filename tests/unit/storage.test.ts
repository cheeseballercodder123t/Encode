// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadAISettings,
  saveAISettings,
  DEFAULT_SETTINGS,
  loadSavedSchemas,
  saveSchemaToHistory,
  deleteSchemaFromHistory,
  clearAllSchemas,
  loadUsageStats,
  incrementModelCall,
  recordTokenUsage,
  loadStudyPrefs,
  saveStudyPrefs,
  DEFAULT_STUDY_PREFS,
  loadTopicStruggles,
  recordTopicResult,
  clearTopicStruggles,
  invalidateSchemaCache,
  subscribeToSavedSchemas,
  mergeSchemaLists,
} from '@/lib/storage';
import type { SavedSchema } from '@/lib/types';
import { makeSchema } from './fixtures';

// happy-dom has no IndexedDB; silence the expected fallback warnings from lib/db.ts
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  localStorage.clear();
  // The schema list is memoized in a module-level cache, so clearing storage is
  // not enough: a test that seeds a raw value has to reset the cache too.
  invalidateSchemaCache();
});

describe('AI settings', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadAISettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored settings over defaults', () => {
    saveAISettings({ provider: 'openai', openaiApiKey: 'sk-test' } as any);
    const loaded = loadAISettings();
    expect(loaded.provider).toBe('openai');
    expect(loaded.openaiApiKey).toBe('sk-test');
    expect(loaded.geminiModel).toBe(DEFAULT_SETTINGS.geminiModel);
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem('deepencode_ai_settings_v2', '{not json');
    expect(loadAISettings()).toEqual(DEFAULT_SETTINGS);
  });

  // Defect 36: the record's age is what the cloud guard compares, and the reset
  // and backup-restore paths used to write a record without one - which read as
  // `0`, i.e. older than every account backup, so an old copy was applied over a
  // deliberate local choice.
  it('stamps a record written by a path that forgot to', () => {
    saveAISettings({ provider: 'gemini' });

    const stored = JSON.parse(localStorage.getItem('deepencode_ai_settings_v2')!);
    expect(typeof stored.savedAt).toBe('number');
    expect(stored.savedAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it('honours an explicit stamp, and otherwise keeps the record’s own', () => {
    saveAISettings({ provider: 'openai' }, 1234);
    expect(JSON.parse(localStorage.getItem('deepencode_ai_settings_v2')!).savedAt).toBe(1234);

    saveAISettings({ provider: 'openai', savedAt: 4321 });
    expect(JSON.parse(localStorage.getItem('deepencode_ai_settings_v2')!).savedAt).toBe(4321);
  });
});

describe('schema history', () => {
  it('saves, lists and deletes schemas', () => {
    const s = makeSchema();
    saveSchemaToHistory(s);
    expect(loadSavedSchemas()).toEqual([s]);

    deleteSchemaFromHistory(s.id);
    expect(loadSavedSchemas()).toEqual([]);
  });

  it('replaces by id instead of duplicating', () => {
    const s = makeSchema();
    saveSchemaToHistory(s);
    saveSchemaToHistory({ ...s, xpEarned: 999 });
    const list = loadSavedSchemas();
    expect(list).toHaveLength(1);
    expect(list[0].xpEarned).toBe(999);
  });

  it('caps local history at 50 entries', () => {
    for (let i = 0; i < 55; i++) {
      saveSchemaToHistory(makeSchema({ timestamp: i }));
    }
    expect(loadSavedSchemas()).toHaveLength(50);
  });
});

describe('persisted records are re-read, not trusted', () => {
  // A record written by an older release reaches the history drawer through two
  // unvalidated paths (the localStorage migration and a raw `JSON.parse`), and
  // the drawer used to filter on `s.topicSummary.toLowerCase()`. One legacy
  // record therefore threw during render with no error boundary above it: the
  // app answered with "Application error: a client-side exception has occurred"
  // and the learner could not clear the bad data, because "clear all" lives in
  // the drawer that crashed. `e2e/history-drawer-legacy.spec.ts` pins the crash
  // in the browser; these pin the contract that stops it.
  it('gives a legacy record with no topic a usable name instead of undefined', () => {
    localStorage.setItem(
      'deepencode_saved_schemas_v2',
      JSON.stringify([{ id: 'legacy', timestamp: 1, mode: 'conceptual', activities: [] }])
    );
    const list = loadSavedSchemas();
    expect(list).toHaveLength(1);
    expect(list[0].topicSummary).toBe('Untitled topic');
    // And every other dereferenced field is the right type.
    expect(typeof list[0].topicSummary.toLowerCase()).toBe('string');
    expect(list[0].activities).toEqual([]);
    expect(list[0].userResponses).toEqual({});
    expect(list[0].xpEarned).toBe(0);
    expect(list[0].mode).toBe('conceptual');
  });

  it('keeps a real record byte-identical', () => {
    const s = makeSchema();
    saveSchemaToHistory(s);
    expect(loadSavedSchemas()[0]).toEqual(s);
  });

  it('drops entries that are not records at all', () => {
    localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([null, 'nope', 42, { timestamp: 1 }]));
    expect(loadSavedSchemas()).toEqual([]);
  });

  it('coerces a wrong-typed record field by field', () => {
    const raw = {
      id: 'partial',
      timestamp: 'yesterday',
      topicSummary: '   ',
      mode: 'mnemonic',
      xpEarned: null,
      activities: 'none',
      userResponses: [1, 2],
      youtubeData: 'a string, not an object',
    };
    localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([raw]));
    const list = loadSavedSchemas();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: 'partial',
      timestamp: 0,
      topicSummary: 'Untitled topic',
      mode: 'conceptual',
      xpEarned: 0,
      activities: [],
      userResponses: {},
      youtubeData: undefined,
    });
  });

  it('returns an empty list for a non-array history', () => {
    localStorage.setItem('deepencode_saved_schemas_v2', '{"not":"a list"}');
    expect(loadSavedSchemas()).toEqual([]);
  });
});

describe('the cache is invalidated, so a second tab cannot lose the first tab\u2019s schema', () => {
  // The module-level cache is a snapshot of ONE tab's view of the library, and
  // `storage` never fires in the tab that wrote. So a writer that rebuilt its
  // replacement list from that cache wrote a stale list: this tab's save
  // dropped whatever the other tab had saved in between.
  it('builds a save on what is actually on disk, not on the warm cache', () => {
    const mine = makeSchema({ id: 'a', timestamp: 1 });
    saveSchemaToHistory(mine); // warm this tab's cache

    // Another tab prepends its schema to the same key. The reading tab knows
    // nothing about it yet: no event has arrived in its own document.
    const theirs = { ...makeSchema({ id: 'b', timestamp: 2 }), topicSummary: 'Saltatory Conduction' };
    localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify([theirs, mine]));

    // Now this tab saves its own new schema. Theirs must survive the write.
    saveSchemaToHistory(makeSchema({ id: 'c', timestamp: 3 }));
    const stored = JSON.parse(localStorage.getItem('deepencode_saved_schemas_v2') || '[]');
    expect(stored.map((s: SavedSchema) => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('drops the stale cache when another tab writes the key', () => {
    saveSchemaToHistory(makeSchema({ id: 'a' }));
    expect(loadSavedSchemas().map((s) => s.id)).toEqual(['a']);

    const theirs = { ...makeSchema({ id: 'b' }), topicSummary: 'Saltatory Conduction' };
    const raw = JSON.stringify([theirs]);
    localStorage.setItem('deepencode_saved_schemas_v2', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'deepencode_saved_schemas_v2', newValue: raw }));

    expect(loadSavedSchemas().map((s) => s.id)).toEqual(['b']);
  });

  it('tells subscribers about this tab\u2019s own writes, marked local', () => {
    const seen: Array<{ ids: string[]; origin: string }> = [];
    const unsubscribe = subscribeToSavedSchemas((schemas, origin) => {
      seen.push({ ids: schemas.map((s) => s.id), origin });
    });
    saveSchemaToHistory(makeSchema({ id: 'mine' }));
    unsubscribe();

    expect(seen).toEqual([{ ids: ['mine'], origin: 'local' }]);
  });

  it('tells subscribers about another tab\u2019s write, marked remote', () => {
    const seen: Array<{ ids: string[]; origin: string }> = [];
    const unsubscribe = subscribeToSavedSchemas((schemas, origin) => {
      seen.push({ ids: schemas.map((s) => s.id), origin });
    });

    const raw = JSON.stringify([{ ...makeSchema({ id: 'theirs' }), topicSummary: 'Theirs' }]);
    localStorage.setItem('deepencode_saved_schemas_v2', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'deepencode_saved_schemas_v2', newValue: raw }));
    unsubscribe();

    expect(seen).toEqual([{ ids: ['theirs'], origin: 'remote' }]);
  });
});

describe('mergeSchemaLists', () => {
  // IndexedDB keeps every schema; the mirror is capped at fifty. Merging rather
  // than preferring either one is what makes a just-saved schema (which the
  // async IndexedDB write has not landed for yet) impossible to hide.
  it('keeps the mirror order and appends the schemas only IndexedDB has', () => {
    const local = [makeSchema({ id: 'new' }), makeSchema({ id: 'old' })];
    const fromIDB = [makeSchema({ id: 'new' }), makeSchema({ id: 'dropped-by-cap' })];
    expect(mergeSchemaLists(local, fromIDB).map((s) => s.id)).toEqual(['new', 'old', 'dropped-by-cap']);
  });

  it('returns the mirror untouched when IndexedDB has nothing to add', () => {
    const local = [makeSchema({ id: 'only' })];
    expect(mergeSchemaLists(local, [])).toEqual(local);
    expect(mergeSchemaLists(local, [makeSchema({ id: 'only' })])).toEqual(local);
  });
});

// The usage ledger answers three questions with three periods (today, this week,
// lifetime), so a roll is only ever allowed to touch the period that owns it.
const USAGE_KEY = 'deepencode_usage_stats_v1';
const readStoredUsage = () => JSON.parse(localStorage.getItem(USAGE_KEY)!);
const ageTheRecord = (patch: Record<string, unknown>) => {
  localStorage.setItem(USAGE_KEY, JSON.stringify({ ...readStoredUsage(), ...patch }));
};

describe('usage stats', () => {
  it('increments per-model counters', () => {
    incrementModelCall('gemini-3.7-flash');
    incrementModelCall('gemini-3.7-flash');
    incrementModelCall('gpt-4o-mini');
    const stats = loadUsageStats();
    expect(stats.callsByModel['gemini-3.7-flash']).toBe(2);
    expect(stats.callsByModel['gpt-4o-mini']).toBe(1);
  });

  it('resets daily counters when the stored date is stale', () => {
    incrementModelCall('m1');
    ageTheRecord({ date: 'Mon Jan 01 2001' });

    const stats = loadUsageStats();
    expect(stats.callsByModel['m1']).toBeUndefined();
    // weekly counters survive the daily reset
    expect(stats.weeklyCallsByModel['m1']).toBe(1);
  });

  // Defect 31: the daily roll rebuilt the record from the three fields it
  // owned, so the first read of a new day deleted the two the dashboard labels
  // LIFETIME - and those two are also what a backup carries.
  it('keeps the lifetime token and cost ledgers across the daily roll', () => {
    recordTokenUsage('m1', { promptTokens: 1_000, completionTokens: 500, costUsd: 0.42 });
    recordTokenUsage('m2', { totalTokens: 2_000, costUsd: 0.08 });
    ageTheRecord({ date: 'Mon Jan 01 2001' });

    const stats = loadUsageStats();

    expect(stats.tokensByModel).toEqual({ m1: 1_500, m2: 2_000 });
    expect(stats.costUsdByModel!.m1).toBeCloseTo(0.42);
    // The record on disk keeps them too: the next reader, and the backup, are
    // reading the same numbers this call returned.
    expect(readStoredUsage().tokensByModel).toEqual({ m1: 1_500, m2: 2_000 });
    expect(readStoredUsage().costUsdByModel.m2).toBeCloseTo(0.08);
    // ...and the daily roll still did its own job.
    expect(stats.callsByModel).toEqual({});
  });

  // Defect 32: nothing rolled `weeklyCallsByModel`, so the panel labelled THIS
  // WEEK showed every call ever made once the first week had passed.
  it('rolls the weekly counters when the week turns', () => {
    incrementModelCall('m1');
    incrementModelCall('m1');
    recordTokenUsage('m1', { totalTokens: 300, costUsd: 0.02 });
    ageTheRecord({ date: 'Mon Jan 01 2001', weekStart: '2001-01-01' });

    const stats = loadUsageStats();

    expect(stats.weeklyCallsByModel).toEqual({});
    expect(readStoredUsage().weeklyCallsByModel).toEqual({});
    // The lifetime ledger is not the week's to clear.
    expect(stats.tokensByModel).toEqual({ m1: 300 });
  });

  it('a record written before the week had a period adopts the current week', () => {
    localStorage.setItem(USAGE_KEY, JSON.stringify({
      date: new Date().toDateString(),
      callsByModel: { m1: 3 },
      weeklyCallsByModel: { m1: 9 },
      tokensByModel: { m1: 700 },
      costUsdByModel: { m1: 0.01 },
    }));

    const stats = loadUsageStats();

    expect(stats.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(readStoredUsage().weekStart).toBe(stats.weekStart);
    expect(stats.weeklyCallsByModel).toEqual({});
    expect(stats.callsByModel).toEqual({ m1: 3 });
    expect(stats.tokensByModel).toEqual({ m1: 700 });
    expect(stats.costUsdByModel).toEqual({ m1: 0.01 });
  });

  // Defect 33: the read path trusted the record it found. A today-dated record
  // with no counters reached the dashboard as `undefined`, and the sheet's
  // `Object.values(usage.callsByModel)` threw while rendering the usage card.
  it('reads a record of the wrong shape instead of trusting it', () => {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: new Date().toDateString(), tokensByModel: { m1: 10 } }));

    const stats = loadUsageStats();

    expect(stats.callsByModel).toEqual({});
    expect(stats.weeklyCallsByModel).toEqual({});
    expect(Object.values(stats.callsByModel)).toHaveLength(0);
    expect(stats.tokensByModel).toEqual({ m1: 10 });

    localStorage.setItem(USAGE_KEY, 'not json at all');
    expect(loadUsageStats().callsByModel).toEqual({});
    localStorage.setItem(USAGE_KEY, JSON.stringify([]));
    expect(loadUsageStats().callsByModel).toEqual({});
  });
});

describe('clearAllSchemas', () => {
  it('wipes local history', () => {
    saveSchemaToHistory(makeSchema());
    clearAllSchemas();
    expect(loadSavedSchemas()).toHaveLength(0);
  });
});

describe('study prefs (save preferences subtly)', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadStudyPrefs()).toEqual(DEFAULT_STUDY_PREFS);
  });

  it('remembers tab, mode, strictness and toggles across sessions', () => {
    saveStudyPrefs({ activeTab: 'youtube', encodingMode: 'memorization', strictnessLevel: 'viva' });
    saveStudyPrefs({ enableDeepResearch: false, enableGuidedPath: true });
    const prefs = loadStudyPrefs();
    expect(prefs.activeTab).toBe('youtube');
    expect(prefs.encodingMode).toBe('memorization');
    expect(prefs.strictnessLevel).toBe('viva');
    expect(prefs.enableDeepResearch).toBe(false);
    expect(prefs.enableGuidedPath).toBe(true);
  });

  it('rejects invalid values back to defaults', () => {
    localStorage.setItem('deepencode_study_prefs_v1', JSON.stringify({
      activeTab: 'carrier-pigeon', encodingMode: 'vibes', strictnessLevel: 'drill-sergeant',
    }));
    const prefs = loadStudyPrefs();
    expect(prefs.activeTab).toBe(DEFAULT_STUDY_PREFS.activeTab);
    expect(prefs.encodingMode).toBe(DEFAULT_STUDY_PREFS.encodingMode);
    expect(prefs.strictnessLevel).toBe(DEFAULT_STUDY_PREFS.strictnessLevel);
  });

  it('persists hidden templates', () => {
    saveStudyPrefs({ hiddenTemplates: ['memory_palace', 'mnemonic_peg'] });
    expect(loadStudyPrefs().hiddenTemplates).toEqual(['memory_palace', 'mnemonic_peg']);
  });
});

describe('topic struggles (what is hard for me)', () => {
  it('starts empty and records stages whose mechanism is still open', () => {
    expect(loadTopicStruggles()).toEqual([]);
    recordTopicResult({ topic: 'Action Potentials', lastSecured: false, checkCount: 3 });
    const list = loadTopicStruggles();
    expect(list).toHaveLength(1);
    expect(list[0].topic).toBe('Action Potentials');
    expect(list[0].lastSecured).toBe(false);
  });

  it('clears a topic once the mechanism lands', () => {
    recordTopicResult({ topic: 'Mitochondria', lastSecured: false, checkCount: 2 });
    expect(loadTopicStruggles()).toHaveLength(1);
    recordTopicResult({ topic: 'Mitochondria', lastSecured: true, checkCount: 3 });
    expect(loadTopicStruggles()).toEqual([]);
  });

  it('clears the whole ledger', () => {
    recordTopicResult({ topic: 'X', lastSecured: false, checkCount: 1 });
    clearTopicStruggles();
    expect(loadTopicStruggles()).toEqual([]);
  });
});
