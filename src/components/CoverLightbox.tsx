import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalBackHandler } from '../store/useCueStore';

export function upgradeToHqCoverUrl(url: string): string {
  if (!url) return '';
  let next = url.trim();
  // Open Library medium/small -> large cover
  next = next.replace(/(covers\.openlibrary\.org\/b\/[^?]+)-[SM]\.jpg/i, '$1-L.jpg');
  // TMDB w185/w342/w500/w780 -> original
  next = next.replace(/(image\.tmdb\.org\/t\/p\/)(?:w185|w342|w500|w780)\//i, '$1original/');
  // iTunes artwork -> 1200x1800bb
  next = next.replace(/\/\d+x\d+bb\.(jpg|jpeg|png|webp)/i, '/1200x1800bb.$1');
  // TVMaze medium_portrait -> original_untouched
  next = next.replace(/\/medium_portrait\//i, '/original_untouched/');
  // Steam library 600x900 -> 2x
  next = next.replace(/\/library_600x900\.jpg/i, '/library_600x900_2x.jpg');
  // Wikimedia thumb -> original
  if (next.includes('upload.wikimedia.org/') && next.includes('/thumb/')) {
    const m = next.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/thumb\/([^/]+\/[^/]+\/[^/]+)\/\d+px-[^/?]+(.*)$/i);
    if (m) {
      next = `${m[1]}/${m[2]}${m[3] || ''}`;
    }
  }
  // Fandom / Wikia scaled thumbnail -> original full resolution
  next = next.replace(/(\/revision\/latest)\/scale-to-width-down\/\d+/i, '$1');
  return next;
}

interface CoverLightboxProps {
  open: boolean;
  src: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function CoverLightbox({ open, src, title, subtitle, onClose }: CoverLightboxProps) {
  const [fallbackToBase, setFallbackToBase] = useState(false);

  useModalBackHandler(open, onClose);

  useEffect(() => {
    setFallbackToBase(false);
  }, [src, open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  const hqSrc = upgradeToHqCoverUrl(src);
  const displaySrc = fallbackToBase || !hqSrc ? src : hqSrc;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} fullscreen cover`}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-[#0B0D10]/95 backdrop-blur-md p-4 sm:p-8 animate-fade-in"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close fullscreen cover"
        className="fixed top-4 right-4 sm:top-6 sm:right-6 z-10 h-11 w-11 rounded-full bg-surface-raised border border-white/15 flex items-center justify-center text-ink hover:bg-white/15 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[82dvh] flex flex-col items-center"
      >
        <img
          src={displaySrc}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => {
            if (!fallbackToBase && hqSrc && hqSrc !== src) {
              setFallbackToBase(true);
            }
          }}
          className="max-w-[90vw] max-h-[76dvh] w-auto h-auto object-contain rounded-2xl border border-white/12 shadow-2xl bg-surface"
        />
        <div className="mt-3 text-center max-w-md px-3">
          <p className="font-display font-bold text-base sm:text-lg text-ink truncate">{title}</p>
          {subtitle && <p className="text-xs text-ink-dim mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
