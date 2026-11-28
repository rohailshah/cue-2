export type GameDiscoverMode = 'trending' | 'anticipated' | 'popular';

export interface TrendingGameItem {
  id: string;
  appId?: number;
  title: string;
  year: number;
  releasedAt: number;
  rating: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  platforms: string[];
  genres: string[];
  subtitle: string;
  isFree?: boolean;
}

export type TrendingSteamGameItem = TrendingGameItem;

interface SteamSearchJson {
  items?: Array<{
    name?: string;
    logo?: string;
  }>;
}

interface SteamTopReleasesJson {
  response?: {
    pages?: Array<{
      name?: string;
      item_ids?: Array<{ appid?: number }>;
    }>;
  };
}

interface SteamBrowseItemsJson {
  response?: {
    store_items?: Array<{
      appid?: number;
      type?: number;
      name?: string;
      is_free?: boolean;
      basic_info?: {
        short_description?: string;
      };
      release?: {
        steam_release_date?: number;
        is_coming_soon?: boolean;
      };
      assets?: {
        asset_url_format?: string;
        library_capsule?: string;
        library_capsule_2x?: string;
        header?: string;
      };
      reviews?: {
        summary_filtered?: {
          percent_positive?: number;
          review_count?: number;
        };
      };
    }>;
  };
}

interface MetacriticGameRaw {
  id?: number;
  title?: string;
  slug?: string;
  premiereYear?: number;
  releaseDate?: string;
  description?: string;
  image?: {
    bucketPath?: string;
  };
  criticScoreSummary?: {
    score?: number;
    reviewCount?: number;
  };
  genres?: Array<{ name?: string }>;
  platforms?: Array<{ name?: string }>;
}

interface WikiTopJson {
  items?: Array<{
    articles?: Array<{
      article?: string;
      views?: number;
    }>;
  }>;
}

const UA_HEADER = 'CueMediaTracker/1.0 (+https://cue-three-theta.vercel.app)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PLATFORM_MAP: Record<string, string> = {
  'playstation 5': 'PS5',
  'playstation 4': 'PS4',
  'xbox series x': 'Xbox Series X|S',
  'xbox series x/s': 'Xbox Series X|S',
  'xbox one': 'Xbox One',
  'nintendo switch 2': 'Switch 2',
  'nintendo switch': 'Switch',
  pc: 'PC',
  'ios (iphone/ipad)': 'iOS',
};

