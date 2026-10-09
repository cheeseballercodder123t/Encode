// ─── Boss-level concept fusion ──────────────────────────────────────────────
//
// The escalation the governor triggers is not "a harder problem on the same
// chapter". Rotating one chapter's numbers is still one chapter, and a learner
// at 20% CPU stays at 20% CPU. What actually restores the load is a COLLISION:
// two or three chapters that each carry a piece of the answer, arranged so the
// answer only exists if all of them are reconciled at once.
//
// The matrix below is that collision table, and it is DATA on purpose. Each row
// names a course domain, the siloed topics it collides, the boss problem that
// collision produces, and what the collision forces that neither topic forces
// alone. The rows are the plan's own three worked examples.
//
// The refusal is the important half: a topic with no matching row is NOT fused
// from scratch. A fabricated cross-chapter link that does not survive contact
// with the actual physics is worse than serving another single-topic problem,
// because the learner spends real working memory on a connection that is not
// load-bearing — and then has to unlearn it. So `matchFusion` returns null and
// the caller stays single-topic.
//
// ROW MATCHING ALONE IS NOT ENOUGH, and that is the second refusal. A learner who
// uploads one lecture on calorimetry hits this table, and a row is a collision of
// TWO OR THREE chapters — handing them the full thermochemistry collision would
// require formation enthalpies and gas work they have not met yet, which is not
// an escalation, it is a hallucinated second chapter. So breadth is MEASURED:
// `fusionReadiness` counts how many of the row's own topics the learner's
// material actually carries, and a collision is only served when at least two of
// them are present. One topic present is not a failed escalation either — it is
// a DEEPER one, and `soloDepthBrief` raises the load inside the chapter the
// learner actually has rather than inventing the chapter they do not.

import type { FusionRow } from './types';

/**
 * The fusion table. Three rows, each written the way the plan states them.
 *
 * These are chemistry and physiology because that is what the 500k-token study
 * log is made of; a row is a course-level fact, so adding one for another
 * domain is an entry here and not a new code path.
 */
export const FUSION_MATRIX: FusionRow[] = [
  {
    id: 'thermo-collision',
    domain: 'Thermochemistry',
    topics: [
      'Calorimetry (q = mcΔT)',
      'Heats of formation (ΔH°f)',
      'Boundary work (w = −PΔV)',
    ],
    problem:
      'Zinc is dropped into HCl inside a cylinder sealed by a frictionless piston. Work out the reaction enthalpy from formation enthalpies, the mechanical boundary work done by the H₂ gas as it expands, and the resulting solution temperature rise — simultaneously, from ΔE = q + w, with the piston free to move.',
    couplings: [
      'The energy balance is ΔE = q + w, so a heat measured in an open beaker and a heat measured under a piston are NOT the same quantity — the collision is that both numbers come from the same reaction.',
      'The moles of gas that do the work are the moles of H₂ produced, which come from the limiting reactant, not from the mass of zinc alone.',
      'The temperature rise and the volume change are coupled: the pressure is fixed, so the work depends on how much gas formed, while q depends on the solution mass that formed with it.',
    ],
    keywords: [
      'thermochem',
      'calorim',
      'enthalp',
      'formation',
      'combustion',
      'hess',
      'piston',
      'expansion work',
      'boundary work',
      'mcΔ',
      'q = mc',
      'Δh',
    ],
  },
  {
    id: 'solution-collision',
    domain: 'Solution chemistry',
    topics: [
      'Acid–base titration',
      'Limiting reactants',
      'Solution density traps',
    ],
    problem:
      'A weak acid is titrated with a strong base, the volumes are unequal, the solution density is 1.08 g/mL, and the limiting reactant is the base. Determine the final pH from the buffer equilibrium (Henderson–Hasselbalch) rather than from the stoichiometry of the neutralisation alone.',
    couplings: [
      'The moles decide which regime the solution is in (excess acid, equivalence, or excess base) — not the volumes — so the limiting reactant has to be found before any pH is written.',
      'The mass in q = mcΔT is the mass of the whole solution, which requires the density: taking the volume in mL as though it were grams is the trap the non-unit density is there to spring.',
      'At equivalence the assumption that "neutralisation means pH 7" fails for a weak acid, so the buffer region and the hydrolysis of the conjugate base have to be reconciled with each other.',
    ],
    keywords: [
      'titrat',
      'acid-base',
      'acid base',
      'buffer',
      'henderson',
      'hasselbalch',
      'limiting reactant',
      'density',
      'molarity',
      'equivalence point',
      'pka',
    ],
  },
  {
    id: 'electrophysiology-collision',
    domain: 'Electrophysiology',
    topics: [
      'Nernst equilibrium potential',
      'Goldman–Hodgkin–Katz equation',
      'Channel block',
    ],
    problem:
      'Extracellular [K⁺] is changed suddenly while a fraction of the voltage-gated Na⁺ channels are pharmacologically blocked. Determine both the shift in the resting membrane potential and the shift in the firing threshold, and explain why the two do not move by the same amount.',
    couplings: [
      'The resting potential is set by the permeant ions, so a K⁺ shift moves it toward the new E_K — but only as far as K⁺ conductance allows, which is what the GHK equation carries and the Nernst equation alone does not.',
      'A partial Na⁺ channel block lowers the inward current available to reach threshold, so the threshold rises at the same time as the resting potential falls; the voltage gap between them is what actually changes.',
      'Because both the resting potential and the threshold move, the excitability change cannot be read off either one alone — the collision is the difference between them.',
    ],
    keywords: [
      'electrophysiolog',
      'membrane potential',
      'resting potential',
      'action potential',
      'nernst',
      'goldman',
      'ghk',
      'equilibrium potential',
      'channel block',
      'permeability',
      'neuron',
      'axon',
    ],
  },
];

