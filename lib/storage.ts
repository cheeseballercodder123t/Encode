import { AISettings, SavedSchema } from './types';
import { saveSchemaToIDB, deleteSchemaFromIDB, clearAllSchemasFromIDB, getAllSchemasFromIDB } from './db';

const STORAGE_KEYS = {
  SETTINGS: 'deepencode_ai_settings_v2',
  HISTORY: 'deepencode_saved_schemas_v2',
  STATS: 'deepencode_user_stats_v2',
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

export function loadSavedSchemas(): SavedSchema[] {
  if (typeof window === 'undefined') return [];
  
  // Return from cache if available and initialized
  if (cacheInitialized && schemaCache.has('schemas')) {
    return schemaCache.get('schemas') || [];
  }
  
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) {
      schemaCache.set('schemas', []);
      cacheInitialized = true;
      return [];
    }
    const parsed = JSON.parse(raw);
    schemaCache.set('schemas', parsed);
    cacheInitialized = true;
    return parsed;
  } catch (e) {
    console.error('Failed to load schemas history', e);
    return [];
  }
}

export function saveSchemaToHistory(schema: SavedSchema): SavedSchema[] {
  if (typeof window === 'undefined') return [];
  try {
    const current = loadSavedSchemas();
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
    const capped = updated.slice(0, 50);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(capped));
    
    // Update cache
    schemaCache.set('schemas', capped);
    
    // Asynchronously persist to IndexedDB
    saveSchemaToIDB(schema).catch(e => console.warn('IDB write failed:', e));
    
    return capped;
  } catch (e) {
    console.error('Failed to save schema', e);
    return [];
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
    const current = loadSavedSchemas();
    const updated = current.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(updated));
    
    // Update cache
    schemaCache.set('schemas', updated);
    
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
    
    // Clear cache
    schemaCache.delete('schemas');
    cacheInitialized = false;
    
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

export interface UsageStats {
  date: string;
  callsByModel: Record<string, number>;
  weeklyCallsByModel: Record<string, number>;
}

export function loadUsageStats(): UsageStats {
  if (typeof window === 'undefined') return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} };
  try {
    const raw = localStorage.getItem('deepencode_usage_stats_v1');
    if (!raw) return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} };
    const parsed: UsageStats = JSON.parse(raw);
    if (parsed.date !== new Date().toDateString()) {
      const reset: UsageStats = { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: parsed.weeklyCallsByModel || {} };
      localStorage.setItem('deepencode_usage_stats_v1', JSON.stringify(reset));
      return reset;
    }
    return parsed;
  } catch { return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} }; }
}

export function incrementModelCall(modelName: string): void {
  if (typeof window === 'undefined') return;
  const stats = loadUsageStats();
  stats.callsByModel[modelName] = (stats.callsByModel[modelName] || 0) + 1;
  stats.weeklyCallsByModel[modelName] = (stats.weeklyCallsByModel[modelName] || 0) + 1;
  localStorage.setItem('deepencode_usage_stats_v1', JSON.stringify(stats));
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

