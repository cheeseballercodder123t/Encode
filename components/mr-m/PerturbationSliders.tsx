'use client';

import React, { useState } from 'react';
import type { InterventionProps } from '@/lib/mr-m/registry';
import { payloadFor } from '@/lib/mr-m/registry';
import type { PerturbationVariable } from '@/lib/mr-m/types';
import { evaluatePerturbation } from '@/lib/mr-m/perturbation';

// ─── What-if perturbation sliders ───────────────────────────────────────────
//
// Proportional reasoning is this learner's strength, so the surface exploits it
// directly: hold the invariant still, move ONE variable, and make the readout
// move instead. The arithmetic runs in `lib/mr-m/perturbation.ts`, client-side
// and pure, so dragging a slider never costs a model call.
//
// The teaching point is the CONTRAST, so the invariant is rendered as fixed
// script (mono, muted, never recomputed) while the readout is the only thing on
// the panel that changes colour as you drag. Nothing here is a number to
// memorise; it is the shape of the dependence.

/** Sensible drag bounds for one variable, always a non-degenerate range. */
function bounds(v: PerturbationVariable): { lo: number; hi: number; step: number } {
  const lo = typeof v.min === 'number' ? v.min : v.base / 4;
  let hi = typeof v.max === 'number' ? v.max : v.base * 4;
  // A zero-valued base would otherwise collapse the range to a single point the
  // learner cannot drag; fall back to a unit-wide window instead.
  if (!(hi > lo)) hi = lo + (Math.abs(lo) || 1);
  const step = (hi - lo) / 200 || (Math.abs(hi) || 1) / 200;
  return { lo, hi, step };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Compact display number: 4 significant digits, exponential only at the edges. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '−∞';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e-4 && abs < 1e6) return String(Number(n.toPrecision(4)));
  return n.toExponential(2);
}

/** How the variable enters the invariant, as a small superscript hint. */
function exponentHint(exponent: number): string {
  const sup = exponent === 1 ? '¹' : exponent === -1 ? '⁻¹' : exponent === 2 ? '²' : exponent === -2 ? '⁻²' : `^${exponent}`;
  return `${sup}${exponent < 0 ? ' (denominator)' : ''}`;
}

interface Preset {
  id: string;
  label: string;
  /** 'limit' means this variable's own extreme, on the side that stresses it. */
  kind: 'base' | 'x2' | 'div2' | 'limit';
}

const PRESETS: Preset[] = [
  { id: 'base', label: 'base', kind: 'base' },
  { id: 'x2', label: '×2', kind: 'x2' },
  { id: 'div2', label: '÷2', kind: 'div2' },
  { id: 'limit', label: '→ limit', kind: 'limit' },
];

/**
 * Memoised, and this is the panel that needs it most: it draws up to six range
 * inputs and four preset buttons each, and the workbench re-renders on every
 * keystroke in the answer fields. Without this, thirty buttons were rebuilt per
 * character typed in a field this panel does not read.
 */
export const PerturbationSliders = React.memo(PerturbationSlidersInner);

