import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ListPlus,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Star,
  X,
} from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { useCueStore } from '../store/useCueStore';
import type { Episode, Season } from '../types';
import {
  formatAirDate,
  formatEpisodeCode,
  getEpisodeKey,
  getSeasonProgress,
  getShowStats,
  pad2,
} from '../utils/stats';

export function ShowDetailView({ showId }: { showId: string }) {
  const {
    state,
    goBack,
    watchNextEpisode,
    toggleEpisodeWatched,
    incrementEpisodeRewatch,
    toggleShowBookmark,
    toggleShowNotifications,
    markSeasonWatched,
    markShowAllWatched,
    startShowRewatch,
    resetShowProgress,
    rateShow,
    setShowMood,
    addJournalEntry,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const show = state.shows[showId];
  const progress = state.showProgress[showId];

  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    if (!show || show.seasons.length === 0) return 1;
    const stats = getShowStats(show, progress);
    return stats.nextEpisode?.season || show.seasons[0].number;
  });
  const [seasonPairStart, setSeasonPairStart] = useState<number>(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [expandedOverview, setExpandedOverview] = useState(false);
  const [rewatchStepperEp, setRewatchStepperEp] = useState<string | null>(null);
  const [activeEpisodeDrawer, setActiveEpisodeDrawer] = useState<Episode | null>(null);
  const [epNoteText, setEpNoteText] = useState('');

  const stats = useMemo(() => {
    if (!show) return null;
    return getShowStats(show, progress);
  }, [show, progress]);

  if (!show || !stats) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Show not found</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 px-5 py-2.5 rounded-full bg-surface-raised text-sm text-ink"
        >
          Go back
        </button>
      </div>
    );
  }

  const activeSeasonObj = show.seasons.find((s) => s.number === selectedSeason) || show.seasons[0];
  const desktopSeasons: Season[] = show.seasons.slice(seasonPairStart, seasonPairStart + 2);

  const renderSeasonColumn = (season: Season, showDropdownOnMobile = false) => {
    const sp = getSeasonProgress(show, season.number, progress);
    return (
      <div key={season.number}>
        <div className="flex items-center justify-between mb-2.5">
          {showDropdownOnMobile && show.seasons.length > 1 ? (
            <div className="relative inline-flex items-center">
              <select
                value={season.number}
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                aria-label="Select season"
                className="appearance-none bg-transparent font-display font-bold text-[18px] text-ink pr-6 py-0.5 cursor-pointer outline-none"
              >
                {show.seasons.map((s) => (
                  <option key={s.number} value={s.number} className="bg-surface text-ink">
                    Season {s.number}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-ink-dim pointer-events-none -ml-5" />
            </div>
          ) : (
            <h3 className="font-display font-bold text-[18px] text-ink">
              Season {season.number}
            </h3>
          )}

          <div className="flex items-center gap-2.5">
            {sp.seasonRewatch > 1 && (
              <span className="text-[15px] font-bold text-watched tabular-nums">
                x{sp.seasonRewatch}
              </span>
            )}
            <button
              type="button"
              onClick={() => markSeasonWatched(show.id, season.number, true)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/6 hover:bg-white/12 text-ink-dim hover:text-ink transition-colors"
            >
              {sp.watched === sp.total ? '+1 Rewatch' : 'Mark season'}
            </button>
          </div>
        </div>

        <div className="h-[3.5px] w-full rounded-full bg-white/12 overflow-hidden mb-3">
          <div
            className="h-full bg-watched transition-all duration-300"
            style={{ width: `${Math.round(sp.ratio * 100)}%` }}
          />
        </div>

        <div className="divide-y divide-white/[0.06]">
          {season.episodes.map((ep) => {
            const epKey = getEpisodeKey(ep.season, ep.number);
            const count = progress?.episodeCounts?.[epKey] || 0;
            const isStepperOpen = rewatchStepperEp === epKey;

            return (
              <div
                key={ep.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveEpisodeDrawer(ep)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setActiveEpisodeDrawer(ep);
                }}
                className="py-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.025] -mx-2 px-2 rounded-xl transition-colors"
              >
                <div className="w-[88px] h-[50px] rounded-lg overflow-hidden bg-surface shrink-0">
                  <MediaImage
                    src={ep.stillUrl}
                    alt={ep.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-medium text-ink truncate leading-snug">
                    {ep.title}
                  </p>
                  <p className="text-[12.5px] text-ink-dim tabular-nums mt-0.5">
                    E{pad2(ep.number)} · {formatAirDate(ep.airdate)}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isStepperOpen ? (
                    <div className="flex items-center gap-1 bg-surface-raised border border-white/12 rounded-full px-1.5 py-1 animate-fade-in">
                      <button
                        type="button"
                        onClick={() => incrementEpisodeRewatch(show.id, ep.season, ep.number, -1)}
                        aria-label="Decrease watch count"
                        className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-ink-dim"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold text-watched tabular-nums px-1">
                        x{count}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementEpisodeRewatch(show.id, ep.season, ep.number, 1)}
                        aria-label="Increment rewatch count"
                        className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-watched"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewatchStepperEp(null)}
                        className="text-[10px] text-ink-dim px-1.5"
                      >
                        Done
                      </button>
                    </div>
                  ) : count > 1 ? (
                    <button
                      type="button"
                      onClick={() => setRewatchStepperEp(epKey)}
                      title="Adjust rewatch count"
                      className="px-2 py-1 rounded-full text-[15px] font-bold text-watched tabular-nums hover:bg-watched/10 transition-colors"
                    >
                      x{count}
                    </button>
                  ) : count === 1 ? (
                    <button
                      type="button"
                      onClick={() => toggleEpisodeWatched(show.id, ep.season, ep.number)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setRewatchStepperEp(epKey);
                      }}
                      aria-label={`Watched ${ep.title}. Click to toggle`}
                      className="h-9 w-9 rounded-full flex items-center justify-center text-watched hover:bg-watched/10 transition-colors"
                    >
                      <Check className="w-[18px] h-[18px]" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleEpisodeWatched(show.id, ep.season, ep.number)}
                      aria-label={`Mark ${ep.title} watched`}
                      className="h-8 w-8 rounded-full border border-white/15 flex items-center justify-center text-ink-dim hover:border-watched hover:text-watched transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Flat Dark Hero (no gradient) */}
      <div className="relative h-[290px] sm:h-[350px] md:h-[380px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={show.backdropUrl || show.posterUrl}
          alt={show.title}
          className="w-full h-full object-cover object-center opacity-55"
        />
        <div className="absolute inset-0 bg-[#131519]/50" />

        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn fixed top-4 left-4 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="fixed top-4 md:top-20 right-4 md:right-8 z-30">
          <div className="glass-pill rounded-full px-1.5 py-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleShowBookmark(show.id)}
              aria-label="Bookmark show"
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                progress?.bookmarked ? 'text-watched' : 'text-ink'
              }`}
            >
              <Bookmark className="w-4 h-4" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Show options"
              className="h-8 w-8 rounded-full flex items-center justify-center text-ink hover:bg-white/10"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              <button
                type="button"
                onClick={() => {
                  startShowRewatch(show.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log full series rewatch (+1)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  markShowAllWatched(show.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Check className="w-4 h-4 text-watched" />
                <span>Mark all episodes watched</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleShowNotifications(show.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                {progress?.notifications ? (
                  <BellOff className="w-4 h-4 text-ink-dim" />
                ) : (
                  <Bell className="w-4 h-4 text-brand" />
                )}
                <span>
                  {progress?.notifications ? 'Mute release alerts' : 'Enable release alerts'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setListPickerOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <ListPlus className="w-4 h-4 text-brand" />
                <span>Add to custom list</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetShowProgress(show.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset show progress</span>
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
          <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-ink tracking-tight">
            {show.title}
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3">
        {/* Primary Action Bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => toggleShowBookmark(show.id)}
            aria-label="Toggle library bookmark"
            className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-95 ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-5 h-5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          {stats.isFinished ? (
            <button
              type="button"
              onClick={() => startShowRewatch(show.id)}
              className="flex-1 h-12 rounded-full border-2 border-watched text-ink font-semibold text-[15px] flex items-center justify-center gap-2 bg-watched/[0.06] hover:bg-watched/15 transition-colors"
            >
              <Check className="w-5 h-5 text-watched" strokeWidth={2.5} />
              <span>Finished</span>
              {stats.rewatchCount > 1 && (
                <span className="text-watched font-bold text-sm ml-1">· x{stats.rewatchCount}</span>
              )}
            </button>
          ) : stats.nextEpisode ? (
            <button
              type="button"
              onClick={() => watchNextEpisode(show.id)}
              className="flex-1 h-12 rounded-full bg-brand text-brand-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Check className="w-5 h-5" strokeWidth={2.5} />
              <span>
                Watch {formatEpisodeCode(stats.nextEpisode.season, stats.nextEpisode.number)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toggleShowBookmark(show.id)}
              className="flex-1 h-12 rounded-full border border-white/20 text-ink font-semibold text-[15px]"
            >
              + Add to Watch
            </button>
          )}
        </div>

        {/* Show Info */}
        <section className="pb-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[16px] text-ink">Show info</h2>
              <p className="text-[13.5px] text-ink-dim mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{show.year}</span>
                <span>·</span>
                <span>{show.genres.slice(0, 2).join(', ')}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-brand">
                  <Star className="w-3.5 h-3.5 fill-brand" />
                  {show.rating.toFixed(1)}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (progress?.rating || 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => rateShow(show.id, star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-0.5 hover:scale-110 transition-transform"
                  >
                    <Star className={`w-4 h-4 ${active ? 'text-brand fill-brand' : 'text-ink-faint'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {show.overview && (
            <div className="mt-2.5">
              <p
                className={`text-[13.5px] text-ink-dim leading-relaxed ${
                  expandedOverview ? '' : 'line-clamp-2'
                }`}
              >
                {show.overview}
              </p>
              <button
                type="button"
                onClick={() => setExpandedOverview((e) => !e)}
                className="text-xs font-medium text-brand mt-1"
              >
                {expandedOverview ? 'Show less' : 'More'}
              </button>
            </div>
          )}

          {show.cast.length > 0 && (
            <div className="mt-3.5 flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
              {show.cast.map((c) => (
                <div key={c.id} className="w-16 shrink-0 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full overflow-hidden bg-surface border border-white/10">
                    <MediaImage
                      src={c.avatarUrl}
                      alt={c.character}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[11px] font-medium text-ink truncate mt-1">{c.character}</p>
                  <p className="text-[10px] text-ink-faint truncate">{c.actor}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Seasons & Episodes */}
        <section className="pt-5 pb-6">
          <div className="lg:hidden">{activeSeasonObj && renderSeasonColumn(activeSeasonObj, true)}</div>

          <div className="hidden lg:block">
            {show.seasons.length > 2 && (
              <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
                {Array.from({ length: Math.ceil(show.seasons.length / 2) }, (_, idx) => {
                  const sStart = idx * 2;
                  const s1 = show.seasons[sStart];
                  const s2 = show.seasons[sStart + 1];
                  const active = seasonPairStart === sStart;
                  return (
                    <button
                      key={sStart}
                      type="button"
                      onClick={() => setSeasonPairStart(sStart)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-brand text-brand-ink'
                          : 'bg-surface border border-white/10 text-ink-dim hover:text-ink'
                      }`}
                    >
                      {s2 ? `Seasons ${s1.number}–${s2.number}` : `Season ${s1.number}`}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-8">
              {desktopSeasons.map((season) => renderSeasonColumn(season, false))}
            </div>
          </div>
        </section>

        {/* Private Personal Mood & Notes */}
        <PersonalNotesSection
          domain="watch"
          mediaKind="show"
          mediaId={show.id}
          mediaTitle={show.title}
          mediaPoster={show.posterUrl}
          defaultContext={
            stats.nextEpisode
              ? formatEpisodeCode(stats.nextEpisode.season, stats.nextEpisode.number)
              : undefined
          }
          currentRating={progress?.rating}
          currentMood={progress?.mood}
          onSelectMood={(mood) => setShowMood(show.id, mood)}
        />
      </div>

      {/* Private Episode Note & Rewatch Drawer */}
      {activeEpisodeDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setActiveEpisodeDrawer(null)}
        >
          <div
            className="w-full md:max-w-md bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl space-y-4 animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-brand tabular-nums">
                  {formatEpisodeCode(activeEpisodeDrawer.season, activeEpisodeDrawer.number)}
                </p>
                <h3 className="font-display font-bold text-lg text-ink">
                  {activeEpisodeDrawer.title}
                </h3>
                <p className="text-xs text-ink-dim mt-0.5">
                  {formatAirDate(activeEpisodeDrawer.airdate)} · {activeEpisodeDrawer.runtime}m
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveEpisodeDrawer(null)}
                className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeEpisodeDrawer.overview && (
              <p className="text-xs text-ink-dim leading-relaxed">{activeEpisodeDrawer.overview}</p>
            )}

            <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
              <span className="text-sm font-medium text-ink">Watches logged</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    incrementEpisodeRewatch(
                      show.id,
                      activeEpisodeDrawer.season,
                      activeEpisodeDrawer.number,
                      -1
                    )
                  }
                  className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-ink"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-display font-bold text-base text-watched tabular-nums min-w-[2.2rem] text-center">
                  x
                  {progress?.episodeCounts?.[
                    getEpisodeKey(activeEpisodeDrawer.season, activeEpisodeDrawer.number)
                  ] || 0}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    incrementEpisodeRewatch(
                      show.id,
                      activeEpisodeDrawer.season,
                      activeEpisodeDrawer.number,
                      1
                    )
                  }
                  className="w-8 h-8 rounded-full bg-watched/20 text-watched flex items-center justify-center"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!epNoteText.trim()) return;
                addJournalEntry({
                  domain: 'watch',
                  mediaKind: 'show',
                  mediaId: show.id,
                  mediaTitle: show.title,
                  mediaPoster: show.posterUrl,
                  contextLabel: formatEpisodeCode(
                    activeEpisodeDrawer.season,
                    activeEpisodeDrawer.number
                  ),
                  text: epNoteText.trim(),
                  rating: progress?.rating,
                  mood: progress?.mood,
                });
                setEpNoteText('');
                setActiveEpisodeDrawer(null);
              }}
              className="space-y-2.5"
            >
              <textarea
                rows={2}
                value={epNoteText}
                onChange={(e) => setEpNoteText(e.target.value)}
                placeholder={`Write a private note about ${formatEpisodeCode(
                  activeEpisodeDrawer.season,
                  activeEpisodeDrawer.number
                )}…`}
                className="w-full rounded-xl bg-surface border border-white/10 p-3 text-sm text-ink outline-none focus:border-brand resize-none"
              />
              <button
                type="submit"
                disabled={!epNoteText.trim()}
                className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold disabled:opacity-40"
              >
                Save episode note
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add to Custom List Modal */}
      {listPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setListPickerOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg text-ink mb-3">Add to custom list</h3>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {state.lists.map((list) => {
                const included = list.items.some((x) => x.kind === 'show' && x.id === show.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'show', show.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-surface border border-white/8 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{list.name}</p>
                      <p className="text-xs text-ink-dim">{list.items.length} titles</p>
                    </div>
                    {included && <Check className="w-4 h-4 text-watched" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="New list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="flex-1 rounded-xl bg-surface border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newListName.trim()) return;
                  createCustomList(newListName, '', { kind: 'show', id: show.id });
                  setNewListName('');
                }}
                className="px-4 py-2 rounded-xl bg-brand text-brand-ink text-sm font-semibold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
