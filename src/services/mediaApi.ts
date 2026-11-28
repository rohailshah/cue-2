import type {
  Anime,
  CastMember,
  ComicEditionFormat,
  ComicEditionId,
  ComicEditionRecord,
  ComicIssueMeta,
  ComicWikiSlug,
  Episode,
  GameItem,
  GamePlatform,
  GeneralizedComicEditionId,
  Movie,
  ReadItem,
  Season,
  Show,
} from '../types';
import {
  classifyDetailedComicEdition,
  classifyRawComicEdition,
  getComicEditionFormatLabel,
  getKnownComicEditionSpec,
  mergeComicEditionCatalog,
} from '../utils/editions';
import {
  type ChapterSource,
  type ChapterUnit,
  KNOWN_GAME_CHAPTER_TITLES,
  lookupKnownGameChapters,
  normalizeGameTitleKey,
  parseChapterCountFromText,
} from '../utils/gameChapters';
import {
  buildFallbackGameItem,
  buildFallbackMovie,
  buildFallbackReadItem,
  buildFallbackShow,
  type ImportCandidate,
  type PreparedImportEntry,
  type ResolvedImdbTitle,
} from '../utils/mediaImport';
import {
  extractReadItemIsbn,
  extractSeriesTitleFromPageTitle,
  isCollectedComicItem,
  makeComicAtomicId,
} from '../utils/atoms';
import { resilientFetch as fetch } from '../utils/safeFetch';

export type SearchMediaFilter =
  | 'all'
  | 'watch'
  | 'read'
  | 'play'
  | 'tv'
  | 'movie'
  | 'anime'
  | 'manga'
  | 'comic'
  | 'novel'
  | 'game';

export interface LiveSearchResult {
  domain: 'watch' | 'read' | 'play';
  kind: 'show' | 'movie' | 'read' | 'game';
  id: string;
  source:
    | 'tvmaze'
    | 'itunes'
    | 'tmdb'
    | 'openlibrary'
    | 'anilist'
    | 'cheapshark'
    | 'igdb'
    | 'wikipedia'
    | 'comicseries';
  externalId: number | string;
  title: string;
  subtitle?: string;
  year: number;
  mediaType: 'tv' | 'anime' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
  genres: string[];
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  director?: string;
  runtime?: number;
  trailerUrl?: string;
  totalUnits?: number;
  totalUnitsEstimated?: boolean;
  comicKind?: 'series' | 'collection';
  comicRunLabel?: string;
  comicPublisher?: string;
  comicSeriesWiki?: ComicWikiSlug;
  comicSeriesVolTitle?: string;
  isbn?: string;
  editionCovers?: Partial<Record<ComicEditionId, string>>;
  editionIssueCounts?: Partial<Record<ComicEditionId, number>>;
  editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>;
  steamAppId?: number;
  igdbId?: number;
  franchise?: string;
  platforms?: string[];
  popularity?: number;
  popularityScore?: number;
  anilistFormat?: string;
  anilistEpisodes?: number;
}

/** Normalizes heterogeneous provider popularity metrics onto a 0..100 audience scale. */
export function computePopularityScore(item: LiveSearchResult): number {
  if (typeof item.popularityScore === 'number' && Number.isFinite(item.popularityScore)) {
    return Math.max(0, Math.min(100, item.popularityScore));
  }
  if (typeof item.popularity === 'number' && item.popularity > 0) {
    return Math.min(100, Math.round(Math.log10(Math.max(1, item.popularity)) * 16.5));
  }
  return 35;
}

const stripHtml = (html?: string | null): string =>
  html ? html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';

const NON_LATIN_REGEX =
  /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/;

function hasNonLatinScript(text: string): boolean {
  return NON_LATIN_REGEX.test(text);
}

export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MINOR_TITLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

const UPPERCASE_TITLE_TOKENS = new Set([
  'dc',
  'tpb',
  'tp',
  'hc',
  'ogn',
  'usa',
  'uk',
  'ny',
  'jla',
  'ii',
  'iii',
  'iv',
  'vi',
  'vii',
  'viii',
  'ix',
]);

function formatHyphenWord(word: string, forceCapitalize: boolean): string {
  const parts = word.split('-');
  return parts
    .map((part, pIdx) => {
      const m = part.match(/^([^A-Za-z0-9]*)([A-Za-z0-9'’]+)([^A-Za-z0-9]*)$/);
      if (!m) return part;
      const [, lead, core, trail] = m;
      const lower = core.toLowerCase();
      if (UPPERCASE_TITLE_TOKENS.has(lower)) return `${lead}${lower.toUpperCase()}${trail}`;
      if (!forceCapitalize && pIdx === 0 && MINOR_TITLE_WORDS.has(lower)) {
        return `${lead}${lower}${trail}`;
      }
      return `${lead}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${trail}`;
    })
    .join('-');
}

export function formatDisplayTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  const words = collapsed.split(' ');
  return words
    .map((word, idx) => {
      const prev = idx > 0 ? words[idx - 1] : '';
      const afterColonOrDash = /[:—–\-]$/.test(prev);
      const forceCap = idx === 0 || idx === words.length - 1 || afterColonOrDash;
      return formatHyphenWord(word, forceCap);
    })
    .join(' ');
}

function stripEditionAffixes(title: string): string {
  let cleaned = title.replace(/\([^)]*\)/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const next = cleaned
      .replace(
        /^(?:dc\s+compact(?:\s+comics)?|absolute|deluxe|omnibus|compendium|complete|essential|epic\s+collection)\s*[:\-–—]?\s+/i,
        ''
      )
      .replace(
        /(?:[:,\-–—\s]+)(?:vol\.?|volume|book|pt\.?|part)\s*(?:\d+|one|two|three|four|five|six|seven|eight|i{1,3}|iv|v)\b.*$/i,
        ''
      )
      .replace(
        /(?:[:,\-–—\s]+)(?:the\s+)?(?:(?:absolute|deluxe|omnibus|compendium|compact(?:\s+comics)?|collector'?s|anniversary|complete|ultimate|library|standard)\s+)?(?:hardcover|hc|softcover|tpb|trade\s+paperback|edition)\b.*$/i,
        ''
      )
      .replace(
        /(?:[:,\-–—\s]+)(?:the\s+)?(?:omnibus|compendium|absolute|deluxe|epic\s+collection|complete\s+collection)\b.*$/i,
        ''
      )
      .replace(/\s+#\d+\s*$/i, '')
      .trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned || title;
}

export function canonicalReadWorkKey(title: string): string {
  return normalizeTitleKey(stripEditionAffixes(title));
}

function recordVariantTag(
  target: Partial<Record<GeneralizedComicEditionId, string[]>>,
  ed: GeneralizedComicEditionId,
  tag?: string
) {
  if (!tag) return;
  const list = target[ed] || [];
  if (!list.includes(tag) && list.length < 3) {
    target[ed] = [...list, tag];
  }
}

const COMIC_WORK_HINTS = [
  'comic',
  'graphic novel',
  'superhero',
  'dc comics',
  'marvel',
  'cartoons and comics',
  'superman',
  'batman',
  'watchmen',
  'wonder woman',
  'justice league',
  'spider-man',
  'x-men',
  'avengers',
  'daredevil',
  'sandman',
  'invincible',
  'the flash',
  'supergirl',
  'kingdom come',
  'grant morrison',
  'geoff johns',
  'alan moore',
  'frank miller',
];

function extractQueryYear(query: string): { baseQuery: string; targetYear?: number } {
  const trimmed = query.replace(/\s+/g, ' ').trim();
  const matches = [...trimmed.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const without = trimmed.replace(last[0], '').replace(/\s+/g, ' ').trim();
    if (without.length >= 2) {
      return { baseQuery: without, targetYear: Number(last[1]) };
    }
  }
  return { baseQuery: trimmed };
}

function comicRunSpansYear(runLabel: string | undefined, targetYear: number): boolean {
  if (!runLabel) return false;
  const years = [...runLabel.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length === 0) return false;
  const start = years[0];
  const end = /present/i.test(runLabel) ? 9999 : (years[1] ?? start);
  return targetYear >= start && targetYear <= end;
}

function scoreResult(item: LiveSearchResult, query: string): number {
  const { baseQuery, targetYear } = extractQueryYear(query);
  const effectiveQuery = baseQuery || query;
  const qNorm = normalizeTitleKey(effectiveQuery);
  const tNorm = normalizeTitleKey(item.title);
  const qWords = qNorm.split(' ').filter(Boolean);
  const queryIsLatin = !hasNonLatinScript(effectiveQuery);
  const escapedQ = qNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasWholePhraseMatch =
    Boolean(escapedQ) && new RegExp(`(?:^|\\s)${escapedQ}(?:$|\\s)`).test(tNorm);

  let relScore = 0;
  if (qNorm && tNorm === qNorm) {
    relScore = 52;
  } else if (qNorm && tNorm.startsWith(qNorm)) {
    relScore = 42;
  } else if (hasWholePhraseMatch) {
    relScore = 39;
  } else if (qNorm && tNorm.includes(qNorm)) {
    relScore = 34;
  } else if (qWords.length > 0) {
    const matchedWords = qWords.filter((w) => tNorm.includes(w)).length;
    relScore =
      matchedWords === qWords.length
        ? 32
        : Math.round((matchedWords / qWords.length) * 26);
  }

  let score = relScore + computePopularityScore(item) * 1.15;

  if (targetYear) {
    if (item.year === targetYear) score += 65;
    else if (item.comicKind === 'series' && comicRunSpansYear(item.comicRunLabel, targetYear)) {
      score += 28;
    }
  }

  // Boost canonical Fandom comic series runs & omnibuses on creator-qualified queries ("X by Y")
  const byCreatorMatch = effectiveQuery.match(/^(.+?)\s+by\s+([a-z][a-z\s.&'-]{2,42})$/i);
  if (byCreatorMatch && item.source === 'comicseries') {
    const cNorm = normalizeTitleKey(byCreatorMatch[2].replace(/\b(?:omnibus|tpb|hc|vol\.?\s*\d+)\b/gi, ''));
    const dirNorm = normalizeTitleKey(item.director || '');
    if (cNorm && dirNorm && dirNorm.includes(cNorm)) {
      score += 48;
    } else {
      score += 22;
    }
  }

  if (queryIsLatin) {
    if (hasNonLatinScript(item.title)) score -= 80;
    else score += 15;
  }

  if (item.posterUrl) score += 8;

  if (item.anilistFormat) {
    if (item.anilistFormat === 'TV' || item.anilistFormat === 'MOVIE') {
      score += 8;
    } else if (
      item.anilistFormat === 'SPECIAL' ||
      item.anilistFormat === 'TV_SHORT' ||
      item.anilistFormat === 'MUSIC'
    ) {
      score -= 14;
    }
  }

  if (
    item.source === 'openlibrary' &&
    /\b(official guide|companion|trivia|encyclopedia|handbook|visual dictionary)\b/i.test(
      `${item.title} ${item.overview || ''}`
    ) &&
    !/\b(guide|companion|trivia|encyclopedia|handbook|dictionary)\b/i.test(query)
  ) {
    score -= 28;
  }

  return score;
}

function rankAndDedupeLiveResults(results: LiveSearchResult[], query: string): LiveSearchResult[] {
  const qWords = normalizeTitleKey(query)
    .split(' ')
    .filter((w) => w.length >= 2);
  const scored = results
    .map((item) => ({ item, score: scoreResult(item, query) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return computePopularityScore(b.item) - computePopularityScore(a.item);
    });

  const topScore = scored[0]?.score || 0;
  const seen = new Set<string>();
  const out: LiveSearchResult[] = [];

  for (const entry of scored) {
    const { item, score } = entry;
    // Filter out weak Open Library noise when strong primary matches exist
    if (item.source === 'openlibrary' && topScore >= 120 && qWords.length >= 2) {
      const hay = normalizeTitleKey(`${item.title} ${item.subtitle || ''}`);
      const matched = qWords.filter((w) => hay.includes(w)).length;
      if (matched < Math.ceil(qWords.length * 0.6)) continue;
      if (score < 95) continue;
    }

    const workKey =
      item.domain === 'read'
        ? item.comicKind === 'series'
          ? `read:series:${canonicalReadWorkKey(item.title)}:${item.year}`
          : item.source === 'comicseries' && item.comicKind === 'collection'
            ? `read:comiccol:${normalizeTitleKey(item.title)}`
            : item.mediaType === 'comic'
              ? `read:collection:${canonicalReadWorkKey(item.title)}`
              : `read:${canonicalReadWorkKey(item.title)}`
        : item.kind === 'show'
          ? `watch:show:${normalizeTitleKey(item.title)}`
          : `${item.domain}:${item.kind}:${normalizeTitleKey(item.title)}`;
    if (seen.has(workKey)) continue;
    seen.add(workKey);
    out.push(item);
  }
  return out;
}

function matchesMediaFilter(item: LiveSearchResult, mediaFilter: SearchMediaFilter): boolean {
  if (mediaFilter === 'all') return true;
  if (mediaFilter === 'watch' || mediaFilter === 'read' || mediaFilter === 'play') {
    return item.domain === mediaFilter;
  }
  if (mediaFilter === 'tv' || mediaFilter === 'anime') {
    return item.mediaType === 'tv' || item.mediaType === 'anime';
  }
  return item.mediaType === mediaFilter;
}

const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10765: 'Sci-Fi & Fantasy',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

function mapTmdbGenres(
  genreIds?: number[],
  originalLang?: string,
  isMovie = false
): string[] {
  const isAnime = !isMovie && genreIds?.includes(16) && originalLang === 'ja';
  const mapped: string[] = isAnime ? ['Anime'] : [];
  for (const id of genreIds || []) {
    const label = TMDB_GENRE_MAP[id];
    if (label && !mapped.includes(label)) {
      mapped.push(label);
    }
    if (mapped.length >= 3) break;
  }
  if (mapped.length > 0) return mapped;
  return isMovie ? ['Feature Film'] : ['Series'];
}

let serverTmdbStatusPromise: Promise<boolean> | null = null;
let serverIgdbStatusPromise: Promise<boolean> | null = null;

export function checkServerTmdbConfigured(): Promise<boolean> {
  if (!serverTmdbStatusPromise) {
    serverTmdbStatusPromise = fetch('/api/tmdb?action=status', {
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ configured?: boolean }>) : { configured: false }))
      .then((d) => Boolean(d.configured))
      .catch(() => false);
  }
  return serverTmdbStatusPromise;
}

export function checkServerIgdbConfigured(): Promise<boolean> {
  if (!serverIgdbStatusPromise) {
    serverIgdbStatusPromise = fetch('/api/igdb?action=status', {
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ configured?: boolean }>) : { configured: false }))
      .then((d) => Boolean(d.configured))
      .catch(() => false);
  }
  return serverIgdbStatusPromise;
}

async function isTmdbAvailable(tmdbApiKey?: string): Promise<boolean> {
  if (tmdbApiKey && tmdbApiKey.trim().length > 8) return true;
  return checkServerTmdbConfigured();
}

export async function searchLiveMedia(
  query: string,
  mediaFilter: SearchMediaFilter = 'all',
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const directIsbn = extractIsbnFromInput(trimmed);
  if (directIsbn) {
    return searchByIsbn(directIsbn);
  }

  const tasks: Promise<LiveSearchResult[]>[] = [];
  const wantsWatch =
    mediaFilter === 'all' ||
    mediaFilter === 'watch' ||
    mediaFilter === 'tv' ||
    mediaFilter === 'movie' ||
    mediaFilter === 'anime';
  const wantsRead =
    mediaFilter === 'all' ||
    mediaFilter === 'read' ||
    mediaFilter === 'manga' ||
    mediaFilter === 'comic' ||
    mediaFilter === 'novel';
  const wantsPlay = mediaFilter === 'all' || mediaFilter === 'play' || mediaFilter === 'game';

  if (wantsWatch) {
    const useTmdb = await isTmdbAvailable(tmdbApiKey);
    if (useTmdb) {
      tasks.push(
        searchTmdbMulti(trimmed, tmdbApiKey?.trim())
          .then(async (hits) => {
            if (hits.length > 0) return hits;
            const fallback: LiveSearchResult[] = [];
            if (
              mediaFilter === 'all' ||
              mediaFilter === 'watch' ||
              mediaFilter === 'tv' ||
              mediaFilter === 'anime'
            ) {
              fallback.push(...(await searchTvMaze(trimmed)));
            }
            if (mediaFilter === 'all' || mediaFilter === 'watch' || mediaFilter === 'movie') {
              fallback.push(...(await searchItunesMovies(trimmed)));
            }
            return fallback;
          })
          .catch(async () => {
            const fallback: LiveSearchResult[] = [];
            if (
              mediaFilter === 'all' ||
              mediaFilter === 'watch' ||
              mediaFilter === 'tv' ||
              mediaFilter === 'anime'
            ) {
              fallback.push(...(await searchTvMaze(trimmed)));
            }
            if (mediaFilter === 'all' || mediaFilter === 'watch' || mediaFilter === 'movie') {
              fallback.push(...(await searchItunesMovies(trimmed)));
            }
            return fallback;
          })
      );
    } else {
      if (
        mediaFilter === 'all' ||
        mediaFilter === 'watch' ||
        mediaFilter === 'tv' ||
        mediaFilter === 'anime'
      ) {
        tasks.push(searchTvMaze(trimmed));
      }
      if (mediaFilter === 'all' || mediaFilter === 'watch' || mediaFilter === 'movie') {
        tasks.push(searchItunesMovies(trimmed));
      }
    }
  }

  if (wantsRead) {
    const { baseQuery } = extractQueryYear(trimmed);
    if (mediaFilter === 'all' || mediaFilter === 'read' || mediaFilter === 'comic') {
      tasks.push(searchComicSeries(trimmed));
      tasks.push(searchOpenLibrary(baseQuery || trimmed));
    } else if (mediaFilter === 'novel') {
      tasks.push(searchOpenLibrary(baseQuery || trimmed));
    }
    if (
      mediaFilter === 'all' ||
      mediaFilter === 'read' ||
      mediaFilter === 'manga' ||
      mediaFilter === 'novel'
    ) {
      tasks.push(searchAniListManga(baseQuery || trimmed));
    }
  }

  if (wantsPlay) {
    tasks.push(searchGames(trimmed));
  }

  const settled = await Promise.allSettled(tasks);
  const combined: LiveSearchResult[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      combined.push(...res.value.filter((item) => matchesMediaFilter(item, mediaFilter)));
    }
  }
  return rankAndDedupeLiveResults(combined, trimmed);
}

export interface TrendingByDomain {
  watch: LiveSearchResult[];
  read: LiveSearchResult[];
  play: LiveSearchResult[];
}

const trendingCache = new Map<string, { ts: number; data: TrendingByDomain }>();
const categoryTrendingCache = new Map<string, { ts: number; items: LiveSearchResult[] }>();
const TRENDING_TTL_MS = 10 * 60 * 1000;

function getRecentDateWindow(days = 185) {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 86400 * 1000);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);
  return {
    now,
    cutoffDate,
    cutoffIso,
    cutoffYmd: Number(cutoffIso.replace(/-/g, '')),
    todayIso: now.toISOString().slice(0, 10),
    currentYear: now.getUTCFullYear(),
  };
}

function upscaleAppleArtwork(rawUrl: string): string {
  if (!rawUrl) return '';
  return rawUrl.replace(/\/\d+x\d+bb\.(?:png|jpg|webp)$/i, '/600x900bb.jpg');
}

function cleanAppleTitle(raw: string): string {
  return raw.replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim() || raw;
}

function parseAppleRssEntries(
  entries: Array<{
    id?: { attributes?: { 'im:id'?: string } };
    'im:name'?: { label?: string };
    'im:artist'?: { label?: string };
    'im:image'?: Array<{ label?: string }>;
    'im:releaseDate'?: { label?: string };
    category?: { attributes?: { label?: string } };
    summary?: { label?: string };
  }>,
  cutoffDate: Date
) {
  return entries
    .map((e) => {
      const relStr = e['im:releaseDate']?.label || '';
      const relDate = relStr ? new Date(relStr) : null;
      const isRecent = relDate && !Number.isNaN(relDate.getTime()) && relDate >= cutoffDate;
      return { e, relDate, isRecent: Boolean(isRecent) };
    })
    .filter((x) => x.e['im:name']?.label && (x.e['im:image'] || []).length > 0);
}

function interleaveGroups<T>(groups: T[][], limit: number, keyFn: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  const cursors = groups.map(() => 0);

  while (out.length < limit) {
    let advanced = false;
    for (let gIdx = 0; gIdx < groups.length && out.length < limit; gIdx++) {
      const list = groups[gIdx];
      while (cursors[gIdx] < list.length) {
        const candidate = list[cursors[gIdx]];
        cursors[gIdx] += 1;
        const k = keyFn(candidate);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(candidate);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return out;
}

async function fetchTrendingMovies(
  limit: number,
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const useTmdb = await isTmdbAvailable(tmdbApiKey);

  if (useTmdb) {
    try {
      const userKey = tmdbApiKey?.trim();
      const url =
        userKey && userKey.length > 8
          ? `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&primary_release_date.gte=${win.cutoffIso}&primary_release_date.lte=${win.todayIso}&api_key=${encodeURIComponent(
              userKey
            )}`
          : `/api/tmdb?action=trending-movies&gte=${win.cutoffIso}&lte=${win.todayIso}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{
            id: number;
            title?: string;
            release_date?: string;
            poster_path?: string;
            backdrop_path?: string;
            overview?: string;
            vote_average?: number;
            genre_ids?: number[];
            popularity?: number;
          }>;
        };
        const out: LiveSearchResult[] = [];
        for (const r of data.results || []) {
          if (!r.poster_path || !r.title) continue;
          const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
          const backdrop = r.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
            : poster;
          out.push({
            domain: 'watch',
            kind: 'movie',
            id: `tmdb-movie-${r.id}`,
            source: 'tmdb',
            externalId: r.id,
            title: r.title,
            year: r.release_date ? Number(r.release_date.slice(0, 4)) : win.currentYear,
            mediaType: 'movie',
            genres: mapTmdbGenres(r.genre_ids, undefined, true),
            rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 7.8,
            posterUrl: poster,
            backdropUrl: backdrop,
            overview: r.overview || '',
            popularity: r.popularity ? r.popularity * 1000 : 30000,
          });
          if (out.length >= limit) break;
        }
        if (out.length > 0) return out;
      }
    } catch {
      // fall through to iTunes RSS
    }
  }

  try {
    const res = await fetch('https://itunes.apple.com/us/rss/topmovies/limit=40/json');
    if (!res.ok) return [];
    const data = (await res.json()) as {
      feed?: {
        entry?: Array<{
          id?: { attributes?: { 'im:id'?: string } };
          'im:name'?: { label?: string };
          'im:artist'?: { label?: string };
          'im:image'?: Array<{ label?: string }>;
          'im:releaseDate'?: { label?: string };
          category?: { attributes?: { label?: string } };
          summary?: { label?: string };
        }>;
      };
    };
    const parsed = parseAppleRssEntries(data.feed?.entry || [], win.cutoffDate);
    const recentFirst = [
      ...parsed.filter((x) => x.isRecent),
      ...parsed.filter(
        (x) => !x.isRecent && x.relDate && x.relDate.getUTCFullYear() >= win.currentYear
      ),
    ];
    const seen = new Set<string>();
    const out: LiveSearchResult[] = [];
    for (const { e, relDate } of recentFirst) {
      const id = e.id?.attributes?.['im:id'] || '';
      const rawTitle = e['im:name']?.label || '';
      const title = cleanAppleTitle(rawTitle);
      const rawImg = e['im:image']?.[e['im:image'].length - 1]?.label || '';
      const poster = upscaleAppleArtwork(rawImg);
      const key = normalizeTitleKey(title);
      if (!id || !title || !poster || seen.has(key)) continue;
      seen.add(key);
      out.push({
        domain: 'watch',
        kind: 'movie',
        id: `itunes-${id}`,
        source: 'itunes',
        externalId: Number(id) || id,
        title,
        subtitle: e['im:artist']?.label || 'Feature Film',
        year: relDate ? relDate.getUTCFullYear() : win.currentYear,
        mediaType: 'movie',
        genres: [e.category?.attributes?.label || 'Feature Film'],
        rating: 8.0,
        posterUrl: poster,
        backdropUrl: poster,
        overview: e.summary?.label || `${title} — trending release.`,
        director: e['im:artist']?.label || 'Feature Film',
        runtime: 125,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchTrendingShows(
  limit: number,
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const useTmdb = await isTmdbAvailable(tmdbApiKey);

  if (useTmdb) {
    try {
      const userKey = tmdbApiKey?.trim();
      const url =
        userKey && userKey.length > 8
          ? `https://api.themoviedb.org/3/trending/tv/week?language=en-US&api_key=${encodeURIComponent(
              userKey
            )}`
          : '/api/tmdb?action=trending-tv';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{
            id: number;
            name?: string;
            first_air_date?: string;
            poster_path?: string;
            backdrop_path?: string;
            overview?: string;
            vote_average?: number;
            original_language?: string;
            genre_ids?: number[];
            popularity?: number;
          }>;
        };
        const out: LiveSearchResult[] = [];
        for (const r of data.results || []) {
          if (!r.poster_path || !r.name) continue;
          const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
          const backdrop = r.backdrop_path
            ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
            : poster;
          out.push({
            domain: 'watch',
            kind: 'show',
            id: `tmdb-tv-${r.id}`,
            source: 'tmdb',
            externalId: r.id,
            title: r.name,
            year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : win.currentYear,
            mediaType: 'tv',
            genres: mapTmdbGenres(r.genre_ids, r.original_language, false),
            rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 7.9,
            posterUrl: poster,
            backdropUrl: backdrop,
            overview: r.overview || '',
            popularity: r.popularity ? r.popularity * 1000 : 30000,
          });
          if (out.length >= limit) break;
        }
        if (out.length > 0) return out;
      }
    } catch {
      // fall through to TVMaze
    }
  }

  try {
    const dates = [0, 1, 2, 3, 4].map((offset) => {
      const d = new Date(Date.now() - offset * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    });
    const responses = await Promise.allSettled(
      dates.map((dateStr) => fetch(`https://api.tvmaze.com/schedule/web?date=${dateStr}`))
    );

    type TvMazeWebEntry = {
      _embedded?: {
        show?: {
          id: number;
          name?: string;
          language?: string;
          type?: string;
          genres?: string[];
          premiered?: string;
          weight?: number;
          rating?: { average?: number };
          image?: { medium?: string; original?: string };
          summary?: string;
          averageRuntime?: number;
        };
      };
    };

    const byId = new Map<number, LiveSearchResult & { isNewPremiere: boolean; weight: number }>();
    for (const r of responses) {
      if (r.status !== 'fulfilled' || !r.value.ok) continue;
      const list = (await r.value.json()) as TvMazeWebEntry[];
      for (const ep of list) {
        const s = ep._embedded?.show;
        if (!s || !s.id || !s.name || byId.has(s.id)) continue;
        if (hasNonLatinScript(s.name)) continue;
        if (s.language && s.language !== 'English' && s.language !== 'Japanese') continue;
        const poster = s.image?.medium || s.image?.original || '';
        if (!poster) continue;
        const premiered = s.premiered || '';
        const isNewPremiere = Boolean(premiered && premiered >= win.cutoffIso);
        const weight = s.weight || 40;
        byId.set(s.id, {
          domain: 'watch',
          kind: 'show',
          id: `tvmaze-${s.id}`,
          source: 'tvmaze',
          externalId: s.id,
          title: s.name,
          year: premiered ? Number(premiered.slice(0, 4)) : win.currentYear,
          mediaType: 'tv',
          genres: s.genres?.length ? s.genres.slice(0, 2) : ['Series'],
          rating: s.rating?.average || 7.9,
          posterUrl: poster,
          backdropUrl: s.image?.original || poster,
          overview: stripHtml(s.summary) || `${s.name} streaming series.`,
          runtime: s.averageRuntime || 45,
          popularityScore: Math.min(96, Math.round(weight * 0.9)),
          isNewPremiere,
          weight,
        });
      }
    }

    return Array.from(byId.values())
      .sort((a, b) => {
        if (a.isNewPremiere !== b.isNewPremiere) return a.isNewPremiere ? -1 : 1;
        return b.weight - a.weight;
      })
      .slice(0, limit)
      .map(({ isNewPremiere: _n, weight: _w, ...rest }) => rest);
  } catch {
    return [];
  }
}

async function fetchTrendingManga(limit: number): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(190);

  const queryAniListManga = async (
    gql: string
  ): Promise<LiveSearchResult[]> => {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: {
          Page?: {
            media?: Array<{
              id: number;
              format?: string;
              title?: { english?: string; romaji?: string };
              coverImage?: { extraLarge?: string; large?: string };
              bannerImage?: string;
              chapters?: number;
              startDate?: { year?: number };
              genres?: string[];
              averageScore?: number;
              popularity?: number;
              description?: string;
              staff?: { nodes?: Array<{ name?: { full?: string } }> };
            }>;
          };
        };
      };
      return (json.data?.Page?.media || [])
        .map((m): LiveSearchResult | null => {
          const title = m.title?.english || m.title?.romaji || '';
          const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
          if (
            !title ||
            !cover ||
            hasNonLatinScript(title) ||
            /\b(?:vol\.?\s*\d+|volume\s+\d+)\b/i.test(title)
          ) {
            return null;
          }
          const author = m.staff?.nodes?.[0]?.name?.full || 'Mangaka';
          return {
            domain: 'read',
            kind: 'read',
            id: `al-manga-${m.id}`,
            source: 'anilist',
            externalId: m.id,
            title,
            subtitle: author,
            year: m.startDate?.year || win.currentYear,
            mediaType: 'manga',
            genres: m.genres?.length ? m.genres.slice(0, 2) : ['Manga'],
            rating: m.averageScore ? Number((m.averageScore / 20).toFixed(1)) : 4.7,
            posterUrl: cover,
            backdropUrl: m.bannerImage || cover,
            overview: stripHtml(m.description) || `${title} manga series.`,
            director: author,
            totalUnits: m.chapters || 80,
            totalUnitsEstimated: !m.chapters,
            popularity: m.popularity || 0,
          };
        })
        .filter((x): x is LiveSearchResult => Boolean(x));
    } catch {
      return [];
    }
  };

  const releasingGql =
    'query{Page(perPage:24){media(type:MANGA,format:MANGA,status:RELEASING,sort:[TRENDING_DESC,POPULARITY_DESC]){id format title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore popularity description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}';
  const primary = await queryAniListManga(releasingGql);

  const out: LiveSearchResult[] = [];
  const seen = new Set<string>();
  for (const item of primary) {
    const key = canonicalReadWorkKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) return out;
  }

  const fallbackGql =
    'query{Page(perPage:16){media(type:MANGA,format:MANGA,sort:[TRENDING_DESC]){id format title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore popularity description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}';
  const secondary = await queryAniListManga(fallbackGql);
  for (const item of secondary) {
    const key = canonicalReadWorkKey(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchTrendingComics(limit: number, targetYear?: number): Promise<LiveSearchResult[]> {
  if (!targetYear) {
    try {
      const res = await fetch(
        `/api/comic-series?mode=trending&limit=${Math.max(12, Math.min(24, limit))}&v=4`,
        { signal: AbortSignal.timeout(9500) }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            wiki: 'marvel' | 'dc' | 'imagecomics';
            volTitle: string;
            volNumber: number;
            title: string;
            publisher: string;
            startYear: number;
            isOngoing: boolean;
            runLabel: string;
            issueCount: number;
            coverUrl: string;
            creator: string;
            genres: string[];
            overview: string;
          }>;
        };
        const mapped: LiveSearchResult[] = (data.items || [])
          .filter((it) => it.title && it.coverUrl)
          .map((it) => ({
            domain: 'read' as const,
            kind: 'read' as const,
            id: it.id,
            source: 'comicseries' as const,
            externalId: it.volTitle,
            title: it.title,
            subtitle: `${it.runLabel} · ${it.publisher} · ${it.issueCount} ${
              it.issueCount === 1 ? 'issue' : 'issues'
            }`,
            year: it.startYear,
            mediaType: 'comic' as const,
            comicKind: 'series' as const,
            comicRunLabel: it.runLabel,
            comicPublisher: it.publisher,
            comicSeriesWiki: it.wiki,
            comicSeriesVolTitle: it.volTitle,
            genres: it.genres.length > 0 ? it.genres : ['Superhero'],
            rating: 4.7,
            posterUrl: it.coverUrl,
            backdropUrl: it.coverUrl,
            overview: it.overview,
            director: it.creator || it.publisher,
            totalUnits: it.issueCount,
            popularityScore: it.isOngoing ? 92 : 84,
          }))
          .slice(0, limit);
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // fall through to Open Library fallback
    }
  }

  const win = getRecentDateWindow(185);
  const queryYear = targetYear || win.currentYear;
  const fields =
    'key,title,subtitle,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median';
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
    `publisher:("DC Comics" OR "Marvel" OR "Image Comics" OR "BOOM! Studios" OR "Dark Horse") first_publish_year:${queryYear}`
  )}&language=eng&limit=45&fields=${fields}`;

  try {
    const r = await fetch(url);
    const docs: OpenLibraryDoc[] = r.ok
      ? (((await r.json()) as { docs?: OpenLibraryDoc[] }).docs || [])
      : [];

    const out: LiveSearchResult[] = [];
    const seen = new Set<string>();
    for (const d of docs) {
      if (!d.title || !d.key) continue;
      const fullTitle = formatDisplayTitle(combinedOpenLibraryTitle(d));
      if (!fullTitle || hasNonLatinScript(fullTitle)) continue;
      if (
        /\b(coloring book|activity book|study guide|playfulness|in comics|comics in|transnational|torah|anthology|tpb|trade paperback|vol\.?\s*\d+|volume\s+\d+|omnibus|compendium|hardcover|hc|box set|facsimile)\b/i.test(
          fullTitle
        )
      ) {
        continue;
      }

      const isbn13 = (d.isbn || [])
        .map((s) => s.replace(/[^0-9X]/gi, '').toUpperCase())
        .find((s) => /^97[89]\d{10}$/.test(s));
      const hasPrhCover = Boolean(
        isbn13 && PRH_COMIC_ISBN_PREFIXES.some((p) => isbn13.startsWith(p))
      );
      if (!hasPrhCover && (!d.cover_i || d.cover_i <= 0)) continue;

      const cover = resolveOpenLibraryCoverFromIsbn(d.isbn, d.cover_i);
      if (!cover) continue;

      const workKey = canonicalReadWorkKey(fullTitle);
      if (seen.has(workKey)) continue;
      seen.add(workKey);

      const cleanKey = d.key.replace('/works/', '');
      const author = d.author_name?.[0] || d.publisher?.[0] || 'Comics';
      const inferredIssues =
        parseCollectedIssueCount(d.subtitle, d.number_of_pages_median) ?? 6;

      out.push({
        domain: 'read',
        kind: 'read',
        id: `ol-${cleanKey}`,
        source: 'openlibrary',
        externalId: cleanKey,
        title: fullTitle,
        subtitle: author,
        year: d.first_publish_year || queryYear,
        mediaType: 'comic',
        genres: ['Comics'],
        rating: 4.6,
        posterUrl: cover,
        backdropUrl: cover,
        overview: d.publisher?.[0]
          ? `${fullTitle} (${d.first_publish_year || queryYear}) · ${d.publisher[0]}.`
          : `${fullTitle} by ${author}.`,
        director: author,
        totalUnits: inferredIssues,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchTrendingNovels(limit: number): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  try {
    const [ficRes, topRes] = await Promise.allSettled([
      fetch('https://itunes.apple.com/us/rss/topebooks/limit=35/genre=9031/json'),
      fetch('https://itunes.apple.com/us/rss/topebooks/limit=35/json'),
    ]);

    type AppleBookEntry = {
      id?: { attributes?: { 'im:id'?: string } };
      'im:name'?: { label?: string };
      'im:artist'?: { label?: string };
      'im:image'?: Array<{ label?: string }>;
      'im:releaseDate'?: { label?: string };
      category?: { attributes?: { label?: string } };
      summary?: { label?: string };
    };

    const rawEntries: AppleBookEntry[] = [];
    for (const r of [ficRes, topRes]) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const json = (await r.value.json()) as { feed?: { entry?: AppleBookEntry[] } };
        rawEntries.push(...(json.feed?.entry || []));
      }
    }

    const parsed = parseAppleRssEntries(rawEntries, win.cutoffDate).filter(
      (x) =>
        x.isRecent &&
        x.e.category?.attributes?.label !== 'Manga' &&
        x.e.category?.attributes?.label !== 'Comics & Graphic Novels'
    );

    const seen = new Set<string>();
    const out: LiveSearchResult[] = [];
    for (const { e, relDate } of parsed) {
      const id = e.id?.attributes?.['im:id'] || '';
      const rawTitle = (e['im:name']?.label || '').trim();
      const title = cleanAppleTitle(rawTitle);
      const cover = upscaleAppleArtwork(
        e['im:image']?.[e['im:image'].length - 1]?.label || ''
      );
      const key = canonicalReadWorkKey(title);
      if (
        !id ||
        !title ||
        !cover ||
        hasNonLatinScript(title) ||
        /\b(?:vol\.?\s*\d+|volume\s+\d+|tpb|omnibus|box set|manga)\b/i.test(title) ||
        seen.has(key)
      ) {
        continue;
      }
      seen.add(key);
      const author = e['im:artist']?.label || 'Author';
      out.push({
        domain: 'read',
        kind: 'read',
        id: `itunes-book-${id}`,
        source: 'openlibrary',
        externalId: id,
        title,
        subtitle: author,
        year: relDate ? relDate.getUTCFullYear() : win.currentYear,
        mediaType: 'novel',
        genres: [e.category?.attributes?.label || 'Fiction'],
        rating: 4.5,
        posterUrl: cover,
        backdropUrl: cover,
        overview: e.summary?.label || `${title} by ${author}.`,
        director: author,
        totalUnits: 24,
        totalUnitsEstimated: true,
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchGamesByMode(
  limit: number,
  mode: 'trending' | 'anticipated' | 'popular' = 'trending'
): Promise<LiveSearchResult[]> {
  try {
    if (await checkServerIgdbConfigured()) {
      const igdbRes = await fetch(
        `/api/igdb?action=discover&mode=${mode}&limit=${Math.max(12, Math.min(30, limit))}`,
        { signal: AbortSignal.timeout(9000) }
      );
      if (igdbRes.ok) {
        const igdbJson = (await igdbRes.json()) as {
          configured?: boolean;
          items?: Array<{
            id: string;
            igdbId: number;
            title: string;
            year: number;
            rating: number;
            posterUrl: string;
            backdropUrl: string;
            overview: string;
            developer?: string;
            platforms?: string[];
            genres?: string[];
            franchise?: string;
            subtitle?: string;
            popularityScore?: number;
          }>;
        };
        if (igdbJson.configured && Array.isArray(igdbJson.items) && igdbJson.items.length > 0) {
          return igdbJson.items.slice(0, limit).map((g) => ({
            domain: 'play',
            kind: 'game',
            id: g.id,
            source: 'igdb',
            externalId: g.igdbId,
            igdbId: g.igdbId,
            title: g.title,
            subtitle: g.subtitle || g.platforms?.slice(0, 2).join(' · ') || 'Video Game',
            year: g.year,
            mediaType: 'game',
            genres: g.genres?.length ? g.genres : ['Video Game'],
            rating: g.rating,
            posterUrl: g.posterUrl,
            backdropUrl: g.backdropUrl || g.posterUrl,
            overview: g.overview,
            director: g.developer,
            franchise: g.franchise,
            platforms: g.platforms,
            popularityScore: g.popularityScore,
          }));
        }
      }
    }
  } catch {
    // fall through to Steam + Metacritic feed
  }

  try {
    const res = await fetch(
      `/api/trending-games?mode=${mode}&limit=${Math.max(12, Math.min(30, limit))}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        appId?: number;
        title: string;
        year: number;
        rating: number;
        posterUrl: string;
        backdropUrl: string;
        overview: string;
        platforms?: string[];
        genres?: string[];
        subtitle?: string;
      }>;
    };
    return (data.items || [])
      .filter((g) => g.title && g.posterUrl && (g.id || g.appId))
      .slice(0, limit)
      .map((g) => ({
        domain: 'play',
        kind: 'game',
        id: g.id || `steam-${g.appId}`,
        source: g.appId ? 'cheapshark' : 'wikipedia',
        externalId: g.appId || g.id || g.title,
        steamAppId: g.appId,
        title: g.title,
        subtitle: g.subtitle || (g.platforms?.slice(0, 2).join(' · ') || 'Video Game'),
        year: g.year,
        mediaType: 'game',
        genres: g.genres?.length ? g.genres : ['Video Game'],
        rating: g.rating,
        posterUrl: g.posterUrl,
        backdropUrl: g.backdropUrl || g.posterUrl,
        overview: g.overview,
        platforms: g.platforms,
      }));
  } catch {
    return [];
  }
}

