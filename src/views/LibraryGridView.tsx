import { useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { useCueStore } from '../store/useCueStore';
import type { GameItem, Movie, ReadItem, Show } from '../types';
import { getReadStats, getShowStats } from '../utils/stats';

export function LibraryGridView({
  mode,
  listId,
}: {
  mode: 'watch' | 'read' | 'play' | 'list';
  listId?: string;
}) {
  const { state, goBack, pushRoute, toggleItemInList } = useCueStore();
  const [filter, setFilter] = useState<'all' | 'active' | 'queued' | 'done'>('all');

  if (mode === 'list' && listId) {
    const list = state.lists.find((l) => l.id === listId);
    if (!list) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center p-6">
          <p className="text-ink font-semibold">List not found</p>
          <button type="button" onClick={goBack} className="mt-3 px-4 py-2 rounded-full bg-surface text-sm">
            Back
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display font-bold text-2xl text-ink">{list.name}</h1>
            {list.description && <p className="text-sm text-ink-dim mt-0.5">{list.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {list.items.map((ref) => {
            const title =
              ref.kind === 'show'
                ? state.shows[ref.id]?.title
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.title
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]?.title
                    : state.games[ref.id]?.title;
            const poster =
              ref.kind === 'show'
                ? state.shows[ref.id]?.posterUrl
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.posterUrl
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]?.coverUrl
                    : state.games[ref.id]?.coverUrl;
            const year =
              ref.kind === 'show'
                ? state.shows[ref.id]?.year
                : ref.kind === 'movie'
                  ? state.movies[ref.id]?.year
                  : ref.kind === 'read'
                    ? state.readItems[ref.id]?.year
                    : state.games[ref.id]?.year;
            if (!title) return null;

            return (
              <div key={`${ref.kind}-${ref.id}`} className="group relative text-left">
                <button
                  type="button"
                  onClick={() => {
                    if (ref.kind === 'show') pushRoute({ view: 'show-detail', showId: ref.id });
                    else if (ref.kind === 'movie') pushRoute({ view: 'movie-detail', movieId: ref.id });
                    else if (ref.kind === 'read') pushRoute({ view: 'read-detail', readId: ref.id });
                    else pushRoute({ view: 'game-detail', gameId: ref.id });
                  }}
                  className="w-full text-left"
                >
                  <div className="aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                    <MediaImage
                      src={poster}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink truncate">{title}</p>
                  <p className="text-xs text-ink-dim">
                    {year} · {ref.kind}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleItemInList(list.id, ref.kind, ref.id)}
                  aria-label={`Remove ${title}`}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/70 text-ink-dim hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'watch') {
    const shows = state.showOrder
      .map((id) => state.shows[id])
      .filter((s): s is Show => Boolean(s) && Boolean(state.showProgress[s.id]?.bookmarked))
      .map((s) => {
        const st = getShowStats(s, state.showProgress[s.id]);
        return {
          kind: 'show' as const,
          id: s.id,
          title: s.title,
          year: s.year,
          poster: s.posterUrl,
          ratio: st.progressRatio,
          bucket: st.isFinished ? 'done' : st.watchedUnique > 0 ? 'active' : 'queued',
        };
      });
    const movies = state.movieOrder
      .map((id) => state.movies[id])
      .filter((m): m is Movie => Boolean(m) && Boolean(state.movieProgress[m.id]))
      .map((m) => {
        const watched = (state.movieProgress[m.id]?.watchCount || 0) > 0;
        return {
          kind: 'movie' as const,
          id: m.id,
          title: m.title,
          year: m.year,
          poster: m.posterUrl,
          ratio: watched ? 1 : 0,
          bucket: watched ? 'done' : 'queued',
        };
      });
    const combined = [...shows, ...movies].filter((x) => (filter === 'all' ? true : x.bucket === filter));

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-2xl text-ink">
            Watch Library ({combined.length})
          </h1>
        </div>
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Watching' },
            { id: 'queued', label: 'Queued' },
            { id: 'done', label: 'Finished' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                filter === f.id
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {combined.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() =>
                item.kind === 'show'
                  ? pushRoute({ view: 'show-detail', showId: item.id })
                  : pushRoute({ view: 'movie-detail', movieId: item.id })
              }
              className="text-left group"
            >
              <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                <MediaImage
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                {item.ratio > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                    <div className="h-full bg-watched" style={{ width: `${Math.round(item.ratio * 100)}%` }} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-ink truncate">{item.title}</p>
              <p className="text-xs text-ink-dim tabular-nums">{item.year}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'read') {
    const items = state.readOrder
      .map((id) => state.readItems[id])
      .filter((r): r is ReadItem => Boolean(r) && Boolean(state.readProgress[r.id]?.bookmarked))
      .filter((r) => {
        if (filter === 'all') return true;
        const st = getReadStats(r, state.readProgress[r.id]);
        if (filter === 'done') return st.isFinished;
        if (filter === 'active') return !st.isFinished && st.current > 0;
        return st.current === 0;
      });

    return (
      <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-2xl text-ink">
            Read Library ({items.length})
          </h1>
        </div>
        <div className="flex gap-2 mb-5">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Reading' },
            { id: 'queued', label: 'Want to read' },
            { id: 'done', label: 'Finished' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
                filter === f.id
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
          {items.map((item) => {
            const st = getReadStats(item, state.readProgress[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pushRoute({ view: 'read-detail', readId: item.id })}
                className="text-left group"
              >
                <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                  <MediaImage
                    src={item.coverUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  {st.current > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                      <div className="h-full bg-watched" style={{ width: `${Math.round(st.ratio * 100)}%` }} />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-ink truncate">{item.title}</p>
                <p className="text-xs text-ink-dim truncate capitalize">
                  {item.format} · {item.creator}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const games = state.gameOrder
    .map((id) => state.games[id])
    .filter((g): g is GameItem => Boolean(g) && Boolean(state.gameProgress[g.id]?.bookmarked))
    .filter((g) => {
      const status = state.gameProgress[g.id]?.status;
      if (filter === 'all') return true;
      if (filter === 'active') return status === 'playing';
      if (filter === 'queued') return status === 'backlog';
      return status === 'completed';
    });

  return (
    <div className="min-h-dvh pb-20 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-bold text-2xl text-ink">
          Play Library ({games.length})
        </h1>
      </div>
      <div className="flex gap-2 mb-5">
        {[
          { id: 'all', label: 'All' },
          { id: 'active', label: 'Playing' },
          { id: 'queued', label: 'Backlog' },
          { id: 'done', label: 'Completed' },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id as typeof filter)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 ${
              filter === f.id
                ? 'bg-brand border-brand text-white'
                : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {games.map((game) => {
          const prog = state.gameProgress[game.id];
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => pushRoute({ view: 'game-detail', gameId: game.id })}
              className="text-left group"
            >
              <div className="relative aspect-[2/3] rounded-[16px] overflow-hidden bg-surface border border-white/8">
                <MediaImage
                  src={game.coverUrl}
                  alt={game.title}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                {(prog?.completionPct || 0) > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50">
                    <div className="h-full bg-watched" style={{ width: `${prog?.completionPct || 0}%` }} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm font-medium text-ink truncate">{game.title}</p>
              <p className="text-xs text-ink-dim tabular-nums">
                {prog?.hoursPlayed || 0}h · {prog?.platform || game.platforms[0]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
