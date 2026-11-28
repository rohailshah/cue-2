import type {
  ComicIssueMeta,
  CueStoreState,
  Episode,
  GameItem,
  GameProgress,
  MediaDomain,
  Movie,
  ReadItem,
  ReadProgress,
  Show,
  ShowProgress,
} from '../types';
import { countDeduplicatedReadUnits } from './atoms';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const STAT_MONTH_ABBR = [
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

export function getTodayLocalYmd(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function parseMonthAbbrOrName(raw: string): number | null {
  const clean = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (clean.length < 3) return null;
  const idx = STAT_MONTH_ABBR.findIndex(
    (m) => clean.startsWith(m.toLowerCase()) || m.toLowerCase() === clean.slice(0, 3)
  );
  return idx >= 0 ? idx + 1 : null;
}

export function isEpisodeReleased(
  ep: Pick<Episode, 'airdate' | 'airstamp'>,
  now = new Date(),
  showHasRealAirdates = true
): boolean {
  if (ep.airstamp) {
    const ts = Date.parse(ep.airstamp);
    if (!Number.isNaN(ts)) return ts <= now.getTime();
  }
  const raw = (ep.airdate || '').trim();
  if (!raw || /^(?:tba|tbd|unknown|n\/a|none|null|unannounced)$/i.test(raw)) {
    return !showHasRealAirdates;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10) <= getTodayLocalYmd(now);
  }
  const ym = raw.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    return `${ym[1]}-${ym[2]}` <= getTodayLocalYmd(now).slice(0, 7);
  }
  const yrOnly = raw.match(/^(\d{4})$/);
  if (yrOnly) {
    return Number(yrOnly[1]) <= now.getFullYear();
  }
  const mdy = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const m1 = parseMonthAbbrOrName(mdy[1]);
    if (m1) return `${mdy[3]}-${pad2(m1)}-${pad2(Number(mdy[2]))}` <= getTodayLocalYmd(now);
  }
  const dmy = raw.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmy) {
    const m1 = parseMonthAbbrOrName(dmy[2]);
    if (m1) return `${dmy[3]}-${pad2(m1)}-${pad2(Number(dmy[1]))}` <= getTodayLocalYmd(now);
  }
  const moYr = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (moYr) {
    const m1 = parseMonthAbbrOrName(moYr[1]);
    if (m1) return `${moYr[2]}-${pad2(m1)}` <= getTodayLocalYmd(now).slice(0, 7);
  }
  return true;
}

export function parseComicIssueReleaseYmd(meta?: ComicIssueMeta): string | null {
  if (!meta) return null;
  if (meta.releaseDateIso && /^\d{4}-\d{2}-\d{2}/.test(meta.releaseDateIso)) {
    return meta.releaseDateIso.slice(0, 10);
  }
  const rel = (meta.releaseDate || '').trim();
  if (!rel) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(rel)) {
    return rel.slice(0, 10);
  }
  const ym = rel.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    return `${ym[1]}-${ym[2]}-01`;
  }
  const mdy = rel.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const m1 = parseMonthAbbrOrName(mdy[1]);
    if (m1) return `${mdy[3]}-${pad2(m1)}-${pad2(Number(mdy[2]))}`;
  }
  const dmy = rel.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (dmy) {
    const m1 = parseMonthAbbrOrName(dmy[2]);
    if (m1) return `${dmy[3]}-${pad2(m1)}-${pad2(Number(dmy[1]))}`;
  }
  const moYr = rel.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (moYr) {
    const m1 = parseMonthAbbrOrName(moYr[1]);
    if (m1) {
      if (meta.wiki === 'dc') {
        const d = new Date(Date.UTC(Number(moYr[2]), m1 - 3, 1));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
      }
      return `${moYr[2]}-${pad2(m1)}-01`;
    }
  }
  return null;
}

