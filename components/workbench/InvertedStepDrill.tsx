'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';

/**
 * Spot the Inverted Step — adversarial discriminative repair.
 *
 * Generating from a blank box is exhausting; critically evaluating a wrong
 * chain is not. The examiner writes the mechanism as 4 causal steps and
 * falsifies exactly one, subtly. The learner clicks the step they believe is
 * the lie and writes the one-sentence fix. Recognition first, production
 * second, in that order — which is exactly the order a drained day can manage.
 */

interface DrillStep {
  id: string;
  text: string;
}

interface DrillPayload {
  title: string;
  steps: DrillStep[];
  falsifiedStepId: string;
  flawType: string;
  whyFalsified: string;
  correctVersion: string;
}

interface InvertedStepDrillProps {
  activity: Activity;
  topicSummary?: string;
  /** The learner's one-sentence fix lands in the mechanism answer. */
  onFix: (fix: string) => void;
}

export function InvertedStepDrill({ activity, topicSummary, onFix }: InvertedStepDrillProps) {
  const [drill, setDrill] = useState<DrillPayload | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [fix, setFix] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setPicked(null);
    setFix('');
    playSound('click');
    try {
      const res = await fetch('/api/invert-step', {
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
      if (!res.ok) throw new Error(data.error || 'The examiner could not build the drill.');
      setDrill(data);
      playSound('pop');
    } catch (e: any) {
      setError(e?.message || 'The examiner could not build the drill. Check your AI settings.');
    } finally {
      setIsBuilding(false);
    }
  };

  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    if (id === drill?.falsifiedStepId) playSound('success');
    else playSound('wrong');
  };

  const caught = picked !== null && picked === drill?.falsifiedStepId;

  return (
    <div className="rounded-md border border-hazard-500/40 bg-hazard-500/[0.06] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-hazard-300">
          Spot the inverted step
        </span>
        {drill && (
          <span className="font-mono text-[10px] text-solder">
            one of {drill.steps.length} steps is false
          </span>
        )}
      </div>

      {!drill && (
        <p className="text-xs text-solder leading-relaxed">
          The examiner writes the mechanism in four causal steps and quietly falsifies exactly one.
          Find the lie, then write the one-sentence fix — no blank page required.
        </p>
      )}

      {drill && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-widest text-solder">chain</span>
            <span className="text-xs font-semibold text-bone">{drill.title}</span>
          </div>

          <ol className="space-y-1.5">
            {drill.steps.map((step, i) => {
              const isPicked = picked === step.id;
              const isLie = step.id === drill.falsifiedStepId;
              const revealed = picked !== null;
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => pick(step.id)}
                    disabled={revealed}
                    data-testid={`invert-step-${i}`}
                    className={`w-full text-left p-2.5 rounded-md border text-xs leading-relaxed transition-colors duration-150 cursor-pointer disabled:cursor-default ${
                      revealed && isLie
                        ? 'bg-hazard-500/15 border-hazard-500/60 text-hazard-200'
                        : isPicked
                          ? 'bg-inset border-amber-500/60 text-bone'
                          : 'bg-inset border-edge text-slate-ink hover:border-slate-ink/40 hover:text-bone'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-solder mr-1.5">
                      {i + 1}.
                    </span>
                    {step.text}
                    {revealed && isLie && (
                      <span className="block mt-1 font-mono text-[10px] text-hazard-300 uppercase tracking-widest">
                        [ the lie ]
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {picked && (
            <div className="space-y-2.5">
              <div
                className={`p-2.5 rounded-md border text-xs leading-relaxed ${
                  caught
                    ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
                    : 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
                }`}
                data-testid="invert-verdict"
              >
                <span className="font-semibold block mb-0.5">
                  {caught ? 'Caught it.' : 'That step is honest.'}
                </span>
                {drill.whyFalsified}
              </div>

              {drill.correctVersion && (
                <div className="p-2.5 rounded-md bg-inset border border-edge text-xs text-bone leading-relaxed">
                  <span className="text-[10px] uppercase tracking-widest text-amber-300 block mb-0.5">
                    The honest step
                  </span>
                  {drill.correctVersion}
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="invert-fix"
                  className="text-[10px] uppercase tracking-widest text-solder block"
                >
                  Write the one-sentence fix
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="invert-fix"
                    type="text"
                    value={fix}
                    onChange={(e) => setFix(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fix.trim()) {
                        e.preventDefault();
                        onFix(fix.trim());
                        setFix('');
                        playSound('success');
                      }
                    }}
                    placeholder="The flaw is that ... — it should be ..."
                    data-testid="invert-fix-input"
                    className="flex-1 min-w-0 p-2.5 bg-inset border border-edge text-bone placeholder-solder text-xs outline-none focus:border-amber-500/60 rounded-md transition-colors duration-150 font-sans"
                  />
                  <button
                    type="button"
                    disabled={!fix.trim()}
                    onClick={() => {
                      onFix(fix.trim());
                      setFix('');
                      playSound('success');
                    }}
                    className="px-3 py-2.5 text-xs font-semibold rounded-md bg-amber-500 border border-amber-500 text-inset hover:bg-amber-400 transition-colors duration-150 disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    Add to answer
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="p-2.5 rounded-md bg-hazard-500/10 border border-hazard-500/40 text-[11px] text-hazard-300 leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={build}
        disabled={isBuilding}
        data-testid="invert-build"
        className="px-3 py-2 text-[11px] font-semibold rounded-md bg-hazard-500/15 border border-hazard-500/50 text-hazard-300 hover:bg-hazard-500/25 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
      >
        {isBuilding ? 'Building drill…' : drill ? 'New chain' : 'Build a rigged chain'}
      </button>
    </div>
  );
}
