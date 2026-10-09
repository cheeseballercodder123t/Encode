import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Coverage for defect 34, enforced at the source.
 *
 * The failure it closes was not one sheet's bug, it was a missing rule: twenty
 * sheets were mounted directly in `app/page.tsx`, so a throw in any of them took
 * the entire segment with it (the analytics sheet did exactly that in defect 33).
 * A boundary on nineteen of them would still be a hole, and a new sheet added
 * next month would reopen it silently - so the rule is checked structurally
 * rather than remembered:
 *
 *   1. Every sheet mount in `app/page.tsx` (`*Modal`, `*Drawer`,
 *      `AnalyticsDashboard`) sits INSIDE a `SheetErrorBoundary`.
 *   2. Boundaries are always used with children, never self-closed - a
 *      self-closed boundary wraps nothing and would satisfy a naive count.
 *
 * The boundary's behaviour is pinned in `tests/unit/sheet-boundary.test.tsx`,
 * and the app-level result - the session and the other sheets staying usable
 * behind a failed one - in `e2e/sheet-error-boundary.spec.ts`.
 */

const SOURCE = 'app/page.tsx';
const src = readFileSync(SOURCE, 'utf8');

/** JSX tags that are sheets: everything this file mounts as an overlay. */
const SHEET_TAG = /<(?:[A-Z][A-Za-z0-9]*(?:Modal|Drawer)|AnalyticsDashboard)\b/g;

/** Boundary depth at every index of the source, counting only JSX tags. */
function boundaryDepth(source: string): number[] {
  const depth: number[] = new Array(source.length).fill(0);
  let current = 0;
  // Openings first, but a closing tag also matches the opening prefix, so both
  // are found in one pass and classified by length. No self-closed boundaries
  // are used (asserted below), so every tag changes the depth by exactly one.
  const tag = /<\/?SheetErrorBoundary\b[^>]*>/g;
  let match = tag.exec(source);
  const events: { at: number; delta: number }[] = [];
  while (match) {
    events.push({ at: match.index, delta: match[0].startsWith('</') ? -1 : 1 });
    match = tag.exec(source);
  }
  const sheetPositions = new Set<number>();
  let sheet = SHEET_TAG.exec(source);
  while (sheet) {
    sheetPositions.add(sheet.index);
    sheet = SHEET_TAG.exec(source);
  }
  for (let i = 0; i < source.length; i++) {
    while (events.length && events[0].at === i) {
      current += events.shift()!.delta;
    }
    depth[i] = current;
  }
  return depth;
}

describe('every sheet is behind an error boundary', () => {
  it('reads the mount file', () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain('<SheetErrorBoundary');
  });

  it('wraps every sheet it mounts', () => {
    const depth = boundaryDepth(src);
    const offenders: string[] = [];
    let sheet = SHEET_TAG.exec(src);
    while (sheet) {
      if (depth[sheet.index] <= 0) {
        const line = src.slice(0, sheet.index).split('\n').length;
        offenders.push(`${SOURCE}:${line} mounts ${sheet[0]} outside any SheetErrorBoundary`);
      }
      sheet = SHEET_TAG.exec(src);
    }
    expect(offenders).toEqual([]);
  });

  it('found the sheets at all, so the check cannot pass vacuously', () => {
    const mounts = src.match(SHEET_TAG) ?? [];
    // The twenty sheets finding 34 counted (the hand-rolled export-choice
    // overlay has its own regression check below).
    expect(mounts.length).toBeGreaterThanOrEqual(20);
  });

  it('never self-closes a boundary, which would wrap nothing', () => {
    expect(src.match(/<SheetErrorBoundary\b[^>]*\/>/g) ?? []).toEqual([]);
  });

  it('puts the hand-rolled export-choice overlay behind one too', () => {
    const depth = boundaryDepth(src);
    const marker = src.indexOf('[ SEGREGATION COMPLETE ]');
    expect(marker).toBeGreaterThan(-1);
    expect(depth[marker]).toBeGreaterThan(0);
  });
});
