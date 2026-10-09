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

import type { AISettings, SavedSchema } from './types';
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
  // The two stores a restore used to wipe in silence: the engineering patch
  // registry (the standing defects a stage is pre-flighted against, keyed in
  // `lib/mr-m/ledger.ts`) and the ZPD friction log (the clean-win streak and
  // the attempts behind it, keyed in `lib/escalation/governor.ts`). Both are
  // accumulated over weeks, and neither is reconstructible from anything else
  // in the file — a backup without them restores a learner's material and
  // forgets what they had learned about their own mistakes.
  'deepencode_mr_m_patches_v1',
  'deepencode_friction_log_v1',
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

/**
 * One schema, in a file the restore path already understands.
 *
 * This is the handover for a schema whose link would be too long to paste: the
 * classmate opens the app, uses `[ RESTORE BACKUP ]` in the analytics sheet, and
 * gets the deck in their library. Deliberately NOT a full `BackupFile`: every
 * other field is omitted so `restoreBackup` skips it and the receiver's own
 * settings, prefs, stats and ledger are left exactly as they are.
 */
export interface ShareSchemaFile {
  app: 'deepencode';
  version: number;
  exportedAt: string;
  schemas: SavedSchema[];
}

/** Wraps one schema in the restorable share format. */
export function buildShareSchemaFile(schema: SavedSchema): ShareSchemaFile {
  return {
    app: 'deepencode',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    schemas: [schema],
  };
}

/** A filename-safe label for the file a share produces. */
export function shareFileSlug(schema: SavedSchema): string {
  const slug = (schema.topicSummary || 'schema')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'schema';
}

/**
 * Downloads a backup (or a single-schema share) as a file. Returns the
 * filename used.
 */
export function downloadBackup(backup: BackupFile | ShareSchemaFile, filename?: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = filename || `deepencode-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: JSON_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return name;
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
    // Stamped NOW, deliberately, rather than inheriting the file's age (defect
    // 36): the learner chose this content on this device today, and a record that
    // claimed the file's old date would let an older account backup override the
    // restore on the very next sign-in - which is exactly how a deliberate
    // restore was being undone.
    saveAISettings(backup.settings as AISettings, Date.now());
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

/**
 * Parses a user-selected backup or share file. Throws a user-safe Error when
 * unreadable.
 *
 * Returns the parsed document as a `BackupFile` for the caller's convenience,
 * with the note that a single-schema share omits the optional halves by design
 * - `restoreBackup` reads each field defensively and restores what is there.
 */
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
