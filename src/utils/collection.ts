import type {
  AtomicReadRecord,
  CollectionDetails,
  CueStoreState,
  GameItem,
  GameProgress,
  MediaDomain,
  Movie,
  MovieProgress,
  OwnershipStatus,
  ReadItem,
  ReadProgress,
  Show,
  ShowProgress,
} from '../types';
import { getComicCollectionSummary } from './atoms';
import { resolveComicEditionCover } from './editions';
import type { JournalStatsScope } from './journalAnalytics';

export const WATCH_COLLECTION_FORMATS = [
  'Blu-ray',
  '4K UHD',
  'DVD',
  'Steelbook',
  'Box Set',
  'Digital',
] as const;

export const READ_COLLECTION_FORMATS = [
  'Paperback',
  'Hardcover',
  'TPB / Compact',
  'Omnibus',
  'Single Issues',
  'Digital',
] as const;

export const PLAY_COLLECTION_FORMATS = [
  'Steam',
  'Epic Games',
  'GOG',
  'Itch.io',
  'Physical',
  'PSN',
  'eShop',
  'Xbox',
  'Game Pass',
] as const;

export const PLAY_COLLECTION_PLATFORMS = [
  'PC',
  'Android',
  'PS5',
  'Switch',
  'Xbox',
  'Steam Deck',
] as const;

export const COLLECTION_CURRENCIES = ['$', 'CA$', '¥', '€', '£'] as const;

/** Formats a numeric price cleanly, treating 0 as 'Free' unless exact zero formatting is requested. */
export function formatExactPrice(price: number, currency = '$'): string {
  const sym = currency || '$';
  if (sym === '¥') {
    return `¥${Math.round(price).toLocaleString()}`;
  }
  return `${sym}${price.toFixed(2)}`;
}

export function formatCollectionPrice(price?: number, currency = '$'): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  if (price === 0) return 'Free';
  return formatExactPrice(price, currency);
}

export interface CollectionValueMetric {
  label: string;
  short: string;
  rate: number;
}

/** Computes Price/Minute (Watch), Price/Page (Read), or Price/Hour (Play). */
export function computeCollectionValueMetric(
  domain: MediaDomain,
  details: CollectionDetails | undefined,
  fallback: { minutes?: number; pages?: number; hoursPlayed?: number }
): CollectionValueMetric | null {
  const price = details?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  const cur = details?.currency || '$';

  if (domain === 'watch') {
    const mins = details?.runtimeMinutes || fallback.minutes || 0;
    if (mins <= 0) return null;
    const rate = price / mins;
    return {
      label: 'Price / min',
      short: `${cur === '¥' ? `¥${rate.toFixed(1)}` : `${cur}${rate.toFixed(2)}`}/min`,
      rate,
    };
  }

  if (domain === 'read') {
    const pages = details?.pages || fallback.pages || 0;
    if (pages <= 0) return null;
    const rate = price / pages;
    return {
      label: 'Price / page',
      short: `${cur === '¥' ? `¥${Math.round(rate)}` : `${cur}${rate.toFixed(2)}`}/pg`,
      rate,
    };
  }

  const hrs = fallback.hoursPlayed || 0;
  if (hrs <= 0) return null;
  const rate = price / hrs;
  return {
    label: 'Price / hr',
    short: `${cur === '¥' ? `¥${Math.round(rate)}` : `${cur}${rate.toFixed(2)}`}/hr`,
    rate,
  };
}

export interface MediaCollectionBadge {
  ownership?: OwnershipStatus;
  hasAnyOwned: boolean;
  hasAnyWishlist: boolean;
  badgeText: string | null;
  shortTag: string | null;
  formatLabel: string | null;
}

export function getMediaCollectionBadge(
  kind: 'show' | 'movie' | 'read' | 'game',
  item: Show | Movie | ReadItem | GameItem | undefined,
  prog: ShowProgress | MovieProgress | ReadProgress | GameProgress | undefined,
  atomicReadUnits?: Record<string, AtomicReadRecord>
): MediaCollectionBadge {
  if (!item || !prog) {
    return {
      ownership: undefined,
      hasAnyOwned: false,
      hasAnyWishlist: false,
      badgeText: null,
      shortTag: null,
      formatLabel: null,
    };
  }

  const formatLabel = prog.collection?.format?.trim() || null;

  if (kind === 'read' && (item as ReadItem).format === 'comic') {
    const summary = getComicCollectionSummary(
      item as ReadItem,
      prog as ReadProgress,
      atomicReadUnits
    );
    const shortTag =
      summary.badgeText === 'Wishlist' ? 'Want' : summary.badgeText;
    const badgeText = summary.badgeText
      ? formatLabel && !summary.badgeText.includes('owned')
        ? `${summary.badgeText} · ${formatLabel}`
        : summary.badgeText
      : null;
    return {
      ownership: (prog as ReadProgress).ownership,
      hasAnyOwned: summary.hasAnyOwned,
      hasAnyWishlist: summary.hasAnyWishlist,
      badgeText,
      shortTag,
      formatLabel,
    };
  }

  const ownership = prog.ownership;
  const hasAnyOwned = ownership === 'owned';
  const hasAnyWishlist = ownership === 'wishlist';
  const baseText = hasAnyOwned ? 'Owned' : hasAnyWishlist ? 'Wishlist' : null;
  const shortTag = hasAnyOwned ? 'Owned' : hasAnyWishlist ? 'Want' : null;
  const badgeText = baseText
    ? formatLabel
      ? `${baseText} · ${formatLabel}`
      : baseText
    : null;

  return {
    ownership,
    hasAnyOwned,
    hasAnyWishlist,
    badgeText,
    shortTag,
    formatLabel,
  };
}

