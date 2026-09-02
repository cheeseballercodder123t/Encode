'use client';

import React, { useState } from 'react';
import { Activity, ConceptHierarchyVisualData } from '@/lib/types';
import { GitFork, ChevronDown, ChevronRight, Sparkles, HelpCircle, FolderTree, Check } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function ConceptHierarchyVisual({ activity, field1, field2, field3 }: Props) {
  const visualData = activity.visualData || {};

  const [expandedBranches, setExpandedBranches] = useState<Record<number, boolean>>({ 0: true, 1: true, 2: true });
  const [showClue, setShowClue] = useState(false);

  const defaultTree = {
    rootNode: activity.title || 'Overarching Concept Theory',
    branches: [
      { branchName: 'Branch A: Primary Mechanism', subItems: ['Sub-process 1', 'Sub-process 2'] },
      { branchName: 'Branch B: Boundary Conditions', subItems: ['Condition alpha', 'Condition beta'] }
    ]
  };

  const tree = visualData.hierarchyTree && visualData.hierarchyTree.branches?.length > 0
    ? visualData.hierarchyTree
    : defaultTree;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "Under what superordinate category does this mechanism nest, and what are its direct sub-components?",
    clue: "Identify the parent category first, then divide into mutually exclusive sub-mechanisms.",
    missingRoleOrTarget: "Taxonomic Hierarchy Sub-branch",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const toggleBranch = (idx: number) => {
    setExpandedBranches(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-purple-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-purple-500/20 text-purple-400">
            <GitFork className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-purple-300">
            Ausubel Meaningful Subsumption & Mind-Tree DAG
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <FolderTree className="w-2.5 h-2.5" /> Interactive Tree
        </span>
      </div>

      {/* Generation Effect: Hierarchy Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-purple-300 block">
                Subsumption Hierarchy Challenge
              </span>
              <p className="text-xs text-purple-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-purple-400 hover:text-purple-300 bg-purple-900/30 px-2 py-1 rounded border border-purple-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Subsumption Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-purple-500/20 text-[11px] text-purple-200/90 italic font-serif">
            💡 <strong>Category Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Tree Root & Branches */}
      <div className="p-3 rounded-xl bg-slate-900/70 border border-purple-500/20">
        {/* Superordinate Root Node */}
        <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/40 text-center mb-3">
          <span className="text-[9px] font-mono uppercase text-purple-400 block font-bold">
            Superordinate Root Theory
          </span>
          <div className="text-sm font-bold text-white mt-0.5">
            {tree.rootNode}
          </div>
        </div>

        {/* Child Subsumption Branches */}
        <div className="space-y-2 pl-2 sm:pl-4 border-l-2 border-purple-500/30">
          {tree.branches.map((branch, bIdx) => {
            const isExpanded = expandedBranches[bIdx] ?? true;

            return (
              <div key={bIdx} className="rounded-lg bg-slate-950/60 border border-slate-800 p-2.5">
                <div
                  onClick={() => toggleBranch(bIdx)}
                  className="flex items-center justify-between cursor-pointer text-xs font-bold text-purple-200 hover:text-purple-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-purple-400" /> : <ChevronRight className="w-3.5 h-3.5 text-purple-400" />}
                    <span>{branch.branchName}</span>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">
                    {branch.subItems.length} Sub-elements
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-2 pl-5 space-y-1.5 border-l border-purple-500/20">
                    {branch.subItems.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        className="text-[11px] text-slate-300 flex items-center gap-1.5 py-0.5"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* User Live Tree Deduction */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900/50 border border-purple-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-purple-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Your Subsumption Integration
            </span>
            <span className="text-[9px] font-mono text-purple-400 bg-purple-950/60 border border-purple-500/30 px-1.5 py-0.5 rounded">
              Tree Node Added
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>Category:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-purple-300">Sub-mechanism: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
