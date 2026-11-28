import type { LiveSearchResult } from '../services/mediaApi';
import type { GameItem, Movie, ReadItem, Show } from '../types';
import generated from './generatedMedia.json';

export interface DiscoverCollection {
  id: string;
  title: string;
  description: string;
  domains: Array<'watch' | 'read' | 'play'>;
  domainLabel: string;
  previewPosters: string[];
  items: LiveSearchResult[];
}

const showById = new Map<string, Show>((generated.shows as Show[]).map((s) => [s.id, s]));
const movieById = new Map<string, Movie>((generated.movies as Movie[]).map((m) => [m.id, m]));
const readById = new Map<string, ReadItem>(
  ((generated.readItems || []) as ReadItem[]).map((r) => [r.id, r])
);
const gameById = new Map<string, GameItem>(
  ((generated.games || []) as GameItem[]).map((g) => [g.id, g])
);

function mapRef(ref: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }): LiveSearchResult | null {
  if (ref.kind === 'show') {
    const s = showById.get(ref.id);
    if (!s) return null;
    return {
      domain: 'watch',
      kind: 'show',
      id: s.id,
      source: 'tvmaze',
      externalId: s.tvmazeId || s.id,
      title: s.title,
      year: s.year,
      mediaType: 'tv',
      genres: s.genres,
      rating: s.rating,
      posterUrl: s.posterUrl,
      backdropUrl: s.backdropUrl,
      overview: s.overview,
      runtime: s.runtimeAvg,
    };
  }
  if (ref.kind === 'movie') {
    const m = movieById.get(ref.id);
    if (!m) return null;
    return {
      domain: 'watch',
      kind: 'movie',
      id: m.id,
      source: 'itunes',
      externalId: m.id,
      title: m.title,
      year: m.year,
      mediaType: 'movie',
      genres: m.genres,
      rating: m.rating,
      posterUrl: m.posterUrl,
      backdropUrl: m.backdropUrl,
      overview: m.overview,
      director: m.director,
      runtime: m.runtime,
    };
  }
  if (ref.kind === 'read') {
    const r = readById.get(ref.id);
    if (!r) return null;
    return {
      domain: 'read',
      kind: 'read',
      id: r.id,
      source: 'openlibrary',
      externalId: r.id,
      title: r.title,
      subtitle: r.creator,
      year: r.year,
      mediaType: r.format,
      genres: r.genres,
      rating: r.rating,
      posterUrl: r.coverUrl,
      backdropUrl: r.backdropUrl || r.coverUrl,
      overview: r.overview,
      director: r.creator,
      totalUnits: r.totalUnits,
    };
  }
  const g = gameById.get(ref.id);
  if (!g) return null;
  return {
    domain: 'play',
    kind: 'game',
    id: g.id,
    source: 'wikipedia',
    externalId: g.id,
    title: g.title,
    subtitle: g.platforms.slice(0, 2).join(' · '),
    year: g.year,
    mediaType: 'game',
    genres: g.genres,
    rating: g.rating,
    posterUrl: g.coverUrl,
    backdropUrl: g.backdropUrl,
    overview: g.overview,
    director: g.developer,
    platforms: g.platforms,
  };
}

