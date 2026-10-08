// ─── Mr M mode: the paradox ledger and the engineering patch registry ───────
//
// Two durable records live here, because they are the same idea seen from two
// sides and splitting them would put half the story in a second file.
//
// THE PARADOX LEDGER holds what is still OPEN. Most learners can meet a
// contradiction, shrug, and memorise the exception for the test. This one
// cannot: a live contradiction halts everything downstream until it is closed.
// That is not a quirk to work around — it is the trait that makes the
// understanding real — so contradictions become first-class records that are
// raised, held in plain sight, and explicitly resolved.
//
// THE PATCH REGISTRY holds what has been CLOSED. Every diagnosed micro-fracture
// is a defect report against the learner's own reasoning, and a defect that
// fires once is a slip while the same one firing three times is a standing
// fault worth a pre-flight warning. So a patch is not a memory: it RE-OPENS,
// incrementing its hit count, which is what lets the warning say how many times
// the fracture has actually fired instead of guessing.
//
// Kept in localStorage rather than IndexedDB on purpose, matching
// `interference-traps.ts`: these are short, ordered lists that the workbench
// reads synchronously during render, and both an unresolved paradox and a
// standing fault have to be visible on the very first paint of a stage.

import { DISCREPANCY_LABELS, type DiscrepancyKind, type ParadoxEntry, type PatchEntry } from './types';

const STORAGE_KEY = 'deepencode_mr_m_paradox_v1';

/** Oldest entries fall off the list; forty open contradictions is not a study plan. */
const MAX_ENTRIES = 40;

const PATCH_STORAGE_KEY = 'deepencode_mr_m_patches_v1';

/**
 * What falls off the list when it overflows: the LEAST significant records —
 * fewest hits, then the oldest sighting (see `trimPatches`). Deliberately not
 * array position: a repeat keeps its first-seen slot (so `patchNumbers` never
 * renumbers), which makes position neither age nor importance, and evicting by
 * it destroyed a five-hit standing fault in favour of sixty one-off slips.
 */
const MAX_PATCHES = 60;

/** Hits at which a fracture stops being a slip and becomes a standing fault. */
export const REPEAT_HITS = 2;

/** A warning you scroll past is not a warning. */
export const MAX_PREFLIGHT = 3;

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
 * Closed paradoxes that carry the sentence that closed them, newest resolution
 * first. These are what the export funnel turns into cards: the ledger itself
 * says the resolution is worth more on review than the answer was, and an
 * entry closed without a sentence has nothing honest to review, so it does not
 * ship. Never throws; safe outside the browser.
 */
export function resolvedParadoxes(all: ParadoxEntry[] = loadParadoxes()): ParadoxEntry[] {
  return all
    .filter((entry) => entry.resolvedAt && entry.resolution)
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
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

// ─── The engineering patch registry ────────────────────────────────────────

function isDiscrepancyKind(value: unknown): value is DiscrepancyKind {
  return typeof value === 'string' && value in DISCREPANCY_LABELS;
}

/** Every recorded patch, newest first. Never throws. */
export function loadPatches(): PatchEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(PATCH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PatchEntry =>
        !!entry &&
        typeof entry.id === 'string' &&
        typeof entry.statement === 'string' &&
        isDiscrepancyKind(entry.kind) &&
        typeof entry.lastSeenAt === 'number'
    );
  } catch {
    return [];
  }
}

/** Hits, read defensively: a hand-edited or older store cannot be vouched for. */
function hitCount(patch: PatchEntry): number {
  const hits = (patch as { hits?: unknown }).hits;
  return typeof hits === 'number' && Number.isFinite(hits) ? Math.max(0, hits) : 0;
}

/** The sighting that orders two equally-repeated faults, defended the same way. */
function lastSighting(patch: PatchEntry): number {
  return Number.isFinite(patch.lastSeenAt) ? patch.lastSeenAt : 0;
}

/**
 * The registry's own value function: a fracture that keeps firing outranks one
 * that fired once — that is exactly what makes it a standing fault rather than
 * a slip — and between equals the more recent sighting wins.
 *
 * It has to be applied EXPLICITLY, because the stored array is in first-seen
 * order: `recordPatch` re-opens a repeat in place, which is also what keeps
 * `patchNumbers` stable ("a number a learner has already seen does not move").
 * Array position is therefore neither an age nor an importance, and both readers
 * below used to treat it as one.
 *
 * The sort is stable, so a genuine tie on both numbers keeps first-seen order.
 */
function bySignificance(a: PatchEntry, b: PatchEntry): number {
  const hits = hitCount(b) - hitCount(a);
  return hits !== 0 ? hits : lastSighting(b) - lastSighting(a);
}

/**
 * The records to keep when the registry overflows, written back in the order
 * they arrived in.
 *
 * The survivors are chosen by significance, so the cap can never destroy a
 * standing fault in favour of one-off slips — the failure the pre-flight exists
 * to prevent — while the first-seen order is preserved for the armory's numbers.
 */
function trimPatches(entries: PatchEntry[]): PatchEntry[] {
  if (entries.length <= MAX_PATCHES) return entries;
  const survivors = new Set(
    [...entries].sort(bySignificance).slice(0, MAX_PATCHES).map((entry) => entry.id)
  );
  return entries.filter((entry) => survivors.has(entry.id));
}

function savePatches(entries: PatchEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(PATCH_STORAGE_KEY, JSON.stringify(trimPatches(entries)));
  } catch {
    /* best-effort: a full quota must never block the stage */
  }
}

