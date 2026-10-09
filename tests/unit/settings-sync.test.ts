// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mergeCloudSettings,
  nextSettingsStamp,
  readSettingsStamp,
  shouldApplyCloudSettings,
} from '@/lib/settings-sync';
import { loadAISettings, saveAISettings } from '@/lib/storage';

/**
 * The cloud settings guard (defect 36).
 *
 * The account's `settingsBackup` is applied over this device's settings on
 * sign-in, and the whole point of the `savedAt` comparison is to stop an old
 * account copy from undoing a deliberate local choice. The defect was that two
 * of the four write paths (reset, and the backup restore) left the field at 0,
 * which reads as "older than everything" - so the learner who cleared their API
 * key got it back on the next sign-in, and a restored file was overridden.
 *
 * These tests pin the three rules that close it, in both directions, and then
 * the two failure modes end to end through the real storage layer.
 */

const SETTINGS_KEY = 'deepencode_ai_settings_v2';
const ANCIENT = Date.parse('2025-06-01T00:00:00Z');

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('readSettingsStamp', () => {
  it('reads a positive finite stamp', () => {
    expect(readSettingsStamp({ savedAt: 1234 })).toBe(1234);
  });

  it('treats everything else as no stamp at all', () => {
    // `0` is the specific value the defect produced, and it must mean "no age"
    // rather than "older than every real write" - there is nothing to compare.
    for (const value of [0, -1, NaN, Infinity, -Infinity, '1234', null, undefined, true]) {
      expect(readSettingsStamp({ savedAt: value })).toBeNull();
    }
    expect(readSettingsStamp({})).toBeNull();
    expect(readSettingsStamp(null)).toBeNull();
    expect(readSettingsStamp('a string')).toBeNull();
    expect(readSettingsStamp(42)).toBeNull();
  });
});

describe('nextSettingsStamp', () => {
  it('prefers an explicit stamp, which is how the cloud restore keeps the content age', () => {
    expect(nextSettingsStamp({ savedAt: 500 }, 900)).toBe(900);
  });

  it('keeps the record’s own stamp when the caller does not supply one', () => {
    expect(nextSettingsStamp({ savedAt: 500 })).toBe(500);
  });

  it('stamps now for a writer that carries neither', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));

    expect(nextSettingsStamp({ provider: 'gemini' })).toBe(Date.parse('2026-10-09T12:00:00Z'));
  });

  it('ignores an unusable explicit stamp instead of trusting it', () => {
    expect(nextSettingsStamp({ savedAt: 500 }, 0)).toBe(500);
    expect(nextSettingsStamp({ savedAt: 500 }, NaN)).toBe(500);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    expect(nextSettingsStamp({}, 'nonsense')).toBe(Date.parse('2026-10-09T12:00:00Z'));
  });
});

describe('shouldApplyCloudSettings', () => {
  const local = { savedAt: 1000 };
  const backup = { settings: { provider: 'openai' }, savedAt: 2000 };

  it('applies a newer backup', () => {
    expect(shouldApplyCloudSettings(local, backup)).toBe(true);
  });

  it('does not apply an older backup', () => {
    expect(shouldApplyCloudSettings({ savedAt: 3000 }, backup)).toBe(false);
  });

  it('settles a tie on the account copy, so two devices converge instead of ping-ponging', () => {
    expect(shouldApplyCloudSettings({ savedAt: 2000 }, backup)).toBe(true);
  });

  it('never applies a backup whose age cannot be read', () => {
    // The old guard accepted any truthy `savedAt`, including a string or
    // `Infinity`; a record that cannot be shown to be newer must not overwrite
    // local work.
    for (const savedAt of [undefined, null, 0, -5, NaN, Infinity, '9999']) {
      expect(shouldApplyCloudSettings(local, { settings: {}, savedAt })).toBe(false);
    }
  });

  it('applies over a local record with no stamp - the wiped profile this exists for', () => {
    expect(shouldApplyCloudSettings({ provider: 'gemini' }, backup)).toBe(true);
    expect(shouldApplyCloudSettings(null, backup)).toBe(true);
  });
});

describe('mergeCloudSettings', () => {
  it('takes the backup settings, keeps local fields the backup never had, and keeps its age', () => {
    const merged = mergeCloudSettings(
      { provider: 'gemini', geminiModel: 'gemini-3.7-flash' },
      { settings: { provider: 'openai', openaiApiKey: 'sk-1' }, savedAt: 2000 }
    );

    expect(merged.provider).toBe('openai');
    expect(merged.openaiApiKey).toBe('sk-1');
    expect(merged.geminiModel).toBe('gemini-3.7-flash');
    // The content's own age, not "now": stamping it now would make this device
    // permanently newer than every later edit made on another device.
    expect(merged.savedAt).toBe(2000);
  });

  it('falls back to the current record when the backup carries no settings body', () => {
    const merged = mergeCloudSettings({ provider: 'gemini', savedAt: 700 }, { savedAt: 2000 });
    expect(merged.provider).toBe('gemini');
    expect(merged.savedAt).toBe(2000);
  });
});

describe('the defect, end to end through the storage layer', () => {
  it('a reset written by a path that forgets to stamp still outranks an older account backup', () => {
    const accountBackup = {
      settings: { provider: 'openai', openaiApiKey: 'sk-the-key-they-cleared' },
      savedAt: ANCIENT,
    };

    // The reset path: defaults, written without a stamp.
    saveAISettings({ provider: 'gemini' });

    const local = loadAISettings();
    expect(local.savedAt).toBeGreaterThan(ANCIENT);
    expect(shouldApplyCloudSettings(local, accountBackup)).toBe(false);
    // And the key the learner cleared is not coming back.
    expect(local.geminiApiKey).toBeUndefined();
  });

  it('a backup restored from a file outranks an older account backup, even though the file is old', () => {
    saveAISettings({ provider: 'openai', openaiApiKey: 'sk-restored' }, Date.now());

    const local = loadAISettings();
    expect(shouldApplyCloudSettings(local, { settings: { provider: 'gemini' }, savedAt: ANCIENT })).toBe(false);
  });

  it('a pre-fix record with no stamp at all still accepts the account copy', () => {
    // Written before this round: no stamp anywhere, so there is no local age to
    // defend. The restore is the only surviving copy of their settings.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider: 'gemini' }));

    const local = loadAISettings();
    expect(readSettingsStamp(local)).toBeNull();
    expect(shouldApplyCloudSettings(local, { settings: { provider: 'openai' }, savedAt: ANCIENT })).toBe(true);
  });
});
