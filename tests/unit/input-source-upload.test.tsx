// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useInputSource } from '@/hooks/useInputSource';
import type { UploadedFileAsset } from '@/lib/types';

/**
 * The uploaded file a reload must not lose (defect 41).
 *
 * The hook mirrors the picked file into IndexedDB session state and restores it
 * on mount, and the restore is an async read: the first one is the slow one,
 * because `initIndexedDB` performs the one-time localStorage→IndexedDB migration
 * of an existing history. The old guard covered only the mount-time `null`
 * ("skipped until the hydration read completes so the initial null doesn't
 * overwrite the stored upload"), so a file the LEARNER picked inside that window
 * lost both halves of the deal:
 *
 *   1. its write was dropped - the persist effect returned early on
 *      `!hydratedRef.current` and never re-ran for the pick; and
 *   2. the read then called `setUploadedFile(stored)` unconditionally, replacing
 *      the fresh pick with the previous session's upload.
 *
 * The tests below resolve the read AFTER a pick, in both directions, and assert
 * what is on screen (`uploadedFile`) and what reached IndexedDB (the write). The
 * pre-fix hook fails the first test's post-hydration assertions with
 * `yesterday-lecture.pdf` where `today-lecture.pdf` belongs, and fails the second
 * with no write at all.
 *
 * IndexedDB is the boundary, mocked rather than reached: happy-dom has no
 * IndexedDB, and what is under test is the ordering of the hook's own read and
 * write, not the engine's.
 */

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getSessionStateIDB: vi.fn(() => Promise.resolve(null)),
    putSessionStateIDB: vi.fn(() => Promise.resolve()),
    deleteSessionStateIDB: vi.fn(() => Promise.resolve()),
  };
});

import { deleteSessionStateIDB, getSessionStateIDB, putSessionStateIDB } from '@/lib/db';

const getSession = getSessionStateIDB as unknown as ReturnType<typeof vi.fn>;
const putSession = putSessionStateIDB as unknown as ReturnType<typeof vi.fn>;
const deleteSession = deleteSessionStateIDB as unknown as ReturnType<typeof vi.fn>;

/** The pick the learner makes while the read is still in flight. */
const TODAY: UploadedFileAsset = {
  name: 'today-lecture.pdf',
  type: 'application/pdf',
  size: 2048,
  base64Data: 'TODAY_BASE64',
};

/** The previous session's upload, which is what the slow read returns. */
const YESTERDAY: UploadedFileAsset = {
  name: 'yesterday-lecture.pdf',
  type: 'application/pdf',
  size: 4096,
  base64Data: 'YESTERDAY_BASE64',
};

/** A promise whose settlement the test decides. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// React reports a caught render error through console.error; nothing here should
// produce one, so any noise is silenced rather than treated as expected output.
const consoleError = console.error;

let container: HTMLDivElement;
let root: Root;
let latest!: ReturnType<typeof useInputSource>;

/** A harness that keeps the newest hook value reachable outside React. */
function Harness() {
  const input = useInputSource();
  // Read back through an effect: writing to an outer variable during render is
  // the side effect the react-hooks rules (correctly) refuse.
  useEffect(() => {
    latest = input;
  });
  return <p>harness</p>;
}

/** What the hook asked IndexedDB to store, in order. */
const writes = () => putSession.mock.calls.filter(([key]) => key === 'last_upload');

let hydration!: { promise: Promise<UploadedFileAsset | null>; resolve: (value: UploadedFileAsset | null) => void };

beforeEach(() => {
  console.error = vi.fn();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();

  // Every test starts with the read still in flight, which is the window the
  // defect lived in.
  hydration = deferred<UploadedFileAsset | null>();
  getSession.mockReset();
  getSession.mockImplementation(() => hydration.promise);
  putSession.mockReset();
  putSession.mockImplementation(() => Promise.resolve());
  deleteSession.mockReset();
  deleteSession.mockImplementation(() => Promise.resolve());

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  console.error = consoleError;
});

const mount = async () => {
  await act(async () => root.render(<Harness />));
};

