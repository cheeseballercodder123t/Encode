import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildShareLink,
  compressSchemaForUrl,
  decompressSchemaFromUrl,
  generateStatelessShareUrl,
  readSharedPayload,
  slimSchemaForShare,
  SHARE_URL_COMFORT_BYTES,
  SHARE_URL_LIMIT_BYTES,
} from '@/lib/url-share';
import { makeSchema } from './fixtures';

describe('schema URL share roundtrip', () => {
  it('compresses then decompresses back to the original schema', () => {
    const schema = makeSchema();
    const compressed = compressSchemaForUrl(schema);
    expect(compressed).toBeTruthy();
    expect(compressed).not.toContain('{');
    const decoded = decompressSchemaFromUrl(compressed);
    expect(decoded).toEqual(schema);
  });

  it('rejects empty and garbage input', () => {
    expect(decompressSchemaFromUrl('')).toBeNull();
    expect(decompressSchemaFromUrl('   ')).toBeNull();
    expect(decompressSchemaFromUrl('not-a-valid-schema-payload')).toBeNull();
  });

  it('rejects decompressed payloads without activities or guidedModules', () => {
    const raw = compressSchemaForUrl(makeSchema());
    // Valid LZ payload but wrong shape: compress a schema missing activities
    const bad = compressSchemaForUrl({ ...makeSchema(), activities: undefined as any });
    if (bad) {
      expect(decompressSchemaFromUrl(bad)).toBeNull();
    }
  });

  it('never throws : returns empty string on failure', () => {
    const circular: any = { id: 'x' };
    circular.self = circular;
    expect(compressSchemaForUrl(circular)).toBe('');
  });
});

// ─── Where the payload rides, and what happens when it is too big ───────────
//
// MEASURED against the running server with `curl -o /dev/null -w '%{http_code}'`:
//
//   GET /?share=<16,000 bytes>   ->  200
//   GET /?share=<17,000 bytes>   ->  431 (Request Header Fields Too Large)
//   GET /#share=<24,000 bytes>   ->  200
//
// The query parameter travels in the request LINE, so an oversized one is
// refused before any route runs: the recipient gets the server's error page and
// the app never learns why. The fragment is never sent at all.

/** Deterministic, unique-ish text: compressible prose would hide the sizes. */
function noise(chars: number): string {
  return Array.from({ length: Math.ceil(chars / 6) }, (_, i) =>
    (((i + 1) * 2654435761) % 4294967296).toString(36)
  ).join('').slice(0, chars);
}

/** A schema whose every field is drawn from `noise`, so nothing collapses. */
function noisySchema(stages: number, bodyChars: number, answerChars: number) {
  const activities = Array.from({ length: stages }, (_, i) => ({
    id: `act_${i + 1}`,
    stageNumber: i + 1,
    title: `Stage ${i + 1}`,
    framework: noise(20),
    cognitiveGoal: 'goal',
    contextSnippet: 'ctx',
    keywords: ['a'],
    templateType: 'first_principles',
    prompt: noise(bodyChars),
    scaffold: {
      field1Label: 'What?',
      field1Placeholder: 'p',
      field2Label: 'Why?',
      field2Placeholder: 'p',
      exampleAnswer: 'e',
    },
  })) as any;
  const userResponses = answerChars
    ? Object.fromEntries(
        activities.map((a: any) => [
          a.id,
          { field1: noise(answerChars), field2: noise(answerChars), confidenceScore: 80, checkCount: 1 },
        ])
      )
    : {};
  return makeSchema({ id: 'shared', topicSummary: 'Shared', activities, userResponses });
}

