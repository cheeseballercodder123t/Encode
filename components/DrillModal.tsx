'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Brain, 
  CheckCircle, 
  RotateCcw, 
  ArrowRight, 
  Sparkles, 
  Eye, 
  ThumbsUp, 
  ThumbsDown,
  Award,
  Zap
} from 'lucide-react';
import { SavedSchema } from '@/lib/types';
import { sound } from '@/lib/audio';

interface DrillModalProps {
  schema: SavedSchema | null;
  isOpen: boolean;
  onClose: () => void;
  onDrillComplete?: (score: number) => void;
}

export function DrillModal({ schema, isOpen, onClose, onDrillComplete }: DrillModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [recalledCount, setRecalledCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen || !schema || !schema.activities || schema.activities.length === 0) return null;

  const currentAct = schema.activities[currentIndex];
  const userResp = schema.userResponses[currentAct?.id] || { field1: '', field2: '', field3: '' };

  const handleScore = (success: boolean) => {
    if (success) {
      sound.playSuccess();
      setRecalledCount(prev => prev + 1);
    } else {
      sound.playBeep(350, 'sine', 0.15);
    }

    if (currentIndex < schema.activities.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setRevealed(false);
    } else {
      sound.playLevelUp();
      setIsFinished(true);
      if (onDrillComplete) {
        const finalScore = Math.round(((recalledCount + (success ? 1 : 0)) / schema.activities.length) * 100);
        onDrillComplete(finalScore);
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setRevealed(false);
    setRecalledCount(0);
    setIsFinished(false);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-2xl bg-[#0F111A] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-[#131622] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Active Retrieval Drill</h3>
                <p className="text-xs text-slate-400">Testing: {schema.topicSummary}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drill Content */}
          <div className="p-6 overflow-y-auto flex-1 flex flex-col justify-between">
            {!isFinished ? (
              <div className="space-y-6">
                
                {/* Progress */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-indigo-400">
                    Card {currentIndex + 1} of {schema.activities.length}
                  </span>
                  <span className="font-mono bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                    {currentAct.framework}
                  </span>
                </div>

                {/* Question Card */}
                <div className="bg-[#141724] p-5 rounded-xl border border-slate-800">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {currentAct.title}
                  </h4>
                  <p className="text-base font-semibold text-white mb-4">
                    {currentAct.prompt}
                  </p>

                  <div className="p-3.5 bg-black/40 rounded-lg border border-slate-800 font-serif italic text-xs text-slate-300">
                    <span className="text-indigo-300 font-sans font-bold text-[10px] uppercase mr-2">Context Cue:</span>
                    {currentAct.contextSnippet}
                  </div>
                </div>

                {/* Reveal Area */}
                {!revealed ? (
                  <div className="text-center py-6">
                    <button
                      onClick={() => {
                        setRevealed(true);
                        sound.playBeep(700, 'sine', 0.1);
                      }}
                      className="flex items-center gap-2 mx-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-indigo-500/50 shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      Reveal My Encoded Schema
                    </button>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Try to mentally retrieve your answers before revealing!
                    </p>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="bg-[#11131F] p-4 rounded-xl border border-indigo-500/30 space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">
                          {currentAct.scaffold.field1Label}
                        </span>
                        <p className="text-xs text-slate-200 font-serif leading-relaxed">
                          {userResp.field1 || '(No answer provided)'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-800">
                        <span className="text-[10px] font-bold text-purple-400 uppercase block mb-1">
                          {currentAct.scaffold.field2Label}
                        </span>
                        <p className="text-xs text-slate-200 font-serif leading-relaxed">
                          {userResp.field2 || '(No answer provided)'}
                        </p>
                      </div>

                      {userResp.field3 && (
                        <div className="pt-2 border-t border-slate-800">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase block mb-1">
                            {currentAct.scaffold.field3Label || 'Anchor'}
                          </span>
                          <p className="text-xs text-slate-200 font-serif leading-relaxed">
                            {userResp.field3}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Self-Scoring Buttons */}
                    <div className="pt-2">
                      <p className="text-center text-xs text-slate-400 mb-3 font-semibold">
                        How accurately did you recall this schema?
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleScore(false)}
                          className="flex items-center justify-center gap-2 p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-xl font-bold text-xs transition-all"
                        >
                          <ThumbsDown className="w-4 h-4" />
                          Missed / Need Review
                        </button>
                        <button
                          onClick={() => handleScore(true)}
                          className="flex items-center justify-center gap-2 p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl font-bold text-xs transition-all"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          Retrieved Successfully!
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

              </div>
            ) : (
              /* Finish Screen */
              <div className="text-center py-8 space-y-6">
                <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">Drill Session Complete!</h3>
                  <p className="text-xs text-slate-400 font-serif italic">
                    Active testing reinforces the neural pathways constructed during initial encoding.
                  </p>
                </div>

                <div className="bg-[#141724] p-5 rounded-xl border border-slate-800 max-w-sm mx-auto flex items-center justify-around">
                  <div>
                    <div className="text-2xl font-bold font-mono text-emerald-400">
                      {Math.round((recalledCount / schema.activities.length) * 100)}%
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Accuracy</span>
                  </div>
                  <div className="h-8 w-px bg-slate-800" />
                  <div>
                    <div className="text-2xl font-bold font-mono text-indigo-400">
                      {recalledCount} / {schema.activities.length}
                    </div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Recalled</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={handleRestart}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Drill Again
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
