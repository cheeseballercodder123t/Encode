'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { SketchCanvas } from './SketchCanvas';
import {
  PrimingDrill,
  PrimingKind,
  PRIMING_KIND_BLURB,
  PRIMING_KIND_LABEL,
  gradePrimingStep,
  isPlayableDrill,
  summarizePriming,
} from '@/lib/priming';

/**
 * Priming warm-ups — four ways to make a formula non-arbitrary before you use it.
 *
 *   shape       · DRAW the curve first (dual coding), then name what it must be
 *   gradient    · a 2-probe polarity check: density source, then electron-poor sink
 *   dimensional · assemble the units to pin whether it is v or v²
 *   extremum    · a 3-probe sweep: push each variable to 0 / ∞
 *
 * The archetype is selectable: an orgo mechanism can DEMAND the source→sink
 * check before arrow pushing, and a physics stage can demand the extremal sweep,
 * instead of taking whatever the examiner felt like writing.
 *
 * Probes play one at a time. Each is one committed choice on a ~10-second
 * timescale, so the whole warm-up stays a pre-flight check. Committing to the
 * intuitive-but-wrong option is the useful outcome: the reveal lands as a
 * prediction error, and the rule goes into the stage answer with one click.
 */

interface PrimingWarmupProps {
  activity: Activity;
  topicSummary?: string;
  /** Sends the transferable rule into the stage answer. */
  onAdopt: (text: string) => void;
}

const KIND_CHIPS: PrimingKind[] = ['shape', 'gradient', 'dimensional', 'extremum'];

