import type {
  CueStoreState,
  GameItem,
  GamePlatform,
  Movie,
  ReadItem,
  Show,
} from '../types';
import { lookupKnownGameChapters } from './gameChapters';

export type ImportSourceType =
  | 'imdb-ratings'
  | 'imdb-account-export'
  | 'imdb-watchlist'
  | 'imdb-list'
  | 'letterboxd'
  | 'goodreads'
  | 'comic-geeks-csv'
  | 'cue-library-csv'
  | 'trakt-tvtime-json'
  | 'text-finished-log'
  | 'cue-backup'
  | 'unknown';

export type ImportConflictPolicy = 'skip_existing' | 'merge_missing';

export interface ResolvedImdbTitle {
  id: string;
  title: string;
  qid?: string;
  q?: string;
  year?: number;
  posterUrl?: string;
  cast?: string;
}

export interface ImportCandidate {
  tempId: string;
  kind: 'show' | 'movie' | 'read' | 'game';
  domain: 'watch' | 'read' | 'play';
  mediaType: 'tv' | 'anime' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
  title: string;
  year: number;
  externalConst?: string;
  url?: string;
  posterUrl?: string;
  genres: string[];
  creator?: string;
  runtime?: number;
  communityRating?: number;
  userRating?: number; // 1..5 scale
  completed: boolean;
  readStatus?: 'reading' | 'want_to_read' | 'finished';
  totalUnits?: number;
  dateStr?: string;
  extraRuns?: Array<{ finishedAt: string; note?: string; rating?: number }>;
  seasonDates?: Record<number, string>;
  platformHint?: GamePlatform;
  overview?: string;
  needsResolution?: boolean;
  rowNumber?: number;
  existingId?: string;
  existingTitle?: string;
}

export interface SkippedImportRow {
  rowNumber: number;
  title: string;
  reason: string;
}

export interface ParsedImportBatch {
  source: ImportSourceType;
  sourceLabel: string;
  candidates: ImportCandidate[];
  skipped: SkippedImportRow[];
  needsIdResolution?: boolean;
  cueBackupState?: CueStoreState;
  error?: string;
}

export interface PreparedImportEntry {
  candidate: ImportCandidate;
  selected: boolean;
  show?: Show;
  movie?: Movie;
  read?: ReadItem;
  game?: GameItem;
}

export function normalizeImportTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[:/\\\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyImportId(prefix: string, title: string, externalId?: string): string {
  if (externalId) {
    const cleanExt = externalId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanExt) return `${prefix}-${cleanExt}`;
  }
  const base = normalizeImportTitle(title).replace(/\s+/g, '-').slice(0, 48) || 'item';
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${base}-${hash.toString(36).slice(0, 5)}`;
}

/** RFC-4180 compliant CSV parser handling UTF-8 BOM, quoted commas, escaped quotes, and CRLF/LF. */
export function parseCsvRows(input: string): string[][] {
  const clean = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const key = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && map[key] === undefined) {
      map[key] = idx;
    }
  });
  return map;
}

function cell(row: string[], headers: Record<string, number>, ...keys: string[]): string {
  for (const k of keys) {
    const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headers[norm];
    if (idx !== undefined && idx < row.length) {
      return row[idx].trim();
    }
  }
  return '';
}

function parseYear(raw: string, fallback = 2024): number {
  const m = raw.match(/\b(19\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : fallback;
}

function parseRatingTenToFive(raw: string): number | undefined {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.max(1, Math.min(5, Math.round(num / 2)));
}

function parseStarRatingFive(raw: string): number | undefined {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return Math.max(1, Math.min(5, Math.round(num)));
}

const KNOWN_ANIME_HINTS = [
  'anime',
  'attack on titan',
  'demon slayer',
  'one punch man',
  'one-punch man',
  'jujutsu kaisen',
  'chainsaw man',
  'death note',
  'vinland saga',
  'solo leveling',
  'cowboy bebop',
  'fullmetal alchemist',
  'hunter x hunter',
  'mob psycho',
  'naruto',
  'one piece',
  'bleach',
  'frieren',
  'dandadan',
  'steins;gate',
  'neon genesis evangelion',
  'ramparts of ice',
  'spy x family',
  'dragon ball',
];

export function classifyImdbRow(
  rawTitleType: string,
  title: string,
  genres: string[]
): { kind: ImportCandidate['kind']; mediaType: ImportCandidate['mediaType'] } | { skipReason: string } {
  const t = rawTitleType.toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'tvepisode' || t === 'podcastepisode' || t === 'episode') {
    return { skipReason: 'Individual episode row — import parent series instead' };
  }
  if (t === 'podcastseries') {
    return { skipReason: 'Podcast series is not currently tracked' };
  }
  if (t === 'videogame' || t === 'game') {
    return { kind: 'game', mediaType: 'game' };
  }
  if (t === 'tvseries' || t === 'tvminiseries' || t === 'miniseries' || t === 'tvshort' || t === 'tvanimation') {
    const hay = `${title} ${genres.join(' ')}`.toLowerCase();
    const hasAnim = genres.length === 0 || genres.some((g) => g.toLowerCase() === 'animation');
    const looksAnime =
      genres.some((g) => g.toLowerCase() === 'anime') ||
      (hasAnim && KNOWN_ANIME_HINTS.some((kw) => hay.includes(kw)));
    return { kind: 'show', mediaType: looksAnime ? 'anime' : 'tv' };
  }
  if (
    !t ||
    t === 'movie' ||
    t === 'feature' ||
    t === 'tvmovie' ||
    t === 'short' ||
    t === 'video' ||
    t === 'tvspecial'
  ) {
    return { kind: 'movie', mediaType: 'movie' };
  }
  return { skipReason: `Unsupported IMDb title type (${rawTitleType})` };
}

function parseImdbAccountExportCsv(
  rows: string[][],
  headers: Record<string, number>,
  fileName = ''
): ParsedImportBatch {
  const skipped: SkippedImportRow[] = [];
  const byId = new Map<string, ImportCandidate>();
  const hasRatingCol = headers['rating'] !== undefined || headers['yourrating'] !== undefined;
  const isWatchlist = fileName.toLowerCase().includes('watchlist');

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawId = cell(r, headers, 'Title ID', 'Const').toLowerCase();
    if (!rawId) continue;

    if (!/^tt\d{5,12}$/.test(rawId)) {
      skipped.push({
        rowNumber: i + 1,
        title: rawId,
        reason: 'Not a valid IMDb title ID (expected tt...)',
      });
      continue;
    }

    const ratingRaw = cell(r, headers, 'Rating', 'Your Rating');
    const userRating = parseRatingTenToFive(ratingRaw);
    const dateStr = cell(r, headers, 'Last Modified Date', 'Date Rated', 'Created') || undefined;

    const existing = byId.get(rawId);
    if (existing) {
      const existingDate = existing.dateStr || '';
      const nextDate = dateStr || '';
      if (nextDate > existingDate || (!existing.userRating && userRating)) {
        byId.set(rawId, {
          ...existing,
          userRating: userRating ?? existing.userRating,
          dateStr: nextDate || existing.dateStr,
        });
      }
      continue;
    }

    byId.set(rawId, {
      tempId: `imdb-${rawId}`,
      kind: 'movie',
      domain: 'watch',
      mediaType: 'movie',
      title: rawId,
      year: parseYear(dateStr || '', 2024),
      externalConst: rawId,
      url: `https://www.imdb.com/title/${rawId}/`,
      genres: [],
      userRating,
      completed: isWatchlist ? false : Boolean(userRating || hasRatingCol),
      dateStr,
      needsResolution: true,
      rowNumber: i + 1,
    });
  }

  const candidates = Array.from(byId.values()).sort((a, b) =>
    (b.dateStr || '').localeCompare(a.dateStr || '')
  );

  if (candidates.length === 0 && skipped.length === 0) {
    return {
      source: 'unknown',
      sourceLabel: 'IMDb Account Export',
      candidates: [],
      skipped: [],
      error: 'No IMDb Title IDs (tt...) found in this CSV.',
    };
  }

  return {
    source: 'imdb-account-export',
    sourceLabel: 'IMDb Account Export (IDs)',
    candidates,
    skipped,
    needsIdResolution: candidates.length > 0,
  };
}

export function applyResolvedImdbBatch(
  batch: ParsedImportBatch,
  resolvedMap: Record<string, ResolvedImdbTitle | null>
): ParsedImportBatch {
  const nextCandidates: ImportCandidate[] = [];
  const nextSkipped = [...batch.skipped];

  for (const c of batch.candidates) {
    if (!c.needsResolution || !c.externalConst) {
      nextCandidates.push(c);
      continue;
    }

    const id = c.externalConst.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(resolvedMap, id)) {
      nextCandidates.push(c);
      continue;
    }

    const info = resolvedMap[id];
    if (!info || !info.title) {
      nextSkipped.push({
        rowNumber: c.rowNumber || 0,
        title: id,
        reason: 'Title ID not found on IMDb',
      });
      continue;
    }

    const classified = classifyImdbRow(info.qid || info.q || '', info.title, []);
    if ('skipReason' in classified) {
      nextSkipped.push({
        rowNumber: c.rowNumber || 0,
        title: `${info.title} (${id})`,
        reason: classified.skipReason,
      });
      continue;
    }

    nextCandidates.push({
      ...c,
      title: info.title,
      year: info.year || c.year,
      kind: classified.kind,
      domain: classified.kind === 'game' ? 'play' : 'watch',
      mediaType: classified.mediaType,
      posterUrl: info.posterUrl || '',
      creator: info.cast || c.creator,
      genres: [
        classified.mediaType === 'anime'
          ? 'Anime'
          : classified.kind === 'game'
            ? 'Video Game'
            : classified.kind === 'show'
              ? 'Series'
              : 'Feature Film',
      ],
      needsResolution: false,
    });
  }

  const stillPending = nextCandidates.some((c) => Boolean(c.needsResolution));
  return {
    ...batch,
    sourceLabel: stillPending ? 'IMDb Account Export (IDs)' : 'IMDb Account Export',
    candidates: nextCandidates,
    skipped: nextSkipped,
    needsIdResolution: stillPending,
  };
}

