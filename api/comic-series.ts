export type ComicWikiSlug =
  | 'marvel'
  | 'dc'
  | 'imagecomics'
  | 'darkhorse'
  | 'idw'
  | 'boom'
  | 'comicvine';

export interface ComicSeriesSearchItem {
  id: string;
  wiki: ComicWikiSlug;
  volTitle: string;
  volNumber: number;
  title: string;
  publisher: string;
  startYear: number;
  endYear?: number;
  isOngoing: boolean;
  runLabel: string;
  issueCount: number;
  coverUrl: string;
  creator: string;
  genres: string[];
  overview: string;
  comicKind?: 'series' | 'collection';
  collectionPageTitle?: string;
}

export interface ComicSeriesIssueItem {
  number: number;
  issueLabel: string;
  title?: string;
  seriesTitle?: string;
  releaseDate?: string;
  releaseDateIso?: string;
  coverUrl?: string;
  synopsis?: string;
  writers?: string;
  artists?: string;
  wiki?: ComicWikiSlug;
  pageTitle?: string;
  atomicId?: string;
}

const UA_HEADER = 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)';

async function upstreamFetch(url: string, timeoutMs = 5500): Promise<Response> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA_HEADER },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status !== 429) return res;

  const rawRetry = Number(res.headers.get('Retry-After'));
  const waitMs = Number.isFinite(rawRetry)
    ? Math.min(1200, Math.max(300, Math.round(rawRetry * 1000)))
    : 500;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return fetch(url, {
    headers: { 'User-Agent': UA_HEADER },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

const WIKI_PUBLISHER: Record<ComicWikiSlug, string> = {
  marvel: 'Marvel Comics',
  dc: 'DC Comics',
  imagecomics: 'Image Comics',
  darkhorse: 'Dark Horse Comics',
  idw: 'IDW Publishing',
  boom: 'BOOM! Studios',
  comicvine: 'Comic Vine',
};

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWikitext(raw?: string): string {
  if (!raw) return '';
  return raw
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)/g, '$1')
    .replace(/\]\]/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,3}/g, '')
    .replace(/;/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWikitextField(wikitext: string, fieldPattern: string): string | undefined {
  const m = wikitext.match(new RegExp(`\\|\\s*(?:${fieldPattern})\\s*=[^\\S\\r\\n]*([^\\n]+)`, 'i'));
  if (!m?.[1]) return undefined;
  const cleaned = cleanWikitext(m[1]).replace(/,\s*$/, '').trim();
  return cleaned.length >= 2 && !/^\|/.test(cleaned) ? cleaned : undefined;
}

function extractIssueSynopsis(wikitext: string): string | undefined {
  if (!wikitext) return undefined;
  let raw = '';
  const fieldMatch = wikitext.match(
    /\|\s*(?:Solicit|Synopsis1?)\s*=[^\S\r\n]*([\s\S]*?)(?=\n\s*\||\n\s*\}\})/i
  );
  if (fieldMatch?.[1]) {
    raw = fieldMatch[1];
  } else {
    const secMatch = wikitext.match(
      /==+\s*(?:Solicit|Synopsis[^=]*)\s*==+\s*\n([\s\S]*?)(?=\n==|$)/i
    );
    if (secMatch?.[1]) raw = secMatch[1];
  }
  const cleaned = cleanWikitext(raw);
  if (!cleaned || cleaned.length < 25 || /^no synopsis/i.test(cleaned)) return undefined;
  if (cleaned.length <= 420) return cleaned;
  const slice = cleaned.slice(0, 420);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > 260 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

function parseQueryAndYear(rawQuery: string): { baseQuery: string; targetYear?: number } {
  const trimmed = rawQuery.replace(/\s+/g, ' ').trim();
  const yearMatches = [...trimmed.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  if (yearMatches.length > 0) {
    const last = yearMatches[yearMatches.length - 1];
    const without = trimmed.replace(last[0], '').replace(/\s+/g, ' ').trim();
    if (without.length >= 2) {
      return { baseQuery: without, targetYear: Number(last[1]) };
    }
  }
  return { baseQuery: trimmed };
}

function upscaleFandomThumb(url?: string): string {
  if (!url) return '';
  return url.replace(/\/scale-to-width-down\/\d+/i, '/scale-to-width-down/480');
}

function parseWikiMonth(raw?: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const numMonth = Number(trimmed);
  if (Number.isInteger(numMonth) && numMonth >= 1 && numMonth <= 12) {
    return numMonth;
  }
  const cleanMo = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (cleanMo.length < 3) return null;
  const idx = MONTH_ABBR.findIndex(
    (m) => cleanMo.startsWith(m.toLowerCase()) || m.toLowerCase() === cleanMo.slice(0, 3)
  );
  return idx >= 0 ? idx + 1 : null;
}

function formatUtcDateParts(
  year: number,
  zeroBasedMonth: number,
  day: number
): { releaseDate: string; releaseDateIso: string } {
  const dt = new Date(Date.UTC(year, zeroBasedMonth, day));
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth();
  const d = dt.getUTCDate();
  return {
    releaseDate: `${MONTH_ABBR[m]} ${d}, ${y}`,
    releaseDateIso: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

function extractIssueReleaseDate(
  rawWikitext: string,
  wiki: ComicWikiSlug,
  categories?: Array<{ title?: string }>
): { releaseDate?: string; releaseDateIso?: string } {
  const relDirect = rawWikitext.match(/\|\s*ReleaseDate\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  if (relDirect) {
    const cleanRel = cleanWikitext(relDirect);
    const isoM = cleanRel.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      return formatUtcDateParts(Number(isoM[1]), Number(isoM[2]) - 1, Number(isoM[3]));
    }
    const mdyM = cleanRel.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (mdyM) {
      const m1 = parseWikiMonth(mdyM[1]);
      if (m1) return formatUtcDateParts(Number(mdyM[3]), m1 - 1, Number(mdyM[2]));
    }
    const dmyM = cleanRel.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
    if (dmyM) {
      const m1 = parseWikiMonth(dmyM[2]);
      if (m1) return formatUtcDateParts(Number(dmyM[3]), m1 - 1, Number(dmyM[1]));
    }
    const moYrM = cleanRel.match(/^([A-Za-z]+),?\s+(\d{4})$/);
    if (moYrM) {
      const m1 = parseWikiMonth(moYrM[1]);
      if (m1) return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${moYrM[2]}` };
    }
  }

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubFull = t.match(/^Category:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*\(Publication\)$/i);
    if (pubFull) {
      const m1 = parseWikiMonth(pubFull[1]);
      if (m1) return formatUtcDateParts(Number(pubFull[3]), m1 - 1, Number(pubFull[2]));
    }
  }

  const dayRaw = rawWikitext.match(/\|\s*Day\s*=\s*(\d{1,2})/i)?.[1]?.trim();
  const dayNum = dayRaw ? Number(dayRaw) : 0;

  for (const cat of categories || []) {
    const t = cat.title || '';
    const pubMo = t.match(/^Category:\s*(\d{4}),\s*([A-Za-z]+)\s*\(Publication\)$/i);
    if (pubMo) {
      const m1 = parseWikiMonth(pubMo[2]);
      if (m1 && dayNum >= 1 && dayNum <= 31) {
        return formatUtcDateParts(Number(pubMo[1]), m1 - 1, dayNum);
      }
      if (m1) {
        return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${pubMo[1]}` };
      }
    }
  }

  const moRaw = rawWikitext.match(/\|\s*(?:Month|PubMonth)\s*=\s*([^\n|]+)/i)?.[1]?.trim();
  const yrRaw = rawWikitext.match(/\|\s*Year\s*=\s*(\d{4})/i)?.[1]?.trim();
  if (!yrRaw) return {};
  const yrNum = Number(yrRaw);
  const m1 = parseWikiMonth(moRaw);

  if (m1 && dayNum >= 1 && dayNum <= 31) {
    // DC wiki templates store Month/Year as the cover date (~2 months after on-sale date).
    const zeroBasedMonth = wiki === 'dc' ? m1 - 3 : m1 - 1;
    return formatUtcDateParts(yrNum, zeroBasedMonth, dayNum);
  }
  if (m1) {
    if (wiki === 'dc') {
      const dt = new Date(Date.UTC(yrNum, m1 - 3, 1));
      return { releaseDate: `${MONTH_ABBR[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` };
    }
    return { releaseDate: `${MONTH_ABBR[m1 - 1]} ${yrRaw}` };
  }
  return { releaseDate: yrRaw };
}

function makeServerComicAtomicId(wiki: ComicWikiSlug, pageTitle: string): string {
  const norm = pageTitle
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `comic:${wiki}:${norm}`;
}

function deriveSeriesTitleFromPageTitle(pageTitle?: string): string | undefined {
  if (!pageTitle) return undefined;
  const m = pageTitle.match(/^(.+?)\s+Vol\s+\d+(?:\s|$)/i);
  const raw = m?.[1]?.trim();
  if (!raw) return undefined;
  return /^amazing spider-man$/i.test(raw) ? `The ${raw}` : raw;
}

function deriveRawIssueNumFromPageTitle(pageTitle: string): string {
  const afterVol = pageTitle.match(/\bVol\s+\d+\s+([^\s:]+)(?::.*)?$/i)?.[1];
  if (afterVol) return afterVol.trim();
  const tailNum = pageTitle.match(/#?\b(\d+(?:\.[A-Za-z0-9]+)?)$/)?.[1];
  return tailNum || '1';
}

function getRevisionText(page?: MediaWikiQueryPage): string {
  const rev = page?.revisions?.[0] as
    | { '*'?: string; slots?: { main?: { '*'?: string } } }
    | undefined;
  return rev?.slots?.main?.['*'] || rev?.['*'] || '';
}

function inferWikiOrder(hintText: string, wikiHint?: ComicWikiSlug): ComicWikiSlug[] {
  const all: ComicWikiSlug[] = ['marvel', 'dc', 'imagecomics'];
  const hay = hintText.toLowerCase();
  let preferred: ComicWikiSlug | undefined = wikiHint;
  if (!preferred) {
    if (
      /\b(marvel|thor|spider-man|x-men|avengers|daredevil|wolverine|iron man|captain america|hulk|annihilation|guardians of the galaxy|silver surfer|fantastic four|secret wars|war of the realms|mighty thor|unworthy thor)\b/.test(
        hay
      )
    ) {
      preferred = 'marvel';
    } else if (
      /\b(dc comics|dc|batman|superman|wonder woman|justice league|green lantern|the flash|nightwing|aquaman|teen titans|sandman|watchmen|supergirl|absolute)\b/.test(
        hay
      )
    ) {
      preferred = 'dc';
    } else if (
      /\b(image comics|invincible|saga|walking dead|spawn|radiant black|transformers|void rivals|department of truth)\b/.test(
        hay
      )
    ) {
      preferred = 'imagecomics';
    }
  }
  return preferred ? [preferred, ...all.filter((w) => w !== preferred)] : all;
}

function cleanStoryTitle(raw: string, seriesNorm: string): string | undefined {
  let s = cleanWikitext(raw);
  s = s.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!s || s.length < 2) return undefined;
  if (normTitle(s) === seriesNorm) return undefined;
  return s;
}

interface MediaWikiQueryPage {
  pageid?: number;
  title?: string;
  missing?: string;
  thumbnail?: { source?: string };
  categories?: Array<{ title?: string }>;
  categoryinfo?: { pages?: number };
  revisions?: Array<{ '*'?: string }>;
  imageinfo?: Array<{ url?: string; thumburl?: string }>;
}

function extractPrimaryCoverFilename(wikitext: string, fallbackPageTitle: string): string {
  const m = wikitext.match(/\|\s*Image1?\s*=\s*([^\n|]+)/i);
  if (m && m[1]) {
    const cleaned = m[1]
      .replace(/\[\[(?:File|Image):/i, '')
      .replace(/\]\]/g, '')
      .replace(/^(?:File|Image):/i, '')
      .split('|')[0]
      ?.trim();
    if (cleaned && /\.(?:jpe?g|png|webp|gif)$/i.test(cleaned)) {
      return cleaned;
    }
  }
  return `${fallbackPageTitle}.jpg`;
}

async function resolveWikiFileUrls(
  wiki: ComicWikiSlug,
  filenames: string[],
  width: number,
  corsOrigin = false
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(filenames.filter(Boolean)));
  if (unique.length === 0) return out;

  const chunkSize = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const originParam = corsOrigin ? '&origin=*' : '';
  await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await upstreamFetch(
        `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
          chunk.map((f) => `File:${f}`).join('|')
        )}&prop=imageinfo&iiprop=url&iiurlwidth=${width}&redirects=1&format=json${originParam}`,
        5500
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        query?: {
          normalized?: Array<{ from: string; to: string }>;
          redirects?: Array<{ from: string; to: string }>;
          pages?: Record<string, MediaWikiQueryPage>;
        };
      };

      const normMap = new Map<string, string>();
      for (const n of json.query?.normalized || []) normMap.set(n.from.toLowerCase(), n.to);
      const redirMap = new Map<string, string>();
      for (const r of json.query?.redirects || []) redirMap.set(r.from.toLowerCase(), r.to);

      const urlByTitle = new Map<string, string>();
      for (const p of Object.values(json.query?.pages || {})) {
        if (!p.title || p.missing !== undefined) continue;
        const url = p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url;
        if (url) urlByTitle.set(p.title.toLowerCase(), url);
      }

      for (const rawName of chunk) {
        let cur = `File:${rawName}`;
        const n1 = normMap.get(cur.toLowerCase());
        if (n1) cur = n1;
        const r1 = redirMap.get(cur.toLowerCase());
        if (r1) cur = r1;
        const resolved = urlByTitle.get(cur.toLowerCase()) || urlByTitle.get(`file:${rawName.toLowerCase()}`);
        if (resolved) out.set(rawName.toLowerCase(), resolved);
      }
    })
  );

  return out;
}

