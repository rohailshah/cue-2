import { MOOD_OPTIONS } from '../components/PersonalNotesSection';
import type { CueStoreState, MediaDomain, PersonalMood } from '../types';
import { countDeduplicatedReadUnits, getComicIssueAtomicId } from './atoms';
import { KNOWN_BOOK_SERIES, KNOWN_MOVIE_COLLECTIONS } from './containers';
import { resolveComicEditionCover } from './editions';
import {
  cleanDisplayGenres,
  formatEpisodeCode,
  getAllEpisodes,
  getEpisodeKey,
  getReadStats,
  getShowStats,
} from './stats';

export type JournalStatsScope = 'all' | MediaDomain;

export interface WeeklyBarPoint {
  weekStartIso: string;
  weekLabel: string;
  monthLabel: string;
  logs: number;
  hours: number;
  watchLogs: number;
  readLogs: number;
  playLogs: number;
}

export interface HeatmapDayCell {
  dateIso: string;
  label: string;
  weekIndex: number;
  dayOfWeek: number; // 0 = Mon .. 6 = Sun
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface TimeBlockCell {
  dayIndex: number; // 0 = Mon .. 6 = Sun
  dayLabel: string;
  blockIndex: number; // 0..5 (4h buckets)
  blockLabel: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface InvestedTitleItem {
  domain: MediaDomain;
  kind: 'show' | 'movie' | 'read' | 'game';
  id: string;
  title: string;
  posterUrl: string;
  hours: number;
  metricLabel: string;
  subLabel: string;
}

export interface NamedCountItem {
  name: string;
  count: number;
  pct: number;
}

export interface DecadeBarItem {
  label: string;
  shortLabel: string;
  count: number;
}

export interface JournalAdvancedStats {
  scope: JournalStatsScope;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
  heroPrimaryLabel: string;
  heroSubline: string;
  heroComparison: string;
  domainSplit: {
    watchMinutes: number;
    readMinutes: number;
    playMinutes: number;
    watchPct: number;
    readPct: number;
    playPct: number;
  };
  personality: {
    archetype: string;
    subtitle: string;
    traits: string[];
  };
  activity: {
    last7Logs: number;
    last7Hours: number;
    last7DeltaPct: number | null;
    last30Logs: number;
    last30Hours: number;
    last30DeltaPct: number | null;
    weeklySeries: WeeklyBarPoint[];
  };
  calendarHeatmap: {
    days: HeatmapDayCell[];
    activeDaysCount: number;
    totalEventsCount: number;
    monthHeaders: Array<{ weekIndex: number; label: string }>;
  };
  timeHeatmap: {
    cells: TimeBlockCell[];
    primeWindowLabel: string;
  };
  habits: {
    completionRatePct: number;
    finishedCount: number;
    inProgressCount: number;
    queuedCount: number;
    droppedCount: number;
    totalTrackedCount: number;
  };
  hallOfFame: {
    biggestDayCount: number;
    biggestDayLabel: string;
    biggestDayTitle?: string;
    biggestDayPoster?: string;
    bestMonthLabel: string;
    bestMonthHoursLabel: string;
    longestStreakDays: number;
    trackingSinceLabel: string;
    trackingSinceTitle?: string;
  };
  backlog: {
    remainingMinutes: number;
    remainingItemsCount: number;
    remainingBreakdownLabel: string;
    inProgressCount: number;
    queuedCount: number;
    finishedCount: number;
    droppedCount: number;
  };
  topInvested: InvestedTitleItem[];
  ratings: {
    averageLabel: string;
    totalRated: number;
    watchAvg: number | null;
    watchCount: number;
    readAvg: number | null;
    readCount: number;
    playAvg: number | null;
    playCount: number;
    histogram: Array<{ stars: number; count: number }>;
  };
  topGenres: NamedCountItem[];
  moods: Array<{ key: PersonalMood; emoji: string; label: string; count: number }>;
  topSources: NamedCountItem[];
  topCreators: Array<{ name: string; count: number; domain: MediaDomain }>;
  decades: DecadeBarItem[];
  peakDecadeLabel: string;
}

interface ActivityEvent {
  ts: number;
  domain: MediaDomain;
  minutes: number;
  title: string;
  posterUrl?: string;
}

const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const BLOCK_LABELS = ['12a', '4a', '8a', '12p', '4p', '8p'];
const BLOCK_FULL_TIMES = ['2:00 AM', '6:00 AM', '9:00 AM', '1:00 PM', '5:00 PM', '9:00 PM'];

const SKIP_CREATOR_PATTERNS = /^(unknown|author|studio|writer|artist|mangaka|various|comics)$/i;

function toLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCalendarAwareTimestamp(iso?: string): { ts: number; dateIso: string } | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  const noonOrDateOnly = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:$|[Tt ]12:00:00(?:\.000)?[Zz]?$)/
  );
  if (noonOrDateOnly) {
    const y = Number(noonOrDateOnly[1]);
    const m = Number(noonOrDateOnly[2]) - 1;
    const day = Number(noonOrDateOnly[3]);
    const localNoon = new Date(y, m, day, 12, 0, 0, 0);
    if (!Number.isNaN(localNoon.getTime())) {
      return {
        ts: localNoon.getTime(),
        dateIso: `${noonOrDateOnly[1]}-${noonOrDateOnly[2]}-${noonOrDateOnly[3]}`,
      };
    }
  }
  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return null;
  return { ts, dateIso: toLocalDateIso(new Date(ts)) };
}

function remapTimestampToLocalDate(ts: number, targetDateIso: string): number {
  const m = targetDateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ts;
  const orig = new Date(ts);
  const shifted = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    orig.getHours(),
    orig.getMinutes(),
    orig.getSeconds(),
    orig.getMilliseconds()
  );
  return Number.isNaN(shifted.getTime()) ? ts : shifted.getTime();
}

function getMondayStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = d.getDay(); // 0 = Sun .. 6 = Sat
  const monOffset = (jsDay + 6) % 7;
  d.setDate(d.getDate() - monOffset);
  return d;
}

function quantizeLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

function formatDurationHero(totalMinutes: number): { primary: string; hours: number; days: number } {
  const hours = Math.round(totalMinutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 2) {
    return { primary: `${days.toLocaleString()} days`, hours, days };
  }
  return {
    primary: `${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`,
    hours,
    days,
  };
}

