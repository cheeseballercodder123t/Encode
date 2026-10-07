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
