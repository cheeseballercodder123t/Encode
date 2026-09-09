import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import JSZip from 'jszip';
import {
  generateProceduralAnkiTextDeck,
  generateProceduralApkgPackage,
  buildProceduralFieldData,
  PROCEDURAL_RUNNER_JS,
  PROCEDURAL_NOTE_TYPE_NAME,
} from '@/lib/anki-exporter';
import { BUILT_IN_ARCHETYPES } from '@/lib/procedural-archetypes';

describe('generateProceduralAnkiTextDeck', () => {
  it('emits procedural-import headers and one tab-separated row per archetype', () => {
    const deck = generateProceduralAnkiTextDeck(BUILT_IN_ARCHETYPES, 'DeepEncode::AP_Physics');
    const lines = deck.split('\n');
    expect(lines[0]).toBe('#separator:tab');
    expect(lines[1]).toBe('#html:true');
    expect(lines[2]).toBe('#tags column:4');
    expect(lines[4]).toBe(`#notetype:${PROCEDURAL_NOTE_TYPE_NAME}`);
    expect(lines[6].split('\t')).toHaveLength(4);
    expect(lines).toHaveLength(6 + BUILT_IN_ARCHETYPES.length);
  });

  it('embeds braced placeholders in a way that survives Anki field rendering', () => {
    const deck = generateProceduralAnkiTextDeck([BUILT_IN_ARCHETYPES[0]], 'deck');
    const dataField = deck.split('\n')[6].split('\t')[0];
    expect(dataField).toContain('<script type="application/json"');
    // The archetype JSON keeps its {{var}} placeholders for the runner to fill.
    // (Anki performs {{}} substitution on templates only, never on stored
    // field content : verified by the python round-trip in the apkg test.)
    const json = dataField.slice(dataField.indexOf('>') + 1, dataField.lastIndexOf('</script>'));
    const archetype = JSON.parse(json);
    expect(archetype.questionTemplate).toContain('{{m}}');
  });
});

describe('buildProceduralFieldData', () => {
  it('escapes HTML metacharacters and keeps the script tag breakdown-safe', () => {
    const payload = buildProceduralFieldData(BUILT_IN_ARCHETYPES[0]);
    expect(payload.startsWith('<script type="application/json" id="proc-archetype-data">')).toBe(true);
    // Exactly one closing tag (the enclosing one) : internal archetype HTML
    // (e.g. <br> inside solution text) is JSON-escaped to \u003c.
    const closers = payload.split('</script>').length - 1;
    expect(closers).toBe(1);
    const inner = payload.slice(payload.indexOf('>') + 1, payload.lastIndexOf('</script>'));
    expect(inner).toContain('\\u003cbr\\u003e');
    // Round-trips through JSON.
    expect(JSON.parse(inner).id).toBe(BUILT_IN_ARCHETYPES[0].id);
  });
});

describe('PROCEDURAL_RUNNER_JS', () => {
  it('is free of literal double-brace sequences (Anki template safety)', () => {
    expect(PROCEDURAL_RUNNER_JS).not.toContain('{{');
    expect(PROCEDURAL_RUNNER_JS).not.toContain('}}');
  });

  it('is syntactically valid JavaScript', () => {
    const rc = spawnSync(
      process.execPath,
      ['-e', `const vm = require('vm');` +
        `const src = ${JSON.stringify(PROCEDURAL_RUNNER_JS)};` +
        `new vm.Script(src, { filename: 'runner.js' }); console.log('RUNNER_OK');`],
      { encoding: 'utf8' }
    );
    expect(rc.stdout).toContain('RUNNER_OK');
    if (rc.status !== 0) throw new Error(rc.stderr);
  });
});

describe('generateProceduralApkgPackage', () => {
  it('builds a zip with collection.anki2, media, deck.txt and a manifest', async () => {
    const blob = await generateProceduralApkgPackage(BUILT_IN_ARCHETYPES, 'DeepEncode::Procedural_AP');
    expect(blob.size).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file('collection.anki2')?.async('uint8array')).toBeDefined();
    expect(await zip.file('media')?.async('string')).toBe('{}');
    expect(await zip.file('deck.txt')?.async('string')).toContain('#notetype:DeepEncode Procedural MCQ');
    const manifest = JSON.parse(await zip.file('deepencode_sm2_manifest.json')?.async('string') || '{}');
    expect(manifest.cardCount).toBe(BUILT_IN_ARCHETYPES.length);
  });

  it('produces a collection.anki2 that real sqlite3 considers a valid Anki schema-11 DB', async () => {
    const blob = await generateProceduralApkgPackage(BUILT_IN_ARCHETYPES.slice(0, 3), 'DeepEncode::AP_Physics');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const bytes = await zip.file('collection.anki2')!.async('uint8array');

    let python = '';
    for (const candidate of ['python', 'python3', 'py']) {
      const probe = spawnSync(candidate, ['-c', 'import sqlite3; print("ok")'], { encoding: 'utf8' });
      if (probe.status === 0 && probe.stdout.includes('ok')) {
        python = candidate;
        break;
      }
    }
    if (!python) {
      console.warn('Python with sqlite3 not available : skipping apkg cross-validation.');
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), 'anki-apkg-'));
    const path = join(dir, 'collection.anki2');
    writeFileSync(path, bytes);
    try {
      const script = `
import sqlite3, json
conn = sqlite3.connect(${JSON.stringify(path)})
cur = conn.cursor()
assert cur.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'integrity'
assert cur.execute('PRAGMA user_version').fetchone()[0] == 11, 'user_version'
col = cur.execute('SELECT models, decks, conf FROM col WHERE id=1').fetchone()
models = json.loads(col[0])
names = [m['name'] for m in models.values()]
assert 'DeepEncode Procedural MCQ' in names, names
decks = json.loads(col[1])
assert any(d['name'] == 'DeepEncode__AP_Physics' for d in decks.values()), decks
notes = cur.execute('SELECT count(*) FROM notes').fetchone()[0]
cards = cur.execute('SELECT count(*) FROM cards').fetchone()[0]
assert notes == 3 and cards == 3, (notes, cards)
fld = cur.execute('SELECT flds FROM notes LIMIT 1').fetchone()[0]
assert fld.startswith('<script type="application/json"'), fld[:60]
print('PYTHON_OK')
`;
      const result = spawnSync(python, ['-c', script], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      expect(result.stdout).toContain('PYTHON_OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects an empty selection', async () => {
    await expect(generateProceduralApkgPackage([], 'deck')).rejects.toThrow(/No procedural archetypes/);
  });
});