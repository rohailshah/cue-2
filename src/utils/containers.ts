import type {
  CueStoreState,
  CustomList,
  GeneralizedComicEditionId,
  ReadItem,
  ReadProgress,
} from '../types';
import {
  getAvailableComicEditions,
  getComicEditionLabel,
  getComicEditionSummary,
  normalizeComicEditionId,
  resolveComicEditionTotal,
} from './editions';
import {
  getCompletedReadUnits,
  getReadStats,
  getShowStats,
  isMovieReleased,
} from './stats';
import {
  type ComicWikiSlug,
  extractSeriesTitleFromPageTitle,
  getComicIssueAtomicId,
  isCollectedComicItem,
} from './atoms';
import { applyAutoRating } from './ratings';

export function normalizeCollectionKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MovieCollectionEntrySpec {
  title: string;
  year: number;
  aliases?: string[];
  minYear?: number;
}

export interface MovieCollectionSpec {
  id: string;
  name: string;
  entries: MovieCollectionEntrySpec[];
}

export const KNOWN_MOVIE_COLLECTIONS: MovieCollectionSpec[] = [
  {
    id: 'dark-knight-trilogy',
    name: 'The Dark Knight Trilogy',
    entries: [
      { title: 'Batman Begins', year: 2005 },
      { title: 'The Dark Knight', year: 2008 },
      { title: 'The Dark Knight Rises', year: 2012 },
    ],
  },
  {
    id: 'lord-of-the-rings-trilogy',
    name: 'The Lord of the Rings Trilogy',
    entries: [
      {
        title: 'The Lord of the Rings: The Fellowship of the Ring',
        year: 2001,
        aliases: ['The Fellowship of the Ring', 'Lord of the Rings: The Fellowship of the Ring'],
      },
      {
        title: 'The Lord of the Rings: The Two Towers',
        year: 2002,
        aliases: ['The Two Towers', 'Lord of the Rings: The Two Towers'],
      },
      {
        title: 'The Lord of the Rings: The Return of the King',
        year: 2003,
        aliases: ['The Return of the King', 'Lord of the Rings: The Return of the King'],
      },
    ],
  },
  {
    id: 'hobbit-trilogy',
    name: 'The Hobbit Trilogy',
    entries: [
      { title: 'The Hobbit: An Unexpected Journey', year: 2012 },
      { title: 'The Hobbit: The Desolation of Smaug', year: 2013 },
      { title: 'The Hobbit: The Battle of the Five Armies', year: 2014 },
    ],
  },
  {
    id: 'dune-saga',
    name: 'Dune Trilogy',
    entries: [
      { title: 'Dune', year: 2021, aliases: ['Dune: Part One'], minYear: 2018 },
      { title: 'Dune: Part Two', year: 2024, aliases: ['Dune Part Two', 'Dune 2'] },
      { title: 'Dune: Messiah', year: 2026, aliases: ['Dune Messiah', 'Dune: Part Three'] },
    ],
  },
  {
    id: 'spider-verse-trilogy',
    name: 'Spider-Verse Trilogy',
    entries: [
      { title: 'Spider-Man: Into the Spider-Verse', year: 2018 },
      { title: 'Spider-Man: Across the Spider-Verse', year: 2023 },
      { title: 'Spider-Man: Beyond the Spider-Verse', year: 2027 },
    ],
  },
  {
    id: 'star-wars-original',
    name: 'Star Wars: Original Trilogy',
    entries: [
      {
        title: 'Star Wars: Episode IV - A New Hope',
        year: 1977,
        aliases: ['Star Wars', 'A New Hope', 'Star Wars A New Hope'],
      },
      {
        title: 'The Empire Strikes Back',
        year: 1980,
        aliases: ['Star Wars: Episode V - The Empire Strikes Back'],
      },
      {
        title: 'Return of the Jedi',
        year: 1983,
        aliases: ['Star Wars: Episode VI - Return of the Jedi'],
      },
    ],
  },
  {
    id: 'star-wars-prequel',
    name: 'Star Wars: Prequel Trilogy',
    entries: [
      {
        title: 'Star Wars: Episode I - The Phantom Menace',
        year: 1999,
        aliases: ['The Phantom Menace'],
      },
      {
        title: 'Star Wars: Episode II - Attack of the Clones',
        year: 2002,
        aliases: ['Attack of the Clones'],
      },
      {
        title: 'Star Wars: Episode III - Revenge of the Sith',
        year: 2005,
        aliases: ['Revenge of the Sith'],
      },
    ],
  },
  {
    id: 'star-wars-sequel',
    name: 'Star Wars: Sequel Trilogy',
    entries: [
      {
        title: 'Star Wars: The Force Awakens',
        year: 2015,
        aliases: ['Star Wars: Episode VII - The Force Awakens', 'The Force Awakens'],
      },
      {
        title: 'Star Wars: The Last Jedi',
        year: 2017,
        aliases: ['Star Wars: Episode VIII - The Last Jedi', 'The Last Jedi'],
      },
      {
        title: 'Star Wars: The Rise of Skywalker',
        year: 2019,
        aliases: ['Star Wars: Episode IX - The Rise of Skywalker', 'The Rise of Skywalker'],
      },
    ],
  },
  {
    id: 'matrix-trilogy',
    name: 'The Matrix Trilogy',
    entries: [
      { title: 'The Matrix', year: 1999 },
      { title: 'The Matrix Reloaded', year: 2003 },
      { title: 'The Matrix Revolutions', year: 2003 },
    ],
  },
  {
    id: 'godfather-trilogy',
    name: 'The Godfather Trilogy',
    entries: [
      { title: 'The Godfather', year: 1972 },
      { title: 'The Godfather Part II', year: 1974, aliases: ['The Godfather: Part II'] },
      { title: 'The Godfather Part III', year: 1990, aliases: ['The Godfather: Part III'] },
    ],
  },
  {
    id: 'back-to-the-future',
    name: 'Back to the Future Trilogy',
    entries: [
      { title: 'Back to the Future', year: 1985 },
      { title: 'Back to the Future Part II', year: 1989 },
      { title: 'Back to the Future Part III', year: 1990 },
    ],
  },
  {
    id: 'toy-story-saga',
    name: 'Toy Story Collection',
    entries: [
      { title: 'Toy Story', year: 1995 },
      { title: 'Toy Story 2', year: 1999 },
      { title: 'Toy Story 3', year: 2010 },
      { title: 'Toy Story 4', year: 2019 },
    ],
  },
  {
    id: 'guardians-trilogy',
    name: 'Guardians of the Galaxy Trilogy',
    entries: [
      { title: 'Guardians of the Galaxy', year: 2014 },
      { title: 'Guardians of the Galaxy Vol. 2', year: 2017 },
      { title: 'Guardians of the Galaxy Vol. 3', year: 2023 },
    ],
  },
  {
    id: 'john-wick-collection',
    name: 'John Wick Collection',
    entries: [
      { title: 'John Wick', year: 2014 },
      { title: 'John Wick: Chapter 2', year: 2017 },
      { title: 'John Wick: Chapter 3 - Parabellum', year: 2019, aliases: ['John Wick Chapter 3'] },
      { title: 'John Wick: Chapter 4', year: 2023 },
    ],
  },
  {
    id: 'before-trilogy',
    name: 'The Before Trilogy',
    entries: [
      { title: 'Before Sunrise', year: 1995 },
      { title: 'Before Sunset', year: 2004 },
      { title: 'Before Midnight', year: 2013 },
    ],
  },
  {
    id: 'httyd-trilogy',
    name: 'How to Train Your Dragon Trilogy',
    entries: [
      { title: 'How to Train Your Dragon', year: 2010, minYear: 2008 },
      { title: 'How to Train Your Dragon 2', year: 2014 },
      { title: 'How to Train Your Dragon: The Hidden World', year: 2019 },
    ],
  },
  {
    id: 'kung-fu-panda-trilogy',
    name: 'Kung Fu Panda Trilogy',
    entries: [
      { title: 'Kung Fu Panda', year: 2008 },
      { title: 'Kung Fu Panda 2', year: 2011 },
      { title: 'Kung Fu Panda 3', year: 2016 },
    ],
  },
  {
    id: 'planet-apes-caesar',
    name: 'Planet of the Apes Trilogy',
    entries: [
      { title: 'Rise of the Planet of the Apes', year: 2011 },
      { title: 'Dawn of the Planet of the Apes', year: 2014 },
      { title: 'War for the Planet of the Apes', year: 2017 },
    ],
  },
  {
    id: 'deadpool-trilogy',
    name: 'Deadpool Trilogy',
    entries: [
      { title: 'Deadpool', year: 2016 },
      { title: 'Deadpool 2', year: 2018 },
      { title: 'Deadpool & Wolverine', year: 2024, aliases: ['Deadpool 3'] },
    ],
  },
  {
    id: 'blade-runner-duology',
    name: 'Blade Runner Duology',
    entries: [
      { title: 'Blade Runner', year: 1982 },
      { title: 'Blade Runner 2049', year: 2017 },
    ],
  },
  {
    id: 'knives-out-collection',
    name: 'Knives Out Mysteries',
    entries: [
      { title: 'Knives Out', year: 2019 },
      { title: 'Glass Onion: A Knives Out Mystery', year: 2022, aliases: ['Glass Onion'] },
      { title: 'Wake Up Dead Man: A Knives Out Mystery', year: 2025, aliases: ['Wake Up Dead Man'] },
    ],
  },
  {
    id: 'cornetto-trilogy',
    name: 'Three Flavours Cornetto Trilogy',
    entries: [
      { title: 'Shaun of the Dead', year: 2004 },
      { title: 'Hot Fuzz', year: 2007 },
      { title: "The World's End", year: 2013 },
    ],
  },
  {
    id: 'mad-max-collection',
    name: 'Mad Max Saga',
    entries: [
      { title: 'Mad Max', year: 1979 },
      { title: 'Mad Max 2', year: 1981, aliases: ['The Road Warrior'] },
      { title: 'Mad Max: Fury Road', year: 2015 },
      { title: 'Furiosa: A Mad Max Saga', year: 2024, aliases: ['Furiosa'] },
    ],
  },
  {
    id: 'indiana-jones-trilogy',
    name: 'Indiana Jones Original Trilogy',
    entries: [
      {
        title: 'Raiders of the Lost Ark',
        year: 1981,
        aliases: ['Indiana Jones and the Raiders of the Lost Ark'],
      },
      { title: 'Indiana Jones and the Temple of Doom', year: 1984 },
      { title: 'Indiana Jones and the Last Crusade', year: 1989 },
    ],
  },
  {
    id: 'mcu-avengers-saga',
    name: 'The Avengers Quadrilogy',
    entries: [
      { title: 'The Avengers', year: 2012, minYear: 2010 },
      { title: 'Avengers: Age of Ultron', year: 2015 },
      { title: 'Avengers: Infinity War', year: 2018 },
      { title: 'Avengers: Endgame', year: 2019 },
    ],
  },
];

