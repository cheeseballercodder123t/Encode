import {
  BoundaryTripwireItem,
  ClinicalCorrelateItem,
  ConceptualMechanismItem,
  ConfusablePairItem,
  DeclarativeFactItem,
  PracticeQuestionItem,
  SegregationReport,
  SequentialCascadeItem,
  WorkedExampleItem,
} from '@/lib/types';
import { ClaimInput, Contradiction, detectContradictions } from './contradiction';
import { SegregationSection } from './segregation';

// ─── Forge : many sources in, one deck out, no encoding ─────────────────────
//
// Sometimes you do not want a workout. You have lecture slides, three PDFs, two
// YouTube lectures and a topic you already know, and what you want is the deck.
// The Forge runs the SAME card contract as the encode-then-segregate flow
// (`lib/services/segregation.ts`) once per source and merges the batches into a
// single report, which then travels through the verified export funnel
// (Wozniak enforcement, FSRS audit, RemNote rendering, AnkiConnect).
//
// Everything in this module is pure: the route does the generating, this does
// the normalizing, deduping and counting, so the merge rules are unit-testable
// without a model.

export type ForgeSourceKind = 'text' | 'file' | 'youtube';

/**
 * Where a forged deck is handed off. `both` opens Anki and queues RemNote
 * behind it, so two export modals are never on screen at once.
 */
export type ForgeExportTarget = 'anki' | 'remnote' | 'both';

export interface ForgeSource {
  id: string;
  kind: ForgeSourceKind;
  /** Human label for the source list ("Lecture 4 slides", "youtube:4mK2…"). */
  label: string;
}

export type ForgeSourceStatus = 'ok' | 'failed';

export interface ForgeSectionCounts {
  facts: number;
  mechanisms: number;
  drills: number;
  examples: number;
}

export interface ForgedSourceResult extends ForgeSource {
  status: ForgeSourceStatus;
  counts: ForgeSectionCounts;
  /** Why a source produced nothing, shown verbatim in the forge log. */
  note?: string;
  /** Source words the cards were cut from, when the route could count them. */
  words?: number;
  /**
   * Words-in → cards-out sanity check. A source that quietly under-produced
   * ("Lecture 4 slides → 3 cards from 4,200 words") is a failure the forge
   * should name, because the alternative is a deck that looks complete and is
   * not. Purely advisory: it never changes what the source contributed.
   */
  yield?: ForgeSourceYield;
}

export interface ForgeResult {
  report: SegregationReport;
  sources: ForgedSourceResult[];
  /** Cards dropped as duplicates of a card an earlier source already had. */
  dropped: number;
  counts: ForgeSectionCounts;
  /** Total cards in the merged deck. */
  total: number;
  /**
   * Places where two sources disagree. Each one replaced the conflicting pair
   * with a single explicit conflict card (kept in `report.declarativeFacts`),
   * because a deck that silently keeps whichever claim arrived first is worse
   * than one that says out loud that the sources disagree.
   */
  contradictions: Contradiction[];
}

export interface ForgeMergeInput {
  source: ForgeSource;
  report: SegregationReport | null;
  note?: string;
  /** Words of source text this batch was generated from, for the yield check. */
  words?: number;
}

/** How the merge resolved cross-source conflicts. */
export interface ForgeMergeOptions {
  /** Detect and replace conflicting claims (default true). */
  detectConflicts?: boolean;
}

const EMPTY_COUNTS: ForgeSectionCounts = { facts: 0, mechanisms: 0, drills: 0, examples: 0 };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A fact's optional clinical face, coerced or dropped.
 *
 * Both halves are required: a correlate with no question is not a card, and a
 * question with no answer is a hole. A half-supplied object is discarded rather
 * than repaired, because the repair would be invented content.
 */
function clinicalCorrelateOf(raw: unknown): ClinicalCorrelateItem | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const pair = raw as { question?: unknown; answer?: unknown };
  const question = text(pair.question);
  const answer = text(pair.answer);
  return question && answer ? { question, answer } : undefined;
}

