'use client';

import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { BracketTag } from '@/components/ui/BracketTag';
import { useModalA11y } from '@/hooks/useModalA11y';
import { sound } from '@/lib/audio';
import { buildSkillTree, type SkillNode, type SkillState } from '@/lib/course-tree';
import type { SavedSchema } from '@/lib/types';

interface SkillTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  schemas: SavedSchema[];
}

/**
 * Course-level prerequisite skill tree.
 *
 * One node per saved schema plus one per prerequisite the learner has NOT built
 * yet. Colour is progress, not opinion: green is a fully encoded topic, amber is
 * one in flight, and a locked node is a foundation nothing in the library
 * covers yet — with the audit's own primer right there so it can be read in
 * thirty seconds. Every number and edge comes from `buildSkillTree`, which reads
 * only saved schemas and the audits they carry.
 */

const STATE_LABEL: Record<SkillState, string> = { mastered: 'ENCODED', 'in-progress': 'IN PROGRESS', locked: 'LOCKED' };
const STATE_TONE: Record<SkillState, string> = {
  mastered: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/[0.06]',
  'in-progress': 'text-amber-200 border-amber-400/40 bg-amber-400/[0.06]',
  locked: 'text-rose-200 border-rose-400/40 bg-rose-400/[0.06]',
};
const DOT_TONE: Record<SkillState, string> = { mastered: 'bg-emerald-400', 'in-progress': 'bg-amber-300', locked: 'bg-rose-400' };

export const SkillTreeModal: React.FC<SkillTreeModalProps> = ({ isOpen, onClose, schemas }) => {
  const sheetRef = useModalA11y(isOpen, onClose);
  // Rebuilt from the library whenever it changes; pure and deterministic.
  const tree = useMemo(() => buildSkillTree(schemas), [schemas]);
  if (!isOpen) return null;

  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const columns = Array.from({ length: Math.max(tree.columns, 1) }, (_, depth) => tree.nodes.filter((node) => node.depth === depth));
  const mastered = tree.nodes.filter((node) => node.state === 'mastered').length;
  const inProgress = tree.nodes.filter((node) => node.state === 'in-progress').length;

  const requiresLine = (node: SkillNode) =>
    node.requires.length > 0 ? (
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-solder/80">requires</span>
        {node.requires.map((id) => {
          const target = byId.get(id);
          if (!target) return null;
          return (
            <span key={id} className={`rounded-full border px-2 py-0.5 text-[10px] ${STATE_TONE[target.state]}`} title={target.detail}>
              {target.label}
            </span>
          );
        })}
      </div>
    ) : null;

  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Course-level prerequisite skill tree"
      tabIndex={-1}
      data-testid="skill-tree"
      className="fixed inset-0 z-50 flex items-center justify-center bg-chassis/80 p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="leaf-edge sheet-plate my-8 w-full max-w-3xl rounded-2xl border border-edge/70 bg-deck p-6 text-bone shadow-panel"
      >
        <header className="mb-5 flex items-start justify-between gap-3 border-b border-edge/70 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200">Prerequisite Skill Tree</span>
              <span className="font-mono text-[10px] text-solder">library-wide</span>
            </div>
            <h2 className="mt-1 font-serif text-xl text-bone">What holds, what is half-built, what is missing</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-solder">
              Every prerequisite is one the source audit named when you encoded that topic. A concept counts as built only when this library already has a finished
              course for it.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close skill tree" className="p-1.5 text-solder hover:bg-inset hover:text-bone">
            <BracketTag label="X" />
          </button>
        </header>

        {tree.nodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-solder">
            No encoded topics yet. Run a prerequisite check before encoding and the tree starts filling itself in.
          </p>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-wider">
              <span className="text-emerald-300">{mastered} encoded</span>
              <span className="text-amber-200">{inProgress} in progress</span>
              <span data-testid="skill-gaps" className={tree.gaps.length > 0 ? 'text-rose-200' : 'text-solder'}>
                {tree.gaps.length} locked {tree.gaps.length === 1 ? 'foundation' : 'foundations'}
              </span>
            </div>

            {!tree.hasAudits && (
              <p className="mb-5 border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100">
                No prerequisite audits are attached to these topics yet. Use <em>Check prerequisites</em> before encoding a topic and its foundations appear here.
              </p>
            )}

            <div className="space-y-5">
              {columns.map((column, depth) => (
                <div key={depth} data-testid="skill-column" data-depth={depth}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-solder/80">{depth === 0 ? 'Foundations & first courses' : `Layer ${depth}`}</span>
                    <span className="h-px flex-1 bg-edge/60" aria-hidden />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {column.map((node) => (
                      <motion.div
                        key={node.id}
                        layout
                        data-testid="skill-node"
                        data-state={node.state}
                        data-kind={node.kind}
                        className={`min-w-0 rounded-lg border p-3 ${node.kind === 'prereq' ? 'border-dashed border-rose-400/40 bg-rose-400/[0.04]' : 'border-edge/70 bg-inset/40'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[node.state]}`} aria-hidden />
                            <h3 className="min-w-0 break-words text-sm font-semibold text-bone">{node.label}</h3>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] ${STATE_TONE[node.state]}`}>{STATE_LABEL[node.state]}</span>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-solder">{node.detail}</p>
                        {node.primer && (
                          <details className="mt-2">
                            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-amber-200">30-second primer</summary>
                            <p className="mt-2 border-l border-amber-400/40 pl-3 text-[11px] leading-relaxed text-bone/90">{node.primer}</p>
                          </details>
                        )}
                        {requiresLine(node)}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-edge/70 pt-4">
              <span className="font-mono text-[10px] text-solder">
                {tree.gaps.length > 0 ? 'Close the locked foundations first — then this topic will hold.' : 'Every named foundation has a finished course.'}
              </span>
              <button
                type="button"
                onClick={() => {
                  sound.playBeep(520, 'sine', 0.1);
                  onClose();
                }}
                className="border border-edge/70 bg-inset/60 px-4 py-2 text-xs font-semibold text-bone hover:border-amber-400/50"
              >
                Back to the studio
              </button>
            </footer>
          </>
        )}
      </motion.div>
    </div>
  );
};
