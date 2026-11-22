import { X } from 'lucide-react';
import { MediaInsightsModal } from './components/MediaInsightsModal';
import { NavChrome } from './components/NavChrome';
import { NotificationsSheet } from './components/NotificationsSheet';
import { SettingsModal } from './components/SettingsModal';
import { CueProvider, useCueStore } from './store/useCueStore';
import { GameDetailView } from './views/GameDetailView';
import { JournalView } from './views/JournalView';
import { LibraryGridView } from './views/LibraryGridView';
import { MovieDetailView } from './views/MovieDetailView';
import { PlayView } from './views/PlayView';
import { ReadDetailView } from './views/ReadDetailView';
import { ReadView } from './views/ReadView';
import { SearchView } from './views/SearchView';
import { ShowDetailView } from './views/ShowDetailView';
import { WatchView } from './views/WatchView';

function CueShell() {
  const { route, toast, dismissToast } = useCueStore();

  const activeDomain: 'watch' | 'read' | 'play' | 'neutral' =
    route.view === 'watch' ||
    route.view === 'show-detail' ||
    route.view === 'movie-detail' ||
    route.view === 'library-watch'
      ? 'watch'
      : route.view === 'read' || route.view === 'read-detail' || route.view === 'library-read'
        ? 'read'
        : route.view === 'play' || route.view === 'game-detail' || route.view === 'library-play'
          ? 'play'
          : 'neutral';

  const renderView = () => {
    switch (route.view) {
      case 'watch':
        return <WatchView calendarMode={route.calendarMode} />;
      case 'read':
        return <ReadView calendarMode={route.calendarMode} />;
      case 'play':
        return <PlayView calendarMode={route.calendarMode} />;
      case 'journal':
        return <JournalView />;
      case 'search':
        return <SearchView />;
      case 'show-detail':
        return <ShowDetailView showId={route.showId} />;
      case 'movie-detail':
        return <MovieDetailView movieId={route.movieId} />;
      case 'read-detail':
        return <ReadDetailView readId={route.readId} />;
      case 'game-detail':
        return <GameDetailView gameId={route.gameId} />;
      case 'library-watch':
        return <LibraryGridView mode="watch" />;
      case 'library-read':
        return <LibraryGridView mode="read" />;
      case 'library-play':
        return <LibraryGridView mode="play" />;
      case 'list-detail':
        return <LibraryGridView mode="list" listId={route.listId} />;
    }
  };

  return (
    <div data-domain={activeDomain} className="min-h-dvh bg-background text-ink relative">
      <NavChrome />
      <main>{renderView()}</main>

      {toast && (
        <div className="fixed bottom-24 md:bottom-7 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-sheet-up">
          <div className="glass-banner rounded-full px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink truncate">{toast.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    dismissToast();
                  }}
                  className="px-3 py-1 rounded-full bg-brand text-brand-ink text-xs font-semibold hover:opacity-90"
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={dismissToast}
                aria-label="Close toast"
                className="p-1 text-ink-dim hover:text-ink"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <NotificationsSheet />
      <SettingsModal />
      <MediaInsightsModal />
    </div>
  );
}

export default function App() {
  return (
    <CueProvider>
      <CueShell />
    </CueProvider>
  );
}
