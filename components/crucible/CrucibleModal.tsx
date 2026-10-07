'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalA11y } from '@/hooks/useModalA11y';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import {
  CRUCIBLE_MINUTES,
  formatClock,
  formatMinutes,
  pacingFor,
  stressInoculationRead,
  summarizeSprint,
  validateCruciblePlan,
  type CruciblePlan,
  type StatePacing,
} from '@/lib/crucible/budget';
import { governorDecision, loadFrictionHistory } from '@/lib/escalation/governor';
import { fusionReadiness, type FusionReadiness } from '@/lib/escalation/fusion';
import { preflightWarnings, type PreflightWarning } from '@/lib/mr-m/ledger';
import type { GovernorDecision } from '@/lib/escalation/types';

// ─── The timed crucible ─────────────────────────────────────────────────────
//
// Under relaxed conditions a learner holds five to seven items in working
// memory at once. Under a real clock adrenaline cuts that to two or three — and
// that is exactly where sign flips and unit slips come from. You cannot study
// your way out of that; you can only rehearse it until the compression is
// familiar, which is what this surface is for.
//
// What it deliberately is NOT is a countdown with a score attached. A single
// ticking clock reports that time is leaving and nothing about where it went, so
// the only available response to it is panic. So the clock is ALLOCATED across
// each problem's states before the problem starts (`lib/crucible/budget.ts`),
// and the HUD reports plan against reality, state by state:
//
//     [ 01 System demand (mcΔT) ]   target 1.3m · elapsed 1.1m · ahead
//     [ 02 Boundary work (−PΔV) ]   target 1.3m · elapsed 2.1m · lagging
//
// That converts "I am behind" into "state 2 is costing twice its budget and
// state 1 is already banked" — a statement about a step rather than about the
// person, which is the only form of the feedback that helps mid-sprint.
//
// The summary keeps the same discipline. It reports pacing and, separately,
// RECOVERY — an overrun that the next state absorbed is a better rep than a
// sprint that never overran, because recovering under load is the skill. It
// never reports speed as a grade: the point of a stress-inoculation rep is to
// make the compression familiar, and a verdict on the person teaches them to
// avoid the rep instead.
//
// The other half is the pre-flight tripwire. This learner's repeated failures
// are recorded as patches, and a repeated failure is the one thing genuinely
// worth warning about before a timed attempt rather than after it.

export interface CrucibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** What the sprint is timed against. */
  topic?: string;
  /** Source text, when the sprint is opened mid-session. */
  sourceContext?: string;
}

type Phase = 'setup' | 'running' | 'summary' | 'failed';

/** How often the HUD repaints. 200ms feels live and costs nothing measurable. */
const TICK_MS = 200;

/**
 * Builds the pacing table for a finished sprint.
 *
 * Module level, not a closure, because the clock's own callback needs it: it
 * runs outside React's render, so it must not depend on a function that is
 * recreated on every render.
 */
function tableAtFinish(
  plan: CruciblePlan,
  elapsed: number[],
  liveSeconds: number
): StatePacing[] {
  const out: StatePacing[] = [];
  let cursor = 0;
  for (const problem of plan.problems) {
    for (const state of problem.states) {
      const recorded = elapsed[cursor];
      const value = recorded !== undefined ? recorded : cursor === elapsed.length ? liveSeconds : 0;
      out.push(pacingFor(state, value));
      cursor += 1;
    }
  }
  return out;
}

