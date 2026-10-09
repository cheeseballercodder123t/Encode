// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  COPY_EMPTY_MESSAGE,
  COPY_FAILED_MESSAGE,
} from '@/lib/clipboard';

/**
 * The clipboard write itself (defect 35).
 *
 * Every assertion here is about one property: the function tells the caller
 * whether the text landed, and it never throws. The three behaviours it replaced
 * all failed that in a different way - a floating promise (no report at all), a
 * bare `await` (a rejection that became an unhandled one), and a swallowed
 * rejection (a report of success over an unchanged clipboard) - so the refusal
 * shapes below are the point of the file, not an afterthought.
 */

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');

/** Installs a fake `navigator.clipboard`; `null` means "this browser has none". */
function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === null ? undefined : { writeText },
    configurable: true,
  });
}

/** Installs (or removes) the legacy selection path. */
function stubExecCommand(fn: unknown) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true });
}

const refusingWriteText = () =>
  Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'));

beforeEach(() => {
  stubClipboard(null);
  stubExecCommand(undefined);
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand);
  else delete (document as { execCommand?: unknown }).execCommand;
});

describe('copyTextToClipboard', () => {
  it('writes through the async Clipboard API and names the path it used', async () => {
    const writeText = vi.fn();
    stubClipboard(writeText);
    stubExecCommand(() => {
      throw new Error('the selection path must not be reached when the write lands');
    });

    const outcome = await copyTextToClipboard('the markdown');

    expect(outcome).toEqual({ ok: true, via: 'clipboard' });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('the markdown');
  });

  it('falls back to the selection path when the write is refused, rather than giving up', async () => {
    // NotAllowedError is the ordinary refusal: the document was not focused, or
    // the user denied permission. The selection path still works in exactly
    // that situation, so a refusal must not be reported as a failed copy.
    stubClipboard(() => refusingWriteText());
    const execCommand = vi.fn(() => true);
    stubExecCommand(execCommand);

    const outcome = await copyTextToClipboard('the markdown');

    expect(outcome).toEqual({ ok: true, via: 'execCommand' });
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports a blocked write when both paths refuse, and resolves instead of throwing', async () => {
    stubClipboard(() => refusingWriteText());
    stubExecCommand(() => false);

    const outcome = await copyTextToClipboard('the markdown');

    expect(outcome).toEqual({ ok: false, reason: 'blocked', message: COPY_FAILED_MESSAGE });
  });

  it('treats a missing clipboard as unavailable, not as an exception', async () => {
    // A non-secure origin has no `navigator.clipboard` at all. The handler this
    // replaced called `writeText` straight off it, which threw a TypeError
    // before any state was set - the click looked dead.
    stubClipboard(null);
    stubExecCommand(() => true);

    expect(await copyTextToClipboard('the markdown')).toEqual({ ok: true, via: 'execCommand' });

    stubExecCommand(() => false);
    expect(await copyTextToClipboard('the markdown')).toEqual({
      ok: false,
      reason: 'unavailable',
      message: COPY_FAILED_MESSAGE,
    });
  });

  it('survives a provider that throws synchronously instead of rejecting', async () => {
    stubClipboard(() => {
      throw new Error('writeText threw on the spot');
    });
    stubExecCommand(() => false);

    const outcome = await copyTextToClipboard('the markdown');

    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({ reason: 'blocked' });
  });

  it('refuses an empty payload before touching either path, and without the failure scare', async () => {
    const writeText = vi.fn();
    stubClipboard(writeText);
    const execCommand = vi.fn(() => true);
    stubExecCommand(execCommand);

    const outcome = await copyTextToClipboard('');

    expect(outcome).toEqual({ ok: false, reason: 'empty', message: COPY_EMPTY_MESSAGE });
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('leaves no stray textarea behind, whether the selection path lands or not', async () => {
    stubClipboard(null);

    stubExecCommand(() => true);
    await copyTextToClipboard('landed');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);

    stubExecCommand(() => false);
    await copyTextToClipboard('refused');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('never rejects, whatever the browser does', async () => {
    // `await` the refusals directly: an unhandled rejection anywhere in these
    // paths would be reported by the test runner rather than asserted, which is
    // exactly the failure shape defect 35 was about.
    stubClipboard(() => refusingWriteText());
    stubExecCommand(() => false);
    await expect(copyTextToClipboard('a')).resolves.toMatchObject({ ok: false });

    stubClipboard(null);
    await expect(copyTextToClipboard('b')).resolves.toMatchObject({ ok: false });

    stubExecCommand(() => {
      throw new Error('execCommand exploded');
    });
    await expect(copyTextToClipboard('c')).resolves.toMatchObject({ ok: false });
  });
});
