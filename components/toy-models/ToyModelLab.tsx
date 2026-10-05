'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { sound } from '@/lib/audio';
import { buildToyChallenge, clamp, computeArchetypeOutput, cyclePosition, equationFor, formatToyNumber, initialInputs, restoreToyProgress, variablesFor } from '@/lib/toy-models/engine';
import { loadToyProgress, saveToyProgress, stampToyProgress } from '@/lib/toy-models/progress';
import type { ToyInputs, ToyModelConfig, ToyModelProgress, ToyVariable } from '@/lib/toy-models/types';
import { ToyModelVisual } from './ToyModelVisual';

interface Props {
  activityId: string;
  config: ToyModelConfig;
  progress?: ToyModelProgress;
  onProgress?: (progress: ToyModelProgress) => void;
  onAdopt?: (text: string) => void;
}
function VariableSlider({ variable, value, disabled, onChange }: { variable: ToyVariable; value: number; disabled: boolean; onChange: (value: number) => void }) {
  const id = useId();
  const fraction = (value - variable.min) / (variable.max - variable.min);
  return <div className="toy-variable">
    <label htmlFor={id}><span>{variable.label} <span className="toy-symbol">{variable.symbol}</span></span><output>{formatToyNumber(value)} <span>{variable.unit}</span></output></label>
    <input id={id} type="range" min={variable.min} max={variable.max} step={variable.step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} aria-valuetext={`${formatToyNumber(value)} ${variable.unit}`} style={{ '--toy-fill': `${fraction * 100}%` } as React.CSSProperties} />
    <div className="toy-range-endpoints"><span>{formatToyNumber(variable.min)} {variable.unit}</span><span>{formatToyNumber(variable.max)} {variable.unit}</span></div>
  </div>;
}
export function ToyModelLab({ activityId, config, progress: savedProgress, onProgress, onAdopt }: Props) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(() => restoreToyProgress(config, savedProgress));
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const progressCallback = useRef(onProgress);
  const latestProgress = useRef(progress);
  const lastRegime = useRef({ critical: false, equilibrium: false });
  const challenge = useMemo(() => buildToyChallenge(config), [config]);
  const variables = useMemo(() => variablesFor(config), [config]);
  const output = computeArchetypeOutput(config, progress.inputs);
  const unlocked = !!progress.predictionId;
  const correct = progress.predictionId === challenge.correctId;
  useEffect(() => { progressCallback.current = onProgress; }, [onProgress]);
  useEffect(() => { latestProgress.current = progress; }, [progress]);
  useEffect(() => {
    const flush = () => { if (latestProgress.current.updatedAt) saveToyProgress(activityId, config, latestProgress.current); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [activityId, config]);
  useEffect(() => {
    // Read the browser-only external store after hydration, never during SSR.
    const timer = setTimeout(() => {
      const local = loadToyProgress(activityId, config);
      setProgress((current) => local.updatedAt > current.updatedAt ? local : current);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [activityId, config]);
  useEffect(() => {
    if (!hydrated || progress.updatedAt === 0) return;
    // Prediction/reveal are durable immediately; slider-only changes debounce.
    const delay = progress.revealed || !progress.explored ? 0 : 180;
    const timer = setTimeout(() => {
      setStorageError(!saveToyProgress(activityId, config, progress));
      progressCallback.current?.(progress);
    }, delay);
    return () => clearTimeout(timer);
  }, [activityId, config, hydrated, progress]);

  const duelHolds = (inputs: ToyInputs) => !!config.devilsAdvocate && Object.entries(config.devilsAdvocate.refutationInputs).every(([key, target]) => Math.abs(inputs[key] - target) <= (variables.find((item) => item.key === key)?.step ?? 0) / 2 + 1e-9);
  // One write path for every manipulation (slider, puck drag, stepper): the
  // reveal matches the challenge's exact target configuration, so the phase
  // plane's two-coordinate question needs BOTH sliders on target while every
  // other archetype still needs the non-target inputs at their starting values.
  const applyInputs = (inputs: ToyInputs) => {
    const nextOutput = computeArchetypeOutput(config, inputs);
    const atTargetConfig = variables.every((item) => Math.abs(inputs[item.key] - challenge.targetInputs[item.key]) <= item.step / 2 + 1e-8);
    const revealed = progress.revealed || atTargetConfig;
    sound.playScrubTick();
    if (nextOutput.critical && !lastRegime.current.critical) {
      if (config.type === 'critical_threshold' && config.response === 'collapse') sound.playLabFailure();
      else sound.playLabEquilibrium();
    }
    else if ((nextOutput.equilibrium && !lastRegime.current.equilibrium) || (revealed && !progress.revealed)) sound.playLabEquilibrium();
    lastRegime.current = { critical: nextOutput.critical, equilibrium: nextOutput.equilibrium };
    // Devil's Advocate verification happens HERE, at input-write time: the
    // duel is refuted only when the live inputs reach the validated refutation
    // configuration and the claim was heard. Reaching the point without hearing
    // the claim first does not count — the argument has to be heard to be lost.
    const duelRefuted = duelHolds(inputs) && progress.duelHeard === true;
    if (duelRefuted && !progress.duelRefuted) sound.playLabUnlock();
    setProgress(stampToyProgress({ ...progress, inputs, explored: true, revealed, duelRefuted }));
  };
  const changeValue = (variable: ToyVariable, value: number) => {
    if (!unlocked) return;
    applyInputs({ ...progress.inputs, [variable.key]: clamp(value, variable.min, variable.max) });
  };

  useEffect(() => {
    if (!playing || reduced || !unlocked || config.type !== 'cyclic_state_machine') return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const current = latestProgress.current;
      const previous = current.inputs[config.primaryVar.key];
      const proposed = previous >= 100 ? (config.cyclic ? 0 : 100) : Math.min(100, previous + 1);
      const crossesTarget = !current.revealed && previous < config.prediction.target && proposed >= config.prediction.target;
      const next = crossesTarget ? config.prediction.target : proposed;
      if (!config.cyclic && next === 100) setPlaying(false);
      const hitTarget = Math.abs(next - config.prediction.target) < 1e-8;
      if (hitTarget && !current.revealed) sound.playLabEquilibrium();
      setProgress(stampToyProgress({ ...current, inputs: { ...current.inputs, [config.primaryVar.key]: next }, explored: true, revealed: current.revealed || hitTarget }));
    }, 140);
    const stopWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', stopWhenHidden); };
  }, [config, playing, unlocked, reduced]);
  useEffect(() => {
    if (!settling || reduced || config.type !== 'two_state_equilibrium' || !unlocked) return;
    const target = config.equilibriumConstant / (1 + config.equilibriumConstant);
    const timer = setInterval(() => {
      const current = latestProgress.current;
      const old = current.inputs[config.primaryVar.key];
      const next = Math.abs(old - target) < 0.002 ? target : old + (target - old) * 0.16;
      if (next === target) { setSettling(false); sound.playLabEquilibrium(); }
      setProgress(stampToyProgress({ ...current, inputs: { ...current.inputs, [config.primaryVar.key]: next }, explored: true }));
    }, 90);
    return () => clearInterval(timer);
  }, [config, settling, unlocked, reduced]);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopAutomaticMotion = () => {
      if (preference.matches) { setPlaying(false); setSettling(false); }
    };
    preference.addEventListener('change', stopAutomaticMotion);
    return () => preference.removeEventListener('change', stopAutomaticMotion);
  }, []);

  const choose = (id: string) => {
    if (unlocked) return;
    sound.playLabUnlock();
    setProgress(stampToyProgress({ ...progress, predictionId: id }));
    lastRegime.current = { critical: output.critical, equilibrium: output.equilibrium };
  };
  const reset = () => {
    setPlaying(false); setSettling(false); setShowCounter(false); setAdopted(false);
    lastRegime.current = { critical: false, equilibrium: false };
    setProgress({ version: 1, modelKey: progress.modelKey, inputs: initialInputs(config), explored: false, revealed: false, updatedAt: Date.now() });
  };
  const cycle = config.type === 'cyclic_state_machine' ? cyclePosition(config, progress.inputs[config.primaryVar.key]) : undefined;
  // Name exactly the inputs the challenge asks to move (phase plane: both
  // coordinates), so the hint can never contradict the question or the reveal.
  const movedVariables = variables.filter((item) => Math.abs(challenge.targetInputs[item.key] - item.initial) > item.step / 2 + 1e-8);
  const revealHint = `Now set ${movedVariables.map((item) => `${item.label.toLowerCase()} to ${challenge.targetInputs[item.key]} ${item.unit}`).join(' and ')}${movedVariables.length < variables.length ? ', keeping every other input at its starting value' : ''}.`;
  // Devil's Advocate duel: the claim is heard first; refuting means actually
  // reconfiguring the SAME lab to the refutation point. Correctness is
  // verified locally against the engine — never from a stored flag.
  const duel = config.devilsAdvocate;
  const duelDebunked = !!duel && progress.duelRefuted === true;
  // The refutation marker parks at the configuration the duel's own test
  // names; only the keys it names move, the rest stays where the learner is.
  const duelTarget = useMemo(() => {
    if (!config.devilsAdvocate) return undefined;
    const target: { x?: number; y?: number } = {};
    for (const [key, value] of Object.entries(config.devilsAdvocate.refutationInputs)) {
      if (key === config.primaryVar.key) target.x = value;
      else if (config.type === 'phase_plane' && key === config.secondVar.key) target.y = value;
    }
    return target;
  }, [config]);
  // Phase-plane puck drag writes BOTH coordinates — the same manipulated state
  // the sliders write, snapped to the step grid so every verification (reveal,
  // duel) sees exactly the values a slider could produce.
  const phasePlane = config.type === 'phase_plane' ? config : undefined;
  const movePuck = phasePlane ? (x: number, y: number) => {
    if (!unlocked) return;
    const snap = (v: ToyVariable, value: number) => clamp(Math.round(value / v.step) * v.step, v.min, v.max);
    applyInputs({ ...progress.inputs, [phasePlane.primaryVar.key]: snap(phasePlane.primaryVar, x), [phasePlane.secondVar.key]: snap(phasePlane.secondVar, y) });
  } : undefined;
  const hearDuel = () => {
    if (progress.duelHeard) return;
    sound.playBeep(420, 'triangle', 0.12);
    // Hearing the claim while the lab already sits at the refutation point
    // refutes it on the spot — the same engine check, now that it can count.
    const duelRefuted = duelHolds(progress.inputs);
    if (duelRefuted) sound.playLabUnlock();
    setProgress(stampToyProgress({ ...progress, duelHeard: true, duelRefuted }));
  };
  return <section className={`toy-lab ${output.critical ? 'toy-lab-critical' : ''}`} aria-label={`${config.title} interactive laboratory`} data-testid="toy-model-lab" data-archetype={config.type}>
    <header className="toy-header"><div><span className="toy-kicker">INTERACTIVE INTUITION LAB / {config.type.replaceAll('_', ' ')}</span><h3>{config.title}</h3></div><span className="toy-mode-badge">{!unlocked ? '01 / PREDICT' : !progress.revealed ? '02 / MANIPULATE' : '03 / REVEAL'}</span></header>
    <div className="toy-equation">{equationFor(config)}</div>
    <div className="toy-prediction">
      <p>{challenge.question}</p>
      <div role="group" aria-label="Commit your hypothesis" className="toy-chips">{challenge.choices.map((choice) => <button key={choice.id} type="button" disabled={unlocked} aria-pressed={progress.predictionId === choice.id} onClick={() => choose(choice.id)}>{choice.label}{progress.predictionId === choice.id && <span aria-hidden="true"> ✓</span>}</button>)}</div>
      {!unlocked ? <span className="toy-hint">Commit first. There’s no penalty for being wrong.</span> : !progress.revealed && <span className="toy-hint">{revealHint}</span>}
    </div>
    {duel && <div className="toy-duel" data-testid="toy-duel">
      <span className="toy-duel-kicker">DEVIL’S ADVOCATE</span>
      {!progress.duelHeard ? (
        <>
          <p className="toy-duel-claim"><strong>{duel.speaker} claims:</strong> “{duel.claim}”</p>
          <button type="button" className="toy-duel-button" onClick={hearDuel}>Take the claim seriously</button>
        </>
      ) : (
        <>
          <p className="toy-duel-claim"><strong>{duel.speaker} claims:</strong> “{duel.claim}”</p>
          <p className="toy-duel-fallacy">Fallacy on offer: {duel.fallacy}</p>
          <p className="toy-duel-task">Reconfigure the lab until it demonstrably contradicts the claim{Object.entries(duel.refutationInputs).map(([key, value]) => {
            const slider = variables.find((item) => item.key === key);
            return slider ? <> — set {slider.label.toLowerCase()} to {value} {slider.unit}</> : null;
          })}.</p>
          {duelDebunked && <p className="toy-duel-verdict" data-testid="toy-duel-verdict" role="status">{duel.refutationOutcome}</p>}
        </>
      )}
    </div>}
    <div className={`toy-instrument ${!unlocked ? 'toy-instrument-locked' : ''}`}>
      <ToyModelVisual config={config} inputs={progress.inputs} output={output} showCounter={showCounter} refuting={!!duel && progress.duelHeard === true && !duelDebunked} onPuckMove={movePuck} duelTarget={duelTarget} />
      <div className="toy-telemetry"><span>{config.output.symbol} = <strong data-testid="toy-output">{formatToyNumber(output.value)}</strong> {config.output.unit}</span><span className={output.critical ? 'toy-hazard' : output.equilibrium ? 'toy-safe' : 'toy-status'}>[ {output.status} ]</span></div>
    </div>
    {config.type === 'cyclic_state_machine' && <ol className="toy-cycle-states">{config.states.map((state, index) => <li key={state.id} className={index === cycle?.index ? 'is-active' : ''}><span>{String(index + 1).padStart(2, '0')}</span><strong>{state.label}</strong>{index === cycle?.index && <p>{state.mechanism}</p>}<span className="toy-state-time">{state.duration} relative dwell</span></li>)}</ol>}
    <fieldset className="toy-controls" disabled={!unlocked}><legend className="sr-only">Simulation controls</legend>{variables.map((variable) => <VariableSlider key={variable.key} variable={variable} value={progress.inputs[variable.key]} disabled={!unlocked || playing || settling} onChange={(value) => changeValue(variable, value)} />)}</fieldset>
    <div className="toy-toolbar">
      {config.type === 'cyclic_state_machine' && <>
        <button type="button" disabled={!unlocked || playing} onClick={() => {
          const position = cyclePosition(config, progress.inputs[config.primaryVar.key]);
          const next = position.index === config.states.length - 1 ? config.cyclic ? 0 : 100 : position.end + Math.min(0.01, config.primaryVar.step / 10);
          changeValue(config.primaryVar, next);
        }}>Next state →</button>
        <button type="button" disabled={!unlocked || !!reduced} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Auto-play'}</button>
        {reduced && <span className="toy-hint">Reduced motion: use the scrubber or stepper.</span>}
      </>}
      {config.type === 'two_state_equilibrium' && <button type="button" disabled={!unlocked || settling} onClick={() => {
        if (reduced) changeValue(config.primaryVar, config.equilibriumConstant / (1 + config.equilibriumConstant));
        else setSettling(true);
      }}>{settling ? 'Relaxing toward Q=K…' : 'Release to equilibrium'}</button>}
      {config.counterModel && <button type="button" disabled={!unlocked} aria-pressed={showCounter} onClick={() => setShowCounter(!showCounter)}>{showCounter ? 'Hide counter-model' : 'Flaw hunter: compare models'}</button>}
      <button type="button" onClick={reset}>Reset hypothesis</button>
    </div>
    {duel && progress.duelHeard && !duelDebunked && <p className="toy-hint">The claim stands until the instrument itself says otherwise.</p>}
    {showCounter && config.counterModel && <div className="toy-counter-note"><strong>Wrong assumption: {config.counterModel.assumption}</strong><p>Push {config.primaryVar.label.toLowerCase()} to its extreme and compare the dashed counter-model with the solid physical model.</p>{progress.explored && <p className="toy-hazard">{config.counterModel.explanation}</p>}</div>}
    {progress.revealed && <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`toy-reveal ${correct ? 'is-correct' : 'is-corrected'}`} role="status" data-testid="toy-reveal">
      <strong>{correct ? 'Prediction confirmed.' : 'A better model than your first guess.'}</strong>
      <p>{config.prediction.explanation}</p><p className="toy-boundary-rule">{config.takeaway}</p>
      <div><span>Interference trap ready for Anki / RemNote</span>{onAdopt && <button type="button" disabled={adopted} onClick={() => { onAdopt(config.takeaway); setAdopted(true); sound.playLabUnlock(); }}>{adopted ? 'Added to your mechanism' : 'Use this boundary rule'}</button>}</div>
    </motion.div>}
    {storageError && <p className="toy-hazard" role="status">This browser could not save lab progress. Keep the session open; exports still use your current work.</p>}
    <details className="toy-evidence"><summary>Source grounding & model assumptions <span>{config.evidence.length} quotations</span></summary><ul>{config.evidence.map((entry, index) => <li key={index}><q>{entry.quote}</q><span>{entry.supports}</span></li>)}</ul><h4>What this toy model does—and does not—claim</h4><ul>{config.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></details>
  </section>;
}
