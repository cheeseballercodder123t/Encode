// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'motion/react';
import { TeachMeModal } from '@/components/TeachMeModal';
import { makeActivity } from './fixtures';
import type { Activity, AISettings } from '@/lib/types';

// The sheet animates its segments, and an animation still in flight when the
// test unmounts is cancelled: under happy-dom that cancellation rejects, which
// vitest reports as an unhandled error even though every assertion passed. The
// animation is not what is under test here, so it is switched off at the source
// rather than muted after the fact.
MotionGlobalConfig.skipAnimations = true;

/**
 * Teach Me's failed request still teaches (defect 43).
 *
 * `lib/services/teachLesson.ts` has exported `buildFallbackLesson` under a
 * "Deterministic offline fallback" header, `sanitizeLesson`'s own contract says
 * "caller falls back to buildFallbackLesson", and the mount comment in
 * `app/page.tsx` told the reader the sheet teaches "with an offline
 * schema-based fallback" - but nothing joined them: the modal's failure path was
 * a `catch` that returned the learner to the pre-roll with an error string, so a
 * request that failed produced no lesson at all.
 *
 * These tests drive the real modal through the real failure path. The model
 * call is the boundary, stubbed rather than reached (this suite has no network
 * and no key), and what is asserted is the screen the learner actually gets:
 * the deterministic lesson, the sections it is built from, and the notice that
 * says which failure it stands in for - because a fallback that hides the
 * outage would be a different defect.
 */

const SETTINGS: AISettings = { provider: 'gemini' };
const NOTES = 'Resting is -70 mV; threshold is -55 mV; Na+ gates open.';
const TOPIC = 'Action Potentials';

/** A lesson payload the sanitizer accepts, for the runs where the model answers. */
const MODEL_LESSON = {
  lesson: {
    title: 'Threshold: The Two-Minute Version',
    tagline: 'One page, then the puzzle.',
    segments: [
      { id: 'm1', type: 'concept', title: 'The Threshold', body: 'It is a mechanical gate.' },
      { id: 'm2', type: 'wrapup', title: 'Wrap Up', body: 'Done.' },
    ],
  },
};

// React reports a caught error through console.error; the failure path logs on
// purpose, so the noise is silenced rather than treated as expected output.
const consoleError = console.error;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  console.error = vi.fn();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();

  fetchMock = vi.fn();
  (globalThis as { fetch: unknown }).fetch = fetchMock;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  console.error = consoleError;
});

const text = () => container.textContent ?? '';

const el = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);

const byText = (needle: RegExp) =>
  Array.from(container.querySelectorAll('button')).find((b) => needle.test(b.textContent ?? ''));

const click = async (button: HTMLElement | undefined) => {
  if (!button) throw new Error('no such control on screen');
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const mount = async (props: Partial<React.ComponentProps<typeof TeachMeModal>> = {}) => {
  await act(async () => {
    root.render(
      <TeachMeModal
        isOpen
        onClose={() => {}}
        scope="notes"
        topicSummary={TOPIC}
        mode="conceptual"
        notes={NOTES}
        settings={SETTINGS}
        {...props}
      />
    );
  });
};

/** Open the pre-roll and press Generate Lesson, which is the request under test. */
const generate = async () => {
  await click(byText(/generate lesson/i));
};

const serveModelLesson = () =>
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => MODEL_LESSON,
  });

describe('Teach Me when the model request fails', () => {
  it('teaches the deterministic lesson instead of returning nothing, and says it could not reach the service', async () => {
    // What fetch() rejects with when nothing answered: no status, no response.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await mount();
    await generate();

    // The pre-roll is gone and a real lesson is playing.
    expect(text()).not.toContain('Lesson Pre-Roll');
    expect(text()).toContain(`${TOPIC} : Core Lesson`);
    expect(text()).toContain('1/5');

    // Named deterministic sections, not a placeholder: the concept the lesson
    // opens on, and the ones the arc walks through next.
    expect(text()).toContain('The Core Idea');
    expect(byText(/continue/i)).toBeTruthy();
    await click(byText(/continue/i));
    expect(text()).toContain('What the mechanism actually does');

    // And the learner is told why, rather than being handed a device-built
    // lesson that pretends to be a model read.
    const notice = el('teach-fallback-notice');
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute('data-origin')).toBe('offline');
    expect(text()).toContain('could not be reached');
    // The exit and the handoff are real, so this is a lesson rather than a wall.
    expect(el('teach-fallback-retry')).not.toBeNull();
  });

  it('still teaches when the service answered with an error, and shows that error rather than hiding the outage', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'The AI provider rejected the request (bad key)' }),
    });
    await mount();
    await generate();

    expect(text()).toContain(`${TOPIC} : Core Lesson`);
    const notice = el('teach-fallback-notice');
    expect(notice).not.toBeNull();
    // A response is not a lost connection: the distinction the notice carries.
    expect(notice!.getAttribute('data-origin')).toBe('server');
    expect(text()).toContain('The AI provider rejected the request (bad key)');
  });

  it('treats a 200 nobody can use as the failure it is, rather than opening an empty lesson', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ lesson: { segments: [] } }) });
    await mount();
    await generate();

    expect(text()).toContain(`${TOPIC} : Core Lesson`);
    expect(el('teach-fallback-notice')!.getAttribute('data-origin')).toBe('server');
    expect(text()).toContain('Lesson came back empty');
  });

  it('builds the fallback from the stage it was opened on, not from the topic alone', async () => {
    const activity = makeActivity({
      id: 'act-ap',
      title: 'Action Potential',
      contextSnippet: 'Resting is -70mV.',
      keywords: ['threshold', 'depolarization'],
      boundaryContrast: {
        confusableLookalike: 'Passive diffusion',
        distinguishingRule: 'Voltage-gated opening vs passive leak.',
      },
    });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await mount({ scope: 'stage', activities: [activity as Activity], stageIndex: 0, topicSummary: TOPIC });
    await generate();

    // The activity's own title leads, and the section after it is the
    // activity-derived deep dive: the builder was handed the stage.
    expect(text()).toContain('Action Potential');
    await click(byText(/continue/i));
    expect(text()).toContain('The mechanism, link by link');
    // Which is also where the confusable lookalike lives, so the fallback is
    // teaching the same boundary the stage was about.
    expect(text()).toContain('Voltage-gated opening vs passive leak.');
  });

  it('hands the learner back to the model on retry, and drops the notice with it', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await mount();
    await generate();
    expect(el('teach-fallback-notice')).not.toBeNull();

    // The connection comes back: the same control asks the model again.
    serveModelLesson();
    await click(el('teach-fallback-retry')!);

    expect(text()).toContain('Threshold: The Two-Minute Version');
    expect(el('teach-fallback-notice')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets the notice be dismissed without losing the lesson', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await mount();
    await generate();

    await click(el('teach-fallback-dismiss')!);

    expect(el('teach-fallback-notice')).toBeNull();
    // Dismissing the notice dismisses the notice, not the lesson.
    expect(text()).toContain(`${TOPIC} : Core Lesson`);
    expect(text()).toContain('The Core Idea');
  });
});
