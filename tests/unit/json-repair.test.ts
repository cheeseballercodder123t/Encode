import { describe, it, expect } from 'vitest';
import {
  extractJson,
  safeParseJson,
  validateEncodedSchema,
} from '../../lib/ai-output-validation';
import { repairJson } from '../../lib/json-repair';

/**
 * Every layer of the JSON repair ladder, tested against the failure modes
 * real models produce. The contract: each malformed input either becomes the
 * JSON the model obviously meant, or repair reports null — never a throw,
 * never a silently wrong parse.
 */

describe('extractJson', () => {
  it('strips a closed json fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips an UNCLOSED fence (truncated response)', () => {
    expect(extractJson('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('strips leading prose', () => {
    expect(extractJson('Here you go:\n{"topic":"x"}')).toBe('{"topic":"x"}');
  });

  it('strips a BOM', () => {
    expect(extractJson('\uFEFF{"a":1}')).toBe('{"a":1}');
  });

  it('keeps plain text when no braces exist', () => {
    expect(extractJson('plain text')).toBe('plain text');
  });

  it('extracts a top-level ARRAY, not just objects', () => {
    expect(extractJson('Sure: [1, 2, 3]')).toBe('[1, 2, 3]');
  });
});

describe('repairJson — per-layer repairs', () => {
  it('repairs trailing commas (the single most common model error)', () => {
    const out = repairJson('{"a": 1, "b": [1, 2,],}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ a: 1, b: [1, 2] });
    expect(out!.via).toBe('trailing-commas');
  });

  it('repairs smart quotes around keys and values', () => {
    const out = repairJson('{\u201ctopic\u201d: \u201cCells\u201d}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topic: 'Cells' });
  });

  it('repairs single-quoted strings', () => {
    const out = repairJson("{'topic': 'Cells'}");
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topic: 'Cells' });
  });

  it("leaves an apostrophe inside a double-quoted string alone", () => {
    const out = repairJson('{"note": "it\'s fine"}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ note: "it's fine" });
  });

  it('repairs unquoted keys', () => {
    const out = repairJson('{topic: "Cells", stageNumber: 2}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topic: 'Cells', stageNumber: 2 });
  });

  it('repairs Python-style True/False/None', () => {
    const out = repairJson('{secured: True, failed: False, gap: None}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ secured: true, failed: false, gap: null });
  });

  it('escapes literal newlines inside strings', () => {
    const out = repairJson('{"prompt": "step one\nstep two"}');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ prompt: 'step one\nstep two' });
  });

  it('combines multiple defects in one payload (cumulative passes)', () => {
    const raw = 'Sure! ```json\n{topic: \u0027Cells\u0027, items: [1, 2,],}\n```';
    const out = repairJson(raw);
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topic: 'Cells', items: [1, 2] });
  });

  it('returns null for unparseable garbage instead of throwing', () => {
    expect(repairJson('no json here at all')).toBeNull();
    expect(repairJson('')).toBeNull();
    expect(repairJson('   ')).toBeNull();
  });

  it('never throws on hostile input', () => {
    expect(() => repairJson('{"a": "unclosed')).not.toThrow();
    expect(() => repairJson('}{][}{')).not.toThrow();
  });
});

describe('repairJson — truncation (the expensive failure)', () => {
  it('closes a truncated object mid-array', () => {
    const out = repairJson('{"topicSummary": "Cell respiration", "activities": [1, 2');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topicSummary: 'Cell respiration', activities: [1, 2] });
    expect(out!.via).toBe('truncation-close');
  });

  it('closes a truncated string value', () => {
    const out = repairJson('{"prompt": "Describe the mechanism in your own wor');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ prompt: 'Describe the mechanism in your own wor' });
  });

  it('turns a dangling key into null so the shape survives', () => {
    const out = repairJson('{"topicSummary": "Respiration", "activities"');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ topicSummary: 'Respiration', activities: null });
  });

  it('salvages the longest parseable prefix when the tail is garbage', () => {
    const out = repairJson('{"a": {"b": 1}, "c": [2, 3, BREAKING GARBAGE');
    expect(out).not.toBeNull();
    expect(out!.value).toEqual({ a: { b: 1 }, c: [2, 3] });
    expect(out!.via).toBe('prefix-salvage');
  });

  it('does NOT repair-truncate a payload that was never JSON', () => {
    expect(repairJson('I could not finish this task because')).toBeNull();
  });
});

describe('safeParseJson — the integrated ladder', () => {
  it('returns the object when the text is already valid JSON', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('climbs the ladder for fenced, prose-wrapped, and broken payloads', () => {
    expect(safeParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeParseJson('Result: {"a":1}')).toEqual({ a: 1 });
    expect(safeParseJson('{"a": [1,2,]}')).toEqual({ a: [1, 2] });
    expect(safeParseJson('{\u201ca\u201d: 1}')).toEqual({ a: 1 });
  });

  it('survives a truncated encode-shaped payload and yields usable stages', () => {
    // A realistic truncated /api/encode response: cut mid-activities.
    const truncated = '{"topicSummary": "The action potential", "activities": [{"id": "stage-1", "title": "Threshold", "prompt": "Deconstruct the mechanism';
    const parsed = safeParseJson(truncated);
    expect(parsed).not.toBeNull();
    // The shape validator downstream then produces a usable stage either way.
    const validated = validateEncodedSchema(parsed, 'conceptual', 'notes about neurons');
    expect(validated.activities.length).toBeGreaterThan(0);
    expect(validated.topicSummary).toBe('The action potential');
  });

  it('returns null (not a throw) when nothing is salvageable', () => {
    expect(safeParseJson('the model wrote poetry instead')).toBeNull();
    expect(safeParseJson(undefined as unknown as string)).toBeNull();
    expect(safeParseJson(null as unknown as string)).toBeNull();
  });

  it('still rejects a JSON object whose meaning is wrong type-wise — repair is syntactic only', () => {
    // Repair must not invent semantics: a number stays a number, and the
    // shape validator's job is to notice.
    const parsed = safeParseJson('{"a": 1}');
    expect(parsed).toEqual({ a: 1 });
    const validated = validateEncodedSchema(parsed, 'conceptual');
    expect(validated.activities.length).toBeGreaterThan(0); // fallback stage
    expect(validated.activities[0].id).toBe('fallback-stage-1');
  });
});
