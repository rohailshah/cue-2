import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, PenLine, RotateCcw, X } from 'lucide-react';
import type { ToastItem } from '../store/useCueStore';
import type { MediaDomain } from '../types';
import { MediaImage } from './MediaImage';

interface ToastBannerProps {
  toast: ToastItem;
  onDismiss: () => void;
  durationMs?: number;
  lifted?: boolean;
}

type DomainTheme = MediaDomain | 'neutral';

function inferToastDomain(toast: ToastItem): DomainTheme {
  if (toast.domain) return toast.domain;
  const text = `${toast.message} ${toast.subtitle || ''}`;
  if (/\b(watch|watched|episode|season|movie|rewatch|show)\b/i.test(text)) return 'watch';
  if (/\b(read|reread|issue|chapter|novel|comic|manga)\b/i.test(text)) return 'read';
  if (/\b(play|played|playthrough|game|platinum|completed)\b/i.test(text)) return 'play';
  return 'neutral';
}

function splitToastCopy(toast: ToastItem): { headline: string; subline?: string } {
  if (toast.subtitle) {
    return { headline: toast.message, subline: toast.subtitle };
  }
  const middotIdx = toast.message.indexOf(' · ');
  if (middotIdx > 0) {
    return {
      headline: toast.message.slice(0, middotIdx).trim(),
      subline: toast.message.slice(middotIdx + 3).trim() || undefined,
    };
  }
  const dashIdx = toast.message.indexOf(' — ');
  if (dashIdx > 0) {
    return {
      headline: toast.message.slice(0, dashIdx).trim(),
      subline: toast.message.slice(dashIdx + 3).trim() || undefined,
    };
  }
  return { headline: toast.message };
}

const DOMAIN_STYLES: Record<
  DomainTheme,
  {
    cardBorder: string;
    badgeSolid: string;
    iconCircle: string;
    actionPill: string;
    progressBar: string;
  }
> = {
  watch: {
    cardBorder: 'border-watch/28',
    badgeSolid: 'bg-watch text-[#0E1A1E]',
    iconCircle: 'bg-watch/15 border-watch/30 text-watch',
    actionPill: 'bg-watch/16 border-watch/35 text-watch hover:bg-watch/26',
    progressBar: 'bg-watch/85',
  },
  read: {
    cardBorder: 'border-read/28',
    badgeSolid: 'bg-read text-[#1D160A]',
    iconCircle: 'bg-read/15 border-read/30 text-read',
    actionPill: 'bg-read/16 border-read/35 text-read hover:bg-read/26',
    progressBar: 'bg-read/85',
  },
  play: {
    cardBorder: 'border-play/28',
    badgeSolid: 'bg-play text-[#161124]',
    iconCircle: 'bg-play/15 border-play/30 text-play',
    actionPill: 'bg-play/16 border-play/35 text-play hover:bg-play/26',
    progressBar: 'bg-play/85',
  },
  neutral: {
    cardBorder: 'border-white/12',
    badgeSolid: 'bg-ink text-[#131519]',
    iconCircle: 'bg-white/10 border-white/18 text-ink',
    actionPill: 'bg-white/12 border-white/22 text-ink hover:bg-white/20',
    progressBar: 'bg-white/55',
  },
};

export function ToastBanner({
  toast,
  onDismiss,
  durationMs = 4200,
  lifted = false,
}: ToastBannerProps) {
  const [paused, setPaused] = useState(false);
  const [dragY, setDragY] = useState(0);
  const remainingRef = useRef(durationMs);
  const startedAtRef = useRef(Date.now());
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(onDismiss, Math.max(80, remainingRef.current));
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss]);

  const pauseTimer = () => {
    if (paused) return;
    const elapsed = Date.now() - startedAtRef.current;
    remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    setPaused(true);
  };

  const resumeTimer = () => {
    if (!paused) return;
    setPaused(false);
  };

  const domain = inferToastDomain(toast);
  const theme = DOMAIN_STYLES[domain];
  const { headline, subline } = splitToastCopy(toast);
  const isUndo =
    toast.tone === 'undo' ||
    (toast.actionLabel ? /undo/i.test(toast.actionLabel) : false);

  const renderActionIcon = () => {
    const label = toast.actionLabel || '';
    if (/note|journal/i.test(label)) return <PenLine className="w-3 h-3 shrink-0" />;
    if (/undo/i.test(label)) return <RotateCcw className="w-3 h-3 shrink-0" />;
    return <ArrowUpRight className="w-3 h-3 shrink-0" />;
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed md:bottom-7 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-[404px] animate-toast-in ${
        lifted ? 'bottom-[260px] z-[60]' : 'bottom-[90px] z-50'
      }`}
    >
      <div
        onMouseEnter={pauseTimer}
        onMouseLeave={resumeTimer}
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0]?.clientY ?? null;
          pauseTimer();
        }}
        onTouchMove={(e) => {
          if (touchStartYRef.current === null) return;
          const dy = (e.touches[0]?.clientY ?? touchStartYRef.current) - touchStartYRef.current;
          setDragY(Math.max(0, dy));
        }}
        onTouchEnd={() => {
          const shouldDismiss = dragY > 36;
          touchStartYRef.current = null;
          setDragY(0);
          if (shouldDismiss) {
            onDismiss();
          } else {
            resumeTimer();
          }
        }}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : 'transform 180ms ease-out',
        }}
        className={`relative overflow-hidden rounded-[20px] bg-[#1F232B]/96 backdrop-blur-xl border ${theme.cardBorder} shadow-[0_14px_38px_rgba(0,0,0,0.52)]`}
      >
        <div className="px-3 py-2.5 flex items-center gap-3">
          {toast.posterUrl ? (
            <div className="relative shrink-0">
              <div className="w-8 h-10 rounded-lg overflow-hidden bg-surface-raised border border-white/12">
                <MediaImage
                  src={toast.posterUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-[#1F232B] ${theme.badgeSolid}`}
              >
                {isUndo ? (
                  <RotateCcw className="w-2.5 h-2.5 stroke-[2.6]" />
                ) : (
                  <Check className="w-2.5 h-2.5 stroke-[2.8]" />
                )}
              </span>
            </div>
          ) : (
            <div
              className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${theme.iconCircle}`}
            >
              {isUndo ? (
                <RotateCcw className="w-4 h-4 stroke-[2.2]" />
              ) : (
                <Check className="w-4 h-4 stroke-[2.4]" />
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink truncate leading-tight">
              {headline}
            </p>
            {subline && (
              <p className="text-[11.5px] font-medium truncate tabular-nums leading-tight mt-0.5 text-ink-dim">
                {subline}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  const action = toast.onAction;
                  onDismiss();
                  action?.();
                }}
                className={`px-2.5 py-1.5 rounded-full text-[11.5px] font-semibold border inline-flex items-center gap-1 transition-colors ${theme.actionPill}`}
              >
                {renderActionIcon()}
                <span>{toast.actionLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close toast"
              className="h-7 w-7 rounded-full flex items-center justify-center text-ink-faint hover:text-ink hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="h-[2.5px] w-full bg-white/[0.05]">
          <div
            className={`h-full origin-left animate-toast-progress ${theme.progressBar}`}
            style={{
              animationDuration: `${durationMs}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>
      </div>
    </div>
  );
}
