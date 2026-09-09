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

/**
 * Splits a dense cloze sentence into two atomic cloze sentences, each at or
 * under the word limit. Strategy:
 *   1. Split on a sentence boundary (. ! ?) in the second half.
 *   2. Otherwise split on a clause connector near the midpoint.
 *   3. Otherwise hard-split at the midpoint word.
 *
 * Existing cloze markers are preserved and re-numbered sequentially (c1, c2)
 * so the resulting two cards stay valid Anki clozes. Returns null when the
 * card is not a cloze or is already short enough to leave alone.
 */
export function splitDenseCloze(card: AnkiCardItem): [AnkiCardItem, AnkiCardItem] | null {
  if (!card.isCloze) return null;
  const text = card.front;
  if (countWords(text) <= TOO_LONG_WORD_LIMIT) return null;

  const stripped = stripHtml(text);
  const midpoint = Math.ceil(countWords(stripped) / 2);

  const tokens = stripped.split(' ').filter(Boolean);
  if (tokens.length < 2) return null;

  let splitAt = -1;

  // 1. Sentence boundary in the second half.
  for (let i = midpoint; i < tokens.length; i++) {
    if (/[.!?]$/.test(tokens[i])) {
      splitAt = i + 1;
      break;
    }
  }

  // 2. Clause connector near the midpoint (±2 words).
  if (splitAt === -1) {
    const clauseRe = /^(,|and|but|because|which|that|;)$/i;
    for (let delta = 0; delta <= 2; delta++) {
      const lo = midpoint - delta;
      const hi = midpoint + delta;
      if (hi < tokens.length && clauseRe.test(tokens[hi])) {
        splitAt = hi;
        break;
      }
      if (lo >= 0 && clauseRe.test(tokens[lo])) {
        splitAt = lo;
        break;
      }
    }
  }

  // 3. Hard midpoint fallback.
  if (splitAt === -1 || splitAt >= tokens.length) splitAt = midpoint;

  const leftText = tokens.slice(0, splitAt).join(' ');
  const rightText = tokens.slice(splitAt).join(' ');

  const left = renumberCloze(`${leftText}.`);
  const right = renumberCloze(rightText);

  const baseSm2 = card.sm2;
  const make = (front: string, idSuffix: string): AnkiCardItem => ({
    ...card,
    id: `${card.id}-split-${idSuffix}`,
    front,
    sm2: { ...baseSm2 },
  });

  return [make(left, 'a'), make(right, 'b')];
}

/** Re-numbers {{cN::...}} markers sequentially starting at c1. */
function renumberCloze(text: string): string {
  let n = 0;
  return text.replace(/\{\{c\d+::([^}]*)\}\}/g, (_m, body) => {
    n += 1;
    return `{{c${n}::${body}}}`;
  });
}