function parseImdbCsv(rows: string[][], headers: Record<string, number>, fileName = ''): ParsedImportBatch {
  const hasYourRating = headers['yourrating'] !== undefined || headers['daterated'] !== undefined;
  const isWatchlistFile = fileName.toLowerCase().includes('watchlist');
  const hasPosition = headers['position'] !== undefined;
  const source: ImportSourceType = hasYourRating
    ? 'imdb-ratings'
    : isWatchlistFile
      ? 'imdb-watchlist'
      : hasPosition
        ? 'imdb-list'
        : 'imdb-watchlist';
  const sourceLabel =
    source === 'imdb-ratings'
      ? 'IMDb Ratings CSV'
      : source === 'imdb-list'
        ? 'IMDb List CSV'
        : 'IMDb Watchlist CSV';

  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, headers, 'Title', 'Original Title');
    if (!title) continue;

    const rawType = cell(r, headers, 'Title Type');
    const genresRaw = cell(r, headers, 'Genres');
    const genres = genresRaw
      ? genresRaw.split(',').map((g) => g.trim()).filter(Boolean)
      : [];

    const classified = classifyImdbRow(rawType, title, genres);
    if ('skipReason' in classified) {
      skipped.push({ rowNumber: i + 1, title, reason: classified.skipReason });
      continue;
    }

    const imdbId = cell(r, headers, 'Const');
    const dedupeKey = imdbId || `${classified.kind}:${normalizeImportTitle(title)}`;
    if (seen.has(dedupeKey)) {
      skipped.push({ rowNumber: i + 1, title, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(dedupeKey);

    const yourRating = parseRatingTenToFive(cell(r, headers, 'Your Rating'));
    const dateRated = cell(r, headers, 'Date Rated');
    const imdbRating = Number(cell(r, headers, 'IMDb Rating')) || undefined;
    const runtime = Number(cell(r, headers, 'Runtime (mins)')) || undefined;
    const year = parseYear(cell(r, headers, 'Year', 'Release Date'));
    const directors = cell(r, headers, 'Directors');
    const desc = cell(r, headers, 'Description');

    const completed = Boolean(yourRating || dateRated || (hasYourRating && !isWatchlistFile));
    const domain = classified.kind === 'game' ? 'play' : 'watch';

    candidates.push({
      tempId: imdbId ? `imdb-${imdbId}` : `imp-${i}-${normalizeImportTitle(title).slice(0, 16)}`,
      kind: classified.kind,
      domain,
      mediaType: classified.mediaType,
      title,
      year,
      externalConst: imdbId || undefined,
      url: cell(r, headers, 'URL') || undefined,
      genres: genres.length > 0 ? genres.slice(0, 3) : [classified.kind === 'game' ? 'Video Game' : 'Drama'],
      creator: directors || undefined,
      runtime,
      communityRating: imdbRating,
      userRating: yourRating,
      completed,
      dateStr: dateRated || cell(r, headers, 'Release Date', 'Created') || undefined,
      overview: desc || undefined,
    });
  }

  return { source, sourceLabel, candidates, skipped };
}

function parseLetterboxdCsv(rows: string[][], headers: Record<string, number>, fileName = ''): ParsedImportBatch {
  const isWatchlist = fileName.toLowerCase().includes('watchlist');
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, headers, 'Name', 'Title');
    if (!title) continue;
    const year = parseYear(cell(r, headers, 'Year'));
    const key = `${normalizeImportTitle(title)}::${year}`;
    if (seen.has(key)) {
      skipped.push({ rowNumber: i + 1, title, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(key);

    const rating = parseStarRatingFive(cell(r, headers, 'Rating'));
    const watchedDate = cell(r, headers, 'Watched Date', 'Date');
    const completed = !isWatchlist && (Boolean(rating || watchedDate) || !fileName.toLowerCase().includes('watchlist'));

    candidates.push({
      tempId: `lb-${i}-${normalizeImportTitle(title).slice(0, 16)}`,
      kind: 'movie',
      domain: 'watch',
      mediaType: 'movie',
      title,
      year,
      url: cell(r, headers, 'Letterboxd URI', 'URL') || undefined,
      genres: ['Feature Film'],
      userRating: rating,
      completed,
      dateStr: watchedDate || undefined,
    });
  }

  return {
    source: 'letterboxd',
    sourceLabel: 'Letterboxd CSV',
    candidates,
    skipped,
  };
}

const MANGA_PUBLISHERS = [
  'viz',
  'shueisha',
  '集英社',
  'kodansha',
  '講談社',
  'shogakukan',
  '小学館',
  'yen press',
  'seven seas',
  'square enix',
  'tokyopop',
  'del rey manga',
  'dark horse manga',
  'panini manga',
  'sublime',
  'denpa',
  'udon',
  'hakusensha',
  '白泉社',
  'kadokawa',
  '角川',
  'akita shoten',
  '秋田書店',
  'futabasha',
  'one peace books',
  'ghost ship',
  'vertical comics',
  'glenat',
  'kurokawa',
];

const MANGA_SERIES_AND_CREATORS = [
  'dragon ball',
  'one piece',
  'naruto',
  'boruto',
  'bleach',
  'berserk',
  'vagabond',
  'vinland saga',
  'chainsaw man',
  'jujutsu kaisen',
  'demon slayer',
  'attack on titan',
  'my hero academia',
  'death note',
  'hunter x hunter',
  'fullmetal alchemist',
  'tokyo ghoul',
  '20th century boys',
  'akira',
  'one-punch man',
  'one punch man',
  'frieren',
  'dandadan',
  'spy x family',
  'solo leveling',
  'slam dunk',
  'haikyu',
  'blue lock',
  'sakamoto days',
  'kagurabachi',
  'jojo',
  'mob psycho',
  'neon genesis evangelion',
  'sailor moon',
  'akira toriyama',
  'eiichiro oda',
  'kentaro miura',
  'naoki urasawa',
  'takehiko inoue',
  'tatsuki fujimoto',
  'gege akutami',
  'hajime isayama',
  'masashi kishimoto',
  'tite kubo',
  'hiromu arakawa',
  'junji ito',
  'katsuhiro otomo',
  'kohei horikoshi',
  'koyoharu gotouge',
  'toyotaro',
];

const COMIC_PUBLISHERS = [
  'marvel',
  'dc comics',
  'dc black label',
  'vertigo',
  'wildstorm',
  'image comics',
  'dark horse',
  'idw',
  'boom! studios',
  'boom studios',
  'valiant',
  'dynamite',
  'oni press',
  'archie',
  'titan comics',
  'top cow',
  'skybound',
  'aftershock',
  'fantagraphics',
  'drawn & quarterly',
  'first second',
  'humanoids',
  'zenescope',
  'panini',
  '2000 ad',
  'rebellion',
  'black mask',
  'awa studios',
  'dstlry',
  'mad cave',
  'ghost machine',
  'icon comics',
  'max comics',
  'milestone',
  'young animal',
  'avatar press',
  'crossgen',
  'vault comics',
  'scout comics',
  'bad idea',
  'magnetic press',
  'abrams comicarts',
];

const COMIC_FRANCHISE_KEYWORDS = [
  'avengers',
  'x-men',
  'uncanny x',
  'astonishing x',
  'new x-men',
  'all-new x',
  'house of x',
  'powers of x',
  'x-force',
  'x-factor',
  'wolverine',
  'spider-man',
  'spiderman',
  'spider-gwen',
  'spider-verse',
  'venom',
  'carnage',
  'daredevil',
  'punisher',
  'hawkeye',
  'hulk',
  'she-hulk',
  'skaar',
  'iron man',
  'captain america',
  'thor:',
  'the mighty thor',
  'loki:',
  'fantastic four',
  'silver surfer',
  'doctor strange',
  'black panther',
  'black widow',
  'moon knight',
  'deadpool',
  'ant-man',
  'guardians of the galaxy',
  'ms. marvel',
  'captain marvel',
  'jessica jones',
  'luke cage',
  'iron fist',
  'ghost rider',
  'scarlet witch',
  'eternals',
  'inhumans',
  'runaways',
  'young avengers',
  'thunderbolts',
  'secret wars',
  'civil war',
  'infinity gauntlet',
  'infinity war',
  'dark reign',
  'annihilation',
  'house of m',
  'planet hulk',
  'world war hulk',
  'old man logan',
  'patsy walker',
  'hellcat',
  'gwenpool',
  'miles morales',
  'batman',
  'superman',
  'wonder woman',
  'justice league',
  'green lantern',
  'the flash',
  'flash:',
  'aquaman',
  'nightwing',
  'batgirl',
  'batwoman',
  'supergirl',
  'teen titans',
  'suicide squad',
  'harley quinn',
  'joker',
  'catwoman',
  'green arrow',
  'hellblazer',
  'swamp thing',
  'watchmen',
  'injustice',
  'kingdom come',
  'crisis on infinite earths',
  'final crisis',
  'infinite crisis',
  'dark nights',
  'flashpoint',
  'blackest night',
  'all-star superman',
  'doom patrol',
  'transmetropolitan',
  'preacher',
  'fables',
  'y: the last man',
  'invincible',
  'walking dead',
  'monstress',
  'spawn',
  'hellboy',
  'sin city',
  'scott pilgrim',
  'east of west',
  'descender',
  'paper girls',
  'black science',
  'deadly class',
  'something is killing the children',
  'power rangers',
  'mighty morphin',
  'teenage mutant ninja turtles',
  'tmnt',
  'grimm fairy tales',
  'hack/slash',
  'kick-ass',
  'the boys',
  'umbrella academy',
  'locke & key',
  'dark phoenix',
  'days of future past',
  'winter soldier',
  'galactus',
  'thanos',
  'ultron',
  'doctor doom',
  'magneto',
  'elektra',
  'ultimates',
  'ultimate spider',
  'ultimate x-men',
  'marvels',
  'marvel 1602',
  'marvel zombies',
];

const COMIC_CREATORS = [
  'jonathan hickman',
  'matt fraction',
  'brian michael bendis',
  'ed brubaker',
  'chris claremont',
  'al ewing',
  'mark millar',
  'jeph loeb',
  'tom king',
  'tom taylor',
  'peter j. tomasi',
  'greg pak',
  'jeff parker',
  'paul jenkins',
  'jed mackay',
  'kathryn immonen',
  'stuart immonen',
  'marjorie m. liu',
  'marjorie liu',
  'tini howard',
  'kyle higgins',
  'melissa flores',
  'joe brusha',
  'geoff johns',
  'grant morrison',
  'scott snyder',
  'alan moore',
  'frank miller',
  'robert kirkman',
  'brian k. vaughan',
  'chip zdarsky',
  'donny cates',
  'garth ennis',
  'warren ellis',
  'mark waid',
  'jason aaron',
  'kieron gillen',
  'kelly thompson',
  'dan slott',
  'stan lee',
  'jack kirby',
  'jim starlin',
  'walt simonson',
  'peter david',
  'kurt busiek',
  'alex ross',
  'jim lee',
  'todd mcfarlane',
  'mike mignola',
  'jeff lemire',
  'rick remender',
  'joshua williamson',
  'james tynion',
  'ram v',
  'gail simone',
  'kelly sue deconnick',
  'g. willow wilson',
  'saladin ahmed',
  'charles soule',
  'nick spencer',
  'gerry duggan',
  'benjamin percy',
  'ryan north',
  'daniel warren johnson',
  'sean murphy',
  'greg rucka',
  'paul dini',
  "dennis o'neil",
  'marv wolfman',
  'george perez',
  'john byrne',
  'roy thomas',
  'roger stern',
  'j.m. dematteis',
  'david michelinie',
  'fabian nicieza',
  'joe kelly',
  'zeb wells',
  'christopher priest',
  'cullen bunn',
  'dennis hopeless',
  'eve l. ewing',
  'declan shalvey',
  'si spurrier',
  'mike carey',
  'craig kyle',
  'christopher yost',
  'darwyn cooke',
  'tim sale',
  'david aja',
  'steve mcniven',
  'esad ribic',
  'pepe larraz',
  'ryan stegman',
];

function normalizeFoldLower(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCleanIsbn(raw: string): string {
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (cleaned.length === 13 || cleaned.length === 10) return cleaned;
  return '';
}

export function classifyReadFormat(input: {
  title: string;
  author?: string;
  additionalAuthors?: string;
  publisher?: string;
  binding?: string;
  bookshelves?: string;
  exclusiveShelf?: string;
  genres?: string[];
}): 'comic' | 'manga' | 'novel' {
  const titleNorm = normalizeFoldLower(input.title || '');
  const titleNoParens = titleNorm.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const pubNorm = normalizeFoldLower(input.publisher || '');
  const creatorNorm = normalizeFoldLower(
    [input.author, input.additionalAuthors].filter(Boolean).join(' ')
  );
  const shelfAndBind = normalizeFoldLower(
    [input.bookshelves, input.exclusiveShelf, input.binding, ...(input.genres || [])]
      .filter(Boolean)
      .join(' ')
  );

  // 1. Explicit shelf / binding / genre tags
  if (/\b(manga|tankobon|manhwa|manhua|shonen|seinen|shojo|shoujo|webtoon)\b/.test(shelfAndBind)) {
    return 'manga';
  }
  if (
    /\b(comics?|graphic[\s-]?novels?|trade paperback|tpb|floppies|bande dessinee)\b/.test(
      shelfAndBind
    )
  ) {
    return 'comic';
  }

  // 2. Manga publishers, Japanese script titles, or known manga series/mangaka
  const hasCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(
    `${input.title || ''} ${input.publisher || ''} ${input.author || ''}`
  );
  if (
    hasCjk ||
    MANGA_PUBLISHERS.some((p) => pubNorm.includes(p)) ||
    /\bmanga\b/.test(pubNorm) ||
    MANGA_SERIES_AND_CREATORS.some((k) => titleNorm.includes(k) || creatorNorm.includes(k))
  ) {
    return 'manga';
  }

  // 3. Comic publishers
  const isExactDcOrImagePub = pubNorm === 'dc' || pubNorm === 'image' || /\bdc\s+comics?\b/.test(pubNorm);
  if (
    isExactDcOrImagePub ||
    COMIC_PUBLISHERS.some((p) => pubNorm.includes(p)) ||
    /\bcomics?\b/.test(pubNorm)
  ) {
    return 'comic';
  }

  // 4. Comic single-issue numbering outside parens (e.g. "Superman: Rebirth (2016) #1")
  if (/(?:^|\s)#\d{1,4}\b/.test(titleNoParens)) {
    return 'comic';
  }

  // 5. Collected comic format keywords, comic franchises, or curated comic-only writers
  if (
    /\b(omnibus|complete collection|epic collection|masterworks|dc compact|absolute edition|trade paperback|tpb|graphic novel)\b/.test(
      titleNorm
    ) ||
    COMIC_FRANCHISE_KEYWORDS.some((kw) => titleNorm.includes(kw)) ||
    COMIC_CREATORS.some((cr) => creatorNorm.includes(cr))
  ) {
    return 'comic';
  }

  return 'novel';
}

function parseGoodreadsCsv(rows: string[][], headers: Record<string, number>): ParsedImportBatch {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawTitle = cell(r, headers, 'Title');
    if (!rawTitle) continue;
    const cleanTitle = rawTitle.replace(/\s*\([^)]*#\d+[^)]*\)\s*$/, '').trim() || rawTitle;
    const key = normalizeImportTitle(cleanTitle);
    if (seen.has(key)) {
      skipped.push({ rowNumber: i + 1, title: cleanTitle, reason: 'Duplicate row inside CSV' });
      continue;
    }
    seen.add(key);

    const author = cell(r, headers, 'Author', 'Author l-f').replace(/\s+/g, ' ').trim();
    const additionalAuthors = cell(r, headers, 'Additional Authors').replace(/\s+/g, ' ').trim();
    const publisher = cell(r, headers, 'Publisher');
    const exclusiveShelf = cell(r, headers, 'Exclusive Shelf').toLowerCase();
    const bookshelves = cell(r, headers, 'Bookshelves', 'Bookshelves with positions').toLowerCase();
    const binding = cell(r, headers, 'Binding');
    const isbn =
      extractCleanIsbn(cell(r, headers, 'ISBN13')) || extractCleanIsbn(cell(r, headers, 'ISBN'));
    const pages = Number(cell(r, headers, 'Number of Pages')) || 320;
    const year = parseYear(cell(r, headers, 'Original Publication Year', 'Year Published'));
    const myRating = parseStarRatingFive(cell(r, headers, 'My Rating'));

    const shelfState = exclusiveShelf || bookshelves;
    const readStatus: ImportCandidate['readStatus'] = shelfState.includes('currently')
      ? 'reading'
      : shelfState === 'read' || /\bread\b/.test(exclusiveShelf)
        ? 'finished'
        : 'want_to_read';

    const mediaType = classifyReadFormat({
      title: rawTitle,
      author,
      additionalAuthors,
      publisher,
      binding,
      bookshelves,
      exclusiveShelf,
    });

    const totalUnits =
      mediaType === 'comic'
        ? Math.max(4, Math.min(80, Math.round(pages / 24)))
        : mediaType === 'manga'
          ? Math.max(6, Math.min(120, Math.round(pages / 18)))
          : Math.max(8, Math.min(120, Math.round(pages / 14)));

    candidates.push({
      tempId: `gr-${i}-${key.slice(0, 16)}`,
      kind: 'read',
      domain: 'read',
      mediaType,
      title: cleanTitle,
      year,
      externalConst: isbn || undefined,
      posterUrl: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : undefined,
      genres: [mediaType === 'comic' ? 'Comics' : mediaType === 'manga' ? 'Manga' : 'Fiction'],
      creator: author || 'Author',
      userRating: myRating,
      completed: readStatus === 'finished',
      readStatus,
      totalUnits,
      dateStr: cell(r, headers, 'Date Read', 'Date Added') || undefined,
      overview: publisher ? `${cleanTitle} · Published by ${publisher}.` : undefined,
    });
  }

  return {
    source: 'goodreads',
    sourceLabel: 'Goodreads Library CSV',
    candidates,
    skipped,
  };
}

function parseJsonImport(rawText: string): ParsedImportBatch {
  const parsed = JSON.parse(rawText);

  if (parsed?.app === 'cue' && parsed?.state?.shows && parsed?.state?.readItems) {
    const s = parsed.state as CueStoreState;
    const preview: ImportCandidate[] = [
      ...(s.showOrder || []).slice(0, 50).map((id) => ({
        tempId: `bak-s-${id}`,
        kind: 'show' as const,
        domain: 'watch' as const,
        mediaType: s.shows[id]?.mediaType || ('tv' as const),
        title: s.shows[id]?.title || id,
        year: s.shows[id]?.year || 2024,
        genres: s.shows[id]?.genres || [],
        completed: s.showProgress[id]?.status === 'finished',
      })),
    ];
    return {
      source: 'cue-backup',
      sourceLabel: 'Cue Backup JSON',
      candidates: preview,
      skipped: [],
      cueBackupState: s,
    };
  }

  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;

    const showObj =
      obj.show && typeof obj.show === 'object' ? (obj.show as Record<string, unknown>) : null;
    const movieObj =
      obj.movie && typeof obj.movie === 'object' ? (obj.movie as Record<string, unknown>) : null;

    const showTitle =
      (typeof obj.series_name === 'string' && obj.series_name) ||
      (typeof obj.show_title === 'string' && obj.show_title) ||
      (showObj && typeof showObj.title === 'string' ? showObj.title : '');
    const movieTitle =
      (typeof obj.movie_title === 'string' && obj.movie_title) ||
      (movieObj && typeof movieObj.title === 'string' ? movieObj.title : '');

    if (showTitle) {
      const k = `show:${normalizeImportTitle(showTitle)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const yearVal = Number(showObj?.year || obj.year) || 2024;
        candidates.push({
          tempId: `json-s-${candidates.length}`,
          kind: 'show',
          domain: 'watch',
          mediaType: 'tv',
          title: showTitle,
          year: yearVal,
          genres: ['Series'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.completed || obj.last_watched_at),
        });
      }
      return;
    }

    if (movieTitle) {
      const k = `movie:${normalizeImportTitle(movieTitle)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const yearVal = Number(movieObj?.year || obj.year) || 2024;
        candidates.push({
          tempId: `json-m-${candidates.length}`,
          kind: 'movie',
          domain: 'watch',
          mediaType: 'movie',
          title: movieTitle,
          year: yearVal,
          genres: ['Feature Film'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.watched_at || obj.plays),
        });
      }
      return;
    }

    if (typeof obj.title === 'string' && obj.title.trim()) {
      const k = `movie:${normalizeImportTitle(obj.title)}`;
      if (!seen.has(k)) {
        seen.add(k);
        const isShow = String(obj.type || obj.media_type || '').toLowerCase().includes('show');
        candidates.push({
          tempId: `json-g-${candidates.length}`,
          kind: isShow ? 'show' : 'movie',
          domain: 'watch',
          mediaType: isShow ? 'tv' : 'movie',
          title: obj.title.trim(),
          year: Number(obj.year) || 2024,
          genres: [isShow ? 'Series' : 'Feature Film'],
          userRating: parseRatingTenToFive(String(obj.rating || '')),
          completed: Boolean(obj.watched || obj.watched_at),
        });
      }
      return;
    }

    Object.values(obj).forEach(visit);
  };

  visit(parsed);

  if (candidates.length === 0) {
    return {
      source: 'unknown',
      sourceLabel: 'JSON Archive',
      candidates: [],
      skipped,
      error: 'No recognizable show, movie, or Cue backup entries found in this JSON file.',
    };
  }

  return {
    source: 'trakt-tvtime-json',
    sourceLabel: 'Trakt / TV Time JSON',
    candidates,
    skipped,
  };
}

const MONTH_INDEX_BY_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const GCAL_HEADER_RE =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4}),\s+(mon|tue|wed|thu|fri|sat|sun)$/i;