async function hydrateWikiVolumes(
  wiki: ComicWikiSlug,
  picked: string[]
): Promise<ComicSeriesSearchItem[]> {
  if (picked.length === 0) return [];
  try {
    const volBatchUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.join('|')
    )}&prop=categories|pageimages|revisions&rvprop=content&cllimit=500&pithumbsize=500&format=json`;
    const issue1BatchUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.map((v) => `${v} 1`).join('|')
    )}&prop=revisions|pageimages&rvprop=content&pithumbsize=500&format=json`;
    const catInfoUrl = `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
      picked.map((v) => `Category:${v}`).join('|')
    )}&prop=categoryinfo&format=json`;

    const [volRes, issueRes, catRes] = await Promise.allSettled([
      upstreamFetch(volBatchUrl, 5500),
      upstreamFetch(issue1BatchUrl, 5500),
      upstreamFetch(catInfoUrl, 5500),
    ]);

    const volMap = new Map<string, MediaWikiQueryPage>();
    if (volRes.status === 'fulfilled' && volRes.value.ok) {
      const json = (await volRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && p.missing === undefined) volMap.set(p.title.toLowerCase(), p);
      }
    }

    const issue1Map = new Map<string, MediaWikiQueryPage>();
    if (issueRes.status === 'fulfilled' && issueRes.value.ok) {
      const json = (await issueRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && p.missing === undefined) issue1Map.set(p.title.toLowerCase(), p);
      }
    }

    const catCountMap = new Map<string, number>();
    if (catRes.status === 'fulfilled' && catRes.value.ok) {
      const json = (await catRes.value.json()) as {
        query?: { pages?: Record<string, MediaWikiQueryPage> };
      };
      for (const p of Object.values(json.query?.pages || {})) {
        if (p.title && typeof p.categoryinfo?.pages === 'number') {
          catCountMap.set(p.title.replace(/^Category:/i, '').toLowerCase(), p.categoryinfo.pages);
        }
      }
    }

    const coverFilenames = picked.map((v) => {
      const i1 = issue1Map.get(`${v} 1`.toLowerCase());
      const txt = i1?.revisions?.[0]?.['*'] || '';
      return extractPrimaryCoverFilename(txt, `${v} 1`);
    });
    const coverAUrlMap = await resolveWikiFileUrls(wiki, coverFilenames, 480);

    const results: ComicSeriesSearchItem[] = [];
    for (let vIdx = 0; vIdx < picked.length; vIdx += 1) {
      const volTitle = picked[vIdx];
      const volPage = volMap.get(volTitle.toLowerCase());
      if (!volPage) continue;
      const issue1 = issue1Map.get(`${volTitle} 1`.toLowerCase());
      const volText = volPage.revisions?.[0]?.['*'] || '';
      const issue1Text = issue1?.revisions?.[0]?.['*'] || '';
      const cats = (volPage.categories || []).map((c) => c.title || '');
      const coverAFile = coverFilenames[vIdx];

      const m = volTitle.match(/^(.+?)\s+Vol\s+(\d+)$/i);
      if (!m) continue;
      const rawSeriesName = m[1].trim();
      const volNumber = Number(m[2]);

      const debutCat = cats.find((c) => /(?:Volume Debuts|Comic Debuts)$/i.test(c));
      const debutCatYear = debutCat ? Number(debutCat.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : 0;
      const startYearField = Number(volText.match(/\|\s*StartYear\s*=\s*(\d{4})/i)?.[1] || 0);
      const issue1YearField = Number(issue1Text.match(/\|\s*Year\s*=\s*(\d{4})/i)?.[1] || 0);
      const partYearMatch = Number(
        volText.match(/\(\s*(19\d{2}|20\d{2})(?:\s*[-–—]\s*(?:19\d{2}|20\d{2}))?\s*\)/)?.[1] || 0
      );
      const startYear = startYearField || debutCatYear || issue1YearField || partYearMatch;
      if (!startYear) continue;

      const endCat = cats.find((c) => /(?:Volume Ends|Last Issues)$/i.test(c));
      const endCatYear = endCat ? Number(endCat.match(/\b(19\d{2}|20\d{2})\b/)?.[1]) : 0;
      const endYearField = Number(volText.match(/\|\s*EndYear\s*=\s*(\d{4})/i)?.[1] || 0);
      const endYear = endYearField || endCatYear || undefined;
      const isFinishedCat = cats.some((c) => /Finished Volumes$/i.test(c));
      const isOngoing = !endYear && !isFinishedCat;

      const totalIssuesField = Number(volText.match(/\|\s*TotalIssues\s*=\s*(\d+)/i)?.[1] || 0);
      const catCount = catCountMap.get(volTitle.toLowerCase()) || 0;
      const issueCount = Math.max(1, catCount || totalIssuesField || 12);

      const coverUrl =
        coverAUrlMap.get(coverAFile.toLowerCase()) ||
        upscaleFandomThumb(issue1?.thumbnail?.source) ||
        upscaleFandomThumb(volPage.thumbnail?.source) ||
        '';
      if (!coverUrl) continue;

      const publisher = WIKI_PUBLISHER[wiki];
      const creatorRaw =
        volText.match(/\|\s*Creators?\s*=\s*([^\n|]+)/i)?.[1] ||
        issue1Text.match(/\|\s*Writers?\d*\s*=\s*([^\n|]+)/i)?.[1] ||
        '';
      const creatorCleaned = cleanWikitext(creatorRaw).split(',')[0]?.trim();
      const creator = creatorCleaned || publisher;

      const genresRaw = cleanWikitext(volText.match(/\|\s*genres?\s*=\s*([^\n|]+)/i)?.[1]);
      const genres = genresRaw
        ? genresRaw
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
            .slice(0, 3)
        : ['Superhero'];

      const displayTitle = /^amazing spider-man$/i.test(rawSeriesName)
        ? `The ${rawSeriesName}`
        : rawSeriesName;
      const runLabel = isOngoing
        ? `${startYear} – Present`
        : endYear && endYear !== startYear
          ? `${startYear} – ${endYear}`
          : String(startYear);

      results.push({
        id: `comic-series-${wiki}-${volTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        wiki,
        volTitle,
        volNumber,
        title: displayTitle,
        publisher,
        startYear,
        endYear,
        isOngoing,
        runLabel,
        issueCount,
        coverUrl,
        creator,
        genres,
        overview: `${displayTitle} (Vol. ${volNumber} · ${runLabel}) published by ${publisher}. Tracking ${issueCount} ${
          issueCount === 1 ? 'issue' : 'issues'
        }.`,
      });
    }

    return results;
  } catch {
    return [];
  }
}

async function queryWikiComicVolumes(
  wiki: ComicWikiSlug,
  baseQuery: string
): Promise<ComicSeriesSearchItem[]> {
  const clean = baseQuery.replace(/^the\s+/i, '').trim();
  if (clean.length < 2) return [];
  const targetNorm = normTitle(clean);
  const queryWords = targetNorm.split(' ').filter(Boolean);

  try {
    const [prefixRes, searchRes] = await Promise.allSettled([
      upstreamFetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(
          `${clean} Vol `
        )}&pslimit=25&format=json`,
        5000
      ),
      upstreamFetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          `"${clean}" Vol`
        )}&srlimit=12&format=json`,
        5000
      ),
    ]);

    const candidateTitles: string[] = [];
    const seenTitle = new Set<string>();
    const addCandidate = (t?: string) => {
      if (!t) return;
      const m = t.match(/^(.+?)\s+Vol\s+(\d+)$/i);
      if (!m) return;
      if (
        /\b(?:epic collection|marvel masterworks|omnibus|compendium|treasury edition|facsimile|worldwide|tpb|hc|hardcover|trade paperback|collected edition|box set|coloring book)\b/i.test(
          m[1]
        )
      ) {
        return;
      }
      const baseNorm = normTitle(m[1]);
      if (
        baseNorm !== targetNorm &&
        !queryWords.every((w) => baseNorm.includes(w))
      ) {
        return;
      }
      if (!seenTitle.has(t)) {
        seenTitle.add(t);
        candidateTitles.push(t);
      }
    };

    if (prefixRes.status === 'fulfilled' && prefixRes.value.ok) {
      const json = (await prefixRes.value.json()) as {
        query?: { prefixsearch?: Array<{ title?: string }> };
      };
      for (const hit of json.query?.prefixsearch || []) addCandidate(hit.title);
    }
    if (searchRes.status === 'fulfilled' && searchRes.value.ok) {
      const json = (await searchRes.value.json()) as {
        query?: { search?: Array<{ title?: string }> };
      };
      for (const hit of json.query?.search || []) addCandidate(hit.title);
    }

    if (candidateTitles.length === 0) return [];

    // Prioritize exact base-title volumes first, newest volume number first
    candidateTitles.sort((a, b) => {
      const ma = a.match(/^(.+?)\s+Vol\s+(\d+)$/i)!;
      const mb = b.match(/^(.+?)\s+Vol\s+(\d+)$/i)!;
      const exactA = normTitle(ma[1]) === targetNorm ? 1 : 0;
      const exactB = normTitle(mb[1]) === targetNorm ? 1 : 0;
      if (exactB !== exactA) return exactB - exactA;
      return Number(mb[2]) - Number(ma[2]);
    });

    return await hydrateWikiVolumes(wiki, candidateTitles.slice(0, 10));
  } catch {
    return [];
  }
}

const FLAGSHIP_TRENDING_VOLUMES: Partial<Record<ComicWikiSlug, string[]>> = {
  dc: [
    'Absolute Batman Vol 1',
    'Absolute Wonder Woman Vol 1',
    'Absolute Superman Vol 1',
    'Batman Vol 4',
    'Absolute Flash Vol 1',
    'Absolute Martian Manhunter Vol 1',
    'Absolute Green Lantern Vol 1',
    'Justice League Unlimited Vol 2',
    'Green Lantern Vol 7',
    'Superman Vol 6',
    'Nightwing Vol 4',
  ],
  marvel: [
    'Ultimate Spider-Man Vol 3',
    'Amazing Spider-Man Vol 7',
    'Ultimate Wolverine Vol 1',
    'Ultimate X-Men Vol 2',
    'Ultimate Black Panther Vol 1',
    'Uncanny X-Men Vol 6',
    'X-Men Vol 7',
    'Fantastic Four Vol 7',
    'Daredevil Vol 8',
    'Avengers Vol 9',
  ],
  imagecomics: [
    'Transformers Vol 1',
    'Void Rivals Vol 1',
    'Saga Vol 1',
    'Radiant Black Vol 1',
  ],
};

/** Fetches flagship ongoing comic series runs across DC, Marvel, and Image wikis with Cover A art. */
export async function fetchTrendingComicSeriesPayload(
  limit = 18
): Promise<{ items: ComicSeriesSearchItem[] }> {
  const [dcRes, marvelRes, imageRes] = await Promise.allSettled([
    hydrateWikiVolumes('dc', FLAGSHIP_TRENDING_VOLUMES.dc || []),
    hydrateWikiVolumes('marvel', FLAGSHIP_TRENDING_VOLUMES.marvel || []),
    hydrateWikiVolumes('imagecomics', FLAGSHIP_TRENDING_VOLUMES.imagecomics || []),
  ]);

  const pools: ComicSeriesSearchItem[][] = [
    dcRes.status === 'fulfilled' ? dcRes.value : [],
    marvelRes.status === 'fulfilled' ? marvelRes.value : [],
    imageRes.status === 'fulfilled' ? imageRes.value : [],
  ];

  const interleaved: ComicSeriesSearchItem[] = [];
  const seen = new Set<string>();
  let idx = 0;
  while (interleaved.length < limit) {
    let added = false;
    for (const pool of pools) {
      const item = pool[idx];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        interleaved.push(item);
        added = true;
        if (interleaved.length >= limit) break;
      }
    }
    if (!added) break;
    idx += 1;
  }

  return { items: interleaved };
}

/** Parses creator qualifier queries like "Thor by Jason Aaron" or "Batman by Scott Snyder Omnibus". */
function parseCreatorQualifiedQuery(rawQuery: string): {
  seriesHint: string;
  creatorHint?: string;
  wantsOmnibus: boolean;
} {
  const trimmed = rawQuery.replace(/\s+/g, ' ').trim();
  const wantsOmnibus =
    /\b(?:omnibus|complete collection|epic collection|compendium|absolute|deluxe|hc|hardcover|tpb)\b/i.test(
      trimmed
    );
  const withoutEd = trimmed
    .replace(
      /\b(?:vol\.?|volume|book)\s*(?:\d+|i{1,3}|iv|v)\b.*$/i,
      ''
    )
    .replace(
      /\b(?:omnibus|complete collection|epic collection|compendium|absolute|deluxe|hardcover|hc|tpb|trade paperback)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  const m = withoutEd.match(/^(.+?)\s+by\s+([a-z][a-z\s.&'-]{2,42})$/i);
  if (m && m[1].trim().length >= 2 && m[2].trim().length >= 3) {
    return {
      seriesHint: m[1].trim(),
      creatorHint: m[2].trim(),
      wantsOmnibus,
    };
  }
  return {
    seriesHint: withoutEd || trimmed,
    wantsOmnibus,
  };
}

/** Extracts ordered issue page titles from Marvel ReprintOfN, DC IssueList, or Image gallery wikitext. */
function parseCollectedIssuePageTitles(wikitext: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const addPage = (raw: string) => {
    const cleaned = raw
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\[\[|\]\]$/g, '')
      .split('|')[0]
      .trim();
    if (!cleaned || cleaned.length < 3) return;
    if (/^(?:none|n\/a|-|\?)$/i.test(cleaned)) return;
    const key = cleaned.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  const addGalleryOrCisEntry = (line: string) => {
    const fileMatch = line.match(
      /^(?:Image|File):([^\n|]+?\s+Vol\s+\d+\s+[0-9A-Za-z.-]+)\.(?:jpg|jpeg|png|webp|gif)\b/i
    );
    if (fileMatch && fileMatch[1]) {
      addPage(fileMatch[1].replace(/_/g, ' '));
      return;
    }
    const cisMatch = line.match(/\{\{\s*Cis\s*\|([^|}]+)/i);
    if (cisMatch && cisMatch[1]) {
      const inner = cisMatch[1].trim();
      const hashVol = inner.match(/^(.+?)\s+Vol\.?\s*(\d+)\s*#\s*([0-9A-Za-z.-]+)$/i);
      if (hashVol) {
        addPage(`${hashVol[1].trim()} Vol ${hashVol[2]} ${hashVol[3]}`);
        return;
      }
      const hashOnly = inner.match(/^(.+?)\s*#\s*([0-9A-Za-z.-]+)$/i);
      if (hashOnly) {
        addPage(`${hashOnly[1].trim()} Vol 1 ${hashOnly[2]}`);
        return;
      }
      addPage(inner);
    }
  };

  // 1. Marvel Database ReprintOf1 .. ReprintOfN
  const marvelMatches: Array<{ idx: number; page: string }> = [];
  for (const m of wikitext.matchAll(/\|\s*ReprintOf(\d+)\s*=[^\S\r\n]*([^\n|]+)/gi)) {
    const idx = Number(m[1]);
    if (Number.isFinite(idx) && m[2]) {
      marvelMatches.push({ idx, page: m[2].trim() });
    }
  }
  if (marvelMatches.length > 0) {
    marvelMatches.sort((a, b) => a.idx - b.idx);
    for (const entry of marvelMatches) addPage(entry.page);
    if (out.length > 0) return out;
  }

  // 2. DC / Image Database | IssueList = ... with {{c|Batman Vol 2 1}} or {{Cis|Invincible #1}} / gallery
  const dcBlock = wikitext.match(/\|\s*(?:IssueList|Issues|Contents)\s*=([\s\S]*?)(?=\n\s*\||\n\s*\}\}|$)/i)?.[1];
  if (dcBlock) {
    for (const m of dcBlock.matchAll(/\{\{\s*c\s*\|([^|}]+)(?:\|[^}]*)?\}\}/gi)) {
      if (m[1]) addPage(m[1]);
    }
    for (const line of dcBlock.split(/\r?\n/)) {
      if (/\{\{\s*Cis\s*\|/i.test(line) || /^(?:Image|File):/i.test(line.trim())) {
        addGalleryOrCisEntry(line.trim());
      }
    }
    for (const m of dcBlock.matchAll(/\[\[([^|\]]+\s+Vol\s+\d+\s+[^\]]+)\]\]/gi)) {
      if (m[1]) addPage(m[1]);
    }
    if (out.length > 0) return out;
  }

  // 3. Fallback: <gallery> blocks or bullet lists referencing {{c|...}}, {{Cis|...}}, or [[... Vol N M]]
  for (const g of wikitext.matchAll(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi)) {
    for (const line of (g[1] || '').split(/\r?\n/)) {
      addGalleryOrCisEntry(line.trim());
    }
  }
  if (out.length > 0) return out;

  for (const m of wikitext.matchAll(/^\*\s*(?:\{\{\s*c\s*\|([^|}]+)(?:\|[^}]*)?\}\}|\{\{\s*Cis\s*\|([^|}]+)(?:\|[^}]*)?\}\}|\[\[([^|\]]+\s+Vol\s+\d+\s+[^\]]+)\]\])/gim)) {
    if (m[1]) addPage(m[1]);
    else if (m[2]) addGalleryOrCisEntry(`{{Cis|${m[2]}}}`);
    else if (m[3]) addPage(m[3]);
  }
  return out;
}

/** Discovers component series volumes and omnibus items from creator-qualified Fandom collection pages. */
async function discoverCreatorRunAndOmnibus(
  wiki: ComicWikiSlug,
  seriesHint: string,
  creatorHint: string
): Promise<{
  seriesItems: ComicSeriesSearchItem[];
  omnibusItems: ComicSeriesSearchItem[];
}> {
  const seriesItems: ComicSeriesSearchItem[] = [];
  const omnibusItems: ComicSeriesSearchItem[] = [];
  const fullPhrase = `${seriesHint} by ${creatorHint}`;

  try {
    const searchUrl = `https://${wiki}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      fullPhrase
    )}&srlimit=8&format=json`;
    const srRes = await upstreamFetch(searchUrl, 5000);
    if (!srRes.ok) return { seriesItems, omnibusItems };
    const srJson = (await srRes.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    const hitTitles = (srJson.query?.search || [])
      .map((s) => s.title || '')
      .filter((t) => t.length > 0 && normTitle(t).includes(normTitle(seriesHint)));
    if (hitTitles.length === 0) return { seriesItems, omnibusItems };

    // Also include probable Vol 1 issue-level pages for Marvel volume pages
    const fetchTitles = new Set<string>(hitTitles);
    for (const t of hitTitles) {
      if (!/\s+\d+$/.test(t) && !/\(Collected\)/i.test(t) && wiki === 'marvel') {
        fetchTitles.add(`${t} 1`);
      }
    }

    const pagesRes = await upstreamFetch(
      `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
        Array.from(fetchTitles).slice(0, 12).join('|')
      )}&prop=revisions|pageimages&rvprop=content&pithumbsize=500&redirects=1&format=json`,
      5500
    );
    if (!pagesRes.ok) return { seriesItems, omnibusItems };
    const pagesJson = (await pagesRes.json()) as {
      query?: { pages?: Record<string, MediaWikiQueryPage> };
    };
    const validPages = Object.values(pagesJson.query?.pages || {}).filter(
      (p) => p.title && p.missing === undefined
    );

    const componentVols = new Set<string>();
    const omnibusCoverFilenames: string[] = [];
    const omnibusCandidates: Array<{
      page: MediaWikiQueryPage;
      wikitext: string;
      coverFile: string;
      issuePages: string[];
    }> = [];

    for (const p of validPages) {
      const wt = getRevisionText(p);
      if (!wt) continue;
      // Extract Marvel main_volume list
      const mainVol = wt.match(/\|\s*main_volume\s*=[^\S\r\n]*([^\n]+)/i)?.[1];
      if (mainVol) {
        for (const v of mainVol.split(';')) {
          const cleanV = cleanWikitext(v).trim();
          if (/\bVol\s+\d+$/i.test(cleanV)) componentVols.add(cleanV);
        }
      }
      // Extract DC Volume link
      const dcVol = wt.match(/\|\s*Volume\s*=[^\S\r\n]*([^\n|]+)/i)?.[1];
      if (dcVol) {
        const cleanV = cleanWikitext(dcVol).trim();
        if (/\bVol\s+\d+$/i.test(cleanV)) componentVols.add(cleanV);
      }

      // Check if this page itself is a collected edition with issue list / reprints
      const issuePages = parseCollectedIssuePageTitles(wt);
      if (issuePages.length >= 4) {
        const coverFile = extractPrimaryCoverFilename(wt, p.title!);
        omnibusCoverFilenames.push(coverFile);
        omnibusCandidates.push({ page: p, wikitext: wt, coverFile, issuePages });
        for (const ip of issuePages) {
          const m = ip.match(/^(.+?\s+Vol\s+\d+)\s+/i);
          if (m?.[1]) componentVols.add(m[1].trim());
        }
      }
    }

    const [hydratedVols, coverUrls] = await Promise.all([
      componentVols.size > 0
        ? hydrateWikiVolumes(wiki, Array.from(componentVols).slice(0, 10))
        : Promise.resolve([]),
      omnibusCoverFilenames.length > 0
        ? resolveWikiFileUrls(wiki, omnibusCoverFilenames, 480)
        : Promise.resolve(new Map<string, string>()),
    ]);
    seriesItems.push(...hydratedVols);

    for (const cand of omnibusCandidates.slice(0, 4)) {
      const wt = cand.wikitext;
      const pageTitle = cand.page.title!;
      const coverUrl =
        coverUrls.get(cand.coverFile.toLowerCase()) ||
        upscaleFandomThumb(cand.page.thumbnail?.source) ||
        '';
      if (!coverUrl) continue;
      const year = Number(wt.match(/\|\s*Year\s*=\s*(\d{4})/i)?.[1] || 0) || new Date().getUTCFullYear();
      const volMatch =
        pageTitle.match(/\bVol\.?\s+1\s+(\d+)$/i) ||
        pageTitle.match(/\bVol\.?\s*(\d+)(?:\s*\(Collected\))?$/i);
      const volNumber = volMatch ? Number(volMatch[1]) : 1;
      const cleanDisplayName = pageTitle
        .replace(/\s*\(Collected\)\s*$/i, '')
        .replace(/\s+Vol\.?\s+1\s+(\d+)$/i, ' Vol. $1')
        .replace(/\s+Vol\s+(\d+)$/i, ' Vol. $1')
        .trim();
      const firstSeries = deriveSeriesTitleFromPageTitle(cand.issuePages[0]);
      const seriesList = Array.from(
        new Set(cand.issuePages.map((ip) => deriveSeriesTitleFromPageTitle(ip)).filter(Boolean))
      ) as string[];
      omnibusItems.push({
        id: `comic-col-${wiki}-${pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        wiki,
        volTitle: pageTitle,
        collectionPageTitle: pageTitle,
        comicKind: 'collection',
        volNumber,
        title: cleanDisplayName,
        publisher: WIKI_PUBLISHER[wiki],
        startYear: year,
        isOngoing: false,
        runLabel: `${year} Omnibus / Collection`,
        issueCount: cand.issuePages.length,
        coverUrl,
        creator: creatorHint,
        genres: ['Superhero'],
        overview: `Collected edition tracking ${cand.issuePages.length} issues${
          seriesList.length > 1
            ? ` across ${seriesList.slice(0, 4).join(', ')}${seriesList.length > 4 ? ', and more' : ''}`
            : firstSeries
              ? ` of ${firstSeries}`
              : ''
        }.`,
      });
    }
  } catch {
    // ignore creator discovery failure
  }

  return { seriesItems, omnibusItems };
}

