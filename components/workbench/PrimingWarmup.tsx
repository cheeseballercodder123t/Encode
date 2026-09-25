'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import {
  PrimingDrill,
  PRIMING_KIND_LABEL,
  gradePrimingPick,
  isPlayableDrill,
} from '@/lib/priming';

/**
 * Priming warm-ups — four ways to make a formula non-arbitrary before you use it.
 *
 *   shape       · sketch the curve before the algebra
 *   gradient    · find the density source and the electron-poor sink
 *   dimensional · assemble the units to pin whether it is v or v²
 *   extremum    · push a variable to 0 / ∞ to pin numerator vs denominator
 *
 * Each drill is one committed choice on a ~10-second timescale, so it works even
 * on a drained day. Committing to the intuitive-but-wrong option is the useful
 * outcome: the reveal lands as a prediction error, and the rule goes straight
 * into the stage answer with one click.
 */

interface PrimingWarmupProps {
  activity: Activity;
  topicSummary?: string;
  /** Sends the transferable rule into the stage answer. */
  onAdopt: (text: string) => void;
}

export function PrimingWarmup({ activity, topicSummary, onAdopt }: PrimingWarmupProps) {
  const [drill, setDrill] = useState<PrimingDrill | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setPicked(null);
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

  const playable = drill ? isPlayableDrill(drill) : false;
  const verdict = drill && picked ? gradePrimingPick(drill, picked) : null;

  const pick = (id: string) => {
    if (picked || !drill) return;
    setPicked(id);
    playSound(gradePrimingPick(drill, id).correct ? 'success' : 'wrong');
  };

  const verdictTone = verdict
    ? verdict.fellForTrap
      ? 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
      : verdict.correct
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
            {PRIMING_KIND_LABEL[drill.kind]}
          </span>
        )}
      </div>

      {!drill && (
        <p className="text-xs text-solder leading-relaxed">
          One committed prediction before the formula: sketch the shape, find the density source,
          assemble the units, or push a variable to its extreme. Ten seconds, no typing.
        </p>
      )}

      {drill && (
        <>
          <div className="p-2.5 rounded-md bg-inset border border-edge space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-solder block">
              {PRIMING_KIND_LABEL[drill.kind]}
            </span>
            <p className="text-xs text-slate-ink leading-relaxed">{drill.setup}</p>
            <p className="text-sm font-medium text-bone leading-relaxed">{drill.prompt}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {drill.choices.map((choice, i) => {
              const isPicked = picked === choice.id;
              const isTruth = choice.id === drill.correctChoiceId;
              const revealed = picked !== null;
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => pick(choice.id)}
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

              {verdict.principle && (
                <div className="p-2.5 rounded-md bg-inset border border-edge space-y-2">
                  <span className="text-[10px] uppercase tracking-widest text-amber-300 block">
                    Carry this rule
                  </span>
                  <p className="text-xs text-bone leading-relaxed">{verdict.principle}</p>
                  <button
                    type="button"
                    data-testid="prime-adopt"
                    onClick={() => {
                      onAdopt(verdict.principle);
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
