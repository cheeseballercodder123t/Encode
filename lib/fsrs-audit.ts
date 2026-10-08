import { AnkiCardItem } from './anki-exporter';

// ─── FSRS Card Audit ────────────────────────────────────────────────────────
// Deterministic, offline, zero-dependency quality gate that runs right before
// the user exports their cards to Anki. It flags two failure modes that the
// FSRS scheduler punishes hard:
//
//   • Too Long  : a cloze sentence with >15 words. FSRS will turn a dense,
//                 overloaded retrieval cue into a D=10 leech that eats review
//                 time forever.
//   • Ambiguous : a cloze deletion that admits more than one valid answer
//                 ({{Na+ or K+}}, {{A and B}}, {{c1::X}} … {{c1::Y}} on the
//                 same index). The student ends up guessing instead of recalling.
//
// Both checks are pure string heuristics so they run synchronously in the
// modal with no API key and no network.

export type CardAuditIssueKind = 'too_long' | 'ambiguous';

export interface CardAuditIssue {
  kind: CardAuditIssueKind;
  message: string;
  severity: number;
}

export const TOO_LONG_WORD_LIMIT = 15;

export const TOO_LONG_MESSAGE =
  '⚠️ This card is too dense. FSRS will turn this into a D=10 leech. Auto-split into two atomic cards.';
export const AMBIGUOUS_MESSAGE =
  "⚠️ Ambiguous retrieval cue. Specify the context so you don't guess.";

/** Strips HTML tags so word counts reflect what the student actually reads. */
export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Counts the meaningful words in a string. Cloze markers ({{c1::...}}) are
 * collapsed to their inner text first so they count as real words, not syntax.
 */
export function countWords(text: string): number {
  const noHtml = stripHtml(text);
  const noCloze = noHtml.replace(/\{\{c\d+::([^}]*)\}\}/g, '$1');
  const cleaned = noCloze.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').filter(Boolean).length;
}

/**
 * Returns true when a single cloze body admits multiple valid answers.
 *   1. An "or / | / ;" separator inside the deletion.
 *   2. Comma-separated multi-candidate.
 *   3. Two separate deletions sharing the same cloze index.
 */
export function isAmbiguousCloze(text: string): boolean {
  const clozeRe = /\{\{c(\d+)::([^}]*)\}\}/g;
  let match: RegExpExecArray | null;
  const byIndex: Record<string, string[]> = {};

  while ((match = clozeRe.exec(text)) !== null) {
    const index = match[1];
    const body = match[2].trim();
    byIndex[index] = byIndex[index] || [];
    byIndex[index].push(body);

    if (/\bor\b/i.test(body)) return true;
    if (/\|/.test(body)) return true;
    if (/\//.test(body)) return true;
    if (/;/.test(body)) return true;
    // Comma only flags ambiguity when it separates candidates (with a
    // conjunction) or lists 3+ items : a single comma inside "2,500 mL" must
    // not false-positive.
    if (/,/.test(body) && (/\bor\b|\band\b/i.test(body) || /,.*,/.test(body))) return true;
  }

  for (const bodies of Object.values(byIndex)) {
    if (bodies.length > 1) return true;
  }
  return false;
}

/**
 * The dense-card rule the file ships: the ONE definition of `LeechCandidate`.
 *
 * It counts the card's total notable text (front + back), because that is what
 * the note makes the learner read on every rep — the answer side of a dense
 * card is what turns a review into a wall of prose. The export funnel
 * (`sanitizeExtracted`) tags every card this asks true, and the completion
 * screen counts cards with the same function, so its "Dense (tagged)" number
 * IS the tag set the learner will filter on.
 *
 * Deliberately NOT the same question as {@link auditAnkiCard}: that one asks
 * whether a cloze's CUE (its front alone) is atomic, which is the one a control
 * can fix (the Split button shortens the front and nothing else). Same 15-word
 * constant, two questions — the funnel's tag and the sheet's flag each state
 * which one they answer, and a card can be dense-by-total-text while its cue is
 * clean, or the reverse.
 */
export function isLeechDense(card: AnkiCardItem): boolean {
  return countWords(`${card.front} ${card.back}`) > TOO_LONG_WORD_LIMIT;
}

export function auditAnkiCard(card: AnkiCardItem): CardAuditIssue[] {
  const issues: CardAuditIssue[] = [];
  const text = card.isCloze ? card.front : `${card.front} ${card.back}`;

  if (card.isCloze) {
    const words = countWords(text);
    if (words > TOO_LONG_WORD_LIMIT) {
      issues.push({ kind: 'too_long', message: TOO_LONG_MESSAGE, severity: words });
    }
    if (isAmbiguousCloze(text)) {
      issues.push({ kind: 'ambiguous', message: AMBIGUOUS_MESSAGE, severity: 1000 });
    }
  }
  return issues;
}

export interface AuditedCard {
  card: AnkiCardItem;
  issues: CardAuditIssue[];
}