function decodeHtmlEntitiesSimple(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUsMonthDayYear(raw?: string): { releaseDate?: string; releaseDateIso?: string; year?: number } {
  if (!raw) return {};
  const clean = decodeHtmlEntitiesSimple(raw).replace(/([A-Za-z]+)\./g, '$1').trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return {
      ...formatUtcDateParts(y, m - 1, d),
      year: y,
    };
  }
  const mdy = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (mdy) {
    const m1 = parseWikiMonth(mdy[1]);
    const day = Number(mdy[2]);
    const yr = Number(mdy[3]);
    if (m1 && yr) {
      return {
        ...formatUtcDateParts(yr, m1 - 1, day),
        year: yr,
      };
    }
  }
  return {};
}

interface DarkHorseRawHit {
  href: string;
  fullTitle: string;
  seriesTitle: string;
  issueNumber: number;
  subtitle?: string;
  coverUrl: string;
}

function parseDarkHorseSearchHtml(html: string): DarkHorseRawHit[] {
  const out: DarkHorseRawHit[] = [];
  const seenHref = new Set<string>();
  const blocks = html.split(/<div class="product-result">/i).slice(1);
  for (const blk of blocks) {
    const hrefMatch = blk.match(/href="(\/comics\/[^"]+)"/i);
    const titleMatch = blk.match(/href="\/comics\/[^"]+"[^>]*>([^<]+)<\/a>/i);
    if (!hrefMatch?.[1] || !titleMatch?.[1]) continue;
    const href = hrefMatch[1].trim();
    if (seenHref.has(href)) continue;
    seenHref.add(href);

    const fullTitle = decodeHtmlEntitiesSimple(titleMatch[1]);
    if (/\b(?:variant|foil|incentive|cover\s+[b-z]|exclusive)\b/i.test(fullTitle)) continue;

    const issueMatch = fullTitle.match(/^(.+?)\s+#(\d+)(?:\s*[:–—-]\s*(.+))?$/);
    if (!issueMatch) continue;
    const seriesTitle = issueMatch[1].trim();
    const issueNumber = Number(issueMatch[2]);
    if (!seriesTitle || !Number.isFinite(issueNumber) || issueNumber < 1) continue;

    const thumbMatch = blk.match(/src="(https:\/\/images\.darkhorse\.com\/covers\/[^"]+)"/i);
    const rawCover = thumbMatch?.[1] || '';
    const coverUrl = rawCover.replace(/\/covers\/\d+\//, '/covers/600/');

    out.push({
      href,
      fullTitle,
      seriesTitle,
      issueNumber,
      subtitle: issueMatch[3]?.trim(),
      coverUrl,
    });
  }
  return out;
}