/** Case/punctuation/space-insensitive key, so near-identical cards collapse. */
export function dedupeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Near-duplicate detection ──────────────────────────────────────────────
//
// Exact-key matching only catches a duplicate the model re-punctuated. In
// practice the same card comes back re-worded ("the loop of Henle can reach
// 1,200 mOsm" for "the loop of Henle reaches 1,200 mOsm"), which the second
// pass of a forge — and "generate more" over the same source — will happily
// ship twice. Two texts are therefore compared by trigram similarity.
//
// The one thing this must never do is collapse two DIFFERENT facts that look
// alike, because that is silent data loss on the cards the app exists to keep
// apart:
//   · "the half-life is 4 h" vs "…is 6 h" — a quantity changed;
//   · "drug A clears faster" vs "drug B clears faster" — an entity changed.
// So the comparison is gated on protected tokens first: if the two texts carry
// different numbers or different mid-sentence proper nouns, they are NOT
// duplicates however similar the rest reads. Numbers and named entities are
// exactly the discriminable half of a card, and the contradiction pass (not
// this one) is what pairs those up.

/** Trigram Jaccard at or above this collapses two cards into one. */
export const NEAR_DUPLICATE_THRESHOLD = 0.8;
/** Below this normalized length, trigram similarity is too noisy to trust. */
export const NEAR_DUPLICATE_MIN_LENGTH = 32;

function trigrams(value: string): Set<string> {
  const grams = new Set<string>();
  const padded = `  ${value} `;
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Cues that flip a claim's direction. Two cards that disagree this way are a
 * contradiction the deck should show, not a duplicate it should hide, so a
 * pair carrying different polarity reads is never collapsed.
 */
const POLARITY_CUES = /\b(not|no|never|cannot|without|unless|fails?|prevents?|inhibits?|blocks?|removes?|disables?|decreases?|lowers?|reduces?)\b/i;

/**
 * Numbers and mid-sentence proper nouns, normalized. Two texts whose protected
 * tokens differ are describing different things, whatever else they share.
 */
function protectedTokens(value: string): string {
  const tokens = (value || '').match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || [];
  const found = new Set<string>();
  tokens.forEach((token, index) => {
    if (/\d/.test(token)) {
      found.add(token.toLowerCase().replace(/[^a-z0-9]/g, ''));
      return;
    }
    if (index > 0 && /^[A-Z]/.test(token)) found.add(token.toLowerCase());
  });
  return [...found].sort().join('|');
}

/** 0–1 similarity of two card texts (1 = the same card once normalized). */
export function similarity(a: string, b: string): number {
  const ka = dedupeKey(a);
  const kb = dedupeKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  return jaccard(trigrams(ka), trigrams(kb));
}

/** True when `a` and `b` are the same card, re-worded. */
export function isNearDuplicate(a: string, b: string): boolean {
  const ka = dedupeKey(a);
  const kb = dedupeKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length < NEAR_DUPLICATE_MIN_LENGTH || kb.length < NEAR_DUPLICATE_MIN_LENGTH) return false;
  if (Math.abs(ka.length - kb.length) > Math.max(16, ka.length * 0.25)) return false;
  if (protectedTokens(a) !== protectedTokens(b)) return false;
  if (POLARITY_CUES.test(a) !== POLARITY_CUES.test(b)) return false;
  return jaccard(trigrams(ka), trigrams(kb)) >= NEAR_DUPLICATE_THRESHOLD;
}

export interface NearDuplicateIndex {
  /** True when this text is already present, exactly or re-worded. */
  has(value: string): boolean;
  /** Records a text as present. Returns true when it was not already there. */
  add(value: string): boolean;
}

/**
 * Append-only duplicate index. Exact keys are O(1); near-duplicates are only
 * compared against entries in a comparable length band, so a 700-card deck
 * merges in milliseconds.
 */
export function createNearDuplicateIndex(seed: Iterable<string> = []): NearDuplicateIndex {
  const exact = new Set<string>();
  const entries: string[] = [];

  const add = (value: string): boolean => {
    const key = dedupeKey(value);
    if (!key) return false;
    if (exact.has(key)) return false;
    exact.add(key);
    entries.push(value);
    return true;
  };

  for (const value of seed) add(value);

  return {
    add,
    has(value: string) {
      const key = dedupeKey(value);
      if (!key) return false;
      if (exact.has(key)) return true;
      if (key.length < NEAR_DUPLICATE_MIN_LENGTH) return false;
      return entries.some((entry) => isNearDuplicate(entry, value));
    },
  };
}

// ─── Per-source yield sanity check ──────────────────────────────────────────
//
// The forge's failure mode is not a crash, it is a silent one: a 4,200-word
// slide export comes back with three cards and the deck looks finished. Roughly
// one card per 250 words of source is what these prompts actually produce; well
// under that, the source is named as under-mined so the learner can re-forge
// just that one instead of accepting a deck with a hole in it.

export type ForgeYieldVerdict = 'healthy' | 'thin' | 'silent' | 'unknown';

