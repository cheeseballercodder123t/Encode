'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DiscriminationCheck, DiscriminationQuestion } from '@/lib/types';
import {
  DISCRIMINATION_SECONDS,
  DiscriminationAnswer,
  buildDiscriminationTrap,
  remainingMs,
  scoreDiscrimination,
} from '@/lib/discrimination';
import { saveInterferenceTrap } from '@/lib/interference-traps';
import { playSound } from '@/lib/audio';

/**
 * The 10-second discrimination gate, in front of every export path.
 *
 * Two blind vignettes — one the stage's concept, one its lookalike — each with a
 * ten-second clock. Ten seconds is the mechanism: a discrimination you hold is
 * immediate, while interference forces deliberation, so the hesitation itself is
 * the evidence. Running out of time counts as unstable, exactly like a miss.
 *
 * A miss does not lock the deck. It asks for the one operational rule that
 * separates the pair, saves it as a trap card that leads the deck (the
 * hypercorrection payoff), and then gets out of the way. The honest escape —
 * exporting flagged `DiscriminationUnstable` with nothing written — is available
 * but never the default.
 *
 * All run state is derived rather than imperative: the answered questions ARE the
 * question index, and each answer records when it landed, so the next clock
 * starts the moment the previous question was settled. Nothing to keep in sync.
 */

interface DiscriminationGateProps {
  /** The check built for this deck (two blind vignettes). */
  check: DiscriminationCheck;
  /** Called once the gate is resolved and the export may proceed. */
  onResolved: (result: { passed: boolean; rule: string }) => void;
  /** Called when the learner backs out without exporting. */
  onCancel: () => void;
  seconds?: number;
}

interface Answered {
  answer: DiscriminationAnswer;
  choseConcept: boolean;
  /** When this answer landed; the next question's clock starts here. */
  endedAt: number;
}