describe('the payload rides in the fragment, so the server never sees it', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a URL whose payload is after the #, not in the query string', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.test', pathname: '/' } });
    const url = generateStatelessShareUrl(makeSchema());
    expect(url.startsWith('https://app.test/#share=')).toBe(true);
    expect(url).not.toContain('?share=');
  });

  it('round-trips the schema out of the built URL', () => {
    const url = generateStatelessShareUrl(makeSchema({ topicSummary: 'Roundtrip' }));
    const payload = readSharedPayload('', url.slice(url.indexOf('#')));
    expect(payload).toBeTruthy();
    expect(decompressSchemaFromUrl(payload!)?.topicSummary).toBe('Roundtrip');
  });

  it('still reads a link already in the wild (?share= and ?data=)', () => {
    // A payload carrying a `+` is the interesting case: `+` is one of LZString's
    // URL-safe characters, and form-decoding would turn it into a space.
    const payload = compressSchemaForUrl(makeSchema());
    expect(payload).toContain('+');
    expect(readSharedPayload(`?share=${payload}`, '')).toBe(payload);
    expect(readSharedPayload(`?data=${payload}`, '')).toBe(payload);
    expect(readSharedPayload('?other=1', '')).toBeNull();
    expect(readSharedPayload('', '#share=')).toBeNull();
  });

  it('prefers the fragment when a URL carries both', () => {
    expect(readSharedPayload('?share=from-query', '#share=from-fragment')).toBe('from-fragment');
    expect(readSharedPayload('?share=from-query', '#')).toBe('from-query');
  });
});

describe('the size guard', () => {
  it('a small schema is a link with nothing to warn about', () => {
    const link = buildShareLink(makeSchema());
    expect(link.urlBytes).toBeLessThan(SHARE_URL_COMFORT_BYTES);
    expect(link.overComfort).toBe(false);
    expect(link.overLimit).toBe(false);
    expect(link.unshareable).toBe(false);
  });

  it('a schema the author has not answered offers no “without your answers” link', () => {
    // Nothing to drop, so the slim button would be noise.
    const link = buildShareLink(makeSchema({ userResponses: {} }));
    expect(link.slim).toBeNull();
  });

  it('a long link is flagged but still offered, and slim is not', () => {
    // Twenty stages of real prose: long as a URL, nowhere near unshareable.
    const schema = makeSchema({
      activities: Array.from({ length: 20 }, (_, i) => ({
        id: `act_${i}`,
        stageNumber: i + 1,
        title: `Stage ${i + 1}`,
        framework: 'Framework',
        cognitiveGoal: 'goal',
        contextSnippet: 'ctx',
        keywords: ['a'],
        templateType: 'first_principles',
        prompt: 'Explain the mechanism and its boundary conditions in your own words. '.repeat(12),
        scaffold: { field1Label: 'a', field1Placeholder: 'b', field2Label: 'c', field2Placeholder: 'd', exampleAnswer: 'e' },
      })) as any,
    });
    const link = buildShareLink(schema);
    expect(link.urlBytes).toBeGreaterThan(SHARE_URL_COMFORT_BYTES);
    expect(link.urlBytes).toBeLessThanOrEqual(SHARE_URL_LIMIT_BYTES);
    expect(link.overComfort).toBe(true);
    expect(link.overLimit).toBe(false);
    expect(link.unshareable).toBe(false);
  });

  it('bulky answers push the full link over the limit, and the slim deck fits', () => {
    const link = buildShareLink(noisySchema(4, 40, 8000));
    expect(link.overLimit).toBe(true);
    expect(link.unshareable).toBe(false);
    expect(link.slim).not.toBeNull();
    expect(link.slim!.urlBytes).toBeLessThan(link.urlBytes);
    expect(link.slim!.fits).toBe(true);
  });

  it('a bulky deck is not offered as a link at all', () => {
    const link = buildShareLink(noisySchema(10, 1200, 100));
    expect(link.overLimit).toBe(true);
    expect(link.slim!.fits).toBe(false);
    // The one state the sheet must refuse: no link to copy, only the file.
    expect(link.unshareable).toBe(true);
  });

  it('the slim deck drops the author’s answers and keeps every exercise', () => {
    const schema = noisySchema(3, 200, 500);
    const slim = slimSchemaForShare(schema);
    expect(slim.userResponses).toEqual({});
    expect(slim.activities).toHaveLength(3);
    // The exercises themselves are untouched, so the recipient still gets the deck.
    expect(slim.activities[0].prompt).toBe(schema.activities[0].prompt);
    expect(slim.topicSummary).toBe(schema.topicSummary);
    // And it round-trips: the receiving view opens on a deck with no answers yet.
    const decoded = decompressSchemaFromUrl(compressSchemaForUrl(slim));
    expect(decoded?.activities).toHaveLength(3);
    expect(decoded?.userResponses).toEqual({});
  });
});
