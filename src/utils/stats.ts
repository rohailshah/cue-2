import type {
  CueStoreState,
  Episode,
  MediaDomain,
  ReadItem,
  ReadProgress,
  Show,
  ShowProgress,
} from '../types';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
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
  watchedUnique: number;
  totalWatches: number;
  nextEpisode: Episode | null;
  nextOrdinal: number;
  isFinished: boolean;
  progressRatio: number;
  rewatchCount: number;
}

export function getShowStats(show: Show, progress?: ShowProgress): ComputedShowStats {
  const counts = progress?.episodeCounts || {};
  const allEps = getAllEpisodes(show);
  const totalEpisodes = allEps.length || show.totalEpisodes || 0;

  let watchedUnique = 0;
  let totalWatches = 0;
  let nextEpisode: Episode | null = null;

  for (const ep of allEps) {
    const key = getEpisodeKey(ep.season, ep.number);
    const c = counts[key] || 0;
    if (c > 0) {
      watchedUnique += 1;
      totalWatches += c;
    } else if (!nextEpisode) {
      nextEpisode = ep;
    }
  }

  const isFinished = totalEpisodes > 0 && watchedUnique >= totalEpisodes;
  const minCount =
    isFinished && allEps.length > 0
      ? Math.min(...allEps.map((ep) => counts[getEpisodeKey(ep.season, ep.number)] || 0))
      : 0;

  return {
    totalEpisodes,
    watchedUnique,
    totalWatches,
    nextEpisode,
    nextOrdinal: Math.min(totalEpisodes, watchedUnique + 1),
    isFinished,
    progressRatio: totalEpisodes > 0 ? watchedUnique / totalEpisodes : 0,
    rewatchCount: Math.max(0, minCount),
  };
}

export function getSeasonProgress(
  show: Show,
  seasonNumber: number,
  progress?: ShowProgress
): { watched: number; total: number; ratio: number; seasonRewatch: number } {
  const season = show.seasons.find((s) => s.number === seasonNumber);
  if (!season || season.episodes.length === 0) {
    return { watched: 0, total: 0, ratio: 0, seasonRewatch: 0 };
  }
  const counts = progress?.episodeCounts || {};
  let watched = 0;
  let minCount = Infinity;
  for (const ep of season.episodes) {
    const c = counts[getEpisodeKey(ep.season, ep.number)] || 0;
    if (c > 0) watched += 1;
    if (c < minCount) minCount = c;
  }
  const total = season.episodes.length;
  return {
    watched,
    total,
    ratio: total > 0 ? watched / total : 0,
    seasonRewatch: minCount === Infinity ? 0 : minCount,
  };
}

export function getReadStats(item: ReadItem, progress?: ReadProgress) {
  const total = Math.max(1, item.totalUnits);
  const current = Math.min(total, Math.max(0, progress?.currentUnit || 0));
  const isFinished = progress?.status === 'finished' || current >= total;
  const ratio = Math.min(1, current / total);
  const stepAmount = 1;
  const unitLabel = item.unit === 'issues' ? 'issues' : 'chapters';
  const unitSingular = item.unit === 'issues' ? 'issue' : 'chapter';
  const unitShort = item.unit === 'issues' ? `Issue #${current}` : `Ch. ${current}`;
  return {
    current,
    total,
    ratio,
    isFinished,
    stepAmount,
    unitLabel,
    unitSingular,
    unitShort,
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
    for (const g of genres) {
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
    const mult = Math.max(1, stats.rereadCount);
    const totalUnits = stats.current * (stats.isFinished ? mult : 1);
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