function entryMatchesTitle(
  candidateTitle: string,
  spec: { title: string; aliases?: string[]; minYear?: number },
  candidateYear?: number
): boolean {
  if (spec.minYear && candidateYear && candidateYear < spec.minYear) return false;
  const norm = normalizeCollectionKey(candidateTitle);
  if (!norm) return false;
  const targets = [spec.title, ...(spec.aliases || [])].map(normalizeCollectionKey);
  return targets.includes(norm);
}

export function findMovieCollection(title: string, year?: number): MovieCollectionSpec | null {
  for (const col of KNOWN_MOVIE_COLLECTIONS) {
    if (col.entries.some((e) => entryMatchesTitle(title, e, year))) {
      return col;
    }
  }
  return null;
}

export interface EvaluatedMovieCollectionEntry {
  title: string;
  year: number;
  movieId?: string;
  watched: boolean;
  userRating?: number;
}

export interface EvaluatedMovieCollection {
  collection: MovieCollectionSpec;
  entries: EvaluatedMovieCollectionEntry[];
  watchedCount: number;
  totalCount: number;
  ratio: number;
  isComplete: boolean;
  remainingCount: number;
  calculatedAvg: number | null;
  ratedCount: number;
}

export function evaluateMovieCollectionProgress(
  collection: MovieCollectionSpec,
  state: CueStoreState
): EvaluatedMovieCollection {
  const entries: EvaluatedMovieCollectionEntry[] = collection.entries.map((spec) => {
    const matchId = state.movieOrder.find((id) => {
      const m = state.movies[id];
      return m && entryMatchesTitle(m.title, spec, m.year);
    });
    const prog = matchId ? state.movieProgress[matchId] : undefined;
    return {
      title: spec.title,
      year: spec.year,
      movieId: matchId,
      watched: Boolean(prog && prog.watchCount > 0),
      userRating: prog?.rating,
    };
  });

  const watchedCount = entries.filter((e) => e.watched).length;
  const totalCount = entries.length;
  const ratedValues = entries
    .map((e) => e.userRating)
    .filter((r): r is number => typeof r === 'number' && r > 0);
  const calculatedAvg =
    ratedValues.length > 0
      ? ratedValues.reduce((sum, r) => sum + r, 0) / ratedValues.length
      : null;

  return {
    collection,
    entries,
    watchedCount,
    totalCount,
    ratio: totalCount > 0 ? watchedCount / totalCount : 0,
    isComplete: totalCount > 0 && watchedCount >= totalCount,
    remainingCount: Math.max(0, totalCount - watchedCount),
    calculatedAvg,
    ratedCount: ratedValues.length,
  };
}

