import { X } from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import { CueIcon } from './CueLogo';

export function ReleaseAlertBanner() {
  const { activeBanner, dismissBanner, pushRoute } = useCueStore();

  if (!activeBanner) return null;

  const handleOpen = () => {
    if (!activeBanner.mediaId) return;
    if (activeBanner.mediaKind === 'read') {
      pushRoute({ view: 'read-detail', readId: activeBanner.mediaId });
    } else if (activeBanner.mediaKind === 'game') {
      pushRoute({ view: 'game-detail', gameId: activeBanner.mediaId });
    } else {
      pushRoute({ view: 'show-detail', showId: activeBanner.mediaId });
    }
  };

  return (
    <div className="mb-5 animate-sheet-up">
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleOpen();
        }}
        className="glass-banner relative rounded-[24px] p-3.5 pr-9 flex items-center gap-3 cursor-pointer hover:border-white/20 transition-colors"
      >
        <CueIcon size={40} className="rounded-xl shadow-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-ink truncate">{activeBanner.title}</p>
            <span className="text-[12px] text-ink-dim shrink-0">{activeBanner.timeLabel}</span>
          </div>
          <p className="text-[13px] text-ink/90 leading-snug line-clamp-2 mt-0.5">
            {activeBanner.body}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismissBanner();
          }}
          aria-label="Dismiss release alert"
          className="absolute top-2.5 right-2.5 p-1 rounded-full text-ink-dim hover:text-ink hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
