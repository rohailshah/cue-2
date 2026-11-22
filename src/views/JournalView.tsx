import { useMemo, useState } from 'react';
import { Bell, ChevronRight, Lock, Plus, Settings, Trash2, X } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { MOOD_OPTIONS } from '../components/PersonalNotesSection';
import { useCueStore } from '../store/useCueStore';
import type { GameItem, MediaDomain, Movie, PersonalMood, ReadItem, Show } from '../types';
import { computeAllMediaStats, formatRelativeTime, getReadStats, getShowStats } from '../utils/stats';

export function JournalView() {
  const {
    state,
    pushRoute,
    setNotificationsOpen,
    setSettingsOpen,
    setInsightsOpen,
    addJournalEntry,
    deleteJournalEntry,
    createCustomList,
  } = useCueStore();

  const [diaryFilter, setDiaryFilter] = useState<'all' | MediaDomain>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftDomain, setDraftDomain] = useState<MediaDomain>('watch');
  const [draftMediaId, setDraftMediaId] = useState('house-of-the-dragon');
  const [draftContext, setDraftContext] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftMood, setDraftMood] = useState<PersonalMood | undefined>('loved');

  const [newListOpen, setNewListOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');

  const analytics = useMemo(() => computeAllMediaStats(state), [state]);
  const unreadCount = state.notifications.filter((n) => !n.read).length;

  const watchShelf = useMemo(() => {
    const items: Array<{ kind: 'show' | 'movie'; id: string; title: string; year: number; poster: string; ratio?: number }> = [];
    for (const id of state.showOrder) {
      const s: Show | undefined = state.shows[id];
      const prog = state.showProgress[id];
      if (!s || !prog?.bookmarked) continue;
      const st = getShowStats(s, prog);
      items.push({ kind: 'show', id: s.id, title: s.title, year: s.year, poster: s.posterUrl, ratio: st.progressRatio });
    }
    for (const id of state.movieOrder) {
      const m: Movie | undefined = state.movies[id];
      const prog = state.movieProgress[id];
      if (!m || !prog) continue;
      items.push({ kind: 'movie', id: m.id, title: m.title, year: m.year, poster: m.posterUrl, ratio: prog.watchCount > 0 ? 1 : 0 });
    }
    return items;
  }, [state.showOrder, state.shows, state.showProgress, state.movieOrder, state.movies, state.movieProgress]);

  const readShelf = useMemo(
    () =>
      state.readOrder
        .map((id) => state.readItems[id])
        .filter((r): r is ReadItem => Boolean(r) && Boolean(state.readProgress[r.id]?.bookmarked)),
    [state.readOrder, state.readItems, state.readProgress]
  );

  const playShelf = useMemo(
    () =>
      state.gameOrder
        .map((id) => state.games[id])
        .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked)),
    [state.gameOrder, state.games, state.gameProgress]
  );

  const visibleEntries = useMemo(() => {
    if (diaryFilter === 'all') return state.journalEntries;
    return state.journalEntries.filter((e) => e.domain === diaryFilter);
  }, [state.journalEntries, diaryFilter]);

  const domainSelectableItems = useMemo(() => {
    if (draftDomain === 'watch') {
      return [
        ...state.showOrder.map((id) => ({
          id,
          kind: 'show' as const,
          title: state.shows[id]?.title || id,
          poster: state.shows[id]?.posterUrl || '',
        })),
        ...state.movieOrder.map((id) => ({
          id,
          kind: 'movie' as const,
          title: state.movies[id]?.title || id,
          poster: state.movies[id]?.posterUrl || '',
        })),
      ];
    }
    if (draftDomain === 'read') {
      return state.readOrder.map((id) => ({
        id,
        kind: (state.readItems[id]?.format || 'novel') as 'novel' | 'manga' | 'comic',
        title: state.readItems[id]?.title || id,
        poster: state.readItems[id]?.coverUrl || '',
      }));
    }
    return state.gameOrder.map((id) => ({
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
      <div className="relative h-[185px] sm:h-[220px] md:h-[240px] w-full overflow-hidden bg-surface">
        <MediaImage
          src={state.profile.bannerUrl}
          alt="Journal cover"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#131519]/65 border-b border-white/[0.06]" />

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
          <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-background bg-surface shadow-xl">
            <MediaImage
              src={state.profile.avatarUrl}
              alt={state.profile.name}
              className="w-full h-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="px-4 py-1.5 rounded-full bg-surface border border-white/10 text-xs font-semibold text-ink hover:bg-surface-raised transition-colors"
          >
            Edit profile
          </button>
        </div>

        {/* Name, Label & Bio (100% private — no followers/following) */}
        <div className="mb-5">
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

        {/* 4 Unified Cross-Media Stat Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <button
            type="button"
            onClick={() => setInsightsOpen(true)}
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
            onClick={() => setInsightsOpen(true)}
            className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-read">
              READ
            </p>
            <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
              {analytics.readChaptersCount} ch
            </p>
            <p className="text-[11px] text-ink-faint mt-1.5 tabular-nums">
              {analytics.readIssuesCount} iss · {analytics.readFinishedCount} finished
            </p>
          </button>

          <button
            type="button"
            onClick={() => setInsightsOpen(true)}
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
            onClick={() => setInsightsOpen(true)}
            className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-dim">
              ENTRIES
            </p>
            <p className="font-display font-bold text-[24px] text-ink mt-2 tabular-nums leading-none">
              {analytics.journalEntriesCount}
            </p>
            <p className="text-[11px] text-ink-faint mt-1.5">View insights →</p>
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
            {visibleEntries.map((entry) => {
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
            })}
          </div>
        </section>

        {/* Watch Shelf */}
        <section className="mb-7">
          <button
            type="button"
            onClick={() => pushRoute({ view: 'library-watch' })}
            className="flex items-center gap-1 font-display font-bold text-[20px] text-ink hover:text-brand transition-colors mb-3"
          >
            <span>Watch</span>
            <ChevronRight className="w-5 h-5 text-ink-dim" />
          </button>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {watchShelf.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() =>
                  item.kind === 'show'
                    ? pushRoute({ view: 'show-detail', showId: item.id })
                    : pushRoute({ view: 'movie-detail', movieId: item.id })
                }
                className="w-[116px] sm:w-[134px] shrink-0 text-left group"
              >
                <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                  <MediaImage
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  {state.settings.showPosterProgress && (item.ratio || 0) > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                      <div
                        className="h-full bg-watch"
                        style={{ width: `${Math.round((item.ratio || 0) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[13.5px] font-medium text-ink truncate leading-tight">
                  {item.title}
                </p>
                <p className="text-[12px] text-ink-dim tabular-nums">{item.year}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Read Shelf */}
        <section className="mb-7">
          <button
            type="button"
            onClick={() => pushRoute({ view: 'library-read' })}
            className="flex items-center gap-1 font-display font-bold text-[20px] text-ink hover:text-read transition-colors mb-3"
          >
            <span>Read</span>
            <ChevronRight className="w-5 h-5 text-ink-dim" />
          </button>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {readShelf.map((item) => {
              const st = getReadStats(item, state.readProgress[item.id]);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pushRoute({ view: 'read-detail', readId: item.id })}
                  className="w-[116px] sm:w-[134px] shrink-0 text-left group"
                >
                  <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                    <MediaImage
                      src={item.coverUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    {state.settings.showPosterProgress && st.current > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                        <div
                          className="h-full bg-read"
                          style={{ width: `${Math.round(st.ratio * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[13.5px] font-medium text-ink truncate leading-tight">
                    {item.title}
                  </p>
                  <p className="text-[12px] text-ink-dim tabular-nums">{item.creator}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Play Shelf */}
        <section className="mb-7">
          <button
            type="button"
            onClick={() => pushRoute({ view: 'library-play' })}
            className="flex items-center gap-1 font-display font-bold text-[20px] text-ink hover:text-play transition-colors mb-3"
          >
            <span>Play</span>
            <ChevronRight className="w-5 h-5 text-ink-dim" />
          </button>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {playShelf.map((game) => {
              const prog = state.gameProgress[game.id];
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => pushRoute({ view: 'game-detail', gameId: game.id })}
                  className="w-[116px] sm:w-[134px] shrink-0 text-left group"
                >
                  <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                    <MediaImage
                      src={game.coverUrl}
                      alt={game.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    {state.settings.showPosterProgress && (prog?.completionPct || 0) > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                        <div
                          className="h-full bg-play"
                          style={{ width: `${prog?.completionPct || 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[13.5px] font-medium text-ink truncate leading-tight">
                    {game.title}
                  </p>
                  <p className="text-[12px] text-ink-dim tabular-nums">
                    {prog?.hoursPlayed || 0}h · {prog?.platform || game.platforms[0]}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Custom Lists */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-[20px] text-ink">Lists</h2>
            <button
              type="button"
              onClick={() => setNewListOpen(true)}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-surface border border-white/10 text-ink hover:bg-surface-raised"
            >
              <Plus className="w-3.5 h-3.5 text-brand" />
              <span>New list</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {state.lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => pushRoute({ view: 'list-detail', listId: list.id })}
                className="rounded-[20px] bg-surface hover:bg-surface-raised border border-white/[0.05] p-4 text-left transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] text-ink truncate">{list.name}</p>
                  <p className="text-xs text-ink-dim truncate mt-0.5">
                    {list.description || `${list.items.length} titles`}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-1.5 tabular-nums">
                    {list.items.length} items
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-dim shrink-0" />
              </button>
            ))}
          </div>
        </section>
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
                        ? state.showOrder[0]
                        : dom === 'read'
                          ? state.readOrder[0]
                          : state.gameOrder[0];
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
              disabled={!draftText.trim()}
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
              createCustomList(listName, listDesc);
              setListName('');
              setListDesc('');
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
    </div>
  );
}
