import { describe, it, expect } from 'vitest';
import {
  validatePrimingDrill,
  gradePrimingStep,
  summarizePriming,
  isPlayableDrill,
  isPrimingKind,
  PRIMING_KIND_LABEL,
  PRIMING_KIND_BLURB,
  PRIMING_STEP_TARGET,
  PrimingDrill,
  PrimingStep,
} from '@/lib/priming';

const step = (over: Record<string, unknown> = {}) => ({
  prompt: 'What happens to the flow Q as viscosity tends to infinity?',
  choices: [
    { id: 'a', label: 'Flow stops entirely' },
    { id: 'b', label: 'Flow is unchanged' },
    { id: 'c', label: 'Flow doubles' },
  ],
  correctChoiceId: 'a',
  trapChoiceId: 'b',
  trapExplanation: 'Viscosity feels like a property of the fluid, not a term in the flow.',
  reveal: 'As viscosity diverges the denominator diverges, so Q must tend to zero.',
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  kind: 'extremum',
  setup: 'Poiseuille flow through a vessel of radius r.',
  steps: [step()],
  principle: 'A quantity that kills the output at infinity lives in the denominator.',
  cardFront: 'Why must viscosity sit in the denominator of Poiseuille?',
  cardBack: 'Because {{c1::infinite viscosity stops the flow}}, so eta must divide.',
  ...over,
});

describe('priming archetypes', () => {
  it('recognizes the four archetypes', () => {
    expect(isPrimingKind('shape')).toBe(true);
    expect(isPrimingKind('gradient')).toBe(true);
    expect(isPrimingKind('dimensional')).toBe(true);
    expect(isPrimingKind('extremum')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPrimingKind('vibes')).toBe(false);
    expect(isPrimingKind(undefined)).toBe(false);
    expect(isPrimingKind(3)).toBe(false);
  });

  it('labels and describes every archetype', () => {
    for (const kind of ['shape', 'gradient', 'dimensional', 'extremum'] as const) {
      expect(PRIMING_KIND_LABEL[kind]).toBeTruthy();
      expect(PRIMING_KIND_BLURB[kind]).toBeTruthy();
    }
  });

  it('fixes the probe count per archetype: 2 for the polarity check, 3 for the sweep', () => {
    expect(PRIMING_STEP_TARGET.gradient).toBe(2);
    expect(PRIMING_STEP_TARGET.extremum).toBe(3);
    expect(PRIMING_STEP_TARGET.shape).toBe(1);
    expect(PRIMING_STEP_TARGET.dimensional).toBe(1);
  });
});

