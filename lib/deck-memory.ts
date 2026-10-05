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

export interface DeckMemorySource {
  /** Fingerprint of the source itself: its URL, file name, or text head. */
  key: string;
  /** What the learner called it ("Lecture 4 slides"). */
  label: string;
  /** Cards it contributed the last time it was forged. */
  cards: number;
  /** When it was last forged. */
  at: number;
}

export interface DeckMemoryRecord {
  topic: string;
  /** Fingerprints of the card fronts already handed to an export surface. */
  keys: string[];
  updatedAt: number;
  /** How many times this topic has been exported. */
  exports: number;
  /** Last surface it went to, for the panel's one-line receipt. */
  lastSurface?: string;
  /**
   * Which sources this topic was built from.
   *
   * The card memory answers "have I shipped this card"; this answers the other
   * question a repeat ingest needs before it spends anything: "have I already
   * cut this lecture". Fingerprints of the sources, not their text — a source's
   * key is its URL, its file name or the head of its pasted notes.
   */
  sources?: DeckMemorySource[];
}

const STORAGE_KEY = 'encode.deck-memory.v1';
const MAX_TOPICS = 60;
const MAX_KEYS_PER_TOPIC = 600;
const MAX_KEY_LENGTH = 160;
const MAX_SOURCES_PER_TOPIC = 60;

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
        sources: readSourceLedger(record.sources),
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

function readSourceLedger(raw: unknown): DeckMemorySource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ledger: DeckMemorySource[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as DeckMemorySource;
    if (typeof record.key !== 'string' || !record.key) continue;
    ledger.push({
      key: record.key,
      label: typeof record.label === 'string' && record.label ? record.label : record.key,
      cards: typeof record.cards === 'number' ? record.cards : 0,
      at: typeof record.at === 'number' ? record.at : 0,
    });
  }
  return ledger.length > 0 ? ledger : undefined;
}

/**
 * Fingerprint for a forge source: what makes two runs the same ingest.
 *
 * A URL is its own identity, a file is its name, and pasted notes are their
 * opening words (a source edited halfway down is still the same source). Ids
 * are deliberately not used: they are minted per session, so the same lecture
 * would look new every time it was added.
 */
