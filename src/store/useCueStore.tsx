import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createSeedState } from '../data/seedState';
import type {
  AppSettings,
  CueStoreState,
  GameItem,
  GamePlatform,
  GameWatchStatus,
  JournalEntry,
  MediaDomain,
  Movie,
  MovieWatchStatus,
  PersonalMood,
  ReadItem,
  ReadProgress,
  ReadWatchStatus,
  RouteView,
  Show,
  ShowProgress,
  UserProfile,
} from '../types';
import { formatEpisodeCode, getAllEpisodes, getEpisodeKey, getShowStats } from '../utils/stats';
import { generateSyncCode } from '../services/syncApi';

const STORAGE_KEY = 'cue_state_v3';
const LEGACY_V2_KEY = 'cue_state_v2';
const LEGACY_STORAGE_KEY = 'cue_state_v1';

function loadInitialState(): CueStoreState {
  try {
    const rawV3 = localStorage.getItem(STORAGE_KEY);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as CueStoreState;
      if (parsed && parsed.shows && parsed.movies && parsed.readItems && parsed.games) {
        return parsed;
      }
    }
    const seed = createSeedState();
    const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
    if (rawV2) {
      const v2 = JSON.parse(rawV2) as Partial<CueStoreState>;
      if (v2.profile) seed.profile = { ...seed.profile, ...v2.profile };
      if (v2.settings) {
        seed.settings = {
          ...seed.settings,
          watchLayout: v2.settings.watchLayout || seed.settings.watchLayout,
          readLayout: v2.settings.readLayout || seed.settings.readLayout,
          playLayout: v2.settings.playLayout || seed.settings.playLayout,
          sortBy: v2.settings.sortBy || seed.settings.sortBy,
          showPosterProgress: v2.settings.showPosterProgress ?? seed.settings.showPosterProgress,
          tmdbApiKey: v2.settings.tmdbApiKey || '',
        };
      }
      if (v2.showProgress) seed.showProgress = { ...seed.showProgress, ...v2.showProgress };
      if (v2.movieProgress) seed.movieProgress = { ...seed.movieProgress, ...v2.movieProgress };
      if (v2.gameProgress) seed.gameProgress = { ...seed.gameProgress, ...v2.gameProgress };
      return seed;
    }
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1) as {
        profile?: { name?: string; handle?: string; avatarUrl?: string; bannerUrl?: string };
        settings?: { tmdbApiKey?: string };
      };
      if (v1?.profile?.name) {
        seed.profile.name = v1.profile.name;
        seed.profile.handle = v1.profile.handle || seed.profile.handle;
        if (v1.profile.avatarUrl) seed.profile.avatarUrl = v1.profile.avatarUrl;
        if (v1.profile.bannerUrl) seed.profile.bannerUrl = v1.profile.bannerUrl;
      }
      if (v1?.settings?.tmdbApiKey) seed.settings.tmdbApiKey = v1.settings.tmdbApiKey;
    }
    return seed;
  } catch {
    return createSeedState();
  }
}

export interface ToastItem {
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

interface CueContextValue {
  state: CueStoreState;
  route: RouteView;
  canGoBack: boolean;
  switchTab: (tab: 'watch' | 'read' | 'play' | 'journal' | 'search', calendarMode?: boolean) => void;
  pushRoute: (next: RouteView) => void;
  goBack: () => void;
  toggleCalendarMode: () => void;

  toast: ToastItem | null;
  dismissToast: () => void;
  showToast: (message: string, actionLabel?: string, onAction?: () => void) => void;

  activeBanner: ReleaseBannerData | null;
  dismissBanner: () => void;
  triggerSampleReleaseAlert: () => void;

  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  insightsOpen: boolean;
  setInsightsOpen: (open: boolean) => void;

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
  rateShow: (showId: string, rating: number) => void;
  setShowMood: (showId: string, mood: PersonalMood | undefined) => void;

  toggleMovieWatched: (movieId: string) => void;
  incrementMovieRewatch: (movieId: string, delta: number) => void;
  toggleMovieWatchlist: (movieId: string) => void;
  rateMovie: (movieId: string, rating: number) => void;
  setMovieMood: (movieId: string, mood: PersonalMood | undefined) => void;

  // Read actions
  advanceReadProgress: (readId: string, delta?: number) => void;
  setReadProgress: (readId: string, currentUnit: number) => void;
  markReadFinished: (readId: string) => void;
  incrementReread: (readId: string, delta: number) => void;
  toggleReadBookmark: (readId: string) => void;
  rateReadItem: (readId: string, rating: number) => void;
  setReadMood: (readId: string, mood: PersonalMood | undefined) => void;
  updateReadTotalUnits: (readId: string, totalUnits: number) => void;
  resetReadProgress: (readId: string) => void;

