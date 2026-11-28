import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { Calendar, ListFilter } from 'lucide-react';
import type { HistoryEntry } from '../types';
import { BingersMediaRow } from './BingersMediaRow';

interface MobileDomainBarProps {
  title: string;
  calendarMode: boolean;
  onOpenFilter: () => void;
  onToggleCalendar: () => void;
  filterAriaLabel: string;
  calendarAriaLabel: string;
}

/** Minimal mobile-only sticky utility bar matching Bingers' uncluttered header. */
export function MobileDomainBar({
  title,
  calendarMode,
  onOpenFilter,
  onToggleCalendar,
  filterAriaLabel,
  calendarAriaLabel,
}: MobileDomainBarProps) {
  return (
    <div className="md:hidden sticky top-0 z-30 h-[52px] px-4 flex items-center justify-between bg-background/95 backdrop-blur-md">
      <span className="text-[13px] font-semibold tracking-tight text-ink-dim">
        {calendarMode ? title : ''}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenFilter}
          aria-label={filterAriaLabel}
          className="h-9 w-9 rounded-full flex items-center justify-center text-ink-dim hover:text-ink hover:bg-surface transition-colors"
        >
          <ListFilter className="w-[18px] h-[18px]" />
        </button>
        <button
          type="button"
          onClick={onToggleCalendar}
          aria-label={calendarAriaLabel}
          className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
            calendarMode
              ? 'bg-brand/15 text-brand'
              : 'text-ink-dim hover:text-ink hover:bg-surface'
          }`}
        >
          <Calendar className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

interface ScrollUpHistoryFeedProps {
  historyItems: HistoryEntry[];
  onOpenHistoryItem: (entry: HistoryEntry) => void;
  stickyHeader?: React.ReactNode;
  resetAnchorKey?: string;
  children: React.ReactNode;
}

/**
 * Anchors the viewport directly at `children` (e.g. Watch next / Read next / Playing now)
 * while placing chronological `historyItems` cleanly above the top fold so scrolling UP
 * reveals completed history smoothly without jumping.
 */
export function ScrollUpHistoryFeed({
  historyItems,
  onOpenHistoryItem,
  stickyHeader,
  resetAnchorKey = '',
  children,
}: ScrollUpHistoryFeedProps) {
  const historyWrapRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const prevHistoryCountRef = useRef(historyItems.length);
  const prevHistoryHeightRef = useRef(0);
  const initializedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    const historyEl = historyWrapRef.current;
    const anchorEl = anchorRef.current;
    if (!anchorEl) return;

    const currentHistoryHeight = historyEl ? historyEl.getBoundingClientRect().height : 0;
    const keyChanged = initializedKeyRef.current !== resetAnchorKey;

    if (keyChanged) {
      initializedKeyRef.current = resetAnchorKey;
      prevHistoryCountRef.current = historyItems.length;
      prevHistoryHeightRef.current = currentHistoryHeight;

      const topOffset = window.innerWidth >= 768 ? 84 : 52;
      const targetTop = Math.max(0, anchorEl.getBoundingClientRect().top + window.scrollY - topOffset);
      window.scrollTo({ top: targetTop, behavior: 'instant' as ScrollBehavior });
      return;
    }

    if (historyItems.length !== prevHistoryCountRef.current) {
      const delta = currentHistoryHeight - prevHistoryHeightRef.current;
      prevHistoryCountRef.current = historyItems.length;
      prevHistoryHeightRef.current = currentHistoryHeight;
      if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
      }
      return;
    }

    prevHistoryHeightRef.current = currentHistoryHeight;
  }, [historyItems.length, resetAnchorKey]);

  return (
    <div className="min-h-dvh">
      {stickyHeader}

      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Scroll-up chronological history (oldest -> newest so newest sits right above main anchor) */}
        <div
          ref={historyWrapRef}
          data-history-feed
          className={
            historyItems.length > 0
              ? 'pt-3 md:pt-[84px] pb-4 md:pb-[92px] space-y-2.5'
              : 'md:pt-[84px]'
          }
        >
          {historyItems.map((entry) => (
            <BingersMediaRow
              key={entry.id}
              title={entry.title}
              primaryLine={entry.codeLabel}
              secondaryLine={entry.subtitle}
              posterUrl={entry.posterUrl}
              isHistory
              onOpen={() => onOpenHistoryItem(entry)}
            />
          ))}
        </div>

        {/* Main anchored viewport section ("Watch next", "Novels / Manga / Comics", "Playing now") */}
        <div ref={anchorRef} data-main-anchor className="min-h-[calc(100dvh-76px)] pt-2 pb-28 md:pb-14">
          {children}
        </div>
      </div>
    </div>
  );
}