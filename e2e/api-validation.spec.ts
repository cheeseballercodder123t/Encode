import { test, expect } from '@playwright/test';

/**
 * The request-body boundary, proved against the running server.
 *
 * The unit suite calls the route handlers directly, which is the right place to
 * pin every route. This spec exists for the part a handler call cannot show: the
 * HTTP contract. It posts over the wire to the real dev server — no page mocks,
 * no intercepted route — and reads the status and the message a client would
 * actually receive.
 *
 * Two routes carry the acceptance proof, and both were broken in exactly the
 * way defect 44 describes: `/api/triage` and `/api/roast` accepted an unbounded
 * `text`/`notes`, and answered a malformed body with a 500 from deep inside the
 * handler. Each case below asserts the status AND that the message names the
 * field, because "400" alone would also be true of a route that rejected
 * everything.
 */

test.describe('/api request bodies are validated over the wire', () => {
  test('/api/triage refuses an oversized paste instead of forwarding it', async ({ request }) => {
    const res = await request.post('/api/triage', { data: { text: 'x'.repeat(200_001) } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/text/);
  });

  test('/api/triage answers 400, not 500, to malformed JSON', async ({ request }) => {
    // A Buffer, not a string: `request.post` serializes a string as JSON, which
    // would arrive as a well-formed JSON string and test nothing. This is the
    // body a hand-rolled client (or a truncated upload) actually sends.
    const res = await request.post('/api/triage', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('{"text": '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/i);
  });

  test('/api/roast refuses an oversized paste instead of paying for it', async ({ request }) => {
    const res = await request.post('/api/roast', { data: { notes: 'x'.repeat(200_001) } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/notes/);
  });

  test('/api/roast answers 400, not 500, to malformed JSON', async ({ request }) => {
    const res = await request.post('/api/roast', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('not json at all'),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/i);
  });

  test('a second pair of routes agrees: crucible and inquisitor', async ({ request }) => {
    const crucible = await request.post('/api/crucible', { data: { minutes: 'twenty' } });
    expect(crucible.status()).toBe(400);
    expect((await crucible.json()).error).toMatch(/minutes/);

    const inquisitor = await request.post('/api/inquisitor', { data: { claim: { text: 'no' } } });
    expect(inquisitor.status()).toBe(400);
    expect((await inquisitor.json()).error).toMatch(/claim/);
  });

  test('the friendly empty-input sentences still come from the routes', async ({ request }) => {
    // A schema rejection must not replace the sentence a learner reads.
    const res = await request.post('/api/triage', { data: {} });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/Paste the source text first/);
  });
});
