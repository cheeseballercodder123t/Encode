import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as forgeRoute } from '@/app/api/forge/route';
import { NextRequest } from 'next/server';

const mockReport = {
  topic: 'AP Chemistry',
  declarativeFacts: [
    { id: 'f1', factStatement: 'Le Chatelier principle predicts equilibrium shifts.', clozeSuggestion: 'shifts {{equilibrium}}' }
  ],
  conceptualMechanisms: [],
  practiceQuestions: [],
  workedExamples: [],
};

const mockGenerateJSON = vi.fn().mockResolvedValue(mockReport);

vi.mock('@/lib/ai-client', () => ({
  generateJSONWithProvider: (...args: any[]) => mockGenerateJSON(...args),
}));

describe('/api/forge Route Handlers', () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
    mockGenerateJSON.mockResolvedValue(mockReport);
  });

  it('accepts array include sections and processes text sources', async () => {
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_1',
            kind: 'text',
            label: 'Reaction Kinetics Notes',
            notes: 'Rate law determines reaction order from experimental data.',
          },
        ],
        include: ['facts', 'mechanisms', 'drills', 'examples'],
        settings: { provider: 'gemini' },
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
    expect(data.sources[0].label).toBe('Reaction Kinetics Notes');
  });

  it('infers MIME type for uploaded file with missing type without failing', async () => {
    const pdfBase64 = Buffer.from('%PDF-1.4 mock pdf content').toString('base64');
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_pdf',
            kind: 'file',
            label: 'handout.pdf',
            file: {
              name: 'handout.pdf',
              type: '', // Empty MIME type from browser
              size: 1024,
              base64Data: pdfBase64,
            },
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
    expect(data.sources[0].note).toBeUndefined();
  });

  it('decodes text file base64 data into notes when notes field is empty', async () => {
    const textBase64 = Buffer.from('Gibbs free energy delta G = delta H - T delta S.').toString('base64');
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_text_file',
            kind: 'file',
            label: 'thermo.txt',
            file: {
              name: 'thermo.txt',
              type: 'text/plain',
              size: 50,
              base64Data: textBase64,
            },
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
  });

  /**
   * A text upload has to reach the model as the text the learner wrote.
   *
   * Decoding base64 with `atob` reads the bytes as Latin-1, so every byte at or
   * above 0x80 turns into two mojibake characters: "é" arrives as "Ã©", and an
   * emoji as four unrelated glyphs. A deck cut from that garbage is unusable,
   * and nothing else in this file would catch it — the ASCII case decodes
   * identically under either reading. The route decodes with Buffer's UTF-8.
   */
  it('decodes a non-ASCII text upload as UTF-8, not mojibake', async () => {
    const original = 'Café — naïve résumé. 光合成：葉緑体。🧪 ΔG = ΔH − TΔS';
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_utf8',
            kind: 'file',
            label: 'bio.txt',
            file: {
              name: 'bio.txt',
              type: 'text/plain',
              size: Buffer.byteLength(original, 'utf-8'),
              base64Data: Buffer.from(original, 'utf-8').toString('base64'),
            },
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);

    // The exact bytes the model is asked to cut cards from.
    const prompt = mockGenerateJSON.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain(original);
    // The Latin-1 reading of those same bytes — what an atob() decode produced.
    expect(prompt).not.toContain('Ã©');
    expect(prompt).not.toContain('â€');
  });

  /**
   * "Generate more" sends the deck's fronts back to the route twice over: once
   * as the model's do-NOT-repeat list, which is bounded because those lines
   * cost tokens, and once as the evidence `dropKnownCards` matches the batch
   * against, which is free. These tests drive the real handler with a deck
   * larger than the prompt window, because the two uses are easy to conflate
   * and one bound serving both is exactly how the tail of a big deck ends up
   * with no duplicate protection at all.
   */
  describe('the duplicate path on a deck bigger than the prompt window', () => {
    const TAIL = 'The vasa recta carry blood away from the loop of Henle in the medulla';
    const REWORDED = 'The vasa recta carry blood away from the loop of Henle, deep in the medulla';
    const FRESH = 'Vasa recta shunt blood past the medullary gradient they protect';

    /** 500 fronts with TAIL at index 449 - outside a 400-line window. */
    function deckOf500(): string[] {
      const fronts = Array.from(
        { length: 500 },
        (_, i) => `Finding ${i}: the medullary interstitium concentrates salts around the vasa recta`
      );
      fronts[449] = TAIL;
      return fronts;
    }

    function moreRequest(
      existing: string[],
      opts: { stream?: boolean; mode?: 'more' | 'retry' } = {}
    ): NextRequest {
      return new NextRequest('http://localhost:3000/api/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: opts.mode === 'retry' ? 'retry' : 'more',
          only: opts.mode === 'retry' ? ['src_1'] : undefined,
          sources: [
            {
              id: 'src_1',
              kind: 'text',
              label: 'Lecture 4',
              notes: 'The vasa recta run parallel to the loop and carry blood away from the medulla.',
            },
          ],
          include: ['facts'],
          existing,
          stream: opts.stream === true ? true : undefined,
          settings: { provider: 'gemini' },
        }),
      });
    }

    function modelReturns(...fronts: string[]) {
      mockGenerateJSON.mockResolvedValue({
        topic: 'Renal Physiology',
        declarativeFacts: fronts.map((front, i) => ({ id: `c${i}`, factStatement: front })),
        conceptualMechanisms: [],
        practiceQuestions: [],
        workedExamples: [],
      });
    }

    it('drops a repeat of a card sitting past the prompt window', async () => {
      modelReturns(REWORDED, FRESH);
      const res = await forgeRoute(moreRequest(deckOf500()));

      expect(res.status).toBe(200);
      const data = await res.json();
      const shipped = data.report.declarativeFacts.map((f: any) => f.factStatement);
      expect(shipped).not.toContain(REWORDED);
      expect(shipped).toContain(FRESH);
      expect(data.dropped).toBe(1);
      expect(data.total).toBe(1);
    });

    it('still shows the model only the prompt window', async () => {
      modelReturns(FRESH);
      const res = await forgeRoute(moreRequest(deckOf500()));
      expect(res.status).toBe(200);

      // The token budget is unchanged: 400 lines, the first 400 cards.
      const prompt = mockGenerateJSON.mock.calls[0][0].userPrompt as string;
      expect(prompt).toContain('ALREADY IN THE DECK (400 cards)');
      expect(prompt).not.toContain('Finding 450');
    });

    it('drops a repeat of a card inside the window, on the same deck', async () => {
      modelReturns(
        'Finding 0: the medullary interstitium concentrates salts around the vasa recta in the medulla'
      );
      const res = await forgeRoute(moreRequest(deckOf500()));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.dropped).toBe(1);
      expect(data.total).toBe(0);
    });

    it('drops that repeat on the streamed path the client actually uses', async () => {
      // The modal always sends `stream: true` and reads the `done` event, so the
      // fix has to hold on the interface the app uses, not only the JSON one.
      modelReturns(REWORDED, FRESH);
      const res = await forgeRoute(moreRequest(deckOf500(), { stream: true }));
      expect(res.status).toBe(200);

      const events = (await res.text())
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const done = events.find((event) => event.type === 'done');
      expect(done).toBeTruthy();
      const shipped = done.payload.report.declarativeFacts.map((f: any) => f.factStatement);
      expect(shipped).not.toContain(REWORDED);
      expect(shipped).toContain(FRESH);
      expect(done.payload.dropped).toBe(1);
      expect(done.payload.total).toBe(1);
    });

    it('drops that repeat on the retry path too', async () => {
      // Retry re-forges one source, and it runs the same extension drop with the
      // same seed - a separate branch, so it is pinned separately.
      modelReturns(REWORDED, FRESH);
      const res = await forgeRoute(moreRequest(deckOf500(), { mode: 'retry' }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.dropped).toBe(1);
      expect(data.total).toBe(1);
    });

    it('accepts a 500-card deck carrying one over-long front', async () => {
      // A model that writes one long sentence must not be able to switch the
      // whole extension pass off: the front list is evidence, and every entry
      // used to have to fit 400 characters or the request was rejected
      // outright - no cards, no dedupe, just a 400 for the learner.
      const fronts = deckOf500();
      fronts[120] = `Finding 120: ${'the medullary interstitium concentrates salts '.repeat(12)}`.slice(0, 401);
      expect(fronts[120].length).toBeGreaterThan(400);
      modelReturns(REWORDED, FRESH);

      const res = await forgeRoute(moreRequest(fronts));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.dropped).toBe(1);
      expect(data.total).toBe(1);
    });
  });

  it('reports empty source honestly when truly empty', async () => {
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_empty',
            kind: 'text',
            label: 'Empty notes',
            notes: '   ',
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('failed');
    expect(data.sources[0].note).toBe('Empty text source.');
  });
});
