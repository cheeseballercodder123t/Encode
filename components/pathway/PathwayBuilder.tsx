'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BracketTag } from '@/components/ui/BracketTag';
import { useModalA11y } from '@/hooks/useModalA11y';
import { sound } from '@/lib/audio';
import { GLYCOLYSIS_PAYOFF, evaluatePathway, solvePathway, type PathwayConfig, type PathwayPiece, type PathwayPlacement } from '@/lib/pathway';

/**
 * The builder surface. Sockets are drop targets for the palette chips, and the
 * verdict comes from `evaluatePathway` — the same declared chemistry the unit
 * tests pin. A chip can be placed by click-then-click (works with a keyboard
 * and with a screen reader) or by dragging it onto a socket.
 */

interface DragState { pieceId: string; x: number; y: number }

function socketLabel(config: PathwayConfig, stepIndex: number, kind: 'enzyme' | 'cofactor', placed?: string) {
  const step = config.steps[stepIndex];
  const piece = config.pieces.find((candidate) => candidate.id === placed);
  return `${kind === 'enzyme' ? 'Enzyme' : 'Cofactor'} socket for ${step.label}${piece ? `, holding ${piece.label}` : ', empty'}`;
}

export function PathwayBuilder({ config = GLYCOLYSIS_PAYOFF }: { config?: PathwayConfig }) {
  const [placement, setPlacement] = useState<PathwayPlacement>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const output = useMemo(() => evaluatePathway(config, placement), [config, placement]);
  const announced = useRef(false);
  // A drag ends with the browser firing a click on the captured chip; without
  // this the chip would immediately toggle back off after a successful drop.
  const justDragged = useRef(false);

  // The verdict sound fires once per completion, never during render.
  useEffect(() => {
    if (output.productFormed && !announced.current) {
      announced.current = true;
      sound.playLabUnlock();
    }
    if (!output.productFormed) announced.current = false;
  }, [output.productFormed]);

  const place = (stepId: string, kind: 'enzyme' | 'cofactor', pieceId: string) => {
    setPlacement((current) => ({ ...current, [stepId]: { ...current[stepId], [kind]: pieceId } }));
    setSelected(null);
    sound.playBeep(480, 'sine', 0.08);
  };
  const clearSocket = (stepId: string, kind: 'enzyme' | 'cofactor') => {
    setPlacement((current) => {
      const next = { ...current, [stepId]: { ...current[stepId] } };
      delete next[stepId][kind];
      return next;
    });
    sound.playBeep(320, 'sine', 0.08);
  };
  const reset = () => {
    setPlacement({});
    setSelected(null);
    setShowEvidence(false);
    sound.playBeep(300, 'sine', 0.1);
  };

  // Pointer drag: the chip follows the pointer, and the drop is resolved by
  // hit-testing the element under the pointer for a socket.
  const onPiecePointerDown = (event: React.PointerEvent<HTMLButtonElement>, piece: PathwayPiece) => {
    justDragged.current = false;
    setSelected(piece.id);
    setDrag({ pieceId: piece.id, x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (!drag) return;
    const socket = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest('[data-socket-step]') as HTMLElement | null;
    justDragged.current = true;
    setDrag(null);
    if (!socket) return;
    place(socket.dataset.socketStep!, socket.dataset.socketKind as 'enzyme' | 'cofactor', drag.pieceId);
  };

  const draggingPiece = drag ? config.pieces.find((piece) => piece.id === drag.pieceId) : undefined;

  return (
    <div
      className="pathway-builder"
      data-testid="pathway-builder"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      <header className="pathway-header">
        <div>
          <span className="pathway-kicker">INTERACTIVE PATHWAY BUILDER / GLYCOLYSIS PAYOFF</span>
          <h3>{config.title}</h3>
        </div>
        <span className="pathway-status-badge" role="status" data-testid="pathway-status" data-formed={output.productFormed}>
          {output.status}
        </span>
      </header>

      <p className="pathway-brief">
        Start: <strong>{config.substrate}</strong> → End: <strong>{config.product}</strong>. Drop the enzyme and the cofactor each step requires. One of the
        palette chips belongs to the investment phase, and two are not consumed here at all.
      </p>

      <ol className="pathway-chain">
        {config.steps.map((step, index) => {
          const state = output.steps[index];
          const filled = placement[step.id] || {};
          const flowing = index < output.flowingSteps;
          return (
            <li key={step.id} className={`pathway-step ${flowing ? 'is-flowing' : ''} ${state.complete ? 'is-complete' : ''}`} data-testid="pathway-step" data-step={step.id} data-complete={state.complete}>
              {index > 0 && <span className={`pathway-connector ${flowing ? 'is-flowing' : ''}`} aria-hidden="true" />}
              <div className="pathway-step-head">
                <span className="pathway-step-index">{String(index + 1).padStart(2, '0')}</span>
                <strong>{step.label}</strong>
              </div>
              <div className="pathway-sockets">
                {(['enzyme', 'cofactor'] as const).map((kind) => {
                  const placed = filled[kind];
                  const piece = config.pieces.find((candidate) => candidate.id === placed);
                  const ok = kind === 'enzyme' ? state.enzymeOk : state.cofactorOk;
                  return (
                    <div key={kind} className="pathway-socket-wrap">
                      <button
                        type="button"
                        className={`pathway-socket ${piece ? 'is-filled' : ''} ${piece ? (ok ? 'is-right' : 'is-wrong') : ''}`}
                        data-socket-step={step.id}
                        data-socket-kind={kind}
                        data-filled={Boolean(piece)}
                        data-testid="pathway-socket"
                        aria-label={`${socketLabel(config, index, kind, placed)}${selected && !piece ? ', press to place the selected chip' : ''}`}
                        onClick={() => (selected && !piece ? place(step.id, kind, selected) : undefined)}
                      >
                        <span className="pathway-socket-kind">{kind}</span>
                        <span className="pathway-socket-value">{piece ? piece.label : selected ? 'place selected chip' : 'empty'}</span>
                      </button>
                      {piece && (
                        <button
                          type="button"
                          className="pathway-socket-clear"
                          data-testid="pathway-clear"
                          aria-label={`Remove ${piece.label} from ${step.label}`}
                          onClick={() => clearSocket(step.id, kind)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="pathway-step-yield">{index < output.flowingSteps ? `yields ${step.yields}` : 'no yield yet'}</span>
            </li>
          );
        })}
      </ol>

      <div className="pathway-readout">
        <span className="pathway-readout-label">Yield unlocked</span>
        <span className="pathway-yields" data-testid="pathway-yield">{output.yields.length > 0 ? output.yields.join(' · ') : '—'}</span>
        <span className="pathway-net">chain total: {config.netYield}</span>
      </div>

      {output.blockers.length > 0 && (
        <ul className="pathway-blockers" data-testid="pathway-blockers" aria-live="polite">
          {output.blockers.map((blocker, index) => (
            <li key={index}>{blocker}</li>
          ))}
        </ul>
      )}

      <div className="pathway-palette" role="group" aria-label="Pathway pieces">
        {config.pieces.map((piece) => (
          <button
            key={piece.id}
            type="button"
            className={`pathway-piece ${selected === piece.id ? 'is-selected' : ''}`}
            data-piece-id={piece.id}
            data-kind={piece.kind}
            data-testid="pathway-piece"
            aria-pressed={selected === piece.id}
            title={piece.role}
            onPointerDown={(event) => onPiecePointerDown(event, piece)}
            onClick={() => {
              if (justDragged.current) { justDragged.current = false; return; }
              setSelected(selected === piece.id ? null : piece.id);
            }}
          >
            <span className="pathway-piece-kind">{piece.kind}</span>
            <span className="pathway-piece-label">{piece.label}</span>
          </button>
        ))}
      </div>

      <p className="pathway-hint">
        {selected ? 'Now click a socket to place it — or drag the chip onto the socket.' : 'Select a chip (or drag it), then fill both sockets of a step.'}
      </p>

      <div className="pathway-actions">
        <button type="button" data-testid="pathway-solve" onClick={() => { setPlacement(solvePathway(config)); sound.playBeep(520, 'sine', 0.1); }}>
          Show the declared chain
        </button>
        <button type="button" data-testid="pathway-evidence-toggle" aria-pressed={showEvidence} onClick={() => setShowEvidence(!showEvidence)}>
          {showEvidence ? 'Hide source grounding' : 'Source grounding'}
        </button>
        <button type="button" data-testid="pathway-reset" onClick={reset}>
          Reset sockets
        </button>
      </div>

      {output.productFormed && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pathway-verdict" data-testid="pathway-verdict" role="status">
          <strong>Chain complete — {config.product} is formed.</strong>
          <p>{config.takeaway}</p>
          <ul>
            {config.steps.map((step) => (
              <li key={step.id}>
                <q>{step.evidence}</q>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {showEvidence && (
        <div className="pathway-evidence" data-testid="pathway-evidence">
          <h4>Source grounding &amp; assumptions</h4>
          <ul>
            {config.evidence.map((entry, index) => (
              <li key={index}>
                <q>{entry.quote}</q>
                <span>{entry.supports}</span>
              </li>
            ))}
          </ul>
          <ul className="pathway-assumptions">
            {config.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}

      {drag && draggingPiece && (
        <span className="pathway-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {draggingPiece.label}
        </span>
      )}
    </div>
  );
}

export function PathwayBuilderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sheetRef = useModalA11y(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Interactive pathway builder" tabIndex={-1} className="pathway-modal-backdrop">
      <div className="pathway-modal">
        <div className="pathway-modal-head">
          <span className="label-caps">Hands-on practice</span>
          <button type="button" onClick={onClose} aria-label="Close pathway builder" className="pathway-modal-close">
            <BracketTag label="X" />
          </button>
        </div>
        <PathwayBuilder />
      </div>
    </div>
  );
}
