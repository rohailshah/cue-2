import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { type GameDiscoverMode, fetchTrendingGamesPayload } from './api/trending-games.ts'
import { fetchLiveHealthPayload } from './api/health.ts'
import { handleTmdbProxyRequest } from './api/tmdb.ts'
import { handleIgdbProxyRequest } from './api/igdb.ts'
import { GET as handleGameChaptersGet } from './api/game-chapters.ts'
import {
  type ComicWikiSlug,
  fetchComicCollectionIssuesPayload,
  fetchComicSeriesIssuesPayload,
  fetchTrendingComicSeriesPayload,
  searchComicSeriesPayload,
} from './api/comic-series.ts'

function imdbResolveDevPlugin(): Plugin {
  return {
    name: 'cue-imdb-resolve-dev',
    configureServer(server) {
      server.middlewares.use('/api/imdb-resolve', async (req, res, next) => {
        try {
          let rawIds: unknown[] = [];
          if (req.method === 'GET') {
            const url = new URL(req.url || '/', 'http://localhost');
            rawIds = (url.searchParams.get('ids') || '').split(',');
          } else if (req.method === 'POST') {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
            }
            const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
            const merged = new Uint8Array(totalLen);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.byteLength;
            }
            const parsed = JSON.parse(new TextDecoder().decode(merged) || '{}') as {
              ids?: unknown;
            };
            rawIds = Array.isArray(parsed.ids) ? parsed.ids : [];
          } else if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          } else {
            next();
            return;
          }

          const seen = new Set<string>();
          const ids: string[] = [];
          for (const item of rawIds) {
            if (typeof item !== 'string') continue;
            const clean = item.trim().toLowerCase();
            if (!/^tt\d{5,12}$/.test(clean) || seen.has(clean)) continue;
            seen.add(clean);
            ids.push(clean);
            if (ids.length >= 40) break;
          }

          const items: Record<string, unknown> = {};
          const concurrency = 10;
          for (let i = 0; i < ids.length; i += concurrency) {
            const slice = ids.slice(i, i + concurrency);
            const settled = await Promise.all(
              slice.map(async (id) => {
                try {
                  const r = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`, {
                    headers: { Accept: 'application/json' },
                    signal: AbortSignal.timeout(5000),
                  });
                  if (!r.ok) return [id, null] as const;
                  const data = (await r.json()) as {
                    d?: Array<{
                      id?: string;
                      l?: string;
                      q?: string;
                      qid?: string;
                      y?: number;
                      s?: string;
                      i?: { imageUrl?: string };
                    }>;
                  };
                  const entries = Array.isArray(data.d) ? data.d : [];
                  const match =
                    entries.find((e) => (e.id || '').toLowerCase() === id) ||
                    (entries[0] && (entries[0].id || '').toLowerCase() === id
                      ? entries[0]
                      : undefined);
                  if (!match?.l) return [id, null] as const;
                  return [
                    id,
                    {
                      id,
                      title: match.l.trim(),
                      qid: match.qid || '',
                      q: match.q || '',
                      year: typeof match.y === 'number' ? match.y : undefined,
                      posterUrl: match.i?.imageUrl || '',
                      cast: match.s || '',
                    },
                  ] as const;
                } catch {
                  return [id, null] as const;
                }
              })
            );
            for (const [id, info] of settled) {
              items[id] = info;
            }
          }

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ items }));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 400;
          res.end(JSON.stringify({ items: {}, error: 'Bad request' }));
        }
      });
    },
  };
}

function trendingGamesDevPlugin(): Plugin {
  return {
    name: 'cue-trending-games-dev',
    configureServer(server) {
      server.middlewares.use('/api/trending-games', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const limitParam = Number(url.searchParams.get('limit') || '24');
          const rawMode = url.searchParams.get('mode');
          const mode: GameDiscoverMode =
            rawMode === 'anticipated' || rawMode === 'popular' ? rawMode : 'trending';
          const payload = await fetchTrendingGamesPayload(
            Number.isFinite(limitParam) ? limitParam : 24,
            mode
          );
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(payload));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ items: [] }));
        }
      });
    },
  };
}

function comicSeriesDevPlugin(): Plugin {
  return {
    name: 'cue-comic-series-dev',
    configureServer(server) {
      server.middlewares.use('/api/comic-series', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const wiki = url.searchParams.get('wiki') as ComicWikiSlug | null;
          const vol = url.searchParams.get('vol');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          if (url.searchParams.get('mode') === 'collection') {
            const limitParam = Number(url.searchParams.get('limit') || '100');
            const wikiHint =
              wiki === 'marvel' || wiki === 'dc' || wiki === 'imagecomics' ? wiki : undefined;
            const payload = await fetchComicCollectionIssuesPayload({
              title: url.searchParams.get('title') || '',
              isbn: url.searchParams.get('isbn') || undefined,
              overview: url.searchParams.get('overview') || undefined,
              publisher: url.searchParams.get('publisher') || undefined,
              wikiHint,
              pageTitleHint: url.searchParams.get('pageTitle') || undefined,
              limit: Number.isFinite(limitParam) ? limitParam : 100,
            });
            res.end(JSON.stringify(payload));
            return;
          }
          if (
            wiki &&
            (wiki === 'marvel' || wiki === 'dc' || wiki === 'imagecomics') &&
            vol
          ) {
            const limitParam = Number(url.searchParams.get('limit') || '60');
            const payload = await fetchComicSeriesIssuesPayload(
              wiki,
              vol,
              Number.isFinite(limitParam) ? limitParam : 60
            );
            res.end(JSON.stringify(payload));
            return;
          }
          if (url.searchParams.get('mode') === 'trending') {
            const limitParam = Number(url.searchParams.get('limit') || '18');
            const payload = await fetchTrendingComicSeriesPayload(
              Number.isFinite(limitParam) ? Math.max(6, Math.min(25, limitParam)) : 18
            );
            res.end(JSON.stringify(payload));
            return;
          }
          const q = (url.searchParams.get('q') || '').trim();
          const payload = await searchComicSeriesPayload(q);
          res.end(JSON.stringify(payload));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ items: [] }));
        }
      });
    },
  };
}

function healthDevPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'cue-health-dev',
    configureServer(server) {
      server.middlewares.use('/api/health', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const payload = await fetchLiveHealthPayload(env);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify(payload));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              status: 'outage',
              checkedAt: new Date().toISOString(),
              overallLatencyMs: 0,
              onlineCount: 0,
              totalCount: 6,
              services: [],
            })
          );
        }
      });
    },
  };
}

function tmdbDevPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'cue-tmdb-dev',
    configureServer(server) {
      server.middlewares.use('/api/tmdb', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const out = await handleTmdbProxyRequest(url.searchParams, env);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = out.status;
          res.end(JSON.stringify(out.body));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ configured: false, results: [] }));
        }
      });
    },
  };
}

function igdbDevPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'cue-igdb-dev',
    configureServer(server) {
      server.middlewares.use('/api/igdb', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const out = await handleIgdbProxyRequest(url.searchParams, env);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = out.status;
          res.end(JSON.stringify(out.body));
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ configured: false, items: [] }));
        }
      });
    },
  };
}

function gameChaptersDevPlugin(): Plugin {
  return {
    name: 'cue-game-chapters-dev',
    configureServer(server) {
      server.middlewares.use('/api/game-chapters', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'GET') {
          next();
          return;
        }
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          const out = await handleGameChaptersGet(new Request(url.toString()));
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = out.status;
          res.end(await out.text());
        } catch {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ found: false, chapters: [] }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      imdbResolveDevPlugin(),
      trendingGamesDevPlugin(),
      comicSeriesDevPlugin(),
      gameChaptersDevPlugin(),
      tmdbDevPlugin(env),
      igdbDevPlugin(env),
      healthDevPlugin(env),
    ],
  };
})
