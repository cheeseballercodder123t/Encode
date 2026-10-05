import type { SavedSchema, SessionMetacognition } from '../types';

export interface SessionStats {
  totalStages: number;
  answeredStages: number;
  avgConfidence: number;
  avgCheckCount: number;
  successRate: number;
  reflectionsWritten: number;
  templateBreakdown: Record<string, number>;
}

// Memoization caches : a dashboard re-renders far more often than its sessions
// change, so both scopes below compute once and are reused until invalidated.
const statsCache = new Map<string, SessionStats>();

// ─── One accumulator for both scopes ────────────────────────────────────────
// A single session's card and the library-wide header answer the same
// questions. They add up the same raw numbers here and only divide at the end,
// which is what stops "success rate" meaning two different things on two
// screens once someone edits one of the two walks.

interface RawTotals {
  totalStages: number;
  answeredStages: number;
  confTotal: number;
  confCount: number;
  checkTotal: number;
  checkCount: number;
  successes: number;
  scored: number;
  reflectionsWritten: number;
  templateBreakdown: Record<string, number>;
}

function emptyTotals(): RawTotals {
  return {
    totalStages: 0,
    answeredStages: 0,
    confTotal: 0,
    confCount: 0,
    checkTotal: 0,
    checkCount: 0,
    successes: 0,
    scored: 0,
    reflectionsWritten: 0,
    templateBreakdown: {},
  };
}

function accumulate(totals: RawTotals, schema: SavedSchema): void {
  for (const r of Object.values(schema.userResponses || {})) {
    if (r.field1?.trim()) totals.answeredStages++;
    if (r.confidenceScore != null) {
      totals.confTotal += r.confidenceScore || 0;
      totals.confCount++;
    }
    if (r.checkCount) {
      totals.checkTotal += r.checkCount || 0;
      totals.checkCount++;
    }
    if (r.feynmanReview) {
      totals.scored++;
      // The examiner reports a boolean now. Older saved sessions still carry a
      // grade, so it is read as a fallback rather than assumed.
      const review = r.feynmanReview as { secured?: boolean; grade?: string };
      if (review?.secured === true || review?.grade === 'mastered' || review?.grade === 'good') totals.successes++;
    }
    if (r.reflection?.trim()) totals.reflectionsWritten++;
  }

  for (const act of schema.activities || []) {
    totals.totalStages++;
    totals.templateBreakdown[act.templateType] = (totals.templateBreakdown[act.templateType] || 0) + 1;
  }
}

function finalize(totals: RawTotals): SessionStats {
  return {
    totalStages: totals.totalStages,
    answeredStages: totals.answeredStages,
    avgConfidence: totals.confCount ? totals.confTotal / totals.confCount : 0,
    avgCheckCount: totals.checkCount ? totals.checkTotal / totals.checkCount : 0,
    successRate: totals.scored ? totals.successes / totals.scored : 0,
    reflectionsWritten: totals.reflectionsWritten,
    templateBreakdown: totals.templateBreakdown,
  };
}

/**
 * Stats for one recorded workout. Memoized on id+timestamp, so a re-render or a
 * re-open of the analytics sheet never re-walks the session.
 */
export function computeSessionStats(schema: SavedSchema): SessionStats {
  const cacheKey = `${schema.id}_${schema.timestamp}`;
  const cached = statsCache.get(cacheKey);
  if (cached) return cached;
  const totals = emptyTotals();
  accumulate(totals, schema);
  const result = finalize(totals);
  statsCache.set(cacheKey, result);
  return result;
}

// Library scope is memoized against the array identity the dashboard holds, so
// the walk happens once per library change rather than once per render. A
// WeakMap keeps a dropped history from pinning its own stats.
let libraryCache = new WeakMap<SavedSchema[], { signature: string; stats: SessionStats }>();

/** A cheap "has anything changed?" fingerprint for the library array. */
function librarySignature(schemas: SavedSchema[]): string {
  let stages = 0;
  let responses = 0;
  let latest = 0;
  for (const s of schemas) {
    stages += s.activities?.length || 0;
    responses += Object.keys(s.userResponses || {}).length;
    if (s.timestamp > latest) latest = s.timestamp;
  }
  return `${schemas.length}:${stages}:${responses}:${latest}`;
}

/**
 * Stats across every recorded session, in the same vocabulary as a single one.
 * `successRate` stays a fraction (0–1) here; a screen that wants a percentage
 * formats it, so the number is only rounded where it is displayed.
 */
export function computeLibraryStats(schemas: SavedSchema[]): SessionStats {
  const signature = librarySignature(schemas);
  const cached = libraryCache.get(schemas);
  if (cached && cached.signature === signature) return cached.stats;
  const totals = emptyTotals();
  for (const schema of schemas) accumulate(totals, schema);
  const stats = finalize(totals);
  libraryCache.set(schemas, { signature, stats });
  return stats;
}

/**
 * One page of a session log, with the page number clamped into range. Narrowing
 * a search can leave the caller pointing past the end, and a log that renders
 * empty because of that reads as data loss.
 */
export function paginateSessions<T>(items: T[], page: number, perPage: number): { items: T[]; page: number; totalPages: number } {
  const size = Math.max(1, Math.floor(perPage) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return { items: items.slice(start, start + size), page: safePage, totalPages };
}

export function invalidateSessionCache(schemaId?: string): void {
  if (schemaId) {
    for (const key of statsCache.keys()) {
      if (key.startsWith(schemaId)) statsCache.delete(key);
    }
  } else {
    statsCache.clear();
  }
  libraryCache = new WeakMap();
}

export function exportToCSV(schemas: SavedSchema[]): string {
  const rows: string[] = [];
  rows.push(['session_id','timestamp','topic','mode','stage','template','confidence','check_count','mechanism_landed','reflection'].join(','));
  for (const schema of schemas) {
    for (const act of schema.activities || []) {
      const resp = schema.userResponses?.[act.id];
      if (!resp) continue;
      rows.push([
        schema.id,
        schema.timestamp,
        `"${(schema.topicSummary || '').replace(/"/g, '""')}"`,
        schema.mode,
        act.stageNumber,
        act.templateType,
        resp.confidenceScore ?? '',
        resp.checkCount ?? 0,
        resp.feynmanReview?.secured === true ? 'yes' : resp.feynmanReview ? 'open' : '',
        `"${(resp.reflection || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
  }
  return rows.join('\n');
}

export function exportToJSON(schemas: SavedSchema[]): string {
  return JSON.stringify(schemas.map(s => ({
    id: s.id,
    timestamp: s.timestamp,
    topic: s.topicSummary,
    mode: s.mode,
    xpEarned: s.xpEarned,
    stages: (s.activities || []).map(act => ({
      stage: act.stageNumber,
      title: act.title,
      template: act.templateType,
      response: s.userResponses?.[act.id] || null,
    })),
  })), null, 2);
}

export function downloadFile(content: string, filename: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
