'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Hash, Sparkles, Volume2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function MnemonicPegVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultLetters = [
    { letter: 'O', word: 'Olfactory', mnemonicCue: 'Old' },
    { letter: 'O', word: 'Optic', mnemonicCue: 'Olympus' },
    { letter: 'O', word: 'Oculomotor', mnemonicCue: 'Towering' },
    { letter: 'T', word: 'Trochlear', mnemonicCue: 'Tops' },
    { letter: 'T', word: 'Trigeminal', mnemonicCue: 'A' },
    { letter: 'A', word: 'Abducens', mnemonicCue: 'Finn' },
    { letter: 'F', word: 'Facial', mnemonicCue: 'And' },
    { letter: 'V', word: 'Vestibulocochlear', mnemonicCue: 'German' }
  ];

  const letters = visualData.acronymLetters && visualData.acronymLetters.length > 0
    ? visualData.acronymLetters
    : defaultLetters;

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-yellow-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-yellow-500/20 text-yellow-400">
            <Hash className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-yellow-300">
            Phonetic Peg & Acronym Letter Matrix
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-yellow-300 bg-yellow-950/40 border border-yellow-500/30 px-2 py-0.5 rounded">
          {letters.length} Letter Sequence
        </span>
      </div>

      {/* Glowing Acronym Tiles */}
      <div className="flex flex-wrap gap-2 mb-3">
        {letters.map((item, idx) => (
          <div
            key={idx}
            className="flex-1 min-w-[90px] p-2.5 rounded-xl bg-slate-900/80 border border-yellow-500/30 hover:border-yellow-400 text-center transition-all group"
          >
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 font-black font-mono text-base flex items-center justify-center mx-auto mb-1 group-hover:scale-110 transition-transform">
              {item.letter}
            </div>
            <div className="text-[11px] font-bold text-white leading-tight">
              {item.word}
            </div>
            {item.mnemonicCue && (
              <div className="text-[9px] font-mono text-yellow-400/90 mt-0.5 italic">
                &ldquo;{item.mnemonicCue}&rdquo;
              </div>
            )}
          </div>
        ))}
      </div>

      {/* User Generated Acronym / Peg String */}
      {(field1 || field2) && (
        <div className="p-3 rounded-xl bg-yellow-950/30 border border-yellow-500/30 flex items-start gap-2.5 text-xs">
          <Sparkles className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-yellow-300 block">
              Your Custom Mnemonic Acrostic / Peg Phrase:
            </span>
            <p className="text-slate-200 font-serif italic text-xs mt-0.5">
              &ldquo;{field1}&rdquo;
            </p>
            {field2 && (
              <p className="text-slate-300 text-[11px] mt-1 font-sans">
                <strong className="text-yellow-400">Phonetic Association: </strong>
                {field2}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
