// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearDeckMemory,
  deckMemoryStoresEqual,
  knownKeysForTopic,
  loadDeckMemory,
  memoryKeyForTopic,
  mergeDeckMemoryStores,
  recordDeckExport,
  saveDeckMemoryStore,
} from '../../lib/deck-memory';
import type { DeckMemorySource } from '../../lib/deck-memory';

/**
 * The deck memory answers "you already have this card". The cloud mirror decides
 * whether to write with `deckMemoryStoresEqual(local, merged)`, and `merge`
 * rebuilds the fingerprint list remote-first every time it runs — so the
 * comparison has to read that list as a SET. Comparing it by index made a merge
 * that added nothing at all report a change, and made the merge itself
 * non-commutative as a value.
 */

const topic = (keys: string[]) => ({ topic: 't', keys, updatedAt: 1, exports: 1, lastSurface: undefined });
const store = (keys: string[]) => ({ t1: topic(keys) });

describe('deck memory — the fingerprint list is a set, not a sequence', () => {
  it('holds the same memory whatever order the keys are in', () => {
    expect(deckMemoryStoresEqual(store(['a', 'b', 'c']) as never, store(['c', 'a', 'b']) as never)).toBe(true);
  });

  it('still separates stores that differ by one fingerprint, or by one key', () => {
    expect(deckMemoryStoresEqual(store(['a', 'b']) as never, store(['a', 'b', 'c']) as never)).toBe(false);
    expect(deckMemoryStoresEqual(store(['a', 'b']) as never, store(['a', 'z']) as never)).toBe(false);
    expect(deckMemoryStoresEqual(store(['a', 'b']) as never, {} as never)).toBe(false);
  });

  it('a merge that adds nothing reads as no change', () => {
    const merged = mergeDeckMemoryStores(store(['L1', 'L2']) as never, store(['L2', 'L1']) as never);
    expect(deckMemoryStoresEqual(store(['L1', 'L2']) as never, merged as never)).toBe(true);
  });

  it('merge is commutative as a value', () => {
    const ab = mergeDeckMemoryStores(store(['a', 'b']) as never, store(['c', 'd']) as never);
    const ba = mergeDeckMemoryStores(store(['c', 'd']) as never, store(['a', 'b']) as never);
    expect(deckMemoryStoresEqual(ab as never, ba as never)).toBe(true);
  });
});

/**
 * `MAX_KEYS_PER_TOPIC` is 600 and the union used to be remote-first *before* it
 * was sliced, so a remote device already holding the cap pushed every local
 * fingerprint off the end. The memory exists to say "you have already shipped
 * this card", so losing the local fingerprints re-offered the local device's
 * own cards as new — and the cloud mirror wrote that loss back over the shared
 * copy.
 *
 * A fingerprint carries no timestamp of its own; `keys` is newest-first on
 * every device (both `recordDeckExport` and `adoptDeckKeys` prepend, "so the cap
 * trims the oldest"), so a position in that list is the recency the cap has to
 * trim by.
 */
