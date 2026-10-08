import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The XP pip's timer, enforced at the source.
 *
 * `addXP` flashed a gain for 1.8s by calling the state setter from an uncaptured
 * `setTimeout`. Nothing held the handle, so nothing could clear it, which cost
 * two things:
 *
 *   1. Two awards inside the same 1.8s window left two live timers. The first
 *      one fired first and nulled the animation the SECOND award had just
 *      started — the more XP you earned, the more likely the pip was cut short.
 *   2. The timer outlived the workbench. Unmounting (or a reset) mid-animation
 *      left it to set state on a tree that was already gone.
 *
 * A hook cannot be rendered in this suite (there is no @testing-library/react),
 * so the invariant is pinned at the source the way `modal-a11y.test.ts` pins the
 * sheet contract. The behaviour itself is visible in the workbench; what these
 * assertions stop is the handle being dropped again.
 */

// Resolved from the project root, exactly as modal-a11y.test.ts walks its ROOTS.
const SESSION_SRC = readFileSync('hooks/useSession.ts', 'utf8');

/** The `addXP` callback's own source, from its declaration to its closing `}, []);`. */
function addXPBlock(source: string): string {
  const start = source.indexOf('const addXP = useCallback(');
  if (start < 0) return '';
  const end = source.indexOf('}, []);', start);
  return end < 0 ? source.slice(start) : source.slice(start, end + '}, []);'.length);
}

describe('XP animation timer', () => {
  it('has an addXP callback to inspect at all', () => {
    // Guards the rest: a rename would otherwise leave every assertion below
    // passing against an empty string.
    expect(addXPBlock(SESSION_SRC)).not.toBe('');
    expect(SESSION_SRC).toContain('setXpGainAnimation');
  });

  it('keeps the timeout handle in a ref instead of discarding it', () => {
    expect(SESSION_SRC).toMatch(/useRef<ReturnType<typeof setTimeout>\s*\|\s*null>\(null\)/);
    // The result of setTimeout must be ASSIGNED, not called bare, or there is
    // nothing to clear.
    expect(addXPBlock(SESSION_SRC)).toMatch(/=\s*setTimeout\(/);
  });

  it('clears a pending timer before scheduling the next one', () => {
    const block = addXPBlock(SESSION_SRC);
    const clearAt = block.indexOf('clearTimeout(');
    const setAt = block.indexOf('setTimeout(');
    expect(clearAt).toBeGreaterThanOrEqual(0);
    expect(setAt).toBeGreaterThanOrEqual(0);
    // Order is the whole point: clearing after scheduling would cancel the timer
    // that was just started.
    expect(clearAt).toBeLessThan(setAt);
  });

  it('no longer schedules the reset on an uncaptured timer', () => {
    expect(SESSION_SRC).not.toContain('setTimeout(() => setXpGainAnimation(null), 1800);');
  });

  it('clears the timer when the hook unmounts', () => {
    const cleanupAt = SESSION_SRC.indexOf('() => () => {');
    expect(cleanupAt).toBeGreaterThanOrEqual(0);
    expect(SESSION_SRC.slice(cleanupAt, cleanupAt + 300)).toContain('clearTimeout');
  });
});