  // Play actions
  logGameSession: (gameId: string, hoursDelta: number) => void;
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
  rateGame: (gameId: string, rating: number) => void;
  setGameMood: (gameId: string, mood: PersonalMood | undefined) => void;
  resetGameProgress: (gameId: string) => void;

  // Live catalog additions
  addLiveShowToStore: (show: Show, andBookmark?: boolean) => void;
  addLiveMovieToStore: (movie: Movie, status?: MovieWatchStatus) => void;
  addLiveReadToStore: (item: ReadItem, status?: ReadWatchStatus) => void;
  addLiveGameToStore: (game: GameItem, status?: GameWatchStatus) => void;

  // Private Journal & Lists
  addJournalEntry: (input: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  deleteJournalEntry: (entryId: string) => void;
  markAllNotificationsRead: () => void;
  createCustomList: (
    name: string,
    description: string,
    initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }
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
  selectiveReset: (scope: 'watch' | 'read' | 'play' | 'all') => void;

  // Sync
  syncCode: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncedAt: number | null;
  syncError: string | null;
  createSyncCode: () => string;
  linkSyncCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
  syncNow: () => Promise<void>;
  unlinkSyncCode: () => void;
}

const CueContext = createContext<CueContextValue | null>(null);

export function CueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CueStoreState>(loadInitialState);
  const [routeStack, setRouteStack] = useState<RouteView[]>([{ view: 'watch', calendarMode: false }]);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [activeBanner, setActiveBanner] = useState<ReleaseBannerData | null>({
    title: 'New episode out now',
    body: 'My lord, a new episode of House of the Dragon is out 🏰',
    timeLabel: 'now',
    domain: 'watch',
    mediaKind: 'show',
    mediaId: 'house-of-the-dragon',
  });

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);

