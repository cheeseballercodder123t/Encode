import { describe, it, expect } from 'vitest';
import { generateSegregationRemnote, generateRemnoteHierarchy } from '@/lib/remnote';
import { SegregationReport } from '@/lib/types';

describe('generateSegregationRemnote (RemNote flashcards)', () => {
  const report: SegregationReport = {
    topic: 'Action Potentials',
    declarativeFacts: [
      {
        id: 'f1',
        factStatement: 'The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.',
        question: 'Na+/K+ pump net movement?',
        clozeSuggestion: 'The pump moves {{3 Na+ out}} per ATP.',
        memoryHook: '3 out, 2 in',
      },
    ],
    conceptualMechanisms: [
      {
        id: 'm1',
        conceptName: 'Depolarization',
        whatIsIt: 'Membrane potential moves toward 0',
        whyItMatters: 'Triggers AP',
        howItWorks: 'Na+ channels open, Na+ rushes in',
        whatIfEdgeCase: 'No AP fires',
        boundaryContrast: { confusableLookalike: 'Repolarization', distinguishingRule: 'Na+ vs K+ gate' },
      },
    ],
    practiceQuestions: [
      { id: 'q1', question: 'Resting potential?', answer: '-70mV', whyCorrect: 'K+ leak sets it' },
    ],
    workedExamples: [
      { id: 'e1', title: 'Nernst', problem: 'Find EK', steps: ['Plug values', 'Solve'], takeaway: 'Gradient rules' },
    ],
  };

  it('emits :: descriptors for every content line (flashcards, not notes)', () => {
    const payload = generateSegregationRemnote(report);
    const lines = payload.markdown.split('\n');
    // Every bullet content line carries `::` (descriptors are RemNote cards).
    const bullets = lines.filter((l) => l.startsWith('-'));
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) {
      expect(bullet).toContain('::');
    }
    // Fact with a short question renders as Q :: A.
    expect(payload.markdown).toContain('Na+/K+ pump net movement?');
    // Fact WITHOUT a question falls back to the cloze front, preserving the
    // {{deletion}} for RemNote cloze cards.
    const clozeOnly = generateSegregationRemnote({
      ...report,
      declarativeFacts: [
        { id: 'f2', factStatement: 'Threshold is -55mV.', clozeSuggestion: 'Threshold is {{-55mV}}.' },
      ],
    });
    expect(clozeOnly.markdown).toContain('Threshold is {{-55mV}}.');
    // Drills and worked-example step cards all present.
    expect(payload.markdown).toContain('Resting potential?');
    expect(payload.markdown).toContain('Step 1 :: Plug values');
    expect(payload.cardCount).toBeGreaterThan(6);
    expect(payload.factsCount).toBe(1);
    expect(payload.conceptsCount).toBe(1);
  });

  it('never falls back to plain child notes for the old schema path', () => {
    const schemaPayload = generateRemnoteHierarchy({
      topicSummary: 'T',
      activities: [
        {
          id: 'a1', stageNumber: 1, title: 'Stage 1', framework: 'F', cognitiveGoal: 'G',
          contextSnippet: 'ctx', keywords: ['K'], templateType: 'first_principles',
          prompt: 'P', scaffold: { field1Label: '', field1Placeholder: '', field2Label: '', field2Placeholder: '', exampleAnswer: '' },
        },
      ],
    });
    expect(schemaPayload.markdown).toContain('::');
  });
});