function PerturbationSlidersInner({ activity }: InterventionProps) {
  const model = payloadFor(activity)?.perturbation;
  const variables = model?.variables ?? [];

  // Home position is every variable's own base, so the readout starts at exactly
  // ×1.00 and any movement is the learner's own doing.
  const bases: Record<string, number> = {};
  for (const v of variables) bases[v.symbol] = v.base;

  const [values, setValues] = useState<Record<string, number>>(bases);
  // Re-home when the stage's model changes: a stale slider set would show one
  // stage's numbers on another stage's invariant. The comparison is a string
  // SIGNATURE rather than the object identity — `payloadFor` returns the
  // payload by reference today, but a caller that rebuilds the activity object
  // would otherwise re-home on every render and loop.
  const modelKey = model
    ? `${model.invariant}|${model.variables
        .map((v) => `${v.symbol}:${v.base}:${v.exponent}`)
        .join(',')}`
    : '';
  const [prevKey, setPrevKey] = useState(modelKey);
  if (prevKey !== modelKey) {
    setPrevKey(modelKey);
    setValues(bases);
  }

  if (!model || variables.length === 0) return null;

  // Evaluated straight through, with no manual memo: the panel itself is
  // memoised, so this runs when a slider moves and not when a keystroke lands
  // in an answer field three columns away. Six multiplications is not the cost
  // here — redrawing thirty preset buttons on every keystroke was.
  const readout = evaluatePerturbation(model, values);

  const dirty = variables.some((v) => (values[v.symbol] ?? v.base) !== v.base);

  const setValue = (symbol: string, next: number, lo: number, hi: number) => {
    setValues((prev) => ({ ...prev, [symbol]: clamp(next, lo, hi) }));
  };

  const resolvedPreset = (v: PerturbationVariable, preset: Preset, lo: number, hi: number): number => {
    // `→ limit` means the true end of this variable's own range, on the side
    // that stresses the invariant: a denominator goes to zero, everything else
    // goes to its maximum.
    switch (preset.kind) {
      case 'limit':
        return v.exponent < 0 ? lo : hi;
      case 'base':
        return v.base;
      case 'x2':
        return v.base * 2;
      default:
        return v.base / 2;
    }
  };

  return (
    <section className="rounded-2xl border border-edge/60 bg-deck/50 p-4 space-y-3" data-testid="mr-m-sliders">
      <div>
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300">
          What-if perturbation
        </span>
        <p className="text-[11px] text-solder leading-snug mt-1">
          Push one variable to its limit and watch the invariant hold.
        </p>
      </div>

      {/* The invariant is fixed script: it is quoted, never recomputed, and it
          looks the same whatever the sliders do. That stillness is the lesson. */}
      <p
        className="font-mono text-xs text-slate-ink bg-inset/70 border border-edge/60 rounded-lg px-3 py-2"
        data-testid="mr-m-invariant"
      >
        {model.invariant}
      </p>

      {/* One live region around the readout and its sentence: the readout is
          the only thing that changes as a slider moves, so it is the thing a
          screen reader has to be told about. */}
      <div className="space-y-1" role="status" aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-solder">Readout</span>
          <span className="font-mono text-base font-bold text-amber-300" data-testid="mr-m-readout">
            {readout.label}
          </span>
          {dirty ? (
            <button
              type="button"
              onClick={() => setValues(bases)}
              data-testid="mr-m-sliders-reset"
              title="Put every variable back at the stage's own numbers"
              className="ml-auto px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider rounded-full border border-edge/70 text-solder hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
            >
              [ reset ]
            </button>
          ) : null}
        </div>

        {readout.note ? (
          <p className="text-xs text-bone leading-relaxed">{readout.note}</p>
        ) : null}
      </div>

      <div className="space-y-3 pt-1">
        {variables.map((v) => {
          const { lo, hi, step } = bounds(v);
          const current = clamp(values[v.symbol] ?? v.base, lo, hi);
          return (
            <div key={v.symbol} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor={`mr-m-slider-input-${v.symbol}`}
                  className="font-mono text-xs text-bone"
                >
                  {v.symbol}
                  <span className="text-solder ml-1">{exponentHint(v.exponent)}</span>
                </label>
                <span className="font-mono text-xs text-slate-ink">
                  {formatNumber(current)}
                  {v.unit ? <span className="text-solder ml-1">{v.unit}</span> : null}
                </span>
              </div>
              {/* A bare `0.5` is not an answer to "what does this do?" — the
                  readout it produces is, so the value text carries both. */}
              <input
                id={`mr-m-slider-input-${v.symbol}`}
                type="range"
                min={lo}
                max={hi}
                step={step}
                value={current}
                onChange={(e) => setValue(v.symbol, Number(e.target.value), lo, hi)}
                aria-label={`${v.symbol}${v.unit ? ` in ${v.unit}` : ''}`}
                aria-valuetext={`${formatNumber(current)}${v.unit ? ` ${v.unit}` : ''} — ${readout.label} the stage's own numbers`}
                data-testid={`mr-m-slider-${v.symbol}`}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const target = resolvedPreset(v, preset, lo, hi);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setValue(v.symbol, target, lo, hi)}
                      aria-label={`Set ${v.symbol} to ${preset.label}`}
                      data-testid={`mr-m-preset-${v.symbol}-${preset.id}`}
                      className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider rounded-full border border-edge/70 text-solder hover:text-bone hover:border-gilt/40 transition-colors duration-150 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
