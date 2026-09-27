import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The behaviour every sheet in this app owes the person using it, enforced at
 * the source.
 *
 * `hooks/useModalA11y` owns it: Escape closes the top sheet, the page behind
 * stops scrolling, focus moves into the sheet and returns where it was. Twenty
 * overlays each drew their own scrim and only one of them could be closed with
 * a key, so the rules below are what stops that from drifting apart again:
 *
 *   1. Anything that paints a full-screen overlay asks the shared hook.
 *   2. It asks before its `if (!isOpen) return null` early return. A hook call
 *      on the far side of that line is a conditional hook call, and a modal
 *      that skips it while closed is a modal whose hook order changes.
 *
 * The behaviour itself is pinned in `e2e/modal-a11y.spec.ts`.
 */

const ROOTS = ['components', 'app', 'hooks'];
const EXTENSIONS = ['.ts', '.tsx'];

function sources(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === '_generated') continue;
        walk(path);
      } else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) {
        found.push(path);
      }
    }
  };
  ROOTS.forEach((root) => {
    try {
      walk(root);
    } catch {
      // A missing root is not a failure: hooks/ did not always exist.
    }
  });
  return found;
}

const FILES = sources().map((path) => ({ path, src: readFileSync(path, 'utf8') }));

describe('modal accessibility', () => {
  it('reads the whole source tree', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('gives every overlay the shared Escape and focus behaviour', () => {
    const offenders = FILES.filter(
      ({ path, src }) => src.includes('fixed inset-0') && !src.includes('useModalA11y')
    ).map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('asks for it before the early return, never after', () => {
    const offenders: string[] = [];
    FILES.forEach(({ path, src }) => {
      // The hook's own module documents this rule in prose, so the phrase it
      // warns about appears there by design.
      if (src.includes('export function useModalA11y')) return;
      const call = src.indexOf('useModalA11y(');
      if (call < 0) return;
      const earlyReturn = src.indexOf('if (!isOpen) return null');
      if (earlyReturn >= 0 && earlyReturn < call) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });
});