/** Tear the hook down and mount a fresh instance - what a reload looks like. */
const remount = async () => {
  await act(async () => root.unmount());
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await mount();
};

/** The learner attaches a file, through the same setter the launchpad calls. */
const pick = async (file: UploadedFileAsset) => {
  await act(async () => {
    latest.setUploadedFile(file);
  });
};

/** The hydration read finally answering, with whatever the store held. */
const hydrateWith = async (stored: UploadedFileAsset | null) => {
  await act(async () => {
    hydration.resolve(stored);
  });
};

describe('useInputSource upload hydration (defect 41)', () => {
  it('writes the pick immediately, without waiting for the read to finish', async () => {
    // Half one of the defect: the persist effect returned early while the read
    // was in flight and never re-ran, so the learner's file was never saved.
    await mount();
    await pick(TODAY);

    expect(latest.uploadedFile).toEqual(TODAY);
    expect(writes()).toEqual([['last_upload', TODAY]]);
  });

  it('keeps the file the learner picked when the stored upload arrives afterwards', async () => {
    // Half two: the read called `setUploadedFile(stored)` unconditionally, so a
    // pick made inside the window was replaced by the previous session's upload.
    await mount();
    await pick(TODAY);

    await hydrateWith(YESTERDAY);

    expect(latest.uploadedFile).toEqual(TODAY);
    expect(putSession).not.toHaveBeenCalledWith('last_upload', YESTERDAY);
    expect(writes()).toEqual([['last_upload', TODAY]]);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('still persists a pick that beat an empty store, instead of dropping the write', async () => {
    // The silent half: the read finds nothing, so nothing re-runs the effect and
    // the old guard left the learner's file unsaved for the next session.
    await mount();
    await pick(TODAY);
    await hydrateWith(null);

    expect(latest.uploadedFile).toEqual(TODAY);
    expect(writes()).toEqual([['last_upload', TODAY]]);
  });

  it('restores a stored upload when the learner has not picked anything', async () => {
    await mount();
    await hydrateWith(YESTERDAY);

    expect(latest.uploadedFile).toEqual(YESTERDAY);
    expect(writes()).toEqual([['last_upload', YESTERDAY]]);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('writes nothing when there is nothing stored and nothing picked', async () => {
    await mount();
    await hydrateWith(null);

    expect(latest.uploadedFile).toBeNull();
    expect(writes()).toEqual([]);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('lets a pick after hydration replace the restored upload, and removes it when cleared', async () => {
    await mount();
    await hydrateWith(YESTERDAY);
    expect(latest.uploadedFile).toEqual(YESTERDAY);

    await pick(TODAY);
    expect(latest.uploadedFile).toEqual(TODAY);
    expect(writes()).toEqual([
      ['last_upload', YESTERDAY],
      ['last_upload', TODAY],
    ]);

    await act(async () => {
      latest.setUploadedFile(null);
    });
    expect(latest.uploadedFile).toBeNull();
    expect(deleteSession).toHaveBeenCalledWith('last_upload');
  });

  it('a reload restores exactly what the previous session persisted', async () => {
    // A real store behind the mock, so what mount A writes is what mount B reads.
    let store: UploadedFileAsset | null = null;
    getSession.mockImplementation(() => Promise.resolve(store));
    putSession.mockImplementation((_key: string, value: UploadedFileAsset) => {
      store = value;
      return Promise.resolve();
    });
    deleteSession.mockImplementation(() => {
      store = null;
      return Promise.resolve();
    });

    await mount();
    await pick(TODAY);
    expect(store).toEqual(TODAY);

    // The page reloads into a fresh hook instance mid-... whatever the learner
    // was doing; the file comes back.
    await remount();

    expect(latest.uploadedFile).toEqual(TODAY);
    expect(latest.uploadedFile?.base64Data).toBe('TODAY_BASE64');
  });

  it('ignores a read that resolves after the hook has unmounted', async () => {
    await mount();
    await act(async () => root.unmount());

    await hydrateWith(YESTERDAY);

    // The stale read must not resurrect a file into a torn-down hook.
    expect(writes()).toEqual([]);
    expect(deleteSession).not.toHaveBeenCalled();
  });
});
