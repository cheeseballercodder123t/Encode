'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  Lock, 
  Play, 
  Sparkles, 
  BrainCircuit, 
  Award, 
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Zap,
  Check
} from 'lucide-react';
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
    <div className="w-full rounded-2xl border border-indigo-500/20 bg-slate-900/90 backdrop-blur-xl p-4 sm:p-6 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <BrainCircuit className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
              Miller&apos;s Law Adaptive Guided Path
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase">
              7±2 Chunked Progression
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Textbook decomposed into {modules.length} digestible modules. Pass the Feynman Checkpoint at each milestone to unlock the next chapter.
          </p>
        </div>

        {isAllActivitiesDoneForCurrentModule && !activeModule.completed && (
          <button
            type="button"
            onClick={() => handleOpenCheckpoint()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0 animate-pulse cursor-pointer"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>Unlock Next Chapter (Feynman Check)</span>
          </button>
        )}
      </div>

      {/* Roadmap Progress Bar */}
      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-36 sm:w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${(completedModulesCount / Math.max(1, modules.length)) * 100}%` }}
            />
          </div>
          <span className="text-slate-300 font-semibold text-[11px] whitespace-nowrap">
            {completedModulesCount} of {modules.length} Chapters Mastered
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-slate-400">
            Active Focus: <strong className="text-indigo-300">Chapter {currentModuleIndex + 1}</strong>
          </span>
          <span className="text-amber-400 font-bold flex items-center gap-1">
            <Award className="w-3.5 h-3.5" />
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
              className={`relative flex flex-col p-4 rounded-xl text-left border transition-all ${
                isActive
                  ? 'bg-indigo-950/40 border-indigo-500 text-white ring-2 ring-indigo-500/40 shadow-xl shadow-indigo-500/10'
                  : isCompleted
                  ? 'bg-emerald-950/20 hover:bg-emerald-950/30 border-emerald-500/40 text-slate-200'
                  : isUnlocked
                  ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-300'
                  : 'bg-slate-950/40 border-slate-800/80 text-slate-600 opacity-60'
              }`}
            >
              {/* Top status */}
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-300">
                  Chapter {idx + 1} of {modules.length}
                </span>

                <div>
                  {isCompleted ? (
                    <button
                      type="button"
                      onClick={() => handleOpenCheckpoint(idx)}
                      className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs font-bold bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mastered</span>
                    </button>
                  ) : isActive ? (
                    <span className="flex items-center gap-1 text-indigo-400 text-xs font-bold">
                      <Play className="w-3.5 h-3.5 fill-indigo-400" />
                      <span>Active Focus</span>
                    </span>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      onClick={() => onSelectModule(idx)}
                      className="text-[11px] text-slate-400 hover:text-white font-semibold cursor-pointer underline"
                    >
                      Jump to Chapter
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500 text-xs font-medium">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Locked</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Title & Summary */}
              <h4 className="text-xs font-bold line-clamp-1 mb-1">
                {mod.title}
              </h4>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                {mod.summary}
              </p>

              {/* Progress footer */}
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 w-full">
                <span>{mod.activities.length} Encoding Exercises</span>
                {isUnlocked && !isActive && (
                  <button
                    type="button"
                    onClick={() => onSelectModule(idx)}
                    className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                  >
                    Switch Module →
                  </button>
                )}
                {isCompleted && (
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Award className="w-3 h-3" /> +150 XP
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-6 space-y-5 my-6"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Feynman Mastery Checkpoint
                    </h3>
                    <p className="text-xs text-amber-300/80">
                      Module {currentModuleIndex + 1}: {activeModule.title}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCheckpointModal(false)}
                  className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Socratic Question */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                  Causal Reasoning Prompt:
                </span>
                <p className="text-sm font-semibold text-amber-100 leading-relaxed">
                  &ldquo;{checkpoint.question}&rdquo;
                </p>
                {checkpoint.hint && (
                  <p className="text-xs text-amber-300/70 italic flex items-center gap-1.5 pt-1">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Hint: {checkpoint.hint}</span>
                  </p>
                )}
              </div>

              {/* Evaluation Rubric Guide */}
              <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <strong className="text-slate-200 block">1. Intuitive Analogy</strong>
                  <span>No memorized jargon</span>
                </div>
                <div>
                  <strong className="text-slate-200 block">2. Causal Mechanism</strong>
                  <span>Why step A causes step B</span>
                </div>
                <div>
                  <strong className="text-slate-200 block">3. First Principles</strong>
                  <span>Core scientific law</span>
                </div>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Explain the core mechanism in simple, intuitive terms (avoid memorized jargon):
                </label>
                <textarea
                  value={checkpointAnswer}
                  onChange={(e) => setCheckpointAnswer(e.target.value)}
                  placeholder="Explain as if teaching a bright 12-year-old student..."
                  rows={4}
                  className="w-full rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none font-sans"
                />
              </div>

              {/* Evaluation Result */}
              {evaluationResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    evaluationResult.passed
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  } space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      {evaluationResult.passed ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          Mastery Verified (Score: {evaluationResult.score}/100)
                        </>
                      ) : (
                        <>Needs Socratic Elaboration (Score: {evaluationResult.score}/100)</>
                      )}
                    </span>
                    {evaluationResult.passed && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold">
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
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
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <span>Enter Next Chapter</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEvaluateCheckpoint}
                    disabled={evaluating || !checkpointAnswer.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    {evaluating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Evaluating Feynman Mastery...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-slate-950" />
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