export function isComicIssueReleased(meta?: ComicIssueMeta, now = new Date()): boolean {
  if (!meta) return true;
  if (!meta.releaseDateIso) {
    const rel = (meta.releaseDate || '').trim();
    if (/^(?:tba|tbd|unknown|n\/a|unannounced|solicit)/i.test(rel)) {
      return false;
    }
    const yrOnly = rel.match(/^(\d{4})$/);
    if (yrOnly) {
      return Number(yrOnly[1]) <= now.getFullYear();
    }
  }
  const ymd = parseComicIssueReleaseYmd(meta);
  if (!ymd) return true;
  return ymd <= getTodayLocalYmd(now);
}

export function isMovieReleased(
  movie: Pick<Movie, 'releaseDate' | 'year'>,
  now = new Date()
): boolean {
  if (movie.releaseDate && /^\d{4}-\d{2}-\d{2}/.test(movie.releaseDate)) {
    return movie.releaseDate.slice(0, 10) <= getTodayLocalYmd(now);
  }
  if (movie.year > now.getFullYear()) return false;
  return true;
}

export function getDaysUntilRelease(
  ymd?: string | null,
  airstamp?: string,
  now = new Date()
): number | null {
  let effectiveYmd = ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd) ? ymd.slice(0, 10) : null;
  if (airstamp) {
    const dt = new Date(airstamp);
    if (!Number.isNaN(dt.getTime())) {
      effectiveYmd = getTodayLocalYmd(dt);
    }
  }
  if (!effectiveYmd) return null;
  const [y, m, d] = effectiveYmd.split('-').map(Number);
  if (!y || !m || !d) return null;
  const targetMidnight = new Date(y, m - 1, d).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((targetMidnight - todayMidnight) / 86_400_000);
}

export function formatUpcomingReleaseLabel(
  ymd?: string | null,
  airstamp?: string,
  now = new Date()
): string {
  const todayYmd = getTodayLocalYmd(now);
  if (airstamp) {
    const dt = new Date(airstamp);
    const ts = dt.getTime();
    if (!Number.isNaN(ts)) {
      const airLocalYmd = getTodayLocalYmd(dt);
      if (airLocalYmd === todayYmd && ts > now.getTime()) {
        const timeStr = dt.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        return `Today · ${timeStr}`;
      }
      const daysFromStamp = getDaysUntilRelease(airLocalYmd, airstamp, now);
      if (daysFromStamp === 0) return 'Today';
      if (daysFromStamp === 1) return 'Tomorrow';
      return formatAirDate(airLocalYmd);
    }
  }
  const days = getDaysUntilRelease(ymd, undefined, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd)) return formatAirDate(ymd.slice(0, 10));
  return ymd || 'TBA';
}

export function getEpisodeKey(season: number, episode: number): string {
  return `S${pad2(season)}E${pad2(episode)}`;
}

export function formatEpisodeCode(season: number, episode: number): string {
  return `S${pad2(season)} E${pad2(episode)}`;
}

