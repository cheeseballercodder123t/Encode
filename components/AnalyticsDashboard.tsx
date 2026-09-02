'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, BarChart2, Download, Cpu, Calendar, TrendingUp,
  Brain, Star, Award, RefreshCcw, ChevronDown, ChevronUp
} from 'lucide-react';

interface UsageStats {
  date: string;
  callsByModel: Record<string, number>;
  weeklyCallsByModel: Record<string, number>;
}

interface SessionStats {
  totalStages: number;
  answeredStages: number;
  avgConfidence: number;
  avgCheckCount: number;
  successRate: number;
  reflectionsWritten: number;
  templateBreakdown: Record<string, number>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  savedSchemas: import('@/lib/types').SavedSchema[];
}

function loadUsageStats(): UsageStats {
  if (typeof window === 'undefined') return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} };
  try {
    const raw = localStorage.getItem('deepencode_usage_stats_v1');
    if (!raw) return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} };
    const parsed = JSON.parse(raw);
    if (parsed.date !== new Date().toDateString()) {
      return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: parsed.weeklyCallsByModel || {} };
    }
    return parsed;
  } catch { return { date: new Date().toDateString(), callsByModel: {}, weeklyCallsByModel: {} }; }
}

function computeAllStats(schemas: import('@/lib/types').SavedSchema[]): SessionStats {
  let totalStages = 0, answeredStages = 0, confTotal = 0, confCount = 0;
  let checkTotal = 0, checkCount = 0, successes = 0, scored = 0, reflections = 0;
  const templateBreakdown: Record<string, number> = {};

  for (const s of schemas) {
    for (const act of s.activities || []) {
      totalStages++;
      templateBreakdown[act.templateType] = (templateBreakdown[act.templateType] || 0) + 1;
      const r = s.userResponses?.[act.id];
      if (!r) continue;
      if (r.field1?.trim()) answeredStages++;
      if (r.confidenceScore != null) { confTotal += r.confidenceScore; confCount++; }
      if (r.checkCount) { checkTotal += r.checkCount; checkCount++; }
      if (r.feynmanReview) {
        scored++;
        if (r.feynmanReview.grade === 'mastered' || r.feynmanReview.grade === 'good') successes++;
      }
      if (r.reflection?.trim()) reflections++;
    }
  }

  return {
    totalStages, answeredStages,
    avgConfidence: confCount ? Math.round(confTotal / confCount) : 0,
    avgCheckCount: checkCount ? Math.round((checkTotal / checkCount) * 10) / 10 : 0,
    successRate: scored ? Math.round((successes / scored) * 100) : 0,
    reflectionsWritten: reflections,
    templateBreakdown,
  };
}

export function AnalyticsDashboard({ isOpen, onClose, savedSchemas }: Props) {
  const [usage, setUsage] = useState<UsageStats>({ date: '', callsByModel: {}, weeklyCallsByModel: {} });
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (isOpen) setUsage(loadUsageStats());
  }, [isOpen]);

  if (!isOpen) return null;

  const stats = computeAllStats(savedSchemas);
  const totalSessions = savedSchemas.length;
  const totalCalls = Object.values(usage.callsByModel).reduce((a, b) => a + b, 0);
  const weeklyTotal = Object.values(usage.weeklyCallsByModel).reduce((a, b) => a + b, 0);

  const handleExportCSV = () => {
    const rows: string[] = ['session_id,timestamp,topic,mode,stage,template,confidence,check_count,grade,score,reflection'];
    for (const s of savedSchemas) {
      for (const act of s.activities || []) {
        const r = s.userResponses?.[act.id];
        if (!r) continue;
        rows.push([
          s.id, s.timestamp,
          `"${(s.topicSummary || '').replace(/"/g, '""')}"`,
          s.mode, act.stageNumber, act.templateType,
          r.confidenceScore ?? '',
          r.checkCount ?? 0,
          r.feynmanReview?.grade ?? '',
          r.feynmanReview?.score ?? '',
          `"${(r.reflection || '').replace(/"/g, '""')}"`,
        ].join(','));
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `encode-sessions-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = savedSchemas.map(s => ({
      id: s.id, timestamp: s.timestamp, topic: s.topicSummary, mode: s.mode, xpEarned: s.xpEarned,
      stages: (s.activities || []).map(act => ({
        stage: act.stageNumber, title: act.title, template: act.templateType,
        response: s.userResponses?.[act.id] || null,
      })),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `encode-sessions-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#07080D] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-500/10 border border-violet-500/30 rounded-xl">
              <BarChart2 className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Analytics Dashboard</h1>
              <p className="text-xs text-slate-400">Metacognitive insights · All data is stored locally</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors border border-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Session Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Sessions', value: totalSessions, icon: Brain, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
            { label: 'Success Rate', value: `${stats.successRate}%`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Avg Confidence', value: stats.avgConfidence ? `${stats.avgConfidence}/100` : '—', icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Reflections', value: stats.reflectionsWritten, icon: Award, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`border rounded-2xl p-4 ${bg}`}>
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Success Rate Bar */}
        {stats.successRate > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">Overall Success Rate</p>
            <div className="w-full bg-slate-700/50 rounded-full h-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.successRate}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className={`h-3 rounded-full ${stats.successRate >= 80 ? 'bg-emerald-500' : stats.successRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              />
            </div>
            <p className="text-right text-xs text-slate-400 mt-1">{stats.successRate}%</p>
          </div>
        )}

        {/* Template Breakdown */}
        {Object.keys(stats.templateBreakdown).length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-4">
            <button
              onClick={() => setShowTemplates(t => !t)}
              className="w-full flex items-center justify-between"
            >
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Templates Used</p>
              {showTemplates ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
            </button>
            {showTemplates && (
              <div className="mt-3 space-y-2">
                {Object.entries(stats.templateBreakdown).sort((a,b) => b[1]-a[1]).map(([tmpl, count]) => (
                  <div key={tmpl} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-40 truncate font-mono">{tmpl}</span>
                    <div className="flex-1 bg-slate-700/40 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, (count / Math.max(...Object.values(stats.templateBreakdown))) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-300 font-mono w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Model Usage */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Model Usage</p>
            <button
              onClick={() => setUsage(loadUsageStats())}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title="Refresh"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Today</p>
              <p className="text-xl font-black text-white">{totalCalls}<span className="text-xs text-slate-500 font-normal ml-1">calls</span></p>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">This week</p>
              <p className="text-xl font-black text-white">{weeklyTotal}<span className="text-xs text-slate-500 font-normal ml-1">calls</span></p>
            </div>
          </div>
          {Object.keys(usage.callsByModel).length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">Breakdown by model (today)</p>
              {Object.entries(usage.callsByModel).sort((a,b) => b[1]-a[1]).map(([model, count]) => (
                <div key={model} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-3 py-2">
                  <Cpu className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-xs text-slate-300 font-mono flex-1 truncate">{model}</span>
                  <span className="text-xs font-black text-white">{count}</span>
                  <span className="text-[10px] text-slate-500">calls</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No calls tracked today yet — usage counters update on each API call.</p>
          )}
        </div>

        {/* Export */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">Export Data</p>
          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              disabled={savedSchemas.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={handleExportJSON}
              disabled={savedSchemas.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Exports include all sessions: stage responses, confidence scores, check counts, reflections, and timestamps. Self-monitoring correlates with higher achievement (Zimmerman, 2002).
          </p>
        </div>
      </div>
    </div>
  );
}
