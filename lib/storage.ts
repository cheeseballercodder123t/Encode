import { AISettings, EncodingGear, EncodingMode, SavedSchema } from './types';
import { saveSchemaToIDB, deleteSchemaFromIDB, clearAllSchemasFromIDB, getAllSchemasFromIDB } from './db';

/**
 * How many schemas the localStorage mirror keeps. The mirror is the synchronous
 * half of the library (and the whole of it where IndexedDB is unavailable), so
 * this cap is shared with the IndexedDB module that also mirrors into the same
 * key - two writers disagreeing about the cap is how entries 21-50 were being
 * thrown away by an asynchronous write that thought it knew better.
 */
export const LOCAL_HISTORY_LIMIT = 50;

const STORAGE_KEYS = {
  SETTINGS: 'deepencode_ai_settings_v2',
  HISTORY: 'deepencode_saved_schemas_v2',
  STATS: 'deepencode_user_stats_v2',
  STUDY_PREFS: 'deepencode_study_prefs_v1',
};

// In-memory cache for synchronous read performance
const schemaCache = new Map<string, SavedSchema[]>();
let cacheInitialized = false;

// Debounce timer for autosaves
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'gemini',
  geminiModel: 'gemini-3.7-flash',
  geminiCheckerModel: 'gemini-3.5-flash-lite',
  openrouterModel: 'google/gemini-2.5-flash',
  openrouterCheckerModel: 'google/gemini-2.5-flash-lite',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  openaiCheckerModel: 'gpt-4o-mini',
};

export function loadAISettings(): AISettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.error('Failed to load AI settings', e);
    return DEFAULT_SETTINGS;
  }
}

export function saveAISettings(settings: AISettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save AI settings', e);
  }
}

// ─── Study preferences (persisted subtly: no re-configure every session) ────
// Remembers the learner's last-used input tab, encoding mode, strictness,
// and generation toggles so "paste notes and go" works on the next visit.

export type StudyPrefsInputTab = 'text' | 'file' | 'youtube';
export type StudyPrefsStrictness = 'sherpa' | 'feynman' | 'viva';

export interface StudyPrefs {
  activeTab: StudyPrefsInputTab;
  encodingMode: EncodingMode;
  strictnessLevel: StudyPrefsStrictness;
  enableDeepResearch: boolean;
  enableGuidedPath: boolean;
  /** How deep this session goes. Defaults to the middle gear. */
  gear: EncodingGear;
  /** Interleave toggle is intentionally NOT remembered: it re-routes the whole generation. */
  hiddenTemplates: string[];
  /**
   * Mr M mode: the first-principles overlay (coordinate system before
   * procedure, trap-aware autopsies, linear decomposition, what-if sliders).
   * Defaults ON — it is the learning style this tool was built around.
   */
  mrMMode: boolean;
}

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  activeTab: 'text',
  encodingMode: 'conceptual',
  strictnessLevel: 'feynman',
  enableDeepResearch: true,
  enableGuidedPath: false,
  gear: 2,
  hiddenTemplates: [],
  mrMMode: true,
};

export function loadStudyPrefs(): StudyPrefs {
  if (typeof window === 'undefined') return DEFAULT_STUDY_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STUDY_PREFS);
    if (!raw) return DEFAULT_STUDY_PREFS;
    const parsed = JSON.parse(raw);
    const prefs: StudyPrefs = {
      activeTab: ['text', 'file', 'youtube'].includes(parsed.activeTab) ? parsed.activeTab : DEFAULT_STUDY_PREFS.activeTab,
      encodingMode: ['conceptual', 'memorization'].includes(parsed.encodingMode) ? parsed.encodingMode : DEFAULT_STUDY_PREFS.encodingMode,
      strictnessLevel: ['sherpa', 'feynman', 'viva'].includes(parsed.strictnessLevel) ? parsed.strictnessLevel : DEFAULT_STUDY_PREFS.strictnessLevel,
      enableDeepResearch: typeof parsed.enableDeepResearch === 'boolean' ? parsed.enableDeepResearch : DEFAULT_STUDY_PREFS.enableDeepResearch,
      enableGuidedPath: typeof parsed.enableGuidedPath === 'boolean' ? parsed.enableGuidedPath : DEFAULT_STUDY_PREFS.enableGuidedPath,
      gear: [1, 2, 3].includes(parsed.gear) ? (parsed.gear as EncodingGear) : DEFAULT_STUDY_PREFS.gear,
      hiddenTemplates: Array.isArray(parsed.hiddenTemplates) ? parsed.hiddenTemplates.filter((t: unknown) => typeof t === 'string') : [],
      // Defaults ON for anything stored before the mode existed: an absent flag
      // is not the learner turning it off.
      mrMMode: typeof parsed.mrMMode === 'boolean' ? parsed.mrMMode : DEFAULT_STUDY_PREFS.mrMMode,
    };
    return prefs;
  } catch (e) {
    console.error('Failed to load study prefs', e);
    return DEFAULT_STUDY_PREFS;
  }
}

