'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
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

  const labels = ['Clueless 😅', 'Shaky 🌀', 'Decent 🤔', 'Confident 💪', 'Expert [ FLAME ]'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onSkip}
      maxWidth="md"
      showCloseButton={false}
      icon={
        <div className="p-2 bg-steel/10 border border-steel/30 ">
          <span className="text-amber font-bold font-mono">[ BRAIN ]</span>
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
          <Badge variant="steel" size="sm">
            <span className="inline-flex items-center gap-1"><span className="text-amber font-bold font-mono">[ TIME ]</span>{countdown}s</span>
          </Badge>
        </div>

        {/* Topic preview */}
        {topicPreview && (
          <div className="bg-steel/40 border border-steel/50 p-3">
            <p className="text-[11px] text-solder uppercase tracking-wider font-semibold mb-1">Target Material</p>
            <p className="text-sm text-bone line-clamp-2">{topicPreview}</p>
          </div>
        )}

        {/* Science note */}
        <div className="bg-steel/5 border border-steel/20 p-3">
          <p className="text-[11px] text-bone leading-relaxed">
            <span className="font-semibold text-bone">Metacognitive Calibration (Nelson & Narens):</span> Assessing what you know before learning primes your memory retrieval systems.
          </p>
        </div>

        {/* Stars */}
        <div className="space-y-3">
          <p className="text-sm text-solder font-medium text-center">How confident are you in this topic right now?</p>
          <div className="flex items-center justify-center gap-2.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setSelected(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(0)}
                className="transition-none-transform hover:scale-125 focus:outline-none p-1"
              >
                <span className="text-amber font-bold font-mono">[ STAR ]</span>
              </button>
            ))}
          </div>
          {(hovered > 0 || selected > 0) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-xs text-amber font-semibold"
            >
              {labels[(hovered || selected) - 1]}
            </motion.p>
          )}
        </div>
      </div>
    </Modal>
  );
}
