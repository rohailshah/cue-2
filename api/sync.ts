import { get, put } from '@vercel/blob';

const SYNC_CODE_REGEX = /^CUE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB cap per synced library

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('CUE') && compact.length === 15 ? compact.slice(3) : compact;
  if (body.length !== 12) return raw.trim().toUpperCase();
  return `CUE-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

async function blobPathForCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sync/${hex}.json`;
}

function isValidCueState(candidate: unknown): candidate is Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, unknown>;
  return (
    typeof obj.shows === 'object' &&
    obj.shows !== null &&
    typeof obj.movies === 'object' &&
    obj.movies !== null &&
    typeof obj.readItems === 'object' &&
    obj.readItems !== null &&
    typeof obj.games === 'object' &&
    obj.games !== null
  );
}

function handleBlobError(err: unknown): Response {
  const message = err instanceof Error ? err.message : 'Sync storage request failed';
  const missingToken =
    message.toLowerCase().includes('token') ||
    message.toLowerCase().includes('store') ||
    message.toLowerCase().includes('unauthorized');
  return jsonResponse(
    {
      error: missingToken
        ? 'Cloud sync storage is not configured on this server.'
        : 'Unable to reach cloud sync storage right now.',
    },
    missingToken ? 503 : 500
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get('code'));
  if (!SYNC_CODE_REGEX.test(code)) {
    return jsonResponse({ error: 'Invalid sync code format.' }, 400);
  }

  try {
    const pathname = await blobPathForCode(code);
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return jsonResponse({ exists: false }, 404);
    }

    const rawText = await new Response(result.stream).text();
    const parsed = JSON.parse(rawText) as { updatedAt?: number; state?: unknown };
    if (!isValidCueState(parsed.state)) {
      return jsonResponse({ exists: false }, 404);
    }

    return jsonResponse({
      exists: true,
      updatedAt: Number(parsed.updatedAt) || 0,
      state: parsed.state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (message.includes('not found') || message.includes('404')) {
      return jsonResponse({ exists: false }, 404);
    }
    return handleBlobError(err);
  }
}

export async function PUT(request: Request): Promise<Response> {
  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: 'Failed to read request body.' }, 400);
  }

  if (new TextEncoder().encode(rawBody).length > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ error: 'Library exceeds 2 MB cloud sync limit.' }, 413);
  }

  let body: { code?: string; updatedAt?: number; state?: unknown };
  try {
    body = JSON.parse(rawBody) as { code?: string; updatedAt?: number; state?: unknown };
  } catch {
    return jsonResponse({ error: 'Malformed JSON payload.' }, 400);
  }

  const code = normalizeCode(body.code);
  if (!SYNC_CODE_REGEX.test(code)) {
    return jsonResponse({ error: 'Invalid sync code format.' }, 400);
  }

  if (!isValidCueState(body.state)) {
    return jsonResponse({ error: 'Invalid cue library snapshot.' }, 400);
  }

  const updatedAt = Number(body.updatedAt) || Date.now();

  try {
    const pathname = await blobPathForCode(code);
    await put(
      pathname,
      JSON.stringify({ updatedAt, state: body.state }),
      {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      }
    );
    return jsonResponse({ ok: true, updatedAt });
  } catch (err) {
    return handleBlobError(err);
  }
}
