'use client';
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lightbulb, Check } from 'lucide-react';

interface Props {
  stageTitle: string;
  savedReflection?: string;
  onSave: (reflection: string) => void;
}

export function MetaReflectionPrompt({ stageTitle, savedReflection, onSave }: Props) {
  const [value, setValue] = useState(savedReflection || '');
  const [saved, setSaved] = useState(!!savedReflection);

  const handleSave = () => {
    if (!value.trim()) return;
    onSave(value.trim());
    setSaved(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/25 rounded-2xl p-4 space-y-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-violet-400" />
        <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Meta-Reflection</p>
        <span className="text-[10px] text-slate-400 font-mono ml-auto">Flavell (1979) Schema Consolidation</span>
      </div>
      <p className="text-xs text-slate-300">
        In one sentence — what is the single most important rule or insight you deduced from <span className="text-violet-300 font-medium">{stageTitle}</span>?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false); }}
          placeholder="The key insight I'm taking away is..."
          className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 transition-colors"
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim()}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            saved
              ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
              : 'bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Saved</span>
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {saved && (
        <p className="text-[11px] text-emerald-400 font-medium">
          ✓ Reflection recorded in your metacognitive session log.
        </p>
      )}
    </motion.div>
  );
}
