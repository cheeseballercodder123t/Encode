import { describe, it, expect } from 'vitest';
import {
  buildSegregationSystemPrompt,
  buildCondenseSystemPrompt,
  resolveSegregationSections,
  segregationSchema,
} from '@/lib/services/segregation';

/**
 * The card-authoring prompt is a contract, and it used to contain the exact
 * failure mode this app polices everywhere else: a volume mandate ("a lecture
 * that yields fewer than 50 cards was under-mined") that asks the model to pad
 * a short source toward a count. Padding is how trivia, slide titles and
 * rephrased duplicates get into a deck that the Wozniak pass then holds back —
 * so the contract now bounds coverage by the source and forbids filler by name.
 */

const sections = { facts: true, mechanisms: true, drills: true, examples: true };

describe('buildSegregationSystemPrompt — coverage contract', () => {
  const prompt = buildSegregationSystemPrompt(sections);

  it('no longer demands a card count or calls a short deck under-mined', () => {
    expect(prompt).not.toContain('fewer than 50');
    expect(prompt).not.toContain('under-mined');
    expect(prompt).not.toContain('HIGH-VOLUME');
    expect(prompt).not.toContain('hit every minimum');
    expect(prompt).not.toMatch(/30-64/);
  });

  it('bounds the deck by the source and says padding is the failure', () => {
    expect(prompt).toContain('exactly as long as the source earns');
    expect(prompt).toContain('There is no card target to reach');
    expect(prompt).toContain('Padding toward a count is the one failure mode');
  });

  it('names the filler it will not accept', () => {
    for (const filler of ['titles', 'agenda and logistics', 'page numbers', 'course administration']) {
      expect(prompt).toContain(filler);
    }
    expect(prompt).toContain('never invent a date, number, name or mechanism');
  });

  it('treats section sizes as ceilings with an honest empty array allowed', () => {
    expect(prompt).toContain('CEILINGS, not quotas');
    expect(prompt).toContain('empty array for a section this source cannot honestly support');
  });

  it('keeps the atomic-card brevity rules it already had', () => {
    expect(prompt).toContain('No card front may exceed 25 words');
    expect(prompt).toContain('ONE atomic fact');
  });

  it('requires a Socratic cloze hint and rejects the two bad shapes by example', () => {
    expect(prompt).toContain('memoryHook (it ships as the cloze HINT');
    expect(prompt).toContain('scaffold the MECHANISM rather than leak the answer');
    // The two named anti-patterns from the audit: letter counting, and the
    // giveaway that simply restates the answer.
    expect(prompt).toContain('counts letters');
    expect(prompt).toContain('restates the answer');
    expect(prompt).toContain('proton gradient drives ATP synthase');
  });

  it('asks for cascades and tripwires as ceilings with an honest empty array', () => {
    expect(prompt).toContain('sequentialCascades 0-3, boundaryTripwires 0-4');
    expect(prompt).toContain('an ORDERED PROCESS');
    expect(prompt).toContain('a LIMIT OF VALIDITY');
    expect(prompt).toContain('A source with neither produces empty arrays for both');
    // A cascade is a chronology, not a topic list — the failure shape is named.
    expect(prompt).toContain('A cascade is a chronology, never a list of facts about one topic');
    // And a tripwire may not be invented to fill the slot.
    expect(prompt).toContain('an empty array beats an invented failure mode');
  });

  it('requires a real clinical question, and says omitting the field is correct', () => {
    expect(prompt).toContain('clinicalCorrelate (it ships as a separate tagged card)');
    expect(prompt).toContain('Omitting the field is correct for a fact with no clinical life');
  });

  it('declares the two new arrays and the clinical pair in the schema', () => {
    const properties = segregationSchema.properties as Record<string, any>;
    expect(properties.sequentialCascades.items.required).toEqual(['id', 'process', 'steps']);
    expect(properties.boundaryTripwires.items.required).toEqual(['id', 'law', 'breaksWhen']);
    const factProps = properties.declarativeFacts.items.properties as Record<string, any>;
    expect(factProps.clinicalCorrelate.required).toEqual(['question', 'answer']);
    // Optional: a source with no such process must not be forced to invent one.
    expect(properties.sequentialCascades.description).toContain('Leave the array empty');
    expect(properties.boundaryTripwires.description).toContain('leave the array empty rather than inventing');
  });

  it('caps the vignette in the schema the model is held to', () => {
    // The ceiling belongs on the field itself, not in the prose: this is the
    // description the model actually receives for diagnosticVignette.
    const vignette =
      segregationSchema.properties.confusablePairs.items.properties.diagnosticVignette
        .description;
    expect(vignette).toContain('at most 25 words');
    expect(vignette).toContain('not a case report');
  });

  it('still scopes generation to the requested sections', () => {
    const factsOnly = buildSegregationSystemPrompt({
      facts: true,
      mechanisms: false,
      drills: false,
      examples: false,
    });
    expect(factsOnly).toContain('declarativeFacts (16-32)');
    // Unrequested sections are never named, so they cannot be filled.
    expect(factsOnly).not.toContain('conceptualMechanisms (4-8)');
    expect(factsOnly).not.toContain('practiceQuestions (12-24)');
  });
});

describe('buildCondenseSystemPrompt — merging never invents', () => {
  it('keeps coverage while folding overlap, and leaves an unmergeable deck alone', () => {
    const prompt = buildCondenseSystemPrompt();
    expect(prompt).toContain('MERGE, never to delete knowledge');
    expect(prompt).toContain('NEVER merge unrelated cards just to shrink the count');
    expect(prompt).toContain('If the deck has no real overlap, return it essentially unchanged');
  });
});

describe('resolveSegregationSections — polymorphic include input', () => {
  it('defaults to all sections when undefined or null', () => {
    expect(resolveSegregationSections(undefined)).toEqual({
      facts: true,
      mechanisms: true,
      drills: true,
      examples: true,
    });
  });

  it('handles array of string section names', () => {
    expect(resolveSegregationSections(['facts', 'drills'])).toEqual({
      facts: true,
      mechanisms: false,
      drills: true,
      examples: false,
    });
  });

  it('handles record map of boolean section selections', () => {
    expect(resolveSegregationSections({ facts: true, drills: true, mechanisms: false, examples: false })).toEqual({
      facts: true,
      mechanisms: false,
      drills: true,
      examples: false,
    });
  });
});
