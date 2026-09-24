import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { SavedSchema, AISettings } from './types';
import { DEFAULT_SETTINGS } from './storage';

interface DeepEncodeDB extends DBSchema {
  schemas: {
    key: string;
    value: SavedSchema;
    indexes: { 'by-timestamp': number };
  };
  settings: {
    key: string;
    value: any;
  };
  sync_queue: {
    key: string;
    value: {
      action: 'save' | 'delete';
      schemaId: string;
      schema?: SavedSchema;
      timestamp: number;
    };
  };
  /** Persisted L2 for the AI response cache : survives reloads. */
  ai_cache: {
    key: string;
    value: { at: number; value: any };
  };
  /** Single-key session state (last upload, in-progress YouTube workout). */
  session_state: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'deepencode_indexeddb_v1';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<DeepEncodeDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DeepEncodeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DeepEncodeDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('schemas')) {
          const schemaStore = db.createObjectStore('schemas', { keyPath: 'id' });
          schemaStore.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'schemaId' });
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('ai_cache')) {
            db.createObjectStore('ai_cache');
          }
          if (!db.objectStoreNames.contains('session_state')) {
            db.createObjectStore('session_state');
          }
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Initializes IndexedDB and hydrates from existing localStorage if present
 */
export async function initIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    const count = await db.count('schemas');

    // If IndexedDB is empty, check and migrate localStorage schemas
    if (count === 0) {
      const localData = localStorage.getItem('deepencode_saved_schemas_v2') || localStorage.getItem('deepencode_saved_schemas');
      if (localData) {
        try {
          const parsed = JSON.parse(localData) as SavedSchema[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            const tx = db.transaction('schemas', 'readwrite');
            for (const s of parsed) {
              if (s && s.id) {
                await tx.store.put(s);
              }
            }
            await tx.done;
            console.log(`[IndexedDB] Migrated ${parsed.length} schemas from localStorage.`);
          }
        } catch (e) {
          console.error('[IndexedDB] Migration error:', e);
        }
      }
    }
  } catch (err) {
    console.warn('[IndexedDB] Initialization fallback warning:', err);
  }
}

/**
 * Get all saved schemas from IndexedDB (sorted by latest timestamp descending)
 */
export async function getAllSchemasFromIDB(): Promise<SavedSchema[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await getDB();
    const all = await db.getAllFromIndex('schemas', 'by-timestamp');
    return all.reverse(); // Most recent first
  } catch (err) {
    console.error('[IndexedDB] Failed to load schemas:', err);
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('deepencode_saved_schemas_v2');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Save or update a schema in IndexedDB
 */
export async function saveSchemaToIDB(schema: SavedSchema): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.put('schemas', schema);

    // Also mirror to localStorage for redundancy (up to 20 items)
    try {
      const all = await getAllSchemasFromIDB();
      localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(all.slice(0, 20)));
    } catch {
      // Ignore quota errors on localStorage
    }
  } catch (err) {
    console.error('[IndexedDB] Failed to save schema:', err);
    // Fallback
    try {
      const raw = localStorage.getItem('deepencode_saved_schemas_v2');
      const list = raw ? JSON.parse(raw) : [];
      const updated = [schema, ...list.filter((s: SavedSchema) => s.id !== schema.id)].slice(0, 20);
      localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(updated));
    } catch {}
  }
}

/**
 * Delete a schema from IndexedDB
 */
export async function deleteSchemaFromIDB(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.delete('schemas', id);
    try {
      const all = await getAllSchemasFromIDB();
      localStorage.setItem('deepencode_saved_schemas_v2', JSON.stringify(all.slice(0, 20)));
    } catch {}
  } catch (err) {
    console.error('[IndexedDB] Failed to delete schema:', err);
  }
}

/**
 * Clear all schemas in IndexedDB
 */
export async function clearAllSchemasFromIDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.clear('schemas');
    localStorage.removeItem('deepencode_saved_schemas_v2');
  } catch (err) {
    console.error('[IndexedDB] Failed to clear all schemas:', err);
  }
}

// ─── AI response cache (L2 persistence) ─────────────────────────────────────
// The in-memory Map in ai-client is L1. This store is L2: written on every
// cacheSet, read once at module init, so a reload (or tomorrow's session)
// reuses yesterday's generations instead of re-billing tokens.

const AI_CACHE_MAX = 200;
const AI_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Load all unexpired cache entries (key → entry) from IndexedDB. */
export async function loadAICacheFromIDB(): Promise<Map<string, { at: number; value: any }>> {
  const out = new Map<string, { at: number; value: any }>();
  if (typeof window === 'undefined') return out;
  try {
    const db = await getDB();
    const now = Date.now();
    for (const key of await db.getAllKeys('ai_cache')) {
      const entry = await db.get('ai_cache', key);
      if (entry && typeof entry.at === 'number' && now - entry.at < AI_CACHE_TTL_MS) {
        out.set(key, entry);
      }
    }
  } catch (err) {
    console.warn('[IndexedDB] AI cache hydration skipped:', err);
  }
  return out;
}

/** Persist one cache entry and trim/expire the store (best-effort). */
export async function putAICacheEntryIDB(key: string, entry: { at: number; value: any }): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    const now = Date.now();
    await db.put('ai_cache', entry, key);

    // Lazily expire stale entries.
    for (const k of await db.getAllKeys('ai_cache')) {
      const e = await db.get('ai_cache', k);
      if (!e || now - (e.at || 0) >= AI_CACHE_TTL_MS) {
        await db.delete('ai_cache', k);
      }
    }

    // Trim beyond capacity, oldest first.
    const keys = await db.getAllKeys('ai_cache');
    if (keys.length > AI_CACHE_MAX) {
      const entries = await Promise.all(
        keys.map(async (k) => ({ k, at: (await db.get('ai_cache', k))?.at ?? 0 }))
      );
      entries.sort((a, b) => a.at - b.at);
      for (const { k } of entries.slice(0, keys.length - AI_CACHE_MAX)) {
        await db.delete('ai_cache', k);
      }
    }
  } catch (err) {
    console.warn('[IndexedDB] AI cache persist skipped:', err);
  }
}

/** Clears the persisted AI cache (wired to clearAICache). */
export async function clearAICacheIDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.clear('ai_cache');
  } catch {
    /* best-effort */
  }
}

// ─── Session state (uploads, in-progress YouTube workouts) ──────────────────

/** Persist one session-state value under a key (best-effort). */
export async function putSessionStateIDB(key: string, value: any): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.put('session_state', value, key);
  } catch {
    /* best-effort : session state is a convenience layer, never critical */
  }
}

/** Read one session-state value, or null when absent/unavailable. */
export async function getSessionStateIDB<T = any>(key: string): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getDB();
    const value = await db.get('session_state', key);
    return (value as T) ?? null;
  } catch {
    return null;
  }
}

/** Remove one session-state key. */
export async function deleteSessionStateIDB(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.delete('session_state', key);
  } catch {
    /* best-effort */
  }
}