export function DiscriminationGate({
  check,
  onResolved,
  onCancel,
  seconds = DISCRIMINATION_SECONDS,
}: DiscriminationGateProps) {
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [beganAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [ruleDraft, setRuleDraft] = useState('');

  const questions = check.questions;
  // The gate advances by recording, so the count of recorded answers IS the index.
  const index = answers.length;
  const question: DiscriminationQuestion | undefined = questions[index];
  const phase: 'asking' | 'verdict' = question ? 'asking' : 'verdict';
  const limitMs = seconds * 1000;
  const startedAt = index === 0 ? beganAt : answers[index - 1].endedAt;
  const leftMs = question ? remainingMs(startedAt, now, seconds) : 0;

  /**
   * Records one answer. `at` is the question this answer belongs to, so a tick
   * from a clock that has already been superseded (a click and a timeout landing
   * in the same frame) is dropped instead of double-counting.
   */
  const record = useCallback((at: number, choseConcept: boolean, elapsedMs: number) => {
    setAnswers((prev) => {
      if (prev.length !== at) return prev;
      return [
        ...prev,
        {
          answer: {
            questionId: questions[at].id,
            choseConcept,
            elapsedMs,
          },
          choseConcept,
          endedAt: Date.now(),
        },
      ];
    });
  }, [questions]);

  // The clock. One interval while asking; it stops the moment the clock runs out
  // (the question is recorded as a timeout) or the last question is settled.
  useEffect(() => {
    if (phase !== 'asking' || !question) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const elapsed = current - startedAt;
      if (elapsed >= limitMs) {
        // Out of time: record the miss. `scoreDiscrimination` classifies it as a
        // timeout from the elapsed time, so it can never read as a lucky guess.
        // Feedback stays neutral until the verdict: revealing question 1's result
        // early would hand the learner question 2 and break the blind check.
        playSound('pop');
        record(index, !question.answerIsConcept, elapsed);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase, question, index, startedAt, limitMs, record]);

  const finalOutcome = useMemo(
    () => scoreDiscrimination(questions, answers.map((a) => a.answer), seconds),
    [answers, questions, seconds]
  );

  /** A miss or a timeout: the pair is not separated, so the rule is required. */
  const needsRule = phase === 'verdict' && finalOutcome.unstable;
  const saveRule = (rule: string) => {
    const trap = buildDiscriminationTrap(check, finalOutcome, rule);
    saveInterferenceTrap(trap);
    playSound('success');
    onResolved({ passed: false, rule: trap.cardBack });
  };

  return (
    <div className="space-y-3" data-testid="discrimination-gate">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-hazard-300">
          10-second discrimination gate
        </span>
        <span className="font-mono text-[10px] text-solder">
          {check.conceptLabel} vs {check.lookalikeLabel}
        </span>
      </div>

      {phase === 'asking' && question && (
        <div className="space-y-3">
          <p className="text-xs text-solder leading-relaxed">
            One of these two vignettes is <span className="text-bone">{check.conceptLabel}</span>, the
            other is <span className="text-bone">{check.lookalikeLabel}</span>. Classify it before the
            clock runs out — hesitation is the interference this gate exists to find.
          </p>

          {/* The clock: the whole point is that it is short. */}
          <div className="space-y-1.5" data-testid="discrimination-clock">
            <div className="h-1.5 w-full bg-inset border border-edge overflow-hidden">
              <div
                className={`h-full ${leftMs <= 3000 ? 'bg-hazard-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.round((leftMs / limitMs) * 100)}%` }}
                data-testid="discrimination-clock-bar"
              />
            </div>
            <span className="font-mono text-[10px] text-solder">
              question {index + 1} of {questions.length} · {(leftMs / 1000).toFixed(1)}s left
            </span>
          </div>

          <div className="p-3 bg-inset border border-edge rounded-md text-sm text-bone leading-relaxed">
            {question.vignette}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="discrimination-concept"
              onClick={() => {
                playSound('click');
                record(index, true, Date.now() - startedAt);
              }}
              className="px-3 py-2.5 text-xs font-semibold rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 transition-colors duration-150 cursor-pointer"
            >
              This is {check.conceptLabel}
            </button>
            <button
              type="button"
              data-testid="discrimination-lookalike"
              onClick={() => {
                playSound('click');
                record(index, false, Date.now() - startedAt);
              }}
              className="px-3 py-2.5 text-xs font-semibold rounded-md bg-inset border border-edge text-slate-ink hover:text-bone hover:border-solder transition-colors duration-150 cursor-pointer"
            >
              This is {check.lookalikeLabel}
            </button>
          </div>
        </div>
      )}

      {phase === 'verdict' && (
        <div className="space-y-3">
          <div
            data-testid="discrimination-verdict"
            className={`p-3 border rounded-md text-xs leading-relaxed ${
              finalOutcome.passed
                ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
                : 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
            }`}
          >
            <span className="font-semibold block mb-0.5">
              {finalOutcome.passed
                ? 'Both separated, on the clock.'
                : 'Your understanding of this pair is flagged unstable.'}
            </span>
            {finalOutcome.summary}
            {!finalOutcome.passed && (
              <ul className="mt-1.5 space-y-0.5">
                {questions.map((q, i) => {
                  const a = answers[i];
                  const timedOut = !a || a.answer.elapsedMs >= limitMs;
                  const right = a && !timedOut && a.choseConcept === q.answerIsConcept;
                  return (
                    <li key={q.id} className="font-mono text-[10px]">
                      [ {right ? 'OK' : timedOut ? 'TIMEOUT' : 'CONFUSED'} ] {q.rationale}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {needsRule && (
            <div className="space-y-1.5">
              <label
                htmlFor="discrimination-rule"
                className="text-[10px] uppercase tracking-widest text-solder block"
              >
                What single operational rule separates {check.conceptLabel} from{' '}
                {check.lookalikeLabel}?
              </label>
              <textarea
                id="discrimination-rule"
                value={ruleDraft}
                onChange={(e) => setRuleDraft(e.target.value)}
                rows={2}
                placeholder={check.operationalRule || 'The measurement that settles it is …'}
                data-testid="discrimination-rule-input"
                className="w-full p-2.5 bg-inset border border-edge text-bone placeholder-solder text-xs leading-relaxed outline-none focus:border-amber-500/60 rounded-md resize-none transition-colors duration-150 font-sans"
              />
              <p className="text-[10px] text-solder leading-relaxed">
                Writing the rule is the point: it is saved as a trap card and leads the deck, so the
                thing that just fooled you becomes the first thing you review.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {finalOutcome.passed ? (
              <button
                type="button"
                data-testid="discrimination-continue"
                onClick={() => {
                  playSound('click');
                  onResolved({ passed: true, rule: '' });
                }}
                className="px-3 py-2 text-xs font-semibold rounded-md bg-signal-950/40 border border-signal-500/40 text-signal-300 hover:bg-signal-950/70 transition-colors duration-150 cursor-pointer"
              >
                Continue to export
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={ruleDraft.trim().length < 8}
                  data-testid="discrimination-save-rule"
                  onClick={() => saveRule(ruleDraft)}
                  className="px-3 py-2 text-xs font-semibold rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                >
                  Save the rule and export
                </button>
                <button
                  type="button"
                  data-testid="discrimination-export-anyway"
                  onClick={() => {
                    playSound('pop');
                    onResolved({ passed: false, rule: '' });
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-md bg-inset border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  Export anyway (flagged unstable)
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="discrimination-cancel"
              onClick={() => {
                playSound('pop');
                onCancel();
              }}
              className="px-3 py-2 text-xs font-medium rounded-md text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
