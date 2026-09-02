'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Brain, Star, Clock } from 'lucide-react';
import { Modal, Button, Badge } from './ui/index';

interface Props {
  isOpen: boolean;
  topicPreview: string;
  onConfirm: (stars: number) => void;
  onSkip: () => void;
}

export function PreSessionConfidenceModal({ isOpen, topicPreview, onConfirm, onSkip }: Props) {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!isOpen) { setSelected(0); setHovered(0); setCountdown(10); return; }
    const t = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  useEffect(() => {
    if (countdown <= 0 && isOpen) onConfirm(selected || 3);
  }, [countdown, isOpen, selected, onConfirm]);

  const labels = ['Clueless 😅', 'Shaky 🌀', 'Decent 🤔', 'Confident 💪', 'Expert 🔥'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onSkip}
      maxWidth="md"
      showCloseButton={false}
      icon={
        <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
          <Brain className="w-5 h-5 text-indigo-400" />
        </div>
      }
      title="Before we begin..."
      description="Rate your current confidence so the AI calibrates scaffolding"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Button>
          <Button variant="primary" size="md" onClick={() => onConfirm(selected || 3)}>
            Begin Workout
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Countdown badge */}
        <div className="flex justify-end">
          <Badge variant="slate" size="sm" icon={<Clock className="w-3.5 h-3.5" />}>
            {countdown}s
          </Badge>
        </div>

        {/* Topic preview */}
        {topicPreview && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Target Material</p>
            <p className="text-sm text-slate-200 line-clamp-2">{topicPreview}</p>
          </div>
        )}

        {/* Science note */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3">
          <p className="text-[11px] text-indigo-300 leading-relaxed">
            <span className="font-semibold text-indigo-200">Metacognitive Calibration (Nelson & Narens):</span> Assessing what you know before learning primes your memory retrieval systems.
          </p>
        </div>

        {/* Stars */}
        <div className="space-y-3">
          <p className="text-sm text-slate-300 font-medium text-center">How confident are you in this topic right now?</p>
          <div className="flex items-center justify-center gap-2.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setSelected(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="transition-transform hover:scale-125 focus:outline-none p-1"
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    n <= (hovered || selected)
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-700 fill-slate-800'
                  }`}
                />
              </button>
            ))}
          </div>
          {(hovered > 0 || selected > 0) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-xs text-amber-300 font-semibold"
            >
              {labels[(hovered || selected) - 1]}
            </motion.p>
          )}
        </div>
      </div>
    </Modal>
  );
}
