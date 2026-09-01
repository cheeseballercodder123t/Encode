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
}

const DB_NAME = 'deepencode_indexeddb_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DeepEncodeDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DeepEncodeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DeepEncodeDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
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
