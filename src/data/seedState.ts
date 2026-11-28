import generated from './generatedMedia.json';
import type {
  AppNotification,
  CueStoreState,
  CustomList,
  GameItem,
  GameProgress,
  HistoryEntry,
  JournalEntry,
  Movie,
  MovieProgress,
  ReadItem,
  ReadProgress,
  Show,
  ShowProgress,
  UpcomingEntry,
} from '../types';
import { formatEpisodeCode, getAllEpisodes, getEpisodeKey } from '../utils/stats';

const rawShows = generated.shows as Show[];
const rawMovies = generated.movies as Movie[];
const rawReadItems = (generated.readItems || []) as ReadItem[];
const rawGames = (generated.games || []) as GameItem[];

function markFirstEpisodes(show: Show, countToMark: number, watchMultiplier = 1): Record<string, number> {
  const counts: Record<string, number> = {};
  const eps = getAllEpisodes(show);
  for (let i = 0; i < Math.min(countToMark, eps.length); i++) {
    counts[getEpisodeKey(eps[i].season, eps[i].number)] = watchMultiplier;
  }
  return counts;
}

function buildFriendsRewatchCounts(show: Show): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const season of show.seasons) {
    const mult = season.number === 1 ? 4 : season.number === 2 ? 3 : 1;
    for (const ep of season.episodes) {
      counts[getEpisodeKey(ep.season, ep.number)] = mult;
    }
  }
  return counts;
}