export interface ForgeSourceYield {
  words: number;
  cards: number;
  /** Cards this many words should have produced (0 when unjudgeable). */
  expected: number;
  verdict: ForgeYieldVerdict;
  /** One line for the source log, on the sources worth mentioning. */
  note?: string;
}

/** Cards per source word the card prompts are calibrated to produce. */
const WORDS_PER_CARD = 250;
/** Under this many words there is not enough material to judge. */
const MIN_JUDGEABLE_WORDS = 60;

/** Deterministic thousands separator (no locale, so tests never flake). */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function sourceYield(words: number, cards: number): ForgeSourceYield {
  const safeWords = Math.max(0, Math.round(words || 0));
  const safeCards = Math.max(0, cards || 0);

  if (safeWords <= 0) {
    return { words: 0, cards: safeCards, expected: 0, verdict: 'unknown' };
  }

  const expected = Math.max(2, Math.round(safeWords / WORDS_PER_CARD));
  if (safeCards === 0) {
    return {
      words: safeWords,
      cards: 0,
      expected,
      verdict: 'silent',
      note: `${formatCount(safeWords)} words in, 0 cards out`,
    };
  }
  if (safeWords < MIN_JUDGEABLE_WORDS) {
    return { words: safeWords, cards: safeCards, expected: 0, verdict: 'unknown' };
  }
  if (safeCards < expected) {
    return {
      words: safeWords,
      cards: safeCards,
      expected,
      verdict: 'thin',
      note: `${formatCount(safeWords)} words in but only ${safeCards} card${safeCards === 1 ? '' : 's'} out (about ${expected} expected)`,
    };
  }
  return { words: safeWords, cards: safeCards, expected, verdict: 'healthy' };
}

// ─── Coverage: which sections actually got cards ────────────────────────────
//
// A card count says how big the deck is, not whether it is complete. If the
// learner asked for drills and the model returned none, the deck is missing a
// section, and "generate more" should be aimed at THAT gap rather than at the
// whole source again.

export interface ForgeSectionCoverage {
  section: SegregationSection;
  requested: boolean;
  cards: number;
}

export interface ForgeSectionGap {
  section: SegregationSection;
  /**
   * The sources that returned not one card for this section.
   *
   * For a gap this is every source that was cut (a section with 0 cards had 0
   * from each of them), which is exactly the point: "drills are missing from
   * Lecture 4 slides AND Problem set 4" is a different note from "the model
   * forgot the drills" — it is a note about the reading, and it is the one you
   * can act on before paying for another pass over the same slides.
   */
  silentIn: string[];
  /** One line naming who is empty where, for the panel. */
  note: string;
}

export interface ForgeCoverageReport {
  sections: ForgeSectionCoverage[];
  /** Requested sections that came back empty — what "generate more" targets. */
  gaps: SegregationSection[];
  /** One line naming the gaps, or a confirmation that there are none. */
  note: string;
  /** Labels of sources that contributed nothing at all. */
  silentSources: string[];
  /**
   * Per gap, which source owns it. A merged deck loses provenance as soon as
   * the cards are deduped, so without this the report can only say a section is
   * empty — never that it is empty because one lecture's slides never covered
   * it, which is a note about the SOURCE and not about the model.
   */
  gapOwners: ForgeSectionGap[];
}

const SECTION_ORDER: SegregationSection[] = ['facts', 'mechanisms', 'drills', 'examples'];

function isRequested(want: Record<SegregationSection, boolean> | undefined, section: SegregationSection): boolean {
  // No `include` list at all means "everything was requested".
  return !want || want[section] !== false;
}

export function buildCoverageReport(
  counts: ForgeSectionCounts,
  want?: Record<SegregationSection, boolean>,
  sources: ForgedSourceResult[] = []
): ForgeCoverageReport {
  const sections = SECTION_ORDER.map((section) => ({
    section,
    requested: isRequested(want, section),
    cards: counts[section] || 0,
  }));
  const gaps = sections.filter((s) => s.requested && s.cards === 0).map((s) => s.section);
  const silentSources = sources
    .filter((source) => source.counts.facts + source.counts.mechanisms + source.counts.drills + source.counts.examples === 0)
    .map((source) => source.label);

  // Only sources that were actually cut are blamed: a source that failed before
  // the model saw it is already named in the forge log, and counting it as
  // "silent on examples" would blame it for a section it never reached.
  const cut = sources.filter((source) => source.status === 'ok');
  const gapOwners: ForgeSectionGap[] = gaps.map((section) => {
    const silentIn = cut.filter((source) => (source.counts[section] || 0) === 0).map((source) => source.label);
    return {
      section,
      silentIn,
      // Deliberately not "the material has no examples": a section can also be
      // empty because every card for it was a duplicate of one already in the
      // deck, and a note that guesses wrong there sends the learner off to find
      // material they already had.
      note:
        silentIn.length > 0
          ? `no source produced ${section} (${silentIn.join(', ')}) — ask again only if the material really contains it`
          : `no source produced ${section} — ask again only if the material really contains it`,
    };
  });

  const note =
    gaps.length === 0
      ? 'Every requested section received cards.'
      : `0 cards for ${gaps.join(', ')} — "generate more" will target that gap.`;

  return { sections, gaps, note, silentSources, gapOwners };
}