function buildFunComparison(totalMinutes: number, scope: JournalStatsScope): string {
  const hours = totalMinutes / 60;
  if (hours < 2) {
    return 'Log episodes, chapters, or sessions to unlock fun time comparisons.';
  }
  if (scope === 'read') {
    const books = Math.max(1, Math.round(hours / 8));
    return `Enough reading time to finish ${books} ${books === 1 ? 'average novel' : 'average novels'} cover to cover.`;
  }
  if (scope === 'play') {
    const eldenRuns = hours / 70;
    if (eldenRuns >= 1.5) {
      return `Enough time to beat Elden Ring ${eldenRuns.toFixed(1)} times start to finish.`;
    }
    const hadesRuns = Math.max(1, Math.round(hours / 25));
    return `About ${hadesRuns} full story campaigns of an action roguelike.`;
  }
  if (hours >= 420) {
    const onePieceRuns = Math.max(1, Math.floor(hours / 380));
    return `Enough to binge One Piece start to finish ${onePieceRuns} ${onePieceRuns === 1 ? 'time' : 'times'}.`;
  }
  if (hours >= 120) {
    const bbRuns = Math.max(1, Math.floor(hours / 62));
    return `Enough time to rewatch Breaking Bad start to finish ${bbRuns} ${bbRuns === 1 ? 'time' : 'times'}.`;
  }
  if (hours >= 35) {
    const lotrRuns = Math.max(1, Math.floor(hours / 11.4));
    return `Equal to ${lotrRuns} Lord of the Rings Extended Trilogy marathons.`;
  }
  const films = Math.max(1, Math.round(hours / 2));
  return `About ${films} feature-length movie nights logged so far.`;
}

function normalizeFiveStar(raw: number, isTenPoint: boolean): number {
  if (isTenPoint && raw > 5) {
    return Math.min(5, Math.max(0.5, raw / 2));
  }
  return Math.min(5, Math.max(0.5, raw));
}