export interface CollectionLedgerEntry {
  key: string;
  kind: 'show' | 'movie' | 'read' | 'game';
  domain: MediaDomain;
  id: string;
  title: string;
  year?: number;
  posterUrl: string;
  ownership: OwnershipStatus;
  badgeText: string;
  collection: CollectionDetails;
  fallbackMinutes?: number;
  fallbackHours?: number;
  formattedPrice: string | null;
  efficiency: CollectionValueMetric | null;
  sortDate: string;
}

export interface CollectionLedgerSummary {
  ownedEntries: CollectionLedgerEntry[];
  wishlistEntries: CollectionLedgerEntry[];
  ownedCount: number;
  wishlistCount: number;
  freeCount: number;
  totalSpentByCurrency: Array<{ currency: string; amount: number; formatted: string }>;
  primarySpendLabel: string;
  avgPricePerMin: number | null;
  avgPricePerPage: number | null;
  avgPricePerHour: number | null;
  formatCounts: Array<{ format: string; count: number }>;
}

export function computeCollectionLedger(
  state: CueStoreState,
  scope: JournalStatsScope
): CollectionLedgerSummary {
  const entries: CollectionLedgerEntry[] = [];
  const includesWatch = scope === 'all' || scope === 'watch';
  const includesRead = scope === 'all' || scope === 'read';
  const includesPlay = scope === 'all' || scope === 'play';

  if (includesWatch) {
    for (const id of state.showOrder) {
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog) continue;
      const badge = getMediaCollectionBadge('show', show, prog);
      if (!badge.hasAnyOwned && !badge.hasAnyWishlist) continue;
      const ownership: OwnershipStatus = badge.hasAnyOwned ? 'owned' : 'wishlist';
      const fallbackMinutes = Math.max(1, show.totalEpisodes || 1) * (show.runtimeAvg || 42);
      const collection = prog.collection || {};
      entries.push({
        key: `show:${show.id}`,
        kind: 'show',
        domain: 'watch',
        id: show.id,
        title: show.title,
        year: show.year,
        posterUrl: show.posterUrl,
        ownership,
        badgeText: badge.badgeText || (ownership === 'owned' ? 'Owned' : 'Wishlist'),
        collection,
        fallbackMinutes,
        formattedPrice: formatCollectionPrice(collection.price, collection.currency),
        efficiency: computeCollectionValueMetric('watch', collection, { minutes: fallbackMinutes }),
        sortDate: collection.acquiredAt || prog.finishedAt || prog.lastWatchedAt || '',
      });
    }

    for (const id of state.movieOrder) {
      const movie = state.movies[id];
      const prog = state.movieProgress[id];
      if (!movie || !prog) continue;
      const badge = getMediaCollectionBadge('movie', movie, prog);
      if (!badge.hasAnyOwned && !badge.hasAnyWishlist) continue;
      const ownership: OwnershipStatus = badge.hasAnyOwned ? 'owned' : 'wishlist';
      const fallbackMinutes = movie.runtime || 120;
      const collection = prog.collection || {};
      entries.push({
        key: `movie:${movie.id}`,
        kind: 'movie',
        domain: 'watch',
        id: movie.id,
        title: movie.title,
        year: movie.year,
        posterUrl: movie.posterUrl,
        ownership,
        badgeText: badge.badgeText || (ownership === 'owned' ? 'Owned' : 'Wishlist'),
        collection,
        fallbackMinutes,
        formattedPrice: formatCollectionPrice(collection.price, collection.currency),
        efficiency: computeCollectionValueMetric('watch', collection, { minutes: fallbackMinutes }),
        sortDate: collection.acquiredAt || prog.watchedAt || '',
      });
    }
  }

  if (includesRead) {
    for (const id of state.readOrder) {
      const item = state.readItems[id];
      const prog = state.readProgress[id];
      if (!item || !prog) continue;
      const badge = getMediaCollectionBadge('read', item, prog, state.atomicReadUnits);
      if (!badge.hasAnyOwned && !badge.hasAnyWishlist) continue;
      const ownership: OwnershipStatus = badge.hasAnyOwned ? 'owned' : 'wishlist';
      const baseCol = prog.collection || {};
      const collection: CollectionDetails =
        !baseCol.notes && prog.collectionNote
          ? { ...baseCol, notes: prog.collectionNote }
          : baseCol;
      entries.push({
        key: `read:${item.id}`,
        kind: 'read',
        domain: 'read',
        id: item.id,
        title: item.title,
        year: item.year,
        posterUrl: resolveComicEditionCover(item, prog.edition, prog),
        ownership,
        badgeText: badge.badgeText || (ownership === 'owned' ? 'Owned' : 'Wishlist'),
        collection,
        formattedPrice: formatCollectionPrice(collection.price, collection.currency),
        efficiency: computeCollectionValueMetric('read', collection, {}),
        sortDate: collection.acquiredAt || prog.finishedAt || prog.lastReadAt || '',
      });
    }
  }

  if (includesPlay) {
    for (const id of state.gameOrder) {
      const game = state.games[id];
      const prog = state.gameProgress[id];
      if (!game || !prog) continue;
      const badge = getMediaCollectionBadge('game', game, prog);
      if (!badge.hasAnyOwned && !badge.hasAnyWishlist) continue;
      const ownership: OwnershipStatus = badge.hasAnyOwned ? 'owned' : 'wishlist';
      const baseCol = prog.collection || {};
      const collection: CollectionDetails = !baseCol.platform && prog.platform
        ? { ...baseCol, platform: prog.platform }
        : baseCol;
      const fallbackHours = prog.hoursPlayed || 0;
      entries.push({
        key: `game:${game.id}`,
        kind: 'game',
        domain: 'play',
        id: game.id,
        title: game.title,
        year: game.year,
        posterUrl: game.coverUrl,
        ownership,
        badgeText: badge.badgeText || (ownership === 'owned' ? 'Owned' : 'Wishlist'),
        collection,
        fallbackHours,
        formattedPrice: formatCollectionPrice(collection.price, collection.currency),
        efficiency: computeCollectionValueMetric('play', collection, { hoursPlayed: fallbackHours }),
        sortDate: collection.acquiredAt || prog.finishedAt || prog.lastPlayedAt || '',
      });
    }
  }

  entries.sort((a, b) => {
    const dateDiff = b.sortDate.localeCompare(a.sortDate);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });

  const ownedEntries = entries.filter((e) => e.ownership === 'owned');
  const wishlistEntries = entries.filter((e) => e.ownership === 'wishlist');

  const spendByCur = new Map<string, number>();
  let freeCount = 0;
  let totalWatchPrice = 0;
  let totalWatchMins = 0;
  let totalReadPrice = 0;
  let totalReadPages = 0;
  let totalPlayPrice = 0;
  let totalPlayHours = 0;
  const fmtCounts = new Map<string, number>();

  for (const e of ownedEntries) {
    const fmt = e.collection.format?.trim();
    if (fmt) fmtCounts.set(fmt, (fmtCounts.get(fmt) || 0) + 1);

    const p = e.collection.price;
    if (typeof p === 'number' && Number.isFinite(p) && p >= 0) {
      if (p === 0) {
        freeCount += 1;
      } else {
        const cur = e.collection.currency || '$';
        spendByCur.set(cur, (spendByCur.get(cur) || 0) + p);
      }

      if (e.domain === 'watch') {
        const m = e.collection.runtimeMinutes || e.fallbackMinutes || 0;
        if (m > 0) {
          totalWatchPrice += p;
          totalWatchMins += m;
        }
      } else if (e.domain === 'read') {
        const pg = e.collection.pages || 0;
        if (pg > 0) {
          totalReadPrice += p;
          totalReadPages += pg;
        }
      } else if (e.domain === 'play') {
        const hr = e.fallbackHours || 0;
        if (hr > 0) {
          totalPlayPrice += p;
          totalPlayHours += hr;
        }
      }
    }
  }

  const totalSpentByCurrency = [...spendByCur.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => ({
      currency,
      amount,
      formatted: formatExactPrice(amount, currency),
    }));

  const primarySpendLabel =
    totalSpentByCurrency.length > 0
      ? totalSpentByCurrency.map((s) => s.formatted).join(' + ')
      : freeCount > 0
        ? 'Free'
        : '$0.00';

  const formatCounts = [...fmtCounts.entries()]
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => b.count - a.count || a.format.localeCompare(b.format));

  return {
    ownedEntries,
    wishlistEntries,
    ownedCount: ownedEntries.length,
    wishlistCount: wishlistEntries.length,
    freeCount,
    totalSpentByCurrency,
    primarySpendLabel,
    avgPricePerMin: totalWatchMins > 0 ? totalWatchPrice / totalWatchMins : null,
    avgPricePerPage: totalReadPages > 0 ? totalReadPrice / totalReadPages : null,
    avgPricePerHour: totalPlayHours > 0 ? totalPlayPrice / totalPlayHours : null,
    formatCounts,
  };
}
