/**
 * Full-data backup: one-click export and restore of everything the learner
 * has accumulated — encoded sessions, settings, study prefs, deck memory,
 * saved lessons, forge recipes, usage stats and the struggle ledger.
 *
 * The tool's whole value is accumulated study state, and it lives in the
 * browser (IndexedDB + localStorage). A single JSON file that round-trips is
 * both a migration path and a trust feature: nothing the learner builds is
 * locked inside this browser profile.
 *
 * Import is defensive: entries are validated one by one, malformed ones are
 * skipped and reported, so a corrupted or hand-edited backup restores the
 * good parts instead of failing wholesale.
 */

import type { SavedSchema } from './types';
import {
  loadAISettings,
  loadSavedSchemas,
  loadStudyPrefs,
  loadUsageStats,
  loadTopicStruggles,
  saveAISettings,
  saveStudyPrefs,
  saveSchemaToHistory,
} from './storage';

const BACKUP_VERSION = 1;

export interface BackupFile {
  app: 'deepencode';
  /** Backup format version — bumped when the shape changes. */
  version: number;
  exportedAt: string;
  schemas: SavedSchema[];
  settings: unknown;
  studyPrefs: unknown;
  usageStats: unknown;
  topicStruggles: unknown[];
  /** Named localStorage mirrors kept by feature modules. */
  extras: Record<string, unknown>;
}

/** localStorage keys owned by feature modules (deck memory, lessons, recipes…). */
const EXTRA_KEYS = [
  'deepencode_deck_memory_v1',
  'deepencode_deck_sources_v1',
  'deepencode_teach_lessons_v1',
  'deepencode_forge_recipes_v1',
  'deepencode_chapter_progress_v1',
  'deepencode_toy_progress_v1',
  'deepencode_session_meta_v1',
  'deepencode_interference_traps_v1',
  'deepencode_sm2_manifest',
  'deepencode_mr_m_paradox_v1',
] as const;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readKey(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function readArrayKey(key: string): unknown[] {
  const value = readKey(key);
  return Array.isArray(value) ? value : [];
}

/** Collects every durable surface into one plain object. */
export function buildBackup(): BackupFile {
  const extras: Record<string, unknown> = {};
  for (const key of EXTRA_KEYS) {
    const value = readKey(key);
    if (value !== undefined) extras[key] = value;
  }
  return {
    app: 'deepencode',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    schemas: loadSavedSchemas(),
    settings: readKey('deepencode_ai_settings_v2') ?? loadAISettings(),
    studyPrefs: readKey('deepencode_study_prefs_v1') ?? loadStudyPrefs(),
    usageStats: readKey('deepencode_usage_stats_v1') ?? loadUsageStats(),
    topicStruggles: loadTopicStruggles(),
    extras,
  };
}

const JSON_MIME = 'application/json';

/** Downloads the backup as a timestamped file. Returns the filename. */
export function downloadBackup(backup: BackupFile): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `deepencode-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: JSON_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return filename;
}

export interface RestoreReport {
  schemasRestored: number;
  schemasSkipped: number;
  extrasRestored: number;
  settingsRestored: boolean;
  prefsRestored: boolean;
}

function looksLikeSchema(value: unknown): value is SavedSchema {
  const s = value as SavedSchema | null;
  return Boolean(
    s &&
      typeof s === 'object' &&
      typeof s.id === 'string' &&
      s.id.length > 0 &&
      typeof s.timestamp === 'number' &&
      Array.isArray(s.activities)
  );
}

function looksLikeSettings(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const provider = (value as { provider?: unknown }).provider;
  return provider === undefined || ['gemini', 'openrouter', 'openai'].includes(provider as string);
}

/**
 * Restores a backup over current state. Existing entries win on id collision
 * (import fills gaps; it does not clobber newer local work). Returns counts
 * so the UI can show exactly what happened.
 */
export function restoreBackup(file: unknown): RestoreReport {
  const report: RestoreReport = {
    schemasRestored: 0,
    schemasSkipped: 0,
    extrasRestored: 0,
    settingsRestored: false,
    prefsRestored: false,
  };
  if (!file || typeof file !== 'object') return report;
  const backup = file as Partial<BackupFile>;

  if (backup.app !== 'deepencode') return report;

  if (Array.isArray(backup.schemas)) {
    const existing = new Set(loadSavedSchemas().map((s) => s.id));
    for (const entry of backup.schemas) {
      if (!looksLikeSchema(entry) || existing.has(entry.id)) {
        report.schemasSkipped++;
        continue;
      }
      saveSchemaToHistory(entry);
      existing.add(entry.id);
      report.schemasRestored++;
    }
  }

  if (looksLikeSettings(backup.settings)) {
    saveAISettings(backup.settings as Record<string, never> as never);
    report.settingsRestored = true;
  }
  if (backup.studyPrefs && typeof backup.studyPrefs === 'object' && !Array.isArray(backup.studyPrefs)) {
    saveStudyPrefs(backup.studyPrefs as Record<string, never>);
    report.prefsRestored = true;
  }
  if (backup.usageStats && typeof backup.usageStats === 'object') {
    writeRawKey('deepencode_usage_stats_v1', backup.usageStats);
    report.extrasRestored++;
  }
  if (Array.isArray(backup.topicStruggles) && backup.topicStruggles.length > 0) {
    writeRawKey('deepencode_topic_struggles_v1', backup.topicStruggles);
    report.extrasRestored++;
  }
  if (backup.extras && typeof backup.extras === 'object') {
    for (const [key, value] of Object.entries(backup.extras)) {
      if (!EXTRA_KEYS.includes(key as (typeof EXTRA_KEYS)[number])) continue;
      if (value === null || typeof value !== 'object') continue;
      writeRawKey(key, value);
      report.extrasRestored++;
    }
  }
  return report;
}

function writeRawKey(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: skip silently, the report shows the count.
  }
}

/** Parses a user-selected backup file. Throws a user-safe Error when unreadable. */
export function parseBackupFile(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = parsed as Partial<BackupFile>;
  if (!file || typeof file !== 'object' || file.app !== 'deepencode') {
    throw new Error('That file is not a DeepEncode backup (missing app marker).');
  }
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error(`That backup uses format v${file.version}; this app understands v${BACKUP_VERSION} and older.`);
  }
  return file as BackupFile;
}
