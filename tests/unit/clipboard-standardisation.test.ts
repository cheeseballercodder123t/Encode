import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The standardized clipboard write, enforced at the source (defect 35).
 *
 * The defect was not one broken button, it was eight controls that had each
 * solved the same problem differently - a floating promise, a bare `await`, a
 * swallowed rejection, and one correct ladder. Fixing them one by one is how the
 * drift happened in the first place, so the rules are checked structurally:
 *
 *   1. `lib/clipboard.ts` is the **only** file that touches the clipboard. A new
 *      copy control cannot invent its own call by accident.
 *   2. Every control that copies text goes through `hooks/useClipboardCopy`, so
 *      it inherits the outcome handling instead of restating it.
 *   3. Every control that renders copy state carries `data-copy-status`, which
 *      is what makes a refusal visible in the UI *and* assertable in a browser
 *      test.
 *   4. Every control consults the failure state, not just the success one - the
 *      drawer's `[ OK ]` over an unchanged clipboard is exactly that omission.
 *
 * The behaviour is pinned in `tests/unit/clipboard.test.ts` and
 * `tests/unit/use-clipboard-copy.test.tsx`, and the browser result in
 * `e2e/clipboard-handoff.spec.ts`.
 */

const ROOTS = ['app', 'components', 'hooks', 'lib'];
const EXTENSIONS = ['.ts', '.tsx'];

/** The only place allowed to name the clipboard APIs. */
const CLIPBOARD_OWNER = 'lib/clipboard.ts';

/**
 * A direct write, matched on the call form. Comments in this repo quote the old
 * calls in backticks (`navigator.clipboard.writeText`) so they never match: the
 * parenthesis is the signal.
 */
const DIRECT_WRITE = /(navigator\.clipboard\s*\??\.\s*writeText|document\.execCommand)\s*\(/;

/** The controls that copy: each must use the hook. */
const CONTROLS = [
  'app/page.tsx',
  'components/HistoryDrawer.tsx',
  'components/FlashcardForgeModal.tsx',
  'components/StatelessShareModal.tsx',
  'components/SegregationRemnoteModal.tsx',
  'components/workbench/StudioWorkbench.tsx',
  'components/toy-models/ToyModelLab.tsx',
];

/**
 * The files that render a copy control's state. `CompletedSessionView` is here
 * and not in CONTROLS on purpose: `app/page.tsx` owns the hook and hands the
 * status down as props, so the view renders the mark while the page performs the
 * write.
 */
const STATUS_RENDERERS = [
  'components/HistoryDrawer.tsx',
  'components/FlashcardForgeModal.tsx',
  'components/StatelessShareModal.tsx',
  'components/SegregationRemnoteModal.tsx',
  'components/CompletedSessionView.tsx',
  'components/workbench/StudioWorkbench.tsx',
  'components/toy-models/ToyModelLab.tsx',
];

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

const pathsWhere = (test: (src: string) => boolean) =>
  FILES.filter(({ src }) => test(src))
    .map(({ path }) => path)
    .sort();

const srcOf = (path: string) => FILES.find((file) => file.path === path)?.src ?? '';

describe('one clipboard implementation', () => {
  it('reads the whole source tree', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('lets only lib/clipboard.ts write to the clipboard', () => {
    const offenders = pathsWhere((src) => DIRECT_WRITE.test(src));
    expect(offenders).toEqual([CLIPBOARD_OWNER]);
  });

  it('routes every copy control through the shared hook', () => {
    const using = pathsWhere((src) => src.includes('useClipboardCopy'));
    expect(using).toEqual([...CONTROLS, 'hooks/useClipboardCopy.ts'].sort());
  });

  it('gives every copy surface a data-copy-status, so the state is inspectable', () => {
    const rendering = pathsWhere((src) => src.includes('data-copy-status'));
    expect(rendering).toEqual([...STATUS_RENDERERS].sort());
  });

  it('makes every control read the failure state, not just the success one', () => {
    const blindToFailure = CONTROLS.filter((path) => !srcOf(path).includes('failed('));
    expect(blindToFailure).toEqual([]);
  });

  it('keeps the hook free of clipboard calls, so the order stays write-then-report', () => {
    expect(DIRECT_WRITE.test(srcOf('hooks/useClipboardCopy.ts'))).toBe(false);
  });
});