export function saveStudyPrefs(prefs: Partial<StudyPrefs>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadStudyPrefs();
    const merged: StudyPrefs = { ...current, ...prefs };
    localStorage.setItem(STORAGE_KEYS.STUDY_PREFS, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save study prefs', e);
  }
}

/**
 * A persisted schema, re-read field by field.
 *
 * A record on disk is untrusted input: it may have been written by an older
 * release (the one-time migration in `lib/db.ts` copies the legacy v1 store
 * verbatim), by a half-finished save, or by Firestore. `SavedSchema` declares
 * `topicSummary` as required, but a type is not a validator — every reader used
 * to `JSON.parse(...) as SavedSchema[]`, and the history drawer then filtered on
 * `s.topicSummary.toLowerCase()`. One legacy record therefore threw *during
 * render*, and with no error boundary above it React unmounted the whole tree:
 * the app answered with `Application error: a client-side exception has occurred`
 * and the learner's only exit was clearing site data, because "clear all" lives
 * inside the very drawer that crashed.
 *
 * The rule here is the one the rest of this codebase already uses for resume
 * records and lab snapshots: rebuild, do not trust. A record with no usable id
 * is not a record and is dropped (`null`); everything the app dereferences gets
 * a value of the right type, and every other key is carried through untouched
 * so a field this function has never heard of is never silently lost.
 */
export function coerceSavedSchema(value: unknown): SavedSchema | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !record.id) return null;

  const isObject = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const finite = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const topic = typeof record.topicSummary === 'string' ? record.topicSummary.trim() : '';

  return {
    ...record,
    id: record.id,
    timestamp: finite(record.timestamp) ?? 0,
    // An empty name is not a name, and it is certainly not a crash: an unnamed
    // record is still the learner's work, so it is listed under a usable label
    // rather than dropped.
    topicSummary: topic || 'Untitled topic',
    mode: record.mode === 'memorization' ? 'memorization' : 'conceptual',
    xpEarned: finite(record.xpEarned) ?? 0,
    activities: Array.isArray(record.activities) ? record.activities : [],
    userResponses: isObject(record.userResponses) ? record.userResponses : {},
    sourceFileName: typeof record.sourceFileName === 'string' ? record.sourceFileName : undefined,
    youtubeData: isObject(record.youtubeData) ? record.youtubeData : undefined,
    prerequisites: isObject(record.prerequisites) ? record.prerequisites : undefined,
    guidedModules: Array.isArray(record.guidedModules) ? record.guidedModules : undefined,
  } as SavedSchema;
}

/** Normalizes a persisted list, dropping entries that are not records at all. */
export function coerceSavedSchemas(value: unknown): SavedSchema[] {
  if (!Array.isArray(value)) return [];
  const out: SavedSchema[] = [];
  for (const entry of value) {
    const schema = coerceSavedSchema(entry);
    if (schema) out.push(schema);
  }
  return out;
}

/**
 * The list exactly as it is on disk, bypassing the in-memory cache.
 *
 * The cache exists for synchronous read performance, but it is a snapshot of
 * ONE tab's view: another tab writes the same key without this module knowing.
 * Every writer therefore rebuilds from this function rather than from
 * {@link loadSavedSchemas}, because a writer that trusts its own cache writes a
 * *stale* list - which is how one tab's save dropped another tab's schema, and
 * how a delete could resurrect a schema the other tab had already removed.
 */
function readSchemasFromStorage(): SavedSchema[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? coerceSavedSchemas(JSON.parse(raw)) : [];
  } catch (e) {
    console.error('Failed to read schemas history', e);
    return [];
  }
}

