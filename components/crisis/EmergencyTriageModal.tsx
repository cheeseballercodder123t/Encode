'use client';

import React, { useEffect, useState } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { formatClock } from '@/lib/crucible/budget';
import {
  decodeTriageResume,
  encodeTriageResume,
  resumeRemainingMs,
  RUNWAY_MINUTES,
  runwayAction,
  TRIAGE_RESUME_KEY,
  type TriagePlan,
  type TriageResumeState,
} from '@/lib/crisis/buffer';

// ─── The executive-function emergency triage buffer ─────────────────────────
//
// The night everything is due at once, the blocker is not the work. Every item
// is loaded into working memory simultaneously and the result is that nothing
// can be started — so the two operations that help are both about REDUCING the
// live set:
//
//   1. FREEZE. "Gothic Lit and Care of Athletes are frozen for 48 hours" is a
//      real state change; the items stop competing. It is only offered when the
//      marginal grade risk can actually be shown to be negligible, because a
//      freeze the learner cannot verify is one more thing to distrust.
//   2. DISMANTLE THE PANIC WITH THE WEIGHTING. A grade is a weighted average,
//      so a 4/5 on an item worth 2% moves the final number by 0.4 points — not
//      by the 20% the quiz suggests. The arithmetic is shown, not asserted.
//
// Then the runway: ninety minutes, ONE task, and the rest of the application
// hidden. The plan's phrase is "cold-blooded task freezing", and the coldness is
// the point — nothing here is encouraging, because encouragement is the register
// of every system that has already failed this learner.
//
// What the sheet refuses to do is as deliberate as what it does. A task with no
// stated weight is never frozen: "this is low-leverage" is a claim that needs a
// number, and the night is not the moment to spend the learner's trust on a
// guess. Those items are listed with what would make them decidable instead.

export interface EmergencyTriageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'dump' | 'plan' | 'runway';

/** How often the runway clock repaints. */
const TICK_MS = 500;

/**
 * localStorage is optional, not guaranteed: private modes, quota and a server
 * render can all take it away, and none of them may take the plan with it.
 */
function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** A record whose runway was actually started — a plan with no clock resumes as a plan. */
function resumableRunway(record: TriageResumeState): boolean {
  return Boolean(record.runwayStartedAt && record.plan.focus);
}

/** The phase a resumed record opens in: the runway only while it still has time. */
function restoredPhase(record: TriageResumeState | null): Phase {
  if (!record) return 'dump';
  if (!resumableRunway(record)) return 'plan';
  return resumeRemainingMs(record, Date.now()) > 0 ? 'runway' : 'plan';
}

/**
 * The stored record, or null when there is none. Never throws, and never touches
 * storage in a server render.
 */
function readResumeRecord(): TriageResumeState | null {
  if (!canUseStorage()) return null;
  try {
    return decodeTriageResume(window.localStorage.getItem(TRIAGE_RESUME_KEY));
  } catch {
    return null;
  }
}

