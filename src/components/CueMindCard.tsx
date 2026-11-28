import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  fetchAllDiscoverRails,
  hydrateLiveGameItem,
  hydrateLiveMovie,
  hydrateLiveReadItem,
  hydrateLiveShow,
  type LiveSearchResult,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import {
  computeCueMind,
  computeCueMindDiscover,
  type CueMindDiscoverPick,
  type CueMindThought,
  type DiscoverMindScope,
  type MindIntent,
} from '../utils/cueMind';
import { scanAndRepairLibrary } from '../utils/libraryHeal';
import { MediaImage } from './MediaImage';

const INTENT_TABS: Array<{ id: MindIntent; label: string }> = [
  { id: 'auto', label: 'Smart' },
  { id: 'quick', label: 'Quick' },
  { id: 'deep', label: 'Deep' },
  { id: 'finish', label: 'Finish' },
];

const DISCOVER_SCOPE_TABS: Array<{ id: DiscoverMindScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'watch', label: 'Watch' },
  { id: 'read', label: 'Read' },
  { id: 'play', label: 'Play' },
];

let cachedLiveDiscoverPool: { ts: number; items: LiveSearchResult[] } | null = null;
const DISCOVER_POOL_TTL_MS = 10 * 60_000;

function formatBadgeLabel(item: LiveSearchResult): string {
  if (item.mediaType === 'tv' || item.mediaType === 'anime') return 'SHOW';
  if (item.mediaType === 'movie') return 'MOVIE';
  if (item.mediaType === 'manga') return 'MANGA';
  if (item.mediaType === 'comic') return 'COMIC';
  if (item.mediaType === 'novel') return 'NOVEL';
  return 'GAME';
}