/**
 * Which side of a change a notification came from.
 *
 * `local` means THIS tab wrote the library, and the list handed over is the
 * state to render. `remote` means another tab did, so this one has to re-read
 * the stores instead of trusting the list it was already holding.
 */
export type SavedSchemasChangeOrigin = 'local' | 'remote';

/**
 * Everyone who wants to know when the library changes.
 *
 * The app's reader (`hooks/useSchemaLibrary`) subscribes, so a schema saved in
 * another tab appears in this tab's drawer without a reload - and, more
 * importantly, so this tab's next write is built on a list it knows is current.
 */
type SavedSchemasListener = (schemas: SavedSchema[], origin: SavedSchemasChangeOrigin) => void;
const savedSchemaListeners = new Set<SavedSchemasListener>();
let crossTabListenerBound = false;

function notifySavedSchemaListeners(schemas: SavedSchema[], origin: SavedSchemasChangeOrigin): void {
  for (const listener of [...savedSchemaListeners]) listener(schemas, origin);
}

/**
 * Binds the cross-tab `storage` listener once per document.
 *
 * `storage` fires in every OTHER tab that shares the origin, never in the tab
 * that wrote - which is exactly the signal this module needs, and why the event
 * is not just belt-and-braces: without it the cache of a tab that is already
 * open stays stale forever, because nothing else tells it the key changed.
 */
function ensureCrossTabListener(): void {
  if (crossTabListenerBound) return;
  // A `window` with no `addEventListener` is not a document that can deliver
  // events - non-DOM callers and unit harnesses stub a partial one - so this is
  // a capability check, not a swallowed failure: there is nothing to subscribe
  // on, and the flag stays unset so a real document still binds later.
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  crossTabListenerBound = true;
  window.addEventListener('storage', (event) => {
    // `key === null` is a whole-store clear; anything else outside the library
    // key is a different module's business.
    if (event.key !== null && event.key !== STORAGE_KEYS.HISTORY) return;
    invalidateSchemaCache();
    notifySavedSchemaListeners(readSchemasFromStorage(), 'remote');
  });
}

/**
 * Subscribes to the saved-schema list; returns the unsubscribe.
 *
 * Fires on a write from another tab (the list as it now stands on disk) and on
 * this tab's own writes (the list as written), so a subscriber never has to
 * guess which side of the change it is on.
 */
export function subscribeToSavedSchemas(listener: SavedSchemasListener): () => void {
  ensureCrossTabListener();
  savedSchemaListeners.add(listener);
  return () => {
    savedSchemaListeners.delete(listener);
  };
}

/**
 * The library as both stores hold it: the localStorage mirror, topped up by the
 * schemas only IndexedDB still has.
 *
 * IndexedDB keeps every schema while the mirror is capped at fifty, so the
 * fuller store is the one that can answer with a record the mirror has dropped.
 * It cannot simply win, though: it is written asynchronously AFTER the mirror,
 * so its list lags a save by a moment - whichever tab made it. Merging keeps
 * both properties: nothing the mirror holds is ever traded away for a
 * momentarily-shorter IndexedDB list, and nothing the mirror dropped is lost.
 */
export function mergeSchemaLists(
  local: SavedSchema[],
  fromIndexedDB: SavedSchema[]
): SavedSchema[] {
  if (fromIndexedDB.length === 0) return local;
  const known = new Set(local.map((s) => s.id));
  const extra = fromIndexedDB.filter((s) => !known.has(s.id));
  return extra.length === 0 ? local : [...local, ...extra];
}

export function loadSavedSchemas(): SavedSchema[] {
  if (typeof window === 'undefined') return [];

  // The first read in this document is what installs the cross-tab listener: a
  // tab that is holding the library in memory (or in this cache) is exactly the
  // one that has to hear about another tab's write.
  ensureCrossTabListener();

  // Return from cache if available and initialized
  if (cacheInitialized && schemaCache.has('schemas')) {
    return schemaCache.get('schemas') || [];
  }
  
  const parsed = readSchemasFromStorage();
  schemaCache.set('schemas', parsed);
  cacheInitialized = true;
  return parsed;
}