/** Lowercase, whitespace-collapsed haystack for conservative substring matching. */
function normalize(text: string): string {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The best-matching fusion row for a topic, or null when nothing matches.
 *
 * Scoring is the count of distinct keyword hits, and a row needs at least one
 * hit to be considered at all. Ties go to the earlier row, so the result is
 * deterministic — the same topic always resolves to the same collision.
 *
 * Deliberately conservative: one keyword is enough to be a CANDIDATE, but the
 * caller (the crucible) shows the learner which chapters are being collided, so
 * a wrong match is visible immediately rather than silently changing the exam.
 */
export function matchFusion(topicText: string, rows: FusionRow[] = FUSION_MATRIX): FusionRow | null {
  const haystack = normalize(topicText);
  if (!haystack) return null;

  let best: { row: FusionRow; score: number } | null = null;
  for (const row of rows) {
    let score = 0;
    for (const keyword of row.keywords) {
      if (haystack.includes(normalize(keyword))) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { row, score };
    }
  }
  return best ? best.row : null;
}

/**
 * The directive the STRONG model gets when the governor has called boss level.
 *
 * The couplings travel in the prompt because they are the point: each one names
 * something the single-chapter version cannot teach, so the model cannot satisfy
 * the brief by stapling two exercises together — it has to make the answer
 * depend on both.
 */
export function fusionBrief(row: FusionRow): string {
  return `BOSS-LEVEL CONCEPT FUSION — ${row.domain.toUpperCase()}.

The learner has solved ${row.topics.length} chapters' worth of problems without scaffolding, so the load has to come from a COLLISION rather than from a harder single-chapter problem.

COLLIDE:
${row.topics.map((topic) => `  · ${topic}`).join('\n')}

THE COLLISION (the problem shape): ${row.problem}

WHAT THE COLLISION FORCES — every one of these must be load-bearing in your problem:
${row.couplings.map((coupling) => `  · ${coupling}`).join('\n')}

REQUIREMENTS:
1. Do not staple two exercises together. A single answer must require both chapters, so that solving either chapter alone leaves the answer genuinely underdetermined.
2. Every number must be physically consistent, and the units must survive the whole chain.
3. No hints, no intermediate values, no method names in the statement.
4. State the constraints and what is being asked for; the derivation is the learner's.`;
}

// ─── Breadth: a collision needs two chapters, and they have to be present ───

/** What a topic's presence looks like in the learner's own material. */
export interface FusionReadiness {
  /** The row whose domain the topic belongs to, or null when nothing matched. */
  row: FusionRow | null;
  /** How many of the row's topics the material carries. */
  matchedTopics: number;
  /** How many topics the row collides, in total. */
  totalTopics: number;
  /** The topics the material actually carries, named as the row names them. */
  present: string[];
  /** The topics it does not, which is what the collision would have to invent. */
  absent: string[];
  /** True only when the collision is served: two or more topics present. */
  ready: boolean;
  /** One line, shown to the learner, because a re-aimed escalation must say so. */
  reason: string;
}

/**
 * The vocabulary that marks one topic as present.
 *
 * Derived from the topic's own words rather than added as a third list to keep
 * in sync: a topic named "Heats of formation (ΔH°f)" is present when the
 * material talks about formation enthalpies, and the words that say so are in
 * its name. Words this short or this generic are dropped, because "of" and
 * "the" are in every topic's name and would mark every topic present.
 */
const STOPWORDS = new Set([
  'the', 'and', 'of', 'a', 'an', 'in', 'on', 'to', 'for', 'with', 'by',
  'from', 'at', 'as', 'or', 'is', 'are', 'its', 'it', 'that', 'this', 'their',
]);

function topicWords(topic: string): string[] {
  return normalize(topic)
    .replace(/[()=+−-]/g, ' ')
    .split(/[^a-z0-9°Δ]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

function topicPresent(topic: string, haystack: string): boolean {
  const words = topicWords(topic);
  if (words.length === 0) return false;
  // A topic is present when its own distinctive vocabulary shows up — a single
  // hit is enough for the CHAPTER to count, because the caller reports which
  // chapters it collided, so a marginal hit is visible rather than silent.
  return words.some((word) => haystack.includes(word));
}

/**
 * How ready the material is for a collision on this topic.
 *
 * `topicText` is what the learner named (or the stage's topic); `context` is the
 * source material when there is any. Both are searched, because a learner who
 * types "calorimetry" while their notes cover formation enthalpies HAS the
 * second chapter, and refusing the collision on the strength of the topic string
 * alone would under-serve exactly the case this is built for.
 */
export function fusionReadiness(
  topicText: string,
  context = '',
  rows: FusionRow[] = FUSION_MATRIX
): FusionReadiness {
  const row = matchFusion(topicText, rows) ?? matchFusion(context, rows);
  if (!row) {
    return {
      row: null,
      matchedTopics: 0,
      totalTopics: 0,
      present: [],
      absent: [],
      ready: false,
      reason:
        'No collision is on file for this material, so the escalation stays inside the chapter rather than inventing a second one.',
    };
  }

  const haystack = `${normalize(topicText)} ${normalize(context)}`;
  const present: string[] = [];
  const absent: string[] = [];
  for (const topic of row.topics) {
    if (topicPresent(topic, haystack)) present.push(topic);
    else absent.push(topic);
  }

  const ready = present.length >= 2;
  return {
    row,
    matchedTopics: present.length,
    totalTopics: row.topics.length,
    present,
    absent,
    ready,
    // Three readings, not two. A row can match on its DOMAIN alone ("Thermochemistry"
    // is enough to find the collision, and carries none of its chapters), and the
    // one-chapter sentence would then tell the learner a chapter is in the material
    // that the read never found — while `soloDepthBrief` deepens it. The zero case
    // says what it measured instead of naming a chapter by default.
    reason: ready
      ? `${present.length} of ${row.topics.length} ${row.domain} chapters are in this material, so the sprint can collide them: ${present.join(' + ')}.`
      : present.length === 1
        ? `Only one ${row.domain} chapter is in this material (${present[0]}), so the sprint goes DEEPER inside that chapter instead of colliding it with ${absent.join(' + ')} — a collision with a chapter you have not met is not an escalation, it is a problem you cannot finish.`
        : `This material matches ${row.domain}, but none of the chapters the collision needs could be identified in it, so the sprint goes DEEPER inside the chapter the material actually carries instead of colliding it with ${absent.join(' + ')} — a collision with a chapter you have not met is not an escalation, it is a problem you cannot finish.`,
  };
}

/**
 * The brief for a re-aimed escalation: same chapter, harder boundary conditions.
 *
 * This is what "boss level" means when the material carries one chapter. The
 * load has to come from somewhere, and the honest source is the constraint
 * mutation matrix applied to the chapter the learner actually has — asymmetry,
 * a non-unit density, a phase change — rather than a second chapter's vocabulary
 * bolted onto a problem that does not need it. It also says, in the prompt and
 * in the learner's own copy, that no collision was faked.
 */
export function soloDepthBrief(readiness: FusionReadiness): string {
  // With no chapter identified, the subject is the row's DOMAIN: naming one of
  // its topics would point the deepening at a chapter the material may not carry
  // at all — the same mistake the readiness line above deliberately avoids.
  const topic = readiness.present[0] || readiness.row?.domain || 'the topic';
  const missing = readiness.absent.length > 0 ? readiness.absent.join(' + ') : 'a second chapter';
  const carried =
    readiness.present.length === 1
      ? 'this material carries one chapter'
      : "none of the collision's chapters could be identified in the material";
  return `BOSS-LEVEL DEPTH — ${topic.toUpperCase()}, ONE CHAPTER.

The learner has solved consecutive problems without scaffolding, so the load has to rise. It cannot rise by COLLISION here: ${carried}, and ${missing} is not in it. Do NOT invent a second chapter, do NOT import vocabulary the learner has not met, and do NOT staple a distractor onto the statement.

RAISE THE LOAD INSIDE ${topic.toUpperCase()} instead, by mutating its boundary conditions:
  · Break any 1:1 or unit-value assumption the easy version relies on — unequal ratios, a non-unit density, an imperfect yield, a non-standard temperature or pressure.
  · Require the SAME quantity to be reached from two constructions that must agree (an energy balance and a state function, a stoichiometric route and a conservation route), so a single formula cannot finish it.
  · Make one stated constraint a DISTRACTOR that is true but not needed, so the learner has to decide what the system actually demands.

REQUIREMENTS:
1. One answer, still underdetermined by any single rule from this chapter.
2. Every number physically consistent, and the units must survive the whole chain.
3. No hints, no intermediate values, no method names in the statement.
4. State the constraints and what is being asked for; the derivation is the learner's.`;
}
