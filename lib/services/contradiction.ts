import { DeclarativeFactItem } from '@/lib/types';

// ─── Cross-source contradictions ────────────────────────────────────────────
//
// When you forge a deck from four PDFs and two lectures, the sources disagree:
// the slide says the half-life is 4 h, the lecture says 6 h. Merging them
// quietly keeps whichever arrived first, which is the worst possible outcome —
// the deck teaches a coin flip and marks it as fact.
//
// So the merge looks for two claims that share a subject but not their
// contents, and replaces the pair with ONE conflict card that names both
// sources. Detection is deliberately conservative and fully offline:
//
//   numeric   the same sentence with a different quantity in it
//             ("... reaches 1,200 mOsm" vs "... reaches 900 mOsm")
//   polarity  the same sentence with an antonym or a negation flipped
//             ("insulin lowers glucose" vs "insulin raises glucose")
//
// A conflict card is a discrimination pair (two answers, one cue), so it is
// tagged `Contradiction` and protected from the Wozniak splitter the same way a
// hypercorrection trap is.

export const CONTRADICTION_TAG = 'Contradiction';

export type ContradictionKind = 'numeric' | 'polarity';

export interface ClaimInput {
  /** Card id (namespaced with its source by the forge). */
  id: string;
  /** The claim as written, cloze markers and all. */
  text: string;
  sourceId: string;
  sourceLabel: string;
}

export interface ContradictionClaim {
  id: string;
  sourceId: string;
  sourceLabel: string;
  text: string;
  /** Normalized numeric tokens (`"1200 mosm"`, `"4 h"`). */
  values: string[];
}

export interface Contradiction {
  id: string;
  kind: ContradictionKind;
  /** Normalized subject shared by both claims (matching key, not prose). */
  subject: string;
  /** One line for the log: what exactly disagrees. */
  summary: string;
  claims: [ContradictionClaim, ContradictionClaim];
  /** The card that replaces the pair, ready for the export funnel. */
  card: DeclarativeFactItem;
}

/** Units worth treating as part of a quantity (so `4 h` ≠ `4 min`). */
const UNIT_SRC = '(?:%|[a-zA-Zµ°][a-zA-Z0-9µ°]*\\/?)';
const NUMBER_RE = new RegExp(`(-?\\d[\\d.,]*)\\s*(${UNIT_SRC}|)`, 'g');

/** Antonym pairs that flip the meaning of an otherwise identical claim. */
const ANTONYMS: [string, string][] = [
  ['increase', 'decrease'],
  ['increases', 'decreases'],
  ['increased', 'decreased'],
  ['raise', 'lower'],
  ['raises', 'lowers'],
  ['raised', 'lowered'],
  ['higher', 'lower'],
  ['high', 'low'],
  ['up', 'down'],
  ['opens', 'closes'],
  ['open', 'closed'],
  ['inhibits', 'activates'],
  ['inhibition', 'activation'],
  ['activates', 'deactivates'],
  ['always', 'never'],
  ['faster', 'slower'],
  ['faster', 'slower'],
  ['before', 'after'],
  ['exothermic', 'endothermic'],
  ['acidic', 'basic'],
  ['reversible', 'irreversible'],
  ['agonist', 'antagonist'],
  ['positive', 'negative'],
  ['increases', 'reduces'],
  ['lowers', 'raises'],
];

const NEGATIONS = new Set(['not', 'no', 'never', 'cannot', "can't", "doesn't", "isn't", "aren't", 'without']);

/**
 * Dropped from the matching key only: negations (they ARE the conflict) and the
 * bare auxiliaries that carry no content ("the pump does not reverse" and "the
 * pump reverses" have to meet). Articles and content words stay, so unrelated
 * claims on the same topic do not collapse into one another.
 */
const KEY_DROP = new Set([
  ...NEGATIONS,
  'do',
  'does',
  'doe', // 'does' after the light stemmer
  'did',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'will',
  'would',
  'can',
  'could',
  'may',
  'might',
  'must',
  'has',
  'have',
  'had',
]);

