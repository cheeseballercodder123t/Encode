/**
 * Adaptive Difficulty Engine
 * Based on Vygotsky's Zone of Proximal Development.
 * Adjusts Generation Effect challenge complexity based on learner performance.
 */

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/** Compute difficulty from a 0-1 success rate */
export function getDifficultyLevel(successRate: number): DifficultyLevel {
  if (successRate >= 0.8) return 'hard';
  if (successRate >= 0.5) return 'medium';
  return 'easy';
}

/** Derive success rate from saved schemas userResponses */
export function computeSuccessRate(userResponses: Record<string, { feynmanReview?: { grade: string } }>): number {
  const values = Object.values(userResponses);
  if (values.length === 0) return 0.6; // default medium
  const scored = values.filter(r => r.feynmanReview);
  if (scored.length === 0) return 0.6;
  const successes = scored.filter(r =>
    r.feynmanReview?.grade === 'mastered' || r.feynmanReview?.grade === 'good'
  ).length;
  return successes / scored.length;
}

/** Returns a sentence to inject into the system prompt */
export function getDifficultyPromptModifier(level: DifficultyLevel): string {
  switch (level) {
    case 'hard':
      return `ADAPTIVE DIFFICULTY — HARD (learner success rate >=80%): Make the generationChallenge significantly harder. Provide only a single cryptic one-word clue. Include at least 3 missing components the learner must deduce. Use advanced cross-domain analogies.`;
    case 'easy':
      return `ADAPTIVE DIFFICULTY — EASY (learner success rate <50%): Make the generationChallenge more supportive. Provide a generous multi-sentence clue. Only ask for one missing component. Use a highly familiar everyday analogy as the premise.`;
    default:
      return `ADAPTIVE DIFFICULTY — MEDIUM: Standard challenge level. Provide one focused clue and ask for 1-2 missing components.`;
  }
}

/** Returns a human-readable label for the badge */
export function getDifficultyLabel(level: DifficultyLevel): string {
  return { easy: '🟢 Guided', medium: '🟡 Standard', hard: '🔴 Expert' }[level];
}
