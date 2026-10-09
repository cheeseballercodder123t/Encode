'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard, type ClipboardOutcome } from '@/lib/clipboard';

/**
 * The shared *feedback* half of a copy control (defect 35).
 *
 * `copyTextToClipboard` decides whether the write landed; this decides what the
 * learner sees, and it is a hook rather than per-component state because the
 * three behaviours finding 35 found were three ways of getting the same two
 * things wrong: reporting success the write never achieved, and letting the
 * confirmation outlive the moment it describes.
 *
 * So the rules live here, once:
 *
 *  - `status` becomes `copied` **only** for an `ok: true` outcome, and `failed`
 *    for anything else, carrying the outcome's message.
 *  - The status resets to `idle` after `resetMs`, and the timer is cleared on
 *    unmount - a `setState` on an unmounted sheet is a leak, and the timer is
 *    also replaced on a second click so the newest copy owns the confirmation.
 *  - `key` names *which* control was copied, so a sheet that lists twenty rows
 *    marks the row that was clicked and not every row that happens to share the
 *    sheet's state (the drawer's bug, one level up).
 *
 * The four sheets that named a bug and the four more that shared its class all
 * use this hook, which is what makes their behaviour the same rather than
 * merely similar.
 */

export type CopyStatus = 'idle' | 'copied' | 'failed';

export interface ClipboardCopy {
  status: CopyStatus;
  /** The key of the last copy attempt, or null for a keyless control. */
  key: string | null;
  /** The failure message to show, or null while idle/copied. */
  message: string | null;
  /** True while `key` is the control whose copy landed. */
  copied: (key?: string | null) => boolean;
  /** True while `key` is the control whose copy was refused. */
  failed: (key?: string | null) => boolean;
  /** Writes `text`, then reports the outcome. Never rejects. */
  copy: (text: string, key?: string | null) => Promise<ClipboardOutcome>;
}

export function useClipboardCopy(resetMs = 2000): ClipboardCopy {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const [key, setKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // The confirmation must not fire into an unmounted sheet, and a sheet closed
  // mid-confirmation must not leave a timer behind.
  useEffect(() => clearTimer, [clearTimer]);

  const copy = useCallback(
    async (text: string, target: string | null = null): Promise<ClipboardOutcome> => {
      const outcome = await copyTextToClipboard(text);

      clearTimer();
      setKey(target);
      setStatus(outcome.ok ? 'copied' : 'failed');
      setMessage(outcome.ok ? null : outcome.message);

      timer.current = setTimeout(() => {
        setStatus('idle');
        setKey(null);
        setMessage(null);
        timer.current = null;
      }, resetMs);

      return outcome;
    },
    [clearTimer, resetMs]
  );

  const copied = useCallback(
    (target: string | null = null) => status === 'copied' && key === target,
    [status, key]
  );

  const failed = useCallback(
    (target: string | null = null) => status === 'failed' && key === target,
    [status, key]
  );

  return { status, key, message, copied, failed, copy };
}
