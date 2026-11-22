import { useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, Layers, ListFilter, Star } from 'lucide-react';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { ReleaseAlertBanner } from '../components/ReleaseAlertBanner';
import { useCueStore } from '../store/useCueStore';
import type { Movie, Show, UpcomingEntry, WatchFilter } from '../types';
import { formatEpisodeCode, getShowStats } from '../utils/stats';

export function WatchView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    toggleCalendarMode,
    setFilterSheetOpen,
    updateSettings,
    watchNextEpisode,
    toggleMovieWatched,
    showToast,
  } = useCueStore();

  const [justChecked, setJustChecked] = useState<Record<string, boolean>>({});
  const [showFinished, setShowFinished] = useState(false);

  const filter = state.settings.watchFilter;

  const handleQuickWatchShow = (e: React.MouseEvent, showId: string) => {
    e.stopPropagation();
    if (justChecked[showId]) return;
    setJustChecked((prev) => ({ ...prev, [showId]: true }));
    setTimeout(() => {
      watchNextEpisode(showId);
      setJustChecked((prev) => {
        const copy = { ...prev };
        delete copy[showId];
        return copy;
      });
    }, 320);
  };

  const handleQuickWatchMovie = (e: React.MouseEvent, movieId: string) => {
    e.stopPropagation();
    setJustChecked((prev) => ({ ...prev, [movieId]: true }));
    setTimeout(() => {
      toggleMovieWatched(movieId);
      setJustChecked((prev) => {
        const copy = { ...prev };
        delete copy[movieId];
        return copy;
      });
    }, 260);
  };

  const { watchingShows, notStartedShows, finishedShows, watchlistMovies, watchedMovies } =
    useMemo(() => {
      const sortMode = state.settings.sortBy;

      const shows = state.showOrder
        .map((id) => state.shows[id])
        .filter((s): s is Show => Boolean(s) && Boolean(state.showProgress[s.id]?.bookmarked))
        .filter((s) => {
          if (filter === 'movie') return false;
          if (filter === 'tv') return s.mediaType === 'tv';
          if (filter === 'anime') return s.mediaType === 'anime';
          return true;
        });

      const sortShows = (list: Show[]) =>
        [...list].sort((a, b) => {
          if (sortMode === 'alpha') return a.title.localeCompare(b.title);
          if (sortMode === 'rating') {
            return (
              (state.showProgress[b.id]?.rating || b.rating) -
              (state.showProgress[a.id]?.rating || a.rating)
            );
          }
          if (sortMode === 'progress') {
            return (
              getShowStats(b, state.showProgress[b.id]).progressRatio -
              getShowStats(a, state.showProgress[a.id]).progressRatio
            );
          }
          const ta = state.showProgress[a.id]?.lastWatchedAt || '';
          const tb = state.showProgress[b.id]?.lastWatchedAt || '';
          return tb.localeCompare(ta);
        });

      const watching: Show[] = [];
      const notStarted: Show[] = [];
      const finished: Show[] = [];
      for (const s of shows) {
        const st = getShowStats(s, state.showProgress[s.id]);
        if (st.isFinished) finished.push(s);
        else if (st.watchedUnique > 0) watching.push(s);
        else notStarted.push(s);
      }

      const movies =
        filter === 'tv' || filter === 'anime'
          ? []
          : state.movieOrder
              .map((id) => state.movies[id])
              .filter((m): m is Movie => Boolean(m) && Boolean(state.movieProgress[m.id]));

      const sortMovies = (list: Movie[]) =>
        [...list].sort((a, b) => {
          if (sortMode === 'alpha') return a.title.localeCompare(b.title);
          if (sortMode === 'rating') return b.rating - a.rating;
          if (sortMode === 'progress') return a.runtime - b.runtime;
          const ta = state.movieProgress[a.id]?.watchedAt || '';
          const tb = state.movieProgress[b.id]?.watchedAt || '';
          return tb.localeCompare(ta);
        });

      const wMovies = movies.filter((m) => (state.movieProgress[m.id]?.watchCount || 0) === 0);
      const dMovies = movies.filter((m) => (state.movieProgress[m.id]?.watchCount || 0) > 0);

      return {
        watchingShows: sortShows(watching),
        notStartedShows: sortShows(notStarted),
        finishedShows: sortShows(finished),
        watchlistMovies: sortMovies(wMovies),
        watchedMovies: sortMovies(dMovies),
      };
    }, [
      state.showOrder,
      state.shows,
      state.showProgress,
      state.movieOrder,
      state.movies,
      state.movieProgress,
      state.settings.sortBy,
      filter,
    ]);

  const upcomingGroups = useMemo(() => {
    const items = state.upcoming.filter((u) => u.domain === 'watch');
    return {
      today: items.filter((u) => u.daysUntil === 0),
      thisWeek: items.filter((u) => u.daysUntil > 0 && u.daysUntil <= 6),
      later: items.filter((u) => u.daysUntil >= 7),
    };
  }, [state.upcoming]);

  const isPosterLayout = state.settings.watchLayout === 'posters';

  const renderShowCard = (show: Show) => {
    const prog = state.showProgress[show.id];
    const stats = getShowStats(show, prog);
    const next = stats.nextEpisode;
    const flash = Boolean(justChecked[show.id]);

    if (isPosterLayout) {
      return (
        <div
          key={show.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'show-detail', showId: show.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'show-detail', showId: show.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={show.posterUrl}
              alt={show.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!stats.isFinished && (
              <button
                type="button"
                onClick={(e) => handleQuickWatchShow(e, show.id)}
                aria-label={`Mark ${show.title} next episode watched`}
                className={`absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center border transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/60 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {state.settings.showPosterProgress && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(stats.progressRatio * 100)}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{show.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {next
              ? `${formatEpisodeCode(next.season, next.number)} · ${stats.nextOrdinal}/${stats.totalEpisodes}`
              : 'Finished'}
          </p>
        </div>
      );
    }

    return (
      <div
        key={show.id}
        role="button"
        tabIndex={0}
        onClick={() => pushRoute({ view: 'show-detail', showId: show.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pushRoute({ view: 'show-detail', showId: show.id });
        }}
        className="group relative rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-center cursor-pointer transition-colors"
      >
        <div className="w-[72px] sm:w-[84px] aspect-[2/3] shrink-0 overflow-hidden bg-surface-raised relative">
          <MediaImage
            src={show.backdropUrl || show.posterUrl}
            alt={show.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
          {state.settings.showPosterProgress && stats.watchedUnique > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/45">
              <div
                className="h-full bg-watched transition-all duration-300"
                style={{ width: `${Math.round(stats.progressRatio * 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold text-ink truncate leading-tight">
              {show.title}
            </h3>
            {show.mediaType === 'anime' && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/8 text-ink-dim shrink-0">
                Anime
              </span>
            )}
          </div>
          {next ? (
            <>
              <p className="text-[13.5px] text-ink-dim tabular-nums mt-0.5">
                {formatEpisodeCode(next.season, next.number)} · {stats.nextOrdinal}/
                {stats.totalEpisodes}
              </p>
              <p className="text-[13px] text-ink-faint truncate mt-0.5">{next.title}</p>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-watched tabular-nums mt-0.5">
                {stats.totalEpisodes}/{stats.totalEpisodes} watched
              </p>
              <p className="text-[13px] text-ink-faint truncate mt-0.5">
                {stats.rewatchCount > 1 ? `Rewatched x${stats.rewatchCount}` : 'All caught up'}
              </p>
            </>
          )}
        </div>

        <div className="pr-3.5 shrink-0">
          {!stats.isFinished ? (
            <button
              type="button"
              onClick={(e) => handleQuickWatchShow(e, show.id)}
              aria-label={`Mark ${show.title} episode watched`}
              className={`h-[40px] w-[40px] rounded-full border flex items-center justify-center transition-all active:scale-90 ${
                flash
                  ? 'border-watched/70 bg-watched/15 text-watched animate-check-pop'
                  : 'border-white/15 bg-white/[0.02] text-ink-dim hover:border-watched/60 hover:text-watched'
              }`}
            >
              <Check className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </button>
          ) : (
            <span className="text-sm font-bold text-watched tabular-nums px-1.5">
              {stats.rewatchCount > 1 ? `x${stats.rewatchCount}` : '✓'}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderMovieCard = (movie: Movie) => {
    const prog = state.movieProgress[movie.id];
    const isWatched = (prog?.watchCount || 0) > 0;
    const flash = Boolean(justChecked[movie.id]);

    if (isPosterLayout) {
      return (
        <div
          key={movie.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'movie-detail', movieId: movie.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'movie-detail', movieId: movie.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            <button
              type="button"
              onClick={(e) => handleQuickWatchMovie(e, movie.id)}
              aria-label={`Toggle ${movie.title} watched`}
              className={`absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center border transition-all ${
                isWatched || flash
                  ? 'bg-watched/20 border-watched text-watched'
                  : 'bg-black/60 border-white/20 text-white hover:border-watched hover:text-watched'
              }`}
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{movie.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {movie.year} · {movie.runtime}m
          </p>
        </div>
      );
    }

    return (
      <div
        key={movie.id}
        role="button"
        tabIndex={0}
        onClick={() => pushRoute({ view: 'movie-detail', movieId: movie.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pushRoute({ view: 'movie-detail', movieId: movie.id });
        }}
        className="group rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-center cursor-pointer transition-colors"
      >
        <div className="w-[72px] sm:w-[84px] aspect-[2/3] shrink-0 overflow-hidden bg-surface-raised">
          <MediaImage
            src={movie.posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
        </div>

        <div className="flex-1 min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold text-ink truncate leading-tight">
              {movie.title}
            </h3>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-white/8 text-ink-dim shrink-0">
              Movie
            </span>
          </div>
          <p className="text-[13px] text-ink-dim tabular-nums mt-0.5 flex items-center gap-2">
            <span>{movie.year}</span>
            <span>·</span>
            <span>{movie.runtime}m</span>
            <span className="inline-flex items-center gap-0.5 text-brand">
              <Star className="w-3 h-3 fill-brand" />
              {movie.rating.toFixed(1)}
            </span>
          </p>
          <p className="text-[12.5px] text-ink-faint truncate mt-0.5">{movie.director}</p>
        </div>

        <div className="pr-3.5 shrink-0 flex items-center gap-2">
          {isWatched && prog.watchCount > 1 && (
            <span className="text-xs font-bold text-watched tabular-nums">x{prog.watchCount}</span>
          )}
          <button
            type="button"
            onClick={(e) => handleQuickWatchMovie(e, movie.id)}
            aria-label={`Toggle ${movie.title} watched`}
            className={`h-[40px] w-[40px] rounded-full border flex items-center justify-center transition-all active:scale-90 ${
              isWatched || flash
                ? 'border-watched/70 bg-watched/15 text-watched animate-check-pop'
                : 'border-white/15 bg-white/[0.02] text-ink-dim hover:border-watched/60 hover:text-watched'
            }`}
          >
            <Check className="w-[18px] h-[18px]" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    );
  };

  const renderUpcomingCard = (entry: UpcomingEntry) => {
    const flash = Boolean(justChecked[entry.id]);
    return (
      <div
        key={entry.id}
        role="button"
        tabIndex={0}
        onClick={() => pushRoute({ view: 'show-detail', showId: entry.mediaId })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pushRoute({ view: 'show-detail', showId: entry.mediaId });
        }}
        className="group rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] overflow-hidden flex items-center cursor-pointer transition-colors"
      >
        <div className="w-[72px] sm:w-[84px] aspect-[2/3] shrink-0 overflow-hidden bg-surface-raised">
          <MediaImage
            src={entry.artworkUrl}
            alt={entry.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
        </div>

        <div className="flex-1 min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold text-ink truncate leading-tight">
              {entry.title}
            </h3>
            {entry.groupCount && entry.groupCount > 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand/15 text-brand shrink-0">
                <Layers className="w-2.5 h-2.5" />
                +{entry.groupCount}
              </span>
            )}
          </div>
          <p className="text-[13.5px] text-ink-dim tabular-nums mt-0.5">{entry.subtitle}</p>
          {entry.episodeTitle && (
            <p className="text-[13px] text-ink-faint truncate mt-0.5">{entry.episodeTitle}</p>
          )}
        </div>

        <div className="pr-4 shrink-0 text-center min-w-[54px]">
          {entry.daysUntil === 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setJustChecked((p) => ({ ...p, [entry.id]: true }));
                setTimeout(() => {
                  watchNextEpisode(entry.mediaId);
                  showToast(`Marked ${entry.title} ${entry.subtitle} watched`);
                }, 280);
              }}
              aria-label={`Mark ${entry.title} watched`}
              className={`h-[40px] w-[40px] rounded-full border flex items-center justify-center transition-all ${
                flash
                  ? 'border-watched bg-watched/15 text-watched animate-check-pop'
                  : 'border-white/15 text-ink-dim hover:border-watched hover:text-watched'
              }`}
            >
              <Check className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </button>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-[19px] font-display font-bold text-ink tabular-nums leading-none">
                {entry.daysUntil}
              </span>
              <span className="text-[11px] text-ink-dim mt-0.5">
                {entry.daysUntil === 1 ? 'day' : 'days'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const filterTabs: { id: WatchFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'tv', label: 'Shows' },
    { id: 'movie', label: 'Movies' },
    { id: 'anime', label: 'Anime' },
  ];

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter and sort watch list"
          className="glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ListFilter className="w-4 h-4" />
        </button>

        <h1 className="font-display font-bold text-[19px] text-ink tracking-tight">
          {calendarMode ? 'Release dates' : 'Watch'}
        </h1>

        <button
          type="button"
          onClick={toggleCalendarMode}
          aria-label="Toggle release dates calendar"
          className={`glass-btn h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
            calendarMode ? 'text-brand border-brand/50 bg-brand/15' : 'text-ink'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Category Sub-Filter Pills */}
      {!calendarMode && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
          {filterTabs.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => updateSettings({ watchFilter: t.id })}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                  active
                    ? 'bg-brand border-brand text-brand-ink'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {calendarMode ? (
        <div className="animate-fade-in">
          <ReleaseAlertBanner />
          {upcomingGroups.today.length > 0 && (
            <section className="mb-7">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Today</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingGroups.today.map(renderUpcomingCard)}
              </div>
            </section>
          )}
          {upcomingGroups.thisWeek.length > 0 && (
            <section className="mb-7">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                Later this week
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingGroups.thisWeek.map(renderUpcomingCard)}
              </div>
            </section>
          )}
          {upcomingGroups.later.length > 0 && (
            <section>
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Later</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcomingGroups.later.map(renderUpcomingCard)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="animate-fade-in">
          {watchingShows.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Watch next</h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {watchingShows.map(renderShowCard)}
              </div>
            </section>
          )}

          {watchlistMovies.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                Movies to watch
              </h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {watchlistMovies.map(renderMovieCard)}
              </div>
            </section>
          )}

          {notStartedShows.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                Not started yet
              </h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {notStartedShows.map(renderShowCard)}
              </div>
            </section>
          )}

          {finishedShows.length + watchedMovies.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowFinished((v) => !v)}
                className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
              >
                <span>
                  Finished & Watched ({finishedShows.length + watchedMovies.length})
                </span>
                {showFinished ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {showFinished && (
                <div
                  className={
                    isPosterLayout
                      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                      : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                  }
                >
                  {finishedShows.map(renderShowCard)}
                  {watchedMovies.map(renderMovieCard)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <FilterSortSheet domain="watch" />
    </div>
  );
}
