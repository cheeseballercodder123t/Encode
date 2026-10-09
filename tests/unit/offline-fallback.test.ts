import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateOfflineWorkout,
  isConnectivityFailure,
  shouldFallBackToOffline,
} from '@/lib/services/offlineGenerator';

/**
 * The offline fallback, and the wiring that makes it real (defect 42).
 *
 * `generateOfflineWorkout` was a complete, unit-tested deterministic generator
 * with **no production caller**: `useSettings` computed `isOffline` from the
 * `online`/`offline` events and nobody read it, while the README advertised "an
 * offline fallback generator when you have no network/key". A learner with no
 * connection got an error alert instead.
 *
 * Two things are pinned here, and they are different kinds of claim:
 *
 *   1. The DECISION - `shouldFallBackToOffline` over a connectivity flag and a
 *      thrown value - including the boundary that matters most: a server that
 *      answered with an error is not a lost connection, because fabricating a
 *      workout for a provider outage is exactly what the resilience suite refuses.
 *   2. The WIRING, at the source, the way `xp-timer-cleanup.test.ts` and
 *      `modal-a11y.test.ts` pin their contracts: the launchpad imports the
 *      generator, consults `isOffline`, and renders the notice. A page component
 *      cannot be rendered in this suite (there is no @testing-library/react), and
 *      the behaviour itself is pinned end to end in
 *      `e2e/resilience.spec.ts` - which is also where the mutation probe lives.
 */

const PAGE_SRC = readFileSync('app/page.tsx', 'utf8');
const SETTINGS_SRC = readFileSync('hooks/useSettings.ts', 'utf8');

