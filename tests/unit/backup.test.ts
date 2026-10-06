import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildBackup, parseBackupFile, restoreBackup, type BackupFile } from '../../lib/backup';
import { invalidateSchemaCache } from '../../lib/storage';
import type { SavedSchema } from '../../lib/types';

// jsdom-less storage harness: the backup/storage modules touch both the
// global `localStorage` (lib/storage) and `window.localStorage` (lib/backup),
// so both facades are backed by the same map.
const store = new Map<string, string>();

function mockStorage() {
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', {
    localStorage,
    document: {
      createElement: () => ({ click: () => {}, remove: () => {}, set href(_v: string) {}, set download(_v: string) {} }),
      body: { appendChild: () => {}, removeChild: () => {} },
    },
  });
}

function schema(id: string, overrides: Partial<SavedSchema> = {}): SavedSchema {
  return {
    id,
    timestamp: 1_700_000_000_000,
    topicSummary: `Topic ${id}`,
    mode: 'conceptual',
    xpEarned: 0,
    activities: [],
    userResponses: {},
    ...overrides,
  } as SavedSchema;
}

const SETTINGS_KEY = 'deepencode_ai_settings_v2';

describe('buildBackup', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
    store.set(SETTINGS_KEY, JSON.stringify({ provider: 'gemini', geminiApiKey: 'k' }));
  });

  it('carries the app marker, version, schemas and settings', () => {
    store.set('deepencode_saved_schemas_v2', JSON.stringify([schema('a')]));
    const backup = buildBackup();
    expect(backup.app).toBe('deepencode');
    expect(backup.version).toBe(1);
    expect(backup.schemas).toHaveLength(1);
    expect((backup.settings as { provider?: string }).provider).toBe('gemini');
    expect(typeof backup.exportedAt).toBe('string');
  });

  it('collects extras that exist and skips ones that do not', () => {
    store.set('deepencode_teach_lessons_v1', JSON.stringify([{ id: 'l1' }]));
    const backup = buildBackup();
    expect(backup.extras['deepencode_teach_lessons_v1']).toEqual([{ id: 'l1' }]);
    expect(backup.extras['deepencode_forge_recipes_v1']).toBeUndefined();
  });
});

describe('parseBackupFile', () => {
  it('accepts a well-formed backup', () => {
    const file = parseBackupFile(JSON.stringify(buildBackup()));
    expect(file.app).toBe('deepencode');
  });

  it('rejects non-JSON with a user-safe message', () => {
    expect(() => parseBackupFile('not json {')).toThrow('not valid JSON');
  });

  it('rejects files without the app marker', () => {
    expect(() => parseBackupFile(JSON.stringify({ hello: 1 }))).toThrow(/not a DeepEncode backup/);
  });

  it('rejects newer format versions', () => {
    const future = { app: 'deepencode', version: 99 };
    expect(() => parseBackupFile(JSON.stringify(future))).toThrow(/format v99/);
  });
});

describe('restoreBackup', () => {
  beforeEach(() => {
    store.clear();
    mockStorage();
    // loadSavedSchemas memoizes; each test seeds a fresh store, so the cache
    // must be dropped or the first test's snapshot leaks into the next.
    invalidateSchemaCache();
  });

  it('restores schemas that are not already present', () => {
    store.set('deepencode_saved_schemas_v2', JSON.stringify([schema('kept')]));
    const backup: Partial<BackupFile> = {
      app: 'deepencode',
      schemas: [schema('kept'), schema('new-1'), schema('new-2')],
    };
    const report = restoreBackup(backup);
    expect(report.schemasRestored).toBe(2);
    expect(report.schemasSkipped).toBe(1);
    const after = JSON.parse(store.get('deepencode_saved_schemas_v2') || '[]');
    expect(after.map((s: SavedSchema) => s.id).sort()).toEqual(['kept', 'new-1', 'new-2']);
  });

  it('skips malformed schema entries instead of failing', () => {
    const backup: Partial<BackupFile> = {
      app: 'deepencode',
      // Deliberately malformed entries ride in as unknown via JSON-shaped data.
      schemas: [{ id: 'bad' }, 'nonsense', null, schema('good')] as unknown as SavedSchema[],
    };
    const report = restoreBackup(backup);
    expect(report.schemasRestored).toBe(1);
    expect(report.schemasSkipped).toBe(3);
  });

  it('rejects foreign backups entirely', () => {
    const report = restoreBackup({ app: 'something-else', schemas: [schema('x')] });
    expect(report.schemasRestored).toBe(0);
  });

  it('restores settings only when the shape is plausible', () => {
    const good = restoreBackup({ app: 'deepencode', settings: { provider: 'openai' } });
    expect(good.settingsRestored).toBe(true);
    expect(JSON.parse(store.get(SETTINGS_KEY)!).provider).toBe('openai');

    store.set(SETTINGS_KEY, JSON.stringify({ provider: 'gemini' }));
    const bad = restoreBackup({ app: 'deepencode', settings: { provider: 42 } });
    expect(bad.settingsRestored).toBe(false);
    expect(JSON.parse(store.get(SETTINGS_KEY)!).provider).toBe('gemini');
  });

  it('restores known extras and ignores unknown keys', () => {
    const report = restoreBackup({
      app: 'deepencode',
      extras: {
        deepencode_teach_lessons_v1: [{ id: 'l1' }],
        'malicious_key': { nope: true },
      },
    });
    expect(report.extrasRestored).toBe(1);
    expect(store.has('deepencode_teach_lessons_v1')).toBe(true);
    expect(store.has('malicious_key')).toBe(false);
  });

  it('returns an empty report for non-object input', () => {
    expect(restoreBackup(null).schemasRestored).toBe(0);
    expect(restoreBackup('nope').schemasRestored).toBe(0);
  });
});
