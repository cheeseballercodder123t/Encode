'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { CheckSquare, Square, Brain, AlertCircle, Sparkles } from 'lucide-react';
import { Modal, Button, Textarea, Badge } from './ui/index';

interface Props {
  isOpen: boolean;
  stageNumber: number;
  stageTitle: string;
  previousPremise?: string;
  onConfirm: (latencyMs: number, summary: string) => void;
}

export function ReadinessModal({ isOpen, stageNumber, stageTitle, previousPremise, onConfirm }: Props) {
  const [summary, setSummary] = useState('');
  const [checked, setChecked] = useState(false);
  const [shaking, setShaking] = useState(false);
  const openedAt = useRef<number>(0);
  const shakeTimer = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) { 
      setSummary(''); 
      setChecked(false); 
      setShaking(false);
      return; 
    }
    openedAt.current = Date.now();
    shakeTimer.current = setTimeout(() => setShaking(true), 10000);
    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, [isOpen]);

  const canConfirm = checked && summary.trim().length >= 3;

  const handleConfirm = () => {
    if (!canConfirm) return;
    const latencyMs = Date.now() - openedAt.current;
    onConfirm(latencyMs, summary.trim());
  };

  const wordCount = summary.trim() ? summary.trim().split(/\s+/).length : 0;
  const overLimit = wordCount > 18;

  return (
    <Modal
      isOpen={isOpen}
      maxWidth="md"
      showCloseButton={false}
      isShaking={shaking}
      icon={
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <Brain className="w-5 h-5 text-emerald-400" />
        </div>
      }
      title={`Readiness Check: Stage ${stageNumber}`}
      description={stageTitle}
      footer={
        <Button 
          variant="emerald" 
          size="md" 
          onClick={handleConfirm}
          disabled={!canConfirm}
          rightIcon={<Sparkles className="w-4 h-4" />}
        >
          I'm Ready →
        </Button>
      }
    >
      <div className="space-y-4">
        {stageNumber > 1 && previousPremise && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Previous Stage Challenge</p>
            <p className="text-xs text-slate-300 italic">"{previousPremise}"</p>
          </div>
        )}

        <Textarea
          label={stageNumber === 1 ? "In a few words, what are you setting out to understand?" : "Summarize the previous takeaway in ≤15 words:"}
          placeholder={stageNumber === 1 ? 'e.g., How action potentials trigger depolarization...' : 'e.g., Mitochondria act as power generators burning fuel for ATP.'}
          value={summary}
          onChange={e => setSummary(e.target.value)}
          rows={2}
          wordLimit={15}
          currentWordCount={wordCount}
          helperText="Forced retrieval primes encoding"
          error={overLimit ? "Word limit exceeded" : undefined}
        />

        <button
          type="button"
          onClick={() => setChecked(c => !c)}
          className="flex items-start gap-3 w-full text-left group p-2 rounded-xl hover:bg-slate-800/40 transition-colors"
        >
          <div className="mt-0.5 text-emerald-400 group-hover:text-emerald-300 transition-colors shrink-0">
            {checked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            I am actively focused and ready to deduce the next cognitive schema.
          </p>
        </button>

        {shaking && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">Retrieval practice only works when you actively generate the memory instead of rushing through.</p>
          </motion.div>
        )}
      </div>
    </Modal>
  );
}
