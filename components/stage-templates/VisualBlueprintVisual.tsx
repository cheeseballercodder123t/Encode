'use client';

import React, { useState } from 'react';
import { Activity, VisualBlueprintVisualData, VisualBlueprintAnchor } from '@/lib/types';

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
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-bone">
            <span className="text-amber font-bold font-mono">[ COMPASS ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-bone">
            Paivio Dual-Coding & Mental Spatial Blueprint
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-bone bg-steel/40 border border-steel/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ LAYERS ]</span> Spatial Anchors
        </span>
      </div>

      {/* Generation Effect: Dual-Coding Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-bone block">
                Dual-Coding Mental Sketch Challenge
              </span>
              <p className="text-xs text-bone font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-bone hover:text-bone bg-steel/30 px-2 py-1 border border-steel/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Spatial Clue'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-bone/90 italic font-mono">
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
              className={`p-3.5  border transition-none-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-steel/80 bg-steel/50 ring-1 ring-violet-400/50 '
                  : 'border-steel/60 bg-deck/60 hover:border-steel/40'
              }`}
            >
              <div>
                <span className="text-[9px] font-mono font-bold uppercase text-bone bg-steel/60 border border-steel/30 px-1.5 py-0.5 block w-fit mb-1.5">
                  Spatial Anchor: {anchor.spatialPosition}
                </span>

                <h4 className="text-xs font-bold text-bone mb-1">
                  {anchor.label}
                </h4>

                <p className="text-[11px] text-solder font-mono leading-relaxed">
                  {anchor.sensoryDetail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Generated Dual-Coding Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-bone flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Mental Spatial Blueprint
            </span>
            <span className="text-[9px] font-mono text-bone bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
              Image Encoded
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>1. Foreground Spatial Focus:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">2. Motion Vector & Dynamic: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
