// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The pending badge's number, and the reason it has to be a subscription.
 *
 * `pendingLocalCount` was a `useMemo` over `[user, cloudSchemas, hydrated]` that
 * read `loadSavedSchemas()` - a module-level cache the memo has no dependency
 * on. A write therefore changed the number without changing any dependency, so
 * the memo kept answering with the value it captured at mount: the badge showed
 * "nothing pending" exactly when something was (defect 39). It is the only
 * signal that local work has not reached the cloud.
 *
 * These tests drive the two things the count is a difference of - the local
 * library and the account's copy - and assert the rendered number moves with
 * them and with nothing else. Against the pre-fix memo the first assertion after
 * a save fails with `'0'` where `'1'` is expected.
 *
 * Firebase is the SDK boundary, mocked rather than reached: what is under test
 * is what the count derives from, not Google's servers.
 */

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  onSnapshot: vi.fn(),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ auth: {}, db: {}, googleProvider: {} }));

import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { clearAllSchemas, deleteSchemaFromHistory, saveSchemaToHistory } from '@/lib/storage';
import type { SavedSchema } from '@/lib/types';

const authMock = onAuthStateChanged as unknown as ReturnType<typeof vi.fn>;
const snapshotMock = onSnapshot as unknown as ReturnType<typeof vi.fn>;
const getDocMock = getDoc as unknown as ReturnType<typeof vi.fn>;
const setDocMock = setDoc as unknown as ReturnType<typeof vi.fn>;
const writeBatchMock = writeBatch as unknown as ReturnType<typeof vi.fn>;

type AuthCallback = (user: unknown) => void;
type SnapshotCallback = (snapshot: unknown) => void;

let authCallback: AuthCallback | null = null;
let snapshotCallback: SnapshotCallback | null = null;
/** What the account's `schemas` collection currently holds. */
let cloudSchemas: SavedSchema[] = [];

/** The shape Firestore hands `onSnapshot` for a collection query. */
const cloudSnapshot = () => ({
  forEach: (fn: (docSnap: { data: () => SavedSchema }) => void) =>
    cloudSchemas.forEach((schema) => fn({ data: () => schema })),
});

const schema = (topicSummary: string, id = topicSummary.toLowerCase().replace(/\W+/g, '-')): SavedSchema => ({
  id,
  timestamp: Date.now(),
  topicSummary,
  mode: 'conceptual',
  xpEarned: 25,
  activities: [],
  userResponses: {},
});

// React reports a caught render error through console.error; nothing here should
// produce one, so any noise is silenced rather than treated as expected output.
const consoleError = console.error;

let container: HTMLDivElement;
let root: Root;

/** The rendered badge number, read off the DOM rather than off the hook. */
const rendered = () => container.querySelector('[data-testid="pending"]')?.textContent;

function PendingBadge() {
  const { pendingLocalCount } = useAuth();
  return <p data-testid="pending">{pendingLocalCount}</p>;
}

const mount = async () => {
  await act(async () => {
    root.render(
      <AuthProvider>
        <PendingBadge />
      </AuthProvider>
    );
  });
};

/** Firebase reporting a signed-out session, which is the app's initial state. */
const signOut = async () => {
  await act(async () => {
    authCallback?.(null);
  });
};

/** Firebase reporting a signed-in session. */
const signIn = async () => {
  await act(async () => {
    authCallback?.({ uid: 'learner-1', email: 'learner@example.test', displayName: 'Learner' });
  });
};

/** The account's copy arriving (or being updated) over the live subscription. */
const deliverCloud = async (schemas: SavedSchema[]) => {
  cloudSchemas = schemas;
  await act(async () => {
    snapshotCallback?.(cloudSnapshot());
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  console.error = vi.fn();
  clearAllSchemas();
  cloudSchemas = [];
  authCallback = null;
  snapshotCallback = null;

  authMock.mockImplementation((_auth: unknown, cb: AuthCallback) => {
    authCallback = cb;
    return () => {};
  });
  snapshotMock.mockImplementation((_collection: unknown, next: SnapshotCallback) => {
    snapshotCallback = next;
    return () => {};
  });
  getDocMock.mockResolvedValue({ exists: () => false });
  setDocMock.mockResolvedValue(undefined);
  writeBatchMock.mockReturnValue({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearAllSchemas();
  console.error = consoleError;
});

describe('the pending badge counts what has not reached the cloud', () => {
  it('moves when the library does, signed out, with no other interaction', async () => {
    await mount();
    await signOut();
    expect(rendered()).toBe('0');

    await act(async () => {
      saveSchemaToHistory(schema('Renal Physiology'));
    });
    // The defect: pre-fix the memo never re-ran, so this stayed '0' and the
    // badge said "nothing pending" with an un-backed-up schema on disk.
    expect(rendered()).toBe('1');

    await act(async () => {
      saveSchemaToHistory(schema('Saltatory Conduction'));
    });
    expect(rendered()).toBe('2');

    // A schema that is gone is not pending either, in the same session.
    await act(async () => {
      deleteSchemaFromHistory('saltatory-conduction');
    });
    expect(rendered()).toBe('1');
  });

  it('counts the local schemas the account does not hold, and follows both sides', async () => {
    // Two schemas on the device before anyone signs in.
    saveSchemaToHistory(schema('Renal Physiology'));
    saveSchemaToHistory(schema('Saltatory Conduction'));

    await mount();
    await signIn();
    expect(rendered()).toBe('2');

    // The account knows one of them: that one is no longer pending.
    await deliverCloud([schema('Renal Physiology')]);
    expect(rendered()).toBe('1');

    // Work done while signed in is pending until the account's copy carries it.
    await act(async () => {
      saveSchemaToHistory(schema('Cardiac Cycle'));
    });
    expect(rendered()).toBe('2');

    await deliverCloud([schema('Renal Physiology'), schema('Cardiac Cycle')]);
    expect(rendered()).toBe('1');

    // And the account holding everything reads as nothing pending.
    await deliverCloud([schema('Renal Physiology'), schema('Cardiac Cycle'), schema('Saltatory Conduction')]);
    expect(rendered()).toBe('0');
  });

  it('counts a device that already held schemas, with nobody signed in', async () => {
    // The signed-out case is the one where the badge is the whole story: every
    // schema on a device with no account is un-backed-up work. Hydration is an
    // effect (localStorage cannot be read during render without an SSR
    // mismatch), so this is what the learner sees once the app has mounted.
    saveSchemaToHistory(schema('Renal Physiology'));
    await mount();
    await signOut();
    expect(rendered()).toBe('1');

    await act(async () => {
      saveSchemaToHistory(schema('Saltatory Conduction'));
    });
    expect(rendered()).toBe('2');
  });
});
