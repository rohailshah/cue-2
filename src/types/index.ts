export type MediaDomain = 'watch' | 'read' | 'play';
export type ReadFormat = 'novel' | 'manga' | 'comic';
export type ReadUnit = 'chapters' | 'issues';
export type GeneralizedComicEditionId = 'digital' | 'tpb' | 'compact' | 'hardcover';
export type ComicEditionId = GeneralizedComicEditionId | 'absolute';
export type ComicEditionFormat =
  | 'digital'
  | 'tpb'
  | 'compact'
  | 'hardcover'
  | 'deluxe'
  | 'absolute'
  | 'omnibus';

export interface ComicEditionRecord {
  id: string;
  format: ComicEditionFormat;
  category: GeneralizedComicEditionId;
  title: string;
  shortLabel: string;
  subtitle?: string;
  issueCount: number;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  isbn?: string;
  pageCount?: number;
  source?: 'curated' | 'openlibrary' | 'custom';
}

export type ComicWikiSlug =
  | 'marvel'
  | 'dc'
  | 'imagecomics'
  | 'darkhorse'
  | 'idw'
  | 'boom'
  | 'comicvine';

export interface ComicIssueMeta {
  number: number;
  issueLabel?: string;
  title?: string;
  seriesTitle?: string;
  releaseDate?: string;
  releaseDateIso?: string;
  coverUrl?: string;
  synopsis?: string;
  writers?: string;
  artists?: string;
  wiki?: ComicWikiSlug;
  pageTitle?: string;
  atomicId?: string;
}

export type OwnershipStatus = 'owned' | 'wishlist';
export type ComicOwnershipStatus = OwnershipStatus;

export interface CollectionDetails {
  format?: string;
  acquiredAt?: string;
  price?: number;
  currency?: string;
  pages?: number;
  runtimeMinutes?: number;
  platform?: string;
  owner?: string;
  includes?: string;
  notes?: string;
}

export interface AtomicReadRecord {
  readAt?: string;
  count: number;
  rating?: number;
  ownership?: ComicOwnershipStatus;
  variantNote?: string;
  seriesTitle?: string;
  issueLabel?: string;
}

export type GamePlatform = 'PC' | 'PS5' | 'Switch' | 'Xbox' | 'Steam Deck';

export type ShowWatchStatus = 'watching' | 'not_started' | 'finished';
export type MovieWatchStatus = 'watchlist' | 'watched' | 'coming_soon';
export type ReadWatchStatus = 'reading' | 'want_to_read' | 'finished';
export type GameWatchStatus = 'playing' | 'backlog' | 'completed' | 'dropped';

export type PersonalMood = 'loved' | 'mindblown' | 'emotional' | 'funny' | 'intense' | 'cozy';

export interface CastMember {
  id: string;
  actor: string;
  character: string;
  avatarUrl: string;
}

export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  airdate: string;
  airstamp?: string;
  runtime: number;
  stillUrl: string;
  overview: string;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export interface Show {
  id: string;
  tvmazeId?: number;
  tmdbId?: number;
  anilistId?: number;
  title: string;
  year: number;
  genres: string[];
  rating: number;
  mediaType: 'tv' | 'anime';
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  runtimeAvg: number;
  network?: string;
  totalEpisodes: number;
  seasons: Season[];
  cast: CastMember[];
}

export interface Movie {
  id: string;
  itunesId?: number;
  tmdbId?: number;
  title: string;
  year: number;
  genres: string[];
  rating: number;
  runtime: number;
  director: string;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  releaseDate: string;
  trailerUrl?: string;
  cast: CastMember[];
}

export interface ReadItem {
  id: string;
  format: ReadFormat;
  unit: ReadUnit;
  title: string;
  creator: string;
  year: number;
  totalUnits: number;
  totalUnitsSource?: 'api' | 'estimated' | 'manual';
  totalUnitsSyncedAt?: string;
  publicationStatus?: 'ongoing' | 'completed' | 'hiatus';
  genres: string[];
  rating: number;
  coverUrl: string;
  backdropUrl: string;
  overview: string;
  editionCovers?: Partial<Record<ComicEditionId, string>>;
  editionIssueCounts?: Partial<Record<ComicEditionId, number>>;
  editionVariants?: Partial<Record<GeneralizedComicEditionId, string[]>>;
  editions?: ComicEditionRecord[];
  issueDetails?: Record<number, ComicIssueMeta>;
  issueDetailsKey?: string;
  baseTotalUnits?: number;
  comicKind?: 'series' | 'collection';
  comicRunLabel?: string;
  comicPublisher?: string;
  comicSeriesWiki?: ComicWikiSlug;
  comicSeriesVolTitle?: string;
  isbn?: string;
}

