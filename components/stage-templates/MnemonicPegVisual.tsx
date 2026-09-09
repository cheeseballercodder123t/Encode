'use client';

import React, { useState } from 'react';
import { Activity, MnemonicPegVisualData } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function MnemonicPegVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
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
    <div className="border border-steel bg-chassis p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-steel pb-2.5 mb-3 gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber">
          PHONETIC PEG // ACROSTIC LETTER MATRIX
        </span>
        <span className="text-[9px] font-mono font-bold text-solder border border-steel px-2 py-0.5">
          PEG CARDS
        </span>
      </div>

      {/* Generation Effect: Mnemonic Challenge Card */}
      <div className="p-3 border border-steel bg-deck space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-[10px] font-mono font-bold uppercase text-solder block whitespace-nowrap">
              PHONETIC PEG GENERATION CHALLENGE
            </span>
            <p className="text-xs text-bone font-medium leading-relaxed">
              {challenge.premisePrompt}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowClue(!showClue); playSound('click'); }}
            className={`text-[10px] font-mono font-bold uppercase tracking-wider border transition-none cursor-pointer ${
              showClue
                ? 'bg-amber border-amber text-chassis'
                : 'bg-chassis border-steel text-solder'
            }`}
          >
            {showClue ? 'HIDE HINT' : 'GET PEG CLUE'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="pt-2 border-t border-steel text-[11px] text-solder italic">
            MNEMONIC CLUE: {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Letter Peg Cards */}
      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
        {letters.map((item, idx) => {
          const isSelected = selectedLetter === idx;

          return (
            <div
              key={idx}
              onClick={() => { setSelectedLetter(isSelected ? null : idx); playSound('pop'); }}
              className={`p-3 border cursor-pointer transition-none flex flex-col items-center justify-center ${
                isSelected
                  ? 'border-amber bg-amber/10 text-chassis'
                  : 'border-steel bg-deck text-solder'
              }`}
            >
              <div className="w-9 h-9 border flex items-center justify-center font-mono text-lg font-bold mb-1 ${ isSelected ? 'border-amber' : 'border-steel'
              }">
                {item.letter}
              </div>
              <span className="text-xs font-bold text-bone text-center truncate max-w-full">
                {item.word}
              </span>
              {item.mnemonicCue && (
                <span className="text-[9px] font-mono text-solder text-center mt-1 italic truncate max-w-full">
                  {item.mnemonicCue}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Peg Model */}
      {hasUserGenerated && (
        <div className="p-3 border border-steel bg-deck text-xs space-y-1">
          <span className="text-[10px] font-mono font-bold uppercase text-amber block">
            YOUR SELF-GENERATED ACROSTIC PEG
          </span>
          {field1 && (
            <p className="text-bone font-mono italic">
              <strong>1. ACRONYM / SENTENCE:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder">
              <strong>2. DECODED MAPPING: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
