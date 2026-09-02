'use client';

import React, { useState } from 'react';
import { Activity, VisualBlueprintVisualData, VisualBlueprintAnchor } from '@/lib/types';
import { Compass, Sparkles, HelpCircle, Eye, Layers } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function VisualBlueprintVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);
  const [showClue, setShowClue] = useState(false);

  const defaultAnchors: VisualBlueprintAnchor[] = [
    { id: 'top', label: 'Top / Anterior Zone', spatialPosition: 'top', sensoryDetail: 'Primary driving intake / signal receptor' },
    { id: 'center', label: 'Center Core Engine', spatialPosition: 'center', sensoryDetail: 'Central transformative reaction mechanism' },
    { id: 'bottom', label: 'Bottom / Posterior Vent', spatialPosition: 'bottom', sensoryDetail: 'Output conduit / equilibrium discharge' }
  ];

  const anchors = visualData.anchors && visualData.anchors.length > 0
    ? visualData.anchors
    : defaultAnchors;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "If you had to sketch this process on a blank whiteboard, where is the center of motion and which direction does energy/matter travel?",
    clue: "Anchor the primary actor in the center, assign vivid colors to inputs vs outputs, and trace the directional arrow.",
    missingRoleOrTarget: "Spatial Mental Blueprint",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-violet-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-violet-500/20 text-violet-400">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-violet-300">
            Paivio Dual-Coding & Mental Spatial Blueprint
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-violet-300 bg-violet-950/40 border border-violet-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Layers className="w-2.5 h-2.5" /> Spatial Anchors
        </span>
      </div>

      {/* Generation Effect: Dual-Coding Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-violet-950/30 border border-violet-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-violet-300 block">
                Dual-Coding Mental Sketch Challenge
              </span>
              <p className="text-xs text-violet-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-violet-400 hover:text-violet-300 bg-violet-900/30 px-2 py-1 rounded border border-violet-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Spatial Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-violet-500/20 text-[11px] text-violet-200/90 italic font-serif">
            💡 <strong>Spatial Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Spatial Mental Canvas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {anchors.map((anchor, idx) => {
          const isSelected = selectedAnchor === anchor.id;

          return (
            <div
              key={idx}
              onClick={() => setSelectedAnchor(isSelected ? null : anchor.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-violet-400/80 bg-violet-950/50 ring-1 ring-violet-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-violet-500/40'
              }`}
            >
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-violet-300 bg-violet-950/60 border border-violet-500/30 px-1.5 py-0.5 rounded block w-fit mb-1.5">
                  Spatial Anchor: {anchor.spatialPosition}
                </span>

                <h4 className="text-xs font-bold text-white mb-1">
                  {anchor.label}
                </h4>

                <p className="text-[11px] text-slate-300 font-serif leading-relaxed">
                  {anchor.sensoryDetail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Generated Dual-Coding Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-slate-900/50 border border-violet-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-violet-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Your Mental Spatial Blueprint
            </span>
            <span className="text-[9px] font-mono text-violet-400 bg-violet-950/60 border border-violet-500/30 px-1.5 py-0.5 rounded">
              Image Encoded
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>1. Foreground Spatial Focus:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-violet-300">2. Motion Vector & Dynamic: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