export function saveSchemaToHistory(schema: SavedSchema): SavedSchema[] {
  if (typeof window === 'undefined') return [];
  try {
    // Read from disk, not from the cache: another tab may have saved since this
    // one last looked, and rebuilding the list from a stale cache is what
    // dropped its schema.
    const current = readSchemasFromStorage();
    // Replace if existing with same id, else prepend
    const existingIndex = current.findIndex(s => s.id === schema.id);
    let updated: SavedSchema[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = schema;
    } else {
      updated = [schema, ...current];
    }
    // Cap local localStorage history at 50, but IndexedDB stores all
    const capped = updated.slice(0, LOCAL_HISTORY_LIMIT);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(capped));
    
    // The id is alive again: drop any deletion tombstone standing against it.
    forgetSchemaDeletion(schema.id);

    // Update cache and tell everyone else in this tab (the `storage` event only
    // reaches other tabs).
    schemaCache.set('schemas', capped);
    cacheInitialized = true;
    notifySavedSchemaListeners(capped, 'local');
    
    // Asynchronously persist to IndexedDB
    saveSchemaToIDB(schema).catch(e => console.warn('IDB write failed:', e));
    
    return capped;
  } catch (e) {
    console.error('Failed to save schema to localStorage, keeping in-memory state', e);
    return schemaCache.get('schemas') || [schema];
  }
}

// Debounced autosave for performance during typing
export function debouncedSaveSchema(schema: SavedSchema, delay: number = 1000): void {
  if (typeof window === 'undefined') return;
  
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }
  
  autosaveTimer = setTimeout(() => {
    saveSchemaToHistory(schema);
    autosaveTimer = null;
  }, delay);
}

export function deleteSchemaFromHistory(id: string): SavedSchema[] {
  if (typeof window === 'undefined') return [];
  try {
    // Fresh read for the same reason as the save: a delete computed from a
    // stale cache re-writes the schemas the cache believes in, resurrecting a
    // schema another tab already removed.
    const current = readSchemasFromStorage();
    const updated = current.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));

    // Remember the deletion before the async IndexedDB removal is attempted:
    // until that lands, the row is still there for anyone who reads the fuller
    // store, and without this it would be shown again as if nothing happened.
    rememberSchemaDeletion(id);
    
    // Update cache
    schemaCache.set('schemas', updated);
    cacheInitialized = true;
    notifySavedSchemaListeners(updated, 'local');
    
    deleteSchemaFromIDB(id).catch(e => console.warn('IDB delete failed:', e));
    return updated;
  } catch (e) {
    console.error('Failed to delete schema', e);
    return [];
  }
}

export function clearAllSchemas(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    // Everything is gone, so there is nothing left for a tombstone to protect
    // against: keeping them would only hide an id that is later re-imported.
    localStorage.removeItem(DELETIONS_KEY);
    
    // Clear cache
    schemaCache.delete('schemas');
    cacheInitialized = false;
    notifySavedSchemaListeners([], 'local');
    
    clearAllSchemasFromIDB().catch(e => console.warn('IDB clear failed:', e));
  } catch (e) {
    console.error('Failed to clear schemas', e);
  }
}

// Invalidate cache for external updates
export function invalidateSchemaCache(): void {
  schemaCache.delete('schemas');
  cacheInitialized = false;
}

// ─── Recent deletions, so IndexedDB cannot resurrect them ───────────────────
//
// The two stores disagree for a moment by design: the localStorage mirror is
// updated synchronously by the tab that deleted, while the IndexedDB row is
// removed by a fire-and-forget call. A reader that arrives inside that window -
// another tab, or a fresh page load - used to see the deleted schema again,
// because IndexedDB is the fuller store and any reader that consults it answers
// from the row that has not gone away yet.
//
// A tombstone is one id and one timestamp: it makes "deleted" survive the gap,
// and it expires so the ledger cannot grow without bound.

const DELETIONS_KEY = 'deepencode_schema_deletions_v1';
/** A deletion is remembered for a day: long enough for any pending IDB write. */
const DELETION_TTL_MS = 24 * 60 * 60 * 1000;
/** And only the newest few are kept, so the key stays tiny. */
const MAX_DELETIONS = 50;

type DeletionLedger = Record<string, number>;

function readDeletions(): DeletionLedger {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DELETIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: DeletionLedger = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDeletions(ledger: DeletionLedger): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const entries = Object.entries(ledger)
      .filter(([, at]) => now - at < DELETION_TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_DELETIONS);
    if (entries.length === 0) localStorage.removeItem(DELETIONS_KEY);
    else localStorage.setItem(DELETIONS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Best-effort: a full quota must not break the delete itself.
  }
}

