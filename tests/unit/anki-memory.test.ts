// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEEP_ENCODE_DECK_ROOT,
  describeAnkiRead,
  matchingAnkiDecks,
  readAnkiDeckKeys,
  syncDeckMemoryFromAnki,
} from '@/lib/anki-memory';
import { cardKey, describeDeckMemory, knownKeysForTopic } from '@/lib/deck-memory';

/** One AnkiConnect note, in the shape `notesInfo` answers with. */
function note(noteId: number, fields: Record<string, string>, modelName = 'Basic') {
  return {
    noteId,
    modelName,
    tags: [],
    cards: [noteId],
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, value], order) => [name, { value, order }])
    ),
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
  return { calls, actionsFor: (a: string) => calls.filter((c) => c.action === a) };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('matchingAnkiDecks', () => {
  const decks = [
    'Default',
    'DeepEncode::Renal Physiology',
    'DeepEncode::Renal_Physiology',
    'DeepEncode::Renal Physiology::Loop of Henle',
    'DeepEncode::Pharmacology',
    'Spanish',
  ];

  it('finds the topic under both spellings the app has written', () => {
    expect(matchingAnkiDecks('Renal Physiology', decks)).toEqual([
      'DeepEncode::Renal Physiology',
      'DeepEncode::Renal_Physiology',
      'DeepEncode::Renal Physiology::Loop of Henle',
    ]);
  });

  it('never touches decks outside the DeepEncode root', () => {
    expect(matchingAnkiDecks('Spanish', decks)).toEqual([]);
    expect(DEEP_ENCODE_DECK_ROOT).toBe('DeepEncode');
  });

  it('matches nothing without a topic, and nothing for an unknown one', () => {
    expect(matchingAnkiDecks('', decks)).toEqual([]);
    expect(matchingAnkiDecks('   ', decks)).toEqual([]);
    expect(matchingAnkiDecks('Quantum', decks)).toEqual([]);
  });
});

describe('readAnkiDeckKeys', () => {
  it('reads note fronts out of the matching deck', async () => {
    const { actionsFor } = stubAnki({
      deckNames: { result: ['Default', 'DeepEncode::Renal Physiology'], error: null },
      findNotes: { result: [11, 12], error: null },
      notesInfo: {
        result: [
          note(11, { Front: 'Which limb pumps salt out?' }),
          note(12, { Text: 'ADH inserts {{c1::aquaporin-2}} into the collecting duct.' }, 'Cloze'),
        ],
        error: null,
      },
    });

    const read = await readAnkiDeckKeys('Renal Physiology');
    expect(read.ok).toBe(true);
    expect(read.decks).toEqual(['DeepEncode::Renal Physiology']);
    expect(read.notes).toBe(2);
    expect(read.keys).toEqual([
      cardKey('Which limb pumps salt out?'),
      cardKey('ADH inserts aquaporin-2 into the collecting duct.'),
    ]);
    // The deck is addressed by name, not by scanning everything in the profile.
    expect(actionsFor('findNotes')[0].params.query).toBe('deck:"DeepEncode::Renal Physiology"');
    expect(actionsFor('notesInfo')[0].params.notes).toEqual([11, 12]);
  });

  it('reads every spelling of the topic and dedupes the fingerprints', async () => {
    const duplicate = note(21, { Front: 'Which limb pumps salt out?' });
    stubAnki({
      deckNames: { result: ['DeepEncode::Renal Physiology', 'DeepEncode::Renal_Physiology'], error: null },
      findNotes: { result: [21], error: null },
      notesInfo: { result: [duplicate], error: null },
    });

    const read = await readAnkiDeckKeys('Renal Physiology');
    expect(read.decks).toHaveLength(2);
    expect(read.notes).toBe(2);
    expect(read.keys).toEqual([cardKey('Which limb pumps salt out?')]);
  });

  it('degrades to "no deck yet" when Anki is open but has nothing for the topic', async () => {
    stubAnki({ deckNames: { result: ['Default', 'DeepEncode::Pharmacology'], error: null } });
    const read = await readAnkiDeckKeys('Renal Physiology');
    expect(read).toEqual({ ok: true, decks: [], notes: 0, keys: [] });
    expect(describeAnkiRead(read)).toContain('no DeepEncode deck exists');
  });

  it('reports an offline AnkiConnect instead of throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const read = await readAnkiDeckKeys('Renal Physiology');
    expect(read.ok).toBe(false);
    expect(read.keys).toEqual([]);
    expect(read.error).toContain('http://localhost:8765');
    expect(describeAnkiRead(read)).toContain('AnkiConnect is unreachable');
    expect(describeAnkiRead(read)).toContain("this app's own memory only");
  });

  it('keeps the decks that answered when one of them fails to read', async () => {
    let first = true;
    stubAnki({
      deckNames: { result: ['DeepEncode::Renal Physiology', 'DeepEncode::Renal_Physiology'], error: null },
      findNotes: () => {
        if (first) {
          first = false;
          return { result: [31], error: null };
        }
        throw new TypeError('Failed to fetch');
      },
      notesInfo: { result: [note(31, { Front: 'Which limb pumps salt out?' })], error: null },
    });

    const read = await readAnkiDeckKeys('Renal Physiology');
    expect(read.ok).toBe(false);
    expect(read.notes).toBe(1);
    expect(read.keys).toEqual([cardKey('Which limb pumps salt out?')]);
    expect(describeAnkiRead(read)).toContain('dropped out halfway');
  });
});

describe('syncDeckMemoryFromAnki', () => {
  it('adopts the deck into the memory so the diff can see it', async () => {
    stubAnki({
      deckNames: { result: ['DeepEncode::Renal Physiology'], error: null },
      findNotes: { result: [41], error: null },
      notesInfo: { result: [note(41, { Front: 'Which limb pumps salt out?' })], error: null },
    });

    // A deck built by hand in Anki: this app has never exported anything here.
    expect(knownKeysForTopic('Renal Physiology').size).toBe(0);
    const sync = await syncDeckMemoryFromAnki('Renal Physiology');

    expect(sync.adopted).toBe(1);
    expect(sync.known).toBe(1);
    expect(knownKeysForTopic('Renal Physiology').has(cardKey('Which limb pumps salt out?'))).toBe(true);
    // It is not an export: the receipt stays empty.
    expect(describeDeckMemory('Renal Physiology')!.exports).toBe(0);
  });

  it('is a no-op when AnkiConnect is closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const sync = await syncDeckMemoryFromAnki('Renal Physiology');
    expect(sync.ok).toBe(false);
    expect(sync.adopted).toBe(0);
    expect(knownKeysForTopic('Renal Physiology').size).toBe(0);
    expect(describeDeckMemory('Renal Physiology')).toBeNull();
  });
});
