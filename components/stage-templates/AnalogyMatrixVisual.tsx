'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { GitCompare, ArrowLeftRight, Check, Sparkles } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function AnalogyMatrixVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultMappings = [
    { sourceElement: 'Source Domain (Familiar Intuition)', targetElement: 'Target Mechanism (Abstract Theory)', explanation: 'Structural isomorphism' }
  ];

  const mappings = visualData.analogyMappings && visualData.analogyMappings.length > 0 
    ? visualData.analogyMappings 
    : defaultMappings;

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-cyan-500/20 text-cyan-400">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
            Analogical Schema Bridge & Structural Mapping
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded">
          Gentner Structure-Mapping (1983)
        </span>
      </div>

      {/* Cross-Domain Mapping Conduit Rows */}
      <div className="space-y-2.5">
        {mappings.map((mapping, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors"
          >
            {/* Familiar Source Side */}
            <div className="flex-1 p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-left">
              <span className="text-[9px] font-mono font-bold uppercase text-cyan-400 block mb-0.5">
                Familiar Source Domain
              </span>
              <div className="text-xs font-bold text-white">
                {mapping.sourceElement}
              </div>
            </div>

            {/* Connecting Bridge Arrow */}
            <div className="flex flex-col items-center justify-center shrink-0 text-cyan-400 px-1 py-0.5">
              <ArrowLeftRight className="w-4 h-4 transform rotate-90 sm:rotate-0" />
              <span className="text-[8px] font-mono text-slate-400 mt-0.5 hidden sm:inline">Maps To</span>
            </div>

            {/* Target Theory Side */}
            <div className="flex-1 p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-left">
              <span className="text-[9px] font-mono font-bold uppercase text-indigo-400 block mb-0.5">
                Target Science Concept
              </span>
              <div className="text-xs font-bold text-white">
                {mapping.targetElement}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Live Analogical Synthesis Preview */}
      {(field1 || selectedPreset) && (
        <div className="mt-3 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 flex items-start gap-2 text-xs">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-[10px] font-mono font-bold uppercase text-cyan-300 block">
              Active Analogical Bridge Anchor: {selectedPreset || 'Custom Domain'}
            </span>
            <p className="text-slate-200 font-serif italic mt-0.5 text-xs">
              &ldquo;{field1}&rdquo;
            </p>
            {field2 && (
              <p className="text-slate-300 text-[11px] mt-1 font-sans">
                <strong className="text-indigo-300">Exact Structural Correspondence: </strong>
                {field2}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