async function fetchTrendingGames(limit: number): Promise<LiveSearchResult[]> {
  return fetchGamesByMode(limit, 'trending');
}

export interface DiscoverRail {
  id: string;
  title: string;
  domain: 'all' | 'watch' | 'read' | 'play';
  showMediaBadge: boolean;
  items: LiveSearchResult[];
}

const discoverAllCache = new Map<string, { ts: number; rails: DiscoverRail[] }>();
const discoverDomainCache = new Map<string, { ts: number; rails: DiscoverRail[] }>();

function excludeSeenWorkKeys(items: LiveSearchResult[], excludeKeys: Set<string>): LiveSearchResult[] {
  return items.filter((item) => {
    const key =
      item.domain === 'read'
        ? `read:${canonicalReadWorkKey(item.title)}`
        : `${item.domain}:${normalizeTitleKey(item.title)}`;
    return !excludeKeys.has(key);
  });
}

function addWorkKeysToSet(items: LiveSearchResult[], target: Set<string>): void {
  for (const item of items) {
    const key =
      item.domain === 'read'
        ? `read:${canonicalReadWorkKey(item.title)}`
        : `${item.domain}:${normalizeTitleKey(item.title)}`;
    target.add(key);
  }
}

async function fetchAnticipatedWatch(
  limit: number,
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const useTmdb = await isTmdbAvailable(tmdbApiKey);
  const userKey = tmdbApiKey?.trim();

  const tvTask = (async (): Promise<LiveSearchResult[]> => {
    if (useTmdb) {
      try {
        const url =
          userKey && userKey.length > 8
            ? `https://api.themoviedb.org/3/discover/tv?sort_by=popularity.desc&first_air_date.gte=${win.todayIso}&language=en-US&page=1&api_key=${encodeURIComponent(
                userKey
              )}`
            : `/api/tmdb?action=upcoming-tv&gte=${win.todayIso}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{
              id: number;
              name?: string;
              first_air_date?: string;
              poster_path?: string;
              backdrop_path?: string;
              overview?: string;
              vote_average?: number;
              original_language?: string;
              genre_ids?: number[];
            }>;
          };
          const out: LiveSearchResult[] = [];
          for (const r of data.results || []) {
            if (!r.poster_path || !r.name) continue;
            const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
            out.push({
              domain: 'watch',
              kind: 'show',
              id: `tmdb-tv-${r.id}`,
              source: 'tmdb',
              externalId: r.id,
              title: r.name,
              year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : win.currentYear + 1,
              mediaType: 'tv',
              genres: mapTmdbGenres(r.genre_ids, r.original_language, false),
              rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 8.0,
              posterUrl: poster,
              backdropUrl: r.backdrop_path
                ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
                : poster,
              overview: r.overview || `${r.name} — upcoming series.`,
            });
          }
          if (out.length > 0) return out;
        }
      } catch {
        // fall through to TVMaze
      }
    }

    try {
      const dates = [7, 14, 21, 30].map((offset) =>
        new Date(Date.now() + offset * 86400 * 1000).toISOString().slice(0, 10)
      );
      const responses = await Promise.allSettled(
        dates.map((d) => fetch(`https://api.tvmaze.com/schedule/web?date=${d}`))
      );
      const byId = new Map<number, LiveSearchResult>();
      for (const r of responses) {
        if (r.status !== 'fulfilled' || !r.value.ok) continue;
        const list = (await r.value.json()) as Array<{
          _embedded?: {
            show?: {
              id: number;
              name?: string;
              language?: string;
              type?: string;
              genres?: string[];
              premiered?: string;
              weight?: number;
              rating?: { average?: number };
              image?: { medium?: string; original?: string };
              summary?: string;
              averageRuntime?: number;
            };
          };
        }>;
        for (const ep of list) {
          const s = ep._embedded?.show;
          if (!s || !s.id || !s.name || byId.has(s.id)) continue;
          if (hasNonLatinScript(s.name)) continue;
          if (s.language && s.language !== 'English' && s.language !== 'Japanese') continue;
          if ((s.weight || 0) < 35) continue;
          if (s.premiered && s.premiered < win.cutoffIso) continue;
          const poster = s.image?.medium || s.image?.original || '';
          if (!poster) continue;
          byId.set(s.id, {
            domain: 'watch',
            kind: 'show',
            id: `tvmaze-${s.id}`,
            source: 'tvmaze',
            externalId: s.id,
            title: s.name,
            year: s.premiered ? Number(s.premiered.slice(0, 4)) : win.currentYear + 1,
            mediaType: 'tv',
            genres: s.genres?.length ? s.genres.slice(0, 2) : ['Series'],
            rating: s.rating?.average || 8.0,
            posterUrl: poster,
            backdropUrl: s.image?.original || poster,
            overview: stripHtml(s.summary) || `${s.name} — upcoming series.`,
            runtime: s.averageRuntime || 45,
          });
        }
      }
      return Array.from(byId.values());
    } catch {
      return [];
    }
  })();

  const moviesTask = (async (): Promise<LiveSearchResult[]> => {
    if (useTmdb) {
      try {
        const url =
          userKey && userKey.length > 8
            ? `https://api.themoviedb.org/3/movie/upcoming?language=en-US&page=1&api_key=${encodeURIComponent(
                userKey
              )}`
            : '/api/tmdb?action=upcoming-movies';
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{
              id: number;
              title?: string;
              release_date?: string;
              poster_path?: string;
              backdrop_path?: string;
              overview?: string;
              vote_average?: number;
              genre_ids?: number[];
            }>;
          };
          const out: LiveSearchResult[] = [];
          for (const r of data.results || []) {
            if (!r.poster_path || !r.title) continue;
            if (r.release_date && r.release_date <= win.todayIso) continue;
            const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
            out.push({
              domain: 'watch',
              kind: 'movie',
              id: `tmdb-movie-${r.id}`,
              source: 'tmdb',
              externalId: r.id,
              title: r.title,
              year: r.release_date ? Number(r.release_date.slice(0, 4)) : win.currentYear + 1,
              mediaType: 'movie',
              genres: mapTmdbGenres(r.genre_ids, undefined, true),
              rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 8.0,
              posterUrl: poster,
              backdropUrl: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : poster,
              overview: r.overview || `${r.title} — upcoming film.`,
            });
          }
          if (out.length > 0) return out;
        }
      } catch {
        // fall through
      }
    }
    return [];
  })();

  const [tvRes, movieRes] = await Promise.allSettled([tvTask, moviesTask]);
  return interleaveGroups(
    [
      movieRes.status === 'fulfilled' ? movieRes.value : [],
      tvRes.status === 'fulfilled' ? tvRes.value : [],
    ],
    limit,
    (x) => normalizeTitleKey(x.title)
  );
}

