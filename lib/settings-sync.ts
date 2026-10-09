import type { AISettings } from './types';

/**
 * The settings record's own age, and the one decision that reads it (defect 36).
 *
 * `AISettings` is mirrored into the user's Firestore document, and on sign-in the
 * account's copy is meant to restore a cleared browser profile - but only when it
 * is *newer* than what this device holds. "Newer" is `savedAt`, and the field was
 * written by the caller: `handleSave` stamped it, `handleImportFile` stamped it,
 * and the reset and the backup-restore paths did not. A missing stamp is not
 * neutral - it reads as `0`, i.e. "older than everything" - so after a deliberate
 * reset the account's copy, however old, was applied over it, and a cleared API
 * key came back on the next sign-in. The guard itself was the only reader of a
 * field that four writers were each responsible for remembering.
 *
 * Three rules close that class of bug, and they live here so they can be read and
 * tested in one place rather than inferred from four call sites:
 *
 *   1. Every write stamps (`nextSettingsStamp`), which is why the stamping now
 *      happens inside `saveAISettings` - the single writer - instead of at each
 *      call site.
 *   2. A stamp is only usable when it is a finite positive number; `0`, `NaN`, a
 *      string or a missing field all mean "no age to compare".
 *   3. The account's copy wins only when its stamp is usable *and* at least as
 *      new as the device's. A record whose age cannot be read is never shown to
 *      be newer - it is not applied.
 */

/** A usable timestamp: finite and positive. Everything else means "no stamp". */
function usableStamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** The stamp a record carries, or null when it carries no usable one. */
export function readSettingsStamp(record: unknown): number | null {
  if (record === null || typeof record !== 'object') return null;
  return usableStamp((record as { savedAt?: unknown }).savedAt);
}

/**
 * The stamp a settings record should be written with.
 *
 * An explicit stamp wins - that is how the cloud-restore path preserves the
 * *content's* age (the account's copy is from a particular moment, and stamping
 * it "now" would make this device permanently newer than every later backup from
 * another device, so a genuinely newer edit could never arrive). Otherwise the
 * record's own stamp is kept, and otherwise it is stamped now.
 */
export function nextSettingsStamp(record: unknown, explicit?: unknown): number {
  return usableStamp(explicit) ?? readSettingsStamp(record) ?? Date.now();
}

/**
 * Should the account's backup replace this device's settings?
 *
 * - No usable backup stamp: **no**. There is no age to compare, and a record that
 *   cannot be shown to be newer must not overwrite local work - the old guard
 *   accepted any truthy value here, including a string or `Infinity`.
 * - No usable local stamp: **yes**. This is the wiped-profile case the restore
 *   exists for, and since every writer now stamps it means a pre-fix record
 *   (written before this round) rather than a fresh local state.
 * - Otherwise: the backup wins when it is **at least as new**, so two devices
 *   holding the same write settle on the same content instead of ping-ponging.
 */
export function shouldApplyCloudSettings(local: unknown, backup: unknown): boolean {
  const backupAt = readSettingsStamp(backup);
  if (backupAt === null) return false;
  const localAt = readSettingsStamp(local);
  if (localAt === null) return true;
  return backupAt >= localAt;
}

/**
 * The record to save when the account's copy wins: its settings over this
 * device's, stamped with the backup's own age (see `nextSettingsStamp`).
 */
export function mergeCloudSettings(current: AISettings, backup: unknown): AISettings {
  const source = (backup ?? {}) as { settings?: unknown; savedAt?: unknown };
  const settings =
    source.settings && typeof source.settings === 'object'
      ? (source.settings as Partial<AISettings>)
      : {};
  return { ...current, ...settings, savedAt: nextSettingsStamp(current, source.savedAt) };
}
