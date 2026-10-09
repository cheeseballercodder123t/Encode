import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildBackup,
  buildShareSchemaFile,
  parseBackupFile,
  restoreBackup,
  shareFileSlug,
  type BackupFile,
} from '../../lib/backup';
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

  it('a single-schema share file restores the deck and leaves the receiver alone', () => {
    // The fallback for a schema whose link would be too long to paste: it has to
    // arrive through this same restore path, and it must not carry - or clobber -
    // anything of the receiver's own.
    store.set(SETTINGS_KEY, JSON.stringify({ provider: 'openai', openaiApiKey: 'receiver-key' }));
    store.set('deepencode_study_prefs_v1', JSON.stringify({ activeTab: 'youtube' }));

    const shared = schema('shared-from-a-classmate');
    const file = buildShareSchemaFile(shared);
    expect(file.app).toBe('deepencode');
    expect(file.schemas).toEqual([shared]);
    // Deliberately absent, not empty: an empty object here would overwrite the
    // receiver's settings with nothing.
    expect('settings' in file).toBe(false);
    expect('extras' in file).toBe(false);

    const parsed = parseBackupFile(JSON.stringify(file));
    const report = restoreBackup(parsed);
    expect(report.schemasRestored).toBe(1);
    expect(report.settingsRestored).toBe(false);
    expect(report.prefsRestored).toBe(false);
    expect(report.extrasRestored).toBe(0);

    const after = JSON.parse(store.get('deepencode_saved_schemas_v2') || '[]');
    expect(after.map((s: SavedSchema) => s.id)).toEqual([shared.id]);
    expect(JSON.parse(store.get(SETTINGS_KEY)!).openaiApiKey).toBe('receiver-key');
    expect(JSON.parse(store.get('deepencode_study_prefs_v1')!).activeTab).toBe('youtube');
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

  it('stamps a restored settings file now, not with the age of the file', () => {
    // Defect 36: the restore used to write the file's own `savedAt` straight
    // through. A file exported months ago then carried a months-old stamp, so the
    // account's older copy outranked the restore the learner had just performed
    // and undid it on the next sign-in. The learner chose this content today.
    const fileAge = Date.parse('2025-06-01T00:00:00Z');

    const report = restoreBackup({
      app: 'deepencode',
      settings: { provider: 'openai', openaiApiKey: 'sk-restored', savedAt: fileAge },
    });

    expect(report.settingsRestored).toBe(true);
    const stored = JSON.parse(store.get(SETTINGS_KEY)!);
    expect(stored.provider).toBe('openai');
    expect(stored.openaiApiKey).toBe('sk-restored');
    expect(stored.savedAt).toBeGreaterThan(fileAge);
    expect(stored.savedAt).toBeGreaterThan(Date.now() - 60_000);
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

  it('round-trips the engineering patch registry and the friction log', () => {
    // Both stores are accumulated over weeks by feature modules, and neither is
    // derivable from anything else in the file: a restore that drops them hands
    // back the learner's material while forgetting their own defect history and
    // their clean-win streak. They are named here rather than only inside
    // EXTRA_KEYS so a rename in either feature module breaks this test.
    const patches = [
      {
        id: 'p1',
        topic: 'Thermochemistry',
        kind: 'SIGN_FLIP',
        statement: 'anchor the convention before the arithmetic',
        arithmeticReveal: '0.0336 ÷ −0.0336 = −1.00',
        hits: 3,
        firstSeenAt: 1,
        lastSeenAt: 2,
        learnerValue: 0.0336,
        expectedValue: -0.0336,
      },
    ];
    const friction = [{ topic: 'Thermochemistry', secured: false, rungsUsed: 2, at: 3 }];
    store.set('deepencode_mr_m_patches_v1', JSON.stringify(patches));
    store.set('deepencode_friction_log_v1', JSON.stringify(friction));

    const backup = buildBackup();
    expect(backup.extras['deepencode_mr_m_patches_v1']).toEqual(patches);
    expect(backup.extras['deepencode_friction_log_v1']).toEqual(friction);

    store.clear();
    expect(store.has('deepencode_mr_m_patches_v1')).toBe(false);
    expect(store.has('deepencode_friction_log_v1')).toBe(false);

    const report = restoreBackup(backup);
    expect(report.extrasRestored).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(store.get('deepencode_mr_m_patches_v1')!)).toEqual(patches);
    expect(JSON.parse(store.get('deepencode_friction_log_v1')!)).toEqual(friction);
  });

  it('returns an empty report for non-object input', () => {
    expect(restoreBackup(null).schemasRestored).toBe(0);
    expect(restoreBackup('nope').schemasRestored).toBe(0);
  });
});
