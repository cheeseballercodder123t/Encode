'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, Badge } from '@/components/ui';
import { loadAISettings } from '@/lib/storage';
import { playSound } from '@/lib/audio';
import {
  TriageKind,
  TriageReport,
  TriageUnit,
  TRIAGE_KIND_LABEL,
  countTriageWords,
  stripNoise,
  validateTriageReport,
} from '@/lib/triage';

/**
 * The Fluff Guillotine — a 1-click semantic heatmap over the source text.
 *
 * Before the encoder ever sees your notes, the triage pass sorts every unit
 * into causal kernels, supporting evidence and syntactic noise, then strikes
 * the noise through so you can see exactly how much of the handout was
 * throat-clearing. [ STRIP NOISE ] drops it and hands the dense core back to
 * the launchpad, so the stages that come out are built from the load-bearing
 * material instead of a diluted average of the whole document.
 *
 * Clicking any unit flips it between noise and kept, so the guillotine is
 * always a suggestion you can override rather than an edit you cannot undo.
 */

interface FluffGuillotineModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: string;
  /** Receives the stripped source; '' means the caller keeps its own text. */
  onApply: (cleaned: string) => void;
}

const KIND_ACCENT: Record<TriageKind, string> = {
  kernel: 'border-l-signal-500/70',
  evidence: 'border-l-amber-500/70',
  noise: 'border-l-hazard-500/70',
};

const KIND_BADGE: Record<TriageKind, 'signal' | 'amber' | 'hazard'> = {
  kernel: 'signal',
  evidence: 'amber',
  noise: 'hazard',
};

export function FluffGuillotineModal({ isOpen, onClose, notes, onApply }: FluffGuillotineModalProps) {
  const [report, setReport] = useState<TriageReport | null>(null);
  const [overrides, setOverrides] = useState<Record<number, TriageKind>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- opening the modal starts a request: the loading/reset flags belong to that request, not to props */
  useEffect(() => {
    if (!isOpen) return;
    if (!notes.trim()) return;
    let cancelled = false;
    setReport(null);
    setOverrides({});
    setError(null);
    setLoading(true);

    (async () => {
      try {
        const res = await fetch('/api/triage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: notes,
            topicSummary: notes.trim().slice(0, 80),
            settings: loadAISettings(),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'The triage pass failed.');
        // Validate at the render boundary as well: verdicts are merged onto the
        // deterministic segmentation, so the heatmap always renders the exact
        // source strings even if a payload arrives without them (and a
        // malformed reply can never take the whole page down with it).
        setReport(validateTriageReport(data, notes));
        playSound('pop');
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'The triage pass failed. Check your AI settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, notes]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const units: TriageUnit[] = report
    ? report.units.map((u) => ({ ...u, kind: overrides[u.index] ?? u.kind }))
    : [];

  const noiseCount = units.filter((u) => u.kind === 'noise').length;
  const keptWords = units
    .filter((u) => u.kind !== 'noise')
    .reduce((sum, u) => sum + countTriageWords(u.text), 0);
  const totalWords = units.reduce((sum, u) => sum + countTriageWords(u.text), 0);
  const noisePct = totalWords > 0 ? Math.round(((totalWords - keptWords) / totalWords) * 100) : 0;

  const toggle = (index: number, current: TriageKind) => {
    playSound('click');
    setOverrides((prev) => ({ ...prev, [index]: current === 'noise' ? 'kernel' : 'noise' }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fluff Guillotine"
      description="Semantic heatmap of the source — cut the throat-clearing before encoding"
      maxWidth="2xl"
      icon={<span className="font-mono text-xs font-bold">[//]</span>}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Keep everything
          </Button>
          <Button
            variant="amber"
            size="sm"
            disabled={!report || noiseCount === 0}
            data-testid="guillotine-strip"
            onClick={() => {
              playSound('success');
              onApply(stripNoise(units, notes));
            }}
          >
            {noiseCount === 0 ? 'Nothing to strip' : `Strip ${noiseCount} noise block${noiseCount === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-solder leading-relaxed">
          Kernel = a causal transition, definition or equation. Evidence = a datum that supports one.
          Everything else is preamble, anecdote or recap. Click any block to flip it back.
        </p>

        {loading && (
          <div className="p-4 bg-inset border border-edge rounded-md font-mono text-[11px] text-amber-300">
            [ TRIAGE ] reading {countTriageWords(notes).toLocaleString()} words…
          </div>
        )}

        {error && (
          <div className="p-3 bg-hazard-500/10 border border-hazard-500/40 rounded-md text-xs text-hazard-300 leading-relaxed">
            {error}
          </div>
        )}

        {report && !loading && (
          <>
            <div className="p-3 bg-inset border border-edge rounded-md space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="signal">{report.stats.kernel} kernels</Badge>
                <Badge variant="amber">{report.stats.evidence} evidence</Badge>
                <Badge variant="hazard">{report.stats.noise} noise</Badge>
                <span className="ml-auto font-mono text-[11px] text-bone">
                  {noisePct}% noise stripped
                </span>
              </div>
              <p className="text-xs text-slate-ink leading-relaxed">{report.summary}</p>
            </div>

            <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
              {units.map((unit) => {
                const noise = unit.kind === 'noise';
                return (
                  <button
                    key={unit.index}
                    type="button"
                    onClick={() => toggle(unit.index, unit.kind)}
                    data-testid={`triage-unit-${unit.index}`}
                    title={noise ? 'Restore this block' : 'Mark this block as noise'}
                    className={`w-full text-left p-2.5 rounded-md border border-edge border-l-2 bg-inset transition-colors duration-150 cursor-pointer hover:border-slate-ink/40 ${KIND_ACCENT[unit.kind]}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={KIND_BADGE[unit.kind]} size="xs">
                        {TRIAGE_KIND_LABEL[unit.kind]}
                      </Badge>
                      <span className="font-mono text-[10px] text-solder">
                        {countTriageWords(unit.text)}w
                      </span>
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        noise ? 'text-solder line-through decoration-hazard-500/60' : 'text-bone'
                      }`}
                    >
                      {unit.text}
                    </p>
                    {unit.note && (
                      <p className="mt-1 font-mono text-[10px] text-solder">→ {unit.note}</p>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-solder leading-relaxed">
              {keptWords.toLocaleString()} of {totalWords.toLocaleString()} words survive the cut —
              that is what the encoder will actually read.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

export default FluffGuillotineModal;
