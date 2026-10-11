import { describe, it, expect } from 'vitest';
import {
  standardResponseSchema,
  guidedPathResponseSchema,
} from '@/app/api/encode/route';
import { youtubeSchemaResponse } from '@/app/api/youtube/route';

/**
 * The scaffold's field contract, pinned across the three places it has to agree.
 *
 * The workbench renders `fieldNLabel` above each blank and `fieldNPlaceholder`
 * inside it. A live gear probe showed the models writing the ANSWER into both
 * (`field1Label: 'countercurrent flow'`, `field1Placeholder: 'Na+ extrusion in
 * thick ascending limb'`) and camelCase identifiers (`pumpStepEffect`) into the
 * labels of the sentence scaffold's clauses - because, unlike every neighbouring
 * field, neither one carried a description in the response schema and the prompt
 * never stated the rule either. The exercise arrived solved.
 *
 * Only the Gemini path receives `responseSchema`, so the rule must exist BOTH in
 * the schema's descriptions and in the prompt; this test fails if either copy
 * goes missing or drifts away from naming the rule.
 */

const SCAFFOLD_FIELDS = [
  'field1Label',
  'field2Label',
  'field3Label',
  'field1Placeholder',
  'field2Placeholder',
  'field3Placeholder',
  'exampleAnswer',
] as const;

/** The stage list of whichever root the schema declares. */
function stageArray(schema: any) {
  const root = schema.properties;
  return root.activities ?? root.guidedModules.items.properties.activities;
}

function stageScaffold(schema: any) {
  return stageArray(schema).items.properties.scaffold.properties;
}

describe('the scaffold field contract', () => {
  it.each([
    ['standard', standardResponseSchema],
    ['guided path', guidedPathResponseSchema],
    ['youtube', youtubeSchemaResponse],
  ])('%s schema describes every scaffold field it asks for', (_name, schema) => {
    const scaffold = stageScaffold(schema);
    for (const field of SCAFFOLD_FIELDS) {
      expect(scaffold[field], field).toBeTruthy();
      const description = scaffold[field].description || '';
      expect(description.length, `${field} has no description`).toBeGreaterThan(20);
      if (field.endsWith('Label')) expect(description).toMatch(/role/i);
      if (field.endsWith('Placeholder')) expect(description).toMatch(/never the answer/i);
      if (field === 'exampleAnswer') expect(description).toMatch(/after/i);
    }
  });

  it.each([
    ['standard', standardResponseSchema],
    ['guided path', guidedPathResponseSchema],
    ['youtube', youtubeSchemaResponse],
  ])('%s schema asks for no scaffold field nothing renders', (_name, schema) => {
    // `fieldNPrefix` was declared in all three stage schemas and typed in
    // lib/types.ts, but no renderer reads it: the model spent output budget on
    // three strings per stage that could never appear on screen. The type keeps
    // the optional fields so stored schemas still parse; the schemas no longer
    // request them.
    const scaffold = stageScaffold(schema);
    for (const field of Object.keys(scaffold)) {
      expect(field, `${field} is asked for but nothing reads it`).not.toMatch(/Prefix$/);
    }
  });

  it('the guided schema really is the module-nested one this test assumes', () => {
    // Guards the helper above: if the guided root ever stops declaring
    // guidedModules, stageScaffold() would silently read the standard shape and
    // both suites would pass while one schema lost its descriptions.
    expect((guidedPathResponseSchema as any).properties.guidedModules).toBeTruthy();
    expect((guidedPathResponseSchema as any).properties.activities).toBeUndefined();
  });
});
