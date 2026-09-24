import { AnkiCardItem } from './anki-exporter';
import { Activity, StageResponse } from './types';
import { countWords, TOO_LONG_WORD_LIMIT } from './fsrs-audit';

// ─── Cognitive Telemetry ────────────────────────────────────────────────────
// Replaces XP with measurements that say something about encoding quality.
// Three gauges, all deterministic and offline:
//
//   • Compression Ratio  : raw source words → atomic cards. "1,400 raw words
//                          → 4 cards = 88% noise stripped."
//   • Atomicity          : word count per card back; anything over the FSRS
//                          limit (15) is flagged as a leech seed.
//   • Jargon Deflation   : buzzwords present in the source that the learner
//                          successfully avoided (replaced with physical /
//                          causal descriptions) in their own wording.

export interface CompressionRatio {
  rawWords: number;
  atomicCards: number;
  /** 0–100 : share of source mass stripped into atomic cards. */
  noiseStrippedPct: number;
}

export interface AtomicityReport {
  averageBackWords: number;
  /** Card backs over the FSRS density limit. */
  overLimit: number;
  totalCards: number;
}

export interface JargonDeflation {
  /** Buzzwords found in the source. */
  detected: number;
  /** Buzzwords the learner's own wording avoided. */
  deflated: number;
  /** 0–100 : deflated / detected. */
  index: number;
}

export interface CognitiveTelemetry {
  compression: CompressionRatio;
  atomicity: AtomicityReport;
  jargon: JargonDeflation;
}

/** Word count of everything the learner actually produced this session. */
function userWordCount(
  activities: Activity[],
  responses: Record<string, StageResponse>
): number {
  let words = 0;
  for (const act of activities) {
    const r = responses[act.id];
    if (!r) continue;
    for (const f of [r.field1, r.field2, r.field3]) {
      if (f?.trim()) words += countWords(f);
    }
  }
  return words;
}

/**
 * Compression Ratio. `rawWords` is the source mass; `cards` the atomic deck
 * it was distilled into. With no raw source (YouTube mode has none) the
 * ratio is meaningless and the caller should hide the chip.
 */
export function computeCompressionRatio(rawNotes: string, cards: AnkiCardItem[]): CompressionRatio {
  const rawWords = countWords(rawNotes || '');
  const atomicCards = cards.length;
  if (rawWords === 0 || atomicCards === 0) {
    return { rawWords, atomicCards, noiseStrippedPct: 0 };
  }
  // Learner-produced wording is what survives; everything else was noise.
  // Ratio = 1 - (cards' density share of the source). A 4-card deck from
  // 1,400 words strips ~88–97% depending on card length; we approximate with
  // the card deck's own word mass so longer cards compress less.
  const cardWords = cards.reduce((sum, c) => sum + countWords(`${c.front} ${c.back}`), 0);
  const stripped = Math.max(0, Math.round((1 - cardWords / rawWords) * 100));
  return { rawWords, atomicCards, noiseStrippedPct: Math.min(99, stripped) };
}

/** Information Atomicity: how dense the card backs are (15-word FSRS limit). */
export function computeAtomicity(cards: AnkiCardItem[]): AtomicityReport {
  if (cards.length === 0) return { averageBackWords: 0, overLimit: 0, totalCards: 0 };
  const backWords = cards.map((c) => countWords(c.back));
  const averageBackWords = Math.round(backWords.reduce((a, b) => a + b, 0) / cards.length);
  const overLimit = backWords.filter((w) => w > TOO_LONG_WORD_LIMIT).length;
  return { averageBackWords, overLimit, totalCards: cards.length };
}

/**
 * Jargon Deflation Index: of the buzzwords the source leans on, how many did
 * the learner explain WITHOUT parroting? High index = they replaced labels
 * with mechanisms. Zero responses → 0 (nothing measured, not a judgement).
 */
