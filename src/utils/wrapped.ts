import type { CueStoreState, MediaDomain } from '../types';
import { resolveComicEditionCover } from './editions';
import { computeJournalAdvancedStats } from './journalAnalytics';
import { cleanDisplayGenres, getReadStats, getShowStats } from './stats';

export interface WrappedHighlightTitle {
  domain: MediaDomain;
  kind: 'show' | 'movie' | 'read' | 'game';
  id: string;
  title: string;
  posterUrl: string;
  rating: number;
  subtitle: string;
}

export interface YearWrappedSummary {
  yearLabel: string;
  year: number | 'all';
  totalHours: number;
  watchPct: number;
  readPct: number;
  playPct: number;
  episodesCount: number;
  moviesCount: number;
  issuesCount: number;
  chaptersCount: number;
  gamesCompletedCount: number;
  finishedTitlesCount: number;
  activeDaysCount: number;
  longestStreakDays: number;
  biggestDayLabel: string;
  biggestDayCount: number;
  bestMonthLabel: string;
  archetype: string;
  topGenres: string[];
  topCreators: string[];
  topTitles: WrappedHighlightTitle[];
}

function getIsoYear(iso?: string): number | null {
  if (!iso) return null;
  const m = iso.trim().match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

export function getAvailableWrappedYears(state: CueStoreState): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  const collect = (iso?: string) => {
    const y = getIsoYear(iso);
    if (y && y >= 2000 && y <= 2035) years.add(y);
  };
  for (const h of state.history || []) collect(h.loggedAt);
  for (const j of state.journalEntries || []) collect(j.createdAt);
  for (const p of Object.values(state.showProgress)) {
    collect(p.finishedAt);
    collect(p.lastWatchedAt);
    for (const r of p.completedRuns || []) collect(r.finishedAt);
  }
  for (const p of Object.values(state.movieProgress)) {
    collect(p.watchedAt);
    for (const r of p.completedRuns || []) collect(r.finishedAt);
  }
  for (const p of Object.values(state.readProgress)) {
    collect(p.finishedAt);
    collect(p.lastReadAt);
    for (const r of p.completedRuns || []) collect(r.finishedAt);
  }
  for (const p of Object.values(state.gameProgress)) {
    collect(p.finishedAt);
    collect(p.lastPlayedAt);
    for (const r of p.completedRuns || []) collect(r.finishedAt);
  }
  return [...years].sort((a, b) => b - a);
}

