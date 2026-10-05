// The IndexedDB storage engine `lib/storage.ts` writes through: the `idb`-backed
// `schemas` / `settings` / `sync_queue` / `ai_cache` / `session_state` stores in
// `../db`, including the one-time migration of any pre-existing localStorage
// history and the localStorage fallback when IndexedDB is unavailable.
//
// `lib/storage.ts` is the synchronous facade in front of it (in-memory cache,
// debounced autosave, localStorage mirror), so callers keep reading history
// synchronously while the heavy writes happen off the UI thread.
export * from '../db';
