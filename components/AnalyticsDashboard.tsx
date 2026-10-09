'use client';
import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Button, Card, CardContent, Badge, Input } from './ui/index';
import { useModalA11y } from '@/hooks/useModalA11y';
// Stats, exports and paging all come from the shared analytics service, so this
// sheet and any other reader of a session can never report different numbers.
import {
  computeLibraryStats,
  downloadFile,
  exportToCSV,
  exportToJSON,
  paginateSessions,
} from '@/lib/services/sessionAnalytics';
import {
  buildBackup,
  downloadBackup,
  parseBackupFile,
  restoreBackup,
  type RestoreReport,
} from '@/lib/backup';
import { loadParadoxes } from '@/lib/mr-m/ledger';
// One definition of the ledger read. The sheet used to carry its own copy of
// the daily roll, so the two could disagree about what a new day keeps.
import { loadUsageStats } from '@/lib/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  savedSchemas: import('@/lib/types').SavedSchema[];
}

export function AnalyticsDashboard({ isOpen, onClose, savedSchemas }: Props) {
  const [usageVersion, setUsageVersion] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Full backup state. Declared before the early return below: hooks must run
  // on every render, open or closed.
  const [backupReport, setBackupReport] = useState<RestoreReport | null>(null);
  const [backupError, setBackupError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  // Pagination : the shared helper clamps to a valid page, so narrowing the
  // search can never leave the user stranded on an out-of-range page (it
  // replaces the old reset-on-search effect).
  const { items: paginatedSchemas, page: safePage, totalPages } = paginateSessions(
    filteredSchemas,
    currentPage,
    itemsPerPage
  );

  // Windowed page numbers : at most 5 buttons, ellipsed around the current page.
  const pageButtons = useMemo(() => {
    const total = totalPages;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const windowStart = Math.max(1, Math.min(safePage - 2, total - 4));
    const btns = Array.from({ length: 5 }, (_, i) => windowStart + i);
    return btns;
  }, [totalPages, safePage]);


  // Esc closes, the page behind stops scrolling, focus moves in and back out.
  const sheetRef = useModalA11y(isOpen, onClose);
  if (!isOpen) return null;

  const stats = computeLibraryStats(savedSchemas);
  // The service keeps `successRate` a fraction and its averages unrounded, so
  // rounding happens here — the one point where a number reaches the screen.
  const successPct = Math.round(stats.successRate * 100);
  const avgConfidencePct = Math.round(stats.avgConfidence);
  const totalSessions = savedSchemas.length;
  const filteredCount = filteredSchemas.length;
  const totalCalls = Object.values(usage.callsByModel).reduce((a, b) => a + b, 0);
  const weeklyTotal = Object.values(usage.weeklyCallsByModel).reduce((a, b) => a + b, 0);
  // Lifetime token spend + rough USD estimate (see lib/ai-hardening pricing).
  // Mr M mode: contradictions still open. Read straight from the ledger on
  // every render, like the usage stats above — an unresolved paradox is the one
  // piece of Mr M state that is worth a number on a dashboard.
  const openParadoxCount = loadParadoxes().filter((entry) => !entry.resolvedAt).length;
  const totalTokens = Object.values(usage.tokensByModel || {}).reduce((a, b) => a + b, 0);
  const totalCostUsd = Object.values(usage.costUsdByModel || {}).reduce((a, b) => a + b, 0);
  const fmtTokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${n}`);
  const fmtCost = (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);

  // Exports go through the service, which is what the CSV/JSON tests cover.
  const handleExportCSV = () => {
    downloadFile(exportToCSV(filteredSchemas), `encode-sessions-${Date.now()}.csv`, 'text/csv');
  };

  const handleExportJSON = () => {
    downloadFile(exportToJSON(filteredSchemas), `encode-sessions-${Date.now()}.json`, 'application/json');
  };

  // Full backup: everything (sessions + settings + deck memory + lessons + …)
  // in one JSON file, restored with a per-entry validation report.
  const handleExportBackup = () => {
    downloadBackup(buildBackup());
  };

  const handleImportBackup = async (file: File) => {
    setBackupError('');
    try {
      const parsed = parseBackupFile(await file.text());
      setBackupReport(restoreBackup(parsed));
    } catch (err: any) {
      setBackupReport(null);
      setBackupError(err?.message || 'Could not read that backup file.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div ref={sheetRef} role="dialog" aria-modal="true" tabIndex={-1} className="fixed inset-0 z-50 bg-chassis overflow-y-auto font-mono">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 border-b border-edge pb-3">
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
            { label: 'SUCCESS RATE', value: `${successPct}%` },
            { label: 'AVG CONFIDENCE', value: stats.avgConfidence ? `${avgConfidencePct}/100` : '--' },
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

        {openParadoxCount > 0 && (
          <Card className="mb-3">
            <CardContent className="p-3">
              <p className="text-[10px] text-solder uppercase tracking-wider">MR M · OPEN CONTRADICTIONS</p>
              <p className="text-lg font-bold text-hazard-300 mt-1">{openParadoxCount}</p>
              <p className="text-[10px] text-solder mt-1">
                Held until closed. With Mr M mode on, they stay on screen above every stage in that topic.
              </p>
            </CardContent>
          </Card>
        )}

        {successPct > 0 && (
          <Card className="mb-3">
            <CardContent className="p-3">
              <p className="text-[10px] text-solder uppercase tracking-wider mb-2">OVERALL SUCCESS RATE</p>
              <div className="w-full bg-chassis h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${successPct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className={`h-2 ${successPct >= 80 ? 'bg-amber' : successPct >= 60 ? 'bg-amber/70' : 'bg-hazard'}`}
                />
              </div>
              <p className="text-right text-[10px] text-solder mt-1">{successPct}%</p>
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
              <div className="bg-chassis p-2 border border-edge">
                <p className="text-[10px] text-solder">TODAY</p>
                <p className="text-base font-bold text-bone">{totalCalls} <span className="text-[10px] text-solder">calls</span></p>
              </div>
              <div className="bg-chassis p-2 border border-edge">
                <p className="text-[10px] text-solder">THIS WEEK</p>
                <p className="text-base font-bold text-bone">{weeklyTotal} <span className="text-[10px] text-solder">calls</span></p>
              </div>
              <div className="bg-chassis p-2 border border-edge">
                <p className="text-[10px] text-solder">TOKENS (LIFETIME)</p>
                <p className="text-base font-bold text-bone">{totalTokens > 0 ? fmtTokens(totalTokens) : '0'} <span className="text-[10px] text-solder">tok</span></p>
              </div>
              <div className="bg-chassis p-2 border border-edge">
                <p className="text-[10px] text-solder">EST. SPEND (LIFETIME)</p>
                <p className="text-base font-bold text-bone">{fmtCost(totalCostUsd)}</p>
              </div>
            </div>
            {Object.keys(usage.callsByModel).length > 0 ? (
              <div className="space-y-1">
                <p className="text-[10px] text-solder uppercase tracking-wider">BREAKDOWN BY MODEL (TODAY)</p>
                {Object.entries(usage.callsByModel).sort((a,b) => b[1]-a[1]).map(([model, count]) => (
                  <div key={model} className="flex items-center gap-2 bg-chassis border border-edge px-2 py-1">
                    <span className="text-[10px] text-solder flex-1 truncate">{model}</span>
                    {usage.tokensByModel?.[model] ? (
                      <span className="text-[10px] text-solder">{fmtTokens(usage.tokensByModel[model])} tok</span>
                    ) : null}
                    <Badge variant="edge" size="xs">{count}</Badge>
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
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredSchemas.length === 0}>[ EXPORT CSV ]</Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON} disabled={filteredSchemas.length === 0}>[ EXPORT JSON ]</Button>
              <Button variant="outline" size="sm" onClick={handleExportBackup}>[ BACKUP EVERYTHING ]</Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>[ RESTORE BACKUP ]</Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportBackup(f);
                }}
              />
            </div>
            <p className="text-[10px] text-solder mt-2">
              Exports include all sessions: stage responses, confidence scores, check counts, reflections, and timestamps.
            </p>
            <p className="text-[10px] text-solder mt-1">
              BACKUP EVERYTHING adds settings, study prefs, deck memory, lessons, forge recipes and stats to one restore file.
            </p>
            {backupReport && (
              <p className="text-[10px] text-signal mt-2" data-testid="backup-report">
                Restored {backupReport.schemasRestored} session{backupReport.schemasRestored === 1 ? '' : 's'}
                {backupReport.schemasSkipped > 0 ? ` · ${backupReport.schemasSkipped} skipped (duplicate or unreadable)` : ''}
                {backupReport.extrasRestored > 0 ? ` · ${backupReport.extrasRestored} data sets` : ''}
                {backupReport.settingsRestored ? ' · settings' : ''}
                {backupReport.prefsRestored ? ' · prefs' : ''}.
              </p>
            )}
            {backupError && <p className="text-[10px] text-hazard mt-2">{backupError}</p>}
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
                      className="bg-chassis border border-edge text-bone text-[10px] px-1 py-0.5 cursor-pointer"
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
                    className="flex items-center justify-between p-2 bg-chassis border border-edge hover:border-amber"
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
