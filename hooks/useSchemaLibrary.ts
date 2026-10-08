'use client';

import { useCallback, useEffect, useState } from 'react';
import { SavedSchema } from '@/lib/types';
import {
  clearAllSchemas,
  deleteSchemaFromHistory,
  loadSavedSchemas,
  mergeSchemaLists,
  saveSchemaToHistory,
  subscribeToSavedSchemas,
} from '@/lib/storage';
import { initIndexedDB, getAllSchemasFromIDB } from '@/lib/db';

type CloudSync = ((schema: SavedSchema) => Promise<void> | void) | undefined;

/**
 * Saved-schema history: localStorage (cache, capped at 50) + offline IndexedDB
 * hydration + optional Firestore cloud sync. Central point the HistoryDrawer,
 * interleaving scheduler and analytics all read from.
 */
export function useSchemaLibrary(
  saveSchemaToCloud?: CloudSync,
  deleteSchemaFromCloud?: (id: string) => Promise<void> | void
) {
  // Empty server/client first render prevents library counts from mismatching
  // SSR when local sessions already exist. Hydrate the external stores afterward.
  const [savedSchemas, setSavedSchemas] = useState<SavedSchema[]>([]);

  /**
   * The library as both stores currently hold it: the localStorage mirror (which
   * is what this tab can read synchronously, and what a writer merges against)
   * topped up by IndexedDB, which keeps every schema rather than the newest
   * fifty - minus anything deleted recently, which IndexedDB may still be holding
   * until the deleting tab's own removal lands (see `deletedSchemaIds`).
   */
  const readStores = useCallback(async () => {
    const local = loadSavedSchemas();
    setSavedSchemas(local);
    try {
      await initIndexedDB();
      const idbSchemas = await getAllSchemasFromIDB();
      if (idbSchemas && idbSchemas.length > 0) setSavedSchemas(mergeSchemaLists(local, idbSchemas));
    } catch (e) {
      console.warn('IDB schemas load warning:', e);
    }
  }, []);

  // Hydrate local-first on mount, and stay current with other tabs: the `storage`
  // event fires here when ANOTHER tab writes the library key, and without it a
  // tab that is already open kept a list only it believed in - the visible half
  // of the bug this subscription fixes (the invisible half is that this tab's
  // next write used to be built on that stale list).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let refilling = false;
    const refresh = () => {
      if (cancelled || refilling) return;
      refilling = true;
      void readStores().finally(() => { refilling = false; });
    };
    const timer = setTimeout(refresh, 0);
    const unsubscribe = subscribeToSavedSchemas((schemas, origin) => {
      if (cancelled) return;
      if (origin === 'local') {
        // This tab wrote it: the list handed over IS the new state, and reading
        // IndexedDB here would race the write that has not landed yet (which is
        // how a just-deleted schema came back on screen).
        setSavedSchemas(schemas);
        return;
      }
      refresh();
    });
    return () => { cancelled = true; clearTimeout(timer); unsubscribe(); };
  }, [readStores]);

  const saveSchema = useCallback(async (schema: SavedSchema) => {
    const updated = saveSchemaToHistory(schema);
    setSavedSchemas(updated);
    if (saveSchemaToCloud) {
      await saveSchemaToCloud(schema);
    }
    return updated;
  }, [saveSchemaToCloud]);

  const deleteSchema = useCallback(async (id: string) => {
    const updated = deleteSchemaFromHistory(id);
    setSavedSchemas(updated);
    if (deleteSchemaFromCloud) {
      await deleteSchemaFromCloud(id);
    }
    return updated;
  }, [deleteSchemaFromCloud]);

  const clearAll = useCallback(() => {
    clearAllSchemas();
    setSavedSchemas([]);
  }, []);

  return { savedSchemas, setSavedSchemas, saveSchema, deleteSchema, clearAll };
}
