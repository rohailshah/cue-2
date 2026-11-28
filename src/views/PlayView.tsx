import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Gamepad2,
  MoreHorizontal,
  Plus,
  Search,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { BulkActionBar } from '../components/BulkActionBar';
import { FilterSortSheet } from '../components/FilterSortSheet';
import { MediaImage } from '../components/MediaImage';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { GameChapterUnit, GameItem, GameWatchStatus, PlayFilter } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import { formatGameMeta, pad2 } from '../utils/stats';

function formatGameUnitShort(chapter: number, unit: GameChapterUnit = 'chapters'): string {
  if (unit === 'acts') return `Act ${chapter}`;
  if (unit === 'missions') return `Mission ${chapter}`;
  if (unit === 'milestones') return `Milestone ${chapter}`;
  return `Ch. ${pad2(chapter)}`;
}

export function PlayView({ calendarMode = false }: { calendarMode?: boolean }) {
  const {
    state,
    pushRoute,
    switchTab,
    toggleCalendarMode,
    setFilterSheetOpen,
    setImportModalOpen,
    updateSettings,
    updateGameProgress,
    advanceGameChapter,
    logGameSession,
    bulkUpdateItems,
  } = useCueStore();

  const [justLogged, setJustLogged] = useState<Record<string, boolean>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [showDropped, setShowDropped] = useState(false);
  const [statusSheetGameId, setStatusSheetGameId] = useState<string | null>(null);
  const [playShelfFilter, setPlayShelfFilter] = useState<'all' | 'owned' | 'wishlist'>('all');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<
    Record<string, { kind: 'game'; id: string }>
  >({});
  const timersRef = useRef<number[]>([]);

  useModalBackHandler(selectMode, () => {
    setSelectMode(false);
    setSelectedMap({});
  });

  const toggleBulkItem = (id: string) => {
    setSelectedMap((prev) => {
      if (prev[id]) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: { kind: 'game', id } };
    });
  };

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const filter = state.settings.playFilter;

  const playShelfCounts = useMemo(() => {
    let owned = 0;
    let wishlist = 0;
    for (const id of state.gameOrder) {
      const g = state.games[id];
      const prog = state.gameProgress[id];
      if (!g || !prog?.bookmarked) continue;
      if (filter !== 'all' && prog.status !== filter) continue;
      const b = getMediaCollectionBadge('game', g, prog);
      if (b.hasAnyOwned) owned += 1;
      if (b.hasAnyWishlist) wishlist += 1;
    }
    return { owned, wishlist };
  }, [state.gameOrder, state.games, state.gameProgress, filter]);

  const handleQuickAdvance = (e: React.MouseEvent, game: GameItem) => {
    e.stopPropagation();
    if (justLogged[game.id]) return;
    setJustLogged((p) => ({ ...p, [game.id]: true }));
    const hasChapters = Boolean(game.totalChapters && game.totalChapters > 0);
    const tCommit = window.setTimeout(() => {
      if (hasChapters) advanceGameChapter(game.id, 1);
      else logGameSession(game.id, 1);
    }, 250);
    const tClear = window.setTimeout(() => {
      setJustLogged((p) => {
        const copy = { ...p };
        delete copy[game.id];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const playHistory = useMemo(
    () => (state.history || []).filter((h) => h.domain === 'play'),
    [state.history]
  );

  const { playingList, backlogList, completedList, droppedList } = useMemo(() => {
    const sortMode = state.settings.sortBy;
    const all = state.gameOrder
      .map((id) => state.games[id])
      .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked))
      .filter((g) => {
        if (filter !== 'all' && state.gameProgress[g.id]?.status !== filter) return false;
        if (playShelfFilter === 'all') return true;
        const b = getMediaCollectionBadge('game', g, state.gameProgress[g.id]);
        return playShelfFilter === 'owned' ? b.hasAnyOwned : b.hasAnyWishlist;
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
      droppedList: sortGames(all.filter((g) => state.gameProgress[g.id]?.status === 'dropped')),
    };
  }, [state.gameOrder, state.games, state.gameProgress, state.settings.sortBy, filter, playShelfFilter]);

  const upcomingGames = useMemo(
    () => state.upcoming.filter((u) => u.domain === 'play'),
    [state.upcoming]
  );

  const isPosterLayout = state.settings.playLayout === 'posters';

  const renderGameCard = (game: GameItem) => {
    const prog = state.gameProgress[game.id];
    const isCompleted = prog?.status === 'completed';
    const flash = Boolean(justLogged[game.id]);
    const totalChapters = game.totalChapters || 0;
    const hasChapters = totalChapters > 0;
    const unit = game.chapterUnit || 'chapters';
    const currentChap = prog?.currentChapter || 0;
    const nextChap = hasChapters ? Math.min(totalChapters, currentChap + 1) : 1;
    const unitCode = formatGameUnitShort(nextChap, unit);
    const gameCol = getMediaCollectionBadge('game', game, prog);

    if (isPosterLayout) {
      const isSel = Boolean(selectedMap[game.id]);
      return (
        <div
          key={game.id}
          role="button"
          tabIndex={0}
          onClick={() =>
            selectMode ? toggleBulkItem(game.id) : pushRoute({ view: 'game-detail', gameId: game.id })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (selectMode) toggleBulkItem(game.id);
              else pushRoute({ view: 'game-detail', gameId: game.id });
            }
          }}
          className="group cursor-pointer text-left"
        >
          <div
            className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
              selectMode && isSel ? 'border-play ring-2 ring-play' : 'border-white/8'
            }`}
          >
            <MediaImage
              src={game.coverUrl}
              alt={game.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            {!selectMode && gameCol.shortTag && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-play/40 text-[9.5px] font-semibold text-play leading-none">
                {gameCol.shortTag}
              </span>
            )}
            {selectMode ? (
              <span
                className={`absolute top-2 right-2 h-7 w-7 rounded-full border flex items-center justify-center ${
                  isSel
                    ? 'bg-play border-play text-[#161124]'
                    : 'bg-black/65 border-white/30 text-transparent'
                }`}
              >
                <Check className="w-4 h-4" strokeWidth={2.8} />
              </span>
            ) : !isCompleted && (
              <button
                type="button"
                onClick={(e) => handleQuickAdvance(e, game)}
                aria-label={
                  hasChapters ? `Advance ${game.title} to ${unitCode}` : `Log 1h on ${game.title}`
                }
                className={`absolute top-2 right-2 h-8 px-2.5 rounded-full backdrop-blur-md flex items-center justify-center border text-xs font-bold transition-all ${
                  flash
                    ? 'bg-watched/25 border-watched text-watched animate-check-pop'
                    : 'bg-black/65 border-white/20 text-white hover:border-watched hover:text-watched'
                }`}
              >
                {hasChapters ? '+1' : '+1h'}
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
          <p className="text-xs text-ink-dim truncate tabular-nums">
            {hasChapters
              ? `${unitCode} · ${currentChap}/${totalChapters} ${unit}`
              : formatGameMeta(game, prog, { includeDeveloper: false })}
          </p>
        </div>
      );
    }

    return (
      <BingersMediaRow
        key={game.id}
        title={game.title}
        badgeLabel={prog?.platinum ? 'Platinum' : undefined}
        badgeClassName="bg-play/15 text-play"
        posterUrl={game.coverUrl}
        primaryLine={
          hasChapters
            ? isCompleted
              ? (prog?.hoursPlayed || 0) > 0
                ? `${totalChapters}/${totalChapters} ${unit} · ${prog?.hoursPlayed}h`
                : `${totalChapters}/${totalChapters} ${unit}`
              : `${unitCode} · ${currentChap}/${totalChapters} ${unit}`
            : (prog?.hoursPlayed || 0) > 0
              ? `${prog?.hoursPlayed}h played · ${prog?.completionPct || 0}%`
              : (prog?.completionPct || 0) > 0
                ? `${prog?.completionPct}% complete`
                : 'Backlog · Not started'
        }
        secondaryLine={[
          formatGameMeta(game, prog, { includeHours: hasChapters }),
          gameCol.badgeText,
        ]
          .filter(Boolean)
          .join(' · ')}
        progressRatio={
          hasChapters ? Math.min(1, currentChap / totalChapters) : (prog?.completionPct || 0) / 100
        }
        showProgress={
          state.settings.showPosterProgress &&
          (hasChapters ? currentChap > 0 : (prog?.completionPct || 0) > 0)
        }
        isFlashing={flash}
        flashLabel={hasChapters ? unitCode : 'Logged +1h'}
        secondaryAction={
          <button
            type="button"
            onClick={() => setStatusSheetGameId(game.id)}
            aria-label={`Change status for ${game.title}`}
            className="h-[34px] w-[34px] rounded-full border border-white/10 bg-white/[0.02] flex items-center justify-center text-ink-faint hover:text-ink hover:border-white/25 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        }
        actionContent={
          selectMode ? (
            <Check
              className={`w-[17px] h-[17px] ${selectedMap[game.id] ? 'text-play' : 'text-ink-faint'}`}
              strokeWidth={2.6}
            />
          ) : isCompleted ? (
            (prog?.playthroughCount || 1) > 1 ? (
              `x${prog?.playthroughCount}`
            ) : (
              <span className="inline-flex items-center gap-1">
                {prog?.platinum && <Trophy className="w-3.5 h-3.5 text-brand" />}
                <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />
              </span>
            )
          ) : hasChapters ? (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1
            </span>
          ) : (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1h
            </span>
          )
        }
        actionAriaLabel={
          selectMode
            ? `Select ${game.title}`
            : hasChapters
              ? `Advance ${game.title} to ${unitCode}`
              : `Log +1 hour on ${game.title}`
        }
        actionDisabled={!selectMode && isCompleted}
        actionActive={selectMode ? Boolean(selectedMap[game.id]) : isCompleted}
        onAction={
          selectMode
            ? (e) => {
                e.stopPropagation();
                toggleBulkItem(game.id);
              }
            : !isCompleted
              ? (e) => handleQuickAdvance(e, game)
              : undefined
        }
        onOpen={() =>
          selectMode ? toggleBulkItem(game.id) : pushRoute({ view: 'game-detail', gameId: game.id })
        }
      />
    );
  };

  const filterTabs: { id: PlayFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'playing', label: 'Playing' },
    { id: 'backlog', label: 'Backlog' },
    { id: 'completed', label: 'Completed' },
    { id: 'dropped', label: 'Dropped' },
  ];

  const statusSheetGame = statusSheetGameId ? state.games[statusSheetGameId] : undefined;
  const statusSheetCurrent = statusSheetGameId
    ? state.gameProgress[statusSheetGameId]?.status || 'backlog'
    : 'backlog';

  const listClass = isPosterLayout
    ? 'grid grid-cols-3 sm:grid-cols-4 gap-3.5 items-start'
    : 'space-y-3';

  return (
    <>
      <ScrollUpHistoryFeed
        historyItems={calendarMode ? [] : playHistory}
        onOpenHistoryItem={(entry) => pushRoute({ view: 'game-detail', gameId: entry.mediaId })}
        resetAnchorKey={calendarMode ? 'calendar' : 'feed'}
        stickyHeader={
          <MobileDomainBar
            title="Game updates"
            domainLabel="Play"
            calendarMode={calendarMode}
            onOpenFilter={() => setFilterSheetOpen(true)}
            onToggleCalendar={toggleCalendarMode}
            filterAriaLabel="Filter and sort games"
            calendarAriaLabel="Toggle game releases calendar"
          />
        }
      >
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

            {(playShelfCounts.owned > 0 || playShelfCounts.wishlist > 0) && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: 'All games' },
                    ...(playShelfCounts.owned > 0
                      ? [{ id: 'owned' as const, label: `Owned (${playShelfCounts.owned})` }]
                      : []),
                    ...(playShelfCounts.wishlist > 0
                      ? [{ id: 'wishlist' as const, label: `Wishlist (${playShelfCounts.wishlist})` }]
                      : []),
                  ] as Array<{ id: 'all' | 'owned' | 'wishlist'; label: string }>
                ).map((sub) => {
                  const active = playShelfFilter === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setPlayShelfFilter(sub.id)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                        active
                          ? 'border-play/60 bg-play/15 text-play'
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
          <div className="animate-fade-in">
            <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
              Upcoming patches & releases
            </h2>
            <div className="space-y-3">
              {upcomingGames.length === 0 ? (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center">
                  <Gamepad2 className="w-7 h-7 text-play mx-auto mb-2.5 opacity-80" />
                  <p className="font-display font-bold text-lg text-ink">
                    No upcoming game releases yet
                  </p>
                  <p className="text-xs text-ink-dim mt-1">
                    Add games from Search to track story chapters, hours, and updates.
                  </p>
                </div>
              ) : (
                upcomingGames.map((u) => {
                  const game = state.games[u.mediaId];
                  return (
                    <BingersMediaRow
                      key={u.id}
                      title={u.title}
                      posterUrl={game?.coverUrl || u.artworkUrl}
                      primaryLine={u.subtitle}
                      actionDisabled
                      actionContent={
                        <span className="flex flex-col items-center px-1">
                          <span className="text-[17px] font-display font-bold text-ink tabular-nums leading-none">
                            {u.daysUntil}
                          </span>
                          <span className="text-[10px] text-ink-dim mt-0.5">days</span>
                        </span>
                      }
                      onOpen={() => pushRoute({ view: 'game-detail', gameId: u.mediaId })}
                    />
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {playingList.length === 0 &&
              backlogList.length === 0 &&
              completedList.length === 0 &&
              droppedList.length === 0 && (
                <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-4">
                  <Gamepad2 className="w-8 h-8 text-play mx-auto mb-3 opacity-85" />
                  <h2 className="font-display font-bold text-[20px] text-ink">
                    Nothing in Play yet
                  </h2>
                  <p className="text-sm text-ink-dim mt-1 max-w-sm mx-auto">
                    Search for any game to track story chapters, playtime, and completion.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => switchTab('search')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
                    >
                      <Search className="w-4 h-4" />
                      <span>Search Games</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-raised border border-white/10 text-ink text-sm font-semibold hover:bg-white/10 transition-colors"
                    >
                      <Upload className="w-4 h-4 text-play" />
                      <span>Import IMDb / CSV</span>
                    </button>
                  </div>
                </div>
              )}

            {playingList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Playing now</h2>
                <div className={listClass}>{playingList.map(renderGameCard)}</div>
              </section>
            )}

            {backlogList.length > 0 && (
              <section className="mb-8">
                <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">
                  Collecting dust
                </h2>
                <div className={listClass}>{backlogList.map(renderGameCard)}</div>
              </section>
            )}

            {completedList.length > 0 && (
              <section className="mb-8">
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
                >
                  <span>Completed ({completedList.length})</span>
                  {showCompleted || filter === 'completed' ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {(showCompleted || filter === 'completed') && (
                  <div className={listClass}>{completedList.map(renderGameCard)}</div>
                )}
              </section>
            )}

            {droppedList.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowDropped((v) => !v)}
                  className="flex items-center gap-2 font-display font-bold text-[19px] text-ink-dim hover:text-ink mb-3.5 transition-colors"
                >
                  <span>Dropped ({droppedList.length})</span>
                  {showDropped || filter === 'dropped' ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                {(showDropped || filter === 'dropped') && (
                  <div className={listClass}>{droppedList.map(renderGameCard)}</div>
                )}
              </section>
            )}
          </div>
        )}
      </ScrollUpHistoryFeed>

      <FilterSortSheet domain="play" />

      {statusSheetGame && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
          onClick={() => setStatusSheetGameId(null)}
        >
          <div
            className="w-full md:max-w-sm bg-surface border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 pb-8 md:pb-5 shadow-2xl animate-sheet-up space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-play">
                  Game status
                </p>
                <h3 className="font-display font-bold text-base text-ink truncate">
                  {statusSheetGame.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatusSheetGameId(null)}
                aria-label="Close status menu"
                className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {(
                [
                  { id: 'playing', label: 'Playing', hint: 'Currently in active rotation' },
                  { id: 'backlog', label: 'Backlog', hint: 'Saved for later' },
                  { id: 'completed', label: 'Completed', hint: 'Finished main story' },
                  { id: 'dropped', label: 'Dropped', hint: 'Shelved for now' },
                ] as Array<{ id: GameWatchStatus; label: string; hint: string }>
              ).map((opt) => {
                const active = statusSheetCurrent === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      updateGameProgress(statusSheetGame.id, { status: opt.id });
                      setStatusSheetGameId(null);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                      active
                        ? 'bg-play/16 border-play/50 text-ink'
                        : 'bg-background border-white/[0.06] text-ink-dim hover:text-ink hover:bg-surface-raised'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[11px] text-ink-faint">{opt.hint}</p>
                    </div>
                    {active && <Check className="w-4 h-4 text-play shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {selectMode && !calendarMode && (
        <BulkActionBar
          selectedCount={Object.keys(selectedMap).length}
          totalCount={
            playingList.length + backlogList.length + completedList.length + droppedList.length
          }
          lists={state.lists}
          onSelectAll={() => {
            const all: Record<string, { kind: 'game'; id: string }> = {};
            for (const g of [...playingList, ...backlogList, ...completedList, ...droppedList]) {
              all[g.id] = { kind: 'game', id: g.id };
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
