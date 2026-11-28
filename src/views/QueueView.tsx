import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Layers,
  Pin,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { BingersMediaRow } from '../components/BingersMediaRow';
import { CueMindCard } from '../components/CueMindCard';
import { MobileDomainBar, ScrollUpHistoryFeed } from '../components/ScrollUpHistoryFeed';
import { useCueStore } from '../store/useCueStore';
import type { GameChapterUnit, HistoryEntry, MediaDomain } from '../types';
import {
  evaluateCustomListProgress,
  evaluateMovieCollectionProgress,
  findMovieCollection,
} from '../utils/containers';
import { computeTasteProfile } from '../utils/cueMind';
import { getComicEditionLabel, resolveComicEditionCover } from '../utils/editions';
import { formatGameMeta, getReadStats, getShowStats, isMovieReleased, pad2 } from '../utils/stats';

let sessionInitialMindSide: 'continue' | 'discover' = 'continue';

export function requestQueueCueMindSide(side: 'continue' | 'discover') {
  sessionInitialMindSide = side;
}

interface UnifiedQueueRow {
  rowKey: string;
  domain: MediaDomain;
  sortTs: string;
  active: boolean;
  title: string;
  badgeLabel: string;
  badgeClassName: string;
  posterUrl: string;
  posterTag?: string;
  primaryLine: string;
  secondaryLine?: string;
  progressRatio: number;
  actionContent: React.ReactNode;
  actionAriaLabel: string;
  flashLabel: string;
  onAction: () => void;
  onOpen: () => void;
}

function formatGameUnitShort(chapter: number, unit: GameChapterUnit = 'chapters'): string {
  if (unit === 'acts') return `Act ${chapter}`;
  if (unit === 'missions') return `Mission ${chapter}`;
  if (unit === 'milestones') return `Milestone ${chapter}`;
  return `Ch. ${pad2(chapter)}`;
}

