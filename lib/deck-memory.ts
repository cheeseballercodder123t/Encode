import { SegregationReport } from '@/lib/types';

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
 * Fingerprints for a segregation report — the same normalization the Anki
 * exporter produces fronts with, so a deck forged today and the same deck
 * shipped through the export modal land on the same keys.
 */
export function reportCardKeys(report: SegregationReport | null | undefined): string[] {
  if (!report) return [];
  const keys: string[] = [];
  for (const fact of report.declarativeFacts || []) {
    keys.push(cardKey(fact.question || fact.factStatement || fact.clozeSuggestion || ''));
  }
  for (const mech of report.conceptualMechanisms || []) {
    keys.push(cardKey(mech.conceptName || ''));
  }
  for (const drill of report.practiceQuestions || []) {
    keys.push(cardKey(drill.question || ''));
  }
  for (const example of report.workedExamples || []) {
    keys.push(cardKey(example.title || example.problem || ''));
  }
  return keys.filter(Boolean);
}

/** Fingerprints for already-extracted Anki cards (any export surface). */
export function ankiCardKeys(cards: { front: string }[]): string[] {
  return (cards || []).map((card) => cardKey(card.front)).filter(Boolean);
}

export function loadDeckMemory(): DeckMemoryStore {
  return readStore();
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
 */
export function diffReportAgainstMemory(
  report: SegregationReport | null | undefined,
  known: Set<string>
): DeckDiff {
  const freshIds: string[] = [];
  const knownIds: string[] = [];
  if (!report) return { freshIds, knownIds, fresh: 0, known: 0 };

  const consider = (id: string, text: string) => {
    const key = cardKey(text);
    if (!key) return;
    if (known.has(key)) knownIds.push(id);
    else freshIds.push(id);
  };

  for (const fact of report.declarativeFacts || []) {
    consider(fact.id, fact.question || fact.factStatement || fact.clozeSuggestion || '');
  }
  for (const mech of report.conceptualMechanisms || []) {
    consider(mech.id, mech.conceptName || '');
  }
  for (const drill of report.practiceQuestions || []) {
    consider(drill.id, drill.question || '');
  }
  for (const example of report.workedExamples || []) {
    consider(example.id, example.title || example.problem || '');
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