function namespaceId(sourceId: string, id: unknown, fallback: string): string {
  const raw = text(id) || fallback;
  return `${sourceId}-${raw}`;
}

/**
 * Coerces one source's AI output into a render-safe report, namespacing every
 * id with its source so two sources can never collide in the merged deck.
 * Returns null when the payload carries no usable card at all.
 */
export function normalizeSegregationReport(raw: any, sourceId = 'src'): SegregationReport | null {
  if (!raw || typeof raw !== 'object') return null;

  const facts: DeclarativeFactItem[] = (Array.isArray(raw.declarativeFacts) ? raw.declarativeFacts : [])
    .filter((f: any) => f && typeof f === 'object' && (text(f.factStatement) || text(f.clozeSuggestion)))
    .slice(0, 60)
    .map((f: any, i: number) => ({
      id: namespaceId(sourceId, f.id, `fact_${i + 1}`),
      factStatement: text(f.factStatement) || text(f.clozeSuggestion),
      question: text(f.question) || undefined,
      clozeSuggestion: text(f.clozeSuggestion) || undefined,
      tag: text(f.tag) || undefined,
      memoryHook: text(f.memoryHook) || undefined,
      clinicalCorrelate: clinicalCorrelateOf(f.clinicalCorrelate),
    }));

  const mechanisms: ConceptualMechanismItem[] = (Array.isArray(raw.conceptualMechanisms) ? raw.conceptualMechanisms : [])
    .filter((m: any) => m && typeof m === 'object' && text(m.conceptName))
    .slice(0, 24)
    .map((m: any, i: number) => ({
      id: namespaceId(sourceId, m.id, `mech_${i + 1}`),
      conceptName: text(m.conceptName),
      whatIsIt: text(m.whatIsIt),
      whyItMatters: text(m.whyItMatters),
      howItWorks: text(m.howItWorks),
      whatIfEdgeCase: text(m.whatIfEdgeCase),
      boundaryContrast: m.boundaryContrast && text(m.boundaryContrast.confusableLookalike)
        ? {
            confusableLookalike: text(m.boundaryContrast.confusableLookalike),
            distinguishingRule: text(m.boundaryContrast.distinguishingRule),
          }
        : undefined,
    }));

  const drills: PracticeQuestionItem[] = (Array.isArray(raw.practiceQuestions) ? raw.practiceQuestions : [])
    .filter((q: any) => q && typeof q === 'object' && text(q.question) && text(q.answer))
    .slice(0, 48)
    .map((q: any, i: number) => ({
      id: namespaceId(sourceId, q.id, `drill_${i + 1}`),
      question: text(q.question),
      answer: text(q.answer),
      whyCorrect: text(q.whyCorrect) || undefined,
      distractors: Array.isArray(q.distractors)
        ? q.distractors.map((d: any) => text(d)).filter(Boolean).slice(0, 5)
        : undefined,
    }));

  const examples: WorkedExampleItem[] = (Array.isArray(raw.workedExamples) ? raw.workedExamples : [])
    .filter((ex: any) => ex && typeof ex === 'object' && (text(ex.title) || text(ex.problem)))
    .slice(0, 12)
    .map((ex: any, i: number) => ({
      id: namespaceId(sourceId, ex.id, `example_${i + 1}`),
      title: text(ex.title) || `Worked example ${i + 1}`,
      problem: text(ex.problem),
      steps: Array.isArray(ex.steps) ? ex.steps.map((s: any) => text(s)).filter(Boolean).slice(0, 10) : [],
      takeaway: text(ex.takeaway) || undefined,
    }));

  const confusablePairs: ConfusablePairItem[] = (Array.isArray(raw.confusablePairs) ? raw.confusablePairs : [])
    .filter((cp: any) => cp && typeof cp === 'object' && text(cp.conceptA) && text(cp.conceptB))
    .slice(0, 10)
    .map((cp: any, i: number) => ({
      id: namespaceId(sourceId, cp.id, `cp_${i + 1}`),
      conceptA: text(cp.conceptA),
      conceptB: text(cp.conceptB),
      distinguishingAxis: text(cp.distinguishingAxis) || 'Distinguishing Rule',
      boundaryCondition: text(cp.boundaryCondition) || 'Boundary switch condition',
      conceptAFeature: text(cp.conceptAFeature) || text(cp.conceptA),
      conceptBFeature: text(cp.conceptBFeature) || text(cp.conceptB),
      diagnosticVignette: text(cp.diagnosticVignette) || `Which concept applies: ${text(cp.conceptA)} or ${text(cp.conceptB)}?`,
      diagnosticAnswer: text(cp.diagnosticAnswer) || `${text(cp.conceptA)} vs ${text(cp.conceptB)}`,
    }));

  // Auto-synthesize confusable pairs from mechanisms that carry boundaryContrast if none explicitly provided
  if (confusablePairs.length === 0 && mechanisms.length > 0) {
    mechanisms.forEach((m, idx) => {
      if (m.boundaryContrast && m.boundaryContrast.confusableLookalike && m.boundaryContrast.distinguishingRule) {
        confusablePairs.push({
          id: namespaceId(sourceId, `derived_cp_${idx + 1}`, `cp_${idx + 1}`),
          conceptA: m.conceptName,
          conceptB: m.boundaryContrast.confusableLookalike,
          distinguishingAxis: 'Distinguishing Rule',
          boundaryCondition: m.boundaryContrast.distinguishingRule,
          conceptAFeature: m.howItWorks || m.whatIsIt || m.conceptName,
          conceptBFeature: `Lookalike to ${m.conceptName}`,
          diagnosticVignette: `Under what exact condition is ${m.conceptName} distinguished from ${m.boundaryContrast.confusableLookalike}?`,
          diagnosticAnswer: m.boundaryContrast.distinguishingRule,
        });
      }
    });
  }

  // Ordered processes. Two steps is the floor: one step is a fact, and a
  // "sequence" of one gets quizzed as a fragment, which is what this shape
  // exists to prevent.
  const sequentialCascades: SequentialCascadeItem[] = (Array.isArray(raw.sequentialCascades) ? raw.sequentialCascades : [])
    .filter((c: any) => c && typeof c === 'object' && text(c.process) && Array.isArray(c.steps))
    .slice(0, 3)
    .map((c: any, i: number) => ({
      id: namespaceId(sourceId, c.id, `cascade_${i + 1}`),
      process: text(c.process),
      steps: c.steps.map((step: any) => text(step)).filter(Boolean).slice(0, 8),
      disruptor: text(c.disruptor) || undefined,
    }))
    .filter((cascade: SequentialCascadeItem) => cascade.steps.length >= 2);

  const boundaryTripwires: BoundaryTripwireItem[] = (Array.isArray(raw.boundaryTripwires) ? raw.boundaryTripwires : [])
    .filter((t: any) => t && typeof t === 'object' && text(t.law) && text(t.breaksWhen))
    .slice(0, 4)
    .map((t: any, i: number) => ({
      id: namespaceId(sourceId, t.id, `tripwire_${i + 1}`),
      law: text(t.law),
      breaksWhen: text(t.breaksWhen),
      indicator: text(t.indicator) || undefined,
    }));

  const topic = text(raw.topic);
  if (
    facts.length === 0 &&
    mechanisms.length === 0 &&
    drills.length === 0 &&
    examples.length === 0 &&
    confusablePairs.length === 0 &&
    sequentialCascades.length === 0 &&
    boundaryTripwires.length === 0
  ) {
    return null;
  }

  return {
    topic: topic || 'Forged Deck',
    declarativeFacts: facts,
    conceptualMechanisms: mechanisms,
    practiceQuestions: drills,
    workedExamples: examples,
    confusablePairs: confusablePairs.length > 0 ? confusablePairs : undefined,
    sequentialCascades: sequentialCascades.length > 0 ? sequentialCascades : undefined,
    boundaryTripwires: boundaryTripwires.length > 0 ? boundaryTripwires : undefined,
    compressionRatio: text(raw.compressionRatio) || undefined,
  };
}