export function QueueView() {
  const {
    state,
    pushRoute,
    switchTab,
    setImportModalOpen,
    watchNextEpisode,
    toggleMovieWatched,
    advanceReadProgress,
    advanceGameChapter,
    logGameSession,
  } = useCueStore();

  const [domainFilter, setDomainFilter] = useState<'all' | MediaDomain>('all');
  const [mindSide, setMindSide] = useState<'continue' | 'discover'>(() => sessionInitialMindSide);
  const [justLogged, setJustLogged] = useState<Record<string, boolean>>({});
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    setMindSide(sessionInitialMindSide);
  }, []);

  const tasteProfile = useMemo(() => computeTasteProfile(state), [state]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    };
  }, []);

  const triggerFlash = (key: string, commit: () => void) => {
    if (justLogged[key]) return;
    setJustLogged((p) => ({ ...p, [key]: true }));
    const tCommit = window.setTimeout(commit, 250);
    const tClear = window.setTimeout(() => {
      setJustLogged((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    }, 640);
    timersRef.current.push(tCommit, tClear);
  };

  const allHistory = useMemo(() => state.history || [], [state.history]);

  const openHistoryEntry = (entry: HistoryEntry) => {
    if (entry.mediaKind === 'show') pushRoute({ view: 'show-detail', showId: entry.mediaId });
    else if (entry.mediaKind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.mediaId });
    else if (entry.mediaKind === 'read') pushRoute({ view: 'read-detail', readId: entry.mediaId });
    else pushRoute({ view: 'game-detail', gameId: entry.mediaId });
  };

  const { activeRows, dustRows } = useMemo(() => {
    const active: UnifiedQueueRow[] = [];
    const dust: UnifiedQueueRow[] = [];

    if (domainFilter === 'all' || domainFilter === 'watch') {
      for (const id of state.showOrder) {
        const show = state.shows[id];
        const prog = state.showProgress[id];
        if (!show || !prog?.bookmarked) continue;
        const st = getShowStats(show, prog);
        if (st.isFinished || st.isCaughtUp || !st.nextEpisode) continue;
        const next = st.nextEpisode;
        const denom = st.unreleasedEpisodes > 0 ? st.airedEpisodes : st.totalEpisodes;
        const row: UnifiedQueueRow = {
          rowKey: `show-${show.id}`,
          domain: 'watch',
          sortTs: prog.lastWatchedAt || '',
          active: st.watchedUnique > 0,
          title: show.title,
          badgeLabel: 'Show',
          badgeClassName: 'bg-watch/15 text-watch',
          posterUrl: show.posterUrl,
          posterTag: next.number === 1 ? 'PREMIERE' : undefined,
          primaryLine: `${formatEpisodeCodeString(next.season, next.number)} · ${st.nextOrdinal}/${denom}`,
          secondaryLine: next.title,
          progressRatio: st.unreleasedEpisodes > 0 ? st.airedProgressRatio : st.progressRatio,
          actionContent: <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />,
          actionAriaLabel: `Watch ${show.title} next episode`,
          flashLabel: 'Watched',
          onAction: () => watchNextEpisode(show.id),
          onOpen: () => pushRoute({ view: 'show-detail', showId: show.id }),
        };
        if (st.watchedUnique > 0) active.push(row);
        else dust.push(row);
      }

      for (const id of state.movieOrder) {
        const movie = state.movies[id];
        const prog = state.movieProgress[id];
        if (!movie || !prog || (prog.watchCount || 0) > 0 || !isMovieReleased(movie)) continue;
        const col = findMovieCollection(movie.title, movie.year);
        const colEval = col ? evaluateMovieCollectionProgress(col, state) : null;
        const colIdx = colEval
          ? colEval.entries.findIndex((e) => e.movieId === movie.id) + 1
          : 0;
        const secondaryLine =
          colEval && colIdx > 0
            ? `${colEval.collection.name} · Part ${colIdx}/${colEval.totalCount}`
            : movie.director;

        active.push({
          rowKey: `movie-${movie.id}`,
          domain: 'watch',
          sortTs: '',
          active: true,
          title: movie.title,
          badgeLabel: 'Movie',
          badgeClassName: 'bg-watch/15 text-watch',
          posterUrl: movie.posterUrl,
          primaryLine: `${movie.year} · ${movie.runtime}m`,
          secondaryLine,
          progressRatio: colEval ? colEval.ratio : 0,
          actionContent: <Check className="w-[17px] h-[17px]" strokeWidth={2.4} />,
          actionAriaLabel: `Mark ${movie.title} watched`,
          flashLabel: 'Watched',
          onAction: () => toggleMovieWatched(movie.id),
          onOpen: () => pushRoute({ view: 'movie-detail', movieId: movie.id }),
        });
      }
    }

    if (domainFilter === 'all' || domainFilter === 'read') {
      for (const id of state.readOrder) {
        const item = state.readItems[id];
        const prog = state.readProgress[id];
        if (!item || !prog?.bookmarked) continue;
        const st = getReadStats(item, prog);
        if (st.isFinished || st.isCaughtUp || st.nextReleasedUnit === null) continue;
        const displayCover = resolveComicEditionCover(item, prog.edition, prog);
        const editionLabel =
          item.format === 'comic' ? getComicEditionLabel(prog.edition, item, prog) : '';
        const nextIssueLabel =
          item.format === 'comic' && item.issueDetails?.[st.nextUnit]?.issueLabel
            ? `Issue ${item.issueDetails[st.nextUnit].issueLabel}`
            : st.nextUnitShort;
        const secondaryMeta = [
          item.comicPublisher || item.creator,
          editionLabel || item.comicRunLabel || null,
        ]
          .filter(Boolean)
          .join(' · ');
        const formatBadge =
          item.format === 'manga' ? 'Manga' : item.format === 'comic' ? 'Comic' : 'Novel';
        const readDenom = st.unreleasedCount > 0 ? st.releasedTotal : st.total;
        const row: UnifiedQueueRow = {
          rowKey: `read-${item.id}`,
          domain: 'read',
          sortTs: prog.lastReadAt || '',
          active: st.current > 0,
          title: item.title,
          badgeLabel: formatBadge,
          badgeClassName: 'bg-read/15 text-read',
          posterUrl: displayCover,
          primaryLine: `${nextIssueLabel} · ${st.current}/${readDenom} ${st.unitLabel}`,
          secondaryLine: secondaryMeta,
          progressRatio: st.unreleasedCount > 0 ? st.releasedRatio : st.ratio,
          actionContent: (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1
            </span>
          ),
          actionAriaLabel: `Log next ${st.unitSingular} on ${item.title}`,
          flashLabel: st.nextUnitShort,
          onAction: () => advanceReadProgress(item.id, 1),
          onOpen: () => pushRoute({ view: 'read-detail', readId: item.id }),
        };
        if (st.current > 0) active.push(row);
        else dust.push(row);
      }
    }

    if (domainFilter === 'all' || domainFilter === 'play') {
      for (const id of state.gameOrder) {
        const game = state.games[id];
        const prog = state.gameProgress[id];
        if (!game || !prog?.bookmarked || prog.status === 'completed' || prog.status === 'dropped') continue;
        const totalChapters = game.totalChapters || 0;
        const hasChapters = totalChapters > 0;
        const unit = game.chapterUnit || 'chapters';
        const currentChap = prog.currentChapter || 0;
        const nextChap = hasChapters ? Math.min(totalChapters, currentChap + 1) : 1;
        const unitCode = formatGameUnitShort(nextChap, unit);

        const row: UnifiedQueueRow = {
          rowKey: `game-${game.id}`,
          domain: 'play',
          sortTs: prog.lastPlayedAt || '',
          active: prog.status === 'playing',
          title: game.title,
          badgeLabel: 'Game',
          badgeClassName: 'bg-play/15 text-play',
          posterUrl: game.coverUrl,
          primaryLine: hasChapters
            ? `${unitCode} · ${currentChap}/${totalChapters} ${unit}`
            : (prog.hoursPlayed || 0) > 0
              ? `${prog.hoursPlayed}h played · ${prog.completionPct || 0}%`
              : (prog.completionPct || 0) > 0
                ? `${prog.completionPct}% complete`
                : 'Queued · Not started',
          secondaryLine: formatGameMeta(game, prog, { includeHours: hasChapters }),
          progressRatio: hasChapters
            ? Math.min(1, currentChap / totalChapters)
            : (prog.completionPct || 0) / 100,
          actionContent: hasChapters ? (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />1
            </span>
          ) : (
            <span className="inline-flex items-center text-xs font-bold tabular-nums px-0.5">
              <Plus className="w-3 h-3 mr-0.5" />
              1h
            </span>
          ),
          actionAriaLabel: hasChapters
            ? `Log ${unitCode} on ${game.title}`
            : `Log 1h on ${game.title}`,
          flashLabel: hasChapters ? unitCode : 'Logged +1h',
          onAction: () =>
            hasChapters ? advanceGameChapter(game.id, 1) : logGameSession(game.id, 1),
          onOpen: () => pushRoute({ view: 'game-detail', gameId: game.id }),
        };

        if (prog.status === 'playing') active.push(row);
        else dust.push(row);
      }
    }

    active.sort((a, b) => {
      if (a.sortTs && b.sortTs) return b.sortTs.localeCompare(a.sortTs);
      if (a.sortTs) return -1;
      if (b.sortTs) return 1;
      return a.title.localeCompare(b.title);
    });

    return { activeRows: active, dustRows: dust };
  }, [
    state,
    domainFilter,
    watchNextEpisode,
    toggleMovieWatched,
    advanceReadProgress,
    advanceGameChapter,
    logGameSession,
    pushRoute,
  ]);

  const queueRuns = useMemo(() => {
    const pinned = state.lists.filter((l) => l.pinnedToQueue && l.items.length > 0);
    const chosen =
      pinned.length > 0 ? pinned : state.lists.filter((l) => l.items.length > 0).slice(0, 3);
    return chosen.map((list) => evaluateCustomListProgress(list, state));
  }, [state]);

  const filterTabs: { id: 'all' | MediaDomain; label: string }[] = [
    { id: 'all', label: 'All media' },
    { id: 'watch', label: 'Watch' },
    { id: 'read', label: 'Read' },
    { id: 'play', label: 'Play' },
  ];

  const isEmpty = activeRows.length === 0 && dustRows.length === 0 && queueRuns.length === 0;

  return (
    <ScrollUpHistoryFeed
      historyItems={allHistory}
      onOpenHistoryItem={openHistoryEntry}
      resetAnchorKey="queue"
      stickyHeader={
        <MobileDomainBar
          title="Active Rotation"
          rightSlot={
            <button
              type="button"
              onClick={() => switchTab('search')}
              aria-label="Add title"
              className="h-9 px-3 rounded-full bg-surface border border-white/10 text-xs font-semibold text-ink inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-brand" />
              <span>Add</span>
            </button>
          }
        />
      }
    >
      {/* Cross-media filter pills */}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {filterTabs.map((t) => {
            const active = domainFilter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setDomainFilter(t.id)}
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
      </div>

      {/* Cue Mind: Hidden on first boot (<5 entries); unlocks automatically at 5+ entries */}
      {tasteProfile.isUnlocked && (
        <CueMindCard
          initialSide={mindSide}
          onSideChange={(s) => {
            sessionInitialMindSide = s;
            setMindSide(s);
          }}
        />
      )}

      {isEmpty && (
        <div className="rounded-[22px] bg-surface border border-white/[0.06] p-8 text-center my-4">
          <Layers className="w-8 h-8 text-brand mx-auto mb-3 opacity-85" />
          <h2 className="font-display font-bold text-[20px] text-ink">
            Your active rotation is clear
          </h2>
          <p className="text-sm text-ink-dim mt-1 max-w-md mx-auto">
            Line up episodes, comic issues, manga chapters, novels, movies, and game chapters in one
            calm cue.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => switchTab('search')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
            >
              <Search className="w-4 h-4" />
              <span>Search all media</span>
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

      {activeRows.length > 0 && (
        <section className="mb-8 animate-fade-in">
          <h2 className="font-display font-bold text-[22px] text-ink mb-3.5">Up next</h2>
          <div className="space-y-3">
            {activeRows.map((row) => (
              <BingersMediaRow
                key={row.rowKey}
                title={row.title}
                badgeLabel={row.badgeLabel}
                badgeClassName={row.badgeClassName}
                posterUrl={row.posterUrl}
                posterTag={row.posterTag}
                primaryLine={row.primaryLine}
                secondaryLine={row.secondaryLine}
                progressRatio={row.progressRatio}
                showProgress={state.settings.showPosterProgress && row.progressRatio > 0}
                isFlashing={Boolean(justLogged[row.rowKey])}
                flashLabel={row.flashLabel}
                actionContent={row.actionContent}
                actionAriaLabel={row.actionAriaLabel}
                onAction={() => triggerFlash(row.rowKey, row.onAction)}
                onOpen={row.onOpen}
              />
            ))}
          </div>
        </section>
      )}

      {queueRuns.length > 0 && domainFilter === 'all' && (
        <section className="mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-[20px] text-ink flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span>Cross-media runs</span>
            </h2>
            <button
              type="button"
              onClick={() => switchTab('journal')}
              className="text-xs font-medium text-ink-dim hover:text-ink"
            >
              Manage in Journal →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {queueRuns.map((run) => {
              const pct = Math.round(run.averageRatio * 100);
              return (
                <button
                  key={run.list.id}
                  type="button"
                  onClick={() => pushRoute({ view: 'list-detail', listId: run.list.id })}
                  className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.06] p-4 text-left transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {run.list.pinnedToQueue && <Pin className="w-3.5 h-3.5 text-brand shrink-0" />}
                      <p className="font-semibold text-[15px] text-ink truncate">{run.list.name}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-dim shrink-0" />
                  </div>
                  <p className="text-xs text-ink-dim mt-1 tabular-nums">
                    {run.completedItems}/{run.totalItems} complete ({pct}%)
                    {run.nextItem ? ` · Next: ${run.nextItem.title} (${run.nextItem.unitHint})` : ''}
                  </p>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-2.5">
                    <div
                      className="h-full bg-brand transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {dustRows.length > 0 && (
        <section className="animate-fade-in">
          <h2 className="font-display font-bold text-[20px] text-ink mb-3.5">Collecting dust</h2>
          <div className="space-y-3">
            {dustRows.map((row) => (
              <BingersMediaRow
                key={row.rowKey}
                title={row.title}
                badgeLabel={row.badgeLabel}
                badgeClassName={row.badgeClassName}
                posterUrl={row.posterUrl}
                posterTag={row.posterTag}
                primaryLine={row.primaryLine}
                secondaryLine={row.secondaryLine}
                progressRatio={row.progressRatio}
                showProgress={false}
                isFlashing={Boolean(justLogged[row.rowKey])}
                flashLabel={row.flashLabel}
                actionContent={row.actionContent}
                actionAriaLabel={row.actionAriaLabel}
                onAction={() => triggerFlash(row.rowKey, row.onAction)}
                onOpen={row.onOpen}
              />
            ))}
          </div>
        </section>
      )}
    </ScrollUpHistoryFeed>
  );
}

function formatEpisodeCodeString(season: number, episode: number): string {
  return `S${pad2(season)} E${pad2(episode)}`;
}
