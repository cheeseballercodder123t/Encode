'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-chassis/80 ">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-2xl bg-chassis border border-steel overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-5 border-b border-steel bg-deck flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-steel/10 border border-steel/30 text-bone ">
                <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
              </div>
              <div>
                <h3 className="font-bold text-bone text-base">Active Retrieval Drill</h3>
                <p className="text-xs text-solder">Testing: {schema.topicSummary}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-solder hover:text-bone hover:bg-steel transition-none-colors"
            >
              <span className="text-amber font-bold font-mono">[ X ]</span>
            </button>
          </div>

          {/* Drill Content */}
          <div className="p-6 overflow-y-auto flex-1 flex flex-col justify-between">
            {!isFinished ? (
              <div className="space-y-6">
                
                {/* Progress */}
                <div className="flex items-center justify-between text-xs text-solder">
                  <span className="font-bold uppercase tracking-wider text-bone">
                    Card {currentIndex + 1} of {schema.activities.length}
                  </span>
                  <span className="font-mono bg-deck px-2.5 py-1 border border-steel">
                    {currentAct.framework}
                  </span>
                </div>

                {/* Question Card */}
                <div className="bg-deck p-5 border border-steel">
                  <h4 className="text-xs font-bold text-solder uppercase tracking-wider mb-1.5">
                    {currentAct.title}
                  </h4>
                  <p className="text-base font-semibold text-bone mb-4">
                    {currentAct.prompt}
                  </p>

                  <div className="p-3.5 bg-chassis/40 border border-steel font-mono italic text-xs text-solder">
                    <span className="text-bone font-mono font-bold text-[10px] uppercase mr-2">Context Cue:</span>
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
                      className="flex items-center gap-2 mx-auto px-6 py-3 bg-steel hover:bg-steel text-bone text-xs font-bold uppercase tracking-wider border border-steel/50   transition-none-all cursor-pointer"
                    >
                      <span className="text-amber font-bold font-mono">[ EYE ]</span>
                      Reveal My Encoded Schema
                    </button>
                    <p className="text-[11px] text-solder mt-2">
                      Try to mentally retrieve your answers before revealing!
                    </p>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="bg-deck p-4 border border-steel/30 space-y-3">
                      <div>
                        <span className="text-[10px] font-bold text-bone uppercase block mb-1">
                          {currentAct.scaffold.field1Label}
                        </span>
                        <p className="text-xs text-bone font-mono leading-relaxed">
                          {userResp.field1 || '(No answer provided)'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-steel">
                        <span className="text-[10px] font-bold text-bone uppercase block mb-1">
                          {currentAct.scaffold.field2Label}
                        </span>
                        <p className="text-xs text-bone font-mono leading-relaxed">
                          {userResp.field2 || '(No answer provided)'}
                        </p>
                      </div>

                      {userResp.field3 && (
                        <div className="pt-2 border-t border-steel">
                          <span className="text-[10px] font-bold text-amber uppercase block mb-1">
                            {currentAct.scaffold.field3Label || 'Anchor'}
                          </span>
                          <p className="text-xs text-bone font-mono leading-relaxed">
                            {userResp.field3}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Self-Scoring Buttons */}
                    <div className="pt-2">
                      <p className="text-center text-xs text-solder mb-3 font-semibold">
                        How accurately did you recall this schema?
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleScore(false)}
                          className="flex items-center justify-center gap-2 p-3 bg-hazard500/10 hover:bg-hazard500/20 border border-hazard500/30 text-hazard300 font-bold text-xs transition-none-all"
                        >
                          <span className="text-amber font-bold font-mono">[ - ]</span>
                          Missed / Need Review
                        </button>
                        <button
                          onClick={() => handleScore(true)}
                          className="flex items-center justify-center gap-2 p-3 bg-amber/10 hover:bg-amber/20 border border-amber/30 text-amber300 font-bold text-xs transition-none-all"
                        >
                          <span className="text-amber font-bold font-mono">[ + ]</span>
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
                <div className="inline-flex items-center justify-center p-4 bg-amber/10 text-amber border border-amber/30 ">
                  <span className="text-amber font-bold font-mono">[ OK ]</span>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-bone mb-1">Drill Session Complete!</h3>
                  <p className="text-xs text-solder font-mono italic">
                    Active testing reinforces the neural pathways constructed during initial encoding.
                  </p>
                </div>

                <div className="bg-deck p-5 border border-steel max-w-sm mx-auto flex items-center justify-around">
                  <div>
                    <div className="text-2xl font-bold font-mono text-amber">
                      {Math.round((recalledCount / schema.activities.length) * 100)}%
                    </div>
                    <span className="text-[10px] text-solder uppercase font-bold">Accuracy</span>
                  </div>
                  <div className="h-8 w-px bg-steel" />
                  <div>
                    <div className="text-2xl font-bold font-mono text-bone">
                      {recalledCount} / {schema.activities.length}
                    </div>
                    <span className="text-[10px] text-solder uppercase font-bold">Recalled</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={handleRestart}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-steel hover:bg-steel text-bone text-xs font-bold"
                  >
                    <span className="text-amber font-bold font-mono">[ RESET ]</span>
                    Drill Again
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-steel hover:bg-steel text-bone text-xs font-bold  "
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
