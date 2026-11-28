import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  CalendarCheck2,
  Check,
  ChevronLeft,
  ListPlus,
  Maximize2,
  Minus,
  Play,
  Plus,
  Star,
  Wrench,
} from 'lucide-react';
import { CollectionDetailCard, CollectionHeroButton } from '../components/CollectionDetailCard';
import { CoverLightbox } from '../components/CoverLightbox';
import { DetailModeToggle } from '../components/DetailModeToggle';
import {
  CompactFinishedDateRow,
  FinishedDateRow,
  formatFinishedDate,
} from '../components/FinishedDateCard';
import { FixMediaInfoModal } from '../components/FixMediaInfoModal';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { HeroRatingCard, RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import { enrichMovieStub, fetchTmdbMovieDetails } from '../services/mediaApi';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { DetailCardMode } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import { evaluateMovieCollectionProgress, findMovieCollection } from '../utils/containers';
import { formatRating } from '../utils/ratings';
import { cleanDisplayGenres } from '../utils/stats';

const sessionDetailModeByMovieId = new Map<string, DetailCardMode>();

export function MovieDetailView({ movieId }: { movieId: string }) {
  const {
    state,
    goBack,
    pushRoute,
    toggleMovieWatched,
    incrementMovieRewatch,
    toggleMovieWatchlist,
    rateMovie,
    rateCollection,
    setCollectionFinishedDate,
    setMediaOwnership,
    updateMediaCollectionDetails,
    setMovieMood,
    setMediaFinishedDate,
    addCompletionRun,
    updateCompletionRunDate,
    deleteCompletionRun,
    updateMovieDetails,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  useModalBackHandler(listPickerOpen, () => setListPickerOpen(false));
  const [detailMode, setDetailMode] = useState<DetailCardMode>(
    () => sessionDetailModeByMovieId.get(movieId) || state.settings.detailMode || 'simple'
  );
  const enrichedMovieRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDetailMode(sessionDetailModeByMovieId.get(movieId) || state.settings.detailMode || 'simple');
  }, [movieId, state.settings.detailMode]);

  const movie = state.movies[movieId];
  const progress = state.movieProgress[movieId];

  useEffect(() => {
    if (!movie) return;
    if (enrichedMovieRef.current.has(movie.id)) return;

    if (movie.tmdbId) {
      const needsEnrich = movie.cast.length === 0 || !movie.trailerUrl;
      if (!needsEnrich) return;
      let cancelled = false;
      fetchTmdbMovieDetails(movie.tmdbId, state.settings.tmdbApiKey).then((patch) => {
        if (cancelled) return;
        enrichedMovieRef.current.add(movie.id);
        if (patch) {
          updateMovieDetails(movie.id, patch);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (!movie.posterUrl || movie.cast.length === 0) {
      let cancelled = false;
      enrichedMovieRef.current.add(movie.id);
      enrichMovieStub(movie.title, movie.year, state.settings.tmdbApiKey).then((patch) => {
        if (cancelled || !patch) return;
        updateMovieDetails(movie.id, {
          ...(patch.tmdbId ? { tmdbId: patch.tmdbId } : {}),
          ...(patch.posterUrl && !movie.posterUrl ? { posterUrl: patch.posterUrl } : {}),
          ...(patch.backdropUrl && !movie.backdropUrl ? { backdropUrl: patch.backdropUrl } : {}),
          ...(patch.overview && (!movie.overview || movie.overview === `${movie.title} (${movie.year}).`)
            ? { overview: patch.overview }
            : {}),
          ...(patch.director && (!movie.director || movie.director === 'Feature Film')
            ? { director: patch.director }
            : {}),
          ...(patch.runtime ? { runtime: patch.runtime } : {}),
          ...(patch.genres?.length && movie.genres.length <= 1 ? { genres: patch.genres } : {}),
          ...(patch.cast?.length && movie.cast.length === 0 ? { cast: patch.cast } : {}),
          ...(patch.trailerUrl && !movie.trailerUrl ? { trailerUrl: patch.trailerUrl } : {}),
        });
      });
      return () => {
        cancelled = true;
      };
    }
  }, [movie, state.settings.tmdbApiKey, updateMovieDetails]);

  const handleDetailModeChange = (nextMode: DetailCardMode) => {
    sessionDetailModeByMovieId.set(movieId, nextMode);
    setDetailMode(nextMode);
  };

  if (!movie) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Movie not found</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 px-5 py-2.5 rounded-full bg-surface-raised text-sm text-ink"
        >
          Go back
        </button>
      </div>
    );
  }

  const isWatched = (progress?.watchCount || 0) > 0;
  const inLibrary = Boolean(progress);
  const movieCol = findMovieCollection(movie.title, movie.year);
  const evalCol = movieCol ? evaluateMovieCollectionProgress(movieCol, state) : null;
  const colKey = movieCol ? `movie-col:${movieCol.id}` : '';
  const storedColRating = colKey ? state.collectionRatings?.[colKey] : undefined;

  return (
    <div className="min-h-dvh pb-20 bg-background">
      <div className="relative h-[270px] sm:h-[340px] w-full overflow-hidden border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="View poster fullscreen"
          className="block w-full h-full relative cursor-zoom-in text-left"
        >
          <MediaImage
            src={movie.backdropUrl || movie.posterUrl}
            alt={movie.title}
            className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
          />
          <div className="absolute inset-0 bg-[#131519]/65" />
        </button>

        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn fixed top-4 left-4 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => setListPickerOpen(true)}
          aria-label="Add to custom list"
          className="glass-btn fixed top-4 md:top-20 right-4 md:right-8 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ListPlus className="w-4 h-4" />
        </button>

        <div className="pointer-events-none absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="View cover fullscreen"
            className="pointer-events-auto group relative w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-surface cursor-zoom-in"
          >
            <MediaImage src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" />
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand">
                Movie
              </span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {movie.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {[movie.director, movie.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => toggleMovieWatchlist(movie.id)}
            aria-label="Toggle watchlist"
            className={`h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              inLibrary
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-4.5 h-4.5" fill={inLibrary ? 'currentColor' : 'none'} />
          </button>

          <CollectionHeroButton
            domain="watch"
            ownership={progress?.ownership}
            onCycle={(next) => setMediaOwnership('movie', movie.id, next)}
          />

          <button
            type="button"
            onClick={() => toggleMovieWatched(movie.id)}
            className={`flex-1 h-11 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              isWatched
                ? 'border-2 border-watched bg-watched/[0.08] text-ink'
                : 'bg-brand text-brand-ink hover:opacity-95'
            }`}
          >
            <Check
              className={`w-4.5 h-4.5 ${isWatched ? 'text-watched' : 'text-brand-ink'}`}
              strokeWidth={2.5}
            />
            <span>
              {isWatched
                ? `Watched${progress && progress.watchCount > 1 ? ` · x${progress.watchCount}` : ''}`
                : 'Mark as Watched'}
            </span>
          </button>
        </div>

        <DetailModeToggle mode={detailMode} onChange={handleDetailModeChange} />

        <div key={detailMode} data-detail-mode={detailMode} className="animate-detail-flip">
          {detailMode === 'simple' ? (
            <>
              <section className="pb-4 border-b border-white/[0.08]">
                <p className="text-[13px] text-ink-dim tabular-nums">
                  {[movie.year, `${movie.runtime} min`, movie.director].filter(Boolean).join(' · ')}
                </p>

                {movie.overview && (
                  <div className="mt-2">
                    <p
                      className={`text-[13.5px] text-ink/85 leading-relaxed ${
                        expanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {movie.overview}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="text-xs font-medium text-ink-dim hover:text-ink mt-1"
                    >
                      {expanded ? 'Show less' : 'See more'}
                    </button>
                  </div>
                )}

                {cleanDisplayGenres(movie.genres).length > 0 && (
                  <p className="text-[12.5px] text-ink-faint mt-1.5">
                    {cleanDisplayGenres(movie.genres).slice(0, 3).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-brand text-brand" />
                    {movie.rating.toFixed(1)}/10
                  </span>
                  <button
                    type="button"
                    onClick={() => setFixModalOpen(true)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border inline-flex items-center gap-1 transition-colors ${
                      !movie.posterUrl
                        ? 'bg-brand/12 border-brand/35 text-brand hover:bg-brand/20'
                        : 'bg-surface border-white/[0.08] text-ink-dim hover:text-ink'
                    }`}
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    <span>{!movie.posterUrl ? 'Fix info' : 'Fix'}</span>
                  </button>
                  <span
                    className={`bg-surface border rounded-full px-3 py-1 text-xs font-medium ${
                      isWatched
                        ? 'border-watched/40 text-watched'
                        : 'border-white/[0.08] text-ink-dim'
                    }`}
                  >
                    {isWatched ? 'Watched' : inLibrary ? 'In Cue' : 'Not logged'}
                  </span>
                  {typeof progress?.rating === 'number' && progress.rating > 0 && (
                    <span className="bg-surface border border-brand/35 rounded-full px-3 py-1 text-xs font-semibold text-brand inline-flex items-center gap-1 tabular-nums">
                      Your rating ★ {formatRating(progress.rating)}/5
                    </span>
                  )}
                  {isWatched && formatFinishedDate(progress?.watchedAt) && (
                    <span className="bg-surface border border-watched/35 rounded-full px-3 py-1 text-xs font-medium text-watched inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      Watched {formatFinishedDate(progress?.watchedAt)}
                    </span>
                  )}
                  {(() => {
                    const colBadge = getMediaCollectionBadge('movie', movie, progress);
                    if (!colBadge.badgeText) return null;
                    return (
                      <span className="bg-surface border border-watch/35 rounded-full px-3 py-1 text-xs font-medium text-watch inline-flex items-center gap-1.5 tabular-nums">
                        <Archive className="w-3.5 h-3.5" />
                        {colBadge.badgeText}
                      </span>
                    );
                  })()}
                  {movie.trailerUrl && (
                    <a
                      href={movie.trailerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-surface hover:bg-surface-raised border border-white/[0.12] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3 h-3 fill-brand text-brand" />
                      <span>Watch trailer</span>
                    </a>
                  )}
                </div>
              </section>

              <section className="pt-4 pb-2">
                <HeroRatingCard
                  value={progress?.rating}
                  onChange={(r) => rateMovie(movie.id, r)}
                  promptLabel="Rate this movie"
                  ariaPrefix={`Rate ${movie.title}`}
                />
              </section>

              {movie.cast.length > 0 && (
                <section className="pt-4 pb-2">
                  <h2 className="font-display font-bold text-[16px] text-ink mb-3">Cast</h2>
                  <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
                    {movie.cast.map((c) => (
                      <div key={c.id} className="w-[104px] shrink-0 text-left">
                        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-surface border border-white/[0.06]">
                          <MediaImage
                            src={c.avatarUrl}
                            alt={c.actor}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs font-semibold text-ink truncate mt-1.5">{c.actor}</p>
                        <p className="text-[10px] uppercase tracking-wider text-ink-faint truncate">
                          {c.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {evalCol && (
                <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-watch">
                        Smart container · Trilogy / Saga
                      </p>
                      <h2 className="font-display font-bold text-base text-ink mt-0.5">
                        {evalCol.collection.name}
                      </h2>
                    </div>
                    <span className="text-xs font-bold text-watched tabular-nums px-2.5 py-1 rounded-full bg-watched/15">
                      {evalCol.watchedCount} / {evalCol.totalCount} watched
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-watched transition-all duration-300"
                      style={{ width: `${Math.round(evalCol.ratio * 100)}%` }}
                    />
                  </div>

                  <div className="divide-y divide-white/[0.06]">
                    {evalCol.entries.map((entry) => (
                      <div
                        key={entry.title}
                        role={entry.movieId ? 'button' : undefined}
                        tabIndex={entry.movieId ? 0 : undefined}
                        onClick={() => {
                          if (entry.movieId && entry.movieId !== movie.id) {
                            pushRoute({ view: 'movie-detail', movieId: entry.movieId });
                          }
                        }}
                        className={`py-2 flex items-center justify-between gap-3 ${
                          entry.movieId && entry.movieId !== movie.id
                            ? 'cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-xl'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-5 w-5 rounded-full flex items-center justify-center border shrink-0 ${
                              entry.watched
                                ? 'bg-watched/20 border-watched text-watched'
                                : 'border-white/15 text-ink-faint'
                            }`}
                          >
                            {entry.watched && <Check className="w-3 h-3" strokeWidth={2.5} />}
                          </span>
                          <span className="text-sm text-ink truncate">
                            {entry.title}
                            {entry.movieId === movie.id ? ' (this film)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs text-ink-dim tabular-nums">
                          {typeof entry.userRating === 'number' && entry.userRating > 0 && (
                            <span className="text-brand font-semibold">★ {entry.userRating}</span>
                          )}
                          <span>{entry.year}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {evalCol.calculatedAvg !== null && evalCol.ratedCount > 0 ? (
                    <SuggestedRatingBanner
                      compact
                      label={evalCol.collection.name}
                      calculatedAvg={evalCol.calculatedAvg}
                      ratedCount={evalCol.ratedCount}
                      unitWord="films"
                      currentRating={storedColRating?.rating}
                      ratingSource={storedColRating?.source}
                      onAcceptAvg={(avg) => rateCollection(colKey, avg, 'auto')}
                      onManualRate={(r) => rateCollection(colKey, r, 'manual')}
                    />
                  ) : (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                      <span className="text-xs text-ink-dim">Rate {evalCol.collection.name}</span>
                      <RatingControl
                        size="sm"
                        value={storedColRating?.rating}
                        onChange={(r) => rateCollection(colKey, r, 'manual')}
                        labelPrefix={`Rate ${evalCol.collection.name}`}
                        allowClear
                      />
                    </div>
                  )}
                  <CompactFinishedDateRow
                    variant="inline"
                    label="Collection finished"
                    finishedAt={state.collectionFinishedAt?.[colKey]}
                    onChangeDate={(ymd) => setCollectionFinishedDate(colKey, ymd)}
                  />
                </section>
              )}

              {/* Advanced Card 1: Watch Log & Completion Date */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-4 mb-5">
                <div className="rounded-2xl bg-background/50 border border-white/[0.05] grid grid-cols-3 divide-x divide-white/[0.06] text-center">
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Watches
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => incrementMovieRewatch(movie.id, -1)}
                        aria-label="Decrease watch count"
                        className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-display font-bold text-base text-watched tabular-nums min-w-[1.6rem]">
                        x{progress?.watchCount || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementMovieRewatch(movie.id, 1)}
                        aria-label="Increase watch count"
                        className="w-6 h-6 rounded-full bg-watched/20 flex items-center justify-center text-watched"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Time logged
                    </p>
                    <p className="font-display font-bold text-base sm:text-lg text-ink tabular-nums mt-0.5">
                      {(progress?.watchCount || 0) * movie.runtime}m
                    </p>
                  </div>
                  <div className="py-3 px-2 min-w-0">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Release
                    </p>
                    <p className="font-display font-bold text-xs sm:text-sm text-ink tabular-nums truncate mt-1.5">
                      {movie.releaseDate}
                    </p>
                  </div>
                </div>

                <FinishedDateRow
                  isFinished={isWatched}
                  finishedAt={progress?.watchedAt}
                  verbLabel="Watched"
                  onChangeDate={(ymd) => setMediaFinishedDate('movie', movie.id, ymd)}
                  onMarkFinished={() => toggleMovieWatched(movie.id)}
                  completedRuns={progress?.completedRuns}
                  runVerb="rewatch"
                  onAddRun={(ymd, note) => addCompletionRun('movie', movie.id, ymd, note)}
                  onUpdateRunDate={(runId, ymd) => updateCompletionRunDate('movie', movie.id, runId, ymd)}
                  onDeleteRun={(runId) => deleteCompletionRun('movie', movie.id, runId)}
                />
              </section>

              {/* Advanced Card 2: Rating, About & Cast */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-3.5 mb-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[16px] text-ink">Movie info</h2>
                    <p className="text-[13px] text-ink-dim mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{movie.runtime} min</span>
                      {cleanDisplayGenres(movie.genres).length > 0 && (
                        <>
                          <span>·</span>
                          <span>{cleanDisplayGenres(movie.genres).slice(0, 2).join(', ')}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-brand font-semibold">
                        <Star className="w-3.5 h-3.5 fill-brand" />
                        {movie.rating.toFixed(1)}/10
                      </span>
                    </p>
                  </div>
                  <RatingControl
                    value={progress?.rating}
                    onChange={(r) => rateMovie(movie.id, r)}
                    labelPrefix="Rate movie"
                    allowClear
                  />
                </div>

                {movie.overview && (
                  <div>
                    <p
                      className={`text-[13.5px] text-ink-dim leading-relaxed ${
                        expanded ? '' : 'line-clamp-3'
                      }`}
                    >
                      {movie.overview}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-xs font-medium text-brand"
                      >
                        {expanded ? 'Show less' : 'More'}
                      </button>
                      {movie.trailerUrl && (
                        <a
                          href={movie.trailerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-background hover:bg-surface-raised border border-white/[0.1] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-brand text-brand" />
                          <span>Watch trailer</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {movie.cast.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2.5">
                      Cast
                    </p>
                    <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
                      {movie.cast.map((c) => (
                        <div key={c.id} className="w-[88px] shrink-0 text-left">
                          <div className="aspect-[3/4] rounded-xl overflow-hidden bg-background border border-white/[0.06]">
                            <MediaImage
                              src={c.avatarUrl}
                              alt={c.actor}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-[11.5px] font-semibold text-ink truncate mt-1.5">
                            {c.actor}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-ink-faint truncate">
                            {c.character}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <CollectionDetailCard
                domain="watch"
                ownership={progress?.ownership}
                details={progress?.collection}
                badgeText={getMediaCollectionBadge('movie', movie, progress).badgeText}
                fallbackMinutes={movie.runtime || 120}
                onChangeOwnership={(next) => setMediaOwnership('movie', movie.id, next)}
                onSaveDetails={(details, own) =>
                  updateMediaCollectionDetails('movie', movie.id, details, own)
                }
              />

              <PersonalNotesSection
                domain="watch"
                mediaKind="movie"
                mediaId={movie.id}
                mediaTitle={movie.title}
                mediaPoster={movie.posterUrl}
                defaultContext={
                  progress && progress.watchCount > 1 ? `Rewatch x${progress.watchCount}` : undefined
                }
                currentRating={progress?.rating}
                currentMood={progress?.mood}
                onSelectMood={(mood) => setMovieMood(movie.id, mood)}
              />
            </>
          )}
        </div>
      </div>

      <CoverLightbox
        open={lightboxOpen}
        src={movie.posterUrl}
        title={movie.title}
        subtitle={`${movie.director} · ${movie.year}`}
        onClose={() => setLightboxOpen(false)}
      />

      {listPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setListPickerOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg text-ink mb-3">Add to custom list</h3>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {state.lists.map((list) => {
                const included = list.items.some((x) => x.kind === 'movie' && x.id === movie.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'movie', movie.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-surface border border-white/8 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{list.name}</p>
                      <p className="text-xs text-ink-dim">{list.items.length} titles</p>
                    </div>
                    {included && <Check className="w-4 h-4 text-watched" />}
                  </button>
                );
              })}
            </div>
              <div className="flex gap-2">
                <input
                  placeholder="New list name..."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="flex-1 rounded-xl bg-surface border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newListName.trim()) return;
                    createCustomList(newListName, '', { kind: 'movie', id: movie.id });
                    setNewListName('');
                  }}
                  className="px-4 py-2 rounded-xl bg-brand text-brand-ink text-sm font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

      <FixMediaInfoModal
        open={fixModalOpen}
        onClose={() => setFixModalOpen(false)}
        kind="movie"
        title={movie.title}
        creator={movie.director}
        year={movie.year}
        coverUrl={movie.posterUrl}
        overview={movie.overview}
        unitLabel="episodes"
        currentTotal={1}
        autoExpandDetails={!movie.posterUrl}
        refreshLabel="Auto-match poster & details"
        onRefreshLive={async () => {
          const patch = await enrichMovieStub(
            movie.title,
            movie.year,
            state.settings.tmdbApiKey
          );
          if (!patch) return null;
          updateMovieDetails(movie.id, {
            ...(patch.tmdbId ? { tmdbId: patch.tmdbId } : {}),
            ...(patch.posterUrl ? { posterUrl: patch.posterUrl } : {}),
            ...(patch.backdropUrl ? { backdropUrl: patch.backdropUrl } : {}),
            ...(patch.overview ? { overview: patch.overview } : {}),
            ...(patch.director ? { director: patch.director } : {}),
            ...(patch.runtime ? { runtime: patch.runtime } : {}),
            ...(patch.genres?.length ? { genres: patch.genres } : {}),
            ...(patch.cast?.length ? { cast: patch.cast } : {}),
            ...(patch.trailerUrl ? { trailerUrl: patch.trailerUrl } : {}),
          });
          return {
            coverUrl: patch.posterUrl,
            title: patch.title,
            creator: patch.director,
            year: patch.year,
            overview: patch.overview,
            sourceLabel: patch.sourceLabel,
          };
        }}
        onSave={(patch) => {
          updateMovieDetails(movie.id, {
            ...(patch.title ? { title: patch.title } : {}),
            ...(patch.creator ? { director: patch.creator } : {}),
            ...(patch.year ? { year: patch.year } : {}),
            ...(patch.coverUrl !== undefined
              ? { posterUrl: patch.coverUrl, backdropUrl: patch.coverUrl }
              : {}),
            ...(patch.overview !== undefined ? { overview: patch.overview } : {}),
          });
        }}
      />
    </div>
  );
}
