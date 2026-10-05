'use client';

import { useEffect, useRef } from 'react';

/**
 * The open sheets, oldest first. Module scope on purpose: which sheet is on top
 * is a property of the page, not of any one component.
 */
const openSheets: symbol[] = [];

/**
 * The behaviour every sheet in this app owes the person using it.
 *
 * Fourteen modals each drew their own overlay and only one of them could be
 * closed with a key. Escape is not a nicety — it is the first thing anyone
 * tries, and a sheet that ignores it feels like a trap. So one hook owns what
 * they all need, and each modal hands it its own close handler:
 *
 *   1. Escape closes.
 *   2. The page behind stops scrolling, so a wheel over the scrim does nothing.
 *   3. Focus moves INTO the sheet on open — at the first `[data-autofocus]`
 *      element when one is marked, otherwise the sheet itself.
 *   4. Tab stays inside the sheet, wrapping at both ends.
 *   5. Focus goes back to whatever had it before, on close.
 *
 * It returns the ref the sheet element must carry (`tabIndex={-1}` so the
 * fallback target is focusable at all).
 *
 * Call it unconditionally, in the component body — before the
 * `if (!isOpen) return null` early return, never after it. The handler may
 * therefore be a thunk over something declared further down
 * (`() => handleClose()`); it is only ever invoked after the render that opened
 * the sheet has finished, by which point that binding is initialised.
 */
export function useModalA11y(isOpen: boolean, onClose?: () => void) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol('sheet');

  // The handler is usually an inline arrow, so its identity changes every
  // render; the listener below must not re-subscribe every render because of it.
  useEffect(() => {
    closeRef.current = onClose;
  });

  /**
   * Escape belongs to the top sheet only.
   *
   * Each open sheet pushes a token and pops it on close, and the handler acts
   * only when it is last in the stack. Listener order on `window` cannot be
   * relied on for this — two stacked sheets (forge → export) must close one
   * layer at a time, not both at once.
   */
  useEffect(() => {
    if (!isOpen) return;
    const token = tokenRef.current!;
    openSheets.push(token);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openSheets[openSheets.length - 1] !== token) return;
      if (!closeRef.current) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const index = openSheets.indexOf(token);
      if (index >= 0) openSheets.splice(index, 1);
    };
  }, [isOpen]);

  // A sheet is a page of its own: nothing behind it may scroll.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    restoreFocusRef.current = (document.activeElement as HTMLElement) || null;

    // The sheet itself, not its first button: landing on "close" is the
    // classic way a keyboard user immediately dismisses what they just opened.
    const marked = sheet.querySelector<HTMLElement>('[data-autofocus]');
    (marked || sheet).focus({ preventScroll: true });

    return () => {
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [isOpen]);

  /**
   * Tab stays inside the top sheet, wrapping at both ends.
   *
   * Focus that walks out of an open sheet lands on the page behind it: the
   * person tabbing cannot see where the ring went, and a screen reader has
   * silently left the dialog without closing it. Wrapping is what a dialog is
   * expected to do, so the trap belongs with the rest of the contract — owned
   * once, here, rather than re-invented by whichever sheet remembers.
   */
  useEffect(() => {
    if (!isOpen) return;
    const token = tokenRef.current!;

    const tabbable = (sheet: HTMLElement): HTMLElement[] =>
      Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // Only the sheet on top traps: a forge with an export sheet over it must
      // let the export sheet own the keyboard, not both at once.
      if (openSheets[openSheets.length - 1] !== token) return;
      const sheet = sheetRef.current;
      if (!sheet) return;

      const items = tabbable(sheet);
      if (items.length === 0) {
        event.preventDefault();
        sheet.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !sheet.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return sheetRef;
}
