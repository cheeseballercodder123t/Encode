'use client';

import React, { useState } from 'react';
import { Activity, TaxonomicChunkingVisualData } from '@/lib/types';
import { Boxes, Sparkles, HelpCircle, CheckCircle2, Tag } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
  selectedPreset?: string;
}

export function TaxonomicChunkingVisual({ activity, field1, field2, field3, selectedPreset }: Props) {
  const visualData = activity.visualData || {};
  const [selectedBucket, setSelectedBucket] = useState<number | null>(0);
  const [showClue, setShowClue] = useState(false);

  const defaultBuckets = [
    {
      bucketName: 'Bucket Alpha (Polar / Strong / Type 1)',
      items: ['Item 1', 'Item 2', 'Item 3'],
      colorHint: 'emerald',
      categoryRule: 'Shared physical or mechanistic property'
    },
    {
      bucketName: 'Bucket Beta (Non-polar / Weak / Type 2)',
      items: ['Item A', 'Item B', 'Item C'],
      colorHint: 'cyan',
      categoryRule: 'Contrasting functional property'
    }
  ];

  const buckets = visualData.chunkBuckets && visualData.chunkBuckets.length > 0
    ? visualData.chunkBuckets
    : defaultBuckets;

  const challenge = visualData.generationChallenge || {
    premisePrompt: "How can we compress these 10+ disparate terms into 3-4 mutually exclusive semantic buckets?",
    clue: "Look for a binary trait: charge, polarity, location, or mechanism.",
    missingRoleOrTarget: "Taxonomic Chunking Rule",
    expertCompletion: activity.scaffold.exampleAnswer
  };

  const hasUserGenerated = Boolean(field1.trim() || field2.trim());

  return (
    <div className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-teal-500/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-teal-500/20 text-teal-400">
            <Boxes className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-teal-300">
            Miller's 7±2 Law & Taxonomic Cluster Buckets
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-teal-300 bg-teal-950/40 border border-teal-500/30 px-2 py-0.5 rounded flex items-center gap-1">
          <Tag className="w-2.5 h-2.5" /> Interactive Chunking
        </span>
      </div>

      {/* Generation Effect: Chunking Challenge Card */}
      <div className="mb-3.5 p-3 rounded-xl bg-teal-950/30 border border-teal-500/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-teal-300 block">
                Working Memory Compression Challenge
              </span>
              <p className="text-xs text-teal-100 font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-teal-400 hover:text-teal-300 bg-teal-900/30 px-2 py-1 rounded border border-teal-500/20 shrink-0 transition-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Chunking Rule'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-teal-500/20 text-[11px] text-teal-200/90 italic font-serif">
            💡 <strong>Chunking Clue:</strong> {challenge.clue}
          </div>
        )}
      </div>

      {/* Interactive Cluster Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {buckets.map((bucket, bIdx) => {
          const isSelected = selectedBucket === bIdx;

          return (
            <div
              key={bIdx}
              onClick={() => setSelectedBucket(isSelected ? null : bIdx)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-teal-400/80 bg-teal-950/40 ring-1 ring-teal-400/50 shadow-md'
                  : 'border-slate-700/60 bg-slate-900/60 hover:border-teal-500/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono font-bold uppercase text-teal-300 bg-teal-950/60 border border-teal-500/30 px-1.5 py-0.5 rounded">
                    Bucket 0{bIdx + 1}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">
                    {bucket.items.length} Items ({bucket.items.length <= 4 ? 'Optimal Chunk' : 'Split Recommended'})
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white mb-2">
                  {bucket.bucketName}
                </h4>

                {/* Clustered Item Tags */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {bucket.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {bucket.categoryRule && (
                <div className="mt-2 pt-1.5 border-t border-teal-500/20 text-[10px] text-teal-200/80 italic">
                  Rule: {bucket.categoryRule}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Chunking Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-teal-950/40 via-cyan-950/30 to-slate-900/50 border border-teal-500/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-teal-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              Your Semantic Chunking Classification
            </span>
            <span className="text-[9px] font-mono text-teal-400 bg-teal-950/60 border border-teal-500/30 px-1.5 py-0.5 rounded">
              Chunk Model
            </span>
          </div>
          {field1 && (
            <p className="text-slate-200 font-serif italic text-xs">
              <strong>Category Name:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-slate-300 text-[11px] mt-1">
              <strong className="text-teal-300">Classified Items: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