const GENERIC_DATE_LINE_RE =
  /^(?:(\d{4}-\d{2}-\d{2})|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}))\s*(?:[-–—:|]|•)?\s+(.+)$/i;

const COMPANION_BLOCKLIST = new Set([
  'you',
  'me',
  'us',
  'him',
  'her',
  'them',
  'superman',
  'dignity',
  'god',
  'cheats',
  'all',
  'every',
  'fire',
  'love',
  'death',
  'wolves',
  'dragons',
  'monsters',
  'giants',
  'my',
  'your',
  'the',
]);

const TEXT_LOG_SHOW_HINTS = [
  'the boys',
  'star trek',
  'star wars: visions',
  'dark',
  'stranger things',
  'walking dead',
  'daryl dixon',
  'the bear',
  'reacher',
  'ted lasso',
  'peacemaker',
  'fallout',
  'daredevil',
  'the pitt',
  'lincoln lawyer',
  'only murders',
  'love death & robots',
  'love, death & robots',
  'agatha all along',
  'creature commandos',
  'lanterns',
  'spider-noir',
  'visionquest',
  'knight of the seven kingdoms',
  'alien: earth',
  'secret level',
  'caped crusader',
  'my adventures with superman',
  "x-men '97",
  'mandalorian',
  'wandavision',
  'loki',
  'arcane',
  'invincible',
  'severance',
  'succession',
  'andor',
  'brooklyn nine-nine',
  'parks and recreation',
  'modern family',
  'new girl',
  'community',
  'defending jacob',
  'umbrella academy',
  'queen\'s gambit',
  'falcon and the winter soldier',
  'life in pieces',
  'ultimate spider-man',
  'bad batch',
  'nine perfect strangers',
  'hawkeye',
  'book of boba fett',
  'mare of easttown',
  'moon knight',
  'obi-wan kenobi',
  'ms. marvel',
  'sherlock',
  'legend of vox machina',
  'under the banner of heaven',
  'the old man',
  'black bird',
  'gravity falls',
  'over the garden wall',
  'she-hulk',
  'rings of power',
  'the crown',
  'tales of the jedi',
  'chernobyl',
  'tulsa king',
  'wednesday',
  'house of the dragon',
  'big little lies',
  'mayfair witches',
  'silo',
  'black mirror',
  'secret invasion',
  'ahsoka',
  'pokemon sun and moon',
  'avengers assemble',
  'harley quinn',
  'martin mystery',
  'transformers: war for cybertron',
  'transformers: war for cybertron trilogy',
  'sean combs',
  'the boroughs',
  "widow's bay",
  'solos',
  'atlanta',
];

