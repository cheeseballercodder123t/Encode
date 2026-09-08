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
} from '@/lib/storage';
import { makeSchema } from './fixtures';

// happy-dom has no IndexedDB; silence the expected fallback warnings from lib/db.ts
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  localStorage.clear();
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
    const raw = JSON.parse(localStorage.getItem('deepencode_usage_stats_v1')!);
    raw.date = 'Mon Jan 01 2001';
    localStorage.setItem('deepencode_usage_stats_v1', JSON.stringify(raw));

    const stats = loadUsageStats();
    expect(stats.callsByModel['m1']).toBeUndefined();
    // weekly counters survive the daily reset
    expect(stats.weeklyCallsByModel['m1']).toBe(1);
  });
});

describe('clearAllSchemas', () => {
  it('wipes local history', () => {
    saveSchemaToHistory(makeSchema());
    clearAllSchemas();
    expect(loadSavedSchemas()).toHaveLength(0);
  });
});