export interface BookSeriesEntrySpec {
  title: string;
  aliases?: string[];
}

export interface BookSeriesSpec {
  id: string;
  name: string;
  author: string;
  entries: BookSeriesEntrySpec[];
}

export const KNOWN_BOOK_SERIES: BookSeriesSpec[] = [
  {
    id: 'dune-chronicles',
    name: 'Dune Chronicles',
    author: 'Frank Herbert',
    entries: [
      { title: 'Dune' },
      { title: 'Dune Messiah' },
      { title: 'Children of Dune' },
      { title: 'God Emperor of Dune' },
    ],
  },
  {
    id: 'remembrance-earths-past',
    name: "Remembrance of Earth's Past",
    author: 'Cixin Liu',
    entries: [
      { title: 'The Three-Body Problem', aliases: ['Three-Body Problem'] },
      { title: 'The Dark Forest' },
      { title: "Death's End" },
    ],
  },
  {
    id: 'lotr-books',
    name: 'The Lord of the Rings',
    author: 'J.R.R. Tolkien',
    entries: [
      { title: 'The Fellowship of the Ring' },
      { title: 'The Two Towers' },
      { title: 'The Return of the King' },
    ],
  },
  {
    id: 'stormlight-archive',
    name: 'The Stormlight Archive',
    author: 'Brandon Sanderson',
    entries: [
      { title: 'The Way of Kings' },
      { title: 'Words of Radiance' },
      { title: 'Oathbringer' },
      { title: 'Rhythm of War' },
      { title: 'Wind and Truth' },
    ],
  },
  {
    id: 'mistborn-era-1',
    name: 'Mistborn Trilogy',
    author: 'Brandon Sanderson',
    entries: [
      { title: 'Mistborn: The Final Empire', aliases: ['The Final Empire', 'Mistborn'] },
      { title: 'The Well of Ascension' },
      { title: 'The Hero of Ages' },
    ],
  },
  {
    id: 'witcher-books',
    name: 'The Witcher Saga',
    author: 'Andrzej Sapkowski',
    entries: [
      { title: 'The Last Wish' },
      { title: 'Sword of Destiny' },
      { title: 'Blood of Elves' },
      { title: 'Time of Contempt' },
      { title: 'Baptism of Fire' },
      { title: 'The Tower of the Swallow' },
      { title: 'The Lady of the Lake' },
    ],
  },
  {
    id: 'asoiaf-books',
    name: 'A Song of Ice and Fire',
    author: 'George R.R. Martin',
    entries: [
      { title: 'A Game of Thrones' },
      { title: 'A Clash of Kings' },
      { title: 'A Storm of Swords' },
      { title: 'A Feast for Crows' },
      { title: 'A Dance with Dragons' },
    ],
  },
  {
    id: 'harry-potter-books',
    name: 'Harry Potter Series',
    author: 'J.K. Rowling',
    entries: [
      {
        title: "Harry Potter and the Sorcerer's Stone",
        aliases: ["Harry Potter and the Philosopher's Stone"],
      },
      { title: 'Harry Potter and the Chamber of Secrets' },
      { title: 'Harry Potter and the Prisoner of Azkaban' },
      { title: 'Harry Potter and the Goblet of Fire' },
      { title: 'Harry Potter and the Order of the Phoenix' },
      { title: 'Harry Potter and the Half-Blood Prince' },
      { title: 'Harry Potter and the Deathly Hallows' },
    ],
  },
  {
    id: 'red-rising-books',
    name: 'Red Rising Saga',
    author: 'Pierce Brown',
    entries: [
      { title: 'Red Rising' },
      { title: 'Golden Son' },
      { title: 'Morning Star' },
      { title: 'Iron Gold' },
      { title: 'Dark Age' },
      { title: 'Light Bringer' },
    ],
  },
  {
    id: 'expanse-books',
    name: 'The Expanse',
    author: 'James S.A. Corey',
    entries: [
      { title: 'Leviathan Wakes' },
      { title: "Caliban's War" },
      { title: "Abaddon's Gate" },
      { title: 'Cibola Burn' },
      { title: 'Nemesis Games' },
      { title: "Babylon's Ashes" },
      { title: 'Persepolis Rising' },
      { title: "Tiamat's Wrath" },
      { title: 'Leviathan Falls' },
    ],
  },
  {
    id: 'foundation-trilogy',
    name: 'Foundation Trilogy',
    author: 'Isaac Asimov',
    entries: [
      { title: 'Foundation' },
      { title: 'Foundation and Empire' },
      { title: 'Second Foundation' },
    ],
  },
  {
    id: 'kingkiller-books',
    name: 'The Kingkiller Chronicle',
    author: 'Patrick Rothfuss',
    entries: [
      { title: 'The Name of the Wind' },
      { title: "The Wise Man's Fear" },
    ],
  },
  {
    id: 'percy-jackson-books',
    name: 'Percy Jackson & the Olympians',
    author: 'Rick Riordan',
    entries: [
      { title: 'The Lightning Thief' },
      { title: 'The Sea of Monsters' },
      { title: "The Titan's Curse" },
      { title: 'The Battle of the Labyrinth' },
      { title: 'The Last Olympian' },
    ],
  },
  {
    id: 'hunger-games-books',
    name: 'The Hunger Games',
    author: 'Suzanne Collins',
    entries: [
      { title: 'The Hunger Games' },
      { title: 'Catching Fire' },
      { title: 'Mockingjay' },
    ],
  },
];

