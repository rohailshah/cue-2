export interface ServiceProbeResult {
  id: string;
  name: string;
  domain: 'watch' | 'read' | 'play';
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  note?: string;
}

export interface LiveHealthReport {
  status: 'operational' | 'degraded' | 'outage';
  checkedAt: string;
  overallLatencyMs: number;
  onlineCount: number;
  totalCount: number;
  services: ServiceProbeResult[];
  integrations?: {
    tmdbServerConfigured: boolean;
    igdbServerConfigured: boolean;
  };
}

const UA_HEADER = 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)';

async function probeEndpoint(
  id: string,
  name: string,
  domain: 'watch' | 'read' | 'play',
  url: string,
  init?: RequestInit,
  validateJson?: (data: unknown) => boolean
): Promise<ServiceProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': UA_HEADER,
        ...(init?.headers || {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        id,
        name,
        domain,
        ok: false,
        statusCode: res.status,
        latencyMs,
        note: `HTTP ${res.status}`,
      };
    }
    if (validateJson) {
      const json = (await res.json()) as unknown;
      const valid = validateJson(json);
      return {
        id,
        name,
        domain,
        ok: valid,
        statusCode: res.status,
        latencyMs,
        note: valid ? undefined : 'Unexpected payload',
      };
    }
    return { id, name, domain, ok: true, statusCode: res.status, latencyMs };
  } catch (err) {
    return {
      id,
      name,
      domain,
      ok: false,
      statusCode: 0,
      latencyMs: Date.now() - started,
      note: err instanceof Error ? err.message : 'Timeout',
    };
  }
}

function readTmdbCredential(env?: Record<string, string | undefined>): string {
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

function readIgdbCreds(env?: Record<string, string | undefined>): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: (
      env?.TWITCH_CLIENT_ID ||
      env?.IGDB_CLIENT_ID ||
      process.env.TWITCH_CLIENT_ID ||
      process.env.IGDB_CLIENT_ID ||
      ''
    ).trim(),
    clientSecret: (
      env?.TWITCH_CLIENT_SECRET ||
      env?.IGDB_CLIENT_SECRET ||
      process.env.TWITCH_CLIENT_SECRET ||
      process.env.IGDB_CLIENT_SECRET ||
      ''
    ).trim(),
  };
}

export async function fetchLiveHealthPayload(
  env?: Record<string, string | undefined>
): Promise<LiveHealthReport> {
  const started = Date.now();
  const tmdbCredential = readTmdbCredential(env);
  const { clientId: igdbClientId, clientSecret: igdbSecret } = readIgdbCreds(env);
  const tmdbServerConfigured = Boolean(tmdbCredential);
  const igdbServerConfigured = Boolean(igdbClientId && igdbSecret);

  const probeTasks: Array<Promise<ServiceProbeResult>> = [
    probeEndpoint(
      'tvmaze',
      'TVMaze Shows',
      'watch',
      'https://api.tvmaze.com/shows/1',
      undefined,
      (d) => Boolean(d && typeof d === 'object' && 'id' in d)
    ),
    probeEndpoint(
      'itunes',
      'Apple iTunes Feeds',
      'watch',
      'https://itunes.apple.com/us/rss/topmovies/limit=3/json',
      undefined,
      (d) => Boolean(d && typeof d === 'object' && 'feed' in d)
    ),
    probeEndpoint(
      'anilist',
      'AniList Manga & Novels',
      'read',
      'https://graphql.anilist.co',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query{Media(id:1){id}}' }),
      },
      (d) => Boolean(d && typeof d === 'object' && 'data' in d)
    ),
    probeEndpoint(
      'openlibrary',
      'Open Library & ISBN',
      'read',
      'https://openlibrary.org/api/books?bibkeys=ISBN:9780441172719&format=json&jscmd=data',
      undefined,
      (d) => Boolean(d && typeof d === 'object' && 'ISBN:9780441172719' in d)
    ),
    probeEndpoint(
      'fandom',
      'Fandom Comic Covers',
      'read',
      'https://marvel.fandom.com/api.php?action=query&titles=Annihilation_Vol_1_1&format=json',
      undefined,
      (d) => Boolean(d && typeof d === 'object' && 'query' in d)
    ),
    probeEndpoint(
      'games',
      'Steam & Metacritic Games',
      'play',
      'https://store.steampowered.com/search/results/?query&start=0&count=1&category1=998&filter=topsellers&json=1',
      undefined,
      (d) => Boolean(d && typeof d === 'object' && 'items' in d)
    ),
  ];

  if (tmdbServerConfigured) {
    const isBearer = tmdbCredential.length > 60 || tmdbCredential.startsWith('eyJ');
    const url = isBearer
      ? 'https://api.themoviedb.org/3/configuration'
      : `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(tmdbCredential)}`;
    probeTasks.push(
      probeEndpoint(
        'tmdb',
        'TMDB Watch Proxy',
        'watch',
        url,
        isBearer ? { headers: { Authorization: `Bearer ${tmdbCredential}` } } : undefined,
        (d) => Boolean(d && typeof d === 'object' && 'images' in d)
      )
    );
  }

  if (igdbServerConfigured) {
    probeTasks.push(
      probeEndpoint(
        'igdb',
        'IGDB Games Proxy',
        'play',
        `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(
          igdbClientId
        )}&client_secret=${encodeURIComponent(igdbSecret)}&grant_type=client_credentials`,
        { method: 'POST' },
        (d) => Boolean(d && typeof d === 'object' && 'access_token' in d)
      )
    );
  }

  const services = await Promise.all(probeTasks);

  const onlineCount = services.filter((s) => s.ok).length;
  const totalCount = services.length;
  const status: LiveHealthReport['status'] =
    onlineCount === totalCount
      ? 'operational'
      : onlineCount >= Math.ceil(totalCount / 2)
        ? 'degraded'
        : 'outage';

  return {
    status,
    checkedAt: new Date().toISOString(),
    overallLatencyMs: Date.now() - started,
    onlineCount,
    totalCount,
    services,
    integrations: {
      tmdbServerConfigured,
      igdbServerConfigured,
    },
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

export async function GET(): Promise<Response> {
  try {
    const payload = await fetchLiveHealthPayload();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        status: 'outage',
        checkedAt: new Date().toISOString(),
        overallLatencyMs: 0,
        onlineCount: 0,
        totalCount: 6,
        services: [],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