export function deckSourceKey(source: {
  kind?: string;
  url?: string;
  label?: string;
  notes?: string;
}): string {
  const url = (source?.url || '').trim();
  if (url) return `url:${cardKey(url)}`;
  const label = (source?.label || '').trim();
  const notes = (source?.notes || '').trim();
  if (notes) return `text:${(source?.kind || 'text')}:${cardKey(notes.slice(0, 400))}`;
  return `label:${cardKey(label)}`;
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
  (report.confusablePairs || []).forEach((pair, idx) => {
    // A pair ships a matrix card whose id IS the pair id, plus a vignette whose
    // id appends `-vignette`. Both have to be fingerprinted, or a re-forge
    // counts the pair as new every time and re-ships cards already in the deck.
    for (const front of byId(pair.id || `cp-${idx}-matrix`)) add(pair.id, front);
    for (const front of byIdPrefix(pair.id ? `${pair.id}-` : `cp-${idx}-`)) add(pair.id, front);
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
 * Every source this app has already cut into cards, keyed by its fingerprint
 * and labelled with the topic it landed in.
 *
 * Scanned ACROSS topics on purpose: at setup time the forge does not know what
 * the deck will be called yet (the topic comes out of the merge), so "have I
 * already forged this lecture?" can only be answered by looking everywhere. The
 * freshest entry per key wins.
 */
export function forgedSourceLedger(): Map<string, DeckMemorySource & { topic: string }> {
  const ledger = new Map<string, DeckMemorySource & { topic: string }>();
  for (const record of Object.values(readStore())) {
    for (const source of record.sources || []) {
      const existing = ledger.get(source.key);
      if (existing && existing.at >= source.at) continue;
      ledger.set(source.key, { ...source, topic: record.topic });
    }
  }
  return ledger;
}

/**
 * Records which sources built a topic's deck. Called after a forge lands, so
 * the next run can say "you already cut this lecture" before spending a model
 * call on it. Labels are refreshed, counts are the last run's, and the ledger
 * is capped so a long-lived topic cannot grow without bound.
 */
export function recordDeckSources(args: {
  topic: string;
  sources: { key: string; label?: string; cards?: number }[];
  timestamp?: number;
}): DeckMemorySource[] {
  const topic = (args.topic || '').trim();
  const incoming = (args.sources || []).filter((s) => s && s.key);
  if (!topic || incoming.length === 0) return [];

  const store = readStore();
  const id = memoryKeyForTopic(topic);
  const existing = store[id] || {
    topic,
    keys: [],
    updatedAt: 0,
    exports: 0,
  };
  const at = args.timestamp ?? Date.now();
  const byKey = new Map((existing.sources || []).map((s) => [s.key, s]));
  for (const source of incoming) {
    const prior = byKey.get(source.key);
    byKey.set(source.key, {
      key: source.key,
      label: (source.label || '').trim() || prior?.label || source.key,
      cards: typeof source.cards === 'number' ? source.cards : prior?.cards || 0,
      at,
    });
  }
  const sources = [...byKey.values()].sort((a, b) => b.at - a.at).slice(0, MAX_SOURCES_PER_TOPIC);
  store[id] = { ...existing, topic: existing.topic || topic, sources };
  writeStore(store);
  return sources;
}

/**
 * Replaces the whole local store. Used by the cloud mirror, which merges the
 * remote copy into the local one and then writes the result back — the merge
 * itself is {@link mergeDeckMemoryStores}, so it stays unit-testable without
 * Firebase.
 */
export function saveDeckMemoryStore(store: DeckMemoryStore): void {
  writeStore(store);
}

/**
 * Unions two memory stores topic by topic.
 *
 * This is deliberately additive rather than last-write-wins: the memory exists
 * to say "you already have this card", and clobbering one device's record with
 * the other's newer timestamp would resurrect a whole deck as "new" and let it
 * be exported a second time. Fingerprints are unioned, the export counter takes
 * the larger of the two, and the receipt comes from whichever record moved last.
 */
export function mergeDeckMemoryStores(local: DeckMemoryStore, remote: DeckMemoryStore): DeckMemoryStore {
  const merged: DeckMemoryStore = {};
  const topics = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);

  for (const id of topics) {
    const a = local?.[id];
    const b = remote?.[id];
    if (!a && !b) continue;
    if (!a) {
      merged[id] = b;
      continue;
    }
    if (!b) {
      merged[id] = a;
      continue;
    }
    const keys = [...b.keys, ...a.keys].filter((key, index, all) => all.indexOf(key) === index);
    const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
    merged[id] = {
      topic: a.topic || b.topic,
      keys: keys.slice(0, MAX_KEYS_PER_TOPIC),
      updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
      exports: Math.max(a.exports || 0, b.exports || 0),
      lastSurface: newer.lastSurface,
      // The source ledger unions like the fingers: forging this topic on a
      // second device is still material already cut, and dropping it would make
      // that device re-offer (and re-pay for) sources it has already seen.
      sources: mergeSourceLedgers(a.sources, b.sources),
    };
  }

  return merged;
}

/** True when two stores hold exactly the same memory. */
export function deckMemoryStoresEqual(a: DeckMemoryStore, b: DeckMemoryStore): boolean {
  const ids = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const id of ids) {
    const left = a?.[id];
    const right = b?.[id];
    if (!left || !right) return false;
    if (left.keys.length !== right.keys.length) return false;
    if (left.keys.some((key, index) => right.keys[index] !== key)) return false;
    if ((left.exports || 0) !== (right.exports || 0)) return false;
    if (!sourceLedgersEqual(left.sources, right.sources)) return false;
  }
  return true;
}

/** Newest entry per source key, newest first. */
function mergeSourceLedgers(
  a: DeckMemorySource[] | undefined,
  b: DeckMemorySource[] | undefined
): DeckMemorySource[] | undefined {
  const byKey = new Map<string, DeckMemorySource>();
  for (const source of [...(b || []), ...(a || [])]) {
    const existing = byKey.get(source.key);
    if (existing && existing.at > source.at) continue;
    byKey.set(source.key, source);
  }
  if (byKey.size === 0) return undefined;
  return [...byKey.values()].sort((x, y) => y.at - x.at).slice(0, MAX_SOURCES_PER_TOPIC);
}

function sourceLedgersEqual(a: DeckMemorySource[] | undefined, b: DeckMemorySource[] | undefined): boolean {
  const left = a || [];
  const right = b || [];
  if (left.length !== right.length) return false;
  return left.every((source, index) => source.key === right[index]?.key && source.at === right[index]?.at);
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
    confusablePairs: (report.confusablePairs || []).filter((card) => fresh.has(card.id)),
  };
}