export function findBookSeries(title: string): BookSeriesSpec | null {
  for (const series of KNOWN_BOOK_SERIES) {
    if (series.entries.some((e) => entryMatchesTitle(title, e))) {
      return series;
    }
  }
  return null;
}

export interface EvaluatedBookSeriesEntry {
  title: string;
  readId?: string;
  finished: boolean;
  current: number;
  total: number;
  userRating?: number;
}

export interface EvaluatedBookSeries {
  series: BookSeriesSpec;
  entries: EvaluatedBookSeriesEntry[];
  finishedCount: number;
  totalCount: number;
  ratio: number;
  isComplete: boolean;
  remainingCount: number;
  calculatedAvg: number | null;
  ratedCount: number;
}

export function evaluateBookSeriesProgress(
  series: BookSeriesSpec,
  state: CueStoreState
): EvaluatedBookSeries {
  const entries: EvaluatedBookSeriesEntry[] = series.entries.map((spec) => {
    const matchId = state.readOrder.find((id) => {
      const r = state.readItems[id];
      return r && r.format === 'novel' && entryMatchesTitle(r.title, spec);
    });
    const item = matchId ? state.readItems[matchId] : undefined;
    const prog = matchId ? state.readProgress[matchId] : undefined;
    const stats = item ? getReadStats(item, prog) : null;
    return {
      title: spec.title,
      readId: matchId,
      finished: Boolean(stats?.isFinished),
      current: stats?.current || 0,
      total: stats?.total || 0,
      userRating: prog?.rating,
    };
  });

  const finishedCount = entries.filter((e) => e.finished).length;
  const totalCount = entries.length;
  const ratedValues = entries
    .map((e) => e.userRating)
    .filter((r): r is number => typeof r === 'number' && r > 0);
  const calculatedAvg =
    ratedValues.length > 0
      ? ratedValues.reduce((sum, r) => sum + r, 0) / ratedValues.length
      : null;

  return {
    series,
    entries,
    finishedCount,
    totalCount,
    ratio: totalCount > 0 ? finishedCount / totalCount : 0,
    isComplete: totalCount > 0 && finishedCount >= totalCount,
    remainingCount: Math.max(0, totalCount - finishedCount),
    calculatedAvg,
    ratedCount: ratedValues.length,
  };
}

export interface ComicEditionContainerProgress {
  id: GeneralizedComicEditionId;
  label: string;
  summary: string;
  totalIssues: number;
  completedIssues: number;
  ratio: number;
  isTechnicallyComplete: boolean;
  remainingIssues: number;
  isActive: boolean;
}

