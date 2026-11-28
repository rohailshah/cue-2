import { Bell, CheckCheck, Sparkles, X } from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import { CueIcon } from './CueLogo';

export function NotificationsSheet() {
  const {
    state,
    notificationsOpen,
    setNotificationsOpen,
    markAllNotificationsRead,
    triggerSampleReleaseAlert,
    pushRoute,
  } = useCueStore();

  if (!notificationsOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => setNotificationsOpen(false)}
    >
      <div
        className="w-full md:max-w-lg max-h-[85dvh] flex flex-col bg-surface border border-white/10 rounded-t-[28px] md:rounded-[26px] shadow-2xl animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-watch" />
            <h3 className="font-display font-bold text-lg text-ink">Release Alerts</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="text-xs font-medium text-ink-dim hover:text-ink flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark read</span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationsOpen(false)}
              className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          <button
            type="button"
            onClick={() => {
              triggerSampleReleaseAlert();
              setNotificationsOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-watch/15 border border-watch/35 text-watch text-sm font-semibold hover:bg-watch/20 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            <span>Test live release alert banner</span>
          </button>

          {state.notifications.length === 0 ? (
            <div className="rounded-2xl bg-background border border-white/6 p-6 text-center">
              <p className="text-sm font-semibold text-ink">No release alerts yet</p>
              <p className="text-xs text-ink-dim mt-1">
                New release notifications will show up here as you build your library.
              </p>
            </div>
          ) : (
            state.notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  if (n.mediaKind === 'show' && n.mediaId) {
                    pushRoute({ view: 'show-detail', showId: n.mediaId });
                  } else if (n.mediaKind === 'movie' && n.mediaId) {
                    pushRoute({ view: 'movie-detail', movieId: n.mediaId });
                  } else if (n.mediaKind === 'read' && n.mediaId) {
                    pushRoute({ view: 'read-detail', readId: n.mediaId });
                  } else if (n.mediaKind === 'game' && n.mediaId) {
                    pushRoute({ view: 'game-detail', gameId: n.mediaId });
                  }
                }}
                className={`w-full text-left flex items-start gap-3 p-3.5 rounded-2xl border transition-colors ${
                  n.read
                    ? 'bg-background border-white/6 opacity-80 hover:opacity-100'
                    : 'bg-surface-raised border-white/12'
                }`}
              >
                <CueIcon size={34} className="rounded-lg mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink truncate">{n.title}</p>
                    <span className="text-[11px] text-ink-dim shrink-0">{n.timeLabel}</span>
                  </div>
                  <p className="text-[13px] text-ink-dim mt-0.5 leading-snug">{n.body}</p>
                </div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-watch mt-2 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
