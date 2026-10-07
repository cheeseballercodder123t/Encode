// ─── Adaptive escalation: payload contracts ─────────────────────────────────
//
// Plain data with no imports, the same shape as `lib/mr-m/types.ts`, so the
// pure modules on either side of it (the governor, the fusion matrix, the
// mutation matrix) can share one vocabulary without importing each other.
//
// The design rule the whole feature inherits from Mr M mode: a payload that is
// missing is SILENT. An escalation that has no clean telemetry does not
// escalate, a fusion with no matching row is not invented, and a mutation that
// does not carry its tier is refused rather than relabelled down.

// ─── The constraint-mutation matrix ─────────────────────────────────────────

export type MutationTier = 1 | 2 | 3;

/** One tier of the matrix: named, described, and enumerated exactly once. */
export interface MutationTierSpec {
  tier: MutationTier;
  name: string;
  /** One line on what the tier does to the easy assumptions. */
  blurb: string;
  /** The boundary conditions this tier mutates. Quoted verbatim into the prompt. */
  mutations: string[];
}

// ─── The ZPD friction governor ──────────────────────────────────────────────

/**
 * One problem-solving attempt, as the governor reads it.
 *
 * The plan's three signals are all here and all of them are recorded rather
 * than inferred: whether the mechanism landed (`secured`), how much scaffolding
 * was asked for (`rungsUsed`), and how long it took against how long the stage
 * said it would (`elapsedMs` / `expectedMs`).
 */
export interface FrictionEntry {
  id: string;
  topic: string;
  at: number;
  /** The examiner's read: did the physical cause-and-effect land? */
  secured: boolean;
  /** How many clue-ladder rungs were revealed before the answer was committed. */
  rungsUsed: number;
  /** Wall-clock time from the stage opening to the check, in ms. 0 when unknown. */
  elapsedMs: number;
  /** The stage's own estimate, in ms. 0 when the stage did not carry one. */
  expectedMs: number;
}

export type EscalationLevel = 'siloed' | 'boss';

/** What the governor decided, with the reasoning it decided from. */
export interface GovernorDecision {
  level: EscalationLevel;
  /** Consecutive clean wins, counting back from the newest attempt. */
  streak: number;
  /** The topic the streak was built on, for the boss brief. */
  topic: string;
  /** One line a learner can read, because a hidden difficulty knob is a bug. */
  reason: string;
}

// ─── Boss-level concept fusion ──────────────────────────────────────────────

/**
 * One cell of the fusion matrix: two or three siloed topics that, collided,
 * force the reconciliation a single chapter never asks for.
 *
 * The rows are DATA, not prompts. A domain with no row is not fused — the
 * learner is never handed an invented collision, because a fabricated
 * cross-chapter link is exactly the arbitrary noise this whole feature is
 * built to remove.
 */
export interface FusionRow {
  id: string;
  /** The course domain this collision lives in. */
  domain: string;
  /** The siloed topics being collided, named the way the learner would name them. */
  topics: string[];
  /** The boss problem the collision produces, as a brief for the generator. */
  problem: string;
  /** What the collision forces that neither topic forces alone. */
  couplings: string[];
  /** Conservative matching vocabulary: capitalisation-insensitive substring hits. */
  keywords: string[];
}