export function evaluateComicEditionContainers(
  item: ReadItem,
  progress?: ReadProgress,
  completedUnitsOverride?: number[]
): ComicEditionContainerProgress[] {
  if (item.format !== 'comic') return [];
  const rawUnits = completedUnitsOverride
    ? completedUnitsOverride
    : Array.isArray(progress?.completedUnits)
      ? progress.completedUnits
      : getCompletedReadUnits(item, progress);
  const uniqueUnits = [...new Set(rawUnits.filter((n) => n >= 1))];

  const editions = getAvailableComicEditions(item, progress?.edition);
  const activeEdition = normalizeComicEditionId(progress?.edition);

  return editions.map((ed) => {
    const totalIssues = Math.max(1, resolveComicEditionTotal(item, ed.id));
    const completedIssues = Math.min(
      totalIssues,
      uniqueUnits.filter((u) => u <= totalIssues).length
    );
    const ratio = Math.min(1, completedIssues / totalIssues);
    const remainingIssues = Math.max(0, totalIssues - completedIssues);
    return {
      id: ed.id,
      label: getComicEditionLabel(ed.id, item) || ed.label,
      summary: getComicEditionSummary(item, ed.id),
      totalIssues,
      completedIssues,
      ratio,
      isTechnicallyComplete: completedIssues >= totalIssues,
      remainingIssues,
      isActive: activeEdition === ed.id,
    };
  });
}

export interface OverlappingComicContainer {
  readId: string;
  title: string;
  coverUrl: string;
  comicKind?: 'series' | 'collection';
  sharedTotal: number;
  sharedCompleted: number;
  containerRead: number;
  containerTotal: number;
  ratio: number;
  isComplete: boolean;
}

/** Finds other comic series runs, TPBs, omnibuses, or events in the user's library sharing canonical issue atoms. */
export function evaluateOverlappingComicContainers(
  item: ReadItem,
  state: CueStoreState
): OverlappingComicContainer[] {
  if (item.format !== 'comic' || !item.issueDetails) return [];
  const sourceAtoms = new Set<string>();
  const total = Math.max(1, item.totalUnits);
  for (let u = 1; u <= total; u += 1) {
    const atomId = getComicIssueAtomicId(item.issueDetails[u]);
    if (atomId) sourceAtoms.add(atomId);
  }
  if (sourceAtoms.size === 0) return [];

  const matches: OverlappingComicContainer[] = [];
  for (const otherId of state.readOrder) {
    if (otherId === item.id) continue;
    const other = state.readItems[otherId];
    if (!other || other.format !== 'comic' || !other.issueDetails) continue;
    const otherProg = state.readProgress[otherId];
    const otherCompletedSet = new Set(getCompletedReadUnits(other, otherProg));
    const otherTotal = Math.max(1, other.totalUnits);

    let sharedTotal = 0;
    let sharedCompleted = 0;
    let liveContainerRead = 0;
    for (let u = 1; u <= otherTotal; u += 1) {
      const atomId = getComicIssueAtomicId(other.issueDetails[u]);
      const isAtomRead = Boolean(atomId && (state.atomicReadUnits?.[atomId]?.count || 0) > 0);
      const isRead = otherCompletedSet.has(u) || isAtomRead;
      if (isRead) liveContainerRead += 1;
      if (atomId && sourceAtoms.has(atomId)) {
        sharedTotal += 1;
        if (isRead) sharedCompleted += 1;
      }
    }
    if (sharedTotal === 0) continue;

    const containerRead = Math.min(otherTotal, Math.max(otherCompletedSet.size, liveContainerRead));
    matches.push({
      readId: otherId,
      title: other.title,
      coverUrl: other.coverUrl,
      comicKind: other.comicKind,
      sharedTotal,
      sharedCompleted,
      containerRead,
      containerTotal: otherTotal,
      ratio: Math.min(1, containerRead / otherTotal),
      isComplete: containerRead >= otherTotal,
    });
  }

  return matches.sort((a, b) => b.sharedTotal - a.sharedTotal || b.ratio - a.ratio);
}

export interface IncludedComicSeriesContainer {
  readId: string;
  title: string;
  coverUrl: string;
  publisher?: string;
  year: number;
  wiki?: ComicWikiSlug;
  volTitle?: string;
  sharedTotal: number;
  sharedCompleted: number;
  ratio: number;
  isComplete: boolean;
}

function extractCanonicalVolTitleFromPageTitle(pageTitle?: string): string | undefined {
  if (!pageTitle) return undefined;
  const m = pageTitle.match(/^(.+?\s+Vol\s+\d+)\b/i);
  return m?.[1]?.trim();
}

