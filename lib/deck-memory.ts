import { SegregationReport } from '@/lib/types';
import { extractAnkiCardsFromSchema } from '@/lib/anki-exporter';

// ─── Deck memory: what you already exported ────────────────────────────────
//
// The forge is built for repeat work: Monday's lectures, every week. Handing
// back the same deck each time makes it useless, so the app remembers the cards
// it has already shipped and says so — `4 new · 12 already in your deck` — and
// the learner can export only the new ones.
//
// What is stored is a fingerprint per card front (normalized text, no ids, no
// generation output, no source material), grouped by topic. That is enough to
// recognize a card again and too little to reconstruct anything: the store
// holds no card backs, no notes, no answers.
//
// The memory is advisory. It never blocks an export and never deletes a card:
// a card whose front was edited counts as new, and forgetting the topic is one
// button away. Local-only, like every other library in this app.

export interface DeckMemoryRecord {
  topic: string;
  /** Fingerprints of the card fronts already handed to an export surface. */
  keys: string[];
  updatedAt: number;
  /** How many times this topic has been exported. */
  exports: number;
  /** Last surface it went to, for the panel's one-line receipt. */
  lastSurface?: string;
}

const STORAGE_KEY = 'encode.deck-memory.v1';
const MAX_TOPICS = 60;
const MAX_KEYS_PER_TOPIC = 600;
const MAX_KEY_LENGTH = 160;

type DeckMemoryStore = Record<string, DeckMemoryRecord>;

function readStore(): DeckMemoryStore {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: DeckMemoryStore = {};
    for (const [key, value] of Object.entries(parsed as Record<string, any>)) {
      const record = value as DeckMemoryRecord;
      if (!record || !Array.isArray(record.keys)) continue;
      out[key] = {
        topic: typeof record.topic === 'string' ? record.topic : key,
        keys: record.keys.filter((k) => typeof k === 'string' && k.length > 0),
        updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
        exports: typeof record.exports === 'number' ? record.exports : 1,
        lastSurface: typeof record.lastSurface === 'string' ? record.lastSurface : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: DeckMemoryStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const entries = Object.entries(store)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_TOPICS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage full or unavailable: memory is a convenience, never a blocker.
  }
}

/** Stable fingerprint for a card front. Case/punctuation/space insensitive. */
export function cardKey(text: string): string {
  return (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{c\d+::([^}]*)\}\}/g, '$1')
    .replace(/\{\{([^}]*)\}\}/g, '$1')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_KEY_LENGTH);
}

export function memoryKeyForTopic(topic: string): string {
  return cardKey(topic) || 'forged-deck';
}

/**
 * The fronts the Anki exporter actually writes, grouped by the report item
 * that produced them.
 *
 * This deliberately asks the exporter rather than re-deriving anything: a fact
 * ships as its question (or as a real `{{cN::}}` cloze), a mechanism ships as
 * several cards (causal + edge case + boundary contrast), and every one of
 * them has to be recognizable again before an item counts as shipped. When the
 * exporter's fronts change, the keys change with it instead of drifting
 * (pinned by `tests/unit/deck-memory.test.ts`).
 */
function reportItemFronts(report: SegregationReport): Record<string, string[]> {
  const cards = extractAnkiCardsFromSchema(null, report);
  const grouped: Record<string, string[]> = {};
  const add = (id: string, front: string) => {
    if (!id || !front) return;
    (grouped[id] ||= []).push(front);
  };
  const byIdPrefix = (prefix: string) => cards.filter((c) => c.id.startsWith(prefix)).map((c) => c.front);
  const byId = (id: string) => {
    const card = cards.find((c) => c.id === id);
    return card ? [card.front] : [];
  };

  (report.declarativeFacts || []).forEach((fact, idx) => {
    for (const front of byId(fact.id || `fact-${idx}`)) add(fact.id, front);
  });
  (report.conceptualMechanisms || []).forEach((mech, idx) => {
    for (const front of byIdPrefix(`mech-${idx}-`)) add(mech.id, front);
  });
  (report.practiceQuestions || []).forEach((drill, idx) => {
    for (const front of byId(drill.id || `pq-${idx}`)) add(drill.id, front);
  });
  (report.workedExamples || []).forEach((example, idx) => {
    const prefix = example.id ? `${example.id}-` : `example-${idx}-`;
    for (const front of byIdPrefix(prefix)) add(example.id, front);
  });

  return grouped;
}

/**
 * Fingerprints for a segregation report — the fronts the exporter writes, so a
 * deck forged today, the same deck read back out of Anki, and the same deck
 * shipped through the export modal all land on the same keys.
 */
export function reportCardKeys(report: SegregationReport | null | undefined): string[] {
  if (!report) return [];
  const keys = Object.values(reportItemFronts(report))
    .flat()
    .map(cardKey)
    .filter(Boolean);
  return keys.filter((key, index) => keys.indexOf(key) === index);
}

