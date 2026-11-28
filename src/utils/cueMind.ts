import { getAllCuratedDiscoverCandidates, getCollectionsForTitle } from '../data/discoverCollections';
import { COMIC_ISSUE_CACHE_VERSION, type LiveSearchResult } from '../services/mediaApi';
import type { CueStoreState, MediaDomain, PersonalMood } from '../types';
import { evaluateCustomListProgress } from './containers';
import { resolveComicEditionCover } from './editions';
import {
  cleanDisplayGenres,
  formatEpisodeCode,
  getReadStats,
  getShowStats,
  isMovieReleased,
} from './stats';

export const CUE_MIND_UNLOCK_THRESHOLD = 5;

export type MindIntent = 'auto' | 'quick' | 'deep' | 'finish';
export type DiscoverMindScope = 'all' | MediaDomain;

export interface TasteAnchorTitle {
  id: string;
  kind: 'show' | 'movie' | 'read' | 'game';
  domain: MediaDomain;
  title: string;
  rating?: number;
  genres: string[];
  creator?: string;
}

export interface CueTasteProfile {
  learnedEntriesCount: number;
  unlockThreshold: number;
  isUnlocked: boolean;
  trackedTitlesCount: number;
  journalCount: number;
  topGenres: string[];
  genreWeights: Record<string, number>;
  avoidGenres: string[];
  topCreators: string[];
  creatorWeights: Record<string, number>;
  topMoods: PersonalMood[];
  preferredDomains: MediaDomain[];
  underexploredDomains: MediaDomain[];
  preferredDecade?: number;
  pacePreference: 'bite-sized' | 'balanced' | 'epic';
  anchorTitles: TasteAnchorTitle[];
  summaryLine: string;
}

export interface CueMindThought {
  id: string;
  intent: Exclude<MindIntent, 'auto'>;
  tag: string;
  headline: string;
  reason: string;
  domain: MediaDomain | 'all';
  actionLabel: string;
  score?: number;
  target?: {
    kind: 'show' | 'movie' | 'read' | 'game' | 'list';
    id: string;
    title: string;
    posterUrl?: string;
  };
  requiresHeal?: boolean;
}

export interface CueMindDiscoverPick {
  id: string;
  domain: MediaDomain;
  tag: string;
  reason: string;
  matchPct: number;
  item: LiveSearchResult;
}

export interface CueMindSnapshot {
  greeting: string;
  balanceNote: string;
  brokenCoverCount: number;
  staleComicCount: number;
  taste: CueTasteProfile;
  thoughts: CueMindThought[];
}

const MOOD_GENRE_HINTS: Record<PersonalMood, string[]> = {
  mindblown: ['Sci-Fi', 'Mystery', 'Thriller', 'Psychological'],
  loved: ['Drama', 'Adventure', 'Fantasy'],
  intense: ['Action', 'Thriller', 'Crime', 'Horror'],
  cozy: ['Comedy', 'Fantasy', 'Slice of Life', 'Animation'],
  emotional: ['Drama', 'Romance'],
  funny: ['Comedy', 'Animation'],
};

function normTitle(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTimeContext(): {
  greeting: string;
  windowHint: 'morning' | 'afternoon' | 'evening' | 'night';
} {
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 12) return { greeting: 'Morning pulse', windowHint: 'morning' };
  if (hr >= 12 && hr < 17) return { greeting: 'Afternoon focus', windowHint: 'afternoon' };
  if (hr >= 17 && hr < 22) return { greeting: 'Evening cue', windowHint: 'evening' };
  return { greeting: 'Late-night session', windowHint: 'night' };
}

function isRecentIso(iso?: string, days = 14): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= days * 86_400_000;
}

function ratingSignalWeight(rating?: number): number {
  if (typeof rating !== 'number' || rating <= 0) return 0;
  if (rating >= 4.5) return 4.0;
  if (rating >= 4.0) return 2.5;
  if (rating >= 3.5) return 1.0;
  if (rating <= 2.0) return -2.0;
  return 0;
}