async function fetchPopularWatch(
  limit: number,
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const useTmdb = await isTmdbAvailable(tmdbApiKey);
  const userKey = tmdbApiKey?.trim();

  const showsTask = (async (): Promise<LiveSearchResult[]> => {
    if (useTmdb) {
      try {
        const url =
          userKey && userKey.length > 8
            ? `https://api.themoviedb.org/3/tv/top_rated?language=en-US&page=1&api_key=${encodeURIComponent(
                userKey
              )}`
            : '/api/tmdb?action=popular-tv';
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{
              id: number;
              name?: string;
              first_air_date?: string;
              poster_path?: string;
              backdrop_path?: string;
              overview?: string;
              vote_average?: number;
              original_language?: string;
              genre_ids?: number[];
            }>;
          };
          const out: LiveSearchResult[] = [];
          for (const r of data.results || []) {
            if (!r.poster_path || !r.name) continue;
            const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
            out.push({
              domain: 'watch',
              kind: 'show',
              id: `tmdb-tv-${r.id}`,
              source: 'tmdb',
              externalId: r.id,
              title: r.name,
              year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : 2016,
              mediaType: 'tv',
              genres: mapTmdbGenres(r.genre_ids, r.original_language, false),
              rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 8.5,
              posterUrl: poster,
              backdropUrl: r.backdrop_path
                ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
                : poster,
              overview: r.overview || `${r.name} series.`,
            });
          }
          if (out.length > 0) return out;
        }
      } catch {
        // fall through to TVMaze
      }
    }

    try {
      const res = await fetch('https://api.tvmaze.com/shows?page=0');
      if (!res.ok) return [];
      const list = (await res.json()) as Array<{
        id: number;
        name?: string;
        language?: string;
        type?: string;
        genres?: string[];
        premiered?: string;
        weight?: number;
        rating?: { average?: number };
        image?: { medium?: string; original?: string };
        summary?: string;
        averageRuntime?: number;
      }>;
      return list
        .filter((s) => {
          if (!s.id || !s.name || hasNonLatinScript(s.name)) return false;
          if (s.language && s.language !== 'English' && s.language !== 'Japanese') return false;
          if (!s.image?.medium && !s.image?.original) return false;
          const premiered = s.premiered || '';
          if (premiered && premiered >= win.cutoffIso) return false;
          return (s.weight || 0) >= 88 && (s.rating?.average || 0) >= 8.0;
        })
        .sort((a, b) => (b.weight || 0) * (b.rating?.average || 8) - (a.weight || 0) * (a.rating?.average || 8))
        .slice(0, 18)
        .map((s) => {
          const poster = s.image?.medium || s.image?.original || '';
          return {
            domain: 'watch' as const,
            kind: 'show' as const,
            id: `tvmaze-${s.id}`,
            source: 'tvmaze' as const,
            externalId: s.id,
            title: s.name!,
            year: s.premiered ? Number(s.premiered.slice(0, 4)) : 2018,
            mediaType: 'tv' as const,
            genres: s.genres?.length ? s.genres.slice(0, 2) : ['Series'],
            rating: s.rating?.average || 8.4,
            posterUrl: poster,
            backdropUrl: s.image?.original || poster,
            overview: stripHtml(s.summary) || `${s.name} series.`,
            runtime: s.averageRuntime || 45,
          };
        });
    } catch {
      return [];
    }
  })();

  const moviesTask = (async (): Promise<LiveSearchResult[]> => {
    if (useTmdb) {
      try {
        const url =
          userKey && userKey.length > 8
            ? `https://api.themoviedb.org/3/movie/top_rated?language=en-US&page=1&api_key=${encodeURIComponent(
                userKey
              )}`
            : '/api/tmdb?action=popular-movies';
        const res = await fetch(url);
        if (res.ok) {
          const data = (await res.json()) as {
            results?: Array<{
              id: number;
              title?: string;
              release_date?: string;
              poster_path?: string;
              backdrop_path?: string;
              overview?: string;
              vote_average?: number;
              genre_ids?: number[];
            }>;
          };
          const out: LiveSearchResult[] = [];
          for (const r of data.results || []) {
            if (!r.poster_path || !r.title) continue;
            const poster = `https://image.tmdb.org/t/p/w500${r.poster_path}`;
            out.push({
              domain: 'watch',
              kind: 'movie',
              id: `tmdb-movie-${r.id}`,
              source: 'tmdb',
              externalId: r.id,
              title: r.title,
              year: r.release_date ? Number(r.release_date.slice(0, 4)) : 2014,
              mediaType: 'movie',
              genres: mapTmdbGenres(r.genre_ids, undefined, true),
              rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 8.5,
              posterUrl: poster,
              backdropUrl: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : poster,
              overview: r.overview || '',
            });
          }
          if (out.length > 0) return out;
        }
      } catch {
        // fall through to Apple classics
      }
    }

    try {
      const res = await fetch('https://itunes.apple.com/us/rss/topmovies/limit=60/json');
      if (!res.ok) return [];
      const data = (await res.json()) as {
        feed?: {
          entry?: Array<{
            id?: { attributes?: { 'im:id'?: string } };
            'im:name'?: { label?: string };
            'im:artist'?: { label?: string };
            'im:image'?: Array<{ label?: string }>;
            'im:releaseDate'?: { label?: string };
            category?: { attributes?: { label?: string } };
            summary?: { label?: string };
          }>;
        };
      };
      const parsed = parseAppleRssEntries(data.feed?.entry || [], win.cutoffDate);
      const classics = parsed.filter(
        (x) => !x.isRecent && x.relDate && x.relDate.getUTCFullYear() < win.currentYear
      );
      const out: LiveSearchResult[] = [];
      const seen = new Set<string>();
      for (const { e, relDate } of classics) {
        const id = e.id?.attributes?.['im:id'] || '';
        const title = cleanAppleTitle(e['im:name']?.label || '');
        const poster = upscaleAppleArtwork(e['im:image']?.[e['im:image'].length - 1]?.label || '');
        const key = normalizeTitleKey(title);
        if (!id || !title || !poster || seen.has(key)) continue;
        seen.add(key);
        out.push({
          domain: 'watch',
          kind: 'movie',
          id: `itunes-${id}`,
          source: 'itunes',
          externalId: Number(id) || id,
          title,
          subtitle: e['im:artist']?.label || 'Feature Film',
          year: relDate ? relDate.getUTCFullYear() : 2015,
          mediaType: 'movie',
          genres: [e.category?.attributes?.label || 'Feature Film'],
          rating: 8.2,
          posterUrl: poster,
          backdropUrl: poster,
          overview: e.summary?.label || `${title} — classic release.`,
          director: e['im:artist']?.label || 'Feature Film',
          runtime: 125,
        });
      }
      return out;
    } catch {
      return [];
    }
  })();

  const [moviesRes, showsRes] = await Promise.allSettled([
    moviesTask,
    showsTask,
  ]);
  return interleaveGroups(
    [
      showsRes.status === 'fulfilled' ? showsRes.value : [],
      moviesRes.status === 'fulfilled' ? moviesRes.value : [],
    ],
    limit,
    (x) => normalizeTitleKey(x.title)
  );
}

async function fetchAnticipatedRead(limit: number): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const mangaTask = (async (): Promise<LiveSearchResult[]> => {
    try {
      const gql = `query($d:FuzzyDateInt){Page(perPage:15){media(type:MANGA,startDate_greater:$d,sort:[POPULARITY_DESC]){id format title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore popularity description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { d: win.currentYear * 10000 } }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: {
          Page?: {
            media?: Array<{
              id: number;
              title?: { english?: string; romaji?: string };
              coverImage?: { extraLarge?: string; large?: string };
              bannerImage?: string;
              chapters?: number;
              startDate?: { year?: number };
              genres?: string[];
              averageScore?: number;
              description?: string;
              staff?: { nodes?: Array<{ name?: { full?: string } }> };
            }>;
          };
        };
      };
      return (json.data?.Page?.media || [])
        .map((m): LiveSearchResult | null => {
          const title = m.title?.english || m.title?.romaji || '';
          const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
          if (!title || !cover || hasNonLatinScript(title)) return null;
          const author = m.staff?.nodes?.[0]?.name?.full || 'Mangaka';
          return {
            domain: 'read',
            kind: 'read',
            id: `al-manga-${m.id}`,
            source: 'anilist',
            externalId: m.id,
            title,
            subtitle: author,
            year: m.startDate?.year || win.currentYear + 1,
            mediaType: 'manga',
            genres: m.genres?.length ? m.genres.slice(0, 2) : ['Manga'],
            rating: m.averageScore ? Number((m.averageScore / 20).toFixed(1)) : 4.7,
            posterUrl: cover,
            backdropUrl: m.bannerImage || cover,
            overview: stripHtml(m.description) || `${title} — upcoming manga.`,
            director: author,
            totalUnits: m.chapters || 12,
            totalUnitsEstimated: !m.chapters,
          };
        })
        .filter((x): x is LiveSearchResult => Boolean(x));
    } catch {
      return [];
    }
  })();

  const [comicsNextRes, mangaRes] = await Promise.allSettled([
    fetchTrendingComics(8, win.currentYear + 1),
    mangaTask,
  ]);
  return interleaveGroups(
    [
      comicsNextRes.status === 'fulfilled' ? comicsNextRes.value : [],
      mangaRes.status === 'fulfilled' ? mangaRes.value : [],
    ],
    limit,
    (x) => canonicalReadWorkKey(x.title)
  );
}

async function fetchPopularRead(limit: number): Promise<LiveSearchResult[]> {
  const win = getRecentDateWindow(185);
  const mangaTask = (async (): Promise<LiveSearchResult[]> => {
    try {
      const gql = `query{Page(perPage:20){media(type:MANGA,sort:[POPULARITY_DESC]){id format title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore popularity description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: {
          Page?: {
            media?: Array<{
              id: number;
              title?: { english?: string; romaji?: string };
              coverImage?: { extraLarge?: string; large?: string };
              bannerImage?: string;
              chapters?: number;
              startDate?: { year?: number };
              genres?: string[];
              averageScore?: number;
              description?: string;
              staff?: { nodes?: Array<{ name?: { full?: string } }> };
            }>;
          };
        };
      };
      return (json.data?.Page?.media || [])
        .map((m): LiveSearchResult | null => {
          const title = m.title?.english || m.title?.romaji || '';
          const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
          if (!title || !cover || hasNonLatinScript(title)) return null;
          const author = m.staff?.nodes?.[0]?.name?.full || 'Mangaka';
          return {
            domain: 'read',
            kind: 'read',
            id: `al-manga-${m.id}`,
            source: 'anilist',
            externalId: m.id,
            title,
            subtitle: author,
            year: m.startDate?.year || 2015,
            mediaType: 'manga',
            genres: m.genres?.length ? m.genres.slice(0, 2) : ['Manga'],
            rating: m.averageScore ? Number((m.averageScore / 20).toFixed(1)) : 4.8,
            posterUrl: cover,
            backdropUrl: m.bannerImage || cover,
            overview: stripHtml(m.description) || `${title} manga series.`,
            director: author,
            totalUnits: m.chapters || 80,
            totalUnitsEstimated: !m.chapters,
          };
        })
        .filter((x): x is LiveSearchResult => Boolean(x));
    } catch {
      return [];
    }
  })();

  const classicBooksTask = async (genreId: number, mediaType: 'novel' | 'manga'): Promise<LiveSearchResult[]> => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/us/rss/topebooks/limit=45/genre=${genreId}/json`
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        feed?: {
          entry?: Array<{
            id?: { attributes?: { 'im:id'?: string } };
            'im:name'?: { label?: string };
            'im:artist'?: { label?: string };
            'im:image'?: Array<{ label?: string }>;
            'im:releaseDate'?: { label?: string };
            category?: { attributes?: { label?: string } };
            summary?: { label?: string };
          }>;
        };
      };
      const parsed = parseAppleRssEntries(data.feed?.entry || [], win.cutoffDate).filter(
        (x) => !x.isRecent && x.relDate && x.relDate.getUTCFullYear() < win.currentYear
      );
      const out: LiveSearchResult[] = [];
      const seen = new Set<string>();
      for (const { e, relDate } of parsed) {
        const id = e.id?.attributes?.['im:id'] || '';
        const title = cleanAppleTitle(e['im:name']?.label || '');
        const cover = upscaleAppleArtwork(e['im:image']?.[e['im:image'].length - 1]?.label || '');
        const key = canonicalReadWorkKey(title);
        if (!id || !title || !cover || hasNonLatinScript(title) || seen.has(key)) continue;
        seen.add(key);
        const author = e['im:artist']?.label || 'Author';
        out.push({
          domain: 'read',
          kind: 'read',
          id: mediaType === 'manga' ? `itunes-manga-${id}` : `itunes-book-${id}`,
          source: 'openlibrary',
          externalId: id,
          title,
          subtitle: author,
          year: relDate ? relDate.getUTCFullYear() : 2018,
          mediaType,
          genres: [e.category?.attributes?.label || (mediaType === 'manga' ? 'Manga' : 'Fiction')],
          rating: 4.7,
          posterUrl: cover,
          backdropUrl: cover,
          overview: e.summary?.label || `${title} by ${author}.`,
          director: author,
          totalUnits: mediaType === 'manga' ? 12 : 24,
        });
      }
      return out;
    } catch {
      return [];
    }
  };

  const [mangaRes, novelsRes, graphicRes] = await Promise.allSettled([
    mangaTask,
    classicBooksTask(9031, 'novel'),
    classicBooksTask(9026, 'manga'),
  ]);
  return interleaveGroups(
    [
      mangaRes.status === 'fulfilled' ? mangaRes.value : [],
      novelsRes.status === 'fulfilled' ? novelsRes.value : [],
      graphicRes.status === 'fulfilled' ? graphicRes.value : [],
    ],
    limit,
    (x) => canonicalReadWorkKey(x.title)
  );
}

/** Fetches distinct Discover horizontal rails for the `All` view. */
export async function fetchAllDiscoverRails(tmdbApiKey?: string): Promise<DiscoverRail[]> {
  const key = tmdbApiKey?.trim() ? 'tmdb' : 'public';
  const cached = discoverAllCache.get(key);
  if (cached && Date.now() - cached.ts < TRENDING_TTL_MS) {
    return cached.rails;
  }

  const [
    domainTrending,
    antGamesRes,
    antWatchRes,
    antReadRes,
    popWatchRes,
    popReadRes,
    popGamesRes,
  ] = await Promise.all([
    fetchTrendingByDomain(tmdbApiKey),
    fetchGamesByMode(12, 'anticipated'),
    fetchAnticipatedWatch(12, tmdbApiKey),
    fetchAnticipatedRead(10),
    fetchPopularWatch(12, tmdbApiKey),
    fetchPopularRead(12),
    fetchGamesByMode(12, 'popular'),
  ]);

  const seenTrendingKeys = new Set<string>();
  addWorkKeysToSet(domainTrending.watch, seenTrendingKeys);
  addWorkKeysToSet(domainTrending.read, seenTrendingKeys);
  addWorkKeysToSet(domainTrending.play, seenTrendingKeys);

  const anticipatedPool = interleaveGroups(
    [
      excludeSeenWorkKeys(antGamesRes, seenTrendingKeys),
      excludeSeenWorkKeys(antWatchRes, seenTrendingKeys),
      excludeSeenWorkKeys(antReadRes, seenTrendingKeys),
    ],
    15,
    (x) => `${x.domain}:${canonicalReadWorkKey(x.title)}`
  );
  const seenPlusAnticipated = new Set(seenTrendingKeys);
  addWorkKeysToSet(anticipatedPool, seenPlusAnticipated);

  const popularPool = interleaveGroups(
    [
      excludeSeenWorkKeys(popWatchRes, seenPlusAnticipated),
      excludeSeenWorkKeys(popReadRes, seenPlusAnticipated),
      excludeSeenWorkKeys(popGamesRes, seenPlusAnticipated),
    ],
    15,
    (x) => `${x.domain}:${canonicalReadWorkKey(x.title)}`
  );

  const rawRails: DiscoverRail[] = [
    {
      id: 'trending-watch',
      title: 'Trending to Watch',
      domain: 'watch',
      showMediaBadge: true,
      items: domainTrending.watch,
    },
    {
      id: 'trending-read',
      title: 'Trending to Read',
      domain: 'read',
      showMediaBadge: true,
      items: domainTrending.read,
    },
    {
      id: 'trending-play',
      title: 'Trending to Play',
      domain: 'play',
      showMediaBadge: false,
      items: domainTrending.play,
    },
    {
      id: 'most-anticipated',
      title: 'Most Anticipated',
      domain: 'all',
      showMediaBadge: true,
      items: anticipatedPool,
    },
    {
      id: 'popular-all-time',
      title: 'Popular All-Time',
      domain: 'all',
      showMediaBadge: true,
      items: popularPool,
    },
  ];
  const rails = rawRails.filter((r) => r.items.length > 0);

  discoverAllCache.set(key, { ts: Date.now(), rails });
  return rails;
}

/** Fetches tailored horizontal rails when browsing `Watch`, `Read`, or `Play`. */
export async function fetchDomainDiscoverRails(
  domain: 'watch' | 'read' | 'play',
  tmdbApiKey?: string
): Promise<DiscoverRail[]> {
  const key = `${domain}::${tmdbApiKey?.trim() ? 'tmdb' : 'public'}`;
  const cached = discoverDomainCache.get(key);
  if (cached && Date.now() - cached.ts < TRENDING_TTL_MS) {
    return cached.rails;
  }

  let rails: DiscoverRail[] = [];
  if (domain === 'watch') {
    const [showsRes, moviesRes, antRes, popRes] = await Promise.allSettled([
      fetchTrendingShows(18, tmdbApiKey),
      fetchTrendingMovies(15, tmdbApiKey),
      fetchAnticipatedWatch(15, tmdbApiKey),
      fetchPopularWatch(15, tmdbApiKey),
    ]);
    const shows = showsRes.status === 'fulfilled' ? showsRes.value : [];
    const movies = moviesRes.status === 'fulfilled' ? moviesRes.value : [];
    const ant = antRes.status === 'fulfilled' ? antRes.value : [];
    const pop = popRes.status === 'fulfilled' ? popRes.value : [];

    const seen = new Set<string>();
    addWorkKeysToSet([...shows, ...movies], seen);

    const rawWatchRails: DiscoverRail[] = [
      { id: 'watch-shows', title: 'Trending Shows', domain: 'watch', showMediaBadge: false, items: shows },
      { id: 'watch-movies', title: 'Trending Movies', domain: 'watch', showMediaBadge: false, items: movies },
      {
        id: 'watch-anticipated',
        title: 'Most Anticipated',
        domain: 'watch',
        showMediaBadge: true,
        items: excludeSeenWorkKeys(ant, seen),
      },
      {
        id: 'watch-popular',
        title: 'Popular All-Time',
        domain: 'watch',
        showMediaBadge: true,
        items: excludeSeenWorkKeys(pop, seen),
      },
    ];
    rails = rawWatchRails.filter((r) => r.items.length > 0);
  } else if (domain === 'read') {
    const [comicsRes, mangaRes, novelsRes, antRes, popRes] = await Promise.allSettled([
      fetchTrendingComics(15),
      fetchTrendingManga(15),
      fetchTrendingNovels(15),
      fetchAnticipatedRead(12),
      fetchPopularRead(15),
    ]);
    const comics = comicsRes.status === 'fulfilled' ? comicsRes.value : [];
    const manga = mangaRes.status === 'fulfilled' ? mangaRes.value : [];
    const novels = novelsRes.status === 'fulfilled' ? novelsRes.value : [];
    const ant = antRes.status === 'fulfilled' ? antRes.value : [];
    const pop = popRes.status === 'fulfilled' ? popRes.value : [];

    const seen = new Set<string>();
    addWorkKeysToSet([...comics, ...manga, ...novels], seen);

    const rawReadRails: DiscoverRail[] = [
      { id: 'read-comics', title: 'Trending Comics', domain: 'read', showMediaBadge: false, items: comics },
      { id: 'read-manga', title: 'Trending Manga', domain: 'read', showMediaBadge: false, items: manga },
      { id: 'read-novels', title: 'Trending Novels', domain: 'read', showMediaBadge: false, items: novels },
      {
        id: 'read-anticipated',
        title: 'Coming Soon',
        domain: 'read',
        showMediaBadge: true,
        items: excludeSeenWorkKeys(ant, seen),
      },
      {
        id: 'read-popular',
        title: 'Popular All-Time',
        domain: 'read',
        showMediaBadge: true,
        items: excludeSeenWorkKeys(pop, seen),
      },
    ];
    rails = rawReadRails.filter((r) => r.items.length > 0);
  } else {
    const [trendRes, antRes, popRes] = await Promise.allSettled([
      fetchGamesByMode(15, 'trending'),
      fetchGamesByMode(15, 'anticipated'),
      fetchGamesByMode(15, 'popular'),
    ]);
    const trend = trendRes.status === 'fulfilled' ? trendRes.value : [];
    const ant = antRes.status === 'fulfilled' ? antRes.value : [];
    const pop = popRes.status === 'fulfilled' ? popRes.value : [];

    const seen = new Set<string>();
    addWorkKeysToSet(trend, seen);

    const rawPlayRails: DiscoverRail[] = [
      { id: 'play-trending', title: 'Trending Games', domain: 'play', showMediaBadge: false, items: trend },
      {
        id: 'play-anticipated',
        title: 'Most Anticipated',
        domain: 'play',
        showMediaBadge: false,
        items: excludeSeenWorkKeys(ant, seen),
      },
      {
        id: 'play-popular',
        title: 'Popular All-Time',
        domain: 'play',
        showMediaBadge: false,
        items: excludeSeenWorkKeys(pop, seen),
      },
    ];
    rails = rawPlayRails.filter((r) => r.items.length > 0);
  }

  discoverDomainCache.set(key, { ts: Date.now(), rails });
  return rails;
}

/** Fetches last-6-months trending posters & covers for the 3-column Search discovery grid. */
export async function fetchTrendingByDomain(tmdbApiKey?: string): Promise<TrendingByDomain> {
  const key = tmdbApiKey?.trim() ? 'tmdb' : 'public';
  const cached = trendingCache.get(key);
  if (cached && Date.now() - cached.ts < TRENDING_TTL_MS) {
    return cached.data;
  }

  const [moviesRes, showsRes, mangaRes, comicsRes, novelsRes, gamesRes] =
    await Promise.allSettled([
      fetchTrendingMovies(10, tmdbApiKey),
      fetchTrendingShows(12, tmdbApiKey),
      fetchTrendingManga(8),
      fetchTrendingComics(8),
      fetchTrendingNovels(8),
      fetchTrendingGames(15),
    ]);

  const movies = moviesRes.status === 'fulfilled' ? moviesRes.value : [];
  const shows = showsRes.status === 'fulfilled' ? showsRes.value : [];
  const manga = mangaRes.status === 'fulfilled' ? mangaRes.value : [];
  const comics = comicsRes.status === 'fulfilled' ? comicsRes.value : [];
  const novels = novelsRes.status === 'fulfilled' ? novelsRes.value : [];
  const play = gamesRes.status === 'fulfilled' ? gamesRes.value : [];

  const watch = interleaveGroups(
    [movies, shows],
    15,
    (x) => normalizeTitleKey(x.title)
  );
  const read = interleaveGroups(
    [comics, manga, novels],
    15,
    (x) => canonicalReadWorkKey(x.title)
  );

  const result: TrendingByDomain = { watch, read, play };
  trendingCache.set(key, { ts: Date.now(), data: result });
  return result;
}

/** Fetches up to 24 recent/trending titles for a specific filter pill when browsing without a query. */
export async function fetchTrendingByCategory(
  category: Exclude<SearchMediaFilter, 'all'>,
  tmdbApiKey?: string
): Promise<LiveSearchResult[]> {
  const cacheKey = `${category}::${tmdbApiKey?.trim() ? 'tmdb' : 'public'}`;
  const cached = categoryTrendingCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TRENDING_TTL_MS) {
    return cached.items;
  }

  let items: LiveSearchResult[] = [];
  if (category === 'movie') items = await fetchTrendingMovies(24, tmdbApiKey);
  else if (category === 'tv' || category === 'anime') items = await fetchTrendingShows(24, tmdbApiKey);
  else if (category === 'manga') items = await fetchTrendingManga(24);
  else if (category === 'comic') items = await fetchTrendingComics(24);
  else if (category === 'novel') items = await fetchTrendingNovels(24);
  else if (category === 'game') items = await fetchTrendingGames(24);

  categoryTrendingCache.set(cacheKey, { ts: Date.now(), items });
  return items;
}

async function searchTvMaze(query: string): Promise<LiveSearchResult[]> {
  const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    show: {
      id: number;
      name: string;
      premiered?: string;
      genres?: string[];
      type?: string;
      language?: string;
      weight?: number;
      rating?: { average?: number };
      image?: { original?: string; medium?: string };
      summary?: string;
      averageRuntime?: number;
    };
  }>;

  return data.slice(0, 12).map((item) => {
    const s = item.show;
    const isAnime =
      s.genres?.includes('Anime') || (s.type === 'Animation' && s.language === 'Japanese');
    const poster = s.image?.medium || s.image?.original || '';
    const weight = typeof s.weight === 'number' ? s.weight : 25;
    const popularityScore = Math.min(
      96,
      Math.round(weight * 0.88 + (s.rating?.average && s.rating.average >= 8 ? 6 : 0))
    );
    const genres = s.genres?.length
      ? isAnime && !s.genres.includes('Anime')
        ? [...s.genres, 'Anime']
        : s.genres
      : isAnime
        ? ['Anime']
        : ['Drama'];
    return {
      domain: 'watch',
      kind: 'show',
      id: `tvmaze-${s.id}`,
      source: 'tvmaze',
      externalId: s.id,
      title: s.name,
      year: premieredYear(s.premiered),
      mediaType: 'tv',
      genres,
      rating: s.rating?.average || 7.8,
      posterUrl: poster,
      backdropUrl: s.image?.original || poster,
      overview: stripHtml(s.summary) || `${s.name} series.`,
      runtime: s.averageRuntime || 45,
      popularity: weight * 800,
      popularityScore,
    };
  });
}

function premieredYear(premiered?: string): number {
  return premiered ? Number(premiered.slice(0, 4)) || 2024 : 2024;
}

async function searchItunesMovies(query: string): Promise<LiveSearchResult[]> {
  const qLower = query.trim().toLowerCase();
  const qWords = qLower.split(/\s+/).filter((w) => w.length >= 2);
  const itunesResults: LiveSearchResult[] = [];
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&limit=30`
    );
    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{
          kind?: string;
          trackId: number;
          trackName: string;
          artistName?: string;
          releaseDate?: string;
          primaryGenreName?: string;
          trackTimeMillis?: number;
          artworkUrl100?: string;
          longDescription?: string;
          shortDescription?: string;
        }>;
      };

      const matched = (data.results || [])
        .filter((r) => {
          if (r.kind !== 'feature-movie' || !r.trackName) return false;
          const trackLower = r.trackName.toLowerCase();
          return (
            trackLower.includes(qLower) ||
            (qWords.length >= 2 && qWords.every((w) => trackLower.includes(w)))
          );
        })
        .slice(0, 8);

      matched.forEach((m, idx) => {
        const poster = m.artworkUrl100 ? m.artworkUrl100.replace('100x100bb', '600x900bb') : '';
        itunesResults.push({
          domain: 'watch',
          kind: 'movie',
          id: `itunes-${m.trackId}`,
          source: 'itunes',
          externalId: m.trackId,
          title: m.trackName,
          subtitle: m.artistName,
          year: m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : 2024,
          mediaType: 'movie',
          genres: m.primaryGenreName ? [m.primaryGenreName] : ['Feature Film'],
          rating: 7.9,
          posterUrl: poster,
          backdropUrl: poster,
          overview:
            m.longDescription ||
            m.shortDescription ||
            `${m.trackName}, directed by ${m.artistName || 'Unknown'}.`,
          director: m.artistName || 'Unknown',
          runtime: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : 120,
          popularityScore: Math.max(48, 78 - idx * 4),
        });
      });
    }
  } catch {
    // ignore
  }

  const wikiHit = await searchWikipediaSummary(query, 'film');
  if (wikiHit && !itunesResults.some((r) => r.title.toLowerCase() === wikiHit.title.toLowerCase())) {
    itunesResults.unshift(wikiHit);
  }
  return itunesResults;
}

interface OpenLibraryDoc {
  key: string;
  title: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  edition_count?: number;
  readinglog_count?: number;
  ratings_count?: number;
  isbn?: string[];
  publisher?: string[];
}

const PRH_COMIC_ISBN_PREFIXES = [
  '97817795',
  '97817995',
  '97814012',
  '97815638',
  '97813029',
  '97807851',
];