/**
 * The ids deleted recently enough that a stale copy of them must not be shown.
 *
 * Read by the IndexedDB path, which is the one place a deleted schema can come
 * back from.
 */
export function deletedSchemaIds(now: number = Date.now()): Set<string> {
  const ledger = readDeletions();
  return new Set(Object.entries(ledger).filter(([, at]) => now - at < DELETION_TTL_MS).map(([id]) => id));
}

function rememberSchemaDeletion(id: string): void {
  const ledger = readDeletions();
  ledger[id] = Date.now();
  writeDeletions(ledger);
}

/** Re-saving an id that was deleted in another tab makes it alive again. */
function forgetSchemaDeletion(id: string): void {
  const ledger = readDeletions();
  if (!(id in ledger)) return;
  delete ledger[id];
  writeDeletions(ledger);
}

// ─── "What's hard for me": per-topic struggle ledger ─────────────────────────
// Records topics whose mechanism is still open, plus repeated checks, so the
// tool can surface weak areas and warn the learner before a re-test. Personal,
// local-only, one entry per topic (latest result wins).

const STRUGGLE_KEY = 'deepencode_topic_struggles_v1';

export interface TopicStruggle {
  topic: string;
  templateType?: string;
  /** True when the last check landed the mechanism. There is no grade. */
  lastSecured: boolean;
  checkCount: number;
  updatedAt: number;
}

export function loadTopicStruggles(): TopicStruggle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STRUGGLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(s => s && typeof s.topic === 'string') : [];
  } catch {
    return [];
  }
}

/** Record one checked stage. Landing the mechanism clears the topic. */
export function recordTopicResult(entry: Omit<TopicStruggle, 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadTopicStruggles().filter(
      s => s.topic.toLowerCase() !== entry.topic.toLowerCase()
    );
    if (!entry.lastSecured) {
      current.unshift({ ...entry, updatedAt: Date.now() });
    }
    // A landed mechanism clears the topic from the struggle list.
    localStorage.setItem(STRUGGLE_KEY, JSON.stringify(current.slice(0, 30)));
  } catch (e) {
    console.error('Failed to record topic result', e);
  }
}

export function clearTopicStruggles(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STRUGGLE_KEY);
  } catch { /* non-fatal */ }
}

// ─── The usage ledger ───────────────────────────────────────────────────────
//
// One record answers three questions with three different periods: how many
// calls today, how many this week, and what the whole hobby has cost in tokens
// and dollars. Each period has to roll on its own, and a roll may only touch
// the period that owns it - the lifetime ledgers are what the dashboard reports
// as LIFETIME and what a backup carries, so rebuilding the record from the
// fields a roll happens to write is how they were being deleted.

const USAGE_KEY = 'deepencode_usage_stats_v1';

export interface UsageStats {
  /** The local day `callsByModel` counts. */
  date: string;
  /** The local Monday `weeklyCallsByModel` counts, as yyyy-mm-dd. */
  weekStart?: string;
  callsByModel: Record<string, number>;
  weeklyCallsByModel: Record<string, number>;
  /** Lifetime per-model token totals (prompt + completion, provider-normalized). */
  tokensByModel?: Record<string, number>;
  /** Lifetime estimated USD cost per model (rough, blended in/out pricing). */
  costUsdByModel?: Record<string, number>;
}

function emptyUsageStats(now: number = Date.now()): UsageStats {
  return {
    date: new Date(now).toDateString(),
    weekStart: weekStartKey(now),
    callsByModel: {},
    weeklyCallsByModel: {},
  };
}

/**
 * The local Monday of the week `ts` falls in, as yyyy-mm-dd.
 *
 * Local and not UTC on purpose: this is a personal hobby ledger, so "this week"
 * is the week the person is living in, and a UTC boundary would roll the
 * counter over in the middle of their Sunday evening.
 */