const TEXT_LOG_ANIME_HINTS = [
  ...KNOWN_ANIME_HINTS,
  'fire force',
  'my hero academia',
  'dr. stone',
  'dr stone',
  'kaiju no. 8',
  'kaiju no 8',
  'oshino ko',
  'oshi no ko',
  'mushoku tensei',
  'gachiakuta',
  'witch hat atelier',
  'takopi',
  'fragrant flower',
  'smoking behind the supermarket',
  'tales of wedding rings',
  'you and i are polar opposites',
  'cells at work',
  'castlevania',
  'promised neverland',
  'fate/stay night',
  'fruits basket',
  'god of high school',
  're:zero',
  'deca-dence',
  'haikyu',
  'higurashi',
  'made in abyss',
  'kaguya-sama',
  'redo of healer',
  'way of the househusband',
  'yu-gi-oh',
  'tokyo revengers',
  'jojo',
  'devil is a part-timer',
  'ranking of kings',
  'cyberpunk: edgerunners',
  'sailor moon',
  'spy × family',
  'summer time rendering',
  'eminence in shadow',
  'tiger & bunny',
  'odd taxi',
  'gintama',
  'misfit of demon king academy',
  'uncle from another world',
  'magical revolution',
  'revenger',
  'farming life in another world',
  'handyman saitou',
  'blue lock',
  'campfire cooking',
  'strongest exorcist',
  'arknights',
  'tengoku daimakyo',
  'edens zero',
  'atelier ryza',
  'bastard!!',
  'gundam',
  'tower of god',
  'chillin',
  'to your eternity',
  'infinite darkness',
  'orange',
  'hidden dungeon',
];

const TEXT_LOG_GAME_HINTS = [
  'resident evil',
  'uncharted',
  'kingdom hearts',
  'mortal kombat',
  'sekiro',
  'death stranding',
  'devil may cry',
  'ghost of tsushima',
  'spider-man remastered',
  "marvel's spider-man",
  'miles morales',
  'control',
  'god of war',
  'final fantasy vii remake',
  'final fantasy xv',
  'star wars jedi',
  'injustice 2',
  'code vein',
  'one piece: pirate warriors',
  'gotham knights',
  'evil within',
  'callisto protocol',
  'telltale series',
  'batman: the enemy within',
  'walking dead: the final season',
  'man of medan',
  'lego marvel super heroes',
  'halo:',
  'halo 2',
  'halo 3',
  'halo 4',
  'nioh',
  'god eater',
  'zenless zone zero',
  'onimusha',
  'marvel cosmic invasion',
  'pokemon soulsilver',
  'monster hunter',
  'fire emblem',
];

