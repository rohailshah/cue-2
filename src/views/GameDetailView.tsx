import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  CalendarCheck2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ListPlus,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
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
import { FixMediaInfoModal, type FixMediaRefreshResult } from '../components/FixMediaInfoModal';
import { GameChapterSuggestSheet } from '../components/GameChapterSuggestSheet';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { HeroRatingCard, RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import { enrichGameStub, fetchGameChapterInfo } from '../services/mediaApi';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { DetailCardMode, GameChapterUnit, GamePlatform } from '../types';
import { getMediaCollectionBadge } from '../utils/collection';
import { getOfficialGameChapter, lookupKnownGameChapters } from '../utils/gameChapters';
import { formatRating, getGameChaptersAverage } from '../utils/ratings';
import { cleanDisplayGenres, formatGameMeta } from '../utils/stats';

const PLATFORMS: GamePlatform[] = ['PC', 'PS5', 'Switch', 'Xbox', 'Steam Deck'];
const CHAPTER_UNITS: GameChapterUnit[] = ['chapters', 'acts', 'missions', 'milestones'];

function unitSingular(unit: GameChapterUnit): string {
  if (unit === 'acts') return 'act';
  if (unit === 'missions') return 'mission';
  if (unit === 'milestones') return 'milestone';
  return 'chapter';
}

function sourceChipLabel(source?: string): string | null {
  if (source === 'catalog') return 'Catalog';
  if (source === 'wikipedia') return 'Wikipedia';
  if (source === 'web') return 'Web';
  if (source === 'manual') return 'Custom';
  return null;
}

const sessionDetailModeByGameId = new Map<string, DetailCardMode>();

export function GameDetailView({ gameId }: { gameId: string }) {
  const {
    state,
    goBack,
    logGameSession,
    advanceGameChapter,
    setGameChapter,
    updateGameChaptersMeta,
    updateGameMetadata,
    applyGameChapterList,
    updateGameProgress,
    toggleGameCompleted,
    toggleGamePlatinum,
    incrementGamePlaythrough,
    toggleGameBookmark,
    rateGame,
    rateGameChapter,
    setGameChapterFinishedDate,
    setGameChapterTitle,
    setMediaOwnership,
    updateMediaCollectionDetails,
    setGameMood,
    setMediaFinishedDate,
    addCompletionRun,
    updateCompletionRunDate,
    deleteCompletionRun,
    resetGameProgress,
    updateSettings,
    addJournalEntry,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<DetailCardMode>(
    () => sessionDetailModeByGameId.get(gameId) || state.settings.detailMode || 'simple'
  );
  const [expandedBuckets, setExpandedBuckets] = useState<Record<number, boolean>>({ 0: true });
  const [checkingChapters, setCheckingChapters] = useState(false);
  const [editingChapters, setEditingChapters] = useState(false);
  const [chapterDraft, setChapterDraft] = useState('');
  const [unitDraft, setUnitDraft] = useState<GameChapterUnit>('chapters');
  const [activeChapterDrawer, setActiveChapterDrawer] = useState<number | null>(null);
  const [chapterNoteText, setChapterNoteText] = useState('');
  const [editingChapterTitle, setEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [enrichingGame, setEnrichingGame] = useState(false);
  const fetchedChaptersRef = useRef<Set<string>>(new Set());
  const enrichedGameRef = useRef<Set<string>>(new Set());

  useModalBackHandler(activeChapterDrawer !== null, () => setActiveChapterDrawer(null));
  useModalBackHandler(listPickerOpen, () => setListPickerOpen(false));

  useEffect(() => {
    setDetailMode(sessionDetailModeByGameId.get(gameId) || state.settings.detailMode || 'simple');
    setExpandedBuckets({ 0: true });
    setActiveChapterDrawer(null);
    setChapterNoteText('');
    setEditingChapterTitle(false);
  }, [gameId, state.settings.detailMode]);

  const handleDetailModeChange = (nextMode: DetailCardMode) => {
    sessionDetailModeByGameId.set(gameId, nextMode);
    setDetailMode(nextMode);
  };

  const game = state.games[gameId];
  const progress = state.gameProgress[gameId];

  useEffect(() => {
    if (!game) return;
    if (game.totalChapters && game.totalChapters > 0) return;
    if (game.chapterSource === 'manual') return;
    if (fetchedChaptersRef.current.has(game.id)) return;

    const curatedSync = lookupKnownGameChapters(game.title);
    if (curatedSync) {
      fetchedChaptersRef.current.add(game.id);
      updateGameChaptersMeta(
        game.id,
        curatedSync.totalChapters,
        curatedSync.unit,
        'catalog',
        curatedSync.note
      );
      return;
    }

    let cancelled = false;
    setCheckingChapters(true);
    fetchGameChapterInfo(game.title)
      .then((res) => {
        if (cancelled) return;
        fetchedChaptersRef.current.add(game.id);
        if (res.found && res.totalChapters) {
          updateGameChaptersMeta(
            game.id,
            res.totalChapters,
            res.unit || 'chapters',
            res.source || 'web',
            res.note
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingChapters(false);
      });

    return () => {
      cancelled = true;
    };
  }, [game, updateGameChaptersMeta]);

  useEffect(() => {
    if (!game) return;
    if (enrichedGameRef.current.has(game.id)) return;
    const isStubOverview =
      !game.overview ||
      game.overview.trim() === `${game.title} (${game.year}).` ||
      game.overview.trim() === `${game.title} (${game.year})` ||
      game.overview.endsWith('tracked in your Play log.');
    if (game.coverUrl && !isStubOverview) return;

    let cancelled = false;
    enrichedGameRef.current.add(game.id);
    setEnrichingGame(true);
    enrichGameStub(game.title, game.year)
      .then((patch) => {
        if (cancelled || !patch) return;
        updateGameMetadata(game.id, {
          ...(patch.coverUrl && !game.coverUrl ? { coverUrl: patch.coverUrl } : {}),
          ...(patch.backdropUrl && (!game.backdropUrl || game.backdropUrl === game.coverUrl)
            ? { backdropUrl: patch.backdropUrl }
            : {}),
          ...(patch.overview && isStubOverview ? { overview: patch.overview } : {}),
          ...(patch.developer && (!game.coverUrl || game.developer === 'Studio' || game.developer === 'PC Studio')
            ? { developer: patch.developer }
            : {}),
          ...(patch.genres?.length && game.genres.length <= 1 ? { genres: patch.genres } : {}),
          ...(patch.platforms?.length && !game.coverUrl ? { platforms: patch.platforms } : {}),
          ...(patch.igdbId && !game.igdbId ? { igdbId: patch.igdbId } : {}),
          ...(patch.steamAppId && !game.steamAppId ? { steamAppId: patch.steamAppId } : {}),
          ...(patch.franchise && !game.franchise ? { franchise: patch.franchise } : {}),
        });
      })
      .finally(() => {
        if (!cancelled) setEnrichingGame(false);
      });

    return () => {
      cancelled = true;
    };
  }, [game, updateGameMetadata]);

  if (!game) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Game not found</p>
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

  const isCompleted = progress?.status === 'completed';
  const hours = progress?.hoursPlayed || 0;
  const pct = progress?.completionPct || 0;
  const currentStatus = progress?.status || 'backlog';
  const platform = progress?.platform || game.platforms[0] || 'PC';
  const displayGenres = cleanDisplayGenres(game.genres);
  const gameMetaSummary = formatGameMeta(game, progress, { includeHours: false });
  const totalChapters = game.totalChapters || 0;
  const chapterUnit: GameChapterUnit = game.chapterUnit || 'chapters';
  const chapterSingle = unitSingular(chapterUnit);
  const currentChapter = totalChapters > 0 ? Math.min(totalChapters, progress?.currentChapter || 0) : 0;
  const chapterRatio = totalChapters > 0 ? Math.min(1, currentChapter / totalChapters) : 0;

  const handleOpenChapterEditor = () => {
    setChapterDraft(totalChapters > 0 ? String(totalChapters) : '');
    setUnitDraft(chapterUnit);
    setEditingChapters((v) => !v);
  };

  const handleRedetectChapters = async () => {
    setCheckingChapters(true);
    try {
      const res = await fetchGameChapterInfo(game.title);
      if (res.found && res.totalChapters) {
        updateGameChaptersMeta(
          game.id,
          res.totalChapters,
          res.unit || 'chapters',
          res.source || 'web',
          res.note
        );
      }
    } finally {
      setCheckingChapters(false);
    }
  };

  const chapterUnitLabelCap =
    chapterUnit.charAt(0).toUpperCase() + chapterUnit.slice(1);
  const chapterSingleCap =
    chapterSingle.charAt(0).toUpperCase() + chapterSingle.slice(1);

  const CHAPTER_BUCKET_SIZE = 25;
  const gameBuckets: Array<{ idx: number; label: string; start: number; end: number }> = [];
  if (totalChapters > 0) {
    if (totalChapters <= CHAPTER_BUCKET_SIZE) {
      gameBuckets.push({
        idx: 0,
        label: `Story ${chapterUnit}`,
        start: 1,
        end: totalChapters,
      });
    } else {
      let idx = 0;
      for (let s = 1; s <= totalChapters; s += CHAPTER_BUCKET_SIZE) {
        const e = Math.min(totalChapters, s + CHAPTER_BUCKET_SIZE - 1);
        gameBuckets.push({
          idx,
          label: `${chapterUnitLabelCap} ${s}–${e}`,
          start: s,
          end: e,
        });
        idx += 1;
      }
    }
  }
  const activeGameBucketIdx = gameBuckets.findIndex((b) => currentChapter < b.end);
  const defaultGameOpenBucket =
    activeGameBucketIdx >= 0 ? activeGameBucketIdx : Math.max(0, gameBuckets.length - 1);

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
            src={game.backdropUrl || game.coverUrl}
            alt={game.title}
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
            aria-label="More options"
            className="glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => {
                    toggleGameCompleted(game.id);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
                >
                  <Check className="w-4 h-4 text-watched" />
                  <span>Mark Completed</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  incrementGamePlaythrough(game.id, 1);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log new playthrough (+1)</span>
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
                <span>Fix info &amp; art</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuggestOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Sparkles className="w-4 h-4 text-play" />
                <span>{totalChapters > 0 ? 'Suggest / replace story list' : 'Suggest chapters & missions'}</span>
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
                  resetGameProgress(game.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset game progress</span>
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
            <MediaImage src={game.coverUrl} alt={game.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" />
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand">
                Game
              </span>
              {platform && (
                <span className="inline-block text-[10px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-surface-raised border border-white/10 text-ink-dim">
                  {platform}
                </span>
              )}
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {game.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {[game.developer, game.year].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5">
        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => toggleGameBookmark(game.id)}
            aria-label="Toggle Play bookmark"
            className={`h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-4.5 h-4.5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          <CollectionHeroButton
            domain="play"
            ownership={progress?.ownership}
            onCycle={(next) => setMediaOwnership('game', game.id, next)}
          />

          {totalChapters > 0 && !isCompleted ? (
            <button
              type="button"
              onClick={() => advanceGameChapter(game.id, 1)}
              className="flex-1 h-11 rounded-full bg-brand text-brand-ink font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-4.5 h-4.5" strokeWidth={2.5} />
              <span>
                Log +1 {chapterSingle}{' '}
                <span className="opacity-75 tabular-nums">
                  ({currentChapter}/{totalChapters})
                </span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toggleGameCompleted(game.id)}
              className={`flex-1 h-11 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                isCompleted
                  ? 'border-2 border-watched bg-watched/[0.08] text-ink'
                  : 'bg-brand text-brand-ink hover:opacity-95'
              }`}
            >
              <Check
                className={`w-4.5 h-4.5 ${isCompleted ? 'text-watched' : 'text-brand-ink'}`}
                strokeWidth={2.5}
              />
              <span>
                {isCompleted
                  ? `Completed${
                      progress && progress.playthroughCount > 1
                        ? ` · x${progress.playthroughCount}`
                        : ''
                    }`
                  : 'Mark Completed'}
              </span>
            </button>
          )}
        </div>

        <DetailModeToggle mode={detailMode} onChange={handleDetailModeChange} />

        {/* Quick 4-Status Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3">
          {(
            [
              { id: 'playing', label: 'Playing' },
              { id: 'backlog', label: 'Backlog' },
              { id: 'completed', label: 'Completed' },
              { id: 'dropped', label: 'Dropped' },
            ] as const
          ).map((opt) => {
            const active = currentStatus === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateGameProgress(game.id, { status: opt.id })}
                className={`px-3 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                  active
                    ? 'bg-play/20 border-play text-play'
                    : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div key={detailMode} data-detail-mode={detailMode} className="animate-detail-flip">
          {detailMode === 'simple' ? (
            <>
              {/* Simple Clean Meta, Overview & Compact Pills */}
              <section className="pb-4 border-b border-white/[0.08]">
                <p className="text-[13px] text-ink-dim tabular-nums">
                  {[
                    game.year,
                    gameMetaSummary,
                    totalChapters > 0 ? `${totalChapters} ${chapterUnit}` : null,
                    hours > 0 ? `${hours}h` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                {game.overview && (
                  <div className="mt-2">
                    <p
                      className={`text-[13.5px] text-ink/85 leading-relaxed ${
                        expanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {game.overview}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="text-xs font-medium text-ink-dim hover:text-ink mt-1"
                    >
                      {expanded ? 'Show less' : 'See more'}
                    </button>
                  </div>
                )}

                {displayGenres.length > 0 && (
                  <p className="text-[12.5px] text-ink-faint mt-1.5">
                    {displayGenres.slice(0, 3).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-brand text-brand" />
                    {game.rating.toFixed(1)}/5
                  </span>
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-medium text-ink-dim tabular-nums">
                    {totalChapters > 0
                      ? `${currentChapter}/${totalChapters} ${chapterUnit}`
                      : `${pct}% complete`}
                  </span>
                  {hours > 0 && (
                    <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-medium text-ink-dim tabular-nums">
                      {hours}h played
                    </span>
                  )}
                  {progress?.platinum && (
                    <span className="bg-surface border border-brand/35 rounded-full px-3 py-1 text-xs font-semibold text-brand inline-flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      100% Trophy
                    </span>
                  )}
                  {typeof progress?.rating === 'number' && progress.rating > 0 && (
                    <span className="bg-surface border border-brand/35 rounded-full px-3 py-1 text-xs font-semibold text-brand inline-flex items-center gap-1 tabular-nums">
                      Your rating ★ {formatRating(progress.rating)}/5
                    </span>
                  )}
                  {isCompleted && formatFinishedDate(progress?.finishedAt || progress?.lastPlayedAt) && (
                    <span className="bg-surface border border-watched/35 rounded-full px-3 py-1 text-xs font-medium text-watched inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      Completed {formatFinishedDate(progress?.finishedAt || progress?.lastPlayedAt)}
                    </span>
                  )}
                  {(() => {
                    const colBadge = getMediaCollectionBadge('game', game, progress);
                    if (!colBadge.badgeText) return null;
                    return (
                      <span className="bg-surface border border-play/35 rounded-full px-3 py-1 text-xs font-medium text-play inline-flex items-center gap-1.5 tabular-nums">
                        <Archive className="w-3.5 h-3.5" />
                        {colBadge.badgeText}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setFixModalOpen(true)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border inline-flex items-center gap-1 transition-colors ${
                      !game.coverUrl
                        ? 'bg-brand/12 border-brand/35 text-brand hover:bg-brand/20'
                        : 'bg-surface border-white/[0.08] text-ink-dim hover:text-ink'
                    }`}
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    <span>{!game.coverUrl ? 'Fix info' : 'Fix'}</span>
                  </button>
                  {enrichingGame && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-dim">
                      <Loader2 className="w-3 h-3 animate-spin text-brand" />
                      Matching cover…
                    </span>
                  )}
                </div>
              </section>

              <section className="pt-4 pb-2">
                <HeroRatingCard
                  value={progress?.rating}
                  ratingSource={progress?.ratingSource}
                  onChange={(r) => rateGame(game.id, r, 'manual')}
                  promptLabel="Rate this game"
                  ariaPrefix={`Rate ${game.title}`}
                />
              </section>

              {/* Simple Accordion Story Chapters List or Suggest Prompt */}
              {totalChapters > 0 ? (
                <section className="pt-2 pb-4">
                  {totalChapters > 25 && (
                    <div className="flex items-center justify-between gap-2 pb-2.5">
                      <span className="text-xs font-semibold text-ink-dim tabular-nums">
                        {chapterUnitLabelCap} ({totalChapters})
                      </span>
                      <div className="inline-flex items-center rounded-full bg-surface border border-white/10 p-0.5">
                        {(
                          [
                            { grouped: true, label: 'Grouped' },
                            { grouped: false, label: 'All' },
                          ] as const
                        ).map((opt) => {
                          const isGrouped = state.settings.groupChapters !== false;
                          const active = isGrouped === opt.grouped;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => updateSettings({ groupChapters: opt.grouped })}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                active
                                  ? 'bg-brand text-brand-ink'
                                  : 'text-ink-dim hover:text-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const renderGameChapterRow = (n: number) => {
                      const done = n <= currentChapter;
                      const official = getOfficialGameChapter(game.title, n);
                      const customTitle = progress?.chapterTitles?.[n];
                      const resolvedName = customTitle || official?.title;
                      const displayTitle = resolvedName || `${chapterSingleCap} ${n}`;
                      const chapRating = progress?.chapterRatings?.[n];
                      return (
                        <div
                          key={n}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setChapterNoteText('');
                            setEditingChapterTitle(false);
                            setActiveChapterDrawer(n);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setChapterNoteText('');
                              setEditingChapterTitle(false);
                              setActiveChapterDrawer(n);
                            }
                          }}
                          className="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/[0.025] -mx-2 px-2 rounded-xl transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-ink truncate">
                              {displayTitle}
                            </p>
                            {(resolvedName || done || (typeof chapRating === 'number' && chapRating > 0)) && (
                              <p className="text-[11.5px] text-ink-dim tabular-nums flex items-center gap-1.5 mt-0.5 truncate">
                                {resolvedName && (
                                  <span>
                                    {chapterSingleCap} {n}
                                  </span>
                                )}
                                {done && (
                                  <span className="text-watched font-medium">
                                    {resolvedName ? '· Done' : 'Done'}
                                  </span>
                                )}
                                {typeof chapRating === 'number' && chapRating > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand">
                                    {resolvedName || done ? '· ' : ''}
                                    <Star className="w-3 h-3 fill-brand" />
                                    {formatRating(chapRating)}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setGameChapter(game.id, n === currentChapter ? n - 1 : n);
                            }}
                            aria-label={
                              done
                                ? `Unmark ${displayTitle} completed`
                                : `Mark ${displayTitle} completed`
                            }
                            className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              done
                                ? 'text-watched'
                                : 'text-ink-faint hover:text-watched'
                            }`}
                          >
                            <Check className="w-[17px] h-[17px]" strokeWidth={2.5} />
                          </button>
                        </div>
                      );
                    };

                    if (state.settings.groupChapters === false) {
                      const allNums: number[] = [];
                      for (let c = 1; c <= totalChapters; c += 1) allNums.push(c);
                      return (
                        <div className="divide-y divide-white/[0.06]">
                          {allNums.map((n) => renderGameChapterRow(n))}
                        </div>
                      );
                    }

                    return (
                      <div className="divide-y divide-white/[0.06]">
                        {gameBuckets.map((bucket) => {
                          const totalInBucket = bucket.end - bucket.start + 1;
                          let doneInBucket = 0;
                          const chapNums: number[] = [];
                          for (let c = bucket.start; c <= bucket.end; c += 1) {
                            chapNums.push(c);
                            if (c <= currentChapter) doneInBucket += 1;
                          }
                          const bucketDone = doneInBucket >= totalInBucket;
                          const bucketRatio = Math.min(1, doneInBucket / Math.max(1, totalInBucket));
                          const isOpen =
                            expandedBuckets[bucket.idx] !== undefined
                              ? expandedBuckets[bucket.idx]
                              : bucket.idx === defaultGameOpenBucket;

                          return (
                            <div key={bucket.idx} className="py-2">
                              <div className="flex items-center justify-between gap-3 py-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedBuckets((prev) => ({
                                      ...prev,
                                      [bucket.idx]: !isOpen,
                                    }))
                                  }
                                  aria-expanded={isOpen}
                                  className="flex items-center gap-1.5 font-display font-bold text-[15px] text-ink text-left"
                                >
                                  <span>{bucket.label}</span>
                                  {isOpen ? (
                                    <ChevronUp className="w-4 h-4 text-ink-dim" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-ink-dim" />
                                  )}
                                </button>

                                <div className="flex items-center gap-3 shrink-0">
                                  <span
                                    className={`text-xs font-semibold tabular-nums ${
                                      bucketDone ? 'text-watched' : 'text-ink-dim'
                                    }`}
                                  >
                                    {doneInBucket}/{totalInBucket}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setGameChapter(
                                        game.id,
                                        bucketDone ? bucket.start - 1 : bucket.end
                                      )
                                    }
                                    aria-label={`Toggle ${bucket.label} complete`}
                                    className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
                                      bucketDone
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
                                  style={{ width: `${Math.round(bucketRatio * 100)}%` }}
                                />
                              </div>

                              {isOpen && (
                                <div className="divide-y divide-white/[0.06] pt-1">
                                  {chapNums.map((n) => renderGameChapterRow(n))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>
              ) : (
                <section className="pt-2 pb-4">
                  <div className="rounded-[20px] bg-surface border border-white/[0.06] p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">Story chapters &amp; missions</p>
                      <p className="text-xs text-ink-dim mt-0.5">
                        {checkingChapters
                          ? 'Checking game guides for chapter structure…'
                          : 'Pull a chapter or mission list from wikis or Google AI Mode to track.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuggestOpen(true)}
                      className="px-4 py-2 rounded-full bg-play/18 border border-play/35 text-xs font-semibold text-play hover:bg-play/25 inline-flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Suggest chapters &amp; missions</span>
                    </button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {/* Advanced Card 1: Play Log, Completion, Platform & Finished Date */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-4 mb-5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleGameCompleted(game.id)}
                      className={`h-9 px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        isCompleted
                          ? 'border-watched bg-watched/15 text-watched'
                          : 'border-white/12 bg-background text-ink hover:bg-surface-raised'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>{isCompleted ? 'Completed' : 'Mark Completed'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGamePlatinum(game.id)}
                      aria-label="Toggle 100% Platinum trophy"
                      className={`h-9 px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        progress?.platinum
                          ? 'border-brand bg-brand/15 text-brand'
                          : 'border-white/12 bg-background text-ink-dim hover:text-ink'
                      }`}
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>100% Trophy</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl bg-background/50 border border-white/[0.05] grid grid-cols-3 divide-x divide-white/[0.06] text-center">
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Hours
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => logGameSession(game.id, -1)}
                        aria-label="Decrease hours"
                        className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-display font-bold text-base text-ink tabular-nums min-w-[2.4rem]">
                        {hours}h
                      </span>
                      <button
                        type="button"
                        onClick={() => logGameSession(game.id, 1)}
                        aria-label="Increase hours"
                        className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-brand"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Completion
                    </p>
                    <p className="font-display font-bold text-base sm:text-lg text-watched tabular-nums mt-0.5">
                      {pct}%
                    </p>
                  </div>
                  <div className="py-3 px-2">
                    <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                      Runs
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-1">
                      <button
                        type="button"
                        onClick={() => incrementGamePlaythrough(game.id, -1)}
                        aria-label="Decrease playthroughs"
                        className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-display font-bold text-base text-watched tabular-nums min-w-[1.5rem]">
                        x{progress?.playthroughCount || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => incrementGamePlaythrough(game.id, 1)}
                        aria-label="Increase playthroughs"
                        className="w-6 h-6 rounded-full bg-watched/20 flex items-center justify-center text-watched"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-ink-dim">Overall completion</span>
                    <span className="text-xs font-bold text-watched tabular-nums">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) =>
                      updateGameProgress(game.id, { completionPct: Number(e.target.value) })
                    }
                    aria-label="Game completion percentage"
                    className="w-full accent-[#A894E8] cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-white/[0.06]">
                  <p className="text-xs font-semibold text-ink-dim mb-2">Platform</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PLATFORMS.map((plat) => (
                      <button
                        key={plat}
                        type="button"
                        onClick={() => updateGameProgress(game.id, { platform: plat })}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          platform === plat
                            ? 'border-brand bg-brand/15 text-ink'
                            : 'border-white/8 bg-background text-ink-dim hover:text-ink'
                        }`}
                      >
                        {plat}
                      </button>
                    ))}
                  </div>
                </div>

                <FinishedDateRow
                  isFinished={isCompleted}
                  finishedAt={progress?.finishedAt}
                  fallbackDate={progress?.lastPlayedAt}
                  verbLabel="Completed"
                  onChangeDate={(ymd) => setMediaFinishedDate('game', game.id, ymd)}
                  onMarkFinished={() => toggleGameCompleted(game.id)}
                  completedRuns={progress?.completedRuns}
                  runVerb="replay"
                  onAddRun={(ymd, note) => addCompletionRun('game', game.id, ymd, note)}
                  onUpdateRunDate={(runId, ymd) => updateCompletionRunDate('game', game.id, runId, ymd)}
                  onDeleteRun={(runId) => deleteCompletionRun('game', game.id, runId)}
                />
              </section>

              {/* Story Chapter Tracker (Advanced Card 2) */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 mb-5">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">Story chapter progress</span>
                    {sourceChipLabel(game.chapterSource) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-play/15 text-play">
                        {sourceChipLabel(game.chapterSource)}
                      </span>
                    )}
                    {checkingChapters && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-brand">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Detecting…
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {totalChapters > 0 ? (
                      <span className="text-sm font-bold text-watched tabular-nums">
                        {currentChapter} / {totalChapters} {chapterUnit} ({Math.round(chapterRatio * 100)}%)
                      </span>
                    ) : (
                      <span className="text-xs text-ink-dim">No chapter structure set</span>
                    )}
                    <button
                      type="button"
                      onClick={handleOpenChapterEditor}
                      aria-label="Edit total chapters"
                      className="p-1.5 rounded-full bg-white/8 text-ink-dim hover:text-ink"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {editingChapters && (
                  <div className="space-y-2.5 mb-3 pt-1">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = Number(chapterDraft);
                        if (val > 0) {
                          updateGameChaptersMeta(game.id, val, unitDraft, 'manual', 'Custom chapter count');
                        }
                        setEditingChapters(false);
                      }}
                      className="flex items-center gap-2 flex-wrap"
                    >
                      <input
                        type="number"
                        min={1}
                        max={200}
                        placeholder="e.g. 23"
                        value={chapterDraft}
                        onChange={(e) => setChapterDraft(e.target.value)}
                        className="w-24 rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                      />
                      <select
                        value={unitDraft}
                        onChange={(e) => setUnitDraft(e.target.value as GameChapterUnit)}
                        aria-label="Chapter unit type"
                        className="rounded-xl bg-background border border-white/12 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
                      >
                        {CHAPTER_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={handleRedetectChapters}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/8 text-xs text-ink-dim hover:text-ink"
                      >
                        <Sparkles className="w-3 h-3 text-brand" />
                        <span>Auto-detect</span>
                      </button>
                    </form>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-ink-faint">Presets:</span>
                      <button
                        type="button"
                        onClick={() => {
                          updateGameChaptersMeta(
                            game.id,
                            4,
                            'milestones',
                            'manual',
                            '4 milestones (25% steps)'
                          );
                          setEditingChapters(false);
                        }}
                        className="px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/12 text-[11px] text-ink-dim hover:text-ink"
                      >
                        4 Milestones (25%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateGameChaptersMeta(game.id, 3, 'acts', 'manual', 'Three-act structure');
                          setEditingChapters(false);
                        }}
                        className="px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/12 text-[11px] text-ink-dim hover:text-ink"
                      >
                        3 Acts
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateGameChaptersMeta(game.id, 10, 'chapters', 'manual', '10 story chunks');
                          setEditingChapters(false);
                        }}
                        className="px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/12 text-[11px] text-ink-dim hover:text-ink"
                      >
                        10 Chunks
                      </button>
                    </div>
                  </div>
                )}

                {totalChapters > 0 ? (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={totalChapters}
                      value={currentChapter}
                      onChange={(e) => setGameChapter(game.id, Number(e.target.value), { silent: true })}
                      aria-label="Story chapter progress slider"
                      className="w-full accent-[#A894E8] cursor-pointer mb-3"
                    />

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setGameChapter(game.id, currentChapter - 1)}
                          className="h-9 px-3 rounded-full bg-white/8 text-xs font-semibold text-ink hover:bg-white/12 flex items-center gap-1"
                        >
                          <Minus className="w-3.5 h-3.5" />1 {chapterSingle}
                        </button>
                        <button
                          type="button"
                          onClick={() => advanceGameChapter(game.id, 1)}
                          className="h-9 px-3 rounded-full bg-watched/15 text-xs font-semibold text-watched hover:bg-watched/25 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />1 {chapterSingle}
                        </button>
                      </div>

                      {game.chapterNote && (
                        <span className="text-[11px] text-ink-dim">{game.chapterNote}</span>
                      )}
                    </div>
                  </>
                ) : (
                  !checkingChapters &&
                  !editingChapters && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs text-ink-dim">
                          Track chapters, acts, missions, or open-world milestones.
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSuggestOpen(true)}
                            className="px-3 py-1.5 rounded-full bg-play/18 border border-play/35 hover:bg-play/25 text-xs font-semibold text-play inline-flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Suggest</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenChapterEditor}
                            className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/12 text-xs font-semibold text-ink"
                          >
                            Custom
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            updateGameChaptersMeta(
                              game.id,
                              4,
                              'milestones',
                              'manual',
                              '4 milestones (25% steps)'
                            )
                          }
                          className="px-2.5 py-1 rounded-full bg-play/15 text-play text-[11px] font-semibold hover:bg-play/25"
                        >
                          + 4 Milestones (25%)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateGameChaptersMeta(game.id, 3, 'acts', 'manual', 'Three-act structure')
                          }
                          className="px-2.5 py-1 rounded-full bg-white/8 text-ink-dim hover:text-ink text-[11px] font-semibold"
                        >
                          + 3 Acts
                        </button>
                      </div>
                    </div>
                  )
                )}
              </section>

              {/* Info & Star Rating (Advanced Card 3) */}
              <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-3.5 mb-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[16px] text-ink">Game info</h2>
                    <p className="text-[13px] text-ink-dim mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {displayGenres.length > 0 && <span>{displayGenres.slice(0, 3).join(' · ')}</span>}
                      {game.franchise && (
                        <>
                          {displayGenres.length > 0 && <span>·</span>}
                          <span className="text-play font-medium">{game.franchise}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <RatingControl
                    value={progress?.rating}
                    onChange={(r) => rateGame(game.id, r, 'manual')}
                    labelPrefix="Rate game"
                    allowClear
                  />
                </div>

                {(() => {
                  const gameChapAvg = getGameChaptersAverage(progress);
                  if (!gameChapAvg || gameChapAvg.count === 0) return null;
                  return (
                    <SuggestedRatingBanner
                      compact
                      label={game.title}
                      calculatedAvg={gameChapAvg.avg}
                      ratedCount={gameChapAvg.count}
                      unitWord={chapterUnit}
                      currentRating={progress?.rating}
                      ratingSource={progress?.ratingSource}
                      onAcceptAvg={(avg) => rateGame(game.id, avg, 'auto')}
                      onManualRate={(r) => rateGame(game.id, r, 'manual')}
                    />
                  );
                })()}

                {game.overview && (
                  <div>
                    <p className={`text-[13.5px] text-ink-dim leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
                      {game.overview}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => !v)}
                      className="text-xs font-medium text-brand mt-1"
                    >
                      {expanded ? 'Show less' : 'More'}
                    </button>
                  </div>
                )}
              </section>

              <CollectionDetailCard
                domain="play"
                ownership={progress?.ownership}
                details={progress?.collection}
                badgeText={getMediaCollectionBadge('game', game, progress).badgeText}
                fallbackHours={progress?.hoursPlayed || 0}
                onChangeOwnership={(next) => setMediaOwnership('game', game.id, next)}
                onSaveDetails={(details, own) =>
                  updateMediaCollectionDetails('game', game.id, details, own)
                }
              />

              <PersonalNotesSection
                domain="play"
                mediaKind="game"
                mediaId={game.id}
                mediaTitle={game.title}
                mediaPoster={game.coverUrl}
                defaultContext={hours > 0 ? `${hours}h · ${platform}` : platform}
                currentRating={progress?.rating}
                currentMood={progress?.mood}
                onSelectMood={(mood) => setGameMood(game.id, mood)}
              />
            </>
          )}
        </div>
      </div>

      <CoverLightbox
        open={lightboxOpen}
        src={game.coverUrl}
        title={game.title}
        subtitle={`${game.developer} · ${game.year}`}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Game Chapter Log Drawer */}
      {activeChapterDrawer !== null && (() => {
        const n = activeChapterDrawer;
        const done = n <= currentChapter;
        const official = getOfficialGameChapter(game.title, n);
        const customTitle = progress?.chapterTitles?.[n];
        const displayTitle = customTitle || official?.title || `${chapterSingleCap} ${n}`;
        const chapRating = progress?.chapterRatings?.[n];
        const unitShortPrefix =
          chapterSingle === 'act'
            ? 'Act'
            : chapterSingle === 'mission'
              ? 'Mission'
              : chapterSingle === 'milestone'
                ? 'Milestone'
                : 'Ch.';
        const chapterContextLabel =
          unitShortPrefix === 'Ch.'
            ? `Ch. ${String(n).padStart(2, '0')}`
            : `${unitShortPrefix} ${n}`;
        const savedChapNotes = state.journalEntries.filter(
          (entry) => entry.mediaId === game.id && entry.contextLabel === chapterContextLabel
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
            onClick={() => setActiveChapterDrawer(null)}
          >
            <div
              className="w-full md:max-w-md max-h-[88dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl space-y-4 animate-sheet-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-play tabular-nums">
                    {chapterSingleCap} {n}
                  </p>
                  {editingChapterTitle ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        setGameChapterTitle(game.id, n, chapterTitleDraft);
                        setEditingChapterTitle(false);
                      }}
                      className="flex items-center gap-2 mt-1.5"
                    >
                      <input
                        autoFocus
                        value={chapterTitleDraft}
                        onChange={(e) => setChapterTitleDraft(e.target.value)}
                        placeholder={official?.title || `${chapterSingleCap} ${n}`}
                        className="flex-1 min-w-0 rounded-xl bg-surface border border-white/15 px-3 py-1.5 text-sm text-ink outline-none focus:border-play"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-xl bg-play text-[#161224] text-xs font-semibold shrink-0"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                      <h3 className="font-display font-bold text-lg text-ink leading-snug truncate">
                        {displayTitle}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setChapterTitleDraft(customTitle || official?.title || '');
                          setEditingChapterTitle(true);
                        }}
                        aria-label="Rename chapter"
                        className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-ink-dim mt-0.5 truncate">{game.title}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveChapterDrawer(null)}
                  aria-label="Close chapter log"
                  className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {official?.summary && (
                <p className="text-xs text-ink-dim leading-relaxed rounded-2xl bg-surface border border-white/[0.06] p-3">
                  {official.summary}
                </p>
              )}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <span className="text-sm font-medium text-ink">Status</span>
                <button
                  type="button"
                  onClick={() => setGameChapter(game.id, done ? n - 1 : n)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                    done
                      ? 'border-watched bg-watched/15 text-watched'
                      : 'border-white/12 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{done ? 'Completed' : 'Mark completed'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <div>
                  <span className="text-sm font-medium text-ink">Playtime</span>
                  <p className="text-[11px] text-ink-dim tabular-nums">{hours}h total logged</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => logGameSession(game.id, 0.5)}
                    className="px-2.5 py-1 rounded-full bg-white/8 text-ink text-xs font-semibold hover:bg-white/14"
                  >
                    +30m
                  </button>
                  <button
                    type="button"
                    onClick={() => logGameSession(game.id, 1)}
                    className="px-2.5 py-1 rounded-full bg-play/20 text-play text-xs font-semibold hover:bg-play/30"
                  >
                    +1h
                  </button>
                </div>
              </div>

              <CompactFinishedDateRow
                variant="drawer"
                label={`${chapterSingleCap} finished`}
                finishedAt={progress?.chapterFinishedAt?.[n]}
                onChangeDate={(ymd) => setGameChapterFinishedDate(game.id, n, ymd)}
              />

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <span className="text-sm font-medium text-ink">Chapter rating</span>
                <RatingControl
                  value={chapRating}
                  onChange={(r) => rateGameChapter(game.id, n, r)}
                  labelPrefix={`Rate ${displayTitle}`}
                  allowClear
                />
              </div>

              {savedChapNotes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Your {chapterContextLabel} notes
                  </p>
                  {savedChapNotes.slice(0, 3).map((note) => (
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
                  if (!chapterNoteText.trim()) return;
                  addJournalEntry({
                    domain: 'play',
                    mediaKind: 'game',
                    mediaId: game.id,
                    mediaTitle: game.title,
                    mediaPoster: game.coverUrl,
                    contextLabel: chapterContextLabel,
                    text: chapterNoteText.trim(),
                    rating: chapRating ?? progress?.rating,
                    mood: progress?.mood,
                  });
                  setChapterNoteText('');
                }}
                className="space-y-2.5"
              >
                <textarea
                  rows={2}
                  value={chapterNoteText}
                  onChange={(e) => setChapterNoteText(e.target.value)}
                  placeholder={`Log story beats, bosses, or notes for ${displayTitle}…`}
                  className="w-full rounded-xl bg-surface border border-white/10 p-3 text-sm text-ink outline-none focus:border-play resize-none"
                />
                <button
                  type="submit"
                  disabled={!chapterNoteText.trim()}
                  className="w-full py-2.5 rounded-full bg-play text-[#161224] text-sm font-semibold disabled:opacity-40"
                >
                  Save {chapterSingle} note
                </button>
              </form>
            </div>
          </div>
        );
      })()}

      {listPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setListPickerOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-surface border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg text-ink mb-3">Add to custom list</h3>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {state.lists.map((list) => {
                const included = list.items.some((x) => x.kind === 'game' && x.id === game.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'game', game.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-background border border-white/8 text-left"
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
                className="flex-1 rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newListName.trim()) return;
                  createCustomList(newListName, '', { kind: 'game', id: game.id });
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
      <GameChapterSuggestSheet
        open={suggestOpen}
        gameTitle={game.title}
        initialUnit={chapterUnit}
        onClose={() => setSuggestOpen(false)}
        onConfirm={(chapters, unit, source, note) =>
          applyGameChapterList(game.id, chapters, unit, source, note)
        }
      />

      <FixMediaInfoModal
        open={fixModalOpen}
        onClose={() => setFixModalOpen(false)}
        kind="game"
        title={game.title}
        creator={game.developer}
        year={game.year}
        coverUrl={game.coverUrl}
        overview={game.overview}
        unitLabel={chapterUnit}
        currentTotal={totalChapters}
        totalSource={game.chapterSource === 'manual' ? 'manual' : undefined}
        autoExpandDetails={!game.coverUrl}
        refreshLabel="Auto-match cover & details"
        onOpenChapterFinder={() => {
          setFixModalOpen(false);
          setSuggestOpen(true);
        }}
        chapterFinderLabel="Find chapters & missions"
        onRefreshLive={async (): Promise<FixMediaRefreshResult | null> => {
          const [metaRes, chapRes] = await Promise.allSettled([
            enrichGameStub(game.title, game.year),
            totalChapters === 0 ? fetchGameChapterInfo(game.title) : Promise.resolve(null),
          ]);
          const patch = metaRes.status === 'fulfilled' ? metaRes.value : null;
          const chap = chapRes.status === 'fulfilled' ? chapRes.value : null;
          if (!patch && !(chap && chap.found && chap.totalChapters)) {
            return null;
          }
          if (patch) {
            updateGameMetadata(game.id, {
              ...(patch.title ? { title: patch.title } : {}),
              ...(patch.developer ? { developer: patch.developer } : {}),
              ...(patch.year ? { year: patch.year } : {}),
              ...(patch.coverUrl ? { coverUrl: patch.coverUrl } : {}),
              ...(patch.backdropUrl ? { backdropUrl: patch.backdropUrl } : {}),
              ...(patch.overview ? { overview: patch.overview } : {}),
              ...(patch.genres?.length ? { genres: patch.genres } : {}),
              ...(patch.platforms?.length ? { platforms: patch.platforms } : {}),
              ...(patch.igdbId ? { igdbId: patch.igdbId } : {}),
              ...(patch.steamAppId ? { steamAppId: patch.steamAppId } : {}),
              ...(patch.franchise ? { franchise: patch.franchise } : {}),
            });
          }
          if (chap && chap.found && chap.totalChapters) {
            updateGameChaptersMeta(
              game.id,
              chap.totalChapters,
              chap.unit || 'chapters',
              chap.source || 'web',
              chap.note
            );
          }
          return {
            ...(chap?.totalChapters ? { total: chap.totalChapters } : {}),
            ...(patch?.coverUrl ? { coverUrl: patch.coverUrl } : {}),
            ...(patch?.title ? { title: patch.title } : {}),
            ...(patch?.developer ? { creator: patch.developer } : {}),
            ...(patch?.year ? { year: patch.year } : {}),
            ...(patch?.overview ? { overview: patch.overview } : {}),
            sourceLabel: patch?.sourceLabel,
            message: [
              patch ? `Matched details & cover via ${patch.sourceLabel}` : null,
              chap?.found && chap.totalChapters
                ? `detected ${chap.totalChapters} ${chap.unit || 'chapters'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
          };
        }}
        onSave={(patch) => {
          updateGameMetadata(game.id, {
            title: patch.title,
            developer: patch.creator,
            year: patch.year,
            coverUrl: patch.coverUrl,
            overview: patch.overview,
            ...(patch.totalUnits
              ? {
                  totalChapters: patch.totalUnits,
                  chapterUnit,
                  chapterSource: 'manual',
                }
              : {}),
          });
        }}
      />
    </div>
  );
}
