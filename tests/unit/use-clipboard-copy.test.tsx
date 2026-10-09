// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useClipboardCopy, type ClipboardCopy } from '@/hooks/useClipboardCopy';
import { COPY_FAILED_MESSAGE } from '@/lib/clipboard';

/**
 * The shared copy *feedback* contract (defect 35).
 *
 * The write is `lib/clipboard`'s; this is about what every control shows, and it
 * is pinned once here rather than eight times in the sheets, because the three
 * behaviours the defect found were three ways of getting the same two things
 * wrong: showing success for a write that never landed, and letting the
 * confirmation outlive (or collide with) the click it describes.
 */

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === null ? undefined : { writeText },
    configurable: true,
  });
}

function stubExecCommand(fn: unknown) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true });
}

/** A clipboard that accepts writes and records what it was given. */
function acceptingClipboard() {
  const written: string[] = [];
  stubClipboard((text: string) => {
    written.push(text);
    return Promise.resolve();
  });
  return written;
}

/** A browser with no usable clipboard at all. */
function refusingBrowser() {
  stubClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
  stubExecCommand(() => false);
}

// React reports a caught render error through console.error; nothing here should
// produce one, so any noise is silenced rather than treated as expected output.
const consoleError = console.error;

let container: HTMLDivElement;
let root: Root;
let latest!: ClipboardCopy;

/** A harness that keeps the newest hook value reachable outside React. */
function Harness({ resetMs }: { resetMs?: number }) {
  const copy = useClipboardCopy(resetMs);
  // Read back through an effect: writing to an outer variable during render is
  // the side effect the react-hooks rules (correctly) refuse.
  useEffect(() => {
    latest = copy;
  });
  return <p>harness</p>;
}

beforeEach(() => {
  console.error = vi.fn();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubClipboard(null);
  stubExecCommand(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  console.error = consoleError;
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else delete (document as { execCommand?: unknown }).execCommand;
});

const mount = async (resetMs?: number) => {
  await act(async () => root.render(<Harness resetMs={resetMs} />));
};

const click = async (text: string, key?: string) => {
  let outcome: Awaited<ReturnType<ClipboardCopy['copy']>> | undefined;
  await act(async () => {
    outcome = await latest.copy(text, key);
  });
  return outcome!;
};

describe('useClipboardCopy', () => {
  it('starts idle and reports nothing', async () => {
    await mount();

    expect(latest.status).toBe('idle');
    expect(latest.copied()).toBe(false);
    expect(latest.failed()).toBe(false);
    expect(latest.message).toBeNull();
  });

  it('reports copied only for a write that landed, and hands over what it sent', async () => {
    const written = acceptingClipboard();
    await mount();

    const outcome = await click('the markdown');

    expect(outcome).toEqual({ ok: true, via: 'clipboard' });
    expect(written).toEqual(['the markdown']);
    expect(latest.status).toBe('copied');
    expect(latest.copied()).toBe(true);
    expect(latest.failed()).toBe(false);
    expect(latest.message).toBeNull();
  });

  it('reports failed with the shared message when the browser refuses, and never rejects', async () => {
    refusingBrowser();
    await mount();

    const outcome = await click('the markdown');

    expect(outcome.ok).toBe(false);
    expect(latest.status).toBe('failed');
    expect(latest.copied()).toBe(false);
    expect(latest.failed()).toBe(true);
    expect(latest.message).toBe(COPY_FAILED_MESSAGE);
  });

  it('keys the confirmation to the control that was copied, not to the sheet', async () => {
    acceptingClipboard();
    await mount();

    await click('first document', 'doc-1');
    expect(latest.copied('doc-1')).toBe(true);
    // The twenty-row case: marking the sheet rather than the row is how the
    // drawer told every row it had been copied.
    expect(latest.copied('doc-2')).toBe(false);

    await click('second document', 'doc-2');
    expect(latest.copied('doc-2')).toBe(true);
    expect(latest.copied('doc-1')).toBe(false);
    expect(latest.key).toBe('doc-2');
  });

  it('keeps the failure attached to the control that failed', async () => {
    refusingBrowser();
    await mount();

    await click('a document', 'doc-9');

    expect(latest.failed('doc-9')).toBe(true);
    expect(latest.failed('doc-1')).toBe(false);
    expect(latest.copied('doc-9')).toBe(false);
  });

  it('resets to idle after the confirmation window', async () => {
    vi.useFakeTimers();
    acceptingClipboard();
    await mount(1000);

    await click('the markdown', 'doc-1');
    expect(latest.copied('doc-1')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(latest.status).toBe('idle');
    expect(latest.copied('doc-1')).toBe(false);
    expect(latest.key).toBeNull();
  });

  it('lets a second click own the confirmation instead of the first timer clearing it', async () => {
    vi.useFakeTimers();
    acceptingClipboard();
    await mount(1000);

    await click('first', 'doc-1');
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    await click('second', 'doc-2');

    // 1100ms after the first click: the first timer would have fired here, and
    // clearing the second copy's confirmation is how a "temporary success state"
    // becomes a flicker.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(latest.status).toBe('copied');
    expect(latest.copied('doc-2')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(latest.status).toBe('idle');
  });

  it('clears the pending reset when the sheet unmounts', async () => {
    vi.useFakeTimers();
    acceptingClipboard();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    await mount(1000);

    await click('the markdown');
    await act(async () => root.unmount());

    expect(clearSpy).toHaveBeenCalled();
    // And nothing is left armed to fire into the unmounted tree.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    clearSpy.mockRestore();
  });

  it('lets a later success replace an earlier failure, and the other way round', async () => {
    refusingBrowser();
    await mount();

    await click('refused');
    expect(latest.failed()).toBe(true);

    acceptingClipboard();
    await click('landed');
    expect(latest.copied()).toBe(true);
    expect(latest.failed()).toBe(false);
    expect(latest.message).toBeNull();
  });
});
