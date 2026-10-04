import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { TOY_EXAMPLES, activityForToyExample } from '@/lib/toy-models/examples';

const generate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai-client', () => ({ generateJSONWithProvider: generate }));
import { POST as encode } from '@/app/api/encode/route';
import { POST as regenerate } from '@/app/api/regenerate-stage/route';

const example = TOY_EXAMPLES[0];
const request = (body: unknown, route = 'encode') => new NextRequest(`http://localhost/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => generate.mockReset());
describe('grounded simulation generation integration', () => {
  it('standard encode sends the fixed-engine schema, accepts grounded data and returns it', async () => {
    generate.mockResolvedValue({ topicSummary: 'Ohm', activities: [activityForToyExample(example)] });
    const response = await encode(request({ notes: example.notes, gear: 2 }));
    expect(response.status).toBe(200);
    expect((await response.json()).activities[0].toyModel).toEqual(example.config);
    const options = generate.mock.calls[0][0];
    expect(options.systemPrompt).toContain('never executable code');
    expect(options.responseSchema.properties.activities.items.properties.toyModel.properties.type.enum).toHaveLength(5);
    expect(generate).toHaveBeenCalledTimes(1); // no additional synthesis calls
  });
  it('invented source quotes drop only the lab, never the stage', async () => {
    generate.mockResolvedValue({ topicSummary: 'Ohm', activities: [activityForToyExample(example)] });
    const response = await encode(request({ notes: 'The slides discuss electricity but give no formulas.' }));
    const payload = await response.json();
    expect(payload.activities).toHaveLength(1);
    expect(payload.activities[0].toyModel).toBeUndefined();
    expect(payload.activities[0].toyModelIssues.join(' ')).toContain('exact quotation');
  });
  it('guided modules use the same schema and per-module validation gate', async () => {
    generate.mockResolvedValue({ topicSummary: 'Ohm', guidedModules: [{ moduleId: 'm1', activities: [activityForToyExample(example)] }] });
    const response = await encode(request({ notes: example.notes, enableGuidedPath: true }));
    const payload = await response.json();
    expect(payload.isGuidedPath).toBe(true);
    expect(payload.guidedModules[0].activities[0].toyModel).toEqual(example.config);
    expect(generate.mock.calls[0][0].responseSchema.properties.guidedModules.items.properties.activities.items.properties.toyModel).toBeDefined();
  });
  it('missing notes retains the existing 400 contract', async () => {
    const response = await encode(request({ notes: '' }));
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it('regenerated stages validate against their original source excerpt', async () => {
    const activity = activityForToyExample(example);
    generate.mockResolvedValue(activity);
    const response = await regenerate(request({ activity, topicSummary: 'Ohm', mode: 'conceptual' }, 'regenerate-stage'));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.activity.toyModel).toEqual(example.config);
    expect(generate.mock.calls[0][0].responseSchema.properties.toyModel).toBeDefined();
  });
});
