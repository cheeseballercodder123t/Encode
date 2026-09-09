// ─── Pure-TypeScript Minimal SQLite Writer ───────────────────────────────────
// Emits a valid SQLite 3 database file implementing Anki's legacy collection
// schema (schema version 11) : the format inside .apkg `collection.anki2`.
//
// Only the documented SQLite file format is used:
//   https://www.sqlite.org/fileformat2.html
// Implemented: 4096-byte pages, table/index b-trees (leaf + interior),
// overflow-page chains, varints, the serial-type record format, and the
// 100-byte database header (user_version = 11, UTF-8, schema format 4).
//
// Modern Anki (Desktop/AnkiDroid/AnkiMobile) upgrades legacy schema-11
// collections on import and recreates indexes, but we emit the standard
// schema-11 indexes anyway so older/stricter importers stay happy.

const PAGE_SIZE = 4096;
const USABLE = PAGE_SIZE; // reserved-bytes-per-page = 0
const TABLE_LEAF_HEADER = 8;
const INTERIOR_HEADER = 12;
/** Max local payload for a table b-tree leaf cell: U - 35. */
const TABLE_LEAF_X = USABLE - 35;
/** Min local payload: ((U-12)*32/255)-23 = 489 for 4096-byte pages. */
const MIN_LOCAL = Math.floor(((USABLE - 12) * 32) / 255) - 23;
/** Max local payload for index cells: ((U-12)*64/255)-23 = 1002. */
const INDEX_X = Math.floor(((USABLE - 12) * 64) / 255) - 23;

type CellValue = number | string | Uint8Array | null;

