import type {
  CueStoreState,
  GameProgress,
  MovieProgress,
  ReadItem,
  ReadProgress,
  ShowProgress,
} from '../types';

export const IMPORT_HISTORY_KEY = 'cue_import_history_v1';
export const MAX_IMPORT_HISTORY = 5;

export interface ImportBatchRecord {
  id: string;
  importedAt: string;
  sourceLabel: string;
  fileName?: string;
  kind: 'smart-import' | 'backup-restore';
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  addedShowIds: string[];
  addedMovieIds: string[];
  addedReadIds: string[];
  addedGameIds: string[];
  addedHistoryIds: string[];
  prevReadItems?: Record<string, ReadItem>;
  prevShowProgress?: Record<string, ShowProgress | null>;
  prevMovieProgress?: Record<string, MovieProgress | null>;
  prevReadProgress?: Record<string, ReadProgress | null>;
  prevGameProgress?: Record<string, GameProgress | null>;
  fullSnapshot?: CueStoreState;
}

export function loadImportHistory(): ImportBatchRecord[] {
  try {
    const raw = localStorage.getItem(IMPORT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ImportBatchRecord => Boolean(r && typeof r.id === 'string' && r.importedAt)
    );
  } catch {
    return [];
  }
}

export function saveImportHistory(records: ImportBatchRecord[]): void {
  const capped = records.slice(0, MAX_IMPORT_HISTORY);
  // Keep fullSnapshot on at most the newest backup-restore record to conserve storage
  let keptFullSnapshot = false;
  const normalized = capped.map((r) => {
    if (!r.fullSnapshot) return r;
    if (!keptFullSnapshot) {
      keptFullSnapshot = true;
      return r;
    }
    const rest = { ...r };
    delete rest.fullSnapshot;
    return rest;
  });

  try {
    localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(normalized));
  } catch {
    // Fallback if storage quota is tight: strip fullSnapshot payloads and keep surgical manifests
    const slim = normalized.map((r) => {
      if (!r.fullSnapshot) return r;
      const rest = { ...r };
      delete rest.fullSnapshot;
      return rest;
    });
    try {
      localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(slim));
    } catch {
      // Last resort: keep only the newest 1 slim record
      try {
        localStorage.setItem(IMPORT_HISTORY_KEY, JSON.stringify(slim.slice(0, 1)));
      } catch {
        // Ignore storage quota failure gracefully
      }
    }
  }
}

export function clearImportHistory(): void {
  try {
    localStorage.removeItem(IMPORT_HISTORY_KEY);
  } catch {
    // ignore storage errors
  }
}

function restoreMapRecords<T>(
  current: Record<string, T>,
  previous: Record<string, T | null> | undefined
): { next: Record<string, T>; restoredCount: number } {
  if (!previous) return { next: current, restoredCount: 0 };
  const next = { ...current };
  let restoredCount = 0;
  for (const [id, prevVal] of Object.entries(previous)) {
    if (prevVal === null) {
      if (Object.prototype.hasOwnProperty.call(next, id)) {
        delete next[id];
        restoredCount += 1;
      }
    } else {
      next[id] = prevVal;
      restoredCount += 1;
    }
  }
  return { next, restoredCount };
}

/**
 * Surgically rolls back a single import batch while preserving all pre-existing
 * items and any manual library edits added after that import.
 */
export function rollbackImportRecord(
  state: CueStoreState,
  record: ImportBatchRecord
): { nextState: CueStoreState; removedCount: number; restoredCount: number } {
  if (record.kind === 'backup-restore') {
    if (!record.fullSnapshot) {
      return { nextState: state, removedCount: 0, restoredCount: 0 };
    }
    return { nextState: record.fullSnapshot, removedCount: 0, restoredCount: 1 };
  }

  const removeShows = new Set(record.addedShowIds);
  const removeMovies = new Set(record.addedMovieIds);
  const removeReads = new Set(record.addedReadIds);
  const removeGames = new Set(record.addedGameIds);
  const removeHistory = new Set(record.addedHistoryIds);

  let removedCount = 0;
  const nextShows = { ...state.shows };
  const nextShowProgress = { ...state.showProgress };
  for (const id of removeShows) {
    if (nextShows[id]) {
      delete nextShows[id];
      removedCount += 1;
    }
    delete nextShowProgress[id];
  }

  const nextMovies = { ...state.movies };
  const nextMovieProgress = { ...state.movieProgress };
  for (const id of removeMovies) {
    if (nextMovies[id]) {
      delete nextMovies[id];
      removedCount += 1;
    }
    delete nextMovieProgress[id];
  }

  const nextReadItems = { ...state.readItems };
  const nextReadProgress = { ...state.readProgress };
  for (const id of removeReads) {
    if (nextReadItems[id]) {
      delete nextReadItems[id];
      removedCount += 1;
    }
    delete nextReadProgress[id];
  }

  const nextGames = { ...state.games };
  const nextGameProgress = { ...state.gameProgress };
  for (const id of removeGames) {
    if (nextGames[id]) {
      delete nextGames[id];
      removedCount += 1;
    }
    delete nextGameProgress[id];
  }

  let restoredCount = 0;
  if (record.prevReadItems) {
    for (const [id, prevItem] of Object.entries(record.prevReadItems)) {
      nextReadItems[id] = prevItem;
    }
  }

  const restoredShowProg = restoreMapRecords(nextShowProgress, record.prevShowProgress);
  const restoredMovieProg = restoreMapRecords(nextMovieProgress, record.prevMovieProgress);
  const restoredReadProg = restoreMapRecords(nextReadProgress, record.prevReadProgress);
  const restoredGameProg = restoreMapRecords(nextGameProgress, record.prevGameProgress);
  restoredCount =
    restoredShowProg.restoredCount +
    restoredMovieProg.restoredCount +
    restoredReadProg.restoredCount +
    restoredGameProg.restoredCount;

  const nextState: CueStoreState = {
    ...state,
    shows: nextShows,
    movies: nextMovies,
    readItems: nextReadItems,
    games: nextGames,
    showOrder: state.showOrder.filter((id) => !removeShows.has(id)),
    movieOrder: state.movieOrder.filter((id) => !removeMovies.has(id)),
    readOrder: state.readOrder.filter((id) => !removeReads.has(id)),
    gameOrder: state.gameOrder.filter((id) => !removeGames.has(id)),
    showProgress: restoredShowProg.next,
    movieProgress: restoredMovieProg.next,
    readProgress: restoredReadProg.next,
    gameProgress: restoredGameProg.next,
    history:
      removeHistory.size > 0
        ? (state.history || []).filter((h) => !removeHistory.has(h.id))
        : state.history,
  };

  return { nextState, removedCount, restoredCount };
}
