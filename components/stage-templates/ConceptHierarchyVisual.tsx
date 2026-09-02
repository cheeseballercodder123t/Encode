'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { GitFork, ChevronRight, Sparkles, FolderTree } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function ConceptHierarchyVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultTree = {
    rootNode: activity.title || 'Core Superordinate Concept',
    branches: [
      { branchName: 'Sub-Mechanism 1: Input & Trigger', subItems: ['Resting potential (-70mV)', 'Stimulus threshold (-55mV)'] },
      { branchName: 'Sub-Mechanism 2: Channel Dynamics', subItems: ['Voltage-gated Na+ influx', 'K+ channel repolarization'] },
      { branchName: 'Boundary Conditions & Limits', subItems: ['Refractory period', 'Saltatory conduction velocity'] }
    ]
  };

  const tree = visualData.hierarchyTree && visualData.hierarchyTree.branches?.length > 0
    ? visualData.hierarchyTree
    : defaultTree;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-emerald-500/20 text-emerald-400">
            <FolderTree className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
            Concept Mind Tree & Taxonomic Hierarchy
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
          Hierarchical Schema (Ausubel 1968)
        </span>
      </div>

      {/* Root Node Banner */}
      <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-center mb-3">
        <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest block">
          Superordinate Root Principle
        </span>
        <h4 className="text-xs font-bold text-white mt-0.5">
          {tree.rootNode}
        </h4>
      </div>

      {/* Branching Sub-Mechanisms */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {tree.branches.map((branch, bIdx) => (
          <div
            key={bIdx}
            className="p-3 rounded-xl bg-slate-900/60 border border-emerald-500/20 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-300 mb-1.5">
                <GitFork className="w-3 h-3 text-emerald-400" />
                <span>{branch.branchName}</span>
              </div>
              <ul className="space-y-1">
                {branch.subItems.map((item, iIdx) => (
                  <li key={iIdx} className="flex items-center gap-1.5 text-[10px] text-slate-300 font-sans">
                    <ChevronRight className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {/* User Live Node Anchor */}
      {field1 && (
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="text-[11px] text-slate-200">
            <strong className="text-emerald-300 font-mono text-[9px] uppercase block">Integrated Leaf Concept:</strong>
            &ldquo;{field1}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}
