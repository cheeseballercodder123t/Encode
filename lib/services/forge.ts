import {
  ConceptualMechanismItem,
  DeclarativeFactItem,
  PracticeQuestionItem,
  SegregationReport,
  WorkedExampleItem,
} from '@/lib/types';

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
}

export interface ForgeResult {
  report: SegregationReport;
  sources: ForgedSourceResult[];
  /** Cards dropped as duplicates of a card an earlier source already had. */
  dropped: number;
  counts: ForgeSectionCounts;
  /** Total cards in the merged deck. */
  total: number;
}

export interface ForgeMergeInput {
  source: ForgeSource;
  report: SegregationReport | null;
  note?: string;
}

const EMPTY_COUNTS: ForgeSectionCounts = { facts: 0, mechanisms: 0, drills: 0, examples: 0 };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Case/punctuation/space-insensitive key, so near-identical cards collapse. */
export function dedupeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  const topic = text(raw.topic);
  if (facts.length === 0 && mechanisms.length === 0 && drills.length === 0 && examples.length === 0) {
    return null;
  }

  return {
    topic: topic || 'Forged Deck',
    declarativeFacts: facts,
    conceptualMechanisms: mechanisms,
    practiceQuestions: drills,
    workedExamples: examples,
    compressionRatio: text(raw.compressionRatio) || undefined,
  };
}

function countOf(report: SegregationReport): ForgeSectionCounts {
  return {
    facts: report.declarativeFacts.length,
    mechanisms: report.conceptualMechanisms.length,
    drills: report.practiceQuestions?.length || 0,
    examples: report.workedExamples?.length || 0,
  };
}

export function isEmptyForgeReport(report: SegregationReport): boolean {
  const c = countOf(report);
  return c.facts + c.mechanisms + c.drills + c.examples === 0;
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
export function mergeSegregationReports(inputs: ForgeMergeInput[], topic?: string): ForgeResult {
  const sources: ForgedSourceResult[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  const facts: DeclarativeFactItem[] = [];
  const mechanisms: ConceptualMechanismItem[] = [];
  const drills: PracticeQuestionItem[] = [];
  const examples: WorkedExampleItem[] = [];

  const take = (key: string): boolean => {
    if (!key) return false;
    if (seen.has(key)) {
      dropped += 1;
      return false;
    }
    seen.add(key);
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

    const before: ForgeSectionCounts = countOf(report);
    const kept: ForgeSectionCounts = { ...EMPTY_COUNTS };

    for (const fact of report.declarativeFacts) {
      if (!take(dedupeKey(fact.factStatement))) continue;
      facts.push(fact);
      kept.facts += 1;
    }
    for (const mech of report.conceptualMechanisms) {
      if (!take(dedupeKey(mech.conceptName))) continue;
      mechanisms.push(mech);
      kept.mechanisms += 1;
    }
    for (const drill of report.practiceQuestions || []) {
      if (!take(dedupeKey(drill.question))) continue;
      drills.push(drill);
      kept.drills += 1;
    }
    for (const example of report.workedExamples || []) {
      if (!take(dedupeKey(`${example.title} ${example.problem}`))) continue;
      examples.push(example);
      kept.examples += 1;
    }

    const sourceDropped =
      before.facts + before.mechanisms + before.drills + before.examples -
      (kept.facts + kept.mechanisms + kept.drills + kept.examples);

    sources.push({
      ...input.source,
      status: 'ok',
      counts: kept,
      note: sourceDropped > 0 ? `${sourceDropped} card(s) already in the deck` : input.note,
    });
  }

  const total = facts.length + mechanisms.length + drills.length + examples.length;
  const report: SegregationReport = {
    topic: topic?.trim() || inputs.find((i) => i.report?.topic)?.report?.topic || 'Forged Deck',
    declarativeFacts: facts,
    conceptualMechanisms: mechanisms,
    practiceQuestions: drills,
    workedExamples: examples,
    compressionRatio: summarizeMerge(dropped, sources.filter((s) => s.status === 'ok').length),
  };

  return {
    report,
    sources,
    dropped,
    total,
    counts: { facts: facts.length, mechanisms: mechanisms.length, drills: drills.length, examples: examples.length },
  };
}

/** One line for the outcome panel / RemNote header. */
export function summarizeMerge(dropped: number, sourceCount: number): string {
  const overlap = dropped > 0 ? `${dropped} duplicate card${dropped === 1 ? '' : 's'} dropped` : 'no overlap';
  return `${sourceCount} source${sourceCount === 1 ? '' : 's'} merged · ${overlap}`;
}
