import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  REMNOTE_API_BASE,
  buildRemnotePushAttempts,
  generateSegregationRemnote,
  generateRemnoteHierarchy,
  pushToRemnoteApi,
} from '@/lib/remnote';
import { SegregationReport } from '@/lib/types';

describe('generateSegregationRemnote (RemNote flashcards)', () => {
  const report: SegregationReport = {
    topic: 'Action Potentials',
    declarativeFacts: [
      {
        id: 'f1',
        factStatement: 'The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.',
        question: 'Na+/K+ pump net movement?',
        clozeSuggestion: 'The pump moves {{3 Na+ out}} per ATP.',
        memoryHook: '3 out, 2 in',
      },
    ],
    conceptualMechanisms: [
      {
        id: 'm1',
        conceptName: 'Depolarization',
        whatIsIt: 'Membrane potential moves toward 0',
        whyItMatters: 'Triggers AP',
        howItWorks: 'Na+ channels open, Na+ rushes in',
        whatIfEdgeCase: 'No AP fires',
        boundaryContrast: { confusableLookalike: 'Repolarization', distinguishingRule: 'Na+ vs K+ gate' },
      },
    ],
    practiceQuestions: [
      { id: 'q1', question: 'Resting potential?', answer: '-70mV', whyCorrect: 'K+ leak sets it' },
    ],
    workedExamples: [
      { id: 'e1', title: 'Nernst', problem: 'Find EK', steps: ['Plug values', 'Solve'], takeaway: 'Gradient rules' },
    ],
  };

  it('emits :: descriptors for every content line (flashcards, not notes)', () => {
    const payload = generateSegregationRemnote(report);
    const lines = payload.markdown.split('\n');
    // Every bullet is a RemNote card, in one of the two card shapes RemNote
    // recognises: `front :: back` descriptors, or a `{{deletion}}` cloze.
    const bullets = lines.filter((l) => l.startsWith('-'));
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) {
      expect(bullet.includes('::') || /\{\{.+\}\}/.test(bullet)).toBe(true);
    }
    // Fact with a short question renders as Q :: A.
    expect(payload.markdown).toContain('Na+/K+ pump net movement?');
    // Fact WITHOUT a question falls back to the cloze front, preserving the
    // {{deletion}} for RemNote cloze cards.
    const clozeOnly = generateSegregationRemnote({
      ...report,
      declarativeFacts: [
        { id: 'f2', factStatement: 'Threshold is -55mV.', clozeSuggestion: 'Threshold is {{-55mV}}.' },
      ],
    });
    expect(clozeOnly.markdown).toContain('Threshold is {{-55mV}}.');
    // The cloze suggestion is NEVER dropped in favour of the Q/A card: both
    // shapes ship, because the deletion is the card that actually drills it.
    expect(payload.markdown).toContain('The pump moves {{3 Na+ out}} per ATP.');
    expect(payload.markdown).toContain('Na+/K+ pump net movement? :: The Na+/K+ pump moves 3 Na+ out and 2 K+ in per ATP.');
    // The memory hook rides along as its own card.
    expect(payload.markdown).toContain('Remember :: 3 out, 2 in');
    // Drills and worked-example step cards all present.
    expect(payload.markdown).toContain('Resting potential?');
    expect(payload.markdown).toContain('Step 1 :: Plug values');
    expect(payload.cardCount).toBeGreaterThan(6);
    expect(payload.factsCount).toBe(1);
    expect(payload.conceptsCount).toBe(1);
  });

  it('pushes through the app server with RemNote\'s documented v0 auth', () => {
    const attempts = buildRemnotePushAttempts('key-123', 'user-9', generateSegregationRemnote(report));
    expect(attempts.length).toBeGreaterThan(0);
    for (const attempt of attempts) {
      expect(attempt.url.startsWith(REMNOTE_API_BASE)).toBe(true);
      // RemNote authenticates with apiKey/userId headers — never a Bearer token.
      expect(attempt.headers.apiKey).toBe('key-123');
      expect(attempt.headers.userId).toBe('user-9');
      expect(JSON.stringify(attempt.headers)).not.toContain('Bearer');
      expect(JSON.stringify(attempt.body)).toContain('Na+/K+ pump net movement?');
    }
    // The browser must never call api.remnote.io itself: no CORS headers there.
    expect(attempts[0].url).toContain('api.remnote.io');
  });

  it('never falls back to plain child notes for the old schema path', () => {
    const schemaPayload = generateRemnoteHierarchy({
      topicSummary: 'T',
      activities: [
        {
          id: 'a1', stageNumber: 1, title: 'Stage 1', framework: 'F', cognitiveGoal: 'G',
          contextSnippet: 'ctx', keywords: ['K'], templateType: 'first_principles',
          prompt: 'P', scaffold: { field1Label: '', field1Placeholder: '', field2Label: '', field2Placeholder: '', exampleAnswer: '' },
        },
      ],
    });
    expect(schemaPayload.markdown).toContain('::');
  });
});

describe('pushToRemnoteApi (server proxy)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the app\'s own route instead of calling RemNote from the browser', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Pushed.', docId: 'doc_1' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = generateSegregationRemnote({
      topic: 'T',
      declarativeFacts: [],
      conceptualMechanisms: [],
    });
    const result = await pushToRemnoteApi('key', 'user', payload);

    expect(result.success).toBe(true);
    expect(result.docId).toBe('doc_1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/remnote');
    const sent = JSON.parse(String(init?.body));
    expect(sent.apiKey).toBe('key');
    expect(sent.markdown).toBe(payload.markdown);
  });

  it('surfaces the server\'s own failure text and points at the markdown path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({ success: false, message: 'RemNote answered HTTP 401.' }),
      }))
    );

    const result = await pushToRemnoteApi('bad', '', {
      markdown: '# T',
      cardCount: 0,
      factsCount: 0,
      conceptsCount: 0,
      hierarchicalDeck: '# T',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('HTTP 401');
  });
});