export function resolveOpenLibraryCoverFromIsbn(
  isbns?: string[],
  coverId?: number
): string | undefined {
  const cleanIsbn13 = (isbns || [])
    .map((s) => s.replace(/[^0-9X]/gi, '').toUpperCase())
    .find((s) => /^97[89]\d{10}$/.test(s));

  if (cleanIsbn13) {
    const isPrh = PRH_COMIC_ISBN_PREFIXES.some((p) => cleanIsbn13.startsWith(p));
    const preferModernPrh =
      cleanIsbn13.startsWith('97817795') || cleanIsbn13.startsWith('97817995');
    if (isPrh && (!coverId || coverId <= 0 || preferModernPrh)) {
      return `https://images.penguinrandomhouse.com/cover/${cleanIsbn13}`;
    }
  }

  if (coverId && coverId > 0) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }

  if (cleanIsbn13) {
    return `https://covers.openlibrary.org/b/isbn/${cleanIsbn13}-L.jpg?default=false`;
  }

  return undefined;
}

function isValidIsbn13Digits(d: string): boolean {
  if (!/^97[89]\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[12]);
}

function isbn10ToIsbn13(raw10: string): string | null {
  if (!/^\d{9}[\dX]$/.test(raw10)) return null;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(raw10[i]) * (10 - i);
  }
  const lastVal = raw10[9] === 'X' ? 10 : Number(raw10[9]);
  sum += lastVal;
  if (sum % 11 !== 0) return null;

  const core12 = `978${raw10.slice(0, 9)}`;
  let sum13 = 0;
  for (let i = 0; i < 12; i += 1) {
    sum13 += Number(core12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check13 = (10 - (sum13 % 10)) % 10;
  return `${core12}${check13}`;
}

/** Validates ISBN-10 / ISBN-13 (with optional hyphens, spaces, or EAN+5 add-on) and returns normalized ISBN-13. */
export function extractIsbnFromInput(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^isbn(?:-?(?:10|13))?[:\s]*/i, '')
    .replace(/[\s-]+/g, '')
    .toUpperCase();

  if (/^97[89]\d{15}$/.test(stripped)) {
    const candidate = stripped.slice(0, 13);
    return isValidIsbn13Digits(candidate) ? candidate : null;
  }
  if (/^97[89]\d{10}$/.test(stripped)) {
    return isValidIsbn13Digits(stripped) ? stripped : null;
  }
  if (/^\d{9}[\dX]$/.test(stripped)) {
    return isbn10ToIsbn13(stripped);
  }
  return null;
}

function classifyIsbnMediaType(
  title: string,
  publisher: string,
  subjects: string[]
): 'manga' | 'comic' | 'novel' {
  const hay = `${title} ${publisher} ${subjects.join(' ')}`.toLowerCase();
  if (
    /\b(manga|shonen|seinen|shojo|josei|tankobon)\b/.test(hay) ||
    /\b(viz media|viz|kodansha|seven seas|yen press|shueisha|tokyopop|square enix)\b/.test(
      publisher.toLowerCase()
    )
  ) {
    return 'manga';
  }
  if (
    /\b(dc comics|marvel|image comics|dark horse|idw|boom!? studios|vertigo|valiant|dynamite|graphic novel|comics & graphic novels|omnibus|trade paperback|tpb|compendium)\b/.test(
      hay
    ) ||
    COMIC_WORK_HINTS.some((kw) => hay.includes(kw))
  ) {
    return 'comic';
  }
  return 'novel';
}

interface GoogleBooksVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    averageRating?: number;
    imageLinks?: {
      extraLarge?: string;
      large?: string;
      medium?: string;
      thumbnail?: string;
      smallThumbnail?: string;
    };
  };
}

interface OpenLibraryBookDataEntry {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_date?: string;
  number_of_pages?: number;
  subjects?: Array<{ name?: string }>;
  cover?: {
    large?: string;
    medium?: string;
    small?: string;
  };
  notes?: string | { value?: string };
}

/** Looks up an exact book, manga volume, or collected comic edition by ISBN-10 or ISBN-13. */
export async function searchByIsbn(rawIsbn: string): Promise<LiveSearchResult[]> {
  const isbn13 = extractIsbnFromInput(rawIsbn);
  if (!isbn13) return [];

  const fields =
    'key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,subject,publisher,isbn';

  const [gbRes, olDataRes, olSearchRes] = await Promise.allSettled([
    fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`, {
      signal: AbortSignal.timeout(7000),
    }),
    fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`,
      { signal: AbortSignal.timeout(7000) }
    ),
    fetch(`https://openlibrary.org/search.json?isbn=${isbn13}&limit=3&fields=${fields}`, {
      signal: AbortSignal.timeout(7000),
    }),
  ]);

  let gbVol: GoogleBooksVolume['volumeInfo'] | undefined;
  if (gbRes.status === 'fulfilled' && gbRes.value.ok) {
    try {
      const json = (await gbRes.value.json()) as { items?: GoogleBooksVolume[] };
      gbVol = json.items?.[0]?.volumeInfo;
    } catch {
      // ignore parse failure
    }
  }

  let olBook: OpenLibraryBookDataEntry | undefined;
  if (olDataRes.status === 'fulfilled' && olDataRes.value.ok) {
    try {
      const json = (await olDataRes.value.json()) as Record<string, OpenLibraryBookDataEntry>;
      olBook = json[`ISBN:${isbn13}`];
    } catch {
      // ignore
    }
  }

  let olDoc: OpenLibraryDoc | undefined;
  if (olSearchRes.status === 'fulfilled' && olSearchRes.value.ok) {
    try {
      const json = (await olSearchRes.value.json()) as { docs?: OpenLibraryDoc[] };
      olDoc = json.docs?.[0];
    } catch {
      // ignore
    }
  }

  const rawTitle = (olBook?.title || gbVol?.title || olDoc?.title || '').trim();
  const rawSubtitle = (olBook?.subtitle || gbVol?.subtitle || olDoc?.subtitle || '').trim();
  if (!rawTitle) return [];

  const title = formatDisplayTitle(
    combinedOpenLibraryTitle({ title: rawTitle, subtitle: rawSubtitle })
  );
  const author =
    olBook?.authors?.[0]?.name || gbVol?.authors?.[0] || olDoc?.author_name?.[0] || '';
  const publisher =
    olBook?.publishers?.[0]?.name || gbVol?.publisher || olDoc?.publisher?.[0] || '';
  const subjects = [
    ...(olBook?.subjects?.map((s) => s.name || '') || []),
    ...(gbVol?.categories || []),
    ...(olDoc?.subject || []),
  ].filter(Boolean);

  const yearStr = `${olBook?.publish_date || ''} ${gbVol?.publishedDate || ''} ${olDoc?.first_publish_year || ''}`;
  const yearMatch = yearStr.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();

  const pageCount =
    olBook?.number_of_pages || gbVol?.pageCount || olDoc?.number_of_pages_median || undefined;

  const isPrh = PRH_COMIC_ISBN_PREFIXES.some((p) => isbn13.startsWith(p));
  const gbThumbRaw =
    gbVol?.imageLinks?.extraLarge ||
    gbVol?.imageLinks?.large ||
    gbVol?.imageLinks?.medium ||
    gbVol?.imageLinks?.thumbnail ||
    gbVol?.imageLinks?.smallThumbnail ||
    '';
  const gbCover = gbThumbRaw
    ? gbThumbRaw
        .replace(/^http:\/\//i, 'https://')
        .replace(/&edge=curl/gi, '')
    : '';
  const olCover =
    olBook?.cover?.large ||
    olBook?.cover?.medium ||
    (olDoc?.cover_i ? `https://covers.openlibrary.org/b/id/${olDoc.cover_i}-L.jpg` : '');

  const posterUrl =
    (isPrh ? `https://images.penguinrandomhouse.com/cover/${isbn13}` : '') ||
    olCover ||
    gbCover ||
    `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;

  const mediaType = classifyIsbnMediaType(
    `${title} ${rawSubtitle}`,
    publisher,
    subjects
  );
  const totalUnits =
    mediaType === 'comic'
      ? parseCollectedIssueCount(`${rawTitle} ${rawSubtitle}`, pageCount) ?? 6
      : mediaType === 'manga'
        ? Math.max(1, Math.round((pageCount || 190) / 18))
        : Math.max(12, Math.min(80, Math.round((pageCount || 320) / 14)));

  const rawDesc =
    gbVol?.description ||
    (typeof olBook?.notes === 'string' ? olBook.notes : olBook?.notes?.value) ||
    '';
  const overview =
    stripHtml(rawDesc) ||
    `${title}${author ? ` by ${author}` : ''}${publisher ? ` · ${publisher}` : ''} (ISBN ${isbn13}).`;

  const cleanGenres = subjects
    .map((s) => s.split('/')[0].trim())
    .filter((s) => s.length >= 3 && s.length <= 28)
    .slice(0, 3);
  const fallbackGenre =
    mediaType === 'comic' ? 'Comics' : mediaType === 'manga' ? 'Manga' : 'Fiction';

  return [
    {
      domain: 'read',
      kind: 'read',
      id: `isbn-${isbn13}`,
      source: 'openlibrary',
      externalId: isbn13,
      title,
      subtitle: [author, publisher].filter(Boolean).join(' · ') || `ISBN ${isbn13}`,
      year,
      mediaType,
      comicKind: mediaType === 'comic' ? 'collection' : undefined,
      comicPublisher: mediaType === 'comic' ? publisher || undefined : undefined,
      genres: cleanGenres.length > 0 ? cleanGenres : [fallbackGenre],
      rating:
        typeof gbVol?.averageRating === 'number' && gbVol.averageRating > 0
          ? Number(gbVol.averageRating.toFixed(1))
          : 4.5,
      posterUrl,
      backdropUrl: posterUrl,
      overview,
      director: author || publisher || 'Author',
      totalUnits,
      isbn: isbn13,
    },
  ];
}

function combinedOpenLibraryTitle(d: Pick<OpenLibraryDoc, 'title' | 'subtitle'>): string {
  const base = (d.title || '').trim();
  const sub = d.subtitle?.trim();
  if (
    sub &&
    sub.length <= 42 &&
    !hasNonLatinScript(sub) &&
    !/^(a novel|graphic novel|paperback|hardcover|edition|vol\.?\s*\d+)/i.test(sub) &&
    !base.toLowerCase().includes(sub.toLowerCase())
  ) {
    return `${base}: ${sub}`;
  }
  return base;
}

function parseCollectedIssueCount(text?: string, pageCount?: number): number | undefined {
  if (text) {
    const rangeMatches = [...text.matchAll(/#(\d+)\s*[-–—to]+\s*#?(\d+)/gi)];
    if (rangeMatches.length > 0) {
      let sum = 0;
      for (const m of rangeMatches) {
        const start = Number(m[1]);
        const end = Number(m[2]);
        if (end >= start && end - start < 250) sum += end - start + 1;
      }
      if (sum > 0 && sum <= 250) return sum;
    }
    const countMatch = text.match(/\b(\d{1,3})\s+(?:issues?|chapters?)\b/i);
    if (countMatch) {
      const n = Number(countMatch[1]);
      if (n > 0 && n <= 250) return n;
    }
  }
  if (typeof pageCount === 'number' && pageCount > 30) {
    return Math.max(1, Math.min(200, Math.round(pageCount / 24)));
  }
  return undefined;
}

function buildComicEditionCovers(
  docs: OpenLibraryDoc[],
  earliestYear: number,
  primaryCover: string,
  titleHint?: string
): {
  covers: Partial<Record<ComicEditionId, string>>;
  variants: Partial<Record<GeneralizedComicEditionId, string[]>>;
} {
  const editionCovers: Partial<Record<ComicEditionId, string>> = {};
  const editionVariants: Partial<Record<GeneralizedComicEditionId, string[]>> = {};
  if (primaryCover) {
    editionCovers.digital = primaryCover;
  }
  const spec = titleHint ? getKnownComicEditionSpec(titleHint) : undefined;
  const allowCompactFallback = Boolean(
    titleHint &&
      (titleHint.toLowerCase().includes('dc') ||
        COMIC_WORK_HINTS.some((kw) => titleHint.toLowerCase().includes(kw)))
  );
  for (const d of docs) {
    const classified = classifyRawComicEdition(
      combinedOpenLibraryTitle(d),
      undefined,
      d.first_publish_year,
      earliestYear,
      allowCompactFallback
    );
    const ed = classified.edition;
    if (spec && !spec.availableEditions.includes(ed)) continue;
    recordVariantTag(editionVariants, ed, classified.variantTag);
    if (d.cover_i && !editionCovers[ed]) {
      editionCovers[ed] = `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
    }
  }
  if (primaryCover && !editionCovers.tpb) {
    editionCovers.tpb = primaryCover;
  }
  if (spec?.covers) {
    for (const [edKey, url] of Object.entries(spec.covers) as Array<[GeneralizedComicEditionId, string]>) {
      if (url && spec.availableEditions.includes(edKey)) {
        editionCovers[edKey] = url;
      }
    }
  }
  if (spec) {
    const allowed = new Set<GeneralizedComicEditionId>(spec.availableEditions);
    for (const key of Object.keys(editionCovers) as GeneralizedComicEditionId[]) {
      if (!allowed.has(key)) delete editionCovers[key];
    }
    for (const key of Object.keys(editionVariants) as GeneralizedComicEditionId[]) {
      if (!allowed.has(key)) delete editionVariants[key];
    }
  }
  return { covers: editionCovers, variants: editionVariants };
}

async function searchOpenLibrary(query: string): Promise<LiveSearchResult[]> {
  const queryIsLatin = !hasNonLatinScript(query);
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&language=eng&limit=20&fields=key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,subject,edition_count,readinglog_count,ratings_count`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      docs?: OpenLibraryDoc[];
    };

    const filteredDocs = (data.docs || []).filter((d) => {
      if (!d.title || !d.cover_i) return false;
      const fullTitle = combinedOpenLibraryTitle(d);
      if (queryIsLatin && hasNonLatinScript(fullTitle)) return false;

      const lowerTitle = fullTitle.toLowerCase();
      if (
        lowerTitle.includes('coloring book') ||
        lowerTitle.includes('activity book') ||
        lowerTitle.includes('sticker book') ||
        lowerTitle.includes('study guide') ||
        lowerTitle.includes('summary of')
      ) {
        return false;
      }

      const subjectsLower = (d.subject || []).map((s) => s.toLowerCase());
      // Let AniList handle manga so Open Library only surfaces Novels & Western Comics
      const looksLikeManga = subjectsLower.some(
        (s) =>
          s.includes('manga') ||
          s.includes('japanese comics') ||
          s.includes('shonen') ||
          s.includes('seinen') ||
          s.includes('shojo')
      );
      if (looksLikeManga) return false;

      return true;
    });

    // Collapse editions of the same canonical work (e.g. Vol 02, Absolute, 2024 Compact)
    const groups = new Map<string, OpenLibraryDoc[]>();
    for (const doc of filteredDocs) {
      const workKey = canonicalReadWorkKey(combinedOpenLibraryTitle(doc));
      const authorKey = normalizeTitleKey(doc.author_name?.[0] || '');
      const groupKey = authorKey ? `${workKey}::${authorKey}` : workKey;
      const list = groups.get(groupKey) || [];
      list.push(doc);
      groups.set(groupKey, list);
    }

    const collapsed: LiveSearchResult[] = [];
    for (const docs of groups.values()) {
      const years = docs
        .map((d) => d.first_publish_year)
        .filter((y): y is number => typeof y === 'number' && y > 1900);
      const earliestYear = years.length > 0 ? Math.min(...years) : 2020;

      // Pick the canonical doc without Vol / Absolute / Deluxe wrappers if available
      const sortedForPrimary = [...docs].sort((a, b) => {
        const aIsEditionWrapper = /\b(vol\.?|volume|absolute|deluxe|omnibus|compact)\b/i.test(a.title)
          ? 1
          : 0;
        const bIsEditionWrapper = /\b(vol\.?|volume|absolute|deluxe|omnibus|compact)\b/i.test(b.title)
          ? 1
          : 0;
        if (aIsEditionWrapper !== bIsEditionWrapper) return aIsEditionWrapper - bIsEditionWrapper;
        return (a.first_publish_year || 9999) - (b.first_publish_year || 9999);
      });

      const primary = sortedForPrimary[0];
      const baseTitle = formatDisplayTitle(stripEditionAffixes(combinedOpenLibraryTitle(primary)));
      const allSubjectsLower = docs.flatMap((d) => (d.subject || []).map((s) => s.toLowerCase()));
      const hayLower = `${baseTitle} ${primary.author_name?.[0] || ''} ${allSubjectsLower.join(' ')}`.toLowerCase();
      const isComic =
        COMIC_WORK_HINTS.some((kw) => hayLower.includes(kw)) ||
        docs.some((d) => /\b(absolute|omnibus|tpb|vol\.?\s*\d+)\b/i.test(d.title));

      const primaryCover = `https://covers.openlibrary.org/b/id/${primary.cover_i}-L.jpg`;
      const spec = isComic ? getKnownComicEditionSpec(baseTitle) : undefined;
      const editionData = isComic
        ? buildComicEditionCovers(docs, earliestYear, primaryCover, baseTitle)
        : undefined;
      const editionCovers = editionData?.covers;
      const editionVariants = editionData?.variants;

      const curatedCounts = spec ? { ...spec.counts } : undefined;
      const editionIssueCounts: Partial<Record<ComicEditionId, number>> | undefined = isComic
        ? { ...(curatedCounts || {}) }
        : undefined;
      if (isComic && editionIssueCounts) {
        for (const d of docs) {
          const { edition: ed } = classifyRawComicEdition(
            combinedOpenLibraryTitle(d),
            undefined,
            d.first_publish_year,
            earliestYear,
            true
          );
          if (spec && !spec.availableEditions.includes(ed)) continue;
          const inferred = parseCollectedIssueCount(d.subtitle, d.number_of_pages_median);
          if (!editionIssueCounts[ed] && inferred) {
            editionIssueCounts[ed] = inferred;
          }
        }
        const fallbackBase =
          editionIssueCounts.digital ??
          editionIssueCounts.tpb ??
          parseCollectedIssueCount(primary.subtitle, primary.number_of_pages_median) ??
          12;
        if (!editionIssueCounts.digital) editionIssueCounts.digital = fallbackBase;
        if (!editionIssueCounts.tpb) editionIssueCounts.tpb = fallbackBase;
        if (spec) {
          const allowed = new Set<GeneralizedComicEditionId>(spec.availableEditions);
          for (const key of Object.keys(editionIssueCounts) as GeneralizedComicEditionId[]) {
            if (!allowed.has(key)) delete editionIssueCounts[key];
          }
        }
      }

      const cleanKey = primary.key.replace('/works/', '');
      const authorName = primary.author_name?.[0] || 'Author';
      const estimatedChapters = Math.max(
        12,
        Math.min(80, Math.round((primary.number_of_pages_median || 320) / 14))
      );
      const totalEditions = docs.reduce((acc, d) => acc + (d.edition_count || 1), 0);
      const totalReadingLog = docs.reduce((acc, d) => acc + (d.readinglog_count || 0), 0);
      const totalRatings = docs.reduce((acc, d) => acc + (d.ratings_count || 0), 0);
      const realReaders = totalReadingLog + totalRatings * 3 + Math.min(25, totalEditions);
      const popularityScore = Math.min(
        94,
        Math.round(Math.log10(Math.max(1, realReaders)) * 20)
      );

      collapsed.push({
        domain: 'read' as const,
        kind: 'read' as const,
        id: `ol-${cleanKey}`,
        source: 'openlibrary' as const,
        externalId: cleanKey,
        title: baseTitle,
        subtitle: authorName,
        year: earliestYear,
        mediaType: isComic ? ('comic' as const) : ('novel' as const),
        comicKind: isComic ? ('collection' as const) : undefined,
        genres: (primary.subject || []).slice(0, 2).length
          ? (primary.subject || []).slice(0, 2)
          : [isComic ? 'Comics' : 'Novel'],
        rating: 4.5,
        posterUrl: primaryCover,
        backdropUrl: primaryCover,
        overview: `${baseTitle} by ${authorName}.`,
        director: authorName,
        totalUnits: isComic ? (editionIssueCounts?.digital ?? 12) : estimatedChapters,
        totalUnitsEstimated: isComic ? !editionIssueCounts?.digital : true,
        editionCovers,
        editionIssueCounts,
        editionVariants,
        popularity: realReaders,
        popularityScore,
      });
    }

    return collapsed
      .sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export interface ComicEditionMetadata {
  covers: Partial<Record<ComicEditionId, string>>;
  issueCounts: Partial<Record<ComicEditionId, number>>;
  variants: Partial<Record<GeneralizedComicEditionId, string[]>>;
}

