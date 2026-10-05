'use client';

import React, { useCallback, useId, useMemo, useRef } from 'react';
import { clamp, formatToyNumber, phasePlaneDerivative, phasePlaneEquilibrium, phasePlaneTrajectory } from '@/lib/toy-models/engine';
import type { PhasePlaneConfig, ToyInputs, ToyModelOutput } from '@/lib/toy-models/types';

interface Props {
  config: PhasePlaneConfig;
  inputs: ToyInputs;
  output: ToyModelOutput;
  /** Duel mode: highlight the refutation configuration instead of the puck. */
  refuting?: boolean;
  /** Drag callback: writes BOTH plane coordinates back into the lab's inputs. */
  onPuckMove?: (x: number, y: number) => void;
  /** The configuration the duel names as its refutation point (partial). */
  duelTarget?: { x?: number; y?: number };
}

const FIELD_GRID = 8;

export function PhasePlaneVisual({ config, inputs, output, refuting = false, onPuckMove, duelTarget }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef(false);

  const xVar = config.primaryVar;
  const yVar = config.secondVar;
  const x0 = 52;
  const y0 = 218;
  const width = 380;
  const height = 168;
  const sx = useCallback((x: number) => x0 + (x - xVar.min) / (xVar.max - xVar.min) * width, [xVar, width]);
  const sy = useCallback((y: number) => y0 - (y - yVar.min) / (yVar.max - yVar.min) * height, [yVar, height]);
  const gx = useCallback((px: number) => xVar.min + (px - x0) / width * (xVar.max - xVar.min), [xVar, width]);
  const gy = useCallback((py: number) => yVar.min + (y0 - py) / height * (yVar.max - yVar.min), [yVar, height]);

  const equilibrium = phasePlaneEquilibrium(config);
  const x = inputs[xVar.key];
  const y = inputs[yVar.key];

  // 8×8 velocity field, each arrow normalized so RELATIVE direction reads
  // cleanly while magnitude is hinted by opacity (the engine's law, sampled).
  const arrows = useMemo(() => {
    return Array.from({ length: FIELD_GRID * FIELD_GRID }, (_, index) => {
      const gxPos = x0 + width * (0.5 + (index % FIELD_GRID)) / FIELD_GRID;
      const gyPos = y0 - height * (0.5 + Math.floor(index / FIELD_GRID)) / FIELD_GRID;
      const velocity = phasePlaneDerivative(config, gx(gxPos), gy(gyPos));
      const speed = Math.hypot(velocity.dx / (xVar.max - xVar.min), velocity.dy / (yVar.max - yVar.min));
      const angle = Math.atan2(-velocity.dy / (yVar.max - yVar.min), velocity.dx / (xVar.max - xVar.min));
      const length = 6 + clamp(speed * 14, 0, 8);
      return { gxPos, gyPos, angle, length, speed };
    });
  }, [config, gx, gy, height, width, xVar.max, xVar.min, yVar.max, yVar.min]);

  const trajectory = useMemo(() => phasePlaneTrajectory(config, x, y, 500, 0.05), [config, x, y]);
  const pathD = trajectory.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(' ');

  // Pointer handling converts viewport coordinates into plane coordinates.
  const planeFromEvent = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = 480 / rect.width;
    const scaleY = 260 / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    if (px < x0 - 6 || px > x0 + width + 6 || py < y0 - height - 6 || py > y0 + 6) return null;
    return { x: clamp(gx(px), xVar.min, xVar.max), y: clamp(gy(py), yVar.min, yVar.max) };
  }, [gx, gy, height, width, xVar, yVar]);

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const plane = planeFromEvent(event);
    if (plane) onPuckMove?.(plane.x, plane.y);
  };
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const plane = planeFromEvent(event);
    if (plane) onPuckMove?.(plane.x, plane.y);
  };
  const handlePointerUp = () => { dragRef.current = false; };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 480 260"
      className="toy-svg toy-phase"
      role="img"
      aria-label={`Phase plane: ${xVar.label} versus ${yVar.label}. Operating point ${formatToyNumber(x)} ${xVar.unit}, ${formatToyNumber(y)} ${yVar.unit}. Regime ${output.status}.`}
      data-testid="phase-plane-svg"
      style={{ touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <defs>
        <marker id={`arrow-${id}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L8 4L0 8Z" fill="#67C9D7" fillOpacity="0.55" />
        </marker>
        <radialGradient id={`glow-${id}`}>
          <stop stopColor="#00F2FE" stopOpacity="0.5" />
          <stop offset="1" stopColor="#00F2FE" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Graticule */}
      <g stroke="#B5C4D9" strokeOpacity="0.1">
        {Array.from({ length: 5 }, (_, index) => (
          <path key={index} d={`M${x0} ${y0 - height * index / 4}H${x0 + width}M${x0 + width * index / 4} ${y0 - height}V${y0}`} />
        ))}
      </g>
      <path d={`M${x0} ${y0 - height - 12}V${y0 + 4}H${x0 + width + 12}`} fill="none" stroke="#B5C4D9" strokeOpacity="0.5" />

      {/* Velocity field */}
      {arrows.map((arrow, index) => (
        <path
          key={index}
          d={`M${arrow.gxPos - Math.cos(arrow.angle) * arrow.length / 2},${arrow.gyPos - Math.sin(arrow.angle) * arrow.length / 2}L${arrow.gxPos + Math.cos(arrow.angle) * arrow.length / 2},${arrow.gyPos + Math.sin(arrow.angle) * arrow.length / 2}`}
          stroke="#67C9D7"
          strokeOpacity={0.2 + clamp(arrow.speed * 0.4, 0, 0.45)}
          strokeWidth="1.4"
          markerEnd={`url(#arrow-${id})`}
        />
      ))}

      {/* Nullclines: prey (horizontal, Y = α/β) and predator (vertical, X = γ/δ) */}
      <path d={`M${x0} ${sy(config.alpha / config.beta)}H${x0 + width}`} stroke="#F59E0B" strokeOpacity="0.65" strokeDasharray="5 4" />
      <path d={`M${sx(config.gamma / config.delta)} ${y0 - height}V${y0}`} stroke="#F59E0B" strokeOpacity="0.65" strokeDasharray="5 4" />
      <text x={x0 + 4} y={sy(config.alpha / config.beta) - 4} fill="#F59E0B" fontSize="8" fontFamily="'IBM Plex Mono', monospace">{xVar.symbol}-nullcline · Y={formatToyNumber(config.alpha / config.beta)}</text>
      <text x={sx(config.gamma / config.delta) + 4} y={y0 - height + 10} fill="#F59E0B" fontSize="8" fontFamily="'IBM Plex Mono', monospace">X*={formatToyNumber(config.gamma / config.delta)}</text>

      {/* Trajectory from the operating point — a closed orbit, drawn live */}
      <path d={pathD} fill="none" stroke="#00F2FE" strokeOpacity="0.5" strokeWidth="1.6" />

      {/* Coexistence equilibrium beacon */}
      <circle cx={sx(equilibrium.x)} cy={sy(equilibrium.y)} r="14" fill={`url(#glow-${id})`} />
      <circle cx={sx(equilibrium.x)} cy={sy(equilibrium.y)} r="3.5" fill="#10B981" />
      <text x={sx(equilibrium.x) + 8} y={sy(equilibrium.y) + 14} fill="#10B981" fontSize="8" fontFamily="'IBM Plex Mono', monospace">COEXISTENCE</text>

      {/* Duel refutation marker: parked at the configuration the claim's own
          test names — dragging the puck into it is what refutes the claim. */}
      {refuting && (
        <g data-testid="phase-duel-marker">
          <circle cx={sx(duelTarget?.x ?? x)} cy={sy(duelTarget?.y ?? y)} r="16" fill="none" stroke="#F59E0B" strokeOpacity="0.9" strokeDasharray="4 3" className="toy-phase-duel-ring" />
          <text x={sx(duelTarget?.x ?? x)} y={sy(duelTarget?.y ?? y) - 20} textAnchor="middle" fill="#F59E0B" fontSize="8" fontFamily="'IBM Plex Mono', monospace">REFUTE HERE</text>
        </g>
      )}

      {/* Operating puck */}
      <circle cx={sx(x)} cy={sy(y)} r="11" fill="#00F2FE" fillOpacity="0.12" />
      <circle cx={sx(x)} cy={sy(y)} r="4.5" fill={output.equilibrium ? '#10B981' : '#00F2FE'} data-testid="phase-puck" />

      {/* Axis labels */}
      <g fill="#B5C4D9" fontSize="9" fontFamily="'IBM Plex Mono', monospace">
        <text x={x0 - 4} y={y0 + 14} textAnchor="start">{formatToyNumber(xVar.min)}</text>
        <text x={x0 + width} y={y0 + 14} textAnchor="end">{formatToyNumber(xVar.max)}</text>
        <text x={x0 + width / 2} y={y0 + 26} textAnchor="middle">{xVar.label} / {xVar.unit}</text>
        <text x={x0 - 8} y={y0 - height / 2} textAnchor="middle" transform={`rotate(-90 ${x0 - 8} ${y0 - height / 2})`}>{yVar.label} / {yVar.unit}</text>
        <text x={x0 + width + 12} y={y0 - height - 12} textAnchor="end" fontSize="8">{output.status}</text>
      </g>
    </svg>
  );
}
