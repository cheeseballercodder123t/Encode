'use client';

import React, { useState } from 'react';
import { Activity, TaxonomicChunkingVisualData } from '@/lib/types';

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
    <div className=" border border-amber/30 via-[#0E111C]  p-4   transition-none-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-amber/20 pb-2.5 mb-3.5 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-amber/20 text-amber">
            <span className="text-amber font-bold font-mono">[ BOXES ]</span>
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-amber">
            Miller&apos;s 7±2 Law &amp; Taxonomic Cluster Buckets
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-amber bg-amber/40 border border-amber/30 px-2 py-0.5 flex items-center gap-1">
          <span className="text-amber font-bold font-mono">[ TAG ]</span> Interactive Chunking
        </span>
      </div>

      {/* Generation Effect: Chunking Challenge Card */}
      <div className="mb-3.5 p-3 bg-amber/30 border border-amber/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className="text-amber font-bold font-mono">[ ? ]</span>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-amber block">
                Working Memory Compression Challenge
              </span>
              <p className="text-xs text-amber font-medium mt-0.5">
                {challenge.premisePrompt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowClue(!showClue)}
            className="text-[10px] font-mono font-semibold text-amber hover:text-amber bg-amber/30 px-2 py-1 border border-amber/20 shrink-0 transition-none-colors"
          >
            {showClue ? 'Hide Hint' : 'Get Chunking Rule'}
          </button>
        </div>

        {showClue && challenge.clue && (
          <div className="mt-2.5 pt-2 border-t border-amber/20 text-[11px] text-amber/90 italic font-mono">
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
              className={`p-3.5  border transition-none-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'border-amber/80 bg-amber/40 ring-1 ring-teal-400/50 '
                  : 'border-steel/60 bg-deck/60 hover:border-amber/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono font-bold uppercase text-amber bg-amber/60 border border-amber/30 px-1.5 py-0.5 ">
                    Bucket 0{bIdx + 1}
                  </span>
                  <span className="text-[9px] font-mono text-solder">
                    {bucket.items.length} Items ({bucket.items.length <= 4 ? 'Optimal Chunk' : 'Split Recommended'})
                  </span>
                </div>

                <h4 className="text-xs font-bold text-bone mb-2">
                  {bucket.bucketName}
                </h4>

                {/* Clustered Item Tags */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {bucket.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="text-[10px] font-mono px-2 py-0.5 bg-chassis/80 border border-steel text-bone"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {bucket.categoryRule && (
                <div className="mt-2 pt-1.5 border-t border-amber/20 text-[10px] text-amber/80 italic">
                  Rule: {bucket.categoryRule}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Generated Chunking Synthesis */}
      {hasUserGenerated && (
        <div className="mt-3 p-3 border border-amber/40 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber flex items-center gap-1.5">
              <span className="text-amber font-bold font-mono">[ * ]</span>
              Your Semantic Chunking Classification
            </span>
            <span className="text-[9px] font-mono text-amber bg-amber/60 border border-amber/30 px-1.5 py-0.5 ">
              Chunk Model
            </span>
          </div>
          {field1 && (
            <p className="text-bone font-mono italic text-xs">
              <strong>Category Name:</strong> &ldquo;{field1}&rdquo;
            </p>
          )}
          {field2 && (
            <p className="text-solder text-[11px] mt-1">
              <strong className="text-amber">Classified Items: </strong>
              {field2}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
