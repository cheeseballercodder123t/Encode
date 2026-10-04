'use client';

import { useCallback, useEffect, useState } from 'react';
import { SavedSchema } from '@/lib/types';
import {
  clearAllSchemas,
  deleteSchemaFromHistory,
  loadSavedSchemas,
  saveSchemaToHistory,
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

  // Hydrate local-first Offline IndexedDB schemas on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setSavedSchemas(loadSavedSchemas());
    }, 0);
    initIndexedDB().then(async () => {
      try {
        const idbSchemas = await getAllSchemasFromIDB();
        if (!cancelled && idbSchemas && idbSchemas.length > 0) {
          setSavedSchemas(idbSchemas);
        }
      } catch (e) {
        console.warn('IDB schemas load warning:', e);
      }
    }).catch(err => console.warn('IDB init error:', err));
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

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