/** Per-section card counts for a report (facts, mechanisms, drills, examples). */
export function countReportSections(report: SegregationReport): ForgeSectionCounts {
  return {
    facts: report.declarativeFacts.length,
    mechanisms: report.conceptualMechanisms.length,
    drills: report.practiceQuestions?.length || 0,
    examples: report.workedExamples?.length || 0,
  };
}

/** Total cards a report would ship. */
export function totalReportCards(report: SegregationReport): number {
  const c = countReportSections(report);
  return c.facts + c.mechanisms + c.drills + c.examples;
}

export function isEmptyForgeReport(report: SegregationReport): boolean {
  // `totalReportCards` counts the four coverage sections, which is what the
  // coverage report is about — but they are not the only shapes a report can
  // ship. A source that produced a discrimination matrix, an ordered cascade or
  // a boundary tripwire has content even when the four counted sections came
  // back empty, and calling that "empty" would silently drop it.
  return (
    totalReportCards(report) === 0 &&
    (report.confusablePairs?.length || 0) === 0 &&
    (report.sequentialCascades?.length || 0) === 0 &&
    (report.boundaryTripwires?.length || 0) === 0
  );
}

/**
 * Merges per-source reports into one deck.
 *
 * Dedupe is by content, not id: a fact statement, concept name, drill question
 * or worked-example title/problem that already arrived from an earlier source
 * is dropped, because overlapping uploads (slides + the lecture they came from)
 * otherwise ship the same card twice. Nothing else is reordered — the deck
 * keeps the source order the learner set up.
 */