export type GameChapterUnit = 'chapters' | 'acts' | 'missions' | 'milestones';
export type GameChapterSource = 'catalog' | 'wikipedia' | 'web' | 'manual';

export type RatingSource = 'auto' | 'manual';

export interface CollectionRating {
  rating: number;
  source: RatingSource;
}

export interface GameItem {
  id: string;
  steamAppId?: number;
  igdbId?: number;
  title: string;
  developer: string;
  year: number;
  genres: string[];
  rating: number;
  platforms: GamePlatform[];
  coverUrl: string;
  backdropUrl: string;
  overview: string;
  franchise?: string;
  totalChapters?: number;
  chapterUnit?: GameChapterUnit;
  chapterSource?: GameChapterSource;
  chapterNote?: string;
}

export interface CompletionRun {
  id: string;
  finishedAt: string;
  note?: string;
}

export interface PendingIsbnScan {
  isbn: string;
  scannedAt: string;
}

export interface ShowProgress {
  status: ShowWatchStatus;
  /** Map of "S01E01" -> watch count (0 or absent = unwatched, 1 = watched, 2+ = rewatched) */
  episodeCounts: Record<string, number>;
  bookmarked: boolean;
  notifications: boolean;
  lastWatchedAt?: string;
  finishedAt?: string;
  completedRuns?: CompletionRun[];
  rating?: number;
  ratingSource?: RatingSource;
  episodeRatings?: Record<string, number>;
  episodeFinishedAt?: Record<string, string>;
  seasonRatings?: Record<number, number>;
  seasonRatingSource?: Record<number, RatingSource>;
  seasonFinishedAt?: Record<number, string>;
  ownership?: OwnershipStatus;
  collection?: CollectionDetails;
  mood?: PersonalMood;
}

export interface MovieProgress {
  status: MovieWatchStatus;
  watchCount: number;
  watchedAt?: string;
  completedRuns?: CompletionRun[];
  rating?: number;
  ownership?: OwnershipStatus;
  collection?: CollectionDetails;
  mood?: PersonalMood;
}

export interface ReadProgress {
  status: ReadWatchStatus;
  currentUnit: number;
  completedUnits?: number[];
  maxCompletedUnit?: number;
  rereadCount: number;
  bookmarked: boolean;
  edition?: ComicEditionId;
  editionId?: string;
  editionTitle?: string;
  editionCoverUrl?: string;
  lastReadAt?: string;
  finishedAt?: string;
  completedRuns?: CompletionRun[];
  rating?: number;
  ratingSource?: RatingSource;
  unitRatings?: Record<number, number>;
  unitFinishedAt?: Record<number, string>;
  ownership?: OwnershipStatus;
  collectionNote?: string;
  collection?: CollectionDetails;
  unitOwnership?: Record<number, OwnershipStatus>;
  unitVariantNotes?: Record<number, string>;
  ownedEditionIds?: string[];
  wishlistEditionIds?: string[];
  mood?: PersonalMood;
}

export interface GameProgress {
  status: GameWatchStatus;
  hoursPlayed: number;
  completionPct: number;
  currentChapter?: number;
  chapterRatings?: Record<number, number>;
  chapterFinishedAt?: Record<number, string>;
  chapterTitles?: Record<number, string>;
  playthroughCount: number;
  platinum: boolean;
  platform: GamePlatform;
  bookmarked: boolean;
  lastPlayedAt?: string;
  finishedAt?: string;
  completedRuns?: CompletionRun[];
  rating?: number;
  ratingSource?: RatingSource;
  ownership?: OwnershipStatus;
  collection?: CollectionDetails;
  mood?: PersonalMood;
}

export interface UpcomingEntry {
  id: string;
  domain: MediaDomain;
  kind: 'episode' | 'movie' | 'read' | 'game';
  mediaId: string;
  title: string;
  subtitle: string;
  episodeTitle?: string;
  daysUntil: number;
  groupCount?: number;
  artworkUrl: string;
}