const RAW_SPECS: Array<{
  id: string;
  title: string;
  description: string;
  domains: Array<'watch' | 'read' | 'play'>;
  domainLabel: string;
  refs: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>;
}> = [
  {
    id: 'col-scifi-worlds',
    title: 'Sci-Fi Worlds',
    description: 'Essential speculative worlds across cinema, TV, novels, and RPGs.',
    domains: ['watch', 'read', 'play'],
    domainLabel: 'Watch · Read · Play',
    refs: [
      { kind: 'movie', id: 'dune-part-two' },
      { kind: 'read', id: 'dune-book' },
      { kind: 'game', id: 'cyberpunk-2077' },
      { kind: 'show', id: 'severance' },
      { kind: 'show', id: 'silo' },
      { kind: 'movie', id: 'blade-runner-2049' },
      { kind: 'movie', id: 'interstellar' },
      { kind: 'read', id: 'project-hail-mary' },
      { kind: 'read', id: 'three-body-problem' },
    ],
  },
  {
    id: 'col-dark-fantasy',
    title: 'Dark Fantasy & Seinen',
    description: 'Brooding epics spanning dark manga, prestige fantasy TV, and Soulsborne games.',
    domains: ['watch', 'read', 'play'],
    domainLabel: 'Watch · Read · Play',
    refs: [
      { kind: 'read', id: 'berserk' },
      { kind: 'game', id: 'elden-ring' },
      { kind: 'show', id: 'house-of-the-dragon' },
      { kind: 'game', id: 'sekiro' },
      { kind: 'show', id: 'attack-on-titan' },
      { kind: 'read', id: 'vagabond' },
      { kind: 'read', id: 'chainsaw-man' },
      { kind: 'game', id: 'hollow-knight' },
    ],
  },
  {
    id: 'col-cape-noir',
    title: 'Heroes & Graphic Runs',
    description: 'Standout superhero films, animated series, and iconic comic runs.',
    domains: ['watch', 'read'],
    domainLabel: 'Watch · Read',
    refs: [
      { kind: 'movie', id: 'the-batman' },
      { kind: 'read', id: 'batman-year-one' },
      { kind: 'movie', id: 'spider-verse' },
      { kind: 'show', id: 'the-boys' },
      { kind: 'read', id: 'invincible-comic' },
      { kind: 'read', id: 'watchmen' },
      { kind: 'movie', id: 'avengers-endgame' },
    ],
  },
  {
    id: 'col-prestige-tv',
    title: 'Prestige TV Essentials',
    description: 'Critically acclaimed dramas and event series worth starting from episode one.',
    domains: ['watch'],
    domainLabel: 'Watch',
    refs: [
      { kind: 'show', id: 'breaking-bad' },
      { kind: 'show', id: 'severance' },
      { kind: 'show', id: 'the-bear' },
      { kind: 'show', id: 'the-last-of-us' },
      { kind: 'show', id: 'the-white-lotus' },
      { kind: 'show', id: 'stranger-things' },
      { kind: 'show', id: 'squid-game' },
    ],
  },
  {
    id: 'col-essential-reads',
    title: 'Essential Manga & Comics',
    description: 'Must-read serialized runs and landmark graphic novels.',
    domains: ['read'],
    domainLabel: 'Read',
    refs: [
      { kind: 'read', id: 'saga' },
      { kind: 'read', id: 'one-piece' },
      { kind: 'read', id: 'watchmen' },
      { kind: 'read', id: 'berserk' },
      { kind: 'read', id: 'invincible-comic' },
      { kind: 'read', id: 'piranesi' },
    ],
  },
  {
    id: 'col-masterpiece-games',
    title: 'Masterpiece RPGs & Action',
    description: 'Genre-defining campaigns, open worlds, and tactical adventures.',
    domains: ['play'],
    domainLabel: 'Play',
    refs: [
      { kind: 'game', id: 'baldurs-gate-3' },
      { kind: 'game', id: 'expedition-33' },
      { kind: 'game', id: 'zelda-totk' },
      { kind: 'game', id: 'rdr2' },
      { kind: 'game', id: 'witcher-3' },
      { kind: 'game', id: 'hades-ii' },
      { kind: 'game', id: 'metaphor-refantazio' },
      { kind: 'game', id: 'persona-5-royal' },
    ],
  },
];

const ALL_DISCOVER_COLLECTIONS: DiscoverCollection[] = RAW_SPECS.map((spec) => {
  const items = spec.refs
    .map(mapRef)
    .filter((x): x is LiveSearchResult => Boolean(x));
  return {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    domains: spec.domains,
    domainLabel: spec.domainLabel,
    previewPosters: items.slice(0, 3).map((x) => x.posterUrl),
    items,
  };
}).filter((c) => c.items.length >= 3);

export function getDiscoverCollections(
  scope: 'all' | 'watch' | 'read' | 'play'
): DiscoverCollection[] {
  if (scope === 'all') return ALL_DISCOVER_COLLECTIONS;
  return ALL_DISCOVER_COLLECTIONS.filter((c) => c.domains.includes(scope));
}

/** Returns all curated titles from generatedMedia mapped as Discover candidates. */
export function getAllCuratedDiscoverCandidates(): LiveSearchResult[] {
  const out: LiveSearchResult[] = [];
  const seen = new Set<string>();
  const pushRef = (ref: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return;
    const mapped = mapRef(ref);
    if (!mapped) return;
    seen.add(key);
    out.push(mapped);
  };

  for (const s of generated.shows as Show[]) pushRef({ kind: 'show', id: s.id });
  for (const m of generated.movies as Movie[]) pushRef({ kind: 'movie', id: m.id });
  for (const r of (generated.readItems || []) as ReadItem[]) pushRef({ kind: 'read', id: r.id });
  for (const g of (generated.games || []) as GameItem[]) pushRef({ kind: 'game', id: g.id });

  return out;
}

/** Finds curated thematic collections containing a given title or id. */
export function getCollectionsForTitle(title: string, id?: string): DiscoverCollection[] {
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return ALL_DISCOVER_COLLECTIONS.filter((col) =>
    col.items.some((item) => {
      if (id && item.id === id) return true;
      const itemNorm = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return norm.length > 0 && itemNorm === norm;
    })
  );
}