export function weekStartKey(ts: number): string {
  const d = new Date(ts);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay() is 0 for Sunday; shift so Monday is 0 and Sunday closes the week.
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

/**
 * Applies the rolls that are due, and only those.
 *
 * Returns the record it was given when nothing was due, so a caller can tell a
 * plain read from a read that changed the record. A record with no `weekStart`
 * - one written before the weekly counter had a period - adopts the current
 * week and starts counting there, rather than carrying an undateable number
 * forward under a "THIS WEEK" label for another week.
 */
function rollUsageStats(stats: UsageStats, now: number): UsageStats {
  const today = new Date(now).toDateString();
  const week = weekStartKey(now);
  const dayDue = stats.date !== today;
  const weekDue = stats.weekStart !== week;
  if (!dayDue && !weekDue) return stats;
  return {
    ...stats,
    date: today,
    weekStart: week,
    callsByModel: dayDue ? {} : stats.callsByModel,
    weeklyCallsByModel: weekDue ? {} : stats.weeklyCallsByModel,
  };
}

/** A counts map, or an empty one: a record of the wrong shape must not throw. */
function countMap(value: unknown): Record<string, number> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, number>)
    : {};
}

export function loadUsageStats(): UsageStats {
  const now = Date.now();
  if (typeof window === 'undefined') return emptyUsageStats(now);
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return emptyUsageStats(now);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyUsageStats(now);
    // Re-read at the boundary rather than trusted: this record is written by
    // every AI call, and the dashboard dereferences both counters.
    const stats: UsageStats = {
      ...(parsed as UsageStats),
      callsByModel: countMap((parsed as UsageStats).callsByModel),
      weeklyCallsByModel: countMap((parsed as UsageStats).weeklyCallsByModel),
    };
    const rolled = rollUsageStats(stats, now);
    if (rolled !== stats) localStorage.setItem(USAGE_KEY, JSON.stringify(rolled));
    return rolled;
  } catch {
    return emptyUsageStats(now);
  }
}

export function incrementModelCall(modelName: string): void {
  if (typeof window === 'undefined') return;
  const stats = loadUsageStats();
  stats.callsByModel[modelName] = (stats.callsByModel[modelName] || 0) + 1;
  stats.weeklyCallsByModel[modelName] = (stats.weeklyCallsByModel[modelName] || 0) + 1;
  localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
}

/**
 * Adds one call's token usage + estimated cost to the lifetime ledger.
 * Daily counters reset on date roll; tokens/cost are lifetime by design —
 * the interesting question is "what has this hobby cost me", not "what did
 * it cost today". Written by lib/ai-hardening.recordUsage after every call
 * that reports usage metadata.
 */
export function recordTokenUsage(
  modelName: string,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number; costUsd?: number }
): void {
  if (typeof window === 'undefined') return;
  try {
    const stats = loadUsageStats();
    const tokens = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
    if (tokens > 0) {
      stats.tokensByModel = stats.tokensByModel || {};
      stats.tokensByModel[modelName] = (stats.tokensByModel[modelName] || 0) + tokens;
    }
    if ((usage.costUsd ?? 0) > 0) {
      stats.costUsdByModel = stats.costUsdByModel || {};
      stats.costUsdByModel[modelName] = (stats.costUsdByModel[modelName] || 0) + usage.costUsd!;
    }
    localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
  } catch {
    // Usage ledger is best-effort; never break a generation over it.
  }
}

export function loadSessionMeta(): import('./types').SessionMetacognition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('deepencode_session_meta_v1');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveSessionMeta(meta: import('./types').SessionMetacognition): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('deepencode_session_meta_v1', JSON.stringify(meta));
  } catch { console.error('Failed to save session meta'); }
}

// ─── Generation progress persistence ─────────────────────────────────────────
// Written when a generation kicks off, cleared when it succeeds / fails / is
// cancelled. On app load we check for a stale entry so a closed tab mid-encode
// leaves a "your last generation was interrupted" notice instead of silence.

export interface GenerationInProgress {
  startedAt: number;
  sourceLabel: string;
  sourceType: 'notes' | 'file' | 'youtube';
}

const GENERATION_KEY = 'deepencode_generation_progress_v1';

export function saveGenerationInProgress(info: GenerationInProgress): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GENERATION_KEY, JSON.stringify({ ...info, savedAt: Date.now() }));
  } catch { /* non-fatal */ }
}

export function loadGenerationInProgress(): (GenerationInProgress & { savedAt: number }) | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GENERATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.startedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearGenerationInProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GENERATION_KEY);
  } catch { /* non-fatal */ }
}