export function mergeSegregationReports(
  inputs: ForgeMergeInput[],
  topic?: string,
  options: ForgeMergeOptions = {}
): ForgeResult {
  const sources: ForgedSourceResult[] = [];
  const index = createNearDuplicateIndex();
  const exactKeys = new Set<string>();
  let dropped = 0;
  let droppedNear = 0;

  const facts: DeclarativeFactItem[] = [];
  const mechanisms: ConceptualMechanismItem[] = [];
  const drills: PracticeQuestionItem[] = [];
  const examples: WorkedExampleItem[] = [];
  /** Every surviving fact, with the source it came from, for conflict detection. */
  const claims: ClaimInput[] = [];

  // Content-keyed, not id-keyed: the same card arriving from two sources (or
  // the same card re-worded) is one card. Near-duplicates are counted
  // separately so the source note can say which kind of drop happened.
  const take = (value: string): boolean => {
    const key = dedupeKey(value);
    if (!key) return false;
    if (index.has(value)) {
      dropped += 1;
      // An exact key was already here; anything else was collapsed as a
      // re-words of a card that arrived earlier.
      if (!exactKeys.has(key)) droppedNear += 1;
      return false;
    }
    index.add(value);
    exactKeys.add(key);
    return true;
  };

  for (const input of inputs) {
    const report = input.report;
    if (!report) {
      sources.push({
        ...input.source,
        status: 'failed',
        counts: { ...EMPTY_COUNTS },
        note: input.note || 'This source produced no cards.',
      });
      continue;
    }

    const before: ForgeSectionCounts = countReportSections(report);
    const kept: ForgeSectionCounts = { ...EMPTY_COUNTS };
    const nearBefore = droppedNear;

    for (const fact of report.declarativeFacts) {
      if (!take(fact.factStatement)) continue;
      facts.push(fact);
      kept.facts += 1;
      claims.push({
        id: fact.id,
        text: fact.factStatement,
        sourceId: input.source.id,
        sourceLabel: input.source.label,
      });
    }
    for (const mech of report.conceptualMechanisms) {
      if (!take(mech.conceptName)) continue;
      mechanisms.push(mech);
      kept.mechanisms += 1;
    }
    for (const drill of report.practiceQuestions || []) {
      if (!take(drill.question)) continue;
      drills.push(drill);
      kept.drills += 1;
    }
    for (const example of report.workedExamples || []) {
      if (!take(`${example.title} ${example.problem}`)) continue;
      examples.push(example);
      kept.examples += 1;
    }

    const sourceDropped =
      before.facts + before.mechanisms + before.drills + before.examples -
      (kept.facts + kept.mechanisms + kept.drills + kept.examples);
    const sourceNear = droppedNear - nearBefore;
    const keptTotal = kept.facts + kept.mechanisms + kept.drills + kept.examples;
    // Words-in → cards-out, so a silently under-producing source is named
    // instead of being averaged away by the sources that worked.
    const yieldCheck = input.words !== undefined ? sourceYield(input.words, keptTotal) : undefined;
    const yieldNote = yieldCheck && (yieldCheck.verdict === 'thin' || yieldCheck.verdict === 'silent')
      ? yieldCheck.note
      : undefined;

    sources.push({
      ...input.source,
      status: 'ok',
      counts: kept,
      note:
        sourceDropped > 0
          ? `${sourceDropped} card(s) already in the deck${sourceNear > 0 ? ` (${sourceNear} near-duplicate)` : ''}`
          : yieldNote || input.note,
      words: input.words,
      yield: yieldCheck,
    });
  }

  // Cross-source contradictions, resolved by replacement rather than by silence.
  const contradictions = options.detectConflicts === false ? [] : detectContradictions(claims);
  const replaced = new Set(contradictions.flatMap((c) => c.claims.map((claim) => claim.id)));
  const survivingFacts = replaced.size > 0 ? facts.filter((fact) => !replaced.has(fact.id)) : facts;
  const conflictCards = contradictions.map((c) => c.card);

  // The replaced claims leave their source's tally (they are one card now) and
  // that source says so, instead of claiming a card that is no longer there.
  if (replaced.size > 0) {
    for (const source of sources) {
      const lost = contradictions.filter((c) => c.claims.some((claim) => claim.sourceId === source.id)).length;
      if (lost === 0 || source.status !== 'ok') continue;
      source.counts = { ...source.counts, facts: Math.max(0, source.counts.facts - lost) };
      source.note = `${lost} claim${lost === 1 ? '' : 's'} merged into a conflict card`;
    }
  }

  const allFacts = [...conflictCards, ...survivingFacts];

  const confusablePairs: ConfusablePairItem[] = [];
  for (const input of inputs) {
    if (!input.report?.confusablePairs) continue;
    for (const cp of input.report.confusablePairs) {
      if (!take(`${cp.conceptA} vs ${cp.conceptB}`)) continue;
      confusablePairs.push(cp);
    }
  }

  // The two process/limit shapes merge on the same rule: the process name (or
  // the law) is the identity, so two sources describing the same cascade do not
  // ship two copies of it.
  const sequentialCascades: SequentialCascadeItem[] = [];
  const boundaryTripwires: BoundaryTripwireItem[] = [];
  for (const input of inputs) {
    for (const cascade of input.report?.sequentialCascades || []) {
      if (!take(cascade.process)) continue;
      sequentialCascades.push(cascade);
    }
    for (const tripwire of input.report?.boundaryTripwires || []) {
      if (!take(tripwire.law)) continue;
      boundaryTripwires.push(tripwire);
    }
  }

  const total =
    allFacts.length +
    mechanisms.length +
    drills.length +
    examples.length +
    confusablePairs.length +
    sequentialCascades.length +
    boundaryTripwires.length;
  const report: SegregationReport = {
    topic: topic?.trim() || inputs.find((i) => i.report?.topic)?.report?.topic || 'Forged Deck',
    declarativeFacts: allFacts,
    conceptualMechanisms: mechanisms,
    practiceQuestions: drills,
    workedExamples: examples,
    confusablePairs: confusablePairs.length > 0 ? confusablePairs : undefined,
    sequentialCascades: sequentialCascades.length > 0 ? sequentialCascades : undefined,
    boundaryTripwires: boundaryTripwires.length > 0 ? boundaryTripwires : undefined,
    compressionRatio: summarizeMerge(dropped, sources.filter((s) => s.status === 'ok').length, contradictions.length),
    // Provenance travels with the deck. The card ids already carry the source
    // (`src_2-f1`), but an id is not a name: the split export wants to write
    // "Lecture 4 slides" on the page, and the coverage report wants to say
    // WHICH lecture was empty rather than a section name.
    sourceLabels: Object.fromEntries(
      sources.filter((s) => s.status === 'ok' && s.label).map((s) => [s.id, s.label])
    ),
  };

  return {
    report,
    sources,
    dropped,
    total,
    contradictions,
    counts: {
      facts: allFacts.length,
      mechanisms: mechanisms.length,
      drills: drills.length,
      examples: examples.length,
    },
  };
}

