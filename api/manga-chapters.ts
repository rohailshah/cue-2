export interface MangaChapterResolveResult {
  ok: boolean;
  found: boolean;
  title: string;
  matchedTitle?: string;
  totalChapters?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  source?: 'mangaupdates' | 'mangadex';
  checkedAt: string;
}

const UA_HEADERS = {
  'User-Agent': 'CueMediaApp/1.0 (https://cue-three-theta.vercel.app)',
};

const SPINOFF_TERMS =
  /\b(novel|light novel|doujinshi|anthology|fanbook|databook|guidebook|colored|full color|official colored|party|spin[- ]?off|chibi|omake|4-koma|pilot|one[- ]?shot)\b/i;

function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[:\-–—_.,!?'’"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(
  query: string,
  candidateTitle: string,
  candidateYear?: number,
  targetYear?: number
): number {
  const qNorm = normalizeTitle(query);
  const cNorm = normalizeTitle(candidateTitle);
  if (!cNorm) return -100;

  let score = 0;
  if (cNorm === qNorm) {
    score += 120;
  } else if (cNorm.startsWith(qNorm)) {
    const suffix = cNorm.slice(qNorm.length).trim();
    // Penalize sequel/spinoff words after prefix unless query asked for them
    score += suffix.length > 0 && !qNorm.includes(suffix) ? 55 : 85;
  } else if (cNorm.includes(qNorm)) {
    score += 45;
  } else {
    const qWords = qNorm.split(' ').filter(Boolean);
    const matches = qWords.filter((w) => cNorm.includes(w)).length;
    if (matches === 0) return -50;
    score += Math.round((matches / Math.max(1, qWords.length)) * 35);
  }

  if (targetYear && candidateYear && Number.isFinite(candidateYear)) {
    const diff = Math.abs(candidateYear - targetYear);
    if (diff === 0) score += 45;
    else if (diff <= 1) score += 30;
    else if (diff <= 2) score += 15;
    else if (diff >= 8) score -= 25;
  }

  if (SPINOFF_TERMS.test(candidateTitle) && !SPINOFF_TERMS.test(query)) {
    score -= 60;
  }

  return score;
}

function parseMuStatus(raw?: string): 'ongoing' | 'completed' | 'hiatus' | undefined {
  const s = (raw || '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('hiatus')) return 'hiatus';
  if (s.includes('ongoing')) return 'ongoing';
  if (s.includes('complete')) return 'completed';
  return undefined;
}

function parseMdStatus(raw?: string | null): 'ongoing' | 'completed' | 'hiatus' | undefined {
  const s = (raw || '').toLowerCase();
  if (s === 'ongoing') return 'ongoing';
  if (s === 'completed') return 'completed';
  if (s === 'hiatus') return 'hiatus';
  return undefined;
}

interface ProviderChapterHit {
  matchedTitle: string;
  totalChapters?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  source: 'mangaupdates' | 'mangadex';
  score: number;
}

async function queryMangaUpdates(title: string, targetYear?: number): Promise<ProviderChapterHit | null> {
  try {
    const searchRes = await fetch('https://api.mangaupdates.com/v1/series/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...UA_HEADERS,
      },
      body: JSON.stringify({ search: title, perpage: 8 }),
      signal: AbortSignal.timeout(5500),
    });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      results?: Array<{
        record?: {
          series_id?: number;
          title?: string;
          year?: string | number;
          type?: string;
        };
      }>;
    };
    const candidates = (searchJson.results || [])
      .map((r) => r.record)
      .filter((r): r is NonNullable<typeof r> => Boolean(r?.series_id && r?.title))
      .map((r) => {
        const y = Number(r.year) || undefined;
        let sc = scoreCandidate(title, r.title!, y, targetYear);
        if (r.type && /novel/i.test(r.type)) sc -= 70;
        return { r, sc };
      })
      .sort((a, b) => b.sc - a.sc);

    const best = candidates[0];
    if (!best || best.sc < 35) return null;

    const detailRes = await fetch(
      `https://api.mangaupdates.com/v1/series/${best.r.series_id}`,
      {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!detailRes.ok) return null;
    const detail = (await detailRes.json()) as {
      title?: string;
      latest_chapter?: number;
      status?: string;
    };
    const ch = typeof detail.latest_chapter === 'number' ? Math.round(detail.latest_chapter) : 0;
    return {
      matchedTitle: detail.title || best.r.title || title,
      totalChapters: ch > 0 && ch <= 10000 ? ch : undefined,
      status: parseMuStatus(detail.status),
      source: 'mangaupdates',
      score: best.sc,
    };
  } catch {
    return null;
  }
}

