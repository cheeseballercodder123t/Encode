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
  const [savedSchemas, setSavedSchemas] = useState<SavedSchema[]>(() => loadSavedSchemas());

  // Hydrate local-first Offline IndexedDB schemas on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    initIndexedDB().then(async () => {
      try {
        const idbSchemas = await getAllSchemasFromIDB();
        if (idbSchemas && idbSchemas.length > 0) {
          setSavedSchemas(idbSchemas);
        }
      } catch (e) {
        console.warn('IDB schemas load warning:', e);
      }
    }).catch(err => console.warn('IDB init error:', err));
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
