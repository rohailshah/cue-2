import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
  ScanBarcode,
  Search,
  Star,
  WifiOff,
  X,
} from 'lucide-react';
import { IsbnScannerModal } from '../components/IsbnScannerModal';
import { MediaImage } from '../components/MediaImage';
import { getDiscoverCollections, type DiscoverCollection } from '../data/discoverCollections';
import {
  canonicalReadWorkKey,
  extractIsbnFromInput,
  fetchAllDiscoverRails,
  fetchDomainDiscoverRails,
  hydrateLiveGameItem,
  hydrateLiveMovie,
  hydrateLiveReadItem,
  hydrateLiveShow,
  normalizeTitleKey,
  searchByIsbn,
  searchLiveMedia,
  type DiscoverRail,
  type LiveSearchResult,
  type SearchMediaFilter,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import { resolveComicEditionCover } from '../utils/editions';
import { cleanDisplayGenres } from '../utils/stats';

type DiscoverScope = 'all' | 'watch' | 'read' | 'play';

interface DomainPillConfig {
  id: DiscoverScope;
  label: string;
  activeClass: string;
  idleClass: string;
}

const DISCOVER_PILLS: DomainPillConfig[] = [
  {
    id: 'all',
    label: 'All',
    activeClass: 'bg-white border-white text-[#131519]',
    idleClass: 'bg-surface border-white/25 text-ink hover:border-white/45',
  },
  {
    id: 'watch',
    label: 'Watch',
    activeClass: 'bg-watch border-watch text-[#0E1A1E]',
    idleClass: 'bg-watch/10 border-watch/30 text-watch hover:bg-watch/18',
  },
  {
    id: 'read',
    label: 'Read',
    activeClass: 'bg-read border-read text-[#1D160A]',
    idleClass: 'bg-read/10 border-read/30 text-read hover:bg-read/18',
  },
  {
    id: 'play',
    label: 'Play',
    activeClass: 'bg-play border-play text-[#161124]',
    idleClass: 'bg-play/10 border-play/30 text-play hover:bg-play/18',
  },
];

interface SessionSearchSnapshot {
  query: string;
  scope: DiscoverScope;
  liveResults: LiveSearchResult[];
  lastLiveQueryKey: string;
  railsByScope: Partial<Record<DiscoverScope, DiscoverRail[]>>;
  expandedRail: DiscoverRail | null;
  expandedCollection: DiscoverCollection | null;
  scrollY: number;
}

const sessionSearchState: SessionSearchSnapshot = {
  query: '',
  scope: 'all',
  liveResults: [],
  lastLiveQueryKey: '',
  railsByScope: {},
  expandedRail: null,
  expandedCollection: null,
  scrollY: 0,
};

function badgeLabelForItem(item: LiveSearchResult): string {
  if (item.mediaType === 'tv' || item.mediaType === 'anime') return 'SHOW';
  if (item.mediaType === 'movie') return 'MOVIE';
  if (item.mediaType === 'manga') return 'MANGA';
  if (item.mediaType === 'comic') return 'COMIC';
  if (item.mediaType === 'novel') return 'NOVEL';
  return 'GAME';
}

export function SearchView({
  subView,
}: {
  subView?: 'rail' | 'collection' | 'collections';
}) {
  const {
    state,
    goBack,
    pushRoute,
    addLiveShowToStore,
    addLiveAnimeToStore,
    addLiveMovieToStore,
    addLiveReadToStore,
    updateReadEditionCovers,
    addLiveGameToStore,
    toggleShowBookmark,
    toggleMovieWatchlist,
    queuePendingIsbnScan,
    removePendingIsbnScan,
    flushPendingIsbnScans,
    toggleReadBookmark,
    toggleGameBookmark,
    createCustomList,
  } = useCueStore();

  const [query, setQuery] = useState<string>(() => sessionSearchState.query);
  const [scope, setScopeState] = useState<DiscoverScope>(() => sessionSearchState.scope);
  const [liveResults, setLiveResults] = useState<LiveSearchResult[]>(
    () => sessionSearchState.liveResults
  );
  const [loadingLive, setLoadingLive] = useState(false);
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  const [railsByScope, setRailsByScope] = useState<Partial<Record<DiscoverScope, DiscoverRail[]>>>(
    () => sessionSearchState.railsByScope
  );
  const [loadingRails, setLoadingRails] = useState(
    () => !sessionSearchState.railsByScope[sessionSearchState.scope]
  );
  const [expandedRail, setExpandedRail] = useState<DiscoverRail | null>(
    () => (subView === 'rail' ? sessionSearchState.expandedRail : null)
  );
  const [expandedCollection, setExpandedCollection] = useState<DiscoverCollection | null>(
    () => (subView === 'collection' ? sessionSearchState.expandedCollection : null)
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [customComicOpen, setCustomComicOpen] = useState(false);
  const [customComicTitle, setCustomComicTitle] = useState('');
  const [customComicPub, setCustomComicPub] = useState('');
  const [customComicYear, setCustomComicYear] = useState('2026');
  const [customComicCount, setCustomComicCount] = useState('6');

  const showAllCollections = subView === 'collections';

  useEffect(() => {
    setExpandedRail(subView === 'rail' ? sessionSearchState.expandedRail : null);
    setExpandedCollection(subView === 'collection' ? sessionSearchState.expandedCollection : null);
  }, [subView]);

  useLayoutEffect(() => {
    if (subView) return;
    const savedY = sessionSearchState.scrollY;
    if (savedY <= 0) return;
    const rafId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [subView]);

  const handleQueryChange = (nextQuery: string) => {
    sessionSearchState.query = nextQuery;
    if (!nextQuery.trim()) {
      sessionSearchState.liveResults = [];
      sessionSearchState.lastLiveQueryKey = '';
      sessionSearchState.scrollY = 0;
    }
    setQuery(nextQuery);
  };

  const setScope = (nextScope: DiscoverScope) => {
    sessionSearchState.scope = nextScope;
    sessionSearchState.expandedRail = null;
    sessionSearchState.expandedCollection = null;
    sessionSearchState.scrollY = 0;
    setScopeState(nextScope);
    setExpandedRail(null);
    setExpandedCollection(null);
    if (subView) {
      goBack();
    }
  };

  const openExpandedRail = (rail: DiscoverRail) => {
    sessionSearchState.scrollY = window.scrollY;
    sessionSearchState.expandedRail = rail;
    setExpandedRail(rail);
    pushRoute({ view: 'search', subView: 'rail' });
  };

  const openExpandedCollection = (col: DiscoverCollection) => {
    sessionSearchState.scrollY = window.scrollY;
    sessionSearchState.expandedCollection = col;
    setExpandedCollection(col);
    pushRoute({ view: 'search', subView: 'collection' });
  };

  const openAllCollections = () => {
    sessionSearchState.scrollY = window.scrollY;
    pushRoute({ view: 'search', subView: 'collections' });
  };

  useEffect(() => {
    if (query.trim().length >= 2) return;
    if (railsByScope[scope]) {
      setLoadingRails(false);
      return;
    }

    let cancelled = false;
    setLoadingRails(true);
    const loader =
      scope === 'all'
        ? fetchAllDiscoverRails(state.settings.tmdbApiKey)
        : fetchDomainDiscoverRails(scope, state.settings.tmdbApiKey);

    loader
      .then((rails) => {
        if (!cancelled) {
          sessionSearchState.railsByScope = {
            ...sessionSearchState.railsByScope,
            [scope]: rails,
          };
          setRailsByScope((prev) => ({ ...prev, [scope]: rails }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          sessionSearchState.railsByScope = {
            ...sessionSearchState.railsByScope,
            [scope]: [],
          };
          setRailsByScope((prev) => ({ ...prev, [scope]: [] }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, query, railsByScope, state.settings.tmdbApiKey]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      sessionSearchState.liveResults = [];
      sessionSearchState.lastLiveQueryKey = '';
      setLiveResults([]);
      setLoadingLive(false);
      return;
    }

    const reqKey = `${scope}::${q.toLowerCase()}`;
    if (sessionSearchState.lastLiveQueryKey === reqKey) {
      setLoadingLive(false);
      return;
    }

    let cancelled = false;
    setLoadingLive(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchLiveMedia(q, scope, state.settings.tmdbApiKey);
        if (!cancelled) {
          sessionSearchState.liveResults = res;
          sessionSearchState.lastLiveQueryKey = reqKey;
          setLiveResults(res);
        }
      } catch {
        if (!cancelled) {
          sessionSearchState.liveResults = [];
          setLiveResults([]);
        }
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, scope, state.settings.tmdbApiKey]);

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const normQ = normalizeTitleKey(query);
    const matchesQ = (text: string) =>
      text.toLowerCase().includes(q) ||
      (normQ.length > 0 && normalizeTitleKey(text).includes(normQ));

    const items: Array<{
      domain: 'watch' | 'read' | 'play';
      kind: 'show' | 'movie' | 'read' | 'game';
      mediaType: SearchMediaFilter;
      id: string;
      title: string;
      year: number;
      badge: string;
      comicKind?: 'series' | 'collection';
      genres: string[];
      rating: number;
      posterUrl: string;
      inLibrary: boolean;
    }> = [];

    if (scope === 'all' || scope === 'watch') {
      for (const id of state.showOrder) {
        const s = state.shows[id];
        if (!s || !state.showProgress[s.id]?.bookmarked) continue;
        if (!matchesQ(s.title) && !s.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'show',
          mediaType: 'tv',
          id: s.id,
          title: s.title,
          year: s.year,
          badge: 'Show',
          genres: s.genres,
          rating: s.rating,
          posterUrl: s.posterUrl,
          inLibrary: true,
        });
      }

      for (const id of state.movieOrder) {
        const m = state.movies[id];
        if (!m || !state.movieProgress[m.id]) continue;
        if (!matchesQ(m.title) && !m.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'movie',
          mediaType: 'movie',
          id: m.id,
          title: m.title,
          year: m.year,
          badge: 'Movie',
          genres: m.genres,
          rating: m.rating,
          posterUrl: m.posterUrl,
          inLibrary: true,
        });
      }
    }

    if (scope === 'all' || scope === 'read') {
      for (const id of state.readOrder) {
        const r = state.readItems[id];
        if (!r || !state.readProgress[r.id]?.bookmarked) continue;
        if (
          !matchesQ(`${r.title} ${r.year} ${r.comicRunLabel || ''}`) &&
          !matchesQ(r.title) &&
          !matchesQ(r.creator) &&
          !r.genres.some((g) => g.toLowerCase().includes(q))
        ) {
          continue;
        }
        items.push({
          domain: 'read',
          kind: 'read',
          mediaType: r.format,
          id: r.id,
          title: r.title,
          year: r.year,
          badge: r.format,
          comicKind: r.comicKind,
          genres: r.genres,
          rating: r.rating,
          posterUrl: resolveComicEditionCover(
            r,
            state.readProgress[r.id]?.edition,
            state.readProgress[r.id]
          ),
          inLibrary: true,
        });
      }
    }

    if (scope === 'all' || scope === 'play') {
      for (const id of state.gameOrder) {
        const g = state.games[id];
        if (!g || !state.gameProgress[g.id]?.bookmarked) continue;
        if (
          !matchesQ(g.title) &&
          !matchesQ(g.developer) &&
          !g.genres.some((gen) => gen.toLowerCase().includes(q))
        ) {
          continue;
        }
        items.push({
          domain: 'play',
          kind: 'game',
          mediaType: 'game',
          id: g.id,
          title: g.title,
          year: g.year,
          badge: 'Game',
          genres: g.genres,
          rating: g.rating,
          posterUrl: g.coverUrl,
          inLibrary: true,
        });
      }
    }

    return items;
  }, [state, query, scope]);

  const dedupedLive = useMemo(() => {
    const localIds = new Set(localMatches.map((m) => m.id));
    const localWorkKeys = new Set(
      localMatches.map((m) =>
        m.domain === 'read'
          ? m.comicKind === 'series'
            ? `read:series:${canonicalReadWorkKey(m.title)}:${m.year}`
            : m.mediaType === 'comic'
              ? `read:collection:${canonicalReadWorkKey(m.title)}`
              : `read:${canonicalReadWorkKey(m.title)}`
          : m.kind === 'show'
            ? `watch:show:${normalizeTitleKey(m.title)}`
            : `${m.domain}:${m.kind}:${normalizeTitleKey(m.title)}`
      )
    );
    const seenLiveKeys = new Set<string>();
    const filtered: LiveSearchResult[] = [];
    const isIsbnQuery = Boolean(extractIsbnFromInput(query));

    for (const r of liveResults) {
      if (!isIsbnQuery && scope !== 'all' && r.domain !== scope) continue;
      if (localIds.has(r.id)) continue;
      const key =
        r.domain === 'read'
          ? r.comicKind === 'series'
            ? `read:series:${canonicalReadWorkKey(r.title)}:${r.year}`
            : r.mediaType === 'comic'
              ? `read:collection:${canonicalReadWorkKey(r.title)}`
              : `read:${canonicalReadWorkKey(r.title)}`
          : r.kind === 'show'
            ? `watch:show:${normalizeTitleKey(r.title)}`
            : `${r.domain}:${r.kind}:${normalizeTitleKey(r.title)}`;
      if (localWorkKeys.has(key) || seenLiveKeys.has(key)) continue;
      seenLiveKeys.add(key);
      filtered.push(r);
    }

    return filtered;
  }, [liveResults, localMatches, scope]);

  const isLiveItemInLibrary = (item: LiveSearchResult): boolean => {
    if (item.kind === 'show') return Boolean(state.showProgress[item.id]?.bookmarked);
    if (item.kind === 'movie') return Boolean(state.movieProgress[item.id]);
    if (item.kind === 'read') return Boolean(state.readProgress[item.id]?.bookmarked);
    return Boolean(state.gameProgress[item.id]?.bookmarked);
  };

  const handleOpenLiveResult = async (item: LiveSearchResult, andAdd = false) => {
    if (!andAdd && !subView) {
      sessionSearchState.scrollY = window.scrollY;
    }
    if (item.kind === 'movie') {
      if (andAdd && state.movieProgress[item.id]) {
        toggleMovieWatchlist(item.id);
        return;
      }
      const movie = hydrateLiveMovie(item);
      if (andAdd) {
        addLiveMovieToStore(state.movies[movie.id] || movie, 'watchlist', true);
      } else if (!state.movies[movie.id]) {
        addLiveMovieToStore(movie, 'watchlist', false);
      }
      if (!andAdd) pushRoute({ view: 'movie-detail', movieId: movie.id });
      return;
    }

    if (item.kind === 'read') {
      if (andAdd && state.readProgress[item.id]?.bookmarked) {
        toggleReadBookmark(item.id);
        return;
      }
      const readItem = hydrateLiveReadItem(item);
      if (!state.readItems[readItem.id]) {
        addLiveReadToStore(readItem, 'want_to_read', andAdd);
      } else {
        updateReadEditionCovers(
          readItem.id,
          readItem.editionCovers || {},
          readItem.title,
          readItem.editionIssueCounts,
          readItem.editionVariants
        );
        if (andAdd) {
          addLiveReadToStore(state.readItems[readItem.id], 'want_to_read', true);
        }
      }
      if (!andAdd) pushRoute({ view: 'read-detail', readId: readItem.id });
      return;
    }

    if (item.kind === 'game') {
      if (andAdd && state.gameProgress[item.id]?.bookmarked) {
        toggleGameBookmark(item.id);
        return;
      }
      const game = hydrateLiveGameItem(item);
      if (!state.games[game.id]) {
        addLiveGameToStore(game, 'backlog', andAdd);
      } else if (andAdd) {
        addLiveGameToStore(state.games[game.id], 'backlog', true);
      }
      if (!andAdd) pushRoute({ view: 'game-detail', gameId: game.id });
      return;
    }

    if (andAdd && state.showProgress[item.id]?.bookmarked) {
      toggleShowBookmark(item.id);
      return;
    }
    if (state.shows[item.id]) {
      if (andAdd) {
        addLiveShowToStore(state.shows[item.id], true);
      } else {
        pushRoute({ view: 'show-detail', showId: item.id });
      }
      return;
    }

    setHydratingId(item.id);
    try {
      const hydrated = await hydrateLiveShow(item, state.settings.tmdbApiKey);
      if (hydrated.mediaType === 'anime') {
        addLiveAnimeToStore(hydrated, andAdd);
        if (!andAdd) pushRoute({ view: 'anime-detail', animeId: hydrated.id });
      } else {
        addLiveShowToStore(hydrated, andAdd);
        if (!andAdd) pushRoute({ view: 'show-detail', showId: hydrated.id });
      }
    } finally {
      setHydratingId(null);
    }
  };

  const handleIsbnScanned = async (isbn13: string) => {
    setScannerOpen(false);
    setQuery(isbn13);
    if (scope === 'watch' || scope === 'play') {
      setScope('all');
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      queuePendingIsbnScan(isbn13);
      return;
    }
    setLoadingLive(true);
    try {
      const matches = await searchByIsbn(isbn13);
      setLiveResults(matches);
      if (matches.length > 0) {
        await handleOpenLiveResult(matches[0], false);
      }
    } catch {
      queuePendingIsbnScan(isbn13);
      setLiveResults([]);
    } finally {
      setLoadingLive(false);
    }
  };

  const renderPosterCard = (
    item: LiveSearchResult,
    showMediaBadge: boolean,
    layout: 'rail' | 'grid'
  ) => {
    const inLibrary = isLiveItemInLibrary(item);
    const isHydrating = hydratingId === item.id;
    const badgeTint =
      item.domain === 'watch'
        ? 'text-watch'
        : item.domain === 'read'
          ? 'text-read'
          : 'text-play';
    const addActiveClass =
      item.domain === 'watch'
        ? 'border-watch/70 bg-watch/20 text-watch'
        : item.domain === 'read'
          ? 'border-read/70 bg-read/20 text-read'
          : 'border-play/70 bg-play/20 text-play';

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenLiveResult(item, false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpenLiveResult(item, false);
          }
        }}
        className={`group text-left cursor-pointer ${
          layout === 'rail'
            ? 'w-[112px] sm:w-[136px] md:w-[150px] shrink-0 snap-start self-start'
            : 'min-w-0 self-start'
        }`}
      >
        <div className="relative aspect-[2/3] rounded-[14px] sm:rounded-[16px] overflow-hidden bg-surface border border-white/8">
          <MediaImage
            src={item.posterUrl}
            fallbackSrc={item.backdropUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
          {showMediaBadge && (
            <span
              className={`absolute top-1.5 left-1.5 px-1.5 py-[2px] rounded bg-[#0F1318]/85 border border-white/10 text-[9px] font-semibold uppercase tracking-wide leading-none ${badgeTint}`}
            >
              {badgeLabelForItem(item)}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenLiveResult(item, true);
            }}
            aria-label={inLibrary ? `Remove ${item.title} from library` : `Add ${item.title}`}
            className={`absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-[#0F1318]/85 border flex items-center justify-center transition-colors ${
              inLibrary
                ? addActiveClass
                : 'border-white/20 text-ink hover:border-brand hover:text-brand'
            }`}
          >
            {isHydrating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : inLibrary ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[12.5px] sm:text-[13px] font-semibold text-ink truncate leading-tight">
          {item.title}
        </p>
        <p className="text-[10.5px] sm:text-[11px] text-ink-dim tabular-nums">{item.year}</p>
      </div>
    );
  };

  const renderCollectionCard = (col: DiscoverCollection, layout: 'rail' | 'grid') => (
    <button
      key={col.id}
      type="button"
      onClick={() => openExpandedCollection(col)}
      className={`group flex flex-col items-stretch justify-start self-start text-left ${
        layout === 'rail' ? 'w-[252px] sm:w-[292px] shrink-0 snap-start' : 'w-full'
      }`}
    >
      <div className="aspect-[16/9] rounded-[16px] overflow-hidden bg-surface border border-white/10 grid grid-cols-3 gap-[2px]">
        {col.previewPosters.map((src, idx) => (
          <div key={`${col.id}-p-${idx}`} className="w-full h-full overflow-hidden bg-surface-raised">
            <MediaImage
              src={src}
              alt={col.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[13.5px] sm:text-sm font-semibold text-ink truncate leading-tight">
        {col.title}
      </p>
      <p className="text-[11px] text-ink-dim truncate">
        {col.items.length} titles · {col.domainLabel}
      </p>
    </button>
  );

  const activeRails = railsByScope[scope] || [];
  const activeCollections = useMemo(() => getDiscoverCollections(scope), [scope]);
  const isSearching = query.trim().length >= 2;
  const savedCollectionList = expandedCollection
    ? state.lists.find((l) => l.name.toLowerCase() === expandedCollection.title.toLowerCase())
    : undefined;

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-2 md:pt-20 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      {/* Sticky Search Bar + 4 Clean Domain Pills */}
      <div className="sticky top-0 md:top-16 z-20 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 pt-2 pb-3 bg-background/95 backdrop-blur-md border-b border-white/[0.04] mb-4">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-ink-dim absolute left-4 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search titles, games, or ISBN…"
            aria-label="Search all media"
            className="w-full h-11 rounded-2xl bg-surface border border-white/10 pl-11 pr-24 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-brand transition-colors"
          />
          <div className="absolute right-2.5 flex items-center gap-1">
            {loadingLive && <Loader2 className="w-4 h-4 text-brand animate-spin mr-1" />}
            {query && (
              <button
                type="button"
                onClick={() => handleQueryChange('')}
                aria-label="Clear search"
                className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-ink-dim hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="Scan ISBN barcode"
              title="Scan ISBN barcode"
              className="h-8 w-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-ink-dim hover:text-ink transition-colors"
            >
              <ScanBarcode className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-2.5">
          <div className="flex items-center gap-1.5">
            {DISCOVER_PILLS.map((tab) => {
              const active = scope === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  aria-pressed={active}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                    active ? tab.activeClass : tab.idleClass
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-ink-dim px-2.5 py-1 rounded-full bg-surface border border-white/8 shrink-0">
            <Globe2 className="w-3 h-3 text-watch" />
            Live Search
          </span>
        </div>
      </div>

      {(state.pendingIsbnScans?.length || 0) > 0 && (
        <section className="mb-4 rounded-2xl bg-surface border border-read/30 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink">
              <WifiOff className="w-4 h-4 text-read shrink-0" />
              <span>
                {state.pendingIsbnScans!.length} offline ISBN{' '}
                {state.pendingIsbnScans!.length === 1 ? 'scan' : 'scans'} queued
              </span>
            </div>
            <button
              type="button"
              onClick={() => void flushPendingIsbnScans()}
              className="px-3 py-1 rounded-full bg-read/15 border border-read/35 text-[11px] font-semibold text-read inline-flex items-center gap-1 hover:bg-read/25 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sync now</span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {state.pendingIsbnScans!.map((entry) => (
              <span
                key={entry.isbn}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-white/10 text-[11px] font-mono text-ink-dim"
              >
                <span>{entry.isbn}</span>
                <button
                  type="button"
                  onClick={() => removePendingIsbnScan(entry.isbn)}
                  aria-label={`Remove queued ISBN ${entry.isbn}`}
                  className="text-ink-faint hover:text-ink"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {isSearching ? (
        <div className="space-y-6 animate-fade-in">
          {localMatches.length > 0 && (
            <section>
              <h2 className="font-display font-bold text-lg text-ink mb-3">
                In your catalog ({localMatches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {localMatches.map((item) => (
                  <div
                    key={`${item.kind}-${item.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      sessionSearchState.scrollY = window.scrollY;
                      if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                      else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                      else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                      else pushRoute({ view: 'game-detail', gameId: item.id });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        sessionSearchState.scrollY = window.scrollY;
                        if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                        else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                        else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                        else pushRoute({ view: 'game-detail', gameId: item.id });
                      }
                    }}
                    className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-stretch min-h-[100px] cursor-pointer transition-colors"
                  >
                    <div className="w-[70px] min-h-[100px] shrink-0 overflow-hidden bg-surface-raised self-stretch">
                      <MediaImage src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center">
                      <h3 className="text-[15px] font-semibold text-ink leading-[1.28] line-clamp-2">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <span
                          className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded shrink-0 leading-none ${
                            item.domain === 'watch'
                              ? 'bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'bg-read/15 text-read'
                                : 'bg-play/15 text-play'
                          }`}
                        >
                          {item.badge}
                        </span>
                        <p className="text-xs text-ink-dim truncate flex items-center gap-1.5">
                          <span>{item.year}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5 text-brand">
                            <Star className="w-3 h-3 fill-brand" />
                            {item.rating.toFixed(1)}
                          </span>
                        </p>
                      </div>
                      {(() => {
                        const cleanG = cleanDisplayGenres(item.genres);
                        return (
                          cleanG.length > 0 && (
                            <p className="text-xs text-ink-faint truncate mt-1">
                              {cleanG.slice(0, 3).join(' · ')}
                            </p>
                          )
                        );
                      })()}
                    </div>
                    <div className="pr-3 shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.kind === 'show') toggleShowBookmark(item.id);
                          else if (item.kind === 'movie') toggleMovieWatchlist(item.id);
                          else if (item.kind === 'read') toggleReadBookmark(item.id);
                          else toggleGameBookmark(item.id);
                        }}
                        aria-label={item.inLibrary ? `Remove ${item.title} from library` : `Add ${item.title}`}
                        className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                          item.inLibrary
                            ? item.domain === 'watch'
                              ? 'border-watch/60 bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'border-read/60 bg-read/15 text-read'
                                : 'border-play/60 bg-play/15 text-play'
                            : 'border-white/15 text-ink-dim hover:border-brand hover:text-brand'
                        }`}
                      >
                        {item.inLibrary ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-lg text-ink">
                Live results ({dedupedLive.length})
              </h2>
              {loadingLive && (
                <span className="text-xs text-ink-dim">Searching live catalogs…</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dedupedLive.map((item) => {
                const isHydrating = hydratingId === item.id;
                const inLibrary = isLiveItemInLibrary(item);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenLiveResult(item, false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleOpenLiveResult(item, false);
                    }}
                    className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-stretch min-h-[100px] cursor-pointer transition-colors"
                  >
                    <div className="w-[70px] min-h-[100px] shrink-0 overflow-hidden bg-surface-raised self-stretch">
                      <MediaImage
                        src={item.posterUrl}
                        fallbackSrc={item.backdropUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center">
                      <h3 className="text-[15px] font-semibold text-ink leading-[1.28] line-clamp-2">
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        <span
                          className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded shrink-0 leading-none ${
                            item.domain === 'watch'
                              ? 'bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'bg-read/15 text-read'
                                : 'bg-play/15 text-play'
                          }`}
                        >
                          {item.mediaType === 'tv' ? 'Show' : item.mediaType}
                        </span>
                        {item.comicKind === 'series' ? (
                          <span className="text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded border border-read/35 bg-read/10 text-read shrink-0 leading-none">
                            Series
                          </span>
                        ) : item.mediaType === 'comic' && item.comicKind === 'collection' ? (
                          <span className="text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded bg-white/[0.06] text-ink-dim shrink-0 leading-none">
                            Edition
                          </span>
                        ) : null}
                        <p className="text-xs text-ink-dim truncate">
                          {item.comicKind === 'series' && item.subtitle
                            ? item.subtitle
                            : `${item.year} · ${
                                item.subtitle ||
                                cleanDisplayGenres(item.genres).slice(0, 2).join(' · ') ||
                                item.mediaType
                              }`}
                        </p>
                      </div>
                      {item.overview && (
                        <p className="text-xs text-ink-faint truncate mt-1">{item.overview}</p>
                      )}
                    </div>
                    <div className="pr-3 shrink-0 flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenLiveResult(item, true);
                        }}
                        aria-label={inLibrary ? `Remove ${item.title} from library` : `Add ${item.title}`}
                        className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                          inLibrary
                            ? item.domain === 'watch'
                              ? 'border-watch/60 bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'border-read/60 bg-read/15 text-read'
                                : 'border-play/60 bg-play/15 text-play'
                            : 'border-white/15 text-ink-dim hover:border-brand hover:text-brand'
                        }`}
                      >
                        {isHydrating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : inLibrary ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!loadingLive && localMatches.length === 0 && dedupedLive.length === 0 && (
              <div className="rounded-2xl bg-surface border border-white/8 p-8 text-center">
                <p className="font-semibold text-ink">No matches found for "{query}"</p>
                <p className="text-xs text-ink-dim mt-1">
                  Try another title or switch filter pills above.
                </p>
              </div>
            )}

            {(scope === 'all' || scope === 'read') && (
              <div className="mt-4 rounded-2xl bg-surface border border-white/[0.06] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">
                      Missing an indie or small-press comic run?
                    </p>
                    <p className="text-[11px] text-ink-dim mt-0.5">
                      Create a custom comic series right away with full issue tracking.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomComicTitle((prev) => prev || query.trim());
                      setCustomComicOpen((v) => !v);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-read/15 border border-read/35 text-xs font-semibold text-read inline-flex items-center gap-1 hover:bg-read/25 transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{customComicOpen ? 'Close form' : 'Add custom comic run'}</span>
                  </button>
                </div>

                {customComicOpen && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const cleanTitle = customComicTitle.trim() || query.trim();
                      if (!cleanTitle) return;
                      const pub = customComicPub.trim() || 'Independent';
                      const yr = Number(customComicYear) || new Date().getFullYear();
                      const count = Math.max(1, Math.min(300, Number(customComicCount) || 6));
                      const id = `custom-comic-${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${yr}`;
                      addLiveReadToStore(
                        {
                          id,
                          format: 'comic',
                          unit: 'issues',
                          comicKind: 'series',
                          title: cleanTitle,
                          creator: pub,
                          comicPublisher: pub,
                          comicRunLabel: `${yr} – Present`,
                          year: yr,
                          totalUnits: count,
                          baseTotalUnits: count,
                          genres: ['Comics'],
                          rating: 4.5,
                          coverUrl: '',
                          backdropUrl: '',
                          overview: `${cleanTitle} (${yr}) published by ${pub}.`,
                        },
                        'reading',
                        true
                      );
                      setCustomComicOpen(false);
                      setCustomComicTitle('');
                      setCustomComicPub('');
                      pushRoute({ view: 'read-detail', readId: id });
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/[0.06]"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Series title"
                      value={customComicTitle}
                      onChange={(e) => setCustomComicTitle(e.target.value)}
                      className="rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-read"
                    />
                    <input
                      type="text"
                      placeholder="Publisher (e.g. Dark Horse, IDW)"
                      value={customComicPub}
                      onChange={(e) => setCustomComicPub(e.target.value)}
                      className="rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-read"
                    />
                    <input
                      type="number"
                      min={1950}
                      max={2035}
                      placeholder="Start year"
                      value={customComicYear}
                      onChange={(e) => setCustomComicYear(e.target.value)}
                      className="rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink outline-none focus:border-read tabular-nums"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        placeholder="Issues"
                        value={customComicCount}
                        onChange={(e) => setCustomComicCount(e.target.value)}
                        className="w-24 rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink outline-none focus:border-read tabular-nums"
                      />
                      <button
                        type="submit"
                        className="flex-1 py-2 px-3 rounded-xl bg-read text-[#1D160A] text-xs font-bold hover:opacity-95 transition-opacity"
                      >
                        Create & Track
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      ) : expandedCollection ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setExpandedCollection(null);
                  goBack();
                }}
                aria-label="Back to Discover"
                className="h-9 w-9 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink shrink-0 mt-0.5"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                  Collection · {expandedCollection.domainLabel}
                </p>
                <h2 className="font-display font-bold text-xl text-ink leading-tight">
                  {expandedCollection.title}
                </h2>
                <p className="text-xs text-ink-dim mt-1">{expandedCollection.description}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (savedCollectionList) {
                  pushRoute({ view: 'list-detail', listId: savedCollectionList.id });
                  return;
                }
                const refs = expandedCollection.items.map((x) => ({
                  kind: x.kind,
                  id: x.id,
                }));
                createCustomList(
                  expandedCollection.title,
                  expandedCollection.description,
                  refs[0],
                  refs
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-white/15 bg-surface hover:border-brand text-ink shrink-0"
            >
              <ListPlus className="w-3.5 h-3.5 text-brand" />
              <span>{savedCollectionList ? 'Open List' : 'Save as List'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4 items-start">
            {expandedCollection.items.map((item) => renderPosterCard(item, true, 'grid'))}
          </div>
        </div>
      ) : expandedRail ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setExpandedRail(null);
                goBack();
              }}
              aria-label="Back to Discover"
              className="h-9 w-9 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display font-bold text-xl text-ink">
              {expandedRail.title}
            </h2>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 sm:gap-4 items-start">
            {expandedRail.items.map((item) =>
              renderPosterCard(item, expandedRail.showMediaBadge, 'grid')
            )}
          </div>
        </div>
      ) : showAllCollections ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back to Discover"
              className="h-9 w-9 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display font-bold text-xl text-ink">
              Collections & Runs
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-start">
            {activeCollections.map((col) => renderCollectionCard(col, 'grid'))}
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {loadingRails && activeRails.length === 0 ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, railIdx) => (
                <section key={`rail-skel-${railIdx}`} className="space-y-2.5">
                  <div className="h-5 w-40 rounded bg-surface animate-pulse" />
                  <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 4 }).map((_, cardIdx) => (
                      <div
                        key={`card-skel-${railIdx}-${cardIdx}`}
                        className="w-[112px] sm:w-[136px] shrink-0 animate-pulse"
                      >
                        <div className="aspect-[2/3] rounded-[14px] bg-surface border border-white/6" />
                        <div className="h-3 w-3/4 rounded bg-surface mt-2" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            activeRails.map((rail) => (
              <section key={rail.id} aria-label={rail.title} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => openExpandedRail(rail)}
                  className="inline-flex items-center gap-1 group text-left"
                >
                  <h2 className="font-display font-bold text-[18px] sm:text-[19px] text-ink group-hover:text-brand transition-colors">
                    {rail.title}
                  </h2>
                  <ChevronRight className="w-4 h-4 text-ink-dim group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
                </button>

                <div className="flex items-start gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-1 snap-x snap-proximity">
                  {rail.items.map((item) =>
                    renderPosterCard(item, rail.showMediaBadge, 'rail')
                  )}
                </div>
              </section>
            ))
          )}

          {activeCollections.length > 0 && (
            <section aria-label="Collections & Runs" className="space-y-2.5">
              <button
                type="button"
                onClick={openAllCollections}
                className="inline-flex items-center gap-1 group text-left"
              >
                <h2 className="font-display font-bold text-[18px] sm:text-[19px] text-ink group-hover:text-brand transition-colors">
                  Collections & Runs
                </h2>
                <ChevronRight className="w-4 h-4 text-ink-dim group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
              </button>

              <div className="flex items-start gap-3.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 pb-1 snap-x snap-proximity">
                {activeCollections.map((col) => renderCollectionCard(col, 'rail'))}
              </div>
            </section>
          )}
        </div>
      )}

      <IsbnScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleIsbnScanned}
      />
    </div>
  );
}
