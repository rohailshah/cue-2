export interface ResolvedImdbTitle {
  id: string;
  title: string;
  qid?: string;
  q?: string;
  year?: number;
  posterUrl?: string;
  cast?: string;
}

interface ImdbSuggestionEntry {
  id?: string;
  l?: string;
  q?: string;
  qid?: string;
  y?: number;
  s?: string;
  i?: {
    imageUrl?: string;
    width?: number;
    height?: number;
  };
}

function jsonResponse(body: unknown, status = 200, maxAge = 86400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control':
        status === 200
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=604800`
          : 'no-store',
    },
  });
}

function sanitizeImdbIds(rawIds: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawIds) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim().toLowerCase();
    if (!/^tt\d{5,12}$/.test(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 40) break;
  }
  return out;
}

async function fetchOneImdbId(id: string): Promise<ResolvedImdbTitle | null> {
  try {
    const res = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`, {
      headers: {
        'User-Agent': 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { d?: ImdbSuggestionEntry[] };
    const entries = Array.isArray(data.d) ? data.d : [];
    const match =
      entries.find((e) => (e.id || '').toLowerCase() === id) ||
      (entries[0] && (entries[0].id || '').toLowerCase() === id ? entries[0] : undefined);
    if (!match || !match.l) return null;

    return {
      id,
      title: match.l.trim(),
      qid: match.qid || '',
      q: match.q || '',
      year: typeof match.y === 'number' ? match.y : undefined,
      posterUrl: match.i?.imageUrl || '',
      cast: match.s || '',
    };
  } catch {
    return null;
  }
}

async function resolveBatch(ids: string[]): Promise<Record<string, ResolvedImdbTitle | null>> {
  const items: Record<string, ResolvedImdbTitle | null> = {};
  const concurrency = 10;
  for (let i = 0; i < ids.length; i += concurrency) {
    const slice = ids.slice(i, i + concurrency);
    const settled = await Promise.all(slice.map(async (id) => [id, await fetchOneImdbId(id)] as const));
    for (const [id, info] of settled) {
      items[id] = info;
    }
  }
  return items;
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = url.searchParams.get('ids') || '';
  const ids = sanitizeImdbIds(raw.split(','));
  if (ids.length === 0) {
    return jsonResponse({ items: {}, error: 'Missing valid IMDb tt... IDs' }, 400);
  }
  const items = await resolveBatch(ids);
  return jsonResponse({ items });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const rawList = Array.isArray(body?.ids) ? body.ids : [];
    const ids = sanitizeImdbIds(rawList);
    if (ids.length === 0) {
      return jsonResponse({ items: {}, error: 'Missing valid IMDb tt... IDs' }, 400);
    }
    const items = await resolveBatch(ids);
    return jsonResponse({ items });
  } catch {
    return jsonResponse({ items: {}, error: 'Invalid JSON request body' }, 400);
  }
}
