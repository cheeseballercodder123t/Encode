import type { SavedSchema, SessionMetacognition } from '../types';

export interface SessionStats {
  totalStages: number;
  answeredStages: number;
  avgConfidence: number;
  avgCheckCount: number;
  successRate: number;
  reflectionsWritten: number;
  templateBreakdown: Record<string, number>;
}

export function computeSessionStats(schema: SavedSchema): SessionStats {
  const responses = Object.values(schema.userResponses || {});
  const answered = responses.filter(r => r.field1?.trim());
  const withConfidence = responses.filter(r => r.confidenceScore != null);
  const avgConfidence = withConfidence.length
    ? withConfidence.reduce((a, r) => a + (r.confidenceScore || 0), 0) / withConfidence.length
    : 0;
  const withChecks = responses.filter(r => r.checkCount);
  const avgCheckCount = withChecks.length
    ? withChecks.reduce((a, r) => a + (r.checkCount || 0), 0) / withChecks.length
    : 0;
  const scored = responses.filter(r => r.feynmanReview);
  const successes = scored.filter(r =>
    r.feynmanReview?.grade === 'mastered' || r.feynmanReview?.grade === 'good'
  ).length;
  const successRate = scored.length ? successes / scored.length : 0;
  const reflectionsWritten = responses.filter(r => r.reflection?.trim()).length;

  const templateBreakdown: Record<string, number> = {};
  (schema.activities || []).forEach(act => {
    templateBreakdown[act.templateType] = (templateBreakdown[act.templateType] || 0) + 1;
  });

  return {
    totalStages: schema.activities?.length || 0,
    answeredStages: answered.length,
    avgConfidence,
    avgCheckCount,
    successRate,
    reflectionsWritten,
    templateBreakdown,
  };
}

export function exportToCSV(schemas: SavedSchema[]): string {
  const rows: string[] = [];
  rows.push(['session_id','timestamp','topic','mode','stage','template','confidence','check_count','grade','score','reflection','readiness_latency_ms'].join(','));
  for (const schema of schemas) {
    for (const act of schema.activities || []) {
      const resp = schema.userResponses?.[act.id];
      if (!resp) continue;
      rows.push([
        schema.id,
        schema.timestamp,
        `"${(schema.topicSummary || '').replace(/"/g, '""')}"`,
        schema.mode,
        act.stageNumber,
        act.templateType,
        resp.confidenceScore ?? '',
        resp.checkCount ?? 0,
        resp.feynmanReview?.grade ?? '',
        resp.feynmanReview?.score ?? '',
        `"${(resp.reflection || '').replace(/"/g, '""')}"`,
        resp.readinessLatencyMs ?? '',
      ].join(','));
    }
  }
  return rows.join('\n');
}

export function exportToJSON(schemas: SavedSchema[]): string {
  return JSON.stringify(schemas.map(s => ({
    id: s.id,
    timestamp: s.timestamp,
    topic: s.topicSummary,
    mode: s.mode,
    xpEarned: s.xpEarned,
    stages: (s.activities || []).map(act => ({
      stage: act.stageNumber,
      title: act.title,
      template: act.templateType,
      response: s.userResponses?.[act.id] || null,
    })),
  })), null, 2);
}

export function downloadFile(content: string, filename: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