  const [syncCode, setSyncCode] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const route = routeStack[routeStack.length - 1];
  const canGoBack = routeStack.length > 1;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota
    }
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    setToast({ id: String(Date.now()), message, actionLabel, onAction });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const dismissBanner = useCallback(() => setActiveBanner(null), []);

  const switchTab = useCallback(
    (tab: 'watch' | 'read' | 'play' | 'journal' | 'search', calendarMode = false) => {
      if (tab === 'watch' || tab === 'read' || tab === 'play') {
        setRouteStack([{ view: tab, calendarMode }]);
      } else {
        setRouteStack([{ view: tab }]);
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    []
  );

  const pushRoute = useCallback((next: RouteView) => {
    setRouteStack((prev) => [...prev, next]);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const goBack = useCallback(() => {
    setRouteStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const toggleCalendarMode = useCallback(() => {
    setRouteStack((prev) => {
      const top = prev[prev.length - 1];
      if (top.view === 'watch' || top.view === 'read' || top.view === 'play') {
        return [...prev.slice(0, -1), { ...top, calendarMode: !top.calendarMode }];
      }
      return [{ view: 'watch', calendarMode: true }];
    });
  }, []);

  const triggerSampleReleaseAlert = useCallback(() => {
    const banner: ReleaseBannerData = {
      title: 'New episode out now',
      body: 'My lord, a new episode of House of the Dragon is out 🏰',
      timeLabel: 'now',
      domain: 'watch',
      mediaKind: 'show',
      mediaId: 'house-of-the-dragon',
    };
    setActiveBanner(banner);
    setState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `n-${Date.now()}`,
          domain: 'watch',
          title: banner.title,
          body: banner.body,
          timeLabel: 'now',
          read: false,
          mediaKind: 'show',
          mediaId: 'house-of-the-dragon',
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
      status,
      episodeCounts: nextCounts,
      bookmarked: prev?.bookmarked ?? true,
      notifications: prev?.notifications ?? true,
      lastWatchedAt: new Date().toISOString(),
      rating: prev?.rating,
      mood: prev?.mood,
    };
  };

  const watchNextEpisode = useCallback(
    (showId: string) => {
      let watchedLabel = '';
      let showTitle = '';
      setState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        showTitle = show.title;
        const prog = prev.showProgress[showId];
        const stats = getShowStats(show, prog);
        const targetEp = stats.nextEpisode;
        if (!targetEp) return prev;

        const epKey = getEpisodeKey(targetEp.season, targetEp.number);
        watchedLabel = formatEpisodeCode(targetEp.season, targetEp.number);
        const nextCounts = {
          ...(prog?.episodeCounts || {}),
          [epKey]: Math.max(1, (prog?.episodeCounts?.[epKey] || 0) + 1),
        };
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
          upcoming: prev.upcoming.filter(
            (u) => !(u.kind === 'episode' && u.mediaId === showId && u.daysUntil === 0)
          ),
        };
      });

      if (watchedLabel) {
        showToast(`Watched ${showTitle} · ${watchedLabel}`, 'Log note', () => {
          pushRoute({ view: 'show-detail', showId });
        });
      }
    },
    [pushRoute, showToast]
  );

  const toggleEpisodeWatched = useCallback((showId: string, season: number, number: number) => {
    setState((prev) => {
      const show = prev.shows[showId];
      if (!show) return prev;
      const prog = prev.showProgress[showId];
      const epKey = getEpisodeKey(season, number);
      const current = prog?.episodeCounts?.[epKey] || 0;
      const nextCounts = {
        ...(prog?.episodeCounts || {}),
        [epKey]: current > 0 ? 0 : 1,
      };
      return {
        ...prev,
        showProgress: {
          ...prev.showProgress,
          [showId]: recomputeShowStatus(show, nextCounts, prog),
        },
      };
    });
  }, []);

  const incrementEpisodeRewatch = useCallback(
    (showId: string, season: number, number: number, delta: number) => {
      setState((prev) => {
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
      setState((prev) => {
        const existing = prev.showProgress[showId];
        nextBookmarked = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: nextBookmarked,
              notifications: existing?.notifications ?? true,
              lastWatchedAt: existing?.lastWatchedAt,
              rating: existing?.rating,
              mood: existing?.mood,
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
      setState((prev) => {
        const existing = prev.showProgress[showId];
        nextVal = !(existing?.notifications ?? true);
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: {
              status: existing?.status || 'not_started',
              episodeCounts: existing?.episodeCounts || {},
              bookmarked: existing?.bookmarked ?? true,
              notifications: nextVal,
              lastWatchedAt: existing?.lastWatchedAt,
              rating: existing?.rating,
              mood: existing?.mood,
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
      setState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const season = show.seasons.find((s) => s.number === seasonNumber);
        if (!season) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        const allWatched = season.episodes.every(
          (ep) => (nextCounts[getEpisodeKey(ep.season, ep.number)] || 0) > 0
        );
        for (const ep of season.episodes) {
          const k = getEpisodeKey(ep.season, ep.number);
          if (allWatched && rewatchIfDone) nextCounts[k] = (nextCounts[k] || 1) + 1;
          else if (allWatched) nextCounts[k] = 0;
          else nextCounts[k] = Math.max(1, nextCounts[k] || 0);
        }
        return {
          ...prev,
          showProgress: {
            ...prev.showProgress,
            [showId]: recomputeShowStatus(show, nextCounts, prog),
          },
        };
      });
      showToast(`Updated Season ${seasonNumber}`);
    },
    [showToast]
  );

  const markShowAllWatched = useCallback(
    (showId: string) => {
      setState((prev) => {
        const show = prev.shows[showId];
        if (!show) return prev;
        const prog = prev.showProgress[showId];
        const nextCounts = { ...(prog?.episodeCounts || {}) };
        for (const ep of getAllEpisodes(show)) {
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
      showToast('Marked all episodes watched');
    },
    [showToast]
  );

  const startShowRewatch = useCallback(
    (showId: string) => {
      setState((prev) => {
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
      setState((prev) => {
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

  const rateShow = useCallback((showId: string, rating: number) => {
    setState((prev) => {
      const existing = prev.showProgress[showId];
      return {
        ...prev,
        showProgress: {
          ...prev.showProgress,
          [showId]: {
            status: existing?.status || 'watching',
            episodeCounts: existing?.episodeCounts || {},
            bookmarked: existing?.bookmarked ?? true,
            notifications: existing?.notifications ?? true,
            lastWatchedAt: existing?.lastWatchedAt,
            rating,
            mood: existing?.mood,
          },
        },
      };
    });
  }, []);

  const setShowMood = useCallback((showId: string, mood: PersonalMood | undefined) => {
    setState((prev) => {
      const existing = prev.showProgress[showId];
      return {
        ...prev,
        showProgress: {
          ...prev.showProgress,
          [showId]: {
            status: existing?.status || 'watching',
            episodeCounts: existing?.episodeCounts || {},
            bookmarked: existing?.bookmarked ?? true,
            notifications: existing?.notifications ?? true,
            lastWatchedAt: existing?.lastWatchedAt,
            rating: existing?.rating,
            mood,
          },
        },
      };
    });
  }, []);

  const toggleMovieWatched = useCallback(
    (movieId: string) => {
      let nowWatched = true;
      let title = '';
      setState((prev) => {
        const movie = prev.movies[movieId];
        if (!movie) return prev;
        title = movie.title;
        const existing = prev.movieProgress[movieId];
        const isWatched = (existing?.watchCount || 0) > 0;
        nowWatched = !isWatched;
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: {
              status: isWatched ? 'watchlist' : 'watched',
              watchCount: isWatched ? 0 : 1,
              watchedAt: isWatched ? undefined : new Date().toISOString(),
              rating: existing?.rating,
              mood: existing?.mood,
            },
          },
        };
      });
      if (title) {
        showToast(
          nowWatched ? `Watched ${title}` : `Moved ${title} back to Watchlist`,
          nowWatched ? 'Journal' : undefined,
          () => pushRoute({ view: 'movie-detail', movieId })
        );
      }
    },
    [pushRoute, showToast]
  );

  const incrementMovieRewatch = useCallback(
    (movieId: string, delta: number) => {
      setState((prev) => {
        const existing = prev.movieProgress[movieId];
        const nextCount = Math.max(0, (existing?.watchCount || 0) + delta);
        return {
          ...prev,
          movieProgress: {
            ...prev.movieProgress,
            [movieId]: {
              status: nextCount > 0 ? 'watched' : 'watchlist',
              watchCount: nextCount,
              watchedAt: nextCount > 0 ? new Date().toISOString() : undefined,
              rating: existing?.rating,
              mood: existing?.mood,
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
      setState((prev) => {
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

  const rateMovie = useCallback((movieId: string, rating: number) => {
    setState((prev) => {
      const existing = prev.movieProgress[movieId];
      return {
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            status: existing?.status || 'watched',
            watchCount: Math.max(1, existing?.watchCount || 0),
            watchedAt: existing?.watchedAt || new Date().toISOString(),
            rating,
            mood: existing?.mood,
          },
        },
      };
    });
  }, []);

  const setMovieMood = useCallback((movieId: string, mood: PersonalMood | undefined) => {
    setState((prev) => {
      const existing = prev.movieProgress[movieId];
      return {
        ...prev,
        movieProgress: {
          ...prev.movieProgress,
          [movieId]: {
            status: existing?.status || 'watchlist',
            watchCount: existing?.watchCount || 0,
            watchedAt: existing?.watchedAt,
            rating: existing?.rating,
            mood,
          },
        },
      };
    });
  }, []);

  // Read actions
  const normalizeReadProgress = (
    item: ReadItem,
    nextUnit: number,
    prev?: ReadProgress
  ): ReadProgress => {
    const clamped = Math.min(item.totalUnits, Math.max(0, nextUnit));
    const finished = clamped >= item.totalUnits;
    return {
      status: finished ? 'finished' : clamped > 0 ? 'reading' : 'want_to_read',
      currentUnit: clamped,
      rereadCount: finished ? Math.max(1, prev?.rereadCount || 0) : prev?.rereadCount || 0,
      bookmarked: prev?.bookmarked ?? true,
      lastReadAt: clamped > 0 ? new Date().toISOString() : prev?.lastReadAt,
      rating: prev?.rating,
      mood: prev?.mood,
    };
  };

  const advanceReadProgress = useCallback(
    (readId: string, delta?: number) => {
      let msg = '';
      setState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const step = delta ?? 1;
        const nextVal = Math.min(item.totalUnits, (prog?.currentUnit || 0) + step);
        const updated = normalizeReadProgress(item, nextVal, prog);
        const unitLabel =
          item.unit === 'issues' ? `Issue #${updated.currentUnit}` : `Ch. ${updated.currentUnit}`;
        msg = updated.status === 'finished' ? `Finished ${item.title}` : `${item.title} · ${unitLabel}`;
        return {
          ...prev,
          readProgress: { ...prev.readProgress, [readId]: updated },
        };
      });
      if (msg) {
        showToast(msg, 'Log note', () => pushRoute({ view: 'read-detail', readId }));
      }
    },
    [pushRoute, showToast]
  );

  const setReadProgress = useCallback((readId: string, currentUnit: number) => {
    setState((prev) => {
      const item = prev.readItems[readId];
      if (!item) return prev;
      const prog = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: normalizeReadProgress(item, currentUnit, prog),
        },
      };
    });
  }, []);

  const updateReadTotalUnits = useCallback((readId: string, totalUnits: number) => {
    const safeTotal = Math.max(1, Math.round(totalUnits));
    setState((prev) => {
      const item = prev.readItems[readId];
      if (!item) return prev;
      const updatedItem = { ...item, totalUnits: safeTotal };
      const prog = prev.readProgress[readId];
      return {
        ...prev,
        readItems: { ...prev.readItems, [readId]: updatedItem },
        readProgress: prog
          ? { ...prev.readProgress, [readId]: normalizeReadProgress(updatedItem, prog.currentUnit, prog) }
          : prev.readProgress,
      };
    });
  }, []);

  const markReadFinished = useCallback(
    (readId: string) => {
      let title = '';
      setState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        title = item.title;
        const prog = prev.readProgress[readId];
        const isDone = prog?.status === 'finished';
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              status: isDone ? 'finished' : 'finished',
              currentUnit: item.totalUnits,
              rereadCount: isDone ? (prog?.rereadCount || 1) + 1 : Math.max(1, prog?.rereadCount || 0),
              bookmarked: prog?.bookmarked ?? true,
              lastReadAt: new Date().toISOString(),
              rating: prog?.rating,
              mood: prog?.mood,
            },
          },
        };
      });
      if (title) showToast(`Logged ${title}`);
    },
    [showToast]
  );

  const incrementReread = useCallback(
    (readId: string, delta: number) => {
      setState((prev) => {
        const item = prev.readItems[readId];
        if (!item) return prev;
        const prog = prev.readProgress[readId];
        const nextReread = Math.max(0, (prog?.rereadCount || 0) + delta);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              status: nextReread > 0 ? 'finished' : 'reading',
              currentUnit: nextReread > 0 ? item.totalUnits : prog?.currentUnit || 0,
              rereadCount: nextReread,
              bookmarked: prog?.bookmarked ?? true,
              lastReadAt: new Date().toISOString(),
              rating: prog?.rating,
              mood: prog?.mood,
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
      setState((prev) => {
        const existing = prev.readProgress[readId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              status: existing?.status || 'want_to_read',
              currentUnit: existing?.currentUnit || 0,
              rereadCount: existing?.rereadCount || 0,
              bookmarked: added,
              lastReadAt: existing?.lastReadAt,
              rating: existing?.rating,
              mood: existing?.mood,
            },
          },
        };
      });
      showToast(added ? 'Added to Read library' : 'Removed from Read library');
    },
    [showToast]
  );

  const rateReadItem = useCallback((readId: string, rating: number) => {
    setState((prev) => {
      const existing = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: {
            status: existing?.status || 'reading',
            currentUnit: existing?.currentUnit || 0,
            rereadCount: existing?.rereadCount || 0,
            bookmarked: existing?.bookmarked ?? true,
            lastReadAt: existing?.lastReadAt,
            rating,
            mood: existing?.mood,
          },
        },
      };
    });
  }, []);

  const setReadMood = useCallback((readId: string, mood: PersonalMood | undefined) => {
    setState((prev) => {
      const existing = prev.readProgress[readId];
      return {
        ...prev,
        readProgress: {
          ...prev.readProgress,
          [readId]: {
            status: existing?.status || 'reading',
            currentUnit: existing?.currentUnit || 0,
            rereadCount: existing?.rereadCount || 0,
            bookmarked: existing?.bookmarked ?? true,
            lastReadAt: existing?.lastReadAt,
            rating: existing?.rating,
            mood,
          },
        },
      };
    });
  }, []);

  const resetReadProgress = useCallback(
    (readId: string) => {
      setState((prev) => {
        const existing = prev.readProgress[readId];
        return {
          ...prev,
          readProgress: {
            ...prev.readProgress,
            [readId]: {
              status: 'want_to_read',
              currentUnit: 0,
              rereadCount: 0,
              bookmarked: existing?.bookmarked ?? true,
            },
          },
        };
      });
      showToast('Reset reading progress');
    },
    [showToast]
  );

  // Play actions
  const logGameSession = useCallback(
    (gameId: string, hoursDelta: number) => {
      let label = '';
      setState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const prog = prev.gameProgress[gameId];
        const nextHours = Math.max(0, Math.round(((prog?.hoursPlayed || 0) + hoursDelta) * 10) / 10);
        const nextPct =
          prog?.status === 'completed'
            ? prog.completionPct
            : Math.min(100, (prog?.completionPct || 0) + (hoursDelta > 0 ? 5 : 0));
        label = `${game.title} · ${nextHours}h logged`;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              status: prog?.status === 'completed' ? 'completed' : nextHours > 0 ? 'playing' : 'backlog',
              hoursPlayed: nextHours,
              completionPct: nextPct,
              playthroughCount: prog?.playthroughCount || 0,
              platinum: prog?.platinum ?? false,
              platform: prog?.platform || game.platforms[0] || 'PC',
              bookmarked: prog?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              rating: prog?.rating,
              mood: prog?.mood,
            },
          },
        };
      });
      if (label) showToast(label, 'Log note', () => pushRoute({ view: 'game-detail', gameId }));
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
      setState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextStatus = patch.status ?? existing?.status ?? 'playing';
        const nextPct = patch.completionPct ?? existing?.completionPct ?? 0;
        const nextPlaythroughs =
          nextStatus === 'completed'
            ? Math.max(1, existing?.playthroughCount || 0)
            : existing?.playthroughCount || 0;
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              status: nextStatus,
              hoursPlayed: patch.hoursPlayed ?? existing?.hoursPlayed ?? 0,
              completionPct: nextPct,
              playthroughCount: nextPlaythroughs,
              platinum: existing?.platinum ?? false,
              platform: patch.platform ?? existing?.platform ?? game.platforms[0] ?? 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              rating: existing?.rating,
              mood: existing?.mood,
            },
          },
        };
      });
    },
    []
  );

  const toggleGameCompleted = useCallback(
    (gameId: string) => {
      let msg = '';
      setState((prev) => {
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
              status: nextDone ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: nextDone ? Math.max(100, existing?.completionPct || 100) : existing?.completionPct || 50,
              playthroughCount: nextDone ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              rating: existing?.rating,
              mood: existing?.mood,
            },
          },
        };
      });
      if (msg) showToast(msg);
    },
    [showToast]
  );

  const toggleGamePlatinum = useCallback((gameId: string) => {
    setState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      const nextPlat = !(existing?.platinum ?? false);
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            status: nextPlat ? 'completed' : existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: nextPlat ? 100 : existing?.completionPct || 0,
            playthroughCount: nextPlat ? Math.max(1, existing?.playthroughCount || 0) : existing?.playthroughCount || 0,
            platinum: nextPlat,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            lastPlayedAt: new Date().toISOString(),
            rating: existing?.rating,
            mood: existing?.mood,
          },
        },
      };
    });
  }, []);

  const incrementGamePlaythrough = useCallback(
    (gameId: string, delta: number) => {
      setState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        const nextCount = Math.max(0, (existing?.playthroughCount || 0) + delta);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              status: nextCount > 0 ? 'completed' : 'playing',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 100,
              playthroughCount: nextCount,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: existing?.bookmarked ?? true,
              lastPlayedAt: new Date().toISOString(),
              rating: existing?.rating,
              mood: existing?.mood,
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
      setState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        added = !(existing?.bookmarked ?? false);
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              status: existing?.status || 'backlog',
              hoursPlayed: existing?.hoursPlayed || 0,
              completionPct: existing?.completionPct || 0,
              playthroughCount: existing?.playthroughCount || 0,
              platinum: existing?.platinum ?? false,
              platform: existing?.platform || game.platforms[0] || 'PC',
              bookmarked: added,
              lastPlayedAt: existing?.lastPlayedAt,
              rating: existing?.rating,
              mood: existing?.mood,
            },
          },
        };
      });
      showToast(added ? 'Added to Play library' : 'Removed from Play library');
    },
    [showToast]
  );

  const rateGame = useCallback((gameId: string, rating: number) => {
    setState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            status: existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: existing?.completionPct || 0,
            playthroughCount: existing?.playthroughCount || 0,
            platinum: existing?.platinum ?? false,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            lastPlayedAt: existing?.lastPlayedAt,
            rating,
            mood: existing?.mood,
          },
        },
      };
    });
  }, []);

  const setGameMood = useCallback((gameId: string, mood: PersonalMood | undefined) => {
    setState((prev) => {
      const game = prev.games[gameId];
      if (!game) return prev;
      const existing = prev.gameProgress[gameId];
      return {
        ...prev,
        gameProgress: {
          ...prev.gameProgress,
          [gameId]: {
            status: existing?.status || 'playing',
            hoursPlayed: existing?.hoursPlayed || 0,
            completionPct: existing?.completionPct || 0,
            playthroughCount: existing?.playthroughCount || 0,
            platinum: existing?.platinum ?? false,
            platform: existing?.platform || game.platforms[0] || 'PC',
            bookmarked: existing?.bookmarked ?? true,
            lastPlayedAt: existing?.lastPlayedAt,
            rating: existing?.rating,
            mood,
          },
        },
      };
    });
  }, []);

  const resetGameProgress = useCallback(
    (gameId: string) => {
      setState((prev) => {
        const game = prev.games[gameId];
        if (!game) return prev;
        const existing = prev.gameProgress[gameId];
        return {
          ...prev,
          gameProgress: {
            ...prev.gameProgress,
            [gameId]: {
              status: 'backlog',
              hoursPlayed: 0,
              completionPct: 0,
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

  // Live additions
  const addLiveShowToStore = useCallback(
    (show: Show, andBookmark = true) => {
      setState((prev) => {
        const exists = Boolean(prev.shows[show.id]);
        return {
          ...prev,
          shows: { ...prev.shows, [show.id]: show },
          showOrder: exists ? prev.showOrder : [show.id, ...prev.showOrder],
          showProgress: andBookmark
            ? {
                ...prev.showProgress,
                [show.id]: prev.showProgress[show.id] || {
                  status: 'not_started',
                  episodeCounts: {},
                  bookmarked: true,
                  notifications: true,
                },
              }
            : prev.showProgress,
        };
      });
      if (andBookmark) showToast(`Added ${show.title} to Watch`);
    },
    [showToast]
  );

  const addLiveMovieToStore = useCallback(
    (movie: Movie, status: MovieWatchStatus = 'watchlist') => {
      setState((prev) => {
        const exists = Boolean(prev.movies[movie.id]);
        return {
          ...prev,
          movies: { ...prev.movies, [movie.id]: movie },
          movieOrder: exists ? prev.movieOrder : [movie.id, ...prev.movieOrder],
          movieProgress: {
            ...prev.movieProgress,
            [movie.id]: prev.movieProgress[movie.id] || {
              status,
              watchCount: status === 'watched' ? 1 : 0,
              watchedAt: status === 'watched' ? new Date().toISOString() : undefined,
            },
          },
        };
      });
      showToast(`Added ${movie.title} to Watch`);
    },
    [showToast]
  );

  const addLiveReadToStore = useCallback(
    (item: ReadItem, status: ReadWatchStatus = 'want_to_read') => {
      setState((prev) => {
        const exists = Boolean(prev.readItems[item.id]);
        return {
          ...prev,
          readItems: { ...prev.readItems, [item.id]: item },
          readOrder: exists ? prev.readOrder : [item.id, ...prev.readOrder],
          readProgress: {
            ...prev.readProgress,
            [item.id]: prev.readProgress[item.id] || {
              status,
              currentUnit: 0,
              rereadCount: 0,
              bookmarked: true,
            },
          },
        };
      });
      showToast(`Added ${item.title} to Read`);
    },
    [showToast]
  );

  const addLiveGameToStore = useCallback(
    (game: GameItem, status: GameWatchStatus = 'backlog') => {
      setState((prev) => {
        const exists = Boolean(prev.games[game.id]);
        return {
          ...prev,
          games: { ...prev.games, [game.id]: game },
          gameOrder: exists ? prev.gameOrder : [game.id, ...prev.gameOrder],
          gameProgress: {
            ...prev.gameProgress,
            [game.id]: prev.gameProgress[game.id] || {
              status,
              hoursPlayed: 0,
              completionPct: 0,
              playthroughCount: 0,
              platinum: false,
              platform: game.platforms[0] || 'PC',
              bookmarked: true,
            },
          },
        };
      });
      showToast(`Added ${game.title} to Play`);
    },
    [showToast]
  );

  // Private Journal & Lists
  const addJournalEntry = useCallback(
    (input: Omit<JournalEntry, 'id' | 'createdAt'>) => {
      setState((prev) => ({
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
      setState((prev) => ({
        ...prev,
        journalEntries: prev.journalEntries.filter((j) => j.id !== entryId),
      }));
      showToast('Journal entry deleted');
    },
    [showToast]
  );

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const createCustomList = useCallback(
    (
      name: string,
      description: string,
      initialItem?: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }
    ) => {
      setState((prev) => ({
        ...prev,
        lists: [
          {
            id: `list-${Date.now()}`,
            name: name.trim(),
            description: description.trim(),
            items: initialItem ? [initialItem] : [],
            createdAt: new Date().toISOString(),
          },
          ...prev.lists,
        ],
      }));
      showToast(`Created list "${name.trim()}"`);
    },
    [showToast]
  );

  const toggleItemInList = useCallback(
    (listId: string, kind: 'show' | 'movie' | 'read' | 'game', id: string) => {
      let added = false;
      setState((prev) => ({
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
      }));
      showToast(added ? 'Added to list' : 'Removed from list');
    },
    [showToast]
  );

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      setState((prev) => ({
        ...prev,
        profile: { ...prev.profile, ...patch },
      }));
      showToast('Profile saved');
    },
    [showToast]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setState((prev) => ({
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

  const importLibraryJson = useCallback(
    (rawJson: string): { ok: boolean; summary: string } => {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed?.app === 'cue' && parsed?.state?.shows && parsed?.state?.readItems) {
          setState(parsed.state as CueStoreState);
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

        setState((prev) => {
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
      if (scope === 'all') {
        setState(createSeedState());
        showToast('Restored default library');
        return;
      }
      if (scope === 'watch') {
        setState((prev) => {
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
          return { ...prev, showProgress: nextShows, movieProgress: nextMovies };
        });
        showToast('Reset Watch history');
        return;
      }
      if (scope === 'read') {
        setState((prev) => {
          const nextRead: Record<string, ReadProgress> = {};
          for (const id of Object.keys(prev.readProgress)) {
            nextRead[id] = {
              status: 'want_to_read',
              currentUnit: 0,
              rereadCount: 0,
              bookmarked: prev.readProgress[id].bookmarked,
            };
          }
          return { ...prev, readProgress: nextRead };
        });
        showToast('Reset Read progress');
        return;
      }
      setState((prev) => {
        const nextGames = { ...prev.gameProgress };
        for (const id of Object.keys(nextGames)) {
          nextGames[id] = {
            ...nextGames[id],
            status: 'backlog',
            hoursPlayed: 0,
            completionPct: 0,
            playthroughCount: 0,
            platinum: false,
          };
        }
        return { ...prev, gameProgress: nextGames };
      });
      showToast('Reset Play progress');
    },
    [showToast]
  );

  // Sync functions
  const createSyncCode = useCallback(() => {
    const code = generateSyncCode();
    setSyncCode(code);
    setSyncError(null);
    showToast(`Created sync code: ${code}`);
    return code;
  }, [showToast]);

  const linkSyncCode = useCallback(async (code: string): Promise<{ ok: boolean; message?: string }> => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const { pullCloudLibrary } = await import('../services/syncApi');
      const result = await pullCloudLibrary(code);
      if (result.exists && result.state) {
        setState(result.state);
        setSyncCode(code);
        setLastSyncedAt(result.updatedAt || Date.now());
        setSyncStatus('success');
        showToast('Linked and synced from cloud');
        return { ok: true };
      } else {
        setSyncStatus('error');
        setSyncError(result.error || 'Sync code not found');
        return { ok: false, message: result.error || 'Sync code not found' };
      }
    } catch {
      setSyncStatus('error');
      setSyncError('Failed to link sync code');
      return { ok: false, message: 'Failed to link sync code' };
    }
  }, [showToast]);

  const syncNow = useCallback(async () => {
    if (!syncCode) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const { pushCloudLibrary } = await import('../services/syncApi');
      const result = await pushCloudLibrary(syncCode, state);
      if (result.ok) {
        setLastSyncedAt(result.updatedAt);
        setSyncStatus('success');
        showToast('Synced to cloud');
      } else {
        setSyncStatus('error');
        setSyncError(result.error || 'Failed to sync');
      }
    } catch {
      setSyncStatus('error');
      setSyncError('Network error while syncing');
    }
  }, [syncCode, state, showToast]);

  const unlinkSyncCode = useCallback(() => {
    setSyncCode(null);
    setLastSyncedAt(null);
    setSyncStatus('idle');
    setSyncError(null);
    showToast('Sync code unlinked');
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
        toggleMovieWatched,
        incrementMovieRewatch,
        toggleMovieWatchlist,
        rateMovie,
        setMovieMood,
        advanceReadProgress,
        setReadProgress,
        markReadFinished,
        incrementReread,
        toggleReadBookmark,
        rateReadItem,
        setReadMood,
        updateReadTotalUnits,
        resetReadProgress,
        logGameSession,
        updateGameProgress,
        toggleGameCompleted,
        toggleGamePlatinum,
        incrementGamePlaythrough,
        toggleGameBookmark,
        rateGame,
        setGameMood,
        resetGameProgress,
        addLiveShowToStore,
        addLiveMovieToStore,
        addLiveReadToStore,
        addLiveGameToStore,
        addJournalEntry,
        deleteJournalEntry,
        markAllNotificationsRead,
        createCustomList,
        toggleItemInList,
        updateProfile,
        updateSettings,
        exportLibraryJson,
        importLibraryJson,
        selectiveReset,
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
