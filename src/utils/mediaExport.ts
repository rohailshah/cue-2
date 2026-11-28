import type {
  CollectionDetails,
  CompletionRun,
  CueStoreState,
  OwnershipStatus,
  ReadItem,
  Show,
} from '../types';

export type ExportScope = 'all' | 'watch' | 'read' | 'play';

export function csvEscape(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isoToYmd(iso?: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function formatPrice(col?: CollectionDetails): string {
  if (!col || typeof col.price !== 'number' || !Number.isFinite(col.price)) return '';
  return col.price.toFixed(2);
}

function ownershipLabel(ownership: OwnershipStatus | undefined, target: OwnershipStatus): string {
  return ownership === target ? 'Yes' : 'No';
}

function countWatchedEpisodes(show: Show, episodeCounts: Record<string, number> | undefined): number {
  if (!episodeCounts) return 0;
  let count = 0;
  for (const season of show.seasons || []) {
    for (const ep of season.episodes || []) {
      const key = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
      if ((episodeCounts[key] || 0) > 0) count += 1;
    }
  }
  if (count === 0) {
    count = Object.values(episodeCounts).filter((n) => n > 0).length;
  }
  return count;
}

function showStatusLabel(status?: string): string {
  if (status === 'finished') return 'Finished';
  if (status === 'watching') return 'Watching';
  return 'Watchlist';
}

function readStatusLabel(status?: string): string {
  if (status === 'finished') return 'Finished';
  if (status === 'reading') return 'Reading';
  return 'Want to Read';
}

function gameStatusLabel(status?: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'playing') return 'Playing';
  if (status === 'dropped') return 'Dropped';
  return 'Backlog';
}

const LIBRARY_CSV_HEADERS = [
  'Domain',
  'Type',
  'Publisher / Studio',
  'Series / Collection',
  'Title',
  'Release Year',
  'Status',
  'Progress',
  'My Rating',
  'Finished Date',
  'Runs',
  'In Collection',
  'In Wishlist',
  'Media Format',
  'Price Paid',
  'Date Purchased',
  'Platform / Owner',
  'Includes',
  'Notes',
];

/** Exports the user's Cue library (or domain slice) as a clean, Excel/Google Sheets-ready CSV with UTF-8 BOM. */
export function exportLibraryCsv(state: CueStoreState, scope: ExportScope = 'all'): string {
  const rows: Array<{ domainOrder: number; title: string; cells: Array<unknown> }> = [];
  const incWatch = scope === 'all' || scope === 'watch';
  const incRead = scope === 'all' || scope === 'read';
  const incPlay = scope === 'all' || scope === 'play';

  if (incWatch) {
    for (const id of state.showOrder) {
      const s = state.shows[id];
      const p = state.showProgress[id];
      if (!s) continue;
      if (!p?.bookmarked && !p?.ownership && p?.status !== 'watching' && p?.status !== 'finished') {
        continue;
      }
      const watchedEps = countWatchedEpisodes(s, p?.episodeCounts);
      const totalEps = Math.max(s.totalEpisodes || 0, watchedEps);
      const isAnime =
        s.mediaType === 'anime' || s.genres.some((g) => g.toLowerCase() === 'anime');
      const col = p?.collection;
      rows.push({
        domainOrder: 0,
        title: s.title,
        cells: [
          'Watch',
          isAnime ? 'Anime' : 'TV Show',
          s.network || '',
          '',
          s.title,
          s.year || '',
          showStatusLabel(p?.status),
          totalEps > 0 ? `${watchedEps}/${totalEps} eps` : '',
          p?.rating ? p.rating : '',
          isoToYmd(p?.finishedAt || p?.lastWatchedAt),
          p?.completedRuns?.length || (p?.status === 'finished' ? 1 : ''),
          ownershipLabel(p?.ownership, 'owned'),
          ownershipLabel(p?.ownership, 'wishlist'),
          col?.format || '',
          formatPrice(col),
          isoToYmd(col?.acquiredAt),
          col?.owner || '',
          col?.includes || '',
          col?.notes || '',
        ],
      });
    }

    for (const id of state.movieOrder) {
      const m = state.movies[id];
      const p = state.movieProgress[id];
      if (!m || !p) continue;
      const col = p.collection;
      rows.push({
        domainOrder: 0,
        title: m.title,
        cells: [
          'Watch',
          'Movie',
          m.director || '',
          '',
          m.title,
          m.year || '',
          p.status === 'watched' ? 'Watched' : p.status === 'coming_soon' ? 'Coming Soon' : 'Watchlist',
          p.watchCount > 0 ? `${p.watchCount}x` : '',
          p.rating ? p.rating : '',
          isoToYmd(p.watchedAt),
          p.completedRuns?.length || p.watchCount || '',
          ownershipLabel(p.ownership, 'owned'),
          ownershipLabel(p.ownership, 'wishlist'),
          col?.format || '',
          formatPrice(col),
          isoToYmd(col?.acquiredAt),
          col?.owner || '',
          col?.includes || '',
          col?.notes || '',
        ],
      });
    }
  }

  if (incRead) {
    for (const id of state.readOrder) {
      const r = state.readItems[id];
      const p = state.readProgress[id];
      if (!r) continue;
      if (!p?.bookmarked && !p?.ownership && p?.status !== 'reading' && p?.status !== 'finished') {
        continue;
      }
      const col = p?.collection;
      const notes = [col?.notes, p?.collectionNote].filter(Boolean).join(' · ');
      const typeLabel =
        r.format === 'comic' ? 'Comic' : r.format === 'manga' ? 'Manga' : 'Novel';
      rows.push({
        domainOrder: 1,
        title: r.title,
        cells: [
          'Read',
          typeLabel,
          r.comicPublisher || r.creator || '',
          r.comicRunLabel || r.comicSeriesVolTitle || p?.editionTitle || '',
          r.title,
          r.year || '',
          readStatusLabel(p?.status),
          r.totalUnits > 0 ? `${p?.currentUnit || 0}/${r.totalUnits} ${r.unit}` : '',
          p?.rating ? p.rating : '',
          isoToYmd(p?.finishedAt || p?.lastReadAt),
          p?.completedRuns?.length || p?.rereadCount || (p?.status === 'finished' ? 1 : ''),
          ownershipLabel(p?.ownership, 'owned'),
          ownershipLabel(p?.ownership, 'wishlist'),
          col?.format || '',
          formatPrice(col),
          isoToYmd(col?.acquiredAt),
          col?.owner || '',
          col?.includes || '',
          notes,
        ],
      });
    }
  }

  if (incPlay) {
    for (const id of state.gameOrder) {
      const g = state.games[id];
      const p = state.gameProgress[id];
      if (!g) continue;
      if (!p?.bookmarked && !p?.ownership && !p?.status) continue;
      const col = p?.collection;
      const platOwner = [col?.platform || p?.platform, col?.owner].filter(Boolean).join(' · ');
      const progressParts: string[] = [];
      if (p?.completionPct) progressParts.push(`${p.completionPct}%`);
      if (p?.hoursPlayed) progressParts.push(`${p.hoursPlayed}h`);
      rows.push({
        domainOrder: 2,
        title: g.title,
        cells: [
          'Play',
          'Game',
          g.developer || '',
          g.franchise || '',
          g.title,
          g.year || '',
          gameStatusLabel(p?.status),
          progressParts.join(' · '),
          p?.rating ? p.rating : '',
          isoToYmd(p?.finishedAt || p?.lastPlayedAt),
          p?.completedRuns?.length || p?.playthroughCount || (p?.status === 'completed' ? 1 : ''),
          ownershipLabel(p?.ownership, 'owned'),
          ownershipLabel(p?.ownership, 'wishlist'),
          col?.format || '',
          formatPrice(col),
          isoToYmd(col?.acquiredAt),
          platOwner,
          col?.includes || '',
          col?.notes || '',
        ],
      });
    }
  }

  rows.sort((a, b) => a.domainOrder - b.domainOrder || a.title.localeCompare(b.title));
  return rowsToCsv(
    LIBRARY_CSV_HEADERS,
    rows.map((r) => r.cells)
  );
}

const COMICS_CSV_HEADERS = [
  'Publisher Name',
  'Series Name',
  'Full Title',
  'Release Date',
  'In Collection',
  'In Wish List',
  'Marked Read',
  'My Rating',
  'Media Format',
  'Price Paid',
  'Date Purchased',
  'Condition',
  'Notes',
  'Tags',
];

function inferComicFormatLabel(item: ReadItem, formatOverride?: string): string {
  if (formatOverride) return formatOverride;
  if (item.format === 'comic') return 'Print';
  if (item.format === 'manga') return 'Manga';
  return 'Book';
}

/** Exports Read library items (plus tracked comic issues) matching the League of Comic Geeks spreadsheet column schema. */
export function exportComicsCsv(state: CueStoreState): string {
  const rows: Array<{ publisher: string; series: string; sortTitle: string; cells: Array<unknown> }> = [];

  for (const id of state.readOrder) {
    const item = state.readItems[id];
    const prog = state.readProgress[id];
    if (!item) continue;
    if (!prog?.bookmarked && !prog?.ownership && prog?.status !== 'reading' && prog?.status !== 'finished') {
      continue;
    }

    const publisher = item.comicPublisher || item.creator || '';
    const baseSeries = item.comicSeriesVolTitle || item.title;
    const seriesName = item.year && !baseSeries.includes(String(item.year))
      ? `${baseSeries} (${item.year})`
      : baseSeries;
    const col = prog?.collection;
    const notes = [col?.notes, prog?.collectionNote].filter(Boolean).join(' · ');
    const tags = [
      item.format,
      ...(item.genres || []).filter((g) => g.toLowerCase() !== item.format),
      col?.owner ? `Owner: ${col.owner}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    rows.push({
      publisher,
      series: seriesName,
      sortTitle: item.title,
      cells: [
        publisher,
        seriesName,
        item.title,
        item.year ? String(item.year) : '',
        prog?.ownership === 'owned' ? '1' : '0',
        prog?.ownership === 'wishlist' ? '1' : '0',
        prog?.status === 'finished' ? '1' : '0',
        prog?.rating ? String(prog.rating) : '',
        inferComicFormatLabel(item, col?.format),
        formatPrice(col),
        isoToYmd(col?.acquiredAt),
        '',
        notes,
        tags,
      ],
    });

    // Emit tracked per-issue rows for comic runs/collections
    if (item.format === 'comic') {
      const completedSet = new Set(prog?.completedUnits || []);
      const issueNums = new Set<number>([
        ...completedSet,
        ...Object.keys(prog?.unitOwnership || {}).map(Number),
        ...Object.keys(prog?.unitRatings || {}).map(Number),
        ...Object.keys(prog?.unitVariantNotes || {}).map(Number),
      ]);
      const sortedNums = Array.from(issueNums)
        .filter((n) => Number.isFinite(n) && n >= 1)
        .sort((a, b) => a - b);

      for (const num of sortedNums) {
        const meta = item.issueDetails?.[num];
        const issueLabel = meta?.issueLabel || String(num);
        const issueOwner = prog?.unitOwnership?.[num];
        const issueRating = prog?.unitRatings?.[num];
        const issueNote = prog?.unitVariantNotes?.[num] || '';
        const issueRelease =
          isoToYmd(meta?.releaseDateIso) || meta?.releaseDate || '';

        rows.push({
          publisher,
          series: seriesName,
          sortTitle: `${item.title} #${String(num).padStart(5, '0')}`,
          cells: [
            publisher,
            seriesName,
            `${item.title} #${issueLabel}`,
            issueRelease,
            issueOwner === 'owned' ? '1' : '0',
            issueOwner === 'wishlist' ? '1' : '0',
            completedSet.has(num) ? '1' : '0',
            issueRating ? String(issueRating) : '',
            col?.format || 'Print',
            '',
            '',
            '',
            issueNote,
            'Single Issue',
          ],
        });
      }
    }
  }

  rows.sort(
    (a, b) =>
      a.publisher.localeCompare(b.publisher) ||
      a.series.localeCompare(b.series) ||
      a.sortTitle.localeCompare(b.sortTitle)
  );

  return rowsToCsv(
    COMICS_CSV_HEADERS,
    rows.map((r) => r.cells)
  );
}

