const TMDB_BASE = 'https://api.themoviedb.org/3';

export interface TmdbProxyResponse {
  status: number;
  body: Record<string, unknown>;
  cacheControl: string;
}

export function resolveTmdbCredential(env?: Record<string, string | undefined>): string {
  return (
    env?.TMDB_READ_TOKEN ||
    env?.TMDB_ACCESS_TOKEN ||
    env?.TMDB_API_KEY ||
    process.env.TMDB_READ_TOKEN ||
    process.env.TMDB_ACCESS_TOKEN ||
    process.env.TMDB_API_KEY ||
    ''
  ).trim();
}

export async function tmdbFetchJson(
  path: string,
  credential: string,
  queryParams?: Record<string, string | number | undefined>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const cleanCred = credential.trim();
  if (!cleanCred) return { ok: false, status: 401, data: null };

  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(queryParams || {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }

  const isBearerToken = cleanCred.length > 60 || cleanCred.startsWith('eyJ');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (isBearerToken) {
    headers.Authorization = `Bearer ${cleanCred}`;
  } else {
    url.searchParams.set('api_key', cleanCred);
  }

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

function getDateWindow(daysBack = 185) {
  const now = new Date();
  const past = new Date(now.getTime() - daysBack * 86400 * 1000);
  return {
    cutoffIso: past.toISOString().slice(0, 10),
    todayIso: now.toISOString().slice(0, 10),
  };
}

/** Handles `/api/tmdb` proxy requests cleanly with strict action whitelisting. */
export async function handleTmdbProxyRequest(
  params: URLSearchParams,
  env?: Record<string, string | undefined>
): Promise<TmdbProxyResponse> {
  const action = (params.get('action') || 'status').trim().toLowerCase();
  const credential = resolveTmdbCredential(env);

  if (action === 'status') {
    return {
      status: 200,
      body: { configured: Boolean(credential) },
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    };
  }

  if (!credential) {
    return {
      status: 200,
      body: { configured: false, results: [] },
      cacheControl: 'public, s-maxage=60, stale-while-revalidate=300',
    };
  }

  const win = getDateWindow(185);

  if (action === 'search') {
    const q = (params.get('q') || '').trim();
    if (q.length < 2) {
      return { status: 400, body: { configured: true, error: 'Missing query', results: [] }, cacheControl: 'no-store' };
    }
    const r = await tmdbFetchJson('/search/multi', credential, {
      query: q,
      language: 'en-US',
      include_adult: 'false',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=900, stale-while-revalidate=7200',
    };
  }

  if (action === 'trending-movies') {
    const gte = params.get('gte') || win.cutoffIso;
    const lte = params.get('lte') || win.todayIso;
    const r = await tmdbFetchJson('/discover/movie', credential, {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': gte,
      'primary_release_date.lte': lte,
      language: 'en-US',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'trending-tv') {
    const r = await tmdbFetchJson('/trending/tv/week', credential, {
      language: 'en-US',
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'upcoming-movies') {
    const r = await tmdbFetchJson('/movie/upcoming', credential, {
      language: 'en-US',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'upcoming-tv') {
    const gte = params.get('gte') || win.todayIso;
    const r = await tmdbFetchJson('/discover/tv', credential, {
      sort_by: 'popularity.desc',
      'first_air_date.gte': gte,
      language: 'en-US',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'popular-movies') {
    const r = await tmdbFetchJson('/movie/top_rated', credential, {
      language: 'en-US',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'popular-tv') {
    const r = await tmdbFetchJson('/tv/top_rated', credential, {
      language: 'en-US',
      page: 1,
    });
    return {
      status: 200,
      body: r.ok && r.data ? { configured: true, ...r.data } : { configured: true, results: [] },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'tv-detail') {
    const id = Number(params.get('id') || '0');
    if (!Number.isInteger(id) || id <= 0) {
      return { status: 400, body: { configured: true, error: 'Invalid TV id' }, cacheControl: 'no-store' };
    }
    const detail = await tmdbFetchJson(`/tv/${id}`, credential, {
      append_to_response: 'credits,videos',
      language: 'en-US',
    });
    if (!detail.ok || !detail.data) {
      return { status: 200, body: { configured: true, show: null, seasons: [] }, cacheControl: 'no-store' };
    }
    const rawSeasons = Array.isArray(detail.data.seasons)
      ? (detail.data.seasons as Array<{ season_number?: number }>)
      : [];
    const validNums = rawSeasons
      .map((s) => s.season_number || 0)
      .filter((n) => n > 0)
      .slice(0, 20);
    const seasonResults = await Promise.all(
      validNums.map((sNum) => tmdbFetchJson(`/tv/${id}/season/${sNum}`, credential, { language: 'en-US' }))
    );
    const seasons = seasonResults.filter((sr) => sr.ok && sr.data).map((sr) => sr.data);
    return {
      status: 200,
      body: { configured: true, show: detail.data, seasons },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  if (action === 'movie-detail') {
    const id = Number(params.get('id') || '0');
    if (!Number.isInteger(id) || id <= 0) {
      return { status: 400, body: { configured: true, error: 'Invalid movie id' }, cacheControl: 'no-store' };
    }
    const detail = await tmdbFetchJson(`/movie/${id}`, credential, {
      append_to_response: 'credits,videos',
      language: 'en-US',
    });
    if (!detail.ok || !detail.data) {
      return { status: 200, body: { configured: true, movie: null }, cacheControl: 'no-store' };
    }
    const credits = detail.data.credits as {
      crew?: Array<{ job?: string; name?: string }>;
    } | undefined;
    const director =
      credits?.crew?.find((c) => c.job === 'Director')?.name || 'Feature Film';

    const videos = detail.data.videos as {
      results?: Array<{ site?: string; type?: string; key?: string; official?: boolean }>;
    } | undefined;
    const vidList = videos?.results || [];
    const ytTrailer =
      vidList.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official && v.key) ||
      vidList.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.key) ||
      vidList.find((v) => v.site === 'YouTube' && v.key);
    const trailerUrl = ytTrailer?.key
      ? `https://www.youtube.com/watch?v=${ytTrailer.key}`
      : undefined;

    return {
      status: 200,
      body: {
        configured: true,
        movie: detail.data,
        director,
        trailerUrl,
      },
      cacheControl: 'public, s-maxage=1800, stale-while-revalidate=21600',
    };
  }

  return {
    status: 400,
    body: { configured: Boolean(credential), error: 'Unsupported action' },
    cacheControl: 'no-store',
  };
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
    const out = await handleTmdbProxyRequest(url.searchParams);
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': out.cacheControl,
      },
    });
  } catch {
    return new Response(JSON.stringify({ configured: false, results: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
