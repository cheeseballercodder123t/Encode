/**
 * The one clipboard write in this app (defect 35).
 *
 * Eight copy controls had grown three different behaviours around the same call.
 * The history drawer and the completed-session view fired
 * `navigator.clipboard.writeText` as a **floating promise** and then reported
 * success unconditionally, so a refused write rendered `[ OK ]` over an
 * unchanged clipboard. The forge awaited the call bare, so a refusal produced no
 * state change, no message and an unhandled rejection - the click looked dead.
 * The RemNote sheet swallowed the rejection with `void ... .catch(() => {})` and
 * still said "Copied"; the share sheet was the only one that checked, and it
 * reported nothing to the learner when it failed.
 *
 * Closing that class of bug is a rule, not four fixes: `copyTextToClipboard` is
 * the only place in the codebase that touches the clipboard (enforced by
 * `tests/unit/clipboard-standardisation.test.ts`), it **never throws**, it never
 * leaves a rejection floating, and it only reports `ok: true` for a write that
 * actually landed. Callers get a discriminated outcome, so a failure cannot be
 * mistaken for a success by forgetting a `catch`.
 *
 * The refusal path is the one that matters, and it is not hypothetical:
 * `writeText` rejects with `NotAllowedError` when the document is not focused
 * (a click that follows a keyboard shortcut, a second monitor) or when the user
 * denied permission, and `navigator.clipboard` is **undefined on a non-secure
 * origin** - where the old drawer's call threw a `TypeError` inside the click
 * handler before any state was set. Both are handled here, and a refused
 * `writeText` falls back to the selection path rather than giving up: that path
 * is exactly what still works when the async API is unavailable, which is why
 * `StatelessShareModal` already used it.
 */

/** Which mechanism actually put the text on the clipboard. */
export type CopyPath = 'clipboard' | 'execCommand';

/** Why a copy did not land. */
export type CopyFailure = 'empty' | 'unavailable' | 'blocked';

export type ClipboardOutcome =
  | { ok: true; via: CopyPath }
  | { ok: false; reason: CopyFailure; message: string };

/** What every control shows when the browser refused the write. */
export const COPY_FAILED_MESSAGE =
  'Copy failed — the browser blocked clipboard access. Select the text and copy it yourself.';

/** Nothing to copy is not a failure of the browser, and it is not worth a scare. */
export const COPY_EMPTY_MESSAGE = 'Nothing to copy yet.';

/** True when the async Clipboard API can be attempted at all. */
function hasClipboardApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * The selection path: an off-screen textarea, selected, then
 * `document.execCommand('copy')`.
 *
 * Off-screen rather than `display: none` - a textarea that is not rendered
 * cannot be selected, and `execCommand` would then copy nothing while returning
 * whatever it likes. Every step is guarded: this runs precisely when the tidy
 * API refused, so it must not be the thing that throws.
 */
function copyViaSelection(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';

  try {
    document.body.appendChild(area);
    area.select();
    if (typeof document.execCommand !== 'function') return false;
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Puts `text` on the clipboard and reports what actually happened. Never throws.
 *
 * Order: the async API first, because it is the one that works without stealing
 * focus; then the selection path, whether the async API was missing or refused
 * the write. Only when both fail is the outcome `ok: false`, and the reason
 * distinguishes a browser that has no clipboard at all (`unavailable`) from one
 * that has it and refused (`blocked`).
 */
export async function copyTextToClipboard(text: string): Promise<ClipboardOutcome> {
  if (!text) return { ok: false, reason: 'empty', message: COPY_EMPTY_MESSAGE };

  const apiAvailable = hasClipboardApi();
  if (apiAvailable) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, via: 'clipboard' };
    } catch {
      // Consumed here on purpose: a refusal is a fallback trigger, not something
      // a caller should have to remember to catch.
    }
  }

  if (copyViaSelection(text)) return { ok: true, via: 'execCommand' };

  return {
    ok: false,
    reason: apiAvailable ? 'blocked' : 'unavailable',
    message: COPY_FAILED_MESSAGE,
  };
}
