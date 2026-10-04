'use client';

import React, { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { clamp, computeArchetypeOutput, computeCounterModelOutput, cyclePosition, formatToyNumber, initialInputs, lerp, reactionEnergy } from '@/lib/toy-models/engine';
import type { ToyInputs, ToyModelConfig, ToyModelOutput } from '@/lib/toy-models/types';

interface Props { config: ToyModelConfig; inputs: ToyInputs; output: ToyModelOutput; showCounter: boolean }
const color = { cyan: '#00F2FE', amber: '#F59E0B', green: '#10B981', red: '#F43F5E', ink: '#B5C4D9' };

function CurveInstrument({ config, inputs, output, showCounter }: Props) {
  const samples = Array.from({ length: 81 }, (_, index) => {
    const x = lerp(config.primaryVar.min, config.primaryVar.max, index / 80);
    const sampleInputs = { ...inputs, [config.primaryVar.key]: x };
    return { x, y: computeArchetypeOutput(config, sampleInputs).value, wrong: showCounter ? computeCounterModelOutput(config, sampleInputs) : undefined };
  });
  const min = Math.min(0, ...samples.map((point) => point.y));
  const max = Math.max(1e-9, ...samples.map((point) => point.y));
  const sx = (x: number) => 48 + (x - config.primaryVar.min) / (config.primaryVar.max - config.primaryVar.min) * 384;
  const sy = (y: number) => 198 - clamp((y - min) / (max - min), 0, 1) * 148;
  const path = samples.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x)},${sy(point.y)}`).join(' ');
  const counter = samples.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x)},${sy(point.wrong ?? point.y)}`).join(' ');
  const threshold = config.type === 'saturation_sigmoid' ? config.halfSaturation : config.type === 'critical_threshold' ? config.threshold : undefined;
  return (
    <svg viewBox="0 0 480 242" className="toy-svg" role="img" aria-label={`${config.output.label} response curve. Current value ${formatToyNumber(output.value)} ${config.output.unit}`}>
      <g stroke="#B5C4D9" strokeOpacity="0.12">{[0, 1, 2, 3, 4].map((index) => <path key={index} d={`M48 ${50 + index * 37}H432M${48 + index * 96} 50V198`} />)}</g>
      <path d="M48 42V198H440" fill="none" stroke="#B5C4D9" strokeOpacity="0.5" />
      {threshold !== undefined && <g><path d={`M${sx(threshold)} 42V198`} stroke={color.amber} strokeDasharray="4 4" /><text x={sx(threshold)} y="30" textAnchor="middle" fill={color.amber} fontSize="10">{config.type === 'saturation_sigmoid' ? 'HALF-SATURATION' : 'CRITICAL'} · {formatToyNumber(threshold)}</text></g>}
      <path d={`${path} L432,198 L48,198Z`} fill={color.cyan} fillOpacity="0.035" />
      <path d={path} fill="none" stroke={output.critical ? color.red : color.cyan} strokeWidth="2.5" strokeLinejoin="round" />
      {showCounter && <path d={counter} fill="none" stroke={color.red} strokeWidth="1.5" strokeDasharray="5 5" />}
      <path d={`M${sx(inputs[config.primaryVar.key])} ${sy(output.value)}V198`} stroke={color.cyan} strokeOpacity="0.4" strokeDasharray="2 4" />
      <circle cx={sx(inputs[config.primaryVar.key])} cy={sy(output.value)} r="9" fill={output.critical ? color.red : color.cyan} fillOpacity="0.12" />
      <circle cx={sx(inputs[config.primaryVar.key])} cy={sy(output.value)} r="4" fill={output.critical ? color.red : color.cyan} />
      <g fill={color.ink} fontSize="9"><text x="48" y="217">{formatToyNumber(config.primaryVar.min)}</text><text x="432" y="217" textAnchor="end">{formatToyNumber(config.primaryVar.max)}</text><text x="240" y="234" textAnchor="middle">{config.primaryVar.label} / {config.primaryVar.unit}</text><text x="48" y="13">{config.output.symbol} / {config.output.unit}</text></g>
      {showCounter && <text x="430" y="13" fill={color.red} fontSize="8" textAnchor="end">DASHED = WRONG MODEL · CLIPPED TO CHART</text>}
    </svg>
  );
}
function RatioInstrument({ config, output }: Props) {
  const reduced = useReducedMotion();
  const spring = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 19 };
  const baseline = computeArchetypeOutput(config, initialInputs(config)).value;
  const tilt = clamp((output.value - baseline) / Math.max(Math.abs(baseline), 1e-9) * -15, -25, 25);
  return <svg viewBox="0 0 480 232" className="toy-svg" role="img" aria-label={`Dimensional balance and particle flow for ${config.output.label}`}>
    <path d="M36 155V55H444V155H36" fill="none" stroke={color.cyan} strokeOpacity="0.3" strokeWidth="2" />
    <path d="M58 133V77M68 119V91" stroke={color.cyan} strokeWidth="3" />
    <rect x="373" y="92" width="55" height="25" rx="3" fill="#0F121D" stroke={color.amber} />
    <path d="M380 104L386 97L393 111L400 97L407 111L414 104" stroke={color.amber} fill="none" />
    <motion.g animate={{ rotate: tilt }} transition={spring} style={{ transformOrigin: '240px 105px' }}>
      <path d="M160 100H320M175 100V126M305 100V126" stroke={color.amber} strokeWidth="2" />
      <path d="M154 126Q175 150 196 126ZM284 126Q305 150 326 126Z" fill="#F59E0B" fillOpacity="0.13" stroke={color.amber} />
    </motion.g>
    <path d="M228 160L240 116L252 160Z" fill="#182332" stroke={color.amber} strokeOpacity="0.7" />
    {Array.from({ length: 6 }, (_, index) => <circle key={index} r="3" fill={color.cyan} className={output.value === 0 ? '' : 'toy-flow-particle'} style={{ offsetPath: "path('M36 155V55H444V155H36')", animationDuration: `${clamp(8 / Math.max(output.normalized * 3, 0.1), 1.5, 30)}s`, animationDelay: `${-index * 2}s` }} cx={36 + index * 68} cy="155" />)}
    <g fill={color.ink} fontSize="10" textAnchor="middle"><text x="175" y="82">INPUT</text><text x="305" y="82">OUTPUT</text><text x="240" y="192">FLOW SCALES WITH |{config.output.symbol}|</text><text x="240" y="212" fontSize="8">SCHEMATIC ANALOGY · NOT A CALIBRATED CIRCUIT</text></g>
  </svg>;
}
function EquilibriumInstrument({ config, output }: Props) {
  const reduced = useReducedMotion();
  if (config.type !== 'two_state_equilibrium') return null;
  const a = output.fractionA!;
  const b = output.fractionB!;
  const kPosition = config.equilibriumConstant / (1 + config.equilibriumConstant);
  return <svg viewBox="0 0 480 245" className="toy-svg" role="img" aria-label={`Conserved material: ${formatToyNumber(a * config.total)} in ${config.stateA}, ${formatToyNumber(b * config.total)} in ${config.stateB}`}>
    {[{ x: 75, fraction: a, label: config.stateA }, { x: 305, fraction: b, label: config.stateB }].map((state) => <g key={state.x}>
      <path d={`M${state.x} 45V170Q${state.x} 180 ${state.x + 10} 180H${state.x + 90}Q${state.x + 100} 180 ${state.x + 100} 170V45`} stroke={color.cyan} strokeOpacity="0.6" fill="none" strokeWidth="2" />
      <motion.rect x={state.x + 6} width="88" animate={{ y: 174 - state.fraction * 120, height: state.fraction * 120 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 22 }} fill={color.cyan} fillOpacity="0.16" />
      <path d={`M${state.x + 6} ${174 - state.fraction * 120}h88`} stroke={color.cyan} />
      <text x={state.x + 50} y="28" textAnchor="middle" fill={color.ink} fontSize="11">{state.label}</text>
      <text x={state.x + 50} y="197" textAnchor="middle" fill={color.cyan} fontSize="10">{formatToyNumber(state.fraction * config.total)} {config.amountUnit}</text>
    </g>)}
    <path d="M190 93H288L278 86M288 93L278 100M288 120H190L200 113M190 120L200 127" fill="none" stroke={output.equilibrium ? color.green : color.amber} strokeWidth="2" />
    <text x="240" y="152" textAnchor="middle" fill={color.amber} fontSize="9">Q {formatToyNumber(output.q!)} / K {config.equilibriumConstant}</text>
    <path d="M85 223H395" stroke="#243447" strokeWidth="5" />
    <path d={`M${85 + kPosition * 310} 215V231`} stroke={color.amber} strokeWidth="2" />
    <circle cx={85 + b * 310} cy="223" r="5" fill={output.equilibrium ? color.green : color.cyan} />
    <text x="240" y="244" textAnchor="middle" fill={color.ink} fontSize="8">AMOUNT CONSERVED · AMBER MARK = Q=K</text>
  </svg>;
}
function CycleInstrument({ config, inputs, output }: Props) {
  if (config.type !== 'cyclic_state_machine') return null;
  const low = Math.min(...config.states.map((state) => state.energy));
  const high = Math.max(...config.states.map((state, index) => Math.max(state.energy, (config.states[index + 1] ?? (config.cyclic ? config.states[0] : state)).energy) + state.activationBarrier)) + 1;
  const sy = (value: number) => 170 - (value - low) / (high - low) * 120;
  const total = config.states.reduce((sum, state) => sum + state.duration, 0);
  const segments = config.states.map((state, index) => {
    const elapsed = config.states.slice(0, index).reduce((sum, previous) => sum + previous.duration, 0);
    const start = 40 + elapsed / total * 400;
    const end = 40 + (elapsed + state.duration) / total * 400;
    const next = config.states[index + 1] ?? (config.cyclic ? config.states[0] : state);
    const peak = Math.max(state.energy, next.energy) + state.activationBarrier;
    const y1 = sy(state.energy);
    const y2 = sy(next.energy);
    const peakY = sy(peak);
    const middle = (start + end) / 2;
    const path = `M${start} ${y1}C${lerp(start, middle, 1 / 3)} ${y1} ${lerp(start, middle, 2 / 3)} ${peakY} ${middle} ${peakY}C${lerp(middle, end, 1 / 3)} ${peakY} ${lerp(middle, end, 2 / 3)} ${y2} ${end} ${y2}`;
    return { index, start, end, y1, y2, peakY, path };
  });
  const position = cyclePosition(config, inputs[config.primaryVar.key]);
  const segment = segments[position.index];
  const markerX = lerp(segment.start, segment.end, position.local);
  const markerY = sy(reactionEnergy(config, position.index, position.local));
  return <svg viewBox="0 0 480 225" className="toy-svg" role="img" aria-label={`Reaction coordinate at ${config.states[position.index].label}`}>
    <path d="M40 30V178H448" stroke="#B5C4D9" strokeOpacity="0.4" fill="none" />
    {segments.map((item) => <g key={item.index}>
      <path d={item.path} stroke={item.index === position.index ? color.cyan : color.amber} strokeOpacity={item.index === position.index ? 1 : 0.35} strokeWidth="2" fill="none" />
      {item.index === position.index && <path className="toy-reaction-flow" style={{ animationDuration: `${config.states[item.index].duration * 0.6}s` }} d={item.path} stroke="#DDE7F4" strokeWidth="3" strokeDasharray="1 17" strokeLinecap="round" fill="none" /> }
      <text x={(item.start + item.end) / 2} y="198" fill={item.index === position.index ? color.cyan : color.ink} textAnchor="middle" fontSize="9">{item.index + 1}</text>
    </g>)}
    <path d={`M${markerX} ${markerY}V178`} stroke={color.cyan} strokeDasharray="2 4" strokeOpacity="0.4" />
    <circle cx={markerX} cy={markerY} r="10" fill={color.cyan} fillOpacity="0.1" /><circle cx={markerX} cy={markerY} r="4" fill={color.cyan} />
    <text x="42" y="16" fill={color.ink} fontSize="9">{config.energyIsIllustrative ? 'ILLUSTRATIVE ENERGY' : 'SOURCE ENERGY'} / {config.energyUnit}</text>
    <text x="240" y="219" fill={output.status === 'BOTTLENECK' ? color.amber : color.ink} textAnchor="middle" fontSize="9">{output.status} · {config.states[position.index].label}</text>
  </svg>;
}
function ThresholdInstrument(props: Props) {
  const { config, inputs, output } = props;
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  if (config.type !== 'critical_threshold') return null;
  const fraction = (inputs[config.primaryVar.key] - config.primaryVar.min) / (config.primaryVar.max - config.primaryVar.min);
  const boundary = (config.threshold - config.primaryVar.min) / (config.primaryVar.max - config.primaryVar.min);
  const point = (f: number, radius = 82) => ({ x: 240 - Math.cos(f * Math.PI) * radius, y: 118 - Math.sin(f * Math.PI) * radius });
  const start = point(boundary);
  return <>
    <svg viewBox="0 0 480 155" className="toy-svg toy-gauge" role="img" aria-label={`${Math.round(fraction * 100)} percent of input range. ${output.status}`}>
      <defs><pattern id={`hazard-${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#F43F5E" fillOpacity="0.1" /><rect width="2" height="7" fill="#F43F5E" fillOpacity="0.65" /></pattern></defs>
      <path d="M158 118A82 82 0 0 1 322 118" stroke="#1A2A39" strokeWidth="17" fill="none" />
      <path d={`M${start.x} ${start.y}A82 82 0 0 1 322 118`} stroke={config.response === 'collapse' ? `url(#hazard-${id})` : color.amber} strokeOpacity={config.response === 'collapse' ? 1 : 0.55} strokeWidth="17" fill="none" />
      {Array.from({ length: 11 }, (_, index) => { const p = point(index / 10, 98); return <text key={index} x={p.x} y={p.y + 3} textAnchor="middle" fill={color.ink} fontSize="7">{index * 10}</text>; })}
      <motion.g animate={{ rotate: fraction * 180 }} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 17 }} style={{ transformOrigin: '240px 118px' }}><path d="M240 118L165 115L165 121Z" fill={output.critical ? color.red : color.cyan} /></motion.g>
      <circle cx="240" cy="118" r="8" fill="#0F121D" stroke={output.critical ? color.red : color.amber} strokeWidth="2" />
      <text x="240" y="150" textAnchor="middle" fill={output.critical ? color.red : color.green} fontSize="10">{output.status} · {formatToyNumber(inputs[config.primaryVar.key])} {config.primaryVar.unit}</text>
    </svg>
    <div className={`toy-domino-chain ${output.critical ? 'is-critical' : ''}`} aria-label="Mechanism chain">{config.chain.map((label, index) => <motion.div key={label} animate={{ rotate: output.critical && config.response === 'collapse' ? 7 + index * 4 : 0, y: output.critical && config.response === 'collapse' ? index * 2 : 0 }} transition={reduced ? { duration: 0 } : { type: 'spring', delay: index * 0.045, stiffness: 140, damping: 18 }}><span>0{index + 1}</span>{label}</motion.div>)}</div>
    <CurveInstrument {...props} />
  </>;
}
export function ToyModelVisual(props: Props) {
  switch (props.config.type) {
    case 'ratio_scaling': return <RatioInstrument {...props} />;
    case 'saturation_sigmoid': return <CurveInstrument {...props} />;
    case 'two_state_equilibrium': return <EquilibriumInstrument {...props} />;
    case 'cyclic_state_machine': return <CycleInstrument {...props} />;
    case 'critical_threshold': return <ThresholdInstrument {...props} />;
  }
}