/** Every antonym word, stemmed, so a grouping key can collapse the two sides. */
const ANTONYM_STEMS = new Set(ANTONYMS.flatMap(([a, b]) => [stemToken(a), stemToken(b)]));

/** Strips `{{c1::term}}` / `{{term}}` down to the term itself. */
export function stripCloze(text: string): string {
  return (text || '')
    .replace(/\{\{c\d+::([^}]*)\}\}/g, '$1')
    .replace(/\{\{([^}]*)\}\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `"1,200 mOsm"` → `"1200 mosm"`. Returned in reading order. */
export function claimValues(text: string): string[] {
  const plain = stripCloze(text);
  const out: string[] = [];
  for (const match of plain.matchAll(NUMBER_RE)) {
    const raw = match[1];
    if (!raw) continue;
    const number = raw.replace(/,/g, '').replace(/\.$/, '');
    const unit = (match[2] || '').toLowerCase().replace(/[^a-z0-9µ°%/]/g, '');
    out.push(unit ? `${number} ${unit}` : number);
  }
  return out;
}

/**
 * Light stemmer, so `reverse`/`reverses`, `lower`/`lowers` and `raise`/`raises`
 * meet somewhere. Both sides of every comparison go through it, so any
 * consistent transformation does the job — this one is just short.
 */
export function stemToken(token: string): string {
  let stemmed = token;
  if (stemmed.length >= 5 && stemmed.endsWith('es')) stemmed = stemmed.slice(0, -2);
  else if (stemmed.length >= 4 && stemmed.endsWith('s')) stemmed = stemmed.slice(0, -1);
  if (stemmed.length >= 4 && stemmed.endsWith('e')) stemmed = stemmed.slice(0, -1);
  return stemmed;
}

/** Raw word tokens (numbers kept, stemmed) — used for the soft similarity check. */
function rawTokens(text: string): string[] {
  return stripCloze(text)
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stemToken);
}

/**
 * The matching key for a claim: cloze markers removed, every quantity replaced
 * by a single `#`, antonyms collapsed to `@`, negations dropped. Two claims
 * sharing this key are talking about the same thing — which is exactly what
 * makes a difference between them meaningful instead of a coincidence.
 */
