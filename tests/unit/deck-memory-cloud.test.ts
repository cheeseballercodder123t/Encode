// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  clearDeckMemory,
  deckSourceKey,
  forgedSourceLedger,
  loadDeckMemory,
  memoryKeyForTopic,
  recordDeckSources,
  saveDeckMemoryStore,
} from '../../lib/deck-memory';
import type { DeckMemorySource } from '../../lib/deck-memory';
import { readRemoteRecords, syncDeckMemoryWithCloud } from '../../lib/deck-memory-cloud';

// The SDK boundary, mocked rather than reached: this suite is about the shape
// the account's document is read into, not about Firestore.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'decks' })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({ db: {} }));

const snapshotOf = (records: unknown) => ({ exists: () => true, data: () => ({ records }) });

const videoSource = { kind: 'youtube' as const, label: 'https://youtu.be/abc', url: 'https://youtu.be/abc' };
const slideSource = { kind: 'file' as const, label: 'lecture-4-slides.pdf' };

const record = (over: Record<string, unknown> = {}) => ({
  topic: 'Renal Physiology',
  keys: ['loop of henle reaches 1 200 mosm'],
  updatedAt: 2,
  exports: 1,
  ...over,
});

describe('the account copy of the source ledger is read back', () => {
  it('carries the sightings the reader used to drop', () => {
    const id = memoryKeyForTopic('Renal Physiology');
    const records = readRemoteRecords({
      records: {
        [id]: record({
          sources: [{ key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 }],
        }),
      },
    });

    // The ledger was always *written* (the push stores the merged records whole)
    // and never read, so the union had one side.
    expect(records[id].sources).toEqual([
      { key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 },
    ]);
  });

  it('reads a record with no ledger exactly as it always did', () => {
    const records = readRemoteRecords({
      records: { t: { topic: 'T', keys: ['a', '', 7], updatedAt: 5, exports: 2, lastSurface: 'remnote' } },
    });

    expect(records.t).toEqual({
      topic: 'T',
      keys: ['a'],
      updatedAt: 5,
      exports: 2,
      lastSurface: 'remnote',
      sources: undefined,
    });
  });

  it('drops only the sightings it cannot rank, and keeps the ones it can', () => {
    const records = readRemoteRecords({
      records: {
        t: record({
          keys: [],
          sources: [
            { key: 'no sighting time' },
            { key: deckSourceKey(videoSource), label: 'Lecture 4', cards: 3, at: 900 },
            { key: 'partial', at: 4, cards: 'many', label: 7 },
            'not an entry',
            null,
          ],
        }),
      },
    });

    // `at` is the recency the union ranks by and the value the two devices are
    // compared on, so an entry without one is dropped rather than guessed at.
    // The display fields degrade instead, and the key stands in for a missing
    // label.
    expect(records.t.sources).toEqual([
      { key: deckSourceKey(videoSource), label: 'Lecture 4', cards: 3, at: 900 },
      { key: 'partial', label: 'partial', cards: 0, at: 4 },
    ]);
  });

  it('claims nothing rather than something for a ledger it cannot read', () => {
    const unreadable: unknown[] = [
      'nonsense',
      42,
      null,
      {},
      [],
      [{ key: deckSourceKey(videoSource) }],
      [{ key: '' , at: 5 }],
      [{ key: deckSourceKey(videoSource), at: Number.POSITIVE_INFINITY }],
      [{ key: deckSourceKey(videoSource), at: '900' }],
    ];

    for (const sources of unreadable) {
      const records = readRemoteRecords({ records: { t: record({ sources }) } });
      // `undefined`, not `[]`: the merge reads "no ledger here" as "leave this
      // device's ledger alone", while an empty array is the claim that the
      // account knows about no sources at all.
      expect(records.t.sources).toBeUndefined();
    }
  });

  it('still reads the fingerprints of a record whose ledger is unreadable', () => {
    const records = readRemoteRecords({ records: { t: record({ sources: 'nonsense' }) } });

    // Losing the fingerprints because the optional ledger was malformed would
    // re-offer cards the learner already has.
    expect(records.t.keys).toEqual(['loop of henle reaches 1 200 mosm']);
    expect(records.t.sources).toBeUndefined();
  });
});