describe('isConnectivityFailure tells a lost connection from a refusal', () => {
  it('recognises the failures a browser raises when the request never landed', () => {
    // Chromium and Firefox.
    expect(isConnectivityFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isConnectivityFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    // Safari, and the fetch failures a route handler or a runtime reports.
    expect(isConnectivityFailure(new TypeError('Load failed'))).toBe(true);
    expect(isConnectivityFailure(new Error('fetch failed'))).toBe(true);
    expect(isConnectivityFailure(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(true);
    expect(isConnectivityFailure(new Error('net::ERR_NETWORK_CHANGED'))).toBe(true);
    expect(isConnectivityFailure(new Error('The network connection was lost.'))).toBe(true);
    expect(isConnectivityFailure('Failed to fetch')).toBe(true);
  });

  it('refuses to call a server error, a bad payload or a cancel a lost connection', () => {
    // The provider answered - with a refusal. This must stay an error, which is
    // what `resilience.spec.ts`'s 500 test exists to protect.
    expect(isConnectivityFailure(new Error('Provider down'))).toBe(false);
    expect(isConnectivityFailure(new Error('Encode error (500): upstream refused'))).toBe(false);
    expect(isConnectivityFailure(new Error('Invalid schema format returned from server'))).toBe(false);
    expect(isConnectivityFailure(new Error('Failed to generate schema'))).toBe(false);
    // A JSON parse failure is the response arriving malformed, not missing.
    expect(isConnectivityFailure(new SyntaxError('Unexpected token < in JSON at position 0'))).toBe(false);
    // A deliberate cancel is not a lost connection, and must stay silent.
    expect(isConnectivityFailure(new DOMException('The user aborted a request.', 'AbortError'))).toBe(false);
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    expect(isConnectivityFailure(abort)).toBe(false);
    // Nothing thrown at all.
    expect(isConnectivityFailure(undefined)).toBe(false);
    expect(isConnectivityFailure(null)).toBe(false);
  });
});

describe('shouldFallBackToOffline is the one decision the launchpad makes', () => {
  it('falls back when the browser already knows there is no connection', () => {
    expect(shouldFallBackToOffline({ isOffline: true })).toBe(true);
    expect(shouldFallBackToOffline({ isOffline: true, error: new Error('Provider down') })).toBe(true);
  });

  it('falls back when the attempt failed because the connection is what went missing', () => {
    expect(shouldFallBackToOffline({ isOffline: false, error: new TypeError('Failed to fetch') })).toBe(true);
  });

  it('does not fall back when the server answered, or when the learner cancelled', () => {
    expect(shouldFallBackToOffline({ isOffline: false })).toBe(false);
    expect(shouldFallBackToOffline({ isOffline: false, error: new Error('Provider down') })).toBe(false);
    expect(shouldFallBackToOffline({ isOffline: false, error: new DOMException('abort', 'AbortError') })).toBe(false);
  });
});

describe('the offline workout is a session the workbench can actually run', () => {
  const notes = [
    'Action Potentials',
    'Voltage-gated sodium channels open when the membrane crosses threshold.',
    'Potassium leaving the cell restores the resting charge for the next spike.',
    'The pump, the gradient, and the channels together decide the shape of the spike.',
  ].join('\n');

  it('produces stages with the fields, labels and ids the workbench drives', () => {
    const workout = generateOfflineWorkout(notes, 'conceptual', []);

    expect(workout.topicSummary).toContain('Offline Schema Workout');
    expect(workout.activities).toHaveLength(5);
    workout.activities.forEach((activity, index) => {
      expect(activity.id).toBe(`offline-stage-${index + 1}`);
      expect(activity.stageNumber).toBe(index + 1);
      expect(activity.title.length).toBeGreaterThan(0);
      expect(activity.templateType).toBeTruthy();
      // The two graded fields exist and carry their own placeholder text, so the
      // stage is answerable with no model involved.
      expect(activity.scaffold.field1Label.length).toBeGreaterThan(0);
      expect(activity.scaffold.field1Placeholder.length).toBeGreaterThan(0);
      expect(activity.scaffold.field2Label.length).toBeGreaterThan(0);
      expect(activity.scaffold.field2Placeholder.length).toBeGreaterThan(0);
      expect(activity.scaffold).toHaveProperty('presetOptions');
      expect(activity.visualData).toBeTruthy();
    });
  });

  it('is deterministic, so the offline session is the same one twice', () => {
    expect(generateOfflineWorkout(notes, 'conceptual', [])).toEqual(
      generateOfflineWorkout(notes, 'conceptual', [])
    );
  });

  it('keeps a hidden template out of the workout', () => {
    const all = generateOfflineWorkout(notes, 'conceptual', []);
    const hidden = all.activities[0].templateType;
    const without = generateOfflineWorkout(notes, 'conceptual', [hidden]);

    expect(without.activities.map((a) => a.templateType)).not.toContain(hidden);
    expect(without.activities.length).toBeGreaterThan(0);
  });
});

describe('the app is wired to the generator, not only to the idea of it', () => {
  it('the launchpad imports the generator and the shared decision', () => {
    expect(PAGE_SRC).toContain(
      "import { generateOfflineWorkout, shouldFallBackToOffline } from '@/lib/services/offlineGenerator'"
    );
  });

  it('the launchpad reads connectivity from useSettings, which still publishes it', () => {
    // The half of the defect that was a subscription nobody consumed.
    expect(SETTINGS_SRC).toMatch(/isOffline,/);
    expect(SETTINGS_SRC).toContain("addEventListener('offline'");
    expect(PAGE_SRC).toMatch(/^\s+isOffline,$/m);
  });

  it('both ways into the fallback exist: offline before, and the connection lost mid-request', () => {
    // Before the attempt: the offline branch short-circuits the fetch entirely.
    expect(PAGE_SRC).toContain('if (shouldFallBackToOffline({ isOffline })) {');
    // Mid-request: the catch consults the same decision with the thrown value.
    expect(PAGE_SRC).toContain('if (shouldFallBackToOffline({ isOffline, error })) {');
    // And both of them end in the real call, not a stub.
    expect(PAGE_SRC).toContain(
      'generateOfflineWorkout(rawNotes, encodingMode, loadStudyPrefs().hiddenTemplates)'
    );
    // The alert path is still there for a server that answered.
    expect(PAGE_SRC).toContain("alert(error?.message || 'Something went wrong preparing your schema.");
  });

  it('renders a notice a person (and a browser test) can see', () => {
    expect(PAGE_SRC).toContain('data-testid="offline-fallback-banner"');
    expect(PAGE_SRC).toContain("data-connectivity={isOffline ? 'offline' : 'online'}");
    expect(PAGE_SRC).toContain('data-workout-origin={offlineFallback || \'model\'}');
    // The notice is above the state switch, so it is visible on the launchpad as
    // well as in the workbench - the learner knows before typing, not after.
    expect(PAGE_SRC.indexOf('data-testid="offline-fallback-banner"')).toBeLessThan(
      PAGE_SRC.indexOf('{/* STATE 1: ZEN LAUNCHPAD')
    );
  });

  it('clears the offline origin once a model-written schema arrives', () => {
    expect(PAGE_SRC).toMatch(/setOfflineFallback\(null\)/);
  });
});
