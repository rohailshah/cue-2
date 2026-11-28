import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  ChevronLeft,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { BulkActionBar } from '../components/BulkActionBar';
import { CompactFinishedDateRow, formatFinishedDate } from '../components/FinishedDateCard';
import { MediaImage } from '../components/MediaImage';
import { RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { GameItem, Movie, ReadItem, Show } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import { evaluateCustomListProgress } from '../utils/containers';
import { resolveComicEditionCover } from '../utils/editions';
import { parseActivityTimestampMs } from '../utils/recentEntries';
import { getReadStats, getShowStats } from '../utils/stats';

type LibraryDomainTab = 'all' | 'watch' | 'read' | 'play';

export function LibraryGridView({
  mode,
  listId,
}: {
  mode: 'all' | 'watch' | 'read' | 'play' | 'list';
  listId?: string;
}) {
  const {
    state,
    goBack,
    pushRoute,
    toggleItemInList,
    toggleListPinnedToQueue,
    deleteCustomList,
    reorderListItem,
    addReadingOrderStep,
    removeReadingOrderStep,
    toggleReadingOrderStep,
    bulkUpdateItems,
    rateCollection,
    setCollectionFinishedDate,
  } = useCueStore();
  const [activeTab, setActiveTab] = useState<LibraryDomainTab>(
    mode === 'list' ? 'all' : mode
  );
  const [filter, setFilter] = useState<'all' | 'active' | 'queued' | 'done' | 'owned' | 'wishlist'>('all');
  const [stepSeriesDraft, setStepSeriesDraft] = useState('');
  const [stepNumDraft, setStepNumDraft] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<
    Record<string, { kind: 'show' | 'movie' | 'read' | 'game'; id: string }>
  >({});

  useEffect(() => {
    if (mode !== 'list') {
      setActiveTab(mode);
      setFilter('all');
      setSelectMode(false);
      setSelectedMap({});
    }
  }, [mode]);

  const handleDomainTabChange = (nextTab: LibraryDomainTab) => {
    setActiveTab(nextTab);
    setFilter('all');
    setSelectMode(false);
    setSelectedMap({});
  };

  useModalBackHandler(selectMode, () => {
    setSelectMode(false);
    setSelectedMap({});
  });

  const toggleBulkItem = (kind: 'show' | 'movie' | 'read' | 'game', id: string) => {
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

  if (mode === 'list' && listId) {
    const list = state.lists.find((l) => l.id === listId);
    if (!list) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center p-6">
          <p className="text-ink font-semibold">List not found</p>
          <button type="button" onClick={goBack} className="mt-3 px-4 py-2 rounded-full bg-surface text-sm">
            Back
          </button>
        </div>
      );
    }

    const evalList = evaluateCustomListProgress(list, state);
    const listPct = Math.round(evalList.averageRatio * 100);
    const colKey = `list:${list.id}`;
    const storedColRating = state.collectionRatings?.[colKey];

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-2xl text-ink">{list.name}</h1>
              {list.description && <p className="text-sm text-ink-dim mt-0.5">{list.description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleListPinnedToQueue(list.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                list.pinnedToQueue
                  ? 'border-brand bg-brand/15 text-brand'
                  : 'border-white/10 bg-surface text-ink-dim hover:text-ink'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{list.pinnedToQueue ? 'Pinned to Cue' : 'Pin to Cue'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                deleteCustomList(list.id);
                goBack();
              }}
              aria-label="Delete list"
              className="h-8 w-8 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink-dim hover:text-red-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Cross-Media Run Progress & Rating */}
        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-ink">
                Cross-Media Progress · {evalList.completedItems}/{evalList.totalItems} complete ({listPct}%)
              </p>
              {evalList.nextItem && (
                <p className="text-xs text-ink-dim mt-0.5">
                  Up next: {evalList.nextItem.title} ({evalList.nextItem.unitHint})
                </p>
              )}
            </div>
            <RatingControl
              value={storedColRating?.rating}
              onChange={(r) => rateCollection(colKey, r, 'manual')}
              labelPrefix={`Rate ${list.name}`}
              allowClear
            />
          </div>

          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${listPct}%` }}
            />
          </div>

          {evalList.calculatedAvg !== null && evalList.ratedCount > 0 && (
            <SuggestedRatingBanner
              compact
              label={list.name}
              calculatedAvg={evalList.calculatedAvg}
              ratedCount={evalList.ratedCount}
              unitWord="titles"
              currentRating={storedColRating?.rating}
              ratingSource={storedColRating?.source}
              onAcceptAvg={(avg) => rateCollection(colKey, avg, 'auto')}
              onManualRate={(r) => rateCollection(colKey, r, 'manual')}
            />
          )}

          <CompactFinishedDateRow
            variant="inline"
            label="Collection finished"
            finishedAt={state.collectionFinishedAt?.[colKey]}
            onChangeDate={(ymd) => setCollectionFinishedDate(colKey, ymd)}
          />
        </section>

        {(list.isOrdered || (list.steps && list.steps.length > 0)) ? (
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const num = Number(stepNumDraft);
                if (!stepSeriesDraft.trim() || !Number.isFinite(num) || num < 1) return;
                addReadingOrderStep(list.id, stepSeriesDraft, num);
                setStepNumDraft(String(num + 1));
              }}
              className="rounded-2xl bg-surface border border-white/[0.06] p-3 flex items-center gap-2 flex-wrap"
            >
              <input
                type="text"
                placeholder="Series title (e.g. House of X)"
                value={stepSeriesDraft}
                onChange={(e) => setStepSeriesDraft(e.target.value)}
                className="flex-1 min-w-[150px] rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-read"
              />
              <input
                type="number"
                min={1}
                placeholder="Issue #"
                value={stepNumDraft}
                onChange={(e) => setStepNumDraft(e.target.value)}
                className="w-24 rounded-xl bg-background border border-white/10 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-read tabular-nums"
              />
              <button
                type="submit"
                disabled={!stepSeriesDraft.trim() || !stepNumDraft}
                className="px-3.5 py-2 rounded-xl bg-read text-[#1D160A] text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add issue step</span>
              </button>
            </form>

            {list.steps && list.steps.length > 0 && (
              <div className="space-y-2">
                {list.steps.map((step, idx) => {
                  const atomRec = state.atomicReadUnits?.[step.atomicId];
                  const done = (atomRec?.count || 0) > 0;
                  const stepDate = done ? formatFinishedDate(atomRec?.readAt) : null;
                  return (
                    <div
                      key={step.id}
                      className="rounded-2xl bg-surface border border-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 text-[11px] font-bold text-ink-faint tabular-nums shrink-0">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleReadingOrderStep(list.id, step.id)}
                          aria-label={`Toggle ${step.title}`}
                          className={`h-7 w-7 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            done
                              ? 'bg-watched border-watched text-[#131519]'
                              : 'border-white/20 text-ink-dim hover:border-watched'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={2.6} />
                        </button>
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              done ? 'text-ink-dim line-through' : 'text-ink'
                            }`}
                          >
                            {step.title}
                          </p>
                          <p className="text-[11px] text-ink-dim truncate tabular-nums">
                            {[
                              step.seriesTitle,
                              `Issue #${step.issueNumber}`,
                              stepDate ? `Read ${stepDate}` : null,
                              typeof atomRec?.rating === 'number' && atomRec.rating > 0
                                ? `★ ${atomRec.rating}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => reorderListItem(list.id, idx, idx - 1, 'steps')}
                          aria-label={`Move ${step.title} up`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === list.steps!.length - 1}
                          onClick={() => reorderListItem(list.id, idx, idx + 1, 'steps')}
                          aria-label={`Move ${step.title} down`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeReadingOrderStep(list.id, step.id)}
                          aria-label={`Remove ${step.title}`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {list.items.length > 0 && (
              <div className="space-y-2 pt-2">
                {list.items.map((ref, idx) => {
                  const title =
                    ref.kind === 'show'
                      ? state.shows[ref.id]?.title
                      : ref.kind === 'movie'
                        ? state.movies[ref.id]?.title
                        : ref.kind === 'read'
                          ? state.readItems[ref.id]?.title
                          : state.games[ref.id]?.title;
                  if (!title) return null;
                  return (
                    <div
                      key={`${ref.kind}-${ref.id}`}
                      className="rounded-2xl bg-surface border border-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (ref.kind === 'show') pushRoute({ view: 'show-detail', showId: ref.id });
                          else if (ref.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: ref.id });
                          else if (ref.kind === 'read') pushRoute({ view: 'read-detail', readId: ref.id });
                          else pushRoute({ view: 'game-detail', gameId: ref.id });
                        }}
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                      >
                        <span className="w-6 text-[11px] font-bold text-ink-faint tabular-nums shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-ink truncate">{title}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => reorderListItem(list.id, idx, idx - 1, 'items')}
                          aria-label={`Move ${title} up`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === list.items.length - 1}
                          onClick={() => reorderListItem(list.id, idx, idx + 1, 'items')}
                          aria-label={`Move ${title} down`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink disabled:opacity-25"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleItemInList(list.id, ref.kind, ref.id)}
                          aria-label={`Remove ${title}`}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 items-start">
          {list.items.map((ref) => {
            const title =
              ref.kind === 'show'
                ? state.shows[ref.id]?.title
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.title
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]?.title
                    : state.games[ref.id]?.title;
            const poster =
              ref.kind === 'show'
                ? state.shows[ref.id]?.posterUrl
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.posterUrl
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]
                      ? resolveComicEditionCover(
                          state.readItems[ref.id],
                          state.readProgress[ref.id]?.edition,
                          state.readProgress[ref.id]
                        )
                      : ''
                    : state.games[ref.id]?.coverUrl;
            const year =
              ref.kind === 'show'
                ? state.shows[ref.id]?.year
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.year
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]?.year
                    : state.games[ref.id]?.year;
            if (!title) return null;

            return (
              <div key={`${ref.kind}-${ref.id}`} className="group relative text-left self-start">
                <button
                  type="button"
                  onClick={() => {
                    if (ref.kind === 'show') pushRoute({ view: 'show-detail', showId: ref.id });
                    else if (ref.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: ref.id });
                    else if (ref.kind === 'read') pushRoute({ view: 'read-detail', readId: ref.id });
                    else pushRoute({ view: 'game-detail', gameId: ref.id });
                  }}
                  className="w-full flex flex-col items-stretch justify-start self-start text-left"
                >
                  <div className="aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                    <MediaImage
                      src={poster}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink truncate">{title}</p>
                  <p className="text-xs text-ink-dim">
                    {year} · {ref.kind}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleItemInList(list.id, ref.kind, ref.id)}
                  aria-label={`Remove ${title}`}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/70 text-ink-dim hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        )}
      </div>
    );
  }

  const shows = state.showOrder
    .map((id) => state.shows[id])
    .filter((s): s is Show => Boolean(s) && Boolean(state.showProgress[s.id]?.bookmarked))
    .map((s) => {
      const prog = state.showProgress[s.id];
      const st = getShowStats(s, prog);
      const col = getMediaCollectionBadge('show', s, prog);
      const activityMs = Math.max(
        parseActivityTimestampMs(prog?.finishedAt),
        parseActivityTimestampMs(prog?.lastWatchedAt)
      );
      return {
        kind: 'show' as const,
        domain: 'watch' as const,
        id: s.id,
        title: s.title,
        year: s.year,
        subtitle: String(s.year),
        poster: s.posterUrl,
        ratio: st.progressRatio,
        bucket: st.isFinished ? ('done' as const) : st.watchedUnique > 0 ? ('active' as const) : ('queued' as const),
        col,
        activityMs,
      };
    });

  const movies = state.movieOrder
    .map((id) => state.movies[id])
    .filter((m): m is Movie => Boolean(m) && Boolean(state.movieProgress[m.id]))
    .map((m) => {
      const prog = state.movieProgress[m.id];
      const watched = (prog?.watchCount || 0) > 0;
      const col = getMediaCollectionBadge('movie', m, prog);
      const activityMs = parseActivityTimestampMs(prog?.watchedAt);
      return {
        kind: 'movie' as const,
        domain: 'watch' as const,
        id: m.id,
        title: m.title,
        year: m.year,
        subtitle: String(m.year),
        poster: m.posterUrl,
        ratio: watched ? 1 : 0,
        bucket: watched ? ('done' as const) : ('queued' as const),
        col,
        activityMs,
      };
    });

  const allWatch = [...shows, ...movies];

  const allReads = state.readOrder
    .map((id) => state.readItems[id])
    .filter((r): r is ReadItem => Boolean(r) && Boolean(state.readProgress[r.id]?.bookmarked));

  const allGames = state.gameOrder
    .map((id) => state.games[id])
    .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked));

  const totalLibraryCount = allWatch.length + allReads.length + allGames.length;

  const renderDomainTabs = () => (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-4">
      {(
        [
          {
            id: 'all' as const,
            label: `All (${totalLibraryCount})`,
            activeClass: 'bg-white/15 border-white/30 text-ink',
          },
          {
            id: 'watch' as const,
            label: `Watch (${allWatch.length})`,
            activeClass: 'bg-watch/15 border-watch/40 text-watch',
          },
          {
            id: 'read' as const,
            label: `Read (${allReads.length})`,
            activeClass: 'bg-read/15 border-read/40 text-read',
          },
          {
            id: 'play' as const,
            label: `Play (${allGames.length})`,
            activeClass: 'bg-play/15 border-play/40 text-play',
          },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => handleDomainTabChange(tab.id)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
            activeTab === tab.id
              ? tab.activeClass
              : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (activeTab === 'all') {
    const readEntries = allReads.map((r) => {
      const prog = state.readProgress[r.id];
      const st = getReadStats(r, prog);
      const col = getMediaCollectionBadge('read', r, prog, state.atomicReadUnits);
      const activityMs = Math.max(
        parseActivityTimestampMs(prog?.finishedAt),
        parseActivityTimestampMs(prog?.lastReadAt)
      );
      return {
        kind: 'read' as const,
        domain: 'read' as const,
        id: r.id,
        title: r.title,
        year: r.year,
        subtitle: `${r.format} · ${r.creator}`,
        poster: resolveComicEditionCover(r, prog?.edition, prog),
        ratio: st.ratio,
        bucket: st.isFinished ? ('done' as const) : st.current > 0 ? ('active' as const) : ('queued' as const),
        col,
        activityMs,
      };
    });

    const gameEntries = allGames.map((g) => {
      const prog = state.gameProgress[g.id];
      const col = getMediaCollectionBadge('game', g, prog);
      const status = prog?.status;
      const activityMs = Math.max(
        parseActivityTimestampMs(prog?.finishedAt),
        parseActivityTimestampMs(prog?.lastPlayedAt)
      );
      return {
        kind: 'game' as const,
        domain: 'play' as const,
        id: g.id,
        title: g.title,
        year: g.year,
        subtitle: `${prog?.hoursPlayed || 0}h · ${prog?.platform || g.platforms[0] || ''}`.trim(),
        poster: g.coverUrl,
        ratio: Math.max(0, Math.min(1, (prog?.completionPct || 0) / 100)),
        bucket:
          status === 'completed'
            ? ('done' as const)
            : status === 'playing'
              ? ('active' as const)
              : ('queued' as const),
        col,
        activityMs,
      };
    });

    const allUnified = [...allWatch, ...readEntries, ...gameEntries].sort(
      (a, b) => b.activityMs - a.activityMs
    );
    const ownedAllCount = allUnified.filter((x) => x.col.hasAnyOwned).length;
    const wishAllCount = allUnified.filter((x) => x.col.hasAnyWishlist).length;
    const combinedAll = allUnified.filter((x) => {
      if (filter === 'all') return true;
      if (filter === 'owned') return x.col.hasAnyOwned;
      if (filter === 'wishlist') return x.col.hasAnyWishlist;
      return x.bucket === filter;
    });

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-2xl text-ink">
            Library ({combinedAll.length})
          </h1>
        </div>
        {renderDomainTabs()}
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'In Progress' },
              { id: 'queued', label: 'Queued' },
              { id: 'done', label: 'Finished' },
              ...(ownedAllCount > 0 ? [{ id: 'owned', label: `Owned (${ownedAllCount})` }] : []),
              ...(wishAllCount > 0 ? [{ id: 'wishlist', label: `Wishlist (${wishAllCount})` }] : []),
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                  filter === f.id
                    ? 'bg-brand border-brand text-brand-ink'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedMap({});
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 inline-flex items-center gap-1.5 ${
              selectMode
                ? 'bg-white text-[#131519] border-white'
                : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>
        {combinedAll.length === 0 ? (
          <p className="text-xs text-ink-faint py-6">No matching titles in your library.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 items-start">
            {combinedAll.map((item) => {
              const isSel = Boolean(selectedMap[`${item.kind}:${item.id}`]);
              const domainTone =
                item.domain === 'watch'
                  ? { badge: 'text-watch', border: 'border-watch ring-watch', bar: 'bg-watch', label: 'Watch' }
                  : item.domain === 'read'
                    ? { badge: 'text-read', border: 'border-read ring-read', bar: 'bg-read', label: 'Read' }
                    : { badge: 'text-play', border: 'border-play ring-play', bar: 'bg-play', label: 'Play' };
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => {
                    if (selectMode) {
                      toggleBulkItem(item.kind, item.id);
                      return;
                    }
                    if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                    else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                    else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                    else pushRoute({ view: 'game-detail', gameId: item.id });
                  }}
                  className="w-full flex flex-col items-stretch justify-start self-start text-left group"
                >
                  <div
                    className={`relative aspect-[2/3] w-full rounded-[16px] overflow-hidden bg-surface border transition-all ${
                      selectMode && isSel
                        ? `${domainTone.border} ring-2`
                        : 'border-white/8'
                    }`}
                  >
                    <MediaImage
                      src={item.poster}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    {!selectMode && (
                      <span
                        className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-white/15 text-[9.5px] font-semibold uppercase leading-none ${domainTone.badge}`}
                      >
                        {item.col.shortTag || domainTone.label}
                      </span>
                    )}
                    {selectMode && (
                      <span
                        className={`absolute top-2 right-2 h-6 w-6 rounded-full border flex items-center justify-center ${
                          isSel
                            ? 'bg-brand border-brand text-brand-ink'
                            : 'bg-black/65 border-white/30 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                      </span>
                    )}
                    {item.ratio > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                        <div
                          className={`h-full ${domainTone.bar}`}
                          style={{ width: `${Math.round(item.ratio * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 w-full text-sm font-medium text-ink truncate">{item.title}</p>
                  <p className="w-full text-xs text-ink-dim truncate capitalize tabular-nums">
                    {item.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {selectMode && (
          <BulkActionBar
            selectedCount={Object.keys(selectedMap).length}
            totalCount={combinedAll.length}
            lists={state.lists}
            onSelectAll={() => {
              const all: Record<string, { kind: 'show' | 'movie' | 'read' | 'game'; id: string }> = {};
              for (const x of combinedAll) all[`${x.kind}:${x.id}`] = { kind: x.kind, id: x.id };
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
      </div>
    );
  }

  if (activeTab === 'watch') {
    const ownedWatchCount = allWatch.filter((x) => x.col.hasAnyOwned).length;
    const wishWatchCount = allWatch.filter((x) => x.col.hasAnyWishlist).length;
    const combined = allWatch.filter((x) => {
      if (filter === 'all') return true;
      if (filter === 'owned') return x.col.hasAnyOwned;
      if (filter === 'wishlist') return x.col.hasAnyWishlist;
      return x.bucket === filter;
    });

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-2xl text-ink">
            Watch Library ({combined.length})
          </h1>
        </div>
        {renderDomainTabs()}
        <div className="flex items-center justify-between gap-2 mb-5 overflow-x-auto no-scrollbar">
          <div className="flex gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Watching' },
              { id: 'queued', label: 'Cued' },
              { id: 'done', label: 'Finished' },
              ...(ownedWatchCount > 0 ? [{ id: 'owned', label: `Owned (${ownedWatchCount})` }] : []),
              ...(wishWatchCount > 0 ? [{ id: 'wishlist', label: `Wishlist (${wishWatchCount})` }] : []),
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                  filter === f.id
                    ? 'bg-brand border-brand text-brand-ink'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedMap({});
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 inline-flex items-center gap-1.5 ${
              selectMode
                ? 'bg-white text-[#131519] border-white'
                : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 items-start">
          {combined.map((item) => {
            const isSel = Boolean(selectedMap[`${item.kind}:${item.id}`]);
            return (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => {
                if (selectMode) {
                  toggleBulkItem(item.kind, item.id);
                  return;
                }
                if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                else pushRoute({ view: 'movie-detail', movieId: item.id });
              }}
              className="w-full flex flex-col items-stretch justify-start self-start text-left group"
            >
              <div
                className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
                  selectMode && isSel
                    ? 'border-brand ring-2 ring-brand'
                    : 'border-white/8'
                }`}
              >
                <MediaImage
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                {!selectMode && item.col.shortTag && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-watch/40 text-[9.5px] font-semibold text-watch leading-none">
                    {item.col.shortTag}
                  </span>
                )}
                {selectMode && (
                  <span
                    className={`absolute top-2 right-2 h-6 w-6 rounded-full border flex items-center justify-center ${
                      isSel
                        ? 'bg-brand border-brand text-brand-ink'
                        : 'bg-black/65 border-white/30 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                  </span>
                )}
                {item.ratio > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                    <div className="h-full bg-watched" style={{ width: `${Math.round(item.ratio * 100)}%` }} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-ink truncate">{item.title}</p>
              <p className="text-xs text-ink-dim tabular-nums">{item.year}</p>
            </button>
            );
          })}
        </div>
        {selectMode && (
          <BulkActionBar
            selectedCount={Object.keys(selectedMap).length}
            totalCount={combined.length}
            lists={state.lists}
            onSelectAll={() => {
              const all: Record<string, { kind: 'show' | 'movie' | 'read' | 'game'; id: string }> = {};
              for (const x of combined) all[`${x.kind}:${x.id}`] = { kind: x.kind, id: x.id };
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
      </div>
    );
  }

  if (activeTab === 'read') {
    const allBookmarked = allReads;

    let ownedComicCount = 0;
    let wishlistComicCount = 0;
    for (const r of allBookmarked) {
      const col = getMediaCollectionBadge('read', r, state.readProgress[r.id], state.atomicReadUnits);
      if (col.hasAnyOwned) ownedComicCount += 1;
      if (col.hasAnyWishlist) wishlistComicCount += 1;
    }

    const items = allBookmarked.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'owned') {
        return getMediaCollectionBadge('read', r, state.readProgress[r.id], state.atomicReadUnits)
          .hasAnyOwned;
      }
      if (filter === 'wishlist') {
        return getMediaCollectionBadge('read', r, state.readProgress[r.id], state.atomicReadUnits)
          .hasAnyWishlist;
      }
      const st = getReadStats(r, state.readProgress[r.id]);
      if (filter === 'done') return st.isFinished;
      if (filter === 'active') return !st.isFinished && st.current > 0;
      return st.current === 0;
    });

    const readFilters = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Reading' },
      { id: 'queued', label: 'Want to read' },
      { id: 'done', label: 'Finished' },
      ...(ownedComicCount > 0 ? [{ id: 'owned', label: `Owned (${ownedComicCount})` }] : []),
      ...(wishlistComicCount > 0 ? [{ id: 'wishlist', label: `Wishlist (${wishlistComicCount})` }] : []),
    ];

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-2xl text-ink">
            Read Library ({items.length})
          </h1>
        </div>
        {renderDomainTabs()}
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {readFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                  filter === f.id
                    ? 'bg-brand border-brand text-brand-ink'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((v) => !v);
              setSelectedMap({});
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 inline-flex items-center gap-1.5 ${
              selectMode
                ? 'bg-white text-[#131519] border-white'
                : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{selectMode ? 'Cancel' : 'Select'}</span>
          </button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 items-start">
          {items.map((item) => {
            const st = getReadStats(item, state.readProgress[item.id]);
            const colSummary = getMediaCollectionBadge(
              'read',
              item,
              state.readProgress[item.id],
              state.atomicReadUnits
            );
            const posterCollectTag = colSummary.shortTag;
            const isSel = Boolean(selectedMap[`read:${item.id}`]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (selectMode) {
                    toggleBulkItem('read', item.id);
                    return;
                  }
                  pushRoute({ view: 'read-detail', readId: item.id });
                }}
                className="w-full flex flex-col items-stretch justify-start self-start text-left group"
              >
                <div
                  className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
                    selectMode && isSel
                      ? 'border-read ring-2 ring-read'
                      : 'border-white/8'
                  }`}
                >
                  <MediaImage
                    src={resolveComicEditionCover(
                      item,
                      state.readProgress[item.id]?.edition,
                      state.readProgress[item.id]
                    )}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  {!selectMode && posterCollectTag && (
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/75 border border-read/40 text-[9.5px] font-semibold text-read leading-none">
                      {posterCollectTag}
                    </span>
                  )}
                  {selectMode && (
                    <span
                      className={`absolute top-2 right-2 h-6 w-6 rounded-full border flex items-center justify-center ${
                        isSel
                          ? 'bg-read border-read text-[#1D160A]'
                          : 'bg-black/65 border-white/30 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                    </span>
                  )}
                  {st.current > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                      <div className="h-full bg-watched" style={{ width: `${Math.round(st.ratio * 100)}%` }} />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-ink truncate">{item.title}</p>
                <p className="text-xs text-ink-dim truncate capitalize">
                  {item.format} · {item.creator}
                </p>
              </button>
            );
          })}
        </div>
        {selectMode && (
          <BulkActionBar
            selectedCount={Object.keys(selectedMap).length}
            totalCount={items.length}
            lists={state.lists}
            onSelectAll={() => {
              const all: Record<string, { kind: 'show' | 'movie' | 'read' | 'game'; id: string }> = {};
              for (const x of items) all[`read:${x.id}`] = { kind: 'read', id: x.id };
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
      </div>
    );
  }

  let ownedPlayCount = 0;
  let wishPlayCount = 0;
  for (const g of allGames) {
    const col = getMediaCollectionBadge('game', g, state.gameProgress[g.id]);
    if (col.hasAnyOwned) ownedPlayCount += 1;
    if (col.hasAnyWishlist) wishPlayCount += 1;
  }

  const games = allGames.filter((g) => {
    const status = state.gameProgress[g.id]?.status;
    if (filter === 'all') return true;
    if (filter === 'owned') return getMediaCollectionBadge('game', g, state.gameProgress[g.id]).hasAnyOwned;
    if (filter === 'wishlist') return getMediaCollectionBadge('game', g, state.gameProgress[g.id]).hasAnyWishlist;
    if (filter === 'active') return status === 'playing';
    if (filter === 'queued') return status === 'backlog';
    return status === 'completed';
  });

  return (
    <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-2xl text-ink">
          Play Library ({games.length})
        </h1>
      </div>
      {renderDomainTabs()}
      <div className="flex items-center justify-between gap-2 mb-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Playing' },
            { id: 'queued', label: 'Backlog' },
            { id: 'done', label: 'Completed' },
            ...(ownedPlayCount > 0 ? [{ id: 'owned', label: `Owned (${ownedPlayCount})` }] : []),
            ...(wishPlayCount > 0 ? [{ id: 'wishlist', label: `Wishlist (${wishPlayCount})` }] : []),
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                filter === f.id
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectMode((v) => !v);
            setSelectedMap({});
          }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 inline-flex items-center gap-1.5 ${
            selectMode
              ? 'bg-white text-[#131519] border-white'
              : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>{selectMode ? 'Cancel' : 'Select'}</span>
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 items-start">
        {games.map((game) => {
          const prog = state.gameProgress[game.id];
          const gameCol = getMediaCollectionBadge('game', game, prog);
          const isSel = Boolean(selectedMap[`game:${game.id}`]);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => {
                if (selectMode) {
                  toggleBulkItem('game', game.id);
                  return;
                }
                pushRoute({ view: 'game-detail', gameId: game.id });
              }}
              className="w-full flex flex-col items-stretch justify-start self-start text-left group"
            >
              <div
                className={`relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border transition-all ${
                  selectMode && isSel
                    ? 'border-play ring-2 ring-play'
                    : 'border-white/8'
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
                {selectMode && (
                  <span
                    className={`absolute top-2 right-2 h-6 w-6 rounded-full border flex items-center justify-center ${
                      isSel
                        ? 'bg-play border-play text-[#161124]'
                        : 'bg-black/65 border-white/30 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
                  </span>
                )}
                {(prog?.completionPct || 0) > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                    <div className="h-full bg-watched" style={{ width: `${prog?.completionPct || 0}%` }} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-ink truncate">{game.title}</p>
              <p className="text-xs text-ink-dim tabular-nums">
                {prog?.hoursPlayed || 0}h · {prog?.platform || game.platforms[0]}
              </p>
            </button>
          );
        })}
      </div>
      {selectMode && (
        <BulkActionBar
          selectedCount={Object.keys(selectedMap).length}
          totalCount={games.length}
          lists={state.lists}
          onSelectAll={() => {
            const all: Record<string, { kind: 'show' | 'movie' | 'read' | 'game'; id: string }> = {};
            for (const g of games) all[`game:${g.id}`] = { kind: 'game', id: g.id };
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
    </div>
  );
}
