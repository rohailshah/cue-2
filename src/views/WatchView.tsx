import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckSquare, ChevronDown, ChevronRight, Clock, Search, Tv, Upload } from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { BulkActionBar } from '../components/BulkActionBar';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { ReleaseAlertBanner } from '../components/ReleaseAlertBanner';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { HistoryEntry, Movie, Show, UpcomingEntry, WatchFilter } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import {
  formatEpisodeCode,
  formatUpcomingReleaseLabel,
  getDaysUntilRelease,
  getShowStats,
  isMovieReleased,
} from '../utils/stats';

export function WatchView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    switchTab,
    toggleCalendarMode,
    setFilterSheetOpen,
    setImportModalOpen,
    updateSettings,
    watchNextEpisode,
    toggleMovieWatched,
    bulkUpdateItems,
  } = useCueStore();

  const [justChecked, setJustChecked] = useState<Record<string, boolean>>({});
  const [showFinished, setShowFinished] = useState(false);
  const [watchShelfFilter, setWatchShelfFilter] = useState<'all' | 'owned' | 'wishlist'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<
    Record<string, { kind: 'show' | 'movie'; id: string }>
  >({});
  const timersRef = useRef<number[]>([]);

  useModalBackHandler(selectMode, () => {
    setSelectMode(false);
    setSelectedMap({});
  });

  const toggleBulkItem = (kind: 'show' | 'movie', id: string) => {
    const k = `${kind}:${id}`;
    setSelectedMap((prev) => {
      if (prev[k]) {
        const copy = { ...prev };
        delete copy[k];
        return copy;
      }
      return { ...prev, [k]: { kind, id } };
    });
  };

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const filter = state.settings.watchFilter;

  const watchShelfCounts = useMemo(() => {
    let owned = 0;
    let wishlist = 0;
    for (const id of state.showOrder) {
      const s = state.shows[id];
      const prog = state.showProgress[id];
      if (!s || !prog?.bookmarked || filter === 'movie') continue;
      const b = getMediaCollectionBadge('show', s, prog);
      if (b.hasAnyOwned) owned += 1;
      if (b.hasAnyWishlist) wishlist += 1;
    }
    if (filter !== 'tv' && filter !== 'anime') {
      for (const id of state.movieOrder) {
        const m = state.movies[id];
        const prog = state.movieProgress[id];
        if (!m || !prog) continue;
        const b = getMediaCollectionBadge('movie', m, prog);
        if (b.hasAnyOwned) owned += 1;
        if (b.hasAnyWishlist) wishlist += 1;
      }
    }
    return { owned, wishlist };
  }, [state.showOrder, state.shows, state.showProgress, state.movieOrder, state.movies, state.movieProgress, filter]);

  const triggerFlash = (id: string, commit: () => void) => {
    if (justChecked[id]) return;
    setJustChecked((prev) => ({ ...prev, [id]: true }));
    const tCommit = window.setTimeout(commit, 250);
    const tClear = window.setTimeout(() => {
      setJustChecked((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const handleQuickWatchShow = (e: React.MouseEvent, showId: string) => {
    e.stopPropagation();
    triggerFlash(showId, () => watchNextEpisode(showId));
  };

  const handleQuickWatchMovie = (e: React.MouseEvent, movieId: string) => {
    e.stopPropagation();
    triggerFlash(movieId, () => toggleMovieWatched(movieId));
  };

  const watchHistory = useMemo(
    () => (state.history || []).filter((h) => h.domain === 'watch'),
    [state.history]
  );

  const openHistoryEntry = (entry: HistoryEntry) => {
    if (entry.mediaKind === 'movie') {
      pushRoute({ view: 'movie-detail', movieId: entry.mediaId });
    } else {
      pushRoute({ view: 'show-detail', showId: entry.mediaId });
    }
  };

  const {
    watchingShows,
    caughtUpShows,
    notStartedShows,
    finishedShows,
    watchlistMovies,
    upcomingMovies,
    watchedMovies,
  } =
    useMemo(() => {
      const sortMode = state.settings.sortBy;

      const shows = state.showOrder
        .map((id) => state.shows[id])
        .filter((s): s is Show => Boolean(s) && Boolean(state.showProgress[s.id]?.bookmarked))
        .filter(() => filter !== 'movie')
        .filter((s) => {
          if (watchShelfFilter === 'all') return true;
          const b = getMediaCollectionBadge('show', s, state.showProgress[s.id]);
          return watchShelfFilter === 'owned' ? b.hasAnyOwned : b.hasAnyWishlist;
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
      const caughtUp: Show[] = [];
      const notStarted: Show[] = [];
      const finished: Show[] = [];
      for (const s of shows) {
        const st = getShowStats(s, state.showProgress[s.id]);
        if (st.isFinished) finished.push(s);
        else if (st.isCaughtUp || !st.nextEpisode) caughtUp.push(s);
        else if (st.watchedUnique > 0) watching.push(s);
        else notStarted.push(s);
      }

      const movies =
        filter === 'tv' || filter === 'anime'
          ? []
          : state.movieOrder
              .map((id) => state.movies[id])
              .filter((m): m is Movie => Boolean(m) && Boolean(state.movieProgress[m.id]))
              .filter((m) => {
                if (watchShelfFilter === 'all') return true;
                const b = getMediaCollectionBadge('movie', m, state.movieProgress[m.id]);
                return watchShelfFilter === 'owned' ? b.hasAnyOwned : b.hasAnyWishlist;
              });

      const sortMovies = (list: Movie[]) =>
        [...list].sort((a, b) => {
          if (sortMode === 'alpha') return a.title.localeCompare(b.title);
          if (sortMode === 'rating') return b.rating - a.rating;
          if (sortMode === 'progress') return a.runtime - b.runtime;
          const ta = state.movieProgress[a.id]?.watchedAt || '';
          const tb = state.movieProgress[b.id]?.watchedAt || '';
          return tb.localeCompare(ta);
        });

      const now = new Date();
      const wMovies = movies.filter(
        (m) => (state.movieProgress[m.id]?.watchCount || 0) === 0 && isMovieReleased(m, now)
      );
      const uMovies = movies.filter(
        (m) => (state.movieProgress[m.id]?.watchCount || 0) === 0 && !isMovieReleased(m, now)
      );
      const dMovies = movies.filter((m) => (state.movieProgress[m.id]?.watchCount || 0) > 0);

      return {
        watchingShows: sortShows(watching),
        caughtUpShows: sortShows(caughtUp),
        notStartedShows: sortShows(notStarted),
        finishedShows: sortShows(finished),
        watchlistMovies: sortMovies(wMovies),
        upcomingMovies: sortMovies(uMovies),
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
      watchShelfFilter,
    ]);

  const upcomingGroups = useMemo(() => {
    const items = state.upcoming.filter((u) => u.domain === 'watch');
    const seenShowIds = new Set(items.filter((u) => u.kind === 'episode').map((u) => u.mediaId));
    const derived: UpcomingEntry[] = [];
    const now = new Date();
    for (const id of state.showOrder) {
      if (seenShowIds.has(id)) continue;
      const show = state.shows[id];
      const prog = state.showProgress[id];
      if (!show || !prog?.bookmarked) continue;
      const st = getShowStats(show, prog);
      const ep = st.nextUpcomingEpisode;
      if (!ep) continue;
      const daysUntil = getDaysUntilRelease(ep.airdate, ep.airstamp, now);
      if (daysUntil === null || daysUntil < 0) continue;
      const label = formatUpcomingReleaseLabel(ep.airdate, ep.airstamp, now);
      derived.push({
        id: `live-up-${show.id}-${ep.id}`,
        domain: 'watch',
        kind: 'episode',
        mediaId: show.id,
        title: show.title,
        subtitle: `${formatEpisodeCode(ep.season, ep.number)} · ${label}`,
        episodeTitle: ep.title,
        daysUntil,
        artworkUrl: show.posterUrl,
      });
    }
    const merged = [...items, ...derived].sort((a, b) => a.daysUntil - b.daysUntil);
    return {
      today: merged.filter((u) => u.daysUntil === 0),
      thisWeek: merged.filter((u) => u.daysUntil > 0 && u.daysUntil <= 6),
      later: merged.filter((u) => u.daysUntil >= 7),
    };
  }, [state.upcoming, state.showOrder, state.shows, state.showProgress]);

  const isPosterLayout = state.settings.watchLayout === 'posters';

  const renderShowCard = (show: Show) => {
    const prog = state.showProgress[show.id];
    const stats = getShowStats(show, prog);
    const next = stats.nextEpisode;
    const upcoming = stats.nextUpcomingEpisode;
    const flash = Boolean(justChecked[show.id]);
    const isWaiting = !stats.isFinished && (stats.isCaughtUp || !next);
    const upcomingDays = upcoming
      ? getDaysUntilRelease(upcoming.airdate, upcoming.airstamp)
      : null;
    const upcomingDateLabel = upcoming
      ? formatUpcomingReleaseLabel(upcoming.airdate, upcoming.airstamp)
      : 'TBA';

    const showCol = getMediaCollectionBadge('show', show, prog);

    if (isPosterLayout) {
      const isSel = Boolean(selectedMap[`show:${show.id}`]);
      return (
        <div
          key={show.id}
          role="button"
          tabIndex={0}
          onClick={() =>
            selectMode ? toggleBulkItem('show', show.id) : pushRoute({ view: 'show-detail', showId: show.id })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selectMode) toggleBulkItem('show', show.id);
              else pushRoute({ view: 'show-detail', showId: show.id });
            }
          }}
          className="group cursor-pointer text-left"
        >
          <div
            className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
              selectMode && isSel ? 'border-watch ring-2 ring-watch' : 'border-white/8'
            }`}
          >
            <MediaImage
              src={show.posterUrl}
              alt={show.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!selectMode && showCol.shortTag && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-watch/40 text-[9.5px] font-semibold text-watch leading-none">
                {showCol.shortTag}
              </span>
            )}
            {selectMode ? (
              <span
                className={`absolute top-2 right-2 h-7 w-7 rounded-full border flex items-center justify-center ${
                  isSel
                    ? 'bg-watch border-watch text-[#0E1A1E]'
                    : 'bg-black/65 border-white/30 text-transparent'
                }`}
              >
                <Check className="w-4 h-4" strokeWidth={2.8} />
              </span>
            ) : !stats.isFinished && !isWaiting && (
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
                  style={{
                    width: `${Math.round(
                      (stats.unreleasedEpisodes > 0 ? stats.airedProgressRatio : stats.progressRatio) * 100
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{show.title}</p>
          <p className="text-xs text-ink-dim tabular-nums truncate">
            {next
              ? `${formatEpisodeCode(next.season, next.number)} · ${stats.nextOrdinal}/${
                  stats.unreleasedEpisodes > 0 ? stats.airedEpisodes : stats.totalEpisodes
                }`
              : isWaiting && upcoming
                ? `${formatEpisodeCode(upcoming.season, upcoming.number)} · ${upcomingDateLabel}`
                : 'Finished'}
          </p>
        </div>
      );
    }

    if (isWaiting) {
      return (
        <BingersMediaRow
          key={show.id}
          title={show.title}
          badgeLabel="Show"
          badgeClassName="bg-watch/15 text-watch"
          posterUrl={show.posterUrl}
          primaryLine={
            stats.watchedUnique > 0
              ? `Caught up · ${stats.watchedUnique}/${stats.airedEpisodes} aired`
              : upcoming
                ? `Premieres ${upcomingDateLabel}`
                : 'Waiting for release'
          }
          secondaryLine={
            upcoming
              ? `Next: ${formatEpisodeCode(upcoming.season, upcoming.number)} · ${upcomingDateLabel}`
              : `${show.year} · ${show.genres.slice(0, 2).join(' · ')}`
          }
          progressRatio={stats.airedProgressRatio}
          showProgress={false}
          actionDisabled
          actionContent={
            upcomingDays !== null && upcomingDays > 0 ? (
              <span className="flex flex-col items-center px-1">
                <span className="text-[15px] font-display font-bold text-ink tabular-nums leading-none">
                  {upcomingDays}
                </span>
                <span className="text-[9.5px] text-ink-dim mt-0.5">
                  {upcomingDays === 1 ? 'day' : 'days'}
                </span>
              </span>
            ) : (
              <Clock className="w-[16px] h-[16px] text-ink-dim" />
            )
          }
          actionAriaLabel={`${show.title} waiting for release`}
          onOpen={() => pushRoute({ view: 'show-detail', showId: show.id })}
        />
      );
    }

    return (
      <BingersMediaRow
        key={show.id}
        title={show.title}
        badgeLabel="Show"
        badgeClassName="bg-watch/15 text-watch"
        posterUrl={show.posterUrl}
        posterTag={next?.number === 1 ? 'PREMIERE' : undefined}
        primaryLine={
          next
            ? `${formatEpisodeCode(next.season, next.number)} · ${stats.nextOrdinal}/${
                stats.unreleasedEpisodes > 0 ? stats.airedEpisodes : stats.totalEpisodes
              }`
            : `Finished · ${stats.totalEpisodes}/${stats.totalEpisodes}`
        }
        secondaryLine={
          [
            next ? next.title : `${show.year} · ${show.genres.slice(0, 2).join(' · ')}`,
            showCol.badgeText,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        progressRatio={stats.unreleasedEpisodes > 0 ? stats.airedProgressRatio : stats.progressRatio}
        showProgress={state.settings.showPosterProgress}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={
          selectMode ? (
            <Check
              className={`w-[17px] h-[17px] ${selectedMap[`show:${show.id}`] ? 'text-watch' : 'text-ink-faint'}`}
              strokeWidth={2.6}
            />
          ) : (
            <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
          )
        }
        actionAriaLabel={selectMode ? `Select ${show.title}` : `Mark ${show.title} next episode watched`}
        actionDisabled={!selectMode && stats.isFinished}
        actionActive={selectMode ? Boolean(selectedMap[`show:${show.id}`]) : stats.isFinished}
        onAction={
          selectMode
            ? (e) => {
                e.stopPropagation();
                toggleBulkItem('show', show.id);
              }
            : !stats.isFinished
              ? (e) => handleQuickWatchShow(e, show.id)
              : undefined
        }
        onOpen={() =>
          selectMode ? toggleBulkItem('show', show.id) : pushRoute({ view: 'show-detail', showId: show.id })
        }
      />
    );
  };

  const renderMovieCard = (movie: Movie) => {
    const prog = state.movieProgress[movie.id];
    const isWatched = (prog?.watchCount || 0) > 0;
    const flash = Boolean(justChecked[movie.id]);
    const movieCol = getMediaCollectionBadge('movie', movie, prog);

    if (isPosterLayout) {
      const isSel = Boolean(selectedMap[`movie:${movie.id}`]);
      return (
        <div
          key={movie.id}
          role="button"
          tabIndex={0}
          onClick={() =>
            selectMode ? toggleBulkItem('movie', movie.id) : pushRoute({ view: 'movie-detail', movieId: movie.id })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selectMode) toggleBulkItem('movie', movie.id);
              else pushRoute({ view: 'movie-detail', movieId: movie.id });
            }
          }}
          className="group cursor-pointer text-left"
        >
          <div
            className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
              selectMode && isSel ? 'border-watch ring-2 ring-watch' : 'border-white/8'
            }`}
          >
            <MediaImage
              src={movie.posterUrl}
              alt={movie.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!selectMode && movieCol.shortTag && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-watch/40 text-[9.5px] font-semibold text-watch leading-none">
                {movieCol.shortTag}
              </span>
            )}
            {selectMode ? (
              <span
                className={`absolute top-2 right-2 h-7 w-7 rounded-full border flex items-center justify-center ${
                  isSel
                    ? 'bg-watch border-watch text-[#0E1A1E]'
                    : 'bg-black/65 border-white/30 text-transparent'
                }`}
              >
                <Check className="w-4 h-4" strokeWidth={2.8} />
              </span>
            ) : (
            <button
              type="button"
              onClick={(e) => handleQuickWatchMovie(e, movie.id)}
              aria-label={`Toggle ${movie.title} watched`}
              className={`absolute top-2 right-2 h-8 w-8 rounded-full backdrop-blur-md flex items-center justify-center border transition-all ${
                isWatched || flash
                  ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                  : 'bg-black/60 border-white/20 text-white hover:border-watched hover:text-watched'
              }`}
            >
              <Check className="w-4 h-4" />
            </button>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{movie.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {movie.year} · {movie.runtime}m
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={movie.id}
        title={movie.title}
        badgeLabel="Movie"
        badgeClassName="bg-watch/15 text-watch"
        posterUrl={movie.posterUrl}
        primaryLine={`${movie.year} · ${movie.runtime}m`}
        secondaryLine={[movie.director, movieCol.badgeText].filter(Boolean).join(' · ')}
        progressRatio={isWatched ? 1 : 0}
        showProgress={state.settings.showPosterProgress && isWatched}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={
          selectMode ? (
            <Check
              className={`w-[17px] h-[17px] ${selectedMap[`movie:${movie.id}`] ? 'text-watch' : 'text-ink-faint'}`}
              strokeWidth={2.6}
            />
          ) : isWatched && prog.watchCount > 1 ? (
            <span className="text-xs font-bold text-watched tabular-nums">x{prog.watchCount}</span>
          ) : (
            <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
          )
        }
        actionAriaLabel={selectMode ? `Select ${movie.title}` : `Toggle ${movie.title} watched`}
        actionActive={selectMode ? Boolean(selectedMap[`movie:${movie.id}`]) : isWatched}
        onAction={
          selectMode
            ? (e) => {
                e.stopPropagation();
                toggleBulkItem('movie', movie.id);
              }
            : (e) => handleQuickWatchMovie(e, movie.id)
        }
        onOpen={() =>
          selectMode
            ? toggleBulkItem('movie', movie.id)
            : pushRoute({ view: 'movie-detail', movieId: movie.id })
        }
      />
    );
  };

  const renderUpcomingCard = (entry: UpcomingEntry) => {
    const flash = Boolean(justChecked[entry.id]);
    const show = state.shows[entry.mediaId];
    return (
      <BingersMediaRow
        key={entry.id}
        title={entry.title}
        badgeLabel={entry.groupCount && entry.groupCount > 1 ? `+${entry.groupCount}` : undefined}
        badgeClassName="bg-brand/15 text-brand"
        posterUrl={show?.posterUrl || entry.artworkUrl}
        primaryLine={entry.subtitle}
        secondaryLine={entry.episodeTitle}
        isFlashing={flash}
        flashLabel="Watched"
        actionContent={
          entry.daysUntil === 0 ? (
            <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
          ) : (
            <span className="flex flex-col items-center px-1">
              <span className="text-[17px] font-display font-bold text-ink tabular-nums leading-none">
                {entry.daysUntil}
              </span>
              <span className="text-[10px] text-ink-dim mt-0.5">
                {entry.daysUntil === 1 ? 'day' : 'days'}
              </span>
            </span>
          )
        }
        actionAriaLabel={`Mark ${entry.title} watched`}
        actionDisabled={entry.daysUntil !== 0}
        onAction={
          entry.daysUntil === 0
            ? () =>
                triggerFlash(entry.id, () => {
                  watchNextEpisode(entry.mediaId);
                })
            : undefined
        }
        onOpen={() => pushRoute({ view: 'show-detail', showId: entry.mediaId })}
      />
    );
  };

  const filterTabs: { id: WatchFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'tv', label: 'Shows' },
    { id: 'movie', label: 'Movies' },
  ];

  const listClass = isPosterLayout
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3.5 items-start'
    : 'space-y-3';

  return (
    <>
      <ScrollUpHistoryFeed
        historyItems={calendarMode ? [] : watchHistory}
        onOpenHistoryItem={openHistoryEntry}
        resetAnchorKey={calendarMode ? 'calendar' : 'feed'}
        stickyHeader={
          <MobileDomainBar
            title="Release dates"
            domainLabel="Watch"
            calendarMode={calendarMode}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onToggleCalendar={toggleCalendarMode}
            filterAriaLabel="Filter and sort watch list"
            calendarAriaLabel="Toggle release dates calendar"
          />
        }
      >
        {/* Category Sub-Filter Pills */}
        {!calendarMode && (
          <div className="mb-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => {
                  setSelectMode((v) => !v);
                  setSelectedMap({});
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 inline-flex items-center gap-1.5 transition-colors ${
                  selectMode
                    ? 'bg-white border-white text-[#131519]'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{selectMode ? 'Cancel' : 'Select'}</span>
              </button>
            </div>

            {(watchShelfCounts.owned > 0 || watchShelfCounts.wishlist > 0) && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: 'All titles' },
                    ...(watchShelfCounts.owned > 0
                      ? [{ id: 'owned' as const, label: `Owned (${watchShelfCounts.owned})` }]
                      : []),
                    ...(watchShelfCounts.wishlist > 0
                      ? [{ id: 'wishlist' as const, label: `Wishlist (${watchShelfCounts.wishlist})` }]
                      : []),
                  ] as Array<{ id: 'all' | 'owned' | 'wishlist'; label: string }>
                ).map((sub) => {
                  const active = watchShelfFilter === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setWatchShelfFilter(sub.id)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                        active
                          ? 'border-watch/60 bg-watch/15 text-watch'
                          : 'border-white/[0.07] bg-surface text-ink-dim hover:text-ink'
                      }`}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {calendarMode ? (
          <div className="animate-fade-in space-y-7">
            <ReleaseAlertBanner />
            {upcomingGroups.today.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">Today</h2>
                <div className="space-y-3">{upcomingGroups.today.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.thisWeek.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">
                  Later this week
                </h2>
                <div className="space-y-3">{upcomingGroups.thisWeek.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.later.length > 0 && (
              <section>
                <h2 className="font-display font-bold text-[21px] text-ink mb-3">Later</h2>
                <div className="space-y-3">{upcomingGroups.later.map(renderUpcomingCard)}</div>
              </section>
            )}
            {upcomingGroups.today.length === 0 &&
              upcomingGroups.thisWeek.length === 0 &&
              upcomingGroups.later.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center">
                  <Tv className="w-7 h-7 text-watch mx-auto mb-2.5 opacity-80" />
                  <p className="font-display font-bold text-lg text-ink">No upcoming releases yet</p>
                  <p className="text-xs text-ink-dim mt-1">
                    Add shows in Search to see upcoming episode schedules here.
                  </p>
                </div>
              )}
          </div>
        ) : (
          <div className="animate-fade-in">
            {watchingShows.length === 0 &&
              caughtUpShows.length === 0 &&
              watchlistMovies.length === 0 &&
              upcomingMovies.length === 0 &&
              notStartedShows.length === 0 &&
              finishedShows.length === 0 &&
              watchedMovies.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-4">
                  <Tv className="w-8 h-8 text-watch mx-auto mb-3 opacity-85" />
                  <h2 className="font-display font-bold text-[20px] text-ink">
                    Nothing in Watch yet
                  </h2>
                  <p className="text-sm text-ink-dim mt-1 max-w-sm mx-auto">
                    Search for shows and movies to start tracking episodes and rewatches.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => switchTab('search')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
                    >
                      <Search className="w-4 h-4" />
                      <span>Search Watch</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-raised border border-white/10 text-ink text-sm font-semibold hover:bg-white/10 transition-colors"
                    >
                      <Upload className="w-4 h-4 text-watch" />
                      <span>Import IMDb / CSV</span>
                    </button>
                  </div>
                </div>
              )}

            {watchingShows.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Watch next</h2>
                <div className={listClass}>{watchingShows.map(renderShowCard)}</div>
              </section>
            )}

            {caughtUpShows.length + upcomingMovies.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Waiting for release
                </h2>
                <div className={listClass}>
                  {caughtUpShows.map(renderShowCard)}
                  {upcomingMovies.map(renderMovieCard)}
                </div>
              </section>
            )}

            {watchlistMovies.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Movies to watch
                </h2>
                <div className={listClass}>{watchlistMovies.map(renderMovieCard)}</div>
              </section>
            )}

            {notStartedShows.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Collecting dust
                </h2>
                <div className={listClass}>{notStartedShows.map(renderShowCard)}</div>
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
                  <div className={listClass}>
                    {finishedShows.map(renderShowCard)}
                    {watchedMovies.map(renderMovieCard)}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </ScrollUpHistoryFeed>

      <FilterSortSheet domain="watch" />
      {selectMode && !calendarMode && (
        <BulkActionBar
          selectedCount={Object.keys(selectedMap).length}
          totalCount={
            watchingShows.length +
            caughtUpShows.length +
            notStartedShows.length +
            finishedShows.length +
            watchlistMovies.length +
            watchedMovies.length
          }
          lists={state.lists}
          onSelectAll={() => {
            const all: Record<string, { kind: 'show' | 'movie'; id: string }> = {};
            for (const s of [...watchingShows, ...caughtUpShows, ...notStartedShows, ...finishedShows]) {
              all[`show:${s.id}`] = { kind: 'show', id: s.id };
            }
            for (const m of [...watchlistMovies, ...watchedMovies]) {
              all[`movie:${m.id}`] = { kind: 'movie', id: m.id };
            }
            setSelectedMap(all);
          }}
          onClear={() => setSelectedMap({})}
          onCancel={() => {
            setSelectMode(false);
            setSelectedMap({});
          }}
          onAction={(act, lId) => {
            bulkUpdateItems(Object.values(selectedMap), act, lId);
            setSelectMode(false);
            setSelectedMap({});
          }}
        />
      )}
    </>
  );
}
