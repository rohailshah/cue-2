import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  BookOpen,
  CalendarCheck2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  ListPlus,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pencil,
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
import { FixMediaInfoModal, type FixMediaRefreshResult } from '../components/FixMediaInfoModal';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { HeroRatingCard, RatingControl, SuggestedRatingBanner } from '../components/RatingControl';
import {
  COMIC_ISSUE_CACHE_VERSION,
  fetchComicCollectionIssues,
  fetchComicEditionMetadata,
  fetchComicIssueDetails,
  fetchComicSeriesIssues,
  fetchLiveMangaChapterCount,
  fetchSingleComicIssueDetail,
  formatDisplayTitle,
} from '../services/mediaApi';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import type { DetailCardMode } from '../types';
import {
  extractReadItemIsbn,
  getComicCollectionSummary,
  getComicIssueAtomicId,
  isCollectedComicItem,
} from '../utils/atoms';
import { getMediaCollectionBadge } from '../utils/collection';
import {
  buildPreviewReadItemFromIncludedSeries,
  evaluateBookSeriesProgress,
  evaluateIncludedComicSeries,
  evaluateOverlappingComicContainers,
  findBookSeries,
  rankSmartComicContainers,
  type IncludedComicSeriesContainer,
  type OverlappingComicContainer,
  type SmartComicContainerEntry,
} from '../utils/containers';
import {
  getComicEditionLabel,
  getCuratedComicEditionRecords,
  getKnownComicEditionCovers,
  resolveComicEditionCover,
} from '../utils/editions';
import { formatRating, getReadUnitsAverage } from '../utils/ratings';
import {
  cleanDisplayGenres,
  formatUpcomingReleaseLabel,
  getCompletedReadUnits,
  getReadStats,
  isComicIssueReleased,
  parseComicIssueReleaseYmd,
} from '../utils/stats';

const sessionDetailModeByReadId = new Map<string, DetailCardMode>();

