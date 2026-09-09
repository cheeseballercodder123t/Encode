'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { playSound } from '@/lib/audio';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

const DEFAULT_SABOTAGED_NODES = [
  {
    id: 'node-1',
    label: '1. Threshold Voltage (-55mV)',
    subtext: 'Membrane depolarizes to threshold trigger.',
    isFlawed: false
  },
  {
    id: 'node-2',
    label: '2. Voltage-Gated K+ Channels Open Rapidly',
    subtext: 'K+ rushes into the cell, creating positive surge to +30mV.',
    isFlawed: true,
    flawExplanation: 'FATAL BUG: Na+ channels open rapidly during depolarization, NOT K+ channels! Potassium (K+) has a higher concentration inside, so opening K+ channels would cause K+ efflux, hyperpolarizing the cell rather than depolarizing it.',
    studentCorrectionHint: 'Which ion is concentrated on the outside and has a positive equilibrium potential (+60mV)?'
  },
  {
    id: 'node-3',
    label: '3. Na+/K+ Pump Fires Immediately to Repolarize',
    subtext: 'The active ATP pump repolarizes the membrane in milliseconds.',
    isFlawed: true,
    flawExplanation: 'FATAL BUG: Repolarization is driven by voltage-gated K+ channels opening and Na+ channel inactivation gates closing, NOT the Na+/K+ ATPase pump. The pump is too slow (electrogenic) and only restores baseline ion gradients over minutes/hours.',
    studentCorrectionHint: 'Is rapid millisecond repolarization driven by passive ion channels or active ATP pumps?'
  },
  {
    id: 'node-4',
    label: '4. Hyperpolarization & Reset',
    subtext: 'Membrane briefly drops below -70mV due to delayed K+ channel closing.',
    isFlawed: false
  }
];