async function queryMangaDex(title: string, targetYear?: number): Promise<ProviderChapterHit | null> {
  try {
    const searchRes = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=6&order[relevance]=desc`,
      {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      data?: Array<{
        id: string;
        attributes?: {
          title?: Record<string, string>;
          altTitles?: Array<Record<string, string>>;
          year?: number | null;
          status?: string | null;
          lastChapter?: string | null;
        };
      }>;
    };

    const scored = (searchJson.data || [])
      .map((m) => {
        const titlesMap = m.attributes?.title || {};
        const primaryTitle =
          titlesMap.en || titlesMap['ja-ro'] || Object.values(titlesMap)[0] || '';
        const altTitles = (m.attributes?.altTitles || [])
          .map((t) => t.en || t['ja-ro'] || Object.values(t)[0])
          .filter(Boolean) as string[];
        const bestTitleScore = Math.max(
          scoreCandidate(title, primaryTitle, m.attributes?.year || undefined, targetYear),
          ...altTitles.slice(0, 4).map((alt) =>
            scoreCandidate(title, alt, m.attributes?.year || undefined, targetYear)
          )
        );
        return { m, primaryTitle, sc: bestTitleScore };
      })
      .sort((a, b) => b.sc - a.sc);

    const best = scored[0];
    if (!best || best.sc < 35) return null;

    let maxCh = 0;
    const lastChNum = Number.parseFloat(best.m.attributes?.lastChapter || '');
    if (Number.isFinite(lastChNum) && lastChNum > 0 && lastChNum <= 5000) {
      maxCh = Math.floor(lastChNum);
    }

    const aggRes = await fetch(
      `https://api.mangadex.org/manga/${best.m.id}/aggregate`,
      {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(5500),
      }
    );
    if (aggRes.ok) {
      const aggJson = (await aggRes.json()) as {
        volumes?: Record<string, { chapters?: Record<string, { chapter?: string }> }>;
      };
      for (const vol of Object.values(aggJson.volumes || {})) {
        for (const ch of Object.values(vol.chapters || {})) {
          const n = Number.parseFloat(ch.chapter || '');
          if (Number.isFinite(n) && n > 0 && n <= 5000) {
            const floored = Math.floor(n);
            if (floored > maxCh) maxCh = floored;
          }
        }
      }
    }

    return {
      matchedTitle: best.primaryTitle || title,
      totalChapters: maxCh > 0 ? maxCh : undefined,
      status: parseMdStatus(best.m.attributes?.status),
      source: 'mangadex',
      score: best.sc,
    };
  } catch {
    return null;
  }
}

export async function fetchMangaChapterCountPayload(
  title: string,
  year?: number
): Promise<MangaChapterResolveResult> {
  const checkedAt = new Date().toISOString();
  const [muRes, mdRes] = await Promise.allSettled([
    queryMangaUpdates(title, year),
    queryMangaDex(title, year),
  ]);
  const mu = muRes.status === 'fulfilled' ? muRes.value : null;
  const md = mdRes.status === 'fulfilled' ? mdRes.value : null;

  const hits = [mu, md].filter((h): h is ProviderChapterHit => Boolean(h && h.totalChapters));
  if (hits.length === 0) {
    const statusOnly = mu?.status || md?.status;
    return {
      ok: true,
      found: false,
      title,
      matchedTitle: mu?.matchedTitle || md?.matchedTitle,
      status: statusOnly,
      checkedAt,
    };
  }

  // Prefer MangaUpdates when both exist with strong title match; take the higher valid count if both match cleanly
  let chosen = hits[0];
  if (hits.length === 2 && mu && md) {
    if (Math.abs(mu.score - md.score) <= 25) {
      chosen =
        (md.totalChapters || 0) > (mu.totalChapters || 0) &&
        (md.totalChapters || 0) - (mu.totalChapters || 0) <= 250
          ? md
          : mu;
    } else {
      chosen = mu.score >= md.score ? mu : md;
    }
  }

  return {
    ok: true,
    found: true,
    title,
    matchedTitle: chosen.matchedTitle,
    totalChapters: chosen.totalChapters,
    status: chosen.status || mu?.status || md?.status,
    source: chosen.source,
    checkedAt,
  };
}

function jsonResponse(body: unknown, status = 200, maxAgeSec = 3600): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `s-maxage=${maxAgeSec}, stale-while-revalidate=86400`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const title = (url.searchParams.get('title') || '').trim();
    const yearRaw = Number(url.searchParams.get('year') || '');
    const year = Number.isFinite(yearRaw) && yearRaw > 1900 ? yearRaw : undefined;

    if (title.length < 1) {
      return jsonResponse({ ok: false, found: false, error: 'Missing manga title' }, 400, 60);
    }

    const payload = await fetchMangaChapterCountPayload(title, year);
    return jsonResponse(payload, 200, payload.found ? 3600 : 600);
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        found: false,
        error: err instanceof Error ? err.message : 'Unexpected manga lookup error',
      },
      500,
      60
    );
  }
}