export function PrimingWarmup({ activity, topicSummary, onAdopt }: PrimingWarmupProps) {
  const [requestedKind, setRequestedKind] = useState<PrimingKind | null>(null);
  const [drill, setDrill] = useState<PrimingDrill | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [sketchDone, setSketchDone] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playable = drill ? isPlayableDrill(drill) : false;
  const steps = drill?.steps ?? [];
  const step = playable && stepIndex < steps.length ? steps[stepIndex] : undefined;
  const committed = step ? picks[stepIndex] : undefined;
  const verdict = step && committed !== undefined ? gradePrimingStep(step, committed) : null;

  // The drawing is the commitment: until it lands, the probes stay hidden.
  const sketched = sketchDone || !drill?.sketch;
  const finished = playable && sketched && !step && picks.length >= steps.length;
  const summary = finished && drill ? summarizePriming(drill, picks) : null;

  const resetDrill = () => {
    setDrill(null);
    setStepIndex(0);
    setPicks([]);
    setSketchDone(false);
    setError(null);
  };

  const selectKind = (kind: PrimingKind | null) => {
    setRequestedKind(kind);
    resetDrill();
    playSound('click');
  };

  const build = async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setDrill(null);
    setStepIndex(0);
    setPicks([]);
    setSketchDone(false);
    playSound('click');
    try {
      const res = await fetch('/api/priming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageTitle: activity.title,
          framework: activity.framework,
          contextSnippet: activity.contextSnippet,
          prompt: activity.prompt,
          topicSummary,
          kind: requestedKind ?? undefined,
          settings: loadAISettings(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The examiner could not author a warm-up.');
      setDrill(data as PrimingDrill);
      playSound('pop');
    } catch (e: any) {
      setError(e?.message || 'The examiner could not author a warm-up. Check your AI settings.');
    } finally {
      setIsBuilding(false);
    }
  };

  const commitPick = (id: string) => {
    if (!step || committed !== undefined) return;
    setPicks((prev) => [...prev, id]);
    playSound(gradePrimingStep(step, id).correct ? 'success' : 'wrong');
  };

  const advance = () => {
    if (committed === undefined) return;
    setStepIndex((i) => i + 1);
    playSound('click');
  };

  const verdictTone = verdict
    ? verdict.fellForTrap
      ? 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
      : verdict.correct
        ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
        : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
    : '';

  const summaryTone = summary
    ? summary.fellForTrap
      ? 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
      : summary.correct
        ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
        : 'bg-amber-950/30 border-amber-500/40 text-amber-300'
    : '';

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/[0.05] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
          Priming warm-up
        </span>
        {drill && (
          <span className="font-mono text-[10px] text-solder">
            {PRIMING_KIND_LABEL[drill.kind]} · {steps.length} probe{steps.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Archetype selector: the learner picks the drill, the examiner authors it. */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="prime-kind-selector">
        <button
          type="button"
          data-testid="prime-kind-auto"
          aria-pressed={requestedKind === null}
          onClick={() => selectKind(null)}
          title="Let the examiner choose the archetype that fits this stage"
          className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded border transition-colors duration-150 cursor-pointer ${
            requestedKind === null
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
              : 'bg-inset border-edge text-solder hover:text-bone'
          }`}
        >
          Auto
        </button>
        {KIND_CHIPS.map((kind) => (
          <button
            key={kind}
            type="button"
            data-testid={`prime-kind-${kind}`}
            aria-pressed={requestedKind === kind}
            onClick={() => selectKind(kind)}
            title={PRIMING_KIND_BLURB[kind]}
            className={`px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded border transition-colors duration-150 cursor-pointer ${
              requestedKind === kind
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                : 'bg-inset border-edge text-solder hover:text-bone'
            }`}
          >
            {PRIMING_KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      {requestedKind && !drill && (
        <p className="text-[11px] text-solder leading-relaxed">{PRIMING_KIND_BLURB[requestedKind]}</p>
      )}

      {!drill && !requestedKind && (
        <p className="text-xs text-solder leading-relaxed">
          One committed prediction before the formula: draw the curve, find the density source, assemble
          the units, or push a variable to its extreme. Pick the drill or let the examiner choose — one
          probe at a time, no typing.
        </p>
      )}

      {drill && (
        <>
          <div className="p-2.5 rounded-md bg-inset border border-edge space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-solder block">
              {PRIMING_KIND_LABEL[drill.kind]}
            </span>
            <p className="text-xs text-slate-ink leading-relaxed">{drill.setup}</p>
          </div>

          {/* Shape: the hand commits before the symbols arrive. */}
          {drill.sketch && !sketched && (
            <div
              data-testid="prime-sketch"
              className="p-2.5 rounded-md bg-inset border border-amber-500/40 space-y-2"
            >
              <span className="text-[10px] uppercase tracking-widest text-amber-300 block">
                Draw it first
              </span>
              <p className="text-sm font-medium text-bone leading-relaxed">{drill.sketch.prompt}</p>
              {drill.sketch.axes && (
                <p className="font-mono text-[10px] text-solder">{drill.sketch.axes}</p>
              )}
              <SketchCanvas />
              <button
                type="button"
                data-testid="prime-sketch-commit"
                onClick={() => {
                  setSketchDone(true);
                  playSound('click');
                }}
                className="px-3 py-2 text-[11px] font-semibold rounded-md bg-amber-500 border border-amber-500 text-inset hover:bg-amber-400 transition-colors duration-150 cursor-pointer"
              >
                Commit the shape
              </button>
              <p className="text-[10px] text-solder leading-relaxed">
                Nothing here is graded: the drawing IS the commitment. The probes check the property your
                curve has to satisfy.
              </p>
            </div>
          )}

          {sketched && step && (
            <>
              {steps.length > 1 && (
                <div
                  data-testid="prime-progress"
                  className="flex items-center gap-2 font-mono text-[10px] text-solder"
                >
                  <span>
                    probe {stepIndex + 1} / {steps.length}
                  </span>
                  <span className="flex-1 h-px bg-edge" />
                </div>
              )}

              <p className="text-sm font-medium text-bone leading-relaxed">{step.prompt}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {step.choices.map((choice, i) => {
                  const isPicked = committed === choice.id;
                  const isTruth = choice.id === step.correctChoiceId;
                  const revealed = committed !== undefined;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => commitPick(choice.id)}
                      disabled={revealed}
                      data-testid={`prime-choice-${i}`}
                      className={`text-left p-2.5 rounded-md border text-xs leading-relaxed transition-colors duration-150 cursor-pointer disabled:cursor-default ${
                        revealed && isTruth
                          ? 'bg-signal-950/40 border-signal-500/50 text-bone'
                          : isPicked
                            ? 'bg-hazard-950/30 border-hazard-500/50 text-bone'
                            : 'bg-inset border-edge text-slate-ink hover:border-slate-ink/40 hover:text-bone'
                      }`}
                    >
                      <span className="font-mono text-[10px] text-solder mr-1.5">
                        {'ABCDE'[i]}.
                      </span>
                      {choice.label}
                      {revealed && isTruth && (
                        <span className="block mt-1 font-mono text-[10px] text-signal-300 uppercase tracking-widest">
                          [ forced by the physics ]
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {verdict && (
                <div className="space-y-2.5">
                  <div
                    className={`p-2.5 rounded-md border text-xs leading-relaxed ${verdictTone}`}
                    data-testid="prime-verdict"
                  >
                    <span className="font-semibold block mb-0.5">
                      {verdict.correct
                        ? 'Forced, not memorized.'
                        : verdict.fellForTrap
                          ? 'That is the trap.'
                          : 'Not quite — here is what forces it.'}
                    </span>
                    {verdict.fellForTrap && verdict.trapExplanation && (
                      <p className="mb-1.5">{verdict.trapExplanation}</p>
                    )}
                    {verdict.reveal}
                  </div>

                  <button
                    type="button"
                    data-testid="prime-next"
                    onClick={advance}
                    className="px-3 py-2 text-[11px] font-semibold rounded-md bg-inset border border-edge text-bone hover:border-amber-500/50 hover:text-amber-200 transition-colors duration-150 cursor-pointer"
                  >
                    {stepIndex + 1 < steps.length ? 'Next probe' : 'See the rule'}
                  </button>
                </div>
              )}
            </>
          )}

          {finished && summary && (
            <div className="space-y-2.5">
              <div
                data-testid="prime-summary"
                className={`p-2.5 rounded-md border text-xs leading-relaxed font-mono ${summaryTone}`}
              >
                {summary.summary}
              </div>

              {drill.sketch && (drill.sketch.shapeLabel || drill.sketch.shapeHint) && (
                <div
                  data-testid="prime-shape-reveal"
                  className="p-2.5 rounded-md bg-inset border border-edge space-y-1"
                >
                  <span className="text-[10px] uppercase tracking-widest text-solder block">
                    Your curve should look like
                  </span>
                  {drill.sketch.shapeLabel && (
                    <p className="text-xs text-bone leading-relaxed">{drill.sketch.shapeLabel}</p>
                  )}
                  {drill.sketch.shapeHint && (
                    <p className="text-[11px] text-slate-ink leading-relaxed">{drill.sketch.shapeHint}</p>
                  )}
                </div>
              )}

              {summary.principle && (
                <div className="p-2.5 rounded-md bg-inset border border-edge space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-amber-300 block">
                    Carry this rule
                  </span>
                  <p className="text-xs text-bone leading-relaxed">{summary.principle}</p>
                  <button
                    type="button"
                    data-testid="prime-adopt"
                    onClick={() => {
                      onAdopt(summary.principle);
                      playSound('success');
                    }}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-amber-500 border border-amber-500 text-inset hover:bg-amber-400 transition-colors duration-150 cursor-pointer"
                  >
                    Send the rule to the answer
                  </button>
                </div>
              )}

              {drill.cardFront && (
                <p className="font-mono text-[10px] text-solder leading-relaxed">
                  trap card → {drill.cardFront}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <p className="p-2.5 rounded-md bg-hazard-500/10 border border-hazard-500/40 text-[11px] text-hazard-300 leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={build}
          disabled={isBuilding}
          data-testid="prime-build"
          className="px-3 py-2 text-[11px] font-semibold rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
        >
          {isBuilding ? 'Finding the non-arbitrary part…' : drill ? 'New warm-up' : 'Prime this stage'}
        </button>
        {drill && !playable && (
          <span className="text-[10px] text-solder">
            The examiner returned an unusable warm-up — try another.
          </span>
        )}
      </div>
    </div>
  );
}
