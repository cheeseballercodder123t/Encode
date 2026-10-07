import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestEncodedSchema } from '@/lib/encode-stream';
import { readForgeResponse, type LiveForgeSource } from '@/lib/forge-stream';

/**
 * The client half of streaming.
 *
 * Both readers have to cope with a server that streams and with one that does
 * not: a buffering proxy, an older deployment, or the e2e mocks all answer with
 * plain JSON, and the app must still get its schema. They also have to turn the
 * event stream back into a single promise, because nothing downstream should
 * have to know that the loading view was filled in along the way.
 */

function ndjson(lines: unknown[]): Response {
  return new Response(lines.map((line) => JSON.stringify(line) + '\n').join(''), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestEncodedSchema', () => {
  it('reports the title, the phase and every stage outline, then resolves the schema', async () => {
    const payload = { topicSummary: 'Action Potentials', activities: [{ id: 'a1' }] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjson([
          { type: 'phase', phase: 'Parsing source material…' },
          { type: 'title', title: 'Action Potentials' },
          { type: 'outline', outline: { stageNumber: 1, title: 'Threshold is a gate' }, count: 1, expected: 2 },
          { type: 'outline', outline: { stageNumber: 2, title: 'Why it overshoots' }, count: 2, expected: 2 },
          { type: 'phase', phase: 'Writing the full schema for the outlined stages…' },
          { type: 'result', data: payload },
        ])
      )
    );

    const phases: string[] = [];
    const titles: string[] = [];
    let outlines: string[] = [];
    const data = await requestEncodedSchema({
      body: { notes: 'x' },
      handlers: {
        onPhase: (phase) => phases.push(phase),
        onTitle: (title) => titles.push(title),
        onOutline: (next) => {
          outlines = next.map((stage) => stage.title);
        },
      },
    });

    expect(data).toEqual(payload);
    expect(titles).toEqual(['Action Potentials']);
    expect(phases).toEqual(['Parsing source material…', 'Writing the full schema for the outlined stages…']);
    // Each callback receives the running list, so the view never has to merge.
    expect(outlines).toEqual(['Threshold is a gate', 'Why it overshoots']);
  });

  it('reads a plain JSON answer as JSON and reports no progress', async () => {
    const payload = { topicSummary: 'Buffered', activities: [{ id: 'a1' }] };
    vi.stubGlobal('fetch', vi.fn(async () => json(payload)));

    let outlineCalls = 0;
    const data = await requestEncodedSchema({
      body: {},
      handlers: { onOutline: () => { outlineCalls += 1; } },
    });

    expect(data).toEqual(payload);
    expect(outlineCalls).toBe(0);
  });

  it('turns an error event into a rejection the caller can fall back from', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ndjson([{ type: 'phase', phase: 'Parsing…' }, { type: 'error', message: 'Provider down' }]))
    );
    await expect(requestEncodedSchema({ body: {} })).rejects.toThrow('Provider down');
  });

  it('surfaces the server error message from a failed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'No API key found.' }, 500)));
    await expect(requestEncodedSchema({ body: {} })).rejects.toThrow('No API key found.');
  });

  it('correctly resolves schema even when the final stream chunk has no trailing newline', async () => {
    const payload = { topicSummary: 'Trailing', activities: [{ id: 'a1' }] };
    const raw =
      JSON.stringify({ type: 'phase', phase: 'Parsing…' }) +
      '\n' +
      JSON.stringify({ type: 'result', data: payload }); // no trailing \n
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(raw, {
          status: 200,
          headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
        })
      )
    );

    const data = await requestEncodedSchema({ body: {} });
    expect(data).toEqual(payload);
  });
});

describe('readForgeResponse', () => {
  it('reports each source as it lands and resolves the merged payload', async () => {
    const payload = { mode: 'forge', total: 5, sources: [], coverage: { gaps: [] } };
    const seen: LiveForgeSource[] = [];
    const started: string[] = [];
    let phase = '';

    const data = await readForgeResponse(
      ndjson([
        { type: 'phase', phase: 'Cutting sources into cards…' },
        { type: 'sourceStart', id: 'src_1', label: 'Lecture 4 slides' },
        {
          type: 'source',
          source: { id: 'src_1', label: 'Lecture 4 slides', kind: 'text', status: 'ok' },
          counts: { facts: 4, mechanisms: 1, drills: 0, examples: 0 },
        },
        {
          type: 'source',
          source: { id: 'src_2', label: 'youtube:renal', kind: 'youtube', status: 'failed' },
          counts: { facts: 0, mechanisms: 0, drills: 0, examples: 0 },
        },
        { type: 'done', payload },
      ]),
      {
        onPhase: (next) => { phase = next; },
        onSourceStart: (id) => started.push(id),
        onSource: (source) => seen.push(source),
      }
    );

    expect(data).toEqual(payload);
    expect(phase).toBe('Cutting sources into cards…');
    expect(started).toEqual(['src_1']);
    expect(seen).toEqual([
      {
        id: 'src_1',
        label: 'Lecture 4 slides',
        kind: 'text',
        status: 'ok',
        counts: { facts: 4, mechanisms: 1, drills: 0, examples: 0 },
        note: undefined,
        words: undefined,
      },
      expect.objectContaining({ id: 'src_2', status: 'failed' }),
    ]);
  });

  it('reads the merged JSON when the server did not stream', async () => {
    const payload = { mode: 'forge', total: 3 };
    let calls = 0;
    const data = await readForgeResponse(json(payload), { onSource: () => { calls += 1; } });
    expect(data).toEqual(payload);
    expect(calls).toBe(0);
  });

  it('rejects on a failed response, and on a stream that never merged a deck', async () => {
    await expect(readForgeResponse(json({ error: 'Add at least one source.' }, 400))).rejects.toThrow(
      'Add at least one source.'
    );
    await expect(readForgeResponse(ndjson([{ type: 'phase', phase: 'Cutting…' }]))).rejects.toThrow(
      'The forge returned no deck.'
    );
    await expect(
      readForgeResponse(ndjson([{ type: 'error', message: 'The forge failed. Try again.' }]))
    ).rejects.toThrow('The forge failed. Try again.');
  });
});
