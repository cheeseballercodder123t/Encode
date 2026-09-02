'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Layers, Hash, Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function TaxonomicChunkingVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultBuckets = [
    { bucketName: 'Cluster 1: Strong / Reactive', items: ['Item A', 'Item B', 'Item C'], colorHint: 'border-rose-500/40 bg-rose-950/30 text-rose-200' },
    { bucketName: 'Cluster 2: Weak / Stable', items: ['Item D', 'Item E', 'Item F'], colorHint: 'border-blue-500/40 bg-blue-950/30 text-blue-200' },
    { bucketName: 'Cluster 3: Borderline / Amphoteric', items: ['Item G', 'Item H'], colorHint: 'border-amber-500/40 bg-amber-950/30 text-amber-200' }
  ];

  const buckets = visualData.chunkBuckets && visualData.chunkBuckets.length > 0
    ? visualData.chunkBuckets
    : defaultBuckets;

  const totalItems = buckets.reduce((acc, b) => acc + (b.items?.length || 0), 0);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/20 text-amber-400">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
            Miller&apos;s 7±2 Law & Semantic Cluster Buckets
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
            {buckets.length} Sub-Buckets ({totalItems} Items)
          </span>
        </div>
      </div>

      {/* Visual Buckets Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {buckets.map((bucket, idx) => {
          const count = bucket.items?.length || 0;
          return (
            <div
              key={idx}
              className="p-3 rounded-xl bg-slate-900/70 border border-amber-500/30 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {bucket.bucketName}
                  </span>
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                    {count} items
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  {bucket.items.map((item, iIdx) => (
                    <span
                      key={iIdx}
                      className="px-2 py-0.5 rounded-md bg-[#161926] border border-slate-700 text-[10px] font-mono font-medium text-slate-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* Working memory safety meter */}
              <div className="mt-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-[8px] font-mono text-slate-400 mb-1">
                  <span>Working Memory Load</span>
                  <span>{count}/7 items</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${Math.min(100, (count / 7) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User Chunking Live Reflection */}
      {field1 && (
        <div className="mt-3 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-amber-300 block">
              Your Active Semantic Clusters:
            </span>
            <p className="text-slate-200 font-serif italic mt-0.5">
              &ldquo;{field1}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
