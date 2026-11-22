import { useMemo, useState } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, ListFilter, Plus, Trophy } from 'lucide-react';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { useCueStore } from '../store/useCueStore';
import type { GameItem, PlayFilter } from '../types';

export function PlayView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    toggleCalendarMode,
    setFilterSheetOpen,
    updateSettings,
    logGameSession,
  } = useCueStore();

  const [justLogged, setJustLogged] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);

  const filter = state.settings.playFilter;

  const handleQuickHour = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    setJustLogged((p) => ({ ...p, [gameId]: true }));
    logGameSession(gameId, 1);
    setTimeout(() => {
      setJustLogged((p) => {
        const copy = { ...p };
        delete copy[gameId];
        return copy;
      });
    }, 320);
  };

  const { playingList, backlogList, completedList } = useMemo(() => {
    const sortMode = state.settings.sortBy;
    const all = state.gameOrder
      .map((id) => state.games[id])
      .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked))
      .filter((g) => {
        if (filter === 'all') return true;
        return state.gameProgress[g.id]?.status === filter;
      });

    const sortGames = (list: GameItem[]) =>
      [...list].sort((a, b) => {
        if (sortMode === 'alpha') return a.title.localeCompare(b.title);
        if (sortMode === 'rating') {
          return (
            (state.gameProgress[b.id]?.rating || b.rating) -
            (state.gameProgress[a.id]?.rating || a.rating)
          );
        }
        if (sortMode === 'progress') {
          return (
            (state.gameProgress[b.id]?.completionPct || 0) -
            (state.gameProgress[a.id]?.completionPct || 0)
          );
        }
        const ta = state.gameProgress[a.id]?.lastPlayedAt || '';
        const tb = state.gameProgress[b.id]?.lastPlayedAt || '';
        return tb.localeCompare(ta);
      });

    return {
      playingList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'playing')),
      backlogList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'backlog')),
      completedList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'completed')),
    };
  }, [state.gameOrder, state.games, state.gameProgress, state.settings.sortBy, filter]);

  const upcomingGames = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'play'),
    [state.upcoming]
  );

  const isPosterLayout = state.settings.playLayout === 'posters';

  const renderGameCard = (game: GameItem) => {
    const prog = state.gameProgress[game.id];
    const isCompleted = prog?.status === 'completed';
    const flash = Boolean(justLogged[game.id]);

    if (isPosterLayout) {
      return (
        <div
          key={game.id}
          role="button"
          tabIndex={0}
          onClick={() => pushRoute({ view: 'game-detail', gameId: game.id })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') pushRoute({ view: 'game-detail', gameId: game.id });
          }}
          className="group cursor-pointer text-left"
        >
          <div className="relative aspect-[2/3] rounded-[18px] overflow-hidden bg-surface border border-white/8">
            <MediaImage
              src={game.coverUrl}
              alt={game.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!isCompleted && (
              <button
                type="button"
                onClick={(e) => handleQuickHour(e, game.id)}
                aria-label={`Log 1h on ${game.title}`}
                className={`absolute top-2 right-2 h-8 px-2.5 rounded-full backdrop-blur-md flex items-center justify-center border text-xs font-bold transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/65 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                +1h
              </button>
            )}
            {state.settings.showPosterProgress && (prog?.completionPct || 0) > 0 && (
              <div className="absolute bottom-0 inset-x-0 h-1 bg-black/50">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${prog?.completionPct || 0}%` }}
                />
              </div>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-ink truncate">{game.title}</p>
          <p className="text-xs text-ink-dim tabular-nums">
            {prog?.hoursPlayed || 0}h · {prog?.platform || game.platforms[0]}
          </p>
        </div>
      );
    }

    return (
      <div
        key={game.id}
        role="button"
        tabIndex={0}
        onClick={() => pushRoute({ view: 'game-detail', gameId: game.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') pushRoute({ view: 'game-detail', gameId: game.id });
        }}
        className="group relative rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.04] overflow-hidden flex items-center cursor-pointer transition-colors"
      >
        <div className="w-[104px] sm:w-[114px] h-[94px] shrink-0 overflow-hidden bg-background relative">
          <MediaImage
            src={game.backdropUrl || game.coverUrl}
            alt={game.title}
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
          />
          {state.settings.showPosterProgress && (prog?.completionPct || 0) > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/45">
              <div
                className="h-full bg-watched transition-all duration-300"
                style={{ width: `${prog?.completionPct || 0}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 px-3.5 py-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold text-ink truncate leading-tight">
              {game.title}
            </h3>
            {prog?.platinum && <Trophy className="w-3.5 h-3.5 text-brand shrink-0" />}
          </div>
          <p className="text-[13.5px] text-ink-dim tabular-nums mt-0.5">
            {prog?.hoursPlayed || 0}h played · {prog?.completionPct || 0}%
          </p>
          <p className="text-[13px] text-ink-faint truncate mt-0.5">
            {prog?.platform || game.platforms[0]} · {game.developer}
          </p>
        </div>

        <div className="pr-3.5 shrink-0">
          {!isCompleted ? (
            <button
              type="button"
              onClick={(e) => handleQuickHour(e, game.id)}
              aria-label={`Log +1 hour on ${game.title}`}
              className={`h-[40px] min-w-[42px] px-2.5 rounded-full border flex items-center justify-center text-xs font-bold tabular-nums transition-all active:scale-90 ${
                flash
                  ? 'border-watched/70 bg-watched/15 text-watched animate-check-pop'
                  : 'border-white/12 bg-white/[0.02] text-ink-dim hover:border-watched/60 hover:text-watched'
              }`}
            >
              <Plus className="w-3 h-3 mr-0.5" />
              1h
            </button>
          ) : (
            <span className="text-sm font-bold text-watched tabular-nums px-1.5 flex items-center gap-1">
              {(prog?.playthroughCount || 1) > 1 ? (
                `x${prog?.playthroughCount}`
              ) : (
                <Check className="w-4 h-4" />
              )}
            </span>
          )}
        </div>
      </div>
    );
  };

  const filterTabs: { id: PlayFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'playing', label: 'Playing' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="min-h-dvh pb-28 md:pb-14 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      <div className="md:hidden flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter and sort games"
          className="glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ListFilter className="w-4 h-4" />
        </button>

        <h1 className="font-display font-bold text-[19px] text-ink tracking-tight">
          {calendarMode ? 'Game updates' : 'Play'}
        </h1>

        <button
          type="button"
          onClick={toggleCalendarMode}
          aria-label="Toggle game releases calendar"
          className={`glass-btn h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
            calendarMode ? 'text-brand border-brand/50 bg-brand/15' : 'text-ink'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {!calendarMode && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto no-scrollbar">
          {filterTabs.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => updateSettings({ playFilter: t.id })}
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
          <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
            Upcoming patches & releases
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingGames.map((u) => (
              <div
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={() => pushRoute({ view: 'game-detail', gameId: u.mediaId })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') pushRoute({ view: 'game-detail', gameId: u.mediaId });
                }}
                className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.04] overflow-hidden flex items-center cursor-pointer transition-colors"
              >
                <div className="w-[104px] h-[94px] shrink-0 overflow-hidden bg-background">
                  <MediaImage src={u.artworkUrl} alt={u.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 px-3.5 py-2">
                  <h3 className="text-[15.5px] font-semibold text-ink truncate">{u.title}</h3>
                  <p className="text-[13px] text-ink-dim mt-0.5">{u.subtitle}</p>
                </div>
                <div className="pr-4 text-center">
                  <span className="text-[19px] font-display font-bold text-ink tabular-nums block leading-none">
                    {u.daysUntil}
                  </span>
                  <span className="text-[11px] text-ink-dim">days</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in">
          {playingList.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Playing now</h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {playingList.map(renderGameCard)}
              </div>
            </section>
          )}

          {backlogList.length > 0 && (
            <section className="mb-8">
              <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Backlog</h2>
              <div
                className={
                  isPosterLayout
                    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                    : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                }
              >
                {backlogList.map(renderGameCard)}
              </div>
            </section>
          )}

          {completedList.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
              >
                <span>Completed ({completedList.length})</span>
                {showCompleted ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              {showCompleted && (
                <div
                  className={
                    isPosterLayout
                      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3.5'
                      : 'grid grid-cols-1 md:grid-cols-2 gap-3'
                  }
                >
                  {completedList.map(renderGameCard)}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <FilterSortSheet domain="play" />
    </div>
  );
}