async function fetchDarkHorseIssueDetail(
  href: string,
  fallbackTitle: string,
  fallbackCover: string
): Promise<{
  title?: string;
  releaseDate?: string;
  releaseDateIso?: string;
  year?: number;
  coverUrl: string;
  synopsis?: string;
  writers?: string;
  artists?: string;
}> {
  try {
    const url = href.startsWith('http') ? href : `https://www.darkhorse.com${href}`;
    const res = await upstreamFetch(url, 5500);
    if (!res.ok) return { title: fallbackTitle, coverUrl: fallbackCover };
    const html = await res.text();
    const pubRaw = html.match(/Publication date:\s*<\/strong>\s*([^<\n]+)/i)?.[1];
    const parsedDate = parseUsMonthDayYear(pubRaw);

    const extractContrib = (label: string) => {
      const m = html.match(new RegExp(`${label}:\\s*</strong>([\\s\\S]*?)(?=</li>|<strong>)`, 'i'))?.[1];
      if (!m) return undefined;
      const names = [...m.matchAll(/>([^<]+)</g)]
        .map((x) => decodeHtmlEntitiesSimple(x[1]))
        .filter((x) => x.length >= 2);
      return names.length > 0 ? Array.from(new Set(names)).join(', ') : undefined;
    };

    const writers = extractContrib('Writers?');
    const artists = extractContrib('(?:Pencillers?|Artists?|Illustrators?)');
    const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] || fallbackCover;
    const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i)?.[1];
    const synopsis = ogDesc
      ? decodeHtmlEntitiesSimple(ogDesc).slice(0, 380)
      : undefined;

    return {
      title: fallbackTitle,
      releaseDate: parsedDate.releaseDate,
      releaseDateIso: parsedDate.releaseDateIso,
      year: parsedDate.year,
      coverUrl: ogImg.replace(/\/covers\/\d+\//, '/covers/600/'),
      synopsis,
      writers,
      artists,
    };
  } catch {
    return { title: fallbackTitle, coverUrl: fallbackCover };
  }
}

