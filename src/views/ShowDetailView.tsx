import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bell,
  BellOff,
  Bookmark,
  CalendarCheck2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  ListPlus,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Star,
  Wrench,
  X,
} from 'lucide-react';
import { CollectionDetailCard, CollectionHeroButton } from '../components/CollectionDetailCard';
import { CoverLightbox } from '../components/CoverLightbox';
import { DetailModeToggle } from '../components/DetailModeToggle';
import {
  CompactFinishedDateRow,
  FinishedDateRow,
  formatFinishedDate,
} from '../components/FinishedDateCard';
import { FixMediaInfoModal } from '../components/FixMediaInfoModal';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { HeroRatingCard, RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import { fetchAnimeEpisodeDetails, hydrateLiveShow } from '../services/mediaApi';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { DetailCardMode, Episode, Season } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import {
  formatRating,
  getSeasonEpisodeAverage,
  getShowCalculatedAverage,
} from '../utils/ratings';
import {
  cleanDisplayGenres,
  formatAirDate,
  formatEpisodeCode,
  formatUpcomingReleaseLabel,
  getAllEpisodes,
  getEpisodeKey,
  getSeasonProgress,
  getShowStats,
  isEpisodeReleased,
  pad2,
} from '../utils/stats';

const sessionDetailModeByShowId = new Map<string, DetailCardMode>();

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
    rateEpisode,
    rateSeason,
    rateShow,
    setEpisodeFinishedDate,
    setSeasonFinishedDate,
    setMediaOwnership,
    updateMediaCollectionDetails,
    setShowMood,
    setMediaFinishedDate,
    addCompletionRun,
    updateCompletionRunDate,
    deleteCompletionRun,
    updateShowEpisodes,
    updateShowMetadata,
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
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [rewatchStepperEp, setRewatchStepperEp] = useState<string | null>(null);
  const [activeEpisodeDrawer, setActiveEpisodeDrawer] = useState<Episode | null>(null);
  const [epNoteText, setEpNoteText] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useModalBackHandler(Boolean(activeEpisodeDrawer), () => setActiveEpisodeDrawer(null));
  useModalBackHandler(listPickerOpen, () => setListPickerOpen(false));
  const [detailMode, setDetailMode] = useState<DetailCardMode>(
    () => sessionDetailModeByShowId.get(showId) || state.settings.detailMode || 'simple'
  );
  const [expandedSeasons, setExpandedSeasons] = useState<Record<number, boolean>>(() => {
    if (!show || show.seasons.length === 0) return {};
    const st = getShowStats(show, progress);
    const activeNum = st.nextEpisode?.season ?? show.seasons[show.seasons.length - 1].number;
    return { [activeNum]: true };
  });

  useEffect(() => {
    setDetailMode(sessionDetailModeByShowId.get(showId) || state.settings.detailMode || 'simple');
    if (show && show.seasons.length > 0) {
      const st = getShowStats(show, progress);
      const activeNum = st.nextEpisode?.season ?? show.seasons[show.seasons.length - 1].number;
      setExpandedSeasons({ [activeNum]: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  const enrichedAnimeRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!show || !show.anilistId || show.seasons.length > 1) return;
    if (enrichedAnimeRef.current.has(show.id)) return;
    const allEps = show.seasons.flatMap((s) => s.episodes);
    const uniqueStills = new Set(allEps.map((e) => e.stillUrl).filter(Boolean));
    const hasPlaceholderTitles =
      allEps.length > 0 && allEps.every((e) => /^Episode \d+$/i.test(e.title));
    const needsEnrich =
      allEps.length > 0 &&
      (uniqueStills.size <= 1 || hasPlaceholderTitles || show.cast.length === 0);
    if (!needsEnrich) return;

    const anilistId =
      show.anilistId ||
      (show.id.startsWith('anilist-') ? Number(show.id.replace('anilist-', '')) : undefined);
    let cancelled = false;
    fetchAnimeEpisodeDetails(
      anilistId,
      show.title,
      allEps.length,
      show.backdropUrl || show.posterUrl,
      show.id
    ).then((res) => {
      if (cancelled) return;
      enrichedAnimeRef.current.add(show.id);
      if (res && res.episodes.length > 0) {
        updateShowEpisodes(
          show.id,
          [{ number: show.seasons[0]?.number || 1, episodes: res.episodes }],
          res.cast,
          res.runtimeAvg
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [show, updateShowEpisodes]);

  const handleDetailModeChange = (nextMode: DetailCardMode) => {
    sessionDetailModeByShowId.set(showId, nextMode);
    setDetailMode(nextMode);
  };

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
  const showCalcAvg = getShowCalculatedAverage(show, progress);
  const nowRef = new Date();
  const showHasRealAirdates = getAllEpisodes(show).some((ep) =>
    Boolean(ep.airdate || ep.airstamp)
  );

  const renderSeasonColumn = (season: Season, showDropdownOnMobile = false) => {
    const sp = getSeasonProgress(show, season.number, progress);
    const epAvg = getSeasonEpisodeAverage(show, season.number, progress);
    const seasonRating = progress?.seasonRatings?.[season.number];
    const seasonSource = progress?.seasonRatingSource?.[season.number];
    const showSeasonSuggestion =
      (epAvg && sp.airedTotal > 0 && sp.watched === sp.airedTotal && !seasonRating) ||
      (detailMode === 'advanced' && (Boolean(epAvg) || Boolean(seasonRating) || sp.watched > 0));

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
              {sp.airedTotal > 0 && sp.watched >= sp.airedTotal ? '+1 Rewatch' : 'Mark season'}
            </button>
          </div>
        </div>

        <div className="h-[3.5px] w-full rounded-full bg-white/12 overflow-hidden mb-3">
          <div
            className="h-full bg-watched transition-all duration-300"
            style={{ width: `${Math.round(sp.ratio * 100)}%` }}
          />
        </div>

        {showSeasonSuggestion && (
          <div className="mb-3 space-y-2">
            {epAvg ? (
              <SuggestedRatingBanner
                compact
                label={`Season ${season.number}`}
                calculatedAvg={epAvg.avg}
                ratedCount={epAvg.count}
                unitWord="episodes"
                currentRating={seasonRating}
                ratingSource={seasonSource}
                onAcceptAvg={(avg) => rateSeason(show.id, season.number, avg, 'auto')}
                onManualRate={(r) => rateSeason(show.id, season.number, r, 'manual')}
              />
            ) : (
              <div className="rounded-2xl bg-surface border border-white/[0.06] px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-dim">Rate Season {season.number}</span>
                <RatingControl
                  size="sm"
                  value={seasonRating}
                  onChange={(r) => rateSeason(show.id, season.number, r, 'manual')}
                  labelPrefix={`Rate Season ${season.number}`}
                  allowClear
                />
              </div>
            )}
            <CompactFinishedDateRow
              variant="inline"
              label={`Season ${season.number} finished`}
              finishedAt={progress?.seasonFinishedAt?.[season.number]}
              onChangeDate={(ymd) => setSeasonFinishedDate(show.id, season.number, ymd)}
            />
          </div>
        )}

        <div className="divide-y divide-white/[0.06]">
          {season.episodes.map((ep) => {
            const epKey = getEpisodeKey(ep.season, ep.number);
            const count = progress?.episodeCounts?.[epKey] || 0;
            const epRating = progress?.episodeRatings?.[epKey];
            const isStepperOpen = rewatchStepperEp === epKey;
            const epReleased = isEpisodeReleased(ep, nowRef, showHasRealAirdates);
            const epDateLabel = epReleased
              ? formatAirDate(ep.airdate)
              : formatUpcomingReleaseLabel(ep.airdate, ep.airstamp, nowRef);

            return (
              <div
                key={ep.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setEpNoteText('');
                  setActiveEpisodeDrawer(ep);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEpNoteText('');
                    setActiveEpisodeDrawer(ep);
                  }
                }}
                className={`py-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.025] -mx-2 px-2 rounded-xl transition-colors ${
                  count === 0 && !epReleased ? 'opacity-70' : ''
                }`}
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
                  <p className="text-[12.5px] text-ink-dim tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      E{pad2(ep.number)} · {epDateLabel}
                    </span>
                    {count === 0 && !epReleased && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] font-semibold text-ink-dim">
                        Upcoming
                      </span>
                    )}
                    {typeof epRating === 'number' && epRating > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand">
                        · <Star className="w-3 h-3 fill-brand" />
                        {formatRating(epRating)}
                      </span>
                    )}
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
      <div className="relative h-[270px] sm:h-[340px] w-full overflow-hidden border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="View poster fullscreen"
          className="block w-full h-full relative cursor-zoom-in text-left"
        >
          <MediaImage
            src={show.backdropUrl || show.posterUrl}
            alt={show.title}
            className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
          />
          <div className="absolute inset-0 bg-[#131519]/65" />
        </button>

        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn fixed top-4 left-4 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="fixed top-4 md:top-20 right-4 md:right-8 z-30">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Show options"
            className="glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

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
                  setFixModalOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Wrench className="w-4 h-4 text-brand" />
                <span>Fix info &amp; episodes</span>
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

        <div className="pointer-events-none absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="View cover fullscreen"
            className="pointer-events-auto group relative w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-surface cursor-zoom-in"
          >
            <MediaImage src={show.posterUrl} alt={show.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" />
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand">
                Series
              </span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {show.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {[show.network, show.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5">
        {/* Primary Action Bar */}
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => toggleShowBookmark(show.id)}
            aria-label="Toggle library bookmark"
            className={`h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-95 ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-4.5 h-4.5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          <CollectionHeroButton
            domain="watch"
            ownership={progress?.ownership}
            onCycle={(next) => setMediaOwnership('show', show.id, next)}
          />

          {stats.isFinished ? (
            <button
              type="button"
              onClick={() => startShowRewatch(show.id)}
              className="flex-1 h-11 rounded-full border-2 border-watched text-ink font-semibold text-sm flex items-center justify-center gap-2 bg-watched/[0.06] hover:bg-watched/15 transition-colors"
            >
              <Check className="w-4.5 h-4.5 text-watched" strokeWidth={2.5} />
              <span>Finished</span>
              {stats.rewatchCount > 1 && (
                <span className="text-watched font-bold text-xs ml-0.5">· x{stats.rewatchCount}</span>
              )}
            </button>
          ) : stats.nextEpisode ? (
            <button
              type="button"
              onClick={() => watchNextEpisode(show.id)}
              className={`flex-1 h-11 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
                stats.watchedUnique > 0
                  ? 'border border-white/15 bg-surface hover:bg-surface-raised text-ink'
                  : 'bg-brand text-brand-ink hover:opacity-95'
              }`}
            >
              <Check
                className={`w-4.5 h-4.5 ${stats.watchedUnique > 0 ? 'text-watched' : 'text-brand-ink'}`}
                strokeWidth={2.5}
              />
              <span>
                {stats.watchedUnique > 0
                  ? `${stats.watchedUnique}/${stats.unreleasedEpisodes > 0 ? `${stats.airedEpisodes} aired` : stats.totalEpisodes} watched`
                  : `Watch ${formatEpisodeCode(stats.nextEpisode.season, stats.nextEpisode.number)}`}
              </span>
            </button>
          ) : stats.nextUpcomingEpisode ? (
            <div className="flex-1 h-11 rounded-full border border-white/15 bg-surface text-ink-dim font-medium text-xs sm:text-sm flex items-center justify-center gap-2 px-3 min-w-0">
              <Clock className="w-4 h-4 text-watch shrink-0" />
              <span className="truncate">
                {stats.watchedUnique > 0
                  ? `Caught up · Next ${formatEpisodeCode(
                      stats.nextUpcomingEpisode.season,
                      stats.nextUpcomingEpisode.number
                    )} (${formatUpcomingReleaseLabel(
                      stats.nextUpcomingEpisode.airdate,
                      stats.nextUpcomingEpisode.airstamp,
                      nowRef
                    )})`
                  : `Premieres ${formatUpcomingReleaseLabel(
                      stats.nextUpcomingEpisode.airdate,
                      stats.nextUpcomingEpisode.airstamp,
                      nowRef
                    )}`}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => toggleShowBookmark(show.id)}
              className="flex-1 h-11 rounded-full border border-white/20 text-ink font-semibold text-sm"
            >
              + Add to Watch
            </button>
          )}
        </div>

        <DetailModeToggle mode={detailMode} onChange={handleDetailModeChange} />

        <div key={detailMode} data-detail-mode={detailMode} className="animate-detail-flip">
          {detailMode === 'simple' ? (
            <>
              {/* Simple Clean Meta, Overview & Compact Pills */}
              <section className="pb-4 border-b border-white/[0.08]">
                <p className="text-[13px] text-ink-dim tabular-nums">
                  {[show.year, `${show.runtimeAvg} min`, show.network].filter(Boolean).join(' · ')}
                </p>

                {show.overview && (
                  <div className="mt-2">
                    <p
                      className={`text-[13.5px] text-ink/85 leading-relaxed ${
                        expandedOverview ? '' : 'line-clamp-2'
                      }`}
                    >
                      {show.overview}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedOverview((e) => !e)}
                      className="text-xs font-medium text-ink-dim hover:text-ink mt-1"
                    >
                      {expandedOverview ? 'Show less' : 'See more'}
                    </button>
                  </div>
                )}

                {cleanDisplayGenres(show.genres).length > 0 && (
                  <p className="text-[12.5px] text-ink-faint mt-1.5">
                    {cleanDisplayGenres(show.genres).slice(0, 3).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-brand text-brand" />
                    {show.rating.toFixed(1)}/10
                  </span>
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-medium text-ink-dim tabular-nums">
                    {stats.unreleasedEpisodes > 0
                      ? `${stats.watchedUnique}/${stats.airedEpisodes} aired · ${stats.unreleasedEpisodes} upcoming`
                      : `${stats.watchedUnique}/${stats.totalEpisodes} episodes`}
                  </span>
                  {typeof progress?.rating === 'number' && progress.rating > 0 && (
                    <span className="bg-surface border border-brand/35 rounded-full px-3 py-1 text-xs font-semibold text-brand inline-flex items-center gap-1 tabular-nums">
                      Your rating ★ {formatRating(progress.rating)}/5
                    </span>
                  )}
                  {stats.isFinished && formatFinishedDate(progress?.finishedAt || progress?.lastWatchedAt) && (
                    <span className="bg-surface border border-watched/35 rounded-full px-3 py-1 text-xs font-medium text-watched inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      Finished {formatFinishedDate(progress?.finishedAt || progress?.lastWatchedAt)}
                    </span>
                  )}
                  {(() => {
                    const colBadge = getMediaCollectionBadge('show', show, progress);
                    if (!colBadge.badgeText) return null;
                    return (
                      <span className="bg-surface border border-watch/35 rounded-full px-3 py-1 text-xs font-medium text-watch inline-flex items-center gap-1.5 tabular-nums">
                        <Archive className="w-3.5 h-3.5" />
                        {colBadge.badgeText}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setFixModalOpen(true)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold border bg-surface border-white/[0.08] text-ink-dim hover:text-ink inline-flex items-center gap-1 transition-colors"
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    <span>Fix</span>
                  </button>
                </div>
              </section>

              <section className="pt-4 pb-2">
                <HeroRatingCard
                  value={progress?.rating}
                  ratingSource={progress?.ratingSource}
                  onChange={(r) => rateShow(show.id, r, 'manual')}
                  promptLabel="Rate this show"
                  ariaPrefix={`Rate ${show.title}`}
                />
              </section>

              {/* Simple Accordion Seasons & Bare-Checkmark Episodes */}
              <section className="pt-2 pb-4 divide-y divide-white/[0.06]">
                {show.seasons.map((season) => {
                  const sp = getSeasonProgress(show, season.number, progress);
                  const isOpen = Boolean(expandedSeasons[season.number]);
                  const seasonDone = sp.airedTotal > 0 && sp.watched >= sp.airedTotal;
                  return (
                    <div key={season.number} className="py-2">
                      <div className="flex items-center justify-between gap-3 py-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSeasons((prev) => ({
                              ...prev,
                              [season.number]: !prev[season.number],
                            }))
                          }
                          aria-expanded={isOpen}
                          className="flex items-center gap-1.5 font-display font-bold text-[15px] text-ink text-left"
                        >
                          <span>Season {season.number}</span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-ink-dim" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-ink-dim" />
                          )}
                        </button>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              seasonDone ? 'text-watched' : 'text-ink-dim'
                            }`}
                          >
                            {sp.watched}/{sp.unreleased > 0 ? `${sp.airedTotal} aired` : sp.total}
                          </span>
                          <button
                            type="button"
                            onClick={() => markSeasonWatched(show.id, season.number, false)}
                            aria-label={`Mark Season ${season.number} watched`}
                            className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
                              seasonDone
                                ? 'text-watched'
                                : 'text-ink-faint hover:text-watched'
                            }`}
                          >
                            <Check className="w-[17px] h-[17px]" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>

                      <div className="h-[2.5px] w-full rounded-full bg-white/10 overflow-hidden mb-1">
                        <div
                          className="h-full bg-watched transition-all duration-300"
                          style={{ width: `${Math.round(sp.ratio * 100)}%` }}
                        />
                      </div>

                      {isOpen && (
                        <div className="divide-y divide-white/[0.06] pt-1">
                          {(seasonDone || Boolean(progress?.seasonFinishedAt?.[season.number]) || Boolean(progress?.seasonRatings?.[season.number])) && (
                            <div className="pb-2.5 pt-1">
                              <CompactFinishedDateRow
                                variant="inline"
                                label={`Season ${season.number} finished`}
                                finishedAt={progress?.seasonFinishedAt?.[season.number]}
                                onChangeDate={(ymd) =>
                                  setSeasonFinishedDate(show.id, season.number, ymd)
                                }
                              />
                            </div>
                          )}
                          {season.episodes.map((ep) => {
                            const epKey = getEpisodeKey(ep.season, ep.number);
                            const count = progress?.episodeCounts?.[epKey] || 0;
                            const epRating = progress?.episodeRatings?.[epKey];
                            const isWatched = count > 0;
                            const epReleased = isEpisodeReleased(ep, nowRef, showHasRealAirdates);
                            const epDateLabel = epReleased
                              ? formatAirDate(ep.airdate)
                              : formatUpcomingReleaseLabel(ep.airdate, ep.airstamp, nowRef);
                            return (
                              <div
                                key={ep.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setEpNoteText('');
                                  setActiveEpisodeDrawer(ep);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setEpNoteText('');
                                    setActiveEpisodeDrawer(ep);
                                  }
                                }}
                                className={`py-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.025] -mx-2 px-2 rounded-xl transition-colors ${
                                  !isWatched && !epReleased ? 'opacity-70' : ''
                                }`}
                              >
                                <div className="w-[84px] h-[48px] rounded-lg overflow-hidden bg-surface shrink-0">
                                  <MediaImage
                                    src={ep.stillUrl}
                                    alt={ep.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[14px] font-medium text-ink truncate leading-snug">
                                    {ep.title}
                                  </p>
                                  <p className="text-[12px] text-ink-dim tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    <span>
                                      E{pad2(ep.number)} · {epDateLabel}
                                    </span>
                                    {!isWatched && !epReleased && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] font-semibold text-ink-dim">
                                        Upcoming
                                      </span>
                                    )}
                                    {typeof epRating === 'number' && epRating > 0 && (
                                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand">
                                        · <Star className="w-3 h-3 fill-brand" />
                                        {formatRating(epRating)}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleEpisodeWatched(show.id, ep.season, ep.number);
                                  }}
                                  aria-label={
                                    isWatched
                                      ? `Unmark ${ep.title} watched`
                                      : `Mark ${ep.title} watched`
                                  }
                                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                    isWatched
                                      ? 'text-watched'
                                      : 'text-ink-faint hover:text-watched'
                                  }`}
                                >
                                  <Check className="w-[17px] h-[17px]" strokeWidth={2.5} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {/* Simple Portrait Cast Strip */}
              {show.cast.length > 0 && (
                <section className="pt-3 pb-2">
                  <h2 className="font-display font-bold text-[16px] text-ink mb-3">Cast</h2>
                  <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
                    {show.cast.map((c) => (
                      <div key={c.id} className="w-[104px] shrink-0 text-left">
                        <div className="aspect-[3/4] rounded-xl overflow-hidden bg-surface border border-white/[0.06]">
                          <MediaImage
                            src={c.avatarUrl}
                            alt={c.actor}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <p className="text-xs font-semibold text-ink truncate mt-1.5">{c.actor}</p>
                        <p className="text-[10px] uppercase tracking-wider text-ink-faint truncate">
                          {c.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {/* Advanced Card 1: Tracking Overview & Finished Date */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-4 mb-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wider text-ink-dim">
                      {stats.unreleasedEpisodes > 0 ? 'Aired progress' : 'Series progress'}
                    </span>
                    <span className="font-bold text-watched tabular-nums">
                      {Math.round(
                        (stats.unreleasedEpisodes > 0
                          ? stats.airedProgressRatio
                          : stats.progressRatio) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-watched transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          (stats.unreleasedEpisodes > 0
                            ? stats.airedProgressRatio
                            : stats.progressRatio) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-background/50 border border-white/[0.05] grid grid-cols-3 divide-x divide-white/[0.06] text-center">
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      {stats.unreleasedEpisodes > 0 ? 'Aired' : 'Episodes'}
                    </p>
                    <p className="font-display font-bold text-base sm:text-lg text-watched tabular-nums mt-0.5">
                      {stats.watchedUnique} /{' '}
                      {stats.unreleasedEpisodes > 0 ? stats.airedEpisodes : stats.totalEpisodes}
                    </p>
                    {stats.unreleasedEpisodes > 0 && (
                      <p className="text-[10px] text-ink-faint tabular-nums mt-0.5">
                        +{stats.unreleasedEpisodes} upcoming
                      </p>
                    )}
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Runtime
                    </p>
                    <p className="font-display font-bold text-base sm:text-lg text-ink tabular-nums mt-0.5">
                      {show.runtimeAvg}m avg
                    </p>
                  </div>
                  <div className="py-3 px-2 min-w-0">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Network
                    </p>
                    <p className="font-display font-bold text-sm text-ink truncate mt-1">
                      {show.network || 'Streaming'}
                    </p>
                  </div>
                </div>

                <FinishedDateRow
                  isFinished={stats.isFinished}
                  finishedAt={progress?.finishedAt}
                  fallbackDate={progress?.lastWatchedAt}
                  verbLabel="Finished"
                  onChangeDate={(ymd) => setMediaFinishedDate('show', show.id, ymd)}
                  onMarkFinished={() => markShowAllWatched(show.id)}
                  completedRuns={progress?.completedRuns}
                  runVerb="rewatch"
                  onAddRun={(ymd, note) => addCompletionRun('show', show.id, ymd, note)}
                  onUpdateRunDate={(runId, ymd) => updateCompletionRunDate('show', show.id, runId, ymd)}
                  onDeleteRun={(runId) => deleteCompletionRun('show', show.id, runId)}
                />
              </section>

              {/* Advanced Card 2: Rating, About & Portrait Cast */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-3.5 mb-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[16px] text-ink">Show info</h2>
                    <p className="text-[13px] text-ink-dim mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{show.year}</span>
                      {cleanDisplayGenres(show.genres).length > 0 && (
                        <>
                          <span>·</span>
                          <span>{cleanDisplayGenres(show.genres).slice(0, 2).join(', ')}</span>
                        </>
                      )}
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-brand font-semibold">
                        <Star className="w-3.5 h-3.5 fill-brand" />
                        {show.rating.toFixed(1)}/10
                      </span>
                    </p>
                  </div>

                  <RatingControl
                    value={progress?.rating}
                    onChange={(r) => rateShow(show.id, r, 'manual')}
                    labelPrefix="Rate show"
                    allowClear
                  />
                </div>

                {showCalcAvg && showCalcAvg.count > 0 && (
                  <SuggestedRatingBanner
                    compact
                    label={show.title}
                    calculatedAvg={showCalcAvg.avg}
                    ratedCount={showCalcAvg.count}
                    unitWord={showCalcAvg.basis}
                    currentRating={progress?.rating}
                    ratingSource={progress?.ratingSource}
                    onAcceptAvg={(avg) => rateShow(show.id, avg, 'auto')}
                    onManualRate={(r) => rateShow(show.id, r, 'manual')}
                  />
                )}

                {show.overview && (
                  <div>
                    <p
                      className={`text-[13.5px] text-ink-dim leading-relaxed ${
                        expandedOverview ? '' : 'line-clamp-3'
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
                  <div className="pt-2 border-t border-white/[0.06]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2.5">
                      Cast
                    </p>
                    <div className="flex items-start gap-3 overflow-x-auto no-scrollbar pb-1">
                      {show.cast.map((c) => (
                        <div key={c.id} className="w-[88px] shrink-0 text-left">
                          <div className="aspect-[3/4] rounded-xl overflow-hidden bg-background border border-white/[0.06]">
                            <MediaImage
                              src={c.avatarUrl}
                              alt={c.actor}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-[11.5px] font-semibold text-ink truncate mt-1.5">
                            {c.actor}
                          </p>
                          <p className="text-[10px] uppercase tracking-wider text-ink-faint truncate">
                            {c.character}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Advanced Card 3: Collection */}
              <CollectionDetailCard
                domain="watch"
                ownership={progress?.ownership}
                details={progress?.collection}
                badgeText={getMediaCollectionBadge('show', show, progress).badgeText}
                fallbackMinutes={Math.max(1, show.totalEpisodes || 1) * (show.runtimeAvg || 42)}
                onChangeOwnership={(next) => setMediaOwnership('show', show.id, next)}
                onSaveDetails={(details, own) =>
                  updateMediaCollectionDetails('show', show.id, details, own)
                }
              />

              {/* Advanced Card 4: Seasons & Episodes */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 mb-5">
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
                                : 'bg-background border border-white/10 text-ink-dim hover:text-ink'
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
            </>
          )}
        </div>
      </div>

      <CoverLightbox
        open={lightboxOpen}
        src={show.posterUrl}
        title={show.title}
        subtitle={
          cleanDisplayGenres(show.genres).length > 0
            ? `${show.year} · ${cleanDisplayGenres(show.genres).slice(0, 2).join(', ')}`
            : String(show.year)
        }
        onClose={() => setLightboxOpen(false)}
      />

      {/* Private Episode Note & Rewatch Drawer */}
      {activeEpisodeDrawer && (() => {
        const epCode = formatEpisodeCode(
          activeEpisodeDrawer.season,
          activeEpisodeDrawer.number
        );
        const savedEpNotes = state.journalEntries.filter(
          (entry) => entry.mediaId === show.id && entry.contextLabel === epCode
        );
        return (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
            onClick={() => setActiveEpisodeDrawer(null)}
          >
            <div
              className="w-full md:max-w-md max-h-[88dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl space-y-4 animate-sheet-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand tabular-nums">{epCode}</p>
                  <h3 className="font-display font-bold text-lg text-ink leading-snug">
                    {activeEpisodeDrawer.title}
                  </h3>
                  <p className="text-xs text-ink-dim mt-0.5">
                    {formatAirDate(activeEpisodeDrawer.airdate)} · {activeEpisodeDrawer.runtime}m
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveEpisodeDrawer(null)}
                  aria-label="Close episode details"
                  className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {activeEpisodeDrawer.stillUrl && (
                <div className="aspect-video w-full rounded-2xl overflow-hidden bg-surface border border-white/[0.06]">
                  <MediaImage
                    src={activeEpisodeDrawer.stillUrl}
                    alt={activeEpisodeDrawer.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {activeEpisodeDrawer.overview && (
                <p className="text-xs text-ink-dim leading-relaxed">
                  {activeEpisodeDrawer.overview}
                </p>
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

              <CompactFinishedDateRow
                variant="drawer"
                label="Episode finished"
                finishedAt={
                  progress?.episodeFinishedAt?.[
                    getEpisodeKey(activeEpisodeDrawer.season, activeEpisodeDrawer.number)
                  ]
                }
                onChangeDate={(ymd) =>
                  setEpisodeFinishedDate(
                    show.id,
                    activeEpisodeDrawer.season,
                    activeEpisodeDrawer.number,
                    ymd
                  )
                }
              />

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <span className="text-sm font-medium text-ink">Episode rating</span>
                <RatingControl
                  value={
                    progress?.episodeRatings?.[
                      getEpisodeKey(activeEpisodeDrawer.season, activeEpisodeDrawer.number)
                    ]
                  }
                  onChange={(r) =>
                    rateEpisode(show.id, activeEpisodeDrawer.season, activeEpisodeDrawer.number, r)
                  }
                  labelPrefix="Rate episode"
                  allowClear
                />
              </div>

              {savedEpNotes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Your {epCode} notes
                  </p>
                  {savedEpNotes.slice(0, 3).map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl bg-surface border border-white/[0.06] px-3 py-2 text-xs text-ink leading-relaxed"
                    >
                      {note.text}
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!epNoteText.trim()) return;
                  const epRate =
                    progress?.episodeRatings?.[
                      getEpisodeKey(activeEpisodeDrawer.season, activeEpisodeDrawer.number)
                    ];
                  addJournalEntry({
                    domain: 'watch',
                    mediaKind: 'show',
                    mediaId: show.id,
                    mediaTitle: show.title,
                    mediaPoster: show.posterUrl,
                    contextLabel: epCode,
                    text: epNoteText.trim(),
                    rating: epRate ?? progress?.rating,
                    mood: progress?.mood,
                  });
                  setEpNoteText('');
                }}
                className="space-y-2.5"
              >
                <textarea
                  rows={2}
                  value={epNoteText}
                  onChange={(e) => setEpNoteText(e.target.value)}
                  placeholder={`Write a private note about ${epCode}…`}
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
        );
      })()}

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

      <FixMediaInfoModal
        open={fixModalOpen}
        onClose={() => setFixModalOpen(false)}
        kind="show"
        title={show.title}
        year={show.year}
        coverUrl={show.posterUrl}
        unitLabel="episodes"
        currentTotal={stats.totalEpisodes}
        refreshLabel="Refresh episodes"
        onRefreshLive={async () => {
          if (show.anilistId || show.id.startsWith('anilist-')) {
            const alId =
              show.anilistId || Number(show.id.replace('anilist-', '')) || undefined;
            const res = await fetchAnimeEpisodeDetails(
              alId,
              show.title,
              stats.totalEpisodes,
              show.backdropUrl || show.posterUrl,
              show.id
            );
            if (res && res.episodes.length > 0) {
              updateShowEpisodes(
                show.id,
                [{ number: show.seasons[0]?.number || 1, episodes: res.episodes }],
                res.cast,
                res.runtimeAvg
              );
              return { total: res.episodes.length, sourceLabel: 'AniList / AniZip' };
            }
            return null;
          }
          if (show.tmdbId || show.tvmazeId) {
            const isTmdb = Boolean(show.tmdbId);
            const refreshed = await hydrateLiveShow(
              {
                domain: 'watch',
                kind: 'show',
                id: show.id,
                source: isTmdb ? 'tmdb' : 'tvmaze',
                externalId: show.tmdbId || show.tvmazeId || show.id,
                title: show.title,
                year: show.year,
                mediaType: 'tv',
                genres: show.genres,
                rating: show.rating,
                posterUrl: show.posterUrl,
                backdropUrl: show.backdropUrl,
                overview: show.overview,
                runtime: show.runtimeAvg,
              },
              state.settings.tmdbApiKey
            );
            if (refreshed.seasons.length > 0) {
              updateShowEpisodes(show.id, refreshed.seasons, refreshed.cast, refreshed.runtimeAvg);
              const totalEps = refreshed.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
              return {
                total: totalEps || refreshed.totalEpisodes,
                sourceLabel: isTmdb ? 'TMDB' : 'TVMaze',
              };
            }
          }
          return null;
        }}
        onSave={(patch) => {
          updateShowMetadata(show.id, {
            title: patch.title,
            year: patch.year,
            posterUrl: patch.coverUrl,
            totalEpisodes: patch.totalUnits,
          });
        }}
      />
    </div>
  );
}
