export type MediaDomain = 'watch' | 'read' | 'play';
export type ReadFormat = 'novel' | 'manga' | 'comic';
export type ReadUnit = 'chapters' | 'issues';
export type ComicEditionId = 'digital' | 'tpb' | 'compact' | 'hardcover' | 'absolute';
export type GamePlatform = 'PC' | 'PS5' | 'Switch' | 'Xbox' | 'Steam Deck';

export type ShowWatchStatus = 'watching' | 'not_started' | 'finished';
export type MovieWatchStatus = 'watchlist' | 'watched' | 'coming_soon';
export type ReadWatchStatus = 'reading' | 'want_to_read' | 'finished';
export type GameWatchStatus = 'playing' | 'backlog' | 'completed';

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
  genres: string[];
  rating: number;
  coverUrl: string;
  backdropUrl: string;
  overview: string;
  editionCovers?: Partial<Record<ComicEditionId, string>>;
  editionIssueCounts?: Partial<Record<ComicEditionId, number>>;
  baseTotalUnits?: number;
}

export interface GameItem {
  id: string;
  steamAppId?: number;
  title: string;
  developer: string;
  year: number;
  genres: string[];
  rating: number;
  platforms: GamePlatform[];
  coverUrl: string;
  backdropUrl: string;
  overview: string;
}

export interface ShowProgress {
  status: ShowWatchStatus;
  /** Map of "S01E01" -> watch count (0 or absent = unwatched, 1 = watched, 2+ = rewatched) */
  episodeCounts: Record<string, number>;
  bookmarked: boolean;
  notifications: boolean;
  lastWatchedAt?: string;
  rating?: number;
  mood?: PersonalMood;
}

export interface MovieProgress {
  status: MovieWatchStatus;
  watchCount: number;
  watchedAt?: string;
  rating?: number;
  mood?: PersonalMood;
}

export interface ReadProgress {
  status: ReadWatchStatus;
  currentUnit: number;
  maxCompletedUnit?: number;
  rereadCount: number;
  bookmarked: boolean;
  edition?: ComicEditionId;
  lastReadAt?: string;
  rating?: number;
  mood?: PersonalMood;
}

export interface GameProgress {
  status: GameWatchStatus;
  hoursPlayed: number;
  completionPct: number;
  playthroughCount: number;
  platinum: boolean;
  platform: GamePlatform;
  bookmarked: boolean;
  lastPlayedAt?: string;
  rating?: number;
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

export interface CustomList {
  id: string;
  name: string;
  description: string;
  items: { kind: 'show' | 'movie' | 'read' | 'game'; id: string }[];
  createdAt: string;
}

export interface UserProfile {
  name: string;
  handle: string;
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
export type PlayFilter = 'all' | 'playing' | 'backlog' | 'completed';

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
  tmdbApiKey: string;
}

export type RouteView =
  | { view: 'watch'; calendarMode?: boolean }
  | { view: 'read'; calendarMode?: boolean }
  | { view: 'play'; calendarMode?: boolean }
  | { view: 'journal' }
  | { view: 'search' }
  | { view: 'show-detail'; showId: string }
  | { view: 'movie-detail'; movieId: string }
  | { view: 'read-detail'; readId: string }
  | { view: 'game-detail'; gameId: string }
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
  upcoming: UpcomingEntry[];
  history: HistoryEntry[];
  journalEntries: JournalEntry[];
  lists: CustomList[];
  profile: UserProfile;
  notifications: AppNotification[];
  settings: AppSettings;
}