async function queryDarkHorseSeries(seriesQuery: string): Promise<ComicSeriesSearchItem[]> {
  const clean = seriesQuery.replace(/['’"]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return [];
  const targetNorm = normTitle(clean);
  const queryWords = targetNorm.split(' ').filter((w) => w.length >= 2);

  try {
    const [rMain, rOne] = await Promise.allSettled([
      upstreamFetch(`https://www.darkhorse.com/Search/${encodeURIComponent(clean)}`, 5500),
      upstreamFetch(`https://www.darkhorse.com/Search/${encodeURIComponent(`${clean} 1`)}`, 5500),
    ]);
    const hits: DarkHorseRawHit[] = [];
    for (const r of [rMain, rOne]) {
      if (r.status === 'fulfilled' && r.value.ok) {
        hits.push(...parseDarkHorseSearchHtml(await r.value.text()));
      }
    }
    if (hits.length === 0) return [];

    const bySeries = new Map<string, { displayName: string; hits: DarkHorseRawHit[] }>();
    for (const h of hits) {
      const sNorm = normTitle(h.seriesTitle);
      if (!queryWords.every((w) => sNorm.includes(w))) continue;
      const bucket = bySeries.get(sNorm);
      if (bucket) {
        if (!bucket.hits.some((x) => x.issueNumber === h.issueNumber)) {
          bucket.hits.push(h);
        }
      } else {
        bySeries.set(sNorm, { displayName: h.seriesTitle, hits: [h] });
      }
    }

    const groups = [...bySeries.values()]
      .sort((a, b) => {
        const aExact = normTitle(a.displayName) === targetNorm ? 1 : 0;
        const bExact = normTitle(b.displayName) === targetNorm ? 1 : 0;
        if (bExact !== aExact) return bExact - aExact;
        return b.hits.length - a.hits.length;
      })
      .slice(0, 3);

    const out: ComicSeriesSearchItem[] = [];
    const curYear = new Date().getUTCFullYear();
    await Promise.allSettled(
      groups.map(async (g) => {
        const sorted = [...g.hits].sort((a, b) => a.issueNumber - b.issueNumber);
        const firstHit = sorted.find((x) => x.issueNumber === 1) || sorted[0];
        const latestHit = sorted[sorted.length - 1];
        const [dFirst, dLatest] = await Promise.all([
          fetchDarkHorseIssueDetail(firstHit.href, firstHit.subtitle || firstHit.fullTitle, firstHit.coverUrl),
          latestHit.href !== firstHit.href
            ? fetchDarkHorseIssueDetail(latestHit.href, latestHit.subtitle || latestHit.fullTitle, latestHit.coverUrl)
            : Promise.resolve(undefined),
        ]);

        const latestYear = dLatest?.year || dFirst.year || curYear;
        const firstYear = dFirst.year || latestYear;
        const isOngoing = latestYear >= curYear || sorted.length >= 6;
        const startYear =
          firstHit.issueNumber === 1 && firstYear
            ? firstYear
            : Math.max(1986, latestYear - Math.floor(latestHit.issueNumber / 6));
        const maxIssue = latestHit.issueNumber;
        const runLabel = isOngoing
          ? `${startYear} – Present`
          : latestYear !== startYear
            ? `${startYear} – ${latestYear}`
            : String(startYear);

        out.push({
          id: `comic-series-darkhorse-${normTitle(g.displayName).replace(/\s+/g, '-')}-${startYear}`,
          wiki: 'darkhorse',
          volTitle: g.displayName,
          volNumber: 1,
          title: g.displayName,
          publisher: 'Dark Horse Comics',
          startYear,
          endYear: isOngoing ? undefined : latestYear,
          isOngoing,
          runLabel,
          issueCount: maxIssue,
          coverUrl: dFirst.coverUrl || firstHit.coverUrl || latestHit.coverUrl,
          creator: dFirst.writers || 'Dark Horse Comics',
          genres: ['Action', 'Adventure'],
          overview:
            dFirst.synopsis ||
            `${g.displayName} (${runLabel}) published by Dark Horse Comics. Tracking ${maxIssue} issues.`,
        });
      })
    );

    return out;
  } catch {
    return [];
  }
}

async function fetchDarkHorseIssuesPayload(
  seriesName: string,
  limit = 60
): Promise<{ totalIssues: number; issues: Record<number, ComicSeriesIssueItem> }> {
  const clean = seriesName.trim();
  const targetNorm = normTitle(clean);
  if (!clean) return { totalIssues: 0, issues: {} };

  const byNum = new Map<number, DarkHorseRawHit>();
  const collectHtml = (html: string) => {
    for (const h of parseDarkHorseSearchHtml(html)) {
      if (normTitle(h.seriesTitle) !== targetNorm) continue;
      if (!byNum.has(h.issueNumber)) byNum.set(h.issueNumber, h);
    }
  };

  try {
    const [rMain, rOne] = await Promise.allSettled([
      upstreamFetch(`https://www.darkhorse.com/Search/${encodeURIComponent(clean)}`, 5500),
      upstreamFetch(`https://www.darkhorse.com/Search/${encodeURIComponent(`${clean} 1`)}`, 5500),
    ]);
    for (const r of [rMain, rOne]) {
      if (r.status === 'fulfilled' && r.value.ok) collectHtml(await r.value.text());
    }
    const maxFound = Math.max(0, ...byNum.keys());
    const maxCap = Math.min(Math.max(1, maxFound), Math.max(1, limit), 30);

    const missingNums: number[] = [];
    for (let n = 1; n <= maxCap; n += 1) {
      if (!byNum.has(n)) missingNums.push(n);
    }
    for (let i = 0; i < missingNums.length; i += 4) {
      const batch = missingNums.slice(i, i + 4);
      const settled = await Promise.allSettled(
        batch.map((n) =>
          upstreamFetch(`https://www.darkhorse.com/Search/${encodeURIComponent(`${clean} ${n}`)}`, 5000)
        )
      );
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value.ok) collectHtml(await s.value.text());
      }
    }

    const totalIssues = Math.max(maxFound, byNum.size);
    const hitsToHydrate = [...byNum.values()]
      .filter((h) => h.issueNumber >= 1 && h.issueNumber <= limit)
      .sort((a, b) => a.issueNumber - b.issueNumber);

    const issues: Record<number, ComicSeriesIssueItem> = {};
    for (let i = 0; i < hitsToHydrate.length; i += 5) {
      const slice = hitsToHydrate.slice(i, i + 5);
      const settled = await Promise.allSettled(
        slice.map(async (h) => {
          const fallbackStory = h.subtitle || `Issue #${h.issueNumber}`;
          const det = await fetchDarkHorseIssueDetail(h.href, fallbackStory, h.coverUrl);
          return { h, det };
        })
      );
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        const { h, det } = s.value;
        issues[h.issueNumber] = {
          number: h.issueNumber,
          issueLabel: `#${h.issueNumber}`,
          title: det.title || h.subtitle || `Issue #${h.issueNumber}`,
          seriesTitle: clean,
          releaseDate: det.releaseDate,
          ...(det.releaseDateIso ? { releaseDateIso: det.releaseDateIso } : {}),
          coverUrl: det.coverUrl || h.coverUrl,
          synopsis: det.synopsis,
          writers: det.writers,
          artists: det.artists,
          wiki: 'darkhorse',
          pageTitle: `${clean} #${h.issueNumber}`,
          atomicId: makeServerComicAtomicId('darkhorse', `${clean} ${h.issueNumber}`),
        };
      }
    }

    return { totalIssues, issues };
  } catch {
    return { totalIssues: 0, issues: {} };
  }
}

interface ShopifyProductHit {
  title?: string;
  url?: string;
  image?: string;
  type?: string;
}

const SHOPIFY_STORES: Record<'idw' | 'boom', { host: string; publisher: string }> = {
  idw: { host: 'https://idwpublishing.com', publisher: 'IDW Publishing' },
  boom: { host: 'https://shop.boom-studios.com', publisher: 'BOOM! Studios' },
};

function cleanShopifyComicTitle(rawTitle: string): string {
  return decodeHtmlEntitiesSimple(rawTitle)
    .replace(/\s*[-–—]\s*(?:IDW|Foil|Exclusive|Cover|Incentive|Variant| Virgin).*$/i, '')
    .replace(/\s+(?:BOOM!\s+Direct\s+Reserve.*|Foil\s+Exclusive.*|Incentive.*|Cover\s+[A-Z].*)$/i, '')
    .replace(/\s*\(\d{4}\)(?=\s+#\d+)/i, '')
    .trim();
}

async function fetchShopifySuggestProducts(
  wiki: 'idw' | 'boom',
  query: string
): Promise<ShopifyProductHit[]> {
  const cfg = SHOPIFY_STORES[wiki];
  const url = `${cfg.host}/search/suggest.json?q=${encodeURIComponent(
    query
  )}&resources[type]=product&resources[limit]=10`;
  const res = await upstreamFetch(url, 5000);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    resources?: { results?: { products?: ShopifyProductHit[] } };
  };
  return json?.resources?.results?.products || [];
}

async function queryShopifyComicSeries(
  wiki: 'idw' | 'boom',
  seriesQuery: string
): Promise<ComicSeriesSearchItem[]> {
  const clean = seriesQuery.replace(/['’"]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length < 2) return [];
  const targetNorm = normTitle(clean);
  const queryWords = targetNorm.split(' ').filter((w) => w.length >= 2);
  const cfg = SHOPIFY_STORES[wiki];

  try {
    const products = await fetchShopifySuggestProducts(wiki, clean);
    const bySeries = new Map<
      string,
      {
        displayName: string;
        hits: Array<{ num: number; cover: string }>;
      }
    >();

    for (const p of products) {
      if (!p.title || !p.image) continue;
      if (/\b(?:compendium|omnibus|box\s+set|volume|tpb)\b/i.test(p.title)) continue;
      const cleaned = cleanShopifyComicTitle(p.title);
      const m = cleaned.match(/^(.+?)\s+#(\d+)\b/);
      if (!m) continue;
      const seriesName = m[1].trim();
      const num = Number(m[2]);
      if (!seriesName || !Number.isFinite(num) || num < 1) continue;
      const sNorm = normTitle(seriesName);
      if (!queryWords.every((w) => sNorm.includes(w))) continue;
      const bucket = bySeries.get(sNorm);
      if (bucket) {
        if (!bucket.hits.some((x) => x.num === num)) {
          bucket.hits.push({ num, cover: p.image });
        }
      } else {
        bySeries.set(sNorm, { displayName: seriesName, hits: [{ num, cover: p.image }] });
      }
    }

    const curYear = new Date().getUTCFullYear();
    return [...bySeries.values()].slice(0, 3).map((g) => {
      const sorted = [...g.hits].sort((a, b) => a.num - b.num);
      const maxNum = sorted[sorted.length - 1]?.num || 1;
      const coverUrl = sorted[0]?.cover || '';
      return {
        id: `comic-series-${wiki}-${normTitle(g.displayName).replace(/\s+/g, '-')}`,
        wiki,
        volTitle: g.displayName,
        volNumber: 1,
        title: g.displayName,
        publisher: cfg.publisher,
        startYear: curYear - 1,
        isOngoing: true,
        runLabel: `${curYear - 1} – Present`,
        issueCount: maxNum,
        coverUrl,
        creator: cfg.publisher,
        genres: ['Action', 'Adventure'],
        overview: `${g.displayName} published by ${cfg.publisher}. Tracking ${maxNum} ${
          maxNum === 1 ? 'issue' : 'issues'
        }.`,
      };
    });
  } catch {
    return [];
  }
}

async function fetchShopifyComicIssuesPayload(
  wiki: 'idw' | 'boom',
  seriesName: string,
  limit = 60
): Promise<{ totalIssues: number; issues: Record<number, ComicSeriesIssueItem> }> {
  const clean = seriesName.trim();
  const targetNorm = normTitle(clean);
  if (!clean) return { totalIssues: 0, issues: {} };

  try {
    const byNum = new Map<number, { cover: string; rawTitle: string }>();
    const collect = (prods: ShopifyProductHit[]) => {
      for (const p of prods) {
        if (!p.title || !p.image) continue;
        const cleaned = cleanShopifyComicTitle(p.title);
        const m = cleaned.match(/^(.+?)\s+#(\d+)\b/);
        if (!m) continue;
        if (normTitle(m[1]) !== targetNorm) continue;
        const num = Number(m[2]);
        if (Number.isFinite(num) && num >= 1 && !byNum.has(num)) {
          byNum.set(num, { cover: p.image, rawTitle: cleaned });
        }
      }
    };

    const [pMain, pOne] = await Promise.allSettled([
      fetchShopifySuggestProducts(wiki, clean),
      fetchShopifySuggestProducts(wiki, `${clean} #1`),
    ]);
    if (pMain.status === 'fulfilled') collect(pMain.value);
    if (pOne.status === 'fulfilled') collect(pOne.value);

    const maxFound = Math.max(0, ...byNum.keys());
    const maxCap = Math.min(Math.max(1, maxFound), Math.max(1, limit), 18);
    const missing: number[] = [];
    for (let n = 1; n <= maxCap; n += 1) {
      if (!byNum.has(n)) missing.push(n);
    }
    for (let i = 0; i < missing.length; i += 4) {
      const settled = await Promise.allSettled(
        missing.slice(i, i + 4).map((n) => fetchShopifySuggestProducts(wiki, `${clean} #${n}`))
      );
      for (const s of settled) {
        if (s.status === 'fulfilled') collect(s.value);
      }
    }

    const totalIssues = Math.max(maxFound, byNum.size);
    const issues: Record<number, ComicSeriesIssueItem> = {};
    for (const [num, entry] of [...byNum.entries()].sort((a, b) => a[0] - b[0])) {
      if (num > limit) continue;
      issues[num] = {
        number: num,
        issueLabel: `#${num}`,
        title: `Issue #${num}`,
        seriesTitle: clean,
        coverUrl: entry.cover,
        writers: SHOPIFY_STORES[wiki].publisher,
        wiki,
        pageTitle: `${clean} #${num}`,
        atomicId: makeServerComicAtomicId(wiki, `${clean} ${num}`),
      };
    }

    return { totalIssues, issues };
  } catch {
    return { totalIssues: 0, issues: {} };
  }
}

async function queryComicVineSeries(seriesQuery: string): Promise<ComicSeriesSearchItem[]> {
  const apiKey = process.env.COMICVINE_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${encodeURIComponent(
      apiKey
    )}&format=json&resources=volume&query=${encodeURIComponent(
      seriesQuery
    )}&limit=6&field_list=id,name,start_year,count_of_issues,publisher,image,deck`;
    const res = await upstreamFetch(url, 5500);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: Array<{
        id?: number;
        name?: string;
        start_year?: string;
        count_of_issues?: number;
        publisher?: { name?: string };
        image?: { medium_url?: string; small_url?: string };
        deck?: string;
      }>;
    };
    const curYear = new Date().getUTCFullYear();
    return (json.results || [])
      .filter((v) => v.id && v.name && (v.image?.medium_url || v.image?.small_url))
      .map((v) => {
        const startYear = Number(v.start_year) || curYear;
        const issueCount = Math.max(1, v.count_of_issues || 1);
        const pub = v.publisher?.name || 'Comic Vine';
        const isOngoing = startYear >= curYear - 1;
        return {
          id: `comic-series-comicvine-${v.id}`,
          wiki: 'comicvine' as const,
          volTitle: String(v.id),
          volNumber: 1,
          title: v.name!,
          publisher: pub,
          startYear,
          isOngoing,
          runLabel: isOngoing ? `${startYear} – Present` : String(startYear),
          issueCount,
          coverUrl: v.image?.medium_url || v.image?.small_url || '',
          creator: pub,
          genres: ['Comics'],
          overview: v.deck || `${v.name} (${startYear}) published by ${pub}.`,
        };
      });
  } catch {
    return [];
  }
}

async function fetchComicVineIssuesPayload(
  volId: string,
  limit = 60
): Promise<{ totalIssues: number; issues: Record<number, ComicSeriesIssueItem> }> {
  const apiKey = process.env.COMICVINE_API_KEY?.trim();
  if (!apiKey || !/^\d+$/.test(volId.trim())) return { totalIssues: 0, issues: {} };
  try {
    const capped = Math.max(1, Math.min(100, limit));
    const url = `https://comicvine.gamespot.com/api/issues/?api_key=${encodeURIComponent(
      apiKey
    )}&format=json&filter=volume:${volId.trim()}&sort=issue_number:asc&limit=${capped}&field_list=issue_number,name,cover_date,store_date,image,deck,volume`;
    const res = await upstreamFetch(url, 6000);
    if (!res.ok) return { totalIssues: 0, issues: {} };
    const json = (await res.json()) as {
      number_of_total_results?: number;
      results?: Array<{
        issue_number?: string;
        name?: string;
        cover_date?: string;
        store_date?: string;
        image?: { small_url?: string; medium_url?: string };
        deck?: string;
        volume?: { name?: string };
      }>;
    };
    const issues: Record<number, ComicSeriesIssueItem> = {};
    let idx = 0;
    for (const iss of json.results || []) {
      idx += 1;
      const numVal = Number(iss.issue_number) || idx;
      const rawDate = iss.store_date || iss.cover_date;
      const parsedDate = parseUsMonthDayYear(rawDate);
      const seriesTitle = iss.volume?.name || 'Series';
      issues[idx] = {
        number: idx,
        issueLabel: `#${iss.issue_number || idx}`,
        title: iss.name || `Issue #${numVal}`,
        seriesTitle,
        releaseDate: parsedDate.releaseDate || rawDate,
        ...(parsedDate.releaseDateIso ? { releaseDateIso: parsedDate.releaseDateIso } : {}),
        coverUrl: iss.image?.small_url || iss.image?.medium_url,
        synopsis: iss.deck || undefined,
        wiki: 'comicvine',
        pageTitle: `${seriesTitle} #${iss.issue_number || idx}`,
        atomicId: makeServerComicAtomicId('comicvine', `${volId} ${iss.issue_number || idx}`),
      };
    }
    return {
      totalIssues: Math.max(json.number_of_total_results || 0, Object.keys(issues).length),
      issues,
    };
  } catch {
    return { totalIssues: 0, issues: {} };
  }
}

