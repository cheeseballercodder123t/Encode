'use client';
import React, { useState } from 'react';
import { motion } from 'motion/react';

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
      className="mt-4 border border-steel/25  p-4 space-y-3 "
    >
      <div className="flex items-center gap-2">
        <span className="text-amber font-bold font-mono">[ IDEA ]</span>
        <p className="text-xs font-semibold text-bone uppercase tracking-wider">Meta-Reflection</p>
        <span className="text-[10px] text-solder font-mono ml-auto">Flavell (1979) Schema Consolidation</span>
      </div>
      <p className="text-xs text-solder">
        In one sentence : what is the single most important rule or insight you deduced from <span className="text-bone font-medium">{stageTitle}</span>?
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false); }}
          placeholder="The key insight I'm taking away is..."
          className="flex-1 bg-steel/60 border border-steel px-3 py-2 text-xs text-bone placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-steel/50 transition-none-colors"
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!value.trim()}
          className={`px-3.5 py-2  text-xs font-bold transition-none-all flex items-center gap-1.5 cursor-pointer ${
            saved
              ? 'bg-amber600/20 border border-amber/40 text-amber'
              : 'bg-steel hover:bg-steel text-bone disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {saved ? (
            <>
              <span className="text-amber font-bold font-mono">[ OK ]</span>
              <span>Saved</span>
            </>
          ) : (
            'Save'
          )}
        </button>
      </div>
      {saved && (
        <p className="text-[11px] text-amber font-medium">
          [ OK ] Reflection recorded in your metacognitive session log.
        </p>
      )}
    </motion.div>
  );
}