/** Computes a standalone Year-in-Review / Wrapped summary for a given calendar year or All-Time. */
export function computeYearWrapped(
  state: CueStoreState,
  year: number | 'all'
): YearWrappedSummary {
  if (year === 'all') {
    const adv = computeJournalAdvancedStats(state, 'all');
    const topTitles = collectTopRatedTitles(state, 'all');
    let episodesCount = 0;
    let moviesCount = 0;
    let issuesCount = 0;
    let chaptersCount = 0;
    let gamesCompletedCount = 0;

    for (const id of state.showOrder) {
      const s = state.shows[id];
      const p = state.showProgress[id];
      if (!s || !p) continue;
      episodesCount += getShowStats(s, p).totalWatches;
    }
    for (const p of Object.values(state.movieProgress)) {
      moviesCount += p.watchCount || 0;
    }
    for (const id of state.readOrder) {
      const r = state.readItems[id];
      const p = state.readProgress[id];
      if (!r || !p) continue;
      const done = getReadStats(r, p).completedUnits.length;
      if (r.unit === 'issues') issuesCount += done;
      else chaptersCount += done;
    }
    for (const p of Object.values(state.gameProgress)) {
      if (p.status === 'completed') gamesCompletedCount += 1;
    }

    return {
      yearLabel: 'All-Time',
      year: 'all',
      totalHours: adv.totalHours,
      watchPct: adv.domainSplit.watchPct,
      readPct: adv.domainSplit.readPct,
      playPct: adv.domainSplit.playPct,
      episodesCount,
      moviesCount,
      issuesCount,
      chaptersCount,
      gamesCompletedCount,
      finishedTitlesCount: adv.habits.finishedCount,
      activeDaysCount: adv.calendarHeatmap.activeDaysCount,
      longestStreakDays: adv.hallOfFame.longestStreakDays,
      biggestDayLabel: adv.hallOfFame.biggestDayLabel,
      biggestDayCount: adv.hallOfFame.biggestDayCount,
      bestMonthLabel: adv.hallOfFame.bestMonthLabel,
      archetype: adv.personality.archetype,
      topGenres: adv.topGenres.slice(0, 4).map((g) => g.name),
      topCreators: adv.topCreators.slice(0, 3).map((c) => c.name),
      topTitles,
    };
  }

  const inYear = (iso?: string): boolean => getIsoYear(iso) === year;

  // Build filtered synthetic state containing only activity from the target year for timeline metrics
  const filteredShows: CueStoreState['shows'] = {};
  const filteredShowOrder: string[] = [];
  const filteredShowProgress: CueStoreState['showProgress'] = {};
  const filteredMovies: CueStoreState['movies'] = {};
  const filteredMovieOrder: string[] = [];
  const filteredMovieProgress: CueStoreState['movieProgress'] = {};
  const filteredReads: CueStoreState['readItems'] = {};
  const filteredReadOrder: string[] = [];
  const filteredReadProgress: CueStoreState['readProgress'] = {};
  const filteredGames: CueStoreState['games'] = {};
  const filteredGameOrder: string[] = [];
  const filteredGameProgress: CueStoreState['gameProgress'] = {};

  let finishedTitlesCount = 0;
  let episodesCount = 0;
  let moviesCount = 0;
  let issuesCount = 0;
  let chaptersCount = 0;
  let gamesCompletedCount = 0;

  for (const id of state.showOrder) {
    const s = state.shows[id];
    const p = state.showProgress[id];
    if (!s || !p) continue;
    const runs = (p.completedRuns || []).filter((r) => inYear(r.finishedAt));
    const touched =
      inYear(p.finishedAt) ||
      inYear(p.lastWatchedAt) ||
      runs.length > 0 ||
      (state.history || []).some((h) => h.domain === 'watch' && h.mediaId === id && inYear(h.loggedAt));
    if (!touched) continue;
    filteredShows[id] = s;
    filteredShowOrder.push(id);
    filteredShowProgress[id] = {
      ...p,
      finishedAt: inYear(p.finishedAt) ? p.finishedAt : runs[0]?.finishedAt,
      lastWatchedAt: inYear(p.lastWatchedAt) ? p.lastWatchedAt : undefined,
      completedRuns: runs,
    };
    const st = getShowStats(s, p);
    if (inYear(p.finishedAt) || runs.length > 0) finishedTitlesCount += 1;
    episodesCount += st.totalWatches;
  }

  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const p = state.movieProgress[id];
    if (!m || !p || (p.watchCount || 0) === 0) continue;
    const runs = (p.completedRuns || []).filter((r) => inYear(r.finishedAt));
    const touched = inYear(p.watchedAt) || runs.length > 0;
    if (!touched) continue;
    filteredMovies[id] = m;
    filteredMovieOrder.push(id);
    filteredMovieProgress[id] = {
      ...p,
      watchedAt: inYear(p.watchedAt) ? p.watchedAt : runs[0]?.finishedAt,
      completedRuns: runs,
    };
    finishedTitlesCount += 1;
    moviesCount += runs.length > 0 ? runs.length : p.watchCount || 1;
  }

  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const p = state.readProgress[id];
    if (!r || !p) continue;
    const runs = (p.completedRuns || []).filter((x) => inYear(x.finishedAt));
    const touched =
      inYear(p.finishedAt) ||
      inYear(p.lastReadAt) ||
      runs.length > 0 ||
      (state.history || []).some((h) => h.domain === 'read' && h.mediaId === id && inYear(h.loggedAt));
    if (!touched) continue;
    filteredReads[id] = r;
    filteredReadOrder.push(id);
    filteredReadProgress[id] = {
      ...p,
      finishedAt: inYear(p.finishedAt) ? p.finishedAt : runs[0]?.finishedAt,
      lastReadAt: inYear(p.lastReadAt) ? p.lastReadAt : undefined,
      completedRuns: runs,
    };
    const done = getReadStats(r, p).completedUnits.length;
    if (r.unit === 'issues') issuesCount += done;
    else chaptersCount += done;
    if (inYear(p.finishedAt) || runs.length > 0) finishedTitlesCount += 1;
  }

  for (const id of state.gameOrder) {
    const g = state.games[id];
    const p = state.gameProgress[id];
    if (!g || !p) continue;
    const runs = (p.completedRuns || []).filter((x) => inYear(x.finishedAt));
    const touched =
      inYear(p.finishedAt) ||
      inYear(p.lastPlayedAt) ||
      runs.length > 0 ||
      (state.history || []).some((h) => h.domain === 'play' && h.mediaId === id && inYear(h.loggedAt));
    if (!touched) continue;
    filteredGames[id] = g;
    filteredGameOrder.push(id);
    filteredGameProgress[id] = {
      ...p,
      finishedAt: inYear(p.finishedAt) ? p.finishedAt : runs[0]?.finishedAt,
      lastPlayedAt: inYear(p.lastPlayedAt) ? p.lastPlayedAt : undefined,
      completedRuns: runs,
    };
    if (p.status === 'completed' && (inYear(p.finishedAt) || runs.length > 0)) {
      gamesCompletedCount += 1;
      finishedTitlesCount += 1;
    }
  }

  const yearState: CueStoreState = {
    ...state,
    shows: filteredShows,
    showOrder: filteredShowOrder,
    showProgress: filteredShowProgress,
    movies: filteredMovies,
    movieOrder: filteredMovieOrder,
    movieProgress: filteredMovieProgress,
    readItems: filteredReads,
    readOrder: filteredReadOrder,
    readProgress: filteredReadProgress,
    games: filteredGames,
    gameOrder: filteredGameOrder,
    gameProgress: filteredGameProgress,
    history: (state.history || []).filter((h) => inYear(h.loggedAt)),
    journalEntries: (state.journalEntries || []).filter((j) => inYear(j.createdAt)),
  };

  const adv = computeJournalAdvancedStats(yearState, 'all');
  return {
    yearLabel: String(year),
    year,
    totalHours: adv.totalHours,
    watchPct: adv.domainSplit.watchPct,
    readPct: adv.domainSplit.readPct,
    playPct: adv.domainSplit.playPct,
    episodesCount,
    moviesCount,
    issuesCount,
    chaptersCount,
    gamesCompletedCount,
    finishedTitlesCount,
    activeDaysCount: adv.calendarHeatmap.activeDaysCount,
    longestStreakDays: adv.hallOfFame.longestStreakDays,
    biggestDayLabel: adv.hallOfFame.biggestDayLabel,
    biggestDayCount: adv.hallOfFame.biggestDayCount,
    bestMonthLabel: adv.hallOfFame.bestMonthLabel,
    archetype: adv.personality.archetype,
    topGenres: adv.topGenres.slice(0, 4).map((g) => g.name),
    topCreators: adv.topCreators.slice(0, 3).map((c) => c.name),
    topTitles: collectTopRatedTitles(yearState, year),
  };
}

