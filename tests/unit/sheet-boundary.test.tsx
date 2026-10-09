// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SheetErrorBoundary } from '@/components/SheetErrorBoundary';

/**
 * The contract every secondary sheet relies on (defect 34).
 *
 * A throw inside a sheet has to become a sheet-shaped failure: the fallback
 * names the sheet, dismissing it returns the learner to the session they were
 * in, and the boundary is willing to try again. Only the e2e spec can prove the
 * *app* survives (that is where the mount sites are); what this file pins are the
 * three behaviours the boundary itself owes, plus the one that is easy to get
 * wrong and hard to notice - a closed sheet must not re-open onto the previous
 * crash's fallback.
 */

// React 19 reports a caught error through console.error; the test asserts the
// fallback instead of the log, so the noise is silenced (not swallowed: the
// component's own componentDidCatch still runs).
const consoleError = console.error;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  console.error = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  console.error = consoleError;
});

const fallback = () => container.querySelector('[data-testid="sheet-error-fallback"]');
const text = () => container.textContent ?? '';
const click = async (testid: string) => {
  const el = container.querySelector(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`no ${testid} control in the fallback`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

function Boom({ error }: { error: Error }): React.ReactElement {
  throw error;
}

describe('SheetErrorBoundary', () => {
  it('renders its children untouched while nothing throws', async () => {
    await act(async () => {
      root.render(
        <SheetErrorBoundary name="Settings" open onClose={() => {}}>
          <p>the sheet itself</p>
        </SheetErrorBoundary>
      );
    });

    expect(text()).toContain('the sheet itself');
    expect(fallback()).toBeNull();
  });

  it('contains a throw in its children and names the sheet that failed', async () => {
    await act(async () => {
      root.render(
        <SheetErrorBoundary name="Analytics" open onClose={() => {}}>
          <Boom error={new Error('a null response record reached the render')} />
        </SheetErrorBoundary>
      );
    });

    expect(fallback()).not.toBeNull();
    expect(fallback()!.getAttribute('data-sheet')).toBe('Analytics');
    expect(text()).toContain('The Analytics sheet failed to render.');
    // The message travels with the fallback, so a report from the field is
    // actionable instead of "something went wrong".
    expect(text()).toContain('a null response record reached the render');
    // The session promise is the whole point: it says the work is still there.
    expect(text()).toMatch(/session is untouched/i);
  });

  it('retries the sheet, and shows the fallback again if the throw is still there', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('first render failed');
      return <p>the sheet recovered</p>;
    }

    await act(async () => {
      root.render(
        <SheetErrorBoundary name="Crucible" open onClose={() => {}}>
          <Flaky />
        </SheetErrorBoundary>
      );
    });
    expect(fallback()).not.toBeNull();

    // The condition the learner can actually change: the sheet renders on retry.
    shouldThrow = false;
    await click('sheet-error-retry');
    expect(fallback()).toBeNull();
    expect(text()).toContain('the sheet recovered');

    // And a throw that is still there is still contained, not re-thrown: the
    // sheet re-renders (as it would when the data behind it changes), fails
    // again, and the boundary catches it again.
    shouldThrow = true;
    await act(async () => {
      root.render(
        <SheetErrorBoundary name="Crucible" open onClose={() => {}}>
          <Flaky />
        </SheetErrorBoundary>
      );
    });
    expect(fallback()).not.toBeNull();
  });

  it('closes the sheet it stands in for, and re-opening shows the sheet, not the previous crash', async () => {
    // A parent owns `open`, exactly as the mount sites in `app/page.tsx` do, so
    // the test drives the real contract rather than a no-op closer.
    let shouldThrow = true;
    // The setter is reached through a ref filled in an effect, not by assigning
    // to an outer variable during render: a render-time write to something
    // outside the component is the side effect this boundary exists to contain.
    const setOpen: { current: ((open: boolean) => void) | null } = { current: null };
    let closes = 0;

    function Sheet() {
      if (shouldThrow) throw new Error('drawer failed');
      return <p>a healthy drawer</p>;
    }
    function Harness() {
      const [open, setOpenState] = useState(true);
      useEffect(() => {
        setOpen.current = setOpenState;
      }, []);
      return (
        <SheetErrorBoundary
          name="Saved schemas"
          open={open}
          onClose={() => {
            closes++;
            setOpenState(false);
          }}
        >
          {open ? <Sheet /> : null}
        </SheetErrorBoundary>
      );
    }

    await act(async () => root.render(<Harness />));
    expect(fallback()).not.toBeNull();

    await click('sheet-error-close');
    expect(closes).toBe(1);
    // The parent closed the sheet, so the fallback goes with it and the session
    // behind it is what is on screen again.
    expect(fallback()).toBeNull();

    // Re-opening must show the sheet, not the previous crash's fallback: the
    // error state cannot outlive the close that was meant to clear it.
    shouldThrow = false;
    await act(async () => setOpen.current!(true));
    expect(fallback()).toBeNull();
    expect(text()).toContain('a healthy drawer');
  });
});