function encodeVarint(value: number): number[] {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Cannot encode varint: ${value}`);
  }
  if (value === 0) return [0];
  const groups: number[] = [];
  let x = value;
  while (x > 0) {
    groups.push(x % 128);
    x = Math.floor(x / 128);
  }
  const out: number[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    out.push(i === 0 ? groups[i] : groups[i] | 0x80);
  }
  return out;
}

function intSerialSize(value: number): number {
  if (value >= -128 && value <= 127) return 1;
  if (value >= -32768 && value <= 32767) return 2;
  if (value >= -8388608 && value <= 8388607) return 3;
  if (value >= -2147483648 && value <= 2147483647) return 4;
  if (value >= -140737488355328 && value <= 140737488355327) return 6;
  return 8;
}

function encodeIntBE(value: number, size: number): number[] {
  let v = value < 0 ? value + Math.pow(2, 8 * size) : value;
  const out = new Array<number>(size).fill(0);
  for (let i = size - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function float64Bytes(value: number): number[] {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, false);
  return Array.from(new Uint8Array(buf));
}

/** Encodes values into SQLite's serial-type record format (header + body). */
export function encodeRecord(values: CellValue[]): number[] {
  const types: number[] = [];
  const bodies: number[][] = [];
  for (const value of values) {
    if (value === null) {
      types.push(0);
      bodies.push([]);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        const size = intSerialSize(value);
        // Serial types: 1→1-byte, 2→2-byte, 3→3-byte, 4→4-byte, 5→6-byte, 6→8-byte ints.
        const serialBySize: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 6: 5, 8: 6 };
        types.push(serialBySize[size]);
        bodies.push(encodeIntBE(value, size));
      } else {
        types.push(7);
        bodies.push(float64Bytes(value));
      }
    } else if (typeof value === 'string') {
      const bytes = utf8Bytes(value);
      types.push(13 + 2 * bytes.length);
      bodies.push(bytes);
    } else {
      types.push(12 + 2 * value.length);
      bodies.push(Array.from(value));
    }
  }
  let headerLen = 1; // optimistic: single-byte size varint
  const typeVarints = types.map((t) => encodeVarint(t));
  // The header size varint includes its own length : iterate to a fixpoint.
  for (let pass = 0; pass < 4; pass++) {
    const total = headerLen + typeVarints.reduce((sum, v) => sum + v.length, 0);
    const newLen = encodeVarint(total).length;
    if (newLen === headerLen) break;
    headerLen = newLen;
  }
  const headerTotal = headerLen + typeVarints.reduce((sum, v) => sum + v.length, 0);
  const header = [...encodeVarint(headerTotal), ...typeVarints.flat()];
  if (header.length !== headerTotal) throw new Error('Record header size mismatch');
  return [...header, ...bodies.flat()];
}

/** Allocates pages and writes b-tree nodes into them. */
class SqliteFile {
  private pages: number[][] = [];

  constructor() {
    this.pages.push(new Array<number>(PAGE_SIZE).fill(0)); // page 1: sqlite_master root
  }

  /** Adds a zeroed page and returns its 1-based page number. */
  allocPage(): number {
    this.pages.push(new Array<number>(PAGE_SIZE).fill(0));
    return this.pages.length;
  }

  page(pageNo: number): number[] {
    return this.pages[pageNo - 1];
  }

  get pageCount(): number {
    return this.pages.length;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.pages.length * PAGE_SIZE);
    this.pages.forEach((page, i) => out.set(page, i * PAGE_SIZE));
    return out;
  }
}

/**
 * Writes a payload into a cell, spilling to an overflow-page chain when it
 * exceeds the local-payload limit. Returns the local bytes and the first
 * overflow page number (0 if none).
 */
function writePayloadWithOverflow(
  file: SqliteFile,
  payload: number[],
  maxLocal: number,
  minLocal: number
): { local: number[]; overflowPage: number } {
  if (payload.length <= maxLocal) {
    return { local: payload, overflowPage: 0 };
  }
  const surplus = minLocal + ((payload.length - minLocal) % (USABLE - 4));
  const localLen = surplus <= maxLocal ? surplus : minLocal;
  const local = payload.slice(0, localLen);
  let remaining = payload.slice(localLen);

  let firstPage = 0;
  let prevPage = 0;
  while (remaining.length > 0) {
    const pageNo = file.allocPage();
    if (prevPage === 0) firstPage = pageNo;
    else {
      const prev = file.page(prevPage);
      prev[0] = (pageNo >>> 24) & 0xff;
      prev[1] = (pageNo >>> 16) & 0xff;
      prev[2] = (pageNo >>> 8) & 0xff;
      prev[3] = pageNo & 0xff;
    }
    prevPage = pageNo;
    const page = file.page(pageNo);
    const chunk = remaining.slice(0, USABLE - 4);
    for (let i = 0; i < chunk.length; i++) page[4 + i] = chunk[i];
    remaining = remaining.slice(chunk.length);
    if (remaining.length === 0) {
      // next-pointer stays zero: end of chain
    }
  }
  return { local, overflowPage: firstPage };
}

function writeCellIntoPage(page: number[], contentEnd: number, cell: number[]): number {
  const start = contentEnd - cell.length;
  for (let i = 0; i < cell.length; i++) page[start + i] = cell[i];
  return start;
}

function setBE32(page: number[], offset: number, value: number): void {
  page[offset] = (value >>> 24) & 0xff;
  page[offset + 1] = (value >>> 16) & 0xff;
  page[offset + 2] = (value >>> 8) & 0xff;
  page[offset + 3] = value & 0xff;
}

function setBE16(page: number[], offset: number, value: number): void {
  page[offset] = (value >>> 8) & 0xff;
  page[offset + 1] = value & 0xff;
}

interface LeafWrite {
  pageNo: number;
  maxRowid: number;
}

function writeLeafPage(
  file: SqliteFile,
  cells: { bytes: number[]; rowid: number }[],
  pageType: number,
  headerSize: number,
  pageNo?: number
): LeafWrite {
  const num = pageNo ?? file.allocPage();
  const page = file.page(num);
  // Page 1 hosts the 100-byte database header at its start; the b-tree page
  // header therefore begins at offset 100. Cell content always packs from the
  // physical end of the page; cell pointers are absolute offsets.
  const hdr = num === 1 ? 100 : 0;
  page[hdr] = pageType;
  setBE16(page, hdr + 1, 0); // first freeblock
  setBE16(page, hdr + 3, cells.length);
  page[hdr + 7] = 0; // fragmented free bytes
  let contentEnd = PAGE_SIZE;
  cells.forEach((cell, idx) => {
    contentEnd = writeCellIntoPage(page, contentEnd, cell.bytes);
    setBE16(page, hdr + headerSize + idx * 2, contentEnd);
  });
  const contentStart = contentEnd;
  const minStart = hdr + headerSize + cells.length * 2;
  if (contentStart < minStart) {
    throw new Error('Cell content overflows page start');
  }
  // SQLite represents a content offset of 65536 as zero; for empty pages it
  // simply stores the page size (content inserts would begin at the end).
  setBE16(page, hdr + 5, contentStart === 65536 ? 0 : contentStart);
  return { pageNo: num, maxRowid: cells.length ? cells[cells.length - 1].rowid : 0 };
}

/**
 * Builds an index b-tree from entries (records already in ascending key
 * order). Interior cells hold (left-child, separator-record) where the
 * separator is the first key of the right sibling; the right-most pointer
 * references the last leaf.
 */
function buildIndexBtree(file: SqliteFile, entries: number[][]): number {
  const allCells = entries.map((payload) => {
    const { local, overflowPage } = writePayloadWithOverflow(file, payload, INDEX_X, MIN_LOCAL);
    const bytes = [...encodeVarint(payload.length), ...local];
    if (overflowPage !== 0) bytes.push(...encodeIntBE(overflowPage, 4));
    return bytes;
  });

  const writeIndexLeaf = (cells: number[][], pageNo?: number): number => {
    const num = pageNo ?? file.allocPage();
    const page = file.page(num);
    page[0] = 0x0a;
    setBE16(page, 1, 0);
    setBE16(page, 3, cells.length);
    page[7] = 0;
    let contentEnd = PAGE_SIZE;
    cells.forEach((cell, idx) => {
      contentEnd = writeCellIntoPage(page, contentEnd, cell);
      setBE16(page, 8 + idx * 2, contentEnd);
    });
    setBE16(page, 5, contentStartSafe(contentEnd));
    return num;
  };

  if (allCells.length === 0) return writeIndexLeaf([]);

  // Pack index leaf pages greedily.
  const leafPages: { pageNo: number; firstEntry: number }[] = [];
  let bucket: number[][] = [];
  let used = 0;
  let firstEntryIdx = 0;
  const flushLeaf = () => {
    if (bucket.length === 0) return;
    const pageNo = writeIndexLeaf(bucket);
    leafPages.push({ pageNo, firstEntry: firstEntryIdx });
    bucket = [];
    used = 0;
  };
  allCells.forEach((cell, idx) => {
    if (bucket.length === 0) firstEntryIdx = idx;
    const cost = cell.length + 2;
    if (bucket.length > 0 && used + cost > USABLE - 8) flushLeaf();
    if (bucket.length === 0) firstEntryIdx = idx;
    bucket.push(cell);
    used += cost;
  });
  flushLeaf();

  const writeIndexInterior = (cells: { bytes: number[] }[], rightmost: number): number => {
    const num = file.allocPage();
    const page = file.page(num);
    page[0] = 0x02;
    setBE16(page, 1, 0);
    setBE16(page, 3, cells.length);
    page[7] = 0;
    setBE32(page, 8, rightmost);
    let contentEnd = PAGE_SIZE;
    cells.forEach((cell, idx) => {
      contentEnd = writeCellIntoPage(page, contentEnd, cell.bytes);
      setBE16(page, INTERIOR_HEADER + idx * 2, contentEnd);
    });
    setBE16(page, 5, contentStartSafe(contentEnd));
    return num;
  };

  // Build interior levels; separators are the first key of the right sibling.
  let nodes: { pageNo: number; firstPayload: number[] | null }[] = leafPages.map((lp, i) => ({
    pageNo: lp.pageNo,
    firstPayload: i + 1 < leafPages.length ? allCells[leafPages[i + 1].firstEntry] : null,
  }));
  while (nodes.length > 1) {
    const next: { pageNo: number; firstPayload: number[] | null }[] = [];
    let cells: { bytes: number[] }[] = [];
    let used = 0;
    const flushInterior = (rightmost: { pageNo: number }) => {
      const num = writeIndexInterior(cells, rightmost.pageNo);
      next.push({ pageNo: num, firstPayload: null });
      cells = [];
      used = 0;
    };
    nodes.forEach((node, idx) => {
      const isLast = idx === nodes.length - 1;
      if (isLast) {
        flushInterior(node);
        return;
      }
      const separator = node.firstPayload ?? [];
      const cellBytes = [...encodeIntBE(node.pageNo, 4), ...separator];
      const cost = cellBytes.length + 2;
      if (cells.length > 0 && used + cost > USABLE - INTERIOR_HEADER) {
        flushInterior(node);
        return;
      }
      cells.push({ bytes: cellBytes });
      used += cost;
    });
    next[0].firstPayload = nodes[0].firstPayload;
    nodes = next;
  }
  return nodes[0].pageNo;
}
function buildTableBtree(
  file: SqliteFile,
  rows: { rowid: number; values: CellValue[] }[]
): number {
  // 1. Serialize cells (allocating overflow pages as needed).
  const allCells = rows.map((row) => {
    const payload = encodeRecord(row.values);
    const { local, overflowPage } = writePayloadWithOverflow(file, payload, TABLE_LEAF_X, MIN_LOCAL);
    const bytes = [
      ...encodeVarint(payload.length),
      ...encodeVarint(row.rowid),
      ...local,
    ];
    if (overflowPage !== 0) bytes.push(...encodeIntBE(overflowPage, 4));
    return { bytes, rowid: row.rowid };
  });

  // 2. Pack cells into leaf pages (0x0D) greedily.
  const leaves: LeafWrite[] = [];
  let bucket: { bytes: number[]; rowid: number }[] = [];
  let used = 0;
  const flush = () => {
    if (bucket.length === 0) return;
    leaves.push(writeLeafPage(file, bucket, 0x0d, TABLE_LEAF_HEADER));
    bucket = [];
    used = 0;
  };
  for (const cell of allCells) {
    const cost = cell.bytes.length + 2;
    if (bucket.length > 0 && used + cost > USABLE - TABLE_LEAF_HEADER) flush();
    bucket.push(cell);
    used += cost;
  }
  flush();
  if (leaves.length === 0) {
    // Empty table still needs a root leaf page.
    return writeLeafPage(file, [], 0x0d, TABLE_LEAF_HEADER).pageNo;
  }

  // 3. Build interior levels (0x05).
  let level = leaves;
  while (level.length > 1) {
    const interiors: LeafWrite[] = [];
    let childCells: { bytes: number[]; rowid: number }[] = [];
    let used = 0;
    const flushInterior = (rightmost: number) => {
      const num = file.allocPage();
      const page = file.page(num);
      page[0] = 0x05;
      setBE16(page, 1, 0);
      setBE16(page, 3, childCells.length);
      page[7] = 0;
      setBE32(page, 8, rightmost);
      let contentEnd = PAGE_SIZE;
      childCells.forEach((cell, idx) => {
        contentEnd = writeCellIntoPage(page, contentEnd, cell.bytes);
        setBE16(page, INTERIOR_HEADER + idx * 2, contentEnd);
      });
      setBE16(page, 5, contentStartSafe(contentEnd));
      interiors.push({ pageNo: num, maxRowid: 0 });
      childCells = [];
      used = 0;
    };
    level.forEach((leaf, idx) => {
      const isLast = idx === level.length - 1;
      if (isLast) {
        flushInterior(leaf.pageNo);
        return;
      }
      const cellBytes = [...encodeIntBE(leaf.pageNo, 4), ...encodeVarint(leaf.maxRowid)];
      const cost = cellBytes.length + 2;
      if (childCells.length > 0 && used + cost > USABLE - INTERIOR_HEADER) {
        flushInterior(leaf.pageNo);
        return;
      }
      childCells.push({ bytes: cellBytes, rowid: leaf.maxRowid });
      used += cost;
    });
    level = interiors;
  }
  return level[0].pageNo;
}

function contentStartSafe(contentEnd: number): number {
  return contentEnd === 65536 ? 0 : contentEnd;
}


// ─── Anki Schema 11 Assembly ─────────────────────────────────────────────────

export interface AnkiNoteRow {
  guid: string;
  mid: number;
  /** Space-separated tag string. */
  tags: string;
  /** Field values; the writer joins them with \x1f. */
  flds: string[];
  /** Sort field (typically the first field's plain text). */
  sfld: string;
}

export interface AnkiCardRow {
  nid: number;
  did: number;
  ord: number;
  /** New-card due position (usually the note id). */
  due: number;
}

export interface AnkiCollectionSpec {
  /** JSON string for col.conf */
  conf: string;
  /** JSON string for col.models */
  models: string;
  /** JSON string for col.decks */
  decks: string;
  /** JSON string for col.dconf */
  dconf: string;
  notes: AnkiNoteRow[];
  cards: AnkiCardRow[];
  /** Millisecond timestamp basis for note/card ids (default: now). */
  modMs?: number;
}

/** Anki's guid alphabet (base-91 style, per legacy Anki). */
const GUID_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~';

export function generateAnkiGuid(rand: () => number = Math.random): string {
  let guid = '';
  for (let i = 0; i < 10; i++) {
    guid += GUID_CHARSET[Math.floor(rand() * GUID_CHARSET.length) % GUID_CHARSET.length];
  }
  return guid;
}

/** Compact synchronous SHA-1 (needed for Anki's note csum column). */
export function sha1Hex(input: string): string {
  const msg = new TextEncoder().encode(input);
  const ml = msg.length;
  const withPadding = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPadding.set(msg);
  withPadding[ml] = 0x80;
  const bitLen = ml * 8;
  const dv = new DataView(withPadding.buffer);
  dv.setUint32(withPadding.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(withPadding.length - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  const rotr = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

  for (let block = 0; block < withPadding.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(block + i * 4, false);
    for (let i = 16; i < 80; i++) w[i] = rotr(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotr(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotr(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

const SCHEMA_11_DDL: { type: 'table' | 'index'; name: string; tbl: string; sql: string }[] = [
  {
    type: 'table',
    name: 'col',
    tbl: 'col',
    sql: 'CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null)',
  },
  {
    type: 'table',
    name: 'notes',
    tbl: 'notes',
    sql: 'CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null)',
  },
  {
    type: 'table',
    name: 'cards',
    tbl: 'cards',
    sql: 'CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null)',
  },
  {
    type: 'table',
    name: 'revlog',
    tbl: 'revlog',
    sql: 'CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null)',
  },
  {
    type: 'table',
    name: 'graves',
    tbl: 'graves',
    sql: 'CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null)',
  },
  { type: 'index', name: 'ix_notes_usn', tbl: 'notes', sql: 'CREATE INDEX ix_notes_usn on notes (usn)' },
  { type: 'index', name: 'ix_cards_usn', tbl: 'cards', sql: 'CREATE INDEX ix_cards_usn on cards (usn)' },
  { type: 'index', name: 'ix_revlog_usn', tbl: 'revlog', sql: 'CREATE INDEX ix_revlog_usn on revlog (usn)' },
  {
    type: 'index',
    name: 'ix_cards_sched',
    tbl: 'cards',
    sql: 'CREATE INDEX ix_cards_sched on cards (did, queue, due)',
  },
  { type: 'index', name: 'ix_cards_nid', tbl: 'cards', sql: 'CREATE INDEX ix_cards_nid on cards (nid)' },
  { type: 'index', name: 'ix_revlog_cid', tbl: 'revlog', sql: 'CREATE INDEX ix_revlog_cid on revlog (cid)' },
  { type: 'index', name: 'ix_notes_csum', tbl: 'notes', sql: 'CREATE INDEX ix_notes_csum on notes (csum)' },
];

/**
 * Builds a complete Anki legacy `collection.anki2` SQLite database
 * (schema version 11) from the given spec.
 */
export function buildAnkiCollectionSqlite(spec: AnkiCollectionSpec): Uint8Array {
  const modMs = spec.modMs ?? Date.now();
  const file = new SqliteFile(); // page 1 reserved for sqlite_master

  // 1. Notes (rowids must ascend; ids are ms timestamps).
  const noteRows = spec.notes.map((note, i) => ({
    rowid: modMs + i,
    values: [
      null, // id: rowid alias
      note.guid,
      note.mid,
      Math.floor(modMs / 1000),
      -1, // usn: pending sync
      note.tags,
      note.flds.join('\x1f'),
      note.sfld,
      parseInt(sha1Hex(note.sfld).slice(0, 8), 16),
      0, // flags
      '', // data
    ] as CellValue[],
  }));
  const notesRoot = buildTableBtree(file, noteRows);

  // 2. Cards.
  const cardRows = spec.cards.map((card, i) => ({
    rowid: modMs + 100000 + i,
    values: [
      null, // id
      card.nid,
      card.did,
      card.ord,
      Math.floor(modMs / 1000),
      -1, // usn
      0, // type: new
      0, // queue: new
      card.due,
      0, // ivl
      0, // factor
      0, // reps
      0, // lapses
      0, // left
      0, // odue
      0, // odid
      0, // flags
      '', // data
    ] as CellValue[],
  }));
  const cardsRoot = buildTableBtree(file, cardRows);

  // 3. col (single row, id = 1).
  const colRoot = buildTableBtree(file, [
    {
      rowid: 1,
      values: [
        null, // id
        (Math.floor(modMs / 1000) - 86400) * 1000, // crt: ms epoch day-start
        Math.floor(modMs / 1000), // mod
        modMs, // scm: schema modification time (ms)
        11, // ver: Anki schema version
        0, // dty
        0, // usn
        0, // ls
        spec.conf,
        spec.models,
        spec.decks,
        spec.dconf,
        '{}', // tags cache
      ] as CellValue[],
    },
  ]);

  // 4. Empty tables.
  const revlogRoot = buildTableBtree(file, []);
  const gravesRoot = buildTableBtree(file, []);

  // 5. Indexes (entries must be emitted in ascending key order).
  const indexRoots: Record<string, number> = {};
  indexRoots.ix_notes_usn = buildIndexBtree(
    file,
    noteRows.map((r) => encodeRecord([-1, r.rowid]))
  );
  indexRoots.ix_notes_csum = buildIndexBtree(
    file,
    noteRows
      .map((r) => ({ csum: r.values[8] as number, rowid: r.rowid }))
      .sort((a, b) => a.csum - b.csum)
      .map((r) => encodeRecord([r.csum, r.rowid]))
  );
  indexRoots.ix_cards_usn = buildIndexBtree(
    file,
    cardRows.map((r) => encodeRecord([-1, r.rowid]))
  );
  indexRoots.ix_cards_nid = buildIndexBtree(
    file,
    cardRows
      .map((r) => ({ nid: r.values[1] as number, rowid: r.rowid }))
      .sort((a, b) => a.nid - b.nid)
      .map((r) => encodeRecord([r.nid, r.rowid]))
  );
  indexRoots.ix_cards_sched = buildIndexBtree(
    file,
    cardRows
      .map((r) => ({
        did: r.values[2] as number,
        queue: r.values[7] as number,
        due: r.values[8] as number,
        rowid: r.rowid,
      }))
      .sort((a, b) => a.did - b.did || a.queue - b.queue || a.due - b.due)
      .map((r) => encodeRecord([r.did, r.queue, r.due, r.rowid]))
  );
  indexRoots.ix_revlog_usn = buildIndexBtree(file, []);
  indexRoots.ix_revlog_cid = buildIndexBtree(file, []);

  // 6. sqlite_master on page 1 (all schema rows are small → single leaf).
  const rootByObject: Record<string, number> = {
    col: colRoot,
    notes: notesRoot,
    cards: cardsRoot,
    revlog: revlogRoot,
    graves: gravesRoot,
    ...indexRoots,
  };
  const masterCells = SCHEMA_11_DDL.map((ddl, i) => {
    const payload = encodeRecord([ddl.type, ddl.name, ddl.tbl, rootByObject[ddl.name], ddl.sql]);
    const { local, overflowPage } = writePayloadWithOverflow(file, payload, TABLE_LEAF_X, MIN_LOCAL);
    const bytes = [...encodeVarint(payload.length), ...encodeVarint(i + 1), ...local];
    if (overflowPage !== 0) bytes.push(...encodeIntBE(overflowPage, 4));
    return { bytes, rowid: i + 1 };
  });
  writeLeafPage(file, masterCells, 0x0d, TABLE_LEAF_HEADER, 1);

  // 7. Database header (first 100 bytes of page 1).
  const header = file.page(1);
  const magic = 'SQLite format 3\0';
  for (let i = 0; i < magic.length; i++) header[i] = magic.charCodeAt(i);
  setBE16(header, 16, PAGE_SIZE);
  header[18] = 1; // write version: legacy rollback journal
  header[19] = 1; // read version
  header[20] = 0; // reserved bytes per page
  header[21] = 64; // max payload fraction
  header[22] = 32; // min payload fraction
  header[23] = 32; // leaf payload fraction
  setBE32(header, 24, 1); // file change counter
  setBE32(header, 28, file.pageCount); // database size in pages
  setBE32(header, 32, 0); // first freelist trunk page
  setBE32(header, 36, 0); // freelist page count
  setBE32(header, 40, 1); // schema cookie
  setBE32(header, 44, 4); // schema format number
  setBE32(header, 48, 0); // default page cache size
  setBE32(header, 52, 0); // largest root b-tree page (non-vacuum)
  setBE32(header, 56, 1); // text encoding: UTF-8
  setBE32(header, 60, 11); // user version: Anki schema 11
  setBE32(header, 64, 0); // incremental vacuum
  setBE32(header, 68, 0); // application id
  setBE32(header, 92, 1); // version-valid-for (matches change counter)
  setBE32(header, 96, 3045001); // sqlite version that wrote the file

  return file.toBytes();
}


