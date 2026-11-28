import { BookOpen, Clock, Flame, Gamepad2, Repeat, Trophy, Tv, X } from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import { computeAllMediaStats, formatReadStatSummary } from '../utils/stats';

export function MediaInsightsModal() {
  const { state, insightsOpen, setInsightsOpen, pushRoute } = useCueStore();

  if (!insightsOpen) return null;

  const stats = computeAllMediaStats(state);
  const readSummary = formatReadStatSummary(
    stats.readChaptersCount,
    stats.readIssuesCount,
    stats.readFinishedCount
  );
  const maxGenreScore = Math.max(1, ...stats.topGenres.map((g) => g.score));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => setInsightsOpen(false)}
    >
      <div
        className="w-full md:max-w-lg max-h-[86dvh] flex flex-col bg-surface border border-white/10 rounded-t-[28px] md:rounded-[28px] shadow-2xl animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-ink-dim" />
            <h3 className="font-display font-bold text-lg text-ink">All-Media Insights</h3>
          </div>
          <button
            type="button"
            onClick={() => setInsightsOpen(false)}
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background p-4 border border-white/6">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-watch">
                <Tv className="w-3.5 h-3.5" />
                <span>Watch Time</span>
              </div>
              <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
                {stats.watchTimeLabel}
              </p>
              <p className="text-xs text-ink-faint mt-0.5 tabular-nums">
                {stats.episodesWatchedCount.toLocaleString()}{' '}
                {stats.episodesWatchedCount === 1 ? 'ep' : 'eps'} · {stats.moviesWatchedCount}{' '}
                {stats.moviesWatchedCount === 1 ? 'movie' : 'movies'}
              </p>
            </div>

            <div className="rounded-2xl bg-background p-4 border border-white/6">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-read">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Read Progress</span>
              </div>
              <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
                {readSummary.primary}
              </p>
              <p className="text-xs text-ink-faint mt-0.5 tabular-nums">
                {readSummary.secondary}
              </p>
            </div>

            <div className="rounded-2xl bg-background p-4 border border-white/6">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-play">
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Play Hours</span>
              </div>
              <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
                {stats.totalGameHours.toLocaleString()}h
              </p>
              <p className="text-xs text-ink-faint mt-0.5 tabular-nums">
                {stats.gamesCompletedCount} completed
              </p>
            </div>

            <div className="rounded-2xl bg-background p-4 border border-white/6">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                <Trophy className="w-3.5 h-3.5 text-play" />
                <span>100% & Revisits</span>
              </div>
              <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
                {stats.platinumCount} 🏆
              </p>
              <p className="text-xs text-ink-faint mt-0.5 tabular-nums">
                {stats.totalRereads + stats.totalReplays} rereads & replays
              </p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-3">
              Top Genres Across All Media
            </h4>
            {stats.topGenres.length === 0 ? (
              <p className="text-xs text-ink-dim">
                Track titles across Watch, Read, or Play to see your top genres.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.topGenres.map((g) => (
                  <div key={g.genre}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-ink">{g.genre}</span>
                      <span className="text-ink-dim tabular-nums">
                        {g.count} {g.count === 1 ? 'title' : 'titles'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-500"
                        style={{
                          width: `${Math.max(12, Math.round((g.score / maxGenreScore) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stats.topRevisited.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2.5">
                <Repeat className="w-3.5 h-3.5 text-ink-dim" />
                <span>Most Revisited Favorites</span>
              </div>
              <div className="space-y-2">
                {stats.topRevisited.map((item) => {
                  const badgeColor =
                    item.domain === 'watch'
                      ? 'text-watch'
                      : item.domain === 'read'
                        ? 'text-read'
                        : 'text-play';
                  return (
                    <button
                      key={`${item.domain}-${item.id}`}
                      type="button"
                      onClick={() => {
                        setInsightsOpen(false);
                        if (item.domain === 'read') {
                          pushRoute({ view: 'read-detail', readId: item.id });
                        } else if (item.domain === 'play') {
                          pushRoute({ view: 'game-detail', gameId: item.id });
                        } else if (state.shows[item.id]) {
                          pushRoute({ view: 'show-detail', showId: item.id });
                        } else {
                          pushRoute({ view: 'movie-detail', movieId: item.id });
                        }
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-background border border-white/6 hover:border-white/15 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-9 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
                          <p className={`text-[11px] uppercase font-semibold ${badgeColor}`}>
                            {item.domain}
                          </p>
                        </div>
                      </div>
                      <span className={`text-sm font-bold tabular-nums px-2.5 ${badgeColor}`}>
                        x{item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-background border border-white/[0.05] p-3.5 flex items-center gap-3">
            <Clock className="w-4 h-4 text-ink-dim shrink-0" />
            <p className="text-xs text-ink-dim">
              All stats are computed privately from your local Watch, Read, Play, and Journal
              activity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