/**
 * Every card front in a deck, one line each, in the order the deck ships. This
 * is the "already in your deck" list the model is told not to repeat when the
 * learner asks for more cards.
 */
export function collectCardFronts(report: SegregationReport): string[] {
  const lines: string[] = [];
  for (const fact of report.declarativeFacts) if (fact.factStatement) lines.push(fact.factStatement);
  for (const mech of report.conceptualMechanisms) if (mech.conceptName) lines.push(mech.conceptName);
  for (const drill of report.practiceQuestions || []) if (drill.question) lines.push(drill.question);
  for (const example of report.workedExamples || []) if (example.title) lines.push(example.title);
  for (const cascade of report.sequentialCascades || []) if (cascade.process) lines.push(cascade.process);
  for (const tripwire of report.boundaryTripwires || []) if (tripwire.law) lines.push(tripwire.law);
  return lines;
}

/** Dedupe fingerprints for every card in a deck, using the merge's own key. */
export function deckCardKeys(report: SegregationReport): Set<string> {
  const keys = new Set<string>();
  const add = (value: string) => {
    const key = dedupeKey(value);
    if (key) keys.add(key);
  };
  report.declarativeFacts.forEach((f) => add(f.factStatement));
  report.conceptualMechanisms.forEach((m) => add(m.conceptName));
  (report.practiceQuestions || []).forEach((q) => add(q.question));
  (report.workedExamples || []).forEach((e) => add(`${e.title} ${e.problem}`));
  // The new shapes are cards too: without their keys a re-forge would ship a
  // second copy of a cascade or a tripwire the deck already had.
  (report.sequentialCascades || []).forEach((c) => add(c.process));
  (report.boundaryTripwires || []).forEach((t) => add(t.law));
  return keys;
}