export interface HistoryEntry {
  id: string;
  domain: MediaDomain;
  mediaKind: 'show' | 'movie' | 'read' | 'game';
  mediaId: string;
  title: string;
  posterUrl: string;
  codeLabel: string;
  subtitle: string;
  loggedAt: string;
}

export interface JournalEntry {
  id: string;
  domain: MediaDomain;
  mediaKind: 'show' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
  mediaId: string;
  mediaTitle: string;
  mediaPoster: string;
  contextLabel?: string;
  text: string;
  rating?: number;
  mood?: PersonalMood;
  createdAt: string;
}

export interface CustomListStep {
  id: string;
  title: string;
  seriesTitle: string;
  issueNumber: number;
  atomicId: string;
  readItemId?: string;
}

export interface CustomList {
  id: string;
  name: string;
  description: string;
  items: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }[];
  isOrdered?: boolean;
  steps?: CustomListStep[];
  pinnedToQueue?: boolean;
  createdAt: string;
}

export interface UserProfile {
  name: string;
  handle?: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
}

export interface AppNotification {
  id: string;
  domain: MediaDomain;
  title: string;
  body: string;
  timeLabel: string;
  read: boolean;
  mediaKind?: 'show' | 'movie' | 'read' | 'game';
  mediaId?: string;
}

export type LayoutMode = 'cards' | 'posters';
export type SortMode = 'recent' | 'alpha' | 'progress' | 'rating';
export type WatchFilter = 'all' | 'tv' | 'movie' | 'anime';
export type ReadFilter = 'all' | 'novel' | 'manga' | 'comic';
export type PlayFilter = 'all' | 'playing' | 'backlog' | 'completed' | 'dropped';

export type DetailCardMode = 'simple' | 'advanced';

export interface CueMindFeedback {
  dismissedIds: string[];
  dismissedGenres?: Record<string, number>;
  acceptedCount?: number;
}

export interface AppSettings {
  accentColor: string;
  watchLayout: LayoutMode;
  readLayout: LayoutMode;
  playLayout: LayoutMode;
  watchFilter: WatchFilter;
  readFilter: ReadFilter;
  playFilter: PlayFilter;
  sortBy: SortMode;
  showPosterProgress: boolean;
  groupChapters?: boolean;
  detailMode?: DetailCardMode;
  cueMindIntroDismissed?: boolean;
  skipCatchUpPromptIds?: string[];
  tmdbApiKey: string;
}

export type RouteView =
  | { view: 'queue' }
  | { view: 'watch'; calendarMode?: boolean }
  | { view: 'read'; calendarMode?: boolean }
  | { view: 'play'; calendarMode?: boolean }
  | { view: 'journal' }
  | { view: 'search'; subView?: 'rail' | 'collection' | 'collections' }
  | { view: 'show-detail'; showId: string }
  | { view: 'movie-detail'; movieId: string }
  | { view: 'read-detail'; readId: string }
  | { view: 'read-editions'; readId: string }
  | { view: 'game-detail'; gameId: string }
  | { view: 'library-all' }
  | { view: 'library-watch' }
  | { view: 'library-read' }
  | { view: 'library-play' }
  | { view: 'list-detail'; listId: string };

export interface CueStoreState {
  shows: Record<string, Show>;
  movies: Record<string, Movie>;
  readItems: Record<string, ReadItem>;
  games: Record<string, GameItem>;
  showOrder: string[];
  movieOrder: string[];
  readOrder: string[];
  gameOrder: string[];
  showProgress: Record<string, ShowProgress>;
  movieProgress: Record<string, MovieProgress>;
  readProgress: Record<string, ReadProgress>;
  gameProgress: Record<string, GameProgress>;
  atomicReadUnits?: Record<string, AtomicReadRecord>;
  pendingIsbnScans?: PendingIsbnScan[];
  upcoming: UpcomingEntry[];
  history: HistoryEntry[];
  journalEntries: JournalEntry[];
  lists: CustomList[];
  collectionRatings?: Record<string, CollectionRating>;
  collectionFinishedAt?: Record<string, string>;
  mindFeedback?: CueMindFeedback;
  profile: UserProfile;
  notifications: AppNotification[];
  settings: AppSettings;
}
