import type React from 'react';
import { Check } from 'lucide-react';
import { MediaImage } from './MediaImage';

export interface BingersMediaRowProps {
  title: string;
  primaryLine: string;
  secondaryLine?: string;
  posterUrl: string;
  posterTag?: string;
  badgeLabel?: string;
  badgeClassName?: string;
  progressRatio?: number;
  showProgress?: boolean;
  isHistory?: boolean;
  isFlashing?: boolean;
  flashLabel?: string;
  actionContent?: React.ReactNode;
  actionAriaLabel?: string;
  actionDisabled?: boolean;
  actionActive?: boolean;
  onAction?: (e: React.MouseEvent) => void;
  onOpen: () => void;
}

/** Single Bingers-style detached portrait poster + dark rounded card row (also supports dimmed history rows and full-row completion flash). */
export function BingersMediaRow({
  title,
  primaryLine,
  secondaryLine,
  posterUrl,
  posterTag,
  badgeLabel,
  badgeClassName,
  progressRatio = 0,
  showProgress = false,
  isHistory = false,
  isFlashing = false,
  flashLabel = 'Done',
  actionContent,
  actionAriaLabel,
  actionDisabled = false,
  actionActive = false,
  onAction,
  onOpen,
}: BingersMediaRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex items-start gap-2.5 cursor-pointer select-none focus-visible:rounded-[18px]"
    >
      {/* Left detached portrait poster */}
      <div className="w-[66px] sm:w-[70px] shrink-0 flex flex-col items-center">
        <div
          className={`relative w-full h-[96px] sm:h-[102px] rounded-[14px] overflow-hidden bg-surface-raised border border-white/[0.06] transition-opacity ${
            isHistory ? 'opacity-65' : ''
          }`}
        >
          <MediaImage
            src={posterUrl}
            alt={title}
            className={`w-full h-full object-cover transition-transform duration-300 ${
              isHistory ? 'brightness-75' : 'group-hover:scale-[1.04]'
            }`}
          />
          {!isHistory && showProgress && progressRatio > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
              <div
                className="h-full bg-watched transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round(progressRatio * 100))}%` }}
              />
            </div>
          )}
        </div>
        {posterTag && !isHistory && (
          <span className="mt-1 text-[9.5px] font-extrabold tracking-[0.08em] uppercase text-ink leading-none">
            {posterTag}
          </span>
        )}
      </div>

      {/* Right rounded surface card */}
      <div
        className={`flex-1 min-w-0 min-h-[96px] sm:min-h-[102px] rounded-[18px] px-4 py-3 flex items-center justify-between gap-3 border transition-colors ${
          isHistory
            ? 'bg-surface/60 border-white/[0.03] group-hover:bg-surface/85'
            : 'bg-surface border-white/[0.05] group-hover:bg-surface-raised'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3
              className={`text-[15px] font-semibold truncate leading-snug ${
                isHistory ? 'text-ink/70' : 'text-ink'
              }`}
            >
              {title}
            </h3>
            {badgeLabel && (
              <span
                className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                  badgeClassName || 'bg-white/8 text-ink-dim'
                }`}
              >
                {badgeLabel}
              </span>
            )}
          </div>

          <p
            className={`text-[13px] tabular-nums mt-1 truncate ${
              isHistory ? 'text-ink-faint' : 'text-ink/85'
            }`}
          >
            {primaryLine}
          </p>

          {secondaryLine && (
            <p
              className={`text-[12.5px] truncate mt-0.5 ${
                isHistory ? 'text-ink-faint/80' : 'text-ink-dim'
              }`}
            >
              {secondaryLine}
            </p>
          )}
        </div>

        {/* Right action area */}
        <div className="shrink-0 flex items-center gap-2">
          {isHistory ? (
            <Check className="w-[18px] h-[18px] text-brand opacity-90" strokeWidth={2.5} />
          ) : actionContent ? (
            onAction && !actionDisabled ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction(e);
                }}
                aria-label={actionAriaLabel || title}
                className={`h-[38px] min-w-[38px] px-2 rounded-full border flex items-center justify-center transition-all active:scale-90 ${
                  actionActive
                    ? 'border-watched/70 bg-watched/15 text-watched animate-check-pop'
                    : 'border-white/15 bg-white/[0.02] text-ink-dim hover:border-brand hover:text-brand'
                }`}
              >
                {actionContent}
              </button>
            ) : (
              <span className="text-sm font-bold text-watched tabular-nums px-1 flex items-center gap-1">
                {actionContent}
              </span>
            )
          ) : null}
        </div>
      </div>

      {/* Full-row solid flat completion flash banner */}
      {isFlashing && (
        <div className="absolute inset-x-0 top-0 h-[96px] sm:h-[102px] z-20 rounded-[18px] bg-brand text-brand-ink flex flex-col items-center justify-center gap-1 animate-complete-flash pointer-events-none">
          <Check className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[13.5px] font-semibold leading-none">{flashLabel}</span>
        </div>
      )}
    </div>
  );
}