describe('deck memory — the 600-key cap is shared, not won by the remote device', () => {
  // Newest-first, like the real list: `l0` is this device's freshest export.
  const list = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix}${i}`);

  beforeEach(() => clearDeckMemory());

  it("keeps the local device's fingerprints when both devices already hold the cap", () => {
    const merged = mergeDeckMemoryStores(store(list('l', 600)) as never, store(list('r', 600)) as never);
    const keys = merged['t1'].keys;
    expect(keys).toHaveLength(600);
    // Against the remote-first union every survivor was `r…`: `l0`, this
    // device's newest fingerprint, was gone along with the other 599.
    expect(keys).toContain('l0');
    expect(keys).toContain('r0');
    expect(keys.filter((k) => k.startsWith('l'))).toHaveLength(300);
    expect(keys.filter((k) => k.startsWith('r'))).toHaveLength(300);
  });

  it("trims the oldest fingerprints on each side, not one device's whole list", () => {
    const merged = mergeDeckMemoryStores(store(list('l', 1000)) as never, store(list('r', 1000)) as never);
    const keys = new Set(merged['t1'].keys);
    expect(keys.has('l0')).toBe(true);
    expect(keys.has('r0')).toBe(true);
    expect(keys.has('l299')).toBe(true);
    expect(keys.has('r299')).toBe(true);
    // Each side's oldest 700 are what the cap actually trims.
    expect(keys.has('l700')).toBe(false);
    expect(keys.has('r700')).toBe(false);
  });

  it('never evicts a device whose memory fits inside the cap', () => {
    const merged = mergeDeckMemoryStores(store(list('l', 5)) as never, store(list('r', 5000)) as never);
    const keys = new Set(merged['t1'].keys);
    for (let i = 0; i < 5; i += 1) expect(keys.has(`l${i}`)).toBe(true);
    expect(keys.size).toBe(600);
  });

  it("keeps the whole union when it fits, each device's own order intact", () => {
    const merged = mergeDeckMemoryStores(store(list('l', 300)) as never, store(list('r', 300)) as never);
    const keys = merged['t1'].keys;
    expect(new Set(keys).size).toBe(600);
    expect(keys[0]).toBe('l0');
    // A fingerprint's position in its own device's list is the recency the cap
    // trims by, so each device's list has to stay in that order in the survivor.
    for (let i = 0; i < 299; i += 1) {
      expect(keys.indexOf(`l${i}`)).toBeLessThan(keys.indexOf(`l${i + 1}`));
      expect(keys.indexOf(`r${i}`)).toBeLessThan(keys.indexOf(`r${i + 1}`));
    }
  });

  it('resolves the same retained set in either direction', () => {
    const local = store(list('l', 700)) as never;
    const remote = store(list('r', 900)) as never;
    const ab = mergeDeckMemoryStores(local, remote);
    const ba = mergeDeckMemoryStores(remote, local);
    expect(new Set(ab['t1'].keys)).toEqual(new Set(ba['t1'].keys));
    expect(deckMemoryStoresEqual(ab as never, ba as never)).toBe(true);
  });

  it('is a fixed point, so a fingerprint cannot oscillate in and out of the memory', () => {
    const local = store(list('l', 700)) as never;
    const remote = store(list('r', 900)) as never;
    const survivors = new Set(mergeDeckMemoryStores(local, remote)['t1'].keys);
    const merged = mergeDeckMemoryStores(local, remote) as never;
    // The other device merges the survivor with its own store, and this device
    // merges its store with the survivor: same fingerprints both times.
    expect(new Set(mergeDeckMemoryStores(merged, remote)['t1'].keys)).toEqual(survivors);
    expect(new Set(mergeDeckMemoryStores(local, merged)['t1'].keys)).toEqual(survivors);
  });

  it("does not resurrect this device's cards as new after the account's memory merges in", () => {
    const name = 'Renal Physiology';
    const mine = list('l', 40);
    recordDeckExport({ topic: name, keys: mine });
    const id = memoryKeyForTopic(name);
    const remote = { [id]: { topic: name, keys: list('r', 5000), updatedAt: 2, exports: 9 } };

    saveDeckMemoryStore(mergeDeckMemoryStores(loadDeckMemory(), remote as never));

    const known = knownKeysForTopic(name);
    // A deck well inside the cap is remembered in full: against the old merge
    // all 40 read as fresh and would have been shipped to Anki a second time.
    for (const key of mine) expect(known.has(key)).toBe(true);
    expect(known.size).toBe(600);
  });
});

/**
 * The source ledger has the same shape as the fingerprint list one level down,
 * and it had the same bug: `sourceLedgersEqual` read the entries **by index**,
 * while `mergeSourceLedgers` rebuilds the array from both sides in argument
 * order. Two devices holding the identical sightings of a lecture therefore
 * read as different memories whenever their ledgers were ordered differently —
 * and that comparison is the change signal the cloud mirror acts on:
 * `changed = !deckMemoryStoresEqual(local, merged)` in
 * `lib/deck-memory-cloud.ts`, which writes the store back and tells the learner
 * "Merged with your account's deck memory" on every sync, forever, for a merge
 * that added nothing.
 *
 * Same-millisecond ties made it worse than a wrong order: the loop kept the
 * LAST entry it iterated, i.e. "equal `at` means the local device wins", so
 * `merge(local, remote)` kept the local card count for a sighting while
 * `merge(remote, local)` kept the remote one — and the comparison, which only
 * ever looked at `key` and `at`, could not see the disagreement.
 */
describe('deck memory — the source ledger is a set of sightings, not a sequence', () => {
  const sighting = (key: string, at: number, cards = 1, label = key): DeckMemorySource => ({ key, label, cards, at });
  const ledgerStore = (sources: DeckMemorySource[]) => ({
    t1: { topic: 't', keys: ['a'], updatedAt: 1, exports: 1, sources },
  });

  it('holds the same ledger whatever order the sightings are in', () => {
    const one = ledgerStore([sighting('url:lecture 4', 900), sighting('file:slides.pdf', 400)]);
    const other = ledgerStore([sighting('file:slides.pdf', 400), sighting('url:lecture 4', 900)]);
    expect(deckMemoryStoresEqual(one, other)).toBe(true);
  });

  it('still separates ledgers that differ by a sighting, a time, or a count', () => {
    const base = ledgerStore([sighting('url:lecture 4', 900, 12)]);
    // A source the other device never cut, in either direction.
    expect(deckMemoryStoresEqual(base, ledgerStore([sighting('url:lecture 5', 900, 12)]))).toBe(false);
    // The same source seen again later is a newer sighting, not an equal one.
    expect(deckMemoryStoresEqual(base, ledgerStore([sighting('url:lecture 4', 901, 12)]))).toBe(false);
    // Same source, same millisecond, different cut: the panel shows the count,
    // so the two ledgers do not hold the same memory.
    expect(deckMemoryStoresEqual(base, ledgerStore([sighting('url:lecture 4', 900, 13)]))).toBe(false);
    expect(deckMemoryStoresEqual(base, ledgerStore([]))).toBe(false);
    expect(deckMemoryStoresEqual(base, store(['a']))).toBe(false);
  });

  it('reads a merge that only re-ordered the ledger as no change', () => {
    const local = ledgerStore([sighting('url:lecture 4', 900), sighting('file:slides.pdf', 900)]);
    const remote = ledgerStore([sighting('file:slides.pdf', 900), sighting('url:lecture 4', 900)]);
    const merged = mergeDeckMemoryStores(local, remote);
    expect(deckMemoryStoresEqual(local, merged)).toBe(true);
    expect(deckMemoryStoresEqual(merged, local)).toBe(true);
  });

  it('resolves a same-millisecond tie the same way whichever device merges', () => {
    // Both devices forged both lectures in the same millisecond, and cut a
    // different number of cards from each — the real shape of a tie, since a
    // second device re-forging the same material lands on its own count.
    const mine = ledgerStore([
      sighting('url:lecture 4', 900, 12, 'Lecture 4'),
      sighting('file:slides.pdf', 900, 20, 'slides.pdf'),
    ]);
    const theirs = ledgerStore([
      sighting('url:lecture 4', 900, 14, 'Lecture 4 (revised)'),
      sighting('file:slides.pdf', 900, 18, 'slides.pdf'),
    ]);

    const ab = mergeDeckMemoryStores(mine, theirs);
    const ba = mergeDeckMemoryStores(theirs, mine);

    // The fuller cut wins, whichever side it came from, and the order is the
    // same function of the two ledgers either way round.
    expect(ab['t1'].sources).toEqual([
      sighting('file:slides.pdf', 900, 20, 'slides.pdf'),
      sighting('url:lecture 4', 900, 14, 'Lecture 4 (revised)'),
    ]);
    expect(ba['t1'].sources).toEqual(ab['t1'].sources);
    expect(deckMemoryStoresEqual(ab, ba)).toBe(true);
  });

  it('hands the fuller tie to the device holding the smaller count, and then holds still', () => {
    const local = ledgerStore([sighting('url:lecture 4', 900, 12)]);
    const remote = ledgerStore([sighting('url:lecture 4', 900, 14, 'Lecture 4 (revised)')]);

    const merged = mergeDeckMemoryStores(local, remote);
    // The local copy is not the merged one, so the mirror saves it — otherwise
    // the panel would keep showing 12 for a ledger the account records as 14.
    expect(deckMemoryStoresEqual(local, merged)).toBe(false);
    // And the merged ledger is a fixed point: the next sync reads it as no
    // change, so the extra card count cannot oscillate between the devices.
    expect(deckMemoryStoresEqual(merged, mergeDeckMemoryStores(merged, remote))).toBe(true);
  });

  it('walks the real read path without reporting a change that adds nothing', () => {
    // Exactly what `syncDeckMemoryWithCloud` runs: write, load, merge against an
    // account record, compare. The stored ledger is one an older build wrote —
    // its order is not newest-first — and the merge necessarily re-sorts it.
    // Re-sorting a set is not a change, so this comparison has to read the
    // ledger as a set too, or the mirror re-saves and re-reports the merge on
    // every single sync.
    clearDeckMemory();
    const id = memoryKeyForTopic('Renal Physiology');
    saveDeckMemoryStore({
      [id]: {
        topic: 'Renal Physiology',
        keys: ['loop of henle reaches 1 200 mosm'],
        updatedAt: 1,
        exports: 1,
        sources: [sighting('url:lecture 4', 400, 12), sighting('file:slides.pdf', 900, 20, 'slides.pdf')],
      },
    });
    const local = loadDeckMemory();
    const remote = { [id]: { topic: 'Renal Physiology', keys: [], updatedAt: 2, exports: 0 } };
    const merged = mergeDeckMemoryStores(local, remote);

    expect(merged[id].sources?.map((s) => s.key)).toEqual(['file:slides.pdf', 'url:lecture 4']);
    expect(deckMemoryStoresEqual(local, merged)).toBe(true);
  });

  it('cannot be decided by tie order when the ledger overflows its cap', () => {
    // 80 sources, all sighted in the same millisecond, against a cap of 60: the
    // union has to shed 20, and which 20 cannot depend on who merged.
    const side = (prefix: string) =>
      Array.from({ length: 40 }, (_, i) => sighting(`${prefix}-${String(i).padStart(2, '0')}`, 900));
    const ab = mergeDeckMemoryStores(ledgerStore(side('a')), ledgerStore(side('b')));
    const ba = mergeDeckMemoryStores(ledgerStore(side('b')), ledgerStore(side('a')));

    expect(ab['t1'].sources).toHaveLength(60);
    expect(ab['t1'].sources).toEqual(ba['t1'].sources);
  });
});
