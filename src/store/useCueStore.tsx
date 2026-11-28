import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createEmptyState } from '../data/seedState';
import {
  generateSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  pullCloudLibrary,
  pushCloudLibrary,
} from '../services/syncApi';
import {
  COMIC_ISSUE_CACHE_VERSION,
  fetchComicCollectionIssues,
  fetchComicSeriesIssues,
  fetchTvmazeEpisodeSchedule,
  hydrateLiveReadItem,
  searchByIsbn,
} from '../services/mediaApi';
import type {
  AppSettings,
  CastMember,
  CollectionDetails,
  ComicEditionId,
  ComicEditionRecord,
  ComicIssueMeta,
  ComicOwnershipStatus,
  ComicWikiSlug,
  CompletionRun,
  CueStoreState,
  CustomListStep,
  GameChapterSource,
  GameChapterUnit,
  GameItem,
  GamePlatform,
  GameProgress,
  GameWatchStatus,
  GeneralizedComicEditionId,
  HistoryEntry,
  JournalEntry,
  MediaDomain,
  Movie,
  MovieProgress,
  MovieWatchStatus,
  OwnershipStatus,
  PersonalMood,
  RatingSource,
  ReadItem,
  ReadProgress,
  ReadWatchStatus,
  RouteView,
  Season,
  Show,
  ShowProgress,
  UserProfile,
} from '../types';
import {
  evaluateBookSeriesProgress,
  evaluateComicEditionContainers,
  evaluateCustomListProgress,
  evaluateMovieCollectionProgress,
  findBookSeries,
  findMovieCollection,
  recomputeAutoCollectionRatings,
} from '../utils/containers';
import {
  buildRouteUrlWithHash,
  type CueHistoryStateLike,
  resolvePopStateStack,
  routesEqual,
} from '../utils/navigationStack';
import {
  getComicEditionLabel,
  getKnownComicEditionSpec,
  mergeComicEditionCatalog,
  normalizeComicEditionId,
  resolveComicEditionCover,
  resolveComicEditionTotal,
} from '../utils/editions';
import { lookupKnownGameChapters } from '../utils/gameChapters';
import {
  type AtomicDelta,
  type AtomicOwnershipDelta,
  type SyncedContainerSummary,
  detectNonAdjacentPriorAtoms,
  extractReadItemIsbn,
  getComicIssueAtomicId,
  isCollectedComicItem,
  makeComicAtomicId,
  reconcileHydratedComicItemWithAtoms,
  syncAtomicReadUnitsAcrossState,
} from '../utils/atoms';
import {
  annotateImportDuplicates,
  classifyReadFormat,
  type ImportCandidate,
  type ImportConflictPolicy,
  normalizeImportDateIso,
  type PreparedImportEntry,
} from '../utils/mediaImport';
import {
  clearImportHistory,
  type ImportBatchRecord,
  loadImportHistory,
  MAX_IMPORT_HISTORY,
  rollbackImportRecord,
  saveImportHistory,
} from '../utils/importHistory';
import {
  applyAutoRating,
  getGameChaptersAverage,
  getReadUnitsAverage,
  getSeasonEpisodeAverage,
  getShowCalculatedAverage,
} from '../utils/ratings';
import {
  cleanDisplayGenres,
  formatEpisodeCode,
  formatGameMeta,
  getAllEpisodes,
  getCompletedReadUnits,
  getEpisodeKey,
  getSeasonProgress,
  getShowStats,
  getTodayLocalYmd,
  isComicIssueReleased,
  isEpisodeReleased,
} from '../utils/stats';

const STORAGE_KEY = 'cue_state_v3';
const LEGACY_V2_KEY = 'cue_state_v2';
const LEGACY_STORAGE_KEY = 'cue_state_v1';
const SYNC_CODE_KEY = 'cue_sync_code_v1';
const SYNC_TS_KEY = 'cue_sync_ts_v1';
const LOCAL_EDIT_TS_KEY = 'cue_local_ts_v1';

const MAX_HISTORY_ENTRIES = 60;

