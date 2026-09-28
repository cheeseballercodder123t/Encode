import { describe, it, expect } from 'vitest';
import {
  createSchemaStream,
  parseSchemaStream,
  toStageOutline,
  type SchemaStreamEvent,
} from '@/lib/stream-schema';

/**
 * The incremental reader behind streamed generation.
 *
 * `/api/encode/stream` shows each stage outline while the model is still
 * writing the schema, which only works if the reader can cut a JSON document
 * into pieces mid-flight. The cases that actually break a naive scanner are all
 * here: a chunk that ends inside a string, one that ends between a key and its
 * colon, an escape sequence split across two chunks, nested objects inside an
 * item, and an item that is still open when the response is cut off.
 */

const SCHEMA = JSON.stringify({
  topicSummary: 'Action Potentials',
  activities: [
    { id: 'a1', stageNumber: 1, title: 'Threshold is a gate, not a line', framework: 'First Principles', templateType: 'first_principles' },
    { id: 'a2', stageNumber: 2, title: 'Why repolarisation overshoots', framework: 'Cause & Effect', templateType: 'cause_effect' },
    { id: 'a3', stageNumber: 3, title: 'The pump that refuses to quit', framework: 'State Transition', templateType: 'state_transition' },
  ],
  researchContexts: [{ id: 'r1', detectedGap: 'resting potential' }],
  nested: { activities: [{ id: 'x', title: 'Not a stage' }] },
});

function items(events: SchemaStreamEvent[]) {
  return events.filter((e) => e.type === 'item') as Extract<SchemaStreamEvent, { type: 'item' }>[];
}

function feed(text: string, step: number): SchemaStreamEvent[] {
  const stream = createSchemaStream();
  const events: SchemaStreamEvent[] = [];
  for (let i = 0; i < text.length; i += step) {
    events.push(...stream.push(text.slice(i, i + step)));
  }
  events.push(...stream.end());
  return events;
}

describe('createSchemaStream', () => {
  it('emits the topic title and every stage outline from a single chunk', () => {
    const events = feed(SCHEMA, SCHEMA.length);
    const title = events.find((e) => e.type === 'field');
    expect(title).toEqual({ type: 'field', key: 'topicSummary', value: 'Action Potentials' });

    expect(items(events).map((e) => e.value.title)).toEqual([
      'Threshold is a gate, not a line',
      'Why repolarisation overshoots',
      'The pump that refuses to quit',
    ]);
    expect(events.at(-1)).toEqual({ type: 'done', value: JSON.parse(SCHEMA) });
  });

  it('reads the same events no matter how the response is chopped up', () => {
    // Every chunk size, including the ones that split a string literal, an
    // escape sequence, or a key from its colon.
    for (let step = 1; step <= 17; step += 1) {
      const events = feed(SCHEMA, step);
      expect(items(events).map((e) => e.value.id), `step ${step}`).toEqual(['a1', 'a2', 'a3']);
      const done = events.find((e) => e.type === 'done');
      expect(done, `step ${step}`).toBeDefined();
    }
  });

  it('never emits an outline before its braces have closed', () => {
    // Half a stage is not a stage: the second item must not appear until its
    // closing brace has actually arrived.
    const half = SCHEMA.slice(0, SCHEMA.indexOf('"a2"'));
    const events = feed(half, 3);
    expect(items(events).map((e) => e.value.id)).toEqual(['a1']);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('ignores an array with the same name nested inside another object', () => {
    const events = feed(SCHEMA, 4);
    expect(items(events).map((e) => e.value.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('handles escaped quotes inside a value', () => {
    const text = '{"topicSummary":"The \\"gate\\" that is not a line","activities":[{"id":"a1","title":"Escaped \\"quotes\\" stay put"}]}';
    const events = feed(text, 5);
    const field = events.find((e) => e.type === 'field');
    expect(field).toEqual({ type: 'field', key: 'topicSummary', value: 'The "gate" that is not a line' });
    expect(items(events)[0].value.title).toBe('Escaped "quotes" stay put');
  });

  it('watches guidedModules as well as activities', () => {
    const text = '{"topicSummary":"Big chapter","guidedModules":[{"moduleId":"m1","title":"Module 1"}]}';
    const events = feed(text, 6);
    expect(items(events).map((e) => e.key)).toEqual(['guidedModules']);
    expect(items(events)[0].value.title).toBe('Module 1');
  });

  it('reports the end of an array and then the parsed document', () => {
    const events = feed(SCHEMA, 7);
    expect(events.find((e) => e.type === 'arrayEnd')).toEqual({ type: 'arrayEnd', key: 'activities', count: 3 });
  });

  it('refuses a document that is not an object, and one that is not JSON', () => {
    const notObject = feed('[1,2,3]', 4);
    expect(notObject.some((e) => e.type === 'error')).toBe(true);

    // A root that closes over unparseable content is rejected outright.
    const broken = feed('{"topicSummary": }', 4);
    expect(broken.some((e) => e.type === 'error')).toBe(true);
    expect(broken.some((e) => e.type === 'done')).toBe(false);

    // A response cut off mid-document reports nothing at all, rather than
    // guessing at the half-written fields.
    const truncated = feed('{"topicSummary": "x", "activities": [}', 4);
    expect(truncated.some((e) => e.type === 'done' || e.type === 'error')).toBe(false);
  });

  it('emits nothing more once the document is closed', () => {
    const stream = createSchemaStream();
    stream.push(SCHEMA);
    expect(stream.settled()).toBe(true);
    expect(stream.push('{"topicSummary":"a second document"}')).toEqual([]);
  });
});

describe('parseSchemaStream', () => {
  it('keeps the items that closed before a truncated response was cut off', () => {
    const truncated = SCHEMA.slice(0, SCHEMA.indexOf('"a3"'));
    const { events, value } = parseSchemaStream(truncated);
    expect(value).toBeNull();
    expect(items(events).map((e) => e.value.id)).toEqual(['a1', 'a2']);
  });
});

describe('toStageOutline', () => {
  it('reduces a stage to the outline row the loading view shows', () => {
    expect(
      toStageOutline(
        { id: 'a1', stageNumber: 4, title: '  The gate  ', framework: 'First Principles', templateType: 'first_principles', prompt: 'ignored' },
        0
      )
    ).toEqual({
      id: 'a1',
      stageNumber: 4,
      title: 'The gate',
      framework: 'First Principles',
      templateType: 'first_principles',
      cognitiveGoal: undefined,
    });
  });

  it('numbers a stage that forgot its own number, and refuses an untitled one', () => {
    expect(toStageOutline({ title: 'Untitled by index' }, 2)?.stageNumber).toBe(3);
    expect(toStageOutline({ id: 'a1', title: '   ' }, 0)).toBeNull();
    expect(toStageOutline(null, 0)).toBeNull();
  });
});
