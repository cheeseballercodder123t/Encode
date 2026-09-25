// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AnkiConnectError,
  DEFAULT_ANKI_CONNECT_URL,
  describePushError,
  ensureAnkiDeck,
  formatPushStatus,
  loadAnkiEndpoint,
  mapCardToNote,
  pushCardsToAnki,
  sanitizeAnkiEndpoint,
  saveAnkiEndpoint,
} from '@/lib/anki-connect';
import type { AnkiCardItem } from '@/lib/anki-exporter';

function makeCard(over: Partial<AnkiCardItem> = {}): AnkiCardItem {
  return {
    id: 'card_1',
    front: '<b>Stage 1</b><br>Depolarization happens because {{c1::voltage}}.',
    back: 'Sodium rushes in.',
    isCloze: true,
    tags: ['DeepEncode', 'Stage:1'],
    sm2: { repetitions: 1, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
    ...over,
  };
}

/** Records every AnkiConnect call and answers from a per-action script. */
function stubAnki(responses: Record<string, any>) {
  const calls: { action: string; params: any }[] = [];
  const fetchMock = vi.fn(async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ action: body.action, params: body.params });
    if (!(body.action in responses)) {
      return { ok: true, status: 200, json: async () => ({ result: null, error: null }) } as any;
    }
    const scripted = responses[body.action];
    const value = typeof scripted === 'function' ? scripted(body.params, calls) : scripted;
    if (value instanceof Error) throw value;
    return { ok: true, status: 200, json: async () => value } as any;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, actionsFor: (a: string) => calls.filter((c) => c.action === a) };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sanitizeAnkiEndpoint', () => {
  it('falls back to the local default when empty', () => {
    expect(sanitizeAnkiEndpoint('')).toBe(DEFAULT_ANKI_CONNECT_URL);
    expect(sanitizeAnkiEndpoint(null)).toBe(DEFAULT_ANKI_CONNECT_URL);
    expect(sanitizeAnkiEndpoint('   ')).toBe(DEFAULT_ANKI_CONNECT_URL);
  });

  it('adds a scheme and drops trailing slashes', () => {
    expect(sanitizeAnkiEndpoint('127.0.0.1:8765')).toBe('http://127.0.0.1:8765');
    expect(sanitizeAnkiEndpoint('http://localhost:8765///')).toBe('http://localhost:8765');
    expect(sanitizeAnkiEndpoint('https://anki.home.lan')).toBe('https://anki.home.lan');
  });
});

describe('endpoint preference', () => {
  it('persists and reloads a normalized endpoint', () => {
    expect(loadAnkiEndpoint()).toBe(DEFAULT_ANKI_CONNECT_URL);
    expect(saveAnkiEndpoint('192.168.1.9:8765/')).toBe('http://192.168.1.9:8765');
    expect(loadAnkiEndpoint()).toBe('http://192.168.1.9:8765');
  });
});

describe('mapCardToNote', () => {
  it('maps a real cloze to the Cloze note type', () => {
    const note = mapCardToNote(makeCard(), 'DeepEncode::Topic');
    expect(note.modelName).toBe('Cloze');
    expect(note.fields.Text).toContain('{{c1::voltage}}');
    expect(note.fields.Extra).toBe('Sodium rushes in.');
    expect(note.deckName).toBe('DeepEncode::Topic');
    expect(note.options.allowDuplicate).toBe(false);
  });

  it('falls back to Basic when a card is flagged cloze but has no deletion', () => {
    const note = mapCardToNote(
      makeCard({ isCloze: true, front: 'No deletion here', back: 'plain' }),
      'Deck'
    );
    expect(note.modelName).toBe('Basic');
    expect(note.fields).toEqual({ Front: 'No deletion here', Back: 'plain' });
  });

  it('maps a plain card to Basic and sanitizes illegal tag characters', () => {
    const note = mapCardToNote(
      makeCard({ isCloze: false, front: 'Q', back: 'A', tags: ['Topic:Action Potentials', '"quoted"'] }),
      'Deck'
    );
    expect(note.modelName).toBe('Basic');
    expect(note.tags).toEqual(['Topic:Action_Potentials', 'quoted']);
  });
});

describe('ensureAnkiDeck', () => {
  it('creates the deck only when it is missing', async () => {
    const { actionsFor } = stubAnki({
      deckNames: { result: ['Default'], error: null },
      createDeck: { result: 1, error: null },
    });
    expect(await ensureAnkiDeck('DeepEncode::Topic')).toBe(true);
    expect(actionsFor('createDeck')).toHaveLength(1);
    expect(actionsFor('createDeck')[0].params).toEqual({ deck: 'DeepEncode::Topic' });
  });

  it('does not create a deck that already exists', async () => {
    const { actionsFor } = stubAnki({
      deckNames: { result: ['Default', 'DeepEncode::Topic'], error: null },
      createDeck: { result: 1, error: null },
    });
    expect(await ensureAnkiDeck('DeepEncode::Topic')).toBe(false);
    expect(actionsFor('createDeck')).toHaveLength(0);
  });
});

