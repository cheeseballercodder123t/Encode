import { NextResponse } from 'next/server';
import { aiMetrics } from '@/lib/ai-hardening';
import { captureAiError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

/**
 * Process-local AI pipeline metrics: how often the JSON repair ladder had to
 * run, how often a model fell back to the next one, how many provider calls
 * were retried or timed out. A personal telemetry view — no persistence, so
 * the numbers describe the current server process.
 */
export async function GET() {
  try {
    return NextResponse.json({
      ai: aiMetrics.snapshot(),
      at: new Date().toISOString(),
    });
  } catch (err) {
    captureAiError(err, { route: '/api/metrics' });
    return NextResponse.json({ error: 'Failed to read metrics.' }, { status: 500 });
  }
}
