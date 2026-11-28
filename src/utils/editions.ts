import type { ComicEditionId, ReadItem } from '../types';

export interface ComicEditionOption {
  id: ComicEditionId;
  label: string;
  dcLabel?: string;
  subtitle: string;
}

export const COMIC_EDITIONS: ComicEditionOption[] = [
  {
    id: 'digital',
    label: 'Digital / Issues',
    subtitle: 'Single issues or digital reader',
  },
  {
    id: 'tpb',
    label: 'Standard TPB',
    subtitle: 'Trade paperback collection',
  },
  {
    id: 'compact',
    label: 'Compact Edition TPB',
    dcLabel: 'DC Compact TPB',
    subtitle: 'Pocket-sized softcover',
  },
  {
    id: 'hardcover',
    label: 'Deluxe Hardcover',
    subtitle: 'Oversized hardcover',
  },
  {
    id: 'absolute',
    label: 'Absolute / Omnibus',
    subtitle: 'Collector slipcase or omnibus',
  },
];

const DC_KEYWORDS = [
  'superman',
  'batman',
  'watchmen',
  'wonder woman',
  'justice league',
  'flash',
  'green lantern',
  'sandman',
  'aquaman',
  'teen titans',
  'supergirl',
  'catwoman',
  'far sector',
  'kingdom come',
  'dceased',
  'dc comics',
  'dc compact',
  'grant morrison',
  'geoff johns',
  'joshua williamson',
  'frank miller',
  'alan moore',
];

export const KNOWN_COMIC_EDITION_COUNTS: Record<string, Partial<Record<ComicEditionId, number>>> = {
  'the flash rebirth': { digital: 6, tpb: 6, compact: 13, hardcover: 6, absolute: 13 },
  'flash rebirth': { digital: 6, tpb: 6, compact: 13, hardcover: 6, absolute: 13 },
  'all star superman': { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
  watchmen: { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
  'batman year one': { digital: 4, tpb: 4, compact: 4, hardcover: 4, absolute: 4 },
  'batman hush': { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 15 },
  'batman the court of owls': { digital: 11, tpb: 7, compact: 11, hardcover: 11, absolute: 11 },
  'batman the long halloween': { digital: 13, tpb: 13, compact: 13, hardcover: 13, absolute: 13 },
  'kingdom come': { digital: 4, tpb: 4, compact: 4, hardcover: 4, absolute: 4 },
  'supergirl woman of tomorrow': { digital: 8, tpb: 8, compact: 8, hardcover: 8, absolute: 8 },
  'superman birthright': { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
  'far sector': { digital: 12, tpb: 12, compact: 12, hardcover: 12, absolute: 12 },
  dceased: { digital: 6, tpb: 6, compact: 8, hardcover: 6, absolute: 14 },
  'american vampire': { digital: 11, tpb: 5, compact: 11, hardcover: 11, absolute: 34 },
  'wonder woman earth one': { digital: 3, tpb: 3, compact: 9, hardcover: 9, absolute: 9 },
  'catwoman trail of the catwoman': { digital: 9, tpb: 9, compact: 11, hardcover: 11, absolute: 11 },
  saga: { digital: 72, tpb: 6, compact: 18, hardcover: 18, absolute: 54 },
  invincible: { digital: 144, tpb: 6, compact: 47, hardcover: 13, absolute: 47 },
};

function normalizeEditionLookupKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getKnownComicEditionCounts(
  title: string
): Partial<Record<ComicEditionId, number>> | undefined {
  const norm = normalizeEditionLookupKey(title);
  if (!norm) return undefined;
  if (KNOWN_COMIC_EDITION_COUNTS[norm]) {
    return { ...KNOWN_COMIC_EDITION_COUNTS[norm] };
  }
  const matchedKey = Object.keys(KNOWN_COMIC_EDITION_COUNTS).find(
    (k) => norm === k || norm.startsWith(`${k} `)
  );
  return matchedKey ? { ...KNOWN_COMIC_EDITION_COUNTS[matchedKey] } : undefined;
}

export function resolveComicEditionTotal(
  item: Pick<ReadItem, 'title' | 'totalUnits' | 'baseTotalUnits' | 'editionIssueCounts'>,
  edition?: ComicEditionId
): number {
  if (!edition) return item.totalUnits;
  const fromItem = item.editionIssueCounts?.[edition];
  if (typeof fromItem === 'number' && fromItem > 0) return fromItem;
  const curated = getKnownComicEditionCounts(item.title)?.[edition];
  if (typeof curated === 'number' && curated > 0) return curated;
  return item.baseTotalUnits ?? item.totalUnits;
}

export function isDcComic(item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>): boolean {
  if (!item) return false;
  const hay = `${item.title} ${item.creator} ${item.genres.join(' ')}`.toLowerCase();
  return DC_KEYWORDS.some((kw) => hay.includes(kw));
}

export function getComicEditionLabel(
  edition: ComicEditionId | undefined,
  item?: Pick<ReadItem, 'title' | 'creator' | 'genres'>
): string {
  if (!edition) return '';
  const opt = COMIC_EDITIONS.find((e) => e.id === edition);
  if (!opt) return '';
  if (opt.dcLabel && isDcComic(item)) return opt.dcLabel;
  return opt.label;
}