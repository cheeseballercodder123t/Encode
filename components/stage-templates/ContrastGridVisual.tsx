'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Grid2X2, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function ContrastGridVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultMatrix = {
    axisX: 'Property A vs Property B',
    axisY: 'Type 1 vs Type 2',
    quadrants: [
      { title: 'Quadrant I: High X / High Y', items: ['Category Item 1', 'Category Item 2'], trapWarning: 'Exam trap: Do not confuse with Quadrant IV' },
      { title: 'Quadrant II: Low X / High Y', items: ['Category Item 3'], trapWarning: 'Subtle boundary condition' },
      { title: 'Quadrant III: Low X / Low Y', items: ['Category Item 4', 'Category Item 5'] },
      { title: 'Quadrant IV: High X / Low Y', items: ['Category Item 6'], trapWarning: 'Most commonly missed on multiple choice' }
    ]
  };

  const matrix = visualData.contrastMatrix && visualData.contrastMatrix.quadrants?.length === 4
    ? visualData.contrastMatrix
    : defaultMatrix;

  return (
    <div className="rounded-xl border border-pink-500/30 bg-gradient-to-br from-pink-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-pink-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-pink-500/20 text-pink-400">
            <Grid2X2 className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-pink-300">
            2x2 Discriminative Matrix & Disambiguation Grid
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-pink-300 bg-pink-950/40 border border-pink-500/30 px-2 py-0.5 rounded">
          Confusable Disambiguation
        </span>
      </div>

      {/* 2x2 Quadrant Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {matrix.quadrants?.map((quad, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-slate-900/70 border border-pink-500/20 hover:border-pink-500/40 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-pink-400" />
                  {quad.title}
                </span>
                <span className="text-[9px] font-mono font-bold text-pink-400">
                  Q{idx + 1}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                {quad.items?.map((it, iIdx) => (
                  <span
                    key={iIdx}
                    className="px-2 py-0.5 rounded-md bg-[#161926] border border-pink-500/30 text-[10px] font-mono text-pink-200"
                  >
                    {it}
                  </span>
                ))}
              </div>
            </div>

            {quad.trapWarning && (
              <div className="mt-2 pt-2 border-t border-pink-500/20 flex items-start gap-1.5 text-[10px] text-rose-300">
                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-tight">{quad.trapWarning}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* User Discriminative Rule Display */}
      {field1 && (
        <div className="p-3 rounded-xl bg-pink-950/30 border border-pink-500/30 flex items-start gap-2.5 text-xs">
          <Sparkles className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-pink-300 block">
              Your Disambiguating Rule / Trap Neutralizer:
            </span>
            <p className="text-slate-200 font-serif italic text-xs mt-0.5">
              &ldquo;{field1}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
