import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import { Calendar, ListFilter } from 'lucide-react';
import type { HistoryEntry } from '../types';
import { BingersMediaRow } from './BingersMediaRow';
import { CueWordmark } from './CueLogo';

interface MobileDomainBarProps {
  title: string;
  domainLabel?: string;
  calendarMode?: boolean;
  onOpenFilter?: () => void;
  onToggleCalendar?: () => void;
  filterAriaLabel?: string;
  calendarAriaLabel?: string;
  rightSlot?: React.ReactNode;
}

/** Minimal mobile-only sticky utility bar matching desktop branding without clutter. */
export function MobileDomainBar({
  title,
  domainLabel,
  calendarMode = false,
  onOpenFilter,
  onToggleCalendar,
  filterAriaLabel,
  calendarAriaLabel,
  rightSlot,
}: MobileDomainBarProps) {
  const sublabel = calendarMode ? title : domainLabel;
  const showSublabel = Boolean(sublabel && sublabel.trim().toLowerCase() !== 'cue');

  return (
    <div className="md:hidden sticky top-0 z-30 h-[52px] px-4 flex items-center justify-between bg-background/95 backdrop-blur-md">
      <div className="flex items-baseline gap-2 min-w-0">
        <CueWordmark className="text-[21px] leading-none" />
        {showSublabel && (
          <>
            <span
              className="text-ink-faint text-[14px] leading-none select-none relative -top-[1px]"
              aria-hidden="true"
            >
              ·
            </span>
            <span className="text-[13.5px] leading-none font-semibold tracking-tight text-brand truncate">
              {sublabel}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {rightSlot}
        {onOpenFilter && (
          <button
            type="button"
            onClick={onOpenFilter}
            aria-label={filterAriaLabel || 'Filter'}
            className="h-9 w-9 rounded-full flex items-center justify-center text-ink-dim hover:text-ink hover:bg-surface transition-colors"
          >
            <ListFilter className="w-[18px] h-[18px]" />
          </button>
        )}
        {onToggleCalendar && (
          <button
            type="button"
            onClick={onToggleCalendar}
            aria-label={calendarAriaLabel || 'Calendar'}
            className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
              calendarMode
                ? 'bg-brand/15 text-brand'
                : 'text-ink-dim hover:text-ink hover:bg-surface'
            }`}
          >
            <Calendar className="w-[18px] h-[18px]" />
          </button>
        )}
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
  const headerWrapRef = useRef<HTMLDivElement>(null);
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

    const getTopOffset = () => {
      const headerHeight = headerWrapRef.current?.getBoundingClientRect().height || 0;
      if (headerHeight > 0) return headerHeight;
      return window.innerWidth >= 768 ? 84 : 52;
    };

    const alignToAnchor = () => {
      const targetTop = Math.max(
        0,
        anchorEl.getBoundingClientRect().top + window.scrollY - getTopOffset()
      );
      window.scrollTo({ top: targetTop, behavior: 'instant' as ScrollBehavior });
    };

    const currentHistoryHeight = historyEl ? historyEl.getBoundingClientRect().height : 0;
    const keyChanged = initializedKeyRef.current !== resetAnchorKey;

    if (keyChanged) {
      initializedKeyRef.current = resetAnchorKey;
      prevHistoryCountRef.current = historyItems.length;
      prevHistoryHeightRef.current = currentHistoryHeight;

      alignToAnchor();
      const rafId = window.requestAnimationFrame(() => {
        alignToAnchor();
        prevHistoryHeightRef.current = historyEl ? historyEl.getBoundingClientRect().height : 0;
      });
      return () => window.cancelAnimationFrame(rafId);
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
      {stickyHeader && (
        <div ref={headerWrapRef} className="md:hidden sticky top-0 z-30">
          {stickyHeader}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Scroll-up chronological history (oldest -> newest so newest sits right above main anchor) */}
        <div
          ref={historyWrapRef}
          data-history-feed
          className={
            historyItems.length > 0
              ? 'pt-3 md:pt-[84px] pb-5 md:pb-[92px] space-y-2.5'
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
        <div
          ref={anchorRef}
          data-main-anchor
          className="min-h-[calc(100dvh-50px)] md:min-h-[calc(100dvh-82px)] pt-2 pb-28 md:pb-14"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