/** Fetches per-edition cover URLs and inferred/curated collected issue counts for a comic run. */
export async function fetchComicEditionMetadata(
  title: string,
  creator?: string
): Promise<ComicEditionMetadata> {
  const cleanTitle = stripEditionAffixes(title);
  const cleanQuery = cleanTitle.replace(/[,/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const targetKey = canonicalReadWorkKey(cleanTitle);
  const firstAuthor = creator && creator !== 'Author' ? creator.split(/[&,]/)[0]?.trim() : '';
  const query = firstAuthor ? `${cleanQuery} ${firstAuthor}` : cleanQuery;
  const spec = getKnownComicEditionSpec(cleanTitle);
  const issueCounts: Partial<Record<ComicEditionId, number>> = { ...(spec?.counts || {}) };
  const curatedCovers: Partial<Record<ComicEditionId, string>> = { ...(spec?.covers || {}) };
  const variants: Partial<Record<GeneralizedComicEditionId, string[]>> = {};
  const allowedSet = spec ? new Set<GeneralizedComicEditionId>(spec.availableEditions) : null;

  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&language=eng&limit=18&fields=key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median`
    );
    if (!res.ok) return { covers: curatedCovers, issueCounts, variants };
    const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
    const allWorkMatches = (data.docs || []).filter((d) => {
      if (!d.title) return false;
      const fullTitle = combinedOpenLibraryTitle(d);
      return !hasNonLatinScript(fullTitle) && canonicalReadWorkKey(fullTitle) === targetKey;
    });
    const matching = allWorkMatches.filter((d) => Boolean(d.cover_i));
    if (allWorkMatches.length === 0) return { covers: curatedCovers, issueCounts, variants };

    const years = allWorkMatches
      .map((d) => d.first_publish_year)
      .filter((y): y is number => typeof y === 'number' && y > 1900);
    const earliestYear = years.length > 0 ? Math.min(...years) : 2020;
    const primary = [...allWorkMatches].sort((a, b) => {
      const aWrap = /\b(vol\.?|volume|absolute|deluxe|omnibus|compact)\b/i.test(a.title) ? 1 : 0;
      const bWrap = /\b(vol\.?|volume|absolute|deluxe|omnibus|compact)\b/i.test(b.title) ? 1 : 0;
      if (aWrap !== bWrap) return aWrap - bWrap;
      return (a.first_publish_year || 9999) - (b.first_publish_year || 9999);
    })[0];
    const primaryWithCover = matching[0];
    const primaryCover = primaryWithCover?.cover_i
      ? `https://covers.openlibrary.org/b/id/${primaryWithCover.cover_i}-L.jpg`
      : '';
    const built = buildComicEditionCovers(matching, earliestYear, primaryCover, cleanTitle);
    const covers = built.covers;
    for (const [k, tags] of Object.entries(built.variants) as Array<
      [GeneralizedComicEditionId, string[]]
    >) {
      for (const tag of tags) recordVariantTag(variants, k, tag);
    }

    for (const d of allWorkMatches) {
      const classified = classifyRawComicEdition(
        combinedOpenLibraryTitle(d),
        undefined,
        d.first_publish_year,
        earliestYear,
        true
      );
      const ed = classified.edition;
      if (allowedSet && !allowedSet.has(ed)) continue;
      recordVariantTag(variants, ed, classified.variantTag);
      const inferred = parseCollectedIssueCount(d.subtitle, d.number_of_pages_median);
      if (!issueCounts[ed] && inferred) {
        issueCounts[ed] = inferred;
      }
    }

    if (primary?.key?.startsWith('/works/')) {
      try {
        const edRes = await fetch(`https://openlibrary.org${primary.key}/editions.json?limit=35`);
        if (edRes.ok) {
          const edData = (await edRes.json()) as {
            entries?: Array<{
              title?: string;
              subtitle?: string;
              description?: string | { value?: string };
              publish_date?: string;
              physical_format?: string;
              number_of_pages?: number;
              covers?: number[];
            }>;
          };
          for (const e of edData.entries || []) {
            const yearMatch = (e.publish_date || '').match(/\b(19\d\d|20\d\d)\b/);
            const pubYear = yearMatch ? Number(yearMatch[1]) : undefined;
            const classified = classifyRawComicEdition(
              `${e.title || ''} ${e.subtitle || ''}`,
              e.physical_format,
              pubYear,
              earliestYear,
              true
            );
            const ed = classified.edition;
            if (allowedSet && !allowedSet.has(ed)) continue;
            recordVariantTag(variants, ed, classified.variantTag);

            const coverId = e.covers?.find((c) => c > 0);
            if (coverId && !curatedCovers[ed]) {
              const url = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
              if (!covers[ed] || ed === 'hardcover') {
                covers[ed] = covers[ed] || url;
              }
            }

            const descText =
              typeof e.description === 'string' ? e.description : e.description?.value || '';
            const inferred = parseCollectedIssueCount(
              `${e.subtitle || ''} ${descText}`,
              e.number_of_pages
            );
            if (!issueCounts[ed] && inferred) {
              issueCounts[ed] = inferred;
            }
          }
        }
      } catch {
        // ignore editions fallback failure
      }
    }

    const mergedCovers: Partial<Record<ComicEditionId, string>> = { ...covers, ...curatedCovers };
    if (allowedSet) {
      for (const key of Object.keys(mergedCovers) as GeneralizedComicEditionId[]) {
        if (!allowedSet.has(key)) delete mergedCovers[key];
      }
      for (const key of Object.keys(issueCounts) as GeneralizedComicEditionId[]) {
        if (!allowedSet.has(key)) delete issueCounts[key];
      }
      for (const key of Object.keys(variants) as GeneralizedComicEditionId[]) {
        if (!allowedSet.has(key)) delete variants[key];
      }
    }

    return { covers: mergedCovers, issueCounts, variants };
  } catch {
    return { covers: curatedCovers, issueCounts, variants };
  }
}

export async function fetchComicEditionCovers(
  title: string,
  creator?: string
): Promise<Partial<Record<ComicEditionId, string>>> {
  const { covers } = await fetchComicEditionMetadata(title, creator);
  return covers;
}

function buildShortEditionLabel(
  format: ComicEditionFormat,
  rawTitle: string,
  subtitle: string | undefined,
  isDc: boolean
): string {
  const combined = `${rawTitle} ${subtitle || ''}`.trim();
  if (format === 'compact') {
    return /dc\s*compact/i.test(combined) || isDc ? 'DC Compact TPB' : 'Compact TPB';
  }
  if (format === 'omnibus') {
    const vol = combined.match(/\b(vol\.?|volume)\s*(\d+)/i);
    return vol ? `Omnibus Vol. ${vol[2]}` : 'Omnibus';
  }
  if (format === 'absolute') {
    const vol = combined.match(/\b(vol\.?|volume)\s*(\d+)/i);
    return vol ? `Absolute Vol. ${vol[2]}` : 'Absolute HC';
  }
  if (format === 'deluxe') {
    return /anniversary/i.test(combined) ? 'Anniversary HC' : 'Deluxe HC';
  }
  if (format === 'tpb') {
    const vol = rawTitle.match(/\b(vol\.?|volume)\s*(\d+)/i);
    if (vol) {
      const subClean = subtitle?.trim();
      if (subClean && subClean.length <= 24 && !/edition|paperback|tpb/i.test(subClean)) {
        return `Vol. ${vol[2]}: ${subClean}`;
      }
      return `Vol. ${vol[2]} TPB`;
    }
  }
  if (format === 'hardcover') {
    const vol = rawTitle.match(/\b(vol\.?|volume)\s*(\d+)/i);
    if (vol) return `Vol. ${vol[2]} HC`;
  }
  return getComicEditionFormatLabel(format, isDc);
}

/** Fetches curated + live OpenLibrary / PRH detailed edition records across all matching works of a comic. */
export async function fetchComicEditionsCatalog(
  title: string,
  creator?: string,
  baseCover?: string,
  baseTotalUnits?: number
): Promise<ComicEditionRecord[]> {
  const cleanTitle = stripEditionAffixes(title);
  const cleanQuery = cleanTitle.replace(/[,/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const targetKey = canonicalReadWorkKey(cleanTitle);
  const firstAuthor = creator && creator !== 'Author' ? creator.split(/[&,]/)[0]?.trim() : '';
  const mainQ = firstAuthor ? `${cleanQuery} ${firstAuthor}` : cleanQuery;
  const spec = getKnownComicEditionSpec(cleanTitle);
  const curated = spec?.editions ? [...spec.editions] : [];
  const defaultUnits = Math.max(1, spec?.counts.digital ?? baseTotalUnits ?? 12);
  const hayDc = `${cleanTitle} ${creator || ''}`.toLowerCase();
  const isDc =
    hayDc.includes('dc') ||
    hayDc.includes('superman') ||
    hayDc.includes('batman') ||
    hayDc.includes('flash') ||
    hayDc.includes('watchmen') ||
    hayDc.includes('wonder woman') ||
    hayDc.includes('jeph loeb') ||
    Boolean(spec);

  const liveRecords: ComicEditionRecord[] = [];

  try {
    const fields =
      'key,title,subtitle,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,publisher';
    const [mainRes, compactRes, appleRes] = await Promise.allSettled([
      fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(mainQ)}&language=eng&limit=25&fields=${fields}`
      ),
      fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(`${cleanQuery} compact`)}&language=eng&limit=8&fields=${fields}`
      ),
      fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=ebook&limit=12`
      ),
    ]);

    if (appleRes.status === 'fulfilled' && appleRes.value.ok) {
      try {
        const itJson = (await appleRes.value.json()) as {
          results?: Array<{
            trackId?: number;
            trackName?: string;
            artistName?: string;
            releaseDate?: string;
            artworkUrl100?: string;
            primaryGenreName?: string;
            genres?: string[];
          }>;
        };
        for (const book of itJson.results || []) {
          const bTitle = (book.trackName || '').trim();
          const genresAll = [book.primaryGenreName || '', ...(book.genres || [])].join(' ');
          if (!bTitle || !/comic|graphic novel/i.test(genresAll)) continue;
          const baseKey = canonicalReadWorkKey(bTitle);
          if (baseKey !== targetKey && !normalizeTitleKey(bTitle).includes(targetKey)) continue;
          if (!/\b(vol\.?|volume|omnibus|compact|deluxe|absolute|tpb|hardcover|book\s+\d+)\b/i.test(bTitle)) {
            continue;
          }
          const pubYear = book.releaseDate ? Number(book.releaseDate.slice(0, 4)) : undefined;
          const classified = classifyDetailedComicEdition(
            bTitle,
            undefined,
            pubYear,
            pubYear || 2020,
            isDc
          );
          const coverUrl = book.artworkUrl100 ? upscaleAppleArtwork(book.artworkUrl100) : undefined;
          liveRecords.push({
            id: `itunes-tpb-${book.trackId || bTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            format: classified.format,
            category: classified.category,
            title: formatDisplayTitle(bTitle),
            shortLabel: buildShortEditionLabel(classified.format, bTitle, undefined, isDc),
            subtitle: book.artistName || undefined,
            issueCount: classified.format === 'omnibus' ? 30 : 6,
            coverUrl,
            year: pubYear,
            source: 'openlibrary',
          });
        }
      } catch {
        // ignore iTunes ebook parse errors
      }
    }

    const rawDocs: OpenLibraryDoc[] = [];
    for (const r of [mainRes, compactRes]) {
      if (r.status === 'fulfilled' && r.value.ok) {
        const json = (await r.value.json()) as { docs?: OpenLibraryDoc[] };
        for (const d of json.docs || []) rawDocs.push(d);
      }
    }

    // Deduplicate docs across parallel searches while keeping works without cover_i
    const uniqueDocMap = new Map<string, OpenLibraryDoc>();
    for (const d of rawDocs) {
      if (!d.title) continue;
      const fullTitle = combinedOpenLibraryTitle(d);
      if (hasNonLatinScript(fullTitle)) continue;
      const lowerTitle = fullTitle.toLowerCase();
      if (
        lowerTitle.includes('coloring book') ||
        lowerTitle.includes('activity book') ||
        lowerTitle.includes('sticker book') ||
        lowerTitle.includes('study guide') ||
        lowerTitle.includes('summary of')
      ) {
        continue;
      }
      const docKey = canonicalReadWorkKey(fullTitle);
      const normTitle = normalizeTitleKey(fullTitle);
      const matchesWork =
        docKey === targetKey || (targetKey.length >= 4 && normTitle.startsWith(`${targetKey} `));
      if (!matchesWork) continue;

      const dedupeKey = `${d.key}::${d.title.toLowerCase()}::${(d.subtitle || '').toLowerCase()}`;
      if (!uniqueDocMap.has(dedupeKey)) {
        uniqueDocMap.set(dedupeKey, d);
      }
    }

    const matchingDocs = Array.from(uniqueDocMap.values());
    if (matchingDocs.length > 0) {
      const years = matchingDocs
        .map((d) => d.first_publish_year)
        .filter((y): y is number => typeof y === 'number' && y > 1900);
      const earliestYear = years.length > 0 ? Math.min(...years) : 2020;

      // Prioritize canonical early work, recent >=2024 printings, and explicit special formats (<=4 works)
      const workMap = new Map<string, { workKey: string; score: number }>();
      for (const d of matchingDocs) {
        if (!d.key?.startsWith('/works/')) continue;
        const text = `${d.title} ${d.subtitle || ''}`.toLowerCase();
        let score = 0;
        if (d.first_publish_year && d.first_publish_year >= 2024) score += 40;
        if (/\b(compact|omnibus|absolute|deluxe|vol\.?\s*1)\b/.test(text)) score += 30;
        if (!/\b(vol\.?|volume|absolute|deluxe|omnibus|compact)\b/.test(text)) score += 20;
        if (!d.cover_i && d.isbn?.some((i) => i.length === 13)) score += 15;
        const prev = workMap.get(d.key);
        if (!prev || score > prev.score) workMap.set(d.key, { workKey: d.key, score });
      }

      const selectedWorks = Array.from(workMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((w) => w.workKey);

      const workEditionsRes = await Promise.allSettled(
        selectedWorks.map((wk) => fetch(`https://openlibrary.org${wk}/editions.json?limit=25`))
      );

      for (const r of workEditionsRes) {
        if (r.status !== 'fulfilled' || !r.value.ok) continue;
        const edData = (await r.value.json()) as {
          entries?: Array<{
            key?: string;
            title?: string;
            subtitle?: string;
            description?: string | { value?: string };
            publish_date?: string;
            publishers?: string[];
            physical_format?: string;
            number_of_pages?: number;
            isbn_13?: string[];
            isbn_10?: string[];
            covers?: number[];
          }>;
        };

        for (const e of edData.entries || []) {
          const rawTitle = (e.title || cleanTitle).trim();
          const sub = e.subtitle?.trim();
          const fullText = sub && !rawTitle.toLowerCase().includes(sub.toLowerCase())
            ? `${rawTitle}: ${sub}`
            : rawTitle;
          if (hasNonLatinScript(fullText)) continue;
          if (/\b(dvd|bluray|book and dvd|audio)\b/i.test(fullText)) continue;

          const yearMatch = (e.publish_date || '').match(/\b(19\d\d|20\d\d)\b/);
          const pubYear = yearMatch ? Number(yearMatch[1]) : undefined;
          const isbn13 = (e.isbn_13 || [])
            .map((s) => s.replace(/[^0-9X]/gi, '').toUpperCase())
            .find((s) => /^97[89]\d{10}$/.test(s));

          let classified = classifyDetailedComicEdition(
            fullText,
            e.physical_format,
            pubYear,
            earliestYear,
            isDc
          );
          if (
            isbn13 &&
            (isbn13.startsWith('9781779527') ||
              (isbn13.startsWith('978179950') && /compact/i.test(`${rawTitle} ${sub || ''}`)))
          ) {
            classified = {
              format: 'compact',
              category: 'compact',
              variantTag: 'DC Compact',
            };
          }

          const descText =
            typeof e.description === 'string' ? e.description : e.description?.value || '';
          const inferredCount =
            parseCollectedIssueCount(`${sub || ''} ${descText}`, e.number_of_pages) ?? defaultUnits;
          const coverId = e.covers?.find((c) => c > 0);
          const coverUrl = resolveOpenLibraryCoverFromIsbn(
            isbn13 ? [isbn13] : undefined,
            coverId
          );

          if (!coverUrl && !isbn13 && !e.number_of_pages) continue;
          const cleanEdId = (e.key || `ol-${rawTitle}-${pubYear || 'x'}-${isbn13 || ''}`)
            .replace('/books/', 'ol-book-')
            .replace(/[^a-zA-Z0-9_-]/g, '-');

          liveRecords.push({
            id: cleanEdId,
            format: classified.format,
            category: classified.category,
            title: formatDisplayTitle(fullText),
            shortLabel: buildShortEditionLabel(classified.format, rawTitle, sub, isDc),
            subtitle:
              sub && sub.toLowerCase() !== rawTitle.toLowerCase()
                ? sub
                : descText
                  ? descText.slice(0, 90)
                  : undefined,
            issueCount: inferredCount,
            coverUrl,
            year: pubYear,
            publisher: e.publishers?.[0],
            isbn: isbn13,
            pageCount: e.number_of_pages,
            source: 'openlibrary',
          });
        }
      }

      // Also convert matching search docs directly so multi-work entries without editions.json data stay visible
      for (const d of matchingDocs) {
        const sub = d.subtitle?.trim();
        const fullText = combinedOpenLibraryTitle(d);
        const isbn13 = (d.isbn || [])
          .map((s) => s.replace(/[^0-9X]/gi, '').toUpperCase())
          .find((s) => /^97[89]\d{10}$/.test(s));
        let classified = classifyDetailedComicEdition(
          fullText,
          undefined,
          d.first_publish_year,
          earliestYear,
          isDc
        );
        if (
          isbn13 &&
          (isbn13.startsWith('9781779527') ||
            (isbn13.startsWith('978179950') &&
              d.first_publish_year &&
              d.first_publish_year >= 2025 &&
              !/omnibus|absolute|finest|deluxe/i.test(fullText)))
        ) {
          classified = { format: 'compact', category: 'compact', variantTag: 'DC Compact' };
        }
        const inferredCount =
          parseCollectedIssueCount(sub, d.number_of_pages_median) ?? defaultUnits;
        const coverUrl = resolveOpenLibraryCoverFromIsbn(d.isbn, d.cover_i);
        const cleanDocId = `${d.key.replace('/works/', 'ol-work-')}-${classified.format}-${isbn13 || d.first_publish_year || 'x'}`;

        liveRecords.push({
          id: cleanDocId,
          format: classified.format,
          category: classified.category,
          title: formatDisplayTitle(fullText),
          shortLabel: buildShortEditionLabel(classified.format, d.title, sub, isDc),
          subtitle: sub || (inferredCount !== defaultUnits ? `~${inferredCount} issues` : undefined),
          issueCount: inferredCount,
          coverUrl,
          year: d.first_publish_year,
          publisher: d.publisher?.[0],
          isbn: isbn13,
          pageCount: d.number_of_pages_median,
          source: 'openlibrary',
        });
      }
    }
  } catch {
    // gracefully fall back to curated/baseline catalog below
  }

  // Avoid generic live duplicates colliding with verified curated entries of the same format+count
  const curatedSigSet = new Set(curated.map((c) => `${c.format}::${c.issueCount}`));
  const filteredLive = liveRecords.filter((rec) => {
    if (rec.format === 'digital') return false;
    if (
      curatedSigSet.has(`${rec.format}::${rec.issueCount}`) &&
      (!rec.isbn || curated.some((c) => c.isbn === rec.isbn || c.format === rec.format))
    ) {
      return false;
    }
    return true;
  });

  let combined = mergeComicEditionCatalog(curated, filteredLive);
  if (!combined.some((r) => r.format === 'digital')) {
    combined = mergeComicEditionCatalog(
      [
        {
          id: 'baseline-digital',
          format: 'digital',
          category: 'digital',
          title: `${formatDisplayTitle(cleanTitle)} — Single Issues & Digital`,
          shortLabel: 'Digital / Issues',
          subtitle: 'Individual issues',
          issueCount: defaultUnits,
          coverUrl: baseCover,
          source: 'curated',
        },
      ],
      combined
    );
  }
  return combined;
}

async function searchComicSeries(query: string): Promise<LiveSearchResult[]> {
  try {
    const res = await fetch(`/api/comic-series?q=${encodeURIComponent(query)}&v=4`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        wiki: ComicWikiSlug;
        volTitle: string;
        volNumber: number;
        title: string;
        publisher: string;
        startYear: number;
        isOngoing: boolean;
        runLabel: string;
        issueCount: number;
        coverUrl: string;
        creator: string;
        genres: string[];
        overview: string;
        comicKind?: 'series' | 'collection';
        collectionPageTitle?: string;
      }>;
    };
    return (data.items || [])
      .filter((it) => it.title && it.coverUrl)
      .map((it) => ({
        domain: 'read' as const,
        kind: 'read' as const,
        id: it.id,
        source: 'comicseries' as const,
        externalId: it.collectionPageTitle || it.volTitle,
        title: it.title,
        subtitle: `${it.runLabel} · ${it.publisher} · ${it.issueCount} ${
          it.issueCount === 1 ? 'issue' : 'issues'
        }`,
        year: it.startYear,
        mediaType: 'comic' as const,
        comicKind: it.comicKind || 'series',
        comicRunLabel: it.runLabel,
        comicPublisher: it.publisher,
        comicSeriesWiki: it.wiki,
        comicSeriesVolTitle: it.collectionPageTitle || it.volTitle,
        genres: it.genres.length > 0 ? it.genres : ['Superhero'],
        rating: 4.7,
        posterUrl: it.coverUrl,
        backdropUrl: it.coverUrl,
        overview: it.overview,
        director: it.creator || it.publisher,
        totalUnits: it.issueCount,
        popularityScore: it.comicKind === 'collection' ? 92 : it.isOngoing ? 90 : 86,
      }));
  } catch {
    return [];
  }
}

export const COMIC_ISSUE_CACHE_VERSION = 'ca9';

export async function fetchComicSeriesIssues(
  wiki: ComicWikiSlug,
  volTitle: string,
  limit = 90
): Promise<{ totalIssues: number; issues: Record<number, ComicIssueMeta> }> {
  try {
    const res = await fetch(
      `/api/comic-series?wiki=${encodeURIComponent(wiki)}&vol=${encodeURIComponent(
        volTitle
      )}&limit=${Math.max(1, Math.min(120, Math.round(limit)))}&v=5`,
      { signal: AbortSignal.timeout(14000) }
    );
    if (!res.ok) return { totalIssues: 0, issues: {} };
    const data = (await res.json()) as {
      totalIssues?: number;
      issues?: Record<number, ComicIssueMeta>;
    };
    return {
      totalIssues: data.totalIssues || Object.keys(data.issues || {}).length,
      issues: data.issues || {},
    };
  } catch {
    return { totalIssues: 0, issues: {} };
  }
}

/** Resolves individual atomic issues & covers inside any Omnibus, TPB, Hardcover, or ISBN edition. */
export async function fetchComicCollectionIssues(params: {
  title: string;
  isbn?: string;
  overview?: string;
  publisher?: string;
  wiki?: ComicWikiSlug;
  pageTitle?: string;
  limit?: number;
}): Promise<{
  totalIssues: number;
  wiki?: 'marvel' | 'dc' | 'imagecomics';
  collectionPageTitle?: string;
  coverUrl?: string;
  publisher?: string;
  year?: number;
  issues: Record<number, ComicIssueMeta>;
}> {
  try {
    const qs = new URLSearchParams({
      mode: 'collection',
      title: params.title,
      limit: String(Math.max(1, Math.min(120, Math.round(params.limit || 100)))),
      v: '2',
    });
    if (params.isbn) qs.set('isbn', params.isbn);
    if (params.publisher) qs.set('publisher', params.publisher);
    if (params.wiki) qs.set('wiki', params.wiki);
    if (params.pageTitle) qs.set('pageTitle', params.pageTitle);
    if (params.overview) qs.set('overview', params.overview.slice(0, 800));

    const res = await fetch(`/api/comic-series?${qs.toString()}`, {
      signal: AbortSignal.timeout(18000),
    });
    if (!res.ok) return { totalIssues: 0, issues: {} };
    const data = (await res.json()) as {
      totalIssues?: number;
      wiki?: 'marvel' | 'dc' | 'imagecomics';
      collectionPageTitle?: string;
      coverUrl?: string;
      publisher?: string;
      year?: number;
      issues?: Record<number, ComicIssueMeta>;
    };
    return {
      totalIssues: data.totalIssues || Object.keys(data.issues || {}).length,
      wiki: data.wiki,
      collectionPageTitle: data.collectionPageTitle,
      coverUrl: data.coverUrl,
      publisher: data.publisher,
      year: data.year,
      issues: data.issues || {},
    };
  } catch {
    return { totalIssues: 0, issues: {} };
  }
}

async function searchAniListManga(query: string): Promise<LiveSearchResult[]> {
  const queryIsLatin = !hasNonLatinScript(query);
  try {
    const gql = `query($s:String){Page(perPage:12){media(search:$s,type:MANGA,sort:[POPULARITY_DESC]){id format title{english romaji} coverImage{extraLarge large} bannerImage chapters startDate{year} genres averageScore popularity description(asHtml:false) staff(perPage:1){nodes{name{full}}}}}}`;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { s: query } }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        Page?: {
          media?: Array<{
            id: number;
            format?: string;
            title?: { english?: string; romaji?: string };
            coverImage?: { extraLarge?: string; large?: string };
            bannerImage?: string;
            chapters?: number;
            startDate?: { year?: number };
            genres?: string[];
            averageScore?: number;
            popularity?: number;
            description?: string;
            staff?: { nodes?: Array<{ name?: { full?: string } }> };
          }>;
        };
      };
    };

    return (json.data?.Page?.media || [])
      .map((m) => {
        const title = m.title?.english || m.title?.romaji || '';
        const cover = m.coverImage?.extraLarge || m.coverImage?.large || '';
        const author = m.staff?.nodes?.[0]?.name?.full || 'Author';
        const isNovel = m.format === 'NOVEL';
        const popRaw = m.popularity || 0;
        const popularityScore = Math.min(100, Math.round(Math.log10(Math.max(1, popRaw)) * 17));
        return {
          domain: 'read' as const,
          kind: 'read' as const,
          id: `al-manga-${m.id}`,
          source: 'anilist' as const,
          externalId: m.id,
          title,
          subtitle: author,
          year: m.startDate?.year || 2020,
          mediaType: isNovel ? ('novel' as const) : ('manga' as const),
          genres: m.genres?.length ? m.genres.slice(0, 2) : [isNovel ? 'Light Novel' : 'Manga'],
          rating: m.averageScore ? Number((m.averageScore / 20).toFixed(1)) : 4.5,
          posterUrl: cover,
          backdropUrl: m.bannerImage || cover,
          overview: stripHtml(m.description) || `${title} series.`,
          director: author,
          totalUnits: m.chapters || (isNovel ? 18 : 100),
          totalUnitsEstimated: !m.chapters,
          popularity: popRaw,
          popularityScore,
        };
      })
      .filter((m) => m.title && (!queryIsLatin || !hasNonLatinScript(m.title)));
  } catch {
    return [];
  }
}

async function searchGames(query: string): Promise<LiveSearchResult[]> {
  const results: LiveSearchResult[] = [];
  const fetchIgdb = async (): Promise<LiveSearchResult[]> => {
    try {
      if (!(await checkServerIgdbConfigured())) return [];
      const res = await fetch(
        `/api/igdb?action=search&q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return [];
      const json = (await res.json()) as {
        configured?: boolean;
        items?: Array<{
          id: string;
          igdbId: number;
          title: string;
          year: number;
          rating: number;
          posterUrl: string;
          backdropUrl: string;
          overview: string;
          developer?: string;
          platforms?: string[];
          genres?: string[];
          franchise?: string;
          subtitle?: string;
          popularityScore?: number;
        }>;
      };
      if (!json.configured || !Array.isArray(json.items)) return [];
      return json.items.map((g) => ({
        domain: 'play' as const,
        kind: 'game' as const,
        id: g.id,
        source: 'igdb' as const,
        externalId: g.igdbId,
        igdbId: g.igdbId,
        title: g.title,
        subtitle: g.subtitle || g.platforms?.slice(0, 2).join(' · ') || 'Video Game',
        year: g.year,
        mediaType: 'game' as const,
        genres: g.genres?.length ? g.genres : ['Video Game'],
        rating: g.rating,
        posterUrl: g.posterUrl,
        backdropUrl: g.backdropUrl || g.posterUrl,
        overview: g.overview,
        director: g.developer,
        franchise: g.franchise,
        platforms: g.platforms,
        popularityScore: g.popularityScore,
      }));
    } catch {
      return [];
    }
  };

  const fetchCheapShark = async (): Promise<LiveSearchResult[]> => {
    const out: LiveSearchResult[] = [];
    try {
      const res = await fetch(
        `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=10`
      );
      if (!res.ok) return out;
      const data = (await res.json()) as Array<{
        gameID: string;
        steamAppID?: string | null;
        external: string;
        thumb: string;
      }>;
      const seen = new Set<string>();
      for (const g of data) {
        if (!g.steamAppID || seen.has(g.steamAppID)) continue;
        seen.add(g.steamAppID);
        const appId = Number(g.steamAppID);
        const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`;
        const header = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
        const idx = out.length;
        const popularityScore = Math.max(
          46,
          68 - idx * 4 + (lookupKnownGameChapters(g.external) ? 10 : 0)
        );
        out.push({
          domain: 'play',
          kind: 'game',
          id: `steam-${appId}`,
          source: 'cheapshark',
          externalId: appId,
          steamAppId: appId,
          title: g.external,
          subtitle: 'PC · Steam',
          year: 2023,
          mediaType: 'game',
          genres: ['Video Game'],
          rating: 4.5,
          posterUrl: cover,
          backdropUrl: header,
          overview: `${g.external} — tracked in your Play log.`,
          popularityScore,
        });
        if (out.length >= 6) break;
      }
    } catch {
      // ignore
    }
    return out;
  };

  const [igdbRes, wikiRes, csRes] = await Promise.allSettled([
    fetchIgdb(),
    searchWikipediaSummary(query, 'game'),
    fetchCheapShark(),
  ]);

  if (igdbRes.status === 'fulfilled') {
    for (const item of igdbRes.value) {
      results.push(item);
    }
  }
  if (wikiRes.status === 'fulfilled' && wikiRes.value) {
    if (!results.some((r) => normalizeTitleKey(r.title) === normalizeTitleKey(wikiRes.value!.title))) {
      results.push(wikiRes.value);
    }
  }
  if (csRes.status === 'fulfilled') {
    for (const item of csRes.value) {
      if (!results.some((r) => normalizeTitleKey(r.title) === normalizeTitleKey(item.title))) {
        results.push(item);
      }
    }
  }

  return results;
}

