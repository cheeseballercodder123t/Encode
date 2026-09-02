'use client';

import React from 'react';
import { Activity } from '@/lib/types';
import { User, Sparkles, Zap, Copy } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function PersonalSchemaVisual({ activity, field1, field2, field3 }: Props) {
  return (
    <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-indigo-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-400">
            <User className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-indigo-300">
            Personal Self-Reference & Episodic Memory Anchor (Rogers 1977)
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded">
          Long-Term Retention Multiplier
        </span>
      </div>

      {/* Dual Memory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {/* Card 1: Episodic Real-World Anchor */}
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-indigo-500/30 flex flex-col justify-between">
          <div>
            <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider block mb-1">
              Episodic Life Anchor
            </span>
            <h4 className="text-xs font-bold text-white mb-1">
              Personal Intuition & Real-World Trigger
            </h4>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Ground the theory in a specific time you encountered or used this principle in real life.
            </p>
          </div>
          {field1 ? (
            <div className="mt-2.5 pt-2 border-t border-indigo-500/20 text-[11px] text-indigo-200 font-serif italic">
              &ldquo;{field1}&rdquo;
            </div>
          ) : (
            <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-500 italic font-mono">
              Waiting for your episodic story in Step 1...
            </div>
          )}
        </div>

        {/* Card 2: High-Yield Spaced Repetition Flashcard Preview */}
        <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono font-bold text-purple-400 uppercase tracking-wider">
                Anki / SM-2 Synthesis Preview
              </span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <h4 className="text-xs font-bold text-white mb-1">
              Cloze Trigger & High-Yield Punchline
            </h4>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              The atomic question and answer for your spaced repetition deck.
            </p>
          </div>
          {field2 ? (
            <div className="mt-2.5 pt-2 border-t border-purple-500/20 text-[11px] text-purple-200 font-serif italic">
              &ldquo;{field2}&rdquo;
            </div>
          ) : (
            <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-500 italic font-mono">
              Waiting for flashcard punchline in Step 2...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
