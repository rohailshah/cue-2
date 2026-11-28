import type { RouteView } from '../types';

export interface CueHistoryStateLike {
  cueNav?: boolean;
  depth?: number;
  stack?: RouteView[];
  modal?: boolean;
  overlayId?: number;
}

export function routesEqual(a?: RouteView, b?: RouteView): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function stacksEqual(a?: RouteView[], b?: RouteView[]): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!routesEqual(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Generates a distinct URL (keeping pathname & query params like ?sync=CODE intact)
 * with a unique fragment per navigation step so Chrome/Safari treat async & SPA
 * history entries as distinct and never coalesce/skip intermediate pages.
 */
export function buildRouteUrlWithHash(
  stack: RouteView[],
  seq: number,
  pathname = '',
  search = ''
): string {
  const top = stack[stack.length - 1];
  const viewTag = top ? top.view : 'queue';
  const subTag =
    top && top.view === 'search' && top.subView ? `-${top.subView}` : '';
  return `${pathname}${search}#cue-${viewTag}${subTag}-${seq}`;
}

export interface PopStateResolution {
  nextStack: RouteView[];
  needsHistoryRepair: boolean;
}

/**
 * Resolves a browser popstate event safely so pressing Back ALWAYS moves cleanly
 * one step back in Cue's route stack — recovering automatically if Chrome skipped
 * an intermediate history entry or popped past the first entry to null state.
 */
export function resolvePopStateStack(
  currentStack: RouteView[],
  incomingState: CueHistoryStateLike | null | undefined,
  hadModalOpen = false
): PopStateResolution {
  if (hadModalOpen) {
    const incomingMatchesCurrent =
      Boolean(incomingState?.cueNav) &&
      Array.isArray(incomingState?.stack) &&
      stacksEqual(incomingState?.stack, currentStack) &&
      !incomingState?.modal;
    return {
      nextStack: currentStack,
      needsHistoryRepair: !incomingMatchesCurrent,
    };
  }

  const expectedOneStepBack =
    currentStack.length > 1 ? currentStack.slice(0, -1) : null;

  if (
    incomingState?.cueNav &&
    Array.isArray(incomingState.stack) &&
    incomingState.stack.length > 0
  ) {
    const candidate = incomingState.stack;
    // Detect browser history intervention skipping intermediate route entries
    // (e.g. jumping directly from [search, show-detail] to [queue], which has equal or shorter length).
    if (
      expectedOneStepBack &&
      !stacksEqual(candidate, expectedOneStepBack) &&
      candidate.length <= expectedOneStepBack.length
    ) {
      return {
        nextStack: expectedOneStepBack,
        needsHistoryRepair: true,
      };
    }
    return {
      nextStack: candidate,
      needsHistoryRepair: false,
    };
  }

  // Browser landed on null/external history state while we still have routes in Cue's stack
  if (expectedOneStepBack) {
    return {
      nextStack: expectedOneStepBack,
      needsHistoryRepair: true,
    };
  }

  return {
    nextStack: currentStack,
    needsHistoryRepair: false,
  };
}