/** Searches ongoing & completed comic series runs across Marvel, DC, Image, Dark Horse, IDW, BOOM!, and optional Comic Vine. */
export async function searchComicSeriesPayload(
  rawQuery: string
): Promise<{ items: ComicSeriesSearchItem[] }> {
  const { baseQuery, targetYear } = parseQueryAndYear(rawQuery);
  if (baseQuery.length < 2) return { items: [] };

  const { seriesHint, creatorHint, wantsOmnibus } = parseCreatorQualifiedQuery(baseQuery);
  const seriesQuery = creatorHint ? seriesHint : baseQuery;
  const targetNorm = normTitle(seriesQuery);
  const creatorNorm = creatorHint ? normTitle(creatorHint) : '';

  const tasks: Array<Promise<ComicSeriesSearchItem[]>> = [
    queryWikiComicVolumes('marvel', seriesQuery),
    queryWikiComicVolumes('dc', seriesQuery),
    queryWikiComicVolumes('imagecomics', seriesQuery),
    queryDarkHorseSeries(seriesQuery),
    queryShopifyComicSeries('idw', seriesQuery),
    queryShopifyComicSeries('boom', seriesQuery),
    queryComicVineSeries(seriesQuery),
  ];

  const creatorDiscovered: ComicSeriesSearchItem[] = [];
  if (creatorHint) {
    const creatorSettled = await Promise.allSettled([
      discoverCreatorRunAndOmnibus('marvel', seriesHint, creatorHint),
      discoverCreatorRunAndOmnibus('dc', seriesHint, creatorHint),
      discoverCreatorRunAndOmnibus('imagecomics', seriesHint, creatorHint),
    ]);
    for (const r of creatorSettled) {
      if (r.status === 'fulfilled') {
        if (wantsOmnibus) {
          creatorDiscovered.push(...r.value.omnibusItems, ...r.value.seriesItems);
        } else {
          creatorDiscovered.push(...r.value.seriesItems, ...r.value.omnibusItems);
        }
      }
    }
  }

  const settled = await Promise.allSettled(tasks);
  const combined: ComicSeriesSearchItem[] = [];
  const seenIds = new Set<string>();
  const pushUnique = (item: ComicSeriesSearchItem) => {
    const key = `${item.wiki}:${item.volTitle.toLowerCase()}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    combined.push(item);
  };

  for (const item of creatorDiscovered) pushUnique(item);
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      for (const item of res.value) pushUnique(item);
    }
  }

  combined.sort((a, b) => {
    if (creatorNorm) {
      const aColBoost = a.comicKind === 'collection' ? (wantsOmnibus ? 3 : 1) : 2;
      const bColBoost = b.comicKind === 'collection' ? (wantsOmnibus ? 3 : 1) : 2;
      const aCreator = normTitle(a.creator).includes(creatorNorm) ? 2 : 0;
      const bCreator = normTitle(b.creator).includes(creatorNorm) ? 2 : 0;
      const aInDisc = creatorDiscovered.some((d) => d.id === a.id) ? 1 : 0;
      const bInDisc = creatorDiscovered.some((d) => d.id === b.id) ? 1 : 0;
      const scoreA = aCreator * 10 + aInDisc * 5 + aColBoost;
      const scoreB = bCreator * 10 + bInDisc * 5 + bColBoost;
      if (scoreB !== scoreA) return scoreB - scoreA;
    }
    if (targetYear) {
      const aExactY = a.startYear === targetYear ? 2 : a.startYear <= targetYear && (a.isOngoing || (a.endYear || 0) >= targetYear) ? 1 : 0;
      const bExactY = b.startYear === targetYear ? 2 : b.startYear <= targetYear && (b.isOngoing || (b.endYear || 0) >= targetYear) ? 1 : 0;
      if (bExactY !== aExactY) return bExactY - aExactY;
    }
    const aExactTitle = normTitle(a.title) === targetNorm ? 1 : 0;
    const bExactTitle = normTitle(b.title) === targetNorm ? 1 : 0;
    if (bExactTitle !== aExactTitle) return bExactTitle - aExactTitle;
    if (b.startYear !== a.startYear) return b.startYear - a.startYear;
    return b.volNumber - a.volNumber;
  });

  return { items: combined.slice(0, 14) };
}

interface WikiIssueSpec {
  pageTitle: string;
  rawNum: string;
  seriesTitle?: string;
}

/** Batch-hydrates Fandom issue pages into Cue issue metadata with Cover A art and canonical atomicId. */
async function hydrateWikiIssuePages(
  wiki: ComicWikiSlug,
  specs: WikiIssueSpec[],
  limit = 120
): Promise<Record<number, ComicSeriesIssueItem>> {
  const capped = Math.max(1, Math.min(120, Math.round(limit)));
  const sliced = specs.slice(0, capped);
  if (sliced.length === 0) return {};

  const chunkSize = 20;
  const chunks: Array<{ startIdx: number; items: WikiIssueSpec[] }> = [];
  for (let i = 0; i < sliced.length; i += chunkSize) {
    chunks.push({ startIdx: i, items: sliced.slice(i, i + chunkSize) });
  }

  const parsedEntries: Array<{
    slot: number;
    spec: WikiIssueSpec;
    page?: MediaWikiQueryPage;
    wikitext: string;
    coverFilename: string;
  }> = [];

  // Process chunks with bounded concurrency of 3
  for (let c = 0; c < chunks.length; c += 3) {
    const windowChunks = chunks.slice(c, c + 3);
    const settled = await Promise.allSettled(
      windowChunks.map(async (chunk) => {
        const res = await upstreamFetch(
          `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
            chunk.items.map((item) => item.pageTitle).join('|')
          )}&prop=pageimages|revisions|categories&rvprop=content&cllimit=max&pithumbsize=320&redirects=1&format=json`,
          6000
        );
        if (!res.ok) return [];
        const json = (await res.json()) as {
          query?: {
            normalized?: Array<{ from: string; to: string }>;
            redirects?: Array<{ from: string; to: string }>;
            pages?: Record<string, MediaWikiQueryPage>;
          };
        };
        const normMap = new Map<string, string>();
        for (const n of json.query?.normalized || []) normMap.set(n.from, n.to);
        const redirMap = new Map<string, string>();
        for (const r of json.query?.redirects || []) redirMap.set(r.from, r.to);

        const pageByTitle = new Map<string, MediaWikiQueryPage>();
        for (const p of Object.values(json.query?.pages || {})) {
          if (p.title) pageByTitle.set(p.title.toLowerCase(), p);
        }

        return chunk.items.map((spec, idx) => {
          const slot = chunk.startIdx + idx + 1;
          let cur = spec.pageTitle;
          if (normMap.has(cur)) cur = normMap.get(cur)!;
          if (redirMap.has(cur)) cur = redirMap.get(cur)!;
          const page =
            pageByTitle.get(cur.toLowerCase()) || pageByTitle.get(spec.pageTitle.toLowerCase());
          const wikitext = getRevisionText(page);
          const coverFilename = extractPrimaryCoverFilename(wikitext, page?.title || spec.pageTitle);
          return { slot, spec, page, wikitext, coverFilename };
        });
      })
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') parsedEntries.push(...r.value);
    }
  }

  const coverFiles = parsedEntries
    .filter((e) => e.page && e.page.missing === undefined)
    .map((e) => e.coverFilename);
  const coverAMap = await resolveWikiFileUrls(wiki, coverFiles, 320);

  const issues: Record<number, ComicSeriesIssueItem> = {};
  for (const { slot, spec, page, wikitext, coverFilename } of parsedEntries) {
    const resolvedPageTitle = page?.title && page.missing === undefined ? page.title : spec.pageTitle;
    const derivedSeries = spec.seriesTitle || deriveSeriesTitleFromPageTitle(resolvedPageTitle);
    const seriesNorm = normTitle(derivedSeries || resolvedPageTitle.replace(/\s+Vol\s+\d+.*$/i, ''));
    const storyMatch =
      wikitext.match(/\|\s*StoryTitle1\s*=[^\S\r\n]*([^\n]+)/i)?.[1] ||
      wikitext.match(/\|\s*Name\s*=[^\S\r\n]*([^\n]+)/i)?.[1] ||
      '';
    const title = cleanStoryTitle(storyMatch, seriesNorm);
    const { releaseDate, releaseDateIso } = wikitext
      ? extractIssueReleaseDate(wikitext, wiki, page?.categories)
      : {};
    const coverUrl = coverAMap.get(coverFilename.toLowerCase()) || page?.thumbnail?.source;
    const writers = wikitext ? extractWikitextField(wikitext, 'Writers?1|Writers') : undefined;
    const artists = wikitext
      ? extractWikitextField(wikitext, 'Pencillers?1|Pencillers?|Artists?1|Artists')
      : undefined;
    const synopsis = wikitext ? extractIssueSynopsis(wikitext) : undefined;
    issues[slot] = {
      number: slot,
      issueLabel: `#${spec.rawNum}`,
      title,
      ...(derivedSeries ? { seriesTitle: derivedSeries } : {}),
      releaseDate,
      ...(releaseDateIso ? { releaseDateIso } : {}),
      coverUrl,
      synopsis,
      writers,
      artists,
      wiki,
      pageTitle: resolvedPageTitle,
      atomicId: makeServerComicAtomicId(wiki, resolvedPageTitle),
    };
  }

  return issues;
}

