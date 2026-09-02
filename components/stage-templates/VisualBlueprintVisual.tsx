'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Eye, Compass, MoveRight, Sparkles, Image as ImageIcon } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function VisualBlueprintVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  return (
    <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-purple-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-purple-500/20 text-purple-400">
            <Eye className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-purple-300">
            Paivio Dual-Coding Mental Blueprint (1986)
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded">
          Verbal + Spatial Imagery
        </span>
      </div>

      {/* 3-Component Dual-Coding Mental Anchor Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Component 1: Foreground Actor */}
        <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 relative flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-purple-400 uppercase tracking-wider mb-1">
              <span>Anchor 1: Focal Actor</span>
              <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">Subject</span>
            </div>
            <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Primary Visual Subject</span>
            </h4>
            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
              Vivid foreground entity performing the action.
            </p>
          </div>
          {field1 ? (
            <div className="mt-2.5 pt-2 border-t border-purple-500/20 text-[10px] text-purple-200 font-serif italic">
              &ldquo;{field1}&rdquo;
            </div>
          ) : (
            <div className="mt-2.5 pt-2 border-t border-purple-500/10 text-[10px] text-slate-500 italic font-mono">
              Waiting for Actor in Step 1...
            </div>
          )}
        </div>

        {/* Component 2: Dynamic Kinetic Vector */}
        <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/40 relative flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wider mb-1">
              <span>Anchor 2: Kinetic Vector</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">Action</span>
            </div>
            <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <MoveRight className="w-3.5 h-3.5 text-indigo-400" />
              <span>Dynamic Motion Vector</span>
            </h4>
            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
              The directional flow, force, chemical binding, or electrical transfer.
            </p>
          </div>
          {field2 ? (
            <div className="mt-2.5 pt-2 border-t border-indigo-500/20 text-[10px] text-indigo-200 font-serif italic">
              &ldquo;{field2}&rdquo;
            </div>
          ) : (
            <div className="mt-2.5 pt-2 border-t border-indigo-500/10 text-[10px] text-slate-500 italic font-mono">
              Waiting for Motion in Step 2...
            </div>
          )}
        </div>

        {/* Component 3: Spatial Canvas */}
        <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/40 relative flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[9px] font-mono font-bold text-blue-400 uppercase tracking-wider mb-1">
              <span>Anchor 3: Spatial Canvas</span>
              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">Environment</span>
            </div>
            <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span>Physical Spatial Boundary</span>
            </h4>
            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
              Cell membrane, axon terminal, network cable, or ledger ledger.
            </p>
          </div>
          {field3 ? (
            <div className="mt-2.5 pt-2 border-t border-blue-500/20 text-[10px] text-blue-200 font-serif italic">
              &ldquo;{field3}&rdquo;
            </div>
          ) : (
            <div className="mt-2.5 pt-2 border-t border-blue-500/10 text-[10px] text-slate-500 italic font-mono">
              Spatial anchor coordinates
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