async function searchWikipediaSummary(
  query: string,
  target: 'film' | 'game'
): Promise<LiveSearchResult | null> {
  const candidates: string[] = [];

  try {
    const srSuffix = target === 'film' ? 'film' : 'video game';
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${query} ${srSuffix}`
      )}&format=json&origin=*&srlimit=4`
    );
    if (searchRes.ok) {
      const searchJson = (await searchRes.json()) as {
        query?: { search?: Array<{ title?: string }> };
      };
      for (const hit of searchJson.query?.search || []) {
        if (hit.title) {
          const slug = hit.title.replace(/\s+/g, '_');
          if (!candidates.includes(slug)) candidates.push(slug);
        }
      }
    }
  } catch {
    // fall back to direct slug guesses
  }

  const titleCased = query
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : ''))
    .join('_');

  const directSlugs =
    target === 'film' ? [`${titleCased}_(film)`, titleCased] : [`${titleCased}_(video_game)`, titleCased];
  for (const s of directSlugs) {
    if (!candidates.includes(s)) candidates.push(s);
  }

  for (const slug of candidates.slice(0, 5)) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        pageid?: number;
        title?: string;
        description?: string;
        extract?: string;
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
      };
      const desc = (data.description || '').toLowerCase();
      if (target === 'film' && !desc.includes('film') && !desc.includes('movie')) continue;
      if (target === 'game' && !desc.includes('video game') && !desc.includes('game')) continue;

      const yearMatch = (data.description || data.extract || '').match(/\b(19\d\d|20\d\d)\b/);
      const parsedYear = yearMatch ? Number(yearMatch[1]) : 2023;
      const poster = data.originalimage?.source || data.thumbnail?.source || '';
      if (!poster) continue;

      if (target === 'game') {
        const cleanGameTitle = (data.title || query).replace(/\s*\([^)]*video game\)$/i, '');
        const isExactGame = normalizeTitleKey(cleanGameTitle) === normalizeTitleKey(query);
        const isRecentOrExact = parsedYear >= 2005 || isExactGame;
        return {
          domain: 'play',
          kind: 'game',
          id: `wiki-game-${data.pageid || slug}`,
          source: 'wikipedia',
          externalId: data.pageid || Date.now(),
          title: cleanGameTitle,
          subtitle: data.description || 'Video Game',
          year: parsedYear,
          mediaType: 'game',
          genres: ['Video Game'],
          rating: 4.6,
          posterUrl: poster,
          backdropUrl: poster,
          overview: data.extract || data.description || '',
          popularity: 30000,
          popularityScore: isRecentOrExact ? 72 : 54,
        };
      }

      const cleanFilmTitle = (data.title || query).replace(/\s*\([^)]*film\)$/i, '');
      const isExactFilm = normalizeTitleKey(cleanFilmTitle) === normalizeTitleKey(query);
      return {
        domain: 'watch',
        kind: 'movie',
        id: `wiki-${data.pageid || slug}`,
        source: 'itunes',
        externalId: data.pageid || Date.now(),
        title: cleanFilmTitle,
        year: yearMatch ? parsedYear : 2024,
        mediaType: 'movie',
        genres: ['Feature Film'],
        rating: 8.2,
        posterUrl: poster,
        backdropUrl: poster,
        overview: data.extract || data.description || '',
        director: data.description || 'Feature Film',
        runtime: 135,
        popularity: 30000,
        popularityScore: isExactFilm ? 82 : 70,
      };
    } catch {
      // try next
    }
  }
  return null;
}

export interface GameChapterLookupResponse {
  found: boolean;
  totalChapters?: number;
  unit?: ChapterUnit;
  source?: ChapterSource;
  note?: string;
}

export interface GameChapterSuggestResponse {
  found: boolean;
  unit: ChapterUnit;
  source?: 'catalog' | 'fandom' | 'wikipedia' | 'web';
  sourceLabel?: string;
  note?: string;
  chapters: string[];
}

/** Suggests named story chapters/missions for a game from Cue's curated list or live Fandom/StrategyWiki lookup. */
export async function fetchGameChapterSuggestions(
  title: string
): Promise<GameChapterSuggestResponse> {
  const norm = normalizeGameTitleKey(title);
  const rawLower = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const knownTitles =
    KNOWN_GAME_CHAPTER_TITLES[rawLower] ||
    KNOWN_GAME_CHAPTER_TITLES[norm] ||
    Object.entries(KNOWN_GAME_CHAPTER_TITLES).find(
      ([k]) =>
        (rawLower.startsWith(`${k} `) || norm.startsWith(`${k} `)) &&
        !/^(?:\d+|ii|iii|iv|v|vi|x|part|rebirth)\b/i.test(norm.slice(k.length + 1))
    )?.[1];

  const curated = lookupKnownGameChapters(title);
  if (knownTitles && knownTitles.length >= 2) {
    return {
      found: true,
      unit: curated?.unit || 'chapters',
      source: 'catalog',
      sourceLabel: 'Cue Catalog',
      note: curated?.note || `${knownTitles.length} official ${curated?.unit || 'chapters'}`,
      chapters: knownTitles.map((c) => c.title),
    };
  }

  try {
    const res = await fetch(`/api/game-chapters?mode=suggest&title=${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = (await res.json()) as GameChapterSuggestResponse;
      if (data && Array.isArray(data.chapters)) {
        return data;
      }
    }
  } catch {
    // fall through
  }

  if (curated) {
    const single = curated.unit === 'missions' ? 'Mission' : curated.unit === 'acts' ? 'Act' : 'Chapter';
    return {
      found: true,
      unit: curated.unit,
      source: 'catalog',
      sourceLabel: 'Cue Catalog',
      note: curated.note,
      chapters: Array.from({ length: curated.totalChapters }, (_, i) => `${single} ${i + 1}`),
    };
  }

  return { found: false, unit: 'chapters', chapters: [] };
}

/** Auto-detects total story chapters/acts/missions for a game via catalog, /api/game-chapters, or Wikipedia CORS fallback. */
export async function fetchGameChapterInfo(title: string): Promise<GameChapterLookupResponse> {
  const curated = lookupKnownGameChapters(title);
  if (curated) {
    return {
      found: true,
      totalChapters: curated.totalChapters,
      unit: curated.unit,
      source: 'catalog',
      note: curated.note,
    };
  }

  try {
    const res = await fetch(`/api/game-chapters?title=${encodeURIComponent(title)}`);
    if (res.ok) {
      const data = (await res.json()) as GameChapterLookupResponse;
      if (data.found && typeof data.totalChapters === 'number' && data.totalChapters >= 2) {
        return data;
      }
    }
  } catch {
    // local dev without serverless route falls through to client Wikipedia lookup
  }

  try {
    const srRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        `${title} video game`
      )}&format=json&origin=*&srlimit=3`
    );
    if (!srRes.ok) return { found: false };
    const srJson = (await srRes.json()) as {
      query?: { search?: Array<{ pageid: number; title: string }> };
    };
    const hit = srJson.query?.search?.[0];
    if (!hit) return { found: false };

    const exRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=${hit.pageid}&format=json&origin=*`
    );
    if (!exRes.ok) return { found: false };
    const exJson = (await exRes.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const extract = exJson.query?.pages?.[String(hit.pageid)]?.extract || '';
    const parsed = parseChapterCountFromText(extract);
    if (parsed) {
      return {
        found: true,
        totalChapters: parsed.totalChapters,
        unit: parsed.unit,
        source: 'wikipedia',
        note: `Detected from Wikipedia (${hit.title})`,
      };
    }
  } catch {
    // ignore network failure
  }

  return { found: false };
}

async function searchTmdbMulti(query: string, apiKey?: string): Promise<LiveSearchResult[]> {
  const cleanKey = apiKey?.trim();
  const url =
    cleanKey && cleanKey.length > 8
      ? `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(
          query
        )}&api_key=${encodeURIComponent(cleanKey)}`
      : `/api/tmdb?action=search&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB search failed');
  const data = (await res.json()) as {
    results?: Array<{
      id: number;
      media_type: string;
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string;
      backdrop_path?: string;
      overview?: string;
      vote_average?: number;
      vote_count?: number;
      original_language?: string;
      genre_ids?: number[];
      popularity?: number;
    }>;
  };

  return (data.results || [])
    .filter((r) => r.media_type === 'tv' || r.media_type === 'movie')
    .slice(0, 12)
    .map((r) => {
      const isMovie = r.media_type === 'movie';
      const poster = r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '';
      const backdrop = r.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}`
        : poster;
      const dateStr = r.release_date || r.first_air_date || '';
      const tmdbSignal = (r.vote_count || 0) * 15 + (r.popularity || 0) * 80;
      const popularityScore = Math.min(
        98,
        Math.round(Math.log10(Math.max(1, tmdbSignal)) * 18)
      );
      return {
        domain: 'watch' as const,
        kind: isMovie ? ('movie' as const) : ('show' as const),
        id: `tmdb-${r.media_type}-${r.id}`,
        source: 'tmdb' as const,
        externalId: r.id,
        title: r.title || r.name || 'Untitled',
        year: dateStr ? Number(dateStr.slice(0, 4)) : 2024,
        mediaType: isMovie ? ('movie' as const) : ('tv' as const),
        genres: mapTmdbGenres(r.genre_ids, r.original_language, isMovie),
        rating: r.vote_average ? Number(r.vote_average.toFixed(1)) : 7.8,
        posterUrl: poster,
        backdropUrl: backdrop,
        overview: r.overview || '',
        popularity: r.popularity ? r.popularity * 1000 : 25000,
        popularityScore,
      };
    });
}

export async function fetchTmdbMovieDetails(
  tmdbId: number,
  tmdbApiKey?: string
): Promise<Partial<Movie> | null> {
  if (!tmdbId) return null;
  try {
    const cleanKey = tmdbApiKey?.trim();
    let movieData: {
      runtime?: number;
      overview?: string;
      release_date?: string;
      poster_path?: string;
      backdrop_path?: string;
      genres?: Array<{ name: string }>;
      credits?: {
        cast?: Array<{
          id: number;
          name: string;
          character: string;
          profile_path?: string;
        }>;
        crew?: Array<{ job?: string; name?: string }>;
      };
      videos?: {
        results?: Array<{ site?: string; type?: string; key?: string; official?: boolean }>;
      };
    } | null = null;
    let directorFromProxy: string | undefined;
    let trailerFromProxy: string | undefined;

    if (cleanKey && cleanKey.length > 8) {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(
          cleanKey
        )}&append_to_response=credits,videos`
      );
      if (res.ok) movieData = await res.json();
    } else if (await checkServerTmdbConfigured()) {
      const res = await fetch(`/api/tmdb?action=movie-detail&id=${tmdbId}`);
      if (res.ok) {
        const payload = (await res.json()) as {
          configured?: boolean;
          movie?: typeof movieData;
          director?: string;
          trailerUrl?: string;
        };
        if (payload.configured && payload.movie) {
          movieData = payload.movie;
          directorFromProxy = payload.director;
          trailerFromProxy = payload.trailerUrl;
        }
      }
    }

    if (!movieData) return null;

    const director =
      directorFromProxy ||
      movieData.credits?.crew?.find((c) => c.job === 'Director')?.name ||
      undefined;
    const cast: CastMember[] = (movieData.credits?.cast || [])
      .slice(0, 10)
      .map((c) => ({
        id: String(c.id),
        actor: c.name,
        character: c.character || c.name,
        avatarUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
      }));
    const vidList = movieData.videos?.results || [];
    const ytTrailer =
      vidList.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official && v.key) ||
      vidList.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.key) ||
      vidList.find((v) => v.site === 'YouTube' && v.key);
    const trailerUrl =
      trailerFromProxy ||
      (ytTrailer?.key ? `https://www.youtube.com/watch?v=${ytTrailer.key}` : undefined);

    return {
      ...(director ? { director } : {}),
      ...(movieData.runtime ? { runtime: movieData.runtime } : {}),
      ...(movieData.genres?.length
        ? { genres: movieData.genres.map((g) => g.name).slice(0, 3) }
        : {}),
      ...(cast.length > 0 ? { cast } : {}),
      ...(movieData.overview ? { overview: movieData.overview } : {}),
      ...(movieData.release_date ? { releaseDate: movieData.release_date } : {}),
      ...(movieData.poster_path
        ? { posterUrl: `https://image.tmdb.org/t/p/w500${movieData.poster_path}` }
        : {}),
      ...(movieData.backdrop_path
        ? { backdropUrl: `https://image.tmdb.org/t/p/w1280${movieData.backdrop_path}` }
        : {}),
      ...(trailerUrl ? { trailerUrl } : {}),
    };
  } catch {
    return null;
  }
}

export async function testTmdbConnection(apiKey: string): Promise<boolean> {
  const res = await fetch(
    `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey.trim())}`
  );
  return res.ok;
}

export async function hydrateLiveShow(item: LiveSearchResult, tmdbApiKey?: string): Promise<Show | Anime> {
  if (item.source === 'tmdb') {
    return hydrateTmdbShow(item, tmdbApiKey);
  }
  if (item.source === 'anilist') {
    const anilistId = Number(item.externalId) || undefined;
    const epCount = Math.max(1, Math.min(2500, item.anilistEpisodes || 12));
    const fallbackStill = item.backdropUrl || item.posterUrl;
    const details = await fetchAnimeEpisodeDetails(
      anilistId,
      item.title,
      epCount,
      fallbackStill,
      item.id
    );
    const episodes =
      details?.episodes && details.episodes.length > 0
        ? details.episodes
        : Array.from({ length: epCount }, (_, idx) => ({
            id: `${item.id}-s1e${idx + 1}`,
            season: 1,
            number: idx + 1,
            title: `Episode ${idx + 1}`,
            airdate: '',
            runtime: 24,
            stillUrl: fallbackStill,
            overview: '',
          }));
    const genres = [...(item.genres || [])];
    if (!genres.some((g) => g.toLowerCase() === 'anime')) {
      genres.unshift('Anime');
    }
    return {
      id: item.id,
      anilistId,
      title: item.title,
      year: item.year,
      genres,
      rating: item.rating,
      mediaType: 'tv',
      posterUrl: item.posterUrl,
      backdropUrl: fallbackStill,
      overview: item.overview,
      runtimeAvg: details?.runtimeAvg || 24,
      totalEpisodes: episodes.length,
      seasons: [
        {
          number: 1,
          episodes,
        },
      ],
      cast: details?.cast || [],
    };
  }
  return hydrateTvMazeShow(item);
}

interface AniZipEpisodeRaw {
  seasonNumber?: number;
  episodeNumber?: number;
  title?: { en?: string; ja?: string; 'x-jat'?: string };
  airdate?: string;
  airDate?: string;
  runtime?: number;
  length?: number;
  overview?: string;
  summary?: string;
  image?: string;
}

/** Fetches per-episode thumbnails, titles, airdates, runtimes, and voice cast for anime using AniZip + AniList + TVMaze fallback. */
export async function fetchAnimeEpisodeDetails(
  anilistId: number | undefined,
  title: string,
  fallbackEpCount: number,
  fallbackStill: string,
  showId: string
): Promise<{ episodes: Episode[]; cast: CastMember[]; runtimeAvg?: number } | null> {
  const anizipByNum = new Map<
    number,
    { title: string; airdate: string; runtime: number; stillUrl: string; overview: string }
  >();
  const anilistStreamByNum = new Map<number, { title: string; thumbnail: string }>();
  const anilistAirByNum = new Map<number, string>();
  const anilistAirStampByNum = new Map<number, string>();
  const cast: CastMember[] = [];
  let anilistEpisodesCount = 0;
  let anilistDuration: number | undefined;

  const gql = `query($id:Int){Media(id:$id,type:ANIME){episodes duration streamingEpisodes{title thumbnail} airingSchedule(perPage:50){nodes{episode airingAt}} characters(perPage:8,sort:[ROLE,RELEVANCE]){edges{node{id name{full} image{large}} voiceActors(language:JAPANESE,sort:RELEVANCE){id name{full} image{large}}}}}}`;

  if (anilistId && Number.isFinite(anilistId)) {
    const [aniZipRes, aniListRes] = await Promise.allSettled([
      fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`),
      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gql, variables: { id: anilistId } }),
      }),
    ]);

    if (aniZipRes.status === 'fulfilled' && aniZipRes.value.ok) {
      try {
        const az = (await aniZipRes.value.json()) as {
          episodes?: Record<string, AniZipEpisodeRaw>;
        };
        for (const [key, raw] of Object.entries(az.episodes || {})) {
          if (!/^\d+$/.test(key)) continue;
          const epNum = raw.episodeNumber && raw.episodeNumber > 0 ? raw.episodeNumber : Number(key);
          if (!epNum || epNum <= 0) continue;
          const cleanTitle = (raw.title?.en || raw.title?.['x-jat'] || raw.title?.ja || '')
            .replace(/`/g, "'")
            .trim();
          const cleanOverview = (raw.overview || raw.summary || '')
            .replace(/\s*Source:\s*.*$/is, '')
            .replace(/`/g, "'")
            .trim();
          const airdate = (raw.airdate || raw.airDate || '').slice(0, 10);
          anizipByNum.set(epNum, {
            title: cleanTitle,
            airdate,
            runtime: raw.runtime || raw.length || 24,
            stillUrl: raw.image || '',
            overview: cleanOverview,
          });
        }
      } catch {
        // ignore parse failure
      }
    }

    if (aniListRes.status === 'fulfilled' && aniListRes.value.ok) {
      try {
        const alJson = (await aniListRes.value.json()) as {
          data?: {
            Media?: {
              episodes?: number;
              duration?: number;
              streamingEpisodes?: Array<{ title?: string; thumbnail?: string }>;
              airingSchedule?: { nodes?: Array<{ episode?: number; airingAt?: number }> };
              characters?: {
                edges?: Array<{
                  node?: { id?: number; name?: { full?: string }; image?: { large?: string } };
                  voiceActors?: Array<{
                    id?: number;
                    name?: { full?: string };
                    image?: { large?: string };
                  }>;
                }>;
              };
            };
          };
        };
        const media = alJson.data?.Media;
        if (media?.episodes) anilistEpisodesCount = media.episodes;
        if (media?.duration) anilistDuration = media.duration;

        (media?.streamingEpisodes || []).forEach((se, idx) => {
          const rawTitle = (se.title || '').trim();
          const m = rawTitle.match(/^(?:Episode|Ep\.?)\s*(\d+)\s*[-–—:]?\s*(.*)$/i);
          const epNum = m ? Number(m[1]) : idx + 1;
          const cleanTitle = (m ? m[2] : rawTitle).trim();
          if (epNum > 0) {
            anilistStreamByNum.set(epNum, {
              title: cleanTitle,
              thumbnail: se.thumbnail || '',
            });
          }
        });

        for (const node of media?.airingSchedule?.nodes || []) {
          if (node.episode && node.airingAt) {
            const dt = new Date(node.airingAt * 1000);
            const iso = dt.toISOString();
            anilistAirByNum.set(node.episode, iso.slice(0, 10));
            anilistAirStampByNum.set(node.episode, iso);
          }
        }

        for (const edge of (media?.characters?.edges || []).slice(0, 8)) {
          const charName = edge.node?.name?.full;
          if (!charName) continue;
          const va = edge.voiceActors?.[0];
          const avatar = edge.node?.image?.large || va?.image?.large || '';
          cast.push({
            id: String(edge.node?.id || `${showId}-char-${cast.length}`),
            actor: va?.name?.full || charName,
            character: charName,
            avatarUrl: avatar,
          });
        }
      } catch {
        // ignore AniList failure
      }
    }
  }

  const maxAz = anizipByNum.size > 0 ? Math.max(...anizipByNum.keys()) : 0;
  const epCount = Math.max(1, Math.min(2500, Math.max(maxAz, anilistEpisodesCount, fallbackEpCount)));
  const runtimeAvg = anilistDuration || anizipByNum.get(1)?.runtime || 24;

  const episodes: Episode[] = Array.from({ length: epCount }, (_, idx) => {
    const n = idx + 1;
    const az = anizipByNum.get(n);
    const alStream = anilistStreamByNum.get(n);
    const alAir = anilistAirByNum.get(n);
    const alStamp = anilistAirStampByNum.get(n);
    return {
      id: `${showId}-s1e${n}`,
      season: 1,
      number: n,
      title: az?.title || alStream?.title || `Episode ${n}`,
      airdate: az?.airdate || alAir || '',
      ...(alStamp ? { airstamp: alStamp } : {}),
      runtime: az?.runtime || runtimeAvg,
      stillUrl: az?.stillUrl || alStream?.thumbnail || fallbackStill,
      overview: az?.overview || '',
    };
  });

  // Tertiary TVMaze fallback if neither AniZip nor AniList provided distinct per-episode stills
  const uniqueStillsBeforeFallback = new Set(episodes.map((e) => e.stillUrl).filter(Boolean));
  if (uniqueStillsBeforeFallback.size <= 1) {
    try {
      const seasonMatch = title.match(/\bseason\s*(\d+)\b/i);
      const targetSeason = seasonMatch ? Number(seasonMatch[1]) : 1;
      const baseTitle = title
        .replace(/\b(?:season\s*\d+|part\s*\d+|cour\s*\d+|\d+(?:st|nd|rd|th)\s+season)\b/gi, '')
        .replace(/[:\-–—\s]+$/g, '')
        .trim();
      if (baseTitle.length >= 2) {
        const tvRes = await fetch(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(baseTitle)}&embed=episodes`
        );
        if (tvRes.ok) {
          const tvData = (await tvRes.json()) as {
            _embedded?: {
              episodes?: Array<{
                season?: number;
                number?: number;
                name?: string;
                airdate?: string;
                airstamp?: string;
                runtime?: number;
                image?: { medium?: string; original?: string };
                summary?: string;
              }>;
            };
          };
          const tvEps = tvData._embedded?.episodes || [];
          const matchingSeason = tvEps.filter((e) => e.season === targetSeason);
          const pool = matchingSeason.length > 0 ? matchingSeason : targetSeason === 1 ? tvEps : [];
          for (const tvEp of pool) {
            if (!tvEp.number || tvEp.number < 1 || tvEp.number > episodes.length) continue;
            const slot = episodes[tvEp.number - 1];
            const img = tvEp.image?.medium || tvEp.image?.original || '';
            if (img && (!slot.stillUrl || slot.stillUrl === fallbackStill)) {
              slot.stillUrl = img;
            }
            if (tvEp.name && /^Episode \d+$/i.test(slot.title)) {
              slot.title = tvEp.name;
            }
            if (tvEp.airdate && !slot.airdate) {
              slot.airdate = tvEp.airdate;
            }
            if (tvEp.airstamp && !slot.airstamp) {
              slot.airstamp = tvEp.airstamp;
            }
            if (tvEp.summary && !slot.overview) {
              slot.overview = stripHtml(tvEp.summary);
            }
          }
        }
      }
    } catch {
      // ignore TVMaze fallback failure
    }
  }

  const finalUniqueStills = new Set(episodes.map((e) => e.stillUrl).filter(Boolean));
  const hasRealTitles = episodes.some((e) => !/^Episode \d+$/i.test(e.title));
  const hasRealAirdates = episodes.some((e) => Boolean(e.airdate));
  if (
    finalUniqueStills.size <= 1 &&
    !hasRealTitles &&
    !hasRealAirdates &&
    cast.length === 0
  ) {
    return null;
  }

  return { episodes, cast, runtimeAvg };
}

type FandomWikiSlug = 'dc' | 'marvel' | 'imagecomics';

interface CuratedComicWikiRule {
  wiki: FandomWikiSlug;
  resolveSlot: (slot: number, totalIssues: number, editionId?: string) => {
    pageTitle: string;
    issueLabel: string;
  };
}