export function computeJargonDeflation(
  rawNotes: string,
  activities: Activity[],
  responses: Record<string, StageResponse>
): JargonDeflation {
  const source = (rawNotes || '').toLowerCase();
  if (!source.trim()) return { detected: 0, deflated: 0, index: 0 };
  const taboo = detectTabooTerms(source, [], 8);
  if (taboo.length === 0) return { detected: 0, deflated: 0, index: 0 };
  const produced = userWordCount(activities, responses);
  if (produced === 0) return { detected: taboo.length, deflated: 0, index: 0 };
  const learnerText = activities
    .map((a) => {
      const r = responses[a.id];
      return r ? `${r.field1 || ''} ${r.field2 || ''} ${r.field3 || ''}` : '';
    })
    .join(' ')
    .toLowerCase();
  const deflated = taboo.filter((t) => !learnerText.includes(t.toLowerCase())).length;
  return {
    detected: taboo.length,
    deflated,
    index: Math.round((deflated / taboo.length) * 100),
  };
}

/** Full session telemetry from the raw source + the extracted atomic deck. */
export function computeSessionTelemetry(input: {
  rawNotes: string;
  activities: Activity[];
  userResponses: Record<string, StageResponse>;
  cards: AnkiCardItem[];
}): CognitiveTelemetry {
  const { rawNotes, activities, userResponses, cards } = input;
  return {
    compression: computeCompressionRatio(rawNotes, cards),
    atomicity: computeAtomicity(cards),
    jargon: computeJargonDeflation(rawNotes, activities, userResponses),
  };
}

// ─── Taboo constraint engine (jargon stripping) ─────────────────────────────
// Buzzwords are the illusion of competence: "depolarization" says nothing
// physical. The taboo engine surfaces the source's highest-jargon terms and
// flags them when they leak into the learner's own wording.

/** Default lexicon: cross-domain terms that mask mechanisms behind labels. */
const BUZZWORD_LEXICON: string[] = [
  'depolarization', 'repolarization', 'hyperpolarization', 'osmosis', 'equilibrium',
  'homeostasis', 'catalysis', 'catalyzes', 'fermentation', 'photosynthesis', 'respiration',
  'mitosis', 'meiosis', 'transcription', 'translation', 'signal transduction',
  'action potential', 'neurotransmitter', 'inflation', 'recession', 'arbitrage',
  'amortization', 'leverage', 'metabolism', 'peristalsis', 'thermoregulation',
  'allosteric', 'hydrolysis', 'dehydration synthesis', 'electronegativity',
  'solubility', 'ionization', 'oxidation', 'reduction', 'recursion', 'memoization',
  'polymorphism', 'encapsulation', 'normalization', 'denormalization',
];

/** Words too common to ever be jargon. */
const STOPWORDS = new Set([
  'because', 'therefore', 'however', 'although', 'between', 'through', 'during',
  'before', 'after', 'above', 'below', 'these', 'those', 'their', 'there',
  'where', 'which', 'while', 'about', 'would', 'could', 'should', 'might',
  'since', 'until', 'unless', 'within', 'without', 'against', 'under',
  'over', 'into', 'from', 'with', 'that', 'this', 'than', 'then', 'when',
  'what', 'when', 'also', 'both', 'each', 'most', 'some', 'such', 'only',
  'very', 'more', 'less', 'many', 'much', 'must', 'have', 'been', 'were',
]);

/**
 * Detects the source's taboo terms: lexicon hits first, then frequent long
 * domain words (≥8 chars, appearing ≥2×) that are not stage keywords. Stage
 * keywords are what the learner SHOULD say — they are never taboo.
 */
export function detectTabooTerms(
  sourceText: string,
  stageKeywords: string[] = [],
  limit = 4
): string[] {
  const source = (sourceText || '').toLowerCase();
  if (!source.trim()) return [];
  const keywords = new Set(stageKeywords.map((k) => k.toLowerCase().trim()));

  const found: { term: string; score: number }[] = [];
  for (const term of BUZZWORD_LEXICON) {
    if (source.includes(term) && !keywords.has(term)) {
      found.push({ term, score: 1000 + (source.split(term).length - 1) });
    }
  }

  // Fallback: frequent long words that read like nominalizations.
  const counts = new Map<string, number>();
  for (const w of source.match(/\b[a-z]{8,}\b/g) || []) {
    if (STOPWORDS.has(w) || keywords.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  for (const [w, n] of counts) {
    if (n >= 2 && !found.some((f) => f.term === w)) {
      found.push({ term: w, score: n });
    }
  }

  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((f) => f.term);
}

/** True when the learner's text leaks a taboo term (jargon parroting). */
export function findTabooHits(text: string, tabooTerms: string[]): string[] {
  const t = (text || '').toLowerCase();
  return tabooTerms.filter((term) => t.includes(term.toLowerCase()));
}
