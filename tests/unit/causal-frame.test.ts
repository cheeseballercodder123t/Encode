import { describe, it, expect } from 'vitest';
import {
  buildCausalFrame,
  deriveCausalFrame,
  frameSlots,
  frameToSentence,
  parseCausalFrame,
} from '@/lib/causal-frame';
import { makeActivity } from './fixtures';

const activity = (over: any = {}) =>
  makeActivity({
    scaffold: {
      field1Label: 'Trigger',
      field1Placeholder: 'What crosses threshold?',
      field2Label: 'Mechanism',
      field2Placeholder: 'What physically moves?',
      field3Label: 'Consequence',
      field3Placeholder: 'What does it force?',
      exampleAnswer: 'Threshold opens the gates.',
      ...(over.scaffold || {}),
    },
    ...over,
  });

describe('parseCausalFrame', () => {
  it('parses a filled template into ordered slots', () => {
    const frame = parseCausalFrame(
      'When [[1]], the [[2]] is forced, so [[3]].',
      activity()
    );
    expect(frame).not.toBeNull();
    expect(frame!.source).toBe('ai');
    expect(frameSlots(frame!).map((s) => s.field)).toEqual(['field1', 'field2', 'field3']);
    // Slot labels come from the stage's own scaffold.
    expect(frameSlots(frame!).map((s) => s.label)).toEqual(['Trigger', 'Mechanism', 'Consequence']);
    expect(frameToSentence(frame!, { field1: 'the membrane crosses -55mV' })).toBe(
      'When the membrane crosses -55mV, the  is forced, so .'
    );
  });

  it('rejects a template that reuses a blank', () => {
    expect(parseCausalFrame('When [[1]], then [[1]] again.', activity())).toBeNull();
  });

  it('rejects a template with fewer than two blanks or no connective text', () => {
    expect(parseCausalFrame('Because [[1]].', activity())).toBeNull();
    expect(parseCausalFrame('[[1]] [[2]]', activity())).toBeNull();
    expect(parseCausalFrame('', activity())).toBeNull();
    expect(parseCausalFrame(undefined, activity())).toBeNull();
  });

  it('ignores markers outside the 1-3 range', () => {
    // [[4]] is not a slot this stage has; the template is a formatting accident.
    const frame = parseCausalFrame('When [[1]], then [[4]] forces [[2]].', activity());
    expect(frame).not.toBeNull();
    expect(frameSlots(frame!).map((s) => s.field)).toEqual(['field1', 'field2']);
  });
});

describe('deriveCausalFrame', () => {
  it('joins the stage labels with causal connectives', () => {
    const frame = deriveCausalFrame(activity());
    expect(frame.source).toBe('derived');
    expect(frameToSentence(frame, {})).toBe('When , then , which forces .');
    expect(frame.parts.filter((p) => p.kind === 'text').map((p: any) => p.text)).toEqual([
      'When ',
      ', then ',
      ', which forces ',
      '.',
    ]);
  });

  it('drops the third clause when the stage has no third field', () => {
    const twoField = activity({
      scaffold: {
        field1Label: 'Cause',
        field1Placeholder: 'x',
        field2Label: 'Effect',
        field2Placeholder: 'y',
        exampleAnswer: 'z',
      },
    });
    const frame = deriveCausalFrame(twoField);
    expect(frameSlots(frame).map((s) => s.field)).toEqual(['field1', 'field2']);
    expect(frameToSentence(frame, {})).toBe('When , then .');
  });
});

describe('buildCausalFrame', () => {
  it('prefers the encoder-written sentence and attaches the boundary clause', () => {
    const withFrame = makeActivity({
      scaffold: {
        field1Label: 'Trigger',
        field1Placeholder: 'x',
        field2Label: 'Mechanism',
        field2Placeholder: 'y',
        exampleAnswer: 'z',
        causalFrame: '[[1]] forces [[2]] because the pore cannot stay shut.',
      },
      boundaryContrast: {
        confusableLookalike: 'Refractory period',
        distinguishingRule: 'Na+ channels inactivate; they do not simply close.',
      },
    });
    const frame = buildCausalFrame(withFrame)!;
    expect(frame.source).toBe('ai');
    expect(frame.constraint).toBe('Na+ channels inactivate; they do not simply close.');
    expect(frameToSentence(frame, { field1: 'Threshold', field2: 'collapse' })).toBe(
      'Threshold forces collapse because the pore cannot stay shut. — unless Na+ channels inactivate; they do not simply close.'
    );
  });

  it('falls back to the derived frame for old schemas and thin payloads', () => {
    const frame = buildCausalFrame(activity())!;
    expect(frame.source).toBe('derived');
    expect(frame.constraint).toBeUndefined();
  });

  it('returns null without a stage', () => {
    expect(buildCausalFrame(undefined)).toBeNull();
  });
});