export function computeJournalAdvancedStats(
  state: CueStoreState,
  scope: JournalStatsScope = 'all'
): JournalAdvancedStats {
  const includesWatch = scope === 'all' || scope === 'watch';
  const includesRead = scope === 'all' || scope === 'read';
  const includesPlay = scope === 'all' || scope === 'play';

  let watchMinutes = 0;
  let readMinutes = 0;
  let playMinutes = 0;

  let episodesWatchedCount = 0;
  let moviesWatchedCount = 0;
  let chaptersReadCount = 0;
  let issuesReadCount = 0;
  let playHoursTotal = 0;

  let finishedCount = 0;
  let inProgressCount = 0;
  let queuedCount = 0;
  let droppedCount = 0;

  let remainingMinutes = 0;
  let remainingItemsCount = 0;
  let remainingEpisodes = 0;
  let remainingUnits = 0;
  let remainingGames = 0;

  const invested: InvestedTitleItem[] = [];
  const genreCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const creatorCounts = new Map<string, { count: number; domain: MediaDomain }>();
  const moodCounts = new Map<PersonalMood, number>();
  const decadeCounts = new Map<number, number>();

  const bumpGenre = (genres: string[]) => {
    for (const g of cleanDisplayGenres(genres)) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
  };
  const bumpSource = (src?: string) => {
    const clean = (src || '').trim();
    if (!clean || SKIP_CREATOR_PATTERNS.test(clean)) return;
    sourceCounts.set(clean, (sourceCounts.get(clean) || 0) + 1);
  };
  const bumpCreator = (name: string | undefined, domain: MediaDomain) => {
    const clean = (name || '').trim();
    if (!clean || SKIP_CREATOR_PATTERNS.test(clean)) return;
    const prev = creatorCounts.get(clean);
    creatorCounts.set(clean, { count: (prev?.count || 0) + 1, domain });
  };
  const bumpMood = (mood?: PersonalMood) => {
    if (!mood) return;
    moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
  };
  const bumpDecade = (year?: number) => {
    if (!year || year < 1950 || year > 2035) return;
    const dec = Math.floor(year / 10) * 10;
    decadeCounts.set(dec, (decadeCounts.get(dec) || 0) + 1);
  };

  let watchRatingSum = 0;
  let watchRatingCount = 0;
  let readRatingSum = 0;
  let readRatingCount = 0;
  let playRatingSum = 0;
  let playRatingCount = 0;
  const ratingBuckets = [0, 0, 0, 0, 0]; // 1..5 stars

  const recordRating = (domain: MediaDomain, raw: number | undefined, isTenPoint = false) => {
    if (typeof raw !== 'number' || raw <= 0) return;
    const five = normalizeFiveStar(raw, isTenPoint);
    if (domain === 'watch') {
      watchRatingSum += five;
      watchRatingCount += 1;
    } else if (domain === 'read') {
      readRatingSum += five;
      readRatingCount += 1;
    } else {
      playRatingSum += five;
      playRatingCount += 1;
    }
    const bucket = Math.min(5, Math.max(1, Math.round(five))) - 1;
    ratingBuckets[bucket] += 1;
  };

  // Custom / explicit finished dates take precedence over later log timestamps
  const finishedByMediaKey = new Map<
    string,
    {
      ts: number;
      dateIso: string;
      domain: MediaDomain;
      minutes: number;
      title: string;
      posterUrl?: string;
    }
  >();

  if (includesWatch) {
    for (const id of state.showOrder) {
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog || !prog.finishedAt) continue;
      if (!getShowStats(show, prog).isFinished) continue;
      const parsedFinish = parseCalendarAwareTimestamp(prog.finishedAt);
      if (parsedFinish) {
        finishedByMediaKey.set(`watch:${show.id}`, {
          ...parsedFinish,
          domain: 'watch',
          minutes: Math.max(30, show.runtimeAvg || 42),
          title: show.title,
          posterUrl: show.posterUrl,
        });
      }
    }
    for (const id of state.movieOrder) {
      const movie = state.movies[id];
      const prog = state.movieProgress[id];
      if (!movie || !prog || (prog.watchCount || 0) <= 0 || !prog.watchedAt) continue;
      const parsedFinish = parseCalendarAwareTimestamp(prog.watchedAt);
      if (parsedFinish) {
        finishedByMediaKey.set(`watch:${movie.id}`, {
          ...parsedFinish,
          domain: 'watch',
          minutes: movie.runtime || 120,
          title: movie.title,
          posterUrl: movie.posterUrl,
        });
      }
    }
  }
  if (includesRead) {
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog || !prog.finishedAt) continue;
      if (!getReadStats(item, prog).isFinished) continue;
      const parsedFinish = parseCalendarAwareTimestamp(prog.finishedAt);
      if (parsedFinish) {
        finishedByMediaKey.set(`read:${item.id}`, {
          ...parsedFinish,
          domain: 'read',
          minutes: item.unit === 'issues' ? 10 : 12,
          title: item.title,
          posterUrl: resolveComicEditionCover(item, prog.edition, prog),
        });
      }
    }
  }
  if (includesPlay) {
    for (const id of state.gameOrder) {
      const game = state.games[id];
      const prog = state.gameProgress[id];
      if (!game || !prog || prog.status !== 'completed' || !prog.finishedAt) continue;
      const parsedFinish = parseCalendarAwareTimestamp(prog.finishedAt);
      if (parsedFinish) {
        finishedByMediaKey.set(`play:${game.id}`, {
          ...parsedFinish,
          domain: 'play',
          minutes: Math.max(60, Math.min(240, Math.round((prog.hoursPlayed || 2) * 60))),
          title: game.title,
          posterUrl: game.coverUrl,
        });
      }
    }
  }

  // Fallback synthetic timestamps from progress records if history lacks older entries
  const recordedMediaKeys = new Set<string>();
  const hasEventOnFinishDate = new Set<string>();
  const seenHistoryUnitDates = new Set<string>();
  const events: ActivityEvent[] = [];

  for (const h of state.history || []) {
    if (scope !== 'all' && h.domain !== scope) continue;
    const parsed = parseCalendarAwareTimestamp(h.loggedAt);
    if (!parsed) continue;
    const mediaKey = `${h.domain}:${h.mediaId}`;
    recordedMediaKeys.add(mediaKey);
    const customFinish = finishedByMediaKey.get(mediaKey);
    let effectiveTs = parsed.ts;
    let effectiveDateIso = parsed.dateIso;
    if (customFinish && parsed.dateIso > customFinish.dateIso) {
      effectiveTs = remapTimestampToLocalDate(parsed.ts, customFinish.dateIso);
      effectiveDateIso = customFinish.dateIso;
    }
    if (customFinish && effectiveDateIso === customFinish.dateIso) {
      hasEventOnFinishDate.add(mediaKey);
    }
    if (h.codeLabel) {
      seenHistoryUnitDates.add(`${mediaKey}:${h.codeLabel}:${effectiveDateIso}`);
    }
    const mins = h.domain === 'watch' ? 42 : h.domain === 'read' ? 12 : 60;
    events.push({
      ts: effectiveTs,
      domain: h.domain,
      minutes: mins,
      title: h.title,
      posterUrl: h.posterUrl,
    });
  }

  for (const [mediaKey, customFinish] of finishedByMediaKey.entries()) {
    recordedMediaKeys.add(mediaKey);
    if (!hasEventOnFinishDate.has(mediaKey)) {
      events.push({
        ts: customFinish.ts,
        domain: customFinish.domain,
        minutes: customFinish.minutes,
        title: customFinish.title,
        posterUrl: customFinish.posterUrl,
      });
    }
  }

  // Include explicit per-atom (episode, issue/chapter, game chapter), season, and collection finished dates
  // when history doesn't already cover that exact atom + date (supports backdating & cross-container sync).
  if (includesWatch) {
    for (const id of state.showOrder) {
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog) continue;
      const mediaKey = `watch:${show.id}`;
      for (const [epKey, dateStr] of Object.entries(prog.episodeFinishedAt || {})) {
        const parsed = parseCalendarAwareTimestamp(dateStr);
        if (!parsed) continue;
        const m = epKey.match(/^S(\d+)E(\d+)$/i);
        const codeLabel = m ? formatEpisodeCode(Number(m[1]), Number(m[2])) : epKey;
        const dedupeKey = `${mediaKey}:${codeLabel}:${parsed.dateIso}`;
        if (seenHistoryUnitDates.has(dedupeKey)) continue;
        seenHistoryUnitDates.add(dedupeKey);
        recordedMediaKeys.add(mediaKey);
        events.push({
          ts: parsed.ts,
          domain: 'watch',
          minutes: Math.max(20, show.runtimeAvg || 42),
          title: show.title,
          posterUrl: show.posterUrl,
        });
      }
      for (const [seasonStr, dateStr] of Object.entries(prog.seasonFinishedAt || {})) {
        const parsed = parseCalendarAwareTimestamp(dateStr);
        if (!parsed) continue;
        const codeLabel = `Season ${seasonStr} Complete`;
        const dedupeKey = `${mediaKey}:${codeLabel}:${parsed.dateIso}`;
        if (seenHistoryUnitDates.has(dedupeKey)) continue;
        // Skip synthetic season event if an episode finish or media finish already covers that date for this show
        const coveredByEp = [...seenHistoryUnitDates].some(
          (k) => k.startsWith(`${mediaKey}:`) && k.endsWith(`:${parsed.dateIso}`)
        );
        if (coveredByEp || finishedByMediaKey.get(mediaKey)?.dateIso === parsed.dateIso) continue;
        seenHistoryUnitDates.add(dedupeKey);
        recordedMediaKeys.add(mediaKey);
        events.push({
          ts: parsed.ts,
          domain: 'watch',
          minutes: Math.max(30, show.runtimeAvg || 42),
          title: `${show.title} · Season ${seasonStr}`,
          posterUrl: show.posterUrl,
        });
      }
    }
  }
  if (includesRead) {
    const seenComicAtomDates = new Set<string>();
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog) continue;
      const mediaKey = `read:${item.id}`;
      const poster = resolveComicEditionCover(item, prog.edition, prog);
      for (const [unitStr, dateStr] of Object.entries(prog.unitFinishedAt || {})) {
        const parsed = parseCalendarAwareTimestamp(dateStr);
        if (!parsed) continue;
        const unitNum = Number(unitStr);
        const atomId =
          item.format === 'comic'
            ? getComicIssueAtomicId(item.issueDetails?.[unitNum])
            : undefined;
        if (atomId) {
          const atomDateKey = `${atomId}:${parsed.dateIso}`;
          if (seenComicAtomDates.has(atomDateKey)) continue;
          seenComicAtomDates.add(atomDateKey);
        }
        const codeLabel = item.unit === 'issues' ? `Issue #${unitStr}` : `Ch. ${unitStr}`;
        const dedupeKey = `${mediaKey}:${codeLabel}:${parsed.dateIso}`;
        if (seenHistoryUnitDates.has(dedupeKey)) continue;
        seenHistoryUnitDates.add(dedupeKey);
        recordedMediaKeys.add(mediaKey);
        events.push({
          ts: parsed.ts,
          domain: 'read',
          minutes: item.unit === 'issues' ? 10 : 12,
          title: item.title,
          posterUrl: poster,
        });
      }
    }
  }
  if (includesPlay) {
    for (const id of state.gameOrder) {
      const game = state.games[id];
      const prog = state.gameProgress[id];
      if (!game || !prog) continue;
      const mediaKey = `play:${game.id}`;
      const unit = game.chapterUnit || 'chapters';
      for (const [chapStr, dateStr] of Object.entries(prog.chapterFinishedAt || {})) {
        const parsed = parseCalendarAwareTimestamp(dateStr);
        if (!parsed) continue;
        const codeLabel =
          unit === 'acts'
            ? `Act ${chapStr}`
            : unit === 'missions'
              ? `Mission ${chapStr}`
              : unit === 'milestones'
                ? `Milestone ${chapStr}`
                : `Ch. ${chapStr}`;
        const dedupeKey = `${mediaKey}:${codeLabel}:${parsed.dateIso}`;
        if (seenHistoryUnitDates.has(dedupeKey)) continue;
        seenHistoryUnitDates.add(dedupeKey);
        recordedMediaKeys.add(mediaKey);
        events.push({
          ts: parsed.ts,
          domain: 'play',
          minutes: 45,
          title: game.title,
          posterUrl: game.coverUrl,
        });
      }
    }
  }
  for (const [colKey, dateStr] of Object.entries(state.collectionFinishedAt || {})) {
    const parsed = parseCalendarAwareTimestamp(dateStr);
    if (!parsed) continue;
    let colDomain: MediaDomain = 'watch';
    let colTitle = 'Collection';
    if (colKey.startsWith('movie-col:')) {
      colDomain = 'watch';
      const id = colKey.slice('movie-col:'.length);
      colTitle = KNOWN_MOVIE_COLLECTIONS.find((c) => c.id === id)?.name || 'Movie Collection';
    } else if (colKey.startsWith('book-series:')) {
      colDomain = 'read';
      const id = colKey.slice('book-series:'.length);
      colTitle = KNOWN_BOOK_SERIES.find((b) => b.id === id)?.name || 'Book Series';
    } else if (colKey.startsWith('list:')) {
      const id = colKey.slice('list:'.length);
      const list = (state.lists || []).find((l) => l.id === id);
      colTitle = list?.name || 'Custom List';
      const firstKind = list?.items[0]?.kind;
      colDomain = list?.steps?.length
        ? 'read'
        : firstKind === 'read'
          ? 'read'
          : firstKind === 'game'
            ? 'play'
            : 'watch';
    }
    if (scope !== 'all' && scope !== colDomain) continue;
    events.push({
      ts: parsed.ts,
      domain: colDomain,
      minutes: colDomain === 'read' ? 15 : 45,
      title: colTitle,
    });
  }

  // Include extra dated rewatch / reread / replay completion runs so each run
  // highlights its own square on Your Days and 16-Week Pulse.
  const seenRunDates = new Set<string>();
  for (const [mediaKey, customFinish] of finishedByMediaKey.entries()) {
    seenRunDates.add(`${mediaKey}:${customFinish.dateIso}`);
  }
  const appendExtraRuns = (
    runs: Array<{ finishedAt: string }> | undefined,
    mediaKey: string,
    domain: MediaDomain,
    minutes: number,
    title: string,
    posterUrl?: string
  ) => {
    if (!runs || runs.length === 0) return;
    for (const r of runs) {
      const parsedRun = parseCalendarAwareTimestamp(r.finishedAt);
      if (!parsedRun) continue;
      const runDateKey = `${mediaKey}:${parsedRun.dateIso}`;
      if (seenRunDates.has(runDateKey)) continue;
      seenRunDates.add(runDateKey);
      recordedMediaKeys.add(mediaKey);
      events.push({
        ts: parsedRun.ts,
        domain,
        minutes,
        title,
        posterUrl,
      });
    }
  };

  if (includesWatch) {
    for (const id of state.showOrder) {
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog?.completedRuns?.length) continue;
      appendExtraRuns(
        prog.completedRuns,
        `watch:${show.id}`,
        'watch',
        Math.max(30, show.runtimeAvg || 42),
        show.title,
        show.posterUrl
      );
    }
    for (const id of state.movieOrder) {
      const movie = state.movies[id];
      const prog = state.movieProgress[id];
      if (!movie || !prog?.completedRuns?.length) continue;
      appendExtraRuns(
        prog.completedRuns,
        `watch:${movie.id}`,
        'watch',
        movie.runtime || 120,
        movie.title,
        movie.posterUrl
      );
    }
  }
  if (includesRead) {
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog?.completedRuns?.length) continue;
      appendExtraRuns(
        prog.completedRuns,
        `read:${item.id}`,
        'read',
        item.unit === 'issues' ? 10 : 12,
        item.title,
        resolveComicEditionCover(item, prog.edition, prog)
      );
    }
  }
  if (includesPlay) {
    for (const id of state.gameOrder) {
      const game = state.games[id];
      const prog = state.gameProgress[id];
      if (!game || !prog?.completedRuns?.length) continue;
      appendExtraRuns(
        prog.completedRuns,
        `play:${game.id}`,
        'play',
        Math.max(60, Math.min(240, Math.round((prog.hoursPlayed || 2) * 60))),
        game.title,
        game.coverUrl
      );
    }
  }

  for (const j of state.journalEntries || []) {
    if (scope === 'all' || j.domain === scope) {
      bumpMood(j.mood);
      const parsed = parseCalendarAwareTimestamp(j.createdAt);
      if (parsed) {
        events.push({
          ts: parsed.ts,
          domain: j.domain,
          minutes: 15,
          title: j.mediaTitle,
          posterUrl: j.mediaPoster,
        });
      }
    }
  }

  if (includesWatch) {
    for (const id of state.showOrder) {
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog) continue;
      const stats = getShowStats(show, prog);
      const isEngaged = prog.bookmarked || stats.totalWatches > 0;
      if (!isEngaged) continue;

      let showMins = 0;
      for (const ep of getAllEpisodes(show)) {
        const c = prog.episodeCounts[getEpisodeKey(ep.season, ep.number)] || 0;
        if (c > 0) {
          episodesWatchedCount += c;
          showMins += (ep.runtime || show.runtimeAvg || 42) * c;
        }
      }
      watchMinutes += showMins;

      if (stats.isFinished) finishedCount += 1;
      else if (stats.watchedUnique > 0 || prog.status === 'watching') inProgressCount += 1;
      else queuedCount += 1;

      const remEps = Math.max(0, stats.totalEpisodes - stats.watchedUnique);
      if (remEps > 0 && prog.bookmarked) {
        remainingEpisodes += remEps;
        remainingMinutes += remEps * (show.runtimeAvg || 42);
        remainingItemsCount += 1;
      }

      if (showMins > 0) {
        invested.push({
          domain: 'watch',
          kind: 'show',
          id: show.id,
          title: show.title,
          posterUrl: show.posterUrl,
          hours: showMins / 60,
          metricLabel:
            showMins >= 1440
              ? `${Math.floor(showMins / 1440)}d ${Math.round((showMins % 1440) / 60)}h`
              : `${Math.round(showMins / 60)}h`,
          subLabel: `${stats.totalWatches} episodes`,
        });
      }

      bumpGenre(show.genres);
      bumpSource(show.network);
      bumpDecade(show.year);
      bumpMood(prog.mood);
      recordRating('watch', prog.rating);
      if (prog.episodeRatings) {
        for (const epR of Object.values(prog.episodeRatings)) {
          recordRating('watch', epR);
        }
      }

      if (prog.lastWatchedAt && !recordedMediaKeys.has(`watch:${show.id}`)) {
        const ts = Date.parse(prog.lastWatchedAt);
        if (Number.isFinite(ts)) {
          events.push({
            ts,
            domain: 'watch',
            minutes: Math.max(25, show.runtimeAvg || 42),
            title: show.title,
            posterUrl: show.posterUrl,
          });
        }
      }
    }

    for (const id of state.movieOrder) {
      const movie = state.movies[id];
      const prog = state.movieProgress[id];
      if (!movie || !prog) continue;
      const watches = prog.watchCount || 0;
      const mins = (movie.runtime || 120) * watches;
      watchMinutes += mins;
      moviesWatchedCount += watches;

      if (watches > 0) finishedCount += 1;
      else queuedCount += 1;

      if (watches === 0) {
        remainingItemsCount += 1;
        remainingMinutes += movie.runtime || 120;
      }

      if (mins > 0) {
        invested.push({
          domain: 'watch',
          kind: 'movie',
          id: movie.id,
          title: movie.title,
          posterUrl: movie.posterUrl,
          hours: mins / 60,
          metricLabel: `${Math.round(mins / 60)}h`,
          subLabel: watches > 1 ? `Watched x${watches}` : `${movie.runtime || 120} min`,
        });
      }

      bumpGenre(movie.genres);
      bumpCreator(movie.director, 'watch');
      bumpDecade(movie.year);
      bumpMood(prog.mood);
      recordRating('watch', prog.rating);

      if (prog.watchedAt && !recordedMediaKeys.has(`watch:${movie.id}`)) {
        const ts = Date.parse(prog.watchedAt);
        if (Number.isFinite(ts)) {
          events.push({
            ts,
            domain: 'watch',
            minutes: movie.runtime || 120,
            title: movie.title,
            posterUrl: movie.posterUrl,
          });
        }
      }
    }
  }

  if (includesRead) {
    const countedComicAtomicIds = new Set<string>();
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog) continue;
      const stats = getReadStats(item, prog);
      if (!prog.bookmarked && stats.current === 0) continue;

      const totalReadUnits = countDeduplicatedReadUnits(
        item,
        stats.completedUnits,
        stats.rereadCount,
        stats.isFinished,
        countedComicAtomicIds
      );
      const minsPerUnit = item.unit === 'issues' ? 10 : 12;
      const itemMins = totalReadUnits * minsPerUnit;
      readMinutes += itemMins;

      if (item.unit === 'issues') issuesReadCount += totalReadUnits;
      else chaptersReadCount += totalReadUnits;

      if (stats.isFinished) finishedCount += 1;
      else if (stats.current > 0 || prog.status === 'reading') inProgressCount += 1;
      else queuedCount += 1;

      const rem = Math.max(0, stats.total - stats.current);
      if (rem > 0 && prog.bookmarked) {
        remainingUnits += rem;
        remainingItemsCount += 1;
        remainingMinutes += rem * minsPerUnit;
      }

      if (itemMins > 0) {
        const cover = resolveComicEditionCover(item, prog.edition, prog);
        invested.push({
          domain: 'read',
          kind: 'read',
          id: item.id,
          title: item.title,
          posterUrl: cover,
          hours: itemMins / 60,
          metricLabel: `${Math.max(1, Math.round(itemMins / 60))}h`,
          subLabel: `${totalReadUnits} ${item.unit}`,
        });
      }

      bumpGenre(item.genres);
      bumpCreator(item.creator, 'read');
      bumpSource(item.comicPublisher || (item.format === 'manga' ? 'Manga' : undefined));
      bumpDecade(item.year);
      bumpMood(prog.mood);
      recordRating('read', prog.rating);

      if (prog.lastReadAt && !recordedMediaKeys.has(`read:${item.id}`)) {
        const ts = Date.parse(prog.lastReadAt);
        if (Number.isFinite(ts)) {
          events.push({
            ts,
            domain: 'read',
            minutes: minsPerUnit,
            title: item.title,
            posterUrl: item.coverUrl,
          });
        }
      }
    }
  }

  if (includesPlay) {
    for (const id of state.gameOrder) {
      const game = state.games[id];
      const prog = state.gameProgress[id];
      if (!game || !prog) continue;
      if (!prog.bookmarked && prog.hoursPlayed <= 0 && prog.status !== 'completed') continue;

      const hrs = Math.max(0, prog.hoursPlayed || 0);
      const mins = Math.round(hrs * 60);
      playMinutes += mins;
      playHoursTotal += hrs;

      if (prog.status === 'completed') finishedCount += 1;
      else if (prog.status === 'dropped') droppedCount += 1;
      else if (prog.status === 'playing' || hrs > 0 || (prog.completionPct || 0) > 0) {
        inProgressCount += 1;
      } else {
        queuedCount += 1;
      }

      if (prog.bookmarked && prog.status !== 'completed' && prog.status !== 'dropped') {
        remainingGames += 1;
        remainingItemsCount += 1;
        const pct = Math.max(0, Math.min(95, prog.completionPct || 0));
        const estRemainingHrs =
          pct > 0 && hrs > 0
            ? Math.max(2, Math.round((hrs * (100 - pct)) / Math.max(10, pct)))
            : Math.max(5, 22 - hrs);
        remainingMinutes += estRemainingHrs * 60;
      }

      if (hrs > 0) {
        invested.push({
          domain: 'play',
          kind: 'game',
          id: game.id,
          title: game.title,
          posterUrl: game.coverUrl,
          hours: hrs,
          metricLabel: hrs >= 24 ? `${Math.floor(hrs / 24)}d ${Math.round(hrs % 24)}h` : `${hrs}h`,
          subLabel: `${prog.completionPct || 0}% · ${prog.platform}`,
        });
      }

      bumpGenre(game.genres);
      bumpCreator(game.developer, 'play');
      bumpSource(prog.platform || game.platforms[0]);
      bumpDecade(game.year);
      bumpMood(prog.mood);
      recordRating('play', prog.rating);

      if (prog.lastPlayedAt && !recordedMediaKeys.has(`play:${game.id}`)) {
        const ts = Date.parse(prog.lastPlayedAt);
        if (Number.isFinite(ts)) {
          events.push({
            ts,
            domain: 'play',
            minutes: 60,
            title: game.title,
            posterUrl: game.coverUrl,
          });
        }
      }
    }
  }

  const totalMinutes = watchMinutes + readMinutes + playMinutes;
  const hero = formatDurationHero(totalMinutes);
  const heroSubParts: string[] = [];
  if (includesWatch && episodesWatchedCount + moviesWatchedCount > 0) {
    heroSubParts.push(
      `${episodesWatchedCount.toLocaleString()} eps · ${moviesWatchedCount} films`
    );
  }
  if (includesRead && chaptersReadCount + issuesReadCount > 0) {
    const readBits: string[] = [];
    if (chaptersReadCount > 0) readBits.push(`${chaptersReadCount.toLocaleString()} ch`);
    if (issuesReadCount > 0) readBits.push(`${issuesReadCount.toLocaleString()} iss`);
    heroSubParts.push(readBits.join(' · '));
  }
  if (includesPlay && playHoursTotal > 0) {
    heroSubParts.push(`${Math.round(playHoursTotal).toLocaleString()}h played`);
  }

  const totalDomainSum = Math.max(1, totalMinutes);
  const watchPct = Math.round((watchMinutes / totalDomainSum) * 100);
  const readPct = Math.round((readMinutes / totalDomainSum) * 100);
  const playPct = totalMinutes > 0 ? Math.max(0, 100 - watchPct - readPct) : 0;

  // Personality calculation
  const now = Date.now();
  const timeBuckets = [0, 0, 0, 0, 0, 0];
  const dayTimeMatrix = Array.from({ length: 7 }, () => [0, 0, 0, 0, 0, 0]);
  const dayCountsMap = new Map<string, { count: number; minutes: number; topTitle?: string; topPoster?: string }>();
  const monthCountsMap = new Map<string, { label: string; count: number; minutes: number }>();

  let earliestTs = Infinity;
  let earliestTitle: string | undefined;

  for (const ev of events) {
    const d = new Date(ev.ts);
    const hr = d.getHours();
    const blockIdx = Math.min(5, Math.floor(hr / 4));
    const monDay = (d.getDay() + 6) % 7;
    timeBuckets[blockIdx] += 1;
    dayTimeMatrix[monDay][blockIdx] += 1;

    const dateIso = toLocalDateIso(d);
    const prevDay = dayCountsMap.get(dateIso);
    dayCountsMap.set(dateIso, {
      count: (prevDay?.count || 0) + 1,
      minutes: (prevDay?.minutes || 0) + ev.minutes,
      topTitle: prevDay?.topTitle || ev.title,
      topPoster: prevDay?.topPoster || ev.posterUrl,
    });

    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const prevMon = monthCountsMap.get(mKey);
    monthCountsMap.set(mKey, {
      label: mLabel,
      count: (prevMon?.count || 0) + 1,
      minutes: (prevMon?.minutes || 0) + ev.minutes,
    });

    if (ev.ts < earliestTs) {
      earliestTs = ev.ts;
      earliestTitle = ev.title;
    }
  }

  const morningCount = timeBuckets[1] + timeBuckets[2]; // 4a - 12p
  const afternoonCount = timeBuckets[3] + timeBuckets[4]; // 12p - 8p
  const eveningCount = timeBuckets[5]; // 8p - 12a
  const lateNightCount = timeBuckets[0]; // 12a - 4a
  const totalTimed = Math.max(1, events.length);

  let archetype = 'Balanced Tracker';
  let archetypeSubtitle = 'Steady sessions spread evenly across your day.';
  if (events.length === 0) {
    archetype = 'Fresh Canvas';
    archetypeSubtitle = 'Start logging episodes, chapters, or sessions to reveal patterns.';
  } else {
    const slices = [
      { label: 'Early Bird', count: morningCount, sub: 'before noon' },
      { label: 'Afternoon Explorer', count: afternoonCount, sub: 'between 12 PM and 8 PM' },
      { label: 'Evening Unwinder', count: eveningCount, sub: 'between 8 PM and midnight' },
      { label: 'Night Owl', count: lateNightCount, sub: 'after midnight' },
    ].sort((a, b) => b.count - a.count);
    const winner = slices[0];
    const pct = Math.round((winner.count / totalTimed) * 100);
    archetype = winner.label;
    archetypeSubtitle = `${pct}% of your recent activity starts ${winner.sub}.`;
  }

  const sortedGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const traits: string[] = [];
  if (scope === 'all' && watchMinutes > 0 && readMinutes > 0 && playMinutes > 0) {
    traits.push('World Hopper');
  }
  if (sortedGenres[0]) {
    traits.push(`${sortedGenres[0].name} Buff`);
  }
  if (issuesReadCount >= 10) {
    traits.push('Panel Collector');
  }
  if (playHoursTotal >= 80) {
    traits.push('Marathon Gamer');
  }
  const completionDenom = finishedCount + droppedCount;
  const completionRatePct =
    completionDenom > 0
      ? Math.round((finishedCount / completionDenom) * 100)
      : finishedCount + inProgressCount > 0
        ? Math.round((finishedCount / (finishedCount + inProgressCount)) * 100)
        : 0;
  if (completionRatePct >= 75 && finishedCount >= 3) {
    traits.push('Completionist');
  }
  if (invested.length >= 3 && traits.length < 4) {
    traits.push('Deep Diver');
  }

  // Activity 7d / 30d & 16-week series
  const d7Ms = 7 * 86400 * 1000;
  const d30Ms = 30 * 86400 * 1000;
  let last7Logs = 0;
  let last7Mins = 0;
  let prev7Logs = 0;
  let last30Logs = 0;
  let last30Mins = 0;
  let prev30Logs = 0;

  for (const ev of events) {
    const age = now - ev.ts;
    if (age >= 0 && age <= d7Ms) {
      last7Logs += 1;
      last7Mins += ev.minutes;
    } else if (age > d7Ms && age <= d7Ms * 2) {
      prev7Logs += 1;
    }
    if (age >= 0 && age <= d30Ms) {
      last30Logs += 1;
      last30Mins += ev.minutes;
    } else if (age > d30Ms && age <= d30Ms * 2) {
      prev30Logs += 1;
    }
  }

  const last7DeltaPct =
    prev7Logs > 0 ? Math.round(((last7Logs - prev7Logs) / prev7Logs) * 100) : null;
  const last30DeltaPct =
    prev30Logs > 0 ? Math.round(((last30Logs - prev30Logs) / prev30Logs) * 100) : null;

  // 16 weeks grid ending on current week's Sunday
  const currentMonday = getMondayStart(new Date(now));
  const firstMonday = new Date(currentMonday);
  firstMonday.setDate(firstMonday.getDate() - 15 * 7);

  const weeklyBuckets = Array.from({ length: 16 }, (_, wIdx) => {
    const start = new Date(firstMonday);
    start.setDate(firstMonday.getDate() + wIdx * 7);
    return {
      startMs: start.getTime(),
      weekStartIso: toLocalDateIso(start),
      weekLabel: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      monthLabel: start.toLocaleDateString('en-US', { month: 'short' }),
      logs: 0,
      mins: 0,
      watchLogs: 0,
      readLogs: 0,
      playLogs: 0,
    };
  });

  const gridStartMs = firstMonday.getTime();
  for (const ev of events) {
    const diffDays = Math.floor((ev.ts - gridStartMs) / 86400_000);
    if (diffDays >= 0 && diffDays < 16 * 7) {
      const wIdx = Math.floor(diffDays / 7);
      const b = weeklyBuckets[wIdx];
      if (b) {
        b.logs += 1;
        b.mins += ev.minutes;
        if (ev.domain === 'watch') b.watchLogs += 1;
        else if (ev.domain === 'read') b.readLogs += 1;
        else b.playLogs += 1;
      }
    }
  }

  const weeklySeries: WeeklyBarPoint[] = weeklyBuckets.map((b) => ({
    weekStartIso: b.weekStartIso,
    weekLabel: b.weekLabel,
    monthLabel: b.monthLabel,
    logs: b.logs,
    hours: Number((b.mins / 60).toFixed(1)),
    watchLogs: b.watchLogs,
    readLogs: b.readLogs,
    playLogs: b.playLogs,
  }));

  // 16 x 7 calendar heatmap
  let maxCalCount = 0;
  const rawCalendarDays: Array<Omit<HeatmapDayCell, 'level'>> = [];
  for (let w = 0; w < 16; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const cellDate = new Date(firstMonday);
      cellDate.setDate(firstMonday.getDate() + w * 7 + d);
      const iso = toLocalDateIso(cellDate);
      const count = dayCountsMap.get(iso)?.count || 0;
      if (count > maxCalCount) maxCalCount = count;
      rawCalendarDays.push({
        dateIso: iso,
        label: cellDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        weekIndex: w,
        dayOfWeek: d,
        count,
      });
    }
  }

  const calendarDays: HeatmapDayCell[] = rawCalendarDays.map((c) => ({
    ...c,
    level: quantizeLevel(c.count, maxCalCount),
  }));

  const monthHeaders: Array<{ weekIndex: number; label: string }> = [];
  let lastSeenMonth = '';
  for (let w = 0; w < 16; w += 1) {
    const start = new Date(firstMonday);
    start.setDate(firstMonday.getDate() + w * 7);
    const m = start.toLocaleDateString('en-US', { month: 'short' });
    if (m !== lastSeenMonth) {
      lastSeenMonth = m;
      monthHeaders.push({ weekIndex: w, label: m });
    }
  }

  // Time of day matrix
  let maxTimeCell = 0;
  let primeDay = 0;
  let primeBlock = 5;
  for (let d = 0; d < 7; d += 1) {
    for (let b = 0; b < 6; b += 1) {
      const v = dayTimeMatrix[d][b];
      if (v > maxTimeCell) {
        maxTimeCell = v;
        primeDay = d;
        primeBlock = b;
      }
    }
  }

  const timeCells: TimeBlockCell[] = [];
  for (let d = 0; d < 7; d += 1) {
    for (let b = 0; b < 6; b += 1) {
      const count = dayTimeMatrix[d][b];
      timeCells.push({
        dayIndex: d,
        dayLabel: DAY_NAMES_SHORT[d],
        blockIndex: b,
        blockLabel: BLOCK_LABELS[b],
        count,
        level: quantizeLevel(count, maxTimeCell),
      });
    }
  }

  // Hall of Fame
  let biggestDayCount = 0;
  let biggestDayIso = '';
  let biggestDayTitle: string | undefined;
  let biggestDayPoster: string | undefined;
  for (const [iso, info] of dayCountsMap.entries()) {
    if (info.count > biggestDayCount) {
      biggestDayCount = info.count;
      biggestDayIso = iso;
      biggestDayTitle = info.topTitle;
      biggestDayPoster = info.topPoster;
    }
  }
  const biggestDayLabel = biggestDayIso
    ? new Date(`${biggestDayIso}T12:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No activity yet';

  let bestMonthLabel = 'No logs yet';
  let bestMonthMins = 0;
  let bestMonthCount = 0;
  for (const m of monthCountsMap.values()) {
    if (m.minutes > bestMonthMins || (m.minutes === bestMonthMins && m.count > bestMonthCount)) {
      bestMonthMins = m.minutes;
      bestMonthCount = m.count;
      bestMonthLabel = m.label;
    }
  }
  const bestMonthHoursLabel =
    bestMonthCount > 0
      ? `${Math.max(1, Math.round(bestMonthMins / 60))}h · ${bestMonthCount} logs`
      : '—';

  // Longest consecutive active-day streak
  const sortedDayIsos = [...dayCountsMap.keys()].sort();
  let longestStreakDays = 0;
  let curStreak = 0;
  let prevEpochDays: number | null = null;
  for (const iso of sortedDayIsos) {
    const epochDay = Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86400_000);
    if (prevEpochDays !== null && epochDay === prevEpochDays + 1) {
      curStreak += 1;
    } else {
      curStreak = 1;
    }
    if (curStreak > longestStreakDays) longestStreakDays = curStreak;
    prevEpochDays = epochDay;
  }

  const trackingSinceLabel = Number.isFinite(earliestTs)
    ? new Date(earliestTs).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : 'Today';

  // Backlog breakdown label
  const remParts: string[] = [];
  if (remainingEpisodes > 0) remParts.push(`${remainingEpisodes} episodes`);
  if (remainingUnits > 0) remParts.push(`${remainingUnits} chapters/issues`);
  if (remainingGames > 0) remParts.push(`${remainingGames} ${remainingGames === 1 ? 'game' : 'games'}`);
  const remainingBreakdownLabel =
    remParts.length > 0 ? remParts.join(' · ') : 'Queue clear';

  // Ratings summary
  const totalRated = watchRatingCount + readRatingCount + playRatingCount;
  const avgAll =
    totalRated > 0
      ? ((watchRatingSum + readRatingSum + playRatingSum) / totalRated).toFixed(1)
      : '—';

  // Top genres / sources / creators / decades
  const topGenreCount = Math.max(1, sortedGenres[0]?.count || 1);
  const topGenres: NamedCountItem[] = sortedGenres.slice(0, 8).map((g) => ({
    name: g.name,
    count: g.count,
    pct: Math.round((g.count / topGenreCount) * 100),
  }));

  const totalSourcesCount = Math.max(
    1,
    [...sourceCounts.values()].reduce((acc, v) => acc + v, 0)
  );
  const topSources: NamedCountItem[] = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / totalSourcesCount) * 100),
    }));

  const topCreators = [...creatorCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([name, info]) => ({ name, count: info.count, domain: info.domain }));

  const moodList = MOOD_OPTIONS.map((m) => ({
    key: m.key,
    emoji: m.emoji,
    label: m.label,
    count: moodCounts.get(m.key) || 0,
  }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const decadeList: DecadeBarItem[] = [1970, 1980, 1990, 2000, 2010, 2020].map((d) => ({
    label: `${d}s`,
    shortLabel: `'${String(d).slice(2)}`,
    count:
      d === 1970
        ? [...decadeCounts.entries()]
            .filter(([yr]) => yr <= 1970)
            .reduce((acc, [, c]) => acc + c, 0)
        : decadeCounts.get(d) || 0,
  }));
  const peakDecade = [...decadeList].sort((a, b) => b.count - a.count)[0];
  const peakDecadeLabel =
    peakDecade && peakDecade.count > 0 ? peakDecade.label : '2020s';

  return {
    scope,
    totalMinutes,
    totalHours: hero.hours,
    totalDays: hero.days,
    heroPrimaryLabel: hero.primary,
    heroSubline: heroSubParts.join(' · ') || 'No time logged yet',
    heroComparison: buildFunComparison(totalMinutes, scope),
    domainSplit: {
      watchMinutes,
      readMinutes,
      playMinutes,
      watchPct,
      readPct,
      playPct,
    },
    personality: {
      archetype,
      subtitle: archetypeSubtitle,
      traits: traits.slice(0, 4),
    },
    activity: {
      last7Logs,
      last7Hours: Number((last7Mins / 60).toFixed(1)),
      last7DeltaPct,
      last30Logs,
      last30Hours: Number((last30Mins / 60).toFixed(1)),
      last30DeltaPct,
      weeklySeries,
    },
    calendarHeatmap: {
      days: calendarDays,
      activeDaysCount: [...dayCountsMap.values()].filter((v) => v.count > 0).length,
      totalEventsCount: events.length,
      monthHeaders,
    },
    timeHeatmap: {
      cells: timeCells,
      primeWindowLabel:
        maxTimeCell > 0
          ? `${DAY_NAMES_FULL[primeDay]}, around ${BLOCK_FULL_TIMES[primeBlock]}`
          : 'Log sessions to spot your prime window',
    },
    habits: {
      completionRatePct,
      finishedCount,
      inProgressCount,
      queuedCount,
      droppedCount,
      totalTrackedCount: finishedCount + inProgressCount + queuedCount + droppedCount,
    },
    hallOfFame: {
      biggestDayCount,
      biggestDayLabel,
      biggestDayTitle,
      biggestDayPoster,
      bestMonthLabel,
      bestMonthHoursLabel,
      longestStreakDays,
      trackingSinceLabel,
      trackingSinceTitle: earliestTitle,
    },
    backlog: {
      remainingMinutes,
      remainingItemsCount,
      remainingBreakdownLabel,
      inProgressCount,
      queuedCount,
      finishedCount,
      droppedCount,
    },
    topInvested: invested.sort((a, b) => b.hours - a.hours).slice(0, 5),
    ratings: {
      averageLabel: avgAll,
      totalRated,
      watchAvg: watchRatingCount > 0 ? Number((watchRatingSum / watchRatingCount).toFixed(1)) : null,
      watchCount: watchRatingCount,
      readAvg: readRatingCount > 0 ? Number((readRatingSum / readRatingCount).toFixed(1)) : null,
      readCount: readRatingCount,
      playAvg: playRatingCount > 0 ? Number((playRatingSum / playRatingCount).toFixed(1)) : null,
      playCount: playRatingCount,
      histogram: [1, 2, 3, 4, 5].map((stars, idx) => ({
        stars,
        count: ratingBuckets[idx],
      })),
    },
    topGenres,
    moods: moodList,
    topSources,
    topCreators,
    decades: decadeList,
    peakDecadeLabel,
  };
}