describe('through the sync the ingest panel calls', () => {
  const topic = 'Renal Physiology';
  const id = memoryKeyForTopic(topic);

  const syncWith = (remote: unknown) => {
    vi.mocked(firestore.getDoc).mockResolvedValue(snapshotOf(remote) as never);
    return syncDeckMemoryWithCloud('uid-1');
  };

  beforeEach(() => {
    clearDeckMemory();
    vi.mocked(firestore.getDoc).mockReset();
    vi.mocked(firestore.setDoc).mockReset();
    vi.mocked(firestore.setDoc).mockResolvedValue(undefined as never);
  });

  it('offers a lecture the other device cut as already forged, under the key the panel looks up', async () => {
    const result = await syncWith({
      [id]: record({
        sources: [{ key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 }],
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    // This is what the panel asks, by exactly this key, to render
    // `[ FORGED × 4 ]` and to offer the skip.
    expect(forgedSourceLedger().get(deckSourceKey(videoSource))).toMatchObject({
      cards: 4,
      topic,
      at: 900,
    });
    expect(loadDeckMemory()[id].sources).toHaveLength(1);
  });

  it('pushes the merged ledger back, so the account copy stays the union', async () => {
    await syncWith({
      [id]: record({
        sources: [{ key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 }],
      }),
    });

    const payload = vi.mocked(firestore.setDoc).mock.calls[0][1] as { records: Record<string, { sources: unknown[] }> };
    expect(payload.records[id].sources).toHaveLength(1);
  });

  it('does not report the same merge again on the next sync', async () => {
    const remote = {
      [id]: record({ sources: [{ key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 }] }),
    };

    expect((await syncWith(remote)).changed).toBe(true);
    // The ledger read back is now this device's own, so the second sync is the
    // fixed point the mirror needs to stop reporting a merge every time.
    expect((await syncWith(remote)).changed).toBe(false);
  });

  it("leaves this device's own ledger alone when the account's copy is unreadable", async () => {
    recordDeckSources({
      topic,
      sources: [{ key: deckSourceKey(slideSource), label: slideSource.label, cards: 12 }],
      timestamp: 900,
    });

    await syncWith({ [id]: record({ sources: 'nonsense' }) });

    expect(loadDeckMemory()[id].sources).toEqual([
      { key: deckSourceKey(slideSource), label: slideSource.label, cards: 12, at: 900 },
    ]);
  });

  it('adopts the fuller cut when the account recorded the same sighting in the same millisecond', async () => {
    recordDeckSources({
      topic,
      sources: [{ key: deckSourceKey(videoSource), label: 'Lecture 4', cards: 12 }],
      timestamp: 900,
    });

    await syncWith({
      [id]: record({
        sources: [{ key: deckSourceKey(videoSource), label: 'Lecture 4 (revised)', cards: 14, at: 900 }],
      }),
    });

    expect(loadDeckMemory()[id].sources).toEqual([
      { key: deckSourceKey(videoSource), label: 'Lecture 4 (revised)', cards: 14, at: 900 },
    ]);
  });

  it('keeps the newest sightings across both devices when their ledger overflows the cap', async () => {
    // The ledger holds at most 60 sightings per topic, and `recordDeckSources`
    // already trims one device's own list to its newest 60 — so reading the
    // account's ledger extends that same recency rule to the union instead of
    // inventing a second one. Pinned by a test because it is the one consequence
    // of reading the ledger back that a learner can observe: a source older than
    // the newest 60 sightings across the account reads as new again, on the
    // device that had it and on the one that did not.
    const side = (prefix: string, newest: number) =>
      Array.from({ length: 40 }, (_, i) => ({
        key: `url:${prefix}-${i}`,
        label: `${prefix}-${i}`,
        cards: 1,
        at: newest - i,
      }));
    const localStore = (sources: DeckMemorySource[]) => ({ [id]: record({ keys: [], sources }) });

    // This device's sightings are the newer half, so the account's 20 oldest give way.
    saveDeckMemoryStore(localStore(side('mine', 1000)));
    await syncWith({ [id]: record({ keys: [], sources: side('theirs', 700) }) });
    const keepMine = new Set(loadDeckMemory()[id].sources!.map((s) => s.key));
    expect(keepMine.size).toBe(60);
    for (const source of side('mine', 1000)) expect(keepMine.has(source.key)).toBe(true);
    expect(keepMine.has('url:theirs-19')).toBe(true);
    expect(keepMine.has('url:theirs-20')).toBe(false);

    // And the other way round it is this device's 20 oldest that give way: the
    // trim is by sighting time, not by which device wrote first.
    clearDeckMemory();
    saveDeckMemoryStore(localStore(side('mine', 700)));
    await syncWith({ [id]: record({ keys: [], sources: side('theirs', 1000) }) });
    const keepTheirs = new Set(loadDeckMemory()[id].sources!.map((s) => s.key));
    expect(keepTheirs.size).toBe(60);
    for (const source of side('theirs', 1000)) expect(keepTheirs.has(source.key)).toBe(true);
    expect(keepTheirs.has('url:mine-19')).toBe(true);
    expect(keepTheirs.has('url:mine-20')).toBe(false);
  });

  it('matches the account ledger only by source fingerprint, so unrelated material is never called forged', async () => {
    await syncWith({
      [id]: record({
        sources: [{ key: deckSourceKey(videoSource), label: videoSource.label, cards: 4, at: 900 }],
      }),
    });

    const ledger = forgedSourceLedger();
    expect(ledger.get(deckSourceKey(videoSource))).toMatchObject({ cards: 4 });
    // The panel asks with `deckSourceKey` for each source in its own setup, so a
    // different lecture in the same topic cannot inherit the chip, and a source
    // the learner never attached is never listed at all.
    expect(deckSourceKey(slideSource)).not.toBe(deckSourceKey(videoSource));
    expect(ledger.get(deckSourceKey(slideSource))).toBeUndefined();
  });

  it('does not touch the account or the memory when it is not signed in', async () => {
    const result = await syncDeckMemoryWithCloud(null);

    expect(result.ok).toBe(false);
    expect(firestore.getDoc).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });
});
