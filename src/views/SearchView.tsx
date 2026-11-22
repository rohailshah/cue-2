import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Globe2, Loader2, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import {
  hydrateLiveGameItem,
  hydrateLiveMovie,
  hydrateLiveReadItem,
  hydrateLiveShow,
  searchLiveMedia,
  type LiveSearchResult,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import { computeAllMediaStats } from '../utils/stats';

type SearchDomainFilter = 'all' | 'watch' | 'read' | 'play';

const GENRE_PILLS = ['Sci-Fi', 'Fantasy', 'Drama', 'Action', 'RPG', 'Dark Fantasy', 'Thriller'];

export function SearchView() {
  const {
    state,
    pushRoute,
    addLiveShowToStore,
    addLiveMovieToStore,
    addLiveReadToStore,
    addLiveGameToStore,
    toggleShowBookmark,
    toggleMovieWatchlist,
    toggleReadBookmark,
    toggleGameBookmark,
  } = useCueStore();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchDomainFilter>('all');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<LiveSearchResult[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [hydratingId, setHydratingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setLiveResults([]);
      setLoadingLive(false);
      return;
    }

    let cancelled = false;
    setLoadingLive(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchLiveMedia(q, filter, state.settings.tmdbApiKey);
        if (!cancelled) setLiveResults(res);
      } catch {
        if (!cancelled) setLiveResults([]);
      } finally {
        if (!cancelled) setLoadingLive(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter, state.settings.tmdbApiKey]);

  const analytics = useMemo(() => computeAllMediaStats(state), [state]);
  const topGenreNames = useMemo(
    () => new Set(analytics.topGenres.slice(0, 3).map((g) => g.genre)),
    [analytics.topGenres]
  );

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: Array<{
      domain: 'watch' | 'read' | 'play';
      kind: 'show' | 'movie' | 'read' | 'game';
      id: string;
      title: string;
      year: number;
      badge: string;
      genres: string[];
      rating: number;
      posterUrl: string;
      inLibrary: boolean;
    }> = [];

    if (filter === 'all' || filter === 'watch') {
      for (const id of state.showOrder) {
        const s = state.shows[id];
        if (!s) continue;
        if (selectedGenre && !s.genres.some((g) => g.toLowerCase().includes(selectedGenre.toLowerCase()))) continue;
        if (q && !s.title.toLowerCase().includes(q) && !s.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'show',
          id: s.id,
          title: s.title,
          year: s.year,
          badge: s.mediaType === 'anime' ? 'Anime' : 'Show',
          genres: s.genres,
          rating: s.rating,
          posterUrl: s.posterUrl,
          inLibrary: Boolean(state.showProgress[s.id]?.bookmarked),
        });
      }
      for (const id of state.movieOrder) {
        const m = state.movies[id];
        if (!m) continue;
        if (selectedGenre && !m.genres.some((g) => g.toLowerCase().includes(selectedGenre.toLowerCase()))) continue;
        if (q && !m.title.toLowerCase().includes(q) && !m.genres.some((g) => g.toLowerCase().includes(q))) continue;
        items.push({
          domain: 'watch',
          kind: 'movie',
          id: m.id,
          title: m.title,
          year: m.year,
          badge: 'Movie',
          genres: m.genres,
          rating: m.rating,
          posterUrl: m.posterUrl,
          inLibrary: Boolean(state.movieProgress[m.id]),
        });
      }
    }

    if (filter === 'all' || filter === 'read') {
      for (const id of state.readOrder) {
        const r = state.readItems[id];
        if (!r) continue;
        if (selectedGenre && !r.genres.some((g) => g.toLowerCase().includes(selectedGenre.toLowerCase()))) continue;
        if (
          q &&
          !r.title.toLowerCase().includes(q) &&
          !r.creator.toLowerCase().includes(q) &&
          !r.genres.some((g) => g.toLowerCase().includes(q))
        )
          continue;
        items.push({
          domain: 'read',
          kind: 'read',
          id: r.id,
          title: r.title,
          year: r.year,
          badge: r.format,
          genres: r.genres,
          rating: r.rating,
          posterUrl: r.coverUrl,
          inLibrary: Boolean(state.readProgress[r.id]?.bookmarked),
        });
      }
    }

    if (filter === 'all' || filter === 'play') {
      for (const id of state.gameOrder) {
        const g = state.games[id];
        if (!g) continue;
        if (selectedGenre && !g.genres.some((gen) => gen.toLowerCase().includes(selectedGenre.toLowerCase()))) continue;
        if (
          q &&
          !g.title.toLowerCase().includes(q) &&
          !g.developer.toLowerCase().includes(q) &&
          !g.genres.some((gen) => gen.toLowerCase().includes(selectedGenre?.toLowerCase() || q))
        )
          continue;
        items.push({
          domain: 'play',
          kind: 'game',
          id: g.id,
          title: g.title,
          year: g.year,
          badge: 'Game',
          genres: g.genres,
          rating: g.rating,
          posterUrl: g.coverUrl,
          inLibrary: Boolean(state.gameProgress[g.id]?.bookmarked),
        });
      }
    }

    return items;
  }, [state, query, filter, selectedGenre]);

  const dedupedLive = useMemo(() => {
    const localTitles = new Set(localMatches.map((m) => `${m.kind}:${m.title.toLowerCase()}`));
    return liveResults.filter((r) => !localTitles.has(`${r.kind}:${r.title.toLowerCase()}`));
  }, [liveResults, localMatches]);

  const featuredAllMedia = useMemo(() => {
    const picks: Array<{
      kind: 'show' | 'movie' | 'read' | 'game';
      id: string;
      title: string;
      subtitle: string;
      poster: string;
    }> = [];
    if (state.shows['house-of-the-dragon']) {
      const s = state.shows['house-of-the-dragon'];
      picks.push({ kind: 'show', id: s.id, title: s.title, subtitle: 'Show', poster: s.posterUrl });
    }
    if (state.readItems['dune-book']) {
      const r = state.readItems['dune-book'];
      picks.push({ kind: 'read', id: r.id, title: r.title, subtitle: 'Novel', poster: r.coverUrl });
    }
    if (state.games['elden-ring']) {
      const g = state.games['elden-ring'];
      picks.push({ kind: 'game', id: g.id, title: g.title, subtitle: 'Game', poster: g.coverUrl });
    }
    if (state.readItems['berserk']) {
      const r = state.readItems['berserk'];
      picks.push({ kind: 'read', id: r.id, title: r.title, subtitle: 'Manga', poster: r.coverUrl });
    }
    if (state.movies['sinners']) {
      const m = state.movies['sinners'];
      picks.push({ kind: 'movie', id: m.id, title: m.title, subtitle: 'Movie', poster: m.posterUrl });
    }
    if (state.games['hades-ii']) {
      const g = state.games['hades-ii'];
      picks.push({ kind: 'game', id: g.id, title: g.title, subtitle: 'Game', poster: g.coverUrl });
    }
    if (state.readItems['watchmen']) {
      const r = state.readItems['watchmen'];
      picks.push({ kind: 'read', id: r.id, title: r.title, subtitle: 'Comic', poster: r.coverUrl });
    }
    if (state.shows['severance']) {
      const s = state.shows['severance'];
      picks.push({ kind: 'show', id: s.id, title: s.title, subtitle: 'Show', poster: s.posterUrl });
    }
    return picks;
  }, [state]);

  const queueSuggestions = useMemo(() => {
    const picks: Array<{
      kind: 'show' | 'movie' | 'read' | 'game';
      id: string;
      title: string;
      genres: string[];
      poster: string;
    }> = [];
    for (const id of state.readOrder) {
      const r = state.readItems[id];
      const p = state.readProgress[id];
      if (r && p?.status === 'want_to_read' && r.genres.some((g) => topGenreNames.has(g))) {
        picks.push({ kind: 'read', id: r.id, title: r.title, genres: r.genres, poster: r.coverUrl });
      }
    }
    for (const id of state.gameOrder) {
      const g = state.games[id];
      const p = state.gameProgress[id];
      if (g && p?.status === 'backlog') {
        picks.push({ kind: 'game', id: g.id, title: g.title, genres: g.genres, poster: g.coverUrl });
      }
    }
    for (const id of state.showOrder) {
      const s = state.shows[id];
      const p = state.showProgress[id];
      if (s && p?.status === 'not_started') {
        picks.push({ kind: 'show', id: s.id, title: s.title, genres: s.genres, poster: s.posterUrl });
      }
    }
    return picks.slice(0, 8);
  }, [state, topGenreNames]);

  const handleOpenLiveResult = async (item: LiveSearchResult, andAdd = false) => {
    if (item.kind === 'movie') {
      const movie = hydrateLiveMovie(item);
      if (andAdd || !state.movies[movie.id]) addLiveMovieToStore(movie, 'watchlist');
      if (!andAdd) pushRoute({ view: 'movie-detail', movieId: movie.id });
      return;
    }
    if (item.kind === 'read') {
      const readItem = hydrateLiveReadItem(item);
      if (andAdd || !state.readItems[readItem.id]) addLiveReadToStore(readItem, 'want_to_read');
      if (!andAdd) pushRoute({ view: 'read-detail', readId: readItem.id });
      return;
    }
    if (item.kind === 'game') {
      const game = hydrateLiveGameItem(item);
      if (andAdd || !state.games[game.id]) addLiveGameToStore(game, 'backlog');
      if (!andAdd) pushRoute({ view: 'game-detail', gameId: game.id });
      return;
    }

    setHydratingId(item.id);
    try {
      const show = await hydrateLiveShow(item, state.settings.tmdbApiKey);
      addLiveShowToStore(show, andAdd);
      if (!andAdd) pushRoute({ view: 'show-detail', showId: show.id });
    } finally {
      setHydratingId(null);
    }
  };

  const hasActiveFilter = query.trim().length > 0 || selectedGenre !== null;

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      <div className="mb-4">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-ink-dim absolute left-4 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows, anime, movies, novels, manga, comics, or games…"
            aria-label="Search all media"
            className="w-full h-12 rounded-2xl bg-surface border border-white/10 pl-11 pr-20 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-brand transition-colors"
          />
          <div className="absolute right-3 flex items-center gap-1.5">
            {loadingLive && <Loader2 className="w-4 h-4 text-brand animate-spin" />}
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-ink-dim hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'watch', label: 'Watch' },
                { id: 'read', label: 'Read' },
                { id: 'play', label: 'Play' },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              const activeClass =
                tab.id === 'watch'
                  ? 'bg-watch border-watch text-brand-ink'
                  : tab.id === 'read'
                    ? 'bg-read border-read text-brand-ink'
                    : tab.id === 'play'
                      ? 'bg-play border-play text-brand-ink'
                      : 'bg-brand border-brand text-brand-ink';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                    active ? activeClass : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-ink-dim px-2.5 py-1 rounded-full bg-surface border border-white/8 shrink-0">
            <Globe2 className="w-3 h-3 text-watch" />
            All-Media Live Search
          </span>
        </div>
      </div>

      {/* Genre Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-6">
        {GENRE_PILLS.map((genre) => {
          const active = selectedGenre === genre;
          return (
            <button
              key={genre}
              type="button"
              onClick={() => setSelectedGenre(active ? null : genre)}
              className={`px-3 py-1 rounded-full text-xs border shrink-0 transition-colors ${
                active
                  ? 'border-white/40 bg-white/15 text-ink font-medium'
                  : 'border-white/8 bg-surface text-ink-dim hover:text-ink'
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>

      {hasActiveFilter ? (
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
                      if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                      else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                      else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                      else pushRoute({ view: 'game-detail', gameId: item.id });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                        else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                        else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                        else pushRoute({ view: 'game-detail', gameId: item.id });
                      }
                    }}
                    className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-center cursor-pointer transition-colors"
                  >
                    <div className="w-[70px] h-[98px] shrink-0 overflow-hidden bg-surface-raised">
                      <MediaImage src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 px-3.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[15px] font-semibold text-ink truncate">{item.title}</h3>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                            item.domain === 'watch'
                              ? 'bg-watch/15 text-watch'
                              : item.domain === 'read'
                                ? 'bg-read/15 text-read'
                                : 'bg-play/15 text-play'
                          }`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-ink-dim mt-0.5 flex items-center gap-1.5">
                        <span>{item.year}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 text-brand">
                          <Star className="w-3 h-3 fill-brand" />
                          {item.rating.toFixed(1)}
                        </span>
                      </p>
                      <p className="text-xs text-ink-faint truncate mt-1">{item.genres.join(' · ')}</p>
                    </div>
                    <div className="pr-3.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.kind === 'show') toggleShowBookmark(item.id);
                          else if (item.kind === 'movie') toggleMovieWatchlist(item.id);
                          else if (item.kind === 'read') toggleReadBookmark(item.id);
                          else toggleGameBookmark(item.id);
                        }}
                        aria-label={item.inLibrary ? 'In library' : 'Add to library'}
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

          {query.trim().length >= 2 && (
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
                  const alreadyInStore = Boolean(
                    state.shows[item.id] ||
                      state.movies[item.id] ||
                      state.readItems[item.id] ||
                      state.games[item.id]
                  );
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenLiveResult(item, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleOpenLiveResult(item, false);
                      }}
                      className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-center cursor-pointer transition-colors"
                    >
                      <div className="w-[70px] h-[98px] shrink-0 overflow-hidden bg-surface-raised">
                        <MediaImage
                          src={item.posterUrl}
                          fallbackSrc={item.backdropUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0 px-3.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-[15px] font-semibold text-ink truncate">{item.title}</h3>
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                              item.domain === 'watch'
                                ? 'bg-watch/15 text-watch'
                                : item.domain === 'read'
                                  ? 'bg-read/15 text-read'
                                  : 'bg-play/15 text-play'
                            }`}
                          >
                            {item.mediaType}
                          </span>
                        </div>
                        <p className="text-xs text-ink-dim mt-0.5 truncate">
                          {item.year} · {item.subtitle || item.genres.slice(0, 2).join(' · ')}
                        </p>
                        <p className="text-xs text-ink-faint truncate mt-1">{item.overview}</p>
                      </div>
                      <div className="pr-3.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenLiveResult(item, true);
                          }}
                          aria-label={`Add ${item.title}`}
                          className={`h-9 w-9 rounded-full border flex items-center justify-center transition-colors ${
                            alreadyInStore
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
                          ) : alreadyInStore ? (
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
                    Try another title or switch between All, Watch, Read, and Play.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          {/* Featured Across Watch, Read & Play */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-5 h-5 text-brand" />
              <h2 className="font-display font-bold text-[20px] text-ink">
                Highlights across Watch, Read & Play
              </h2>
            </div>
            <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
              {featuredAllMedia.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.id}`}
                  type="button"
                  onClick={() => {
                    if (entry.kind === 'show') pushRoute({ view: 'show-detail', showId: entry.id });
                    else if (entry.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.id });
                    else if (entry.kind === 'read') pushRoute({ view: 'read-detail', readId: entry.id });
                    else pushRoute({ view: 'game-detail', gameId: entry.id });
                  }}
                  className="w-[126px] sm:w-[144px] shrink-0 text-left group"
                >
                  <div className="aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
                    <MediaImage
                      src={entry.poster}
                      alt={entry.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink truncate">{entry.title}</p>
                  <p className="text-xs text-ink-dim">{entry.subtitle}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Up Next in Your Personal Queue */}
          {queueSuggestions.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-brand" />
                <h2 className="font-display font-bold text-[20px] text-ink">Up next in your queue</h2>
              </div>
              <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-1">
                {queueSuggestions.map((entry) => (
                  <button
                    key={`${entry.kind}-${entry.id}`}
                    type="button"
                    onClick={() => {
                      if (entry.kind === 'show') pushRoute({ view: 'show-detail', showId: entry.id });
                      else if (entry.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.id });
                      else if (entry.kind === 'read') pushRoute({ view: 'read-detail', readId: entry.id });
                      else pushRoute({ view: 'game-detail', gameId: entry.id });
                    }}
                    className="w-[126px] sm:w-[144px] shrink-0 text-left group"
                  >
                    <div className="aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
                      <MediaImage
                        src={entry.poster}
                        alt={entry.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink truncate">{entry.title}</p>
                    <p className="text-xs text-ink-dim truncate">{entry.genres.slice(0, 2).join(' · ')}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