export interface AdditionalCardsResult {
  report: SegregationReport;
  /** Cards in the batch that were NOT already in the deck. */
  added: number;
  /** Cards dropped because the deck (or the batch itself) already had them. */
  dropped: number;
}

/**
 * Drops every card a `known` key set already contains. This is what makes
 * "generate more" safe: a model that re-worded an existing card produces a
 * duplicate, and a duplicate is dropped rather than shipped twice.
 */
export function dropKnownCards(addition: SegregationReport, known: Set<string>): AdditionalCardsResult {
  let dropped = 0;
  // Seeded with the deck's card fronts, so a re-worded repeat of a card the
  // learner already has is dropped rather than appended as a "new" card.
  // Callers pass RAW fronts: the near-duplicate guard reads the original
  // wording, and a pre-normalized key has already thrown that away (which would
  // make it fall back to exact matching, i.e. to the behaviour this replaced).
  const index = createNearDuplicateIndex(known);
  const take = (value: string): boolean => {
    if (!dedupeKey(value)) return true;
    if (index.has(value)) {
      dropped += 1;
      return false;
    }
    index.add(value);
    return true;
  };

  const declarativeFacts = addition.declarativeFacts.filter((f) => take(f.factStatement));
  const conceptualMechanisms = addition.conceptualMechanisms.filter((m) => take(m.conceptName));
  const practiceQuestions = (addition.practiceQuestions || []).filter((q) => take(q.question));
  const workedExamples = (addition.workedExamples || []).filter((e) => take(`${e.title} ${e.problem}`));
  const report: SegregationReport = {
    ...addition,
    declarativeFacts,
    conceptualMechanisms,
    practiceQuestions,
    workedExamples,
  };

  return { report, added: totalReportCards(report), dropped };
}

/**
 * Appends a "generate more" batch to the deck it extends. The base deck is
 * never reordered or re-scored, and no contradiction pass runs: this is one
 * deck growing, not a second merge of disagreeing sources.
 */
export function mergeAdditionalCards(base: SegregationReport, addition: SegregationReport): AdditionalCardsResult {
  const { report: fresh, added, dropped } = dropKnownCards(addition, deckCardKeys(base));
  if (added === 0) return { report: base, added: 0, dropped };
  return {
    report: {
      topic: base.topic || fresh.topic,
      declarativeFacts: [...base.declarativeFacts, ...fresh.declarativeFacts],
      conceptualMechanisms: [...base.conceptualMechanisms, ...fresh.conceptualMechanisms],
      practiceQuestions: [...(base.practiceQuestions || []), ...(fresh.practiceQuestions || [])],
      workedExamples: [...(base.workedExamples || []), ...(fresh.workedExamples || [])],
      compressionRatio: base.compressionRatio,
      // A grown deck keeps the provenance it was built with, so a card added by
      // "generate more" still lands in its source's document.
      sourceLabels: { ...(fresh.sourceLabels || {}), ...(base.sourceLabels || {}) },
    },
    added,
    dropped,
  };
}

/** One line for the outcome panel / RemNote header. */
export function summarizeMerge(dropped: number, sourceCount: number, conflicts = 0): string {
  const overlap = dropped > 0 ? `${dropped} duplicate card${dropped === 1 ? '' : 's'} dropped` : 'no overlap';
  const conflict = conflicts > 0 ? ` · ${conflicts} source conflict${conflicts === 1 ? '' : 's'} flagged` : '';
  return `${sourceCount} source${sourceCount === 1 ? '' : 's'} merged · ${overlap}${conflict}`;
}