function normGameKey(title: string): string {
  return title
    .replace(/[®™©]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlatformNames(rawPlatforms?: Array<{ name?: string }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of rawPlatforms || []) {
    const rawName = (p.name || '').trim();
    if (!rawName) continue;
    const mapped = PLATFORM_MAP[rawName.toLowerCase()] || rawName;
    if (!seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

function buildSteamAssetUrl(format: string | undefined, filename: string | undefined): string {
  if (!format || !filename) return '';
  return `https://shared.fastly.steamstatic.com/store_item_assets/${format.replace('${FILENAME}', filename)}`;
}

async function fetchWikiPageviewBoostMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const offsetDays of [1, 2]) {
    const d = new Date(Date.now() - offsetDays * 86400 * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    try {
      const res = await fetch(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${yyyy}/${mm}/${dd}`,
        { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as WikiTopJson;
      const articles = json.items?.[0]?.articles || [];
      if (articles.length === 0) continue;
      for (const a of articles) {
        const rawTitle = (a.article || '')
          .replace(/_/g, ' ')
          .replace(/\s*\([^)]*\)$/, '');
        const key = normGameKey(rawTitle);
        const views = typeof a.views === 'number' ? a.views : 0;
        if (key && views > (map.get(key) || 0)) {
          map.set(key, views);
        }
      }
      return map;
    } catch {
      // try previous day
    }
  }
  return map;
}

async function fetchMetacriticRecentGames(): Promise<MetacriticGameRaw[]> {
  const minYear = new Date(Date.now() - 275 * 86400 * 1000).getUTCFullYear();
  const offsets = [0, 50, 100, 150];
  const pages = await Promise.allSettled(
    offsets.map(async (offset) => {
      const res = await fetch(
        `https://backend.metacritic.com/finder/metacritic/web?sortBy=-metaScore&productType=games&releaseYearMin=${minYear}&offset=${offset}&limit=50`,
        { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) return [] as MetacriticGameRaw[];
      const json = (await res.json()) as { data?: { items?: MetacriticGameRaw[] } };
      return json.data?.items || [];
    })
  );
  const all: MetacriticGameRaw[] = [];
  for (const p of pages) {
    if (p.status === 'fulfilled') all.push(...p.value);
  }
  return all;
}

async function collectCandidateAppIds(): Promise<number[]> {
  const orderedIds: number[] = [];
  const seen = new Set<number>();
  const pushId = (id: number) => {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  };

  const [popNewRes, topRes, releasesRes] = await Promise.allSettled([
    fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&category1=998&filter=popularnew&json=1',
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
    ),
    fetch(
      'https://store.steampowered.com/search/results/?query&start=0&count=50&category1=998&filter=topsellers&json=1',
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
    ),
    fetch('https://api.steampowered.com/ISteamChartsService/GetTopReleasesPages/v1/', {
      headers: { 'User-Agent': UA_HEADER },
      signal: AbortSignal.timeout(5000),
    }),
  ]);

  const extractFromSearch = async (resPromise: PromiseSettledResult<Response>) => {
    if (resPromise.status !== 'fulfilled' || !resPromise.value.ok) return;
    try {
      const json = (await resPromise.value.json()) as SteamSearchJson;
      for (const entry of json.items || []) {
        const m = (entry.logo || '').match(/\/apps\/(\d+)\//);
        if (m) pushId(Number(m[1]));
      }
    } catch {
      // ignore parse errors
    }
  };

  // Prioritize popular new releases first, then top sellers
  await extractFromSearch(popNewRes);
  await extractFromSearch(topRes);

  if (releasesRes.status === 'fulfilled' && releasesRes.value.ok) {
    try {
      const json = (await releasesRes.value.json()) as SteamTopReleasesJson;
      for (const page of (json.response?.pages || []).slice(0, 3)) {
        for (const item of page.item_ids || []) {
          if (item.appid) pushId(Number(item.appid));
        }
      }
    } catch {
      // ignore
    }
  }

  return orderedIds.slice(0, 90);
}

async function fetchStoreItemsChunk(appIds: number[]) {
  if (appIds.length === 0) return [];
  const inputJson = JSON.stringify({
    ids: appIds.map((appid) => ({ appid })),
    context: { language: 'english', country_code: 'US' },
    data_request: {
      include_assets: true,
      include_release: true,
      include_basic_info: true,
      include_reviews: true,
    },
  });
  const res = await fetch(
    `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(inputJson)}`,
    { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as SteamBrowseItemsJson;
  return data.response?.store_items || [];
}

async function fetchSteamRecentItems() {
  const candidateIds = await collectCandidateAppIds();
  if (candidateIds.length === 0) return { candidateIds, storeItems: [] };
  const chunks: number[][] = [];
  for (let i = 0; i < candidateIds.length; i += 45) {
    chunks.push(candidateIds.slice(i, i + 45));
  }
  const chunkResults = await Promise.all(chunks.map(fetchStoreItemsChunk));
  return { candidateIds, storeItems: chunkResults.flat() };
}

async function fetchSteamIdsFromFilter(
  filter: 'popularnew' | 'topsellers' | 'popularwishlist' | 'comingsoon',
  count = 50
): Promise<number[]> {
  const ordered: number[] = [];
  const seen = new Set<number>();
  try {
    const res = await fetch(
      `https://store.steampowered.com/search/results/?query&start=0&count=${count}&category1=998&filter=${filter}&json=1`,
      { headers: { 'User-Agent': UA_HEADER }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return ordered;
    const json = (await res.json()) as SteamSearchJson;
    for (const entry of json.items || []) {
      const m = (entry.logo || '').match(/\/apps\/(\d+)\//);
      if (!m) continue;
      const id = Number(m[1]);
      if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
  } catch {
    // ignore
  }
  return ordered;
}

async function fetchMetacriticQuery(params: string): Promise<MetacriticGameRaw[]> {
  try {
    const res = await fetch(`https://backend.metacritic.com/finder/metacritic/web?${params}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { items?: MetacriticGameRaw[] } };
    return json.data?.items || [];
  } catch {
    return [];
  }
}

function mapMetacriticGame(raw: MetacriticGameRaw, fallbackText: string): TrendingGameItem | null {
  const title = (raw.title || '').trim();
  const bucketPath = raw.image?.bucketPath;
  if (!title || !bucketPath) return null;
  const relStr = raw.releaseDate || '';
  const releasedMs = relStr ? Date.parse(`${relStr}T12:00:00Z`) : NaN;
  const releasedSec = Number.isFinite(releasedMs)
    ? Math.floor(releasedMs / 1000)
    : raw.premiereYear
      ? Math.floor(Date.UTC(raw.premiereYear, 6, 1) / 1000)
      : 0;
  const year =
    raw.premiereYear ||
    (Number.isFinite(releasedMs) ? new Date(releasedMs).getUTCFullYear() : new Date().getUTCFullYear());
  const metaScore = raw.criticScoreSummary?.score || 0;
  const platforms = normalizePlatformNames(raw.platforms);
  const genres = (raw.genres || [])
    .map((g) => (g.name || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const posterUrl = `https://www.metacritic.com/a/img/catalog${bucketPath}`;
  const rating =
    metaScore > 0 ? Number(Math.max(3.0, Math.min(5.0, metaScore / 20)).toFixed(1)) : 4.5;
  const subtitle = platforms.length > 0 ? platforms.slice(0, 2).join(' · ') : 'Console & PC';
  const key = normGameKey(title);
  return {
    id: raw.slug ? `mc-${raw.slug}` : `mc-${raw.id || key.replace(/\s+/g, '-')}`,
    title,
    year,
    releasedAt: releasedSec,
    rating,
    posterUrl,
    backdropUrl: posterUrl,
    overview: (raw.description || '').trim() || `${title} — ${fallbackText}.`,
    platforms: platforms.length > 0 ? platforms : ['PS5', 'Xbox Series X|S', 'PC'],
    genres: genres.length > 0 ? genres : ['Video Game'],
    subtitle,
  };
}

async function fetchAnticipatedGamesPayload(limit: number): Promise<{ items: TrendingGameItem[] }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentYear = new Date().getUTCFullYear();

  const [wishlistIds, comingIds, mcCurrRes, wikiRes] = await Promise.allSettled([
    fetchSteamIdsFromFilter('popularwishlist', 40),
    fetchSteamIdsFromFilter('comingsoon', 30),
    fetchMetacriticQuery(
      `sortBy=-releaseDate&productType=games&releaseYearMin=${currentYear}&offset=0&limit=50`
    ),
    fetchWikiPageviewBoostMap(),
  ]);

  const seenSteamIds = new Set<number>();
  const orderedSteamIds: number[] = [];
  for (const id of [
    ...(wishlistIds.status === 'fulfilled' ? wishlistIds.value : []),
    ...(comingIds.status === 'fulfilled' ? comingIds.value : []),
  ]) {
    if (!seenSteamIds.has(id)) {
      seenSteamIds.add(id);
      orderedSteamIds.push(id);
    }
  }
  const steamItems =
    orderedSteamIds.length > 0 ? await fetchStoreItemsChunk(orderedSteamIds.slice(0, 45)) : [];
  const mcRaw = mcCurrRes.status === 'fulfilled' ? mcCurrRes.value : [];
  const wikiMap = wikiRes.status === 'fulfilled' ? wikiRes.value : new Map<string, number>();

  const orderIndex = new Map<number, number>();
  orderedSteamIds.forEach((id, idx) => orderIndex.set(id, idx));

  const byKey = new Map<string, TrendingGameItem & { buzz: number }>();

  const orderedSteam = [...steamItems].sort(
    (a, b) => (orderIndex.get(a.appid || 0) ?? 999) - (orderIndex.get(b.appid || 0) ?? 999)
  );
  orderedSteam.forEach((item, idx) => {
    const appId = item.appid;
    const title = (item.name || '').trim();
    if (!appId || !title || (item.type !== undefined && item.type !== 0)) return;
    const relSec = item.release?.steam_release_date || 0;
    const isFuture = Boolean(item.release?.is_coming_soon) || relSec === 0 || relSec > nowSec;
    if (!isFuture) return;
    const relCapsule =
      item.assets?.library_capsule_2x || item.assets?.library_capsule || item.assets?.header;
    const posterUrl = buildSteamAssetUrl(item.assets?.asset_url_format, relCapsule);
    if (!posterUrl) return;
    const backdropUrl =
      buildSteamAssetUrl(item.assets?.asset_url_format, item.assets?.header) ||
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
    const key = normGameKey(title);
    if (!key) return;
    const wikiViews = wikiMap.get(key) || 0;
    const wikiBoost = wikiViews > 0 ? Math.min(220, Math.log10(wikiViews) * 40) : 0;
    const buzz = Math.max(90, 260 - idx * 7) + wikiBoost;
    const year = relSec > nowSec ? new Date(relSec * 1000).getUTCFullYear() : currentYear + 1;

    byKey.set(key, {
      id: `steam-${appId}`,
      appId,
      title,
      year,
      releasedAt: relSec || Math.floor(Date.UTC(year, 6, 1) / 1000),
      rating: 4.6,
      posterUrl,
      backdropUrl,
      overview: (item.basic_info?.short_description || '').trim() || `${title} — upcoming release.`,
      platforms: ['PC', 'Steam Deck'],
      genres: ['Video Game'],
      subtitle: 'Upcoming · PC',
      isFree: item.is_free,
      buzz,
    });
  });

  for (const raw of mcRaw) {
    const mapped = mapMetacriticGame(raw, 'upcoming release');
    if (!mapped) continue;
    const isFuture = mapped.releasedAt > nowSec || mapped.year >= currentYear + 1;
    if (!isFuture) continue;
    const key = normGameKey(mapped.title);
    if (!key) continue;
    const wikiViews = wikiMap.get(key) || 0;
    const wikiBoost = wikiViews > 0 ? Math.min(220, Math.log10(wikiViews) * 40) : 0;
    const buzz = 120 + mapped.platforms.length * 14 + wikiBoost;
    const prev = byKey.get(key);
    if (prev) {
      const mergedPlatforms = prev.platforms.includes('PC')
        ? prev.platforms
        : [...mapped.platforms, 'PC'];
      byKey.set(key, {
        ...prev,
        platforms: mergedPlatforms,
        subtitle: mergedPlatforms.slice(0, 2).join(' · '),
        buzz: Math.max(prev.buzz, buzz) + 20,
      });
    } else {
      byKey.set(key, { ...mapped, buzz });
    }
  }

  return {
    items: Array.from(byKey.values())
      .sort((a, b) => b.buzz - a.buzz)
      .slice(0, limit)
      .map(({ buzz: _b, ...rest }) => rest),
  };
}

async function fetchPopularGamesPayload(limit: number): Promise<{ items: TrendingGameItem[] }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const sixMonthsSec = 190 * 86400;
  const currentYear = new Date().getUTCFullYear();

  const [mcTop0, mcTop1, steamIds] = await Promise.allSettled([
    fetchMetacriticQuery(
      `sortBy=-metaScore&productType=games&releaseYearMin=2012&releaseYearMax=${currentYear - 1}&offset=0&limit=50`
    ),
    fetchMetacriticQuery(
      `sortBy=-metaScore&productType=games&releaseYearMin=2012&releaseYearMax=${currentYear - 1}&offset=50&limit=50`
    ),
    fetchSteamIdsFromFilter('topsellers', 50),
  ]);

  const mcRaw = [
    ...(mcTop0.status === 'fulfilled' ? mcTop0.value : []),
    ...(mcTop1.status === 'fulfilled' ? mcTop1.value : []),
  ];
  const orderedSteamIds = steamIds.status === 'fulfilled' ? steamIds.value.slice(0, 45) : [];
  const steamItems = orderedSteamIds.length > 0 ? await fetchStoreItemsChunk(orderedSteamIds) : [];

  const byKey = new Map<string, TrendingGameItem & { popScore: number }>();

  for (const raw of mcRaw) {
    const mapped = mapMetacriticGame(raw, 'all-time classic');
    if (!mapped) continue;
    const metaScore = raw.criticScoreSummary?.score || 0;
    const reviewCount = raw.criticScoreSummary?.reviewCount || 0;
    if (reviewCount < 25 || metaScore < 85) continue;
    if (/\b(remastered|complete edition|definitive edition|goty|game of the year)\b/i.test(mapped.title)) {
      continue;
    }
    const key = normGameKey(mapped.title);
    if (!key) continue;
    const popScore = metaScore * 2 + Math.min(80, reviewCount * 0.7);
    const prev = byKey.get(key);
    if (!prev || popScore > prev.popScore) {
      byKey.set(key, { ...mapped, popScore });
    }
  }

  for (const item of steamItems) {
    const appId = item.appid;
    const title = (item.name || '').trim();
    if (!appId || !title || (item.type !== undefined && item.type !== 0)) continue;
    const relSec = item.release?.steam_release_date || 0;
    if (item.release?.is_coming_soon || relSec <= 0 || relSec > nowSec - sixMonthsSec) continue;
    const reviewCount = item.reviews?.summary_filtered?.review_count || 0;
    if (reviewCount < 1500) continue;
    const relCapsule = item.assets?.library_capsule_2x || item.assets?.library_capsule;
    const posterUrl = buildSteamAssetUrl(item.assets?.asset_url_format, relCapsule);
    if (!posterUrl) continue;
    const backdropUrl =
      buildSteamAssetUrl(item.assets?.asset_url_format, item.assets?.header) ||
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
    const key = normGameKey(title);
    if (!key) continue;
    const pctPos = item.reviews?.summary_filtered?.percent_positive || 88;
    const rating = Number(Math.max(3.0, Math.min(5.0, pctPos / 20)).toFixed(1));
    const popScore = pctPos * 1.6 + Math.min(90, Math.log10(reviewCount) * 18);

    const prev = byKey.get(key);
    if (prev) {
      const mergedPlatforms = prev.platforms.includes('PC') ? prev.platforms : [...prev.platforms, 'PC'];
      byKey.set(key, {
        ...prev,
        appId,
        posterUrl,
        backdropUrl,
        platforms: mergedPlatforms,
        subtitle: mergedPlatforms.slice(0, 2).join(' · '),
        popScore: Math.max(prev.popScore, popScore) + 25,
      });
    } else {
      byKey.set(key, {
        id: `steam-${appId}`,
        appId,
        title,
        year: new Date(relSec * 1000).getUTCFullYear(),
        releasedAt: relSec,
        rating,
        posterUrl,
        backdropUrl,
        overview:
          (item.basic_info?.short_description || '').trim() || `${title} — evergreen PC hit.`,
        platforms: ['PC', 'Steam Deck'],
        genres: ['Video Game'],
        subtitle: 'PC · Steam',
        isFree: item.is_free,
        popScore,
      });
    }
  }

  return {
    items: Array.from(byKey.values())
      .sort((a, b) => b.popScore - a.popScore)
      .slice(0, limit)
      .map(({ popScore: _p, ...rest }) => rest),
  };
}

/** Fetches multi-platform live games (trending, anticipated, or all-time popular). */
export async function fetchTrendingGamesPayload(
  limit = 24,
  mode: GameDiscoverMode = 'trending'
): Promise<{ items: TrendingGameItem[] }> {
  const cappedLimit = Math.max(6, Math.min(30, limit));
  if (mode === 'anticipated') return fetchAnticipatedGamesPayload(cappedLimit);
  if (mode === 'popular') return fetchPopularGamesPayload(cappedLimit);

  const [mcRes, wikiRes, steamRes] = await Promise.allSettled([
    fetchMetacriticRecentGames(),
    fetchWikiPageviewBoostMap(),
    fetchSteamRecentItems(),
  ]);

  const mcRaw = mcRes.status === 'fulfilled' ? mcRes.value : [];
  const wikiMap = wikiRes.status === 'fulfilled' ? wikiRes.value : new Map<string, number>();
  const steamData =
    steamRes.status === 'fulfilled' ? steamRes.value : { candidateIds: [], storeItems: [] };

  const orderIndex = new Map<number, number>();
  steamData.candidateIds.forEach((id, idx) => orderIndex.set(id, idx));

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const sixMonthsSec = 190 * 86400;
  const nineMonthsSec = 275 * 86400;

  type ScoredEntry = TrendingGameItem & { buzz: number };

  const buildMergedForWindow = (maxAgeSec: number): TrendingGameItem[] => {
    const minReleaseSec = nowSec - maxAgeSec;
    const byKey = new Map<string, ScoredEntry>();

    // 1. Ingest Metacritic multi-platform games (PS5, Xbox, Switch 2, PC)
    for (const raw of mcRaw) {
      const title = (raw.title || '').trim();
      const bucketPath = raw.image?.bucketPath;
      const relStr = raw.releaseDate || '';
      if (!title || !bucketPath || !relStr) continue;

      const releasedMs = Date.parse(`${relStr}T12:00:00Z`);
      if (!Number.isFinite(releasedMs)) continue;
      const releasedSec = Math.floor(releasedMs / 1000);
      if (releasedSec > nowSec + 86400 || releasedSec < minReleaseSec) continue;

      const reviewCount = raw.criticScoreSummary?.reviewCount || 0;
      const metaScore = raw.criticScoreSummary?.score || 0;
      if (reviewCount < 10 && !(metaScore >= 85 && reviewCount >= 6)) continue;

      const key = normGameKey(title);
      if (!key) continue;

      const platforms = normalizePlatformNames(raw.platforms);
      const genres = (raw.genres || [])
        .map((g) => (g.name || '').trim())
        .filter(Boolean)
        .slice(0, 3);
      const posterUrl = `https://www.metacritic.com/a/img/catalog${bucketPath}`;
      const rating =
        metaScore > 0
          ? Number(Math.max(3.0, Math.min(5.0, metaScore / 20)).toFixed(1))
          : 4.5;

      const ageDays = Math.max(0, (nowMs - releasedMs) / 86400000);
      const recencyMult =
        ageDays <= 30 ? 1.55 : ageDays <= 60 ? 1.3 : ageDays <= 100 ? 1.1 : 0.9;
      const wikiViews = wikiMap.get(key) || 0;
      const wikiBoost = wikiViews > 0 ? Math.min(180, Math.log10(wikiViews) * 32) : 0;
      const editionPenalty =
        /\b(deluxe edition|gold edition|remastered|tarnished edition|complete edition|definitive edition)\b/i.test(
          title
        )
          ? 0.82
          : 1;
      const buzz =
        (Math.min(180, reviewCount) * 1.45 + Math.max(0, metaScore - 60) * 1.1) *
          recencyMult *
          editionPenalty +
        wikiBoost;

      const subtitle =
        platforms.length > 0 ? platforms.slice(0, 2).join(' · ') : 'Console & PC';

      const prev = byKey.get(key);
      if (!prev || buzz > prev.buzz) {
        byKey.set(key, {
          id: raw.slug ? `mc-${raw.slug}` : `mc-${raw.id || key.replace(/\s+/g, '-')}`,
          title,
          year: raw.premiereYear || new Date(releasedMs).getUTCFullYear(),
          releasedAt: releasedSec,
          rating,
          posterUrl,
          backdropUrl: posterUrl,
          overview: (raw.description || '').trim() || `${title} — trending release.`,
          platforms: platforms.length > 0 ? platforms : ['PS5', 'Xbox Series X|S', 'PC'],
          genres: genres.length > 0 ? genres : ['Video Game'],
          subtitle,
          buzz,
        });
      }
    }

    // 2. Collect and merge Steam live trending PC games
    const steamCandidates: Array<{
      item: (typeof steamData.storeItems)[number];
      idx: number;
    }> = [];
    const seenAppIds = new Set<number>();
    for (const item of steamData.storeItems) {
      const appId = item.appid;
      if (!appId || seenAppIds.has(appId) || !item.name) continue;
      if (item.type !== undefined && item.type !== 0) continue;
      const relSec = item.release?.steam_release_date || 0;
      if (item.release?.is_coming_soon) continue;
      if (relSec <= 0 || relSec > nowSec + 86400 || relSec < minReleaseSec) continue;

      const relCapsule = item.assets?.library_capsule_2x || item.assets?.library_capsule;
      const posterUrl = buildSteamAssetUrl(item.assets?.asset_url_format, relCapsule);
      if (!posterUrl) continue;

      seenAppIds.add(appId);
      steamCandidates.push({ item, idx: orderIndex.get(appId) ?? 999 });
    }
    steamCandidates.sort((a, b) => a.idx - b.idx);

    steamCandidates.forEach(({ item }, sortedIdx) => {
      const appId = item.appid!;
      const title = item.name!.trim();
      const key = normGameKey(title);
      if (!key) return;

      const relSec = item.release!.steam_release_date!;
      const relCapsule = item.assets?.library_capsule_2x || item.assets?.library_capsule;
      const posterUrl = buildSteamAssetUrl(item.assets?.asset_url_format, relCapsule);
      const backdropUrl =
        buildSteamAssetUrl(item.assets?.asset_url_format, item.assets?.header) ||
        `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

      const pctPos = item.reviews?.summary_filtered?.percent_positive;
      const steamReviewCount = item.reviews?.summary_filtered?.review_count || 0;
      const rating =
        typeof pctPos === 'number' && pctPos > 0
          ? Number(Math.max(3.0, Math.min(5.0, pctPos / 20)).toFixed(1))
          : 4.5;

      const steamReviewBoost =
        steamReviewCount >= 5000
          ? 55
          : steamReviewCount >= 1000
            ? 30
            : steamReviewCount >= 250
              ? 12
              : 0;
      const wikiViews = wikiMap.get(key) || 0;
      const wikiBoost = wikiViews > 0 ? Math.min(180, Math.log10(wikiViews) * 32) : 0;
      const steamBuzz = Math.max(90, 235 - sortedIdx * 14) + steamReviewBoost + wikiBoost;

      const existing = byKey.get(key);
      if (existing) {
        const mergedPlatforms = existing.platforms.includes('PC')
          ? existing.platforms
          : [...existing.platforms, 'PC'];
        byKey.set(key, {
          ...existing,
          appId,
          posterUrl,
          backdropUrl,
          platforms: mergedPlatforms,
          subtitle: mergedPlatforms.slice(0, 2).join(' · '),
          buzz: Math.max(existing.buzz, steamBuzz) + 25,
        });
      } else {
        byKey.set(key, {
          id: `steam-${appId}`,
          appId,
          title,
          year: new Date(relSec * 1000).getUTCFullYear(),
          releasedAt: relSec,
          rating,
          posterUrl,
          backdropUrl,
          overview:
            (item.basic_info?.short_description || '').trim() ||
            `${title} — trending on Steam.`,
          platforms: ['PC', 'Steam Deck'],
          genres: ['Video Game'],
          subtitle: 'PC · Steam',
          isFree: item.is_free,
          buzz: steamBuzz,
        });
      }
    });

    return Array.from(byKey.values())
      .sort((a, b) => {
        if (b.buzz !== a.buzz) return b.buzz - a.buzz;
        return b.releasedAt - a.releasedAt;
      })
      .map(({ buzz: _b, ...rest }) => rest);
  };

  let merged = buildMergedForWindow(sixMonthsSec);
  if (merged.length < cappedLimit) {
    const expanded = buildMergedForWindow(nineMonthsSec);
    const have = new Set(merged.map((x) => normGameKey(x.title)));
    for (const item of expanded) {
      const key = normGameKey(item.title);
      if (!have.has(key)) {
        have.add(key);
        merged.push(item);
      }
      if (merged.length >= cappedLimit) break;
    }
  }

  return { items: merged.slice(0, cappedLimit) };
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
    const limitParam = Number(url.searchParams.get('limit') || '24');
    const rawMode = url.searchParams.get('mode');
    const mode: GameDiscoverMode =
      rawMode === 'anticipated' || rawMode === 'popular' ? rawMode : 'trending';
    const limit = Number.isFinite(limitParam) ? limitParam : 24;
    const payload = await fetchTrendingGamesPayload(limit, mode);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=43200',
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