/** Fetches ordered single issues (including legacy renumbering jumps) & covers for a specific Fandom volume. */
export async function fetchComicSeriesIssuesPayload(
  wiki: ComicWikiSlug,
  volTitle: string,
  limit = 90
): Promise<{ totalIssues: number; issues: Record<number, ComicSeriesIssueItem> }> {
  if (wiki === 'darkhorse') {
    return fetchDarkHorseIssuesPayload(volTitle, limit);
  }
  if (wiki === 'idw' || wiki === 'boom') {
    return fetchShopifyComicIssuesPayload(wiki, volTitle, limit);
  }
  if (wiki === 'comicvine') {
    return fetchComicVineIssuesPayload(volTitle, limit);
  }

  const baseVol = volTitle.trim();
  const seriesTitle = deriveSeriesTitleFromPageTitle(baseVol);
  const strictIssueRegex = new RegExp(`^${escapeRegex(baseVol)}\\s+(\\d+(?:\\.[A-Za-z0-9]+)?)$`, 'i');

  const rawIssuePages: Array<{ pageTitle: string; rawNum: string; sortNum: number }> = [];
  const seenNum = new Set<string>();

  try {
    const catRes = await upstreamFetch(
      `https://${wiki}.fandom.com/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(
        `Category:${baseVol}`
      )}&cmnamespace=0&cmlimit=180&format=json`,
      5500
    );
    if (catRes.ok) {
      const json = (await catRes.json()) as {
        query?: { categorymembers?: Array<{ title?: string }> };
      };
      for (const m of json.query?.categorymembers || []) {
        const match = (m.title || '').match(strictIssueRegex);
        if (!match) continue;
        const rawNum = match[1];
        if (seenNum.has(rawNum)) continue;
        seenNum.add(rawNum);
        const numericVal = parseFloat(rawNum.replace(/[^0-9.]/g, '')) || 0;
        rawIssuePages.push({
          pageTitle: m.title!,
          rawNum,
          sortNum: numericVal,
        });
      }
    }

    if (rawIssuePages.length === 0) {
      const psRes = await upstreamFetch(
        `https://${wiki}.fandom.com/api.php?action=query&list=prefixsearch&pssearch=${encodeURIComponent(
          `${baseVol} `
        )}&pslimit=100&format=json`,
        5500
      );
      if (psRes.ok) {
        const json = (await psRes.json()) as {
          query?: { prefixsearch?: Array<{ title?: string }> };
        };
        for (const hit of json.query?.prefixsearch || []) {
          const match = (hit.title || '').match(strictIssueRegex);
          if (!match) continue;
          const rawNum = match[1];
          if (seenNum.has(rawNum)) continue;
          seenNum.add(rawNum);
          const numericVal = parseFloat(rawNum.replace(/[^0-9.]/g, '')) || 0;
          rawIssuePages.push({
            pageTitle: hit.title!,
            rawNum,
            sortNum: numericVal,
          });
        }
      }
    }
  } catch {
    return { totalIssues: 0, issues: {} };
  }

  rawIssuePages.sort((a, b) => a.sortNum - b.sortNum);
  const totalIssues = rawIssuePages.length;
  const specs: WikiIssueSpec[] = rawIssuePages.map((p) => ({
    pageTitle: p.pageTitle,
    rawNum: p.rawNum,
    seriesTitle,
  }));
  const issues = await hydrateWikiIssuePages(wiki, specs, limit);
  return { totalIssues, issues };
}

/** Parses "Collects X #1-25, Y (2014) #1-8, ..." or "COLLECTING: ..." blurbs from book descriptions. */
export function parseCollectsClauses(overview?: string): Array<{
  seriesQuery: string;
  targetYear?: number;
  nums: number[];
}> {
  if (!overview) return [];
  const collectMatch = overview.match(/collect(?:s|ing)?\s*:?\s+((?:[^.\n]|\.(?=\d))+)/i);
  if (!collectMatch?.[1]) return [];
  const clause = collectMatch[1]
    .replace(/\band\s+material\s+from\b/gi, ', ')
    .replace(/\bplus\b/gi, ', ')
    .replace(/;\s*/g, ', ')
    .replace(/\s+and\s+(?=[A-Z])/g, ', ');

  const out: Array<{ seriesQuery: string; targetYear?: number; nums: number[] }> = [];
  let lastSeriesQuery = '';
  let lastYear: number | undefined;

  for (const partRaw of clause.split(',')) {
    const part = partRaw.trim();
    if (!part) continue;
    const m = part.match(
      /^(?:([A-Za-z0-9:'’&?!.\-\s]+?)\s*(?:\((\d{4})\))?\s+)?#?(\d+(?:\.\d+)?)(?:\s*[-–—to]+\s*#?(\d+(?:\.\d+)?))?$/i
    );
    if (!m) continue;
    const rawSeries = (m[1] || '').replace(/[?:]+$/, '').trim();
    const seriesQuery = rawSeries.length >= 2 ? rawSeries : lastSeriesQuery;
    if (!seriesQuery) continue;
    const targetYear = m[2] ? Number(m[2]) : rawSeries ? undefined : lastYear;
    lastSeriesQuery = seriesQuery;
    lastYear = targetYear;

    const startRaw = Number(m[3]);
    const endRaw = m[4] ? Number(m[4]) : startRaw;
    if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw)) continue;
    if (!Number.isInteger(startRaw) || startRaw === endRaw) {
      out.push({ seriesQuery, targetYear, nums: [startRaw] });
      continue;
    }
    const start = Math.round(startRaw);
    const end = Math.round(endRaw);
    if (end < start || end - start > 100) continue;
    const nums: number[] = [];
    for (let n = start; n <= end; n += 1) nums.push(n);
    out.push({ seriesQuery, targetYear, nums });
  }
  return out;
}

const COLLECTION_TITLE_STOP_WORDS = new Set([
  'the',
  'of',
  'and',
  'for',
  'in',
  'on',
  'to',
  'by',
  'vol',
  'volume',
  'omnibus',
  'compendium',
  'complete',
  'collection',
  'epic',
  'deluxe',
  'absolute',
  'library',
  'masterworks',
  'edition',
  'hardcover',
  'softcover',
  'trade',
  'paperback',
  'tpb',
  'tp',
  'hc',
  'collected',
]);

function extractCollectionDistinctTokens(rawTitle: string): string[] {
  const words = normTitle(
    rawTitle
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\bVol\.?\s*\d+(?:\s+\d+)?\s*$/i, ' ')
  )
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !COLLECTION_TITLE_STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return Array.from(new Set(words));
}

function normalizeCollectionBaseTitle(rawTitle: string): string {
  return normTitle(
    rawTitle
      .replace(/\s*\(Collected\)\s*$/i, '')
      .replace(/\bVol\.?\s*\d+(?:\s+\d+)?\s*$/i, '')
      .replace(/\b(?:tpb|tp|hc|hardcover|softcover|trade\s+paperback|edition)\b/gi, '')
  );
}