describe('pushCardsToAnki', () => {
  it('returns an empty result without touching the network for zero cards', async () => {
    const { fetchMock } = stubAnki({});
    const result = await pushCardsToAnki([], 'DeepEncode::Empty');
    expect(result).toEqual({
      deckName: 'DeepEncode::Empty',
      attempted: 0,
      added: 0,
      duplicates: 0,
      failed: 0,
      noteIds: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates the deck, adds notes, and counts duplicates', async () => {
    const { actionsFor } = stubAnki({
      deckNames: { result: ['Default'], error: null },
      createDeck: { result: 1, error: null },
      modelNames: { result: ['Basic', 'Cloze'], error: null },
      addNotes: { result: [101, null, 103], error: null },
    });

    const cards = [
      makeCard({ id: 'a' }),
      makeCard({ id: 'b', isCloze: false, front: 'How does TCP back off?', back: 'Multiplicatively.' }),
      makeCard({ id: 'c', isCloze: false, front: 'What limits router queues?', back: 'Finite memory.' }),
    ];

    const result = await pushCardsToAnki(cards, 'DeepEncode::Action_Potentials');
    expect(result.added).toBe(2);
    expect(result.duplicates).toBe(1);
    expect(result.attempted).toBe(3);
    expect(result.noteIds).toEqual([101, 103]);
    expect(actionsFor('createDeck')).toHaveLength(1);

    const notes = actionsFor('addNotes')[0].params.notes;
    expect(notes).toHaveLength(3);
    expect(notes[0].deckName).toBe('DeepEncode::Action_Potentials');
    expect(notes[0].modelName).toBe('Cloze');
    expect(notes[1].modelName).toBe('Basic');
    expect(notes[2].fields.Front).toBe('What limits router queues?');
    expect(notes[2].fields.Back).toBe('Finite memory.');
  });

  it('reports an all-duplicate push as zero new cards', async () => {
    stubAnki({
      deckNames: { result: ['DeepEncode::Topic'], error: null },
      modelNames: { result: ['Basic', 'Cloze'], error: null },
      addNotes: { result: [null, null], error: null },
    });
    const result = await pushCardsToAnki(
      [makeCard({ isCloze: false, front: 'Q1' }), makeCard({ isCloze: false, front: 'Q2' })],
      'DeepEncode::Topic'
    );
    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(2);
    expect(formatPushStatus(result)).toBe('[ANKI: +0 CARDS FORGED · 2 already in deck]');
  });

  it('explains a missing note type instead of failing the whole batch silently', async () => {
    stubAnki({
      deckNames: { result: ['Default'], error: null },
      createDeck: { result: 1, error: null },
      modelNames: { result: ['Basic'], error: null },
    });
    await expect(pushCardsToAnki([makeCard()], 'DeepEncode::Topic')).rejects.toThrow(/no note type named "Cloze"/);
  });
});

describe('failure messaging', () => {
  it('surfaces the AnkiConnect error string verbatim', async () => {
    stubAnki({ deckNames: { result: null, error: 'collection is not available' } });
    await expect(ensureAnkiDeck('DeepEncode::Topic')).rejects.toThrow(
      /Anki refused "deckNames": collection is not available/
    );
  });

  it('turns a refused connection into an actionable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(ensureAnkiDeck('DeepEncode::Topic')).rejects.toMatchObject({
      name: 'AnkiConnectError',
      kind: 'unreachable',
    });
    try {
      await ensureAnkiDeck('DeepEncode::Topic');
    } catch (err) {
      const message = describePushError(err);
      expect(message).toContain('http://127.0.0.1:8765');
      expect(message).toContain('2055492159');
      expect(message).toContain('webCorsOriginList');
      expect(err).toBeInstanceOf(AnkiConnectError);
    }
  });

  it('names the CORS config fix when AnkiConnect refuses the origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }))
    );
    try {
      await ensureAnkiDeck('DeepEncode::Topic');
      throw new Error('expected a rejection');
    } catch (err) {
      expect(err).toMatchObject({ kind: 'cors' });
      expect(describePushError(err)).toContain('webCorsOriginList');
    }
  });

  it('rejects a non-JSON reply from whatever else is on that port', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('nope'); } }))
    );
    await expect(ensureAnkiDeck('DeepEncode::Topic')).rejects.toThrow(/non-JSON reply/);
  });
});

describe('formatPushStatus', () => {
  const result = (over: Partial<Parameters<typeof formatPushStatus>[0]> = {}) => ({
    deckName: 'DeepEncode::Topic',
    attempted: 2,
    added: 2,
    duplicates: 0,
    failed: 0,
    noteIds: [1, 2],
    ...over,
  });

  it('reads as a receipt for the forge', () => {
    expect(formatPushStatus(result())).toBe('[ANKI: +2 CARDS FORGED]');
    expect(formatPushStatus(result({ added: 1 }))).toBe('[ANKI: +1 CARD FORGED]');
  });

  it('appends duplicate and refusal counts when they happen', () => {
    expect(formatPushStatus(result({ duplicates: 1, failed: 2 }))).toBe(
      '[ANKI: +2 CARDS FORGED · 1 already in deck · 2 refused]'
    );
  });

  it('names the cards that were pushed above the Wozniak ceiling', () => {
    expect(formatPushStatus(result(), { overflow: 2 })).toBe(
      '[ANKI: +2 CARDS FORGED · 2 over the 20-word ceiling (tagged WozniakOverflow)]'
    );
    expect(formatPushStatus(result(), { overflow: 0 })).toBe('[ANKI: +2 CARDS FORGED]');
  });
});