export function formatAirDate(dateStr?: string): string {
  if (!dateStr) return 'TBA';
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getAllEpisodes(show: Show): Episode[] {
  const eps: Episode[] = [];
  for (const s of show.seasons) {
    for (const e of s.episodes) {
      eps.push(e);
    }
  }
  return eps;
}

export interface ComputedShowStats {
  totalEpisodes: number;
  airedEpisodes: number;
  unreleasedEpisodes: number;
  watchedUnique: number;
  totalWatches: number;
  nextEpisode: Episode | null;
  nextUpcomingEpisode: Episode | null;
  nextOrdinal: number;
  isFinished: boolean;
  isCaughtUp: boolean;
  progressRatio: number;
  airedProgressRatio: number;
  rewatchCount: number;
}

export function getShowStats(show: Show, progress?: ShowProgress): ComputedShowStats {
  const counts = progress?.episodeCounts || {};
  const allEps = getAllEpisodes(show);
  const totalEpisodes = allEps.length || show.totalEpisodes || 0;
  const now = new Date();
  const showHasRealAirdates = allEps.some((ep) => Boolean(ep.airdate || ep.airstamp));

  let airedEpisodes = 0;
  let watchedUnique = 0;
  let totalWatches = 0;
  let nextEpisode: Episode | null = null;
  let nextUpcomingEpisode: Episode | null = null;

  for (const ep of allEps) {
    const key = getEpisodeKey(ep.season, ep.number);
    const c = counts[key] || 0;
    const released = isEpisodeReleased(ep, now, showHasRealAirdates);
    if (released || c > 0) {
      airedEpisodes += 1;
    }
    if (c > 0) {
      watchedUnique += 1;
      totalWatches += c;
    } else if (released) {
      if (!nextEpisode) nextEpisode = ep;
    } else if (!nextUpcomingEpisode) {
      nextUpcomingEpisode = ep;
    }
  }

  if (allEps.length === 0) {
    airedEpisodes = totalEpisodes;
  }

  const unreleasedEpisodes = Math.max(0, totalEpisodes - airedEpisodes);
  const isFinished = totalEpisodes > 0 && watchedUnique >= totalEpisodes;
  const isCaughtUp =
    !isFinished && airedEpisodes > 0 && watchedUnique >= airedEpisodes && unreleasedEpisodes > 0;
  const minCount =
    isFinished && allEps.length > 0
      ? Math.min(...allEps.map((ep) => counts[getEpisodeKey(ep.season, ep.number)] || 0))
      : 0;
  const progressRatio = totalEpisodes > 0 ? watchedUnique / totalEpisodes : 0;
  const airedProgressRatio =
    airedEpisodes > 0 ? Math.min(1, watchedUnique / airedEpisodes) : progressRatio;

  return {
    totalEpisodes,
    airedEpisodes,
    unreleasedEpisodes,
    watchedUnique,
    totalWatches,
    nextEpisode,
    nextUpcomingEpisode,
    nextOrdinal: Math.min(airedEpisodes || totalEpisodes, watchedUnique + 1),
    isFinished,
    isCaughtUp,
    progressRatio,
    airedProgressRatio,
    rewatchCount: Math.max(0, minCount),
  };
}

export function getSeasonProgress(
  show: Show,
  seasonNumber: number,
  progress?: ShowProgress
): {
  watched: number;
  total: number;
  airedTotal: number;
  unreleased: number;
  ratio: number;
  seasonRewatch: number;
} {
  const season = show.seasons.find((s) => s.number === seasonNumber);
  if (!season || season.episodes.length === 0) {
    return { watched: 0, total: 0, airedTotal: 0, unreleased: 0, ratio: 0, seasonRewatch: 0 };
  }
  const counts = progress?.episodeCounts || {};
  const now = new Date();
  const showHasRealAirdates = getAllEpisodes(show).some((ep) => Boolean(ep.airdate || ep.airstamp));
  let watched = 0;
  let airedTotal = 0;
  let minCount = Infinity;
  for (const ep of season.episodes) {
    const c = counts[getEpisodeKey(ep.season, ep.number)] || 0;
    if (c > 0) watched += 1;
    if (c > 0 || isEpisodeReleased(ep, now, showHasRealAirdates)) airedTotal += 1;
    if (c < minCount) minCount = c;
  }
  const total = season.episodes.length;
  return {
    watched,
    total,
    airedTotal,
    unreleased: Math.max(0, total - airedTotal),
    ratio: airedTotal > 0 ? Math.min(1, watched / airedTotal) : total > 0 ? watched / total : 0,
    seasonRewatch: minCount === Infinity ? 0 : minCount,
  };
}

export function getCompletedReadUnits(item: ReadItem, progress?: ReadProgress): number[] {
  const total = Math.max(1, item.totalUnits);
  if (Array.isArray(progress?.completedUnits)) {
    const unique = new Set<number>();
    for (const u of progress.completedUnits) {
      const n = Math.round(u);
      if (Number.isFinite(n) && n >= 1 && n <= total) unique.add(n);
    }
    return [...unique].sort((a, b) => a - b);
  }
  const current = Math.min(total, Math.max(0, progress?.currentUnit || 0));
  const out: number[] = [];
  for (let i = 1; i <= current; i += 1) out.push(i);
  return out;
}

export function getReadStats(item: ReadItem, progress?: ReadProgress) {
  const total = Math.max(1, item.totalUnits);
  const completedList = getCompletedReadUnits(item, progress);
  const current = Math.min(total, completedList.length);
  const isFinished = progress?.status === 'finished' || current >= total;
  const ratio = Math.min(1, current / total);
  const stepAmount = 1;
  const unitLabel = item.unit === 'issues' ? 'issues' : 'chapters';
  const unitSingular = item.unit === 'issues' ? 'issue' : 'chapter';
  const doneSet = new Set(completedList);
  const now = new Date();
  const trackComicReleases =
    item.format === 'comic' && Boolean(item.issueDetails && Object.keys(item.issueDetails).length > 0);

  let releasedTotal = 0;
  let nextReleasedUnit: number | null = null;
  let nextUpcomingUnit: number | null = null;

  for (let u = 1; u <= total; u += 1) {
    const done = doneSet.has(u);
    const meta = trackComicReleases ? item.issueDetails?.[u] : undefined;
    const released = done || !trackComicReleases || isComicIssueReleased(meta, now);
    if (released) {
      releasedTotal += 1;
      if (!done && nextReleasedUnit === null) nextReleasedUnit = u;
    } else if (!done && nextUpcomingUnit === null) {
      nextUpcomingUnit = u;
    }
  }

  const unreleasedCount = Math.max(0, total - releasedTotal);
  const isCaughtUp =
    !isFinished && releasedTotal > 0 && nextReleasedUnit === null && unreleasedCount > 0;
  const nextUnit = isFinished ? total : (nextReleasedUnit ?? nextUpcomingUnit ?? total);
  const nextUpcomingMeta =
    nextUpcomingUnit !== null && item.format === 'comic'
      ? item.issueDetails?.[nextUpcomingUnit]
      : undefined;
  const releasedRatio = releasedTotal > 0 ? Math.min(1, current / releasedTotal) : ratio;

  const unitShort = item.unit === 'issues' ? `Issue #${current}` : `Ch. ${current}`;
  const nextUnitShort = isFinished
    ? unitShort
    : item.unit === 'issues'
      ? `Issue #${nextUnit}`
      : `Ch. ${nextUnit}`;
  return {
    current,
    total,
    releasedTotal,
    unreleasedCount,
    nextUnit,
    nextReleasedUnit,
    nextUpcomingUnit,
    nextUpcomingMeta,
    isCaughtUp,
    releasedRatio,
    completedUnits: completedList,
    ratio,
    isFinished,
    stepAmount,
    unitLabel,
    unitSingular,
    unitShort,
    nextUnitShort,
    rereadCount: progress?.rereadCount || (isFinished ? 1 : 0),
  };
}

export function formatWatchTime(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h';
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const remHours = totalHours % 24;

  if (months > 0) {
    return `${months}m ${remDays}d`;
  }
  if (days > 0) {
    return `${days}d ${remHours}h`;
  }
  const remMins = totalMinutes % 60;
  return totalHours > 0 ? `${totalHours}h ${remMins}m` : `${remMins}m`;
}

export function formatReadStatSummary(
  readChaptersCount: number,
  readIssuesCount: number,
  readFinishedCount: number
): { primary: string; secondary: string } {
  if (readChaptersCount === 0 && readIssuesCount > 0) {
    return {
      primary: `${readIssuesCount.toLocaleString()} ${readIssuesCount === 1 ? 'issue' : 'issues'}`,
      secondary: `${readFinishedCount} finished`,
    };
  }
  if (readIssuesCount === 0 && readChaptersCount > 0) {
    return {
      primary: `${readChaptersCount.toLocaleString()} ${readChaptersCount === 1 ? 'chapter' : 'chapters'}`,
      secondary: `${readFinishedCount} finished`,
    };
  }
  if (readChaptersCount > 0 && readIssuesCount > 0) {
    return {
      primary: `${readChaptersCount.toLocaleString()} chapters`,
      secondary: `${readIssuesCount.toLocaleString()} issues · ${readFinishedCount} finished`,
    };
  }
  return {
    primary: '0 chapters',
    secondary: `${readFinishedCount} finished`,
  };
}

export function formatGameMeta(
  game: Pick<GameItem, 'developer' | 'platforms'>,
  progress?: Pick<GameProgress, 'platform' | 'hoursPlayed'>,
  opts?: { includeHours?: boolean; includeDeveloper?: boolean }
): string {
  const platform = progress?.platform || game.platforms[0] || 'PC';
  const hours = progress?.hoursPlayed || 0;
  const dev = (game.developer || '').trim();

  let base: string = platform;
  if (/^pc\s*[·|/-]\s*steam$/i.test(dev) && platform === 'PC') {
    base = 'PC (Steam)';
  } else if (dev && dev.toLowerCase().includes(platform.toLowerCase())) {
    base = dev;
  } else if (
    dev &&
    dev !== 'Studio' &&
    dev !== 'Video Game' &&
    opts?.includeDeveloper !== false
  ) {
    base = `${platform} · ${dev}`;
  }

  if (opts?.includeHours !== false && hours > 0) {
    return `${base} · ${hours}h`;
  }
  return base;
}

const RAW_GENRE_BLOCKLIST = new Set([
  'video game',
  'video games',
  'feature film',
  'series',
  'tv',
  'movie',
  'anime',
  'manga',
  'comics',
  'comic',
  'novel',
  'light novel',
  'fiction',
  'graphic novels',
  'graphic novel',
  'comic books, strips',
  'comic books, strips, etc.',
  'cartoons and comics',
  'books',
  'studio',
  'general',
]);

const RAW_GENRE_ALIAS_MAP: Record<string, string> = {
  'science fiction': 'Sci-Fi',
  'science-fiction': 'Sci-Fi',
  'sci-fi & fantasy': 'Sci-Fi',
  scifi: 'Sci-Fi',
  'open-world action': 'Action',
  'action & adventure': 'Action',
  'action-adventure': 'Action',
  superheroes: 'Superhero',
  superhero: 'Superhero',
  'role-playing': 'RPG',
  'role playing': 'RPG',
  rpg: 'RPG',
  'mystery & thriller': 'Thriller',
  'comedy-drama': 'Comedy',
};

export function normalizeGenreLabel(raw: string): string | null {
  const trimmed = (raw || '').replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.length > 28) return null;
  if (trimmed.split(',').length >= 3) return null;
  const lower = trimmed.toLowerCase();
  if (RAW_GENRE_BLOCKLIST.has(lower)) return null;
  if (
    /fictitious character|comic strip|comic books|graphic novel|juvenile|translations|pictorial works|open library|history and criticism|\(.*character\)/i.test(
      trimmed
    )
  ) {
    return null;
  }
  return RAW_GENRE_ALIAS_MAP[lower] || trimmed;
}