/** Resolves any Omnibus, TPB, Hardcover, or ISBN-added comic collection into its individual atomic issues. */
export async function fetchComicCollectionIssuesPayload(params: {
  title: string;
  isbn?: string;
  overview?: string;
  publisher?: string;
  wikiHint?: ComicWikiSlug;
  pageTitleHint?: string;
  limit?: number;
}): Promise<{
  totalIssues: number;
  wiki?: ComicWikiSlug;
  collectionPageTitle?: string;
  coverUrl?: string;
  publisher?: string;
  year?: number;
  issues: Record<number, ComicSeriesIssueItem>;
}> {
  const { title, isbn, overview, publisher, wikiHint, pageTitleHint, limit = 100 } = params;
  const wikiOrder = inferWikiOrder(`${title} ${publisher || ''} ${overview || ''}`, wikiHint);

  const cleanIsbn = isbn ? isbn.replace(/[^0-9Xx]/g, '').toUpperCase() : '';
  const hyphenIsbn13 =
    cleanIsbn.length === 13 ? `${cleanIsbn.slice(0, 3)}-${cleanIsbn.slice(3)}` : '';

  const volNumMatch = title.match(/\b(?:vol\.?|volume|book)\s*(\d+)\b/i);
  const volNum = volNumMatch ? Number(volNumMatch[1]) : 1;
  const trimmedTitle = title.replace(/\s+(?:tpb|tp|hc|hardcover)$/i, '').trim();
  const cleanTitle = trimmedTitle
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bvol\.?\s*\d+\b/gi, '')
    .replace(/\bvolume\s*\d+\b/gi, '')
    .replace(/[:,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strategy A: Find collected edition page on Fandom wikis
  for (const wiki of wikiOrder) {
    try {
      const searchQueries: string[] = [];
      if (cleanIsbn) {
        if (hyphenIsbn13) searchQueries.push(hyphenIsbn13);
        searchQueries.push(cleanIsbn);
      }
      searchQueries.push(trimmedTitle || title.trim());
      if (cleanTitle && normTitle(cleanTitle) !== normTitle(trimmedTitle || title)) {
        searchQueries.push(cleanTitle);
      }

      const candidateTitles: string[] = [];
      const seenCand = new Set<string>();
      const pushCand = (t?: string) => {
        if (!t) return;
        const clean = t.trim();
        if (!clean || seenCand.has(clean.toLowerCase())) return;
        seenCand.add(clean.toLowerCase());
        candidateTitles.push(clean);
      };

      if (pageTitleHint && (!wikiHint || wikiHint === wiki)) {
        pushCand(pageTitleHint);
      }

      if (wiki === 'marvel') {
        pushCand(`${cleanTitle} Vol 1 ${volNum}`);
        pushCand(`${cleanTitle} Vol ${volNum} 1`);
      } else if (wiki === 'dc' || wiki === 'imagecomics') {
        pushCand(trimmedTitle);
        pushCand(`${trimmedTitle} (Collected)`);
        pushCand(`${cleanTitle} Vol. ${volNum} (Collected)`);
      }

      const searchResults = await Promise.allSettled(
        searchQueries.slice(0, 3).map(async (q) => {
          const r = await upstreamFetch(
            `https://${wiki}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(
              q
            )}&srlimit=8&format=json`,
            5000
          );
          if (!r.ok) return [];
          const j = (await r.json()) as {
            query?: { search?: Array<{ title?: string }> };
          };
          return (j.query?.search || []).map((s) => s.title || '').filter(Boolean);
        })
      );

      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          for (const t of r.value) pushCand(t);
        }
      }

      if (candidateTitles.length > 0) {
        const probeList = candidateTitles.slice(0, 12);
        // For Marvel volume pages, also speculatively include `<title> <volNum>`
        const extraFollowups: string[] = [];
        if (wiki === 'marvel') {
          for (const t of probeList) {
            if (/\bVol\s+\d+$/i.test(t)) {
              extraFollowups.push(`${t} ${volNum}`);
              if (volNum !== 1) extraFollowups.push(`${t} 1`);
            }
          }
        }
        const allProbes = Array.from(new Set([...probeList, ...extraFollowups])).slice(0, 16);
        const pageRes = await upstreamFetch(
          `https://${wiki}.fandom.com/api.php?action=query&titles=${encodeURIComponent(
            allProbes.join('|')
          )}&prop=revisions|pageimages&rvprop=content&pithumbsize=600&redirects=1&format=json`,
          5500
        );
        if (pageRes.ok) {
          const pageJson = (await pageRes.json()) as {
            query?: { pages?: Record<string, MediaWikiQueryPage> };
          };
          const validPages = Object.values(pageJson.query?.pages || {}).filter(
            (p) => p.title && p.missing === undefined
          );

          // Rank pages strictly by exact title/ISBN compatibility, missing token guard, and format match
          const wantsBigCollection =
            /\b(?:omnibus|compendium|complete\s+collection|epic\s+collection|absolute|library\s+edition|masterworks|deluxe\s+edition|colossal)\b/i.test(
              title
            );
          const queryBaseNorm = normalizeCollectionBaseTitle(trimmedTitle || title);
          const queryDistinctTokens = extractCollectionDistinctTokens(trimmedTitle || title);

          let bestPage: MediaWikiQueryPage | undefined;
          let bestWt = '';
          let bestIssues: string[] = [];
          let bestScore = -1;

          for (const p of validPages) {
            const wt = getRevisionText(p);
            const issueList = parseCollectedIssuePageTitles(wt);
            if (issueList.length === 0) continue;
            const isbnFieldDigits = (wt.match(/\|\s*ISBN\d*\s*=[^\n|]+/gi) || [])
              .join(' ')
              .replace(/[^0-9Xx]/g, '')
              .toUpperCase();
            const wtDigits = wt.replace(/[^0-9Xx]/g, '').toUpperCase();
            const hasExactIsbn = Boolean(cleanIsbn && isbnFieldDigits.includes(cleanIsbn));
            const hasLooseIsbn = Boolean(!hasExactIsbn && cleanIsbn && wtDigits.includes(cleanIsbn));
            const cleanPageTitle = (p.title || '')
              .replace(/\s*\(Collected\)\s*$/i, '')
              .trim();
            const pageIsBigCollection =
              /\b(?:omnibus|compendium|complete\s+collection|epic\s+collection|absolute|library\s+edition|masterworks|deluxe|colossal)\b/i.test(
                cleanPageTitle
              );

            // Prevent trade paperback or full-series index pages from hijacking Compendium / Omnibus collections
            if (wantsBigCollection && !hasExactIsbn && !pageIsBigCollection) {
              continue;
            }

            const pageBaseNorm = normalizeCollectionBaseTitle(cleanPageTitle);
            const pageDistinctTokens = extractCollectionDistinctTokens(cleanPageTitle);
            const pageTokenSet = new Set(pageDistinctTokens);
            const queryTokenSet = new Set(queryDistinctTokens);

            const exactBaseMatch = Boolean(queryBaseNorm && pageBaseNorm === queryBaseNorm);
            const matchedTokens = queryDistinctTokens.filter((t) => pageTokenSet.has(t)).length;
            const missingFromPage = queryDistinctTokens.filter((t) => !pageTokenSet.has(t));
            const extraOnPage = pageDistinctTokens.filter((t) => !queryTokenSet.has(t));

            // Guard against generic shorter titles (e.g. "Captain America Omnibus") hijacking subtitled omnibuses
            if (!hasExactIsbn && !hasLooseIsbn && !exactBaseMatch) {
              if (matchedTokens === 0) continue;
              if (
                missingFromPage.length > 0 &&
                matchedTokens / Math.max(1, queryDistinctTokens.length) < 0.75
              ) {
                continue;
              }
            }

            const pageVolMatch =
              cleanPageTitle.match(/\bVol\.?\s+1\s+(\d+)$/i) ||
              cleanPageTitle.match(/\bVol\.?\s*(\d+)$/i);
            const pageVolNum = pageVolMatch ? Number(pageVolMatch[1]) : undefined;
            const volMatchBoost =
              pageVolNum !== undefined
                ? pageVolNum === volNum
                  ? 2
                  : -2
                : 0;
            const formatBoost = wantsBigCollection && pageIsBigCollection ? 25 : 0;
            const titleScore = exactBaseMatch
              ? 120
              : matchedTokens * 18 - missingFromPage.length * 35 - extraOnPage.length * 20;

            const score =
              (hasExactIsbn ? 200 : hasLooseIsbn ? 60 : 0) +
              titleScore +
              volMatchBoost * 15 +
              formatBoost +
              Math.min(5, issueList.length / 20);
            if (score > bestScore) {
              bestScore = score;
              bestPage = p;
              bestWt = wt;
              bestIssues = issueList;
            }
          }

          if (bestPage && bestIssues.length > 0) {
            const specs: WikiIssueSpec[] = bestIssues.map((ip) => ({
              pageTitle: ip,
              rawNum: deriveRawIssueNumFromPageTitle(ip),
              seriesTitle: deriveSeriesTitleFromPageTitle(ip),
            }));
            const issues = await hydrateWikiIssuePages(wiki, specs, limit);
            const yearMatch = bestWt.match(/\|\s*Year\s*=\s*(\d{4})\b/i);
            const resolvedYear = yearMatch ? Number(yearMatch[1]) : undefined;
            const coverUrl = bestPage.thumbnail?.source
              ? upscaleFandomThumb(bestPage.thumbnail.source)
              : undefined;
            return {
              totalIssues: specs.length,
              wiki,
              collectionPageTitle: bestPage.title,
              coverUrl,
              publisher: WIKI_PUBLISHER[wiki],
              year: resolvedYear,
              issues,
            };
          }
        }
      }
    } catch {
      // try next wiki or fallback to Strategy B
    }
  }

  // Strategy B: Fallback to "Collects ..." blurb resolution across component series
  const clauses = parseCollectsClauses(overview);
  if (clauses.length > 0) {
    const primaryWiki = wikiOrder[0];
    const resolvedVolCache = new Map<string, { wiki: ComicWikiSlug; volTitle: string } | null>();
    const specs: WikiIssueSpec[] = [];
    let resolvedWiki: ComicWikiSlug = primaryWiki;

    for (const c of clauses) {
      const cacheKey = `${c.seriesQuery.toLowerCase()}::${c.targetYear || ''}`;
      if (!resolvedVolCache.has(cacheKey)) {
        let matched: { wiki: ComicWikiSlug; volTitle: string } | null = null;
        for (const w of wikiOrder) {
          const hits = await queryWikiComicVolumes(w, c.seriesQuery);
          if (hits.length === 0) continue;
          const exactYear = c.targetYear
            ? hits.find(
                (h) =>
                  h.startYear === c.targetYear ||
                  (h.startYear <= c.targetYear! && (h.endYear || 9999) >= c.targetYear!)
              )
            : undefined;
          const pick = exactYear || hits[0];
          matched = { wiki: w, volTitle: pick.volTitle };
          break;
        }
        resolvedVolCache.set(cacheKey, matched);
      }
      const match = resolvedVolCache.get(cacheKey);
      if (!match) continue;
      resolvedWiki = match.wiki;
      const seriesTitle = deriveSeriesTitleFromPageTitle(match.volTitle);
      for (const n of c.nums) {
        specs.push({
          pageTitle: `${match.volTitle} ${n}`,
          rawNum: String(n),
          seriesTitle,
        });
      }
    }

    if (specs.length > 0) {
      const issues = await hydrateWikiIssuePages(resolvedWiki, specs, limit);
      return {
        totalIssues: specs.length,
        wiki: resolvedWiki,
        issues,
      };
    }
  }

  return { totalIssues: 0, issues: {} };
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const wikiParam = url.searchParams.get('wiki') as ComicWikiSlug | null;
    const volParam = url.searchParams.get('vol');

    if (url.searchParams.get('mode') === 'collection') {
      const limit = Number(url.searchParams.get('limit') || '100');
      const rawWiki = url.searchParams.get('wiki');
      const wikiHint =
        rawWiki === 'marvel' || rawWiki === 'dc' || rawWiki === 'imagecomics'
          ? rawWiki
          : undefined;
      const payload = await fetchComicCollectionIssuesPayload({
        title: url.searchParams.get('title') || '',
        isbn: url.searchParams.get('isbn') || undefined,
        overview: url.searchParams.get('overview') || undefined,
        publisher: url.searchParams.get('publisher') || undefined,
        wikiHint,
        pageTitleHint: url.searchParams.get('pageTitle') || undefined,
        limit: Number.isFinite(limit) ? limit : 100,
      });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
        },
      });
    }

    if (
      wikiParam &&
      (wikiParam === 'marvel' ||
        wikiParam === 'dc' ||
        wikiParam === 'imagecomics' ||
        wikiParam === 'darkhorse' ||
        wikiParam === 'idw' ||
        wikiParam === 'boom' ||
        wikiParam === 'comicvine') &&
      volParam
    ) {
      const limit = Number(url.searchParams.get('limit') || '60');
      const payload = await fetchComicSeriesIssuesPayload(
        wikiParam,
        volParam,
        Number.isFinite(limit) ? limit : 60
      );
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
        },
      });
    }

    if (url.searchParams.get('mode') === 'trending') {
      const limit = Number(url.searchParams.get('limit') || '18');
      const payload = await fetchTrendingComicSeriesPayload(
        Number.isFinite(limit) ? Math.max(6, Math.min(25, limit)) : 18
      );
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
        },
      });
    }

    const q = (url.searchParams.get('q') || '').trim();
    const payload = await searchComicSeriesPayload(q);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600',
      },
    });
  } catch {
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  }
}