export function createSeedState(): CueStoreState {
  const shows: Record<string, Show> = {};
  const showOrder: string[] = [];
  for (const s of rawShows) {
    shows[s.id] = s;
    showOrder.push(s.id);
  }

  const movies: Record<string, Movie> = {};
  const movieOrder: string[] = [];
  for (const m of rawMovies) {
    movies[m.id] = m;
    movieOrder.push(m.id);
  }

  const readItems: Record<string, ReadItem> = {};
  const readOrder: string[] = [];
  for (const r of rawReadItems) {
    readItems[r.id] = r;
    readOrder.push(r.id);
  }

  const games: Record<string, GameItem> = {};
  const gameOrder: string[] = [];
  for (const g of rawGames) {
    games[g.id] = g;
    gameOrder.push(g.id);
  }

  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

  const showProgress: Record<string, ShowProgress> = {
    'house-of-the-dragon': {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['house-of-the-dragon'], 20),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(2),
      rating: 5,
      mood: 'intense',
    },
    'stranger-things': {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['stranger-things'], 33),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(5),
      rating: 5,
      mood: 'loved',
    },
    'the-boys': {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['the-boys'], 31),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(9),
      rating: 4,
      mood: 'intense',
    },
    'the-bear': {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['the-bear'], 37),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(14),
      rating: 5,
      mood: 'emotional',
    },
    silo: {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['silo'], 17),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(24),
      rating: 4,
      mood: 'mindblown',
    },
    severance: {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['severance'], 15),
      bookmarked: true,
      notifications: true,
      lastWatchedAt: hoursAgo(30),
      rating: 5,
      mood: 'mindblown',
    },
    'strange-new-worlds': {
      status: 'watching',
      episodeCounts: markFirstEpisodes(shows['strange-new-worlds'], 28),
      bookmarked: true,
      notifications: false,
      lastWatchedAt: hoursAgo(42),
      rating: 4,
    },
    euphoria: {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: true,
    },
    'king-of-the-hill': {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: false,
    },
    'the-white-lotus': {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: true,
    },
    'squid-game': {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: true,
    },
    'the-last-of-us': {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: true,
    },
    'solo-leveling': {
      status: 'not_started',
      episodeCounts: {},
      bookmarked: true,
      notifications: true,
    },
    friends: {
      status: 'finished',
      episodeCounts: buildFriendsRewatchCounts(shows['friends']),
      bookmarked: true,
      notifications: false,
      lastWatchedAt: hoursAgo(72),
      rating: 5,
      mood: 'cozy',
    },
    'breaking-bad': {
      status: 'finished',
      episodeCounts: markFirstEpisodes(shows['breaking-bad'], 999, 2),
      bookmarked: true,
      notifications: false,
      lastWatchedAt: hoursAgo(120),
      rating: 5,
      mood: 'mindblown',
    },
    'attack-on-titan': {
      status: 'finished',
      episodeCounts: markFirstEpisodes(shows['attack-on-titan'], 999, 1),
      bookmarked: true,
      notifications: false,
      lastWatchedAt: hoursAgo(200),
      rating: 5,
      mood: 'emotional',
    },
  };

  const movieProgress: Record<string, MovieProgress> = {
    sinners: { status: 'watchlist', watchCount: 0 },
    f1: { status: 'watchlist', watchCount: 0 },
    'dune-part-two': { status: 'watchlist', watchCount: 0 },
    'spirited-away': { status: 'watchlist', watchCount: 0 },
    'blade-runner-2049': { status: 'watchlist', watchCount: 0 },
    'avatar-way-of-water': { status: 'watched', watchCount: 1, watchedAt: hoursAgo(440), rating: 4 },
    'avengers-endgame': { status: 'watched', watchCount: 2, watchedAt: hoursAgo(36), rating: 5, mood: 'emotional' },
    titanic: { status: 'watched', watchCount: 2, watchedAt: hoursAgo(96), rating: 5, mood: 'emotional' },
    oppenheimer: { status: 'watched', watchCount: 1, watchedAt: hoursAgo(140), rating: 5, mood: 'intense' },
    interstellar: { status: 'watched', watchCount: 3, watchedAt: hoursAgo(180), rating: 5, mood: 'mindblown' },
    'spider-verse': { status: 'watched', watchCount: 2, watchedAt: hoursAgo(210), rating: 5, mood: 'loved' },
    eeaao: { status: 'watched', watchCount: 1, watchedAt: hoursAgo(260), rating: 4, mood: 'mindblown' },
    parasite: { status: 'watched', watchCount: 1, watchedAt: hoursAgo(310), rating: 5, mood: 'intense' },
    'the-batman': { status: 'watched', watchCount: 1, watchedAt: hoursAgo(400), rating: 4, mood: 'intense' },
  };

  const readProgress: Record<string, ReadProgress> = {
    'dune-book': {
      status: 'reading',
      currentUnit: 28,
      rereadCount: 0,
      bookmarked: true,
      lastReadAt: hoursAgo(3),
      rating: 5,
      mood: 'mindblown',
    },
    berserk: {
      status: 'reading',
      currentUnit: 214,
      rereadCount: 0,
      bookmarked: true,
      lastReadAt: hoursAgo(6),
      rating: 5,
      mood: 'intense',
    },
    saga: {
      status: 'reading',
      currentUnit: 48,
      rereadCount: 0,
      bookmarked: true,
      lastReadAt: hoursAgo(16),
      rating: 5,
      mood: 'loved',
    },
    'chainsaw-man': {
      status: 'reading',
      currentUnit: 142,
      rereadCount: 0,
      bookmarked: true,
      lastReadAt: hoursAgo(22),
      rating: 4,
      mood: 'intense',
    },
    'one-piece': {
      status: 'reading',
      currentUnit: 1082,
      rereadCount: 0,
      bookmarked: true,
      lastReadAt: hoursAgo(40),
      rating: 5,
      mood: 'loved',
    },
    'project-hail-mary': {
      status: 'want_to_read',
      currentUnit: 0,
      rereadCount: 0,
      bookmarked: true,
    },
    'three-body-problem': {
      status: 'want_to_read',
      currentUnit: 0,
      rereadCount: 0,
      bookmarked: true,
    },
    vagabond: {
      status: 'want_to_read',
      currentUnit: 0,
      rereadCount: 0,
      bookmarked: true,
    },
    'invincible-comic': {
      status: 'want_to_read',
      currentUnit: 0,
      rereadCount: 0,
      bookmarked: true,
    },
    watchmen: {
      status: 'finished',
      currentUnit: 12,
      rereadCount: 2,
      bookmarked: true,
      lastReadAt: hoursAgo(90),
      rating: 5,
      mood: 'mindblown',
    },
    piranesi: {
      status: 'finished',
      currentUnit: 18,
      rereadCount: 1,
      bookmarked: true,
      lastReadAt: hoursAgo(150),
      rating: 5,
      mood: 'cozy',
    },
    'batman-year-one': {
      status: 'finished',
      currentUnit: 4,
      rereadCount: 2,
      bookmarked: true,
      lastReadAt: hoursAgo(230),
      rating: 5,
      mood: 'intense',
    },
  };

  const gameProgress: Record<string, GameProgress> = {
    'elden-ring': {
      status: 'playing',
      hoursPlayed: 64,
      completionPct: 78,
      playthroughCount: 0,
      platinum: false,
      platform: 'PS5',
      bookmarked: true,
      lastPlayedAt: hoursAgo(4),
      rating: 5,
      mood: 'intense',
    },
    'baldurs-gate-3': {
      status: 'playing',
      hoursPlayed: 88,
      completionPct: 65,
      playthroughCount: 0,
      platinum: false,
      platform: 'PC',
      bookmarked: true,
      lastPlayedAt: hoursAgo(11),
      rating: 5,
      mood: 'loved',
    },
    'hades-ii': {
      status: 'playing',
      hoursPlayed: 24,
      completionPct: 48,
      playthroughCount: 0,
      platinum: false,
      platform: 'Steam Deck',
      bookmarked: true,
      lastPlayedAt: hoursAgo(19),
      rating: 5,
      mood: 'intense',
    },
    'cyberpunk-2077': {
      status: 'playing',
      hoursPlayed: 31,
      completionPct: 52,
      playthroughCount: 0,
      platinum: false,
      platform: 'PC',
      bookmarked: true,
      lastPlayedAt: hoursAgo(38),
      rating: 4,
      mood: 'mindblown',
    },
    'zelda-totk': {
      status: 'backlog',
      hoursPlayed: 0,
      completionPct: 0,
      playthroughCount: 0,
      platinum: false,
      platform: 'Switch',
      bookmarked: true,
    },
    'metaphor-refantazio': {
      status: 'backlog',
      hoursPlayed: 0,
      completionPct: 0,
      playthroughCount: 0,
      platinum: false,
      platform: 'PS5',
      bookmarked: true,
    },
    'persona-5-royal': {
      status: 'backlog',
      hoursPlayed: 0,
      completionPct: 0,
      playthroughCount: 0,
      platinum: false,
      platform: 'Switch',
      bookmarked: true,
    },
    'expedition-33': {
      status: 'backlog',
      hoursPlayed: 0,
      completionPct: 0,
      playthroughCount: 0,
      platinum: false,
      platform: 'PC',
      bookmarked: true,
    },
    'hollow-knight': {
      status: 'completed',
      hoursPlayed: 46,
      completionPct: 100,
      playthroughCount: 2,
      platinum: true,
      platform: 'Switch',
      bookmarked: true,
      lastPlayedAt: hoursAgo(110),
      rating: 5,
      mood: 'loved',
    },
    sekiro: {
      status: 'completed',
      hoursPlayed: 68,
      completionPct: 100,
      playthroughCount: 3,
      platinum: true,
      platform: 'PC',
      bookmarked: true,
      lastPlayedAt: hoursAgo(170),
      rating: 5,
      mood: 'intense',
    },
    rdr2: {
      status: 'completed',
      hoursPlayed: 92,
      completionPct: 88,
      playthroughCount: 1,
      platinum: false,
      platform: 'PS5',
      bookmarked: true,
      lastPlayedAt: hoursAgo(240),
      rating: 5,
      mood: 'emotional',
    },
    'witcher-3': {
      status: 'completed',
      hoursPlayed: 118,
      completionPct: 94,
      playthroughCount: 2,
      platinum: false,
      platform: 'PC',
      bookmarked: true,
      lastPlayedAt: hoursAgo(320),
      rating: 5,
      mood: 'loved',
    },
  };

  const upcoming: UpcomingEntry[] = [
    {
      id: 'up-silo-today',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'silo',
      title: 'Silo',
      subtitle: 'S03 E02',
      episodeTitle: "It's All Good",
      daysUntil: 0,
      artworkUrl: shows['silo'].backdropUrl || shows['silo'].posterUrl,
    },
    {
      id: 'up-hotd-today',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'house-of-the-dragon',
      title: 'House of the Dragon',
      subtitle: 'S03 E03',
      episodeTitle: 'Rhaenyra Triumphant',
      daysUntil: 0,
      artworkUrl: shows['house-of-the-dragon'].backdropUrl || shows['house-of-the-dragon'].posterUrl,
    },
    {
      id: 'up-hotd-3d',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'house-of-the-dragon',
      title: 'House of the Dragon',
      subtitle: 'S03 E04',
      episodeTitle: 'Episode 4',
      daysUntil: 3,
      artworkUrl: shows['house-of-the-dragon'].backdropUrl || shows['house-of-the-dragon'].posterUrl,
    },
    {
      id: 'up-bear-5d',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'the-bear',
      title: 'The Bear',
      subtitle: 'S05 E01',
      episodeTitle: 'Season Premiere',
      daysUntil: 5,
      groupCount: 4,
      artworkUrl: shows['the-bear'].backdropUrl || shows['the-bear'].posterUrl,
    },
    {
      id: 'up-hotd-9d',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'house-of-the-dragon',
      title: 'House of the Dragon',
      subtitle: 'S03 E05',
      episodeTitle: 'Episode 5',
      daysUntil: 9,
      artworkUrl: shows['house-of-the-dragon'].backdropUrl || shows['house-of-the-dragon'].posterUrl,
    },
    {
      id: 'up-sev-28d',
      domain: 'watch',
      kind: 'episode',
      mediaId: 'severance',
      title: 'Severance',
      subtitle: 'S03 E01',
      episodeTitle: 'Quarter One',
      daysUntil: 28,
      artworkUrl: shows['severance'].backdropUrl || shows['severance'].posterUrl,
    },
    {
      id: 'up-read-csm',
      domain: 'read',
      kind: 'read',
      mediaId: 'chainsaw-man',
      title: 'Chainsaw Man',
      subtitle: 'Chapter 186 · Jump+',
      daysUntil: 2,
      artworkUrl: readItems['chainsaw-man']?.coverUrl || '',
    },
    {
      id: 'up-read-op',
      domain: 'read',
      kind: 'read',
      mediaId: 'one-piece',
      title: 'One Piece',
      subtitle: 'Chapter 1131',
      daysUntil: 5,
      artworkUrl: readItems['one-piece']?.coverUrl || '',
    },
    {
      id: 'up-read-saga',
      domain: 'read',
      kind: 'read',
      mediaId: 'saga',
      title: 'Saga',
      subtitle: 'Issue #73 · Image Comics',
      daysUntil: 14,
      artworkUrl: readItems['saga']?.coverUrl || '',
    },
    {
      id: 'up-play-er',
      domain: 'play',
      kind: 'game',
      mediaId: 'elden-ring',
      title: 'Elden Ring',
      subtitle: 'Boss Rush Patch',
      daysUntil: 4,
      artworkUrl: games['elden-ring']?.backdropUrl || games['elden-ring']?.coverUrl || '',
    },
    {
      id: 'up-play-hades',
      domain: 'play',
      kind: 'game',
      mediaId: 'hades-ii',
      title: 'Hades II',
      subtitle: 'Major Olympus Update',
      daysUntil: 11,
      artworkUrl: games['hades-ii']?.backdropUrl || games['hades-ii']?.coverUrl || '',
    },
  ];

  const journalEntries: JournalEntry[] = [
    {
      id: 'j-1',
      domain: 'watch',
      mediaKind: 'show',
      mediaId: 'house-of-the-dragon',
      mediaTitle: 'House of the Dragon',
      mediaPoster: shows['house-of-the-dragon'].posterUrl,
      contextLabel: 'S03 E02',
      text: "The Harrenhal sequences feel hypnotic—Ramin Djawadi's score carries the entire second half.",
      rating: 5,
      mood: 'intense',
      createdAt: hoursAgo(2),
    },
    {
      id: 'j-2',
      domain: 'read',
      mediaKind: 'novel',
      mediaId: 'dune-book',
      mediaTitle: 'Dune',
      mediaPoster: readItems['dune-book'].coverUrl,
      contextLabel: 'Ch. 28',
      text: 'The dinner banquet scene on Arrakis says more about politics and ecology in a single chapter than most trilogies.',
      rating: 5,
      mood: 'mindblown',
      createdAt: hoursAgo(5),
    },
    {
      id: 'j-3',
      domain: 'play',
      mediaKind: 'game',
      mediaId: 'elden-ring',
      mediaTitle: 'Elden Ring',
      mediaPoster: games['elden-ring'].coverUrl,
      contextLabel: '64h · PS5',
      text: 'Finally cleared the Haligtree rooftops and beat Malenia solo without spirit ashes. Best boss rush adrenaline all year.',
      rating: 5,
      mood: 'intense',
      createdAt: hoursAgo(8),
    },
    {
      id: 'j-4',
      domain: 'read',
      mediaKind: 'manga',
      mediaId: 'berserk',
      mediaTitle: 'Berserk',
      mediaPoster: readItems['berserk'].coverUrl,
      contextLabel: 'Ch. 214',
      text: 'Every two-page spread from Miura looks like an oil painting carved in ink.',
      rating: 5,
      mood: 'intense',
      createdAt: hoursAgo(18),
    },
    {
      id: 'j-5',
      domain: 'watch',
      mediaKind: 'show',
      mediaId: 'friends',
      mediaTitle: 'Friends',
      mediaPoster: shows['friends'].posterUrl,
      contextLabel: 'S01 E07 · x4',
      text: 'The One with the Blackout remains peak late-night comfort television.',
      rating: 5,
      mood: 'cozy',
      createdAt: hoursAgo(40),
    },
    {
      id: 'j-6',
      domain: 'watch',
      mediaKind: 'movie',
      mediaId: 'interstellar',
      mediaTitle: 'Interstellar',
      mediaPoster: movies['interstellar'].posterUrl,
      contextLabel: 'Rewatch x3',
      text: 'Rewatched on OLED at midnight. The docking scene still feels like holding your breath for 4 minutes straight.',
      rating: 5,
      mood: 'mindblown',
      createdAt: hoursAgo(72),
    },
  ];

  const lists: CustomList[] = [
    {
      id: 'list-scifi-vault',
      name: 'Sci-Fi & Cyberpunk Vault',
      description: 'Across screens, pages, and controllers.',
      items: [
        { kind: 'show', id: 'severance' },
        { kind: 'movie', id: 'blade-runner-2049' },
        { kind: 'read', id: 'dune-book' },
        { kind: 'game', id: 'cyberpunk-2077' },
      ],
      createdAt: hoursAgo(240),
    },
    {
      id: 'list-comfort-classics',
      name: 'All-Time Classics',
      description: 'Favorites I keep coming back to.',
      items: [
        { kind: 'show', id: 'friends' },
        { kind: 'movie', id: 'interstellar' },
        { kind: 'read', id: 'watchmen' },
        { kind: 'game', id: 'hollow-knight' },
      ],
      createdAt: hoursAgo(480),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'n-1',
      domain: 'watch',
      title: 'New episode out now',
      body: 'My lord, a new episode of House of the Dragon is out 🏰',
      timeLabel: 'now',
      read: false,
      mediaKind: 'show',
      mediaId: 'house-of-the-dragon',
    },
    {
      id: 'n-2',
      domain: 'read',
      title: 'Upcoming manga chapter',
      body: 'Chainsaw Man Chapter 186 drops in 2 days.',
      timeLabel: '2h',
      read: false,
      mediaKind: 'read',
      mediaId: 'chainsaw-man',
    },
    {
      id: 'n-3',
      domain: 'play',
      title: 'Game update scheduled',
      body: 'Hades II Major Olympus Update arrives in 11 days.',
      timeLabel: '5h',
      read: true,
      mediaKind: 'game',
      mediaId: 'hades-ii',
    },
  ];

  const walterAvatar =
    shows['breaking-bad']?.cast?.[0]?.avatarUrl ||
    shows['house-of-the-dragon']?.cast?.[0]?.avatarUrl ||
    '';

  const makeShowHistory = (
    id: string,
    showId: string,
    epIndex: number,
    loggedAt: string
  ): HistoryEntry | null => {
    const s = shows[showId];
    if (!s) return null;
    const eps = getAllEpisodes(s);
    const ep = eps[Math.min(Math.max(0, epIndex), eps.length - 1)];
    if (!ep) return null;
    return {
      id,
      domain: 'watch',
      mediaKind: 'show',
      mediaId: s.id,
      title: s.title,
      posterUrl: s.posterUrl,
      codeLabel: formatEpisodeCode(ep.season, ep.number),
      subtitle: ep.title,
      loggedAt,
    };
  };

  const makeReadHistory = (
    id: string,
    readId: string,
    codeLabel: string,
    loggedAt: string
  ): HistoryEntry | null => {
    const r = readItems[readId];
    if (!r) return null;
    return {
      id,
      domain: 'read',
      mediaKind: 'read',
      mediaId: r.id,
      title: r.title,
      posterUrl: r.coverUrl,
      codeLabel,
      subtitle: r.creator,
      loggedAt,
    };
  };

  const makePlayHistory = (
    id: string,
    gameId: string,
    codeLabel: string,
    loggedAt: string
  ): HistoryEntry | null => {
    const g = games[gameId];
    if (!g) return null;
    const prog = gameProgress[gameId];
    return {
      id,
      domain: 'play',
      mediaKind: 'game',
      mediaId: g.id,
      title: g.title,
      posterUrl: g.coverUrl,
      codeLabel,
      subtitle: `${prog?.platform || g.platforms[0] || 'PC'} · ${g.developer}`,
      loggedAt,
    };
  };

  const history: HistoryEntry[] = [
    makeShowHistory('hist-w1', 'house-of-the-dragon', 18, hoursAgo(18)),
    makeShowHistory('hist-w2', 'the-bear', 36, hoursAgo(14)),
    makeShowHistory('hist-w3', 'severance', 14, hoursAgo(8)),
    makeShowHistory('hist-w4', 'house-of-the-dragon', 19, hoursAgo(2)),
    makeReadHistory('hist-r1', 'saga', 'Issue #48', hoursAgo(16)),
    makeReadHistory('hist-r2', 'berserk', 'Ch. 214', hoursAgo(6)),
    makeReadHistory('hist-r3', 'dune-book', 'Ch. 28', hoursAgo(3)),
    makePlayHistory('hist-p1', 'hades-ii', '+1h · 24h', hoursAgo(19)),
    makePlayHistory('hist-p2', 'baldurs-gate-3', '+1h · 88h', hoursAgo(11)),
    makePlayHistory('hist-p3', 'elden-ring', '+1h · 64h', hoursAgo(4)),
  ].filter((x): x is HistoryEntry => Boolean(x));

  return {
    shows,
    movies,
    readItems,
    games,
    showOrder,
    movieOrder,
    readOrder,
    gameOrder,
    showProgress,
    movieProgress,
    readProgress,
    gameProgress,
    upcoming,
    history,
    journalEntries,
    lists,
    collectionRatings: {},
    mindFeedback: {
      dismissedIds: [],
      dismissedGenres: {},
      acceptedCount: 0,
    },
    profile: {
      name: 'Alex',
      bio: 'Private logbook for shows, movies, novels, manga, comics, and games.',
      avatarUrl: walterAvatar,
      bannerUrl: shows['breaking-bad']?.backdropUrl || shows['house-of-the-dragon']?.backdropUrl || '',
    },
    notifications,
    settings: {
      accentColor: '#6EC5D4',
      watchLayout: 'cards',
      readLayout: 'cards',
      playLayout: 'cards',
      watchFilter: 'all',
      readFilter: 'all',
      playFilter: 'all',
      sortBy: 'recent',
      showPosterProgress: true,
      detailMode: 'simple',
      cueMindIntroDismissed: false,
      tmdbApiKey: '',
    },
  };
}

export function createEmptyState(): CueStoreState {
  return {
    shows: {},
    movies: {},
    readItems: {},
    games: {},
    showOrder: [],
    movieOrder: [],
    readOrder: [],
    gameOrder: [],
    showProgress: {},
    movieProgress: {},
    readProgress: {},
    gameProgress: {},
    upcoming: [],
    history: [],
    journalEntries: [],
    lists: [],
    collectionRatings: {},
    mindFeedback: {
      dismissedIds: [],
      dismissedGenres: {},
      acceptedCount: 0,
    },
    profile: {
      name: 'You',
      bio: 'Private logbook for shows, movies, novels, manga, comics, and games.',
      avatarUrl: '',
      bannerUrl: '',
    },
    notifications: [],
    settings: {
      accentColor: '#6EC5D4',
      watchLayout: 'cards',
      readLayout: 'cards',
      playLayout: 'cards',
      watchFilter: 'all',
      readFilter: 'all',
      playFilter: 'all',
      sortBy: 'recent',
      showPosterProgress: true,
      detailMode: 'simple',
      cueMindIntroDismissed: false,
      tmdbApiKey: '',
    },
  };
}