export function BrokenModelVisual({ activity, field1, field2 }: Props) {
  const brokenData = activity.visualData?.brokenModel || {
    scenarioTitle: 'Sabotaged Model: Neurobiology Action Potential',
    flawCount: 2,
    studentMisconceptionPremise: 'A student claims that K+ rushes in to depolarize the neuron, and the Na+/K+ pump immediately repolarizes the cell.',
    expertCorrection: 'Depolarization requires rapid Na+ influx. Repolarization requires voltage-gated K+ efflux, not the active Na+/K+ pump.',
    sabotagedNodes: DEFAULT_SABOTAGED_NODES
  };

  const nodes = brokenData.sabotagedNodes?.length > 0 ? brokenData.sabotagedNodes : DEFAULT_SABOTAGED_NODES;

  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(1);
  const [flaggedBugs, setFlaggedBugs] = useState<Record<string, boolean>>({});
  const [revealedExplanations, setRevealedExplanations] = useState<Record<string, boolean>>({});
  const [showHint, setShowHint] = useState<Record<string, boolean>>({});

  const selectedNode = nodes[selectedNodeIndex];

  const handleSelectNode = (idx: number) => {
    setSelectedNodeIndex(idx);
    playSound('pop');
  };

  const handleToggleFlagBug = (nodeId: string, isActualBug: boolean) => {
    const isNowFlagged = !flaggedBugs[nodeId];
    setFlaggedBugs(prev => ({ ...prev, [nodeId]: isNowFlagged }));

    if (isNowFlagged) {
      if (isActualBug) {
        playSound('success');
      } else {
        playSound('wrong');
      }
    } else {
      playSound('click');
    }
  };

  const handleRevealFlaw = (nodeId: string) => {
    setRevealedExplanations(prev => ({ ...prev, [nodeId]: true }));
    playSound('correct');
  };

  const bugsFoundCount = nodes.filter(n => n.isFlawed && flaggedBugs[n.id]).length;
  const falseAlarmsCount = nodes.filter(n => !n.isFlawed && flaggedBugs[n.id]).length;

  return (
    <div className=" border border-hazard500/40 via-[#0E111C]  p-4   transition-none-all space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-hazard500/20 pb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-hazard500/20 text-hazard400 border border-hazard500/30 ">
            <span className="text-amber font-bold font-mono">[ BUG ]</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-hazard300">
                Socratic Sabotage: Causal Bug Hunt
              </span>
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-hazard900/60 text-hazard200 border border-hazard500/30">
                {brokenData.flawCount} Planted Bugs
              </span>
            </div>
            <h4 className="text-xs font-bold text-bone mt-0.5">
              {brokenData.scenarioTitle}
            </h4>
          </div>
        </div>

        {/* Bug Score Counter */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 bg-chassis border border-steel text-[11px] font-mono">
            <span className="text-solder">Bugs Spotted: </span>
            <span className="font-bold text-amber">{bugsFoundCount}</span>
            <span className="text-solder">/{brokenData.flawCount}</span>
          </div>
        </div>
      </div>

      {/* Sabotage Premise Card */}
      <div className="p-3 bg-hazard950/30 border border-hazard500/30 text-xs text-hazard200 space-y-1">
        <div className="flex items-center gap-1.5 text-hazard300 font-bold text-[11px]">
          <span className="text-amber font-bold font-mono">[ ! ]</span>
          <span>The Planted Exam Misconception:</span>
        </div>
        <p className="font-mono italic leading-relaxed text-bone">
          &ldquo;{brokenData.studentMisconceptionPremise}&rdquo;
        </p>
      </div>

      {/* Interactive Causal Pipeline Nodes */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-solder uppercase tracking-wider block">
          Inspect the steps below. Click to identify which ones contain fatal misconceptions:
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {nodes.map((node, idx) => {
            const isSelected = selectedNodeIndex === idx;
            const isFlagged = flaggedBugs[node.id];
            const isRevealed = revealedExplanations[node.id];

            return (
              <button
                key={node.id || idx}
                type="button"
                onClick={() => handleSelectNode(idx)}
                className={`p-3  border text-left transition-none-all cursor-pointer relative flex flex-col justify-between min-h-[105px] ${
                  isSelected
                    ? 'border-hazard400 bg-hazard950/40 ring-2 ring-rose-500/30 '
                    : isFlagged
                    ? 'border-amber/60 bg-amber/20'
                    : 'border-steel bg-deck/70 hover:border-steel'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase text-solder">
                      Step 0{idx + 1}
                    </span>
                    {isFlagged && (
                      <span className={`px-1.5 py-0.5  text-[9px] font-mono font-bold flex items-center gap-0.5 ${
                        node.isFlawed 
                          ? 'bg-amber950 text-amber300 border border-amber/40' 
                          : 'bg-hazard950 text-hazard300 border border-hazard500/40'
                      }`}>
                        {node.isFlawed ? '[ OK ] Real Bug' : '[ X ] False Alarm'}
                      </span>
                    )}
                  </div>

                  <h5 className="text-xs font-bold text-bone leading-snug line-clamp-2">
                    {node.label}
                  </h5>

                  {node.subtext && (
                    <p className="text-[10px] text-solder mt-1 line-clamp-2">
                      {node.subtext}
                    </p>
                  )}
                </div>

                <div className="pt-2 text-[9px] font-mono text-hazard300/80">
                  {isSelected ? '▶ Inspecting' : 'Tap to inspect'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Node Inspection & Correction Workbench */}
      {selectedNode && (
        <div className="p-4 bg-chassis/90 border border-steel space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-steel/80 pb-2.5">
            <div>
              <span className="text-[10px] font-mono text-solder uppercase block">
                Inspecting Step 0{selectedNodeIndex + 1}
              </span>
              <h5 className="text-sm font-bold text-bone">
                {selectedNode.label}
              </h5>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleFlagBug(selectedNode.id, selectedNode.isFlawed)}
                className={`flex items-center gap-1.5 px-3 py-1.5  text-xs font-bold transition-none-all cursor-pointer ${
                  flaggedBugs[selectedNode.id]
                    ? 'bg-hazard600 text-bone '
                    : 'bg-deck border border-steel text-solder hover:text-bone'
                }`}
              >
                <span className="text-amber font-bold font-mono">[ BUG ]</span>
                <span>{flaggedBugs[selectedNode.id] ? 'Flagged as Bug' : 'Flag This Step as Broken'}</span>
              </button>

              {selectedNode.isFlawed && (
                <button
                  type="button"
                  onClick={() => handleRevealFlaw(selectedNode.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-steel/60 border border-steel/30 text-bone text-xs font-bold hover:bg-steel/60 transition-none-colors"
                >
                  <span className="text-amber font-bold font-mono">[ EYE ]</span>
                  <span>Reveal Flaw</span>
                </button>
              )}
            </div>
          </div>

          {/* Socratic Hint */}
          {selectedNode.studentCorrectionHint && (
            <div className="text-xs text-amber bg-amber/10 border border-amber/20 p-2.5 flex items-start gap-2">
              <span className="text-amber font-bold font-mono">[ ? ]</span>
              <div>
                <strong>Socratic Diagnostic Clue: </strong>
                <span>{selectedNode.studentCorrectionHint}</span>
              </div>
            </div>
          )}

          {/* Secret Flaw Explanation (Revealed when clicked or correctly flagged) */}
          {revealedExplanations[selectedNode.id] && selectedNode.flawExplanation && (
            <div className="p-3 bg-amber950/30 border border-amber/40 text-xs text-amber200 space-y-1">
              <div className="font-bold text-amber flex items-center gap-1.5">
                <span className="text-amber font-bold font-mono">[ OK ]</span>
                <span>Underlying Mechanical Reality:</span>
              </div>
              <p className="leading-relaxed">{selectedNode.flawExplanation}</p>
            </div>
          )}
        </div>
      )}

      {/* User Scaffold Output */}
      {(field1 || field2) && (
        <div className="p-3 bg-chassis border border-steel text-xs space-y-1">
          <span className="text-[10px] font-mono font-bold text-hazard400 uppercase block">
            Your Causal Debug Deduction
          </span>
          {field1 && <p className="text-bone"><strong>Flaw Identified:</strong> {field1}</p>}
          {field2 && <p className="text-solder text-[11px]"><strong>Correct First Principle:</strong> {field2}</p>}
        </div>
      )}
    </div>
  );
}