interface ExportLogLineItem {
  ymd: string;
  emoji: string;
  title: string;
  rating?: number;
  note?: string;
}

function formatGcalDateHeader(ymd: string): { dayNum: string; monthYearDay: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    dayNum: String(d),
    monthYearDay: `${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}, ${weekdays[dt.getUTCDay()]}`,
  };
}

function pushRunsOrPrimary(
  events: ExportLogLineItem[],
  runs: CompletionRun[] | undefined,
  primaryIso: string | undefined,
  emoji: string,
  title: string,
  rating?: number
): void {
  const seenDays = new Set<string>();
  const sorted = [...(runs || [])].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const ymd = isoToYmd(r.finishedAt);
    if (!ymd || seenDays.has(ymd)) continue;
    seenDays.add(ymd);
    const isLatest = i === sorted.length - 1;
    events.push({
      ymd,
      emoji,
      title,
      rating: isLatest ? rating : undefined,
      note: r.note,
    });
  }

  const primaryYmd = isoToYmd(primaryIso);
  if (primaryYmd && !seenDays.has(primaryYmd)) {
    events.push({
      ymd: primaryYmd,
      emoji,
      title,
      rating,
    });
  }
}

/** Exports completed titles, seasons, and multi-run completions as a clean human-readable chronological .txt finished log. */
export function exportFinishedLogTxt(state: CueStoreState): string {
  const events: ExportLogLineItem[] = [];

  for (const id of state.showOrder) {
    const s = state.shows[id];
    const p = state.showProgress[id];
    if (!s || !p) continue;

    const seasonEntries = Object.entries(p.seasonFinishedAt || {}).sort(
      (a, b) => Number(a[0]) - Number(b[0])
    );
    if (seasonEntries.length > 0) {
      for (let i = 0; i < seasonEntries.length; i++) {
        const [sNumStr, iso] = seasonEntries[i];
        const ymd = isoToYmd(iso);
        if (!ymd) continue;
        const sNum = Number(sNumStr);
        const sRating = p.seasonRatings?.[sNum] ?? (i === seasonEntries.length - 1 ? p.rating : undefined);
        events.push({
          ymd,
          emoji: '📺',
          title: `${s.title} (season ${sNum})`,
          rating: sRating,
        });
      }
    } else if (p.status === 'finished' || (p.completedRuns && p.completedRuns.length > 0)) {
      pushRunsOrPrimary(
        events,
        p.completedRuns,
        p.finishedAt || p.lastWatchedAt,
        '📺',
        s.title,
        p.rating
      );
    }
  }

  for (const id of state.movieOrder) {
    const m = state.movies[id];
    const p = state.movieProgress[id];
    if (!m || !p) continue;
    if (p.status === 'watched' || (p.completedRuns && p.completedRuns.length > 0)) {
      const label = m.year ? `${m.title} (${m.year})` : m.title;
      pushRunsOrPrimary(events, p.completedRuns, p.watchedAt, '🎬', label, p.rating);
    }
  }

  for (const id of state.readOrder) {
    const r = state.readItems[id];
    const p = state.readProgress[id];
    if (!r || !p) continue;
    if (p.status === 'finished' || (p.completedRuns && p.completedRuns.length > 0)) {
      const emoji = p.collection?.format?.toLowerCase().includes('audio') ? '🎧' : '📖';
      const label = r.format === 'novel' && r.creator && r.creator !== 'Author'
        ? `${r.title} by ${r.creator}`
        : r.title;
      pushRunsOrPrimary(
        events,
        p.completedRuns,
        p.finishedAt || p.lastReadAt,
        emoji,
        label,
        p.rating
      );
    }
  }

  for (const id of state.gameOrder) {
    const g = state.games[id];
    const p = state.gameProgress[id];
    if (!g || !p) continue;
    if (p.status === 'completed' || (p.completedRuns && p.completedRuns.length > 0)) {
      const plat = p.platform ? ` (${p.platform})` : '';
      pushRunsOrPrimary(
        events,
        p.completedRuns,
        p.finishedAt || p.lastPlayedAt,
        '🎮',
        `${g.title}${plat}`,
        p.rating
      );
    }
  }

  if (events.length === 0) {
    return 'No completed titles with finished dates yet.\n';
  }

  events.sort((a, b) => a.ymd.localeCompare(b.ymd) || a.title.localeCompare(b.title));

  const out: string[] = [];
  let prevYmd = '';
  for (const ev of events) {
    if (ev.ymd !== prevYmd) {
      const { dayNum, monthYearDay } = formatGcalDateHeader(ev.ymd);
      out.push(dayNum, monthYearDay);
      prevYmd = ev.ymd;
    }
    out.push('All day');
    const notePart = ev.note && !/^season\s+\d+/i.test(ev.note) ? ` (${ev.note})` : '';
    const stars = ev.rating && ev.rating >= 1
      ? ` ${'⭐'.repeat(Math.min(5, Math.max(1, Math.round(ev.rating))))}`
      : '';
    out.push(`${ev.emoji} Finished ${ev.title}${notePart}${stars}`);
  }

  return `${out.join('\n')}\n`;
}