function toFinishedIso(dateValue?: string): string | undefined {
  const trimmed = dateValue?.trim();
  if (!trimmed) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00.000Z` : trimmed;
}

function appendHistory(prev: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...prev, entry];
  return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next;
}

function normalizeLoadedCueState(raw: CueStoreState): CueStoreState {
  if (!Array.isArray(raw.history)) {
    raw.history = [];
  }
  if (!raw.collectionRatings) {
    raw.collectionRatings = {};
  }
  if (!raw.collectionFinishedAt) {
    raw.collectionFinishedAt = {};
  }
  if (!raw.mindFeedback) {
    raw.mindFeedback = { dismissedIds: [], dismissedGenres: {}, acceptedCount: 0 };
  }
  if (!raw.atomicReadUnits) {
    raw.atomicReadUnits = {};
  }
  if (!Array.isArray(raw.pendingIsbnScans)) {
    raw.pendingIsbnScans = [];
  }
  if (raw.settings && !raw.settings.detailMode) {
    raw.settings.detailMode = 'simple';
  }
  if (raw.settings?.watchFilter === 'anime') {
    raw.settings.watchFilter = 'tv';
  }
  if (raw.shows) {
    for (const show of Object.values(raw.shows)) {
      if (show && show.mediaType === 'anime') {
        show.mediaType = 'tv';
        const hasAnimeGenre = (show.genres || []).some((g) => g.toLowerCase() === 'anime');
        if (!hasAnimeGenre) {
          show.genres = ['Anime', ...(show.genres || [])];
        }
      }
    }
  }
  return raw;
}

function loadInitialState(): CueStoreState {
  try {
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as CueStoreState;
      if (parsed && parsed.shows && parsed.movies && parsed.readItems && parsed.games) {
        return normalizeLoadedCueState(parsed);
      }
    }
    const empty = createEmptyState();
    const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
    if (rawV2) {
      const v2 = JSON.parse(rawV2) as Partial<CueStoreState>;
      if (v2.profile) empty.profile = { ...empty.profile, ...v2.profile };
      if (v2.settings) {
        empty.settings = {
          ...empty.settings,
          watchLayout: v2.settings.watchLayout || empty.settings.watchLayout,
          readLayout: v2.settings.readLayout || empty.settings.readLayout,
          playLayout: v2.settings.playLayout || empty.settings.playLayout,
          sortBy: v2.settings.sortBy || empty.settings.sortBy,
          showPosterProgress: v2.settings.showPosterProgress ?? empty.settings.showPosterProgress,
          tmdbApiKey: v2.settings.tmdbApiKey || '',
        };
      }
      if (v2.showProgress) empty.showProgress = { ...empty.showProgress, ...v2.showProgress };
      if (v2.movieProgress) empty.movieProgress = { ...empty.movieProgress, ...v2.movieProgress };
      if (v2.gameProgress) empty.gameProgress = { ...empty.gameProgress, ...v2.gameProgress };
      return empty;
    }
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1) as {
        profile?: { name?: string; handle?: string; avatarUrl?: string; bannerUrl?: string };
        settings?: { tmdbApiKey?: string };
      };
      if (v1?.profile?.name) {
        empty.profile.name = v1.profile.name;
        if (v1.profile.avatarUrl) empty.profile.avatarUrl = v1.profile.avatarUrl;
        if (v1.profile.bannerUrl) empty.profile.bannerUrl = v1.profile.bannerUrl;
      }
      if (v1?.settings?.tmdbApiKey) empty.settings.tmdbApiKey = v1.settings.tmdbApiKey;
    }
    return empty;
  } catch {
    return createEmptyState();
  }
}

export interface ToastOptions {
  domain?: MediaDomain | 'neutral';
  subtitle?: string;
  posterUrl?: string;
  tone?: 'success' | 'info' | 'undo';
}

export interface ToastItem extends ToastOptions {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ReleaseBannerData {
  title: string;
  body: string;
  timeLabel: string;
  domain: MediaDomain;
  mediaKind?: 'show' | 'read' | 'game';
  mediaId?: string;
}

export interface CatchUpPromptItem {
  id: string;
  mediaKey: string;
  kind: 'show' | 'read';
  mediaId: string;
  title: string;
  count: number;
  unitSingular: 'episode' | 'issue' | 'chapter';
  unitPlural: 'episodes' | 'issues' | 'chapters';
  verbPast: 'watched' | 'read';
  mediaNoun: 'show' | 'comic' | 'manga' | 'book';
  episodeTargets?: Array<{ season: number; number: number }>;
  readUnitTargets?: number[];
}

interface CueContextValue {
  state: CueStoreState;
  route: RouteView;
  canGoBack: boolean;
  switchTab: (
    tab: 'queue' | 'watch' | 'read' | 'play' | 'journal' | 'search',
    calendarMode?: boolean
  ) => void;
  pushRoute: (next: RouteView) => void;
  goBack: () => void;
  toggleCalendarMode: () => void;

  toast: ToastItem | null;
  dismissToast: () => void;
  showToast: (
    message: string,
    actionLabel?: string,
    onAction?: () => void,
    options?: ToastOptions
  ) => void;

  catchUpPrompt: CatchUpPromptItem | null;
  confirmCatchUpPrompt: () => void;
  neverAskCatchUpPrompt: () => void;
  dismissCatchUpPrompt: () => void;

  activeBanner: ReleaseBannerData | null;
  dismissBanner: () => void;
  triggerSampleReleaseAlert: () => void;

  // Modals & local overlays
  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  insightsOpen: boolean;
  setInsightsOpen: (open: boolean) => void;
  importModalOpen: boolean;
  setImportModalOpen: (open: boolean) => void;
  registerOverlayBackHandler: (onBack: () => void) => () => void;

  // Watch actions
  watchNextEpisode: (showId: string) => void;
  toggleEpisodeWatched: (showId: string, season: number, number: number) => void;
  incrementEpisodeRewatch: (showId: string, season: number, number: number, delta: number) => void;
  toggleShowBookmark: (showId: string) => void;
  toggleShowNotifications: (showId: string) => void;
  markSeasonWatched: (showId: string, seasonNumber: number, rewatchIfDone?: boolean) => void;
  markShowAllWatched: (showId: string) => void;
  startShowRewatch: (showId: string) => void;
  resetShowProgress: (showId: string) => void;
  rateEpisode: (showId: string, season: number, number: number, rating: number | undefined) => void;
  rateSeason: (
    showId: string,
    seasonNumber: number,
    rating: number | undefined,
    source?: RatingSource
  ) => void;
  rateShow: (showId: string, rating: number | undefined, source?: RatingSource) => void;
  setEpisodeFinishedDate: (
    showId: string,
    season: number,
    number: number,
    dateYmd: string | undefined
  ) => void;
  setSeasonFinishedDate: (
    showId: string,
    seasonNumber: number,
    dateYmd: string | undefined
  ) => void;
  setShowMood: (showId: string, mood: PersonalMood | undefined) => void;
  updateShowEpisodes: (
    showId: string,
    seasons: Season[],
    cast?: CastMember[],
    runtimeAvg?: number
  ) => void;
  updateShowMetadata: (
    showId: string,
    patch: {
      title?: string;
      year?: number;
      posterUrl?: string;
      totalEpisodes?: number;
    }
  ) => void;

  toggleMovieWatched: (movieId: string) => void;
  incrementMovieRewatch: (movieId: string, delta: number) => void;
  toggleMovieWatchlist: (movieId: string) => void;
  rateMovie: (movieId: string, rating: number | undefined) => void;
  setMovieMood: (movieId: string, mood: PersonalMood | undefined) => void;
  updateMovieDetails: (movieId: string, patch: Partial<Movie>) => void;

  // Read actions
  advanceReadProgress: (readId: string, delta?: number) => void;
  setReadProgress: (readId: string, currentUnit: number) => void;
  toggleReadUnit: (readId: string, unitNumber: number) => void;
  setReadUnitsBatch: (readId: string, unitNumbers: number[], completed: boolean) => void;
  markReadFinished: (readId: string) => void;
  incrementReread: (readId: string, delta: number) => void;
  toggleReadBookmark: (readId: string) => void;
  rateReadUnit: (readId: string, unitNumber: number, rating: number | undefined) => void;
  rateReadItem: (readId: string, rating: number | undefined, source?: RatingSource) => void;
  setReadUnitFinishedDate: (
    readId: string,
    unitNumber: number,
    dateYmd: string | undefined
  ) => void;
  setReadOwnership: (readId: string, ownership: ComicOwnershipStatus | undefined) => void;
  setReadCollectionNote: (readId: string, note: string) => void;
  setReadUnitOwnership: (
    readId: string,
    unitNumber: number,
    ownership: ComicOwnershipStatus | undefined
  ) => void;
  setReadUnitVariantNote: (readId: string, unitNumber: number, note: string) => void;
  setAllReadUnitsOwnership: (
    readId: string,
    ownership: ComicOwnershipStatus | undefined
  ) => void;
  toggleComicEditionOwnership: (
    readId: string,
    editionId: string,
    target: ComicOwnershipStatus
  ) => void;
  setReadMood: (readId: string, mood: PersonalMood | undefined) => void;
  setReadEdition: (readId: string, edition: ComicEditionId) => void;
  selectComicEdition: (readId: string, editionRecord: ComicEditionRecord) => void;
  updateReadEditionsCatalog: (readId: string, editions: ComicEditionRecord[]) => void;
  updateReadIssueDetails: (
    readId: string,
    issueDetails: Record<number, ComicIssueMeta>,
    detailsKey: string,
    resolvedTotalUnits?: number,
    metaPatch?: {
      coverUrl?: string;
      publisher?: string;
      year?: number;
      wiki?: ComicWikiSlug;
      collectionPageTitle?: string;
    }
  ) => void;
  patchReadIssueMeta: (
    readId: string,
    unitNumber: number,
    patch: Partial<ComicIssueMeta>
  ) => void;
  updateReadEditionCovers: (
    readId: string,
    editionCovers: Partial<Record<ComicEditionId, string>>,
    cleanTitle?: string,
    editionIssueCounts?: Partial<Record<ComicEditionId, number>>,
    editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>
  ) => void;
  updateReadTotalUnits: (
    readId: string,
    totalUnits: number,
    meta?: {
      source?: 'api' | 'estimated' | 'manual';
      syncedAt?: string;
      publicationStatus?: ReadItem['publicationStatus'];
    }
  ) => void;
  updateReadMetadata: (
    readId: string,
    patch: {
      title?: string;
      creator?: string;
      year?: number;
      coverUrl?: string;
      totalUnits?: number;
      totalUnitsSource?: ReadItem['totalUnitsSource'];
      totalUnitsSyncedAt?: string;
      publicationStatus?: ReadItem['publicationStatus'];
    }
  ) => void;
  updateReadFormat: (readId: string, format: ReadItem['format']) => void;
  autoClassifyReadLibrary: () => { comics: number; manga: number };
  resetReadProgress: (readId: string) => void;

  // Play actions
  logGameSession: (gameId: string, hoursDelta: number) => void;
  advanceGameChapter: (gameId: string, delta?: number) => void;
  setGameChapter: (gameId: string, chapter: number, opts?: { silent?: boolean }) => void;
  updateGameChaptersMeta: (
    gameId: string,
    totalChapters: number,
    unit?: GameChapterUnit,
    source?: GameChapterSource,
    note?: string
  ) => void;
  updateGameMetadata: (
    gameId: string,
    patch: Partial<
      Pick<
        GameItem,
        | 'title'
        | 'developer'
        | 'year'
        | 'coverUrl'
        | 'backdropUrl'
        | 'overview'
        | 'genres'
        | 'platforms'
        | 'igdbId'
        | 'steamAppId'
        | 'franchise'
        | 'rating'
        | 'totalChapters'
        | 'chapterUnit'
        | 'chapterSource'
        | 'chapterNote'
      >
    >
  ) => void;
  applyGameChapterList: (
    gameId: string,
    chapters: string[],
    unit: GameChapterUnit,
    source?: GameChapterSource,
    note?: string
  ) => void;
  updateGameProgress: (
    gameId: string,
    patch: Partial<{
      status: GameWatchStatus;
      hoursPlayed: number;
      completionPct: number;
      platform: GamePlatform;
    }>
  ) => void;
  toggleGameCompleted: (gameId: string) => void;
  toggleGamePlatinum: (gameId: string) => void;
  incrementGamePlaythrough: (gameId: string, delta: number) => void;
  toggleGameBookmark: (gameId: string) => void;
  rateGame: (gameId: string, rating: number | undefined, source?: RatingSource) => void;
  rateGameChapter: (gameId: string, chapter: number, rating: number | undefined) => void;
  setGameChapterFinishedDate: (
    gameId: string,
    chapter: number,
    dateYmd: string | undefined
  ) => void;
  setGameChapterTitle: (gameId: string, chapter: number, title: string) => void;
  setGameMood: (gameId: string, mood: PersonalMood | undefined) => void;
  setMediaFinishedDate: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    dateValue: string | undefined
  ) => void;
  addCompletionRun: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    dateYmd: string,
    note?: string
  ) => void;
  updateCompletionRunDate: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    runId: string,
    dateYmd: string
  ) => void;
  deleteCompletionRun: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    runId: string
  ) => void;
  resetGameProgress: (gameId: string) => void;

  // Collection & List actions
  setMediaOwnership: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    ownership: OwnershipStatus | undefined
  ) => void;
  updateMediaCollectionDetails: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    details: Partial<CollectionDetails>,
    ownershipOverride?: OwnershipStatus
  ) => void;
  rateCollection: (
    collectionKey: string,
    rating: number | undefined,
    source?: RatingSource
  ) => void;
  setCollectionFinishedDate: (collectionKey: string, dateYmd: string | undefined) => void;
  toggleListPinnedToQueue: (listId: string) => void;
  deleteCustomList: (listId: string) => void;
  createCuratedReadingOrder: (
    templateId: 'hox-pox' | 'secret-wars-2015' | 'annihilation'
  ) => string;
  reorderListItem: (
    listId: string,
    fromIndex: number,
    toIndex: number,
    target?: 'items' | 'steps'
  ) => void;
  addReadingOrderStep: (listId: string, seriesTitle: string, issueNumber: number) => void;
  removeReadingOrderStep: (listId: string, stepId: string) => void;
  toggleReadingOrderStep: (listId: string, stepId: string) => void;

  // Bulk Edit & Offline ISBN Queue
  bulkUpdateItems: (
    items: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>,
    action: 'finish' | 'active' | 'queue' | 'remove' | 'add_to_list',
    listId?: string
  ) => void;
  queuePendingIsbnScan: (isbn: string) => void;
  removePendingIsbnScan: (isbn: string) => void;
  flushPendingIsbnScans: () => Promise<number>;

  // Live catalog additions
  addLiveShowToStore: (show: Show, andBookmark?: boolean) => void;
  addLiveMovieToStore: (movie: Movie, status?: MovieWatchStatus, andBookmark?: boolean) => void;
  addLiveReadToStore: (item: ReadItem, status?: ReadWatchStatus, andBookmark?: boolean) => void;
  addLiveGameToStore: (game: GameItem, status?: GameWatchStatus, andBookmark?: boolean) => void;
  patchMediaMetadata: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    patch: {
      posterUrl?: string;
      backdropUrl?: string;
      coverUrl?: string;
      clearStaleIssues?: boolean;
    }
  ) => void;

  // Private Journal & Lists
  addJournalEntry: (input: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  deleteJournalEntry: (entryId: string) => void;
  markAllNotificationsRead: () => void;
  dismissMindRecommendation: (itemId: string, genres?: string[]) => void;
  recordMindDiscoverAccept: (genres?: string[]) => void;
  createCustomList: (
    name: string,
    description: string,
    initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string },
    initialItems?: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>,
    options?: { isOrdered?: boolean; steps?: CustomListStep[] }
  ) => void;
  toggleItemInList: (
    listId: string,
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string
  ) => void;

  updateProfile: (patch: Partial<UserProfile>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportLibraryJson: () => string;
  importLibraryJson: (rawJson: string) => { ok: boolean; summary: string };
  restoreCueBackup: (backupState: CueStoreState, fileName?: string) => void;
  importSmartBatch: (
    entries: PreparedImportEntry[],
    policy: ImportConflictPolicy,
    meta?: { sourceLabel?: string; fileName?: string }
  ) => { added: number; updated: number; skipped: number };
  recentImports: ImportBatchRecord[];
  undoImportById: (importId: string) => void;
  dismissImportRecord: (importId: string) => void;
  undoLastImport: () => void;
  selectiveReset: (scope: 'watch' | 'read' | 'play' | 'all') => void;
  clearAllData: () => void;

  // No-account cloud sync
  syncCode: string | null;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: number | null;
  syncError: string | null;
  createSyncCode: () => Promise<string | null>;
  linkSyncCode: (rawCode: string) => Promise<{ ok: boolean; message: string }>;
  syncNow: () => Promise<void>;
  unlinkSyncCode: () => void;
}

const CueContext = createContext<CueContextValue | null>(null);

interface CueHistoryState extends CueHistoryStateLike {
  cueNav: true;
  sessionId?: string;
  depth: number;
  stack: RouteView[];
  modal?: boolean;
  overlayId?: number;
}

function getInitialHistoryState(): { stack: RouteView[] } {
  try {
    const st = window.history.state as Partial<CueHistoryState> | null;
    if (st?.cueNav && Array.isArray(st.stack) && st.stack.length > 0) {
      return { stack: st.stack };
    }
  } catch {
    // ignore history access errors
  }
  return { stack: [{ view: 'queue' }] };
}

export function CueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CueStoreState>(loadInitialState);
  const initialHistoryRef = useRef<{ stack: RouteView[] } | null>(null);
  if (!initialHistoryRef.current) {
    initialHistoryRef.current = getInitialHistoryState();
  }
  const [routeStack, setRouteStack] = useState<RouteView[]>(initialHistoryRef.current.stack);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [catchUpPrompt, setCatchUpPrompt] = useState<CatchUpPromptItem | null>(null);
  const [activeBanner, setActiveBanner] = useState<ReleaseBannerData | null>(null);

  const [filterSheetOpen, setFilterSheetOpenRaw] = useState(false);
  const [notificationsOpen, setNotificationsOpenRaw] = useState(false);
  const [settingsOpen, setSettingsOpenRaw] = useState(false);
  const [insightsOpen, setInsightsOpenRaw] = useState(false);
  const [importModalOpen, setImportModalOpenRaw] = useState(false);
  const [recentImports, setRecentImports] = useState<ImportBatchRecord[]>(() =>
    loadImportHistory()
  );
  const recentImportsRef = useRef<ImportBatchRecord[]>(recentImports);
  recentImportsRef.current = recentImports;
  const lastPreImportStateRef = useRef<CueStoreState | null>(null);
  const routeStackRef = useRef<RouteView[]>(routeStack);
  routeStackRef.current = routeStack;
  const navSessionIdRef = useRef<string>(
    `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  const historyDepthRef = useRef<number>(0);
  const navSeqRef = useRef<number>(0);
  const scrollByRouteKeyRef = useRef<Map<string, number>>(new Map());
  const modalFlagsRef = useRef({
    filter: false,
    notifications: false,
    settings: false,
    insights: false,
    import: false,
  });
  const modalOpenedNavSeqRef = useRef<Partial<Record<keyof typeof modalFlagsRef.current, number>>>({});
  const suppressModalBackPopRef = useRef(0);
  const overlayHandlersRef = useRef<Array<{ id: number; close: () => void }>>([]);
  const overlayIdSeqRef = useRef(1);

  const [syncCode, setSyncCode] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(SYNC_CODE_KEY);
      return saved && isValidSyncCode(saved) ? normalizeSyncCode(saved) : null;
    } catch {
      return null;
    }
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    try {
      const val = Number(localStorage.getItem(SYNC_TS_KEY));
      return Number.isFinite(val) && val > 0 ? val : null;
    } catch {
      return null;
    }
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const syncCodeRef = useRef(syncCode);
  syncCodeRef.current = syncCode;
  const lastSyncedAtRef = useRef(lastSyncedAt);
  lastSyncedAtRef.current = lastSyncedAt;
  const localEditedAtRef = useRef<number>(
    (() => {
      try {
        return Number(localStorage.getItem(LOCAL_EDIT_TS_KEY) || 0) || 0;
      } catch {
        return 0;
      }
    })()
  );
  const isInitialMountRef = useRef(true);
  const suppressNextPushRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  const route = routeStack[routeStack.length - 1];
  const canGoBack = routeStack.length > 1;

  const showToast = useCallback(
    (
      message: string,
      actionLabel?: string,
      onAction?: () => void,
      options?: ToastOptions
    ) => {
      setToast({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message,
        actionLabel,
        onAction,
        ...options,
      });
    },
    []
  );

  const commitState = useCallback(
    (updater: (prev: CueStoreState) => CueStoreState): CueStoreState => {
      const next = updater(stateRef.current);
      if (next !== stateRef.current) {
        stateRef.current = next;
        setState(next);
      }
      return next;
    },
    []
  );

  const hydrateFromCloud = useCallback((cloudState: CueStoreState, cloudTs: number) => {
    const normalized = normalizeLoadedCueState(cloudState);
    suppressNextPushRef.current = true;
    localEditedAtRef.current = cloudTs;
    try {
      localStorage.setItem(LOCAL_EDIT_TS_KEY, String(cloudTs));
      localStorage.setItem(SYNC_TS_KEY, String(cloudTs));
    } catch {
      // ignore storage quota
    }
    stateRef.current = normalized;
    setState(normalized);
    setLastSyncedAt(cloudTs);
    setSyncStatus('synced');
    setSyncError(null);
  }, []);

  const persistPush = useCallback(async (code: string, snapshot: CueStoreState, updatedAt: number) => {
    setSyncStatus('syncing');
    setSyncError(null);
    const res = await pushCloudLibrary(code, snapshot, updatedAt);
    if (res.ok) {
      try {
        localStorage.setItem(SYNC_TS_KEY, String(res.updatedAt));
        localStorage.setItem(LOCAL_EDIT_TS_KEY, String(res.updatedAt));
      } catch {
        // ignore storage quota
      }
      localEditedAtRef.current = res.updatedAt;
      setLastSyncedAt(res.updatedAt);
      setSyncStatus('synced');
      setSyncError(null);
      return res;
    }
    setSyncStatus('error');
    setSyncError(res.error || 'Failed to sync to cloud.');
    return res;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }

    const editedAt = Date.now();
    localEditedAtRef.current = editedAt;
    try {
      localStorage.setItem(LOCAL_EDIT_TS_KEY, String(editedAt));
    } catch {
      // ignore
    }

    const activeCode = syncCodeRef.current;
    if (!activeCode) return;

    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      void persistPush(activeCode, stateRef.current, editedAt);
    }, 1400);
  }, [state, persistPush]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

  const createSyncCode = useCallback(async () => {
    const code = generateSyncCode();
    const res = await persistPush(code, stateRef.current, Date.now());
    if (!res.ok) return null;
    try {
      localStorage.setItem(SYNC_CODE_KEY, code);
    } catch {
      // ignore
    }
    setSyncCode(code);
    showToast('Sync code created');
    return code;
  }, [persistPush, showToast]);

  const linkSyncCode = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; message: string }> => {
      const code = normalizeSyncCode(rawCode);
      if (!isValidSyncCode(code)) {
        const message = 'Enter a valid sync code (e.g. CUE-XXXX-XXXX-XXXX).';
        setSyncError(message);
        return { ok: false, message };
      }

      setSyncStatus('syncing');
      setSyncError(null);
      const pulled = await pullCloudLibrary(code);
      if (pulled.error) {
        setSyncStatus('error');
        setSyncError(pulled.error);
        return { ok: false, message: pulled.error };
      }

      try {
        localStorage.setItem(SYNC_CODE_KEY, code);
      } catch {
        // ignore
      }
      setSyncCode(code);

      if (pulled.exists && pulled.state) {
        hydrateFromCloud(pulled.state, pulled.updatedAt || Date.now());
        showToast('Synced library from cloud');
        return { ok: true, message: 'Paired and loaded your cloud library.' };
      }

      const pushed = await persistPush(code, stateRef.current, Date.now());
      if (!pushed.ok) {
        return { ok: false, message: pushed.error || 'Could not upload local library.' };
      }
      showToast('Device linked to cloud');
      return { ok: true, message: 'Device linked cleanly.' };
    },
    [hydrateFromCloud, persistPush, showToast]
  );

  const pullIfCloudNewer = useCallback(
    async (code: string, pushIfLocalNewer = false) => {
      setSyncStatus('syncing');
      const pulled = await pullCloudLibrary(code);
      if (pulled.error) {
        setSyncStatus('error');
        setSyncError(pulled.error);
        return;
      }
      const localBaseline = Math.max(lastSyncedAtRef.current || 0, localEditedAtRef.current);
      if (pulled.exists && pulled.state && (pulled.updatedAt || 0) > localBaseline) {
        hydrateFromCloud(pulled.state, pulled.updatedAt || Date.now());
        showToast('Library updated from cloud');
        return;
      }
      if (pushIfLocalNewer || !pulled.exists) {
        await persistPush(code, stateRef.current, Date.now());
        return;
      }
      setSyncStatus('synced');
      setSyncError(null);
    },
    [hydrateFromCloud, persistPush, showToast]
  );

  const syncNow = useCallback(async () => {
    const code = syncCodeRef.current;
    if (!code) return;
    await pullIfCloudNewer(code, true);
  }, [pullIfCloudNewer]);

  const unlinkSyncCode = useCallback(() => {
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    try {
      localStorage.removeItem(SYNC_CODE_KEY);
      localStorage.removeItem(SYNC_TS_KEY);
    } catch {
      // ignore
    }
    setSyncCode(null);
    setLastSyncedAt(null);
    setSyncStatus('idle');
    setSyncError(null);
    showToast('Unlinked cloud sync');
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair');
    if (pairParam && isValidSyncCode(pairParam)) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`);
      void linkSyncCode(pairParam);
      return;
    }
    if (syncCodeRef.current) {
      void pullIfCloudNewer(syncCodeRef.current, false);
    }
  }, [linkSyncCode, pullIfCloudNewer]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && syncCodeRef.current) {
        void pullIfCloudNewer(syncCodeRef.current, false);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pullIfCloudNewer]);

  const dismissToast = useCallback(() => setToast(null), []);
  const dismissBanner = useCallback(() => setActiveBanner(null), []);

  const closeAllModalsRaw = useCallback(() => {
    modalFlagsRef.current = {
      filter: false,
      notifications: false,
      settings: false,
      insights: false,
      import: false,
    };
    setFilterSheetOpenRaw(false);
    setNotificationsOpenRaw(false);
    setSettingsOpenRaw(false);
    setInsightsOpenRaw(false);
    setImportModalOpenRaw(false);
  }, []);

  const restoreScrollForStack = useCallback((nextStack: RouteView[]) => {
    const top = nextStack[nextStack.length - 1];
    if (top && (top.view === 'watch' || top.view === 'read' || top.view === 'play')) {
      return;
    }
    const savedY = scrollByRouteKeyRef.current.get(JSON.stringify(nextStack)) ?? 0;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
    });
  }, []);

  const updateModalOpen = useCallback(
    (
      key: keyof typeof modalFlagsRef.current,
      rawSetter: (open: boolean) => void,
      open: boolean
    ) => {
      modalFlagsRef.current[key] = open;
      rawSetter(open);
      try {
        const cur = window.history.state as Partial<CueHistoryState> | null;
        if (open) {
          if (!(cur?.cueNav && cur?.modal === true && !cur?.overlayId)) {
            const openedSeq = navSeqRef.current;
            modalOpenedNavSeqRef.current[key] = openedSeq;
            const nextDepth = historyDepthRef.current + 1;
            historyDepthRef.current = nextDepth;
            const entry: CueHistoryState = {
              cueNav: true,
              sessionId: navSessionIdRef.current,
              depth: nextDepth,
              stack: routeStackRef.current,
              modal: true,
            };
            const url = `${window.location.pathname}${window.location.search}#cue-m-${openedSeq}-${nextDepth}`;
            window.history.pushState(entry, '', url);
          }
        } else {
          const openedSeq = modalOpenedNavSeqRef.current[key];
          queueMicrotask(() => {
            if (openedSeq !== undefined && navSeqRef.current !== openedSeq) {
              return;
            }
            const anyOpen = Object.values(modalFlagsRef.current).some(Boolean);
            const latest = window.history.state as Partial<CueHistoryState> | null;
            if (
              !anyOpen &&
              overlayHandlersRef.current.length === 0 &&
              latest?.cueNav &&
              latest?.sessionId === navSessionIdRef.current &&
              latest?.modal === true &&
              !latest?.overlayId &&
              historyDepthRef.current > 0
            ) {
              suppressModalBackPopRef.current += 1;
              window.history.back();
            }
          });
        }
      } catch {
        // ignore history access errors
      }
    },
    []
  );

  const registerOverlayBackHandler = useCallback((onBack: () => void) => {
    const id = overlayIdSeqRef.current++;
    const openedSeq = navSeqRef.current;
    let closedByPop = false;
    overlayHandlersRef.current.push({
      id,
      close: () => {
        closedByPop = true;
        onBack();
      },
    });
    try {
      const nextDepth = historyDepthRef.current + 1;
      historyDepthRef.current = nextDepth;
      const entry: CueHistoryState = {
        cueNav: true,
        sessionId: navSessionIdRef.current,
        depth: nextDepth,
        stack: routeStackRef.current,
        modal: true,
        overlayId: id,
      };
      const url = `${window.location.pathname}${window.location.search}#cue-ov-${id}-${nextDepth}`;
      window.history.pushState(entry, '', url);
    } catch {
      // ignore history access errors
    }
    return () => {
      overlayHandlersRef.current = overlayHandlersRef.current.filter((item) => item.id !== id);
      if (closedByPop) return;
      queueMicrotask(() => {
        if (navSeqRef.current !== openedSeq) return;
        try {
          const latest = window.history.state as Partial<CueHistoryState> | null;
          if (
            latest?.cueNav &&
            latest?.sessionId === navSessionIdRef.current &&
            latest?.overlayId === id &&
            historyDepthRef.current > 0
          ) {
            suppressModalBackPopRef.current += 1;
            window.history.back();
          }
        } catch {
          // ignore history access errors
        }
      });
    };
  }, []);

  const setFilterSheetOpen = useCallback(
    (open: boolean) => updateModalOpen('filter', setFilterSheetOpenRaw, open),
    [updateModalOpen]
  );
  const setNotificationsOpen = useCallback(
    (open: boolean) => updateModalOpen('notifications', setNotificationsOpenRaw, open),
    [updateModalOpen]
  );
  const setSettingsOpen = useCallback(
    (open: boolean) => updateModalOpen('settings', setSettingsOpenRaw, open),
    [updateModalOpen]
  );
  const setInsightsOpen = useCallback(
    (open: boolean) => updateModalOpen('insights', setInsightsOpenRaw, open),
    [updateModalOpen]
  );
  const setImportModalOpen = useCallback(
    (open: boolean) => updateModalOpen('import', setImportModalOpenRaw, open),
    [updateModalOpen]
  );

  useEffect(() => {
    try {
      const initialEntry: CueHistoryState = {
        cueNav: true,
        sessionId: navSessionIdRef.current,
        depth: 0,
        stack: routeStackRef.current,
      };
      const url = buildRouteUrlWithHash(
        routeStackRef.current,
        0,
        window.location.pathname,
        window.location.search
      );
      window.history.replaceState(initialEntry, '', url);
    } catch {
      // ignore history errors
    }

    const syncDepthAfterPop = (st: Partial<CueHistoryState> | null) => {
      if (st?.cueNav && st.sessionId === navSessionIdRef.current && typeof st.depth === 'number') {
        historyDepthRef.current = Math.max(0, st.depth);
      } else {
        historyDepthRef.current = Math.max(0, historyDepthRef.current - 1);
      }
    };

    const onPopState = (event: PopStateEvent) => {
      const st = event.state as Partial<CueHistoryState> | null;
      syncDepthAfterPop(st);

      if (suppressModalBackPopRef.current > 0) {
        suppressModalBackPopRef.current -= 1;
        return;
      }

      if (overlayHandlersRef.current.length > 0) {
        const topOverlay = overlayHandlersRef.current.pop();
        topOverlay?.close();
        return;
      }

      const hadModal = Object.values(modalFlagsRef.current).some(Boolean);
      closeAllModalsRaw();

      const resolution = resolvePopStateStack(routeStackRef.current, st, hadModal);

      if (resolution.needsHistoryRepair) {
        try {
          navSeqRef.current += 1;
          const repairedDepth = Math.max(
            historyDepthRef.current,
            resolution.nextStack.length > 1 ? 1 : 0
          );
          historyDepthRef.current = repairedDepth;
          const repairEntry: CueHistoryState = {
            cueNav: true,
            sessionId: navSessionIdRef.current,
            depth: repairedDepth,
            stack: resolution.nextStack,
          };
          const url = buildRouteUrlWithHash(
            resolution.nextStack,
            navSeqRef.current,
            window.location.pathname,
            window.location.search
          );
          window.history.replaceState(repairEntry, '', url);
        } catch {
          // ignore history errors
        }
      }

      if (hadModal) {
        return;
      }

      const prevTop = routeStackRef.current[routeStackRef.current.length - 1];
      const nextTop = resolution.nextStack[resolution.nextStack.length - 1];
      routeStackRef.current = resolution.nextStack;
      setRouteStack(resolution.nextStack);

      if (!routesEqual(prevTop, nextTop)) {
        restoreScrollForStack(resolution.nextStack);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeAllModalsRaw, restoreScrollForStack]);

  const commitNavigation = useCallback(
    (nextStack: RouteView[], mode: 'push' | 'replace' = 'push') => {
      overlayHandlersRef.current = [];
      closeAllModalsRaw();
      navSeqRef.current += 1;
      const seq = navSeqRef.current;
      try {
        const cur = window.history.state as Partial<CueHistoryState> | null;
        const nextUrl = buildRouteUrlWithHash(
          nextStack,
          seq,
          window.location.pathname,
          window.location.search
        );
        if (mode === 'push' && cur?.cueNav && cur?.modal === true) {
          const entry: CueHistoryState = {
            cueNav: true,
            sessionId: navSessionIdRef.current,
            depth: historyDepthRef.current,
            stack: nextStack,
          };
          window.history.replaceState(entry, '', nextUrl);
        } else if (mode === 'push') {
          const nextDepth = historyDepthRef.current + 1;
          historyDepthRef.current = nextDepth;
          const entry: CueHistoryState = {
            cueNav: true,
            sessionId: navSessionIdRef.current,
            depth: nextDepth,
            stack: nextStack,
          };
          window.history.pushState(entry, '', nextUrl);
        } else {
          const entry: CueHistoryState = {
            cueNav: true,
            sessionId: navSessionIdRef.current,
            depth: historyDepthRef.current,
            stack: nextStack,
          };
          window.history.replaceState(entry, '', nextUrl);
        }
      } catch {
        // ignore history errors
      }
      routeStackRef.current = nextStack;
      setRouteStack(nextStack);
    },
    [closeAllModalsRaw]
  );

  const switchTab = useCallback(
    (
      tab: 'queue' | 'watch' | 'read' | 'play' | 'journal' | 'search',
      calendarMode = false
    ) => {
      const nextRoute: RouteView =
        tab === 'watch' || tab === 'read' || tab === 'play'
          ? { view: tab, calendarMode }
          : { view: tab };
      const curStack = routeStackRef.current;
      const anyModalOpen = Object.values(modalFlagsRef.current).some(Boolean);
      if (curStack.length === 1 && routesEqual(curStack[0], nextRoute) && !anyModalOpen) {
        return;
      }
      commitNavigation([nextRoute], 'push');
      if (tab !== 'watch' && tab !== 'read' && tab !== 'play') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
    },
    [commitNavigation]
  );

  const pushRoute = useCallback(
    (next: RouteView) => {
      scrollByRouteKeyRef.current.set(JSON.stringify(routeStackRef.current), window.scrollY);
      commitNavigation([...routeStackRef.current, next], 'push');
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [commitNavigation]
  );

  const goBack = useCallback(() => {
    if (routeStackRef.current.length <= 1) return;
    try {
      const cur = window.history.state as Partial<CueHistoryState> | null;
      if (
        historyDepthRef.current > 0 &&
        cur?.cueNav &&
        cur?.sessionId === navSessionIdRef.current
      ) {
        window.history.back();
        return;
      }
    } catch {
      // fall through to safe local stack pop
    }
    const popped = routeStackRef.current.slice(0, -1);
    commitNavigation(popped, 'replace');
    restoreScrollForStack(popped);
  }, [commitNavigation, restoreScrollForStack]);

  const toggleCalendarMode = useCallback(() => {
    const curStack = routeStackRef.current;
    const top = curStack[curStack.length - 1];
    if (top.view === 'watch' || top.view === 'read' || top.view === 'play') {
      const entering = !top.calendarMode;
      const nextStack: RouteView[] = [
        ...curStack.slice(0, -1),
        { ...top, calendarMode: entering },
      ];
      commitNavigation(nextStack, entering ? 'push' : 'replace');
      return;
    }
    commitNavigation([{ view: 'watch', calendarMode: true }], 'push');
  }, [commitNavigation]);

  const triggerSampleReleaseAlert = useCallback(() => {
    const firstShowId = stateRef.current.showOrder[0];
    const firstShow = firstShowId ? stateRef.current.shows[firstShowId] : undefined;
    const banner: ReleaseBannerData = {
      title: 'Release alerts active',
      body: firstShow
        ? `New episode alert sample for ${firstShow.title}`
        : 'Notifications appear here when tracked releases drop.',
      timeLabel: 'now',
      domain: 'watch',
      mediaKind: firstShow ? 'show' : undefined,
      mediaId: firstShow?.id,
    };
    setActiveBanner(banner);
    commitState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `n-${Date.now()}`,
          domain: 'watch',
          title: banner.title,
          body: banner.body,
          timeLabel: 'now',
          read: false,
          mediaKind: banner.mediaKind,
          mediaId: banner.mediaId,
        },
        ...prev.notifications,
      ],
    }));
    showToast('Release alert simulated');
  }, [showToast]);

  const recomputeShowStatus = (
    show: Show,
    nextCounts: Record<string, number>,
    prev?: ShowProgress
  ): ShowProgress => {
    const allEps = getAllEpisodes(show);
    const total = allEps.length || show.totalEpisodes;
    let watchedUnique = 0;
    for (const ep of allEps) {
      if ((nextCounts[getEpisodeKey(ep.season, ep.number)] || 0) > 0) watchedUnique += 1;
    }
    const status =
      total > 0 && watchedUnique >= total
        ? 'finished'
        : watchedUnique > 0
          ? 'watching'
          : 'not_started';
    return {
      ...(prev || {}),
      status,
      episodeCounts: nextCounts,
      bookmarked: prev?.bookmarked ?? true,
      notifications: prev?.notifications ?? true,
      lastWatchedAt: new Date().toISOString(),
      finishedAt: status === 'finished' ? prev?.finishedAt || new Date().toISOString() : undefined,
    };
  };

  const buildShowSeasonToast = (
    show: Show,
    seasonNumber: number,
    prevProg?: ShowProgress,
    nextProg?: ShowProgress
  ): { msg: string; actionLabel?: string } | null => {
    const beforeSp = getSeasonProgress(show, seasonNumber, prevProg);
    const afterSp = getSeasonProgress(show, seasonNumber, nextProg);
    if (beforeSp.watched < beforeSp.total && afterSp.watched >= afterSp.total && afterSp.total > 0) {
      const epAvg = getSeasonEpisodeAverage(show, seasonNumber, nextProg);
      if (epAvg && epAvg.count > 0) {
        return {
          msg: `Season ${seasonNumber} of ${show.title} finished · Episode avg: ${epAvg.avg.toFixed(2)} ★`,
          actionLabel: 'Rate season',
        };
      }
      const overallStats = getShowStats(show, nextProg);
      if (overallStats.isFinished) {
        return {
          msg: `Finished ${show.title}!`,
          actionLabel: 'Rate show',
        };
      }
      return {
        msg: `Finished Season ${seasonNumber} of ${show.title}!`,
        actionLabel: 'Rate season',
      };
    }
    return null;
  };

  const watchNextEpisode = useCallback(
    (showId: string) => {
      let toastMsg = '';
      let toastSub: string | undefined;
      let showPoster = '';
      let toastAction: string | undefined = 'Log note';
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        showPoster = show.posterUrl;
        const prog = prev.showProgress[showId];
        const stats = getShowStats(show, prog);
        const targetEp = stats.nextEpisode;
        if (!targetEp) return prev;

        const epKey = getEpisodeKey(targetEp.season, targetEp.number);
        const watchedLabel = formatEpisodeCode(targetEp.season, targetEp.number);
        const nowIso = new Date().toISOString();
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: Math.max(1, (prog?.episodeCounts?.[epKey] || 0) + 1),
        };
        const nextEpFinishedAt = {
          ...(prog?.episodeFinishedAt || {}),
          [epKey]: prog?.episodeFinishedAt?.[epKey] || nowIso,
        };
        const updatedProg = recomputeShowStatus(show, nextCounts, {
          ...(prog || { status: 'not_started', episodeCounts: {}, bookmarked: true, notifications: true }),
          episodeFinishedAt: nextEpFinishedAt,
        });
        const seasonNudge = buildShowSeasonToast(show, targetEp.season, prog, updatedProg);
        if (seasonNudge) {
          toastMsg = seasonNudge.msg;
          toastSub = undefined;
          toastAction = seasonNudge.actionLabel || 'Log note';
        } else {
          const nextStats = getShowStats(show, updatedProg);
          toastMsg = show.title;
          toastSub = nextStats.nextEpisode
            ? `Watched ${watchedLabel} · Next: ${formatEpisodeCode(
                nextStats.nextEpisode.season,
                nextStats.nextEpisode.number
              )}`
            : `Watched ${watchedLabel}`;
          toastAction = 'Log note';
        }
        const historyEntry: HistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          domain: 'watch',
          mediaKind: 'show',
          mediaId: showId,
          title: show.title,
          posterUrl: show.posterUrl,
          codeLabel: watchedLabel,
          subtitle: targetEp.title,
          loggedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          upcoming: prev.upcoming.filter(
            (u) => !(u.kind === 'episode' && u.mediaId === showId && u.daysUntil === 0)
          ),
          history: appendHistory(prev.history || [], historyEntry),
        };
      });

      if (toastMsg) {
        showToast(toastMsg, toastAction, () => pushRoute({ view: 'show-detail', showId }), {
          domain: 'watch',
          subtitle: toastSub,
          posterUrl: showPoster,
        });
      }
    },
    [pushRoute, showToast]
  );

  const toggleEpisodeWatched = useCallback(
    (showId: string, season: number, number: number) => {
      let toastMsg = '';
      let toastSub: string | undefined;
      let toastAction: string | undefined;
      let showPoster = '';
      let pendingPrompt: CatchUpPromptItem | null = null;
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        showPoster = show.posterUrl;
        const prog = prev.showProgress[showId];
        const prevCounts = prog?.episodeCounts || {};
        const epKey = getEpisodeKey(season, number);
        const current = prevCounts[epKey] || 0;
        const nowWatched = current === 0;
        const orderedEps = [...show.seasons]
          .sort((a, b) => a.number - b.number)
          .flatMap((s) => s.episodes);
        const targetIdx = orderedEps.findIndex(
          (e) => e.season === season && e.number === number
        );
        const targetEp = targetIdx >= 0 ? orderedEps[targetIdx] : undefined;

        if (nowWatched && targetIdx > 0) {
          const mediaKey = `show:${showId}`;
          const skipped = prev.settings.skipCatchUpPromptIds?.includes(mediaKey);
          if (!skipped) {
            const priorEps = detectNonAdjacentPriorAtoms(
              orderedEps,
              targetIdx,
              (e) => (prevCounts[getEpisodeKey(e.season, e.number)] || 0) > 0
            );
            if (priorEps.length > 0) {
              pendingPrompt = {
                id: `cup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mediaKey,
                kind: 'show',
                mediaId: showId,
                title: show.title,
                count: priorEps.length,
                unitSingular: 'episode',
                unitPlural: 'episodes',
                verbPast: 'watched',
                mediaNoun: 'show',
                episodeTargets: priorEps.map((e) => ({ season: e.season, number: e.number })),
              };
            }
          }
        }

        const nowIso = new Date().toISOString();
        const nextCounts = {
          ...prevCounts,
          [epKey]: nowWatched ? 1 : 0,
        };
        const nextEpFinishedAt = { ...(prog?.episodeFinishedAt || {}) };
        if (nowWatched) {
          if (!nextEpFinishedAt[epKey]) nextEpFinishedAt[epKey] = nowIso;
        } else {
          delete nextEpFinishedAt[epKey];
        }
        const updatedProg = recomputeShowStatus(show, nextCounts, {
          ...(prog || { status: 'not_started', episodeCounts: {}, bookmarked: true, notifications: true }),
          episodeFinishedAt: nextEpFinishedAt,
        });
        const codeLabel = formatEpisodeCode(season, number);
        let nextHistory = prev.history || [];

        if (nowWatched) {
          const seasonToast = buildShowSeasonToast(show, season, prog, updatedProg);
          if (seasonToast) {
            toastMsg = seasonToast.msg;
            toastAction = seasonToast.actionLabel;
          } else {
            toastMsg = show.title;
            toastSub = targetEp?.title
              ? `Watched ${codeLabel} · ${targetEp.title}`
              : `Watched ${codeLabel}`;
          }
          nextHistory = appendHistory(nextHistory, {
            id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: 'watch',
            mediaKind: 'show',
            mediaId: showId,
            title: show.title,
            posterUrl: show.posterUrl,
            codeLabel,
            subtitle: targetEp?.title || codeLabel,
            loggedAt: new Date().toISOString(),
          });
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      if (toastMsg) {
        showToast(toastMsg, toastAction, undefined, {
          domain: 'watch',
          subtitle: toastSub,
          posterUrl: showPoster,
        });
      }
      if (pendingPrompt) {
        setCatchUpPrompt(pendingPrompt);
      }
    },
    [showToast]
  );

  const incrementEpisodeRewatch = useCallback(
    (showId: string, season: number, number: number, delta: number) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const epKey = getEpisodeKey(season, number);
        const current = prog?.episodeCounts?.[epKey] || 0;
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: Math.max(0, current + delta),
        };
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
    },
    []
  );

  const toggleShowBookmark = useCallback(
    (showId: string) => {
      let nextBookmarked = true;
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        nextBookmarked = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: nextBookmarked,
              notifications: existing?.notifications ?? true,
            },
          },
        };
      });
      showToast(nextBookmarked ? 'Added to Watch library' : 'Removed from Watch library');
    },
    [showToast]
  );

  const toggleShowNotifications = useCallback(
    (showId: string) => {
      let nextVal = true;
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        nextVal = !(existing?.notifications ?? true);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: nextVal,
            },
          },
        };
      });
      showToast(nextVal ? 'Release alerts enabled' : 'Release alerts muted');
    },
    [showToast]
  );

  const markSeasonWatched = useCallback(
    (showId: string, seasonNumber: number, rewatchIfDone = false) => {
      let toastMsg = `Updated Season ${seasonNumber}`;
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const season = show.seasons.find((s) => s.number === seasonNumber);
        if (!season) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        const now = new Date();
        const showHasRealAirdates = getAllEpisodes(show).some((ep) =>
          Boolean(ep.airdate || ep.airstamp)
        );
        const releasedEps = season.episodes.filter((ep) =>
          isEpisodeReleased(ep, now, showHasRealAirdates)
        );
        const targetPool = releasedEps.length > 0 ? releasedEps : season.episodes;
        const allWatched = targetPool.every(
          (ep) => (nextCounts[getEpisodeKey(ep.season, ep.number)] || 0) > 0
        );
        const nowIso = now.toISOString();
        const nextEpFinishedAt = { ...(prog?.episodeFinishedAt || {}) };
        const nextSeasonFinishedAt = { ...(prog?.seasonFinishedAt || {}) };
        if (allWatched && !rewatchIfDone) {
          for (const ep of season.episodes) {
            const k = getEpisodeKey(ep.season, ep.number);
            nextCounts[k] = 0;
            delete nextEpFinishedAt[k];
          }
          delete nextSeasonFinishedAt[seasonNumber];
        } else {
          for (const ep of targetPool) {
            const k = getEpisodeKey(ep.season, ep.number);
            if (allWatched && rewatchIfDone) nextCounts[k] = (nextCounts[k] || 1) + 1;
            else nextCounts[k] = Math.max(1, nextCounts[k] || 0);
            if (!nextEpFinishedAt[k]) nextEpFinishedAt[k] = nowIso;
          }
          if (!nextSeasonFinishedAt[seasonNumber]) nextSeasonFinishedAt[seasonNumber] = nowIso;
        }
        const updatedProg = recomputeShowStatus(show, nextCounts, {
          ...(prog || { status: 'not_started', episodeCounts: {}, bookmarked: true, notifications: true }),
          episodeFinishedAt: nextEpFinishedAt,
          seasonFinishedAt: nextSeasonFinishedAt,
        });
        const seasonToast = buildShowSeasonToast(show, seasonNumber, prog, updatedProg);
        if (seasonToast) {
          toastMsg = seasonToast.msg;
        }
        const nextHistory = !allWatched
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: showId,
              title: show.title,
              posterUrl: show.posterUrl,
              codeLabel: `Season ${seasonNumber} Complete`,
              subtitle: `${targetPool.length} episodes`,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      showToast(toastMsg);
    },
    [showToast]
  );

  const markShowAllWatched = useCallback(
    (showId: string) => {
      let releasedCount = 0;
      let totalCount = 0;
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        const allEps = getAllEpisodes(show);
        totalCount = allEps.length;
        const now = new Date();
        const showHasRealAirdates = allEps.some((ep) => Boolean(ep.airdate || ep.airstamp));
        const releasedEps = allEps.filter((ep) =>
          isEpisodeReleased(ep, now, showHasRealAirdates)
        );
        const targetEps = releasedEps.length > 0 ? releasedEps : allEps;
        releasedCount = targetEps.length;
        for (const ep of targetEps) {
          const k = getEpisodeKey(ep.season, ep.number);
          nextCounts[k] = Math.max(1, nextCounts[k] || 0);
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
      showToast(
        releasedCount < totalCount
          ? `Marked ${releasedCount} released episodes watched`
          : 'Marked all episodes watched'
      );
    },
    [showToast]
  );

  const startShowRewatch = useCallback(
    (showId: string) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        for (const ep of getAllEpisodes(show)) {
          const k = getEpisodeKey(ep.season, ep.number);
          nextCounts[k] = (nextCounts[k] || 0) + 1;
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
      showToast('Logged full series rewatch');
    },
    [showToast]
  );

  const resetShowProgress = useCallback(
    (showId: string) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, {}, prog),
          },
        };
      });
      showToast('Reset show progress');
    },
    [showToast]
  );

  const rateEpisode = useCallback(
    (showId: string, season: number, number: number, rating: number | undefined) => {
      const epKey = getEpisodeKey(season, number);
      commitState((prev) => {
        const show = prev.shows[showId];
        const existing = prev.showProgress[showId];
        const nextEpRatings = { ...(existing?.episodeRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextEpRatings[epKey] = rating;
        } else {
          delete nextEpRatings[epKey];
        }
        const nextSeasonRatings = { ...(existing?.seasonRatings || {}) };
        const nextSeasonSources = { ...(existing?.seasonRatingSource || {}) };
        let nextRating = existing?.rating;
        let nextRatingSource = existing?.ratingSource;

        const baseProg: ShowProgress = {
          ...(existing || {}),
          status: existing?.status || 'watching',
          episodeCounts: existing?.episodeCounts || {},
          bookmarked: existing?.bookmarked ?? true,
          notifications: existing?.notifications ?? true,
          episodeRatings: nextEpRatings,
          seasonRatings: nextSeasonRatings,
          seasonRatingSource: nextSeasonSources,
        };

        if (show) {
          const seasonAvg = getSeasonEpisodeAverage(show, season, baseProg);
          const resolvedSeason = applyAutoRating(
            nextSeasonRatings[season],
            nextSeasonSources[season],
            seasonAvg?.avg ?? null
          );
          if (resolvedSeason.rating !== undefined && resolvedSeason.source) {
            nextSeasonRatings[season] = resolvedSeason.rating;
            nextSeasonSources[season] = resolvedSeason.source;
          } else {
            delete nextSeasonRatings[season];
            delete nextSeasonSources[season];
          }
          const showAvg = getShowCalculatedAverage(show, {
            ...baseProg,
            seasonRatings: nextSeasonRatings,
            seasonRatingSource: nextSeasonSources,
          });
          const resolvedShow = applyAutoRating(
            existing?.rating,
            existing?.ratingSource,
            showAvg?.avg ?? null
          );
          nextRating = resolvedShow.rating;
          nextRatingSource = resolvedShow.source;
        }

        return recomputeAutoCollectionRatings({
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...baseProg,
              seasonRatings: nextSeasonRatings,
              seasonRatingSource: nextSeasonSources,
              rating: nextRating,
              ratingSource: nextRatingSource,
            },
          },
        });
      });
    },
    []
  );

  const rateSeason = useCallback(
    (
      showId: string,
      seasonNumber: number,
      rating: number | undefined,
      source: RatingSource = 'manual'
    ) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        const existing = prev.showProgress[showId];
        const nextSeasonRatings = { ...(existing?.seasonRatings || {}) };
        const nextSeasonSources = { ...(existing?.seasonRatingSource || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextSeasonRatings[seasonNumber] = rating;
          nextSeasonSources[seasonNumber] = source;
        } else {
          delete nextSeasonRatings[seasonNumber];
          delete nextSeasonSources[seasonNumber];
        }

        const baseProg: ShowProgress = {
          ...(existing || {}),
          status: existing?.status || 'watching',
          episodeCounts: existing?.episodeCounts || {},
          bookmarked: existing?.bookmarked ?? true,
          notifications: existing?.notifications ?? true,
          seasonRatings: nextSeasonRatings,
          seasonRatingSource: nextSeasonSources,
        };
        let nextRating = existing?.rating;
        let nextRatingSource = existing?.ratingSource;
        if (show) {
          const showAvg = getShowCalculatedAverage(show, baseProg);
          const resolvedShow = applyAutoRating(
            existing?.rating,
            existing?.ratingSource,
            showAvg?.avg ?? null
          );
          nextRating = resolvedShow.rating;
          nextRatingSource = resolvedShow.source;
        }

        return recomputeAutoCollectionRatings({
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...baseProg,
              rating: nextRating,
              ratingSource: nextRatingSource,
            },
          },
        });
      });
    },
    []
  );

  const updateShowEpisodes = useCallback(
    (showId: string, seasons: Season[], cast?: CastMember[], runtimeAvg?: number) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show || seasons.length === 0) return prev;
        const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);
        return {
          ...prev,
          shows: {
            ...prev.shows,
            [showId]: {
              ...show,
              seasons,
              totalEpisodes: totalEpisodes > 0 ? totalEpisodes : show.totalEpisodes,
              runtimeAvg: runtimeAvg || show.runtimeAvg,
              cast: cast && cast.length > 0 && show.cast.length === 0 ? cast : show.cast,
            },
          },
        };
      });
    },
    []
  );

  const updateShowMetadata = useCallback(
    (
      showId: string,
      patch: {
        title?: string;
        year?: number;
        posterUrl?: string;
        totalEpisodes?: number;
      }
    ) => {
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        let nextSeasons = show.seasons.map((s) => ({ ...s, episodes: [...s.episodes] }));
        let nextTotalEpisodes = show.totalEpisodes;

        if (typeof patch.totalEpisodes === 'number' && Number.isFinite(patch.totalEpisodes)) {
          const targetTotal = Math.max(1, Math.min(2500, Math.round(patch.totalEpisodes)));
          const currentCount = nextSeasons.reduce((sum, s) => sum + s.episodes.length, 0);
          if (nextSeasons.length === 0) {
            nextSeasons = [
              {
                number: 1,
                episodes: Array.from({ length: targetTotal }, (_, idx) => ({
                  id: `${show.id}-s1e${idx + 1}`,
                  season: 1,
                  number: idx + 1,
                  title: `Episode ${idx + 1}`,
                  airdate: '',
                  runtime: show.runtimeAvg || 24,
                  stillUrl: show.backdropUrl || show.posterUrl,
                  overview: '',
                })),
              },
            ];
          } else if (targetTotal > currentCount) {
            const lastSeason = nextSeasons[nextSeasons.length - 1];
            const lastEpNum = lastSeason.episodes.reduce(
              (mx, ep) => Math.max(mx, ep.number),
              0
            );
            const diff = targetTotal - currentCount;
            for (let i = 1; i <= diff; i += 1) {
              const epNum = lastEpNum + i;
              lastSeason.episodes.push({
                id: `${show.id}-s${lastSeason.number}e${epNum}`,
                season: lastSeason.number,
                number: epNum,
                title: `Episode ${epNum}`,
                airdate: '',
                runtime: show.runtimeAvg || 24,
                stillUrl: show.backdropUrl || show.posterUrl,
                overview: '',
              });
            }
          } else if (targetTotal < currentCount) {
            let toRemove = currentCount - targetTotal;
            for (let sIdx = nextSeasons.length - 1; sIdx >= 0 && toRemove > 0; sIdx -= 1) {
              const eps = nextSeasons[sIdx].episodes;
              if (sIdx === 0 && eps.length - toRemove < 1) {
                const trim = Math.max(0, eps.length - 1);
                nextSeasons[sIdx].episodes = eps.slice(0, eps.length - trim);
                toRemove -= trim;
              } else if (eps.length <= toRemove) {
                toRemove -= eps.length;
                nextSeasons.splice(sIdx, 1);
              } else {
                nextSeasons[sIdx].episodes = eps.slice(0, eps.length - toRemove);
                toRemove = 0;
              }
            }
          }
          nextTotalEpisodes = targetTotal;
        }

        const nextPoster =
          patch.posterUrl !== undefined ? patch.posterUrl.trim() : show.posterUrl;
        const nextBackdrop =
          patch.posterUrl !== undefined && !show.backdropUrl
            ? nextPoster
            : show.backdropUrl;

        return {
          ...prev,
          shows: {
            ...prev.shows,
            [showId]: {
              ...show,
              ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
              ...(typeof patch.year === 'number' && Number.isFinite(patch.year)
                ? { year: Math.round(patch.year) }
                : {}),
              posterUrl: nextPoster,
              backdropUrl: nextBackdrop,
              seasons: nextSeasons,
              totalEpisodes: nextTotalEpisodes,
            },
          },
        };
      });
    },
    []
  );

  const rateShow = useCallback(
    (showId: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const existing = prev.showProgress[showId];
        return recomputeAutoCollectionRatings({
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'watching',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: existing?.notifications ?? true,
              rating,
              ratingSource: rating ? source : undefined,
            },
          },
        });
      });
    },
    []
  );

  const setEpisodeFinishedDate = useCallback(
    (showId: string, season: number, number: number, dateYmd: string | undefined) => {
      const normalizedIso = toFinishedIso(dateYmd);
      const epKey = getEpisodeKey(season, number);
      const codeLabel = formatEpisodeCode(season, number);
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const existing = prev.showProgress[showId];
        const nextCounts = { ...(existing?.episodeCounts || {}) };
        const nextEpFinishedAt = { ...(existing?.episodeFinishedAt || {}) };
        let nextHistory = prev.history || [];

        if (normalizedIso) {
          nextEpFinishedAt[epKey] = normalizedIso;
          if ((nextCounts[epKey] || 0) === 0) {
            nextCounts[epKey] = 1;
          }
          let updatedExistingHist = false;
          nextHistory = nextHistory.map((h) => {
            if (h.domain === 'watch' && h.mediaId === showId && h.codeLabel === codeLabel) {
              updatedExistingHist = true;
              return { ...h, loggedAt: normalizedIso };
            }
            return h;
          });
          if (!updatedExistingHist) {
            const epMeta = show.seasons
              .find((s) => s.number === season)
              ?.episodes.find((e) => e.number === number);
            nextHistory = appendHistory(nextHistory, {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: showId,
              title: show.title,
              posterUrl: show.posterUrl,
              codeLabel,
              subtitle: epMeta?.title || codeLabel,
              loggedAt: normalizedIso,
            });
          }
        } else {
          delete nextEpFinishedAt[epKey];
        }

        const updatedProg = recomputeShowStatus(show, nextCounts, {
          ...(existing || {
            status: 'not_started',
            episodeCounts: {},
            bookmarked: true,
            notifications: true,
          }),
          episodeFinishedAt: nextEpFinishedAt,
        });

        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      showToast(normalizedIso ? `Updated ${codeLabel} date` : `Cleared ${codeLabel} date`);
    },
    [showToast]
  );

  const setSeasonFinishedDate = useCallback(
    (showId: string, seasonNumber: number, dateYmd: string | undefined) => {
      const normalizedIso = toFinishedIso(dateYmd);
      commitState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const existing = prev.showProgress[showId];
        const nextSeasonFinishedAt = { ...(existing?.seasonFinishedAt || {}) };
        if (normalizedIso) {
          nextSeasonFinishedAt[seasonNumber] = normalizedIso;
        } else {
          delete nextSeasonFinishedAt[seasonNumber];
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              ...(existing || {}),
              status: existing?.status || 'watching',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: existing?.notifications ?? true,
              seasonFinishedAt: nextSeasonFinishedAt,
            },
          },
        };
      });
      showToast(
        normalizedIso
          ? `Updated Season ${seasonNumber} date`
          : `Cleared Season ${seasonNumber} date`
      );
    },
    [showToast]
  );

  const setShowMood = useCallback((showId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.showProgress[showId];
      return {
        ...prev,
        showProgress: {
          ...prev.showProgress,
          [showId]: {
            ...(existing || {}),
            status: existing?.status || 'watching',
            episodeCounts: existing?.episodeCounts || {},
            bookmarked: existing?.bookmarked ?? true,
            notifications: existing?.notifications ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const toggleMovieWatched = useCallback(
    (movieId: string) => {
      let msg = '';
      let actionLabel: string | undefined;
      let moviePoster = '';
      commitState((prev) => {
        const movie = prev.movies[movieId];
        if (!movie) return prev;
        moviePoster = movie.posterUrl;
        const existing = prev.movieProgress[movieId];
        const isWatched = (existing?.watchCount || 0) > 0;
        const nowWatched = !isWatched;
        const nextHistory = nowWatched
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'movie',
              mediaId: movieId,
              title: movie.title,
              posterUrl: movie.posterUrl,
              codeLabel: `${movie.year} · ${movie.runtime}m`,
              subtitle: movie.director,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const nextMovieProgress = {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: (isWatched ? 'watchlist' : 'watched') as MovieWatchStatus,
            watchCount: isWatched ? 0 : 1,
            watchedAt: isWatched ? undefined : new Date().toISOString(),
          },
        };
        const nextState: CueStoreState = {
          ...prev,
          movieProgress: nextMovieProgress,
          history: nextHistory,
        };

        if (nowWatched) {
          const col = findMovieCollection(movie.title, movie.year);
          if (col) {
            const ev = evaluateMovieCollectionProgress(col, nextState);
            if (ev.isComplete) {
              msg = `Nice — ${movie.title} completes ${col.name} (${ev.watchedCount}/${ev.totalCount})!`;
              actionLabel = 'View trilogy';
            } else if (ev.remainingCount === 1) {
              msg = `Watched ${movie.title} · 1 more film to finish ${col.name} (${ev.watchedCount}/${ev.totalCount})`;
              actionLabel = 'Journal';
            } else {
              msg = `Watched ${movie.title} · ${col.name} (${ev.watchedCount}/${ev.totalCount})`;
              actionLabel = 'Journal';
            }
          } else {
            msg = `Watched ${movie.title}`;
            actionLabel = 'Journal';
          }
        } else {
          msg = `Moved ${movie.title} back to Watchlist`;
          actionLabel = undefined;
        }

        return nextState;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'movie-detail', movieId }), {
          domain: 'watch',
          posterUrl: moviePoster,
        });
      }
    },
    [pushRoute, showToast]
  );

  const incrementMovieRewatch = useCallback(
    (movieId: string, delta: number) => {
      commitState((prev) => {
        const existing = prev.movieProgress[movieId];
        const nextCount = Math.max(0, (existing?.watchCount || 0) + delta);
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: {
              ...(existing || {}),
              status: nextCount > 0 ? 'watched' : 'watchlist',
              watchCount: nextCount,
              watchedAt: nextCount > 0 ? new Date().toISOString() : undefined,
            },
          },
        };
      });
      if (delta > 0) showToast('Logged movie rewatch');
    },
    [showToast]
  );

  const toggleMovieWatchlist = useCallback(
    (movieId: string) => {
      let inList = true;
      commitState((prev) => {
        const existing = prev.movieProgress[movieId];
        if (existing) {
          inList = false;
          const copy = { ...prev.movieProgress };
          delete copy[movieId];
          return { ...prev, movieProgress: copy };
        }
        inList = true;
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: { status: 'watchlist', watchCount: 0 },
          },
        };
      });
      showToast(inList ? 'Added to Watch library' : 'Removed from Watch library');
    },
    [showToast]
  );

  const rateMovie = useCallback((movieId: string, rating: number | undefined) => {
    commitState((prev) => {
      const existing = prev.movieProgress[movieId];
      return recomputeAutoCollectionRatings({
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: existing?.status || 'watched',
            watchCount: Math.max(1, existing?.watchCount || 0),
            watchedAt: existing?.watchedAt || new Date().toISOString(),
            rating,
          },
        },
      });
    });
  }, []);

  const setMovieMood = useCallback((movieId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.movieProgress[movieId];
      return {
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            ...(existing || {}),
            status: existing?.status || 'watchlist',
            watchCount: existing?.watchCount || 0,
            mood,
          },
        },
      };
    });
  }, []);

  const updateMovieDetails = useCallback((movieId: string, patch: Partial<Movie>) => {
    if (!patch || Object.keys(patch).length === 0) return;
    commitState((prev) => {
      const existing = prev.movies[movieId];
      if (!existing) return prev;
      return {
        ...prev,
        movies: {
          ...prev.movies,
          [movieId]: {
            ...existing,
            ...patch,
          },
        },
      };
    });
  }, []);

  // Read actions
  const normalizeReadProgress = (
    item: ReadItem,
    nextUnit: number,
    prev?: ReadProgress,
    completedUnitsOverride?: number[]
  ): ReadProgress => {
    const total = Math.max(1, item.totalUnits);
    let completed: number[];
    if (completedUnitsOverride) {
      completed = [...new Set(completedUnitsOverride.filter((n) => Number.isFinite(n) && n >= 1))].sort(
        (a, b) => a - b
      );
    } else {
      const existingHigh = (prev?.completedUnits || []).filter((n) => n > total);
      const clampedCount = Math.min(total, Math.max(0, Math.round(nextUnit)));
      const base: number[] = [];
      for (let i = 1; i <= clampedCount; i += 1) base.push(i);
      completed = [...new Set([...base, ...existingHigh])].sort((a, b) => a - b);
    }
    const activeCount = completed.filter((n) => n <= total).length;
    const finished = activeCount >= total;
    const prevMax = prev?.maxCompletedUnit ?? prev?.currentUnit ?? 0;
    const nowStamp = new Date().toISOString();
    const prevDoneSet = new Set(getCompletedReadUnits(item, prev));
    const nextDoneSet = new Set(completed);
    const nextUnitFinishedAt = { ...(prev?.unitFinishedAt || {}) };
    for (let u = 1; u <= total; u += 1) {
      if (!prevDoneSet.has(u) && nextDoneSet.has(u) && !nextUnitFinishedAt[u]) {
        nextUnitFinishedAt[u] = nowStamp;
      } else if (prevDoneSet.has(u) && !nextDoneSet.has(u)) {
        delete nextUnitFinishedAt[u];
      }
    }
    return {
      ...(prev || {}),
      status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
      currentUnit: activeCount,
      completedUnits: completed,
      maxCompletedUnit: Math.max(activeCount, prevMax),
      rereadCount: finished ? Math.max(1, prev?.rereadCount || 0) : prev?.rereadCount || 0,
      bookmarked: prev?.bookmarked ?? true,
      edition: prev?.edition,
      lastReadAt: activeCount > 0 ? nowStamp : prev?.lastReadAt,
      finishedAt: finished ? prev?.finishedAt || nowStamp : undefined,
      unitFinishedAt: nextUnitFinishedAt,
    };
  };

  const applyReadAtomicSync = (
    nextState: CueStoreState,
    readId: string,
    prevCompleted: number[],
    nextCompleted: number[]
  ): { state: CueStoreState; syncedContainers: SyncedContainerSummary[] } => {
    const item = nextState.readItems[readId];
    if (!item || item.format !== 'comic' || !item.issueDetails) {
      return { state: nextState, syncedContainers: [] };
    }
    const prevSet = new Set(prevCompleted);
    const nextSet = new Set(nextCompleted);
    const deltas: AtomicDelta[] = [];
    const total = Math.max(1, item.totalUnits);
    for (let u = 1; u <= total; u += 1) {
      const wasDone = prevSet.has(u);
      const isDone = nextSet.has(u);
      if (wasDone === isDone) continue;
      const meta = item.issueDetails[u];
      const atomicId = getComicIssueAtomicId(meta);
      if (!atomicId) continue;
      deltas.push({
        atomicId,
        completed: isDone,
        seriesTitle: meta?.seriesTitle,
        issueLabel: meta?.issueLabel,
      });
    }
    if (deltas.length === 0) {
      return { state: nextState, syncedContainers: [] };
    }
    const synced = syncAtomicReadUnitsAcrossState(nextState, readId, deltas);
    return {
      state: {
        ...nextState,
        atomicReadUnits: synced.atomicReadUnits,
        readProgress: synced.readProgress,
      },
      syncedContainers: synced.syncedContainers,
    };
  };

  const computeReadSmartNudge = (
    item: ReadItem,
    prevProg: ReadProgress | undefined,
    updatedProg: ReadProgress,
    unitLabel: string,
    nextState: CueStoreState,
    syncedContainers: SyncedContainerSummary[] = []
  ): { msg: string; actionLabel?: string } => {
    const completedOtherContainer = syncedContainers.find((c) => c.newlyCompleted);
    if (completedOtherContainer) {
      return {
        msg: `${item.title} · ${unitLabel} · Completes ${completedOtherContainer.title} (${completedOtherContainer.afterRead}/${completedOtherContainer.total})!`,
        actionLabel: 'Inspect',
      };
    }

    const advancedOtherContainer = syncedContainers.find((c) => c.afterRead > c.beforeRead);
    if (advancedOtherContainer) {
      const pct = Math.round(
        (advancedOtherContainer.afterRead / Math.max(1, advancedOtherContainer.total)) * 100
      );
      return {
        msg: `${item.title} · ${unitLabel} · Synced ${advancedOtherContainer.title} (${pct}%)`,
        actionLabel: 'Inspect',
      };
    }

    if (item.format === 'comic') {
      const before = evaluateComicEditionContainers(item, prevProg);
      const after = evaluateComicEditionContainers(item, updatedProg);
      const activeId = normalizeComicEditionId(updatedProg.edition) || 'digital';
      const newlyCompletedOther = after.filter((a) => {
        if (a.id === activeId || !a.isTechnicallyComplete) return false;
        const b = before.find((x) => x.id === a.id);
        return Boolean(b && !b.isTechnicallyComplete);
      });

      if (newlyCompletedOther.length > 0) {
        const labels = newlyCompletedOther.map((e) => e.label);
        const names =
          labels.length > 1
            ? `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
            : labels[0];
        const sample = newlyCompletedOther[0];
        const prefix = updatedProg.status === 'finished' ? `Finished ${item.title}` : unitLabel;
        return {
          msg: `${prefix} · Technically completes ${names} (${sample.completedIssues}/${sample.totalIssues})!`,
          actionLabel: 'Inspect',
        };
      }

      const oneAwayOther = after.find((a) => {
        if (a.id === activeId || a.remainingIssues !== 1) return false;
        const b = before.find((x) => x.id === a.id);
        return Boolean(b && b.completedIssues < a.completedIssues);
      });
      if (oneAwayOther && updatedProg.status !== 'finished') {
        return {
          msg: `${item.title} · ${unitLabel} (1 more issue until ${oneAwayOther.label})`,
          actionLabel: 'Log note',
        };
      }
    }

    if (item.format === 'novel' && updatedProg.status === 'finished') {
      const series = findBookSeries(item.title);
      if (series) {
        const ev = evaluateBookSeriesProgress(series, nextState);
        if (ev.isComplete) {
          return {
            msg: `Finished ${item.title} · Completes ${series.name} (${ev.finishedCount}/${ev.totalCount})!`,
            actionLabel: 'Rate series',
          };
        }
        if (ev.remainingCount === 1) {
          return {
            msg: `Finished ${item.title} · 1 book left in ${series.name} (${ev.finishedCount}/${ev.totalCount})`,
            actionLabel: 'View series',
          };
        }
        return {
          msg: `Finished ${item.title} · ${series.name} (${ev.finishedCount}/${ev.totalCount})`,
          actionLabel: 'View series',
        };
      }
    }

    if (updatedProg.status === 'finished') {
      return { msg: `Finished ${item.title}`, actionLabel: 'Log note' };
    }
    return { msg: `${item.title} · ${unitLabel}`, actionLabel: 'Log note' };
  };

  const advanceReadProgress = useCallback(
    (readId: string, delta?: number) => {
      let msg = '';
      let actionLabel: string | undefined = 'Log note';
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        coverUrl = resolveComicEditionCover(item, prog?.edition, prog);
        const step = delta ?? 1;
        const prevUnits = getCompletedReadUnits(item, prog);
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        let nextActive = [...prevUnits];
        let touchedUnit = prog?.currentUnit || 0;

        if (step > 0) {
          const now = new Date();
          const trackComicReleases =
            item.format === 'comic' &&
            Boolean(item.issueDetails && Object.keys(item.issueDetails).length > 0);
          for (let s = 0; s < step; s += 1) {
            const set = new Set(nextActive);
            let nextMissing: number | null = null;
            for (let u = 1; u <= item.totalUnits; u += 1) {
              if (set.has(u)) continue;
              if (trackComicReleases && !isComicIssueReleased(item.issueDetails?.[u], now)) {
                continue;
              }
              nextMissing = u;
              break;
            }
            if (nextMissing === null) break;
            nextActive.push(nextMissing);
            touchedUnit = nextMissing;
          }
        } else if (step < 0) {
          for (let s = 0; s < Math.abs(step); s += 1) {
            if (nextActive.length === 0) break;
            nextActive.pop();
          }
          touchedUnit = nextActive[nextActive.length - 1] || 0;
        }

        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const updated = normalizeReadProgress(item, nextActive.length, prog, combined);
        const unitLabel =
          item.unit === 'issues'
            ? `Issue #${step > 0 ? touchedUnit : updated.currentUnit}`
            : `Ch. ${step > 0 ? touchedUnit : updated.currentUnit}`;
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const nextHistory =
          step > 0 && touchedUnit > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'read',
                mediaKind: 'read',
                mediaId: readId,
                title: item.title,
                posterUrl: activeCover,
                codeLabel: unitLabel,
                subtitle: item.creator,
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const synced = applyReadAtomicSync(rawNextState, readId, prevUnits, nextActive);
        const nudge = computeReadSmartNudge(
          item,
          prog,
          updated,
          unitLabel,
          synced.state,
          synced.syncedContainers
        );
        msg = nudge.msg;
        actionLabel = nudge.actionLabel;
        return synced.state;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const setReadProgress = useCallback((readId: string, currentUnit: number) => {
    commitState((prev) => {
      const item = prev.readItems[readId];
      if (!item) return prev;
      const prog = prev.readProgress[readId];
      const prevUnits = getCompletedReadUnits(item, prog);
      const updated = normalizeReadProgress(item, currentUnit, prog);
      const nextUnits = getCompletedReadUnits(item, updated);
      const rawNextState: CueStoreState = {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: updated,
        },
      };
      return applyReadAtomicSync(rawNextState, readId, prevUnits, nextUnits).state;
    });
  }, []);

  const toggleReadUnit = useCallback(
    (readId: string, unitNumber: number) => {
      let msg = '';
      let actionLabel: string | undefined;
      let coverUrl = '';
      let pendingPrompt: CatchUpPromptItem | null = null;
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumber < 1 || unitNumber > item.totalUnits) return prev;
        const prog = prev.readProgress[readId];
        const prevUnits = getCompletedReadUnits(item, prog);
        const prevSet = new Set(prevUnits);
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        const hadUnit = prevSet.has(unitNumber);

        if (!hadUnit && unitNumber > 1) {
          const mediaKey = `read:${readId}`;
          const skipped = prev.settings.skipCatchUpPromptIds?.includes(mediaKey);
          if (!skipped) {
            const orderedNums: number[] = [];
            for (let i = 1; i <= item.totalUnits; i += 1) orderedNums.push(i);
            const priorNums = detectNonAdjacentPriorAtoms(
              orderedNums,
              unitNumber - 1,
              (u) => prevSet.has(u)
            );
            if (priorNums.length > 0) {
              const isIssues = item.unit === 'issues';
              pendingPrompt = {
                id: `cup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                mediaKey,
                kind: 'read',
                mediaId: readId,
                title: item.title,
                count: priorNums.length,
                unitSingular: isIssues ? 'issue' : 'chapter',
                unitPlural: isIssues ? 'issues' : 'chapters',
                verbPast: 'read',
                mediaNoun:
                  item.format === 'comic' ? 'comic' : item.format === 'manga' ? 'manga' : 'book',
                readUnitTargets: priorNums,
              };
            }
          }
        }

        const nextActive = hadUnit
          ? prevUnits.filter((u) => u !== unitNumber)
          : [...prevUnits, unitNumber].sort((a, b) => a - b);
        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const updated = normalizeReadProgress(item, nextActive.length, prog, combined);
        const unitLabel = item.unit === 'issues' ? `Issue #${unitNumber}` : `Ch. ${unitNumber}`;
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const nextHistory = !hadUnit
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: activeCover,
              codeLabel: unitLabel,
              subtitle: item.creator,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const synced = applyReadAtomicSync(rawNextState, readId, prevUnits, nextActive);
        if (!hadUnit) {
          const nudge = computeReadSmartNudge(
            item,
            prog,
            updated,
            unitLabel,
            synced.state,
            synced.syncedContainers
          );
          msg = nudge.msg;
          actionLabel = nudge.actionLabel;
        }
        return synced.state;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
      if (pendingPrompt) {
        setCatchUpPrompt(pendingPrompt);
      }
    },
    [pushRoute, showToast]
  );

  const setReadUnitsBatch = useCallback(
    (readId: string, unitNumbers: number[], completed: boolean) => {
      let msg = '';
      let actionLabel: string | undefined;
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumbers.length === 0) return prev;
        const prog = prev.readProgress[readId];
        const prevUnits = getCompletedReadUnits(item, prog);
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        const targetSet = new Set(unitNumbers.filter((n) => n >= 1 && n <= item.totalUnits));
        const activeSet = new Set(prevUnits);
        if (completed) {
          for (const u of targetSet) activeSet.add(u);
        } else {
          for (const u of targetSet) activeSet.delete(u);
        }
        const nextActive = [...activeSet].sort((a, b) => a - b);
        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const updated = normalizeReadProgress(item, nextActive.length, prog, combined);
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const unitLabel = `${targetSet.size} ${targetSet.size === 1 ? (item.unit === 'issues' ? 'issue' : 'chapter') : item.unit}`;
        const nextHistory = completed
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: activeCover,
              codeLabel: unitLabel,
              subtitle: item.creator,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const synced = applyReadAtomicSync(rawNextState, readId, prevUnits, nextActive);
        if (completed) {
          const nudge = computeReadSmartNudge(
            item,
            prog,
            updated,
            unitLabel,
            synced.state,
            synced.syncedContainers
          );
          msg = nudge.msg;
          actionLabel = nudge.actionLabel;
        }
        return synced.state;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const dismissCatchUpPrompt = useCallback(() => setCatchUpPrompt(null), []);

  const neverAskCatchUpPrompt = useCallback(() => {
    const prompt = catchUpPrompt;
    setCatchUpPrompt(null);
    if (!prompt) return;
    commitState((prev) => {
      const existing = prev.settings.skipCatchUpPromptIds || [];
      if (existing.includes(prompt.mediaKey)) return prev;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          skipCatchUpPromptIds: [...existing, prompt.mediaKey],
        },
      };
    });
    showToast(`Won't ask again for ${prompt.title}`);
  }, [catchUpPrompt, commitState, showToast]);

  const confirmCatchUpPrompt = useCallback(() => {
    const prompt = catchUpPrompt;
    setCatchUpPrompt(null);
    if (!prompt) return;

    if (prompt.kind === 'read' && prompt.readUnitTargets?.length) {
      setReadUnitsBatch(prompt.mediaId, prompt.readUnitTargets, true);
      return;
    }

    if (prompt.kind === 'show' && prompt.episodeTargets?.length) {
      let toastMsg = '';
      let showPoster = '';
      commitState((prev) => {
        const show = prev.shows[prompt.mediaId];
        if (!show) return prev;
        showPoster = show.posterUrl;
        const prog = prev.showProgress[prompt.mediaId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        let added = 0;
        for (const ep of prompt.episodeTargets!) {
          const key = getEpisodeKey(ep.season, ep.number);
          if ((nextCounts[key] || 0) === 0) {
            nextCounts[key] = 1;
            added += 1;
          }
        }
        if (added === 0) return prev;
        const updatedProg = recomputeShowStatus(show, nextCounts, prog);
        const stats = getShowStats(show, updatedProg);
        toastMsg = stats.isFinished
          ? `Finished ${show.title}!`
          : `Marked ${added} previous ${added === 1 ? 'episode' : 'episodes'} watched`;
        const nextHistory = appendHistory(prev.history || [], {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          domain: 'watch',
          mediaKind: 'show',
          mediaId: prompt.mediaId,
          title: show.title,
          posterUrl: show.posterUrl,
          codeLabel: `+${added} eps`,
          subtitle: `Caught up ${added} ${added === 1 ? 'episode' : 'episodes'}`,
          loggedAt: new Date().toISOString(),
        });
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [prompt.mediaId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      if (toastMsg) {
        showToast(toastMsg, undefined, undefined, {
          domain: 'watch',
          subtitle: prompt.title,
          posterUrl: showPoster,
        });
      }
    }
  }, [catchUpPrompt, commitState, setReadUnitsBatch, showToast]);

  const updateReadTotalUnits = useCallback(
    (
      readId: string,
      totalUnits: number,
      meta?: {
        source?: 'api' | 'estimated' | 'manual';
        syncedAt?: string;
        publicationStatus?: ReadItem['publicationStatus'];
      }
    ) => {
      const safeTotal = Math.max(1, Math.min(10000, Math.round(totalUnits)));
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const nextEditionCounts = prog?.edition
          ? { ...(item.editionIssueCounts || {}), [prog.edition]: safeTotal }
          : item.editionIssueCounts;
        const nextSource = meta?.source ?? 'manual';
        const nextSyncedAt = meta?.syncedAt ?? new Date().toISOString();
        const updatedItem: ReadItem = {
          ...item,
          totalUnits: safeTotal,
          totalUnitsSource: nextSource,
          totalUnitsSyncedAt: nextSyncedAt,
          ...(meta?.publicationStatus !== undefined
            ? { publicationStatus: meta.publicationStatus }
            : {}),
          baseTotalUnits: prog?.edition ? item.baseTotalUnits : safeTotal,
          editionIssueCounts: nextEditionCounts,
        };
        return {
          ...prev,
          readItems: { ...prev.readItems, [readId]: updatedItem },
          readProgress: prog
            ? {
                ...prev.readProgress,
                [readId]: normalizeReadProgress(updatedItem, prog.currentUnit, prog, prog.completedUnits),
              }
            : prev.readProgress,
        };
      });
    },
    []
  );

  const updateReadMetadata = useCallback(
    (
      readId: string,
      patch: {
        title?: string;
        creator?: string;
        year?: number;
        coverUrl?: string;
        totalUnits?: number;
        totalUnitsSource?: ReadItem['totalUnitsSource'];
        totalUnitsSyncedAt?: string;
        publicationStatus?: ReadItem['publicationStatus'];
      }
    ) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const nextTotal =
          typeof patch.totalUnits === 'number' && Number.isFinite(patch.totalUnits)
            ? Math.max(1, Math.min(10000, Math.round(patch.totalUnits)))
            : item.totalUnits;
        const nextEditionCounts =
          nextTotal !== item.totalUnits && prog?.edition
            ? { ...(item.editionIssueCounts || {}), [prog.edition]: nextTotal }
            : item.editionIssueCounts;
        const cleanCover = patch.coverUrl !== undefined ? patch.coverUrl.trim() : item.coverUrl;
        const updatedItem: ReadItem = {
          ...item,
          ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
          ...(patch.creator?.trim() ? { creator: patch.creator.trim() } : {}),
          ...(typeof patch.year === 'number' && Number.isFinite(patch.year)
            ? { year: Math.round(patch.year) }
            : {}),
          coverUrl: cleanCover,
          backdropUrl: patch.coverUrl !== undefined ? cleanCover || item.backdropUrl : item.backdropUrl,
          totalUnits: nextTotal,
          totalUnitsSource:
            patch.totalUnitsSource ??
            (nextTotal !== item.totalUnits ? 'manual' : item.totalUnitsSource),
          totalUnitsSyncedAt:
            patch.totalUnitsSyncedAt ??
            (nextTotal !== item.totalUnits ? new Date().toISOString() : item.totalUnitsSyncedAt),
          ...(patch.publicationStatus !== undefined
            ? { publicationStatus: patch.publicationStatus }
            : {}),
          baseTotalUnits:
            nextTotal !== item.totalUnits && !prog?.edition ? nextTotal : item.baseTotalUnits,
          editionIssueCounts: nextEditionCounts,
        };
        return {
          ...prev,
          readItems: { ...prev.readItems, [readId]: updatedItem },
          readProgress:
            prog && nextTotal !== item.totalUnits
              ? {
                  ...prev.readProgress,
                  [readId]: normalizeReadProgress(updatedItem, prog.currentUnit, prog, prog.completedUnits),
                }
              : prev.readProgress,
        };
      });
    },
    []
  );

  const markReadFinished = useCallback(
    (readId: string) => {
      let msg = '';
      let actionLabel: string | undefined;
      let coverUrl = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const prevUnits = getCompletedReadUnits(item, prog);
        const isDone = prog?.status === 'finished';
        const existingHigh = (prog?.completedUnits || []).filter((n) => n > item.totalUnits);
        const allUnits: number[] = [];
        for (let i = 1; i <= item.totalUnits; i += 1) allUnits.push(i);
        const combined = [...new Set([...allUnits, ...existingHigh])].sort((a, b) => a - b);
        const updated: ReadProgress = {
          ...(prog || {}),
          status: 'finished',
          currentUnit: item.totalUnits,
          completedUnits: combined,
          maxCompletedUnit: Math.max(item.totalUnits, prog?.maxCompletedUnit || 0),
          rereadCount: isDone ? (prog?.rereadCount || 1) + 1 : Math.max(1, prog?.rereadCount || 0),
          bookmarked: prog?.bookmarked ?? true,
          edition: prog?.edition,
          lastReadAt: new Date().toISOString(),
          finishedAt: prog?.finishedAt || new Date().toISOString(),
        };
        const activeCover = resolveComicEditionCover(item, updated.edition, updated);
        coverUrl = activeCover;
        const editionLabel =
          item.format === 'comic' && updated.edition
            ? getComicEditionLabel(updated.edition, item, updated)
            : '';
        const nextHistory = !isDone
          ? appendHistory(prev.history || [], {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: activeCover,
              codeLabel: editionLabel ? `${editionLabel} · Complete` : `Finished · ${item.totalUnits} ${item.unit}`,
              subtitle: item.creator,
              loggedAt: new Date().toISOString(),
            })
          : prev.history;
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
          history: nextHistory,
        };
        const synced = applyReadAtomicSync(rawNextState, readId, prevUnits, allUnits);
        const unitLabel = item.unit === 'issues' ? `Issues #1–${item.totalUnits}` : `Ch. 1–${item.totalUnits}`;
        const nudge = computeReadSmartNudge(
          item,
          prog,
          updated,
          unitLabel,
          synced.state,
          synced.syncedContainers
        );
        msg = nudge.msg;
        actionLabel = nudge.actionLabel;
        return synced.state;
      });
      if (msg) {
        showToast(msg, actionLabel, () => pushRoute({ view: 'read-detail', readId }), {
          domain: 'read',
          posterUrl: coverUrl,
        });
      }
    },
    [pushRoute, showToast]
  );

  const incrementReread = useCallback(
    (readId: string, delta: number) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const nextReread = Math.max(0, (prog?.rereadCount || 0) + delta);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(prog || {}),
              status: nextReread > 0 ? 'finished' : 'reading',
              currentUnit: nextReread > 0 ? item.totalUnits : prog?.currentUnit || 0,
              maxCompletedUnit:
                nextReread > 0
                  ? Math.max(item.totalUnits, prog?.maxCompletedUnit || 0)
                  : prog?.maxCompletedUnit,
              rereadCount: nextReread,
              bookmarked: prog?.bookmarked ?? true,
              edition: prog?.edition,
              lastReadAt: new Date().toISOString(),
            },
          },
        };
      });
      if (delta > 0) showToast('Logged reread');
    },
    [showToast]
  );

  const toggleReadBookmark = useCallback(
    (readId: string) => {
      let added = true;
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: added,
            },
          },
        };
      });
      showToast(added ? 'Added to Read library' : 'Removed from Read library');
    },
    [showToast]
  );

  const rateReadUnit = useCallback(
    (readId: string, unitNumber: number, rating: number | undefined) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        const existing = prev.readProgress[readId];
        const nextUnitRatings = { ...(existing?.unitRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextUnitRatings[unitNumber] = rating;
        } else {
          delete nextUnitRatings[unitNumber];
        }
        const unitAvg = getReadUnitsAverage({
          ...(existing || {
            status: 'reading',
            currentUnit: 0,
            rereadCount: 0,
            bookmarked: true,
          }),
          unitRatings: nextUnitRatings,
        });
        const resolvedTitleRating = applyAutoRating(
          existing?.rating,
          existing?.ratingSource,
          unitAvg?.avg ?? null
        );
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'reading',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              unitRatings: nextUnitRatings,
              rating: resolvedTitleRating.rating,
              ratingSource: resolvedTitleRating.source,
            },
          },
        };
        const atomId = getComicIssueAtomicId(item?.issueDetails?.[unitNumber]);
        if (!atomId) return recomputeAutoCollectionRatings(rawNextState);
        const synced = syncAtomicReadUnitsAcrossState(rawNextState, readId, [], [
          { atomicId: atomId, rating },
        ]);
        return recomputeAutoCollectionRatings({
          ...rawNextState,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
        });
      });
    },
    []
  );

  const rateReadItem = useCallback(
    (readId: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        return recomputeAutoCollectionRatings({
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'reading',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              rating,
              ratingSource: rating ? source : undefined,
            },
          },
        });
      });
    },
    []
  );

  const setReadUnitFinishedDate = useCallback(
    (readId: string, unitNumber: number, dateYmd: string | undefined) => {
      const normalizedIso = toFinishedIso(dateYmd);
      let labelForToast = `Unit ${unitNumber}`;
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumber < 1 || unitNumber > item.totalUnits) return prev;
        labelForToast = item.unit === 'issues' ? `Issue #${unitNumber}` : `Chapter ${unitNumber}`;
        const existing = prev.readProgress[readId];
        const prevUnits = getCompletedReadUnits(item, existing);
        const existingHigh = (existing?.completedUnits || []).filter((n) => n > item.totalUnits);
        const activeSet = new Set(prevUnits);
        const nextDates = { ...(existing?.unitFinishedAt || {}) };

        if (normalizedIso) {
          nextDates[unitNumber] = normalizedIso;
          activeSet.add(unitNumber);
        } else {
          delete nextDates[unitNumber];
        }

        const nextActive = [...activeSet].sort((a, b) => a - b);
        const combined = [...new Set([...nextActive, ...existingHigh])].sort((a, b) => a - b);
        const activeCount = nextActive.length;
        const finished = activeCount >= Math.max(1, item.totalUnits);
        const updatedProg: ReadProgress = {
          ...(existing || {}),
          status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
          currentUnit: activeCount,
          completedUnits: combined,
          maxCompletedUnit: Math.max(activeCount, existing?.maxCompletedUnit ?? existing?.currentUnit ?? 0),
          rereadCount: finished ? Math.max(1, existing?.rereadCount || 0) : existing?.rereadCount || 0,
          bookmarked: existing?.bookmarked ?? true,
          lastReadAt: activeCount > 0 ? existing?.lastReadAt || normalizedIso || new Date().toISOString() : existing?.lastReadAt,
          finishedAt: finished ? existing?.finishedAt || normalizedIso || new Date().toISOString() : undefined,
          unitFinishedAt: nextDates,
        };

        const codeLabel = item.unit === 'issues' ? `Issue #${unitNumber}` : `Ch. ${unitNumber}`;
        let nextHistory = prev.history || [];
        if (normalizedIso) {
          let updatedHist = false;
          nextHistory = nextHistory.map((h) => {
            if (h.domain === 'read' && h.mediaId === readId && h.codeLabel === codeLabel) {
              updatedHist = true;
              return { ...h, loggedAt: normalizedIso };
            }
            return h;
          });
          if (!updatedHist) {
            nextHistory = appendHistory(nextHistory, {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: readId,
              title: item.title,
              posterUrl: resolveComicEditionCover(item, updatedProg.edition, updatedProg),
              codeLabel,
              subtitle: item.creator,
              loggedAt: normalizedIso,
            });
          }
        }

        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: updatedProg,
          },
          history: nextHistory,
        };

        const meta = item.format === 'comic' ? item.issueDetails?.[unitNumber] : undefined;
        const atomId = getComicIssueAtomicId(meta);
        if (!atomId) return rawNextState;

        const unitDeltas: AtomicDelta[] =
          normalizedIso && !prevUnits.includes(unitNumber)
            ? [
                {
                  atomicId: atomId,
                  completed: true,
                  seriesTitle: meta?.seriesTitle,
                  issueLabel: meta?.issueLabel,
                },
              ]
            : [];
        const synced = syncAtomicReadUnitsAcrossState(
          rawNextState,
          readId,
          unitDeltas,
          [],
          normalizedIso || new Date().toISOString(),
          [{ atomicId: atomId, readAt: normalizedIso }]
        );
        return {
          ...rawNextState,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
        };
      });
      showToast(normalizedIso ? `Updated ${labelForToast} date` : `Cleared ${labelForToast} date`);
    },
    [showToast]
  );

  const setReadOwnership = useCallback(
    (readId: string, ownership: ComicOwnershipStatus | undefined) => {
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              ownership,
            },
          },
        };
      });
      showToast(
        ownership === 'owned'
          ? 'Added to comic collection'
          : ownership === 'wishlist'
            ? 'Added to comic wishlist'
            : 'Removed from comic collection'
      );
    },
    [showToast]
  );

  const setReadCollectionNote = useCallback(
    (readId: string, note: string) => {
      const clean = note.trim();
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              collectionNote: clean || undefined,
            },
          },
        };
      });
      showToast(clean ? 'Saved shelf note' : 'Cleared shelf note');
    },
    [showToast]
  );

  const setReadUnitOwnership = useCallback(
    (readId: string, unitNumber: number, ownership: ComicOwnershipStatus | undefined) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumber < 1 || unitNumber > item.totalUnits) return prev;
        const existing = prev.readProgress[readId];
        const nextUnitOwnership = { ...(existing?.unitOwnership || {}) };
        if (ownership) {
          nextUnitOwnership[unitNumber] = ownership;
        } else {
          delete nextUnitOwnership[unitNumber];
        }
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              unitOwnership: nextUnitOwnership,
            },
          },
        };
        const atomId = getComicIssueAtomicId(item.issueDetails?.[unitNumber]);
        if (!atomId) return rawNextState;
        const synced = syncAtomicReadUnitsAcrossState(
          rawNextState,
          readId,
          [],
          [],
          new Date().toISOString(),
          [],
          [{ atomicId: atomId, ownership }]
        );
        return {
          ...rawNextState,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
        };
      });
    },
    []
  );

  const setReadUnitVariantNote = useCallback(
    (readId: string, unitNumber: number, note: string) => {
      const clean = note.trim();
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || unitNumber < 1 || unitNumber > item.totalUnits) return prev;
        const existing = prev.readProgress[readId];
        const nextNotes = { ...(existing?.unitVariantNotes || {}) };
        if (clean) {
          nextNotes[unitNumber] = clean;
        } else {
          delete nextNotes[unitNumber];
        }
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              unitVariantNotes: nextNotes,
            },
          },
        };
        const atomId = getComicIssueAtomicId(item.issueDetails?.[unitNumber]);
        if (!atomId) return rawNextState;
        const synced = syncAtomicReadUnitsAcrossState(
          rawNextState,
          readId,
          [],
          [],
          new Date().toISOString(),
          [],
          [
            {
              atomicId: atomId,
              ownership: existing?.unitOwnership?.[unitNumber],
              variantNote: clean || undefined,
              updateVariantNote: true,
            },
          ]
        );
        return {
          ...rawNextState,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
        };
      });
      showToast(clean ? 'Saved variant note' : 'Cleared variant note');
    },
    [showToast]
  );

  const setAllReadUnitsOwnership = useCallback(
    (readId: string, ownership: ComicOwnershipStatus | undefined) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const existing = prev.readProgress[readId];
        const total = Math.max(1, item.totalUnits);
        const nextUnitOwnership: Record<number, ComicOwnershipStatus> = {};
        const ownershipDeltas: AtomicOwnershipDelta[] = [];

        for (let u = 1; u <= total; u += 1) {
          if (ownership) nextUnitOwnership[u] = ownership;
          const atomId = getComicIssueAtomicId(item.issueDetails?.[u]);
          if (atomId) {
            ownershipDeltas.push({ atomicId: atomId, ownership });
          }
        }

        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              ownership,
              unitOwnership: nextUnitOwnership,
            },
          },
        };

        if (ownershipDeltas.length === 0) return rawNextState;
        const synced = syncAtomicReadUnitsAcrossState(
          rawNextState,
          readId,
          [],
          [],
          new Date().toISOString(),
          [],
          ownershipDeltas
        );
        return {
          ...rawNextState,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
        };
      });
      showToast(
        ownership === 'owned'
          ? 'Marked all issues owned'
          : ownership === 'wishlist'
            ? 'Marked all issues wanted'
            : 'Cleared owned issues'
      );
    },
    [showToast]
  );

  const toggleComicEditionOwnership = useCallback(
    (readId: string, editionId: string, target: ComicOwnershipStatus) => {
      let msg = 'Removed from collection';
      commitState((prev) => {
        const existing = prev.readProgress[readId];
        const ownedSet = new Set(existing?.ownedEditionIds || []);
        const wishSet = new Set(existing?.wishlistEditionIds || []);

        if (target === 'owned') {
          if (ownedSet.has(editionId)) {
            ownedSet.delete(editionId);
            msg = 'Removed edition from collection';
          } else {
            ownedSet.add(editionId);
            wishSet.delete(editionId);
            msg = 'Edition marked owned';
          }
        } else {
          if (wishSet.has(editionId)) {
            wishSet.delete(editionId);
            msg = 'Removed edition from wishlist';
          } else {
            wishSet.add(editionId);
            ownedSet.delete(editionId);
            msg = 'Edition added to wishlist';
          }
        }

        const nextOwnedIds = [...ownedSet];
        const nextWishIds = [...wishSet];
        let nextOwnership = existing?.ownership;
        if (nextOwnedIds.length > 0) {
          nextOwnership = 'owned';
        } else if (nextWishIds.length > 0) {
          if (nextOwnership !== 'owned') nextOwnership = 'wishlist';
        } else if (
          (existing?.ownedEditionIds?.length || 0) > 0 ||
          (existing?.wishlistEditionIds?.length || 0) > 0
        ) {
          nextOwnership = undefined;
        }

        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: existing?.bookmarked ?? true,
              ownedEditionIds: nextOwnedIds,
              wishlistEditionIds: nextWishIds,
              ownership: nextOwnership,
            },
          },
        };
      });
      showToast(msg);
    },
    [showToast]
  );

  const setReadMood = useCallback((readId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const existing = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: {
            ...(existing || {}),
            status: existing?.status || 'reading',
            currentUnit: existing?.currentUnit || 0,
            rereadCount: existing?.rereadCount || 0,
            bookmarked: existing?.bookmarked ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const applyEditionSwitchState = (
    prev: CueStoreState,
    readId: string,
    nextCategory: GeneralizedComicEditionId,
    nextTotal: number,
    nextLabel: string,
    nextCover: string,
    extraProgress?: Partial<ReadProgress>,
    editionRecord?: ComicEditionRecord
  ): CueStoreState => {
    const item = prev.readItems[readId];
    if (!item) return prev;
    const existing = prev.readProgress[readId];
    const preservedMax = Math.max(existing?.currentUnit || 0, existing?.maxCompletedUnit || 0);
    const existingUnits = existing?.completedUnits;
    let nextCompletedList: number[];
    if (Array.isArray(existingUnits) && existingUnits.length > 0) {
      nextCompletedList = [...existingUnits];
    } else {
      nextCompletedList = [];
      for (let i = 1; i <= preservedMax; i += 1) nextCompletedList.push(i);
    }
    const activeCount = nextCompletedList.filter((u) => u <= nextTotal).length;
    const finished = activeCount >= nextTotal;
    const nextCoversMap =
      nextCover && nextCover !== item.coverUrl
        ? { ...(item.editionCovers || {}), [nextCategory]: nextCover }
        : item.editionCovers;
    const nextCountsMap = { ...(item.editionIssueCounts || {}), [nextCategory]: nextTotal };
    const nextEditionsList = editionRecord
      ? mergeComicEditionCatalog(
          (item.editions || []).filter((e) => e.id !== editionRecord.id),
          [editionRecord]
        )
      : item.editions;
    const nextHistory = nextCover
      ? (prev.history || []).map((h) =>
          h.domain === 'read' && h.mediaId === readId ? { ...h, posterUrl: nextCover } : h
        )
      : prev.history;

    return {
      ...prev,
      readItems: {
        ...prev.readItems,
        [readId]: {
          ...item,
          editionCovers: nextCoversMap,
          editionIssueCounts: nextCountsMap,
          editions: nextEditionsList,
          baseTotalUnits: item.baseTotalUnits ?? item.totalUnits,
          totalUnits: Math.max(1, nextTotal),
        },
      },
      readProgress: {
        ...prev.readProgress,
        [readId]: {
          ...(existing || {}),
          status: finished ? 'finished' : activeCount > 0 ? 'reading' : 'want_to_read',
          currentUnit: activeCount,
          completedUnits: nextCompletedList,
          maxCompletedUnit: Math.max(preservedMax, activeCount),
          rereadCount: finished ? Math.max(1, existing?.rereadCount || 0) : existing?.rereadCount || 0,
          bookmarked: existing?.bookmarked ?? true,
          edition: nextCategory,
          editionTitle: extraProgress?.editionTitle ?? (nextLabel || undefined),
          editionId: extraProgress?.editionId,
          editionCoverUrl: extraProgress?.editionCoverUrl,
        },
      },
      history: nextHistory,
    };
  };

  const setReadEdition = useCallback(
    (readId: string, edition: ComicEditionId) => {
      const normalizedEdition = normalizeComicEditionId(edition) || 'digital';
      let toastMsg = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const label = getComicEditionLabel(normalizedEdition, item);
        const nextTotal = resolveComicEditionTotal(item, normalizedEdition);
        const nextCover = resolveComicEditionCover(item, normalizedEdition);
        toastMsg = label ? `${label} · ${nextTotal} ${item.unit}` : '';
        return applyEditionSwitchState(prev, readId, normalizedEdition, nextTotal, label, nextCover, {
          editionId: undefined,
          editionTitle: undefined,
          editionCoverUrl: undefined,
        });
      });
      if (toastMsg) showToast(toastMsg);
    },
    [showToast]
  );

  const selectComicEdition = useCallback(
    (readId: string, editionRecord: ComicEditionRecord) => {
      let toastMsg = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const nextTotal = Math.max(1, editionRecord.issueCount);
        const nextLabel = editionRecord.shortLabel || editionRecord.title;
        const nextCover =
          editionRecord.coverUrl || resolveComicEditionCover(item, editionRecord.category);
        toastMsg = `${nextLabel} · ${nextTotal} ${item.unit}`;
        return applyEditionSwitchState(
          prev,
          readId,
          editionRecord.category,
          nextTotal,
          nextLabel,
          nextCover,
          {
            editionId: editionRecord.id,
            editionTitle: nextLabel,
            editionCoverUrl: editionRecord.coverUrl || undefined,
          },
          editionRecord
        );
      });
      if (toastMsg) showToast(toastMsg);
    },
    [showToast]
  );

  const updateReadEditionsCatalog = useCallback(
    (readId: string, editions: ComicEditionRecord[]) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const customExisting = (item.editions || []).filter((e) => e.source === 'custom');
        const merged = mergeComicEditionCatalog(editions, customExisting);
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: {
              ...item,
              editions: merged,
            },
          },
        };
      });
    },
    []
  );

  const updateReadIssueDetails = useCallback(
    (
      readId: string,
      issueDetails: Record<number, ComicIssueMeta>,
      detailsKey: string,
      resolvedTotalUnits?: number,
      metaPatch?: {
        coverUrl?: string;
        publisher?: string;
        year?: number;
        wiki?: ComicWikiSlug;
        collectionPageTitle?: string;
      }
    ) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const isDefaultSeriesEdition =
          item.comicKind === 'series' && (!prog?.edition || prog.edition === 'digital');
        const isCollectionDefault =
          isCollectedComicItem(item) && (!prog?.edition || prog.edition === 'digital') && !prog?.editionId;
        const nextTotal =
          resolvedTotalUnits && resolvedTotalUnits > 0
            ? isDefaultSeriesEdition
              ? Math.max(item.totalUnits, resolvedTotalUnits)
              : isCollectionDefault
                ? resolvedTotalUnits
                : item.totalUnits
            : item.totalUnits;

        const patchedCover =
          isCollectionDefault &&
          metaPatch?.coverUrl &&
          (!item.coverUrl || item.id.startsWith('imp-read-') || /openlibrary\.org/i.test(item.coverUrl))
            ? metaPatch.coverUrl
            : undefined;
        const patchedPub = metaPatch?.publisher || item.comicPublisher;

        const updatedItem: ReadItem = {
          ...item,
          totalUnits: nextTotal,
          baseTotalUnits:
            (isDefaultSeriesEdition || isCollectionDefault) && resolvedTotalUnits && resolvedTotalUnits > 0
              ? nextTotal
              : item.baseTotalUnits,
          ...(patchedCover ? { coverUrl: patchedCover, backdropUrl: patchedCover } : {}),
          ...(patchedPub ? { comicPublisher: patchedPub } : {}),
          ...(item.creator === 'Author' && patchedPub ? { creator: patchedPub } : {}),
          ...(item.id.startsWith('imp-read-') && metaPatch?.year ? { year: metaPatch.year } : {}),
          ...(metaPatch?.wiki ? { comicSeriesWiki: metaPatch.wiki } : {}),
          ...(metaPatch?.collectionPageTitle
            ? { comicSeriesVolTitle: metaPatch.collectionPageTitle }
            : {}),
          issueDetails,
          issueDetailsKey: detailsKey,
        };

        let nextProgForSelf = prog;
        if (prog && nextTotal !== item.totalUnits) {
          if (item.id.startsWith('imp-read-') && !item.issueDetails && prog.status === 'finished') {
            const fullSlots = Array.from({ length: nextTotal }, (_, idx) => idx + 1);
            nextProgForSelf = normalizeReadProgress(updatedItem, nextTotal, prog, fullSlots);
          } else {
            nextProgForSelf = normalizeReadProgress(updatedItem, prog.currentUnit, prog, prog.completedUnits);
          }
        }
        const intermediate: CueStoreState = {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: updatedItem,
          },
          readProgress: nextProgForSelf
            ? { ...prev.readProgress, [readId]: nextProgForSelf }
            : prev.readProgress,
        };
        const reconciled = reconcileHydratedComicItemWithAtoms(intermediate, readId, updatedItem);
        return {
          ...intermediate,
          atomicReadUnits: reconciled.atomicReadUnits,
          readProgress: reconciled.readProgress,
        };
      });
    },
    []
  );

  const patchReadIssueMeta = useCallback(
    (readId: string, unitNumber: number, patch: Partial<ComicIssueMeta>) => {
      if (!patch || Object.keys(patch).length === 0) return;
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const existingDetails = item.issueDetails || {};
        const prevMeta = existingDetails[unitNumber] || { number: unitNumber };
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: {
              ...item,
              issueDetails: {
                ...existingDetails,
                [unitNumber]: {
                  ...prevMeta,
                  ...patch,
                },
              },
            },
          },
        };
      });
    },
    []
  );

  const releaseScheduleRefreshedRef = useRef(false);
  useEffect(() => {
    if (releaseScheduleRefreshedRef.current) return;
    releaseScheduleRefreshedRef.current = true;
    const snap = stateRef.current;

    // 1. Refresh stale bookmarked comic series & collections so exact dates, covers, and atomicIds stay synced
    const staleComics = snap.readOrder
      .map((id) => snap.readItems[id])
      .filter((item): item is ReadItem => {
        if (!item || item.format !== 'comic') return false;
        const prog = snap.readProgress[item.id];
        if (!prog?.bookmarked) return false;
        if (prog.edition && prog.edition !== 'digital') return false;
        const hasSeriesSource = Boolean(item.comicSeriesWiki && item.comicSeriesVolTitle);
        const hasCollectionSource = isCollectedComicItem(item);
        if (!hasSeriesSource && !hasCollectionSource) return false;
        return !item.issueDetailsKey?.endsWith(`::${COMIC_ISSUE_CACHE_VERSION}`);
      })
      .slice(0, 6);

    if (staleComics.length > 0) {
      void Promise.allSettled(
        staleComics.map(async (item) => {
          const isCollection = isCollectedComicItem(item);
          const payload =
            item.comicKind === 'series' && item.comicSeriesWiki && item.comicSeriesVolTitle
              ? await fetchComicSeriesIssues(
                  item.comicSeriesWiki,
                  item.comicSeriesVolTitle,
                  Math.max(90, item.totalUnits)
                )
              : isCollection
                ? await fetchComicCollectionIssues({
                    title: item.title,
                    isbn: extractReadItemIsbn(item),
                    overview: item.overview,
                    publisher: item.comicPublisher,
                    wiki: item.comicSeriesWiki,
                    pageTitle: item.comicSeriesVolTitle,
                    limit: Math.max(100, item.totalUnits),
                  })
                : { totalIssues: 0, issues: {} };
          if (Object.keys(payload.issues).length > 0) {
            const prog = stateRef.current.readProgress[item.id];
            const nextTotal =
              payload.totalIssues > 0
                ? isCollection
                  ? payload.totalIssues
                  : Math.max(payload.totalIssues, item.totalUnits)
                : item.totalUnits;
            const detailsKey = `${prog?.editionId || prog?.edition || 'default'}::${nextTotal}::${COMIC_ISSUE_CACHE_VERSION}`;
            updateReadIssueDetails(
              item.id,
              payload.issues,
              detailsKey,
              payload.totalIssues > 0 ? payload.totalIssues : undefined
            );
          }
        })
      );
    }

    // 2. Refresh airstamps for bookmarked unfinished shows with nearby episodes missing exact timestamps
    const now = new Date();
    const todayYmd = getTodayLocalYmd(now);
    const minDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
    const maxDt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);
    const minYmd = getTodayLocalYmd(minDt);
    const maxYmd = getTodayLocalYmd(maxDt);

    const showsNeedingStamp = snap.showOrder
      .map((id) => snap.shows[id])
      .filter((show): show is Show => {
        if (!show) return false;
        const prog = snap.showProgress[show.id];
        if (!prog?.bookmarked || prog.status === 'finished') return false;
        const counts = prog.episodeCounts || {};
        return getAllEpisodes(show).some((ep) => {
          if (ep.airstamp) return false;
          if ((counts[getEpisodeKey(ep.season, ep.number)] || 0) > 0) return false;
          if (!ep.airdate || !/^\d{4}-\d{2}-\d{2}/.test(ep.airdate)) return false;
          const ymd = ep.airdate.slice(0, 10);
          return ymd >= minYmd && ymd <= maxYmd && (ymd === todayYmd || show.tvmazeId !== undefined);
        });
      })
      .slice(0, 6);

    if (showsNeedingStamp.length > 0) {
      void Promise.allSettled(
        showsNeedingStamp.map(async (show) => {
          const freshEps = await fetchTvmazeEpisodeSchedule(show.tvmazeId, show.title);
          if (freshEps.length === 0) return;
          setState((prev) => {
            const cur = prev.shows[show.id];
            if (!cur) return prev;
            const seasonMatch = cur.title.match(/\bseason\s*(\d+)\b/i);
            const fallbackSeason = seasonMatch ? Number(seasonMatch[1]) : 1;
            const isSingleSeason = cur.seasons.length === 1 && cur.seasons[0].number === 1 && !cur.tvmazeId;

            const lookup = new Map<string, (typeof freshEps)[number]>();
            for (const f of freshEps) {
              lookup.set(`${f.season}-${f.number}`, f);
              if (isSingleSeason && f.season === fallbackSeason) {
                lookup.set(`1-${f.number}`, f);
              }
            }

            let changed = false;
            const nextSeasons = cur.seasons.map((s) => ({
              ...s,
              episodes: s.episodes.map((ep) => {
                const match = lookup.get(`${ep.season}-${ep.number}`);
                if (!match) return ep;
                const nextAirdate = match.airdate || ep.airdate;
                const nextAirstamp = match.airstamp || ep.airstamp;
                const nextTitle =
                  match.title && /^Episode \d+$/i.test(ep.title) ? match.title : ep.title;
                const nextOverview = !ep.overview && match.overview ? match.overview : ep.overview;
                if (
                  nextAirdate === ep.airdate &&
                  nextAirstamp === ep.airstamp &&
                  nextTitle === ep.title &&
                  nextOverview === ep.overview
                ) {
                  return ep;
                }
                changed = true;
                return {
                  ...ep,
                  airdate: nextAirdate,
                  ...(nextAirstamp ? { airstamp: nextAirstamp } : {}),
                  title: nextTitle,
                  overview: nextOverview,
                };
              }),
            }));

            if (!changed) return prev;
            return {
              ...prev,
              shows: {
                ...prev.shows,
                [show.id]: {
                  ...cur,
                  seasons: nextSeasons,
                },
              },
            };
          });
        })
      );
    }
  }, [updateReadIssueDetails]);

  const updateReadEditionCovers = useCallback(
    (
      readId: string,
      editionCovers: Partial<Record<ComicEditionId, string>>,
      cleanTitle?: string,
      editionIssueCounts?: Partial<Record<ComicEditionId, number>>,
      editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>
    ) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const nextTitle = cleanTitle || item.title;
        const spec = getKnownComicEditionSpec(nextTitle);
        const mergedCovers: Partial<Record<ComicEditionId, string>> = {
          ...(item.editionCovers || {}),
          ...editionCovers,
          ...(spec?.covers || {}),
        };
        if (mergedCovers.absolute && !mergedCovers.hardcover) {
          mergedCovers.hardcover = mergedCovers.absolute;
        }
        delete mergedCovers.absolute;
        const mergedCounts: Partial<Record<ComicEditionId, number>> = {
          ...(item.editionIssueCounts || {}),
          ...(editionIssueCounts || {}),
          ...(spec?.counts || {}),
        };
        if (mergedCounts.absolute && !mergedCounts.hardcover) {
          mergedCounts.hardcover = mergedCounts.absolute;
        }
        delete mergedCounts.absolute;
        const mergedVariants: Partial<Record<GeneralizedComicEditionId, string[]>> = {
          ...(item.editionVariants || {}),
          ...(editionVariants || {}),
        };
        if (spec) {
          const allowed = new Set<ComicEditionId>(spec.availableEditions);
          for (const k of Object.keys(mergedCovers) as ComicEditionId[]) {
            if (!allowed.has(k)) delete mergedCovers[k];
          }
          for (const k of Object.keys(mergedCounts) as ComicEditionId[]) {
            if (!allowed.has(k)) delete mergedCounts[k];
          }
          for (const k of Object.keys(mergedVariants) as GeneralizedComicEditionId[]) {
            if (!allowed.has(k)) delete mergedVariants[k];
          }
        }
        const existingProg = prev.readProgress[readId];
        const normalizedActive = normalizeComicEditionId(existingProg?.edition);
        const safeActiveEdition =
          normalizedActive && spec && !spec.availableEditions.includes(normalizedActive)
            ? spec.availableEditions[0]
            : normalizedActive;
        const tempItem: ReadItem = {
          ...item,
          title: nextTitle,
          editionCovers: mergedCovers,
          editionIssueCounts: mergedCounts,
          editionVariants: mergedVariants,
        };
        const resolvedTotal = existingProg?.editionId
          ? item.totalUnits
          : safeActiveEdition
            ? resolveComicEditionTotal(tempItem, safeActiveEdition)
            : !item.editionIssueCounts && mergedCounts.digital && item.totalUnits === 12
              ? mergedCounts.digital
              : item.totalUnits;
        const updatedItem: ReadItem = {
          ...tempItem,
          baseTotalUnits: item.baseTotalUnits ?? resolvedTotal,
          totalUnits: resolvedTotal,
        };
        const nextCover = resolveComicEditionCover(updatedItem, safeActiveEdition, existingProg);
        const nextHistory = (prev.history || []).map((h) =>
          h.domain === 'read' && h.mediaId === readId
            ? { ...h, title: nextTitle, posterUrl: nextCover }
            : h
        );
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: updatedItem,
          },
          readProgress: existingProg
            ? {
                ...prev.readProgress,
                [readId]: normalizeReadProgress(
                  updatedItem,
                  existingProg.currentUnit,
                  {
                    ...existingProg,
                    edition: safeActiveEdition,
                  },
                  existingProg.completedUnits
                ),
              }
            : prev.readProgress,
          history: nextHistory,
        };
      });
    },
    []
  );

  const updateReadFormat = useCallback(
    (readId: string, format: ReadItem['format']) => {
      let movedTitle = '';
      commitState((prev) => {
        const item = prev.readItems[readId];
        if (!item || item.format === format) return prev;
        movedTitle = item.title;
        const nextUnit = format === 'comic' ? 'issues' : 'chapters';
        const formatGenre = format === 'comic' ? 'Comics' : format === 'manga' ? 'Manga' : 'Fiction';
        const filteredGenres = item.genres.filter(
          (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
        );
        const updatedItem: ReadItem = {
          ...item,
          format,
          unit: nextUnit,
          genres: [formatGenre, ...filteredGenres],
        };
        return {
          ...prev,
          readItems: {
            ...prev.readItems,
            [readId]: updatedItem,
          },
        };
      });
      if (movedTitle) {
        const label = format === 'comic' ? 'Comics' : format === 'manga' ? 'Manga' : 'Novels';
        showToast(`Moved "${movedTitle}" to ${label}`);
      }
    },
    [showToast]
  );

  const resetReadProgress = useCallback(
    (readId: string) => {
      commitState((prev) => {
        const item = prev.readItems[readId];
        const existing = prev.readProgress[readId];
        const prevUnits = item ? getCompletedReadUnits(item, existing) : [];
        const rawNextState: CueStoreState = {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              ...(existing || {}),
              status: 'want_to_read',
              currentUnit: 0,
              completedUnits: [],
              maxCompletedUnit: 0,
              rereadCount: 0,
              bookmarked: existing?.bookmarked ?? true,
              edition: existing?.edition,
              finishedAt: undefined,
            },
          },
        };
        return applyReadAtomicSync(rawNextState, readId, prevUnits, []).state;
      });
      showToast('Reset reading progress');
    },
    [showToast]
  );

  // Play actions
  const formatGameChapterCode = (chapter: number, unit: GameChapterUnit = 'chapters'): string => {
    if (unit === 'acts') return `Act ${chapter}`;
    if (unit === 'missions') return `Mission ${chapter}`;
    if (unit === 'milestones') return `Milestone ${chapter}`;
    return `Ch. ${chapter}`;
  };

  const applyGameChapter = (
    game: GameItem,
    existing: CueStoreState['gameProgress'][string] | undefined,
    rawChapter: number
  ): CueStoreState['gameProgress'][string] => {
    const total = game.totalChapters && game.totalChapters > 0 ? game.totalChapters : undefined;
    const clamped = total
      ? Math.max(0, Math.min(total, Math.round(rawChapter)))
      : Math.max(0, Math.round(rawChapter));
    const nextPct = total
      ? Math.min(100, Math.round((clamped / total) * 100))
      : existing?.completionPct || 0;
    const isFinished = Boolean(total && clamped >= total);
    const nextStatus: GameWatchStatus = isFinished
      ? 'completed'
      : clamped > 0 || (existing?.hoursPlayed || 0) > 0
        ? 'playing'
        : 'backlog';
    const nowStamp = new Date().toISOString();
    const prevChapter = existing?.currentChapter || 0;
    const nextChapterDates = { ...(existing?.chapterFinishedAt || {}) };
    if (clamped > prevChapter) {
      for (let c = prevChapter + 1; c <= clamped; c += 1) {
        if (!nextChapterDates[c]) nextChapterDates[c] = nowStamp;
      }
    } else if (clamped < prevChapter) {
      for (let c = clamped + 1; c <= prevChapter; c += 1) {
        delete nextChapterDates[c];
      }
    }
    return {
      ...(existing || {}),
      status: nextStatus,
      hoursPlayed: existing?.hoursPlayed || 0,
      completionPct: nextPct,
      currentChapter: clamped,
      chapterFinishedAt: nextChapterDates,
      playthroughCount: isFinished
        ? Math.max(1, existing?.playthroughCount || 0)
        : existing?.playthroughCount || 0,
      platinum: existing?.platinum ?? false,
      platform: existing?.platform || game.platforms[0] || 'PC',
      bookmarked: existing?.bookmarked ?? true,
      lastPlayedAt: nowStamp,
      finishedAt: isFinished ? existing?.finishedAt || nowStamp : undefined,
    };
  };

  const advanceGameChapter = useCallback(
    (gameId: string, delta = 1) => {
      let toastMsg = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameCover = game.coverUrl;
        const prog = prev.gameProgress[gameId];
        const nextVal = (prog?.currentChapter || 0) + delta;
        const updated = applyGameChapter(game, prog, nextVal);
        const unit = game.chapterUnit || 'chapters';
        const codeLabel = formatGameChapterCode(updated.currentChapter || 0, unit);
        const activePlatform = updated.platform;
        const nextHistory =
          delta > 0 && (updated.currentChapter || 0) > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'play',
                mediaKind: 'game',
                mediaId: gameId,
                title: game.title,
                posterUrl: game.coverUrl,
                codeLabel,
                subtitle: formatGameMeta(
                  game,
                  { platform: activePlatform, hoursPlayed: 0 },
                  { includeHours: false }
                ),
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        const nextState: CueStoreState = {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: updated,
          },
          history: nextHistory,
        };
        if (updated.status === 'completed' && prog?.status !== 'completed') {
          const matchingLists = prev.lists.filter((l) =>
            l.items.some((it) => it.kind === 'game' && it.id === gameId)
          );
          const completedList = matchingLists.find((l) => {
            const wasDone = evaluateCustomListProgress(l, prev).isComplete;
            const nowDone = evaluateCustomListProgress(l, nextState).isComplete;
            return !wasDone && nowDone;
          });
          toastMsg = completedList
            ? `Completed ${game.title} · Finishes "${completedList.name}"!`
            : `Completed ${game.title}`;
        } else {
          toastMsg =
            updated.status === 'completed'
              ? `Completed ${game.title}`
              : `${game.title} · ${codeLabel}`;
        }
        return nextState;
      });
      if (toastMsg) {
        showToast(toastMsg, 'Log note', () => pushRoute({ view: 'game-detail', gameId }), {
          domain: 'play',
          posterUrl: gameCover,
        });
      }
    },
    [pushRoute, showToast]
  );

  const setGameChapter = useCallback(
    (gameId: string, chapter: number, opts?: { silent?: boolean }) => {
      let toastMsg = '';
      let toastSub = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameCover = game.coverUrl;
        const prog = prev.gameProgress[gameId];
        const prevChapter = prog?.currentChapter || 0;
        const updated = applyGameChapter(game, prog, chapter);
        const nextChapter = updated.currentChapter || 0;
        const unit = game.chapterUnit || 'chapters';
        const codeLabel = formatGameChapterCode(nextChapter, unit);
        let nextHistory = prev.history || [];

        if (!opts?.silent && nextChapter > prevChapter) {
          toastMsg = game.title;
          toastSub =
            updated.status === 'completed' ? `Completed · ${codeLabel}` : `Logged ${codeLabel}`;
          nextHistory = appendHistory(nextHistory, {
            id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: 'play',
            mediaKind: 'game',
            mediaId: gameId,
            title: game.title,
            posterUrl: game.coverUrl,
            codeLabel,
            subtitle: formatGameMeta(
              game,
              { platform: updated.platform, hoursPlayed: 0 },
              { includeHours: false }
            ),
            loggedAt: new Date().toISOString(),
          });
        }

        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: updated,
          },
          history: nextHistory,
        };
      });
      if (toastMsg) {
        showToast(toastMsg, undefined, undefined, {
          domain: 'play',
          subtitle: toastSub,
          posterUrl: gameCover,
        });
      }
    },
    [showToast]
  );

  const updateGameMetadata = useCallback(
    (
      gameId: string,
      patch: Partial<
        Pick<
          GameItem,
          | 'title'
          | 'developer'
          | 'year'
          | 'coverUrl'
          | 'backdropUrl'
          | 'overview'
          | 'genres'
          | 'platforms'
          | 'igdbId'
          | 'steamAppId'
          | 'franchise'
          | 'rating'
          | 'totalChapters'
          | 'chapterUnit'
          | 'chapterSource'
          | 'chapterNote'
        >
      >
    ) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const cleanCover = patch.coverUrl !== undefined ? patch.coverUrl.trim() : game.coverUrl;
        const nextBackdrop =
          patch.backdropUrl !== undefined
            ? patch.backdropUrl.trim()
            : patch.coverUrl !== undefined && (!game.backdropUrl || game.backdropUrl === game.coverUrl)
              ? cleanCover
              : game.backdropUrl;
        const safeChapters =
          typeof patch.totalChapters === 'number' &&
          Number.isFinite(patch.totalChapters) &&
          patch.totalChapters > 0
            ? Math.max(1, Math.min(1000, Math.round(patch.totalChapters)))
            : game.totalChapters;

        return {
          ...prev,
          games: {
            ...prev.games,
            [gameId]: {
              ...game,
              ...(patch.title?.trim() ? { title: patch.title.trim() } : {}),
              ...(patch.developer?.trim() ? { developer: patch.developer.trim() } : {}),
              ...(typeof patch.year === 'number' && Number.isFinite(patch.year)
                ? { year: Math.round(patch.year) }
                : {}),
              coverUrl: cleanCover,
              backdropUrl: nextBackdrop,
              ...(patch.overview?.trim() ? { overview: patch.overview.trim() } : {}),
              ...(patch.genres?.length ? { genres: patch.genres } : {}),
              ...(patch.platforms?.length ? { platforms: patch.platforms } : {}),
              ...(patch.igdbId ? { igdbId: patch.igdbId } : {}),
              ...(patch.steamAppId ? { steamAppId: patch.steamAppId } : {}),
              ...(patch.franchise ? { franchise: patch.franchise } : {}),
              ...(typeof patch.rating === 'number' && patch.rating > 0
                ? { rating: patch.rating }
                : {}),
              ...(safeChapters ? { totalChapters: safeChapters } : {}),
              ...(patch.chapterUnit ? { chapterUnit: patch.chapterUnit } : {}),
              ...(patch.chapterSource ? { chapterSource: patch.chapterSource } : {}),
              ...(patch.chapterNote !== undefined ? { chapterNote: patch.chapterNote } : {}),
            },
          },
        };
      });
    },
    []
  );

  const updateGameChaptersMeta = useCallback(
    (
      gameId: string,
      totalChapters: number,
      unit: GameChapterUnit = 'chapters',
      source: GameChapterSource = 'manual',
      note?: string
    ) => {
      const safeTotal = Math.max(1, Math.min(200, Math.round(totalChapters)));
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        if (source !== 'manual' && game.chapterSource === 'manual') {
          return prev;
        }
        const updatedGame: GameItem = {
          ...game,
          totalChapters: safeTotal,
          chapterUnit: unit,
          chapterSource: source,
          chapterNote: note,
        };
        const existingProg = prev.gameProgress[gameId];
        const nextProg =
          existingProg && typeof existingProg.currentChapter === 'number' && existingProg.currentChapter > 0
            ? applyGameChapter(updatedGame, existingProg, existingProg.currentChapter)
            : existingProg;
        return {
          ...prev,
          games: { ...prev.games, [gameId]: updatedGame },
          gameProgress: nextProg
            ? { ...prev.gameProgress, [gameId]: nextProg }
            : prev.gameProgress,
        };
      });
    },
    []
  );

  const applyGameChapterList = useCallback(
    (
      gameId: string,
      chapters: string[],
      unit: GameChapterUnit = 'chapters',
      source: GameChapterSource = 'web',
      note?: string
    ) => {
      const cleanList = chapters.map((c) => c.trim()).filter(Boolean).slice(0, 120);
      if (cleanList.length === 0) return;
      let gameTitle = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameTitle = game.title;
        gameCover = game.coverUrl;
        const safeTotal = cleanList.length;
        const updatedGame: GameItem = {
          ...game,
          totalChapters: safeTotal,
          chapterUnit: unit,
          chapterSource: source,
          chapterNote: note || `${safeTotal} ${unit}`,
        };
        const chapterTitles: Record<number, string> = {};
        cleanList.forEach((t, idx) => {
          chapterTitles[idx + 1] = t;
        });
        const existingProg = prev.gameProgress[gameId];
        const prevChapter = Math.min(safeTotal, existingProg?.currentChapter || 0);
        const baseProg: CueStoreState['gameProgress'][string] = {
          ...(existingProg || {}),
          status: existingProg?.status || (prevChapter > 0 ? 'playing' : 'backlog'),
          hoursPlayed: existingProg?.hoursPlayed || 0,
          completionPct: existingProg?.completionPct || 0,
          playthroughCount: existingProg?.playthroughCount || 0,
          platinum: existingProg?.platinum ?? false,
          platform: existingProg?.platform || game.platforms[0] || 'PC',
          bookmarked: existingProg?.bookmarked ?? true,
          chapterTitles,
        };
        const nextProg =
          baseProg.status === 'completed' || prevChapter > 0
            ? applyGameChapter(
                updatedGame,
                baseProg,
                baseProg.status === 'completed' ? safeTotal : prevChapter
              )
            : baseProg;
        return {
          ...prev,
          games: { ...prev.games, [gameId]: updatedGame },
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: nextProg,
          },
        };
      });
      if (gameTitle) {
        showToast(gameTitle, undefined, undefined, {
          domain: 'play',
          subtitle: `Added ${cleanList.length} ${unit}`,
          posterUrl: gameCover,
        });
      }
    },
    [showToast]
  );

  const logGameSession = useCallback(
    (gameId: string, hoursDelta: number) => {
      let label = '';
      let gameCover = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        gameCover = game.coverUrl;
        const prog = prev.gameProgress[gameId];
        const nextHours = Math.max(0, Math.round(((prog?.hoursPlayed || 0) + hoursDelta) * 10) / 10);
        const nextPct =
          prog?.status === 'completed'
            ? prog.completionPct
            : Math.min(100, (prog?.completionPct || 0) + (hoursDelta > 0 ? 5 : 0));
        label = `${game.title} · ${nextHours}h logged`;
        const activePlatform = prog?.platform || game.platforms[0] || 'PC';
        const nextHistory =
          hoursDelta > 0
            ? appendHistory(prev.history || [], {
                id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'play',
                mediaKind: 'game',
                mediaId: gameId,
                title: game.title,
                posterUrl: game.coverUrl,
                codeLabel: `+${hoursDelta}h · ${nextHours}h`,
                subtitle: formatGameMeta(
                  game,
                  { platform: activePlatform, hoursPlayed: 0 },
                  { includeHours: false }
                ),
                loggedAt: new Date().toISOString(),
              })
            : prev.history;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(prog || {}),
              status: prog?.status === 'completed' ? 'completed' : nextHours > 0 ? 'playing' : 'backlog',
              hoursPlayed: nextHours,
              completionPct: nextPct,
              playthroughCount: prog?.playthroughCount || 0,
              platinum: prog?.platinum ?? false,
              platform: activePlatform,
              bookmarked: prog?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
          history: nextHistory,
        };
      });
      if (label) {
        showToast(label, 'Log note', () => pushRoute({ view: 'game-detail', gameId }), {
          domain: 'play',
          posterUrl: gameCover,
        });
      }
    },
    [pushRoute, showToast]
  );

  const updateGameProgress = useCallback(
    (
      gameId: string,
      patch: Partial<{
        status: GameWatchStatus;
        hoursPlayed: number;
        completionPct: number;
        platform: GamePlatform;
      }>
    ) => {
      let statusToast: { title: string; subtitle: string; coverUrl: string } | null = null;
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextStatus = patch.status ?? existing?.status ?? 'playing';
        const nextPct = patch.completionPct ?? existing?.completionPct ?? 0;
        const nextPlaythroughs =
          nextStatus === 'completed'
            ? Math.max(1, existing?.playthroughCount || 0)
            : existing?.playthroughCount || 0;
        if (patch.status && patch.status !== existing?.status) {
          const labelMap: Record<GameWatchStatus, string> = {
            playing: 'Moved to Playing',
            backlog: 'Moved to Backlog',
            completed: 'Marked Completed',
            dropped: 'Moved to Dropped',
          };
          statusToast = {
            title: game.title,
            subtitle: labelMap[patch.status],
            coverUrl: game.coverUrl,
          };
        }
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextStatus,
              hoursPlayed: patch.hoursPlayed ?? existing?.hoursPlayed ?? 0,
              completionPct: nextPct,
              playthroughCount: nextPlaythroughs,
              platinum: existing?.platinum ?? false,
              platform: patch.platform ?? existing?.platform ?? game.platforms[0] ?? 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              finishedAt:
                nextStatus === 'completed'
                  ? existing?.finishedAt || new Date().toISOString()
                  : undefined,
            },
          },
        };
      });
      if (statusToast) {
        const { title, subtitle, coverUrl } = statusToast as {
          title: string;
          subtitle: string;
          coverUrl: string;
        };
        showToast(title, undefined, undefined, {
          domain: 'play',
          subtitle,
          posterUrl: coverUrl,
        });
      }
    },
    [showToast]
  );

  const toggleGameCompleted = useCallback(
    (gameId: string) => {
      let msg = '';
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const wasDone = existing?.status === 'completed';
        const nextDone = !wasDone;
        msg = nextDone ? `Completed ${game.title}` : `Moved ${game.title} to Playing`;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextDone ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: nextDone ? Math.max(100, existing?.completionPct || 100) : existing?.completionPct || 50,
              currentChapter: nextDone && game.totalChapters ? game.totalChapters : existing?.currentChapter,
              playthroughCount: nextDone ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              finishedAt: nextDone
                ? existing?.finishedAt || new Date().toISOString()
                : undefined,
            },
          },
        };
      });
      if (msg) showToast(msg);
    },
    [showToast]
  );

  const toggleGamePlatinum = useCallback((gameId: string) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      const nextPlat = !(existing?.platinum ?? false);
      const nextStatus = nextPlat ? 'completed' : existing?.status || 'playing';
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            ...(existing || {}),
            status: nextStatus,
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: nextPlat ? 100 : existing?.completionPct || 0,
            currentChapter: nextPlat && game.totalChapters ? game.totalChapters : existing?.currentChapter,
            playthroughCount: nextPlat ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
            platinum: nextPlat,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            lastPlayedAt: new Date().toISOString(),
            finishedAt:
              nextStatus === 'completed'
                ? existing?.finishedAt || new Date().toISOString()
                : undefined,
          },
        },
      };
    });
  }, []);

  const incrementGamePlaythrough = useCallback(
    (gameId: string, delta: number) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextCount = Math.max(0, (existing?.playthroughCount || 0) + delta);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: nextCount > 0 ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 100,
              playthroughCount: nextCount,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
            },
          },
        };
      });
      if (delta > 0) showToast('Logged new playthrough');
    },
    [showToast]
  );

  const toggleGameBookmark = useCallback(
    (gameId: string) => {
      let added = true;
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'backlog',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: added,
            },
          },
        };
      });
      showToast(added ? 'Added to Play library' : 'Removed from Play library');
    },
    [showToast]
  );

  const rateGame = useCallback(
    (gameId: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        return recomputeAutoCollectionRatings({
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              rating,
              ratingSource: rating ? source : undefined,
            },
          },
        });
      });
    },
    []
  );

  const rateGameChapter = useCallback(
    (gameId: string, chapter: number, rating: number | undefined) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextRatings = { ...(existing?.chapterRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextRatings[chapter] = rating;
        } else {
          delete nextRatings[chapter];
        }
        const chapAvg = getGameChaptersAverage({
          ...(existing || {
            status: 'playing',
            hoursPlayed: 0,
            completionPct: 0,
            playthroughCount: 0,
            platinum: false,
            platform: game.platforms[0] || 'PC',
            bookmarked: true,
          }),
          chapterRatings: nextRatings,
        });
        const resolvedGameRating = applyAutoRating(
          existing?.rating,
          existing?.ratingSource,
          chapAvg?.avg ?? null
        );
        return recomputeAutoCollectionRatings({
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              chapterRatings: nextRatings,
              rating: resolvedGameRating.rating,
              ratingSource: resolvedGameRating.source,
            },
          },
        });
      });
    },
    []
  );

  const setGameChapterFinishedDate = useCallback(
    (gameId: string, chapter: number, dateYmd: string | undefined) => {
      const normalizedIso = toFinishedIso(dateYmd);
      let codeLabel = `Ch. ${chapter}`;
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const unit = game.chapterUnit || 'chapters';
        codeLabel = formatGameChapterCode(chapter, unit);
        const nextDates = { ...(existing?.chapterFinishedAt || {}) };

        let updatedProg: CueStoreState['gameProgress'][string] = {
          ...(existing || {}),
          status: existing?.status || 'playing',
          hoursPlayed: existing?.hoursPlayed || 0,
          completionPct: existing?.completionPct || 0,
          playthroughCount: existing?.playthroughCount || 0,
          platinum: existing?.platinum ?? false,
          platform: existing?.platform || game.platforms[0] || 'PC',
          bookmarked: existing?.bookmarked ?? true,
        };

        if (normalizedIso) {
          nextDates[chapter] = normalizedIso;
          if ((updatedProg.currentChapter || 0) < chapter) {
            updatedProg = applyGameChapter(game, { ...updatedProg, chapterFinishedAt: nextDates }, chapter);
          }
          updatedProg = {
            ...updatedProg,
            chapterFinishedAt: { ...(updatedProg.chapterFinishedAt || {}), [chapter]: normalizedIso },
          };
        } else {
          delete nextDates[chapter];
          updatedProg = {
            ...updatedProg,
            chapterFinishedAt: nextDates,
          };
        }

        let nextHistory = prev.history || [];
        if (normalizedIso) {
          let updatedHist = false;
          nextHistory = nextHistory.map((h) => {
            if (h.domain === 'play' && h.mediaId === gameId && h.codeLabel === codeLabel) {
              updatedHist = true;
              return { ...h, loggedAt: normalizedIso };
            }
            return h;
          });
          if (!updatedHist) {
            nextHistory = appendHistory(nextHistory, {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'play',
              mediaKind: 'game',
              mediaId: gameId,
              title: game.title,
              posterUrl: game.coverUrl,
              codeLabel,
              subtitle: formatGameMeta(
                game,
                { platform: updatedProg.platform, hoursPlayed: 0 },
                { includeHours: false }
              ),
              loggedAt: normalizedIso,
            });
          }
        }

        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: updatedProg,
          },
          history: nextHistory,
        };
      });
      showToast(normalizedIso ? `Updated ${codeLabel} date` : `Cleared ${codeLabel} date`);
    },
    [showToast]
  );

  const setGameChapterTitle = useCallback(
    (gameId: string, chapter: number, title: string) => {
      const cleanTitle = title.trim();
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextTitles = { ...(existing?.chapterTitles || {}) };
        if (!cleanTitle) {
          delete nextTitles[chapter];
        } else {
          nextTitles[chapter] = cleanTitle;
        }
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: existing?.status || 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              chapterTitles: nextTitles,
            },
          },
        };
      });
    },
    []
  );

  const setGameMood = useCallback((gameId: string, mood: PersonalMood | undefined) => {
    commitState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            ...(existing || {}),
            status: existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: existing?.completionPct || 0,
            playthroughCount: existing?.playthroughCount || 0,
            platinum: existing?.platinum ?? false,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            mood,
          },
        },
      };
    });
  }, []);

  const setMediaFinishedDate = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      dateValue: string | undefined
    ) => {
      const normalizedIso = dateValue?.trim()
        ? /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())
          ? `${dateValue.trim()}T12:00:00.000Z`
          : dateValue.trim()
        : undefined;
      const targetYmd = normalizedIso?.slice(0, 10);
      const domain: MediaDomain = kind === 'read' ? 'read' : kind === 'game' ? 'play' : 'watch';

      commitState((prev) => {
        const syncHistoryForFinishDate = (
          prevHistory: HistoryEntry[],
          title: string,
          posterUrl: string
        ): HistoryEntry[] => {
          if (!normalizedIso || !targetYmd) return prevHistory;
          let hasMatchOnTargetDay = false;
          const updated = prevHistory.map((h) => {
            if (h.domain !== domain || h.mediaId !== id) return h;
            const hYmd = h.loggedAt.slice(0, 10);
            const isFinishEntry = /^(?:Finished|Completed|Watched)$/i.test(h.codeLabel);
            if (isFinishEntry || hYmd > targetYmd) {
              hasMatchOnTargetDay = true;
              return { ...h, loggedAt: normalizedIso };
            }
            if (hYmd === targetYmd) {
              hasMatchOnTargetDay = true;
            }
            return h;
          });
          if (hasMatchOnTargetDay) return updated;
          return appendHistory(updated, {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain,
            mediaKind: kind,
            mediaId: id,
            title,
            posterUrl,
            codeLabel: kind === 'game' ? 'Completed' : kind === 'movie' ? 'Watched' : 'Finished',
            subtitle: 'Completion date set',
            loggedAt: normalizedIso,
          });
        };

        if (kind === 'show') {
          const prog = prev.showProgress[id];
          const show = prev.shows[id];
          if (!prog) return prev;
          const nextLastWatched =
            normalizedIso && prog.lastWatchedAt && prog.lastWatchedAt.slice(0, 10) > targetYmd!
              ? normalizedIso
              : prog.lastWatchedAt;
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: { ...prog, finishedAt: normalizedIso, lastWatchedAt: nextLastWatched },
            },
            history: syncHistoryForFinishDate(
              prev.history,
              show?.title || 'Series',
              show?.posterUrl || ''
            ),
          };
        }
        if (kind === 'movie') {
          const prog = prev.movieProgress[id];
          const movie = prev.movies[id];
          if (!prog) return prev;
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: { ...prog, watchedAt: normalizedIso },
            },
            history: syncHistoryForFinishDate(
              prev.history,
              movie?.title || 'Movie',
              movie?.posterUrl || ''
            ),
          };
        }
        if (kind === 'read') {
          const prog = prev.readProgress[id];
          const readItem = prev.readItems[id];
          if (!prog) return prev;
          const nextLastRead =
            normalizedIso && prog.lastReadAt && prog.lastReadAt.slice(0, 10) > targetYmd!
              ? normalizedIso
              : prog.lastReadAt;
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: { ...prog, finishedAt: normalizedIso, lastReadAt: nextLastRead },
            },
            history: syncHistoryForFinishDate(
              prev.history,
              readItem?.title || 'Book',
              readItem?.coverUrl || ''
            ),
          };
        }
        const prog = prev.gameProgress[id];
        const game = prev.games[id];
        if (!prog) return prev;
        const nextLastPlayed =
          normalizedIso && prog.lastPlayedAt && prog.lastPlayedAt.slice(0, 10) > targetYmd!
            ? normalizedIso
            : prog.lastPlayedAt;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: { ...prog, finishedAt: normalizedIso, lastPlayedAt: nextLastPlayed },
          },
          history: syncHistoryForFinishDate(
            prev.history,
            game?.title || 'Game',
            game?.coverUrl || ''
          ),
        };
      });
    },
    []
  );

  const resetGameProgress = useCallback(
    (gameId: string) => {
      commitState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              ...(existing || {}),
              status: 'backlog',
              hoursPlayed: 0,
              completionPct: 0,
              currentChapter: 0,
              playthroughCount: 0,
              platinum: false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
            },
          },
        };
      });
      showToast('Reset game progress');
    },
    [showToast]
  );

  // Collections & Cross-Media Lists
  const setMediaOwnership = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      ownership: OwnershipStatus | undefined
    ) => {
      commitState((prev) => {
        if (kind === 'show') {
          const existing = prev.showProgress[id];
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'not_started',
                episodeCounts: existing?.episodeCounts || {},
                bookmarked: existing?.bookmarked ?? true,
                notifications: existing?.notifications ?? true,
                ownership,
              },
            },
          };
        }
        if (kind === 'movie') {
          const existing = prev.movieProgress[id];
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'watchlist',
                watchCount: existing?.watchCount || 0,
                ownership,
              },
            },
          };
        }
        if (kind === 'read') {
          const existing = prev.readProgress[id];
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'want_to_read',
                currentUnit: existing?.currentUnit || 0,
                rereadCount: existing?.rereadCount || 0,
                bookmarked: existing?.bookmarked ?? true,
                ownership,
              },
            },
          };
        }
        const game = prev.games[id];
        const existing = prev.gameProgress[id];
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: {
              ...(existing || {}),
              status: existing?.status || 'backlog',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game?.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              ownership,
            },
          },
        };
      });
      showToast(
        ownership === 'owned'
          ? 'Added to collection'
          : ownership === 'wishlist'
            ? 'Added to wishlist'
            : 'Removed from collection'
      );
    },
    [showToast]
  );

  const updateMediaCollectionDetails = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      details: Partial<CollectionDetails>,
      ownershipOverride?: OwnershipStatus
    ) => {
      const cleanStr = (v: string | undefined) => {
        const t = v?.trim();
        return t ? t : undefined;
      };
      const sanitized: CollectionDetails = {
        format: cleanStr(details.format),
        acquiredAt: toFinishedIso(details.acquiredAt),
        price:
          typeof details.price === 'number' && Number.isFinite(details.price) && details.price >= 0
            ? details.price
            : undefined,
        currency: cleanStr(details.currency) || undefined,
        pages:
          typeof details.pages === 'number' && Number.isFinite(details.pages) && details.pages > 0
            ? Math.round(details.pages)
            : undefined,
        runtimeMinutes:
          typeof details.runtimeMinutes === 'number' &&
          Number.isFinite(details.runtimeMinutes) &&
          details.runtimeMinutes > 0
            ? Math.round(details.runtimeMinutes)
            : undefined,
        platform: cleanStr(details.platform),
        owner: cleanStr(details.owner),
        includes: cleanStr(details.includes),
        notes: cleanStr(details.notes),
      };

      commitState((prev) => {
        if (kind === 'show') {
          const existing = prev.showProgress[id];
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'not_started',
                episodeCounts: existing?.episodeCounts || {},
                bookmarked: existing?.bookmarked ?? true,
                notifications: existing?.notifications ?? true,
                ownership: ownershipOverride ?? existing?.ownership ?? 'owned',
                collection: { ...(existing?.collection || {}), ...sanitized },
              },
            },
          };
        }
        if (kind === 'movie') {
          const existing = prev.movieProgress[id];
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'watchlist',
                watchCount: existing?.watchCount || 0,
                ownership: ownershipOverride ?? existing?.ownership ?? 'owned',
                collection: { ...(existing?.collection || {}), ...sanitized },
              },
            },
          };
        }
        if (kind === 'read') {
          const existing = prev.readProgress[id];
          const nextCol = { ...(existing?.collection || {}), ...sanitized };
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: {
                ...(existing || {}),
                status: existing?.status || 'want_to_read',
                currentUnit: existing?.currentUnit || 0,
                rereadCount: existing?.rereadCount || 0,
                bookmarked: existing?.bookmarked ?? true,
                ownership: ownershipOverride ?? existing?.ownership ?? 'owned',
                collection: nextCol,
                collectionNote: nextCol.notes,
              },
            },
          };
        }
        const game = prev.games[id];
        const existing = prev.gameProgress[id];
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: {
              ...(existing || {}),
              status: existing?.status || 'backlog',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game?.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              ownership: ownershipOverride ?? existing?.ownership ?? 'owned',
              collection: { ...(existing?.collection || {}), ...sanitized },
            },
          },
        };
      });
      showToast('Saved collection details');
    },
    [showToast]
  );

  const rateCollection = useCallback(
    (collectionKey: string, rating: number | undefined, source: RatingSource = 'manual') => {
      commitState((prev) => {
        const nextMap = { ...(prev.collectionRatings || {}) };
        if (typeof rating === 'number' && rating > 0) {
          nextMap[collectionKey] = { rating, source };
        } else {
          delete nextMap[collectionKey];
        }
        return {
          ...prev,
          collectionRatings: nextMap,
        };
      });
    },
    []
  );

  const setCollectionFinishedDate = useCallback(
    (collectionKey: string, dateYmd: string | undefined) => {
      const normalizedIso = toFinishedIso(dateYmd);
      commitState((prev) => {
        const nextDates = { ...(prev.collectionFinishedAt || {}) };
        if (normalizedIso) {
          nextDates[collectionKey] = normalizedIso;
        } else {
          delete nextDates[collectionKey];
        }
        return {
          ...prev,
          collectionFinishedAt: nextDates,
        };
      });
      showToast(
        normalizedIso ? 'Updated collection finished date' : 'Cleared collection finished date'
      );
    },
    [showToast]
  );

  const toggleListPinnedToQueue = useCallback(
    (listId: string) => {
      let pinned = false;
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== listId) return l;
          pinned = !l.pinnedToQueue;
          return { ...l, pinnedToQueue: pinned };
        }),
      }));
      showToast(pinned ? 'Pinned run to Cue' : 'Unpinned from Cue');
    },
    [showToast]
  );

  const deleteCustomList = useCallback(
    (listId: string) => {
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.filter((l) => l.id !== listId),
      }));
      showToast('Deleted custom list');
    },
    [showToast]
  );

  // Live additions
  const addLiveShowToStore = useCallback(
    (show: Show, andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.shows[show.id]);
        const existingProgress = prev.showProgress[show.id];
        return {
          ...prev,
          shows: { ...prev.shows, [show.id]: show },
          showOrder: exists ? prev.showOrder : [show.id, ...prev.showOrder],
          showProgress: andBookmark
            ? {
                ...prev.showProgress,
                [show.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status: 'not_started',
                      episodeCounts: {},
                      bookmarked: true,
                      notifications: true,
                    },
              }
            : prev.showProgress,
        };
      });
      if (andBookmark) {
        showToast(show.title, undefined, undefined, {
          domain: 'watch',
          subtitle: 'Added to Watch',
          posterUrl: show.posterUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveMovieToStore = useCallback(
    (movie: Movie, status: MovieWatchStatus = 'watchlist', andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.movies[movie.id]);
        return {
          ...prev,
          movies: { ...prev.movies, [movie.id]: movie },
          movieOrder: exists ? prev.movieOrder : [movie.id, ...prev.movieOrder],
          movieProgress: andBookmark
            ? {
                ...prev.movieProgress,
                [movie.id]: prev.movieProgress[movie.id] || {
                  status,
                  watchCount: status === 'watched' ? 1 : 0,
                  watchedAt: status === 'watched' ? new Date().toISOString() : undefined,
                },
              }
            : prev.movieProgress,
        };
      });
      if (andBookmark) {
        showToast(movie.title, undefined, undefined, {
          domain: 'watch',
          subtitle: 'Added to Watch',
          posterUrl: movie.posterUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveReadToStore = useCallback(
    (item: ReadItem, status: ReadWatchStatus = 'want_to_read', andBookmark = true) => {
      commitState((prev) => {
        const exists = Boolean(prev.readItems[item.id]);
        const existingProgress = prev.readProgress[item.id];
        return {
          ...prev,
          readItems: { ...prev.readItems, [item.id]: item },
          readOrder: exists ? prev.readOrder : [item.id, ...prev.readOrder],
          readProgress: andBookmark
            ? {
                ...prev.readProgress,
                [item.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status,
                      currentUnit: 0,
                      rereadCount: 0,
                      bookmarked: true,
                    },
              }
            : prev.readProgress,
        };
      });
      if (andBookmark) {
        showToast(item.title, undefined, undefined, {
          domain: 'read',
          subtitle: 'Added to Read',
          posterUrl: item.coverUrl,
        });
      }
    },
    [showToast]
  );

  const addLiveGameToStore = useCallback(
    (game: GameItem, status: GameWatchStatus = 'backlog', andBookmark = true) => {
      const known = !game.totalChapters ? lookupKnownGameChapters(game.title) : null;
      const enrichedGame: GameItem = known
        ? {
            ...game,
            totalChapters: known.totalChapters,
            chapterUnit: known.unit,
            chapterSource: known.source,
            chapterNote: known.note,
          }
        : game;
      commitState((prev) => {
        const exists = Boolean(prev.games[enrichedGame.id]);
        const existingProgress = prev.gameProgress[enrichedGame.id];
        return {
          ...prev,
          games: { ...prev.games, [enrichedGame.id]: enrichedGame },
          gameOrder: exists ? prev.gameOrder : [enrichedGame.id, ...prev.gameOrder],
          gameProgress: andBookmark
            ? {
                ...prev.gameProgress,
                [enrichedGame.id]: existingProgress
                  ? { ...existingProgress, bookmarked: true }
                  : {
                      status,
                      hoursPlayed: 0,
                      completionPct: 0,
                      currentChapter: 0,
                      playthroughCount: 0,
                      platinum: false,
                      platform: enrichedGame.platforms[0] || 'PC',
                      bookmarked: true,
                    },
              }
            : prev.gameProgress,
        };
      });
      if (andBookmark) {
        showToast(enrichedGame.title, undefined, undefined, {
          domain: 'play',
          subtitle: 'Added to Play',
          posterUrl: enrichedGame.coverUrl,
        });
      }
    },
    [showToast]
  );

  const patchMediaMetadata = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      patch: {
        posterUrl?: string;
        backdropUrl?: string;
        coverUrl?: string;
        clearStaleIssues?: boolean;
      }
    ) => {
      commitState((prev) => {
        if (kind === 'show') {
          const s = prev.shows[id];
          if (!s) return prev;
          return {
            ...prev,
            shows: {
              ...prev.shows,
              [id]: {
                ...s,
                posterUrl: patch.posterUrl ?? s.posterUrl,
                backdropUrl: patch.backdropUrl ?? s.backdropUrl,
              },
            },
          };
        }
        if (kind === 'movie') {
          const m = prev.movies[id];
          if (!m) return prev;
          return {
            ...prev,
            movies: {
              ...prev.movies,
              [id]: {
                ...m,
                posterUrl: patch.posterUrl ?? m.posterUrl,
                backdropUrl: patch.backdropUrl ?? m.backdropUrl,
              },
            },
          };
        }
        if (kind === 'read') {
          const r = prev.readItems[id];
          if (!r) return prev;
          return {
            ...prev,
            readItems: {
              ...prev.readItems,
              [id]: {
                ...r,
                coverUrl: patch.coverUrl ?? r.coverUrl,
                backdropUrl: patch.backdropUrl ?? r.backdropUrl,
                ...(patch.clearStaleIssues
                  ? { issueDetails: undefined, issueDetailsKey: undefined }
                  : {}),
              },
            },
          };
        }
        const g = prev.games[id];
        if (!g) return prev;
        return {
          ...prev,
          games: {
            ...prev.games,
            [id]: {
              ...g,
              coverUrl: patch.coverUrl ?? g.coverUrl,
              backdropUrl: patch.backdropUrl ?? g.backdropUrl,
            },
          },
        };
      });
    },
    []
  );

  // Private Journal & Lists
  const addJournalEntry = useCallback(
    (input: Omit<JournalEntry, 'id' | 'createdAt'>) => {
      commitState((prev) => ({
        ...prev,
        journalEntries: [
          {
            ...input,
            id: `j-${Date.now()}`,
            createdAt: new Date().toISOString(),
          },
          ...prev.journalEntries,
        ],
      }));
      showToast('Saved to private journal');
    },
    [showToast]
  );

  const deleteJournalEntry = useCallback(
    (entryId: string) => {
      commitState((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.filter((j) => j.id !== entryId),
      }));
      showToast('Journal entry deleted');
    },
    [showToast]
  );

  const markAllNotificationsRead = useCallback(() => {
    commitState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const createCustomList = useCallback(
    (
      name: string,
      description: string,
      initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string },
      initialItems?: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>,
      options?: { isOrdered?: boolean; steps?: CustomListStep[] }
    ) => {
      const items =
        initialItems && initialItems.length > 0
          ? initialItems
          : initialItem
            ? [initialItem]
            : [];
      commitState((prev) =>
        recomputeAutoCollectionRatings({
          ...prev,
          lists: [
            {
              id: `list-${Date.now()}`,
              name: name.trim(),
              description: description.trim(),
              items,
              ...(options?.isOrdered ? { isOrdered: true } : {}),
              ...(options?.steps ? { steps: options.steps } : {}),
              createdAt: new Date().toISOString(),
            },
            ...prev.lists,
          ],
        })
      );
      showToast(`Created list "${name.trim()}"`);
    },
    [showToast]
  );

  const buildRunIso = (dateYmd: string): string => {
    const trimmed = dateYmd.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00.000Z` : trimmed;
  };

  const addCompletionRun = useCallback(
    (
      kind: 'show' | 'movie' | 'read' | 'game',
      id: string,
      dateYmd: string,
      note?: string
    ) => {
      const runIso = buildRunIso(dateYmd);
      const cleanNote = note?.trim() || undefined;
      commitState((prev) => {
        const makeNewRun = (): CompletionRun => ({
          id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          finishedAt: runIso,
          ...(cleanNote ? { note: cleanNote } : {}),
        });
        const mergeRuns = (existingRuns: CompletionRun[] | undefined, baseFinish?: string): CompletionRun[] => {
          const seeded =
            existingRuns && existingRuns.length > 0
              ? [...existingRuns]
              : baseFinish
                ? [{ id: `run-initial`, finishedAt: baseFinish }]
                : [];
          return [...seeded, makeNewRun()].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
        };

        if (kind === 'show') {
          const prog = prev.showProgress[id];
          const show = prev.shows[id];
          if (!prog) return prev;
          const nextRuns = mergeRuns(prog.completedRuns, prog.finishedAt || prog.lastWatchedAt);
          const latestFinish = nextRuns[nextRuns.length - 1]?.finishedAt || runIso;
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: {
                ...prog,
                status: 'finished',
                finishedAt: latestFinish,
                completedRuns: nextRuns,
              },
            },
            history: appendHistory(prev.history, {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: id,
              title: show?.title || 'Series',
              posterUrl: show?.posterUrl || '',
              codeLabel: `Run #${nextRuns.length}`,
              subtitle: cleanNote || 'Rewatch logged',
              loggedAt: runIso,
            }),
          };
        }
        if (kind === 'movie') {
          const prog = prev.movieProgress[id];
          const movie = prev.movies[id];
          if (!prog) return prev;
          const nextRuns = mergeRuns(prog.completedRuns, prog.watchedAt);
          const latestFinish = nextRuns[nextRuns.length - 1]?.finishedAt || runIso;
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: {
                ...prog,
                status: 'watched',
                watchCount: Math.max(prog.watchCount || 1, nextRuns.length),
                watchedAt: latestFinish,
                completedRuns: nextRuns,
              },
            },
            history: appendHistory(prev.history, {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'watch',
              mediaKind: 'movie',
              mediaId: id,
              title: movie?.title || 'Movie',
              posterUrl: movie?.posterUrl || '',
              codeLabel: `Run #${nextRuns.length}`,
              subtitle: cleanNote || 'Rewatch logged',
              loggedAt: runIso,
            }),
          };
        }
        if (kind === 'read') {
          const prog = prev.readProgress[id];
          const item = prev.readItems[id];
          if (!prog) return prev;
          const nextRuns = mergeRuns(prog.completedRuns, prog.finishedAt || prog.lastReadAt);
          const latestFinish = nextRuns[nextRuns.length - 1]?.finishedAt || runIso;
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: {
                ...prog,
                status: 'finished',
                rereadCount: Math.max(prog.rereadCount || 1, nextRuns.length),
                finishedAt: latestFinish,
                completedRuns: nextRuns,
              },
            },
            history: appendHistory(prev.history, {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: id,
              title: item?.title || 'Book',
              posterUrl: item?.coverUrl || '',
              codeLabel: `Run #${nextRuns.length}`,
              subtitle: cleanNote || 'Reread logged',
              loggedAt: runIso,
            }),
          };
        }
        const prog = prev.gameProgress[id];
        const game = prev.games[id];
        if (!prog) return prev;
        const nextRuns = mergeRuns(prog.completedRuns, prog.finishedAt || prog.lastPlayedAt);
        const latestFinish = nextRuns[nextRuns.length - 1]?.finishedAt || runIso;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: {
              ...prog,
              status: 'completed',
              playthroughCount: Math.max(prog.playthroughCount || 1, nextRuns.length),
              finishedAt: latestFinish,
              completedRuns: nextRuns,
            },
          },
          history: appendHistory(prev.history, {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            domain: 'play',
            mediaKind: 'game',
            mediaId: id,
            title: game?.title || 'Game',
            posterUrl: game?.coverUrl || '',
            codeLabel: `Run #${nextRuns.length}`,
            subtitle: cleanNote || 'Replay logged',
            loggedAt: runIso,
          }),
        };
      });
      showToast('Completion run logged');
    },
    [showToast]
  );

  const updateCompletionRunDate = useCallback(
    (kind: 'show' | 'movie' | 'read' | 'game', id: string, runId: string, dateYmd: string) => {
      const runIso = buildRunIso(dateYmd);
      commitState((prev) => {
        const updateList = (runs: CompletionRun[] | undefined) =>
          (runs || [])
            .map((r) => (r.id === runId ? { ...r, finishedAt: runIso } : r))
            .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));

        if (kind === 'show') {
          const prog = prev.showProgress[id];
          if (!prog) return prev;
          const nextRuns = updateList(prog.completedRuns);
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns,
                finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
              },
            },
          };
        }
        if (kind === 'movie') {
          const prog = prev.movieProgress[id];
          if (!prog) return prev;
          const nextRuns = updateList(prog.completedRuns);
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns,
                watchedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.watchedAt,
              },
            },
          };
        }
        if (kind === 'read') {
          const prog = prev.readProgress[id];
          if (!prog) return prev;
          const nextRuns = updateList(prog.completedRuns);
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns,
                finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
              },
            },
          };
        }
        const prog = prev.gameProgress[id];
        if (!prog) return prev;
        const nextRuns = updateList(prog.completedRuns);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: {
              ...prog,
              completedRuns: nextRuns,
              finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
            },
          },
        };
      });
    },
    []
  );

  const deleteCompletionRun = useCallback(
    (kind: 'show' | 'movie' | 'read' | 'game', id: string, runId: string) => {
      commitState((prev) => {
        const prune = (runs: CompletionRun[] | undefined) => (runs || []).filter((r) => r.id !== runId);
        if (kind === 'show') {
          const prog = prev.showProgress[id];
          if (!prog) return prev;
          const nextRuns = prune(prog.completedRuns);
          return {
            ...prev,
            showProgress: {
              ...prev.showProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns.length > 0 ? nextRuns : undefined,
                finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
              },
            },
          };
        }
        if (kind === 'movie') {
          const prog = prev.movieProgress[id];
          if (!prog) return prev;
          const nextRuns = prune(prog.completedRuns);
          return {
            ...prev,
            movieProgress: {
              ...prev.movieProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns.length > 0 ? nextRuns : undefined,
                watchCount: nextRuns.length > 0 ? nextRuns.length : prog.watchCount,
                watchedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.watchedAt,
              },
            },
          };
        }
        if (kind === 'read') {
          const prog = prev.readProgress[id];
          if (!prog) return prev;
          const nextRuns = prune(prog.completedRuns);
          return {
            ...prev,
            readProgress: {
              ...prev.readProgress,
              [id]: {
                ...prog,
                completedRuns: nextRuns.length > 0 ? nextRuns : undefined,
                rereadCount: nextRuns.length > 0 ? nextRuns.length : prog.rereadCount,
                finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
              },
            },
          };
        }
        const prog = prev.gameProgress[id];
        if (!prog) return prev;
        const nextRuns = prune(prog.completedRuns);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [id]: {
              ...prog,
              completedRuns: nextRuns.length > 0 ? nextRuns : undefined,
              playthroughCount: nextRuns.length > 0 ? nextRuns.length : prog.playthroughCount,
              finishedAt: nextRuns[nextRuns.length - 1]?.finishedAt || prog.finishedAt,
            },
          },
        };
      });
    },
    []
  );

  const createCuratedReadingOrder = useCallback(
    (templateId: 'hox-pox' | 'secret-wars-2015' | 'annihilation') => {
      const id = `list-ro-${templateId}-${Date.now()}`;
      const makeStep = (seriesTitle: string, volNum: number, issueNum: number): CustomListStep => ({
        id: `step-${seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}-${volNum}-${issueNum}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${seriesTitle} #${issueNum}`,
        seriesTitle,
        issueNumber: issueNum,
        atomicId: makeComicAtomicId('marvel', `${seriesTitle} Vol ${volNum} ${issueNum}`),
      });

      const preset =
        templateId === 'hox-pox'
          ? {
              name: 'House of X / Powers of X',
              description: 'Jonathan Hickman chronological Krakoa launch reading order',
              steps: [
                makeStep('House of X', 1, 1),
                makeStep('Powers of X', 1, 1),
                makeStep('House of X', 1, 2),
                makeStep('Powers of X', 1, 2),
                makeStep('Powers of X', 1, 3),
                makeStep('House of X', 1, 3),
                makeStep('House of X', 1, 4),
                makeStep('Powers of X', 1, 4),
                makeStep('House of X', 1, 5),
                makeStep('Powers of X', 1, 5),
                makeStep('House of X', 1, 6),
                makeStep('Powers of X', 1, 6),
              ],
            }
          : templateId === 'secret-wars-2015'
            ? {
                name: 'Secret Wars (2015)',
                description: 'Battleworld core event & Prelude chronological reading order',
                steps: [
                  makeStep('Avengers', 5, 43),
                  makeStep('New Avengers', 3, 33),
                  makeStep('Avengers', 5, 44),
                  makeStep('Secret Wars', 2, 1),
                  makeStep('Secret Wars', 2, 2),
                  makeStep('Secret Wars', 2, 3),
                  makeStep('Secret Wars', 2, 4),
                  makeStep('Secret Wars', 2, 5),
                  makeStep('Secret Wars', 2, 6),
                  makeStep('Secret Wars', 2, 7),
                  makeStep('Secret Wars', 2, 8),
                  makeStep('Secret Wars', 2, 9),
                ],
              }
            : {
                name: 'Annihilation Cosmic Saga',
                description: 'Dan Abnett & Keith Giffen cosmic Marvel reading order',
                steps: [
                  makeStep('Annihilation: Prologue', 1, 1),
                  makeStep('Annihilation: Nova', 1, 1),
                  makeStep('Annihilation: Nova', 1, 2),
                  makeStep('Annihilation: Silver Surfer', 1, 1),
                  makeStep('Annihilation: Super-Skrull', 1, 1),
                  makeStep('Annihilation', 1, 1),
                  makeStep('Annihilation', 1, 2),
                  makeStep('Annihilation', 1, 3),
                  makeStep('Annihilation', 1, 4),
                  makeStep('Annihilation', 1, 5),
                  makeStep('Annihilation', 1, 6),
                ],
              };

      commitState((prev) => ({
        ...prev,
        lists: [
          {
            id,
            name: preset.name,
            description: preset.description,
            items: [],
            isOrdered: true,
            steps: preset.steps,
            createdAt: new Date().toISOString(),
          },
          ...prev.lists,
        ],
      }));
      showToast(`Created "${preset.name}" reading order`);
      return id;
    },
    [showToast]
  );

  const reorderListItem = useCallback(
    (
      listId: string,
      fromIndex: number,
      toIndex: number,
      target: 'items' | 'steps' = 'items'
    ) => {
      if (fromIndex === toIndex) return;
      commitState((prev) => ({
        ...prev,
        lists: prev.lists.map((l) => {
          if (l.id !== listId) return l;
          if (target === 'steps') {
            const arr = [...(l.steps || [])];
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= arr.length || toIndex >= arr.length) return l;
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, moved);
            return { ...l, isOrdered: true, steps: arr };
          }
          const arr = [...l.items];
          if (fromIndex < 0 || toIndex < 0 || fromIndex >= arr.length || toIndex >= arr.length) return l;
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(toIndex, 0, moved);
          return { ...l, isOrdered: true, items: arr };
        }),
      }));
    },
    []
  );

  const addReadingOrderStep = useCallback(
    (listId: string, seriesTitle: string, issueNumber: number) => {
      const cleanSeries = seriesTitle.trim();
      const num = Math.max(1, Math.round(issueNumber));
      if (!cleanSeries) return;
      commitState((prev) => {
        const matchedRead = prev.readOrder
          .map((id) => prev.readItems[id])
          .find((r) => r && r.title.toLowerCase().includes(cleanSeries.toLowerCase()));
        const wiki = matchedRead?.comicSeriesWiki || 'marvel';
        const volStr = matchedRead?.comicSeriesVolTitle
          ? `${matchedRead.comicSeriesVolTitle} ${num}`
          : `${cleanSeries} Vol 1 ${num}`;
        const step: CustomListStep = {
          id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: `${cleanSeries} #${num}`,
          seriesTitle: cleanSeries,
          issueNumber: num,
          atomicId: makeComicAtomicId(wiki, volStr),
          ...(matchedRead ? { readItemId: matchedRead.id } : {}),
        };
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId
              ? { ...l, isOrdered: true, steps: [...(l.steps || []), step] }
              : l
          ),
        };
      });
      showToast(`Added ${cleanSeries} #${num}`);
    },
    [showToast]
  );

  const removeReadingOrderStep = useCallback((listId: string, stepId: string) => {
    commitState((prev) => ({
      ...prev,
      lists: prev.lists.map((l) =>
        l.id === listId
          ? { ...l, steps: (l.steps || []).filter((s) => s.id !== stepId) }
          : l
      ),
    }));
  }, []);

  const toggleReadingOrderStep = useCallback(
    (listId: string, stepId: string) => {
      const nowIso = new Date().toISOString();
      let toggledLabel = '';
      let nextCompleted = false;
      commitState((prev) => {
        const list = prev.lists.find((l) => l.id === listId);
        const step = list?.steps?.find((s) => s.id === stepId);
        if (!step) return prev;
        toggledLabel = step.title;
        const wasDone = (prev.atomicReadUnits?.[step.atomicId]?.count || 0) > 0;
        nextCompleted = !wasDone;
        const synced = syncAtomicReadUnitsAcrossState(
          prev,
          '',
          [
            {
              atomicId: step.atomicId,
              completed: nextCompleted,
              seriesTitle: step.seriesTitle,
              issueLabel: `#${step.issueNumber}`,
            },
          ],
          [],
          nowIso
        );
        return {
          ...prev,
          atomicReadUnits: synced.atomicReadUnits,
          readProgress: synced.readProgress,
          history: nextCompleted
            ? appendHistory(prev.history, {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                domain: 'read',
                mediaKind: 'read',
                mediaId: step.readItemId || listId,
                title: list?.name || step.seriesTitle,
                posterUrl: '',
                codeLabel: `#${step.issueNumber}`,
                subtitle: step.title,
                loggedAt: nowIso,
              })
            : prev.history,
        };
      });
      if (toggledLabel) {
        showToast(nextCompleted ? `${toggledLabel} read` : `${toggledLabel} unmarked`, undefined, undefined, {
          domain: 'read',
        });
      }
    },
    [showToast]
  );

  const bulkUpdateItems = useCallback(
    (
      items: Array<{ kind: 'show' | 'movie' | 'read' | 'game'; id: string }>,
      action: 'finish' | 'active' | 'queue' | 'remove' | 'add_to_list',
      listId?: string
    ) => {
      if (items.length === 0) return;
      const nowIso = new Date().toISOString();
      commitState((prev) => {
        lastPreImportStateRef.current = prev;
        const nextShows = { ...prev.showProgress };
        const nextMovies = { ...prev.movieProgress };
        const nextReads = { ...prev.readProgress };
        const nextGames = { ...prev.gameProgress };
        let nextLists = prev.lists;

        if (action === 'add_to_list' && listId) {
          nextLists = prev.lists.map((l) => {
            if (l.id !== listId) return l;
            const existingKeys = new Set(l.items.map((x) => `${x.kind}:${x.id}`));
            const additions = items.filter((x) => !existingKeys.has(`${x.kind}:${x.id}`));
            return additions.length > 0 ? { ...l, items: [...l.items, ...additions] } : l;
          });
          return { ...prev, lists: nextLists };
        }

        for (const ref of items) {
          if (ref.kind === 'show') {
            const s = prev.shows[ref.id];
            const p = nextShows[ref.id];
            if (!s || !p) continue;
            if (action === 'remove') {
              nextShows[ref.id] = { ...p, bookmarked: false };
            } else if (action === 'finish') {
              const epCounts = { ...p.episodeCounts };
              for (const ep of getAllEpisodes(s)) {
                const k = getEpisodeKey(ep.season, ep.number);
                epCounts[k] = Math.max(1, epCounts[k] || 0);
              }
              nextShows[ref.id] = {
                ...p,
                status: 'finished',
                episodeCounts: epCounts,
                finishedAt: p.finishedAt || nowIso,
                lastWatchedAt: nowIso,
              };
            } else if (action === 'active') {
              nextShows[ref.id] = { ...p, status: 'watching', bookmarked: true };
            } else if (action === 'queue') {
              nextShows[ref.id] = {
                ...p,
                status: 'not_started',
                episodeCounts: {},
                finishedAt: undefined,
                bookmarked: true,
              };
            }
          } else if (ref.kind === 'movie') {
            const p = nextMovies[ref.id];
            if (!p) continue;
            if (action === 'remove') {
              delete nextMovies[ref.id];
            } else if (action === 'finish') {
              nextMovies[ref.id] = {
                ...p,
                status: 'watched',
                watchCount: Math.max(1, p.watchCount || 0),
                watchedAt: p.watchedAt || nowIso,
              };
            } else {
              nextMovies[ref.id] = {
                ...p,
                status: 'watchlist',
                watchCount: 0,
                watchedAt: undefined,
              };
            }
          } else if (ref.kind === 'read') {
            const r = prev.readItems[ref.id];
            const p = nextReads[ref.id];
            if (!r || !p) continue;
            if (action === 'remove') {
              nextReads[ref.id] = { ...p, bookmarked: false };
            } else if (action === 'finish') {
              const allSlots = Array.from({ length: r.totalUnits }, (_, i) => i + 1);
              nextReads[ref.id] = {
                ...p,
                status: 'finished',
                currentUnit: r.totalUnits,
                completedUnits: allSlots,
                maxCompletedUnit: r.totalUnits,
                rereadCount: Math.max(1, p.rereadCount || 0),
                finishedAt: p.finishedAt || nowIso,
                lastReadAt: nowIso,
              };
            } else if (action === 'active') {
              nextReads[ref.id] = { ...p, status: 'reading', bookmarked: true };
            } else if (action === 'queue') {
              nextReads[ref.id] = {
                ...p,
                status: 'want_to_read',
                currentUnit: 0,
                completedUnits: [],
                finishedAt: undefined,
                bookmarked: true,
              };
            }
          } else if (ref.kind === 'game') {
            const p = nextGames[ref.id];
            if (!p) continue;
            if (action === 'remove') {
              nextGames[ref.id] = { ...p, bookmarked: false };
            } else if (action === 'finish') {
              nextGames[ref.id] = {
                ...p,
                status: 'completed',
                completionPct: 100,
                playthroughCount: Math.max(1, p.playthroughCount || 0),
                finishedAt: p.finishedAt || nowIso,
                lastPlayedAt: nowIso,
              };
            } else if (action === 'active') {
              nextGames[ref.id] = { ...p, status: 'playing', bookmarked: true };
            } else if (action === 'queue') {
              nextGames[ref.id] = {
                ...p,
                status: 'backlog',
                completionPct: 0,
                currentChapter: 0,
                finishedAt: undefined,
                bookmarked: true,
              };
            }
          }
        }

        return {
          ...prev,
          showProgress: nextShows,
          movieProgress: nextMovies,
          readProgress: nextReads,
          gameProgress: nextGames,
        };
      });

      const verb =
        action === 'remove'
          ? 'Removed'
          : action === 'finish'
            ? 'Marked finished:'
            : action === 'active'
              ? 'Moved to active:'
              : action === 'queue'
                ? 'Moved to backlog:'
                : 'Added to list:';
      showToast(`${verb} ${items.length} ${items.length === 1 ? 'item' : 'items'}`, 'Undo', () => {
        const snapshot = lastPreImportStateRef.current;
        if (!snapshot) return;
        lastPreImportStateRef.current = null;
        stateRef.current = snapshot;
        setState(snapshot);
        showToast('Bulk edit undone');
      }, {
        tone: 'undo',
      });
    },
    [showToast]
  );

  const queuePendingIsbnScan = useCallback(
    (rawIsbn: string) => {
      const clean = rawIsbn.replace(/[^0-9Xx]/g, '').toUpperCase();
      if (!clean) return;
      commitState((prev) => {
        const list = prev.pendingIsbnScans || [];
        if (list.some((x) => x.isbn === clean)) return prev;
        return {
          ...prev,
          pendingIsbnScans: [
            { isbn: clean, scannedAt: new Date().toISOString() },
            ...list,
          ],
        };
      });
      showToast(`Saved ISBN ${clean} offline — will sync when online`, undefined, undefined, {
        domain: 'read',
      });
    },
    [showToast]
  );

  const removePendingIsbnScan = useCallback((isbn: string) => {
    commitState((prev) => ({
      ...prev,
      pendingIsbnScans: (prev.pendingIsbnScans || []).filter((x) => x.isbn !== isbn),
    }));
  }, []);

  const flushingIsbnRef = useRef(false);
  const flushPendingIsbnScans = useCallback(async (): Promise<number> => {
    if (flushingIsbnRef.current) return 0;
    const queue = stateRef.current.pendingIsbnScans || [];
    if (queue.length === 0) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;

    flushingIsbnRef.current = true;
    let resolvedCount = 0;
    const resolvedIsbns = new Set<string>();
    try {
      for (const entry of queue) {
        try {
          const matches = await searchByIsbn(entry.isbn);
          if (matches.length > 0) {
            const hydrated = await hydrateLiveReadItem(matches[0]);
            addLiveReadToStore(hydrated, 'want_to_read', true);
            resolvedIsbns.add(entry.isbn);
            resolvedCount += 1;
          }
        } catch {
          // keep failed ISBN in queue for the next retry
        }
      }
      if (resolvedIsbns.size > 0) {
        commitState((prev) => ({
          ...prev,
          pendingIsbnScans: (prev.pendingIsbnScans || []).filter((x) => !resolvedIsbns.has(x.isbn)),
        }));
      }
    } finally {
      flushingIsbnRef.current = false;
    }
    return resolvedCount;
  }, [addLiveReadToStore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      if ((stateRef.current.pendingIsbnScans?.length || 0) > 0) {
        void flushPendingIsbnScans();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flushPendingIsbnScans]);

  const toggleItemInList = useCallback(
    (listId: string, kind: 'show' | 'movie' | 'read' | 'game', id: string) => {
      let added = false;
      commitState((prev) =>
        recomputeAutoCollectionRatings({
          ...prev,
          lists: prev.lists.map((l) => {
            if (l.id !== listId) return l;
            const exists = l.items.some((x) => x.kind === kind && x.id === id);
            added = !exists;
            return {
              ...l,
              items: exists
                ? l.items.filter((x) => !(x.kind === kind && x.id === id))
                : [...l.items, { kind, id }],
            };
          }),
        })
      );
      showToast(added ? 'Added to list' : 'Removed from list');
    },
    [showToast]
  );

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      commitState((prev) => ({
        ...prev,
        profile: { ...prev.profile, ...patch },
      }));
      showToast('Profile saved');
    },
    [showToast]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    commitState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const exportLibraryJson = useCallback(() => {
    return JSON.stringify(
      {
        app: 'cue',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        state,
      },
      null,
      2
    );
  }, [state]);

  const commitImportHistory = useCallback((nextRecords: ImportBatchRecord[]) => {
    const capped = nextRecords.slice(0, MAX_IMPORT_HISTORY);
    recentImportsRef.current = capped;
    setRecentImports(capped);
    saveImportHistory(capped);
  }, []);

  const dismissImportRecord = useCallback(
    (importId: string) => {
      commitImportHistory(recentImportsRef.current.filter((r) => r.id !== importId));
    },
    [commitImportHistory]
  );

  const undoImportById = useCallback(
    (importId: string) => {
      const target = recentImportsRef.current.find((r) => r.id === importId);
      if (!target) {
        const fallbackSnapshot = lastPreImportStateRef.current;
        if (!fallbackSnapshot) return;
        lastPreImportStateRef.current = null;
        stateRef.current = fallbackSnapshot;
        setState(fallbackSnapshot);
        showToast('Import undone');
        return;
      }

      if (target.kind === 'backup-restore' && !target.fullSnapshot) {
        const fallbackSnapshot = lastPreImportStateRef.current;
        if (!fallbackSnapshot) {
          showToast('Pre-backup snapshot unavailable');
          return;
        }
        lastPreImportStateRef.current = null;
        stateRef.current = fallbackSnapshot;
        setState(fallbackSnapshot);
        commitImportHistory(recentImportsRef.current.filter((r) => r.id !== importId));
        showToast('Restored pre-backup library');
        return;
      }

      const { nextState, removedCount, restoredCount } = rollbackImportRecord(
        stateRef.current,
        target
      );
      lastPreImportStateRef.current = null;
      stateRef.current = nextState;
      setState(nextState);
      commitImportHistory(recentImportsRef.current.filter((r) => r.id !== importId));

      if (target.kind === 'backup-restore') {
        showToast('Restored pre-backup library');
      } else {
        const parts: string[] = [];
        if (removedCount > 0) parts.push(`Removed ${removedCount}`);
        if (restoredCount > 0) parts.push(`restored ${restoredCount}`);
        showToast(parts.length > 0 ? `Undid import · ${parts.join(' · ')}` : 'Import undone');
      }
    },
    [commitImportHistory, showToast]
  );

  const undoLastImport = useCallback(() => {
    if (lastPreImportStateRef.current) {
      const snapshot = lastPreImportStateRef.current;
      lastPreImportStateRef.current = null;
      stateRef.current = snapshot;
      setState(snapshot);
      showToast('Undone');
      return;
    }
    const latest = recentImportsRef.current[0];
    if (latest) {
      undoImportById(latest.id);
    }
  }, [showToast, undoImportById]);

  const restoreCueBackup = useCallback(
    (backupState: CueStoreState, fileName?: string) => {
      const preBackup = stateRef.current;
      const normalized = normalizeLoadedCueState({ ...backupState });
      const record: ImportBatchRecord = {
        id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        importedAt: new Date().toISOString(),
        sourceLabel: 'Cue Backup JSON',
        fileName,
        kind: 'backup-restore',
        addedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        addedShowIds: [],
        addedMovieIds: [],
        addedReadIds: [],
        addedGameIds: [],
        addedHistoryIds: [],
        fullSnapshot: preBackup,
      };
      lastPreImportStateRef.current = preBackup;
      stateRef.current = normalized;
      setState(normalized);
      commitImportHistory([record, ...recentImportsRef.current]);
      showToast('Restored cue library backup', 'Undo', () => undoImportById(record.id), {
        tone: 'undo',
      });
    },
    [commitImportHistory, showToast, undoImportById]
  );

  const importSmartBatch = useCallback(
    (
      rawEntries: PreparedImportEntry[],
      policy: ImportConflictPolicy,
      meta?: { sourceLabel?: string; fileName?: string }
    ): { added: number; updated: number; skipped: number } => {
      const selectedEntries = rawEntries.filter((e) => e.selected);
      if (selectedEntries.length === 0) {
        return { added: 0, updated: 0, skipped: 0 };
      }

      const prev = stateRef.current;
      lastPreImportStateRef.current = prev;

      const annotated = annotateImportDuplicates(
        selectedEntries.map((e) => e.candidate),
        prev
      );

      const nextShows = { ...prev.shows };
      const nextMovies = { ...prev.movies };
      const nextReadItems = { ...prev.readItems };
      const nextGames = { ...prev.games };
      const nextShowProgress = { ...prev.showProgress };
      const nextMovieProgress = { ...prev.movieProgress };
      const nextReadProgress = { ...prev.readProgress };
      const nextGameProgress = { ...prev.gameProgress };

      const newShowIds: string[] = [];
      const newMovieIds: string[] = [];
      const newReadIds: string[] = [];
      const newGameIds: string[] = [];
      const historyAdds: HistoryEntry[] = [];

      const prevReadItemsBackup: Record<string, ReadItem> = {};
      const prevShowProgressBackup: Record<string, ShowProgress | null> = {};
      const prevMovieProgressBackup: Record<string, MovieProgress | null> = {};
      const prevReadProgressBackup: Record<string, ReadProgress | null> = {};
      const prevGameProgressBackup: Record<string, GameProgress | null> = {};

      let added = 0;
      let updated = 0;
      let skipped = 0;
      const nowIso = new Date().toISOString();

      const mergeImportRuns = (
        existingRuns: CompletionRun[] | undefined,
        cand: ImportCandidate,
        primaryIso: string | undefined,
        runPrefix: string
      ): { runs: CompletionRun[]; addedCount: number } => {
        const byDay = new Map<string, CompletionRun>();
        for (const r of existingRuns || []) {
          const day = (r.finishedAt || '').slice(0, 10);
          if (day) byDay.set(day, r);
        }
        const initialSize = byDay.size;
        const incoming: Array<{ finishedAt: string; note?: string }> =
          cand.extraRuns && cand.extraRuns.length > 0
            ? cand.extraRuns
            : primaryIso && cand.completed
              ? [{ finishedAt: primaryIso }]
              : [];
        incoming.forEach((inc, rIdx) => {
          const normIso = normalizeImportDateIso(inc.finishedAt);
          if (!normIso) return;
          const day = normIso.slice(0, 10);
          const prevRun = byDay.get(day);
          if (!prevRun) {
            byDay.set(day, {
              id: `run-${runPrefix}-${day}-${rIdx}`,
              finishedAt: normIso,
              ...(inc.note ? { note: inc.note } : {}),
            });
          } else if (!prevRun.note && inc.note) {
            byDay.set(day, { ...prevRun, note: inc.note });
          }
        });
        const sorted = Array.from(byDay.values()).sort((a, b) =>
          a.finishedAt.localeCompare(b.finishedAt)
        );
        return { runs: sorted, addedCount: Math.max(0, sorted.length - initialSize) };
      };

      selectedEntries.forEach((entry, idx) => {
        const c = annotated[idx];
        const existingId = c.existingId;
        const primaryIso = normalizeImportDateIso(c.dateStr) || (c.completed ? nowIso : undefined);

        if (existingId) {
          if (policy === 'skip_existing') {
            skipped += 1;
            return;
          }

          let changed = false;
          if (c.kind === 'show' && nextShows[existingId]) {
            const ep = nextShowProgress[existingId];
            if (ep) {
              const patched: ShowProgress = { ...ep };
              if (!patched.rating && c.userRating) {
                patched.rating = c.userRating;
                changed = true;
              }
              if (c.completed && primaryIso) {
                if (!patched.finishedAt) {
                  patched.finishedAt = primaryIso;
                  patched.lastWatchedAt = patched.lastWatchedAt || primaryIso;
                  changed = true;
                }
                const { runs, addedCount } = mergeImportRuns(
                  patched.completedRuns,
                  c,
                  primaryIso,
                  existingId
                );
                if (addedCount > 0) {
                  patched.completedRuns = runs;
                  changed = true;
                }
              }
              if (c.seasonDates) {
                const nextSeasons = { ...(patched.seasonFinishedAt || {}) };
                for (const [sNumStr, iso] of Object.entries(c.seasonDates)) {
                  const sNum = Number(sNumStr);
                  if (!nextSeasons[sNum] && iso) {
                    nextSeasons[sNum] = iso;
                    changed = true;
                  }
                }
                if (changed) patched.seasonFinishedAt = nextSeasons;
              }
              if (changed) {
                if (prevShowProgressBackup[existingId] === undefined) {
                  prevShowProgressBackup[existingId] = ep;
                }
                nextShowProgress[existingId] = patched;
              }
            }
          } else if (c.kind === 'movie' && nextMovies[existingId]) {
            const mp = nextMovieProgress[existingId];
            const patched = {
              status: mp?.status || 'watchlist',
              watchCount: mp?.watchCount || 0,
              watchedAt: mp?.watchedAt,
              completedRuns: mp?.completedRuns,
              rating: mp?.rating,
              ownership: mp?.ownership,
              collection: mp?.collection,
              mood: mp?.mood,
            };
            if (!patched.rating && c.userRating) {
              patched.rating = c.userRating;
              changed = true;
            }
            if (c.completed) {
              const { runs, addedCount } = mergeImportRuns(
                patched.completedRuns,
                c,
                primaryIso,
                existingId
              );
              if (patched.watchCount === 0) {
                patched.status = 'watched';
                patched.watchCount = Math.max(1, runs.length);
                patched.watchedAt = patched.watchedAt || primaryIso || nowIso;
                changed = true;
              } else if (addedCount > 0) {
                patched.watchCount = Math.max(patched.watchCount, runs.length);
                patched.watchedAt = patched.watchedAt || primaryIso;
                changed = true;
              }
              if (runs.length > 0 && (addedCount > 0 || !patched.completedRuns?.length)) {
                patched.completedRuns = runs;
                changed = true;
              }
            }
            if (changed) {
              if (prevMovieProgressBackup[existingId] === undefined) {
                prevMovieProgressBackup[existingId] = mp ?? null;
              }
              nextMovieProgress[existingId] = patched;
            }
          } else if (c.kind === 'read' && nextReadItems[existingId]) {
            const rp = nextReadProgress[existingId];
            const item = nextReadItems[existingId];
            let readItemChanged = false;
            const targetFormat: ReadItem['format'] | undefined =
              c.mediaType === 'comic'
                ? 'comic'
                : c.mediaType === 'manga'
                  ? 'manga'
                  : c.mediaType === 'novel'
                    ? 'novel'
                    : undefined;
            if (targetFormat && item.format !== targetFormat && (item.format === 'novel' || policy === 'merge_missing')) {
              if (!prevReadItemsBackup[existingId]) {
                prevReadItemsBackup[existingId] = prev.readItems[existingId];
              }
              const nextUnit = targetFormat === 'comic' ? 'issues' : 'chapters';
              const formatGenre =
                targetFormat === 'comic' ? 'Comics' : targetFormat === 'manga' ? 'Manga' : 'Fiction';
              const filteredGenres = item.genres.filter(
                (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
              );
              nextReadItems[existingId] = {
                ...item,
                format: targetFormat,
                unit: nextUnit,
                genres: [formatGenre, ...filteredGenres],
              };
              changed = true;
              readItemChanged = true;
            }
            const nextCover = c.posterUrl || entry.read?.coverUrl || '';
            if (!nextReadItems[existingId].coverUrl && nextCover) {
              if (!readItemChanged && !prevReadItemsBackup[existingId]) {
                prevReadItemsBackup[existingId] = prev.readItems[existingId];
              }
              nextReadItems[existingId] = {
                ...nextReadItems[existingId],
                coverUrl: nextCover,
                backdropUrl: nextReadItems[existingId].backdropUrl || nextCover,
              };
              changed = true;
            }
            if (rp) {
              let rpChanged = false;
              const patched = { ...rp };
              if (!patched.rating && c.userRating) {
                patched.rating = c.userRating;
                changed = true;
                rpChanged = true;
              }
              if (rp.status === 'want_to_read' && c.completed) {
                const updatedItem = nextReadItems[existingId];
                patched.status = 'finished';
                patched.currentUnit = updatedItem.totalUnits;
                patched.maxCompletedUnit = Math.max(updatedItem.totalUnits, rp.maxCompletedUnit || 0);
                patched.rereadCount = Math.max(1, rp.rereadCount || 0);
                patched.finishedAt = patched.finishedAt || primaryIso;
                patched.lastReadAt = patched.lastReadAt || primaryIso;
                changed = true;
                rpChanged = true;
              }
              if (c.completed && primaryIso) {
                if (!patched.finishedAt) {
                  patched.finishedAt = primaryIso;
                  changed = true;
                  rpChanged = true;
                }
                const { runs, addedCount } = mergeImportRuns(
                  patched.completedRuns,
                  c,
                  primaryIso,
                  existingId
                );
                if (addedCount > 0 || (runs.length > 0 && !patched.completedRuns?.length)) {
                  patched.completedRuns = runs;
                  patched.rereadCount = Math.max(patched.rereadCount || 0, runs.length);
                  changed = true;
                  rpChanged = true;
                }
              }
              if (rpChanged) {
                if (prevReadProgressBackup[existingId] === undefined) {
                  prevReadProgressBackup[existingId] = rp;
                }
                nextReadProgress[existingId] = patched;
              }
            }
          } else if (c.kind === 'game' && nextGames[existingId]) {
            const gp = nextGameProgress[existingId];
            if (gp) {
              const patched = { ...gp };
              if (!patched.rating && c.userRating) {
                patched.rating = c.userRating;
                changed = true;
              }
              if (gp.status === 'backlog' && c.completed) {
                patched.status = 'completed';
                patched.completionPct = 100;
                patched.playthroughCount = Math.max(1, gp.playthroughCount || 0);
                patched.finishedAt = patched.finishedAt || primaryIso;
                patched.lastPlayedAt = patched.lastPlayedAt || primaryIso;
                changed = true;
              }
              if (c.completed && primaryIso) {
                if (!patched.finishedAt) {
                  patched.finishedAt = primaryIso;
                  changed = true;
                }
                const { runs, addedCount } = mergeImportRuns(
                  patched.completedRuns,
                  c,
                  primaryIso,
                  existingId
                );
                if (addedCount > 0 || (runs.length > 0 && !patched.completedRuns?.length)) {
                  patched.completedRuns = runs;
                  patched.playthroughCount = Math.max(patched.playthroughCount || 0, runs.length);
                  changed = true;
                }
              }
              if (changed) {
                if (prevGameProgressBackup[existingId] === undefined) {
                  prevGameProgressBackup[existingId] = gp;
                }
                nextGameProgress[existingId] = patched;
              }
            }
          }

          if (changed) updated += 1;
          else skipped += 1;
          return;
        }

        if (c.kind === 'show' && entry.show) {
          const show = entry.show;
          const sid = nextShows[show.id] ? `${show.id}-${idx}` : show.id;
          const storedShow = sid === show.id ? show : { ...show, id: sid };
          nextShows[sid] = storedShow;
          newShowIds.push(sid);
          const epCounts: Record<string, number> = {};
          if (c.completed) {
            for (const ep of getAllEpisodes(storedShow)) {
              epCounts[getEpisodeKey(ep.season, ep.number)] = 1;
            }
          }
          const { runs } = c.completed
            ? mergeImportRuns(undefined, c, primaryIso, sid)
            : { runs: [] as CompletionRun[] };
          nextShowProgress[sid] = {
            status: c.completed ? 'finished' : 'not_started',
            episodeCounts: epCounts,
            bookmarked: true,
            notifications: true,
            lastWatchedAt: c.completed ? primaryIso : undefined,
            finishedAt: c.completed ? primaryIso : undefined,
            completedRuns: runs.length > 0 ? runs : undefined,
            seasonFinishedAt:
              c.seasonDates && Object.keys(c.seasonDates).length > 0
                ? { ...c.seasonDates }
                : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${sid}-${Date.now()}`,
              domain: 'watch',
              mediaKind: 'show',
              mediaId: sid,
              title: storedShow.title,
              posterUrl: storedShow.posterUrl,
              codeLabel: 'Imported · Finished',
              subtitle: storedShow.mediaType === 'anime' ? 'Anime' : 'Show',
              loggedAt: primaryIso || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'movie' && entry.movie) {
          const movie = entry.movie;
          const mid = nextMovies[movie.id] ? `${movie.id}-${idx}` : movie.id;
          const storedMovie = mid === movie.id ? movie : { ...movie, id: mid };
          nextMovies[mid] = storedMovie;
          newMovieIds.push(mid);
          const { runs } = c.completed
            ? mergeImportRuns(undefined, c, primaryIso, mid)
            : { runs: [] as CompletionRun[] };
          nextMovieProgress[mid] = {
            status: c.completed ? 'watched' : 'watchlist',
            watchCount: c.completed ? Math.max(1, runs.length) : 0,
            watchedAt: c.completed ? primaryIso : undefined,
            completedRuns: runs.length > 0 ? runs : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${mid}-${Date.now()}`,
              domain: 'watch',
              mediaKind: 'movie',
              mediaId: mid,
              title: storedMovie.title,
              posterUrl: storedMovie.posterUrl,
              codeLabel: 'Watched',
              subtitle: `${storedMovie.year} · ${storedMovie.runtime}m`,
              loggedAt: primaryIso || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'read' && entry.read) {
          const read = entry.read;
          const rid = nextReadItems[read.id] ? `${read.id}-${idx}` : read.id;
          const storedRead = rid === read.id ? read : { ...read, id: rid };
          nextReadItems[rid] = storedRead;
          newReadIds.push(rid);
          const finished = c.readStatus === 'finished' || c.completed;
          const reading = c.readStatus === 'reading';
          const { runs } = finished
            ? mergeImportRuns(undefined, c, primaryIso, rid)
            : { runs: [] as CompletionRun[] };
          nextReadProgress[rid] = {
            status: finished ? 'finished' : reading ? 'reading' : 'want_to_read',
            currentUnit: finished ? storedRead.totalUnits : reading ? 1 : 0,
            maxCompletedUnit: finished ? storedRead.totalUnits : reading ? 1 : 0,
            rereadCount: finished ? Math.max(1, runs.length) : 0,
            bookmarked: true,
            lastReadAt: finished || reading ? primaryIso : undefined,
            finishedAt: finished ? primaryIso : undefined,
            completedRuns: runs.length > 0 ? runs : undefined,
            rating: c.userRating,
          };
          if (finished) {
            historyAdds.push({
              id: `hist-imp-${rid}-${Date.now()}`,
              domain: 'read',
              mediaKind: 'read',
              mediaId: rid,
              title: storedRead.title,
              posterUrl: storedRead.coverUrl,
              codeLabel: 'Finished',
              subtitle: storedRead.creator,
              loggedAt: primaryIso || nowIso,
            });
          }
          added += 1;
        } else if (c.kind === 'game' && entry.game) {
          const game = entry.game;
          const gid = nextGames[game.id] ? `${game.id}-${idx}` : game.id;
          const storedGame = gid === game.id ? game : { ...game, id: gid };
          nextGames[gid] = storedGame;
          newGameIds.push(gid);
          const { runs } = c.completed
            ? mergeImportRuns(undefined, c, primaryIso, gid)
            : { runs: [] as CompletionRun[] };
          nextGameProgress[gid] = {
            status: c.completed ? 'completed' : 'backlog',
            hoursPlayed: 0,
            completionPct: c.completed ? 100 : 0,
            currentChapter: c.completed && storedGame.totalChapters ? storedGame.totalChapters : 0,
            playthroughCount: c.completed ? Math.max(1, runs.length) : 0,
            platinum: false,
            platform: c.platformHint || storedGame.platforms[0] || 'PC',
            bookmarked: true,
            lastPlayedAt: c.completed ? primaryIso : undefined,
            finishedAt: c.completed ? primaryIso : undefined,
            completedRuns: runs.length > 0 ? runs : undefined,
            rating: c.userRating,
          };
          if (c.completed) {
            historyAdds.push({
              id: `hist-imp-${gid}-${Date.now()}`,
              domain: 'play',
              mediaKind: 'game',
              mediaId: gid,
              title: storedGame.title,
              posterUrl: storedGame.coverUrl,
              codeLabel: 'Completed',
              subtitle: storedGame.developer,
              loggedAt: primaryIso || nowIso,
            });
          }
          added += 1;
        }
      });

      const keptHistoryAdds = historyAdds.slice(-15);
      const cappedHistory = [...(prev.history || []), ...keptHistoryAdds];
      const trimmedHistory =
        cappedHistory.length > MAX_HISTORY_ENTRIES
          ? cappedHistory.slice(cappedHistory.length - MAX_HISTORY_ENTRIES)
          : cappedHistory;

      let nextBatchState: CueStoreState = {
        ...prev,
        shows: nextShows,
        movies: nextMovies,
        readItems: nextReadItems,
        games: nextGames,
        showOrder: [...newShowIds, ...prev.showOrder],
        movieOrder: [...newMovieIds, ...prev.movieOrder],
        readOrder: [...newReadIds, ...prev.readOrder],
        gameOrder: [...newGameIds, ...prev.gameOrder],
        showProgress: nextShowProgress,
        movieProgress: nextMovieProgress,
        readProgress: nextReadProgress,
        gameProgress: nextGameProgress,
        history: trimmedHistory,
      };

      // Reconcile any newly imported comics that have hydrated atomic issueDetails
      const addedReadSet = new Set(newReadIds);
      for (const rid of newReadIds) {
        const addedComic = nextBatchState.readItems[rid];
        if (!addedComic || addedComic.format !== 'comic' || !addedComic.issueDetails) continue;
        const reconciled = reconcileHydratedComicItemWithAtoms(nextBatchState, rid, addedComic);
        for (const [otherId, nextProg] of Object.entries(reconciled.readProgress)) {
          if (!addedReadSet.has(otherId) && nextProg !== nextBatchState.readProgress[otherId]) {
            if (prevReadProgressBackup[otherId] === undefined) {
              prevReadProgressBackup[otherId] = prev.readProgress[otherId] ?? null;
            }
          }
        }
        nextBatchState = {
          ...nextBatchState,
          atomicReadUnits: reconciled.atomicReadUnits,
          readProgress: reconciled.readProgress,
        };
      }

      stateRef.current = nextBatchState;
      setState(nextBatchState);

      let recordedImportId: string | undefined;
      if (added > 0 || updated > 0) {
        const record: ImportBatchRecord = {
          id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          importedAt: new Date().toISOString(),
          sourceLabel: meta?.sourceLabel || 'Smart Import',
          fileName: meta?.fileName,
          kind: 'smart-import',
          addedCount: added,
          updatedCount: updated,
          skippedCount: skipped,
          addedShowIds: newShowIds,
          addedMovieIds: newMovieIds,
          addedReadIds: newReadIds,
          addedGameIds: newGameIds,
          addedHistoryIds: keptHistoryAdds.map((h) => h.id),
          ...(Object.keys(prevReadItemsBackup).length > 0
            ? { prevReadItems: prevReadItemsBackup }
            : {}),
          ...(Object.keys(prevShowProgressBackup).length > 0
            ? { prevShowProgress: prevShowProgressBackup }
            : {}),
          ...(Object.keys(prevMovieProgressBackup).length > 0
            ? { prevMovieProgress: prevMovieProgressBackup }
            : {}),
          ...(Object.keys(prevReadProgressBackup).length > 0
            ? { prevReadProgress: prevReadProgressBackup }
            : {}),
          ...(Object.keys(prevGameProgressBackup).length > 0
            ? { prevGameProgress: prevGameProgressBackup }
            : {}),
        };
        recordedImportId = record.id;
        commitImportHistory([record, ...recentImportsRef.current]);
      }

      const summaryParts: string[] = [];
      if (added > 0) summaryParts.push(`Added ${added}`);
      if (updated > 0) summaryParts.push(`Updated ${updated}`);
      if (skipped > 0) summaryParts.push(`${skipped} skipped`);
      showToast(
        summaryParts.join(' · ') || 'Nothing changed',
        recordedImportId ? 'Undo' : undefined,
        recordedImportId ? () => undoImportById(recordedImportId!) : undefined,
        { tone: 'undo' }
      );

      return { added, updated, skipped };
    },
    [commitImportHistory, showToast, undoImportById]
  );

  const autoClassifyReadLibrary = useCallback((): { comics: number; manga: number } => {
    const prev = stateRef.current;
    const nextReadItems = { ...prev.readItems };
    let comics = 0;
    let manga = 0;

    for (const id of Object.keys(nextReadItems)) {
      const item = nextReadItems[id];
      if (!item || item.format !== 'novel') continue;
      const detected = classifyReadFormat({
        title: item.title,
        author: item.creator,
        genres: item.genres,
      });
      if (detected === 'novel') continue;
      if (detected === 'comic') comics += 1;
      if (detected === 'manga') manga += 1;
      const formatGenre = detected === 'comic' ? 'Comics' : 'Manga';
      const filteredGenres = item.genres.filter(
        (g) => !['fiction', 'comics', 'comic', 'manga'].includes(g.toLowerCase())
      );
      nextReadItems[id] = {
        ...item,
        format: detected,
        unit: detected === 'comic' ? 'issues' : 'chapters',
        genres: [formatGenre, ...filteredGenres],
      };
    }

    if (comics === 0 && manga === 0) {
      showToast('All Read items are already categorized');
      return { comics: 0, manga: 0 };
    }

    lastPreImportStateRef.current = prev;
    const nextState: CueStoreState = {
      ...prev,
      readItems: nextReadItems,
    };
    stateRef.current = nextState;
    setState(nextState);

    const parts: string[] = [];
    if (comics > 0) parts.push(`${comics} ${comics === 1 ? 'comic' : 'comics'}`);
    if (manga > 0) parts.push(`${manga} manga`);
    showToast(`Moved ${parts.join(' & ')} out of Novels`, 'Undo', undoLastImport, {
      domain: 'read',
      tone: 'undo',
    });
    return { comics, manga };
  }, [showToast, undoLastImport]);

  const importLibraryJson = useCallback(
    (rawJson: string): { ok: boolean; summary: string } => {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed?.app === 'cue' && parsed?.state?.shows && parsed?.state?.readItems) {
          const restored = normalizeLoadedCueState(parsed.state as CueStoreState);
          stateRef.current = restored;
          setState(restored);
          showToast('Restored cue library backup');
          return { ok: true, summary: 'Full cue backup restored.' };
        }

        let matchedShows = 0;
        let matchedMovies = 0;
        const importedShowTitles = new Set<string>();
        const importedMovieTitles = new Set<string>();

        const scan = (node: unknown) => {
          if (Array.isArray(node)) node.forEach(scan);
          else if (node && typeof node === 'object') {
            const obj = node as Record<string, unknown>;
            if (typeof obj.series_name === 'string') importedShowTitles.add(obj.series_name.toLowerCase());
            if (typeof obj.show_title === 'string') importedShowTitles.add(obj.show_title.toLowerCase());
            if (obj.show && typeof (obj.show as Record<string, unknown>).title === 'string') {
              importedShowTitles.add(String((obj.show as Record<string, unknown>).title).toLowerCase());
            }
            if (obj.movie && typeof (obj.movie as Record<string, unknown>).title === 'string') {
              importedMovieTitles.add(String((obj.movie as Record<string, unknown>).title).toLowerCase());
            }
            if (typeof obj.movie_title === 'string') importedMovieTitles.add(obj.movie_title.toLowerCase());
          }
        };
        scan(parsed);

        commitState((prev) => {
          const nextShowProg = { ...prev.showProgress };
          const nextMovieProg = { ...prev.movieProgress };
          for (const id of prev.showOrder) {
            const s = prev.shows[id];
            if (importedShowTitles.has(s.title.toLowerCase())) {
              matchedShows += 1;
              if (!nextShowProg[id]) {
                nextShowProg[id] = {
                  status: 'watching',
                  episodeCounts: {},
                  bookmarked: true,
                  notifications: true,
                };
              }
            }
          }
          for (const id of prev.movieOrder) {
            const m = prev.movies[id];
            if (importedMovieTitles.has(m.title.toLowerCase())) {
              matchedMovies += 1;
              nextMovieProg[id] = {
                status: 'watched',
                watchCount: Math.max(1, nextMovieProg[id]?.watchCount || 0),
                watchedAt: new Date().toISOString(),
              };
            }
          }
          return { ...prev, showProgress: nextShowProg, movieProgress: nextMovieProg };
        });

        const msg =
          matchedShows + matchedMovies > 0
            ? `Imported ${matchedShows} shows & ${matchedMovies} movies`
            : 'Parsed JSON archive';
        showToast(msg);
        return { ok: true, summary: msg };
      } catch {
        return { ok: false, summary: 'Invalid JSON file format.' };
      }
    },
    [showToast]
  );

  const selectiveReset = useCallback(
    (scope: 'watch' | 'read' | 'play' | 'all') => {
      const resetWatchState = (prev: CueStoreState) => {
        const nextShows: Record<string, ShowProgress> = {};
        for (const id of Object.keys(prev.showProgress)) {
          nextShows[id] = {
            status: 'not_started',
            episodeCounts: {},
            bookmarked: prev.showProgress[id].bookmarked,
            notifications: prev.showProgress[id].notifications,
          };
        }
        const nextMovies = { ...prev.movieProgress };
        for (const id of Object.keys(nextMovies)) {
          nextMovies[id] = { status: 'watchlist', watchCount: 0 };
        }
        return { nextShows, nextMovies };
      };

      const resetReadState = (prev: CueStoreState) => {
        const nextRead: Record<string, ReadProgress> = {};
        for (const id of Object.keys(prev.readProgress)) {
          nextRead[id] = {
            status: 'want_to_read',
            currentUnit: 0,
            completedUnits: [],
            maxCompletedUnit: 0,
            rereadCount: 0,
            bookmarked: prev.readProgress[id].bookmarked,
            edition: prev.readProgress[id].edition,
          };
        }
        return nextRead;
      };

      const resetPlayState = (prev: CueStoreState) => {
        const nextGames = { ...prev.gameProgress };
        for (const id of Object.keys(nextGames)) {
          nextGames[id] = {
            ...nextGames[id],
            status: 'backlog',
            hoursPlayed: 0,
            completionPct: 0,
            currentChapter: 0,
            playthroughCount: 0,
            platinum: false,
          };
        }
        return nextGames;
      };

      if (scope === 'all') {
        commitState((prev) => {
          const { nextShows, nextMovies } = resetWatchState(prev);
          return {
            ...prev,
            showProgress: nextShows,
            movieProgress: nextMovies,
            readProgress: resetReadState(prev),
            atomicReadUnits: {},
            gameProgress: resetPlayState(prev),
            history: [],
            mindFeedback: { dismissedIds: [], dismissedGenres: {}, acceptedCount: 0 },
            settings: {
              ...prev.settings,
              cueMindIntroDismissed: false,
            },
          };
        });
        showToast('Reset all progress data');
        return;
      }
      if (scope === 'watch') {
        commitState((prev) => {
          const { nextShows, nextMovies } = resetWatchState(prev);
          return {
            ...prev,
            showProgress: nextShows,
            movieProgress: nextMovies,
            history: (prev.history || []).filter((h) => h.domain !== 'watch'),
          };
        });
        showToast('Reset Watch progress');
        return;
      }
      if (scope === 'read') {
        commitState((prev) => ({
          ...prev,
          readProgress: resetReadState(prev),
          atomicReadUnits: {},
          history: (prev.history || []).filter((h) => h.domain !== 'read'),
        }));
        showToast('Reset Read progress');
        return;
      }
      commitState((prev) => ({
        ...prev,
        gameProgress: resetPlayState(prev),
        history: (prev.history || []).filter((h) => h.domain !== 'play'),
      }));
      showToast('Reset Play progress');
    },
    [showToast]
  );

  const dismissMindRecommendation = useCallback((itemId: string, genres: string[] = []) => {
    commitState((prev) => {
      const mf = prev.mindFeedback || { dismissedIds: [], dismissedGenres: {}, acceptedCount: 0 };
      const nextIds = [itemId, ...mf.dismissedIds.filter((id) => id !== itemId)].slice(0, 120);
      const nextGenres = { ...(mf.dismissedGenres || {}) };
      for (const g of cleanDisplayGenres(genres)) {
        nextGenres[g] = (nextGenres[g] || 0) + 1;
      }
      return {
        ...prev,
        mindFeedback: {
          ...mf,
          dismissedIds: nextIds,
          dismissedGenres: nextGenres,
        },
      };
    });
  }, []);

  const recordMindDiscoverAccept = useCallback((genres: string[] = []) => {
    commitState((prev) => {
      const mf = prev.mindFeedback || { dismissedIds: [], dismissedGenres: {}, acceptedCount: 0 };
      const nextGenres = { ...(mf.dismissedGenres || {}) };
      for (const g of cleanDisplayGenres(genres)) {
        if (nextGenres[g]) {
          const dec = nextGenres[g] - 1;
          if (dec > 0) nextGenres[g] = dec;
          else delete nextGenres[g];
        }
      }
      return {
        ...prev,
        mindFeedback: {
          ...mf,
          dismissedGenres: nextGenres,
          acceptedCount: (mf.acceptedCount || 0) + 1,
        },
      };
    });
  }, []);

  const clearAllData = useCallback(() => {
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    syncCodeRef.current = null;
    lastSyncedAtRef.current = null;
    localEditedAtRef.current = 0;
    suppressNextPushRef.current = true;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_V2_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(SYNC_CODE_KEY);
      localStorage.removeItem(SYNC_TS_KEY);
      localStorage.removeItem(LOCAL_EDIT_TS_KEY);
      clearImportHistory();
    } catch {
      // ignore storage errors
    }
    recentImportsRef.current = [];
    setRecentImports([]);
    setSyncCode(null);
    setLastSyncedAt(null);
    setSyncStatus('idle');
    setSyncError(null);
    setActiveBanner(null);
    const empty = createEmptyState();
    stateRef.current = empty;
    setState(empty);
    setRouteStack([{ view: 'queue' }]);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    showToast('All data removed — starting fresh');
  }, [showToast]);

  return (
    <CueContext.Provider
      value={{
        state,
        route,
        canGoBack,
        switchTab,
        pushRoute,
        goBack,
        toggleCalendarMode,
        toast,
        dismissToast,
        showToast,
        catchUpPrompt,
        confirmCatchUpPrompt,
        neverAskCatchUpPrompt,
        dismissCatchUpPrompt,
        activeBanner,
        dismissBanner,
        triggerSampleReleaseAlert,
        filterSheetOpen,
        setFilterSheetOpen,
        notificationsOpen,
        setNotificationsOpen,
        settingsOpen,
        setSettingsOpen,
        insightsOpen,
        setInsightsOpen,
        importModalOpen,
        setImportModalOpen,
        registerOverlayBackHandler,
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
        setShowMood,
        updateShowEpisodes,
        updateShowMetadata,
        toggleMovieWatched,
        incrementMovieRewatch,
        toggleMovieWatchlist,
        rateMovie,
        setMovieMood,
        updateMovieDetails,
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
        setReadCollectionNote,
        setReadUnitOwnership,
        setReadUnitVariantNote,
        setAllReadUnitsOwnership,
        toggleComicEditionOwnership,
        setReadMood,
        setReadEdition,
        selectComicEdition,
        updateReadEditionsCatalog,
        updateReadIssueDetails,
        patchReadIssueMeta,
        updateReadEditionCovers,
        updateReadTotalUnits,
        updateReadMetadata,
        updateReadFormat,
        autoClassifyReadLibrary,
        resetReadProgress,
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
        setGameMood,
        setMediaFinishedDate,
        addCompletionRun,
        updateCompletionRunDate,
        deleteCompletionRun,
        resetGameProgress,
        setMediaOwnership,
        updateMediaCollectionDetails,
        rateCollection,
        setCollectionFinishedDate,
        toggleListPinnedToQueue,
        deleteCustomList,
        createCuratedReadingOrder,
        reorderListItem,
        addReadingOrderStep,
        removeReadingOrderStep,
        toggleReadingOrderStep,
        bulkUpdateItems,
        queuePendingIsbnScan,
        removePendingIsbnScan,
        flushPendingIsbnScans,
        addLiveShowToStore,
        addLiveMovieToStore,
        addLiveReadToStore,
        addLiveGameToStore,
        patchMediaMetadata,
        addJournalEntry,
        deleteJournalEntry,
        markAllNotificationsRead,
        dismissMindRecommendation,
        recordMindDiscoverAccept,
        createCustomList,
        toggleItemInList,
        updateProfile,
        updateSettings,
        exportLibraryJson,
        importLibraryJson,
        restoreCueBackup,
        importSmartBatch,
        recentImports,
        undoImportById,
        dismissImportRecord,
        undoLastImport,
        selectiveReset,
        clearAllData,
        syncCode,
        syncStatus,
        lastSyncedAt,
        syncError,
        createSyncCode,
        linkSyncCode,
        syncNow,
        unlinkSyncCode,
      }}
    >
      {children}
    </CueContext.Provider>
  );
}

export function useCueStore() {
  const ctx = useContext(CueContext);
  if (!ctx) throw new Error('useCueStore must be used inside CueProvider');
  return ctx;
}

export function useModalBackHandler(open: boolean, onClose: () => void) {
  const { registerOverlayBackHandler } = useCueStore();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerOverlayBackHandler(() => onCloseRef.current());
  }, [open, registerOverlayBackHandler]);
}
