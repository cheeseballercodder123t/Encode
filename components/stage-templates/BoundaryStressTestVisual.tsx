'use client';

import React from 'react';
import { Activity, ActivityVisualData } from '@/lib/types';
import { Gauge, AlertOctagon, CheckCircle, Sparkles } from 'lucide-react';

interface Props {
  activity: Activity;
  field1: string;
  field2: string;
  field3?: string;
}

export function BoundaryStressTestVisual({ activity, field1, field2, field3 }: Props) {
  const visualData: ActivityVisualData = activity.visualData || {};

  const defaultGauges = [
    {
      variable: 'Operating Parameter (e.g. Temperature / Voltage / Load)',
      normalRange: 'Normal Stable Zone (Homeostasis)',
      extremeCase: 'Asymptotic Extreme (T → ∞ or P → 0)',
      breakdownResult: 'System transitions into runaway or collapse regime'
    }
  ];

  const gauges = visualData.boundaryGauges && visualData.boundaryGauges.length > 0
    ? visualData.boundaryGauges
    : defaultGauges;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#0E111C] to-slate-900/60 p-4 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 mb-3.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-amber-500/20 text-amber-400">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
            Boundary Condition & Extreme Limit Stress-Test
          </span>
        </div>
        <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded">
          Limiting Behavior & Edge Cases
        </span>
      </div>

      {/* Stress Test Gauge Cards */}
      <div className="space-y-3">
        {gauges.map((g, idx) => (
          <div key={idx} className="p-3.5 rounded-xl bg-slate-900/60 border border-amber-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {g.variable}
              </span>
              <span className="text-[9px] font-mono font-bold uppercase text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-500/30">
                Stress Test #{idx + 1}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Normal Zone */}
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-emerald-400 uppercase mb-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>Normal Operating Zone</span>
                </div>
                <p className="text-[11px] text-emerald-200">
                  {g.normalRange}
                </p>
              </div>

              {/* Breakdown Extreme */}
              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30">
                <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-rose-400 uppercase mb-1">
                  <AlertOctagon className="w-3 h-3" />
                  <span>Extreme Limit Condition</span>
                </div>
                <p className="text-[11px] text-rose-200">
                  {g.extremeCase} → <strong className="text-rose-300">{g.breakdownResult}</strong>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Boundary Analysis Live Display */}
      {field1 && (
        <div className="mt-3 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-300 uppercase block">
              Your Stress-Tested Boundary Analysis:
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