export function normalizeImportDateIso(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatHumanDateLabel(ymd?: string): string {
  if (!ymd) return '';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1] || m[2]} ${Number(m[3])}, ${m[1]}`;
}

function isVenueOrAddressLine(line: string): boolean {
  if (/^[\p{Extended_Pictographic}]/u.test(line)) return false;
  if (/^(?:fully\s+)?(?:finished|rewatched|watched|reread|replayed|completed|played|beat|read)\b/i.test(line)) {
    return false;
  }
  return (
    /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/.test(line) ||
    /,\s*ON\b/i.test(line) ||
    /,\s*Canada\s*$/i.test(line) ||
    /^\d+\s+[A-Z][\w\s]+,\s*[A-Z]/.test(line) ||
    /\b(?:Landmark|Cineplex|AMC|Regal)\s+Cinemas?\b/i.test(line)
  );
}

interface ParsedTextLogOccurrence {
  rowNumber: number;
  kind: ImportCandidate['kind'];
  domain: ImportCandidate['domain'];
  mediaType: ImportCandidate['mediaType'];
  title: string;
  year: number;
  explicitYear?: number;
  creator?: string;
  userRating?: number;
  dateYmd?: string;
  seasonNum?: number;
  notes: string[];
  platformHint?: GamePlatform;
  genreHints: string[];
  rawLine: string;
}

function extractTrailingCompanions(input: string): { title: string; companions?: string } {
  const m = input.match(
    /^(.*?)\s+\bwith\s+([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)*(?:\s*,?\s*(?:and|&)\s+[A-Z][a-z]+)?)\s*$/
  );
  if (!m) return { title: input };
  const names = m[2]
    .split(/,|\band\b|&/i)
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (names.length === 0 || names.some((n) => COMPANION_BLOCKLIST.has(n))) {
    return { title: input };
  }
  return { title: m[1].trim(), companions: `with ${m[2].trim()}` };
}

function parseFinishedLogLine(
  rawLine: string,
  rowNumber: number,
  dateYmd?: string
): ParsedTextLogOccurrence | null {
  let text = rawLine.trim().replace(/^[-*•]\s+/, '').trim();
  if (!text) return null;

  const notes: string[] = [];

  // 1. Inline star ratings (⭐)
  const stars = text.match(/⭐/g);
  const userRating = stars ? Math.max(1, Math.min(5, stars.length)) : undefined;
  text = text.replace(/⭐[\uFE0F]*/g, '').replace(/\s+/g, ' ').trim();

  // 2. Leading emoji domain hints
  let emojiHint: 'show' | 'movie' | 'game' | 'read' | undefined;
  let forceReadNovel = false;
  let forceReadComic = false;

  const leadingEmojis: string[] = [];
  while (true) {
    const em = text.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}][\uFE0F\u200D]*)\s*/u);
    if (!em) break;
    leadingEmojis.push(em[1].replace(/[\uFE0F\u200D]/g, ''));
    text = text.slice(em[0].length).trim();
  }
  for (const e of leadingEmojis) {
    if (e === '📺') emojiHint = 'show';
    else if (e === '🎬') emojiHint = 'movie';
    else if (e === '🍿') {
      emojiHint = 'movie';
      notes.push('Theater');
    } else if (e === '🎮' || e === '🕹') emojiHint = 'game';
    else if (e === '📖') emojiHint = 'read';
    else if (e === '📱') {
      emojiHint = 'read';
      forceReadComic = true;
      notes.push('Digital');
    } else if (e === '🤖' || e === '🎧') {
      emojiHint = 'read';
      forceReadNovel = true;
      notes.push('Audiobook');
    }
  }

  // 3. Action verb prefix
  let verbRead = false;
  let verbWatch = false;
  const verbMatch = text.match(
    /^(?:(Fully\s+Finished|Finished\s+Reading|Finished\s+Watching|Finished\s+Playing|Finished|Rewatched|Reread|Replayed|Completed|Watched|Played|Beat|Read)\s+)/i
  );
  if (verbMatch) {
    const v = verbMatch[1].toLowerCase();
    if (v.includes('reading') || v === 'reread' || v === 'read') verbRead = true;
    if (v === 'rewatched' || v.includes('watching')) {
      verbWatch = true;
      if (v === 'rewatched') notes.push('Rewatch');
    }
    text = text.slice(verbMatch[0].length).trim();
  }

  if (!text) return null;

  // 4. Trailing parenthetical note like "(Up To Season 4)" or "(with Cheats)" before companion check
  text = text.replace(/\s+\((Up\s+To\s+Season\s+\d+|Day\s+\d+\/\d+|with\s+Cheats)\)\s*$/i, (_m, q) => {
    notes.push(q.trim());
    return '';
  });
  text = text.replace(/\s+\((with\s+Cheats)\)/i, (_m, q) => {
    notes.push(q.trim());
    return '';
  });

  // 5. Trailing companion names ("with Mazra, Adeel and Aliza")
  const comp = extractTrailingCompanions(text);
  text = comp.title;
  if (comp.companions) notes.push(comp.companions);

  // Check trailing note again if companion was after it (e.g. "Community with Mazra (Up To Season 4)")
  text = text.replace(/\s+\((Up\s+To\s+Season\s+\d+|Day\s+\d+\/\d+|with\s+Cheats)\)\s*$/i, (_m, q) => {
    notes.push(q.trim());
    return '';
  });

  // 6. Explicit inline media qualifiers
  let explicitTagKind: ImportCandidate['kind'] | undefined;
  let platformHint: GamePlatform | undefined;

  if (/\(audiobook\)/i.test(text)) {
    explicitTagKind = 'read';
    forceReadNovel = true;
    notes.push('Audiobook');
    text = text.replace(/\s*\(audiobook\)/gi, '').trim();
  }
  const tvTagMatch = text.match(/\((?:(\d{4})\s+)?(?:TV\s+series|miniseries)\)/i);
  let explicitYearFromTag: number | undefined;
  if (tvTagMatch) {
    explicitTagKind = 'show';
    if (tvTagMatch[1]) explicitYearFromTag = Number(tvTagMatch[1]);
    text = text.replace(/\s*\((?:\d{4}\s+)?(?:TV\s+series|miniseries)\)/gi, '').trim();
  }
  if (/\(video\s+game\)/i.test(text)) {
    explicitTagKind = 'game';
    text = text.replace(/\s*\(video\s+game\)/gi, '').trim();
  }
  if (/\(film\s+series\)/i.test(text)) {
    explicitTagKind = 'movie';
    notes.push('Film series');
    text = text.replace(/\s*\(film\s+series\)/gi, '').trim();
  }

  // Platform / run qualifiers
  const runQualifiers: Array<[RegExp, string, GamePlatform?]> = [
    [/\s*\(PC\)\s*/i, 'PC', 'PC'],
    [/\s*\(PS5([^)]*)\)\s*/i, 'PS5', 'PS5'],
    [/\s*\(PS4([^)]*)\)\s*/i, 'PS4', 'PS5'],
    [/\s*\(Switch\)\s*/i, 'Switch', 'Switch'],
    [/\s*\(Xbox[^)]*\)\s*/i, 'Xbox', 'Xbox'],
    [/\s*\(GameCube\)\s*/i, 'GameCube'],
    [/\s+on\s+(PS5|PS4|Switch|PC|Xbox)\b/i, '$1'],
    [/\s*\((base\s+game|mid-game|version\s+[\d.]+)\)\s*/i, '$1'],
    [/\s*\[(1st\s+run|2nd\s+run|\d+(?:st|nd|rd|th)\s+run)\]\s*/i, '$1'],
    [/\s*\((finale|DiC\s+dub)\)\s*/i, '$1'],
  ];
  for (const [re, label, plat] of runQualifiers) {
    const m = text.match(re);
    if (m) {
      const resolvedLabel = label === '$1' ? m[1] : label;
      notes.push(resolvedLabel);
      if (plat && !platformHint) platformHint = plat;
      else if (/\bPS5\b/i.test(m[1] || '')) platformHint = 'PS5';
      else if (/\bPC\b/i.test(m[1] || '')) platformHint = 'PC';
      else if (/\bSwitch\b/i.test(m[1] || '')) platformHint = 'Switch';
      else if (/\bXbox\b/i.test(m[1] || '')) platformHint = 'Xbox';
      if (plat || /\bon\s+(?:PS5|PS4|Switch|PC|Xbox)\b|\b(?:1st|2nd)\s+run\b|\bbase game\b|\bmid-game\b|\bGameCube\b/i.test(m[0])) {
        if (!explicitTagKind && !emojiHint) explicitTagKind = 'game';
      }
      text = text.replace(re, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (/\bNew\s+Game\s+Plus\b/i.test(text)) {
    notes.push('New Game Plus');
    if (!explicitTagKind && !emojiHint) explicitTagKind = 'game';
    text = text.replace(/\s+\bNew\s+Game\s+Plus\b/i, '').trim();
  }
  if (/\s+Again$/i.test(text)) {
    notes.push('Replay / Rewatch');
    text = text.replace(/\s+Again$/i, '').trim();
  }

  // 7. Extract season / part qualifiers BEFORE final classification (explicit season overrides 🎬 movie emoji)
  let seasonNum: number | undefined;
  let hasExplicitSeason = false;
  let candidateTitle = text;

  const parenSeasonMatch = candidateTitle.match(
    /\s*\(season\s+(\d+)(?:\s*(?:part|volume|:)[^)]*)?\)(?:\s*\((?:part|volume)[^)]*\))*/i
  );
  if (parenSeasonMatch) {
    seasonNum = Number(parenSeasonMatch[1]);
    hasExplicitSeason = true;
    const partMatch = parenSeasonMatch[0].match(/\((part\s+\d+|volume\s+\d+|Fishman Island)\)/i);
    notes.push(
      `Season ${seasonNum}${partMatch ? ` · ${partMatch[1]}` : ''}`
    );
    candidateTitle = candidateTitle.replace(parenSeasonMatch[0], '').trim();
    // Also clean leftover subtitle/part parens like "(season 16: Punk Hazard)"
    candidateTitle = candidateTitle.replace(/\s*\([^)]*season[^)]*\)/gi, '').trim();
  }

  // Match unparenthesized Season markers: "Title Season 2", "Title - Season 3: Subtitle", "Title 2nd Season"
  if (!hasExplicitSeason) {
    const bareSeasonMatch = candidateTitle.match(
      /(?:\s*[-–—:]\s*|\s+)Season\s+(\d+)(?:\s*[:\-–—]\s*([^([]+))?(?:\s+Part\s+(\d+))?$/i
    );
    if (bareSeasonMatch) {
      seasonNum = Number(bareSeasonMatch[1]);
      hasExplicitSeason = true;
      notes.push(`Season ${seasonNum}${bareSeasonMatch[3] ? ` Part ${bareSeasonMatch[3]}` : ''}`);
      candidateTitle = candidateTitle.slice(0, bareSeasonMatch.index).trim();
    }
  }

  if (!hasExplicitSeason) {
    const ordinalSeasonMatch = candidateTitle.match(/\s+(?:(\d+)(?:st|nd|rd|th)\s+Season)\s*$/i);
    if (ordinalSeasonMatch) {
      seasonNum = Number(ordinalSeasonMatch[1]);
      hasExplicitSeason = true;
      notes.push(`Season ${seasonNum}`);
      candidateTitle = candidateTitle.slice(0, ordinalSeasonMatch.index).trim();
    }
  }

  // Clean trailing "(part N)" / "Part N" on non-movie/non-game titles (e.g. "Spy x Family (part 1)", "Mushoku Tensei Part 2")
  if (/\s*\(part\s+(\d+)\)\s*$/i.test(candidateTitle)) {
    const pm = candidateTitle.match(/\s*\(part\s+(\d+)\)\s*$/i)!;
    notes.push(`Part ${pm[1]}`);
    hasExplicitSeason = true;
    candidateTitle = candidateTitle.slice(0, pm.index).trim();
  }

  if (/\s+OVA'?s$/i.test(candidateTitle)) {
    notes.push("OVAs");
    hasExplicitSeason = true;
    candidateTitle = candidateTitle.replace(/\s+OVA'?s$/i, '').trim();
  }

  // 8. Extract explicit release year (YYYY) at end of title
  let explicitYear: number | undefined = explicitYearFromTag;
  const trailingYearMatch = candidateTitle.match(/\s*\((19\d\d|20\d\d)\)\s*$/);
  if (trailingYearMatch) {
    explicitYear = Number(trailingYearMatch[1]);
    const stripped = candidateTitle.slice(0, trailingYearMatch.index).trim();
    // Preserve year on "One Piece (2023)" so live-action doesn't merge into anime "One Piece", and keep on Read events
    if (emojiHint !== 'read' && !verbRead && stripped.toLowerCase() !== 'one piece') {
      candidateTitle = stripped;
    }
  }
  if (candidateTitle.toLowerCase() === 'one piece' && explicitYear === 2023) {
    candidateTitle = 'One Piece (2023)';
  }

  // Strip leftover `: The Final Season Part N` or trailing `Part N` for known anime/TV shows (never Dune: Part One or Compilation Part I)
  const lowerCand = candidateTitle.toLowerCase();
  if (
    /\s+(?:part\s+\d+|volume\s+\d+|:\s*volume\s+\d+|:\s*the\s+final(?:\s+season(?:\s+part\s+\d+)?)?)$/i.test(
      candidateTitle
    ) &&
    !/dune:\s*part|last of us\s+part|compilation\s+part/i.test(lowerCand) &&
    emojiHint !== 'read' &&
    !verbRead
  ) {
    const pm = candidateTitle.match(
      /(\s+(?:part\s+\d+|volume\s+\d+|:\s*volume\s+\d+|:\s*the\s+final(?:\s+season(?:\s+part\s+\d+)?)?))$/i
    )!;
    notes.push(pm[1].replace(/^[:\s]+/, '').trim());
    hasExplicitSeason = true;
    candidateTitle = candidateTitle.slice(0, pm.index).trim();
  }

  // Strip Roman II suffix on Mob Psycho 100 II if needed? Keep distinct or normalize cleanly; keep "Mob Psycho 100" when followed by " II"
  if (/^mob psycho 100 ii$/i.test(candidateTitle)) {
    seasonNum = 2;
    hasExplicitSeason = true;
    notes.push('Season 2');
    candidateTitle = 'Mob Psycho 100';
  }
  if (/^haikyu!+(?:\s+to\s+the\s+top)?$/i.test(candidateTitle)) {
    hasExplicitSeason = true;
    candidateTitle = 'Haikyu!!';
  }

  // 9. Author extraction for audiobooks / novels ("Title by Author, translated by ...")
  let creator: string | undefined;
  const looksBookLine =
    emojiHint === 'read' || verbRead || forceReadNovel;
  if (
    looksBookLine &&
    !/\b(?:omnibus|hc|tp|tpb|vol\.|volume|complete collection|edition)\b/i.test(candidateTitle)
  ) {
    const transMatch = candidateTitle.match(/,\s*(translated\s+by\s+.+)$/i);
    if (transMatch) {
      notes.push(transMatch[1].trim());
      candidateTitle = candidateTitle.slice(0, transMatch.index).trim();
    }
    const byMatch = candidateTitle.match(/^(.+?)\s+by\s+([A-Z][^,()]{2,50})$/);
    if (byMatch) {
      candidateTitle = byMatch[1].trim();
      creator = byMatch[2].trim();
    }
  }

  // 10. Final domain & mediaType classification
  const titleNorm = normalizeFoldLower(candidateTitle);
  const fullLower = normalizeFoldLower(text);

  let kind: ImportCandidate['kind'] = 'movie';
  let mediaType: ImportCandidate['mediaType'] = 'movie';

  const looksComicOrBookKeywords =
    /\b(omnibus|reading order|compendium|complete collection|epic collection|dc compact)\b/i.test(
      candidateTitle
    ) ||
    /\s+(?:TP|TPB|HC)$/i.test(candidateTitle) ||
    /\bVol\.\s*\d+\b.*\b(?:TP|HC)\b/i.test(candidateTitle) ||
    /^war of kings$/i.test(candidateTitle);

  const looksMangaInLog =
    /\((?:manga|manhwa|manhua)\)/i.test(candidateTitle) ||
    /\b(?:welcome back,?\s+papa|hidden dungeon only i can enter|betrayed by the hero|dragon ball super)\b/i.test(
      candidateTitle
    );

  const knownGameMatch =
    Boolean(lookupKnownGameChapters(candidateTitle)) ||
    TEXT_LOG_GAME_HINTS.some((kw) => titleNorm.includes(kw));

  const knownAnimeMatch =
    titleNorm !== 'one piece (2023)' &&
    TEXT_LOG_ANIME_HINTS.some((kw) => titleNorm.includes(kw));
  const knownShowMatch = TEXT_LOG_SHOW_HINTS.some((kw) => titleNorm.includes(kw));

  // Explicit season always overrides 🎬 movie emoji (e.g. "🎬 Finished X-Men '97 (season 2)")
  if (emojiHint === 'read' || verbRead || explicitTagKind === 'read' || looksComicOrBookKeywords) {
    kind = 'read';
    if (forceReadNovel) {
      mediaType = 'novel';
    } else if (looksMangaInLog) {
      mediaType = 'manga';
    } else if (
      forceReadComic ||
      /\s+(?:TP|TPB|HC)$/i.test(candidateTitle) ||
      /\b(?:omnibus|reading order|dc compact|compendium|complete collection|epic collection)\b/i.test(
        candidateTitle
      ) ||
      /^war of kings$/i.test(candidateTitle)
    ) {
      mediaType = 'comic';
    } else {
      mediaType = classifyReadFormat({
        title: candidateTitle,
        author: creator,
        genres: notes,
      });
    }
  } else if (emojiHint === 'game' || explicitTagKind === 'game' || (!emojiHint && knownGameMatch && !hasExplicitSeason)) {
    kind = 'game';
    mediaType = 'game';
  } else if (emojiHint === 'show' || explicitTagKind === 'show' || hasExplicitSeason) {
    kind = 'show';
    mediaType = knownAnimeMatch ? 'anime' : 'tv';
  } else if (emojiHint === 'movie' || explicitTagKind === 'movie') {
    kind = 'movie';
    mediaType = 'movie';
  } else if (knownGameMatch) {
    kind = 'game';
    mediaType = 'game';
  } else if (knownAnimeMatch) {
    kind = 'show';
    mediaType = 'anime';
  } else if (knownShowMatch) {
    kind = 'show';
    mediaType = 'tv';
  } else if (/\b(?:trilogy|marathon)\b/i.test(fullLower) || verbWatch || explicitYear) {
    kind = 'movie';
    mediaType = 'movie';
  }

  // Refine TV show vs Anime if movie/show edge case (e.g. Demon Slayer: Infinity Castle -> movie, Dragon Ball Z -> show)
  if (kind === 'show' && knownAnimeMatch) {
    mediaType = 'anime';
  }

  const domain: ImportCandidate['domain'] =
    kind === 'read' ? 'read' : kind === 'game' ? 'play' : 'watch';

  const derivedYear =
    explicitYear ||
    (dateYmd ? Number(dateYmd.slice(0, 4)) : undefined) ||
    2024;

  const genreHints =
    mediaType === 'anime'
      ? ['Anime']
      : kind === 'show'
        ? ['Series']
        : kind === 'game'
          ? ['Video Game']
          : mediaType === 'comic'
            ? ['Comics']
            : mediaType === 'manga'
              ? ['Manga']
              : kind === 'read'
                ? ['Fiction']
                : ['Feature Film'];

  return {
    rowNumber,
    kind,
    domain,
    mediaType,
    title: candidateTitle,
    year: derivedYear,
    explicitYear,
    creator,
    userRating,
    dateYmd,
    seasonNum,
    notes: Array.from(new Set(notes.filter(Boolean))),
    platformHint,
    genreHints,
    rawLine,
  };
}

function consolidateTextLogOccurrences(
  occurrences: ParsedTextLogOccurrence[]
): ImportCandidate[] {
  const groups = new Map<string, ParsedTextLogOccurrence[]>();

  for (const occ of occurrences) {
    const titleKey = normalizeImportTitle(occ.title);
    if (!titleKey) continue;
    const yearSuffix = occ.kind === 'movie' && occ.explicitYear ? `::${occ.explicitYear}` : '';
    const key = `${occ.kind}::${titleKey}${yearSuffix}`;
    const list = groups.get(key) || [];
    list.push(occ);
    groups.set(key, list);
  }

  const candidates: ImportCandidate[] = [];
  let idx = 0;

  for (const list of groups.values()) {
    // Deduplicate identical dateYmd entries (keeping richer rating/notes/title)
    const byDate = new Map<string, ParsedTextLogOccurrence>();
    const undated: ParsedTextLogOccurrence[] = [];

    for (const occ of list) {
      if (!occ.dateYmd) {
        undated.push(occ);
        continue;
      }
      const prev = byDate.get(occ.dateYmd);
      if (!prev) {
        byDate.set(occ.dateYmd, occ);
      } else {
        byDate.set(occ.dateYmd, {
          ...prev,
          userRating: Math.max(prev.userRating || 0, occ.userRating || 0) || undefined,
          creator: prev.creator || occ.creator,
          platformHint: prev.platformHint || occ.platformHint,
          seasonNum: prev.seasonNum ?? occ.seasonNum,
          notes: Array.from(new Set([...prev.notes, ...occ.notes])),
          mediaType: prev.mediaType === 'anime' || occ.mediaType === 'anime' ? 'anime' : occ.mediaType,
          explicitYear: prev.explicitYear || occ.explicitYear,
        });
      }
    }

    const sortedDated = Array.from(byDate.values()).sort((a, b) =>
      (a.dateYmd || '').localeCompare(b.dateYmd || '')
    );
    const ordered = [...sortedDated, ...undated];
    const latest = sortedDated[sortedDated.length - 1] || ordered[0];
    const first = ordered[0];

    const extraRuns: NonNullable<ImportCandidate['extraRuns']> = sortedDated.map((occ) => ({
      finishedAt: normalizeImportDateIso(occ.dateYmd!)!,
      ...(occ.notes.length > 0 ? { note: occ.notes.join(' · ') } : {}),
      ...(occ.userRating ? { rating: occ.userRating } : {}),
    }));

    const seasonDates: Record<number, string> = {};
    for (const occ of ordered) {
      if (occ.kind === 'show' && occ.seasonNum && occ.dateYmd) {
        seasonDates[occ.seasonNum] = normalizeImportDateIso(occ.dateYmd)!;
      }
    }

    const bestRating = ordered.reduce<number | undefined>(
      (best, occ) => (occ.userRating && (!best || occ.userRating > best) ? occ.userRating : best),
      undefined
    );

    const allNotes = Array.from(new Set(ordered.flatMap((o) => o.notes)));
    const summaryBits: string[] = [];
    if (latest.dateYmd) summaryBits.push(`Finished ${formatHumanDateLabel(latest.dateYmd)}`);
    if (extraRuns.length > 1) summaryBits.push(`${extraRuns.length} logged runs`);
    if (allNotes.length > 0) summaryBits.push(allNotes.slice(0, 4).join(' · '));

    idx += 1;
    candidates.push({
      tempId: `txt-${idx}-${normalizeImportTitle(latest.title).replace(/\s+/g, '-').slice(0, 18)}`,
      kind: latest.kind,
      domain: latest.domain,
      mediaType: ordered.some((o) => o.mediaType === 'anime') ? 'anime' : latest.mediaType,
      title: latest.title,
      year: latest.explicitYear || first.year || latest.year,
      genres: latest.genreHints,
      creator: ordered.find((o) => o.creator)?.creator,
      userRating: bestRating,
      completed: true,
      readStatus: latest.kind === 'read' ? 'finished' : undefined,
      dateStr: latest.dateYmd ? normalizeImportDateIso(latest.dateYmd) : undefined,
      extraRuns: extraRuns.length > 0 ? extraRuns : undefined,
      seasonDates: Object.keys(seasonDates).length > 0 ? seasonDates : undefined,
      platformHint: ordered.find((o) => o.platformHint)?.platformHint,
      overview: summaryBits.length > 0 ? summaryBits.join(' · ') : undefined,
      rowNumber: latest.rowNumber,
    });
  }

  return candidates.sort((a, b) => (b.dateStr || '').localeCompare(a.dateStr || ''));
}

export function parseTextFinishedLog(rawText: string, _fileName = ''): ParsedImportBatch {
  const clean = rawText.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);

  // Detect Google Calendar Schedule / Agenda blocks first
  const hasGcalHeaders = lines.some((l) => GCAL_HEADER_RE.test(l.trim()));
  const occurrences: ParsedTextLogOccurrence[] = [];
  const skipped: SkippedImportRow[] = [];

  if (hasGcalHeaders) {
    let pendingDay: number | null = null;
    let currentYmd: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (/^\d{1,2}$/.test(line)) {
        const nextLine = (lines[i + 1] || '').trim();
        if (GCAL_HEADER_RE.test(nextLine)) {
          const d = Number(line);
          if (d >= 1 && d <= 31) {
            pendingDay = d;
            continue;
          }
        }
      }

      const hdrMatch = line.match(GCAL_HEADER_RE);
      if (hdrMatch) {
        const month = MONTH_INDEX_BY_ABBR[hdrMatch[1].toLowerCase()];
        const year = Number(hdrMatch[2]);
        const day = pendingDay ?? 1;
        pendingDay = null;
        if (month && year) {
          currentYmd = formatYmd(year, month, day);
        }
        continue;
      }

      if (
        /^all day$/i.test(line) ||
        /^\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[–-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(line) ||
        /^\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i.test(line)
      ) {
        continue;
      }

      if (isVenueOrAddressLine(line)) {
        skipped.push({
          rowNumber: i + 1,
          title: line,
          reason: 'Venue / street address line',
        });
        continue;
      }

      const parsed = parseFinishedLogLine(line, i + 1, currentYmd);
      if (parsed) {
        occurrences.push(parsed);
      } else {
        skipped.push({ rowNumber: i + 1, title: line, reason: 'Unrecognized empty log entry' });
      }
    }
  } else {
    // Generic plain-text finished log: dated lines ("2026-11-04 - Finished ...") or plain/bullet list
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      if (isVenueOrAddressLine(line)) {
        skipped.push({ rowNumber: i + 1, title: line, reason: 'Venue / street address line' });
        continue;
      }

      let dateYmd: string | undefined;
      let body = line;
      const dateMatch = line.match(GENERIC_DATE_LINE_RE);
      if (dateMatch) {
        if (dateMatch[1]) {
          dateYmd = dateMatch[1];
        } else if (dateMatch[2]) {
          const d = new Date(dateMatch[2]);
          if (!Number.isNaN(d.getTime())) {
            dateYmd = formatYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
          }
        }
        body = dateMatch[3].trim();
      }

      const parsed = parseFinishedLogLine(body, i + 1, dateYmd);
      if (parsed) occurrences.push(parsed);
    }
  }

  const candidates = consolidateTextLogOccurrences(occurrences);
  if (candidates.length === 0) {
    return {
      source: 'unknown',
      sourceLabel: 'Text Finished Log',
      candidates: [],
      skipped,
      error: 'No finished titles could be parsed from this text log.',
    };
  }

  return {
    source: 'text-finished-log',
    sourceLabel: hasGcalHeaders ? 'Google Calendar Finished Log (.txt)' : 'Finished Log (.txt)',
    candidates,
    skipped,
  };
}

function looksLikeTextFinishedLog(trimmed: string, fileName = ''): boolean {
  if (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4},\s+(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.text') || lowerName.endsWith('.log')) {
    return true;
  }
  return (
    /^[\u{1F300}-\u{1FAFF}]/mu.test(trimmed) ||
    /^(?:\d{4}-\d{2}-\d{2}\s+[-–—:|]\s+)?(?:fully\s+)?(?:finished|rewatched|watched|reread|played|beat|completed)\s+/im.test(
      trimmed
    )
  );
}

function parseComicGeeksCsv(rows: string[][], headers: Record<string, number>): ParsedImportBatch {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  interface RawIssueGroup {
    seriesTitle: string;
    seriesRaw: string;
    publisher: string;
    year: number;
    readCount: number;
    totalCount: number;
    maxRating?: number;
    latestDate?: string;
    rowNumber: number;
    formatHint: string;
    tags: string;
  }
  const issueGroups = new Map<string, RawIssueGroup>();

  const cleanSeriesBase = (rawSeries: string): string =>
    rawSeries
      .replace(/\s*\(Vol\.\s*\d+\)\s*/gi, ' ')
      .replace(/\s*\((?:19|20)\d{2}(?:\s*-\s*(?:Present|(?:19|20)\d{2}))?\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fullTitle = cell(r, headers, 'Full Title');
    const seriesName = cell(r, headers, 'Series Name');
    if (!fullTitle && !seriesName) continue;

    const publisher = cell(r, headers, 'Publisher Name');
    const releaseDate = cell(r, headers, 'Release Date');
    const datePurchased = cell(r, headers, 'Date Purchased');
    const markedRead = cell(r, headers, 'Marked Read') === '1';
    const inCollection = cell(r, headers, 'In Collection') === '1';
    const inWishlist = cell(r, headers, 'In Wish List') === '1';
    const mediaFormat = cell(r, headers, 'Media Format');
    const tags = cell(r, headers, 'Tags');
    const rating = parseStarRatingFive(cell(r, headers, 'My Rating'));
    const year = parseYear(releaseDate || seriesName || datePurchased, 2024);
    const dateStr = normalizeImportDateIso(datePurchased || releaseDate);

    const isCollectedEdition =
      /\b(TP|TPB|HC|Omnibus|Compendium|Complete Collection|Deluxe Edition|Compact)\b/i.test(
        fullTitle
      ) || !/#\d+(?:\.\d+|\.[A-Z]+)?\b/i.test(fullTitle);

    if (isCollectedEdition && fullTitle) {
      const key = normalizeImportTitle(fullTitle);
      if (seen.has(key)) {
        skipped.push({ rowNumber: i + 1, title: fullTitle, reason: 'Duplicate row inside CSV' });
        continue;
      }
      seen.add(key);

      const mediaType = classifyReadFormat({
        title: fullTitle,
        publisher,
        binding: mediaFormat,
        genres: [tags],
      });
      const readStatus: ImportCandidate['readStatus'] = markedRead ? 'finished' : 'want_to_read';
      const notes = [
        publisher,
        inCollection ? 'In Collection' : inWishlist ? 'Wishlist' : '',
        tags,
      ]
        .filter(Boolean)
        .join(' · ');

      candidates.push({
        tempId: `clz-${i}-${key.slice(0, 16)}`,
        kind: 'read',
        domain: 'read',
        mediaType,
        title: fullTitle,
        year,
        genres: [mediaType === 'manga' ? 'Manga' : mediaType === 'comic' ? 'Comics' : 'Fiction'],
        creator: publisher || 'Publisher',
        userRating: rating,
        completed: markedRead,
        readStatus,
        dateStr,
        overview: notes || undefined,
        rowNumber: i + 1,
      });
    } else if (seriesName) {
      const baseTitle = cleanSeriesBase(seriesName) || fullTitle.replace(/\s+#\d.*$/, '').trim();
      const groupKey = normalizeImportTitle(seriesName);
      const prev = issueGroups.get(groupKey);
      if (!prev) {
        issueGroups.set(groupKey, {
          seriesTitle: baseTitle,
          seriesRaw: seriesName,
          publisher,
          year,
          readCount: markedRead ? 1 : 0,
          totalCount: 1,
          maxRating: rating,
          latestDate: dateStr,
          rowNumber: i + 1,
          formatHint: mediaFormat,
          tags,
        });
      } else {
        prev.totalCount += 1;
        if (markedRead) prev.readCount += 1;
        if (rating && (!prev.maxRating || rating > prev.maxRating)) prev.maxRating = rating;
        if (dateStr && (!prev.latestDate || dateStr > prev.latestDate)) prev.latestDate = dateStr;
      }
    }
  }

  for (const grp of issueGroups.values()) {
    const key = normalizeImportTitle(grp.seriesTitle);
    if (!key) continue;
    const mediaType = classifyReadFormat({
      title: grp.seriesRaw,
      publisher: grp.publisher,
      binding: grp.formatHint,
      genres: [grp.tags],
    });
    const isFinished = grp.readCount > 0;
    candidates.push({
      tempId: `clz-s-${grp.rowNumber}-${key.slice(0, 16)}`,
      kind: 'read',
      domain: 'read',
      mediaType,
      title: grp.seriesTitle,
      year: grp.year,
      genres: [mediaType === 'manga' ? 'Manga' : 'Comics'],
      creator: grp.publisher || 'Publisher',
      userRating: grp.maxRating,
      completed: isFinished,
      readStatus: isFinished ? 'finished' : 'want_to_read',
      totalUnits: grp.totalCount,
      dateStr: grp.latestDate,
      overview: `${grp.seriesRaw} · ${grp.readCount}/${grp.totalCount} issues logged`,
      rowNumber: grp.rowNumber,
    });
  }

  return {
    source: 'comic-geeks-csv',
    sourceLabel: 'League of Comic Geeks CSV',
    candidates,
    skipped,
  };
}

function parseCueLibraryCsv(rows: string[][], headers: Record<string, number>): ParsedImportBatch {
  const candidates: ImportCandidate[] = [];
  const skipped: SkippedImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = cell(r, headers, 'Title');
    if (!title) continue;
    const domainRaw = cell(r, headers, 'Domain').toLowerCase();
    const typeRaw = cell(r, headers, 'Type').toLowerCase();
    const statusRaw = cell(r, headers, 'Status').toLowerCase();
    const creator = cell(r, headers, 'Publisher / Studio') || undefined;
    const year = parseYear(cell(r, headers, 'Release Year'), 2024);
    const userRating = parseStarRatingFive(cell(r, headers, 'My Rating'));
    const dateStr = normalizeImportDateIso(
      cell(r, headers, 'Finished Date') || cell(r, headers, 'Date Purchased')
    );
    const notes = cell(r, headers, 'Notes') || undefined;

    let kind: ImportCandidate['kind'] = 'movie';
    let mediaType: ImportCandidate['mediaType'] = 'movie';
    if (domainRaw === 'play' || typeRaw === 'game') {
      kind = 'game';
      mediaType = 'game';
    } else if (domainRaw === 'read' || ['comic', 'manga', 'novel'].includes(typeRaw)) {
      kind = 'read';
      mediaType = typeRaw === 'comic' ? 'comic' : typeRaw === 'manga' ? 'manga' : 'novel';
    } else if (typeRaw === 'anime') {
      kind = 'show';
      mediaType = 'anime';
    } else if (typeRaw === 'tv show' || typeRaw === 'show' || typeRaw === 'series') {
      kind = 'show';
      mediaType = 'tv';
    }

    const completed =
      statusRaw === 'finished' || statusRaw === 'watched' || statusRaw === 'completed';

    candidates.push({
      tempId: `cuecsv-${i}-${normalizeImportTitle(title).slice(0, 16)}`,
      kind,
      domain: kind === 'read' ? 'read' : kind === 'game' ? 'play' : 'watch',
      mediaType,
      title,
      year,
      genres: [
        mediaType === 'anime'
          ? 'Anime'
          : kind === 'show'
            ? 'Series'
            : kind === 'game'
              ? 'Video Game'
              : mediaType === 'comic'
                ? 'Comics'
                : mediaType === 'manga'
                  ? 'Manga'
                  : kind === 'read'
                    ? 'Fiction'
                    : 'Feature Film',
      ],
      creator,
      userRating,
      completed,
      readStatus:
        kind === 'read'
          ? completed
            ? 'finished'
            : statusRaw === 'reading'
              ? 'reading'
              : 'want_to_read'
          : undefined,
      dateStr,
      overview: notes,
      rowNumber: i + 1,
    });
  }

  return {
    source: 'cue-library-csv',
    sourceLabel: 'Cue Library CSV',
    candidates,
    skipped,
  };
}

export function parseImportFile(rawText: string, fileName = ''): ParsedImportBatch {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      source: 'unknown',
      sourceLabel: 'Empty Input',
      candidates: [],
      skipped: [],
      error: 'Select a CSV, JSON, or TXT log file or paste text to preview.',
    };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return parseJsonImport(trimmed);
    } catch {
      return {
        source: 'unknown',
        sourceLabel: 'Invalid JSON',
        candidates: [],
        skipped: [],
        error: 'Malformed JSON file or pasted text.',
      };
    }
  }

  // Detect Google Calendar Schedule/Agenda plain-text exports before CSV parsing
  if (
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4},\s+(?:mon|tue|wed|thu|fri|sat|sun)\b/i.test(
      trimmed
    )
  ) {
    return parseTextFinishedLog(trimmed, fileName);
  }

  const rows = parseCsvRows(trimmed);
  if (rows.length >= 2) {
    const headers = buildHeaderIndex(rows[0]);

    if (
      headers['const'] !== undefined ||
      headers['titletype'] !== undefined ||
      headers['imdbrating'] !== undefined ||
      headers['yourrating'] !== undefined
    ) {
      return parseImdbCsv(rows, headers, fileName);
    }

    if (headers['titleid'] !== undefined) {
      if (headers['prompttype'] !== undefined || headers['dismissaldate'] !== undefined) {
        return {
          source: 'unknown',
          sourceLabel: 'IMDb Dismissals Log',
          candidates: [],
          skipped: [],
          error:
            'This looks like an IMDb recommendation dismissals log (IMDbPersonalization.Dismissals.csv). Upload IMDbRatings.UserRatings.csv or a Watchlist/List export instead.',
        };
      }
      return parseImdbAccountExportCsv(rows, headers, fileName);
    }

    if (
      headers['letterboxduri'] !== undefined ||
      (headers['name'] !== undefined && headers['year'] !== undefined)
    ) {
      return parseLetterboxdCsv(rows, headers, fileName);
    }

    if (headers['exclusiveshelf'] !== undefined || headers['authorlf'] !== undefined || headers['bookid'] !== undefined) {
      return parseGoodreadsCsv(rows, headers);
    }

    if (headers['fulltitle'] !== undefined && (headers['publishername'] !== undefined || headers['markedread'] !== undefined)) {
      return parseComicGeeksCsv(rows, headers);
    }

    if (headers['domain'] !== undefined && headers['type'] !== undefined && headers['title'] !== undefined) {
      return parseCueLibraryCsv(rows, headers);
    }

    // Generic Title + Type fallback CSV
    if (headers['title'] !== undefined) {
      return parseImdbCsv(rows, headers, fileName);
    }
  }

  if (looksLikeTextFinishedLog(trimmed, fileName)) {
    return parseTextFinishedLog(trimmed, fileName);
  }

  return {
    source: 'unknown',
    sourceLabel: 'Unrecognized Import',
    candidates: [],
    skipped: [],
    error: 'Unrecognized format. Supported: IMDb CSV, Letterboxd CSV, Goodreads CSV, JSON backups, and .txt finished logs.',
  };
}

export function canonicalImportReadKey(rawTitle: string): string {
  let s = rawTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[/\\]/g, ' ');

  const colonIdx = s.indexOf(':');
  if (colonIdx > 4) {
    const afterColon = s.slice(colonIdx + 1);
    const volSuffix = afterColon.match(
      /\b(?:vol(?:ume)?\.?\s*\d+|book\s+(?:\d+|one|two|three|four|five)|#\d+)\b/i
    );
    s = volSuffix ? `${s.slice(0, colonIdx)} ${volSuffix[0]}` : s.slice(0, colonIdx);
  }

  return s
    .replace(/\b(?:volume)\b/g, 'vol')
    .replace(/\bbook\s+one\b/g, ' ')
    .replace(/\bbook\s+two\b/g, 'vol 2')
    .replace(/\bbook\s+three\b/g, 'vol 3')
    .replace(/\bbook\s+four\b/g, 'vol 4')
    .replace(/\bbook\s+five\b/g, 'vol 5')
    .replace(/\b(?:vol\.?\s*1|book\s+1)\b/g, ' ')
    .replace(
      /\b(?:dc\s+compact(?:\s+comics)?(?:\s+edition)?|compact\s+(?:comics|edition)|omnibus|compendium|complete\s+collection|epic\s+collection|deluxe\s+edition|collector'?s?\s+edition|trade\s+paperback|tpb|tp|hardcover|hc|paperback|box\s+set|edition|printing)\b/g,
      ' '
    )
    .replace(/[:\-–—_.,!?'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalComicSeriesBaseKey(rawTitle: string): string {
  return canonicalImportReadKey(rawTitle)
    .replace(/\b(?:vol\.?\s*\d+|book\s+\d+|#\d+)\b.*$/i, ' ')
    .replace(/\bby\s+[a-z0-9\s.&]+$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferComicEditionFromTitle(
  rawTitle: string
): 'compact' | 'omnibus' | 'hardcover' | 'tpb' | undefined {
  const lower = rawTitle.toLowerCase();
  if (/\b(?:dc\s+compact|compact\s+(?:comics|edition))\b/.test(lower)) return 'compact';
  if (/\bomnibus\b/.test(lower)) return 'omnibus';
  if (/\b(?:hc|hardcover|deluxe\s+edition|absolute)\b/.test(lower)) return 'hardcover';
  if (/\b(?:tp|tpb|trade\s+paperback)\b/.test(lower)) return 'tpb';
  return undefined;
}

function extractExplicitComicVolNumber(rawTitle: string): number | undefined {
  const lower = rawTitle.toLowerCase();
  const wordNums: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const m = lower.match(/\b(?:vol(?:ume)?\.?\s*|book\s+)(\d+|one|two|three|four|five|six)\b/i);
  if (!m) return undefined;
  return wordNums[m[1].toLowerCase()] ?? Number(m[1]);
}

function inferComicPublisher(title: string, explicitCreator?: string): string | undefined {
  if (explicitCreator && explicitCreator !== 'Author') return explicitCreator;
  const t = normalizeFoldLower(title);
  if (
    /\b(?:dc compact|superman|batman|wonder woman|green lantern|the flash|flash:|justice league|catwoman|poison ivy|watchmen|absolute power|harley quinn|aquaman|nightwing|teen titans)\b/.test(
      t
    )
  ) {
    return 'DC Comics';
  }
  if (
    /\b(?:avengers|x-men|spider-man|thor|hulk|captain america|daredevil|wolverine|hawkeye|the vision|secret wars|fantastic four|venom|young avengers|war of kings|ultimates|iron man|moon knight|black panther|punisher)\b/.test(
      t
    )
  ) {
    return 'Marvel Comics';
  }
  if (/\b(?:he-man|hellboy|sin city)\b/.test(t)) return 'Dark Horse Comics';
  if (/\b(?:power rangers|marian heretic)\b/.test(t)) return 'BOOM! Studios';
  if (/\b(?:invincible|walking dead|spawn|night fever|monstress)\b/.test(t)) return 'Image Comics';
  return undefined;
}

export function annotateImportDuplicates(
  candidates: ImportCandidate[],
  state: CueStoreState
): ImportCandidate[] {
  const showByTitle = new Map<string, { id: string; title: string }>();
  const showByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.showOrder) {
    const s = state.shows[id];
    if (!s) continue;
    const norm = normalizeImportTitle(s.title);
    if (norm && !showByTitle.has(norm)) showByTitle.set(norm, { id, title: s.title });
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) showByImdb.set(tt, { id, title: s.title });
  }

  const movieByTitle = new Map<string, Array<{ id: string; title: string; year: number }>>();
  const movieByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.movieOrder) {
    const m = state.movies[id];
    if (!m) continue;
    const norm = normalizeImportTitle(m.title);
    if (norm) {
      const list = movieByTitle.get(norm) || [];
      list.push({ id, title: m.title, year: m.year || 0 });
      movieByTitle.set(norm, list);
    }
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) movieByImdb.set(tt, { id, title: m.title });
  }

  const readByTitle = new Map<string, { id: string; title: string }>();
  const readByCanonical = new Map<string, { id: string; title: string }>();
  const readByIsbn = new Map<string, { id: string; title: string }>();
  const readBySeriesBase = new Map<
    string,
    Array<{
      id: string;
      title: string;
      format: ReadItem['format'];
      comicKind?: 'series' | 'collection';
      edition?: string;
      editionTitle?: string;
      volNum?: number;
    }>
  >();

  for (const id of state.readOrder) {
    const r = state.readItems[id];
    if (!r) continue;
    const rp = state.readProgress[id];
    const norm = normalizeImportTitle(r.title);
    if (norm && !readByTitle.has(norm)) readByTitle.set(norm, { id, title: r.title });
    const canon = canonicalImportReadKey(r.title);
    if (canon && !readByCanonical.has(canon)) readByCanonical.set(canon, { id, title: r.title });
    const baseKey = canonicalComicSeriesBaseKey(r.title);
    if (baseKey) {
      const list = readBySeriesBase.get(baseKey) || [];
      list.push({
        id,
        title: r.title,
        format: r.format,
        comicKind: r.comicKind,
        edition: rp?.edition || inferComicEditionFromTitle(r.title),
        editionTitle: rp?.editionTitle,
        volNum: extractExplicitComicVolNumber(r.title),
      });
      readBySeriesBase.set(baseKey, list);
    }
    const isbnFromField = r.isbn ? extractCleanIsbn(r.isbn) : '';
    const isbnFromId = extractCleanIsbn(id.match(/(97[89]\d{10}|\d{9}[0-9Xx])/)?.[1] || '');
    for (const code of [isbnFromField, isbnFromId]) {
      if (code && !readByIsbn.has(code)) readByIsbn.set(code, { id, title: r.title });
    }
  }

  const gameByTitle = new Map<string, { id: string; title: string }>();
  const gameByImdb = new Map<string, { id: string; title: string }>();
  for (const id of state.gameOrder) {
    const g = state.games[id];
    if (!g) continue;
    const norm = normalizeImportTitle(g.title);
    if (norm && !gameByTitle.has(norm)) gameByTitle.set(norm, { id, title: g.title });
    const tt = id.match(/(tt\d{5,12})/i)?.[1]?.toLowerCase();
    if (tt) gameByImdb.set(tt, { id, title: g.title });
  }

  return candidates.map((c) => {
    const ext = c.externalConst?.toLowerCase();
    const cNorm = normalizeImportTitle(c.title);

    if (ext) {
      const idMatch = showByImdb.get(ext) || movieByImdb.get(ext) || gameByImdb.get(ext);
      if (idMatch) {
        return { ...c, existingId: idMatch.id, existingTitle: idMatch.title };
      }
      if (c.kind === 'read') {
        const candIsbn = extractCleanIsbn(c.externalConst || '');
        const isbnMatch = candIsbn ? readByIsbn.get(candIsbn) : undefined;
        if (isbnMatch) {
          return { ...c, existingId: isbnMatch.id, existingTitle: isbnMatch.title };
        }
      }
    }

    if (c.needsResolution) return c;

    if (c.kind === 'show') {
      const match = showByTitle.get(cNorm);
      return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
    }
    if (c.kind === 'movie') {
      const list = movieByTitle.get(cNorm) || [];
      const match = list.find((m) => Math.abs((m.year || c.year) - c.year) <= 2);
      return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
    }
    if (c.kind === 'read') {
      const directMatch =
        readByTitle.get(cNorm) || readByCanonical.get(canonicalImportReadKey(c.title));
      if (directMatch) {
        return { ...c, existingId: directMatch.id, existingTitle: directMatch.title };
      }
      if (c.mediaType === 'comic') {
        const baseKey = canonicalComicSeriesBaseKey(c.title);
        const candEdition = inferComicEditionFromTitle(c.title);
        const candVol = extractExplicitComicVolNumber(c.title);
        const baseMatches = readBySeriesBase.get(baseKey) || [];
        const matched = baseMatches.find((existing) => {
          if (existing.format !== 'comic') return false;
          // Exact same edition type (e.g. DC Compact TPB in library vs DC Compact Comics Edition TP in import)
          if (candEdition && existing.edition === candEdition) {
            return !candVol || !existing.volNum || candVol === existing.volNum;
          }
          // Single-edition / Book One / Vol. 1 trade matches the parent comic series in library (not Vol. 2+ or Omnibus)
          const isSingleBookOrVol1 = (!candVol || candVol === 1) && candEdition !== 'omnibus';
          if (isSingleBookOrVol1 && existing.comicKind === 'series') {
            return true;
          }
          return false;
        });
        if (matched) {
          return { ...c, existingId: matched.id, existingTitle: matched.title };
        }
      }
      return c;
    }
    const match = gameByTitle.get(cNorm);
    return match ? { ...c, existingId: match.id, existingTitle: match.title } : c;
  });
}

export function buildFallbackShow(c: ImportCandidate): Show {
  const id = slugifyImportId('imp-show', c.title, c.externalConst);
  const runtime = c.runtime || 45;
  const poster = c.posterUrl || '';
  const baseGenres = c.genres.length > 0 ? [...c.genres] : [c.mediaType === 'anime' ? 'Anime' : 'Drama'];
  if (c.mediaType === 'anime' && !baseGenres.some((g) => g.toLowerCase() === 'anime')) {
    baseGenres.unshift('Anime');
  }
  const seasonNums = c.seasonDates
    ? Object.keys(c.seasonDates)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 1)
    : [];
  const maxSeason = seasonNums.length > 0 ? Math.max(...seasonNums) : 1;
  const seasons = Array.from({ length: maxSeason }, (_, idx) => {
    const sNum = idx + 1;
    const airIso = c.seasonDates?.[sNum]?.slice(0, 10) || `${c.year}-01-01`;
    return {
      number: sNum,
      episodes: [
        {
          id: `${id}-s${sNum}e1`,
          season: sNum,
          number: 1,
          title: 'Episode 1',
          airdate: airIso,
          runtime,
          stillUrl: poster,
          overview: '',
        },
      ],
    };
  });
  return {
    id,
    title: c.title,
    year: c.year,
    genres: baseGenres,
    rating: c.communityRating || 7.8,
    mediaType: 'tv',
    posterUrl: poster,
    backdropUrl: poster,
    overview: c.overview || `${c.title} (${c.year}).`,
    runtimeAvg: runtime,
    network: 'Streaming',
    totalEpisodes: seasons.length,
    seasons,
    cast: [],
  };
}

export function buildFallbackMovie(c: ImportCandidate): Movie {
  const id = slugifyImportId('imp-movie', c.title, c.externalConst);
  const poster = c.posterUrl || '';
  return {
    id,
    title: c.title,
    year: c.year,
    genres: c.genres.length > 0 ? c.genres : ['Feature Film'],
    rating: c.communityRating || 7.8,
    runtime: c.runtime || 120,
    director: c.creator || 'Feature Film',
    posterUrl: poster,
    backdropUrl: poster,
    overview: c.overview || `${c.title} (${c.year}).`,
    releaseDate: `${c.year}-01-01`,
    cast: [],
  };
}

export function buildFallbackReadItem(c: ImportCandidate): ReadItem {
  const id = slugifyImportId('imp-read', c.title, c.externalConst);
  const format = c.mediaType === 'manga' ? 'manga' : c.mediaType === 'comic' ? 'comic' : 'novel';
  const totalUnits = c.totalUnits || (format === 'comic' ? 12 : format === 'manga' ? 100 : 24);
  const cover = c.posterUrl || '';
  const cleanIsbn = c.externalConst ? extractCleanIsbn(c.externalConst) : '';
  const inferredPub = format === 'comic' ? inferComicPublisher(c.title, c.creator) : undefined;
  const isCollected =
    format === 'comic' &&
    /\b(?:omnibus|compendium|complete\s+collection|epic\s+collection|dc\s+compact(?:\s+comics)?|compact\s+(?:comics|edition)|tpb|tp|trade\s+paperback|hardcover|hc|deluxe\s+edition|absolute|box\s+set|collected|vol(?:ume)?\.?\s*\d+|book\s+(?:one|two|three|four|five|\d+))\b/i.test(
      c.title
    );
  const resolvedCreator = c.creator || inferredPub || 'Author';
  return {
    id,
    format,
    unit: format === 'comic' ? 'issues' : 'chapters',
    title: c.title,
    creator: resolvedCreator,
    year: c.year,
    totalUnits,
    baseTotalUnits: totalUnits,
    genres: c.genres.length > 0 ? c.genres : [format === 'comic' ? 'Comics' : 'Fiction'],
    rating: c.communityRating ? Number((c.communityRating / 2).toFixed(1)) : 4.3,
    coverUrl: cover,
    backdropUrl: cover,
    overview: c.overview || `${c.title} · ${resolvedCreator}.`,
    ...(isCollected ? { comicKind: 'collection' as const } : {}),
    ...(inferredPub ? { comicPublisher: inferredPub } : {}),
    ...(cleanIsbn ? { isbn: cleanIsbn } : {}),
  };
}

export function buildFallbackGameItem(c: ImportCandidate): GameItem {
  const id = slugifyImportId('imp-game', c.title, c.externalConst);
  const known = lookupKnownGameChapters(c.title);
  const cover = c.posterUrl || '';
  const platforms: GamePlatform[] = c.platformHint
    ? Array.from(new Set<GamePlatform>([c.platformHint, 'PC', 'PS5']))
    : ['PC', 'PS5'];
  return {
    id,
    title: c.title,
    developer: c.creator || 'Studio',
    year: c.year,
    genres: c.genres.length > 0 ? c.genres : ['Video Game'],
    rating: c.communityRating ? Number((c.communityRating / 2).toFixed(1)) : 4.5,
    platforms,
    coverUrl: cover,
    backdropUrl: cover,
    overview: c.overview || `${c.title} (${c.year}).`,
    totalChapters: known?.totalChapters,
    chapterUnit: known?.unit,
    chapterSource: known?.source,
    chapterNote: known?.note,
  };
}
