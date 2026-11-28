import { CatchUpPromptSheet } from './components/CatchUpPromptSheet';
import { MediaInsightsModal } from './components/MediaInsightsModal';
import { NavChrome } from './components/NavChrome';
import { NotificationsSheet } from './components/NotificationsSheet';
import { SettingsModal } from './components/SettingsModal';
import { SmartImportModal } from './components/SmartImportModal';
import { ToastBanner } from './components/ToastBanner';
import { CueProvider, useCueStore } from './store/useCueStore';
import { GameDetailView } from './views/GameDetailView';
import { JournalView } from './views/JournalView';
import { LibraryGridView } from './views/LibraryGridView';
import { MovieDetailView } from './views/MovieDetailView';
import { PlayView } from './views/PlayView';
import { QueueView } from './views/QueueView';
import { ReadDetailView } from './views/ReadDetailView';
import { ReadEditionsView } from './views/ReadEditionsView';
import { ReadView } from './views/ReadView';
import { SearchView } from './views/SearchView';
import { ShowDetailView } from './views/ShowDetailView';
import { AnimeDetailView } from './views/AnimeDetailView';
import { WatchView } from './views/WatchView';

function CueShell() {
  const { route, toast, dismissToast, catchUpPrompt } = useCueStore();

  const activeDomain: 'watch' | 'read' | 'play' | 'neutral' =
    route.view === 'watch' ||
    route.view === 'show-detail' ||
    route.view === 'movie-detail' ||
    route.view === 'library-watch'
      ? 'watch'
      : route.view === 'read' ||
          route.view === 'read-detail' ||
          route.view === 'read-editions' ||
          route.view === 'library-read'
        ? 'read'
        : route.view === 'play' || route.view === 'game-detail' || route.view === 'library-play'
          ? 'play'
          : 'neutral';

  const renderView = () => {
    switch (route.view) {
      case 'queue':
        return <QueueView />;
      case 'watch':
        return <WatchView calendarMode={route.calendarMode} />;
      case 'read':
        return <ReadView calendarMode={route.calendarMode} />;
      case 'play':
        return <PlayView calendarMode={route.calendarMode} />;
      case 'journal':
        return <JournalView />;
      case 'search':
        return <SearchView subView={route.subView} />;
      case 'show-detail':
        return <ShowDetailView showId={route.showId} />;
      case 'anime-detail':
        return <AnimeDetailView animeId={route.animeId} />;
      case 'movie-detail':
        return <MovieDetailView movieId={route.movieId} />;
      case 'read-detail':
        return <ReadDetailView readId={route.readId} />;
      case 'read-editions':
        return <ReadEditionsView readId={route.readId} />;
      case 'game-detail':
        return <GameDetailView gameId={route.gameId} />;
      case 'library-all':
        return <LibraryGridView mode="all" />;
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
        <ToastBanner
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          lifted={Boolean(catchUpPrompt)}
        />
      )}

      <CatchUpPromptSheet />
      <NotificationsSheet />
      <SettingsModal />
      <SmartImportModal />
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
