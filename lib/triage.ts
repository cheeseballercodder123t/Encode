// ─── The Fluff Guillotine (pre-encoding semantic triage) ────────────────────
//
// A four-page lecture handout is mostly scaffolding: historical preamble,
// professor anecdotes, conversational throat-clearing, administrative text.
// Feeding all of it to the encoder dilutes every stage that comes out, because
// the model splits its attention across material that carries no causal or
// factual payload.
//
// The triage pass segments the source deterministically (so the heatmap can
// point at the *exact* text it classified) and asks the model for one label per
// unit:
//
//   kernel   — causal transitions, definitions, equations, the load-bearing claim
//   evidence — experiments, data points, numbers that support a kernel
//   noise    — preamble, rhetoric, anecdotes, administrative text
//
// The learner then strips the noise in one tap. Unknown or malformed verdicts
// degrade to `kernel`, never to `noise`: silently deleting study material is a
// far worse failure than keeping a sentence that did not need to be there.

export type TriageKind = 'kernel' | 'evidence' | 'noise';

export interface TriageUnit {
  index: number;
  text: string;
  kind: TriageKind;
  /** One-line reason from the examiner ('' when it did not provide one). */
  note: string;
}

export interface TriageStats {
  total: number;
  kernel: number;
  evidence: number;
  noise: number;
  totalWords: number;
  keptWords: number;
  /** Share of source words triaged as syntactic noise, 0–100. */
  noisePct: number;
  /** Share of source words kept as informational core, 0–100. */
  densityPct: number;
}

export interface TriageReport {
  units: TriageUnit[];
  stats: TriageStats;
  /** One-line verdict on the source's informational density. */
  summary: string;
}

export const TRIAGE_KIND_LABEL: Record<TriageKind, string> = {
  kernel: 'Causal kernel',
  evidence: 'Supporting evidence',
  noise: 'Syntactic noise',
};

const TRIAGE_KINDS: readonly TriageKind[] = ['kernel', 'evidence', 'noise'];

/** Units longer than this are split into sentences so the heatmap stays granular. */
const MAX_UNIT_WORDS = 90;

export function countTriageWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Breaks a block into sentence-ish fragments without lookbehind (Safari-safe). */
function splitSentences(block: string): string[] {
  const matches = block.match(/[^.!?]+[.!?]*/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Deterministic segmentation of the source into triage units.
 *
 * Paragraph breaks are the model's own structure, so they are respected first;
 * only paragraphs that would blow past the granularity budget are broken into
 * sentences. Deterministic = the UI can render the heatmap against the exact
 * same strings the model was shown.
 */
export function splitTriageUnits(source: string): string[] {
  if (!source) return [];
  const blocks = source
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const block of blocks) {
    if (countTriageWords(block) <= MAX_UNIT_WORDS) {
      units.push(block);
      continue;
    }
    const sentences = splitSentences(block);
    // Guard against a pathological block with no sentence punctuation at all.
    units.push(...(sentences.length > 1 ? sentences : [block]));
  }
  return units;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/**
 * Merges the model's per-unit verdicts onto the deterministic segmentation.
 * A missing, mistyped or out-of-range verdict keeps the unit (as `kernel`) so
 * the guillotine can never delete material the model failed to classify.
 */
export function applyTriageVerdicts(units: string[], raw: unknown): TriageUnit[] {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const verdicts = Array.isArray(data.units) ? data.units : [];

  const byIndex = new Map<number, { kind: TriageKind; note: string }>();
  for (const v of verdicts) {
    if (!v || typeof v !== 'object') continue;
    const index = Number((v as Record<string, any>).index);
    if (!Number.isInteger(index) || index < 0) continue;
    const rawKind = String((v as Record<string, any>).kind || '').toLowerCase();
    const kind = (TRIAGE_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as TriageKind)
      : 'kernel';
    byIndex.set(index, { kind, note: asString((v as Record<string, any>).note) });
  }

  return units.map((text, index) => {
    const verdict = byIndex.get(index);
    return {
      index,
      text,
      kind: verdict?.kind ?? 'kernel',
      note: verdict?.note ?? '',
    };
  });
}

/** Coerces an /api/triage payload into a safe, renderable report. */
export function validateTriageReport(raw: unknown, source: string): TriageReport {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const units = applyTriageVerdicts(splitTriageUnits(source), data);
  return {
    units,
    stats: triageStats(units),
    summary: asString(data.summary, 'Semantic heatmap complete.'),
  };
}

export function triageStats(units: TriageUnit[]): TriageStats {
  let kernel = 0;
  let evidence = 0;
  let noise = 0;
  let totalWords = 0;
  let keptWords = 0;

  for (const unit of units) {
    const words = countTriageWords(unit.text);
    totalWords += words;
    if (unit.kind === 'kernel') {
      kernel += 1;
      keptWords += words;
    } else if (unit.kind === 'evidence') {
      evidence += 1;
      keptWords += words;
    } else {
      noise += 1;
    }
  }

  const noisePct = totalWords > 0 ? Math.round(((totalWords - keptWords) / totalWords) * 100) : 0;
  return {
    total: units.length,
    kernel,
    evidence,
    noise,
    totalWords,
    keptWords,
    noisePct,
    densityPct: 100 - noisePct,
  };
}

/**
 * The one-tap guillotine: keeps the informational core and drops the noise.
 * Falls back to the original source if everything came back as noise, because
 * an empty workbench is never the right answer.
 */
export function stripNoise(units: TriageUnit[], source = ''): string {
  const kept = units.filter((u) => u.kind !== 'noise').map((u) => u.text.trim()).filter(Boolean);
  if (kept.length === 0) return source;
  return kept.join('\n\n');
}
