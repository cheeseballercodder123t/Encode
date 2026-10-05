import { describe, it, expect } from 'vitest';
import { normalizeSegregationReport, mergeSegregationReports } from '@/lib/services/forge';
import { extractAnkiCardsFromSchema } from '@/lib/anki-exporter';
import { generateSegregationRemnote } from '@/lib/remnote';
import { SegregationReport, ConfusablePairItem } from '@/lib/types';

describe('Confusable Pairs & Discrimination Matrix', () => {
  const samplePair: ConfusablePairItem = {
    id: 'cp_1',
    conceptA: 'SN1 Reaction',
    conceptB: 'SN2 Reaction',
    distinguishingAxis: 'Rate Law & Intermediate Stability',
    boundaryCondition: 'Tertiary alkyl halide + polar protic solvent favors SN1; primary substrate + strong nucleophile favors SN2',
    conceptAFeature: 'Two-step unimolecular mechanism via carbocation intermediate; racemization occurs',
    conceptBFeature: 'One-step bimolecular concerted mechanism with backside attack; Walden inversion occurs',
    diagnosticVignette: 'Treating (R)-2-bromobutane with sodium cyanide in DMSO yields inverted (S)-2-methylbutanenitrile.',
    diagnosticAnswer: 'SN2 mechanism (polar aprotic solvent DMSO + strong nucleophile CN- + Walden inversion).',
  };

  it('normalizes confusablePairs from raw AI responses', () => {
    const raw = {
      topic: 'Organic Chemistry Reactions',
      declarativeFacts: [{ id: 'f1', factStatement: 'SN1 is unimolecular.' }],
      conceptualMechanisms: [],
      confusablePairs: [samplePair],
    };

    const report = normalizeSegregationReport(raw, 'src_1');
    expect(report).not.toBeNull();
    expect(report?.confusablePairs).toHaveLength(1);
    expect(report?.confusablePairs?.[0].conceptA).toBe('SN1 Reaction');
    expect(report?.confusablePairs?.[0].conceptB).toBe('SN2 Reaction');
    expect(report?.confusablePairs?.[0].boundaryCondition).toContain('Tertiary alkyl halide');
  });

  it('auto-synthesizes confusable pairs from mechanisms with boundaryContrast if omitted', () => {
    const raw = {
      topic: 'Cell Biology',
      declarativeFacts: [{ id: 'f1', factStatement: 'Mitosis creates identical diploids.' }],
      conceptualMechanisms: [
        {
          id: 'm1',
          conceptName: 'Mitosis',
          whatIsIt: 'Equational cell division producing 2 genetically identical daughter cells.',
          whyItMatters: 'Growth and tissue repair in somatic cells.',
          howItWorks: 'Single round of replication followed by single division separating sister chromatids.',
          whatIfEdgeCase: 'Nondisjunction leads to aneuploidy in daughter cells.',
          boundaryContrast: {
            confusableLookalike: 'Meiosis',
            distinguishingRule: 'Mitosis maintains ploidy (2n -> 2n) without crossing over; Meiosis halves ploidy (2n -> 1n) with homologue recombination.',
          },
        },
      ],
    };

    const report = normalizeSegregationReport(raw, 'src_1');
    expect(report).not.toBeNull();
    expect(report?.confusablePairs).toHaveLength(1);
    expect(report?.confusablePairs?.[0].conceptA).toBe('Mitosis');
    expect(report?.confusablePairs?.[0].conceptB).toBe('Meiosis');
    expect(report?.confusablePairs?.[0].boundaryCondition).toContain('Mitosis maintains ploidy');
  });

  it('merges and deduplicates confusablePairs across sources', () => {
    const input1 = {
      source: { id: 's1', kind: 'text' as const, label: 'Slide Deck 1' },
      report: {
        topic: 'Chemistry',
        declarativeFacts: [],
        conceptualMechanisms: [],
        confusablePairs: [samplePair],
      } as unknown as SegregationReport,
    };

    const input2 = {
      source: { id: 's2', kind: 'text' as const, label: 'Slide Deck 2' },
      report: {
        topic: 'Chemistry',
        declarativeFacts: [],
        conceptualMechanisms: [],
        confusablePairs: [{ ...samplePair, id: 'cp_2_duplicate' }],
      } as unknown as SegregationReport,
    };

    const merged = mergeSegregationReports([input1, input2], 'Chemistry');
    expect(merged.report.confusablePairs).toHaveLength(1);
  });

  it('generates high-yield Anki comparison matrix and diagnostic drill cards', () => {
    const report: SegregationReport = {
      topic: 'Organic Chemistry',
      declarativeFacts: [],
      conceptualMechanisms: [],
      confusablePairs: [samplePair],
    };

    const cards = extractAnkiCardsFromSchema(null, report);
    expect(cards).toHaveLength(2);

    // Card 1: Boundary condition with HTML Comparison Matrix
    const matrixCard = cards.find((c) => c.tags.includes('DiscriminationMatrix'));
    expect(matrixCard).toBeDefined();
    expect(matrixCard?.front).toContain('SN1 Reaction');
    expect(matrixCard?.front).toContain('SN2 Reaction');
    expect(matrixCard?.back).toContain('Boundary Condition:');
    expect(matrixCard?.back).toContain('<table');
    expect(matrixCard?.back).toContain(samplePair.distinguishingAxis);

    // Card 2: Diagnostic Vignette Drill
    const drillCard = cards.find((c) => c.tags.includes('DiagnosticDrill'));
    expect(drillCard).toBeDefined();
    expect(drillCard?.front).toContain('(R)-2-bromobutane');
    expect(drillCard?.back).toContain('{{c1::SN1 Reaction}}');
    expect(drillCard?.isCloze).toBe(true);
  });

  it('renders discrimination matrix cards in RemNote hierarchical markdown', () => {
    const report: SegregationReport = {
      topic: 'Organic Chemistry',
      declarativeFacts: [],
      conceptualMechanisms: [],
      confusablePairs: [samplePair],
    };

    const remnote = generateSegregationRemnote(report);
    expect(remnote.markdown).toContain('Confusable Pairs & Discrimination Matrix');
    // The pair's names ride as [[wikilink]] concept portals (plan Pillar 3).
    expect(remnote.markdown).toContain('When does the system switch from [[SN1 Reaction]] to [[SN2 Reaction]]?');
    expect(remnote.markdown).toContain(samplePair.boundaryCondition);
    expect(remnote.markdown).toContain(samplePair.distinguishingAxis);
  });
});
