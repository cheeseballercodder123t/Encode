import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildAnkiCollectionSqlite,
  sha1Hex,
  generateAnkiGuid,
  AnkiCollectionSpec,
} from '@/lib/anki-sqlite-writer';

const spec: AnkiCollectionSpec = {
  conf: '{"nextPos":1,"curDeck":1,"curModel":"1770000000000"}',
  models: '{"1770000000000":{"id":1770000000000,"name":"DeepEncode Procedural MCQ","type":0}}',
  decks: '{"1":{"id":1,"name":"Default"},"1770000000001":{"id":1770000000001,"name":"DeepEncode::Test"}}',
  dconf: '{"1":{"id":1,"name":"Default"}}',
  notes: [
    {
      guid: generateAnkiGuid(),
      mid: 1770000000000,
      tags: 'DeepEncode Test',
      flds: [
        '<script type="application/json">{"id":"x","topic":"T",' +
          '"questionTemplate":"A fairly long field designed to push past the ' +
          'overflow threshold... '.padEnd(4500, 'x') + '"}</script>',
        'Topic One',
        'm/s',
      ],
      sfld: 'Topic One',
    },
    {
      guid: generateAnkiGuid(),
      mid: 1770000000000,
      tags: 'DeepEncode Test',
      flds: ['<script type="application/json">{"id":"y"}</script>', 'Topic Two', 'ms'],
      sfld: 'Topic Two',
    },
  ],
  cards: [
    { nid: 1770000000000, did: 1770000000001, ord: 0, due: 1770000000000 },
    { nid: 1770000000001, did: 1770000000001, ord: 0, due: 1770000000001 },
  ],
  modMs: 1770000000000,
};

function writeTempCollection(): string {
  const bytes = buildAnkiCollectionSqlite(spec);
  const dir = mkdtempSync(join(tmpdir(), 'anki-sqlite-'));
  const path = join(dir, 'collection.anki2');
  writeFileSync(path, bytes);
  return path;
}

describe('buildAnkiCollectionSqlite', () => {
  it('emits the SQLite 3 magic header and Anki schema 11 user_version', () => {
    const bytes = buildAnkiCollectionSqlite(spec);
    const text = Buffer.from(bytes.slice(0, 16)).toString('latin1');
    expect(text).toBe('SQLite format 3\u0000');
    expect(bytes[16] * 256 + bytes[17]).toBe(4096); // page size
    const userVersion = bytes[60] * 16777216 + bytes[61] * 65536 + bytes[62] * 256 + bytes[63];
    expect(userVersion).toBe(11); // Anki legacy schema
    const pageCount = bytes[28] * 16777216 + bytes[29] * 65536 + bytes[30] * 256 + bytes[31];
    expect(pageCount).toBe(bytes.length / 4096);
  });

  it('computes correct SHA-1 (known vectors)', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('The quick brown fox jumps over the lazy dog')).toBe(
      '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'
    );
  });

  it('passes SQLite integrity_check and round-trips Anki rows (python cross-validation)', { timeout: 30000 }, () => {
    // Locate a python interpreter with sqlite3; skip gracefully if absent.
    let python = '';
    for (const candidate of ['python', 'python3', 'py']) {
      const probe = spawnSync(candidate, ['-c', 'import sqlite3; print("ok")'], { encoding: 'utf8' });
      if (probe.status === 0 && probe.stdout.includes('ok')) {
        python = candidate;
        break;
      }
    }
    if (!python) {
      console.warn('Python with sqlite3 not available : skipping cross-validation.');
      return;
    }

    const path = writeTempCollection();
    try {
      const script = `
import sqlite3, json, sys
conn = sqlite3.connect(${JSON.stringify(path)})
cur = conn.cursor()
integrity = cur.execute('PRAGMA integrity_check').fetchall()
assert integrity == [('ok',)], f'integrity_check failed: {integrity}'
assert cur.execute('PRAGMA user_version').fetchone()[0] == 11, 'user_version'
tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert {'col','notes','cards','revlog','graves'} <= tables, tables
indexes = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='index'")}
assert {'ix_notes_csum','ix_cards_sched','ix_cards_nid'} <= indexes, indexes
col = cur.execute('SELECT ver, models, decks FROM col WHERE id=1').fetchone()
assert col[0] == 11, col
models = json.loads(col[1])
assert list(models.keys()) == ['1770000000000'], models
assert json.loads(col[2])['1770000000001']['name'] == 'DeepEncode::Test'
notes = cur.execute('SELECT guid, mid, flds, sfld, csum, tags FROM notes ORDER BY id').fetchall()
assert len(notes) == 2, len(notes)
assert notes[0][3] == 'Topic One'
assert notes[0][2].startswith('<script type="application/json">'), 'field 1 content'
assert len(notes[0][2]) > 4500, 'overflow payload round-trip'
assert notes[0][5] == 'DeepEncode Test'
cards = cur.execute('SELECT nid, did, ord, type, queue FROM cards ORDER BY id').fetchall()
assert len(cards) == 2 and cards[0][0] == 1770000000000 and cards[0][2] == 0, cards
assert all(c[3] == 0 and c[4] == 0 for c in cards), cards
idx = cur.execute('SELECT nid FROM cards WHERE nid = 1770000000001').fetchall()
assert len(idx) == 1, 'index-backed lookup failed'
print('PYTHON_OK')
conn.close()
`;
      const result = spawnSync(python, ['-c', script], { encoding: 'utf8' });
      if (result.status !== 0) {
        throw new Error(`python verification failed: ${result.stderr || result.stdout}`);
      }
      expect(result.stdout).toContain('PYTHON_OK');
    } finally {
      rmSync(path, { force: true });
    }
  });

  it('handles empty note/card lists (empty tables)', () => {
    const empty: AnkiCollectionSpec = { ...spec, notes: [], cards: [] };
    const bytes = buildAnkiCollectionSqlite(empty);
    expect(bytes.length % 4096).toBe(0);
    expect(Buffer.from(bytes.slice(0, 15)).toString('latin1')).toBe('SQLite format 3');
  });
});