export function ReadDetailView({ readId }: { readId: string }) {
  const {
    state,
    goBack,
    pushRoute,
    advanceReadProgress,
    setReadProgress,
    toggleReadUnit,
    setReadUnitsBatch,
    markReadFinished,
    incrementReread,
    toggleReadBookmark,
    rateReadUnit,
    rateReadItem,
    setReadUnitFinishedDate,
    setReadOwnership,
    setReadUnitOwnership,
    setReadUnitVariantNote,
    setAllReadUnitsOwnership,
    updateMediaCollectionDetails,
    rateCollection,
    setCollectionFinishedDate,
    setReadMood,
    setMediaFinishedDate,
    addCompletionRun,
    updateCompletionRunDate,
    deleteCompletionRun,
    updateReadEditionCovers,
    updateReadIssueDetails,
    patchReadIssueMeta,
    updateReadTotalUnits,
    updateReadMetadata,
    updateReadFormat,
    updateSettings,
    resetReadProgress,
    addLiveReadToStore,
    addJournalEntry,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxOverride, setLightboxOverride] = useState<{
    src: string;
    title: string;
    subtitle?: string;
  } | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<number>(1);
  const [unitPageStart, setUnitPageStart] = useState<number>(1);
  const [activeUnitDrawer, setActiveUnitDrawer] = useState<number | null>(null);
  const [unitNoteText, setUnitNoteText] = useState('');
  const [variantNoteDraft, setVariantNoteDraft] = useState('');
  const [loadingUnitDetail, setLoadingUnitDetail] = useState(false);

  useModalBackHandler(activeUnitDrawer !== null, () => setActiveUnitDrawer(null));
  useModalBackHandler(listPickerOpen, () => setListPickerOpen(false));
  const [hydratingIssues, setHydratingIssues] = useState(false);
  const [hydratingManga, setHydratingManga] = useState(false);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<DetailCardMode>(
    () => sessionDetailModeByReadId.get(readId) || state.settings.detailMode || 'simple'
  );
  const [expandedBuckets, setExpandedBuckets] = useState<Record<number, boolean>>({ 0: true });
  const [showAllContainers, setShowAllContainers] = useState(false);
  const [showAllFlatUnits, setShowAllFlatUnits] = useState(false);
  const fetchedCoversRef = useRef<Set<string>>(new Set());
  const fetchedIssueKeyRef = useRef<Set<string>>(new Set());
  const fetchedSingleIssueRef = useRef<Set<string>>(new Set());
  const fetchedMangaRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setDetailMode(sessionDetailModeByReadId.get(readId) || state.settings.detailMode || 'simple');
    setExpandedBuckets({ 0: true });
    setShowAllContainers(false);
    setShowAllFlatUnits(false);
    setActiveUnitDrawer(null);
    setUnitNoteText('');
  }, [readId, state.settings.detailMode]);

  useEffect(() => {
    if (activeUnitDrawer === null) {
      setVariantNoteDraft('');
      return;
    }
    const curItem = state.readItems[readId];
    const curProg = state.readProgress[readId];
    const atomId = getComicIssueAtomicId(curItem?.issueDetails?.[activeUnitDrawer]);
    const saved =
      curProg?.unitVariantNotes?.[activeUnitDrawer] ||
      (atomId ? state.atomicReadUnits?.[atomId]?.variantNote : undefined) ||
      '';
    setVariantNoteDraft(saved);
  }, [activeUnitDrawer, readId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDetailModeChange = (nextMode: DetailCardMode) => {
    sessionDetailModeByReadId.set(readId, nextMode);
    setDetailMode(nextMode);
  };

  const item = state.readItems[readId];
  const progress = state.readProgress[readId];

  useEffect(() => {
    if (!item || item.format !== 'comic' || item.comicKind === 'series' || isCollectedComicItem(item)) return;
    if (fetchedCoversRef.current.has(item.id)) return;
    const uniqueCoverCount = item.editionCovers ? new Set(Object.values(item.editionCovers)).size : 0;
    const needsCounts = !item.editionIssueCounts;
    const formattedTitle = formatDisplayTitle(item.title);
    const needsTitleFix = formattedTitle !== item.title;
    const curatedCovers = getKnownComicEditionCovers(item.title);
    const missingCuratedCover = curatedCovers
      ? Object.entries(curatedCovers).some(([ed, url]) => item.editionCovers?.[ed as keyof typeof curatedCovers] !== url)
      : false;
    if (uniqueCoverCount > 1 && !needsCounts && !needsTitleFix && !missingCuratedCover) return;

    let cancelled = false;
    fetchComicEditionMetadata(item.title, item.creator).then(({ covers, issueCounts, variants }) => {
      if (cancelled) return;
      fetchedCoversRef.current.add(item.id);
      if (
        Object.keys(covers).length > 0 ||
        Object.keys(issueCounts).length > 0 ||
        Object.keys(variants).length > 0 ||
        needsTitleFix
      ) {
        updateReadEditionCovers(
          item.id,
          covers,
          needsTitleFix ? formattedTitle : undefined,
          issueCounts,
          variants
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item, updateReadEditionCovers]);

  useEffect(() => {
    if (!item || item.format !== 'comic') return;
    const total = Math.max(1, item.totalUnits);
    const detailsKey = `${progress?.editionId || progress?.edition || 'default'}::${total}::${COMIC_ISSUE_CACHE_VERSION}`;
    if (
      item.issueDetailsKey === detailsKey &&
      item.issueDetails &&
      Object.keys(item.issueDetails).length > 0
    ) {
      return;
    }
    const cacheKey = `${item.id}::${detailsKey}`;
    if (fetchedIssueKeyRef.current.has(cacheKey)) return;

    let cancelled = false;
    setHydratingIssues(true);
    const runFetch = async () => {
      try {
        if (
          item.comicKind === 'series' &&
          item.comicSeriesWiki &&
          item.comicSeriesVolTitle &&
          (!progress?.edition || progress.edition === 'digital')
        ) {
          const { issues, totalIssues } = await fetchComicSeriesIssues(
            item.comicSeriesWiki,
            item.comicSeriesVolTitle,
            Math.max(90, total)
          );
          if (cancelled) return;
          fetchedIssueKeyRef.current.add(cacheKey);
          if (
            Object.keys(issues).length > 0 ||
            (item.issueDetails && Object.keys(item.issueDetails).length > 0)
          ) {
            updateReadIssueDetails(
              item.id,
              issues,
              detailsKey,
              totalIssues > 0 ? totalIssues : undefined
            );
          }
          return;
        }

        if (isCollectedComicItem(item) && (!progress?.edition || progress.edition === 'digital') && !progress?.editionId) {
          const col = await fetchComicCollectionIssues({
            title: item.title,
            isbn: extractReadItemIsbn(item),
            overview: item.overview,
            publisher: item.comicPublisher,
            wiki: item.comicSeriesWiki,
            pageTitle: item.comicSeriesVolTitle,
            limit: Math.max(100, total),
          });
          if (cancelled) return;
          if (Object.keys(col.issues).length > 0) {
            fetchedIssueKeyRef.current.add(cacheKey);
            const nextKey = `${progress?.editionId || progress?.edition || 'default'}::${col.totalIssues || total}::${COMIC_ISSUE_CACHE_VERSION}`;
            updateReadIssueDetails(
              item.id,
              col.issues,
              nextKey,
              col.totalIssues > 0 ? col.totalIssues : undefined,
              {
                coverUrl: col.coverUrl,
                publisher: col.publisher,
                year: col.year,
                wiki: col.wiki,
                collectionPageTitle: col.collectionPageTitle,
              }
            );
            return;
          }
        }

        const details = await fetchComicIssueDetails(
          item.title,
          total,
          item.creator,
          progress?.editionId,
          item.comicPublisher
        );
        if (cancelled) return;
        fetchedIssueKeyRef.current.add(cacheKey);
        if (
          Object.keys(details).length > 0 ||
          (item.issueDetails && Object.keys(item.issueDetails).length > 0)
        ) {
          updateReadIssueDetails(item.id, details, detailsKey);
        }
      } finally {
        if (!cancelled) setHydratingIssues(false);
      }
    };
    void runFetch();
    return () => {
      cancelled = true;
    };
  }, [item, progress?.edition, progress?.editionId, updateReadIssueDetails]);

  useEffect(() => {
    if (activeUnitDrawer === null || !item || item.format !== 'comic') {
      setLoadingUnitDetail(false);
      return;
    }
    const meta = item.issueDetails?.[activeUnitDrawer];
    if (!meta?.wiki || !meta?.pageTitle || meta.synopsis) {
      setLoadingUnitDetail(false);
      return;
    }
    const singleKey = `${item.id}::${activeUnitDrawer}::${meta.pageTitle}`;
    if (fetchedSingleIssueRef.current.has(singleKey)) return;

    let cancelled = false;
    setLoadingUnitDetail(true);
    fetchSingleComicIssueDetail(meta.wiki, meta.pageTitle)
      .then((patch) => {
        if (cancelled) return;
        fetchedSingleIssueRef.current.add(singleKey);
        if (Object.keys(patch).length > 0) {
          patchReadIssueMeta(item.id, activeUnitDrawer, patch);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUnitDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeUnitDrawer, item, patchReadIssueMeta]);

  useEffect(() => {
    if (!item || item.format !== 'manga') return;
    if (item.totalUnitsSource === 'manual') return;
    const syncedMs = item.totalUnitsSyncedAt ? Date.parse(item.totalUnitsSyncedAt) : 0;
    const isStale = !syncedMs || Date.now() - syncedMs > 12 * 3600 * 1000;
    const needsSync = item.totalUnitsSource === 'estimated' || isStale;
    if (!needsSync) return;
    if (fetchedMangaRef.current.has(item.id)) return;

    let cancelled = false;
    fetchedMangaRef.current.add(item.id);
    setHydratingManga(true);
    fetchLiveMangaChapterCount(item.title, item.year)
      .then((res) => {
        if (cancelled || !res) return;
        if (res.totalChapters && res.totalChapters > 0) {
          updateReadTotalUnits(item.id, res.totalChapters, {
            source: 'api',
            syncedAt: res.checkedAt || new Date().toISOString(),
            publicationStatus: res.status,
          });
        } else if (res.status && res.status !== item.publicationStatus) {
          updateReadMetadata(item.id, {
            publicationStatus: res.status,
            totalUnitsSyncedAt: res.checkedAt || new Date().toISOString(),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setHydratingManga(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, updateReadTotalUnits, updateReadMetadata]);

  if (!item) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Title not found</p>
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

  const stats = getReadStats(item, progress);
  const unitAvg = getReadUnitsAverage(progress);
  const completedList = getCompletedReadUnits(item, progress);
  const completedSet = new Set(completedList);
  const editionRecords =
    item.format === 'comic' ? getCuratedComicEditionRecords(item) : [];
  const bookSeries = item.format === 'novel' ? findBookSeries(item.title) : null;
  const evalBookSeries = bookSeries ? evaluateBookSeriesProgress(bookSeries, state) : null;
  const overlappingContainers =
    item.format === 'comic' ? evaluateOverlappingComicContainers(item, state) : [];
  const includedSeriesContainers = useMemo(
    () =>
      item.format === 'comic'
        ? evaluateIncludedComicSeries(item, state, overlappingContainers)
        : [],
    [item, state, overlappingContainers]
  );

  const allSmartContainerEntries: SmartComicContainerEntry[] = useMemo(
    () =>
      item.format === 'comic'
        ? rankSmartComicContainers(
            item,
            state,
            overlappingContainers,
            includedSeriesContainers
          )
        : [],
    [item, state, overlappingContainers, includedSeriesContainers]
  );
  const PRIMARY_CONTAINER_LIMIT = 3;
  const primaryContainerEntries = allSmartContainerEntries.slice(0, PRIMARY_CONTAINER_LIMIT);
  const overflowContainerEntries = allSmartContainerEntries.slice(PRIMARY_CONTAINER_LIMIT);

  const handleOpenIncludedSeries = (series: IncludedComicSeriesContainer) => {
    if (!state.readItems[series.readId]) {
      addLiveReadToStore(buildPreviewReadItemFromIncludedSeries(series), 'want_to_read', false);
    }
    pushRoute({ view: 'read-detail', readId: series.readId });
  };

  const renderSmartContainerRow = (
    entry: SmartComicContainerEntry,
    variant: 'simple' | 'advanced'
  ) => {
    const isOverlap = entry.kind === 'overlap';
    const c = entry.data;
    const pct = Math.round(c.ratio * 100);
    const subText = isOverlap
      ? `${c.sharedCompleted}/${c.sharedTotal} shared issues · `
      : `${c.sharedCompleted}/${c.sharedTotal} issues in edition · `;
    const rightStat = isOverlap
      ? `${pct}% (${(c as OverlappingComicContainer).containerRead}/${(c as OverlappingComicContainer).containerTotal})`
      : `${pct}%`;

    return (
      <button
        key={`${entry.kind}-${c.readId}`}
        type="button"
        onClick={() =>
          isOverlap
            ? pushRoute({ view: 'read-detail', readId: c.readId })
            : handleOpenIncludedSeries(c as IncludedComicSeriesContainer)
        }
        className={`w-full rounded-xl bg-background/60 hover:bg-surface-raised border border-white/[0.06] flex items-center text-left transition-colors ${
          variant === 'advanced' ? 'px-3 py-2.5 gap-3' : 'px-2.5 py-2 gap-2.5'
        }`}
      >
        <div
          className={`rounded-md overflow-hidden border border-white/10 bg-surface shrink-0 ${
            variant === 'advanced' ? 'w-9 aspect-[2/3]' : 'w-8 h-12'
          }`}
        >
          <MediaImage
            src={c.coverUrl}
            alt={c.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p
              className={`font-semibold text-ink truncate ${
                variant === 'advanced' ? 'text-sm' : 'text-xs'
              }`}
            >
              {c.title}
            </p>
            {!isOverlap && (
              <span className="text-[9.5px] font-medium px-1.5 py-[1px] rounded-full bg-white/[0.06] text-ink-dim shrink-0">
                Included
              </span>
            )}
          </div>
          <p
            className={`text-ink-dim tabular-nums mt-0.5 truncate ${
              variant === 'advanced' ? 'text-xs' : 'text-[11px]'
            }`}
          >
            {subText}
            <span className={c.isComplete ? 'text-watched font-semibold' : ''}>
              {rightStat}
            </span>
          </p>
          <div
            className={`w-full rounded-full bg-white/10 overflow-hidden mt-1.5 ${
              variant === 'advanced' ? 'h-1' : 'h-[2.5px]'
            }`}
          >
            <div
              className="h-full bg-watched transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <ChevronRight
          className={`text-ink-faint shrink-0 ${variant === 'advanced' ? 'w-4 h-4' : 'w-3.5 h-3.5'}`}
        />
      </button>
    );
  };

  const renderOverflowContainersSection = (variant: 'simple' | 'advanced') => {
    if (overflowContainerEntries.length === 0) return null;
    return (
      <div className="pt-1.5 border-t border-white/[0.06] space-y-2">
        <button
          type="button"
          onClick={() => setShowAllContainers((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-1 py-1 text-left text-[11px] font-semibold text-ink-dim hover:text-ink transition-colors"
        >
          <span className="truncate">
            Additional containers &amp; series ({overflowContainerEntries.length} more)
          </span>
          {showAllContainers ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>
        {showAllContainers && (
          <div className="space-y-2">
            {overflowContainerEntries.map((entry) => renderSmartContainerRow(entry, variant))}
          </div>
        )}
      </div>
    );
  };
  const seriesRatingKey = bookSeries ? `book-series:${bookSeries.id}` : '';
  const storedSeriesRating = seriesRatingKey ? state.collectionRatings?.[seriesRatingKey] : undefined;
  const collectionSummary = getComicCollectionSummary(item, progress, state.atomicReadUnits);
  const mediaColBadge = getMediaCollectionBadge('read', item, progress, state.atomicReadUnits);

  const safeSelectedUnit = Math.min(stats.total, Math.max(1, selectedUnit));
  const UNIT_PAGE_SIZE = 48;
  const maxPageStart = Math.max(1, stats.total - UNIT_PAGE_SIZE + 1);
  const pageStart = stats.total > UNIT_PAGE_SIZE ? Math.min(unitPageStart, maxPageStart) : 1;
  const pageEnd = Math.min(stats.total, pageStart + UNIT_PAGE_SIZE - 1);
  const visibleUnitNumbers: number[] = [];
  for (let n = pageStart; n <= pageEnd; n += 1) visibleUnitNumbers.push(n);

  const formatLabel =
    item.format === 'manga' ? 'Manga' : item.format === 'comic' ? 'Comic' : 'Novel';
  const activeCover = resolveComicEditionCover(item, progress?.edition, progress);
  const editionLabel =
    item.format === 'comic' ? getComicEditionLabel(progress?.edition, item, progress) : '';

  const simpleBuckets: Array<{ idx: number; label: string; unitNums: number[] }> = [];
  const distinctSeriesTitles = new Set<string>();
  if (item.format === 'comic' && item.issueDetails) {
    for (let u = 1; u <= stats.total; u += 1) {
      const st = item.issueDetails[u]?.seriesTitle;
      if (st) distinctSeriesTitles.add(st);
    }
  }

  if (distinctSeriesTitles.size >= 2 && item.issueDetails) {
    let curGroupTitle = '';
    let curGroupNums: number[] = [];
    const flushGroup = () => {
      if (curGroupNums.length === 0) return;
      simpleBuckets.push({
        idx: simpleBuckets.length,
        label: curGroupTitle || 'Other Issues',
        unitNums: curGroupNums,
      });
    };
    for (let u = 1; u <= stats.total; u += 1) {
      const sTitle = item.issueDetails[u]?.seriesTitle || 'Collected Issues';
      if (sTitle !== curGroupTitle) {
        flushGroup();
        curGroupTitle = sTitle;
        curGroupNums = [u];
      } else {
        curGroupNums.push(u);
      }
    }
    flushGroup();
  } else {
    const BUCKET_SIZE = stats.total >= 400 ? 100 : stats.total >= 150 ? 50 : 25;
    if (stats.total <= BUCKET_SIZE) {
      const nums: number[] = [];
      for (let u = 1; u <= stats.total; u += 1) nums.push(u);
      simpleBuckets.push({
        idx: 0,
        label: item.unit === 'issues' ? 'Issues' : 'Chapters',
        unitNums: nums,
      });
    } else {
      let idx = 0;
      for (let s = 1; s <= stats.total; s += BUCKET_SIZE) {
        const e = Math.min(stats.total, s + BUCKET_SIZE - 1);
        const nums: number[] = [];
        for (let u = s; u <= e; u += 1) nums.push(u);
        simpleBuckets.push({
          idx,
          label: `${item.unit === 'issues' ? 'Issues' : 'Chapters'} ${s}–${e}`,
          unitNums: nums,
        });
        idx += 1;
      }
    }
  }
  const activeBucketIdx = simpleBuckets.findIndex((b) => b.unitNums.some((u) => !completedSet.has(u)));
  const defaultOpenBucket =
    activeBucketIdx >= 0 ? activeBucketIdx : Math.max(0, simpleBuckets.length - 1);
  const showSeriesPrefixInRows = distinctSeriesTitles.size >= 2;

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Flat Dark Hero (no gradient) */}
      <div className="relative h-[270px] sm:h-[340px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={activeCover || item.backdropUrl || item.coverUrl}
          alt={item.title}
          className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
        />
        <div className="absolute inset-0 bg-[#131519]/65" />

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
            <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              {!stats.isFinished && (
                <button
                  type="button"
                  onClick={() => {
                    markReadFinished(item.id);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
                >
                  <Check className="w-4 h-4 text-watched" />
                  <span>Mark all complete</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  incrementReread(item.id, 1);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log reread (+1)</span>
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
                <span>Fix info &amp; count</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetReadProgress(item.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset reading progress</span>
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <button
            type="button"
            onClick={() => {
              setLightboxOverride(null);
              setLightboxOpen(true);
            }}
            aria-label="View cover fullscreen"
            className="group relative w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-surface cursor-zoom-in"
          >
            <MediaImage src={activeCover} alt={item.title} className="w-full h-full object-cover" />
            <span className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" />
            </span>
          </button>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand">
                {formatLabel}
              </span>
              {item.comicKind === 'series' && (
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-read/35 bg-read/12 text-read">
                  Series
                </span>
              )}
              {editionLabel && (
                <span className="inline-block text-[10px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-surface-raised border border-white/10 text-ink-dim">
                  {editionLabel}
                </span>
              )}
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {item.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {[item.comicPublisher || item.creator, item.comicRunLabel || item.year]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-3.5">
        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => toggleReadBookmark(item.id)}
            aria-label="Toggle library bookmark"
            className={`h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-4.5 h-4.5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          <CollectionHeroButton
            domain="read"
            ownership={progress?.ownership}
            onCycle={(next) => setReadOwnership(item.id, next)}
          />

          {stats.isFinished ? (
            <button
              type="button"
              onClick={() => incrementReread(item.id, 1)}
              className="flex-1 h-11 rounded-full border-2 border-watched text-ink font-semibold text-sm flex items-center justify-center gap-2 bg-watched/[0.08] hover:bg-watched/15 transition-colors"
            >
              <Check className="w-4.5 h-4.5 text-watched" strokeWidth={2.5} />
              <span>Finished</span>
              {stats.rereadCount > 1 && (
                <span className="text-watched font-bold text-xs ml-0.5">· x{stats.rereadCount}</span>
              )}
            </button>
          ) : (stats.isCaughtUp || stats.nextReleasedUnit === null) && stats.nextUpcomingUnit ? (
            <div className="flex-1 h-11 rounded-full border border-white/15 bg-surface text-ink-dim font-medium text-xs sm:text-sm flex items-center justify-center gap-2 px-3 min-w-0">
              <Clock className="w-4 h-4 text-read shrink-0" />
              <span className="truncate">
                {(() => {
                  const upMeta = stats.nextUpcomingMeta;
                  const upLabel = upMeta?.issueLabel
                    ? `Issue ${upMeta.issueLabel}`
                    : `Issue #${stats.nextUpcomingUnit}`;
                  const upYmd = parseComicIssueReleaseYmd(upMeta);
                  const upDate = upYmd
                    ? formatUpcomingReleaseLabel(upYmd)
                    : upMeta?.releaseDate || '';
                  return stats.current > 0
                    ? `Caught up · Next ${upLabel}${upDate ? ` (${upDate})` : ''}`
                    : `Releases ${upDate || upLabel}`;
                })()}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => advanceReadProgress(item.id, 1)}
              className="flex-1 h-11 rounded-full bg-brand text-brand-ink font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-4.5 h-4.5" strokeWidth={2.5} />
              <span>
                Log +1 {stats.unitSingular}{' '}
                <span className="opacity-75 tabular-nums">
                  ({stats.current}/{stats.unreleasedCount > 0 ? stats.releasedTotal : stats.total})
                </span>
              </span>
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
                  {[
                    item.comicKind === 'series' ? `${formatLabel} Series` : formatLabel,
                    editionLabel || null,
                    item.comicRunLabel || item.year,
                    item.comicPublisher || item.creator,
                    `${item.totalUnitsSource === 'estimated' ? '~' : ''}${stats.total} ${stats.unitLabel}${
                      item.totalUnitsSource === 'estimated' ? ' (est.)' : ''
                    }`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                {item.overview && (
                  <div className="mt-2">
                    <p
                      className={`text-[13.5px] text-ink/85 leading-relaxed ${
                        expanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {item.overview}
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

                {cleanDisplayGenres(item.genres).length > 0 && (
                  <p className="text-[12.5px] text-ink-faint mt-1.5">
                    {cleanDisplayGenres(item.genres).slice(0, 3).join(' · ')}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-semibold text-ink inline-flex items-center gap-1.5 tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-brand text-brand" />
                    {item.rating.toFixed(1)}/5
                  </span>
                  <span className="bg-surface border border-white/[0.08] rounded-full px-3 py-1 text-xs font-medium text-ink-dim tabular-nums">
                    {stats.unreleasedCount > 0
                      ? `${stats.current}/${stats.releasedTotal} released (${Math.round(
                          stats.releasedRatio * 100
                        )}%) · ${stats.unreleasedCount} upcoming`
                      : `${stats.current}/${item.totalUnitsSource === 'estimated' ? '~' : ''}${stats.total} ${stats.unitLabel} (${Math.round(
                          stats.ratio * 100
                        )}%)`}
                  </span>
                  {item.publicationStatus === 'ongoing' && (
                    <span className="bg-surface border border-white/[0.08] rounded-full px-2.5 py-1 text-[11px] font-medium text-ink-dim">
                      Ongoing
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFixModalOpen(true)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border inline-flex items-center gap-1 transition-colors ${
                      item.totalUnitsSource === 'estimated'
                        ? 'bg-brand/12 border-brand/35 text-brand hover:bg-brand/20'
                        : 'bg-surface border-white/[0.08] text-ink-dim hover:text-ink'
                    }`}
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    <span>{item.totalUnitsSource === 'estimated' ? 'Fix count' : 'Fix'}</span>
                  </button>
                  {typeof progress?.rating === 'number' && progress.rating > 0 && (
                    <span className="bg-surface border border-brand/35 rounded-full px-3 py-1 text-xs font-semibold text-brand inline-flex items-center gap-1 tabular-nums">
                      Your rating ★ {formatRating(progress.rating)}/5
                    </span>
                  )}
                  {stats.isFinished && formatFinishedDate(progress?.finishedAt || progress?.lastReadAt) && (
                    <span className="bg-surface border border-watched/35 rounded-full px-3 py-1 text-xs font-medium text-watched inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarCheck2 className="w-3.5 h-3.5" />
                      Finished {formatFinishedDate(progress?.finishedAt || progress?.lastReadAt)}
                    </span>
                  )}
                  {mediaColBadge.badgeText && (
                    <span className="bg-surface border border-read/35 rounded-full px-3 py-1 text-xs font-medium text-read inline-flex items-center gap-1.5 tabular-nums">
                      <Archive className="w-3.5 h-3.5" />
                      {mediaColBadge.badgeText}
                    </span>
                  )}
                </div>
              </section>

              <section className="pt-4 pb-2">
                <HeroRatingCard
                  value={progress?.rating}
                  ratingSource={progress?.ratingSource}
                  onChange={(r) => rateReadItem(item.id, r, 'manual')}
                  promptLabel={`Rate this ${formatLabel.toLowerCase()}`}
                  ariaPrefix={`Rate ${item.title}`}
                />
              </section>

              {/* Synced Smart Containers */}
              {allSmartContainerEntries.length > 0 && (
                <section className="pt-2 pb-1">
                  <div className="rounded-2xl bg-surface border border-white/[0.07] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Layers className="w-3.5 h-3.5 text-read shrink-0" />
                        <span className="text-xs font-semibold text-ink truncate">
                          Synced Smart Containers
                        </span>
                      </div>
                      <span className="text-[10.5px] font-medium text-ink-faint shrink-0 tabular-nums">
                        {allSmartContainerEntries.length > PRIMARY_CONTAINER_LIMIT
                          ? `No double-logging · ${allSmartContainerEntries.length} linked`
                          : 'No double-logging'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {primaryContainerEntries.map((entry) =>
                        renderSmartContainerRow(entry, 'simple')
                      )}
                    </div>
                    {renderOverflowContainersSection('simple')}
                  </div>
                </section>
              )}

              {/* Simple Accordion Issue / Chapter Checklist */}
              <section className="pt-2 pb-4">
                {(hydratingIssues || hydratingManga) && (
                  <div className="py-2 text-xs text-ink-dim flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-read shrink-0" />
                    <span>
                      {hydratingManga
                        ? 'Syncing latest chapter count…'
                        : 'Resolving individual issues, covers & atomic links…'}
                    </span>
                  </div>
                )}

                {stats.total > 25 && distinctSeriesTitles.size < 2 && (
                  <div className="flex items-center justify-between gap-2 pb-2.5">
                    <span className="text-xs font-semibold text-ink-dim tabular-nums">
                      {item.unit === 'issues' ? 'Issues' : 'Chapters'} ({stats.total})
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
                  const renderSimpleUnitRow = (u: number) => {
                    const done = completedSet.has(u);
                    const meta = item.format === 'comic' ? item.issueDetails?.[u] : undefined;
                    const unitReleased =
                      item.format !== 'comic' || isComicIssueReleased(meta);
                    const fallbackLabel =
                      item.unit === 'issues' ? `Issue #${u}` : `Chapter ${u}`;
                    const issueTag =
                      showSeriesPrefixInRows && meta?.seriesTitle
                        ? `${meta.seriesTitle} ${meta.issueLabel || `#${u}`}`
                        : meta?.issueLabel || `Issue #${u}`;
                    const primaryTitle =
                      item.format === 'comic'
                        ? meta?.title ||
                          (showSeriesPrefixInRows && meta?.seriesTitle
                            ? `${meta.seriesTitle} ${meta.issueLabel || `#${u}`}`
                            : meta?.issueLabel
                              ? `${item.title} ${meta.issueLabel}`
                              : fallbackLabel)
                        : fallbackLabel;
                    const issueSub =
                      item.format === 'comic'
                        ? [issueTag, meta?.releaseDate].filter(Boolean).join(' · ')
                        : '';
                    const issueThumb = meta?.coverUrl || activeCover;
                    const unitRating = progress?.unitRatings?.[u];

                    return (
                      <div
                        key={u}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setUnitNoteText('');
                          setActiveUnitDrawer(u);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setUnitNoteText('');
                            setActiveUnitDrawer(u);
                          }
                        }}
                        className={`py-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/[0.025] -mx-2 px-2 rounded-xl transition-colors ${
                          !done && !unitReleased ? 'opacity-70' : ''
                        }`}
                      >
                        {item.format === 'comic' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxOverride({
                                src: issueThumb,
                                title: primaryTitle,
                                subtitle: [
                                  item.title,
                                  meta?.issueLabel || `Issue #${u}`,
                                  meta?.releaseDate,
                                ]
                                  .filter(Boolean)
                                  .join(' · '),
                              });
                              setLightboxOpen(true);
                            }}
                            aria-label={`View ${primaryTitle} cover fullscreen`}
                            className="w-[44px] h-[64px] rounded-lg overflow-hidden bg-surface border border-white/10 shrink-0 cursor-zoom-in"
                          >
                            <MediaImage
                              src={issueThumb}
                              fallbackSrc={activeCover}
                              alt={primaryTitle}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate leading-snug">
                            {primaryTitle}
                          </p>
                          {item.format === 'comic' ? (
                            <p className="text-[12px] text-ink-dim tabular-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="truncate">{issueSub}</span>
                              {!done && !unitReleased && (
                                <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] font-semibold text-ink-dim shrink-0">
                                  Upcoming
                                </span>
                              )}
                              {done && (
                                <span className="text-watched font-medium shrink-0">
                                  · Read
                                </span>
                              )}
                              {(() => {
                                const aId = getComicIssueAtomicId(meta);
                                const uOwn =
                                  progress?.unitOwnership?.[u] ||
                                  (aId ? state.atomicReadUnits?.[aId]?.ownership : undefined);
                                if (!uOwn) return null;
                                return (
                                  <span
                                    className={`shrink-0 ${
                                      uOwn === 'owned'
                                        ? 'text-read font-medium'
                                        : 'text-ink-dim'
                                    }`}
                                  >
                                    · {uOwn === 'owned' ? 'Owned' : 'Want'}
                                  </span>
                                );
                              })()}
                              {typeof unitRating === 'number' && unitRating > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand shrink-0">
                                  · <Star className="w-3 h-3 fill-brand" />
                                  {formatRating(unitRating)}
                                </span>
                              )}
                            </p>
                          ) : (
                            (done || (typeof unitRating === 'number' && unitRating > 0)) && (
                              <p className="text-[11.5px] text-ink-dim tabular-nums flex items-center gap-1.5 mt-0.5">
                                {done && <span className="text-watched">Read</span>}
                                {typeof unitRating === 'number' && unitRating > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand">
                                    {done ? '· ' : ''}
                                    <Star className="w-3 h-3 fill-brand" />
                                    {formatRating(unitRating)}
                                  </span>
                                )}
                              </p>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReadUnit(item.id, u);
                          }}
                          aria-label={
                            done
                              ? `Unmark ${primaryTitle} read`
                              : `Mark ${primaryTitle} read`
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

                  const useFlatList =
                    state.settings.groupChapters === false && distinctSeriesTitles.size < 2;

                  if (useFlatList) {
                    const flatCap = !showAllFlatUnits && stats.total > 200 ? 200 : stats.total;
                    const flatNums: number[] = [];
                    for (let u = 1; u <= flatCap; u += 1) flatNums.push(u);
                    return (
                      <div>
                        <div className="divide-y divide-white/[0.06]">
                          {flatNums.map((u) => renderSimpleUnitRow(u))}
                        </div>
                        {stats.total > flatCap && (
                          <button
                            type="button"
                            onClick={() => setShowAllFlatUnits(true)}
                            className="mt-3 w-full py-2.5 rounded-xl bg-surface border border-white/10 text-xs font-semibold text-ink hover:border-brand transition-colors"
                          >
                            Show all {stats.total.toLocaleString()} {stats.unitLabel}
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-white/[0.06]">
                      {simpleBuckets.map((bucket) => {
                        const unitNums = bucket.unitNums;
                        const totalInBucket = unitNums.length;
                        const doneInBucket = unitNums.reduce(
                          (acc, u) => (completedSet.has(u) ? acc + 1 : acc),
                          0
                        );
                        const bucketDone = totalInBucket > 0 && doneInBucket >= totalInBucket;
                        const bucketRatio = Math.min(1, doneInBucket / Math.max(1, totalInBucket));
                        const isOpen =
                          expandedBuckets[bucket.idx] !== undefined
                            ? expandedBuckets[bucket.idx]
                            : bucket.idx === defaultOpenBucket;

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
                                className="flex items-center gap-1.5 font-display font-bold text-[15px] text-ink text-left min-w-0"
                              >
                                <span className="truncate">{bucket.label}</span>
                                {isOpen ? (
                                  <ChevronUp className="w-4 h-4 text-ink-dim shrink-0" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-ink-dim shrink-0" />
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
                                  onClick={() => {
                                    const releasedInBucket = unitNums.filter(
                                      (u) =>
                                        item.format !== 'comic' ||
                                        isComicIssueReleased(item.issueDetails?.[u])
                                    );
                                    if (bucketDone) {
                                      setReadUnitsBatch(item.id, unitNums, false);
                                    } else if (releasedInBucket.length > 0) {
                                      setReadUnitsBatch(item.id, releasedInBucket, true);
                                    }
                                  }}
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
                                {unitNums.map((u) => renderSimpleUnitRow(u))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            </>
          ) : (
            <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-4 mb-5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                  {item.format === 'comic' ? 'Issue run progress' : 'Chapter progress'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-watched tabular-nums">
                    {Math.round(
                      (stats.unreleasedCount > 0 ? stats.releasedRatio : stats.ratio) * 100
                    )}
                    %
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTotalDraft(String(item.totalUnits));
                      setEditingTotal((v) => !v);
                    }}
                    aria-label="Edit total count"
                    className="p-1 rounded-full bg-white/8 text-ink-dim hover:text-ink"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {editingTotal && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const val = Number(totalDraft);
                    if (val > 0) updateReadTotalUnits(item.id, val);
                    setEditingTotal(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="number"
                    min={1}
                    value={totalDraft}
                    onChange={(e) => setTotalDraft(e.target.value)}
                    className="w-28 rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold"
                  >
                    Set total {stats.unitLabel}
                  </button>
                </form>
              )}

              <div className="rounded-2xl bg-background/50 border border-white/[0.05] grid grid-cols-3 divide-x divide-white/[0.06] text-center">
                <div className="py-3 px-2">
                  <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                    {stats.unreleasedCount > 0 ? 'Released' : stats.unitLabel}
                  </p>
                  <p className="font-display font-bold text-base sm:text-lg text-watched tabular-nums mt-0.5">
                    {stats.current} / {stats.unreleasedCount > 0 ? stats.releasedTotal : stats.total}
                  </p>
                  {stats.unreleasedCount > 0 && (
                    <p className="text-[10px] text-ink-faint tabular-nums mt-0.5">
                      +{stats.unreleasedCount} upcoming
                    </p>
                  )}
                </div>
                <div className="py-3 px-2">
                  <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                    Status
                  </p>
                  <p className="font-display font-bold text-xs sm:text-sm text-ink mt-1.5">
                    {stats.isFinished
                      ? 'Finished'
                      : stats.isCaughtUp
                        ? 'Caught up'
                        : stats.current > 0
                          ? 'Reading'
                          : 'Up next'}
                  </p>
                </div>
                <div className="py-3 px-2">
                  <p className="text-[10.5px] text-ink-faint uppercase tracking-wider font-semibold">
                    Rereads
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => incrementReread(item.id, -1)}
                      aria-label="Decrease reread count"
                      className="w-6 h-6 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-display font-bold text-base text-watched tabular-nums min-w-[1.5rem]">
                      x{stats.rereadCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => incrementReread(item.id, 1)}
                      aria-label="Increase reread count"
                      className="w-6 h-6 rounded-full bg-watched/20 flex items-center justify-center text-watched"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={stats.total}
                value={stats.current}
                onChange={(e) => setReadProgress(item.id, Number(e.target.value))}
                aria-label="Reading progress slider"
                className="w-full accent-[#DFB062] cursor-pointer"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setReadProgress(item.id, stats.current - 1)}
                  className="h-9 px-3 rounded-full bg-white/8 text-xs font-semibold text-ink hover:bg-white/12 flex items-center gap-1"
                >
                  <Minus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                </button>
                <button
                  type="button"
                  onClick={() => advanceReadProgress(item.id, 1)}
                  disabled={stats.isCaughtUp || stats.nextReleasedUnit === null}
                  className="h-9 px-3 rounded-full bg-watched/15 text-xs font-semibold text-watched hover:bg-watched/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />1 {stats.unitSingular}
                </button>
                {!stats.isFinished && (
                  <button
                    type="button"
                    onClick={() => markReadFinished(item.id)}
                    className="h-9 px-3 rounded-full bg-white/8 border border-white/10 text-xs font-semibold text-watched hover:bg-white/12"
                  >
                    Finish
                  </button>
                )}
              </div>

              <FinishedDateRow
                isFinished={stats.isFinished}
                finishedAt={progress?.finishedAt}
                fallbackDate={progress?.lastReadAt}
                verbLabel="Finished"
                onChangeDate={(ymd) => setMediaFinishedDate('read', item.id, ymd)}
                onMarkFinished={() => markReadFinished(item.id)}
                completedRuns={progress?.completedRuns}
                runVerb="reread"
                onAddRun={(ymd, note) => addCompletionRun('read', item.id, ymd, note)}
                onUpdateRunDate={(runId, ymd) => updateCompletionRunDate('read', item.id, runId, ymd)}
                onDeleteRun={(runId) => deleteCompletionRun('read', item.id, runId)}
              />
            </section>
          )}

          {/* Advanced Compact Comic Edition Entry -> Separate Editions Page */}
          {detailMode === 'advanced' && item.format === 'comic' && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-read shrink-0" />
                  <h2 className="text-sm font-semibold text-ink">Comic Edition</h2>
                </div>
                <span className="text-[11px] font-medium text-ink-dim tabular-nums">
                  {editionRecords.length} {editionRecords.length === 1 ? 'edition' : 'editions'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => pushRoute({ view: 'read-editions', readId: item.id })}
                className="w-full rounded-2xl p-3 border border-white/[0.08] bg-background/50 hover:bg-surface-raised/70 flex items-center justify-between gap-3 text-left transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0 bg-surface-raised">
                    <MediaImage src={activeCover} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">
                      {editionLabel || 'Digital / Issues'}
                    </p>
                    <p className="text-xs text-ink-dim tabular-nums mt-0.5">
                      {stats.total} {stats.unitLabel} · {completedList.length} logged
                    </p>
                    <p className="text-[11px] text-ink-faint truncate mt-0.5">
                      Browse covers, printings & collected issues
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-surface-raised border border-white/10 text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0">
                  <span>{item.comicKind === 'series' ? 'Volumes & editions' : 'Browse editions'}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-read" />
                </span>
              </button>
            </section>
          )}

          {/* Advanced Universal Collection Card (Novels, Manga & Comics) */}
          {detailMode === 'advanced' && (
            <CollectionDetailCard
              domain="read"
              ownership={progress?.ownership}
              details={progress?.collection}
              fallbackNotes={progress?.collectionNote}
              badgeText={mediaColBadge.badgeText}
              extraHeaderAction={
                item.format === 'comic' && stats.total > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setAllReadUnitsOwnership(
                        item.id,
                        collectionSummary.ownedUnits >= stats.total ? undefined : 'owned'
                      )
                    }
                    className="text-[11px] font-semibold text-read/90 hover:text-read shrink-0"
                  >
                    {collectionSummary.ownedUnits >= stats.total
                      ? 'Clear all owned'
                      : 'Mark all issues owned'}
                  </button>
                ) : undefined
              }
              onChangeOwnership={(next) => setReadOwnership(item.id, next)}
              onSaveDetails={(details, own) =>
                updateMediaCollectionDetails('read', item.id, details, own)
              }
            />
          )}

          {/* Advanced Smart Container: Overlapping Comic Runs & Collections */}
          {detailMode === 'advanced' && allSmartContainerEntries.length > 0 && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-read flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Synced Smart Containers</span>
                  </p>
                  <h2 className="font-display font-bold text-base text-ink mt-0.5">
                    Connected Collections &amp; Runs
                  </h2>
                </div>
                <span className="text-[11px] font-semibold text-ink-dim px-2.5 py-1 rounded-full bg-white/[0.06] tabular-nums">
                  {allSmartContainerEntries.length > PRIMARY_CONTAINER_LIMIT
                    ? `Auto-synced atoms · ${allSmartContainerEntries.length}`
                    : 'Auto-synced atoms'}
                </span>
              </div>
              <div className="space-y-2">
                {primaryContainerEntries.map((entry) =>
                  renderSmartContainerRow(entry, 'advanced')
                )}
              </div>
              {renderOverflowContainersSection('advanced')}
            </section>
          )}

          {/* Advanced Smart Container: Book Series */}
          {detailMode === 'advanced' && evalBookSeries && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-read flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Book Series Container</span>
                  </p>
                  <h2 className="font-display font-bold text-base text-ink mt-0.5">
                    {evalBookSeries.series.name}
                  </h2>
                </div>
                <span className="text-xs font-bold text-watched tabular-nums px-2.5 py-1 rounded-full bg-watched/15">
                  {evalBookSeries.finishedCount}/{evalBookSeries.totalCount} books
                </span>
              </div>

              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-watched transition-all duration-300"
                  style={{ width: `${Math.round(evalBookSeries.ratio * 100)}%` }}
                />
              </div>

              <div className="divide-y divide-white/[0.06]">
                {evalBookSeries.entries.map((entry) => (
                  <div
                    key={entry.title}
                    role={entry.readId ? 'button' : undefined}
                    tabIndex={entry.readId ? 0 : undefined}
                    onClick={() => {
                      if (entry.readId && entry.readId !== item.id) {
                        pushRoute({ view: 'read-detail', readId: entry.readId });
                      }
                    }}
                    className={`py-2 flex items-center justify-between gap-3 ${
                      entry.readId && entry.readId !== item.id
                        ? 'cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-xl'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-5 w-5 rounded-full flex items-center justify-center border shrink-0 ${
                          entry.finished
                            ? 'bg-watched/20 border-watched text-watched'
                            : 'border-white/15 text-ink-faint'
                        }`}
                      >
                        {entry.finished && <Check className="w-3 h-3" strokeWidth={2.5} />}
                      </span>
                      <span className="text-sm text-ink truncate">
                        {entry.title}
                        {entry.readId === item.id ? ' (this book)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-ink-dim tabular-nums">
                      {typeof entry.userRating === 'number' && entry.userRating > 0 && (
                        <span className="text-brand font-semibold">★ {entry.userRating}</span>
                      )}
                      {entry.total > 0 && (
                        <span>
                          {entry.current}/{entry.total} ch
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {evalBookSeries.calculatedAvg !== null && evalBookSeries.ratedCount > 0 ? (
                <SuggestedRatingBanner
                  compact
                  label={evalBookSeries.series.name}
                  calculatedAvg={evalBookSeries.calculatedAvg}
                  ratedCount={evalBookSeries.ratedCount}
                  unitWord="books"
                  currentRating={storedSeriesRating?.rating}
                  ratingSource={storedSeriesRating?.source}
                  onAcceptAvg={(avg) => rateCollection(seriesRatingKey, avg, 'auto')}
                  onManualRate={(r) => rateCollection(seriesRatingKey, r, 'manual')}
                />
              ) : (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                  <span className="text-xs text-ink-dim">Rate {evalBookSeries.series.name}</span>
                  <RatingControl
                    size="sm"
                    value={storedSeriesRating?.rating}
                    onChange={(r) => rateCollection(seriesRatingKey, r, 'manual')}
                    labelPrefix={`Rate ${evalBookSeries.series.name}`}
                    allowClear
                  />
                </div>
              )}
              <CompactFinishedDateRow
                variant="inline"
                label="Series finished"
                finishedAt={state.collectionFinishedAt?.[seriesRatingKey]}
                onChangeDate={(ymd) => setCollectionFinishedDate(seriesRatingKey, ymd)}
              />
            </section>
          )}

          {/* Advanced Issue / Chapter Checklist & Unit Ratings */}
          {detailMode === 'advanced' && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-ink">
                  {item.unit === 'issues' ? 'Issue checklist & ratings' : 'Chapter checklist & ratings'}
                </h2>
                {stats.total > UNIT_PAGE_SIZE && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-dim tabular-nums">
                    <button
                      type="button"
                      onClick={() => setUnitPageStart(Math.max(1, pageStart - UNIT_PAGE_SIZE))}
                      disabled={pageStart <= 1}
                      aria-label="Previous unit page"
                      className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center disabled:opacity-35"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      {pageStart}–{pageEnd} / {stats.total}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setUnitPageStart(Math.min(maxPageStart, pageStart + UNIT_PAGE_SIZE))
                      }
                      disabled={pageEnd >= stats.total}
                      aria-label="Next unit page"
                      className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center disabled:opacity-35"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {visibleUnitNumbers.map((u) => {
                  const done = completedSet.has(u);
                  const uRating = progress?.unitRatings?.[u];
                  const selected = safeSelectedUnit === u;
                  const meta = item.format === 'comic' ? item.issueDetails?.[u] : undefined;
                  const unitReleased = item.format !== 'comic' || isComicIssueReleased(meta);
                  const atomId = item.format === 'comic' ? getComicIssueAtomicId(meta) : undefined;
                  const uOwn =
                    item.format === 'comic'
                      ? progress?.unitOwnership?.[u] ||
                        (atomId ? state.atomicReadUnits?.[atomId]?.ownership : undefined)
                      : undefined;
                  return (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setSelectedUnit(u)}
                      className={`relative h-9 rounded-xl border text-xs font-semibold tabular-nums flex flex-col items-center justify-center leading-none transition-colors ${
                        selected
                          ? 'border-white/55 ring-1 ring-white/30 ' +
                            (done ? 'bg-watched/25 text-watched' : 'bg-surface-raised text-ink')
                          : done
                            ? 'border-watched/45 bg-watched/15 text-watched'
                            : !unitReleased
                              ? 'border-dashed border-white/10 bg-background/35 text-ink-faint hover:text-ink-dim'
                              : 'border-white/8 bg-background/60 text-ink-dim hover:text-ink'
                      }`}
                    >
                      {uOwn && (
                        <span
                          aria-hidden="true"
                          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                            uOwn === 'owned' ? 'bg-read' : 'border border-read/80'
                          }`}
                        />
                      )}
                      <span>{item.unit === 'issues' ? `#${u}` : u}</span>
                      {typeof uRating === 'number' && uRating > 0 && (
                        <span className="text-[9px] text-brand mt-0.5 leading-none">
                          ★{formatRating(uRating)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl bg-background/70 border border-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.format === 'comic' && (() => {
                    const selMeta = item.issueDetails?.[safeSelectedUnit];
                    const selThumb = selMeta?.coverUrl || activeCover;
                    const selTitle =
                      selMeta?.title || selMeta?.issueLabel || `Issue #${safeSelectedUnit}`;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setLightboxOverride({
                            src: selThumb,
                            title: selTitle,
                            subtitle: [
                              item.title,
                              selMeta?.issueLabel || `Issue #${safeSelectedUnit}`,
                              selMeta?.releaseDate,
                            ]
                              .filter(Boolean)
                              .join(' · '),
                          });
                          setLightboxOpen(true);
                        }}
                        aria-label={`Zoom ${selTitle} cover`}
                        className="w-9 h-[54px] rounded-md overflow-hidden border border-white/10 bg-surface shrink-0 cursor-zoom-in"
                      >
                        <MediaImage
                          src={selThumb}
                          fallbackSrc={activeCover}
                          alt={selTitle}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })()}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink tabular-nums truncate">
                      {item.format === 'comic'
                        ? item.issueDetails?.[safeSelectedUnit]?.title ||
                          item.issueDetails?.[safeSelectedUnit]?.issueLabel ||
                          `Issue #${safeSelectedUnit}`
                        : `Chapter ${safeSelectedUnit}`}
                    </p>
                    {item.format === 'comic' && (
                      <p className="text-[11px] text-ink-dim flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">
                          {[
                            item.issueDetails?.[safeSelectedUnit]?.issueLabel ||
                              `Issue #${safeSelectedUnit}`,
                            item.issueDetails?.[safeSelectedUnit]?.releaseDate,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {!completedSet.has(safeSelectedUnit) &&
                          !isComicIssueReleased(item.issueDetails?.[safeSelectedUnit]) && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.07] text-[10px] font-semibold text-ink-dim shrink-0">
                              Upcoming
                            </span>
                          )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleReadUnit(item.id, safeSelectedUnit)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                      completedSet.has(safeSelectedUnit)
                        ? 'border-watched/60 bg-watched/15 text-watched'
                        : 'border-white/15 bg-surface text-ink-dim hover:text-ink'
                    }`}
                  >
                    {completedSet.has(safeSelectedUnit) ? '✓ Read' : 'Mark read'}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <RatingControl
                    size="sm"
                    value={progress?.unitRatings?.[safeSelectedUnit]}
                    onChange={(r) => rateReadUnit(item.id, safeSelectedUnit, r)}
                    labelPrefix={`Rate ${item.unit === 'issues' ? `Issue #${safeSelectedUnit}` : `Chapter ${safeSelectedUnit}`}`}
                    allowClear
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUnitNoteText('');
                      setActiveUnitDrawer(safeSelectedUnit);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/12 bg-surface text-ink-dim hover:text-ink transition-colors"
                  >
                    Details & notes
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Advanced Info & Star Rating */}
          {detailMode === 'advanced' && (
            <section className="rounded-[24px] bg-surface border border-white/[0.07] p-4 sm:p-5 space-y-3.5 mb-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[16px] text-ink">About</h2>
                  <p className="text-[13px] text-ink-dim mt-0.5">
                    {[
                      cleanDisplayGenres(item.genres).slice(0, 3).join(' · '),
                      `${item.totalUnits} ${stats.unitLabel}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <RatingControl
                  value={progress?.rating}
                  onChange={(r) => rateReadItem(item.id, r, 'manual')}
                  labelPrefix="Rate title"
                  allowClear
                />
              </div>

              {unitAvg && unitAvg.count > 0 && (
                <SuggestedRatingBanner
                  compact
                  label={item.title}
                  calculatedAvg={unitAvg.avg}
                  ratedCount={unitAvg.count}
                  unitWord={stats.unitLabel}
                  currentRating={progress?.rating}
                  ratingSource={progress?.ratingSource}
                  onAcceptAvg={(avg) => rateReadItem(item.id, avg, 'auto')}
                  onManualRate={(r) => rateReadItem(item.id, r, 'manual')}
                />
              )}

              {item.overview && (
                <div>
                  <p className={`text-[13.5px] text-ink-dim leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
                    {item.overview}
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

              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-ink-dim">Format</span>
                <div className="inline-flex items-center gap-1 bg-background border border-white/10 rounded-full p-1">
                  {(['novel', 'comic', 'manga'] as const).map((fmt) => {
                    const active = item.format === fmt;
                    const label = fmt === 'comic' ? 'Comic' : fmt === 'manga' ? 'Manga' : 'Novel';
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => updateReadFormat(item.id, fmt)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-read text-[#1E1608]'
                            : 'text-ink-dim hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {detailMode === 'advanced' && (
            <PersonalNotesSection
              domain="read"
              mediaKind={item.format}
              mediaId={item.id}
              mediaTitle={item.title}
              mediaPoster={activeCover}
              defaultContext={stats.current > 0 ? stats.unitShort : undefined}
              currentRating={progress?.rating}
              currentMood={progress?.mood}
              onSelectMood={(mood) => setReadMood(item.id, mood)}
            />
          )}
        </div>
      </div>

      <CoverLightbox
        open={lightboxOpen}
        src={lightboxOverride?.src || activeCover}
        title={lightboxOverride?.title || item.title}
        subtitle={lightboxOverride?.subtitle || editionLabel || `${item.creator} · ${item.year}`}
        onClose={() => {
          setLightboxOpen(false);
          setLightboxOverride(null);
        }}
      />

      {/* Issue / Chapter Detail Drawer */}
      {activeUnitDrawer !== null && (() => {
        const u = activeUnitDrawer;
        const done = completedSet.has(u);
        const meta = item.format === 'comic' ? item.issueDetails?.[u] : undefined;
        const unitLabel = item.unit === 'issues' ? `Issue #${u}` : `Chapter ${u}`;
        const unitContextLabel = item.unit === 'issues' ? `Issue #${u}` : `Ch. ${u}`;
        const displayTitle =
          item.format === 'comic'
            ? meta?.title || (meta?.issueLabel ? `${item.title} ${meta.issueLabel}` : unitLabel)
            : unitLabel;
        const issueSub = [
          meta?.issueLabel || (item.format === 'comic' ? `Issue #${u}` : undefined),
          meta?.releaseDate,
          item.comicPublisher,
        ]
          .filter(Boolean)
          .join(' · ');
        const issueThumb = meta?.coverUrl || activeCover;
        const unitRating = progress?.unitRatings?.[u];
        const savedUnitNotes = state.journalEntries.filter(
          (entry) => entry.mediaId === item.id && entry.contextLabel === unitContextLabel
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
            onClick={() => setActiveUnitDrawer(null)}
          >
            <div
              className="w-full md:max-w-md max-h-[88dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl space-y-4 animate-sheet-up"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {item.format === 'comic' && (
                    <button
                      type="button"
                      onClick={() => {
                        setLightboxOverride({
                          src: issueThumb,
                          title: displayTitle,
                          subtitle: [item.title, meta?.issueLabel || `Issue #${u}`, meta?.releaseDate]
                            .filter(Boolean)
                            .join(' · '),
                        });
                        setLightboxOpen(true);
                      }}
                      aria-label={`View ${displayTitle} cover fullscreen`}
                      className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden bg-surface border border-white/10 shrink-0 cursor-zoom-in"
                    >
                      <MediaImage
                        src={issueThumb}
                        fallbackSrc={activeCover}
                        alt={displayTitle}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}

                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-read tabular-nums">
                      {meta?.seriesTitle
                        ? `${meta.seriesTitle} ${meta?.issueLabel || `#${u}`}`
                        : meta?.issueLabel || unitLabel}
                    </p>
                    <h3 className="font-display font-bold text-lg text-ink leading-snug mt-0.5">
                      {displayTitle}
                    </h3>
                    {issueSub && (
                      <p className="text-xs text-ink-dim mt-1">{issueSub}</p>
                    )}
                    {item.format !== 'comic' && (
                      <p className="text-xs text-ink-dim mt-1">{item.title}</p>
                    )}
                    {(() => {
                      const atomId = getComicIssueAtomicId(meta);
                      if (!atomId) return null;
                      const linkedCount = overlappingContainers.filter((c) => {
                        const other = state.readItems[c.readId];
                        return (
                          other?.issueDetails &&
                          Object.values(other.issueDetails).some(
                            (om) => getComicIssueAtomicId(om) === atomId
                          )
                        );
                      }).length;
                      if (linkedCount === 0) return null;
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-watched/12 border border-watched/25 text-[10.5px] font-semibold text-watched">
                          <Layers className="w-3 h-3" />
                          <span>
                            Synced across {linkedCount + 1}{' '}
                            {linkedCount + 1 === 1 ? 'container' : 'containers'}
                          </span>
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveUnitDrawer(null)}
                  aria-label="Close details"
                  className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {item.format === 'comic' &&
                (meta?.writers || meta?.artists || meta?.synopsis || loadingUnitDetail) && (
                  <div className="rounded-2xl bg-surface border border-white/[0.06] p-3.5 space-y-2">
                    {(meta?.writers || meta?.artists) && (
                      <div className="space-y-1 text-xs">
                        {meta.writers && (
                          <p className="text-ink-dim">
                            <span className="text-ink-faint font-semibold">Writer: </span>
                            <span className="text-ink">{meta.writers}</span>
                          </p>
                        )}
                        {meta.artists && (
                          <p className="text-ink-dim">
                            <span className="text-ink-faint font-semibold">Artist: </span>
                            <span className="text-ink">{meta.artists}</span>
                          </p>
                        )}
                      </div>
                    )}
                    {meta?.synopsis ? (
                      <p className="text-xs text-ink-dim leading-relaxed">{meta.synopsis}</p>
                    ) : loadingUnitDetail ? (
                      <p className="text-xs text-ink-faint">Loading issue details…</p>
                    ) : null}
                  </div>
                )}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <span className="text-sm font-medium text-ink">Status</span>
                <button
                  type="button"
                  onClick={() => toggleReadUnit(item.id, u)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                    done
                      ? 'border-watched bg-watched/15 text-watched'
                      : 'border-white/12 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span>{done ? 'Read' : 'Mark as read'}</span>
                </button>
              </div>

              <CompactFinishedDateRow
                variant="drawer"
                label={item.unit === 'issues' ? 'Issue finished' : 'Chapter finished'}
                finishedAt={
                  progress?.unitFinishedAt?.[u] ||
                  (() => {
                    const aId = getComicIssueAtomicId(meta);
                    return aId ? state.atomicReadUnits?.[aId]?.readAt : undefined;
                  })()
                }
                onChangeDate={(ymd) => setReadUnitFinishedDate(item.id, u, ymd)}
              />

              {item.format === 'comic' && (() => {
                const aId = getComicIssueAtomicId(meta);
                const curOwn =
                  progress?.unitOwnership?.[u] ||
                  (aId ? state.atomicReadUnits?.[aId]?.ownership : undefined);
                return (
                  <div className="rounded-2xl bg-surface border border-white/8 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">Collection</span>
                      <div className="inline-flex rounded-full bg-background border border-white/[0.08] p-0.5 text-[11px] font-semibold">
                        {(
                          [
                            { id: 'none', label: 'None', val: undefined },
                            { id: 'owned', label: 'Owned', val: 'owned' },
                            { id: 'wishlist', label: 'Want', val: 'wishlist' },
                          ] as const
                        ).map((opt) => {
                          const active =
                            opt.val === undefined ? !curOwn : curOwn === opt.val;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setReadUnitOwnership(item.id, u, opt.val)}
                              className={`px-2.5 py-1 rounded-full transition-colors ${
                                active
                                  ? opt.val
                                    ? 'bg-read/20 text-read'
                                    : 'bg-surface-raised text-ink'
                                  : 'text-ink-dim hover:text-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {curOwn && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          setReadUnitVariantNote(item.id, u, variantNoteDraft);
                        }}
                        className="flex items-center gap-2 pt-2 border-t border-white/[0.06]"
                      >
                        <input
                          type="text"
                          value={variantNoteDraft}
                          onChange={(e) => setVariantNoteDraft(e.target.value)}
                          placeholder="Cover / printing note (e.g. Cover B · Signed)"
                          className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-read"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-xl bg-read/20 text-read text-xs font-semibold shrink-0 hover:bg-read/30"
                        >
                          Save
                        </button>
                      </form>
                    )}
                  </div>
                );
              })()}

              <div className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-white/8">
                <span className="text-sm font-medium text-ink">
                  {item.unit === 'issues' ? 'Issue rating' : 'Chapter rating'}
                </span>
                <RatingControl
                  value={unitRating}
                  onChange={(r) => rateReadUnit(item.id, u, r)}
                  labelPrefix={`Rate ${unitLabel}`}
                  allowClear
                />
              </div>

              {savedUnitNotes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Your {unitContextLabel} notes
                  </p>
                  {savedUnitNotes.slice(0, 3).map((note) => (
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
                  if (!unitNoteText.trim()) return;
                  addJournalEntry({
                    domain: 'read',
                    mediaKind: item.format,
                    mediaId: item.id,
                    mediaTitle: item.title,
                    mediaPoster: issueThumb,
                    contextLabel: unitContextLabel,
                    text: unitNoteText.trim(),
                    rating: unitRating ?? progress?.rating,
                    mood: progress?.mood,
                  });
                  setUnitNoteText('');
                }}
                className="space-y-2.5"
              >
                <textarea
                  rows={2}
                  value={unitNoteText}
                  onChange={(e) => setUnitNoteText(e.target.value)}
                  placeholder={`Write a private note about ${unitContextLabel}…`}
                  className="w-full rounded-xl bg-surface border border-white/10 p-3 text-sm text-ink outline-none focus:border-read resize-none"
                />
                <button
                  type="submit"
                  disabled={!unitNoteText.trim()}
                  className="w-full py-2.5 rounded-full bg-read text-[#1E1608] text-sm font-semibold disabled:opacity-40"
                >
                  Save {item.unit === 'issues' ? 'issue' : 'chapter'} note
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
                const included = list.items.some((x) => x.kind === 'read' && x.id === item.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'read', item.id)}
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
                    createCustomList(newListName, '', { kind: 'read', id: item.id });
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
        kind="read"
        title={item.title}
        creator={item.comicPublisher || item.creator}
        year={item.year}
        coverUrl={activeCover}
        unitLabel={item.unit === 'issues' ? 'issues' : 'chapters'}
        currentTotal={stats.total}
        totalSource={item.totalUnitsSource}
        publicationStatus={item.publicationStatus}
        refreshLabel={
          item.format === 'manga'
            ? 'Check live chapter count'
            : item.format === 'comic'
              ? 'Re-sync issues & cover'
              : undefined
        }
        onRefreshLive={
          item.format === 'manga'
            ? async (): Promise<FixMediaRefreshResult | null> => {
                const res = await fetchLiveMangaChapterCount(item.title, item.year);
                if (!res || !res.totalChapters) return null;
                updateReadTotalUnits(item.id, res.totalChapters, {
                  source: 'api',
                  syncedAt: res.checkedAt || new Date().toISOString(),
                  publicationStatus: res.status,
                });
                return {
                  total: res.totalChapters,
                  status: res.status,
                  sourceLabel: res.source === 'mangaupdates' ? 'MangaUpdates' : 'MangaDex',
                };
              }
            : item.format === 'comic'
              ? async (): Promise<FixMediaRefreshResult | null> => {
                  const total = Math.max(1, item.totalUnits);
                  if (item.comicKind === 'series' && item.comicSeriesWiki && item.comicSeriesVolTitle) {
                    const { issues, totalIssues } = await fetchComicSeriesIssues(
                      item.comicSeriesWiki,
                      item.comicSeriesVolTitle,
                      Math.max(90, total)
                    );
                    const nextKey = `${progress?.editionId || progress?.edition || 'default'}::${totalIssues || total}::${COMIC_ISSUE_CACHE_VERSION}`;
                    if (Object.keys(issues).length > 0 || totalIssues > 0) {
                      updateReadIssueDetails(
                        item.id,
                        issues,
                        nextKey,
                        totalIssues > 0 ? totalIssues : undefined
                      );
                      return {
                        total: totalIssues || Object.keys(issues).length,
                        sourceLabel: 'Wiki Sync',
                      };
                    }
                    return null;
                  }
                  const col = await fetchComicCollectionIssues({
                    title: item.title,
                    isbn: extractReadItemIsbn(item),
                    overview: item.overview,
                    publisher: item.comicPublisher,
                    wiki: item.comicSeriesWiki,
                    pageTitle: item.comicSeriesVolTitle,
                    limit: Math.max(100, total),
                  });
                  if (Object.keys(col.issues).length > 0) {
                    const nextKey = `${progress?.editionId || progress?.edition || 'default'}::${col.totalIssues || total}::${COMIC_ISSUE_CACHE_VERSION}`;
                    updateReadIssueDetails(
                      item.id,
                      col.issues,
                      nextKey,
                      col.totalIssues > 0 ? col.totalIssues : undefined,
                      {
                        coverUrl: col.coverUrl,
                        publisher: col.publisher,
                        year: col.year,
                        wiki: col.wiki,
                        collectionPageTitle: col.collectionPageTitle,
                      }
                    );
                    return {
                      total: col.totalIssues || Object.keys(col.issues).length,
                      sourceLabel: 'Comic Sync',
                    };
                  }
                  return null;
                }
              : undefined
        }
        onSave={(patch) => {
          updateReadMetadata(item.id, patch);
        }}
      />
    </div>
  );
}