/**
 * Stable numbering for the armory: the OLDEST patch is #1, so a number a
 * learner has already seen does not move when a newer patch is recorded.
 */
export function patchNumbers(all: PatchEntry[] = loadPatches()): Record<string, number> {
  const numbers: Record<string, number> = {};
  for (let index = 0; index < all.length; index += 1) {
    // `loadPatches` is newest-first, so the last entry is #1.
    numbers[all[all.length - 1 - index].id] = index + 1;
  }
  return numbers;
}

/** Every patch recorded against one topic, newest first. */
export function patchesFor(topic: string, all: PatchEntry[] = loadPatches()): PatchEntry[] {
  const key = normalizeTopic(topic);
  if (!key) return [];
  return all.filter((entry) => normalizeTopic(entry.topic) === key);
}

/**
 * Records one diagnosed fracture. The same fracture on the same topic RE-OPENS
 * its record and increments the hit count instead of stacking a near-duplicate,
 * which is what makes the pre-flight warning able to say how many times it has
 * fired. A blank statement is refused: a patch with nothing to do differently is
 * the verdict this registry exists to replace.
 */
export function recordPatch(
  input: {
    topic: string;
    kind: DiscrepancyKind;
    statement: string;
    arithmeticReveal?: string;
    learnerValue?: number | null;
    expectedValue?: number | null;
  },
  now: number = Date.now()
): PatchEntry | null {
  const statement = (input.statement || '').replace(/\s+/g, ' ').trim();
  if (!statement || !isDiscrepancyKind(input.kind)) return null;

  const cleanTopic = (input.topic || '').trim() || 'Untitled';
  const existing = loadPatches();
  const sameTopic = normalizeTopic(cleanTopic);
  const index = existing.findIndex(
    (entry) => entry.kind === input.kind && normalizeTopic(entry.topic) === sameTopic
  );

  if (index >= 0) {
    const reopened: PatchEntry = {
      ...existing[index],
      // The statement is NOT overwritten. It is the one field in the record the
      // learner wrote themselves — a later hit moving it back to the scaffold
      // would delete the sentence they intend to act on, which is the whole
      // reason the field is editable. Only the measured half moves.
      arithmeticReveal: (input.arithmeticReveal || '').trim(),
      learnerValue: input.learnerValue ?? null,
      expectedValue: input.expectedValue ?? null,
      hits: existing[index].hits + 1,
      lastSeenAt: now,
    };
    const next = [...existing];
    next[index] = reopened;
    savePatches(next);
    return reopened;
  }

  const entry: PatchEntry = {
    id: `patch-${now}-${Math.random().toString(36).slice(2, 8)}`,
    topic: cleanTopic,
    kind: input.kind,
    statement,
    arithmeticReveal: (input.arithmeticReveal || '').trim(),
    hits: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    learnerValue: input.learnerValue ?? null,
    expectedValue: input.expectedValue ?? null,
  };
  savePatches([entry, ...existing]);
  return entry;
}

/** Replaces the one-line patch. It is the learner's own sentence, so it is kept
 * verbatim — this is the one field in the record that is not computed. */
export function updatePatchStatement(id: string, statement: string): void {
  const clean = (statement || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const existing = loadPatches();
  const index = existing.findIndex((entry) => entry.id === id);
  if (index < 0) return;
  const next = [...existing];
  next[index] = { ...existing[index], statement: clean };
  savePatches(next);
}

export function clearPatches(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(PATCH_STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

/** One standing fault, ready to be drawn as a pre-flight warning. */
export interface PreflightWarning {
  patch: PatchEntry;
  /** e.g. `SIGN_FLIP has fired 3 times on Thermochemistry.` */
  headline: string;
  /** The patch line to keep anchored. */
  line: string;
}

/**
 * The warnings that belong in front of a new problem on this topic.
 *
 * Only a REPEATED fracture warns: one hit is a slip and a wall of slips read as
 * noise, so a fracture has to have fired at least twice before it is allowed to
 * get in the way of a new attempt. Ranked by significance — most-fired first,
 * then the most recent sighting — and capped, because a warning you scroll past
 * is not a warning and the LIVE fault must not lose its slot to a staler one.
 */
export function preflightWarnings(
  topic: string,
  all: PatchEntry[] = loadPatches()
): PreflightWarning[] {
  return warningsFrom(patchesFor(topic, all));
}

/**
 * The same rule, applied to a list that has already been selected.
 *
 * Split out so a panel that was HANDED its patches (the Mr M surface, which
 * reads the ledger once in the workbench rather than per render) draws exactly
 * the warnings a caller reading storage would get. Two implementations of "what
 * counts as standing" would eventually disagree, and the disagreement would
 * show up as a warning on one screen and not the other.
 *
 * The ranking is {@link bySignificance}, never array position: the list it is
 * handed is in first-seen order (see `patchesFor`), so its position says nothing
 * about how often, or how recently, the fracture actually fired. `filter` hands
 * this function its own array, so sorting it cannot reorder the caller's ledger.
 */
export function warningsFrom(patches: PatchEntry[]): PreflightWarning[] {
  return patches
    .filter((patch) => hitCount(patch) >= REPEAT_HITS)
    .sort(bySignificance)
    .slice(0, MAX_PREFLIGHT)
    .map((patch) => ({
      patch,
      headline: `${DISCREPANCY_LABELS[patch.kind]} has fired ${patch.hits} times on ${patch.topic}.`,
      line: patch.statement,
    }));
}
