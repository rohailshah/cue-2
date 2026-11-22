import { useState } from 'react';
import { Bookmark, Check, ChevronLeft, Clock, ListPlus, Plus, Star } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { useCueStore } from '../store/useCueStore';

export function MovieDetailView({ movieId }: { movieId: string }) {
  const {
    state,
    goBack,
    toggleMovieWatched,
    incrementMovieRewatch,
    toggleMovieWatchlist,
    rateMovie,
    setMovieMood,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const movie = state.movies[movieId];
  const progress = state.movieProgress[movieId];

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

  return (
    <div className="min-h-dvh pb-20 bg-background">
      <div className="relative h-[300px] sm:h-[360px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={movie.backdropUrl || movie.posterUrl}
          alt={movie.title}
          className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
        />
        <div className="absolute inset-0 bg-[#131519]/65" />

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

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <div className="w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0">
            <MediaImage src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 pb-1">
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {movie.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1 flex items-center gap-2 flex-wrap">
              <span>{movie.year}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {movie.runtime}m
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-brand">
                <Star className="w-3.5 h-3.5 fill-brand" />
                {movie.rating.toFixed(1)}
              </span>
            </p>
            <p className="text-xs text-ink-faint mt-1">Directed by {movie.director}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => toggleMovieWatchlist(movie.id)}
            aria-label="Toggle watchlist"
            className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              inLibrary
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-5 h-5" fill={inLibrary ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            onClick={() => toggleMovieWatched(movie.id)}
            className={`flex-1 h-12 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${
              isWatched
                ? 'border-2 border-watched bg-watched/[0.08] text-ink'
                : 'bg-brand text-brand-ink hover:opacity-95'
            }`}
          >
            <Check
              className={`w-5 h-5 ${isWatched ? 'text-watched' : 'text-brand-ink'}`}
              strokeWidth={2.5}
            />
            <span>
              {isWatched
                ? `Watched${progress && progress.watchCount > 1 ? ` · x${progress.watchCount}` : ''}`
                : 'Mark as Watched'}
            </span>
          </button>

          {isWatched && (
            <button
              type="button"
              onClick={() => incrementMovieRewatch(movie.id, 1)}
              className="h-12 px-4 rounded-full bg-surface-raised border border-white/12 text-sm font-semibold text-watched flex items-center gap-1.5 hover:bg-white/10"
            >
              <Plus className="w-4 h-4" />
              <span>Rewatch</span>
            </button>
          )}
        </div>

        <section className="pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[16px] text-ink">Movie info</h2>
              <p className="text-[13.5px] text-ink-dim mt-0.5">{movie.genres.join(' · ')}</p>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (progress?.rating || 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => rateMovie(movie.id, star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-0.5 hover:scale-110 transition-transform"
                  >
                    <Star className={`w-4 h-4 ${active ? 'text-brand fill-brand' : 'text-ink-faint'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <p className={`text-[13.5px] text-ink-dim leading-relaxed mt-2.5 ${expanded ? '' : 'line-clamp-3'}`}>
            {movie.overview}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand mt-1"
          >
            {expanded ? 'Show less' : 'More'}
          </button>
        </section>

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
      </div>

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
    </div>
  );
}
