import { useState } from 'react';
import {
  ChevronLeft,
  MoreHorizontal,
} from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { FixMediaInfoModal } from '../components/FixMediaInfoModal';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import { formatEpisodeCode, getEpisodeKey } from '../utils/stats';

export function AnimeDetailView({ animeId }: { animeId: string }) {
  const {
    state,
    goBack,
    watchNextEpisodeAnime,
    toggleEpisodeWatchedAnime,
    toggleAnimeBookmark,
    resetAnimeProgress,
  } = useCueStore();

  const anime = state.animes[animeId];
  const progress = state.animeProgress[animeId];

  const [menuOpen, setMenuOpen] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useModalBackHandler(showFixModal, () => setShowFixModal(false));
  useModalBackHandler(menuOpen, () => setMenuOpen(false));
  useModalBackHandler(showResetConfirm, () => setShowResetConfirm(false));

  if (!anime) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="text-center px-4">
          <h2 className="text-xl font-semibold text-ink">Anime not found</h2>
          <p className="mt-2 text-ink-faint">This anime may have been removed or the ID is invalid.</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground"
            onClick={goBack}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            className="p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-muted"
            onClick={goBack}
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-ink truncate">{anime.title}</h1>
            <p className="text-sm text-ink-faint truncate">
              {anime.year} · {anime.genres.slice(0, 3).join(', ')}
            </p>
          </div>
          <button
            className="p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-muted"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="More options"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 pb-24">
        <MediaImage
          src={anime.posterUrl}
          alt={anime.title}
          className="w-full max-w-xs md:max-w-md lg:max-w-lg mx-auto md:mx-0 rounded-xl shadow-xl"
        />
        <div className="mt-6 max-w-3xl mx-auto md:mx-0">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary">
              {anime.format || 'TV'}
            </span>
            {anime.genres.slice(0, 5).map((g) => (
              <span key={g} className="px-2 py-1 text-xs rounded-full bg-muted text-ink-faint">
                {g}
              </span>
            ))}
          </div>
          <p className="text-ink-faint mb-4">{anime.overview || 'No overview available.'}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <p className="text-ink-faint">Episodes</p>
              <p className="font-medium text-ink">{anime.totalEpisodes}</p>
            </div>
            <div>
              <p className="text-ink-faint">Runtime</p>
              <p className="font-medium text-ink">{anime.runtimeAvg}m</p>
            </div>
            <div>
              <p className="text-ink-faint">Status</p>
              <p className="font-medium text-ink">{progress?.status || 'not_started'}</p>
            </div>
            <div>
              <p className="text-ink-faint">Progress</p>
              <p className="font-medium text-ink">
                {progress?.episodeCounts
                  ? Object.values(progress.episodeCounts).reduce((a, b) => a + b, 0)
                  : 0}/{anime.totalEpisodes}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <button
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium"
              onClick={() => watchNextEpisodeAnime(animeId)}
            >
              Watch Next Episode
            </button>
            <button
              className="px-4 py-2 rounded-lg border border-border text-ink hover:bg-muted"
              onClick={() => toggleAnimeBookmark(animeId)}
            >
              {progress?.bookmarked ? 'Bookmarked' : 'Bookmark'}
            </button>
          </div>

          <h2 className="text-lg font-semibold text-ink mb-4">Seasons</h2>
          <div className="space-y-4">
            {anime.seasons.map((season) => (
              <div key={season.number} className="border border-border rounded-xl p-4">
                <h3 className="font-medium text-ink mb-2">Season {season.number}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {season.episodes.map((ep) => {
                    const key = getEpisodeKey(ep.season, ep.number);
                    const watched = progress?.episodeCounts?.[key] || 0;
                    return (
                      <button
                        key={ep.id}
                        className={`p-2 rounded-lg text-sm text-center transition-colors ${
                          watched
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'bg-muted text-ink-faint hover:bg-muted/50'
                        }`}
                        onClick={() => toggleEpisodeWatchedAnime(animeId, ep.season, ep.number)}
                      >
                        <div className="font-medium">{formatEpisodeCode(ep.season, ep.number)}</div>
                        <div className="text-xs truncate">{ep.title}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} />
      )}
      {menuOpen && (
        <div className="fixed right-0 top-0 z-50 w-64 md:w-72 h-dvh bg-background border-l border-border shadow-xl md:static md:h-auto md:shadow-none md:border-0">
          <div className="p-4 space-y-2">
            <button
              className="w-full px-4 py-2 rounded-lg text-left hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                toggleAnimeBookmark(animeId);
              }}
            >
              {progress?.bookmarked ? 'Remove Bookmark' : 'Add Bookmark'}
            </button>
            <button
              className="w-full px-4 py-2 rounded-lg text-left hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                setShowFixModal(true);
              }}
            >
              Fix Info
            </button>
            <button
              className="w-full px-4 py-2 rounded-lg text-left hover:bg-muted text-red-500"
              onClick={() => {
                setMenuOpen(false);
                setShowResetConfirm(true);
              }}
            >
              Reset Progress
            </button>
          </div>
        </div>
      )}

      {showFixModal && (
        <FixMediaInfoModal
          open
          onClose={() => setShowFixModal(false)}
          kind="anime"
          title={anime.title}
          year={anime.year}
          coverUrl={anime.posterUrl}
          overview={anime.overview}
          unitLabel="episodes"
          currentTotal={anime.totalEpisodes}
          onSave={() => {}}
        />
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-ink mb-2">Reset Progress?</h3>
            <p className="text-ink-faint mb-4">
              This will mark all episodes as unwatched and clear your progress for "{anime.title}".
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded-lg border border-border text-ink hover:bg-muted"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-red-500 text-white"
                onClick={() => {
                  resetAnimeProgress(animeId);
                  setShowResetConfirm(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}