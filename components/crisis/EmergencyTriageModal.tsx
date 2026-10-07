'use client';

import React, { useEffect, useState } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { formatClock } from '@/lib/crucible/budget';
import {
  RUNWAY_MINUTES,
  runwayAction,
  type TriagePlan,
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

export function EmergencyTriageModal({ isOpen, onClose }: EmergencyTriageModalProps) {
  const sheetRef = useModalA11y(isOpen, onClose);

  const [phase, setPhase] = useState<Phase>('dump');
  const [dump, setDump] = useState('');
  const [plan, setPlan] = useState<TriagePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [runwayStartedAt, setRunwayStartedAt] = useState(0);
  const [runwayNow, setRunwayNow] = useState(0);

  // The runway clock. Wall-clock based, so a throttled tab cannot drift a
  // ninety-minute countdown, and it stops when the sheet closes.
  useEffect(() => {
    if (phase !== 'runway' || !runwayStartedAt) return;
    const timer = setInterval(() => setRunwayNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase, runwayStartedAt]);

  const runwaySecondsLeft = runwayStartedAt
    ? Math.max(0, RUNWAY_MINUTES * 60 - (runwayNow - runwayStartedAt) / 1000)
    : RUNWAY_MINUTES * 60;

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

      setPlan({
        tasks: data.tasks ?? [],
        frozen: data.frozen ?? [],
        focus: data.focus ?? null,
        panicLines: data.panicLines ?? [],
        withheld: data.withheld ?? [],
        runwayMinutes: data.runwayMinutes ?? RUNWAY_MINUTES,
      });
      setReadError(typeof data.readError === 'string' ? data.readError : null);
      setPhase('plan');
      playSound('success');
    } catch (e: any) {
      setError(e?.message || 'The backlog could not be triaged. Check your AI settings.');
      playSound('wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const startRunway = () => {
    const began = Date.now();
    setRunwayStartedAt(began);
    setRunwayNow(began);
    setPhase('runway');
    playSound('pop');
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
                    setPhase('dump');
                    playSound('click');
                  }}
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Edit the dump
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
                      width: `${Math.round((runwaySecondsLeft / (RUNWAY_MINUTES * 60)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] font-mono text-solder">
                  {plan.frozen.length > 0
                    ? `${plan.frozen.length} item${plan.frozen.length === 1 ? '' : 's'} frozen · not rendered here on purpose`
                    : 'nothing was frozen, so this runway is the whole of tonight’s plan'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onClose}
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
