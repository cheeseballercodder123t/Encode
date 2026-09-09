'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GuidedPathModule, FeynmanCheckpoint } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface GuidedPathRoadmapProps {
  modules: GuidedPathModule[];
  currentModuleIndex: number;
  onSelectModule: (index: number) => void;
  onFeynmanPass: (moduleIndex: number, score: number, xpBonus: number, feedback: string) => void;
  isAllActivitiesDoneForCurrentModule: boolean;
  settings?: any;
}

export function GuidedPathRoadmap({
  modules,
  currentModuleIndex,
  onSelectModule,
  onFeynmanPass,
  isAllActivitiesDoneForCurrentModule,
  settings,
}: GuidedPathRoadmapProps) {
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [checkpointAnswer, setCheckpointAnswer] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    passed: boolean;
    score: number;
    feedback: string;
    xpBonus: number;
  } | null>(null);

  const activeModule = modules[currentModuleIndex];
  const checkpoint = activeModule?.feynmanCheckpoint;

  const handleOpenCheckpoint = (moduleIdx?: number) => {
    const targetIdx = typeof moduleIdx === 'number' ? moduleIdx : currentModuleIndex;
    const targetModule = modules[targetIdx];
    if (!targetModule?.feynmanCheckpoint) return;

    if (targetModule.feynmanCheckpoint.passed) {
      setEvaluationResult({
        passed: true,
        score: targetModule.feynmanCheckpoint.score || 95,
        feedback: targetModule.feynmanCheckpoint.feedback || 'Mastery previously verified with deep causal clarity.',
        xpBonus: 150
      });
    } else {
      setEvaluationResult(null);
    }
    setCheckpointAnswer(targetModule.feynmanCheckpoint.userAnswer || '');
    setShowCheckpointModal(true);
  };

  const handleEvaluateCheckpoint = async () => {
    if (!checkpointAnswer.trim()) return;

    setEvaluating(true);
    try {
      const res = await fetch('/api/checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleTitle: activeModule.title,
          question: checkpoint.question,
          corePrerequisite: checkpoint.corePrerequisite,
          userAnswer: checkpointAnswer,
          settings,
        })
      });

      if (!res.ok) throw new Error('Checkpoint evaluation failed');
      const data = await res.json();
      setEvaluationResult(data);

      if (data.passed) {
        playSound('success');
        onFeynmanPass(currentModuleIndex, data.score, data.xpBonus, data.feedback);
      } else {
        playSound('error');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvaluating(false);
    }
  };

  const completedModulesCount = modules.filter(m => m.completed).length;
  const totalRoadmapXp = modules.reduce((acc, m) => acc + (m.completed ? 150 : 0), 0);

  return (
    <div className="w-full border border-steel/20 bg-deck/90  p-4 sm:p-6  space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-steel pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 bg-steel/20 text-bone border border-steel/30">
              <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
            </span>
            <h3 className="text-sm font-bold text-bone uppercase tracking-wider">
              Miller&apos;s Law Adaptive Guided Path
            </h3>
            <span className="px-2 py-0.5 bg-steel/20 text-bone text-[10px] font-black uppercase">
              7±2 Chunked Progression
            </span>
          </div>
          <p className="text-xs text-solder mt-1">
            Textbook decomposed into {modules.length} digestible modules. Pass the Feynman Checkpoint at each milestone to unlock the next chapter.
          </p>
        </div>

        {isAllActivitiesDoneForCurrentModule && !activeModule.completed && (
          <button
            type="button"
            onClick={() => handleOpenCheckpoint()}
            className="flex items-center gap-2 px-3.5 py-2 hover: hover: text-bone font-bold text-xs   transition-none-all shrink-0  cursor-pointer"
          >
            <span className="text-amber font-bold font-mono">[ * ]</span>
            <span>Unlock Next Chapter (Feynman Check)</span>
          </button>
        )}
      </div>

      {/* Roadmap Progress Bar */}
      <div className="p-3 bg-chassis border border-steel/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-36 sm:w-48 h-2 bg-steel overflow-hidden">
            <div 
              className="h-full transition-none-all duration-500"
              style={{ width: `${(completedModulesCount / Math.max(1, modules.length)) * 100}%` }}
            />
          </div>
          <span className="text-solder font-semibold text-[11px] whitespace-nowrap">
            {completedModulesCount} of {modules.length} Chapters Mastered
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-solder">
            Active Focus: <strong className="text-bone">Chapter {currentModuleIndex + 1}</strong>
          </span>
          <span className="text-amber font-bold flex items-center gap-1">
            <span className="text-amber font-bold font-mono">[ TROPHY ]</span>
            +{totalRoadmapXp} Milestone XP
          </span>
        </div>
      </div>

      {/* Visual Roadmap Nodes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {modules.map((mod, idx) => {
          const isActive = idx === currentModuleIndex;
          const isUnlocked = mod.unlocked;
          const isCompleted = mod.completed;

          return (
            <div
              key={mod.moduleId || idx}
              className={`relative flex flex-col p-4  text-left border transition-none-all ${
                isActive
                  ? 'bg-steel/40 border-steel text-bone ring-2 ring-indigo-500/40  '
                  : isCompleted
                  ? 'bg-amber950/20 hover:bg-amber950/30 border-amber/40 text-bone'
                  : isUnlocked
                  ? 'bg-steel/60 hover:bg-steel border-steel text-solder'
                  : 'bg-chassis/40 border-steel/80 text-bone opacity-60'
              }`}
            >
              {/* Top status */}
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-steel/80 border border-steel text-solder">
                  Chapter {idx + 1} of {modules.length}
                </span>

                <div>
                  {isCompleted ? (
                    <button
                      type="button"
                      onClick={() => handleOpenCheckpoint(idx)}
                      className="flex items-center gap-1 text-amber hover:text-amber300 text-xs font-bold bg-amber950/60 border border-amber/30 px-2 py-0.5 cursor-pointer"
                    >
                      <span className="text-amber font-bold font-mono">[ OK ]</span>
                      <span>Mastered</span>
                    </button>
                  ) : isActive ? (
                    <span className="flex items-center gap-1 text-bone text-xs font-bold">
                      <span className="text-amber font-bold font-mono">[ PLAY ]</span>
                      <span>Active Focus</span>
                    </span>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => onSelectModule(idx)}
                      className="text-[11px] text-solder hover:text-bone font-semibold cursor-pointer underline"
                    >
                      Jump to Chapter
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-solder text-xs font-medium">
                      <span className="text-amber font-bold font-mono">[ LOCK ]</span>
                      <span>Locked</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Summary */}
              <h4 className="text-xs font-bold line-clamp-1 mb-1">
                {mod.title}
              </h4>
              <p className="text-[11px] text-solder line-clamp-2 leading-relaxed">
                {mod.summary}
              </p>

              {/* Progress footer */}
              <div className="mt-3 pt-2 border-t border-steel/80 flex items-center justify-between text-[10px] text-solder w-full">
                <span>{mod.activities.length} Encoding Exercises</span>
                {isUnlocked && !isActive && (
                  <button
                    type="button"
                    onClick={() => onSelectModule(idx)}
                    className="text-bone hover:text-bone font-bold cursor-pointer"
                  >
                    Switch Module →
                  </button>
                )}
                {isCompleted && (
                  <span className="text-amber font-bold flex items-center gap-1">
                    <span className="text-amber font-bold font-mono">[ TROPHY ]</span> +150 XP
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feynman Checkpoint Modal */}
      <AnimatePresence>
        {showCheckpointModal && checkpoint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-chassis/80 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-deck border border-amber/40 p-6 space-y-5 my-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 bg-amber/20 border border-amber/40 text-amber">
                    <span className="text-amber font-bold font-mono">[ * ]</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-bone">
                      Feynman Mastery Checkpoint
                    </h3>
                    <p className="text-xs text-amber/80">
                      Module {currentModuleIndex + 1}: {activeModule.title}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCheckpointModal(false)}
                  className="text-solder hover:text-bone text-xs px-2 py-1 bg-steel cursor-pointer"
                >
                  [ X ]
                </button>
              </div>

              {/* Socratic Question */}
              <div className="p-4 bg-amber/30 border border-amber/30 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber block">
                  Causal Reasoning Prompt:
                </span>
                <p className="text-sm font-semibold text-amber-100 leading-relaxed">
                  &ldquo;{checkpoint.question}&rdquo;
                </p>
                {checkpoint.hint && (
                  <p className="text-xs text-amber/70 italic flex items-center gap-1.5 pt-1">
                    <span className="text-amber font-bold font-mono">[ ? ]</span>
                    <span>Hint: {checkpoint.hint}</span>
                  </p>
                )}
              </div>

              {/* Evaluation Rubric Guide */}
              <div className="grid grid-cols-3 gap-2 text-[10px] text-solder bg-chassis p-2.5 border border-steel">
                <div>
                  <strong className="text-bone block">1. Intuitive Analogy</strong>
                  <span>No memorized jargon</span>
                </div>
                <div>
                  <strong className="text-bone block">2. Causal Mechanism</strong>
                  <span>Why step A causes step B</span>
                </div>
                <div>
                  <strong className="text-bone block">3. First Principles</strong>
                  <span>Core scientific law</span>
                </div>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-solder">
                  Explain the core mechanism in simple, intuitive terms (avoid memorized jargon):
                </label>
                <textarea
                  value={checkpointAnswer}
                  onChange={(e) => setCheckpointAnswer(e.target.value)}
                  placeholder="Explain as if teaching a bright 12-year-old student..."
                  rows={4}
                  className="w-full bg-chassis border border-steel p-3 text-sm text-bone placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-mono"
                />
              </div>

              {/* Evaluation Result */}
              {evaluationResult && (
                <div
                  className={`p-4  border ${
                    evaluationResult.passed
                      ? 'bg-amber950/40 border-amber/50 text-amber200'
                      : 'bg-hazard950/40 border-hazard500/50 text-hazard200'
                  } space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      {evaluationResult.passed ? (
                        <>
                          <span className="text-amber font-bold font-mono">[ OK ]</span>
                          Mastery Verified (Score: {evaluationResult.score}/100)
                        </>
                      ) : (
                        <>Needs Socratic Elaboration (Score: {evaluationResult.score}/100)</>
                      )}
                    </span>
                    {evaluationResult.passed && (
                      <span className="px-2 py-0.5 bg-amber/20 text-amber300 text-xs font-bold">
                        +{evaluationResult.xpBonus} XP Earned!
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed">
                    {evaluationResult.feedback}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCheckpointModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-solder hover:text-bone cursor-pointer"
                >
                  {evaluationResult?.passed ? 'Done' : 'Back to Exercises'}
                </button>

                {evaluationResult?.passed ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCheckpointModal(false);
                      if (currentModuleIndex + 1 < modules.length) {
                        onSelectModule(currentModuleIndex + 1);
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 hover: hover: text-bone font-bold text-xs   cursor-pointer"
                  >
                    <span>Enter Next Chapter</span>
                    <span className="text-amber font-bold font-mono">[ NEXT ]</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEvaluateCheckpoint}
                    disabled={evaluating || !checkpointAnswer.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 hover: hover: text-bone font-bold text-xs   disabled:opacity-50 cursor-pointer"
                  >
                    {evaluating ? (
                      <>
                        <span className="text-amber font-bold font-mono">[ RESET ]</span>
                        <span>Evaluating Feynman Mastery...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-amber font-bold font-mono">[ ZAP ]</span>
                        <span>Submit for Verification</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
