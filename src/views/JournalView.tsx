import { useMemo, useState } from 'react';
import {
  Bell,
  Camera,
  ChevronRight,
  Lock,
  PenLine,
  Pin,
  Plus,
  QrCode,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DetailModeToggle } from '../components/DetailModeToggle';
import { DeviceSyncModal } from '../components/DeviceSyncModal';
import { JournalAdvancedStats } from '../components/JournalAdvancedStats';
import { MediaImage } from '../components/MediaImage';
import { MOOD_OPTIONS } from '../components/PersonalNotesSection';
import { ProfileMediaPickerModal } from '../components/ProfileMediaPickerModal';
import { YearWrappedModal } from '../components/YearWrappedModal';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type {
  DetailCardMode,
  MediaDomain,
  PersonalMood,
} from '../types';
import { evaluateCustomListProgress } from '../utils/containers';
import { requestQueueCueMindSide } from './QueueView';
import type { JournalStatsScope } from '../utils/journalAnalytics';
import { buildRecentEntries } from '../utils/recentEntries';
import {
  computeAllMediaStats,
  formatReadStatSummary,
  formatRelativeTime,
} from '../utils/stats';

let sessionJournalMode: DetailCardMode | null = null;
let sessionJournalScope: JournalStatsScope = 'all';

export function JournalView() {
  const {
    state,
    pushRoute,
    switchTab,
    setNotificationsOpen,
    setSettingsOpen,
    addJournalEntry,
    deleteJournalEntry,
    setMediaOwnership,
    updateMediaCollectionDetails,
    createCustomList,
    createCuratedReadingOrder,
    syncCode,
  } = useCueStore();

  const [journalMode, setJournalMode] = useState<DetailCardMode>(
    () => sessionJournalMode || state.settings.detailMode || 'simple'
  );
  const [advancedScope, setAdvancedScope] = useState<JournalStatsScope>(() => sessionJournalScope);
  const [diaryFilter, setDiaryFilter] = useState<'all' | MediaDomain>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [draftDomain, setDraftDomain] = useState<MediaDomain>('watch');
  const [draftMediaId, setDraftMediaId] = useState('');
  const [draftContext, setDraftContext] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftMood, setDraftMood] = useState<PersonalMood | undefined>('loved');

  const [newListOpen, setNewListOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [listOrdered, setListOrdered] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'avatar' | 'banner' | null>(null);

  useModalBackHandler(composeOpen, () => setComposeOpen(false));
  useModalBackHandler(newListOpen, () => setNewListOpen(false));

  const handleJournalModeChange = (nextMode: DetailCardMode) => {
    sessionJournalMode = nextMode;
    setJournalMode(nextMode);
  };

  const handleAdvancedScopeChange = (nextScope: JournalStatsScope) => {
    sessionJournalScope = nextScope;
    setAdvancedScope(nextScope);
  };

  const flipToAdvanced = (scope: JournalStatsScope) => {
    handleAdvancedScopeChange(scope);
    handleJournalModeChange('advanced');
  };

  const analytics = useMemo(() => computeAllMediaStats(state), [state]);
  const readSummary = useMemo(
    () =>
      formatReadStatSummary(
        analytics.readChaptersCount,
        analytics.readIssuesCount,
        analytics.readFinishedCount
      ),
    [analytics.readChaptersCount, analytics.readIssuesCount, analytics.readFinishedCount]
  );
  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const diaryPrompts = useMemo(() => {
    const prompts: Array<{
      key: string;
      domain: MediaDomain;
      mediaId: string;
      title: string;
      contextLabel?: string;
    }> = [];
    const seen = new Set<string>();
    for (const h of state.history || []) {
      const k = `${h.domain}:${h.mediaId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      prompts.push({
        key: k,
        domain: h.domain,
        mediaId: h.mediaId,
        title: h.title,
        contextLabel: h.codeLabel,
      });
      if (prompts.length >= 3) return prompts;
    }
    for (const id of state.showOrder) {
      const s = state.shows[id];
      const prog = state.showProgress[id];
      if (!s || !prog?.bookmarked) continue;
      const k = `watch:${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      prompts.push({ key: k, domain: 'watch', mediaId: id, title: s.title });
      if (prompts.length >= 3) return prompts;
    }
    for (const id of state.readOrder) {
      const r = state.readItems[id];
      const prog = state.readProgress[id];
      if (!r || !prog?.bookmarked) continue;
      const k = `read:${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      prompts.push({ key: k, domain: 'read', mediaId: id, title: r.title });
      if (prompts.length >= 3) return prompts;
    }
    for (const id of state.gameOrder) {
      const g = state.games[id];
      const prog = state.gameProgress[id];
      if (!g || !prog?.bookmarked) continue;
      const k = `play:${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      prompts.push({ key: k, domain: 'play', mediaId: id, title: g.title });
      if (prompts.length >= 3) return prompts;
    }
    return prompts;
  }, [
    state.history,
    state.showOrder,
    state.shows,
    state.showProgress,
    state.readOrder,
    state.readItems,
    state.readProgress,
    state.gameOrder,
    state.games,
    state.gameProgress,
  ]);

  const openComposeWithPrompt = (domain: MediaDomain, mediaId: string, contextLabel?: string) => {
    setDraftDomain(domain);
    setDraftMediaId(mediaId);
    setDraftContext(contextLabel || '');
    setComposeOpen(true);
  };

  const recentEntries = useMemo(() => buildRecentEntries(state, 18), [state]);

  const totalLibraryCount = useMemo(() => {
    let count = 0;
    for (const id of state.showOrder) {
      if (state.shows[id] && state.showProgress[id]?.bookmarked) count += 1;
    }
    for (const id of state.movieOrder) {
      if (state.movies[id] && state.movieProgress[id]) count += 1;
    }
    for (const id of state.readOrder) {
      if (state.readItems[id] && state.readProgress[id]?.bookmarked) count += 1;
    }
    for (const id of state.gameOrder) {
      if (state.games[id] && state.gameProgress[id]?.bookmarked) count += 1;
    }
    return count;
  }, [
    state.showOrder,
    state.shows,
    state.showProgress,
    state.movieOrder,
    state.movies,
    state.movieProgress,
    state.readOrder,
    state.readItems,
    state.readProgress,
    state.gameOrder,
    state.games,
    state.gameProgress,
  ]);

  const visibleEntries = useMemo(() => {
    if (diaryFilter === 'all') return state.journalEntries;
    return state.journalEntries.filter((e) => e.domain === diaryFilter);
  }, [state.journalEntries, diaryFilter]);

  const domainSelectableItems = useMemo(() => {
    if (draftDomain === 'watch') {
      return [
        ...state.showOrder
          .filter((id) => Boolean(state.shows[id]) && Boolean(state.showProgress[id]?.bookmarked))
          .map((id) => ({
            id,
            kind: 'show' as const,
            title: state.shows[id]?.title || id,
            poster: state.shows[id]?.posterUrl || '',
          })),
        ...state.movieOrder
          .filter((id) => Boolean(state.movies[id]) && Boolean(state.movieProgress[id]))
          .map((id) => ({
            id,
            kind: 'movie' as const,
            title: state.movies[id]?.title || id,
            poster: state.movies[id]?.posterUrl || '',
          })),
      ];
    }
    if (draftDomain === 'read') {
      return state.readOrder
        .filter((id) => Boolean(state.readItems[id]) && Boolean(state.readProgress[id]?.bookmarked))
        .map((id) => ({
          id,
          kind: (state.readItems[id]?.format || 'novel') as 'novel' | 'manga' | 'comic',
          title: state.readItems[id]?.title || id,
          poster: state.readItems[id]?.coverUrl || '',
        }));
    }
    return state.gameOrder
      .filter((id) => Boolean(state.games[id]) && Boolean(state.gameProgress[id]?.bookmarked))
      .map((id) => ({
        id,
        kind: 'game' as const,
        title: state.games[id]?.title || id,
        poster: state.games[id]?.coverUrl || '',
      }));
  }, [draftDomain, state]);

  const handleComposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftText.trim()) return;
    const picked = domainSelectableItems.find((x) => x.id === draftMediaId) || domainSelectableItems[0];
    if (!picked) return;
    addJournalEntry({
      domain: draftDomain,
      mediaKind: picked.kind,
      mediaId: picked.id,
      mediaTitle: picked.title,
      mediaPoster: picked.poster,
      contextLabel: draftContext.trim() || undefined,
      text: draftText.trim(),
      mood: draftMood,
    });
    setDraftText('');
    setDraftContext('');
    setComposeOpen(false);
  };

  const openEntryTarget = (entry: (typeof state.journalEntries)[number]) => {
    if (entry.mediaKind === 'show') pushRoute({ view: 'show-detail', showId: entry.mediaId });
    else if (entry.mediaKind === 'movie') pushRoute({ view: 'movie-detail', movieId: entry.mediaId });
    else if (entry.mediaKind === 'game') pushRoute({ view: 'game-detail', gameId: entry.mediaId });
    else pushRoute({ view: 'read-detail', readId: entry.mediaId });
  };

  return (
    <div className="min-h-dvh pb-28 md:pb-14 bg-background">
      {/* Cover Banner */}
      <div className="relative h-[185px] sm:h-[220px] md:h-[240px] w-full overflow-hidden bg-surface border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setMediaPickerTarget('banner')}
          aria-label="Change journal cover banner"
          className="block w-full h-full relative text-left cursor-pointer group"
        >
          {state.profile.bannerUrl ? (
            <>
              <MediaImage
                src={state.profile.bannerUrl}
                alt="Journal cover"
                className="w-full h-full object-cover object-center group-hover:scale-[1.01] transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-[#131519]/65" />
            </>
          ) : (
            <div className="absolute inset-0 bg-surface-raised/40" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setMediaPickerTarget('banner')}
          className="glass-btn absolute bottom-14 right-4 sm:bottom-4 sm:right-6 z-20 px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 text-[11px] font-medium text-ink/90 hover:text-ink"
        >
          <Camera className="w-3 h-3 text-brand" />
          <span>Cover</span>
        </button>

        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          aria-label="Release alerts"
          className="md:hidden glass-btn absolute top-4 left-4 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-watch ring-2 ring-background" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="md:hidden glass-btn absolute top-4 right-4 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10">
        {/* Avatar + Edit Profile */}
        <div className="-mt-12 relative z-10 flex items-end justify-between mb-3">
          <button
            type="button"
            onClick={() => setMediaPickerTarget('avatar')}
            aria-label="Change profile picture"
            className="relative group rounded-full cursor-pointer shrink-0"
          >
            <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-background bg-surface-raised shadow-xl flex items-center justify-center">
              {state.profile.avatarUrl ? (
                <MediaImage
                  src={state.profile.avatarUrl}
                  alt={state.profile.name}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
              ) : (
                <span className="font-display font-bold text-3xl text-ink select-none">
                  {(state.profile.name || 'Y').trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="absolute bottom-0.5 right-0.5 h-7 w-7 rounded-full bg-surface-raised border border-white/15 flex items-center justify-center text-ink shadow-md group-hover:border-brand transition-colors">
              <Camera className="w-3.5 h-3.5 text-brand" />
            </span>
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => setWrappedOpen(true)}
              className="px-3.5 py-1.5 rounded-full bg-brand/15 border border-brand/35 text-xs font-semibold text-brand hover:bg-brand/25 transition-colors inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{new Date().getFullYear()} Wrapped</span>
            </button>
            <button
              type="button"
              onClick={() => setSyncOpen(true)}
              className="px-3.5 py-1.5 rounded-full bg-surface border border-white/10 text-xs font-semibold text-ink hover:bg-surface-raised transition-colors inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5 text-watch" />
              <span>{syncCode ? 'Synced' : 'Sync'}</span>
              {syncCode && <span className="h-1.5 w-1.5 rounded-full bg-watch" />}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-3.5 py-1.5 rounded-full bg-surface border border-white/10 text-xs font-semibold text-ink hover:bg-surface-raised transition-colors"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Name, Label & Bio (100% private — no followers/following) */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h1 className="font-display font-bold text-2xl text-ink leading-tight">
              {state.profile.name}
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface border border-white/8 text-ink-dim">
              <Lock className="w-3 h-3 text-brand" />
              Private Journal
            </span>
          </div>
          {state.profile.bio && (
            <p className="text-[13.5px] text-ink/80 mt-2 max-w-xl">{state.profile.bio}</p>
          )}
        </div>

        <DetailModeToggle mode={journalMode} onChange={handleJournalModeChange} />

        <div key={journalMode} data-journal-mode={journalMode} className="animate-detail-flip">
          {journalMode === 'advanced' ? (
            <JournalAdvancedStats
              state={state}
              scope={advancedScope}
              onScopeChange={handleAdvancedScopeChange}
              onOpenCueMind={(side) => {
                requestQueueCueMindSide(side);
                switchTab('queue');
              }}
              onOpenItem={(item) => {
                if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                else if (item.kind === 'game') pushRoute({ view: 'game-detail', gameId: item.id });
                else pushRoute({ view: 'read-detail', readId: item.id });
              }}
              onSetOwnership={setMediaOwnership}
              onSaveCollectionDetails={updateMediaCollectionDetails}
            />
          ) : (
            <>
              {/* 4 Unified Cross-Media Stat Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <button
                  type="button"
                  onClick={() => flipToAdvanced('watch')}
                  className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-watch">
                    WATCHED
                  </p>
                  <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
                    {analytics.watchTimeLabel}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5 tabular-nums">
                    {analytics.totalWatchCount} eps & films
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => flipToAdvanced('read')}
                  className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-read">
                    READ
                  </p>
                  <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
                    {readSummary.primary}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5 tabular-nums">
                    {readSummary.secondary}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => flipToAdvanced('play')}
                  className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-play">
                    PLAYED
                  </p>
                  <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
                    {analytics.totalGameHours.toLocaleString()}h
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5 tabular-nums">
                    {analytics.gamesCompletedCount} completed
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => flipToAdvanced('all')}
                  className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">
                    ENTRIES
                  </p>
                  <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
                    {analytics.journalEntriesCount}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5">Advanced stats →</p>
                </button>
              </div>

        {/* Private Media Diary */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display font-bold text-[20px] text-ink">Media Diary</h2>
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand text-brand-ink text-xs font-semibold hover:opacity-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log note</span>
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'watch', label: 'Watch' },
                { id: 'read', label: 'Read' },
                { id: 'play', label: 'Play' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDiaryFilter(tab.id)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                  diaryFilter === tab.id
                    ? 'bg-white/15 border-white/30 text-ink'
                    : 'bg-surface border-white/8 text-ink-dim hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {visibleEntries.length === 0 ? (
              <div className="rounded-[20px] bg-surface border border-white/[0.05] p-5 text-center space-y-3">
                <div>
                  <p className="text-sm font-semibold text-ink">No diary notes yet</p>
                  <p className="text-xs text-ink-dim mt-1">
                    Log private reflections as you watch, read, or play titles.
                  </p>
                </div>
                {diaryPrompts.length > 0 && (
                  <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                    {diaryPrompts.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => openComposeWithPrompt(p.domain, p.mediaId, p.contextLabel)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 hover:border-brand/50 text-xs font-medium text-ink transition-colors max-w-[230px]"
                      >
                        <PenLine className="w-3 h-3 text-brand shrink-0" />
                        <span className="truncate">
                          Note on {p.title}
                          {p.contextLabel ? ` (${p.contextLabel})` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              visibleEntries.map((entry) => {
              const moodObj = entry.mood
                ? MOOD_OPTIONS.find((m) => m.key === entry.mood)
                : undefined;
              return (
                <div
                  key={entry.id}
                  className="rounded-[20px] bg-surface border border-white/[0.05] p-3.5 flex items-start gap-3"
                >
                  <button
                    type="button"
                    onClick={() => openEntryTarget(entry)}
                    className="w-12 h-[68px] rounded-xl overflow-hidden bg-surface-raised shrink-0"
                  >
                    <MediaImage
                      src={entry.mediaPoster}
                      alt={entry.mediaTitle}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEntryTarget(entry)}
                        className="text-sm font-semibold text-ink hover:text-brand transition-colors truncate text-left"
                      >
                        {entry.mediaTitle}
                      </button>
                      <span className="text-[11px] text-ink-faint shrink-0">
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          entry.domain === 'watch'
                            ? 'bg-watch/15 text-watch'
                            : entry.domain === 'read'
                              ? 'bg-read/15 text-read'
                              : 'bg-play/15 text-play'
                        }`}
                      >
                        {entry.domain}
                      </span>
                      {entry.contextLabel && (
                        <span className="text-[11px] text-ink-dim tabular-nums">
                          {entry.contextLabel}
                        </span>
                      )}
                      {moodObj && (
                        <span className="text-xs" title={moodObj.label}>
                          {moodObj.emoji}
                        </span>
                      )}
                    </div>

                    <p className="text-[13.5px] text-ink/90 leading-snug mt-1.5">{entry.text}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteJournalEntry(entry.id)}
                    aria-label="Delete diary entry"
                    className="p-1.5 rounded-full text-ink-faint hover:text-red-400 hover:bg-white/5 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
              })
            )}
          </div>
        </section>

        {/* Single Cross-Media Recent Entries Row + Link to Dedicated Library Page */}
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display font-bold text-[20px] text-ink">Recent Entries</h2>
            <button
              type="button"
              onClick={() => pushRoute({ view: 'library-all' })}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-surface border border-white/10 text-ink hover:bg-surface-raised transition-colors shrink-0"
            >
              <span>Library ({totalLibraryCount})</span>
              <ChevronRight className="w-3.5 h-3.5 text-ink-dim" />
            </button>
          </div>

          {recentEntries.length === 0 ? (
            <p className="text-xs text-ink-faint">No entries logged yet.</p>
          ) : (
            <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
              {recentEntries.map((item) => {
                const badgeClass =
                  item.domain === 'watch'
                    ? 'text-watch'
                    : item.domain === 'read'
                      ? 'text-read'
                      : 'text-play';
                const barClass =
                  item.domain === 'watch'
                    ? 'bg-watch'
                    : item.domain === 'read'
                      ? 'bg-read'
                      : 'bg-play';
                const domainLabel =
                  item.domain === 'watch' ? 'Watch' : item.domain === 'read' ? 'Read' : 'Play';
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (item.kind === 'show') pushRoute({ view: 'show-detail', showId: item.id });
                      else if (item.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: item.id });
                      else if (item.kind === 'read') pushRoute({ view: 'read-detail', readId: item.id });
                      else pushRoute({ view: 'game-detail', gameId: item.id });
                    }}
                    className="w-[116px] sm:w-[134px] shrink-0 flex flex-col items-stretch justify-start self-start text-left group"
                  >
                    <div className="relative aspect-[2/3] w-full rounded-[16px] overflow-hidden bg-surface border border-white/8">
                      <MediaImage
                        src={item.poster}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      <span
                        className={`absolute top-1.5 left-1.5 px-1.5 py-[2px] rounded bg-[#0F1318]/85 border border-white/10 text-[9px] font-semibold uppercase tracking-wide leading-none ${badgeClass}`}
                      >
                        {domainLabel}
                      </span>
                      {state.settings.showPosterProgress && item.ratio > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                          <div
                            className={`h-full ${barClass}`}
                            style={{ width: `${Math.round(item.ratio * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 w-full text-[13px] font-medium text-ink line-clamp-2 leading-snug">
                      {item.title}
                    </p>
                    <p className="w-full text-[11.5px] text-ink-dim truncate tabular-nums mt-0.5">
                      {item.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Custom Lists & Event Reading Orders */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-display font-bold text-[20px] text-ink">Lists & Reading Orders</h2>
            <button
              type="button"
              onClick={() => setNewListOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-surface border border-white/10 text-ink hover:bg-surface-raised shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-brand" />
              <span>New list</span>
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2.5 mb-2">
            {(
              [
                { id: 'hox-pox', label: 'House of X / Powers of X Order' },
                { id: 'secret-wars-2015', label: 'Secret Wars (2015) Order' },
                { id: 'annihilation', label: 'Annihilation Cosmic Order' },
              ] as const
            ).map((ro) => (
              <button
                key={ro.id}
                type="button"
                onClick={() => {
                  const newId = createCuratedReadingOrder(ro.id);
                  pushRoute({ view: 'list-detail', listId: newId });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-read/25 hover:border-read/60 text-xs font-medium text-ink shrink-0 transition-colors"
              >
                <Plus className="w-3 h-3 text-read" />
                <span>{ro.label}</span>
              </button>
            ))}
          </div>

          {state.lists.length === 0 ? (
            <div className="rounded-[20px] bg-surface border border-white/[0.05] p-5 text-center space-y-3">
              <div>
                <p className="text-sm font-semibold text-ink">No custom lists yet</p>
                <p className="text-xs text-ink-dim mt-1">
                  Start from a quick collection template, event reading order, or create your own shelf.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap pt-0.5">
                {[
                  { name: 'Favorites of 2026', desc: 'Standout releases across Watch, Read & Play' },
                  { name: 'Weekend Backlog', desc: 'Short picks ready for the next free weekend' },
                  { name: 'All-Time Classics', desc: 'Must-revisit favorites in any medium' },
                ].map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => createCustomList(tpl.name, tpl.desc)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 hover:border-brand/50 text-xs font-medium text-ink transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-brand shrink-0" />
                    <span>{tpl.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {state.lists.map((list) => {
                const ev = evaluateCustomListProgress(list, state);
                const pct = Math.round(ev.averageRatio * 100);
                const itemCount = list.steps && list.steps.length > 0 ? list.steps.length : list.items.length;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => pushRoute({ view: 'list-detail', listId: list.id })}
                    className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {list.pinnedToQueue && <Pin className="w-3.5 h-3.5 text-brand shrink-0" />}
                          {list.isOrdered && (
                            <span className="px-1.5 py-0.5 rounded bg-read/15 text-read text-[9px] font-bold uppercase tracking-wider shrink-0">
                              Order
                            </span>
                          )}
                          <p className="font-semibold text-[15px] text-ink truncate">{list.name}</p>
                        </div>
                        <p className="text-xs text-ink-dim truncate mt-0.5">
                          {list.description || `${itemCount} ${list.steps?.length ? 'issues' : 'titles'}`}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink-dim shrink-0" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-ink-faint tabular-nums">
                        <span>
                          {ev.completedItems}/{ev.totalItems} complete ({pct}%)
                        </span>
                        <span>{itemCount} {list.steps?.length ? 'issues' : 'items'}</span>
                      </div>
                      {ev.totalItems > 0 && (
                        <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full bg-brand transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
            </>
          )}
        </div>
      </div>

      {/* Log Note Modal */}
      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setComposeOpen(false)}
        >
          <form
            onSubmit={handleComposeSubmit}
            className="w-full md:max-w-lg bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 space-y-4 shadow-2xl animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-ink">Log private diary note</h3>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['watch', 'read', 'play'] as const).map((dom) => (
                <button
                  key={dom}
                  type="button"
                  onClick={() => {
                    setDraftDomain(dom);
                    const first =
                      dom === 'watch'
                        ? state.showOrder.find((id) => state.showProgress[id]?.bookmarked) ||
                          state.movieOrder.find((id) => Boolean(state.movieProgress[id]))
                        : dom === 'read'
                          ? state.readOrder.find((id) => state.readProgress[id]?.bookmarked)
                          : state.gameOrder.find((id) => state.gameProgress[id]?.bookmarked);
                    if (first) setDraftMediaId(first);
                  }}
                  className={`py-2 rounded-xl border text-xs font-semibold capitalize ${
                    draftDomain === dom
                      ? dom === 'watch'
                        ? 'border-watch bg-watch/15 text-ink'
                        : dom === 'read'
                          ? 'border-read bg-read/15 text-ink'
                          : 'border-play bg-play/15 text-ink'
                      : 'border-white/10 bg-surface text-ink-dim'
                  }`}
                >
                  {dom}
                </button>
              ))}
            </div>

            {domainSelectableItems.length === 0 ? (
              <p className="text-xs text-ink-dim py-2">
                Add a title to this section first to log a note.
              </p>
            ) : (
              <select
                value={draftMediaId}
                onChange={(e) => setDraftMediaId(e.target.value)}
                className="w-full rounded-xl bg-surface border border-white/10 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              >
                {domainSelectableItems.map((it) => (
                  <option key={it.id} value={it.id} className="bg-surface">
                    {it.title}
                  </option>
                ))}
              </select>
            )}

            <input
              value={draftContext}
              onChange={(e) => setDraftContext(e.target.value)}
              placeholder="Progress tag (optional, e.g. S03 E03, Ch. 214, Issue #12, 64h)"
              className="w-full rounded-xl bg-surface border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />

            <textarea
              rows={3}
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Write your reflection..."
              className="w-full rounded-2xl bg-surface border border-white/10 p-3 text-sm text-ink outline-none focus:border-brand resize-none"
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setDraftMood(draftMood === m.key ? undefined : m.key)}
                  className={`shrink-0 px-2.5 py-1 rounded-full border text-xs ${
                    draftMood === m.key
                      ? 'border-brand bg-brand/15 text-ink'
                      : 'border-white/10 bg-surface text-ink-dim'
                  }`}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!draftText.trim() || domainSelectableItems.length === 0}
              className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold disabled:opacity-40"
            >
              Save entry
            </button>
          </form>
        </div>
      )}

      {/* Create List Modal */}
      {newListOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setNewListOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!listName.trim()) return;
              createCustomList(listName, listDesc, undefined, undefined, { isOrdered: listOrdered });
              setListName('');
              setListDesc('');
              setListOrdered(false);
              setNewListOpen(false);
            }}
            className="w-full md:max-w-md bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg text-ink">New custom list</h3>
              <button
                type="button"
                onClick={() => setNewListOpen(false)}
                className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              autoFocus
              placeholder="List name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className="w-full rounded-xl bg-surface border border-white/10 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
            <input
              placeholder="Description (optional)"
              value={listDesc}
              onChange={(e) => setListDesc(e.target.value)}
              className="w-full rounded-xl bg-surface border border-white/10 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
            <label className="flex items-center gap-2.5 text-xs text-ink-dim cursor-pointer select-none px-1 py-0.5">
              <input
                type="checkbox"
                checked={listOrdered}
                onChange={(e) => setListOrdered(e.target.checked)}
                className="rounded border-white/20 bg-surface accent-[#6EC5D4]"
              />
              <span>Ordered Reading / Event Sequence (allows issue steps & reordering)</span>
            </label>
            <button
              type="submit"
              disabled={!listName.trim()}
              className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold disabled:opacity-40"
            >
              Create list
            </button>
          </form>
        </div>
      )}
      <DeviceSyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <YearWrappedModal open={wrappedOpen} onClose={() => setWrappedOpen(false)} />
      <ProfileMediaPickerModal
        open={mediaPickerTarget !== null}
        initialTarget={mediaPickerTarget || 'avatar'}
        onClose={() => setMediaPickerTarget(null)}
      />
    </div>
  );
}
