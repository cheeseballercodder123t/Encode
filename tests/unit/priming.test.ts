import { describe, it, expect } from 'vitest';
import {
  validatePrimingDrill,
  gradePrimingPick,
  isPlayableDrill,
  isPrimingKind,
  PRIMING_KIND_LABEL,
  PrimingDrill,
} from '@/lib/priming';

const payload = (over: Record<string, unknown> = {}) => ({
  kind: 'extremum',
  setup: 'Poiseuille flow through a vessel of radius r.',
  prompt: 'What happens to flow Q as viscosity becomes infinite?',
  choices: [
    { id: 'a', label: 'Flow stops entirely' },
    { id: 'b', label: 'Flow doubles' },
    { id: 'c', label: 'Flow is unchanged' },
    { id: 'd', label: 'Flow becomes negative' },
  ],
  correctChoiceId: 'a',
  trapChoiceId: 'c',
  trapExplanation: 'Viscosity feels like a property of the fluid, not a term in the flow.',
  reveal: 'As viscosity diverges the denominator diverges, so Q must tend to zero.',
  principle: 'A quantity that kills the output at infinity lives in the denominator.',
  cardFront: 'Why must viscosity sit in the denominator of Poiseuille?',
  cardBack: 'Because {{c1::infinite viscosity stops the flow}}, so eta must divide.',
  ...over,
});

describe('isPrimingKind', () => {
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

  it('labels every archetype', () => {
    for (const kind of ['shape', 'gradient', 'dimensional', 'extremum'] as const) {
      expect(PRIMING_KIND_LABEL[kind]).toBeTruthy();
    }
  });
});

describe('validatePrimingDrill', () => {
  it('passes a well-formed drill through unchanged', () => {
    const drill = validatePrimingDrill(payload());
    expect(drill.kind).toBe('extremum');
    expect(drill.choices).toHaveLength(4);
    expect(drill.correctChoiceId).toBe('a');
    expect(drill.trapChoiceId).toBe('c');
    expect(isPlayableDrill(drill)).toBe(true);
  });

  it('falls back to the first choice when the correct id matches nothing', () => {
    const drill = validatePrimingDrill(payload({ correctChoiceId: 'zzz' }));
    expect(drill.correctChoiceId).toBe('a');
    // The trap must never collide with the (new) correct answer.
    expect(drill.trapChoiceId).toBe('c');
  });

  it('drops a trap that duplicates the correct choice', () => {
    expect(validatePrimingDrill(payload({ trapChoiceId: 'a' })).trapChoiceId).toBe('');
  });

  it('drops a trap id that is not among the choices', () => {
    expect(validatePrimingDrill(payload({ trapChoiceId: 'nope' })).trapChoiceId).toBe('');
  });

  it('filters empty labels and caps the option list at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `Option ${i}` }));
    const drill = validatePrimingDrill(
      payload({ choices: [{ id: 'x', label: '   ' }, ...many], correctChoiceId: 'c0' })
    );
    expect(drill.choices).toHaveLength(5);
    expect(drill.choices.every((c) => c.label.length > 0)).toBe(true);
  });

  it('generates ids for options that arrive without one', () => {
    const drill = validatePrimingDrill(
      payload({
        choices: [{ label: 'One' }, { label: 'Two' }],
        correctChoiceId: 'c1',
        trapChoiceId: '',
      })
    );
    expect(drill.choices.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(drill.correctChoiceId).toBe('c1');
  });

  it('deduplicates repeated option ids so grading stays unambiguous', () => {
    const drill = validatePrimingDrill(
      payload({
        choices: [
          { id: 'a', label: 'One' },
          { id: 'a', label: 'Duplicate' },
          { id: 'b', label: 'Two' },
        ],
        correctChoiceId: 'b',
        trapChoiceId: 'a',
      })
    );
    expect(drill.choices.map((c) => c.id)).toEqual(['a', 'b']);
    expect(drill.correctChoiceId).toBe('b');
  });

  it('unknown kind degrades to extremum and defaults fill the copy', () => {
    const drill = validatePrimingDrill(payload({ kind: 'astrology', setup: '', prompt: '' }));
    expect(drill.kind).toBe('extremum');
    expect(drill.setup).toBeTruthy();
    expect(drill.prompt).toBeTruthy();
  });

  it('survives garbage payloads without throwing', () => {
    const drill = validatePrimingDrill(null);
    expect(drill.choices).toEqual([]);
    expect(isPlayableDrill(drill)).toBe(false);
  });

  it('reports an unusable drill when fewer than two options survive', () => {
    expect(isPlayableDrill(validatePrimingDrill(payload({ choices: [{ id: 'a', label: 'Only' }] })))).toBe(false);
  });
});

describe('gradePrimingPick', () => {
  const drill: PrimingDrill = validatePrimingDrill(payload());

  it('marks the first-principles answer correct and runs the reveal', () => {
    const verdict = gradePrimingPick(drill, 'a');
    expect(verdict.correct).toBe(true);
    expect(verdict.fellForTrap).toBe(false);
    expect(verdict.trapExplanation).toBe('');
    expect(verdict.reveal).toContain('Q must tend to zero');
    expect(verdict.principle).toContain('denominator');
  });

  it('flags the planted misconception as a trap and explains why it feels right', () => {
    const verdict = gradePrimingPick(drill, 'c');
    expect(verdict.correct).toBe(false);
    expect(verdict.fellForTrap).toBe(true);
    expect(verdict.trapExplanation).toContain('property of the fluid');
  });

  it('still teaches on a plain wrong pick, without the hazard treatment', () => {
    const verdict = gradePrimingPick(drill, 'b');
    expect(verdict.correct).toBe(false);
    expect(verdict.fellForTrap).toBe(false);
    expect(verdict.trapExplanation).toBe('');
    expect(verdict.reveal).toBeTruthy();
  });

  it('treats an unknown pick as incorrect', () => {
    expect(gradePrimingPick(drill, 'zzz').correct).toBe(false);
  });
});