const CURATED_COMIC_WIKI_MAP: Record<string, CuratedComicWikiRule> = {
  'superman batman': {
    wiki: 'dc',
    resolveSlot: (slot, _total, editionId) => {
      if (editionId === 'curated-sb-tpb-v2') {
        const n = slot + 7;
        return { pageTitle: `Superman/Batman Vol 1 ${n}`, issueLabel: `#${n}` };
      }
      if (editionId === 'curated-sb-compact') {
        if (slot <= 6) {
          return { pageTitle: `Superman/Batman Vol 1 ${slot}`, issueLabel: `#${slot}` };
        }
        if (slot <= 12) {
          const n = slot + 1;
          return { pageTitle: `Superman/Batman Vol 1 ${n}`, issueLabel: `#${n}` };
        }
        return {
          pageTitle: 'Superman/Batman Secret Files & Origins 2003',
          issueLabel: 'Secret Files',
        };
      }
      return { pageTitle: `Superman/Batman Vol 1 ${slot}`, issueLabel: `#${slot}` };
    },
  },
  'superman batman public enemies': {
    wiki: 'dc',
    resolveSlot: (slot, total, editionId) =>
      CURATED_COMIC_WIKI_MAP['superman batman'].resolveSlot(slot, total, editionId),
  },
  'the flash rebirth': {
    wiki: 'dc',
    resolveSlot: (slot) => {
      if (slot <= 6) {
        return { pageTitle: `The Flash: Rebirth Vol 1 ${slot}`, issueLabel: `Rebirth #${slot}` };
      }
      if (slot <= 12) {
        const n = slot - 6;
        return { pageTitle: `The Flash Vol 3 ${n}`, issueLabel: `The Flash #${n}` };
      }
      if (slot === 13) {
        return {
          pageTitle: 'The Flash Secret Files and Origins Vol 1 2010',
          issueLabel: 'Secret Files',
        };
      }
      const n = slot - 7;
      return { pageTitle: `The Flash Vol 3 ${n}`, issueLabel: `The Flash #${n}` };
    },
  },
  'flash rebirth': {
    wiki: 'dc',
    resolveSlot: (slot, total, editionId) =>
      CURATED_COMIC_WIKI_MAP['the flash rebirth'].resolveSlot(slot, total, editionId),
  },
  'all star superman': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `All-Star Superman Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  watchmen: {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Watchmen Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'batman hush': {
    wiki: 'dc',
    resolveSlot: (slot) => {
      const n = 607 + slot;
      return { pageTitle: `Batman Vol 1 ${n}`, issueLabel: `Batman #${n}` };
    },
  },
  'batman year one': {
    wiki: 'dc',
    resolveSlot: (slot) => {
      const n = 403 + slot;
      return { pageTitle: `Batman Vol 1 ${n}`, issueLabel: `Batman #${n}` };
    },
  },
  'batman the court of owls': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Batman Vol 2 ${slot}`,
      issueLabel: `Batman #${slot}`,
    }),
  },
  'batman the long halloween': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Batman: The Long Halloween Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'kingdom come': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Kingdom Come Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'supergirl woman of tomorrow': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Supergirl: Woman of Tomorrow Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'superman birthright': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Superman: Birthright Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'far sector': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Far Sector Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  dceased: {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `DCeased Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'american vampire': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `American Vampire Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'wonder woman earth one': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Wonder Woman: Earth One Vol 1 ${slot}`,
      issueLabel: `Vol. ${slot}`,
    }),
  },
  'catwoman trail of the catwoman': {
    wiki: 'dc',
    resolveSlot: (slot) => ({
      pageTitle: `Catwoman Vol 3 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'spider man blue': {
    wiki: 'marvel',
    resolveSlot: (slot) => ({
      pageTitle: `Spider-Man: Blue Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  'ultimate spider man': {
    wiki: 'marvel',
    resolveSlot: (slot) => ({
      pageTitle: `Ultimate Spider-Man Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  saga: {
    wiki: 'imagecomics',
    resolveSlot: (slot) => ({
      pageTitle: `Saga Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
  invincible: {
    wiki: 'imagecomics',
    resolveSlot: (slot) => ({
      pageTitle: `Invincible Vol 1 ${slot}`,
      issueLabel: `#${slot}`,
    }),
  },
};

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function cleanFandomIssueText(raw: string): string {
  return raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)/g, '$1')
    .replace(/\]\]/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,3}/g, '')
    .replace(/;/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFandomStoryTitle(raw: string, seriesNorm: string): string | undefined {
  if (/^\s*\|/.test(raw)) return undefined;
  let s = cleanFandomIssueText(raw);
  s = s.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!s || s.length < 2 || /^\|/.test(s)) return undefined;
  if (normalizeTitleKey(s) === seriesNorm) return undefined;
  return s;
}

function extractFandomIssueField(wikitext: string, fieldPattern: string): string | undefined {
  const m = wikitext.match(
    new RegExp(`\\|\\s*(?:${fieldPattern})\\s*=[^\\S\\r\\n]*([^\\n|]+)`, 'i')
  );
  if (!m?.[1]) return undefined;
  const cleaned = cleanFandomIssueText(m[1]).replace(/,\s*$/, '').trim();
  return cleaned.length >= 2 && !/^\|/.test(cleaned) ? cleaned : undefined;
}

function extractFandomIssueSynopsis(wikitext: string): string | undefined {
  if (!wikitext) return undefined;
  let raw = '';
  const fieldMatch = wikitext.match(
    /\|\s*(?:Solicit|Synopsis1?)\s*=[^\S\r\n]*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/i
  );
  if (fieldMatch?.[1]) {
    raw = fieldMatch[1];
  } else {
    const secMatch = wikitext.match(
      /==+\s*(?:Solicit|Synopsis[^=]*)\s*==+\s*\n([\s\S]*?)(?=\n==|$)/i
    );
    if (secMatch?.[1]) raw = secMatch[1];
  }
  const cleaned = cleanFandomIssueText(raw);
  if (!cleaned || cleaned.length < 25 || /^no synopsis/i.test(cleaned)) return undefined;
  if (cleaned.length <= 420) return cleaned;
  const slice = cleaned.slice(0, 420);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 260 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function parseFandomMonthNumber(raw?: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const numMonth = Number(trimmed);
  if (Number.isInteger(numMonth) && numMonth >= 1 && numMonth <= 12) {
    return numMonth;
  }
  const cleanMo = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (cleanMo.length < 3) return null;
  const idx = MONTH_ABBR.findIndex(
    (m) => cleanMo.startsWith(m.toLowerCase()) || m.toLowerCase() === cleanMo.slice(0, 3)
  );
  return idx >= 0 ? idx + 1 : null;
}

function formatFandomUtcParts(
  year: number,
  zeroBasedMonth: number,
  day: number
): { releaseDate: string; releaseDateIso: string } {
  const dt = new Date(Date.UTC(year, zeroBasedMonth, day));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();
  return {
    releaseDate: `${MONTH_ABBR[m]} ${d}, ${y}`,
    releaseDateIso: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

function extractFandomReleaseDate(
  rawWikitext: string,
  wiki: FandomWikiSlug,
  categories?: Array<{ title?: string }>
): { releaseDate?: string; releaseDateIso?: string } {
  const relDirect = rawWikitext.match(/\|\s*ReleaseDate\s*=[^\S\r\n]*([^\n|]+)/i)?.[1]?.trim();
  if (relDirect) {
    const cleanRel = cleanFandomIssueText(relDirect);
    const isoM = cleanRel.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      return formatFandomUtcParts(Number(isoM[1]), Number(isoM[2]) - 1, Number(isoM[3]));
    }
    const mdyM = cleanRel.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (mdyM) {
      const m1 = parseFandomMonthNumber(mdyM[1]);
      if (m1) return formatFandomUtcParts(Number(mdyM[3]), m1 - 1, Number(mdyM[2]));
    }
    const dmyM = cleanRel.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
    if (dmyM) {
      const m1 = parseFandomMonthNumber(dmyM[2]);
      if (m1) return formatFandomUtcParts(Number(dmyM[3]), m1 - 1, Number(dmyM[1]));
    }
    const moYrM = cleanRel.match(/^([A-Za-z]+),?\s+(\d{4})$/);
    if (moYrM) {
      const m1 = parseFandomMonthNumber(moYrM[1]);
      if (m1) return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${moYrM[2]}` };
    }
  }

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubFull = t.match(/^Category:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*\(Publication\)$/i);
    if (pubFull) {
      const m1 = parseFandomMonthNumber(pubFull[1]);
      if (m1) return formatFandomUtcParts(Number(pubFull[3]), m1 - 1, Number(pubFull[2]));
    }
  }

  const dayRaw = rawWikitext.match(/\|\s*Day\s*=[^\S\r\n]*(\d{1,2})/i)?.[1]?.trim();
  const dayNum = dayRaw ? Number(dayRaw) : 0;

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubMo = t.match(/^Category:\s*(\d{4}),\s*([A-Za-z]+)\s*\(Publication\)$/i);
    if (pubMo) {
      const m1 = parseFandomMonthNumber(pubMo[2]);
      if (m1 && dayNum >= 1 && dayNum <= 31) {
        return formatFandomUtcParts(Number(pubMo[1]), m1 - 1, dayNum);
      }
      if (m1) {
        return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${pubMo[1]}` };
      }
    }
  }

  const moRaw = rawWikitext.match(/\|\s*(?:Month|PubMonth)\s*=[^\S\r\n]*([^\n|]+)/i)?.[1]?.trim();
  const yrRaw = rawWikitext.match(/\|\s*Year\s*=[^\S\r\n]*(\d{4})/i)?.[1]?.trim();
  if (!yrRaw) return {};
  const yrNum = Number(yrRaw);
  const m1 = parseFandomMonthNumber(moRaw);

  if (m1 && dayNum >= 1 && dayNum <= 31) {
    // DC wiki templates store Month/Year as cover date (~2 months after on-sale date).
    const zeroBasedMonth = wiki === 'dc' ? m1 - 3 : m1 - 1;
    return formatFandomUtcParts(yrNum, zeroBasedMonth, dayNum);
  }
  if (m1) {
    if (wiki === 'dc') {
      const dt = new Date(Date.UTC(yrNum, m1 - 3, 1));
      return { releaseDate: `${MONTH_ABBR[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
    }
    return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${yrRaw}` };
  }
  return { releaseDate: yrRaw };
}

/** Fetches per-issue comic cover thumbnails, story titles, and release dates via Fandom MediaWiki APIs. */
export async function fetchComicIssueDetails(
  title: string,
  totalIssues: number,
  creator?: string,
  editionId?: string,
  publisher?: string
): Promise<Record<number, ComicIssueMeta>> {
  const cappedTotal = Math.max(1, Math.min(48, Math.round(totalIssues)));
  const cleanSeries = stripEditionAffixes(title)
    .replace(/[,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const seriesNorm = normalizeTitleKey(cleanSeries);
  const seriesCore = seriesNorm.replace(/^the\s+/, '');

  const matchedKey =
    (CURATED_COMIC_WIKI_MAP[seriesNorm] ? seriesNorm : undefined) ||
    Object.keys(CURATED_COMIC_WIKI_MAP).find((k) => seriesNorm.startsWith(`${k} `));

  let targetWiki: FandomWikiSlug | null = matchedKey ? CURATED_COMIC_WIKI_MAP[matchedKey].wiki : null;
  let slotSpecs: Array<{ slot: number; pageTitle: string; issueLabel: string }> = [];

  if (matchedKey) {
    const rule = CURATED_COMIC_WIKI_MAP[matchedKey];
    for (let slot = 1; slot <= cappedTotal; slot += 1) {
      const resolved = rule.resolveSlot(slot, cappedTotal, editionId);
      slotSpecs.push({ slot, ...resolved });
    }
  } else {
    const pubHay = `${title} ${creator || ''} ${publisher || ''}`.toLowerCase();
    const isLikelyMarvel =
      /\b(marvel|spider-man|x-men|avengers|daredevil|wolverine|iron man|captain america|thor|hulk|annihilation|guardians of the galaxy|silver surfer|fantastic four)\b/.test(
        pubHay
      );
    const isLikelyImage =
      /\b(image comics|invincible|saga|walking dead|spawn|radiant black|department of truth)\b/.test(
        pubHay
      );
    const wikiOrder: FandomWikiSlug[] = isLikelyMarvel
      ? ['marvel', 'dc', 'imagecomics']
      : isLikelyImage
        ? ['imagecomics', 'marvel', 'dc']
        : ['dc', 'marvel', 'imagecomics'];

    for (const w of wikiOrder) {
      try {
        const searchRes = await fetch(
          `https://${w}.fandom.com/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(
            `${cleanSeries} Vol`
          )}&pslimit=12&format=json&origin=*`
        );
        if (!searchRes.ok) continue;
        const json = (await searchRes.json()) as {
          query?: { prefixsearch?: Array<{ title?: string }> };
        };
        const volHits = (json.query?.prefixsearch || [])
          .map((x) => x.title || '')
          .map((t) => t.match(/^(.+?)\s+Vol\s+(\d+)\s+\d+$/i))
          .filter((m): m is RegExpMatchArray => {
            if (!m) return false;
            const volBase = normalizeTitleKey(m[1]).replace(/^the\s+/, '');
            return volBase === seriesCore && seriesCore.length > 0;
          })
          .sort((a, b) => Number(a[2]) - Number(b[2]));

        if (volHits.length > 0) {
          targetWiki = w;
          const prefix = `${volHits[0][1].trim()} Vol ${volHits[0][2]}`;
          for (let slot = 1; slot <= cappedTotal; slot += 1) {
            slotSpecs.push({
              slot,
              pageTitle: `${prefix} ${slot}`,
              issueLabel: `#${slot}`,
            });
          }
          break;
        }
      } catch {
        // try next wiki
      }
    }
  }

  if (!targetWiki || slotSpecs.length === 0) {
    const col = await fetchComicCollectionIssues({
      title,
      publisher,
      limit: Math.max(48, Math.round(totalIssues)),
    });
    return col.issues;
  }

  const result: Record<number, ComicIssueMeta> = {};
  const batchSize = 20;
  const batches: Array<typeof slotSpecs> = [];
  for (let i = 0; i < slotSpecs.length; i += batchSize) {
    batches.push(slotSpecs.slice(i, i + batchSize));
  }

  const batchResponses = await Promise.allSettled(
    batches.map((b) =>
      fetch(
        `https://${targetWiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
          b.map((item) => item.pageTitle).join('|')
        )}&prop=pageimages|revisions|categories&rvprop=content&rvslots=main&rvsection=0&cllimit=max&pithumbsize=240&redirects=1&format=json&origin=*`
      )
    )
  );

  for (let bIdx = 0; bIdx < batchResponses.length; bIdx += 1) {
    const resp = batchResponses[bIdx];
    const batch = batches[bIdx];
    if (resp.status !== 'fulfilled' || !resp.value.ok) continue;

    try {
      const data = (await resp.value.json()) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          redirects?: Array<{ from: string; to: string }>;
          pages?: Record<
            string,
            {
              missing?: string;
              title?: string;
              thumbnail?: { source?: string };
              categories?: Array<{ title?: string }>;
              revisions?: Array<{ slots?: { main?: { '*'?: string } } }>;
            }
          >;
        };
      };

      const normMap = new Map<string, string>();
      for (const n of data.query?.normalized || []) normMap.set(n.from, n.to);
      const redirMap = new Map<string, string>();
      for (const r of data.query?.redirects || []) redirMap.set(r.from, r.to);

      const pageByTitle = new Map<
        string,
        NonNullable<NonNullable<typeof data.query>['pages']>[string]
      >();
      for (const p of Object.values(data.query?.pages || {})) {
        if (p.title) pageByTitle.set(p.title.toLowerCase(), p);
      }

      const batchParsed = batch.map((spec) => {
        let cur = spec.pageTitle;
        if (normMap.has(cur)) cur = normMap.get(cur)!;
        if (redirMap.has(cur)) cur = redirMap.get(cur)!;

        const page = pageByTitle.get(cur.toLowerCase()) || pageByTitle.get(spec.pageTitle.toLowerCase());
        const rawWikitext = page?.revisions?.[0]?.slots?.main?.['*'] || '';
        const imgMatch = rawWikitext.match(/\|\s*Image1?\s*=[^\S\r\n]*([^\n|]+)/i)?.[1];
        const cleanFile = imgMatch
          ? imgMatch
              .replace(/\[\[(?:File|Image):/i, '')
              .replace(/\]\]/g, '')
              .replace(/^(?:File|Image):/i, '')
              .split('|')[0]
              ?.trim()
          : '';
        const coverFilename =
          cleanFile && /\.(?:jpe?g|png|webp|gif)$/i.test(cleanFile)
            ? cleanFile
            : `${spec.pageTitle}.jpg`;
        return { spec, page, rawWikitext, coverFilename };
      });

      const coverAUrlMap = new Map<string, string>();
      try {
        const coverFiles = Array.from(
          new Set(batchParsed.filter((x) => x.page && x.page.missing === undefined).map((x) => x.coverFilename))
        );
        if (coverFiles.length > 0) {
          const iiRes = await fetch(
            `https://${targetWiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
              coverFiles.map((f) => `File:${f}`).join('|')
            )}&prop=imageinfo&iiprop=url&iiurlwidth=240&redirects=1&format=json&origin=*`
          );
          if (iiRes.ok) {
            const iiJson = (await iiRes.json()) as {
              query?: {
                normalized?: Array<{ from: string; to: string }>;
                redirects?: Array<{ from: string; to: string }>;
                pages?: Record<
                  string,
                  {
                    missing?: string;
                    title?: string;
                    imageinfo?: Array<{ thumburl?: string; url?: string }>;
                  }
                >;
              };
            };
            const iiNorm = new Map<string, string>();
            for (const n of iiJson.query?.normalized || []) iiNorm.set(n.from.toLowerCase(), n.to);
            const iiRedir = new Map<string, string>();
            for (const r of iiJson.query?.redirects || []) iiRedir.set(r.from.toLowerCase(), r.to);
            const urlMap = new Map<string, string>();
            for (const p of Object.values(iiJson.query?.pages || {})) {
              if (!p.title || p.missing !== undefined) continue;
              const u = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
              if (u) urlMap.set(p.title.toLowerCase(), u);
            }
            for (const f of coverFiles) {
              let c = `File:${f}`;
              c = iiNorm.get(c.toLowerCase()) || c;
              c = iiRedir.get(c.toLowerCase()) || c;
              const u = urlMap.get(c.toLowerCase()) || urlMap.get(`file:${f.toLowerCase()}`);
              if (u) coverAUrlMap.set(f.toLowerCase(), u);
            }
          }
        }
      } catch {
        // fallback to page.thumbnail
      }

      for (const { spec, page, rawWikitext, coverFilename } of batchParsed) {
        if (!page || page.missing !== undefined) continue;

        const storyRaw = rawWikitext.match(/\|\s*StoryTitle1\s*=[^\S\r\n]*([^\n]+)/i)?.[1];
        const storyTitle = storyRaw ? cleanFandomStoryTitle(storyRaw, seriesNorm) : undefined;
        const { releaseDate, releaseDateIso } = rawWikitext
          ? extractFandomReleaseDate(rawWikitext, targetWiki, page.categories)
          : {};
        const coverUrl =
          coverAUrlMap.get(coverFilename.toLowerCase()) || page.thumbnail?.source;
        const writers = rawWikitext
          ? extractFandomIssueField(rawWikitext, 'Writers?1|Writers')
          : undefined;
        const artists = rawWikitext
          ? extractFandomIssueField(rawWikitext, 'Pencillers?1|Pencillers?|Artists?1|Artists')
          : undefined;
        const synopsis = rawWikitext ? extractFandomIssueSynopsis(rawWikitext) : undefined;

        result[spec.slot] = {
          number: spec.slot,
          issueLabel: spec.issueLabel,
          title: storyTitle,
          seriesTitle: extractSeriesTitleFromPageTitle(spec.pageTitle),
          releaseDate,
          ...(releaseDateIso ? { releaseDateIso } : {}),
          coverUrl,
          synopsis,
          writers,
          artists,
          wiki: targetWiki,
          pageTitle: spec.pageTitle,
          atomicId: makeComicAtomicId(targetWiki, spec.pageTitle),
        };
      }
    } catch {
      // ignore batch parse failure
    }
  }

  return result;
}

/** Fetches full wikitext synopsis and credits for a single comic issue page on demand. */
export async function fetchSingleComicIssueDetail(
  wiki: ComicWikiSlug,
  pageTitle: string
): Promise<Partial<ComicIssueMeta>> {
  if (!pageTitle || (wiki !== 'marvel' && wiki !== 'dc' && wiki !== 'imagecomics')) return {};
  try {
    const res = await fetch(
      `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
        pageTitle
      )}&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json&origin=*`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return {};
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            missing?: string;
            revisions?: Array<{ slots?: { main?: { '*'?: string } }; '*'?: string }>;
          }
        >;
      };
    };
    const page = Object.values(json.query?.pages || {}).find((p) => p.missing === undefined);
    const wikitext =
      page?.revisions?.[0]?.slots?.main?.['*'] || page?.revisions?.[0]?.['*'] || '';
    if (!wikitext) return {};
    const writers = extractFandomIssueField(wikitext, 'Writers?1|Writers');
    const artists = extractFandomIssueField(
      wikitext,
      'Pencillers?1|Pencillers?|Artists?1|Artists'
    );
    const synopsis = extractFandomIssueSynopsis(wikitext);
    return {
      ...(writers ? { writers } : {}),
      ...(artists ? { artists } : {}),
      ...(synopsis ? { synopsis } : {}),
    };
  } catch {
    return {};
  }
}

async function hydrateTvMazeShow(item: LiveSearchResult): Promise<Show> {
  const res = await fetch(
    `https://api.tvmaze.com/shows/${item.externalId}?embed[]=episodes&embed[]=cast`
  );
  if (!res.ok) return fallbackShowFromSearch(item) as Show;
  const data = await res.json();
  let backdropUrl = item.backdropUrl || item.posterUrl;
  try {
    const imgsRes = await fetch(`https://api.tvmaze.com/shows/${item.externalId}/images`);
    if (imgsRes.ok) {
      const imgs = (await imgsRes.json()) as Array<{
        type: string;
        resolutions?: { original?: { url?: string } };
      }>;
      const bg = imgs.find((i) => i.type === 'background') || imgs.find((i) => i.type === 'banner');
      if (bg?.resolutions?.original?.url) backdropUrl = bg.resolutions.original.url;
    }
  } catch {
    // ignore
  }

  const rawEps = (data._embedded?.episodes || []) as Array<{
    season: number;
    number: number;
    name?: string;
    airdate?: string;
    airstamp?: string;
    runtime?: number;
    image?: { medium?: string; original?: string };
    summary?: string;
  }>;

  const seasonMap = new Map<number, Season>();
  for (const ep of rawEps) {
    if (!ep.season || !ep.number) continue;
    if (!seasonMap.has(ep.season)) seasonMap.set(ep.season, { number: ep.season, episodes: [] });
    seasonMap.get(ep.season)!.episodes.push({
      id: `${item.id}-s${ep.season}e${ep.number}`,
      season: ep.season,
      number: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      airdate: ep.airdate || '',
      ...(ep.airstamp ? { airstamp: ep.airstamp } : {}),
      runtime: ep.runtime || data.averageRuntime || 45,
      stillUrl: ep.image?.medium || ep.image?.original || backdropUrl || item.posterUrl,
      overview: stripHtml(ep.summary),
    });
  }

  const seasons = Array.from(seasonMap.values()).sort((a, b) => a.number - b.number);
  const cast: CastMember[] = ((data._embedded?.cast || []) as Array<{
    person?: { id?: number; name?: string; image?: { medium?: string } };
    character?: { id?: number; name?: string; image?: { medium?: string } };
  }>)
    .slice(0, 8)
    .map((c, idx) => ({
      id: String(c.character?.id || c.person?.id || idx),
      actor: c.person?.name || 'Cast',
      character: c.character?.name || 'Character',
      avatarUrl: c.character?.image?.medium || c.person?.image?.medium || '',
    }));

  return {
    id: item.id,
    tvmazeId: Number(item.externalId),
    title: data.name || item.title,
    year: data.premiered ? Number(data.premiered.slice(0, 4)) : item.year,
    genres: data.genres?.length ? data.genres : item.genres,
    rating: data.rating?.average || item.rating,
    mediaType: 'tv',
    posterUrl: data.image?.original || data.image?.medium || item.posterUrl,
    backdropUrl,
    overview: stripHtml(data.summary) || item.overview,
    runtimeAvg: data.averageRuntime || 45,
    network: data.webChannel?.name || data.network?.name || 'Streaming',
    totalEpisodes: rawEps.length || 1,
    seasons: seasons.length > 0 ? seasons : fallbackShowFromSearch(item).seasons,
    cast,
  };
}

