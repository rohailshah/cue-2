import type { CueStoreState, MediaDomain } from '../types';
import { resolveComicEditionCover } from './editions';
import { getReadStats, getShowStats } from './stats';

export interface RecentEntryItem {
  key: string;
  domain: MediaDomain;
  kind: 'show' | 'movie' | 'read' | 'game';
  id: string;
  title: string;
  poster: string;
  ratio: number;
  activityMs: number;
  activityDateRaw?: string;
  subtitle: string;
  contextLabel?: string;
}

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

/**
 * Parses either a YYYY-MM-DD finished date (anchored at UTC noon so local
 * timezone offsets never shift the calendar day) or a full ISO timestamp.
 * Returns 0 when empty or invalid.
 */
export function parseActivityTimestampMs(raw?: string): number {
  const s = (raw || '').trim();
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = Date.parse(`${s}T12:00:00Z`);
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Formats an activity date string concisely for poster card subtitles
 * (e.g. "Nov 27" within the same calendar year, or "Jul 2025" for prior years).
 */
export function formatRecentEntryDate(raw?: string, nowMs = Date.now()): string {
  const ms = parseActivityTimestampMs(raw);
  if (ms <= 0) return '';
  const d = new Date(ms);
  const now = new Date(nowMs);
  const s = (raw || '').trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const year = isDateOnly ? d.getUTCFullYear() : d.getFullYear();
  const monthIdx = isDateOnly ? d.getUTCMonth() : d.getMonth();
  const day = isDateOnly ? d.getUTCDate() : d.getDate();
  const month = MONTH_ABBR[monthIdx] || '';
  if (!month) return '';
  if (year === now.getFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${year}`;
}

interface CandidateActivity {
  ms: number;
  raw?: string;
}

function pickLatestActivity(candidates: Array<string | undefined>): CandidateActivity {
  let bestMs = 0;
  let bestRaw: string | undefined;
  for (const raw of candidates) {
    const ms = parseActivityTimestampMs(raw);
    if (ms > bestMs) {
      bestMs = ms;
      bestRaw = raw;
    }
  }
  return { ms: bestMs, raw: bestRaw };
}

function mapJournalKind(
  mediaKind: CueStoreState['journalEntries'][number]['mediaKind']
): 'show' | 'movie' | 'read' | 'game' {
  if (mediaKind === 'show' || mediaKind === 'movie' || mediaKind === 'game') return mediaKind;
  return 'read';
}

/**
 * Collects recently logged, finished, rated, or tracked entries across Watch,
 * Read, and Play ordered newest-first by latest activity timestamp.
 */
export function buildRecentEntries(
  state: CueStoreState,
  limit = 18,
  nowMs = Date.now()
): RecentEntryItem[] {
  const historyMap = new Map<string, { ms: number; raw: string; codeLabel?: string }>();
  for (const h of state.history || []) {
    const key = `${h.mediaKind}:${h.mediaId}`;
    const ms = parseActivityTimestampMs(h.loggedAt);
    const prev = historyMap.get(key);
    if (!prev || ms > prev.ms) {
      historyMap.set(key, {
        ms,
        raw: h.loggedAt,
        codeLabel: h.codeLabel,
      });
    }
  }

  const journalMap = new Map<string, { ms: number; raw: string }>();
  for (const j of state.journalEntries || []) {
    const kind = mapJournalKind(j.mediaKind);
    const key = `${kind}:${j.mediaId}`;
    const ms = parseActivityTimestampMs(j.createdAt);
    const prev = journalMap.get(key);
    if (!prev || ms > prev.ms) {
      journalMap.set(key, { ms, raw: j.createdAt });
    }
  }

  const byKey = new Map<string, RecentEntryItem & { orderIdx: number }>();
  let orderCounter = 0;

  const upsert = (entry: RecentEntryItem) => {
    const existing = byKey.get(entry.key);
    if (existing) {
      if (entry.activityMs > existing.activityMs) {
        byKey.set(entry.key, { ...entry, orderIdx: existing.orderIdx });
      }
      return;
    }
    byKey.set(entry.key, { ...entry, orderIdx: orderCounter++ });
  };

  for (const id of state.showOrder) {
    const show = state.shows[id];
    const prog = state.showProgress[id];
    if (!show || !prog?.bookmarked) continue;
    const key = `show:${show.id}`;
    const hist = historyMap.get(key);
    const jnl = journalMap.get(key);
    const act = pickLatestActivity([
      prog.finishedAt,
      prog.lastWatchedAt,
      ...(prog.completedRuns || []).map((r) => r.finishedAt),
      ...Object.values(prog.episodeFinishedAt || {}),
      ...Object.values(prog.seasonFinishedAt || {}),
      hist?.raw,
      jnl?.raw,
    ]);
    const st = getShowStats(show, prog);
    const dateLabel = formatRecentEntryDate(act.raw, nowMs);
    upsert({
      key,
      domain: 'watch',
      kind: 'show',
      id: show.id,
      title: show.title,
      poster: show.posterUrl,
      ratio: st.progressRatio,
      activityMs: act.ms,
      activityDateRaw: act.raw,
      subtitle: dateLabel || String(show.year || 'Show'),
      contextLabel: hist?.codeLabel,
    });
  }

  for (const id of state.movieOrder) {
    const movie = state.movies[id];
    const prog = state.movieProgress[id];
    if (!movie || !prog) continue;
    const key = `movie:${movie.id}`;
    const hist = historyMap.get(key);
    const jnl = journalMap.get(key);
    const act = pickLatestActivity([
      prog.watchedAt,
      ...(prog.completedRuns || []).map((r) => r.finishedAt),
      hist?.raw,
      jnl?.raw,
    ]);
    const dateLabel = formatRecentEntryDate(act.raw, nowMs);
    upsert({
      key,
      domain: 'watch',
      kind: 'movie',
      id: movie.id,
      title: movie.title,
      poster: movie.posterUrl,
      ratio: prog.watchCount > 0 ? 1 : 0,
      activityMs: act.ms,
      activityDateRaw: act.raw,
      subtitle: dateLabel || String(movie.year || 'Movie'),
      contextLabel: hist?.codeLabel,
    });
  }

  for (const id of state.readOrder) {
    const item = state.readItems[id];
    const prog = state.readProgress[id];
    if (!item || !prog?.bookmarked) continue;
    const key = `read:${item.id}`;
    const hist = historyMap.get(key);
    const jnl = journalMap.get(key);
    const act = pickLatestActivity([
      prog.finishedAt,
      prog.lastReadAt,
      ...(prog.completedRuns || []).map((r) => r.finishedAt),
      ...Object.values(prog.unitFinishedAt || {}),
      hist?.raw,
      jnl?.raw,
    ]);
    const st = getReadStats(item, prog);
    const dateLabel = formatRecentEntryDate(act.raw, nowMs);
    upsert({
      key,
      domain: 'read',
      kind: 'read',
      id: item.id,
      title: item.title,
      poster: resolveComicEditionCover(item, prog.edition, prog),
      ratio: st.ratio,
      activityMs: act.ms,
      activityDateRaw: act.raw,
      subtitle: dateLabel || item.creator || String(item.year || 'Read'),
      contextLabel: hist?.codeLabel,
    });
  }

  for (const id of state.gameOrder) {
    const game = state.games[id];
    const prog = state.gameProgress[id];
    if (!game || !prog?.bookmarked) continue;
    const key = `game:${game.id}`;
    const hist = historyMap.get(key);
    const jnl = journalMap.get(key);
    const act = pickLatestActivity([
      prog.finishedAt,
      prog.lastPlayedAt,
      ...(prog.completedRuns || []).map((r) => r.finishedAt),
      ...Object.values(prog.chapterFinishedAt || {}),
      hist?.raw,
      jnl?.raw,
    ]);
    const dateLabel = formatRecentEntryDate(act.raw, nowMs);
    upsert({
      key,
      domain: 'play',
      kind: 'game',
      id: game.id,
      title: game.title,
      poster: game.coverUrl,
      ratio: Math.max(0, Math.min(1, (prog.completionPct || 0) / 100)),
      activityMs: act.ms,
      activityDateRaw: act.raw,
      subtitle: dateLabel || prog.platform || game.platforms[0] || String(game.year || 'Game'),
      contextLabel: hist?.codeLabel,
    });
  }

  // Ensure any recently logged history entry whose underlying item still exists
  // appears even if it was later unbookmarked.
  for (const h of state.history || []) {
    const key = `${h.mediaKind}:${h.mediaId}`;
    if (byKey.has(key)) continue;
    const ms = parseActivityTimestampMs(h.loggedAt);
    const dateLabel = formatRecentEntryDate(h.loggedAt, nowMs);
    if (h.mediaKind === 'show' && state.shows[h.mediaId]) {
      const show = state.shows[h.mediaId];
      const st = getShowStats(show, state.showProgress[h.mediaId]);
      upsert({
        key,
        domain: 'watch',
        kind: 'show',
        id: show.id,
        title: show.title,
        poster: show.posterUrl,
        ratio: st.progressRatio,
        activityMs: ms,
        activityDateRaw: h.loggedAt,
        subtitle: dateLabel || String(show.year || 'Show'),
        contextLabel: h.codeLabel,
      });
    } else if (h.mediaKind === 'movie' && state.movies[h.mediaId]) {
      const movie = state.movies[h.mediaId];
      const prog = state.movieProgress[h.mediaId];
      upsert({
        key,
        domain: 'watch',
        kind: 'movie',
        id: movie.id,
        title: movie.title,
        poster: movie.posterUrl,
        ratio: (prog?.watchCount || 0) > 0 ? 1 : 0,
        activityMs: ms,
        activityDateRaw: h.loggedAt,
        subtitle: dateLabel || String(movie.year || 'Movie'),
        contextLabel: h.codeLabel,
      });
    } else if (h.mediaKind === 'read' && state.readItems[h.mediaId]) {
      const item = state.readItems[h.mediaId];
      const prog = state.readProgress[h.mediaId];
      const st = getReadStats(item, prog);
      upsert({
        key,
        domain: 'read',
        kind: 'read',
        id: item.id,
        title: item.title,
        poster: resolveComicEditionCover(item, prog?.edition, prog),
        ratio: st.ratio,
        activityMs: ms,
        activityDateRaw: h.loggedAt,
        subtitle: dateLabel || item.creator || String(item.year || 'Read'),
        contextLabel: h.codeLabel,
      });
    } else if (h.mediaKind === 'game' && state.games[h.mediaId]) {
      const game = state.games[h.mediaId];
      const prog = state.gameProgress[h.mediaId];
      upsert({
        key,
        domain: 'play',
        kind: 'game',
        id: game.id,
        title: game.title,
        poster: game.coverUrl,
        ratio: Math.max(0, Math.min(1, (prog?.completionPct || 0) / 100)),
        activityMs: ms,
        activityDateRaw: h.loggedAt,
        subtitle: dateLabel || prog?.platform || game.platforms[0] || String(game.year || 'Game'),
        contextLabel: h.codeLabel,
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (b.activityMs !== a.activityMs) return b.activityMs - a.activityMs;
      return a.orderIdx - b.orderIdx;
    })
    .slice(0, Math.max(1, limit))
    .map(({ orderIdx: _idx, ...rest }) => rest);
}
