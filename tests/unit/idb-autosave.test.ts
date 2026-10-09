// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveSchemaToIDB, deleteSchemaFromIDB, clearAllSchemasFromIDB } from '@/lib/db';
import {
  IDB_AUTOSAVE_DELAY_MS,
  flushPendingSchemaWrites,
  saveSchemaToHistory,
  deleteSchemaFromHistory,
  clearAllSchemas,
  invalidateSchemaCache,
  loadSavedSchemas,
} from '@/lib/storage';
import { makeSchema } from './fixtures';

/**
 * The IndexedDB hop of a save is debounced, and the claim says so (defect 38).
 *
 * The finding was not that a debounce was missing - it was that the debounce was
 * *written and never called*: `saveSchemaToHistory` called `saveSchemaToIDB`
 * directly on every save, while the README and `lib/storage/index.ts` both
 * described a debounced autosave and the exported helper behind that claim had
 * zero callers. So these tests pin both halves:
 *
 *   1. the behaviour - the mirror is written synchronously, IndexedDB only when
 *      the window closes, a burst collapses per schema id, and the queue is
 *      flushed when the page can go away;
 *   2. the coherence the queue introduces - a queued write must not resurrect a
 *      schema that was deleted, or rebuilt after the library was cleared;
 *   3. the claim - no dead helper left behind, and the README naming the window
 *      and the flush the code actually has.
 *
 * `@/lib/db` is mocked: happy-dom has no IndexedDB, and the point here is when
 * the write is attempted, not what the idb engine does with it.
 */

vi.mock('@/lib/db', () => ({
  saveSchemaToIDB: vi.fn(async () => {}),
  deleteSchemaFromIDB: vi.fn(async () => {}),
  clearAllSchemasFromIDB: vi.fn(async () => {}),
  getAllSchemasFromIDB: vi.fn(async () => []),
}));

const savedToIDB = vi.mocked(saveSchemaToIDB);
const deletedFromIDB = vi.mocked(deleteSchemaFromIDB);
const clearedFromIDB = vi.mocked(clearAllSchemasFromIDB);

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  invalidateSchemaCache();
  vi.clearAllMocks();
  // Resets the module-level queue and timer between tests too.
  clearAllSchemas();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the IndexedDB write is debounced', () => {
  it('writes the mirror immediately and leaves IndexedDB for the window', () => {
    saveSchemaToHistory(makeSchema({ id: 's1', topicSummary: 'Action Potentials' }));

    // The synchronous half: readable now, by this tab and by a reload.
    expect(loadSavedSchemas().map((s) => s.id)).toEqual(['s1']);
    // The heavy half: not yet.
    expect(savedToIDB).not.toHaveBeenCalled();
  });

  it('writes when the window closes, and not a millisecond before', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS - 1);
    expect(savedToIDB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(savedToIDB).toHaveBeenCalledTimes(1);
    expect(savedToIDB.mock.calls[0][0].id).toBe('s1');
  });

  it('collapses a burst on one schema id to a single write of the newest record', () => {
    saveSchemaToHistory(makeSchema({ id: 's1', topicSummary: 'First pass' }));
    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS - 10);
    saveSchemaToHistory(makeSchema({ id: 's1', topicSummary: 'Second pass' }));

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);

    expect(savedToIDB).toHaveBeenCalledTimes(1);
    expect(savedToIDB.mock.calls[0][0].topicSummary).toBe('Second pass');
  });

  it('restarts the window on every save, so a steady stream is one write', () => {
    for (let i = 0; i < 5; i++) {
      saveSchemaToHistory(makeSchema({ id: 's1', topicSummary: `pass ${i}` }));
      vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS - 1);
    }
    expect(savedToIDB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(savedToIDB).toHaveBeenCalledTimes(1);
    expect(savedToIDB.mock.calls[0][0].topicSummary).toBe('pass 4');
  });

  it('sends distinct schemas out together', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));
    saveSchemaToHistory(makeSchema({ id: 's2' }));

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);

    expect(savedToIDB.mock.calls.map(([schema]) => schema.id).sort()).toEqual(['s1', 's2']);
  });

  it('schedules a fresh window for a save that arrives after a write', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));
    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);
    saveSchemaToHistory(makeSchema({ id: 's2' }));
    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);

    expect(savedToIDB.mock.calls.map(([schema]) => schema.id)).toEqual(['s1', 's2']);
  });
});

describe('the queue cannot outlive the page', () => {
  it('flushes on demand, and the timer does not write a second time', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));

    flushPendingSchemaWrites();
    expect(savedToIDB).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS * 10);
    expect(savedToIDB).toHaveBeenCalledTimes(1);
  });

  it('flushes what is queued when the page goes away (pagehide)', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));

    window.dispatchEvent(new Event('pagehide'));

    expect(savedToIDB).toHaveBeenCalledTimes(1);
    expect(savedToIDB.mock.calls[0][0].id).toBe('s1');
  });

  it('flushes when the tab goes hidden, and not when it comes back', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(savedToIDB).toHaveBeenCalledTimes(1);

    // Returning to the tab is not a reason to write anything.
    saveSchemaToHistory(makeSchema({ id: 's2' }));
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(savedToIDB).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);
    expect(savedToIDB).toHaveBeenCalledTimes(2);
  });

  it('is a no-op on an empty queue', () => {
    expect(() => flushPendingSchemaWrites()).not.toThrow();
    expect(savedToIDB).not.toHaveBeenCalled();
  });
});

describe('the queue is coherent with deletions and clears', () => {
  it('drops a queued write for a schema that is then deleted', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));

    deleteSchemaFromHistory('s1');
    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS * 2);

    // The removal must not be undone by a write scheduled before it.
    expect(savedToIDB).not.toHaveBeenCalled();
    expect(deletedFromIDB).toHaveBeenCalledWith('s1');
  });

  it('drops the queue when the library is cleared', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));
    saveSchemaToHistory(makeSchema({ id: 's2' }));

    clearAllSchemas();
    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS * 2);

    expect(savedToIDB).not.toHaveBeenCalled();
    expect(clearedFromIDB).toHaveBeenCalledTimes(1);
    expect(loadSavedSchemas()).toEqual([]);
  });

  it('still writes a schema re-saved after a delete', () => {
    saveSchemaToHistory(makeSchema({ id: 's1' }));
    deleteSchemaFromHistory('s1');
    saveSchemaToHistory(makeSchema({ id: 's1', topicSummary: 'Re-encoded' }));

    vi.advanceTimersByTime(IDB_AUTOSAVE_DELAY_MS);

    expect(savedToIDB).toHaveBeenCalledTimes(1);
    expect(savedToIDB.mock.calls[0][0].topicSummary).toBe('Re-encoded');
  });
});

describe('the documented cadence matches the code', () => {
  const storageSource = readFileSync(join(process.cwd(), 'lib/storage.ts'), 'utf8');
  const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

  it('has no dead debounce helper left: the one the finding named is gone', () => {
    expect(storageSource).not.toContain('export function debouncedSaveSchema');
  });

  it('names the window it debounces behind and the flush the page calls', () => {
    expect(storageSource).toContain('export const IDB_AUTOSAVE_DELAY_MS');
    expect(storageSource).toContain('export function flushPendingSchemaWrites');
    expect(storageSource).toContain("addEventListener('pagehide', flushPendingSchemaWrites)");
    expect(storageSource).toContain("document.visibilityState === 'hidden'");
  });

  it('keeps the README honest about both, where the claim was made', () => {
    expect(readme).toContain('IDB_AUTOSAVE_DELAY_MS');
    expect(readme).toContain('flushPendingSchemaWrites');
  });
});
