import { AnkiCardItem } from './anki-exporter';
import { countWords, stripHtml, splitDenseCloze } from './fsrs-audit';

// ─── Wozniak's 20 Rules : automated card sanitization ───────────────────────
// AI-generated (and human-written) cards fail in FSRS mostly for three
// mechanical reasons: they carry more than one idea, they are too wordy, and
// they only test the causal link in one direction. This module enforces three
// deterministic rules before anything reaches Anki:
//
//   1. The 1-Idea Rule       : a back containing a clause-joining "and"
//                              becomes two cards, one idea each.
//   2. The 20-Word Ceiling   : front + back over 20 words is refused from the
//                              export (held back) after auto-splitting fails.
//   3. Two-Way Cloze Symmetry: every causal link A → B also gets a reverse
//                              card clozing B, so recall is bidirectional.

/** Hard export ceiling for front + back word count (minimum information principle). */
export const WOZNIAK_WORD_CEILING = 20;

/** Verbs that mark a causal link worth a symmetric card. */
const CAUSAL_VERB_SRC =
  '(causes?|caused|triggers?|triggered|produces?|produced|leads? to|led to|results? in|resulted in|drives?|inhibits?|prevents?|enables?)';

export interface WozniakHeldCard {
  card: AnkiCardItem;
  reason: string;
}

export interface WozniakResult {
  /** Sanitized deck: split, symmetric, and under the ceiling. */
  cards: AnkiCardItem[];
  /** Cards refused by the 20-word ceiling (nothing could chunk them safely). */
  heldBack: WozniakHeldCard[];
  /** Number of extra reverse cards added by two-way symmetry. */
  addedSymmetric: number;
}

/** True when the coordinating "and" joins two clause-sized ideas (not "Na and K"). */
function isClauseAnd(text: string): { left: string; right: string } | null {
  const plain = stripHtml(text);
  const re = /\s+and\s+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    const left = plain.slice(0, m.index).trim();
    const right = plain.slice(m.index + m[0].length).trim();
    const leftWords = left.split(/\s+/).filter(Boolean).length;
    const rightWords = right.split(/\s+/).filter(Boolean).length;
    // Both sides must read like clauses, and the left must end a thought.
    if (leftWords >= 3 && rightWords >= 3 && /[.!?;:]$|[a-z)]$/i.test(left)) {
      return { left, right };
    }
  }
  return null;
}

/**
 * Rule 1 : the 1-Idea Rule. A back that joins two ideas with "and" becomes
 * two cards sharing the front (the shared cue); each half of the back becomes
 * one atomic answer. Cloze fronts pass through untouched — the deletion lives
 * on the front, not the back.
 */
export function splitOneIdea(card: AnkiCardItem): AnkiCardItem[] {
  const split = isClauseAnd(card.back);
  if (!split) return [card];
  const mk = (back: string, suffix: string): AnkiCardItem => ({
    ...card,
    id: `${card.id}-idea-${suffix}`,
    back,
    tags: [...card.tags, 'WozniakSplit'],
    sm2: { ...card.sm2 },
  });
  return [mk(split.left, 'a'), mk(split.right, 'b')];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Rule 3 : two-way cloze symmetry. For every causal link "A causes B" in the
 * card's readable text, emit a reverse card that clozes B. The mechanism text
 * travels on the reverse back so both directions rehearse the same physics.
 */
export function buildSymmetricCard(card: AnkiCardItem): AnkiCardItem | null {
  const source = stripHtml(card.isCloze ? card.front : card.back);
  // Collapse cloze markers to their bodies so the sentence still parses.
  const plain = source.replace(/\{\{c\d+::([^}]*)\}\}/g, '$1');
  const m = plain.match(
    new RegExp(
      `([A-Za-z][\\w\\s'()/-]{2,60}?)\\s+${CAUSAL_VERB_SRC}\\s+([A-Za-z][\\w\\s'()/-]{2,60}?)[.,;]?\\s*$`,
      'i'
    )
  );
  if (!m) return null;
  const cause = m[1].trim().replace(/\s+/g, ' ');
  const effect = m[2].trim().replace(/\s+/g, ' ');
  if (!cause || !effect) return null;

  const front = `<b>Reverse direction</b><br>${escapeHtml(cause)} causes {{c1::${escapeHtml(effect)}}}`;
  const back = `${escapeHtml(card.isCloze ? card.back : card.front)}<br><i>Both directions must recall — interference dies when recall is symmetric.</i>`;
  return {
    id: `${card.id}-reverse`,
    front,
    back,
    isCloze: true,
    tags: [...card.tags, 'TwoWayCloze'],
    sm2: { ...card.sm2 },
  };
}

/** Applies the 20-word ceiling: auto-split clozes first, hold back the rest. */
function enforceCeiling(card: AnkiCardItem, cardsOut: AnkiCardItem[], heldBack: WozniakHeldCard[]): void {
  const total = countWords(`${card.front} ${card.back}`);
  if (total <= WOZNIAK_WORD_CEILING) {
    cardsOut.push(card);
    return;
  }
  // Try the existing dense-cloze splitter (sentence/clause-aware) first.
  const splitPair = splitDenseCloze(card);
  if (splitPair) {
    for (const half of splitPair) {
      const halfWords = countWords(`${half.front} ${half.back}`);
      if (halfWords <= WOZNIAK_WORD_CEILING) {
        cardsOut.push(half);
      } else {
        heldBack.push({ card: half, reason: `${halfWords} words even after auto-split` });
      }
    }
    return;
  }
  heldBack.push({ card, reason: `${total} words — chunk it into smaller cards` });
}

/**
 * Full sanitizer pass, applied in order:
 * 1-idea split → symmetric reverse cards → 20-word ceiling.
 * Deterministic and offline; safe to run on every export.
 */
export function sanitizeForWozniak(cards: AnkiCardItem[], opts?: { addSymmetric?: boolean }): WozniakResult {
  const addSymmetric = opts?.addSymmetric !== false;
  const heldBack: WozniakHeldCard[] = [];
  const cardsOut: AnkiCardItem[] = [];
  let addedSymmetric = 0;

  for (const card of cards) {
    for (const piece of splitOneIdea(card)) {
      enforceCeiling(piece, cardsOut, heldBack);
      if (addSymmetric) {
        const reverse = buildSymmetricCard(piece);
        if (reverse) {
          addedSymmetric += 1;
          enforceCeiling(reverse, cardsOut, heldBack);
        }
      }
    }
  }

  return { cards: cardsOut, heldBack, addedSymmetric };
}