export function EmergencyTriageModal({ isOpen, onClose }: EmergencyTriageModalProps) {
  const sheetRef = useModalA11y(isOpen, onClose);

  // The record this mount resumes from, read ONCE in a lazy initializer rather
  // than written into state from an effect. The sheet is MOUNTED only while it is
  // open (see the conditional render in `app/page.tsx`), so this runs after the
  // click that opened it and never during a server render — and it opens straight
  // on the resumed state instead of painting an empty sheet for one frame and
  // then cascading a re-render over it.
  const [resumeRecord] = useState<TriageResumeState | null>(() => readResumeRecord());

  const [phase, setPhase] = useState<Phase>(() => restoredPhase(resumeRecord));
  const [dump, setDump] = useState(() => resumeRecord?.dump ?? '');
  const [plan, setPlan] = useState<TriagePlan | null>(() => resumeRecord?.plan ?? null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [runwayStartedAt, setRunwayStartedAt] = useState(() =>
    resumeRecord && resumableRunway(resumeRecord) ? resumeRecord.runwayStartedAt : 0
  );
  const [runwayNow, setRunwayNow] = useState(() => Date.now());
  // True when a restored record's ninety minutes had already run out. The plan
  // comes back; the clock does not.
  const [runwayExpired, setRunwayExpired] = useState(
    () =>
      !!resumeRecord &&
      resumableRunway(resumeRecord) &&
      resumeRemainingMs(resumeRecord, Date.now()) <= 0
  );

  // The runway clock. Wall-clock based, so a throttled tab cannot drift a
  // ninety-minute countdown, and it stops when the sheet closes.
  useEffect(() => {
    if (phase !== 'runway' || !runwayStartedAt) return;
    const timer = setInterval(() => setRunwayNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase, runwayStartedAt]);

  /**
   * The record the sheet survives on.
   *
   * Everything used to live only in React state, so closing the sheet — or a
   * reload forty-five minutes into the runway — destroyed the plan and the
   * clock, and the learner had to re-paste the whole backlog and re-run triage
   * from scratch. The record stores the runway's START epoch rather than a
   * countdown, because the runway is wall-clock: an hour away from the tab is an
   * hour of the runway either way, and a resumed countdown that pretended
   * otherwise would be a lie about time already spent.
   */
  const persistResume = (next: { plan: TriagePlan; dump: string; runwayStartedAt: number }) => {
    try {
      if (!canUseStorage()) return;
      const raw = encodeTriageResume({
        dump: next.dump,
        plan: next.plan,
        runwayStartedAt: next.runwayStartedAt,
        runwayDurationMs: next.plan.runwayMinutes * 60 * 1000,
        savedAt: Date.now(),
      });
      if (raw) window.localStorage.setItem(TRIAGE_RESUME_KEY, raw);
    } catch {
      /* best-effort: a full quota must never be what strands tonight's plan */
    }
  };

  const clearResume = () => {
    try {
      if (canUseStorage()) window.localStorage.removeItem(TRIAGE_RESUME_KEY);
    } catch {
      /* best-effort */
    }
  };

  // Reopening the sheet restores what the last visit left behind: the dump as
  // typed, the plan as built, and the runway still running when it has time left
  // on it. A runway whose ninety minutes are gone comes back as an EXPIRED note
  // beside the plan — ready to be started again, but never handed back as a fresh
  // clock, because that would silently rewrite how long the work has been owed.
  // All of that is decided in the initializers above, on the mount that the
  // opening click causes.

  // The runway's own length, not a second constant: a restored record carries
  // the minutes the plan was built with.
  const runwayMinutes = plan?.runwayMinutes || RUNWAY_MINUTES;
  const runwaySecondsLeft = runwayStartedAt
    ? Math.max(0, runwayMinutes * 60 - (runwayNow - runwayStartedAt) / 1000)
    : runwayMinutes * 60;
  const runwayOver = runwayStartedAt > 0 && runwaySecondsLeft <= 0;

  const triage = async () => {
    const text = dump.trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    setError(null);
    setReadError(null);
    playSound('click');

    try {
      const res = await fetch('/api/crisis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dump: text, settings: loadAISettings() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The backlog could not be triaged.');

      const nextPlan: TriagePlan = {
        tasks: data.tasks ?? [],
        frozen: data.frozen ?? [],
        focus: data.focus ?? null,
        panicLines: data.panicLines ?? [],
        withheld: data.withheld ?? [],
        runwayMinutes: data.runwayMinutes ?? RUNWAY_MINUTES,
      };
      setPlan(nextPlan);
      setReadError(typeof data.readError === 'string' ? data.readError : null);
      setPhase('plan');
      setRunwayExpired(false);
      // The plan is on disk before the learner ever sees it, so a sheet closed
      // mid-read is not a triage run they have to pay for twice.
      persistResume({ plan: nextPlan, dump: text, runwayStartedAt: 0 });
      playSound('success');
    } catch (e: any) {
      setError(e?.message || 'The backlog could not be triaged. Check your AI settings.');
      playSound('wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const startRunway = () => {
    if (!plan) return;
    const began = Date.now();
    setRunwayStartedAt(began);
    setRunwayNow(began);
    setRunwayExpired(false);
    setPhase('runway');
    persistResume({ plan, dump, runwayStartedAt: began });
    playSound('pop');
  };

  // Finished: the runway was run, so the record has nothing left to resume. The
  // dump stays in the textarea, so a second pass is one click rather than a
  // re-paste.
  const finishRunway = () => {
    clearResume();
    setPlan(null);
    setRunwayStartedAt(0);
    setRunwayNow(0);
    setRunwayExpired(false);
    setPhase('dump');
    playSound('success');
    onClose();
  };

  // Started over: an explicit control, because throwing tonight's plan away
  // should be something the learner does on purpose and not something that
  // happens to them.
  const startOver = () => {
    clearResume();
    setPlan(null);
    setDump('');
    setRunwayStartedAt(0);
    setRunwayNow(0);
    setRunwayExpired(false);
    setPhase('dump');
    setReadError(null);
    setError(null);
    playSound('click');
  };

  if (!isOpen) return null;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Emergency triage"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-inset/90 p-3 sm:p-6 backdrop-blur-sm"
    >
      <div
        data-testid="emergency-triage"
        className="w-full max-w-2xl rounded-lg border border-edge bg-deck mt-4 sm:mt-8"
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-hazard-500/15">
              <span className="text-hazard-300 font-bold font-mono">[ ! ]</span>
            </span>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-bone block">
                Emergency triage
              </span>
              <span className="text-[10px] font-mono text-solder">
                {phase === 'runway'
                  ? 'single-task runway · everything else is hidden until the clock ends'
                  : 'sequence the backlog, freeze what can prove it is low-leverage'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close emergency triage"
            className="shrink-0 px-2.5 py-1 text-[11px] font-mono border border-edge text-solder hover:text-bone hover:border-hazard-500/50 transition-colors duration-150 cursor-pointer"
          >
            [ X ]
          </button>
        </div>

        <div className="p-4 space-y-4">
          {phase === 'dump' && (
            <div className="space-y-3">
              <label
                htmlFor="triage-dump"
                className="text-[10px] font-mono uppercase tracking-widest text-solder block"
              >
                Everything that is due — your words, any order, one task per line
              </label>
              <textarea
                id="triage-dump"
                data-testid="triage-dump"
                data-autofocus
                value={dump}
                onChange={(event) => setDump(event.target.value)}
                rows={8}
                placeholder={
                  'Chem makeup quiz — due tomorrow, worth 5%\nGothic Lit essay — Oct 14\nPractice set 7 (optional)\nCare of Athletes quiz — Friday, 10 points'
                }
                className="w-full rounded-md border border-edge bg-inset p-3 text-sm leading-relaxed text-bone placeholder-solder outline-none focus:border-hazard-500/60 transition-colors duration-150 resize-none font-sans"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={triage}
                  disabled={isLoading || !dump.trim()}
                  data-testid="triage-run"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-hazard-500 hover:bg-hazard-400 text-inset transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? 'Ranking the backlog…' : 'Freeze and focus'}
                </button>
                <span className="text-[10px] font-mono text-solder">
                  a weight it cannot read is never guessed — those items are listed as undecidable
                </span>
              </div>
            </div>
          )}

          {error && (
            <p
              data-testid="triage-error"
              className="rounded-md border border-hazard-500/40 bg-hazard-500/10 p-2.5 text-[11px] leading-relaxed text-hazard-300"
            >
              {error}
            </p>
          )}

          {phase === 'plan' && plan && (
            <div className="space-y-4" data-testid="triage-plan">
              <div className="rounded-md border border-signal-500/40 bg-signal-950/25 p-3 space-y-1">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-signal-300">
                  [ RUNWAY ] the single next action
                </span>
                <p data-testid="triage-focus" className="text-xs text-bone leading-relaxed">
                  {runwayAction(plan)}
                </p>
              </div>

              {plan.frozen.length > 0 && (
                <div
                  data-testid="triage-frozen"
                  className="rounded-md border border-amber-500/40 bg-amber-500/[0.06] p-3 space-y-1.5"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-amber-300">
                    [ FROZEN ] off your plate for 48 hours
                  </span>
                  {plan.frozen.map((entry) => (
                    <p key={entry.task.id} className="text-[11px] text-bone leading-relaxed">
                      {entry.line}
                    </p>
                  ))}
                </div>
              )}

              <div
                data-testid="triage-panic"
                className="rounded-md border border-edge bg-inset p-3 space-y-1.5"
              >
                <span className="block font-mono text-[10px] uppercase tracking-widest text-solder">
                  the arithmetic, not the reassurance
                </span>
                {plan.panicLines.map((line, index) => (
                  <p key={index} className="text-[11px] text-bone/90 leading-relaxed font-mono">
                    {line}
                  </p>
                ))}
              </div>

              {plan.withheld.length > 0 && (
                <div
                  data-testid="triage-withheld"
                  className="rounded-md border border-edge/70 p-3 space-y-1.5"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-solder">
                    not frozen — the risk could not be shown
                  </span>
                  {plan.withheld.map((entry) => (
                    <p key={entry.task.id} className="text-[11px] text-solder leading-relaxed">
                      <span className="text-bone/90">{entry.task.title}</span> — {entry.reason}
                    </p>
                  ))}
                </div>
              )}

              {readError && (
                <p className="text-[10px] font-mono text-solder leading-relaxed">{readError}</p>
              )}

              {runwayExpired && (
                <p
                  data-testid="triage-runway-expired"
                  className="rounded-md border border-amber-500/40 bg-amber-500/[0.06] p-2.5 text-[11px] leading-relaxed text-amber-300"
                >
                  The {plan.runwayMinutes}-minute runway you started earlier has run out. The plan
                  survived — start a fresh one when you are ready, or edit the dump and triage
                  again.
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={startRunway}
                  disabled={!plan.focus}
                  data-testid="triage-runway-start"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-400 text-inset transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Start the {plan.runwayMinutes}-minute runway
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Editing the dump keeps the plan on the record: the learner
                    // is revising, not abandoning, and a sheet closed while they
                    // think it over comes back where they left it. The runway is
                    // no longer running, so the record is rewritten without one.
                    persistResume({ plan, dump, runwayStartedAt: 0 });
                    setPhase('dump');
                    playSound('click');
                  }}
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Edit the dump
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  data-testid="triage-start-over"
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-hazard-300 hover:border-hazard-500/50 transition-colors duration-150 cursor-pointer"
                >
                  [ START OVER ]
                </button>
              </div>
            </div>
          )}

          {phase === 'runway' && plan?.focus && (
            <div className="space-y-5" data-testid="triage-runway">
              <div className="space-y-1.5">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-solder">
                  the only thing on screen
                </span>
                <p className="text-sm text-bone leading-relaxed">{plan.focus.title}</p>
              </div>

              {plan.focus.dueAt !== null && (
                <p className="text-[11px] font-mono text-amber-300">
                  due {new Date(plan.focus.dueAt).toLocaleDateString()}
                  {plan.focus.dueLabel ? ` · as written: ${plan.focus.dueLabel}` : ''}
                </p>
              )}

              <div data-testid="triage-runway-clock" className="space-y-2">
                <span className="font-mono text-3xl font-bold text-bone tabular-nums">
                  {formatClock(runwaySecondsLeft)}
                </span>
                <div className="h-1.5 w-full bg-inset border border-edge overflow-hidden">
                  <div
                    className="h-full bg-signal-500"
                    style={{
                      width: `${Math.round((runwaySecondsLeft / (runwayMinutes * 60)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] font-mono text-solder">
                  {plan.frozen.length > 0
                    ? `${plan.frozen.length} item${plan.frozen.length === 1 ? '' : 's'} frozen · not rendered here on purpose`
                    : 'nothing was frozen, so this runway is the whole of tonight’s plan'}
                </p>
              </div>

              {runwayOver && (
                <p
                  data-testid="triage-runway-over"
                  className="text-[11px] font-mono text-amber-300 leading-relaxed"
                >
                  The clock is out. Whatever landed in those minutes is the result — the plan stays
                  where it is until you close this.
                </p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={finishRunway}
                  data-testid="triage-runway-done"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-signal-500 hover:bg-signal-400 text-inset transition-colors duration-150 cursor-pointer"
                >
                  Runway done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('plan');
                    playSound('click');
                  }}
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Back to the plan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