async function hydrateTmdbShow(item: LiveSearchResult, apiKey?: string): Promise<Show | Anime> {
  const cleanKey = apiKey?.trim();
  let data: {
    name?: string;
    first_air_date?: string;
    genres?: Array<{ name: string }>;
    vote_average?: number;
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    episode_run_time?: number[];
    networks?: Array<{ name: string }>;
    number_of_episodes?: number;
    seasons?: Array<{ season_number: number }>;
    credits?: {
      cast?: Array<{ id: number; name: string; character: string; profile_path?: string }>;
    };
  } | null = null;
  let seasonResponses: Array<{
    season_number: number;
    episodes?: Array<{
      season_number: number;
      episode_number: number;
      name?: string;
      air_date?: string;
      runtime?: number;
      still_path?: string;
      overview?: string;
    }>;
  } | null> = [];

  if (cleanKey && cleanKey.length > 8) {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${item.externalId}?api_key=${encodeURIComponent(cleanKey)}&append_to_response=credits`
    );
    if (!res.ok) return fallbackShowFromSearch(item);
    data = await res.json();
    const validSeasons = (data?.seasons || [])
      .filter((s) => s.season_number > 0)
      .slice(0, 20);
    seasonResponses = await Promise.all(
      validSeasons.map((s) =>
        fetch(
          `https://api.themoviedb.org/3/tv/${item.externalId}/season/${s.season_number}?api_key=${encodeURIComponent(
            cleanKey
          )}`
        ).then((r) => (r.ok ? r.json() : null))
      )
    );
  } else {
    const res = await fetch(`/api/tmdb?action=tv-detail&id=${encodeURIComponent(String(item.externalId))}`);
    if (!res.ok) return fallbackShowFromSearch(item);
    const payload = (await res.json()) as {
      configured?: boolean;
      show?: typeof data;
      seasons?: typeof seasonResponses;
    };
    if (!payload.configured || !payload.show) return fallbackShowFromSearch(item);
    data = payload.show;
    seasonResponses = payload.seasons || [];
  }

  if (!data) return fallbackShowFromSearch(item);

  const seasons: Season[] = [];
  for (const sData of seasonResponses) {
    if (!sData || !Array.isArray(sData.episodes)) continue;
    seasons.push({
      number: sData.season_number,
      episodes: sData.episodes.map(
        (ep: {
          season_number: number;
          episode_number: number;
          name?: string;
          air_date?: string;
          runtime?: number;
          still_path?: string;
          overview?: string;
        }) => ({
          id: `${item.id}-s${ep.season_number}e${ep.episode_number}`,
          season: ep.season_number,
          number: ep.episode_number,
          title: ep.name || `Episode ${ep.episode_number}`,
          airdate: ep.air_date || '',
          runtime: ep.runtime || 45,
          stillUrl: ep.still_path
            ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
            : item.backdropUrl || item.posterUrl,
          overview: ep.overview || '',
        })
      ),
    });
  }

  const cast: CastMember[] = ((data.credits?.cast || []) as Array<{
    id: number;
    name: string;
    character: string;
    profile_path?: string;
  }>)
    .slice(0, 8)
    .map((c) => ({
      id: String(c.id),
      actor: c.name,
      character: c.character || c.name,
      avatarUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : '',
    }));

  return {
    id: item.id,
    tmdbId: Number(item.externalId),
    title: data.name || item.title,
    year: data.first_air_date ? Number(data.first_air_date.slice(0, 4)) : item.year,
    genres: ((data.genres || []) as Array<{ name: string }>).map((g) => g.name),
    rating: data.vote_average ? Number(data.vote_average.toFixed(1)) : item.rating,
    mediaType: 'tv',
    posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : item.posterUrl,
    backdropUrl: data.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
      : item.backdropUrl,
    overview: data.overview || item.overview,
    runtimeAvg: data.episode_run_time?.[0] || 45,
    network: data.networks?.[0]?.name || 'Streaming',
    totalEpisodes: seasons.reduce((acc, s) => acc + s.episodes.length, 0) || data.number_of_episodes || 10,
    seasons: seasons.length > 0 ? seasons : fallbackShowFromSearch(item).seasons,
    cast,
  };
}

/** Fetches fresh TVMaze episode dates/airstamps/titles for lightweight schedule refreshes. */
export async function fetchTvmazeEpisodeSchedule(
  tvmazeId?: number,
  title?: string
): Promise<
  Array<{
    season: number;
    number: number;
    title?: string;
    airdate?: string;
    airstamp?: string;
    stillUrl?: string;
    overview?: string;
  }>
> {
  try {
    let rawEps: Array<{
      season?: number;
      number?: number;
      name?: string;
      airdate?: string;
      airstamp?: string;
      image?: { medium?: string; original?: string };
      summary?: string;
    }> = [];

    if (tvmazeId && Number.isFinite(tvmazeId)) {
      const res = await fetch(`https://api.tvmaze.com/shows/${tvmazeId}/episodes`, {
        signal: AbortSignal.timeout(6500),
      });
      if (res.ok) rawEps = (await res.json()) as typeof rawEps;
    } else if (title && title.trim().length >= 2) {
      const cleanTitle = title
        .replace(/\b(?:season\s*\d+|part\s*\d+|cour\s*\d+|\d+(?:st|nd|rd|th)\s+season)\b/gi, '')
        .replace(/[:\-–—\s]+$/g, '')
        .trim();
      if (cleanTitle.length >= 2) {
        const res = await fetch(
          `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}&embed=episodes`,
          { signal: AbortSignal.timeout(6500) }
        );
        if (res.ok) {
          const json = (await res.json()) as { _embedded?: { episodes?: typeof rawEps } };
          rawEps = json._embedded?.episodes || [];
        }
      }
    }

    return rawEps
      .filter((ep): ep is typeof ep & { season: number; number: number } =>
        Boolean(ep.season && ep.number)
      )
      .map((ep) => ({
        season: ep.season,
        number: ep.number,
        title: ep.name?.trim() || undefined,
        airdate: ep.airdate || undefined,
        airstamp: ep.airstamp || undefined,
        stillUrl: ep.image?.medium || ep.image?.original || undefined,
        overview: ep.summary ? stripHtml(ep.summary) : undefined,
      }));
  } catch {
    return [];
  }
}

function fallbackShowFromSearch(item: LiveSearchResult): Show | Anime {
  const base = {
    id: item.id,
    title: item.title,
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    runtimeAvg: item.runtime || 45,
    totalEpisodes: 10,
    seasons: [
      {
        number: 1,
        episodes: Array.from({ length: 10 }, (_, idx) => ({
          id: `${item.id}-s1e${idx + 1}`,
          season: 1,
          number: idx + 1,
          title: `Episode ${idx + 1}`,
          airdate: `${item.year}-01-01`,
          runtime: item.runtime || 45,
          stillUrl: item.backdropUrl || item.posterUrl,
          overview: '',
        })),
      },
    ],
    cast: [],
  };
  if (item.mediaType === 'anime') {
    return { ...base, mediaType: 'anime' as const };
  }
  return { ...base, mediaType: 'tv' as const };
}

export function hydrateLiveMovie(item: LiveSearchResult): Movie {
  return {
    id: item.id,
    itunesId: item.source === 'itunes' ? Number(item.externalId) || undefined : undefined,
    tmdbId: item.source === 'tmdb' ? Number(item.externalId) || undefined : undefined,
    title: item.title,
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    runtime: item.runtime || 120,
    director: item.director || 'Feature Film',
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    releaseDate: `${item.year}-01-01`,
    cast: [],
  };
}

export function hydrateLiveReadItem(item: LiveSearchResult): ReadItem {
  const format =
    item.mediaType === 'manga' ? 'manga' : item.mediaType === 'comic' ? 'comic' : 'novel';
  const unit = format === 'comic' ? 'issues' : 'chapters';
  const totalUnits = item.totalUnits || (format === 'novel' ? 30 : format === 'manga' ? 100 : 12);
  const totalUnitsSource =
    item.totalUnits && !item.totalUnitsEstimated ? 'api' : 'estimated';
  return {
    id: item.id,
    format,
    unit,
    title: item.title,
    creator: item.director || item.subtitle || 'Author',
    year: item.year,
    totalUnits,
    totalUnitsSource,
    baseTotalUnits: totalUnits,
    genres: item.genres,
    rating: item.rating,
    coverUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    editionCovers: item.editionCovers,
    editionIssueCounts: item.editionIssueCounts,
    editionVariants: item.editionVariants,
    comicKind: item.comicKind,
    comicRunLabel: item.comicRunLabel,
    comicPublisher: item.comicPublisher,
    comicSeriesWiki: item.comicSeriesWiki,
    comicSeriesVolTitle: item.comicSeriesVolTitle,
    ...(item.isbn ? { isbn: item.isbn } : {}),
  };
}

function toGamePlatforms(raw?: string[]): GamePlatform[] {
  const out: GamePlatform[] = [];
  const pushUnique = (p: GamePlatform) => {
    if (!out.includes(p)) out.push(p);
  };
  for (const label of raw || []) {
    const low = label.toLowerCase();
    if (low.includes('steam deck')) pushUnique('Steam Deck');
    else if (low === 'pc') pushUnique('PC');
    else if (low.includes('ps5') || low.includes('playstation')) pushUnique('PS5');
    else if (low.includes('xbox')) pushUnique('Xbox');
    else if (low.includes('switch') || low.includes('nintendo')) pushUnique('Switch');
  }
  return out;
}

export function hydrateLiveGameItem(item: LiveSearchResult): GameItem {
  const known = lookupKnownGameChapters(item.title);
  const mappedPlatforms = toGamePlatforms(item.platforms);
  const platforms: GamePlatform[] = mappedPlatforms.length
    ? mappedPlatforms
    : item.steamAppId
      ? ['PC', 'Steam Deck']
      : ['PS5', 'Xbox', 'PC'];
  return {
    id: item.id,
    steamAppId: item.steamAppId,
    igdbId: item.igdbId,
    title: item.title,
    developer: item.director || item.subtitle || 'Studio',
    year: item.year,
    genres: item.genres,
    rating: item.rating,
    platforms,
    coverUrl: item.posterUrl,
    backdropUrl: item.backdropUrl || item.posterUrl,
    overview: item.overview,
    franchise: item.franchise,
    totalChapters: known?.totalChapters,
    chapterUnit: known?.unit,
    chapterSource: known?.source,
    chapterNote: known?.note,
  };
}

/** Resolves up to 40 IMDb tt... IDs at a time via /api/imdb-resolve. */
export async function resolveImdbIdsBatch(
  ids: string[]
): Promise<Record<string, ResolvedImdbTitle | null>> {
  const clean = Array.from(
    new Set(
      ids
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^tt\d{5,12}$/.test(id))
    )
  ).slice(0, 40);
  if (clean.length === 0) return {};

  try {
    const res = await fetch('/api/imdb-resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: clean }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      items?: Record<string, ResolvedImdbTitle | null>;
    };
    return data.items || {};
  } catch {
    return {};
  }
}

/** Resolves an imported CSV/JSON row into a hydrated Show/Movie/ReadItem/GameItem, falling back safely offline or on mismatch. */
export async function enrichImportCandidate(
  candidate: ImportCandidate,
  tmdbApiKey?: string
): Promise<PreparedImportEntry> {
  const targetNorm = normalizeTitleKey(candidate.title);

  const pickBestMatch = (hits: LiveSearchResult[], expectedKind: LiveSearchResult['kind']) => {
    const matchingKind = hits.filter((h) => h.kind === expectedKind);
    const exact = matchingKind.find((h) => {
      const norm = normalizeTitleKey(h.title);
      const yearOk =
        h.source === 'cheapshark' ||
        !h.year ||
        !candidate.year ||
        Math.abs(h.year - candidate.year) <= 3;
      return norm === targetNorm && yearOk;
    });
    if (exact) return exact;

    return matchingKind.find((h) => {
      const norm = normalizeTitleKey(h.title);
      const yearOk =
        h.source === 'cheapshark' ||
        !h.year ||
        !candidate.year ||
        Math.abs(h.year - candidate.year) <= 3;
      return yearOk && (norm.startsWith(targetNorm) || targetNorm.startsWith(norm));
    });
  };

  try {
    if (candidate.kind === 'show') {
      if (
        !tmdbApiKey &&
        candidate.externalConst &&
        /^tt\d{5,12}$/i.test(candidate.externalConst)
      ) {
        try {
          const tvRes = await fetch(
            `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(
              candidate.externalConst.toLowerCase()
            )}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (tvRes.ok) {
            const tvData = (await tvRes.json()) as {
              id?: number;
              name?: string;
              premiered?: string;
              genres?: string[];
              rating?: { average?: number };
              image?: { medium?: string; original?: string };
              summary?: string;
            };
            if (tvData.id) {
              const show = await hydrateTvMazeShow({
                domain: 'watch',
                kind: 'show',
                id: `tvmaze-${tvData.id}`,
                source: 'tvmaze',
                externalId: tvData.id,
                title: tvData.name || candidate.title,
                year: tvData.premiered ? Number(tvData.premiered.slice(0, 4)) : candidate.year,
                mediaType: 'tv',
                genres: tvData.genres?.length ? tvData.genres : candidate.genres,
                rating: tvData.rating?.average || candidate.communityRating || 7.8,
                posterUrl: tvData.image?.original || tvData.image?.medium || candidate.posterUrl || '',
                backdropUrl:
                  tvData.image?.original || tvData.image?.medium || candidate.posterUrl || '',
                overview: stripHtml(tvData.summary) || candidate.overview || '',
              });
              return {
                candidate: { ...candidate, mediaType: show.mediaType },
                selected: !candidate.existingId,
                show: {
                  ...show,
                  posterUrl: show.posterUrl || candidate.posterUrl || '',
                  backdropUrl: show.backdropUrl || candidate.posterUrl || '',
                  genres: show.genres.length > 0 ? show.genres : candidate.genres,
                  rating: show.rating || candidate.communityRating || 7.8,
                },
              };
            }
          }
        } catch {
          // fall through to standard live search
        }
      }

      const hits = await searchLiveMedia(candidate.title, 'tv', tmdbApiKey);
      const best = pickBestMatch(hits, 'show');
      if (best) {
        const hydrated = await hydrateLiveShow(best, tmdbApiKey);
        if (hydrated.mediaType === 'anime') {
          return {
            candidate: { ...candidate, mediaType: 'anime' },
            selected: !candidate.existingId,
            anime: {
              ...hydrated,
              posterUrl: hydrated.posterUrl || candidate.posterUrl || '',
              backdropUrl: hydrated.backdropUrl || candidate.posterUrl || '',
              genres: hydrated.genres.length > 0 ? hydrated.genres : candidate.genres,
              rating: hydrated.rating || candidate.communityRating || 7.8,
            },
          };
        }
        return {
          candidate: { ...candidate, mediaType: 'tv' },
          selected: !candidate.existingId,
          show: {
            ...hydrated,
            posterUrl: hydrated.posterUrl || candidate.posterUrl || '',
            backdropUrl: hydrated.backdropUrl || candidate.posterUrl || '',
            genres: hydrated.genres.length > 0 ? hydrated.genres : candidate.genres,
            rating: hydrated.rating || candidate.communityRating || 7.8,
          },
        };
      }
      const fallback = buildFallbackShow(candidate);
      if (fallback.mediaType === 'anime') {
        return {
          candidate,
          selected: !candidate.existingId,
          anime: fallback,
        };
      }
      return {
        candidate,
        selected: !candidate.existingId,
        show: fallback,
      };
    }

    if (candidate.kind === 'movie') {
      const hits = await searchLiveMedia(candidate.title, 'movie', tmdbApiKey);
      const best = pickBestMatch(hits, 'movie');
      if (best) {
        const movie = hydrateLiveMovie(best);
        return {
          candidate,
          selected: !candidate.existingId,
          movie: {
            ...movie,
            posterUrl: movie.posterUrl || candidate.posterUrl || '',
            backdropUrl: movie.backdropUrl || candidate.posterUrl || '',
            director:
              candidate.creator && movie.director === 'Feature Film'
                ? candidate.creator
                : movie.director,
            genres: candidate.genres.length > 0 ? candidate.genres : movie.genres,
            rating: candidate.communityRating || movie.rating,
          },
        };
      }
      return {
        candidate,
        selected: !candidate.existingId,
        movie: buildFallbackMovie(candidate),
      };
    }

    if (candidate.kind === 'read') {
      const fallbackRead = buildFallbackReadItem(candidate);
      let readItem: ReadItem = fallbackRead;

      let hits = await searchLiveMedia(candidate.title, candidate.mediaType, tmdbApiKey);
      let best = pickBestMatch(hits, 'read');
      if (!best && candidate.mediaType === 'comic') {
        const cleanedQuery = stripEditionAffixes(candidate.title);
        if (cleanedQuery && cleanedQuery.toLowerCase() !== candidate.title.toLowerCase()) {
          hits = await searchLiveMedia(cleanedQuery, 'comic', tmdbApiKey);
          best = pickBestMatch(hits, 'read');
        }
      }
      if (best) {
        const liveRead = hydrateLiveReadItem(best);
        readItem = {
          ...liveRead,
          title: candidate.mediaType === 'comic' ? formatDisplayTitle(candidate.title) : liveRead.title,
          coverUrl: liveRead.coverUrl || candidate.posterUrl || '',
          backdropUrl: liveRead.backdropUrl || candidate.posterUrl || '',
          comicPublisher: liveRead.comicPublisher || fallbackRead.comicPublisher,
          comicKind: isCollectedComicItem(fallbackRead) ? 'collection' : liveRead.comicKind,
        };
      }

      if (readItem.format === 'comic') {
        if (isCollectedComicItem(readItem)) {
          const col = await fetchComicCollectionIssues({
            title: candidate.title,
            isbn: extractReadItemIsbn(readItem),
            overview: readItem.overview,
            publisher: readItem.comicPublisher,
            wiki: readItem.comicSeriesWiki,
            pageTitle: readItem.comicSeriesVolTitle,
            limit: Math.max(80, readItem.totalUnits),
          });
          if (Object.keys(col.issues).length > 0) {
            const total = col.totalIssues || readItem.totalUnits;
            const resolvedCover = col.coverUrl || readItem.coverUrl;
            const resolvedPub = col.publisher || readItem.comicPublisher;
            readItem = {
              ...readItem,
              comicKind: 'collection',
              ...(col.wiki ? { comicSeriesWiki: col.wiki } : {}),
              ...(col.collectionPageTitle ? { comicSeriesVolTitle: col.collectionPageTitle } : {}),
              ...(resolvedPub ? { comicPublisher: resolvedPub } : {}),
              ...(readItem.creator === 'Author' && resolvedPub ? { creator: resolvedPub } : {}),
              ...(col.year ? { year: col.year } : {}),
              ...(resolvedCover ? { coverUrl: resolvedCover, backdropUrl: resolvedCover } : {}),
              totalUnits: total,
              baseTotalUnits: total,
              issueDetails: col.issues,
              issueDetailsKey: `default::${total}::${COMIC_ISSUE_CACHE_VERSION}`,
            };
          }
        } else if (readItem.comicKind === 'series' && readItem.comicSeriesWiki && readItem.comicSeriesVolTitle) {
          const { issues, totalIssues } = await fetchComicSeriesIssues(
            readItem.comicSeriesWiki,
            readItem.comicSeriesVolTitle,
            Math.max(80, readItem.totalUnits)
          );
          if (Object.keys(issues).length > 0) {
            const total = totalIssues || readItem.totalUnits;
            readItem = {
              ...readItem,
              totalUnits: total,
              issueDetails: issues,
              issueDetailsKey: `default::${total}::${COMIC_ISSUE_CACHE_VERSION}`,
            };
          }
        }
      }

      return {
        candidate,
        selected: !candidate.existingId,
        read: readItem,
      };
    }

    const hits = await searchLiveMedia(candidate.title, 'game', tmdbApiKey);
    const best = pickBestMatch(hits, 'game');
    if (best && best.posterUrl) {
      const game = hydrateLiveGameItem(best);
      return {
        candidate,
        selected: !candidate.existingId,
        game: {
          ...game,
          coverUrl: game.coverUrl || candidate.posterUrl || '',
          backdropUrl: game.backdropUrl || candidate.posterUrl || '',
        },
      };
    }
    const enrichedGame = await enrichGameStub(candidate.title, candidate.year);
    if (enrichedGame && (enrichedGame.coverUrl || enrichedGame.steamAppId || enrichedGame.igdbId)) {
      const fallbackGame = buildFallbackGameItem(candidate);
      const known = lookupKnownGameChapters(enrichedGame.title || candidate.title);
      return {
        candidate,
        selected: !candidate.existingId,
        game: {
          ...fallbackGame,
          ...(enrichedGame.igdbId ? { igdbId: enrichedGame.igdbId } : {}),
          ...(enrichedGame.steamAppId ? { steamAppId: enrichedGame.steamAppId } : {}),
          title: enrichedGame.title || fallbackGame.title,
          developer: enrichedGame.developer || fallbackGame.developer,
          year: enrichedGame.year || fallbackGame.year,
          genres: enrichedGame.genres?.length ? enrichedGame.genres : fallbackGame.genres,
          platforms: enrichedGame.platforms?.length ? enrichedGame.platforms : fallbackGame.platforms,
          coverUrl: enrichedGame.coverUrl || fallbackGame.coverUrl || candidate.posterUrl || '',
          backdropUrl:
            enrichedGame.backdropUrl ||
            enrichedGame.coverUrl ||
            fallbackGame.backdropUrl ||
            candidate.posterUrl ||
            '',
          overview: enrichedGame.overview || fallbackGame.overview,
          ...(enrichedGame.franchise ? { franchise: enrichedGame.franchise } : {}),
          ...(known
            ? {
                totalChapters: known.totalChapters,
                chapterUnit: known.unit,
                chapterSource: known.source,
                chapterNote: known.note,
              }
            : {}),
        },
      };
    }
    if (best) {
      const game = hydrateLiveGameItem(best);
      return {
        candidate,
        selected: !candidate.existingId,
        game: {
          ...game,
          coverUrl: game.coverUrl || candidate.posterUrl || '',
          backdropUrl: game.backdropUrl || candidate.posterUrl || '',
        },
      };
    }
  } catch {
    // gracefully fall back below
  }

  return buildFallbackPreparedEntry(candidate);
}

export async function enrichGameStub(
  title: string,
  year?: number
): Promise<(Partial<GameItem> & { sourceLabel: string }) | null> {
  const clean = title.trim();
  if (!clean) return null;
  try {
    const qs = new URLSearchParams({ action: 'enrich', q: clean });
    if (year && year > 1970) qs.set('year', String(year));
    const res = await fetch(`/api/igdb?${qs.toString()}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        found?: boolean;
        source?: 'igdb' | 'steam';
        item?: {
          title?: string;
          year?: number;
          coverUrl?: string;
          backdropUrl?: string;
          overview?: string;
          developer?: string;
          genres?: string[];
          platforms?: string[];
          igdbId?: number;
          steamAppId?: number;
          franchise?: string;
          rating?: number;
        };
      };
      if (data.found && data.item) {
        const it = data.item;
        const platforms = toGamePlatforms(it.platforms);
        return {
          ...(it.title ? { title: it.title } : {}),
          ...(it.year ? { year: it.year } : {}),
          ...(it.coverUrl ? { coverUrl: it.coverUrl } : {}),
          ...(it.backdropUrl || it.coverUrl ? { backdropUrl: it.backdropUrl || it.coverUrl } : {}),
          ...(it.overview ? { overview: it.overview } : {}),
          ...(it.developer ? { developer: it.developer } : {}),
          ...(it.genres?.length ? { genres: it.genres } : {}),
          ...(platforms.length ? { platforms } : {}),
          ...(it.igdbId ? { igdbId: it.igdbId } : {}),
          ...(it.steamAppId ? { steamAppId: it.steamAppId } : {}),
          ...(it.franchise ? { franchise: it.franchise } : {}),
          ...(typeof it.rating === 'number' && it.rating > 0 ? { rating: it.rating } : {}),
          sourceLabel: data.source === 'igdb' ? 'IGDB' : 'Steam',
        };
      }
    }
  } catch {
    // Fall through to Wikipedia
  }

  try {
    const wikiHit = await searchWikipediaSummary(clean, 'game');
    if (wikiHit && (wikiHit.posterUrl || wikiHit.overview)) {
      return {
        ...(wikiHit.posterUrl ? { coverUrl: wikiHit.posterUrl, backdropUrl: wikiHit.posterUrl } : {}),
        ...(wikiHit.overview ? { overview: wikiHit.overview } : {}),
        ...(wikiHit.year ? { year: wikiHit.year } : {}),
        sourceLabel: 'Wikipedia',
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function enrichMovieStub(
  title: string,
  year?: number,
  tmdbApiKey?: string
): Promise<(Partial<Movie> & { sourceLabel: string }) | null> {
  const clean = title.trim();
  if (!clean) return null;
  try {
    const hits = await searchLiveMedia(clean, 'movie', tmdbApiKey);
    const movies = hits.filter((h) => h.kind === 'movie');
    if (movies.length === 0) return null;
    const tNorm = normalizeTitleKey(clean);
    const best =
      movies.find((m) => normalizeTitleKey(m.title) === tNorm && (!year || !m.year || Math.abs(m.year - year) <= 2)) ||
      movies.find((m) => normalizeTitleKey(m.title).includes(tNorm) || tNorm.includes(normalizeTitleKey(m.title))) ||
      movies[0];

    let details: Partial<Movie> = {};
    if (best.source === 'tmdb' && Number(best.externalId)) {
      details = (await fetchTmdbMovieDetails(Number(best.externalId), tmdbApiKey)) || {};
    }

    return {
      ...(best.source === 'tmdb' && Number(best.externalId) ? { tmdbId: Number(best.externalId) } : {}),
      title: best.title,
      year: details.releaseDate ? Number(details.releaseDate.slice(0, 4)) || best.year : best.year,
      posterUrl: details.posterUrl || best.posterUrl,
      backdropUrl: details.backdropUrl || best.backdropUrl || best.posterUrl,
      overview: details.overview || best.overview,
      director: details.director || best.director,
      runtime: details.runtime || best.runtime,
      genres: details.genres?.length ? details.genres : best.genres,
      cast: details.cast,
      trailerUrl: details.trailerUrl,
      releaseDate: details.releaseDate,
      rating: best.rating,
      sourceLabel: best.source === 'tmdb' ? 'TMDB' : 'Live Search',
    };
  } catch {
    return null;
  }
}

export async function fetchLiveMangaChapterCount(
  title: string,
  year?: number
): Promise<{
  totalChapters?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  source?: 'mangaupdates' | 'mangadex';
  matchedTitle?: string;
  checkedAt?: string;
} | null> {
  const clean = title.trim();
  if (!clean) return null;
  try {
    const qs = new URLSearchParams({ title: clean });
    if (year && year > 1900) qs.set('year', String(year));
    const res = await fetch(`/api/manga-chapters?${qs.toString()}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      found?: boolean;
      matchedTitle?: string;
      totalChapters?: number;
      status?: 'ongoing' | 'completed' | 'hiatus';
      source?: 'mangaupdates' | 'mangadex';
      checkedAt?: string;
    };
    if (!data.found && !data.status) return null;
    return {
      totalChapters: data.totalChapters,
      status: data.status,
      source: data.source,
      matchedTitle: data.matchedTitle,
      checkedAt: data.checkedAt,
    };
  } catch {
    return null;
  }
}

export function buildFallbackPreparedEntry(candidate: ImportCandidate): PreparedImportEntry {
  const selected = !candidate.existingId;
  if (candidate.kind === 'show' || candidate.kind === 'anime') {
    const fallback = buildFallbackShow(candidate);
    if (fallback.mediaType === 'anime') {
      return { candidate, selected, anime: fallback };
    }
    return { candidate, selected, show: fallback };
  }
  if (candidate.kind === 'movie') {
    return { candidate, selected, movie: buildFallbackMovie(candidate) };
  }
  if (candidate.kind === 'read') {
    return { candidate, selected, read: buildFallbackReadItem(candidate) };
  }
  return { candidate, selected, game: buildFallbackGameItem(candidate) };
}