describe('validatePrimingDrill', () => {
  it('passes a multi-probe drill through unchanged', () => {
    const drill = validatePrimingDrill(
      payload({
        kind: 'gradient',
        steps: [step({ prompt: 'Where is the density?' }), step({ prompt: 'Where is the deficit?' })],
      })
    );
    expect(drill.kind).toBe('gradient');
    expect(drill.steps).toHaveLength(2);
    expect(drill.steps.map((s) => s.prompt)).toEqual(['Where is the density?', 'Where is the deficit?']);
    expect(isPlayableDrill(drill)).toBe(true);
  });

  it('reads a flat single-question payload as a one-probe drill', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: undefined,
        prompt: 'What must happen at the extremes?',
        choices: [
          { id: 'a', label: 'Flow stops' },
          { id: 'b', label: 'Flow doubles' },
        ],
        correctChoiceId: 'a',
        trapChoiceId: 'b',
        reveal: 'The denominator diverges.',
        trapExplanation: 'It feels like a property.',
      })
    );
    expect(drill.steps).toHaveLength(1);
    expect(drill.steps[0].prompt).toBe('What must happen at the extremes?');
    expect(drill.steps[0].correctChoiceId).toBe('a');
    expect(isPlayableDrill(drill)).toBe(true);
  });

  it('drops an unplayable probe but keeps the rest of the sweep', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: [
          step({ prompt: 'First' }),
          { prompt: 'Broken', choices: [{ id: 'a', label: 'Only one option' }] },
          step({ prompt: 'Third' }),
        ],
      })
    );
    expect(drill.steps.map((s) => s.prompt)).toEqual(['First', 'Third']);
    expect(isPlayableDrill(drill)).toBe(true);
  });

  it('caps the sweep at three probes', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: Array.from({ length: 5 }, (_, i) => step({ prompt: `Probe ${i + 1}` })),
      })
    );
    expect(drill.steps.map((s) => s.prompt)).toEqual(['Probe 1', 'Probe 2', 'Probe 3']);
  });

  it('reports an unusable drill when no probe survives', () => {
    const drill = validatePrimingDrill(
      payload({ steps: [{ prompt: 'Broken', choices: [{ id: 'a', label: 'Only' }] }] })
    );
    expect(drill.steps).toEqual([]);
    expect(isPlayableDrill(drill)).toBe(false);
  });

  it('falls back to the first choice when the correct id matches nothing', () => {
    const drill = validatePrimingDrill(payload({ steps: [step({ correctChoiceId: 'zzz' })] }));
    expect(drill.steps[0].correctChoiceId).toBe('a');
    // The trap must never collide with the (new) correct answer.
    expect(drill.steps[0].trapChoiceId).toBe('b');
  });

  it('drops a trap that duplicates the correct choice', () => {
    expect(validatePrimingDrill(payload({ steps: [step({ trapChoiceId: 'a' })] })).steps[0].trapChoiceId).toBe('');
  });

  it('drops a trap id that is not among the choices', () => {
    expect(validatePrimingDrill(payload({ steps: [step({ trapChoiceId: 'nope' })] })).steps[0].trapChoiceId).toBe('');
  });

  it('scopes traps per probe: one dropped trap does not disarm the next', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: [
          step({ prompt: 'First', trapChoiceId: 'a' }),
          step({ prompt: 'Second', trapChoiceId: 'b' }),
        ],
      })
    );
    expect(drill.steps[0].trapChoiceId).toBe('');
    expect(drill.steps[1].trapChoiceId).toBe('b');
  });

  it('filters empty labels and caps the option list at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `Option ${i}` }));
    const drill = validatePrimingDrill(
      payload({ steps: [step({ choices: [{ id: 'x', label: '   ' }, ...many], correctChoiceId: 'c0' })] })
    );
    expect(drill.steps[0].choices).toHaveLength(5);
    expect(drill.steps[0].choices.every((c) => c.label.length > 0)).toBe(true);
  });

  it('generates ids for options that arrive without one', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: [step({ choices: [{ label: 'One' }, { label: 'Two' }], correctChoiceId: 'c1', trapChoiceId: '' })],
      })
    );
    expect(drill.steps[0].choices.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(drill.steps[0].correctChoiceId).toBe('c1');
  });

  it('deduplicates repeated option ids so grading stays unambiguous', () => {
    const drill = validatePrimingDrill(
      payload({
        steps: [
          step({
            choices: [
              { id: 'a', label: 'One' },
              { id: 'a', label: 'Duplicate' },
              { id: 'b', label: 'Two' },
            ],
            correctChoiceId: 'b',
            trapChoiceId: 'a',
          }),
        ],
      })
    );
    expect(drill.steps[0].choices.map((c) => c.id)).toEqual(['a', 'b']);
    expect(drill.steps[0].correctChoiceId).toBe('b');
  });

  it('unknown kind degrades to extremum and defaults fill the copy', () => {
    const drill = validatePrimingDrill(payload({ kind: 'astrology', setup: '', steps: [step({ prompt: '' })] }));
    expect(drill.kind).toBe('extremum');
    expect(drill.setup).toBeTruthy();
    expect(drill.steps[0].prompt).toBeTruthy();
  });

  it('survives garbage payloads without throwing', () => {
    const drill = validatePrimingDrill(null);
    expect(drill.steps).toEqual([]);
    expect(drill.sketch).toBeNull();
    expect(isPlayableDrill(drill)).toBe(false);
  });
});

describe('validatePrimingDrill · shape sketch', () => {
  it('keeps the examiner sketch when it is well formed', () => {
    const drill = validatePrimingDrill(
      payload({
        kind: 'shape',
        sketch: {
          prompt: 'Sketch the rate against [S].',
          axes: 'x = [S], y = v0',
          shapeLabel: 'saturating hyperbola',
          shapeHint: 'Sites are finite.',
        },
      })
    );
    expect(drill.kind).toBe('shape');
    expect(drill.sketch).toEqual({
      prompt: 'Sketch the rate against [S].',
      axes: 'x = [S], y = v0',
      shapeLabel: 'saturating hyperbola',
      shapeHint: 'Sites are finite.',
    });
  });

  it('still opens the canvas for shape when the sketch block is missing', () => {
    const drill = validatePrimingDrill(payload({ kind: 'shape' }));
    expect(drill.sketch).not.toBeNull();
    expect(drill.sketch?.prompt).toContain('Sketch');
    expect(drill.sketch?.shapeLabel).toBe('');
  });

  it('discards a blank sketch prompt in favour of the derived one', () => {
    const drill = validatePrimingDrill(
      payload({ kind: 'shape', sketch: { prompt: '   ', shapeLabel: 'bell curve' } })
    );
    expect(drill.sketch?.prompt).toContain('Sketch');
    expect(drill.sketch?.shapeLabel).toBe('bell curve');
  });

  it('leaves the other three archetypes sketch-free', () => {
    for (const kind of ['gradient', 'dimensional', 'extremum'] as const) {
      expect(validatePrimingDrill(payload({ kind })).sketch).toBeNull();
    }
  });

  it('honours an explicit sketch on a non-shape archetype', () => {
    const drill = validatePrimingDrill(
      payload({ kind: 'dimensional', sketch: { prompt: 'Draw the unit triangle.' } })
    );
    expect(drill.sketch?.prompt).toBe('Draw the unit triangle.');
    expect(drill.sketch?.shapeLabel).toBe('');
  });
});