/** Fingerprints for already-extracted Anki cards (any export surface). */
export function ankiCardKeys(cards: { front: string }[]): string[] {
  return (cards || []).map((card) => cardKey(card.front)).filter(Boolean);
}

export function loadDeckMemory(): DeckMemoryStore {
  return readStore();
}

/**
 * Adopts fingerprints that came from somewhere other than this app —
 * specifically, notes read back out of the real Anki collection.
 *
 * Unlike {@link recordDeckExport} this is not an export: it unions the keys so
 * the diff counts them as known, but it never bumps the export counter or the
 * surface receipt, because the learner did not ship anything.
 */
export function adoptDeckKeys(args: { topic: string; keys: string[] }): number {
  const topic = (args.topic || '').trim();
  const keys = (args.keys || []).filter(Boolean);
  if (!topic || keys.length === 0) return 0;

  const store = readStore();
  const id = memoryKeyForTopic(topic);
  const existing = store[id];
  const before = new Set(existing?.keys || []);
  const added = keys.filter((key) => !before.has(key));
  if (added.length === 0 && existing) return 0;

  const list = [...added, ...(existing?.keys || [])].filter((key, index, all) => all.indexOf(key) === index);
  store[id] = {
    topic: existing?.topic || topic,
    keys: list.slice(0, MAX_KEYS_PER_TOPIC),
    updatedAt: Date.now(),
    exports: existing?.exports || 0,
    lastSurface: existing?.lastSurface,
  };
  writeStore(store);
  return added.length;
}

export function knownKeysForTopic(topic: string): Set<string> {
  const store = readStore();
  const record = store[memoryKeyForTopic(topic)];
  return new Set(record?.keys || []);
}

export function describeDeckMemory(topic: string): DeckMemoryRecord | null {
  return readStore()[memoryKeyForTopic(topic)] || null;
}

/**
 * Records cards as exported. Safe to call on every export action: keys are
 * unioned, so a re-export of the same deck does not grow the store.
 */
export function recordDeckExport(args: {
  topic: string;
  keys: string[];
  surface?: string;
  timestamp?: number;
}): DeckMemoryRecord | null {
  const topic = (args.topic || '').trim();
  const keys = (args.keys || []).filter(Boolean);
  if (!topic || keys.length === 0) return null;

  const store = readStore();
  const id = memoryKeyForTopic(topic);
  const existing = store[id];
  // Keep the most recent fingerprints first so the cap trims the oldest.
  const list = [...keys, ...(existing?.keys || [])].filter((key, index, all) => all.indexOf(key) === index);

  const record: DeckMemoryRecord = {
    topic,
    keys: list.slice(0, MAX_KEYS_PER_TOPIC),
    updatedAt: args.timestamp ?? Date.now(),
    exports: (existing?.exports || 0) + 1,
    lastSurface: args.surface,
  };
  store[id] = record;
  writeStore(store);
  return record;
}

export function forgetDeckMemory(topic: string): void {
  const store = readStore();
  delete store[memoryKeyForTopic(topic)];
  writeStore(store);
}

export function clearDeckMemory(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface DeckDiff {
  /** Card ids that are not in the memory yet. */
  freshIds: string[];
  /** Card ids the learner has already exported for this topic. */
  knownIds: string[];
  fresh: number;
  known: number;
}

/**
 * Compares a report against the topic's memory. Card ids come from the report
 * itself so the caller can filter the exported deck by id.
 *
 * An item counts as known only when EVERY front it would ship is already in
 * the memory: a mechanism that shipped three of its four cards is not "already
 * in your deck", and calling it known would silently drop the missing one.
 */
export function diffReportAgainstMemory(
  report: SegregationReport | null | undefined,
  known: Set<string>
): DeckDiff {
  const freshIds: string[] = [];
  const knownIds: string[] = [];
  if (!report) return { freshIds, knownIds, fresh: 0, known: 0 };

  for (const [id, fronts] of Object.entries(reportItemFronts(report))) {
    const keys = fronts.map(cardKey).filter(Boolean);
    if (keys.length === 0) continue;
    if (keys.every((key) => known.has(key))) knownIds.push(id);
    else freshIds.push(id);
  }

  return { freshIds, knownIds, fresh: freshIds.length, known: knownIds.length };
}

/**
 * The report reduced to just the cards the learner has not exported yet.
 * Returns the input unchanged when there is nothing to drop.
 */
export function keepOnlyFreshCards(report: SegregationReport, freshIds: string[]): SegregationReport {
  const fresh = new Set(freshIds);
  if (fresh.size === 0) return report;
  return {
    ...report,
    declarativeFacts: report.declarativeFacts.filter((card) => fresh.has(card.id)),
    conceptualMechanisms: report.conceptualMechanisms.filter((card) => fresh.has(card.id)),
    practiceQuestions: (report.practiceQuestions || []).filter((card) => fresh.has(card.id)),
    workedExamples: (report.workedExamples || []).filter((card) => fresh.has(card.id)),
  };
}
