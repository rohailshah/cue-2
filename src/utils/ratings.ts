import type { GameProgress, RatingSource, ReadProgress, Show, ShowProgress } from '../types';
import { getEpisodeKey } from './stats';

export function roundRatingHalf(avg: number): number {
  return Math.max(0.5, Math.min(5, Math.round(avg * 2) / 2));
}

export function roundRatingTenth(avg: number): number {
  return Math.max(0.5, Math.min(5, Math.round(avg * 10) / 10));
}

export function formatRating(val: number): string {
  return Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1);
}

export function getSeasonEpisodeAverage(
  show: Show,
  seasonNumber: number,
  progress?: ShowProgress
): { avg: number; count: number; total: number } | null {
  const season = show.seasons.find((s) => s.number === seasonNumber);
  if (!season || season.episodes.length === 0) return null;
  const ratings = progress?.episodeRatings || {};
  const vals: number[] = [];
  for (const ep of season.episodes) {
    const r = ratings[getEpisodeKey(ep.season, ep.number)];
    if (typeof r === 'number' && r > 0) vals.push(r);
  }
  if (vals.length === 0) return null;
  return {
    avg: vals.reduce((s, r) => s + r, 0) / vals.length,
    count: vals.length,
    total: season.episodes.length,
  };
}

export function getShowCalculatedAverage(
  show: Show,
  progress?: ShowProgress
): { avg: number; count: number; basis: 'episodes' | 'seasons' } | null {
  const epRatings = Object.values(progress?.episodeRatings || {}).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  if (epRatings.length > 0) {
    return {
      avg: epRatings.reduce((s, r) => s + r, 0) / epRatings.length,
      count: epRatings.length,
      basis: 'episodes',
    };
  }
  const sRatings = Object.entries(progress?.seasonRatings || {})
    .filter(([sNum]) => show.seasons.some((s) => s.number === Number(sNum)))
    .map(([, r]) => r)
    .filter((r): r is number => typeof r === 'number' && r > 0);
  if (sRatings.length > 0) {
    return {
      avg: sRatings.reduce((s, r) => s + r, 0) / sRatings.length,
      count: sRatings.length,
      basis: 'seasons',
    };
  }
  return null;
}

export function getReadUnitsAverage(
  progress?: ReadProgress
): { avg: number; count: number } | null {
  const vals = Object.values(progress?.unitRatings || {}).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  if (vals.length === 0) return null;
  return {
    avg: vals.reduce((s, r) => s + r, 0) / vals.length,
    count: vals.length,
  };
}

export function getGameChaptersAverage(
  progress?: GameProgress
): { avg: number; count: number } | null {
  const vals = Object.values(progress?.chapterRatings || {}).filter(
    (r): r is number => typeof r === 'number' && r > 0
  );
  if (vals.length === 0) return null;
  return {
    avg: vals.reduce((s, r) => s + r, 0) / vals.length,
    count: vals.length,
  };
}

/**
 * Applies an atom-derived average rating automatically while preserving explicit or
 * legacy manual ratings (`source !== 'auto'`) until the user resets back to auto.
 */
export function applyAutoRating(
  currentRating: number | undefined,
  currentSource: RatingSource | undefined,
  calculatedAvg: number | null
): { rating: number | undefined; source: RatingSource | undefined } {
  if (typeof currentRating === 'number' && currentRating > 0 && currentSource !== 'auto') {
    return {
      rating: currentRating,
      source: currentSource || 'manual',
    };
  }
  if (calculatedAvg !== null && Number.isFinite(calculatedAvg) && calculatedAvg > 0) {
    return {
      rating: roundRatingTenth(calculatedAvg),
      source: 'auto',
    };
  }
  return {
    rating: undefined,
    source: undefined,
  };
}
