'use client';

import React, { useMemo, useState } from 'react';
import { Activity, ParsonsResult } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import { scrambleParsons, gradeParsons, describeParsonsFix, formatParsonsChain } from '@/lib/parsons';

/**
 * Scrambled causal ordering (Parsons problem).
 *
 * Zero typing: the steps are all there, in the wrong order, and the only
 * question is which link forces the next. Research on Parsons problems puts the
 * learning gains within noise of writing the mechanism from scratch — at a
 * fraction of the effort — which makes this the right drill for a high-intensity
 * day when an essay-length answer is not going to happen.
 *
 * The scramble is deterministic (seeded on the stage id), so a reload shows the
 * same puzzle; the canonical order never reaches the client as an ordered list
 * the DOM reveals — the answer is checked positionally, and the chain only
 * lands in the stage answer once it is right.
 */

interface CausalSequenceProps {
  activity: Activity;
  topicSummary?: string;
  /** The locked chain (or the pivot rule) lands in the stage answer. */
  onAdopt: (text: string) => void;
}

export function CausalSequence({ activity, topicSummary, onAdopt }: CausalSequenceProps) {
  const [drill, setDrill] = useState<ParsonsResult | null>(null);
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [ruleDraft, setRuleDraft] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deterministic shuffle: same stage, same puzzle, reload after reload.
  const scrambled = useMemo(
    () => (drill ? scrambleParsons(drill.steps, activity.id || drill.title) : []),
    [drill, activity.id]
  );

  const byId = useMemo(() => new Map(scrambled.map((t) => [t.id, t])), [scrambled]);
  const remaining = scrambled.filter((t) => !placed.includes(t.id));

  const grade = useMemo(() => {
    if (!drill) return null;
    return gradeParsons(placed, drill.steps.map((s) => s.id));
  }, [drill, placed]);

  const build = async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setPlaced([]);
    setChecked(false);
    setRuleDraft('');
    playSound('click');
    try {
      const res = await fetch('/api/sequence', {
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
      if (!res.ok) throw new Error(data.error || 'The examiner could not build the chain.');
      setDrill(data as ParsonsResult);
      playSound('pop');
    } catch (e: any) {
      setError(e?.message || 'The examiner could not build the chain. Check your AI settings.');
    } finally {
      setIsBuilding(false);
    }
  };

  const place = (id: string) => {
    if (checked) return;
    setPlaced((prev) => [...prev, id]);
    playSound('click');
  };

  const unplace = (id: string) => {
    if (checked) return;
    setPlaced((prev) => prev.filter((p) => p !== id));
    playSound('pop');
  };

  const check = () => {
    if (!drill || placed.length === 0) return;
    setChecked(true);
    playSound(grade?.correct ? 'success' : 'wrong');
  };

  const adopted = checked && grade?.correct;

  return (
    <div className="rounded-md border border-flux-500/40 bg-flux-500/[0.06] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-flux-300">
          Scrambled causal order
        </span>
        {drill && (
          <span className="font-mono text-[10px] text-solder">
            {placed.length} of {drill.steps.length} placed
          </span>
        )}
      </div>

      {!drill && (
        <p className="text-xs text-solder leading-relaxed">
          The examiner breaks the mechanism into 4–6 steps and scrambles them. Number them into the
          order the physics forces — no typing, just structure.
        </p>
      )}

      {drill && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-widest text-solder">chain</span>
            <span className="text-xs font-semibold text-bone">{drill.title}</span>
          </div>

          {/* The learner's chain so far — the place the answer actually forms. */}
          <ol className="space-y-1.5" data-testid="sequence-placed">
            {placed.length === 0 && (
              <li className="text-[11px] font-mono text-solder">[ tap steps below in causal order ]</li>
            )}
            {placed.map((id, i) => {
              const tile = byId.get(id);
              const isWrong = checked && !grade?.correct && grade?.misplaced.includes(i);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => unplace(id)}
                    disabled={checked}
                    data-testid={`sequence-slot-${i}`}
                    className={`w-full text-left p-2.5 rounded-md border text-xs leading-relaxed transition-colors duration-150 cursor-pointer disabled:cursor-default ${
                      isWrong
                        ? 'bg-hazard-500/15 border-hazard-500/60 text-hazard-200'
                        : 'bg-inset border-edge text-bone hover:border-solder'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-solder mr-1.5">{i + 1}.</span>
                    {tile?.text}
                    {isWrong && (
                      <span className="block mt-1 font-mono text-[10px] text-hazard-300 uppercase tracking-widest">
                        [ wrong link ]
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {remaining.length > 0 && (
            <div className="space-y-1.5" data-testid="sequence-pool">
              <span className="text-[10px] uppercase tracking-widest text-solder block">
                Unplaced steps
              </span>
              {remaining.map((tile, i) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => place(tile.id)}
                  data-testid={`sequence-tile-${i}`}
                  className="w-full text-left p-2.5 rounded-md border border-edge bg-deck text-xs text-slate-ink leading-relaxed hover:border-flux-500/50 hover:text-bone transition-colors duration-150 cursor-pointer"
                >
                  {tile.text}
                </button>
              ))}
            </div>
          )}

          {checked && grade && (
            <div
              data-testid="sequence-verdict"
              className={`p-2.5 rounded-md border text-xs leading-relaxed ${
                grade.correct
                  ? 'bg-signal-950/40 border-signal-500/40 text-signal-300'
                  : 'bg-hazard-950/40 border-hazard-500/40 text-hazard-300'
              }`}
            >
              <span className="font-semibold block mb-0.5">
                {grade.correct
                  ? 'Chain locked.'
                  : `${grade.correctPositions} of ${drill.steps.length} links in place.`}
              </span>
              {grade.correct ? drill.summary : describeParsonsFix(placed, drill.steps)}
            </div>
          )}

          {/* Wrong order: the pivot rule is the thing worth writing down. */}
          {checked && !grade?.correct && (
            <div className="space-y-1.5">
              <label
                htmlFor="sequence-rule"
                className="text-[10px] uppercase tracking-widest text-solder block"
              >
                In one sentence, what forces the link you missed?
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="sequence-rule"
                  type="text"
                  value={ruleDraft}
                  onChange={(e) => setRuleDraft(e.target.value)}
                  placeholder={drill.pivotRule || 'Because it cannot be otherwise: ...'}
                  data-testid="sequence-rule-input"
                  className="flex-1 min-w-0 p-2.5 bg-inset border border-edge text-bone placeholder-solder text-xs outline-none focus:border-flux-500/60 rounded-md transition-colors duration-150 font-sans"
                />
                <button
                  type="button"
                  disabled={!ruleDraft.trim()}
                  onClick={() => {
                    onAdopt(ruleDraft.trim());
                    setRuleDraft('');
                    playSound('success');
                  }}
                  className="px-3 py-2.5 text-xs font-semibold rounded-md bg-flux-500/20 border border-flux-500/50 text-flux-300 hover:bg-flux-500/30 transition-colors duration-150 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  Add to answer
                </button>
              </div>
              {drill.pivotRule && (
                <p className="text-[10px] text-solder leading-relaxed">
                  Examiner&apos;s necessity: {drill.pivotRule}
                </p>
              )}
            </div>
          )}

          {adopted && (
            <button
              type="button"
              onClick={() => {
                onAdopt(formatParsonsChain(drill.steps));
                playSound('success');
              }}
              data-testid="sequence-adopt"
              className="px-3 py-2 text-[11px] font-semibold rounded-md bg-signal-950/40 border border-signal-500/40 text-signal-300 hover:bg-signal-950/70 transition-colors duration-150 cursor-pointer"
            >
              Put the chain on the card
            </button>
          )}

          {!checked && placed.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={check}
                data-testid="sequence-check"
                className="px-3 py-2 text-[11px] font-semibold rounded-md bg-flux-500/20 border border-flux-500/50 text-flux-300 hover:bg-flux-500/30 transition-colors duration-150 cursor-pointer"
              >
                Check order
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaced([]);
                  playSound('pop');
                }}
                className="px-3 py-2 text-[11px] font-semibold rounded-md border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
              >
                Reset
              </button>
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
        data-testid="sequence-build"
        className="px-3 py-2 text-[11px] font-semibold rounded-md bg-flux-500/15 border border-flux-500/50 text-flux-300 hover:bg-flux-500/25 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
      >
        {isBuilding ? 'Scrambling…' : drill ? 'New chain' : 'Scramble the chain'}
      </button>
    </div>
  );
}