describe('gradePrimingStep', () => {
  const drill: PrimingDrill = validatePrimingDrill(payload());
  const first: PrimingStep = drill.steps[0];

  it('marks the first-principles answer correct and runs the reveal', () => {
    const verdict = gradePrimingStep(first, 'a');
    expect(verdict.correct).toBe(true);
    expect(verdict.fellForTrap).toBe(false);
    expect(verdict.trapExplanation).toBe('');
    expect(verdict.reveal).toContain('Q must tend to zero');
  });

  it('flags the planted misconception as a trap and explains why it feels right', () => {
    const verdict = gradePrimingStep(first, 'b');
    expect(verdict.correct).toBe(false);
    expect(verdict.fellForTrap).toBe(true);
    expect(verdict.trapExplanation).toContain('property of the fluid');
  });

  it('still teaches on a plain wrong pick, without the hazard treatment', () => {
    const verdict = gradePrimingStep(first, 'c');
    expect(verdict.correct).toBe(false);
    expect(verdict.fellForTrap).toBe(false);
    expect(verdict.trapExplanation).toBe('');
    expect(verdict.reveal).toBeTruthy();
  });

  it('treats an unknown pick as incorrect', () => {
    expect(gradePrimingStep(first, 'zzz').correct).toBe(false);
  });
});

describe('summarizePriming', () => {
  const sweep: PrimingDrill = validatePrimingDrill(
    payload({
      steps: [
        step({ prompt: 'Probe 1', trapChoiceId: 'b' }),
        step({ prompt: 'Probe 2', trapChoiceId: 'b' }),
        step({ prompt: 'Probe 3', trapChoiceId: 'b' }),
      ],
    })
  );

  it('reports a clean sweep as forced by the physics', () => {
    const verdict = summarizePriming(sweep, ['a', 'a', 'a']);
    expect(verdict.correct).toBe(true);
    expect(verdict.correctCount).toBe(3);
    expect(verdict.total).toBe(3);
    expect(verdict.trapCount).toBe(0);
    expect(verdict.fellForTrap).toBe(false);
    expect(verdict.summary).toBe('3/3 forced by the physics');
    expect(verdict.principle).toContain('denominator');
  });

  it('counts a trap hit and keeps the rest of the sweep', () => {
    const verdict = summarizePriming(sweep, ['b', 'a', 'a']);
    expect(verdict.correct).toBe(false);
    expect(verdict.correctCount).toBe(2);
    expect(verdict.fellForTrap).toBe(true);
    expect(verdict.trapCount).toBe(1);
    expect(verdict.summary).toBe('2/3 forced by the physics · 1 trap');
    expect(verdict.steps[0].fellForTrap).toBe(true);
    expect(verdict.steps[0].trapExplanation).toContain('property of the fluid');
    expect(verdict.steps[1].fellForTrap).toBe(false);
  });

  it('pluralizes multiple traps', () => {
    expect(summarizePriming(sweep, ['b', 'b', 'a']).summary).toContain('2 traps');
  });

  it('counts an unanswered probe as wrong instead of throwing', () => {
    const verdict = summarizePriming(sweep, ['a']);
    expect(verdict.total).toBe(3);
    expect(verdict.correctCount).toBe(1);
    expect(verdict.correct).toBe(false);
  });

  it('treats an empty drill as not passed', () => {
    const empty = validatePrimingDrill(null);
    const verdict = summarizePriming(empty, []);
    expect(verdict.total).toBe(0);
    expect(verdict.correct).toBe(false);
  });
});
