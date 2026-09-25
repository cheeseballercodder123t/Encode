'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';

/**
 * The 5-Whys Depth Ladder.
 *
 * A first-layer answer to "why?" is almost always a correlation, not a causal
 * model: "because packet loss means congestion" names nothing physical.
 * [ PROBE DEEPER ] interrogates the learner's own wording and asks one question
 * at a time until the chain bottoms out at something that cannot be reduced
 * further — a conservation law, a finite resource, geometry, a dimensional
 * necessity. The learner chooses when to stop; the deepest honest layer is the
 * systemic necessity that belongs on the back of the card.
 *
 * Mounted with `key={activity.id}` by the workbench, so navigating stages
 * resets the ladder without any effect-driven state syncing.
 */

interface LadderRow {
  /** The specific claim in the layer below that this question interrogates. */
  target: string;
  question: string;
  answer: string;
}

interface ProbeLadderProps {
  activity: Activity;
  /** Layer 0: the learner's own answer for this stage. */
  seed: string;
  topicSummary?: string;
  /** Hands the distilled axiom to the workbench (anchor slot or mechanism). */
  onAdopt: (text: string) => void;
}

/** Real ladders bottom out by 3–4; deeper is almost always manufactured. */
const MAX_DEPTH = 4;

export function ProbeLadder({ activity, seed, topicSummary, onAdopt }: ProbeLadderProps) {
  const [rows, setRows] = useState<LadderRow[]>([]);
  const [axiom, setAxiom] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const atBedrock = axiom !== null;
  const lastRow = rows[rows.length - 1];
  const canProbe = !atBedrock && rows.length < MAX_DEPTH && !!lastRow?.answer.trim();

  const probe = async () => {
    if (isProbing) return;
    const answered = rows.map((r) => r.answer.trim()).filter(Boolean);
    const layers = [seed.trim(), ...answered];
    if (layers.length === 0 || !layers[0]) {
      setError('Answer the stage first — the ladder interrogates your own wording.');
      return;
    }

    setIsProbing(true);
    setError(null);
    playSound('click');

    try {
      const res = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageTitle: activity.title,
          framework: activity.framework,
          contextSnippet: activity.contextSnippet,
          prompt: activity.prompt,
          topicSummary,
          layers,
          settings: loadAISettings(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The ladder could not extend.');

      setStarted(true);
      if (data.isAxiom && data.axiom) {
        setAxiom(data.axiom);
        playSound('success');
        return;
      }
      setRows((prev) => [
        ...prev,
        { target: data.target || '', question: data.question, answer: '' },
      ]);
      playSound('pop');
    } catch (e: any) {
      setError(e?.message || 'The ladder could not extend. Check your AI settings.');
    } finally {
      setIsProbing(false);
    }
  };

  const reset = () => {
    playSound('click');
    setRows([]);
    setAxiom(null);
    setError(null);
    setStarted(false);
  };

  return (
    <div className="rounded-md border border-flux-500/40 bg-flux-500/[0.06] p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-flux-300">
          Depth ladder
        </span>
        <span className="font-mono text-[10px] text-solder">
          {atBedrock ? 'bedrock reached' : `layer ${rows.length + 1} / ${MAX_DEPTH}`}
        </span>
      </div>

      {/* Layer 0 : the learner's own answer, quoted back as the premise. */}
      <div className="rounded-md border border-edge bg-inset p-2.5">
        <span className="text-[10px] uppercase tracking-widest text-solder block mb-0.5">
          Layer 0 · your wording
        </span>
        <p className="text-xs text-slate-ink leading-relaxed">{seed.trim() || '—'}</p>
      </div>

      {rows.map((row, i) => (
        <div key={i} className="space-y-1.5">
          <div className="p-2.5 rounded-md border border-flux-500/40 bg-flux-500/[0.08]">
            <span className="text-[10px] uppercase tracking-widest text-flux-300 block mb-0.5">
              Why? · layer {i + 1}
            </span>
            <p className="text-xs text-bone leading-relaxed font-medium">{row.question}</p>
            {row.target && (
              <p className="mt-1 text-[10px] font-mono text-solder">
                targeting: “{row.target}”
              </p>
            )}
          </div>
          <textarea
            value={row.answer}
            onChange={(e) =>
              setRows((prev) =>
                prev.map((r, idx) => (idx === i ? { ...r, answer: e.target.value } : r))
              )
            }
            rows={2}
            disabled={atBedrock}
            placeholder="What physical or mathematical property forces that to be true?"
            data-testid={`probe-answer-${i}`}
            className="w-full p-2.5 bg-inset border border-edge text-bone placeholder-solder text-sm leading-relaxed outline-none focus:border-flux-500/60 rounded-md resize-none transition-colors duration-150 font-sans disabled:opacity-60"
          />
        </div>
      ))}

      {atBedrock && (
        <div className="p-3 rounded-md border border-signal-500/50 bg-signal-950/40 space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-signal-300 block">
            [ AXIOM ] systemic necessity
          </span>
          <p className="text-xs text-bone leading-relaxed">{axiom}</p>
          <button
            type="button"
            onClick={() => {
              onAdopt(axiom || '');
              playSound('success');
            }}
            data-testid="probe-adopt"
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-amber-500 border border-amber-500 text-inset hover:bg-amber-400 transition-colors duration-150 cursor-pointer"
          >
            Use as card anchor
          </button>
        </div>
      )}

      {error && (
        <p className="p-2.5 rounded-md bg-hazard-500/10 border border-hazard-500/40 text-[11px] text-hazard-300 leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!started && (
          <button
            type="button"
            onClick={probe}
            disabled={isProbing || !seed.trim()}
            data-testid="probe-start"
            className="px-3 py-2 text-[11px] font-semibold rounded-md bg-flux-500/15 border border-flux-500/50 text-flux-300 hover:bg-flux-500/25 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
          >
            {isProbing ? 'Probing…' : 'Start ladder'}
          </button>
        )}

        {started && !atBedrock && (
          <button
            type="button"
            onClick={probe}
            disabled={isProbing || !canProbe}
            data-testid="probe-deeper"
            title={
              rows.length >= MAX_DEPTH
                ? 'You are at the depth limit — stop here or take the anchor'
                : 'Interrogate your last layer'
            }
            className="px-3 py-2 text-[11px] font-semibold rounded-md bg-flux-500/15 border border-flux-500/50 text-flux-300 hover:bg-flux-500/25 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
          >
            {isProbing ? 'Probing…' : 'Probe deeper'}
          </button>
        )}

        {started && (
          <button
            type="button"
            onClick={reset}
            className="px-3 py-2 text-[11px] font-medium rounded-md bg-inset border border-edge text-solder hover:text-bone transition-colors duration-150 cursor-pointer"
          >
            Clear ladder
          </button>
        )}
      </div>

      <p className="text-[10px] text-solder leading-relaxed">
        Stop when the next &ldquo;why&rdquo; stops having an honest answer. Two or three layers is
        usually where a correlation becomes a necessity.
      </p>
    </div>
  );
}