function collectTopRatedTitles(
  state: CueStoreState,
  _year: number | 'all'
): WrappedHighlightTitle[] {
  const candidates: WrappedHighlightTitle[] = [];
  for (const id of state.showOrder) {
    const s = state.shows[id];
    const p = state.showProgress[id];
    if (!s || !p?.rating) continue;
    const st = getShowStats(s, p);
    candidates.push({
      domain: 'watch',
      kind: 'show',
      id,
      title: s.title,
      posterUrl: s.posterUrl,
      rating: p.rating,
      subtitle: `${st.watchedUnique} eps · ${cleanDisplayGenres(s.genres).slice(0, 1).join('') || 'Show'}`,
    });
  }
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const p = state.movieProgress[id];
    if (!m || !p?.rating) continue;
    candidates.push({
      domain: 'watch',
      kind: 'movie',
      id,
      title: m.title,
      posterUrl: m.posterUrl,
      rating: p.rating,
      subtitle: `${m.year} · Film`,
    });
  }
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const p = state.readProgress[id];
    if (!r || !p?.rating) continue;
    const st = getReadStats(r, p);
    candidates.push({
      domain: 'read',
      kind: 'read',
      id,
      title: r.title,
      posterUrl: resolveComicEditionCover(r, p.edition, p),
      rating: p.rating,
      subtitle: `${st.completedUnits.length} ${r.unit}`,
    });
  }
  for (const id of state.gameOrder) {
    const g = state.games[id];
    const p = state.gameProgress[id];
    if (!g || !p?.rating) continue;
    candidates.push({
      domain: 'play',
      kind: 'game',
      id,
      title: g.title,
      posterUrl: g.coverUrl,
      rating: p.rating,
      subtitle: `${p.hoursPlayed || 0}h played`,
    });
  }
  return candidates.sort((a, b) => b.rating - a.rating).slice(0, 5);
}
