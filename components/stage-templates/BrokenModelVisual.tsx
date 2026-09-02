'use client';

import React, { useState } from 'react';
import { Activity } from '@/lib/types';
import { 
  Bug, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  HelpCircle, 
  ArrowRight, 
  ShieldAlert, 
  XCircle, 
  Check, 
  Eye
} from 'lucide-react';
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
    <div className="rounded-xl border border-rose-500/40 bg-gradient-to-br from-rose-950/25 via-[#0E111C] to-slate-900/70 p-4 shadow-xl backdrop-blur-md transition-all space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-rose-500/20 pb-3 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-300">
                Socratic Sabotage: Causal Bug Hunt
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-900/60 text-rose-200 border border-rose-500/30">
                {brokenData.flawCount} Planted Bugs
              </span>
            </div>
            <h4 className="text-xs font-bold text-white mt-0.5">
              {brokenData.scenarioTitle}
            </h4>
          </div>
        </div>

        {/* Bug Score Counter */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400">Bugs Spotted: </span>
            <span className="font-bold text-emerald-400">{bugsFoundCount}</span>
            <span className="text-slate-500">/{brokenData.flawCount}</span>
          </div>
        </div>
      </div>

      {/* Sabotage Premise Card */}
      <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-200 space-y-1">
        <div className="flex items-center gap-1.5 text-rose-300 font-bold text-[11px]">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>The Planted Exam Misconception:</span>
        </div>
        <p className="font-serif italic leading-relaxed text-slate-200">
          &ldquo;{brokenData.studentMisconceptionPremise}&rdquo;
        </p>
      </div>

      {/* Interactive Causal Pipeline Nodes */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
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
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative flex flex-col justify-between min-h-[105px] ${
                  isSelected
                    ? 'border-rose-400 bg-rose-950/40 ring-2 ring-rose-500/30 shadow-lg'
                    : isFlagged
                    ? 'border-amber-500/60 bg-amber-950/20'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase text-slate-400">
                      Step 0{idx + 1}
                    </span>
                    {isFlagged && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold flex items-center gap-0.5 ${
                        node.isFlawed 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' 
                          : 'bg-red-950 text-red-300 border border-red-500/40'
                      }`}>
                        {node.isFlawed ? '✓ Real Bug' : '✗ False Alarm'}
                      </span>
                    )}
                  </div>

                  <h5 className="text-xs font-bold text-white leading-snug line-clamp-2">
                    {node.label}
                  </h5>

                  {node.subtext && (
                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                      {node.subtext}
                    </p>
                  )}
                </div>

                <div className="pt-2 text-[9px] font-mono text-rose-300/80">
                  {isSelected ? '▶ Inspecting' : 'Tap to inspect'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Node Inspection & Correction Workbench */}
      {selectedNode && (
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase block">
                Inspecting Step 0{selectedNodeIndex + 1}
              </span>
              <h5 className="text-sm font-bold text-white">
                {selectedNode.label}
              </h5>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleFlagBug(selectedNode.id, selectedNode.isFlawed)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  flaggedBugs[selectedNode.id]
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Bug className="w-3.5 h-3.5" />
                <span>{flaggedBugs[selectedNode.id] ? 'Flagged as Bug' : 'Flag This Step as Broken'}</span>
              </button>

              {selectedNode.isFlawed && (
                <button
                  type="button"
                  onClick={() => handleRevealFlaw(selectedNode.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg hover:bg-indigo-900/60 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  <span>Reveal Flaw</span>
                </button>
              )}
            </div>
          </div>

          {/* Socratic Hint */}
          {selectedNode.studentCorrectionHint && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg flex items-start gap-2">
              <HelpCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong>Socratic Diagnostic Clue: </strong>
                <span>{selectedNode.studentCorrectionHint}</span>
              </div>
            </div>
          )}

          {/* Secret Flaw Explanation (Revealed when clicked or correctly flagged) */}
          {revealedExplanations[selectedNode.id] && selectedNode.flawExplanation && (
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 space-y-1">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Underlying Mechanical Reality:</span>
              </div>
              <p className="leading-relaxed">{selectedNode.flawExplanation}</p>
            </div>
          )}
        </div>
      )}

      {/* User Scaffold Output */}
      {(field1 || field2) && (
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
          <span className="text-[10px] font-mono font-bold text-rose-400 uppercase block">
            Your Causal Debug Deduction
          </span>
          {field1 && <p className="text-slate-200"><strong>Flaw Identified:</strong> {field1}</p>}
          {field2 && <p className="text-slate-300 text-[11px]"><strong>Correct First Principle:</strong> {field2}</p>}
        </div>
      )}
    </div>
  );
}