export function claimSubject(text: string): string {
  const flattened = stripCloze(text)
    .toLowerCase()
    .replace(NUMBER_RE, ' # ')
    .replace(/[^a-z0-9#\s]/g, ' ');
  return flattened
    .split(/\s+/)
    .filter(Boolean)
    .map(stemToken)
    .filter((token) => !KEY_DROP.has(token))
    .map((token) => (ANTONYM_STEMS.has(token) ? '@' : token))
    .join(' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(rawTokens(text).filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  a.forEach((token) => {
    if (b.has(token)) shared += 1;
  });
  return shared / (a.size + b.size - shared);
}

/** Which side of an antonym pair a claim sits on, if any. */
function antonymSides(a: string, b: string): [string, string] | null {
  const left = new Set(rawTokens(a));
  const right = new Set(rawTokens(b));
  for (const [x, y] of ANTONYMS) {
    if (left.has(stemToken(x)) && right.has(stemToken(y))) return [x, y];
    if (left.has(stemToken(y)) && right.has(stemToken(x))) return [y, x];
  }
  return null;
}

function hasNegation(text: string): boolean {
  return stripCloze(text)
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .some((word) => NEGATIONS.has(word));
}

function clip(text: string, max = 120): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function sameValues(a: string[], b: string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/**
 * Builds the card that replaces a conflicting pair.
 *
 * The front is the shared sentence with the disputed value blanked, so the card
 * makes you decide rather than asking you to remember one arbitrary source. The
 * back keeps BOTH claims with their attribution, and the cloze carries the two
 * competing values so the RemNote/segmented paths render the same conflict.
 */
export function buildContradictionCard(contradiction: Omit<Contradiction, 'card'>): DeclarativeFactItem {
  const [a, b] = contradiction.claims;
  const base = stripCloze(a.text);
  const blanked =
    contradiction.kind === 'numeric'
      ? base.replace(NUMBER_RE, (full, num: string) => full.replace(num, '___'))
      : base;

  const detail = `${clip(a.text, 160)} — ${a.sourceLabel} · ${clip(b.text, 160)} — ${b.sourceLabel}`;
  const clozeValues =
    contradiction.kind === 'numeric'
      ? contradiction.claims.flatMap((claim) => claim.values.map((v) => `{{${v} — ${claim.sourceLabel}}}`)).join(' or ')
      : `{{${a.text.replace(/\.$/, '')} — ${a.sourceLabel}}} or {{${b.text.replace(/\.$/, '')} — ${b.sourceLabel}}}`;

  return {
    id: contradiction.id,
    factStatement: detail,
    clozeSuggestion: `Sources disagree: ${blanked || detail} Resolve: ${clozeValues}.`,
    question: `Sources disagree: ${clip(blanked || detail, 110)} Which is right?`,
    tag: CONTRADICTION_TAG,
    memoryHook: 'Resolve this before the exam — two of your sources cannot both be right.',
  };
}

/**
 * Finds contradictions across a set of claims. Claims are grouped by subject
 * first (cheap), then compared pairwise inside a group: a different quantity is
 * a `numeric` conflict, a flipped antonym or negation on otherwise overlapping
 * wording is a `polarity` conflict. Only claims from DIFFERENT sources count —
 * a single source contradicting itself is a generation bug, not an exam trap.
 */
export function detectContradictions(claims: ClaimInput[], maxConflicts = 8): Contradiction[] {
  const groups = new Map<string, ClaimInput[]>();
  for (const claim of claims) {
    const subject = claimSubject(claim.text);
    if (!subject || subject.replace(/[#\s]/g, '').length < 3) continue;
    const bucket = groups.get(subject);
    if (bucket) bucket.push(claim);
    else groups.set(subject, [claim]);
  }

  const found: Contradiction[] = [];
  const usedIds = new Set<string>();

  for (const [subject, group] of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.sourceId === b.sourceId) continue;
        if (usedIds.has(a.id) || usedIds.has(b.id)) continue;

        const valuesA = claimValues(a.text);
        const valuesB = claimValues(b.text);
        let kind: ContradictionKind | null = null;
        let summary = '';

        if (!sameValues(valuesA, valuesB)) {
          kind = 'numeric';
          summary = `${valuesA.join(' / ') || '—'} vs ${valuesB.join(' / ') || '—'}`;
        } else {
          const sides = antonymSides(a.text, b.text);
          const negationFlip = hasNegation(a.text) !== hasNegation(b.text);
          if ((sides || negationFlip) && jaccard(tokenSet(a.text), tokenSet(b.text)) >= 0.6) {
            kind = 'polarity';
            summary = sides ? `${sides[0]} vs ${sides[1]}` : 'one claim is negated, the other is not';
          }
        }

        if (!kind) continue;

        const claim = (input: ClaimInput, values: string[]): ContradictionClaim => ({
          id: input.id,
          sourceId: input.sourceId,
          sourceLabel: input.sourceLabel,
          text: stripCloze(input.text),
          values,
        });

        const base: Omit<Contradiction, 'card'> = {
          id: `conflict-${found.length + 1}-${subject.slice(0, 24).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
          kind,
          subject,
          summary: clip(summary, 90),
          claims: [claim(a, valuesA), claim(b, valuesB)],
        };
        found.push({ ...base, card: buildContradictionCard(base) });

        usedIds.add(a.id);
        usedIds.add(b.id);
        if (found.length >= maxConflicts) return found;
      }
    }
  }

  return found;
}

/** One line for the forge log: `2 source conflicts: 4 h vs 6 h · lower vs raise`. */
export function summarizeContradictions(contradictions: Contradiction[]): string {
  if (contradictions.length === 0) return '';
  const details = contradictions.slice(0, 3).map((c) => c.summary).join(' · ');
  const more = contradictions.length > 3 ? ` (+${contradictions.length - 3} more)` : '';
  return `${contradictions.length} source conflict${contradictions.length === 1 ? '' : 's'}: ${details}${more}`;
}