export function CrucibleModal({ isOpen, onClose, topic, sourceContext }: CrucibleModalProps) {
  const sheetRef = useModalA11y(isOpen, onClose);

  const [phase, setPhase] = useState<Phase>('setup');
  const [topicDraft, setTopicDraft] = useState(topic || '');
  const [minutes, setMinutes] = useState(CRUCIBLE_MINUTES);
  const [plan, setPlan] = useState<CruciblePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // The clock. `startedAt` is wall-clock, so a throttled background tab cannot
  // drift the sprint.
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);

  // Where the learner is, and what each finished state actually cost.
  const [problemIndex, setProblemIndex] = useState(0);
  const [stateIndex, setStateIndex] = useState(0);
  const [elapsedPerState, setElapsedPerState] = useState<number[]>([]);
  const [summaryTable, setSummaryTable] = useState<StatePacing[]>([]);

  /**
   * The checkpoint numbers, keyed by the state's position in the FLATTENED
   * sprint so the summary can read them back in the order the HUD paced them.
   *
   * Optional at every step, and that is the point: in an exam room the algebra
   * goes on paper and only the answer gets bubbled, so a clock that demands
   * typed equations measures typing speed rather than the thing it claims to
   * rehearse. Nothing here is required to advance, and nothing about a state's
   * recorded elapsed time depends on whether one was typed.
   */
  const [checkpoints, setCheckpoints] = useState<Record<number, string>>({});

  const [governor, setGovernor] = useState<GovernorDecision | null>(null);
  const [warnings, setWarnings] = useState<PreflightWarning[]>([]);

  /**
   * What the material is ready for, decided by the SAME gate the route uses.
   *
   * This was the ungated row match (`matchFusion`), which promises a collision
   * whenever the topic belongs to a fusion row — including when the material
   * carries only one of that row's chapters. The route decides with
   * `fusionReadiness` and, with one chapter present, re-aims the escalation
   * deeper inside that chapter instead of colliding it, so the old banner was
   * promising a cross-chapter sprint that the problems it paced deliberately did
   * not contain. The banner now reads the gated verdict.
   */
  const [readiness, setReadiness] = useState<FusionReadiness | null>(null);

  /**
   * The escalation the ROUTE used for the sprint that was served.
   *
   * Once a sprint is running the server's own reason is authoritative — it is
   * the one attached to the problems the learner is working — so the banner
   * prefers it over the client's pre-flight guess.
   */
  const [escalation, setEscalation] = useState<{ mode: string; reason: string } | null>(null);

  /**
   * What the arithmetic gate did to the sprint, as the route reported it.
   *
   * The route has always returned this and nothing read it: how many problems'
   * numbers a machine actually closed, and which problems were dropped before
   * the sprint was paced. A gate whose result is invisible is a claim, not a
   * check, so the summary reports it.
   */
  const [gateReceipt, setGateReceipt] = useState<{
    verified: number;
    checked: number;
    dropped: string[];
  } | null>(null);

  /**
   * The ledgers are read in an effect, never during render.
   *
   * Both live in localStorage, which does not exist on the server: reading them
   * inline would render one thing on the server and another on the client's
   * first paint. Same pattern — and the same scoped exception — as the
   * workbench's read of the patch ledger in `StudioWorkbench.tsx`: the rule does
   * not model the external-system-on-mount case, and the alternative it would
   * prefer is the hydration mismatch.
   */
  /* eslint-disable react-hooks/set-state-in-effect -- hydration-safe localStorage sync; the rule does not model the external-system-on-mount exception */
  useEffect(() => {
    if (!isOpen) return;
    // A sprint opened mid-session inherits the session's topic as a starting
    // point, but never overwrites a topic the learner has typed themselves.
    const incoming = (topic || '').trim();
    if (incoming) setTopicDraft((draft) => (draft.trim() ? draft : incoming));
  }, [isOpen, topic]);

  /**
   * The pre-flight is read against WHAT WILL BE SENT.
   *
   * The topic box is editable, so the tripwire and the collision are keyed off
   * the draft rather than off the topic the sheet was opened with: a warning
   * assembled from one chapter while the sprint is timed against another is
   * worse than no warning, and the route matches the fusion against the drafted
   * topic too, so the banner has to be reading the same string it will send.
   * The source context is part of that read, not a decoration: the route passes
   * it to `fusionReadiness`, and a chapter present in the material is a chapter
   * the collision can legitimately use, so the banner must see the same text.
   */
  useEffect(() => {
    if (!isOpen) return;
    const clean = topicDraft.trim();
    setWarnings(clean ? preflightWarnings(clean) : []);
    setReadiness(clean ? fusionReadiness(clean, sourceContext || '') : null);
    // The escalation is read against the SAME drafted topic, and re-read when it
    // changes. The governor's streak is scoped to one chapter (`cleanWinStreak`
    // takes the topic), so a sprint timed against Thermochemistry cannot be
    // escalated by clean wins logged on Genetics — which is what a global read
    // used to do: the boss banner appeared on a chapter the log had never said
    // anything about, and the `boss` flag sent to the route went with it.
    setGovernor(governorDecision(loadFrictionHistory(), clean));
  }, [isOpen, topicDraft, sourceContext]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * The sprint's live values, held in a ref so the clock's callback can read
   * them without re-subscribing the interval on every tick. Updated in an
   * effect (a ref write, not a render-phase write), which is what keeps the
   * interval identity stable for the whole sprint.
   */
  const latest = useRef<{ plan: CruciblePlan | null; elapsed: number[]; liveSeconds: number }>({
    plan: null,
    elapsed: [],
    liveSeconds: 0,
  });
  useEffect(() => {
    latest.current = {
      plan,
      elapsed: elapsedPerState,
      liveSeconds: Math.max(0, (Date.now() - startedAt) / 1000 - elapsedPerState.reduce((a, b) => a + b, 0)),
    };
  });

  // One interval for the whole sprint. It ends the run when the clock reaches
  // zero — from inside the callback rather than from an effect watching the
  // remaining time, so a finished sprint costs no extra render pass.
  useEffect(() => {
    if (phase !== 'running' || !startedAt) return;
    const deadline = startedAt + minutes * 60 * 1000;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current < deadline) return;
      const snapshot = latest.current;
      if (!snapshot.plan) return;
      const live = Math.max(0, (current - startedAt) / 1000 - snapshot.elapsed.reduce((a, b) => a + b, 0));
      setSummaryTable(tableAtFinish(snapshot.plan, snapshot.elapsed, live));
      setPhase('summary');
      playSound('wrong');
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase, startedAt, minutes]);

  const elapsedSeconds = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
  const remainingSeconds = Math.max(0, minutes * 60 - elapsedSeconds);

  const problem = plan?.problems[problemIndex] ?? null;
  const states = problem?.states ?? [];
  /** How many states the problems before this one hold — the HUD's own index. */
  const problemOffset = (plan?.problems ?? [])
    .slice(0, problemIndex)
    .reduce((acc, entry) => acc + entry.states.length, 0);
  const bankedSeconds = elapsedPerState.reduce((acc, value) => acc + value, 0);
  const liveStateSeconds = Math.max(0, elapsedSeconds - bankedSeconds);

  const summary = useMemo(() => summarizeSprint(summaryTable), [summaryTable]);
  const stress = useMemo(() => stressInoculationRead(summaryTable), [summaryTable]);

  const startSprint = async () => {
    const cleanTopic = topicDraft.trim();
    if (!cleanTopic || isLoading) return;

    setIsLoading(true);
    setError(null);
    // A new sprint's receipt is the new sprint's: the previous one must not sit
    // under a summary that belongs to different problems.
    setGateReceipt(null);
    setEscalation(null);
    playSound('click');

    try {
      const res = await fetch('/api/crucible', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: cleanTopic,
          minutes,
          boss: governor?.level === 'boss',
          sourceContext,
          settings: loadAISettings(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The sprint could not be started.');

      // Coerced through the same function the route used, and for the same
      // reason: the HUD paces `targetSec` state by state, so a payload that is
      // not a state machine would render `target NaNm` — a clock that looks like
      // a clock and measures nothing. The coercion is pure and deterministic, so
      // the split it computes here is the split the route computed there, and a
      // sprint that cannot be paced is refused rather than shown.
      const loaded = validateCruciblePlan(data, minutes);
      if (!loaded) {
        throw new Error(
          'The sprint came back without a usable state machine, so it was not started. A problem that cannot be paced is worse than no problem at all.'
        );
      }

      // The gate's own numbers, read off the response rather than re-derived:
      // `verifiedProblems` counts the problems whose declared relations a
      // checker closed, `checkedProblems` the problems the sprint actually
      // carries. A problem that failed the check was dropped server-side, so a
      // lower verified count with a full problem list means it arrived with no
      // declared arithmetic rather than that the sprint lost one.
      const ledger = data?.ledger;
      setGateReceipt(
        ledger &&
          Number.isFinite(Number(ledger.verifiedProblems)) &&
          Number.isFinite(Number(ledger.checkedProblems))
          ? {
              verified: Number(ledger.verifiedProblems),
              checked: Number(ledger.checkedProblems),
              dropped: Array.isArray(data?.rejectedProblems)
                ? data.rejectedProblems.filter(
                    (line: unknown): line is string => typeof line === 'string'
                  )
                : [],
            }
          : // A response with no ledger gets no receipt: "0 checked" would be a
            // claim about a check that never reported, not a finding.
            null
      );
      setEscalation(
        data?.escalation && typeof data.escalation.reason === 'string'
          ? {
              mode: typeof data.escalation.mode === 'string' ? data.escalation.mode : '',
              reason: data.escalation.reason,
            }
          : null
      );

      setPlan(loaded);
      setProblemIndex(0);
      setStateIndex(0);
      setElapsedPerState([]);
      setSummaryTable([]);
      setCheckpoints({});
      const began = Date.now();
      setStartedAt(began);
      setNow(began);
      setPhase('running');
      playSound('success');
    } catch (e: any) {
      setError(e?.message || 'The sprint could not be started. Check your AI settings.');
      setGateReceipt(null);
      setEscalation(null);
      setPhase('failed');
      playSound('wrong');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Stamps the state that just finished and moves to the next one.
   *
   * Finishing the sprint records NOTHING back into the friction governor, and
   * that is a decision rather than an omission. The governor's trigger is a
   * LADDER-based mastery signal — "solved with no clue rung requested" — while a
   * sprint has no correctness read at all: nothing under the clock is graded,
   * the summary reports where the time went and how much of an overrun was
   * recovered, and it deliberately refuses to treat speed as a verdict on the
   * person. Logging a paced sprint as a clean win would therefore invent the
   * mastery reading this mode never took, and would raise the level on the
   * strength of it. That signal has to come from a surface where the answer is
   * actually graded — the workbench's examiner check — so a sprint's own
   * contribution stays where the learner can see it: the pacing table.
   */
  const completeState = () => {
    if (!plan) return;
    playSound('click');
    const nextElapsed = [...elapsedPerState, liveStateSeconds];

    if (stateIndex + 1 < states.length) {
      setElapsedPerState(nextElapsed);
      setStateIndex(stateIndex + 1);
      return;
    }
    if (problemIndex + 1 < plan.problems.length) {
      setElapsedPerState(nextElapsed);
      setProblemIndex(problemIndex + 1);
      setStateIndex(0);
      return;
    }
    setElapsedPerState(nextElapsed);
    setSummaryTable(tableAtFinish(plan, nextElapsed, 0));
    setPhase('summary');
    playSound('pop');
  };

  /**
   * Cut the problem short. The state in progress is banked at what it has cost
   * so far and the untouched states are banked at zero — reported honestly as
   * "not started" rather than as a budget the learner never spent.
   *
   * Cutting a problem short is a pacing read like finishing one, so it records
   * nothing into the friction governor either — the reasoning is in
   * `completeState` above, and it is the same reasoning here.
   */
  const skipProblem = () => {
    if (!plan) return;
    playSound('click');
    const remaining = Math.max(0, states.length - stateIndex - 1);
    const nextElapsed = [
      ...elapsedPerState,
      liveStateSeconds,
      ...Array.from({ length: remaining }, () => 0),
    ];

    if (problemIndex + 1 < plan.problems.length) {
      setElapsedPerState(nextElapsed);
      setProblemIndex(problemIndex + 1);
      setStateIndex(0);
      return;
    }
    setElapsedPerState(nextElapsed);
    setSummaryTable(tableAtFinish(plan, nextElapsed, 0));
    setPhase('summary');
    playSound('pop');
  };

  if (!isOpen) return null;

  const clockUrgent = remainingSeconds <= 60;
  const sprintSeconds = minutes * 60;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timed crucible sprint"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-inset/80 p-3 sm:p-6 backdrop-blur-sm"
    >
      <div
        data-testid="crucible"
        className="w-full max-w-3xl rounded-lg border border-edge bg-deck mt-4 sm:mt-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-hazard-500/15">
              <span className="text-hazard-300 font-bold font-mono">[ ⏱ ]</span>
            </span>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-bone block">
                Timed crucible
              </span>
              <span className="text-[10px] font-mono text-solder">
                {phase === 'running' && plan
                  ? `${plan.problems.length} problems · ${minutes} minutes · state-by-state pacing`
                  : 'multi-constraint problems, solved against the clock'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close crucible"
            className="shrink-0 px-2.5 py-1 text-[11px] font-mono border border-edge text-solder hover:text-bone hover:border-hazard-500/50 transition-colors duration-150 cursor-pointer"
          >
            [ X ]
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ── The setup ─────────────────────────────────────────────── */}
          {phase === 'setup' && (
            <div className="space-y-4">
              {governor?.level === 'boss' && (
                <div
                  data-testid="crucible-governor"
                  className="rounded-md border border-amber-500/45 bg-amber-500/[0.07] p-3 space-y-1"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-amber-300">
                    [ BOSS LEVEL ] the friction governor has escalated
                  </span>
                  <p className="text-[11px] text-bone leading-relaxed">{governor.reason}</p>
                  {/*
                    The escalation, in the route's own words once a sprint has
                    been served and in the gated pre-flight's words before that.
                    `fusionReadiness().reason` is the learner-facing line and it
                    is correct in both branches: a collision when the material
                    carries two chapters, and a deeper pass inside the one it
                    does carry when it carries only one. What it replaced was an
                    ungated promise of every chapter in the row — a collision the
                    sprint is not built to contain. (`soloDepthBrief` is the
                    generator's brief for that branch, i.e. a prompt rather than
                    a sentence to put in front of a person.)
                  */}
                  {(escalation?.reason || readiness?.reason) ? (
                    <p
                      data-testid="crucible-escalation"
                      className="text-[11px] text-amber-200/90 leading-relaxed"
                    >
                      {escalation?.reason || readiness?.reason}
                    </p>
                  ) : null}
                </div>
              )}

              {warnings.length > 0 && (
                <div
                  data-testid="crucible-preflight"
                  className="rounded-md border border-hazard-500/40 bg-hazard-950/25 p-3 space-y-1.5"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-hazard-300">
                    ⚠ Pre-flight tripwire
                  </span>
                  {warnings.map((warning) => (
                    <p key={warning.patch.id} className="text-[11px] text-bone leading-relaxed">
                      {warning.headline} {warning.line}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="crucible-topic"
                  className="text-[10px] font-mono uppercase tracking-widest text-solder block"
                >
                  What the sprint is timed against
                </label>
                <input
                  id="crucible-topic"
                  data-testid="crucible-topic"
                  data-autofocus
                  value={topicDraft}
                  onChange={(event) => setTopicDraft(event.target.value)}
                  placeholder="e.g. Thermochemistry — calorimetry and enthalpy"
                  className="w-full rounded-md border border-edge bg-inset px-3 py-2 text-sm text-bone placeholder-solder outline-none focus:border-hazard-500/60 transition-colors duration-150"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-solder block">
                  Sprint length
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {[6, CRUCIBLE_MINUTES, 20].map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={minutes === option}
                      data-testid={`crucible-minutes-${option}`}
                      onClick={() => setMinutes(option)}
                      className={`px-3 py-1.5 text-[11px] font-mono rounded-full border transition-colors duration-150 cursor-pointer ${
                        minutes === option
                          ? 'bg-hazard-500/20 border-hazard-500/50 text-hazard-200'
                          : 'bg-inset border-edge/70 text-solder hover:text-bone'
                      }`}
                    >
                      {option} min
                    </button>
                  ))}
                  <span className="text-[10px] font-mono text-solder">
                    the clock is allocated across each problem&apos;s states before it starts
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={startSprint}
                  disabled={isLoading || !topicDraft.trim()}
                  data-testid="crucible-start"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-hazard-500 hover:bg-hazard-400 text-inset transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? 'Writing the sprint…' : 'Start the sprint'}
                </button>
                <span
                  data-testid="crucible-paper-note"
                  className="text-[10px] font-mono text-solder leading-relaxed"
                >
                  no answer key · the summary reports pacing, not a score · work it on paper and type
                  only the checkpoint number if you want it recorded — the sprint is paced on the step,
                  not on your typing
                </span>
              </div>
            </div>
          )}

          {error && (
            <p
              data-testid="crucible-error"
              className="rounded-md border border-hazard-500/40 bg-hazard-500/10 p-2.5 text-[11px] leading-relaxed text-hazard-300"
            >
              {error}
            </p>
          )}

          {/* ── The sprint ────────────────────────────────────────────── */}
          {phase === 'running' && plan && problem && (
            <div className="space-y-4">
              <div className="space-y-1.5" data-testid="crucible-clock">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-solder">
                    problem {problemIndex + 1} of {plan.problems.length}
                  </span>
                  <span
                    data-testid="crucible-clock-value"
                    className={`font-mono text-sm font-bold ${
                      clockUrgent ? 'text-hazard-300' : 'text-bone'
                    }`}
                  >
                    {formatClock(remainingSeconds)} left
                  </span>
                </div>
                <div className="h-1.5 w-full bg-inset border border-edge overflow-hidden">
                  <div
                    className={`h-full ${clockUrgent ? 'bg-hazard-500' : 'bg-amber-500'}`}
                    style={{
                      width: `${Math.round(Math.min(100, (remainingSeconds / sprintSeconds) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="rounded-md border border-edge bg-inset p-3 space-y-2">
                <span className="text-[11px] font-bold text-bone block">{problem.title}</span>
                {problem.constraints.length > 0 && (
                  <ul data-testid="crucible-constraints" className="space-y-1">
                    {problem.constraints.map((constraint, index) => (
                      <li
                        key={index}
                        className="text-[11px] text-bone/90 leading-relaxed flex gap-2"
                      >
                        <span className="shrink-0 font-mono text-[10px] text-solder">
                          C{index + 1}
                        </span>
                        <span>{constraint}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {problem.ask && (
                  <p
                    data-testid="crucible-ask"
                    className="text-[11px] text-amber-200 leading-relaxed"
                  >
                    Asks: {problem.ask}
                  </p>
                )}
              </div>

              {/* The time-budget HUD: the allocation against the reality, per state. */}
              <div data-testid="crucible-hud" className="space-y-1.5">
                {states.map((state, index) => {
                  const done = index < stateIndex;
                  const live = index === stateIndex;
                  const elapsed = done ? elapsedPerState[index] ?? 0 : live ? liveStateSeconds : 0;
                  const pacing = done || live ? pacingFor(state, elapsed) : null;
                  return (
                    <div
                      key={state.id}
                      data-testid={`crucible-state-${index}`}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
                        live
                          ? 'border-amber-500/50 bg-amber-500/[0.07]'
                          : done
                            ? 'border-edge/50 bg-inset/50'
                            : 'border-edge/40 bg-inset/30'
                      }`}
                    >
                      <span className="text-[11px] text-bone/90 leading-snug flex-1">
                        <span className="font-mono text-[10px] text-solder mr-1.5">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        {state.label}
                      </span>
                      {/* One optional numeric checkpoint per state. Nothing here is
                          required to advance, and the arithmetic belongs on paper. */}
                      <input
                        inputMode="decimal"
                        value={checkpoints[problemOffset + index] ?? ''}
                        onChange={(event) =>
                          setCheckpoints((prev) => ({
                            ...prev,
                            [problemOffset + index]: event.target.value.slice(0, 24),
                          }))
                        }
                        placeholder="checkpoint no."
                        aria-label={`Checkpoint number for ${state.label} (optional)`}
                        data-testid={`crucible-checkpoint-${index}`}
                        className="shrink-0 w-24 rounded-sm border border-edge bg-inset px-1.5 py-1 font-mono text-[10px] text-bone placeholder-solder outline-none focus:border-amber-500/50 transition-colors duration-150"
                      />
                      <span className="shrink-0 font-mono text-[10px] text-solder text-right">
                        <span data-testid={`crucible-state-target-${index}`}>
                          target {formatMinutes(state.targetSec)}
                        </span>
                        {' · '}
                        <span data-testid={`crucible-state-elapsed-${index}`}>
                          elapsed {formatMinutes(elapsed)}
                        </span>
                        {pacing && (
                          <span
                            data-testid={`crucible-state-pacing-${index}`}
                            className={
                              pacing.status === 'lagging'
                                ? ' text-hazard-300'
                                : pacing.status === 'ahead'
                                  ? ' text-signal-300'
                                  : ' text-solder'
                            }
                          >
                            {' · '}
                            {pacing.status === 'on-pace' ? 'on pace' : pacing.status}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={completeState}
                  data-testid="crucible-state-next"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-amber-500 hover:bg-amber-400 text-inset transition-colors duration-150 cursor-pointer"
                >
                  {stateIndex + 1 < states.length
                    ? `State ${stateIndex + 1} done → state ${stateIndex + 2}`
                    : problemIndex + 1 < plan.problems.length
                      ? 'Problem done → next problem'
                      : 'Finish the sprint'}
                </button>
                <button
                  type="button"
                  onClick={skipProblem}
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  cut this problem
                </button>
                <span className="text-[10px] font-mono text-solder">
                  elapsed is stamped when you mark a state done — the HUD never guesses
                </span>
                <span
                  data-testid="crucible-checkpoint-note"
                  className="text-[10px] font-mono text-solder leading-relaxed"
                >
                  the checkpoint slot is optional: nothing has to be typed to advance, and a state with
                  no checkpoint is paced on its elapsed time alone
                </span>
              </div>
            </div>
          )}

          {/* ── The read ──────────────────────────────────────────────── */}
          {phase === 'summary' && (
            <div className="space-y-4" data-testid="crucible-summary">
              <div className="rounded-md border border-edge bg-inset p-3 space-y-2">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-solder">
                  pacing
                </span>
                <p
                  data-testid="crucible-summary-verdict"
                  className="text-xs text-bone leading-relaxed"
                >
                  {summary.verdict}
                </p>
                <p className="text-[11px] text-solder leading-relaxed">
                  {summary.states} states · {summary.ahead} ahead · {summary.onPace} on pace ·{' '}
                  {summary.lagging} lagging · {formatMinutes(summary.elapsedSec)} elapsed of{' '}
                  {formatMinutes(summary.targetSec)} budgeted
                </p>
              </div>

              <div className="rounded-md border border-flux-500/40 bg-flux-500/[0.06] p-3 space-y-1.5">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-flux-300">
                  [ STRESS INOCULATION ]
                </span>
                <p data-testid="crucible-stress" className="text-xs text-bone leading-relaxed">
                  {stress.note}
                </p>
                {stress.worstStateLabel && (
                  <p className="text-[11px] text-solder leading-relaxed">
                    Biggest overrun: {stress.worstStateLabel} (+{stress.worstDriftPct}% of its
                    budget).
                  </p>
                )}
              </div>

              {/*
                The gate's own report. The route has always returned how much of
                the sprint's arithmetic a checker closed, which problems it
                dropped, and which escalation it chose; nothing read any of it,
                so "a problem whose relations do not close is rejected before
                the learner ever sees it" was a claim with no receipt. This is
                that receipt: the numbers that were machine-checked, the problems
                that did not survive, and the escalation the problems were
                actually written for.
              */}
              {(gateReceipt || escalation) && (
                <div
                  data-testid="crucible-receipt"
                  className="rounded-md border border-edge bg-inset p-3 space-y-1.5"
                >
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-solder">
                    arithmetic gate
                  </span>
                  {gateReceipt && (
                    <p
                      data-testid="crucible-receipt-ledger"
                      className="font-mono text-[11px] text-bone leading-relaxed"
                    >
                      numbers machine-checked: {gateReceipt.verified} of {gateReceipt.checked}
                      {gateReceipt.verified < gateReceipt.checked
                        ? ' · the rest arrived with no declared arithmetic, so they were served unchecked'
                        : ' · every declared relation closed'}
                    </p>
                  )}
                  {gateReceipt && gateReceipt.dropped.length > 0 && (
                    <div
                      data-testid="crucible-receipt-dropped"
                      className="space-y-1 border-t border-edge/70 pt-1.5"
                    >
                      <span className="block font-mono text-[10px] uppercase tracking-widest text-hazard-300">
                        dropped from the sprint ({gateReceipt.dropped.length})
                      </span>
                      {gateReceipt.dropped.map((line, index) => (
                        <p
                          key={index}
                          className="font-mono text-[11px] text-hazard-200 leading-relaxed"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  )}
                  {escalation && (
                    <p
                      data-testid="crucible-receipt-escalation"
                      className="text-[11px] text-solder leading-relaxed"
                    >
                      escalation: {escalation.mode} — {escalation.reason}
                    </p>
                  )}
                </div>
              )}

              <ul className="space-y-1">
                {summaryTable.map((entry, index) => (
                  <li
                    key={`${entry.state.id}-${index}`}
                    className="flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <span className="text-bone/90 truncate">{entry.state.label}</span>
                    {/* Only when one was actually typed: an empty column, or a
                        dash against every state, would read as a missing answer. */}
                    {checkpoints[index]?.trim() ? (
                      <span className="shrink-0 text-solder">
                        checkpoint {checkpoints[index].trim()}
                      </span>
                    ) : null}
                    <span
                      className={
                        entry.status === 'lagging'
                          ? 'text-hazard-300 shrink-0'
                          : entry.status === 'ahead'
                            ? 'text-signal-300 shrink-0'
                            : 'text-solder shrink-0'
                      }
                    >
                      {formatMinutes(entry.elapsedSec)} / {formatMinutes(entry.state.targetSec)} ·{' '}
                      {entry.status === 'on-pace' ? 'on pace' : entry.status}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 flex-wrap">                  <button
                  type="button"
                  onClick={() => {
                    setPhase('setup');
                    setPlan(null);
                    setElapsedPerState([]);
                    setStateIndex(0);
                    setProblemIndex(0);
                    setSummaryTable([]);
                    setCheckpoints({});
                    playSound('click');
                  }}
                  data-testid="crucible-again"
                  className="px-3.5 py-2 text-[11px] font-bold rounded-md bg-hazard-500 hover:bg-hazard-400 text-inset transition-colors duration-150 cursor-pointer"
                >
                  Run another sprint
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {phase === 'failed' && (
            <button
              type="button"
              onClick={() => setPhase('setup')}
              className="px-3 py-2 text-[11px] font-mono rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
            >
              Back to the setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