/** Audits a whole deck, returning only the cards that have at least one issue. */
export function auditDeck(cards: AnkiCardItem[]): AuditedCard[] {
  const result: AuditedCard[] = [];
  for (const card of cards) {
    const issues = auditAnkiCard(card);
    if (issues.length > 0) result.push({ card, issues });
  }
  result.sort((a, b) => {
    const sa = Math.max(...a.issues.map((i) => i.severity));
    const sb = Math.max(...b.issues.map((i) => i.severity));
    return sb - sa;
  });
  return result;
}

export interface CardQuality {
  /** Word count of front+back combined (what FSRS actually schedules). */
  wordCount: number;
  /** Carries the `LeechCandidate` tag on export: {@link isLeechDense}. */
  isLeechCandidate: boolean;
  /** Stage was skipped, un-encoded, or the checker graded it needs_elaboration. */
  isUnfinished: boolean;
  /**
   * The export sheet's own `ambiguous` verdict ({@link auditAnkiCard}). Not a
   * tag: an ambiguous cue is a different defect and is acted on in the sheet,
   * which is why the trophy counts it separately from the tagged cards.
   */
  isAmbiguous: boolean;
}

/**
 * Classifies a single exported card for the handoff-quality report shown on
 * the completed screen ("N FSRS-ready cards · X leeches · Y unfinished").
 * Pure heuristic, zero network.
 *
 * Every claim the screen makes is anchored to something the learner can check:
 *
 *  • `isLeechCandidate` is {@link isLeechDense} — the `LeechCandidate` tag the
 *    file actually carries, because the screen's advice is "build a filtered
 *    deck from those tags". It used to be a *different* rule (`card.isCloze &&
 *    front + back > 15`) while the chip beside it said "Dense (tagged)": the
 *    number therefore missed every dense basic card, and — since the tag was
 *    only applied to one of the two export paths — most of the cards it did
 *    count carried no tag at all, so filtering on it returned nothing.
 *  • `isAmbiguous` is the export sheet's own verdict, and it is *not* a tag:
 *    the screen counts it separately rather than folding it into the tagged
 *    number, which is what made that number unactionable.
 *  • `wordCount` stays the whole card's count, which is what its doc says it is
 *    and is not a threshold on its own.
 */
export function classifyCardQuality(card: AnkiCardItem): CardQuality {
  const wordCount = countWords(`${card.front} ${card.back}`);
  return {
    wordCount,
    isLeechCandidate: isLeechDense(card),
    isUnfinished: card.tags.includes('Unfinished'),
    isAmbiguous: auditAnkiCard(card).some((issue) => issue.kind === 'ambiguous'),
  };
}

/**
 * Aggregates quality stats for a whole deck (used by the identity trophy).
 *
 * Every card lands in exactly ONE bucket, so `fsrsReady + unfinished +
 * leechCandidates + ambiguousCues === totalCards` always, and each number is a
 * set of cards a chip can name:
 *   unfinished (tagged) → dense (tagged `LeechCandidate`) → ambiguous (flagged
 *   in the export sheet, not tagged) → FSRS-ready. A card that is both dense
 *   and ambiguous stays in the dense bucket, because that is the tag it ships.
 */
export function classifyDeckQuality(cards: AnkiCardItem[]): {
  totalCards: number;
  fsrsReady: number;
  leechCandidates: number;
  unfinished: number;
  ambiguousCues: number;
  boundaryTraps: number;
} {
  let fsrsReady = 0;
  let leechCandidates = 0;
  let unfinished = 0;
  let ambiguousCues = 0;
  let boundaryTraps = 0;
  for (const card of cards) {
    const q = classifyCardQuality(card);
    if (card.tags.includes('BoundaryContrast')) boundaryTraps += 1;
    if (q.isUnfinished) unfinished += 1;
    else if (q.isLeechCandidate) leechCandidates += 1;
    else if (q.isAmbiguous) ambiguousCues += 1;
    else fsrsReady += 1;
  }
  return { totalCards: cards.length, fsrsReady, leechCandidates, unfinished, ambiguousCues, boundaryTraps };
}

/** A token that opens a clause: a cut in front of one reads as a new sentence. */
const CLAUSE_LEAD = /^(,|and|but|because|which|that|;)$/i;

/** Sentence-final punctuation, so a cut after one gets no second full stop. */
const SENTENCE_END = /[.!?]$/;

/**
 * Splits a dense cloze sentence into atomic cloze pieces, EACH at or under the
 * word limit, or returns null when no such split exists.
 *
 * The contract is arithmetic, and that is what the two-piece version got wrong.
 * Two halves can only cover `2 x TOO_LONG_WORD_LIMIT` words, so a 34-word
 * sentence split at its midpoint produced halves of 17 — both over the limit
 * the docstring promised, which is how a "fix" for a D=10 leech shipped two
 * cards that were still leeches. The number of pieces is therefore computed
 * from the sentence: `ceil(words / limit)`, balanced, and a sentence counts as
 * split only when every piece fits.
 *
 * Strategy, applied to every cut in turn:
 *   1. Split after a sentence boundary (. ! ?) when one is available.
 *   2. Otherwise split in front of a clause connector (and, but, because…).
 *   3. Otherwise cut at the safe boundary nearest the balanced target.
 * A cut is only considered when it keeps the piece at or under the limit AND
 * leaves the rest of the sentence splittable, so the count stays minimal and no
 * piece can come back over the limit.
 *
 * Existing cloze markers are preserved and re-numbered sequentially (c1, c2, …)
 * so every piece stays a valid Anki cloze. Pieces are suffixed `-split-a`,
 * `-split-b`, … in reading order. Returns null when the card is not a cloze,
 * when it is already short enough to leave alone, or when a single deletion
 * body carries more than the limit on its own — that card cannot be made
 * atomic without splitting a deletion, which would change its answer, so the
 * caller is expected to hold it back instead of shipping it dense.
 *
 * Only the front is split: the back travels with every piece, exactly as the
 * two-piece splitter behaved.
 */
