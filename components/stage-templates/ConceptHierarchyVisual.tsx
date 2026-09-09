'use client';

import React, { useState } from 'react';
import { Activity, ConceptHierarchyVisualData } from '@/lib/types';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function ConceptHierarchyVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
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
    <div className=" border border-steel/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-steel/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-steel/20 text-bone">
            <span className="text-amber font-bold font-mono">[ FORK ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-bone">
            Ausubel Meaningful Subsumption & Mind-Tree DAG
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-bone bg-steel/40 border border-steel/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ TREE ]</span> Interactive Tree
        </span>
      </div>

      {/* Generation Effect: Hierarchy Challenge Card */}
      <div className="mb-3.5 p-3 bg-steel/30 border border-steel/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-bone block">
                Subsumption Hierarchy Challenge
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
            {showClue ? 'Hide Hint' : 'Get Subsumption Hint'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-steel/20 text-[11px] text-bone/90 italic font-mono">
            💡 <strong>Category Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Tree Root & Branches */}
      <div className="p-3 bg-deck/70 border border-steel/20">
        {/* Superordinate Root Node */}
        <div className="p-2.5 bg-steel/40 border border-steel/40 text-center mb-3">
          <span className="text-[9px] font-mono uppercase text-bone block font-bold">
            Superordinate Root Theory
          </span>
          <div className="text-sm font-bold text-bone mt-0.5">
            {tree.rootNode}
          </div>
        </div>

        {/* Child Subsumption Branches */}
        <div className="space-y-2 pl-2 sm:pl-4 border-l-2 border-steel/30">
          {tree.branches.map((branch, bIdx) => {
            const isExpanded = expandedBranches[bIdx] ?? true;

            return (
              <div key={bIdx} className=" bg-chassis/60 border border-steel p-2.5">
                <div
                  onClick={() => toggleBranch(bIdx)}
                  className="flex items-center justify-between cursor-pointer text-xs font-bold text-bone hover:text-bone transition-none-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? <span className="text-amber font-bold font-mono">[ v ]</span> : <span className="text-amber font-bold font-mono">[ NEXT ]</span>}
                    <span>{branch.branchName}</span>
                  </div>
                  <span className="text-[9px] font-mono text-solder">
                    {branch.subItems.length} Sub-elements
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-2 pl-5 space-y-1.5 border-l border-steel/20">
                    {branch.subItems.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        className="text-[11px] text-solder flex items-center gap-1.5 py-0.5"
                      >
                        <div className="w-1.5 h-1.5 bg-steel shrink-0" />
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
        <div className="mt-3 p-3 border border-steel/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-bone flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Subsumption Integration
            </span>
            <span className="text-[9px] font-mono text-bone bg-steel/60 border border-steel/30 px-1.5 py-0.5 ">
              Tree Node Added
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>Category:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-bone">Sub-mechanism: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
