'use client';
import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Button, Card, CardContent, Badge, Input } from './ui/index';

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
  const [usageVersion, setUsageVersion] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Re-read usage stats whenever the modal opens (or REFRESH is pressed).
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (isOpen) setUsageVersion(v => v + 1);
  }
  // Read usage stats on every render : it's a cheap localStorage read, and
  // usageVersion bumps force a re-render on open / REFRESH so it stays fresh.
  const usage = loadUsageStats();

  // Filter schemas based on search query
  const filteredSchemas = useMemo(() => {
    if (!searchQuery.trim()) return savedSchemas;
    const query = searchQuery.toLowerCase();
    return savedSchemas.filter(schema => 
      schema.topicSummary?.toLowerCase().includes(query) ||
      schema.mode?.toLowerCase().includes(query) ||
      schema.id?.toLowerCase().includes(query)
    );
  }, [savedSchemas, searchQuery]);

  // Pagination : clamp to a valid page so narrowing the search can never leave
  // the user stranded on an out-of-range page (replaces the reset-on-search effect).
  const totalPages = Math.max(1, Math.ceil(filteredSchemas.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedSchemas = useMemo(() => {
    const startIndex = (safePage - 1) * itemsPerPage;
    return filteredSchemas.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSchemas, safePage, itemsPerPage]);

  // Windowed page numbers : at most 5 buttons, ellipsed around the current page.
  const pageButtons = useMemo(() => {
    const total = totalPages;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const windowStart = Math.max(1, Math.min(safePage - 2, total - 4));
    const btns = Array.from({ length: 5 }, (_, i) => windowStart + i);
    return btns;
  }, [totalPages, safePage]);

  if (!isOpen) return null;

  const stats = computeAllStats(savedSchemas);
  const totalSessions = savedSchemas.length;
  const filteredCount = filteredSchemas.length;
  const totalCalls = Object.values(usage.callsByModel).reduce((a, b) => a + b, 0);
  const weeklyTotal = Object.values(usage.weeklyCallsByModel).reduce((a, b) => a + b, 0);

  const handleExportCSV = () => {
    const rows: string[] = ['session_id,timestamp,topic,mode,stage,template,confidence,check_count,grade,score,reflection'];
    for (const s of filteredSchemas) {
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
    const data = filteredSchemas.map(s => ({
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
    <div className="fixed inset-0 z-50 bg-chassis overflow-y-auto font-mono">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 border-b border-steel pb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber">[</span>
            <h1 className="text-sm font-bold text-bone uppercase tracking-wider">SYS.07 // ANALYTICS CORE</h1>
            <span className="text-amber">]</span>
          </div>
          <Button variant="ghost" size="xs" onClick={onClose}>[ X ]</Button>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search sessions by topic, mode, or ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <p className="text-[10px] text-solder mt-1">
              Found {filteredCount} of {totalSessions} sessions
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            { label: 'SESSIONS', value: String(totalSessions) },
            { label: 'SUCCESS RATE', value: `${stats.successRate}%` },
            { label: 'AVG CONFIDENCE', value: stats.avgConfidence ? `${stats.avgConfidence}/100` : '--' },
            { label: 'REFLECTIONS', value: String(stats.reflectionsWritten) },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-[10px] text-solder uppercase tracking-wider">{label}</p>
                <p className="text-lg font-bold text-bone mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {stats.successRate > 0 && (
          <Card className="mb-3">
            <CardContent className="p-3">
              <p className="text-[10px] text-solder uppercase tracking-wider mb-2">OVERALL SUCCESS RATE</p>
              <div className="w-full bg-chassis h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.successRate}%` }}
                  transition-none={{ duration: 1.2, ease: 'easeOut' }}
                  className={`h-2 ${stats.successRate >= 80 ? 'bg-amber' : stats.successRate >= 60 ? 'bg-amber/70' : 'bg-hazard'}`}
                />
              </div>
              <p className="text-right text-[10px] text-solder mt-1">{stats.successRate}%</p>
            </CardContent>
          </Card>
        )}

        {Object.keys(stats.templateBreakdown).length > 0 && (
          <Card className="mb-3">
            <CardContent className="p-3">
              <button
                onClick={() => setShowTemplates(t => !t)}
                className="w-full flex items-center justify-between text-[10px] text-solder uppercase tracking-wider hover:text-bone"
              >
                <span>TEMPLATES USED</span>
                <span>{showTemplates ? '[-]' : '[+]'}</span>
              </button>
              {showTemplates && (
                <div className="mt-2 space-y-1">
                  {Object.entries(stats.templateBreakdown).sort((a,b) => b[1]-a[1]).map(([tmpl, count]) => (
                    <div key={tmpl} className="flex items-center gap-2">
                      <span className="text-[10px] text-solder w-36 truncate">{tmpl}</span>
                      <div className="flex-1 bg-chassis h-1">
                        <div
                          className="bg-amber h-1"
                          style={{ width: `${Math.min(100, (count / Math.max(...Object.values(stats.templateBreakdown))) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-bone w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="mb-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-solder uppercase tracking-wider">MODEL USAGE</p>
              <Button variant="ghost" size="xs" onClick={() => setUsageVersion(v => v + 1)}>[ REFRESH ]</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-chassis p-2 border border-steel">
                <p className="text-[10px] text-solder">TODAY</p>
                <p className="text-base font-bold text-bone">{totalCalls} <span className="text-[10px] text-solder">calls</span></p>
              </div>
              <div className="bg-chassis p-2 border border-steel">
                <p className="text-[10px] text-solder">THIS WEEK</p>
                <p className="text-base font-bold text-bone">{weeklyTotal} <span className="text-[10px] text-solder">calls</span></p>
              </div>
            </div>
            {Object.keys(usage.callsByModel).length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">BREAKDOWN BY MODEL (TODAY)</p>
                {Object.entries(usage.callsByModel).sort((a,b) => b[1]-a[1]).map(([model, count]) => (
                  <div key={model} className="flex items-center gap-2 bg-chassis border border-steel px-2 py-1">
                    <span className="text-[10px] text-solder flex-1 truncate">{model}</span>
                    <Badge variant="steel" size="xs">{count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-solder italic">No calls tracked today yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-solder uppercase tracking-wider mb-2">EXPORT DATA</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredSchemas.length === 0}>[ EXPORT CSV ]</Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={filteredSchemas.length === 0}>[ EXPORT JSON ]</Button>
            </div>
            <p className="text-[10px] text-solder mt-2">
              Exports include all sessions: stage responses, confidence scores, check counts, reflections, and timestamps.
            </p>
          </CardContent>
        </Card>

        {filteredSchemas.length > 0 && (
          <Card className="mt-3">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-[10px] text-solder uppercase tracking-wider">SESSION HISTORY</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1 text-[10px] text-solder uppercase tracking-wider">
                    Per page
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value) || 10);
                        setCurrentPage(1);
                      }}
                      className="bg-chassis border border-steel text-bone text-[10px] px-1 py-0.5 cursor-pointer"
                      aria-label="Sessions per page"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => setCurrentPage(1)} disabled={safePage === 1} title="First page">[&lt;&lt;]</Button>
                    <Button variant="ghost" size="xs" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>[&lt;]</Button>
                    {pageButtons.map(pn => (
                      <button
                        key={pn}
                        type="button"
                        onClick={() => setCurrentPage(pn)}
                        className={`px-1.5 py-0.5 text-[10px] font-mono border transition-none cursor-pointer ${
                          pn === safePage ? 'bg-amber border-amber text-chassis font-bold' : 'border-transparent text-solder hover:text-bone'
                        }`}
                        aria-current={pn === safePage ? 'page' : undefined}
                      >
                        {pn}
                      </button>
                    ))}
                    <Button variant="ghost" size="xs" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>[&gt;]</Button>
                    <Button variant="ghost" size="xs" onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages} title="Last page">[&gt;&gt;]</Button>
                  </div>
                  <span className="text-[10px] text-solder">
                    Page {safePage} of {totalPages} · {filteredSchemas.length} sessions
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {paginatedSchemas.map((schema) => (
                  <div
                    key={schema.id}
                    className="flex items-center justify-between p-2 bg-chassis border border-steel hover:border-amber"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="amber" size="xs">{schema.mode || 'standard'}</Badge>
                        <span className="text-[10px] text-solder">{new Date(schema.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-bone truncate">{schema.topicSummary || 'Untitled Session'}</p>
                      <p className="text-[10px] text-solder">{schema.activities?.length || 0} stages / {schema.xpEarned || 0} XP</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
