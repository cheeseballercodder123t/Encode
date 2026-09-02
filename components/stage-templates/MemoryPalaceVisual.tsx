'use client';

import React, { useState } from 'react';
import { Activity, MemoryPalaceVisualData } from '@/lib/types';
import { Castle, Sparkles, HelpCircle, Eye, EyeOff, MapPin, Footprints } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function MemoryPalaceVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};
  const [activeLocus, setActiveLocus] = useState<number>(0);
  const [revealedHooks, setRevealedHooks] = useState<Record<number, boolean>>({ 0: true });
  const [showClue, setShowClue] = useState(false);

  const defaultRooms = [
    { locusNumber: 1, roomName: 'Foyer / Grand Entrance', itemPlaced: 'First Key Concept', vividSensoryHook: 'Glow-in-the-dark neon door that screams when touched' },
    { locusNumber: 2, roomName: 'Living Room Hearth', itemPlaced: 'Second Mechanism', vividSensoryHook: 'Exploding fountain of sparks pulsing with rhythmic beats' },
    { locusNumber: 3, roomName: 'Kitchen Island', itemPlaced: 'Third Outcome', vividSensoryHook: 'Giant bubbling cauldron overflowing with vibrating liquid crystals' }
  ];

  const rooms = visualData.palaceRooms && visualData.palaceRooms.length > 0
    ? visualData.palaceRooms
    : defaultRooms;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "Pick a physical room and anchor the abstract rule to an exaggerated, bizarre, multisensory interaction.",
    clue: "Make it violently colorful, bizarre, loud, or funny. Normal memories are quickly forgotten.",
    missingRoleOrTarget: "Vivid Sensory Locus Hook",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const toggleHook = (idx: number) => {
    setRevealedHooks(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-amber-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/20 text-amber-400">
            <Castle className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
            Method of Loci & Spatial Architectural Journey
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Footprints className="w-2.5 h-2.5" /> Room Journey
        </span>
      </div>

      {/* Generation Effect: Memory Palace Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-amber-300 block">
                Spatial Anchor & Sensory Hook Challenge
              </span>
              <p className="text-xs text-amber-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-amber-400 hover:text-amber-300 bg-amber-900/30 px-2 py-1 rounded border border-amber-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Sensory Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-amber-500/20 text-[11px] text-amber-200/90 italic font-serif">
            💡 <strong>Mnemonic Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Loci Stations Walk */}
      <div className="space-y-2.5">
        {rooms.map((room, idx) => {
          const isCurrent = activeLocus === idx;
          const isRevealed = revealedHooks[idx] ?? false;

          return (
            <div
              key={idx}
              onClick={() => setActiveLocus(idx)}
              className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                isCurrent
                  ? 'border-amber-400/80 bg-amber-950/40 ring-1 ring-amber-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-amber-500/40'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-300 font-mono text-[10px] font-bold">
                  {room.locusNumber || idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-white">
                      {room.roomName}
                    </span>
                    <span className="text-[9px] font-mono text-amber-300 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.2 rounded">
                      Anchored Item: {room.itemPlaced}
                    </span>
                  </div>

                  {/* Vivid Sensory Hook */}
                  <div className="mt-1 text-[11px] text-slate-300 font-serif italic">
                    {isRevealed ? (
                      <span className="text-amber-200">✨ &ldquo;{room.vividSensoryHook}&rdquo;</span>
                    ) : (
                      <span className="text-slate-500 italic">Click reveal to view bizarre sensory image...</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  toggleHook(idx);
                }}
                className="text-[10px] font-mono text-amber-400 hover:text-amber-300 bg-amber-950/50 px-2 py-1 rounded border border-amber-500/30 shrink-0 self-end sm:self-center transition-colors"
              >
                {isRevealed ? 'Hide Image' : 'Reveal Hook'}
              </button>
            </div>
          );
        })}
      </div>

      {/* User Generated Palace Locus */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-slate-900/50 border border-amber-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Your Self-Generated Loci Anchor
            </span>
            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded">
              Palace Station
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>Room / Station:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-amber-300">Bizarre Sensory Action: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