/** Continuously computes the user's evolving taste signature from their very first logged entry. */
export function computeTasteProfile(state: CueStoreState): CueTasteProfile {
  const genreWeights: Record<string, number> = {};
  const creatorWeights: Record<string, number> = {};
  const moodCounts = new Map<PersonalMood, number>();
  const decadeWeights = new Map<number, number>();
  const domainCounts: Record<MediaDomain, number> = { watch: 0, read: 0, play: 0 };

  let trackedTitlesCount = 0;
  let quickSignals = 0;
  let epicSignals = 0;

  const anchorCandidates: Array<TasteAnchorTitle & { weight: number }> = [];
  const journalCountByMedia = new Map<string, number>();

  for (const entry of state.journalEntries || []) {
    journalCountByMedia.set(
      entry.mediaId,
      (journalCountByMedia.get(entry.mediaId) || 0) + 1
    );
    if (entry.mood) {
      moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
    }
  }

  const addSignal = (opts: {
    id: string;
    kind: 'show' | 'movie' | 'read' | 'game';
    domain: MediaDomain;
    title: string;
    genres: string[];
    creator?: string;
    year?: number;
    rating?: number;
    mood?: PersonalMood;
    weight: number;
    pace?: 'quick' | 'epic';
  }) => {
    domainCounts[opts.domain] += 1;
    const cleanedGenres = cleanDisplayGenres(opts.genres);
    const rWeight = ratingSignalWeight(opts.rating);
    const jBonus = (journalCountByMedia.get(opts.id) || 0) * 0.8;
    const moodBonus = opts.mood
      ? opts.mood === 'loved' || opts.mood === 'mindblown'
        ? 2.0
        : 1.2
      : 0;
    const totalW = opts.weight + rWeight + moodBonus + jBonus;

    for (const g of cleanedGenres) {
      genreWeights[g] = Number(((genreWeights[g] || 0) + totalW).toFixed(2));
    }

    if (opts.mood) {
      moodCounts.set(opts.mood, (moodCounts.get(opts.mood) || 0) + 1);
      for (const mg of MOOD_GENRE_HINTS[opts.mood] || []) {
        genreWeights[mg] = Number(((genreWeights[mg] || 0) + 0.6).toFixed(2));
      }
    }

    const cleanCreator = (opts.creator || '').trim();
    if (
      cleanCreator &&
      !/^(author|studio|streaming|video game|pc|ps5|marvel comics|dc comics|image comics)$/i.test(
        cleanCreator
      )
    ) {
      creatorWeights[cleanCreator] = Number(
        ((creatorWeights[cleanCreator] || 0) + totalW).toFixed(2)
      );
    }

    if (opts.year && opts.year >= 1950 && opts.year <= new Date().getFullYear() + 1) {
      const dec = Math.floor(opts.year / 10) * 10;
      decadeWeights.set(dec, (decadeWeights.get(dec) || 0) + Math.max(0.5, totalW));
    }

    if (opts.pace === 'quick') quickSignals += 1;
    else if (opts.pace === 'epic') epicSignals += 1;

    if (
      totalW >= 2.5 ||
      (typeof opts.rating === 'number' && opts.rating >= 4) ||
      opts.mood === 'loved' ||
      opts.mood === 'mindblown'
    ) {
      anchorCandidates.push({
        id: opts.id,
        kind: opts.kind,
        domain: opts.domain,
        title: opts.title,
        rating: opts.rating,
        genres: cleanedGenres,
        creator: cleanCreator || undefined,
        weight: totalW,
      });
    }
  };

  for (const id of state.showOrder) {
    const s = state.shows[id];
    const prog = state.showProgress[id];
    if (!s || !prog?.bookmarked) continue;
    trackedTitlesCount += 1;
    const st = getShowStats(s, prog);
    let w = 1.0;
    if (st.watchedUnique > 0) w += 1.5;
    if (st.isFinished || st.isCaughtUp) w += 2.0;
    if (st.rewatchCount > 0 && st.isFinished) w += 1.5;
    if (isRecentIso(prog.lastWatchedAt)) w += 1.0;
    addSignal({
      id: s.id,
      kind: 'show',
      domain: 'watch',
      title: s.title,
      genres: s.genres,
      creator: s.network,
      year: s.year,
      rating: prog.rating,
      mood: prog.mood,
      weight: w,
      pace: (s.runtimeAvg || 42) <= 32 ? 'quick' : (s.totalEpisodes || 10) >= 30 ? 'epic' : undefined,
    });
  }

  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const prog = state.movieProgress[id];
    if (!m || !prog) continue;
    trackedTitlesCount += 1;
    let w = 1.0;
    if ((prog.watchCount || 0) > 0) w += 2.0;
    if ((prog.watchCount || 0) > 1) w += 1.5;
    if (isRecentIso(prog.watchedAt)) w += 1.0;
    addSignal({
      id: m.id,
      kind: 'movie',
      domain: 'watch',
      title: m.title,
      genres: m.genres,
      creator: m.director,
      year: m.year,
      rating: prog.rating,
      mood: prog.mood,
      weight: w,
      pace: m.runtime >= 145 ? 'epic' : m.runtime <= 100 ? 'quick' : undefined,
    });
  }

  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const prog = state.readProgress[id];
    if (!r || !prog?.bookmarked) continue;
    trackedTitlesCount += 1;
    const st = getReadStats(r, prog);
    let w = 1.0;
    if (st.current > 0) w += 1.5;
    if (st.isFinished || st.isCaughtUp) w += 2.0;
    if (st.rereadCount > 1) w += 1.5;
    if (isRecentIso(prog.lastReadAt)) w += 1.0;
    addSignal({
      id: r.id,
      kind: 'read',
      domain: 'read',
      title: r.title,
      genres: r.genres,
      creator: r.comicPublisher || r.creator,
      year: r.year,
      rating: prog.rating,
      mood: prog.mood,
      weight: w,
      pace: r.unit === 'issues' || r.format === 'manga' ? 'quick' : r.totalUnits >= 25 ? 'epic' : undefined,
    });
  }

  for (const id of state.gameOrder) {
    const g = state.games[id];
    const prog = state.gameProgress[id];
    if (!g || !prog?.bookmarked) continue;
    trackedTitlesCount += 1;
    let w = 1.0;
    if (prog.status === 'dropped') w -= 1.0;
    else if (prog.status === 'playing' || (prog.hoursPlayed || 0) > 0) w += 1.5;
    if (prog.status === 'completed') w += 2.0;
    if (prog.platinum || (prog.playthroughCount || 0) > 1) w += 1.5;
    if (isRecentIso(prog.lastPlayedAt)) w += 1.0;
    addSignal({
      id: g.id,
      kind: 'game',
      domain: 'play',
      title: g.title,
      genres: g.genres,
      creator: g.franchise || g.developer,
      year: g.year,
      rating: prog.rating,
      mood: prog.mood,
      weight: w,
      pace: (prog.hoursPlayed || 0) >= 40 ? 'epic' : (prog.hoursPlayed || 0) <= 10 ? 'quick' : undefined,
    });
  }

  // Incorporate live skip/dismiss feedback immediately
  for (const [g, count] of Object.entries(state.mindFeedback?.dismissedGenres || {})) {
    genreWeights[g] = Number(((genreWeights[g] || 0) - count * 0.75).toFixed(2));
  }

  const sortedGenres = Object.entries(genreWeights).sort((a, b) => b[1] - a[1]);
  const topGenres = sortedGenres.filter(([, w]) => w > 0).slice(0, 6).map(([g]) => g);
  const avoidGenres = sortedGenres.filter(([, w]) => w < 0).slice(0, 4).map(([g]) => g);

  const topCreators = Object.entries(creatorWeights)
    .filter(([, w]) => w > 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  const topMoods = Array.from(moodCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => m);

  const preferredDomains = (['watch', 'read', 'play'] as MediaDomain[]).sort(
    (a, b) => domainCounts[b] - domainCounts[a]
  );
  const underexploredDomains = (['watch', 'read', 'play'] as MediaDomain[]).filter(
    (d) => domainCounts[d] === 0 || (trackedTitlesCount >= 4 && domainCounts[d] <= Math.floor(trackedTitlesCount / 6))
  );

  const sortedDecades = Array.from(decadeWeights.entries()).sort((a, b) => b[1] - a[1]);
  const preferredDecade = sortedDecades[0]?.[0];

  const pacePreference: CueTasteProfile['pacePreference'] =
    epicSignals >= quickSignals + 2
      ? 'epic'
      : quickSignals >= epicSignals + 2
        ? 'bite-sized'
        : 'balanced';

  anchorCandidates.sort((a, b) => b.weight - a.weight);
  const anchorTitles: TasteAnchorTitle[] = anchorCandidates.slice(0, 6).map((a) => ({
    id: a.id,
    kind: a.kind,
    domain: a.domain,
    title: a.title,
    rating: a.rating,
    genres: a.genres,
    creator: a.creator,
  }));

  const journalCount = (state.journalEntries || []).length;
  const learnedEntriesCount = Math.max(trackedTitlesCount, journalCount);
  const isUnlocked = learnedEntriesCount >= CUE_MIND_UNLOCK_THRESHOLD;

  const summaryParts: string[] = [];
  if (topGenres.length > 0) summaryParts.push(`Loves ${topGenres.slice(0, 2).join(' & ')}`);
  if (preferredDomains.length > 0 && domainCounts[preferredDomains[0]] > 0) {
    const domLabel =
      preferredDomains[0] === 'watch' ? 'Watch' : preferredDomains[0] === 'read' ? 'Read' : 'Play';
    summaryParts.push(`leans ${domLabel}`);
  }
  if (pacePreference !== 'balanced') {
    summaryParts.push(pacePreference === 'epic' ? 'prefers deep epics' : 'prefers quick sessions');
  }
  const summaryLine =
    learnedEntriesCount === 0
      ? 'Log your first title or note to start teaching Cue Mind your taste.'
      : summaryParts.length > 0
        ? `Learned from ${learnedEntriesCount} ${
            learnedEntriesCount === 1 ? 'entry' : 'entries'
          }: ${summaryParts.join(' · ')}.`
        : `Learning from ${learnedEntriesCount} ${learnedEntriesCount === 1 ? 'entry' : 'entries'}.`;

  return {
    learnedEntriesCount,
    unlockThreshold: CUE_MIND_UNLOCK_THRESHOLD,
    isUnlocked,
    trackedTitlesCount,
    journalCount,
    topGenres,
    genreWeights,
    avoidGenres,
    topCreators,
    creatorWeights,
    topMoods,
    preferredDomains,
    underexploredDomains,
    preferredDecade,
    pacePreference,
    anchorTitles,
    summaryLine,
  };
}