export function splitDenseCloze(card: AnkiCardItem): AnkiCardItem[] | null {
  if (!card.isCloze) return null;
  const text = card.front;
  if (countWords(text) <= TOO_LONG_WORD_LIMIT) return null;

  const stripped = stripHtml(text);
  const tokens = stripped.split(' ').filter(Boolean);
  if (tokens.length < 2) return null;

  const limit = TOO_LONG_WORD_LIMIT;
  const total = tokens.length;
  const maxCut = total - 1;

  // A `{{c1::thick ascending limb}}` is SEVERAL whitespace tokens, so a naive
  // split can land inside the deletion and leave a dangling `{{c1::` on one
  // piece — a card neither Anki nor RemNote can read. These are the token
  // boundaries where no deletion is open.
  const safe = new Set<number>();
  let open = 0;
  for (let i = 0; i < maxCut; i++) {
    open += (tokens[i].match(/\{\{c\d+::/g) || []).length;
    open -= (tokens[i].match(/\}\}/g) || []).length;
    if (open === 0) safe.add(i + 1);
  }

  /**
   * The cut that ends the piece starting at `start`, given how many pieces the
   * rest of the sentence is allowed to take.
   *
   * `furthest` is the greedy fallback: the last safe boundary this piece can
   * reach. When a deletion spans past it there is no cut here at all, and the
   * sentence genuinely cannot be brought under the limit — the caller is told
   * null rather than handed a piece that breaks its own contract.
   */
  const cutFor = (start: number, piecesLeft: number): number => {
    const hi = Math.min(start + limit, maxCut);
    let furthest = -1;
    for (let at = hi; at > start; at--) {
      if (safe.has(at)) {
        furthest = at;
        break;
      }
    }
    if (furthest === -1) return -1;

    // Keep the pieces balanced, but never at the cost of the count the rest of
    // the sentence still needs: `lo` is the earliest cut that leaves every
    // remaining piece room to fit as well.
    const lo = Math.max(start + 1, total - (piecesLeft - 1) * limit);
    const ideal = start + Math.round((total - start) / piecesLeft);
    let sentence = -1;
    let clause = -1;
    let nearest = -1;
    for (let at = lo; at <= hi; at++) {
      if (!safe.has(at)) continue;
      const distance = Math.abs(at - ideal);
      if (nearest === -1 || distance < Math.abs(nearest - ideal)) nearest = at;
      if (SENTENCE_END.test(tokens[at - 1]) && (sentence === -1 || distance < Math.abs(sentence - ideal))) {
        sentence = at;
      }
      if (CLAUSE_LEAD.test(tokens[at]) && (clause === -1 || distance < Math.abs(clause - ideal))) {
        clause = at;
      }
    }
    return sentence !== -1 ? sentence : clause !== -1 ? clause : nearest !== -1 ? nearest : furthest;
  };

  const cuts: number[] = [];
  let start = 0;
  while (total - start > limit) {
    const piecesLeft = Math.ceil((total - start) / limit);
    const cut = cutFor(start, piecesLeft);
    if (cut === -1) return null;
    cuts.push(cut);
    start = cut;
  }

  const baseSm2 = card.sm2;
  const make = (front: string, index: number): AnkiCardItem => ({
    ...card,
    id: `${card.id}-split-${index < 26 ? String.fromCharCode(97 + index) : String(index + 1)}`,
    front,
    sm2: { ...baseSm2 },
  });

  const bounds = [...cuts, total];
  const pieces: AnkiCardItem[] = [];
  let from = 0;
  bounds.forEach((to, index) => {
    // A piece that stops mid-sentence gets the full stop the two-piece splitter
    // has always given its left half; one that already ends a sentence keeps
    // its own punctuation instead of becoming "sentence..".
    const body = tokens.slice(from, to).join(' ');
    const finished = index === bounds.length - 1 || SENTENCE_END.test(body);
    pieces.push(make(renumberCloze(finished ? body : `${body}.`), index));
    from = to;
  });
  return pieces;
}

/** Re-numbers {{cN::...}} markers sequentially starting at c1. */
function renumberCloze(text: string): string {
  let n = 0;
  return text.replace(/\{\{c\d+::([^}]*)\}\}/g, (_m, body) => {
    n += 1;
    return `{{c${n}::${body}}}`;
  });
}
