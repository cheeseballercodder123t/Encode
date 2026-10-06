// ─── Mr M mode: the paradox ledger ──────────────────────────────────────────
//
// Most learners can meet a contradiction, shrug, and memorise the exception for
// the test. This one cannot: a live contradiction halts everything downstream
// until it is closed. That is not a quirk to work around — it is the trait that
// makes the understanding real — so contradictions become first-class records
// that are raised, held in plain sight, and explicitly resolved.
//
// Kept in localStorage rather than IndexedDB on purpose, matching
// `interference-traps.ts`: this is a short, ordered list that the workbench
// reads synchronously during render, and an unresolved paradox has to be
// visible on the very first paint of a stage.

import type { ParadoxEntry } from './types';

const STORAGE_KEY = 'deepencode_mr_m_paradox_v1';

/** Oldest entries fall off the list; forty open contradictions is not a study plan. */
const MAX_ENTRIES = 40;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function normalizeTopic(topic: string): string {
  return (topic || '').trim().toLowerCase();
}

/** Every record, newest first. Never throws. */
export function loadParadoxes(): ParadoxEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ParadoxEntry =>
        !!entry &&
        typeof entry.id === 'string' &&
        typeof entry.statement === 'string' &&
        typeof entry.raisedAt === 'number'
    );
  } catch {
    return [];
  }
}

function save(entries: ParadoxEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* best-effort: a full quota must never block the stage */
  }
}

/** Still-unresolved contradictions for one topic, newest first. */
export function openParadoxesFor(topic: string, all: ParadoxEntry[] = loadParadoxes()): ParadoxEntry[] {
  const key = normalizeTopic(topic);
  if (!key) return [];
  return all.filter((entry) => !entry.resolvedAt && normalizeTopic(entry.topic) === key);
}

/** True when the topic has anything still open — what the gate reads. */
export function hasOpenParadox(topic: string, all: ParadoxEntry[] = loadParadoxes()): boolean {
  return openParadoxesFor(topic, all).length > 0;
}

/**
 * Records one contradiction. Re-raising the same statement on the same topic
 * updates that record instead of stacking a duplicate, so a learner who keeps
 * hitting the same paradox sees "still open", not six copies of it.
 */
export function raiseParadox(
  topic: string,
  statement: string,
  now: number = Date.now()
): ParadoxEntry | null {
  const cleanStatement = (statement || '').trim();
  if (!cleanStatement) return null;
  const entry: ParadoxEntry = {
    id: `paradox-${now}-${Math.random().toString(36).slice(2, 8)}`,
    topic: (topic || '').trim() || 'Untitled',
    statement: cleanStatement,
    raisedAt: now,
  };
  const existing = loadParadoxes();
  const sameTopic = normalizeTopic(entry.topic);
  const duplicate = existing.find(
    (item) =>
      !item.resolvedAt &&
      normalizeTopic(item.topic) === sameTopic &&
      item.statement.trim().toLowerCase() === cleanStatement.toLowerCase()
  );
  if (duplicate) return duplicate;
  save([entry, ...existing]);
  return entry;
}

/**
 * Closes one, with the sentence that did it. The resolution text is kept: it is
 * the evidence that the contradiction is actually gone, and it is worth more on
 * review than the answer was.
 */
export function resolveParadox(id: string, resolution: string, now: number = Date.now()): void {
  const existing = loadParadoxes();
  const index = existing.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const closed: ParadoxEntry = {
    ...existing[index],
    resolvedAt: now,
    resolution: (resolution || '').trim() || undefined,
  };
  const next = [...existing];
  next[index] = closed;
  save(next);
}

export function clearParadoxes(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}