function genreAffinityScore(genres: string[], taste: CueTasteProfile): number {
  let sum = 0;
  for (const g of cleanDisplayGenres(genres)) {
    sum += taste.genreWeights[g] || 0;
  }
  return sum;
}

/** Computes Continue recommendations and overall Mind snapshot. */
export function computeCueMind(state: CueStoreState, intent: MindIntent = 'auto'): CueMindSnapshot {
  const { greeting, windowHint } = getTimeContext();
  const taste = computeTasteProfile(state);
  const candidates: CueMindThought[] = [];

  let brokenCoverCount = 0;
  let staleComicCount = 0;

  let activeWatch = 0;
  let activeRead = 0;
  let activePlay = 0;

  // Scan Shows
  for (const id of state.showOrder) {
    const show = state.shows[id];
    const prog = state.showProgress[id];
    if (!show || !prog?.bookmarked) continue;
    if (!show.posterUrl) brokenCoverCount += 1;
    const st = getShowStats(show, prog);
    if (st.isFinished || st.isCaughtUp || !st.nextEpisode) continue;
    if (st.watchedUnique > 0) activeWatch += 1;

    const remainingEps = Math.max(0, (st.airedEpisodes || st.totalEpisodes) - st.watchedUnique);
    const nextCode = formatEpisodeCode(st.nextEpisode.season, st.nextEpisode.number);
    const affinity = genreAffinityScore(show.genres, taste) * 0.4 + (isRecentIso(prog.lastWatchedAt, 7) ? 3 : 0);

    if (st.airedProgressRatio >= 0.7 || (remainingEps > 0 && remainingEps <= 3)) {
      candidates.push({
        id: `finish-show-${show.id}`,
        intent: 'finish',
        tag: 'Almost done',
        headline: `Finish ${show.title}`,
        reason: `Only ${remainingEps} ${remainingEps === 1 ? 'episode' : 'episodes'} left (${Math.round(
          st.airedProgressRatio * 100
        )}% complete) · ${nextCode}.`,
        domain: 'watch',
        actionLabel: `Open ${show.title}`,
        score: 8 + affinity + (1 - remainingEps / 10),
        target: { kind: 'show', id: show.id, title: show.title, posterUrl: show.posterUrl },
      });
    } else if ((show.runtimeAvg || 42) <= 32 || st.nextEpisode) {
      candidates.push({
        id: `quick-show-${show.id}`,
        intent: 'quick',
        tag: windowHint === 'evening' ? 'Evening episode' : 'Quick watch',
        headline: `Queue ${show.title} ${nextCode}`,
        reason: `${show.runtimeAvg || 35}m runtime fits cleanly right now${
          st.nextEpisode?.title ? ` — "${st.nextEpisode.title}".` : '.'
        }`,
        domain: 'watch',
        actionLabel: 'Watch next',
        score: (st.watchedUnique > 0 ? 5 : 2) + affinity + (windowHint === 'evening' ? 1.5 : 0),
        target: { kind: 'show', id: show.id, title: show.title, posterUrl: show.posterUrl },
      });
    }
  }

  // Scan Movies
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const prog = state.movieProgress[id];
    if (!m || !prog) continue;
    if (!m.posterUrl) brokenCoverCount += 1;
    if ((prog.watchCount || 0) > 0) continue;
    if (!isMovieReleased(m)) continue;
    activeWatch += 1;
    const affinity = genreAffinityScore(m.genres, taste) * 0.4;
    candidates.push({
      id: `deep-movie-${m.id}`,
      intent: 'deep',
      tag: windowHint === 'evening' || windowHint === 'night' ? 'Feature night' : 'Watchlist pick',
      headline: `Watch ${m.title}`,
      reason: `${m.year} · ${m.runtime} min feature waiting in your Watchlist.`,
      domain: 'watch',
      actionLabel: 'View film',
      score: (windowHint === 'evening' || windowHint === 'night' ? 6 : 3) + affinity,
      target: { kind: 'movie', id: m.id, title: m.title, posterUrl: m.posterUrl },
    });
  }

  // Scan Read items
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const prog = state.readProgress[id];
    if (!r || !prog?.bookmarked) continue;
    const cover = resolveComicEditionCover(r, prog.edition, prog);
    if (!cover) brokenCoverCount += 1;
    if (
      r.format === 'comic' &&
      r.issueDetails &&
      Object.keys(r.issueDetails).length > 0 &&
      r.issueDetailsKey &&
      !r.issueDetailsKey.endsWith(`::${COMIC_ISSUE_CACHE_VERSION}`)
    ) {
      staleComicCount += 1;
    }
    const st = getReadStats(r, prog);
    if (st.isFinished || st.isCaughtUp || st.nextReleasedUnit === null) continue;
    if (st.current > 0) activeRead += 1;
    const rem = Math.max(0, st.releasedTotal - st.current);
    const affinity = genreAffinityScore(r.genres, taste) * 0.4 + (isRecentIso(prog.lastReadAt, 7) ? 3 : 0);

    if (st.releasedRatio >= 0.68 || (rem > 0 && rem <= 4)) {
      candidates.push({
        id: `finish-read-${r.id}`,
        intent: 'finish',
        tag: 'Nearly complete',
        headline: `Wrap up ${r.title}`,
        reason: `${rem} ${rem === 1 ? st.unitSingular : st.unitLabel} left (${Math.round(
          st.releasedRatio * 100
        )}%) · next up is ${st.nextUnitShort}.`,
        domain: 'read',
        actionLabel: 'Continue reading',
        score: 8 + affinity,
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    } else if (r.unit === 'issues' || r.format === 'manga') {
      candidates.push({
        id: `quick-read-${r.id}`,
        intent: 'quick',
        tag: windowHint === 'morning' ? 'Coffee read' : '10 min read',
        headline: `Read ${r.title} (${st.nextUnitShort})`,
        reason: `Bite-sized ${r.format} progress (${st.current}/${st.releasedTotal} ${st.unitLabel}).`,
        domain: 'read',
        actionLabel: 'Log next',
        score: (st.current > 0 ? 5.5 : 2.5) + affinity + (windowHint === 'morning' ? 1.5 : 0),
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    } else {
      candidates.push({
        id: `deep-read-${r.id}`,
        intent: 'deep',
        tag: 'Book session',
        headline: `Dive into ${r.title}`,
        reason: `${r.creator} · ${st.current}/${st.total} chapters logged.`,
        domain: 'read',
        actionLabel: 'Open book',
        score: (st.current > 0 ? 4.5 : 2) + affinity,
        target: { kind: 'read', id: r.id, title: r.title, posterUrl: cover },
      });
    }
  }

  // Scan Play items
  for (const id of state.gameOrder) {
    const g = state.games[id];
    const prog = state.gameProgress[id];
    if (!g || !prog?.bookmarked) continue;
    if (!g.coverUrl) brokenCoverCount += 1;
    if (prog.status === 'completed' || prog.status === 'dropped') continue;
    if (prog.status === 'playing' || (prog.hoursPlayed || 0) > 0) activePlay += 1;

    const pct = prog.completionPct || 0;
    const affinity = genreAffinityScore(g.genres, taste) * 0.4 + (isRecentIso(prog.lastPlayedAt, 7) ? 3 : 0);
    if (pct >= 65) {
      candidates.push({
        id: `finish-game-${g.id}`,
        intent: 'finish',
        tag: 'Final stretch',
        headline: `Beat ${g.title}`,
        reason: `You're already at ${pct}% (${prog.hoursPlayed || 0}h on ${prog.platform}).`,
        domain: 'play',
        actionLabel: 'Resume run',
        score: 8.5 + affinity,
        target: { kind: 'game', id: g.id, title: g.title, posterUrl: g.coverUrl },
      });
    } else {
      const topMatchGenre = cleanDisplayGenres(g.genres).find((gn) => (taste.genreWeights[gn] || 0) >= 3);
      candidates.push({
        id: `deep-game-${g.id}`,
        intent: 'deep',
        tag: prog.status === 'playing' ? 'Active campaign' : topMatchGenre ? `Matches ${topMatchGenre}` : 'Backlog pick',
        headline: `${prog.status === 'playing' ? 'Continue' : 'Start'} ${g.title}`,
        reason: `${prog.platform} · ${prog.hoursPlayed || 0}h played${
          g.totalChapters ? ` · ${prog.currentChapter || 0}/${g.totalChapters} ${g.chapterUnit || 'chapters'}` : ''
        }.`,
        domain: 'play',
        actionLabel: 'Open game',
        score: (prog.status === 'playing' ? 6 : 2.5) + affinity,
        target: { kind: 'game', id: g.id, title: g.title, posterUrl: g.coverUrl },
      });
    }
  }

  // Active custom runs check
  for (const list of state.lists || []) {
    const ev = evaluateCustomListProgress(list, state);
    if (ev.totalItems > 0 && ev.completedItems < ev.totalItems && ev.nextItem) {
      candidates.push({
        id: `finish-list-${list.id}`,
        intent: ev.averageRatio >= 0.6 ? 'finish' : 'deep',
        tag: 'Run progress',
        headline: `Advance "${list.name}"`,
        reason: `${ev.completedItems}/${ev.totalItems} complete · Next: ${ev.nextItem.title}.`,
        domain: 'all',
        actionLabel: 'Open list',
        score: 5 + ev.averageRatio * 3,
        target: { kind: 'list', id: list.id, title: list.name },
      });
    }
  }

  // Self-heal suggestion placed after core picks
  if (brokenCoverCount > 0 || staleComicCount > 0) {
    candidates.push({
      id: 'mind-self-heal',
      intent: 'quick',
      tag: 'Maintenance',
      headline: `Repair ${brokenCoverCount + staleComicCount} cached library ${
        brokenCoverCount + staleComicCount === 1 ? 'item' : 'items'
      }`,
      reason:
        brokenCoverCount > 0 && staleComicCount > 0
          ? `${brokenCoverCount} missing cover URLs and ${staleComicCount} outdated comic caches can be auto-healed.`
          : brokenCoverCount > 0
            ? `${brokenCoverCount} titles have missing artwork ready for live lookup repair.`
            : `${staleComicCount} comic caches can refresh for clean Cover A thumbnails.`,
      domain: 'all',
      actionLabel: 'Scan & Self-Heal',
      score: 1.5,
      requiresHeal: true,
    });
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

  const activeBuckets = [
    { d: 'Watch', n: activeWatch },
    { d: 'Read', n: activeRead },
    { d: 'Play', n: activePlay },
  ];
  const emptyDomains = activeBuckets.filter((b) => b.n === 0).map((b) => b.d);
  const balanceNote =
    emptyDomains.length === 0
      ? `Balanced momentum across Watch (${activeWatch}), Read (${activeRead}), and Play (${activePlay}).`
      : emptyDomains.length < 3
        ? `${emptyDomains.join(' & ')} ${emptyDomains.length === 1 ? 'is' : 'are'} quiet right now — flip to Discover or mix one in.`
        : taste.summaryLine;

  let filtered =
    intent === 'auto' ? candidates : candidates.filter((c) => c.intent === intent);
  if (filtered.length === 0) {
    filtered = candidates;
  }

  const seenTargets = new Set<string>();
  const finalThoughts: CueMindThought[] = [];
  for (const t of filtered) {
    const key = t.target ? `${t.target.kind}:${t.target.id}` : t.id;
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);
    finalThoughts.push(t);
    if (finalThoughts.length >= 6) break;
  }

  if (finalThoughts.length === 0) {
    finalThoughts.push({
      id: 'mind-discover-fallback',
      intent: 'quick',
      tag: 'Cue Mind',
      headline: 'Active queue is clear — flip to Discover',
      reason: 'Check out personalized Watch, Read & Play recommendations tailored to your taste.',
      domain: 'all',
      actionLabel: 'Browse Discover',
    });
  }

  return {
    greeting,
    balanceNote,
    brokenCoverCount,
    staleComicCount,
    taste,
    thoughts: finalThoughts,
  };
}

/** Computes personalized Discover flipside recommendations combining curated & live pools. */
export function computeCueMindDiscover(
  state: CueStoreState,
  taste: CueTasteProfile,
  livePool: LiveSearchResult[] = [],
  scope: DiscoverMindScope = 'all'
): CueMindDiscoverPick[] {
  const curatedPool = getAllCuratedDiscoverCandidates();
  const combined = [...livePool, ...curatedPool];

  const ownedIds = new Set<string>();
  const ownedDomainTitles = new Set<string>();

  for (const id of state.showOrder) {
    const s = state.shows[id];
    if (!s || !state.showProgress[id]?.bookmarked) continue;
    ownedIds.add(id);
    ownedDomainTitles.add(`watch:${normTitle(s.title)}`);
  }
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    if (!m || !state.movieProgress[id]) continue;
    ownedIds.add(id);
    ownedDomainTitles.add(`watch:${normTitle(m.title)}`);
  }
  for (const id of state.readOrder) {
    const r = state.readItems[id];
    if (!r || !state.readProgress[id]?.bookmarked) continue;
    ownedIds.add(id);
    ownedDomainTitles.add(`read:${normTitle(r.title)}`);
  }
  for (const id of state.gameOrder) {
    const g = state.games[id];
    if (!g || !state.gameProgress[id]?.bookmarked) continue;
    ownedIds.add(id);
    ownedDomainTitles.add(`play:${normTitle(g.title)}`);
  }

  const dismissedSet = new Set(state.mindFeedback?.dismissedIds || []);
  const moodBoostGenres = new Set<string>();
  for (const mood of taste.topMoods) {
    for (const g of MOOD_GENRE_HINTS[mood] || []) moodBoostGenres.add(g);
  }

  const anchorCollectionCache = new Map<string, ReturnType<typeof getCollectionsForTitle>>();
  for (const a of taste.anchorTitles) {
    anchorCollectionCache.set(a.id, getCollectionsForTitle(a.title, a.id));
  }

  const currentYear = new Date().getFullYear();
  const seenKeys = new Set<string>();
  const scored: Array<{ pick: CueMindDiscoverPick; rawScore: number }> = [];

  for (const item of combined) {
    if (scope !== 'all' && item.domain !== scope) continue;
    if (!item.posterUrl || !item.title) continue;
    if (ownedIds.has(item.id) || dismissedSet.has(item.id)) continue;
    if (item.year && item.year > currentYear) continue;

    const dedupeKey = `${item.domain}:${normTitle(item.title)}`;
    if (ownedDomainTitles.has(dedupeKey) || seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const cleanedGenres = cleanDisplayGenres(item.genres || []);
    let score = 0;

    // 1. Genre taste weights
    let matchedGenres: string[] = [];
    for (const g of cleanedGenres) {
      const gw = taste.genreWeights[g] || 0;
      score += gw;
      if (gw > 1) matchedGenres.push(g);
    }
    matchedGenres = matchedGenres.slice(0, 2);

    // 2. Creator / Studio / Publisher match
    const candCreator = (item.director || '').trim();
    const creatorWeight = candCreator ? taste.creatorWeights[candCreator] || 0 : 0;
    if (creatorWeight > 1.5) score += 5.0;

    // 3. Cross-media collection link to loved anchor titles
    let collectionLink: { anchor: TasteAnchorTitle; colTitle: string } | null = null;
    const itemCols = getCollectionsForTitle(item.title, item.id);
    if (itemCols.length > 0) {
      for (const anchor of taste.anchorTitles) {
        const anchorCols = anchorCollectionCache.get(anchor.id) || [];
        const shared = itemCols.find((ic) => anchorCols.some((ac) => ac.id === ic.id));
        if (shared) {
          score += 3.5;
          collectionLink = { anchor, colTitle: shared.title };
          break;
        }
      }
    }

    // 4. Decade affinity
    const candDecade = item.year ? Math.floor(item.year / 10) * 10 : 0;
    if (taste.preferredDecade && candDecade === taste.preferredDecade) {
      score += 1.2;
    }

    // 5. Mood thematic resonance
    if (cleanedGenres.some((g) => moodBoostGenres.has(g))) {
      score += 1.5;
    }

    // 6. Cross-media balance nudge when viewing All
    if (scope === 'all' && taste.underexploredDomains.includes(item.domain)) {
      score += 1.4;
    }

    // 7. Rating baseline (normalized to 5★ scale so shows/movies & read/play balance cleanly)
    const fiveStarRating = item.rating > 5 ? item.rating / 2 : item.rating;
    score += Math.max(0, (fiveStarRating - 3.8) * 1.4);

    // Build transparent personalized explanation & tag
    const bestGenreAnchor = taste.anchorTitles.find((a) =>
      a.genres.some((ag) => cleanedGenres.includes(ag))
    );

    let tag = 'For your taste';
    let reason = '';

    if (collectionLink && collectionLink.anchor.domain !== item.domain) {
      tag = 'Cross-media match';
      reason = `Because you ${
        collectionLink.anchor.rating && collectionLink.anchor.rating >= 4
          ? `rated ${collectionLink.anchor.title} ${collectionLink.anchor.rating}★`
          : `tracked ${collectionLink.anchor.title}`
      } · ${collectionLink.colTitle}.`;
    } else if (creatorWeight > 1.5) {
      tag = 'Same creator';
      reason = `From ${candCreator}${
        matchedGenres.length > 0 ? ` · shares ${matchedGenres.join(' & ')}` : ''
      }.`;
    } else if (bestGenreAnchor && matchedGenres.length > 0) {
      tag =
        bestGenreAnchor.domain !== item.domain
          ? 'Cross-media taste'
          : matchedGenres[0];
      reason = `Because you ${
        bestGenreAnchor.rating && bestGenreAnchor.rating >= 4
          ? `rated ${bestGenreAnchor.title} ${bestGenreAnchor.rating}★`
          : `engaged with ${bestGenreAnchor.title}`
      } · ${matchedGenres.join(' & ')}.`;
    } else if (matchedGenres.length > 0) {
      tag = `${matchedGenres[0]} pick`;
      reason = `Matches your top genres (${matchedGenres.join(', ')})${
        candCreator ? ` · ${candCreator}` : ''
      }.`;
    } else if (taste.underexploredDomains.includes(item.domain)) {
      tag =
        item.domain === 'watch'
          ? 'Try Watch'
          : item.domain === 'read'
            ? 'Try Read'
            : 'Try Play';
      reason = `Broadens your rotation with a ${fiveStarRating.toFixed(1)}★ standout${
        cleanedGenres.length > 0 ? ` in ${cleanedGenres.slice(0, 2).join(' · ')}` : ''
      }.`;
    } else {
      tag = 'Top rated';
      reason =
        cleanedGenres.length > 0
          ? `${cleanedGenres.slice(0, 2).join(' · ')} · ${fiveStarRating.toFixed(1)}★ rated favorite.`
          : `${fiveStarRating.toFixed(1)}★ standout worth adding to your cue.`;
    }

    const matchPct = Math.min(99, Math.max(76, Math.round(76 + score * 1.45)));

    scored.push({
      rawScore: score,
      pick: {
        id: `disc-${item.kind}-${item.id}`,
        domain: item.domain,
        tag,
        reason,
        matchPct,
        item,
      },
    });
  }

  scored.sort((a, b) => b.rawScore - a.rawScore);

  if (scope !== 'all') {
    return scored.slice(0, 8).map((s) => s.pick);
  }

  // Round-robin across Watch / Read / Play so Discover All highlights all sides of Cue
  const buckets: Record<MediaDomain, CueMindDiscoverPick[]> = {
    watch: [],
    read: [],
    play: [],
  };
  for (const s of scored) {
    buckets[s.pick.domain].push(s.pick);
  }

  const mixed: CueMindDiscoverPick[] = [];
  const order = taste.preferredDomains.length === 3 ? taste.preferredDomains : (['watch', 'read', 'play'] as MediaDomain[]);
  let idx = 0;
  while (mixed.length < 8) {
    let added = false;
    for (const dom of order) {
      const next = buckets[dom][idx];
      if (next) {
        mixed.push(next);
        added = true;
        if (mixed.length >= 8) break;
      }
    }
    if (!added) break;
    idx += 1;
  }

  return mixed;
}
