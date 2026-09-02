'use client';

import React, { useState } from 'react';
import { Activity, MnemonicPegVisualData } from '@/lib/types';
import { KeyRound, Sparkles, HelpCircle, Volume2, Mic } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function MnemonicPegVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};
  const [selectedLetter, setSelectedLetter] = useState<number | null>(0);
  const [showClue, setShowClue] = useState(false);

  const defaultLetters = [
    { letter: 'O', word: 'Olfactory', mnemonicCue: 'Old Olympus Towering Tops...' },
    { letter: 'O', word: 'Optic', mnemonicCue: 'Optical sight vision' },
    { letter: 'O', word: 'Oculomotor', mnemonicCue: 'Motor eyeball movements' },
    { letter: 'T', word: 'Trochlear', mnemonicCue: 'Pulley trochlea downward' }
  ];

  const letters = visualData.acronymLetters && visualData.acronymLetters.length > 0
    ? visualData.acronymLetters
    : defaultLetters;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "Construct an acronym or phonetic peg sentence where the first letter of each word forces the retrieval of this exact sequence.",
    clue: "Make the sentence tell a ridiculous story or rhyme with numbers (1 is a Bun, 2 is a Shoe...).",
    missingRoleOrTarget: "Phonetic Acronym / Peg Sentence",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-yellow-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-yellow-500/20 text-yellow-400">
            <KeyRound className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-yellow-300">
            Phonetic Peg & Acrostic Letter Matrix
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-yellow-300 bg-yellow-950/40 border border-yellow-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Mic className="w-2.5 h-2.5" /> Peg Cards
        </span>
      </div>

      {/* Generation Effect: Mnemonic Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-yellow-950/30 border border-yellow-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-yellow-300 block">
                Phonetic Peg Generation Challenge
              </span>
              <p className="text-xs text-yellow-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-yellow-400 hover:text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded border border-yellow-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Peg Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-yellow-500/20 text-[11px] text-yellow-200/90 italic font-serif">
            💡 <strong>Mnemonic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Letter Peg Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
        {letters.map((item, idx) => {
          const isSelected = selectedLetter === idx;

          return (
            <div
              key={idx}
              onClick={() => setSelectedLetter(isSelected ? null : idx)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col items-center justify-center ${
                isSelected
                  ? 'border-yellow-400/80 bg-yellow-950/50 ring-1 ring-yellow-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-yellow-500/40'
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center font-mono text-lg font-black text-yellow-300 mb-1">
                {item.letter}
              </div>
              <span className="text-xs font-bold text-white text-center truncate max-w-full">
                {item.word}
              </span>
              {item.mnemonicCue && (
                <span className="text-[9px] font-mono text-slate-400 text-center mt-1 italic truncate max-w-full">
                  {item.mnemonicCue}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Peg Model */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-yellow-950/40 via-amber-950/30 to-slate-900/50 border border-yellow-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-yellow-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              Your Self-Generated Acrostic Peg
            </span>
            <span className="text-[9px] font-mono text-yellow-400 bg-yellow-950/60 border border-yellow-500/30 px-1.5 py-0.5 rounded">
              Peg Linked
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Acronym / Sentence:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-yellow-300">2. Decoded Mapping: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
