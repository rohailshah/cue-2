import {
  COMIC_ISSUE_CACHE_VERSION,
  normalizeTitleKey,
  searchByIsbn,
  searchLiveMedia,
} from '../services/mediaApi';
import type { CueStoreState } from '../types';
import { resolveComicEditionCover } from './editions';

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

export interface LibraryRepairProgress {
  done: number;
  total: number;
  currentTitle: string;
}

export interface LibraryRepairSummary {
  scanned: number;
  healthy: number;
  brokenFound: number;
  repaired: number;
  clearedStaleComics: number;
  details: string[];
}

let cachedHealth: { ts: number; data: LiveHealthReport } | null = null;
const HEALTH_CACHE_MS = 60_000;

export async function fetchLiveHealth(force = false): Promise<LiveHealthReport | null> {
  if (!force && cachedHealth && Date.now() - cachedHealth.ts < HEALTH_CACHE_MS) {
    return cachedHealth.data;
  }
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    const data = (await res.json()) as LiveHealthReport;
    if (data && Array.isArray(data.services)) {
      cachedHealth = { ts: Date.now(), data };
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function checkImageLoads(url: string, timeoutMs = 4500): Promise<boolean> {
  if (!url || !/^https?:\/\/|^data:/i.test(url)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(img.naturalWidth > 2 && img.naturalHeight > 2);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(false);
      }
    };
    img.src = url;
  });
}

export async function scanAndRepairLibrary(
  state: CueStoreState,
  patchMediaMetadata: (
    kind: 'show' | 'anime' | 'movie' | 'read' | 'game',
    id: string,
    patch: {
      posterUrl?: string;
      backdropUrl?: string;
      coverUrl?: string;
      clearStaleIssues?: boolean;
    }
  ) => void,
  onProgress?: (p: LibraryRepairProgress) => void
): Promise<LibraryRepairSummary> {
  interface Candidate {
    kind: 'show' | 'anime' | 'movie' | 'read' | 'game';
    id: string;
    title: string;
    mediaType: 'tv' | 'anime' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
    url: string;
    isStaleComic?: boolean;
  }

  const candidates: Candidate[] = [];

  for (const id of state.showOrder) {
    const s = state.shows[id];
    if (!s || !state.showProgress[id]?.bookmarked) continue;
    candidates.push({
      kind: 'show',
      id,
      title: s.title,
      mediaType: 'tv',
      url: s.posterUrl,
    });
  }

  for (const id of state.animeOrder) {
    const a = state.animes[id];
    if (!a || !state.animeProgress[id]?.bookmarked) continue;
    candidates.push({
      kind: 'anime',
      id,
      title: a.title,
      mediaType: 'anime',
      url: a.posterUrl,
    });
  }

  for (const id of state.movieOrder) {
    const m = state.movies[id];
    if (!m || !state.movieProgress[id]) continue;
    candidates.push({
      kind: 'movie',
      id,
      title: m.title,
      mediaType: 'movie',
      url: m.posterUrl,
    });
  }

  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const prog = state.readProgress[id];
    if (!r || !prog?.bookmarked) continue;
    const activeCover = resolveComicEditionCover(r, prog.edition, prog);
    const isStaleComic = Boolean(
      r.format === 'comic' &&
        r.issueDetails &&
        Object.keys(r.issueDetails).length > 0 &&
        r.issueDetailsKey &&
        !r.issueDetailsKey.endsWith(`::${COMIC_ISSUE_CACHE_VERSION}`)
    );
    candidates.push({
      kind: 'read',
      id,
      title: r.title,
      mediaType: r.format,
      url: activeCover,
      isStaleComic,
    });
  }

  for (const id of state.gameOrder) {
    const g = state.games[id];
    if (!g || !state.gameProgress[id]?.bookmarked) continue;
    candidates.push({
      kind: 'game',
      id,
      title: g.title,
      mediaType: 'game',
      url: g.coverUrl,
    });
  }

  const total = candidates.length;
  let done = 0;
  let healthy = 0;
  let brokenFound = 0;
  let repaired = 0;
  let clearedStaleComics = 0;
  const details: string[] = [];

  const concurrency = 5;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (c) => {
        if (c.isStaleComic) {
          patchMediaMetadata('read', c.id, { clearStaleIssues: true });
          clearedStaleComics += 1;
          details.push(`Refreshed comic issue cache for ${c.title}`);
        }

        const ok = await checkImageLoads(c.url);
        if (ok) {
          healthy += 1;
        } else {
          brokenFound += 1;
          try {
            const hits = c.id.startsWith('isbn-')
              ? await searchByIsbn(c.id.slice(5))
              : await searchLiveMedia(c.title, c.mediaType, state.settings.tmdbApiKey);
            const targetKey = normalizeTitleKey(c.title);
            const match =
              hits.find((h) => normalizeTitleKey(h.title) === targetKey && h.posterUrl) ||
              hits.find((h) => h.posterUrl);
            if (match?.posterUrl && match.posterUrl !== c.url) {
              const replacementOk = await checkImageLoads(match.posterUrl, 3500);
              if (replacementOk) {
                if (c.kind === 'read' || c.kind === 'game') {
                  patchMediaMetadata(c.kind, c.id, {
                    coverUrl: match.posterUrl,
                    backdropUrl: match.backdropUrl || match.posterUrl,
                  });
                } else {
                  patchMediaMetadata(c.kind, c.id, {
                    posterUrl: match.posterUrl,
                    backdropUrl: match.backdropUrl || match.posterUrl,
                  });
                }
                repaired += 1;
                details.push(`Repaired cover for ${c.title}`);
              } else {
                details.push(`Cover unavailable for ${c.title}`);
              }
            } else {
              details.push(`No replacement cover found for ${c.title}`);
            }
          } catch {
            details.push(`Failed lookup for ${c.title}`);
          }
        }

        done += 1;
        onProgress?.({ done, total, currentTitle: c.title });
      })
    );
  }

  return {
    scanned: total,
    healthy,
    brokenFound,
    repaired,
    clearedStaleComics,
    details,
  };
}