function extractYearFromReleaseText(raw?: string): number | undefined {
  const m = raw?.match(/\b(19\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Automatically derives constituent parent comic series directly from a collected edition's
 * issue list so Synced Smart Containers populates immediately without manual searches.
 */
export function evaluateIncludedComicSeries(
  item: ReadItem,
  state: CueStoreState,
  existingOverlaps: OverlappingComicContainer[]
): IncludedComicSeriesContainer[] {
  if (item.format !== 'comic' || !isCollectedComicItem(item) || !item.issueDetails) {
    return [];
  }

  const sourceProg = state.readProgress[item.id];
  const sourceCompletedSet = new Set(getCompletedReadUnits(item, sourceProg));
  const total = Math.max(1, item.totalUnits);

  // Build deduplication sets against containers already present in state.readItems
  const existingIds = new Set<string>([item.id]);
  const existingVolKeys = new Set<string>();
  const existingSeriesAtoms = new Set<string>();
  for (const overlap of existingOverlaps) {
    existingIds.add(overlap.readId);
    const other = state.readItems[overlap.readId];
    if (!other) continue;
    if (other.comicSeriesVolTitle) {
      existingVolKeys.add(normalizeCollectionKey(other.comicSeriesVolTitle));
    }
    if (other.comicKind === 'series' && other.issueDetails) {
      for (const meta of Object.values(other.issueDetails)) {
        const atomId = getComicIssueAtomicId(meta);
        if (atomId) existingSeriesAtoms.add(atomId);
      }
    }
  }

  interface GroupAcc {
    readId: string;
    title: string;
    coverUrl: string;
    wiki?: ComicWikiSlug;
    volTitle?: string;
    year?: number;
    atomIds: Set<string>;
    sharedTotal: number;
    sharedCompleted: number;
  }

  const groups = new Map<string, GroupAcc>();

  for (let u = 1; u <= total; u += 1) {
    const meta = item.issueDetails[u];
    if (!meta) continue;
    const wiki = meta.wiki;
    const volTitle = extractCanonicalVolTitleFromPageTitle(meta.pageTitle) || meta.seriesTitle;
    const seriesTitle =
      meta.seriesTitle || extractSeriesTitleFromPageTitle(meta.pageTitle) || volTitle;
    if (!seriesTitle) continue;

    const slugSource = (volTitle || seriesTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const canonicalId = wiki && volTitle
      ? `comic-series-${wiki}-${slugSource}`
      : `comic-series-auto-${slugSource}`;
    const groupKey = volTitle
      ? `${wiki || 'auto'}::${normalizeCollectionKey(volTitle)}`
      : normalizeCollectionKey(seriesTitle);

    const atomId = getComicIssueAtomicId(meta);
    const isRead =
      sourceCompletedSet.has(u) ||
      Boolean(atomId && (state.atomicReadUnits?.[atomId]?.count || 0) > 0);
    const issueYear = extractYearFromReleaseText(meta.releaseDateIso || meta.releaseDate);

    const prev = groups.get(groupKey);
    if (!prev) {
      const atomIds = new Set<string>();
      if (atomId) atomIds.add(atomId);
      groups.set(groupKey, {
        readId: canonicalId,
        title: seriesTitle,
        coverUrl: meta.coverUrl || item.coverUrl,
        wiki,
        volTitle,
        year: issueYear,
        atomIds,
        sharedTotal: 1,
        sharedCompleted: isRead ? 1 : 0,
      });
    } else {
      prev.sharedTotal += 1;
      if (isRead) prev.sharedCompleted += 1;
      if (!prev.coverUrl && meta.coverUrl) prev.coverUrl = meta.coverUrl;
      if (issueYear && (!prev.year || issueYear < prev.year)) prev.year = issueYear;
      if (atomId) prev.atomIds.add(atomId);
    }
  }

  const out: IncludedComicSeriesContainer[] = [];
  for (const g of groups.values()) {
    if (existingIds.has(g.readId)) continue;
    if (g.volTitle && existingVolKeys.has(normalizeCollectionKey(g.volTitle))) continue;
    let overlapsSeriesInLibrary = false;
    for (const a of g.atomIds) {
      if (existingSeriesAtoms.has(a)) {
        overlapsSeriesInLibrary = true;
        break;
      }
    }
    if (overlapsSeriesInLibrary) continue;

    out.push({
      readId: g.readId,
      title: g.title,
      coverUrl: g.coverUrl || item.coverUrl,
      publisher: item.comicPublisher || item.creator,
      year: g.year || item.year,
      wiki: g.wiki,
      volTitle: g.volTitle,
      sharedTotal: g.sharedTotal,
      sharedCompleted: g.sharedCompleted,
      ratio: Math.min(1, g.sharedCompleted / Math.max(1, g.sharedTotal)),
      isComplete: g.sharedCompleted >= g.sharedTotal,
    });
  }

  return out.sort((a, b) => b.sharedTotal - a.sharedTotal || a.title.localeCompare(b.title));
}

export function buildPreviewReadItemFromIncludedSeries(
  series: IncludedComicSeriesContainer
): ReadItem {
  const pub = series.publisher || 'Marvel Comics';
  return {
    id: series.readId,
    format: 'comic',
    unit: 'issues',
    comicKind: 'series',
    comicPublisher: pub,
    comicSeriesWiki: series.wiki,
    comicSeriesVolTitle: series.volTitle || series.title,
    title: series.title,
    creator: pub,
    year: series.year,
    totalUnits: Math.max(1, series.sharedTotal),
    genres: ['Comics'],
    rating: 4.7,
    coverUrl: series.coverUrl,
    backdropUrl: series.coverUrl,
    overview: `${series.title} (${series.year}) published by ${pub}.`,
  };
}

export type SmartComicContainerEntry =
  | { kind: 'overlap'; data: OverlappingComicContainer }
  | { kind: 'included'; data: IncludedComicSeriesContainer };

const CONTAINER_TITLE_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'vol',
  'volume',
  'book',
  'part',
  'omnibus',
  'compendium',
  'complete',
  'collection',
  'epic',
  'deluxe',
  'edition',
  'hardcover',
  'tpb',
  'comics',
  'marvel',
  'trial',
  'return',
  'death',
  'lives',
  'winter',
  'war',
  'age',
  'all',
  'new',
]);

const NOVELTY_OR_SIDE_CONTAINER_RE =
  /\b(?:annual|special|point\s+one|fcbd|free\s+comic\s+book\s+day|not\s+brand\s+echh|giant-size|handbook|preview|sketchbook|what\s+if)\b/i;

function extractMeaningfulTokens(raw: string): string[] {
  return normalizeCollectionKey(raw)
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !CONTAINER_TITLE_STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function scoreSmartContainerRelevance(
  sourceItem: ReadItem,
  state: CueStoreState,
  entry: SmartComicContainerEntry
): number {
  const c = entry.data;
  const sourceTotal = Math.max(1, sourceItem.totalUnits);
  const shareRatio = Math.min(1, c.sharedTotal / sourceTotal);

  // 1. Shared issue coverage & volume (primary relevance signal)
  let score = shareRatio * 65 + Math.min(30, Math.log2(c.sharedTotal + 1) * 7);

  // 2. Title & franchise match against the currently viewed container
  const srcKey = normalizeCollectionKey(sourceItem.title);
  const candKey = normalizeCollectionKey(c.title);
  const srcTokens = extractMeaningfulTokens(sourceItem.title);
  const candTokens = extractMeaningfulTokens(c.title);
  const srcSet = new Set(srcTokens);
  const overlapTokens = candTokens.filter((t) => srcSet.has(t));
  const hasDirectPhraseMatch =
    candKey.length >= 3 && (srcKey.includes(candKey) || candKey.includes(srcKey));

  if (hasDirectPhraseMatch) {
    score += 28;
  } else if (overlapTokens.length > 0) {
    score += Math.min(22, overlapTokens.length * 14);
  }

  // 3. Flagship / popularity vs. 1-issue side/tie-in/novelty series
  const containerScale =
    entry.kind === 'overlap' ? entry.data.containerTotal : entry.data.sharedTotal;
  score += Math.min(8, Math.log2(Math.max(1, containerScale) + 1) * 1.5);

  const isNoveltyOrSpecial = NOVELTY_OR_SIDE_CONTAINER_RE.test(c.title);
  if (isNoveltyOrSpecial) {
    score -= 18;
  } else if (c.sharedTotal === 1 && !hasDirectPhraseMatch && overlapTokens.length === 0) {
    score -= 16;
  } else if (c.sharedTotal >= 3) {
    score += 10;
  }

  // 4. User library & reading momentum tie-breakers
  if (entry.kind === 'overlap') {
    const prog = state.readProgress[c.readId];
    score += prog?.bookmarked ? 10 : 2;
    if (typeof prog?.rating === 'number' && prog.rating > 0) score += prog.rating * 0.8;
  }
  if (c.sharedCompleted > 0) {
    score += 4 + c.ratio * 6;
  }

  return score;
}

/**
 * Ranks all Synced Smart Containers (both existing library overlaps and auto-populated
 * included series) by relevance, shared-issue coverage, franchise popularity, and progress.
 */
export function rankSmartComicContainers(
  sourceItem: ReadItem,
  state: CueStoreState,
  overlaps: OverlappingComicContainer[],
  included: IncludedComicSeriesContainer[]
): SmartComicContainerEntry[] {
  const combined: Array<{ entry: SmartComicContainerEntry; score: number }> = [
    ...overlaps.map((data) => {
      const entry: SmartComicContainerEntry = { kind: 'overlap', data };
      return { entry, score: scoreSmartContainerRelevance(sourceItem, state, entry) };
    }),
    ...included.map((data) => {
      const entry: SmartComicContainerEntry = { kind: 'included', data };
      return { entry, score: scoreSmartContainerRelevance(sourceItem, state, entry) };
    }),
  ];

  combined.sort(
    (a, b) =>
      b.score - a.score ||
      b.entry.data.sharedTotal - a.entry.data.sharedTotal ||
      b.entry.data.sharedCompleted - a.entry.data.sharedCompleted ||
      a.entry.data.title.localeCompare(b.entry.data.title)
  );

  return combined.map((item) => item.entry);
}

export interface EvaluatedCustomList {
  list: CustomList;
  totalItems: number;
  completedItems: number;
  averageRatio: number;
  isComplete: boolean;
  calculatedAvg: number | null;
  ratedCount: number;
  nextItem: { kind: 'show' | 'movie' | 'read' | 'game'; id: string; title: string; unitHint: string } | null;
}

export function evaluateCustomListProgress(
  list: CustomList,
  state: CueStoreState
): EvaluatedCustomList {
  // Ordered issue-level comic reading orders (e.g., Secret Wars, HoX/PoX, Annihilation)
  if (list.steps && list.steps.length > 0) {
    let completedSteps = 0;
    const stepRatings: number[] = [];
    let firstUnread: NonNullable<CustomList['steps']>[number] | null = null;
    for (const step of list.steps) {
      const atom = state.atomicReadUnits?.[step.atomicId];
      const done = (atom?.count || 0) > 0;
      if (done) {
        completedSteps += 1;
      } else if (!firstUnread) {
        firstUnread = step;
      }
      if (typeof atom?.rating === 'number' && atom.rating > 0) {
        stepRatings.push(atom.rating);
      }
    }
    const total = list.steps.length;
    return {
      list,
      totalItems: total,
      completedItems: completedSteps,
      averageRatio: total > 0 ? completedSteps / total : 0,
      isComplete: total > 0 && completedSteps >= total,
      calculatedAvg:
        stepRatings.length > 0
          ? stepRatings.reduce((s, r) => s + r, 0) / stepRatings.length
          : null,
      ratedCount: stepRatings.length,
      nextItem: firstUnread
        ? {
            kind: 'read',
            id: firstUnread.readItemId || list.id,
            title: firstUnread.title,
            unitHint: `${firstUnread.seriesTitle} #${firstUnread.issueNumber}`,
          }
        : null,
    };
  }

  let completedItems = 0;
  let ratioSum = 0;
  let validItems = 0;
  const ratings: number[] = [];
  let nextItem: EvaluatedCustomList['nextItem'] = null;

  for (const ref of list.items) {
    if (ref.kind === 'show') {
      const s = state.shows[ref.id];
      if (!s) continue;
      validItems += 1;
      const prog = state.showProgress[s.id];
      const st = getShowStats(s, prog);
      ratioSum += st.progressRatio;
      if (st.isFinished) completedItems += 1;
      else if (!nextItem && st.nextEpisode) {
        nextItem = {
          kind: 'show',
          id: s.id,
          title: s.title,
          unitHint: `S${String(st.nextEpisode.season).padStart(2, '0')} E${String(st.nextEpisode.number).padStart(2, '0')}`,
        };
      }
      if (typeof prog?.rating === 'number' && prog.rating > 0) ratings.push(prog.rating);
    } else if (ref.kind === 'movie') {
      const m = state.movies[ref.id];
      if (!m) continue;
      validItems += 1;
      const prog = state.movieProgress[m.id];
      const done = Boolean(prog && prog.watchCount > 0);
      ratioSum += done ? 1 : 0;
      if (done) completedItems += 1;
      else if (!nextItem && isMovieReleased(m)) {
        nextItem = { kind: 'movie', id: m.id, title: m.title, unitHint: `${m.year} · ${m.runtime}m` };
      }
      if (typeof prog?.rating === 'number' && prog.rating > 0) ratings.push(prog.rating);
    } else if (ref.kind === 'read') {
      const r = state.readItems[ref.id];
      if (!r) continue;
      validItems += 1;
      const prog = state.readProgress[r.id];
      const st = getReadStats(r, prog);
      ratioSum += st.ratio;
      if (st.isFinished) completedItems += 1;
      else if (!nextItem && !st.isCaughtUp && st.nextReleasedUnit !== null) {
        nextItem = { kind: 'read', id: r.id, title: r.title, unitHint: st.nextUnitShort };
      }
      if (typeof prog?.rating === 'number' && prog.rating > 0) ratings.push(prog.rating);
    } else if (ref.kind === 'game') {
      const g = state.games[ref.id];
      if (!g) continue;
      validItems += 1;
      const prog = state.gameProgress[g.id];
      const done = prog?.status === 'completed';
      const itemRatio =
        g.totalChapters && g.totalChapters > 0
          ? Math.min(1, (prog?.currentChapter || 0) / g.totalChapters)
          : (prog?.completionPct || 0) / 100;
      ratioSum += done ? 1 : itemRatio;
      if (done) completedItems += 1;
      else if (!nextItem) {
        const nextChap = Math.min(g.totalChapters || 1, (prog?.currentChapter || 0) + 1);
        nextItem = {
          kind: 'game',
          id: g.id,
          title: g.title,
          unitHint:
            g.totalChapters && g.totalChapters > 0
              ? `Ch. ${nextChap}/${g.totalChapters}`
              : `${prog?.completionPct || 0}%`,
        };
      }
      if (typeof prog?.rating === 'number' && prog.rating > 0) ratings.push(prog.rating);
    }
  }

  return {
    list,
    totalItems: validItems,
    completedItems,
    averageRatio: validItems > 0 ? ratioSum / validItems : 0,
    isComplete: validItems > 0 && completedItems >= validItems,
    calculatedAvg:
      ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null,
    ratedCount: ratings.length,
    nextItem,
  };
}

/**
 * Recomputes automatic average ratings for custom lists, matched movie collections,
 * and matched book series whenever member titles or atom ratings change.
 * Respects any manual collection rating overwrite (`source !== 'auto'`).
 */
export function recomputeAutoCollectionRatings(state: CueStoreState): CueStoreState {
  const prevRatings = state.collectionRatings || {};
  const nextRatings = { ...prevRatings };
  let changed = false;

  const applyForKey = (colKey: string, calculatedAvg: number | null) => {
    const cur = nextRatings[colKey];
    const resolved = applyAutoRating(cur?.rating, cur?.source, calculatedAvg);
    if (resolved.rating !== undefined && resolved.source) {
      if (cur?.rating !== resolved.rating || cur?.source !== resolved.source) {
        nextRatings[colKey] = { rating: resolved.rating, source: resolved.source };
        changed = true;
      }
    } else if (cur && cur.source === 'auto') {
      delete nextRatings[colKey];
      changed = true;
    }
  };

  for (const list of state.lists || []) {
    const ev = evaluateCustomListProgress(list, state);
    applyForKey(`list:${list.id}`, ev.calculatedAvg);
  }

  for (const col of KNOWN_MOVIE_COLLECTIONS) {
    const ev = evaluateMovieCollectionProgress(col, state);
    if (ev.entries.some((e) => Boolean(e.movieId))) {
      applyForKey(`movie-col:${col.id}`, ev.calculatedAvg);
    }
  }

  for (const series of KNOWN_BOOK_SERIES) {
    const ev = evaluateBookSeriesProgress(series, state);
    if (ev.entries.some((e) => Boolean(e.readId))) {
      applyForKey(`book-series:${series.id}`, ev.calculatedAvg);
    }
  }

  return changed ? { ...state, collectionRatings: nextRatings } : state;
}