export function cleanDisplayGenres(genres: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of genres || []) {
    const normalized = normalizeGenreLabel(g);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export interface AllMediaAnalytics {
  watchTimeLabel: string;
  watchMinutes: number;
  episodesWatchedCount: number;
  moviesWatchedCount: number;
  totalWatchCount: number;
  readFinishedCount: number;
  readChaptersCount: number;
  readIssuesCount: number;
  totalRereads: number;
  totalGameHours: number;
  gamesCompletedCount: number;
  platinumCount: number;
  totalReplays: number;
  journalEntriesCount: number;
  topGenres: { genre: string; score: number; count: number }[];
  topRevisited: {
    domain: MediaDomain;
    id: string;
    title: string;
    posterUrl: string;
    count: number;
  }[];
}

export function computeAllMediaStats(state: CueStoreState): AllMediaAnalytics {
  let watchMinutes = 0;
  let episodesWatchedCount = 0;
  let moviesWatchedCount = 0;
  let readFinishedCount = 0;
  let readChaptersCount = 0;
  let readIssuesCount = 0;
  let totalRereads = 0;
  let totalGameHours = 0;
  let gamesCompletedCount = 0;
  let platinumCount = 0;
  let totalReplays = 0;

  const genreMap = new Map<string, { score: number; count: number }>();
  const bumpGenre = (genres: string[], weight: number) => {
    for (const g of cleanDisplayGenres(genres)) {
      const prev = genreMap.get(g) || { score: 0, count: 0 };
      genreMap.set(g, { score: prev.score + weight, count: prev.count + 1 });
    }
  };

  const revisited: AllMediaAnalytics['topRevisited'] = [];

  for (const showId of state.showOrder) {
    const show = state.shows[showId];
    const prog = state.showProgress[showId];
    if (!show || !prog) continue;
    let showEps = 0;
    for (const ep of getAllEpisodes(show)) {
      const c = prog.episodeCounts[getEpisodeKey(ep.season, ep.number)] || 0;
      if (c > 0) {
        episodesWatchedCount += c;
        showEps += c;
        watchMinutes += (ep.runtime || show.runtimeAvg || 42) * c;
      }
    }
    if (showEps > 0) {
      bumpGenre(show.genres, Math.max(1, Math.round(showEps / 5)));
      const stats = getShowStats(show, prog);
      if (stats.rewatchCount > 1) {
        revisited.push({
          domain: 'watch',
          id: show.id,
          title: show.title,
          posterUrl: show.posterUrl,
          count: stats.rewatchCount,
        });
      }
    }
  }

  for (const movieId of state.movieOrder) {
    const movie = state.movies[movieId];
    const prog = state.movieProgress[movieId];
    if (!movie || !prog || prog.watchCount <= 0) continue;
    moviesWatchedCount += prog.watchCount;
    watchMinutes += (movie.runtime || 120) * prog.watchCount;
    bumpGenre(movie.genres, prog.watchCount * 2);
    if (prog.watchCount > 1) {
      revisited.push({
        domain: 'watch',
        id: movie.id,
        title: movie.title,
        posterUrl: movie.posterUrl,
        count: prog.watchCount,
      });
    }
  }

  const countedComicAtomicIds = new Set<string>();
  for (const readId of state.readOrder) {
    const item = state.readItems[readId];
    const prog = state.readProgress[readId];
    if (!item || !prog) continue;
    const stats = getReadStats(item, prog);
    if (stats.isFinished) readFinishedCount += 1;
    if (stats.rereadCount > 1) {
      totalRereads += stats.rereadCount - 1;
      revisited.push({
        domain: 'read',
        id: item.id,
        title: item.title,
        posterUrl: item.coverUrl,
        count: stats.rereadCount,
      });
    }
    const totalUnits = countDeduplicatedReadUnits(
      item,
      stats.completedUnits,
      stats.rereadCount,
      stats.isFinished,
      countedComicAtomicIds
    );
    if (item.unit === 'issues') readIssuesCount += totalUnits;
    else readChaptersCount += totalUnits;

    if (stats.current > 0) {
      bumpGenre(item.genres, Math.max(1, Math.round(totalUnits / 12)));
    }
  }

  for (const gameId of state.gameOrder) {
    const game = state.games[gameId];
    const prog = state.gameProgress[gameId];
    if (!game || !prog) continue;
    totalGameHours += prog.hoursPlayed || 0;
    if (prog.status === 'completed') gamesCompletedCount += 1;
    if (prog.platinum) platinumCount += 1;
    if (prog.playthroughCount > 1) {
      totalReplays += prog.playthroughCount - 1;
      revisited.push({
        domain: 'play',
        id: game.id,
        title: game.title,
        posterUrl: game.coverUrl,
        count: prog.playthroughCount,
      });
    }
    if (prog.hoursPlayed > 0) {
      bumpGenre(game.genres, Math.max(1, Math.round(prog.hoursPlayed / 15)));
    }
  }

  const topGenres = Array.from(genreMap.entries())
    .map(([genre, v]) => ({ genre, ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return {
    watchTimeLabel: formatWatchTime(watchMinutes),
    watchMinutes,
    episodesWatchedCount,
    moviesWatchedCount,
    totalWatchCount: episodesWatchedCount + moviesWatchedCount,
    readFinishedCount,
    readChaptersCount,
    readIssuesCount,
    totalRereads,
    totalGameHours,
    gamesCompletedCount,
    platinumCount,
    totalReplays,
    journalEntriesCount: state.journalEntries.length,
    topGenres,
    topRevisited: revisited.sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (Number.isNaN(diffMs) || diffMs < 60_000) return 'now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}