export function CueMindCard({
  initialSide = 'continue',
  onSideChange,
}: {
  initialSide?: 'continue' | 'discover';
  onSideChange?: (side: 'continue' | 'discover') => void;
}) {
  const {
    state,
    pushRoute,
    switchTab,
    patchMediaMetadata,
    updateSettings,
    showToast,
    addLiveShowToStore,
    addLiveMovieToStore,
    addLiveReadToStore,
    addLiveGameToStore,
    updateReadEditionCovers,
    dismissMindRecommendation,
    recordMindDiscoverAccept,
  } = useCueStore();

  const [mindSide, setMindSide] = useState<'continue' | 'discover'>(initialSide);
  const [intent, setIntent] = useState<MindIntent>('auto');
  const [thoughtIndex, setThoughtIndex] = useState(0);

  const [discoverScope, setDiscoverScope] = useState<DiscoverMindScope>('all');
  const [discoverIndex, setDiscoverIndex] = useState(0);
  const [livePool, setLivePool] = useState<LiveSearchResult[]>(
    () => cachedLiveDiscoverPool?.items || []
  );
  const [busyAction, setBusyAction] = useState<'preview' | 'add' | null>(null);
  const [repairing, setRepairing] = useState(false);

  useEffect(() => {
    setMindSide(initialSide);
  }, [initialSide]);

  const setSide = (next: 'continue' | 'discover') => {
    setMindSide(next);
    onSideChange?.(next);
  };

  const snapshot = useMemo(() => computeCueMind(state, intent), [state, intent]);
  const activeThought: CueMindThought =
    snapshot.thoughts[thoughtIndex % snapshot.thoughts.length] || snapshot.thoughts[0];

  const discoverPicks = useMemo(
    () => computeCueMindDiscover(state, snapshot.taste, livePool, discoverScope),
    [state, snapshot.taste, livePool, discoverScope]
  );
  const activeDiscover: CueMindDiscoverPick | null =
    discoverPicks.length > 0 ? discoverPicks[discoverIndex % discoverPicks.length] : null;

  useEffect(() => {
    if (
      cachedLiveDiscoverPool &&
      Date.now() - cachedLiveDiscoverPool.ts < DISCOVER_POOL_TTL_MS
    ) {
      setLivePool(cachedLiveDiscoverPool.items);
      return;
    }
    let cancelled = false;
    fetchAllDiscoverRails(state.settings.tmdbApiKey)
      .then((rails) => {
        if (cancelled) return;
        const flat: LiveSearchResult[] = [];
        for (const r of rails) {
          for (const it of r.items) flat.push(it);
        }
        cachedLiveDiscoverPool = { ts: Date.now(), items: flat };
        setLivePool(flat);
      })
      .catch(() => {
        // Curated candidate pool stays active immediately even if live rails fail
      });
    return () => {
      cancelled = true;
    };
  }, [state.settings.tmdbApiKey]);

  const handleRunSelfHeal = async () => {
    if (repairing) return;
    setRepairing(true);
    try {
      const summary = await scanAndRepairLibrary(state, patchMediaMetadata);
      if (summary.repaired > 0 || summary.clearedStaleComics > 0) {
        showToast(
          `Self-healed ${summary.repaired} covers & ${summary.clearedStaleComics} comic caches`,
          undefined,
          undefined,
          { domain: 'watch', subtitle: 'Cue Mind Integrity' }
        );
      } else {
        showToast(`Verified ${summary.scanned} library items — all healthy`);
      }
    } finally {
      setRepairing(false);
    }
  };

  const handleOpenThoughtTarget = (thought: CueMindThought) => {
    if (thought.requiresHeal) {
      handleRunSelfHeal();
      return;
    }
    const tgt = thought.target;
    if (!tgt) {
      setSide('discover');
      return;
    }
    if (tgt.kind === 'show') pushRoute({ view: 'show-detail', showId: tgt.id });
    else if (tgt.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: tgt.id });
    else if (tgt.kind === 'read') pushRoute({ view: 'read-detail', readId: tgt.id });
    else if (tgt.kind === 'game') pushRoute({ view: 'game-detail', gameId: tgt.id });
    else pushRoute({ view: 'list-detail', listId: tgt.id });
  };

  const handleDiscoverAction = async (pick: CueMindDiscoverPick, andAdd: boolean) => {
    if (busyAction) return;
    setBusyAction(andAdd ? 'add' : 'preview');
    const item = pick.item;
    try {
      if (item.kind === 'movie') {
        const movie = hydrateLiveMovie(item);
        addLiveMovieToStore(state.movies[movie.id] || movie, 'watchlist', andAdd);
        if (andAdd) recordMindDiscoverAccept(item.genres);
        else pushRoute({ view: 'movie-detail', movieId: movie.id });
        return;
      }
      if (item.kind === 'read') {
        const readItem = hydrateLiveReadItem(item);
        if (!state.readItems[readItem.id]) {
          addLiveReadToStore(readItem, 'want_to_read', andAdd);
        } else {
          updateReadEditionCovers(
            readItem.id,
            readItem.editionCovers || {},
            readItem.title,
            readItem.editionIssueCounts,
            readItem.editionVariants
          );
          if (andAdd) addLiveReadToStore(state.readItems[readItem.id], 'want_to_read', true);
        }
        if (andAdd) recordMindDiscoverAccept(item.genres);
        else pushRoute({ view: 'read-detail', readId: readItem.id });
        return;
      }
      if (item.kind === 'game') {
        const game = hydrateLiveGameItem(item);
        addLiveGameToStore(state.games[game.id] || game, 'backlog', andAdd);
        if (andAdd) recordMindDiscoverAccept(item.genres);
        else pushRoute({ view: 'game-detail', gameId: game.id });
        return;
      }
      const show = state.shows[item.id] || (await hydrateLiveShow(item, state.settings.tmdbApiKey));
      addLiveShowToStore(show, andAdd);
      if (andAdd) recordMindDiscoverAccept(item.genres);
      else pushRoute({ view: 'show-detail', showId: show.id });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSkipDiscover = (pick: CueMindDiscoverPick) => {
    dismissMindRecommendation(pick.item.id, pick.item.genres);
    setDiscoverIndex(0);
  };

  const domainTagColor =
    activeThought.domain === 'watch'
      ? 'bg-watch/15 text-watch'
      : activeThought.domain === 'read'
        ? 'bg-read/15 text-read'
        : activeThought.domain === 'play'
          ? 'bg-play/15 text-play'
          : 'bg-white/10 text-ink';

  const discoverDomainTagColor =
    activeDiscover?.domain === 'watch'
      ? 'bg-watch/15 text-watch'
      : activeDiscover?.domain === 'read'
        ? 'bg-read/15 text-read'
        : 'bg-play/15 text-play';

  const showIntroBanner = snapshot.taste.isUnlocked && !state.settings.cueMindIntroDismissed;

  return (
    <section
      aria-label="Cue Mind"
      className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-6 space-y-3"
    >
      {/* Top Header: Cue Mind */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
            <Sparkles className="w-3.5 h-3.5" />
            Cue Mind
          </span>
          <span className="text-[11px] text-ink-faint">· {snapshot.greeting}</span>
        </div>
      </div>

      {/* First-Time Unlock Introduction Callout */}
      {showIntroBanner && (
        <div className="rounded-[16px] bg-background/85 border border-brand/30 p-3 flex items-start justify-between gap-3 flex-wrap animate-fade-in">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold text-ink">
              Cue Mind unlocked — learned from your first {snapshot.taste.learnedEntriesCount} entries
            </p>
            <p className="text-[11.5px] text-ink-dim leading-snug">
              Pick what to <span className="text-ink font-medium">Continue</span> or flip to{' '}
              <span className="text-ink font-medium">Discover</span> tailored matches across Watch, Read &amp; Play.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSide('discover');
                setDiscoverIndex(0);
                updateSettings({ cueMindIntroDismissed: true });
              }}
              className="px-3 py-1.5 rounded-full bg-brand text-brand-ink text-[11px] font-semibold hover:opacity-95"
            >
              Try Discover
            </button>
            <button
              type="button"
              onClick={() => updateSettings({ cueMindIntroDismissed: true })}
              className="px-2.5 py-1.5 rounded-full bg-surface border border-white/10 text-[11px] font-semibold text-ink-dim hover:text-ink"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Two-Sided Toggle: Continue | Discover + Sub-Filters & Cycler */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex rounded-full bg-background border border-white/10 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setSide('continue')}
            aria-pressed={mindSide === 'continue'}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
              mindSide === 'continue'
                ? 'bg-brand text-brand-ink'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Continue</span>
          </button>
          <button
            type="button"
            onClick={() => setSide('discover')}
            aria-pressed={mindSide === 'discover'}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
              mindSide === 'discover'
                ? 'bg-brand text-brand-ink'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            <Compass className="w-3 h-3" />
            <span>Discover</span>
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {mindSide === 'continue' && snapshot.thoughts.length > 1 && (
            <button
              type="button"
              onClick={() => setThoughtIndex((i) => (i + 1) % snapshot.thoughts.length)}
              aria-label="Next thought"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-dim hover:text-ink shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="tabular-nums">
                {(thoughtIndex % snapshot.thoughts.length) + 1}/{snapshot.thoughts.length}
              </span>
            </button>
          )}
          {mindSide === 'discover' && discoverPicks.length > 1 && (
            <button
              type="button"
              onClick={() => setDiscoverIndex((i) => (i + 1) % discoverPicks.length)}
              aria-label="Next recommendation"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-dim hover:text-ink shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="tabular-nums">
                {(discoverIndex % discoverPicks.length) + 1}/{discoverPicks.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-filter Chips Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {mindSide === 'continue'
          ? INTENT_TABS.map((t) => {
              const active = intent === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setIntent(t.id);
                    setThoughtIndex(0);
                  }}
                  aria-pressed={active}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                    active
                      ? 'bg-white/15 border-white/30 text-ink'
                      : 'bg-background border-white/8 text-ink-dim hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              );
            })
          : DISCOVER_SCOPE_TABS.map((t) => {
              const active = discoverScope === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setDiscoverScope(t.id);
                    setDiscoverIndex(0);
                  }}
                  aria-pressed={active}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                    active
                      ? 'bg-white/15 border-white/30 text-ink'
                      : 'bg-background border-white/8 text-ink-dim hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
      </div>

      {/* Active Flipside Content */}
      <div key={mindSide} data-mind-side={mindSide} className="animate-detail-flip">
        {mindSide === 'continue' ? (
          <div className="rounded-[16px] bg-background/70 border border-white/[0.05] p-3 flex items-center gap-3">
            {activeThought.target?.posterUrl && (
              <button
                type="button"
                onClick={() => handleOpenThoughtTarget(activeThought)}
                className="w-12 h-[70px] rounded-xl overflow-hidden bg-surface-raised border border-white/8 shrink-0"
              >
                <MediaImage
                  src={activeThought.target.posterUrl}
                  alt={activeThought.target.title}
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded leading-none ${domainTagColor}`}
                >
                  {activeThought.tag}
                </span>
              </div>
              <p className="font-display font-bold text-[15px] text-ink leading-snug truncate">
                {activeThought.headline}
              </p>
              <p className="text-xs text-ink-dim leading-relaxed line-clamp-2 mt-0.5">
                {activeThought.reason}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenThoughtTarget(activeThought)}
              aria-label={activeThought.actionLabel}
              className="h-9 px-3 rounded-full bg-surface border border-white/12 hover:border-brand text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0 transition-colors"
            >
              <span className="hidden sm:inline">{activeThought.actionLabel}</span>
              <ChevronRight className="w-4 h-4 text-brand" />
            </button>
          </div>
        ) : activeDiscover ? (
          <div className="rounded-[16px] bg-background/70 border border-white/[0.05] p-3 space-y-2.5">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => handleDiscoverAction(activeDiscover, false)}
                className="w-12 h-[72px] rounded-xl overflow-hidden bg-surface-raised border border-white/8 shrink-0"
              >
                <MediaImage
                  src={activeDiscover.item.posterUrl}
                  alt={activeDiscover.item.title}
                  className="w-full h-full object-cover"
                />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span
                    className={`text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded leading-none ${discoverDomainTagColor}`}
                  >
                    {activeDiscover.tag}
                  </span>
                  <span className="text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-[2px] rounded bg-white/8 text-ink-dim leading-none">
                    {formatBadgeLabel(activeDiscover.item)}
                  </span>
                  <span className="text-[10.5px] font-semibold text-watched tabular-nums ml-auto">
                    {activeDiscover.matchPct}% match
                  </span>
                </div>
                <p className="font-display font-bold text-[15px] text-ink leading-snug truncate">
                  {activeDiscover.item.title}
                </p>
                <p className="text-[11px] text-ink-faint truncate tabular-nums">
                  {[activeDiscover.item.year, activeDiscover.item.director]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-xs text-ink-dim leading-snug line-clamp-2 mt-1">
                  {activeDiscover.reason}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleDiscoverAction(activeDiscover, false)}
                  className="h-8 px-3 rounded-full bg-surface border border-white/12 hover:border-white/30 text-xs font-semibold text-ink inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busyAction === 'preview' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 text-ink-dim" />
                  )}
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handleDiscoverAction(activeDiscover, true)}
                  className="h-8 px-3 rounded-full bg-brand text-brand-ink text-xs font-semibold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-50"
                >
                  {busyAction === 'add' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>Add</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleSkipDiscover(activeDiscover)}
                aria-label={`Skip ${activeDiscover.item.title}`}
                className="h-8 px-2.5 rounded-full bg-surface border border-white/10 hover:border-white/25 text-[11px] font-medium text-ink-dim hover:text-ink inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Skip</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[16px] bg-background/70 border border-white/[0.05] p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">All caught up in this Discover filter</p>
              <p className="text-[11px] text-ink-dim mt-0.5">
                Switch to All or open Search to explore more titles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => switchTab('search')}
              className="px-3 py-1.5 rounded-full bg-surface border border-white/12 text-xs font-semibold text-ink shrink-0"
            >
              Open Search
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5 flex-wrap">
        <p className="text-[11px] text-ink-faint">
          {mindSide === 'discover' ? snapshot.taste.summaryLine : snapshot.balanceNote}
        </p>
        {mindSide === 'discover' && (
          <button
            type="button"
            onClick={() => switchTab('search')}
            className="text-[11px] font-semibold text-brand hover:underline shrink-0"
          >
            Browse all Discover →
          </button>
        )}
      </div>
    </section>
  );
}
