import { NextRequest, NextResponse } from 'next/server';
import { parseRouteBody, remnoteSchema } from '@/lib/api-validation';
import { buildRemnotePushAttempts, type RemnoteExportPayload } from '@/lib/remnote';

// ─── RemNote push proxy ─────────────────────────────────────────────────────
// RemNote's backend API (`api.remnote.io/api/v0`) authenticates with the
// user's own `apiKey`/`userId` headers and sends no CORS headers, so the
// browser can never call it directly. This route runs the request server-side:
// the page never touches RemNote, and the failure text the user sees is what
// RemNote actually answered rather than a generic "network error".

export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 15000;

export async function POST(req: NextRequest) {
  const parsed = await parseRouteBody(req, remnoteSchema);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.error }, { status: 400 });
  }
  const apiKey = (parsed.data.apiKey || '').trim();
  const userId = (parsed.data.userId || '').trim();
  const markdown = parsed.data.markdown || '';
  const title = parsed.data.title || '';

  if (!apiKey || !markdown.trim()) {
    return NextResponse.json(
      { success: false, message: 'A RemNote API key and some content are required.' },
      { status: 400 }
    );
  }

  const payload: RemnoteExportPayload = {
    markdown,
    cardCount: 0,
    factsCount: 0,
    conceptsCount: 0,
    hierarchicalDeck: markdown,
  };

  const attempts = buildRemnotePushAttempts(apiKey, userId, payload, title);
  let lastMessage = 'RemNote did not accept the push.';

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(attempt.body),
        signal: controller.signal,
      });

      const text = await res.text();
      if (res.ok) {
        let docId: string | undefined;
        try {
          const parsed = JSON.parse(text);
          docId = parsed?.docId || parsed?._id || parsed?.note?.id;
        } catch {
          /* RemNote may answer with a bare id or empty body */
        }
        return NextResponse.json({
          success: true,
          docId,
          message: 'Pushed the structured document into your RemNote knowledge base.',
          endpoint: attempt.url,
        });
      }

      // Keep the server's own words: "invalid api key", "user not found" and
      // "method not found" are three different fixes for the user.
      lastMessage = `RemNote answered HTTP ${res.status} at ${attempt.url}: ${text.slice(0, 300) || 'no body'}`;
      // 4xx on the first shape means the credentials/wording are wrong, not that
      // another endpoint would help — only fall through on 404/405.
      if (res.status !== 404 && res.status !== 405) break;
    } catch (err: any) {
      const timedOut = err?.name === 'AbortError';
      lastMessage = timedOut
        ? `RemNote did not answer ${attempt.url} within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Could not reach ${attempt.url}: ${err?.message || 'network error'}.`;
    } finally {
      clearTimeout(timer);
    }
  }

  return NextResponse.json(
    {
      success: false,
      message: `${lastMessage} RemNote's public API is intermittently unavailable — "Copy RemNote Markdown" and pasting it into RemNote always works.`,
    },
    { status: 502 }
  );
}
