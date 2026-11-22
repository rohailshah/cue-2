import { Check, Grid2x2, Rows3, X } from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import type {
  LayoutMode,
  MediaDomain,
  PlayFilter,
  ReadFilter,
  SortMode,
  WatchFilter,
} from '../types';

export function FilterSortSheet({ domain }: { domain: MediaDomain }) {
  const { state, filterSheetOpen, setFilterSheetOpen, updateSettings } = useCueStore();

  if (!filterSheetOpen) return null;

  const currentLayout: LayoutMode =
    domain === 'watch'
      ? state.settings.watchLayout
      : domain === 'read'
        ? state.settings.readLayout
        : state.settings.playLayout;

  const setLayout = (layout: LayoutMode) => {
    if (domain === 'watch') updateSettings({ watchLayout: layout });
    else if (domain === 'read') updateSettings({ readLayout: layout });
    else updateSettings({ playLayout: layout });
  };

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'recent', label: 'Recently updated' },
    { value: 'alpha', label: 'Alphabetical (A–Z)' },
    { value: 'progress', label: 'Closest to done' },
    { value: 'rating', label: 'Personal / IMDb rating' },
  ];

  const watchFilters: { value: WatchFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'tv', label: 'Shows' },
    { value: 'movie', label: 'Movies' },
    { value: 'anime', label: 'Anime' },
  ];

  const readFilters: { value: ReadFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'novel', label: 'Novels' },
    { value: 'manga', label: 'Manga' },
    { value: 'comic', label: 'Comics' },
  ];

  const playFilters: { value: PlayFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'playing', label: 'Playing' },
    { value: 'backlog', label: 'Backlog' },
    { value: 'completed', label: 'Completed' },
  ];

  const titleLabel =
    domain === 'watch'
      ? 'Watch view & filters'
      : domain === 'read'
        ? 'Read view & filters'
        : 'Play view & filters';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => setFilterSheetOpen(false)}
    >
      <div
        className="w-full md:max-w-md bg-surface border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 pb-8 md:pb-6 shadow-2xl animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg text-ink">{titleLabel}</h3>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(false)}
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2.5">
            Layout
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setLayout('cards')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                currentLayout === 'cards'
                  ? 'border-brand bg-brand/15 text-ink'
                  : 'border-white/10 bg-background text-ink-dim hover:text-ink'
              }`}
            >
              <Rows3 className="w-4 h-4" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setLayout('posters')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                currentLayout === 'posters'
                  ? 'border-brand bg-brand/15 text-ink'
                  : 'border-white/10 bg-background text-ink-dim hover:text-ink'
              }`}
            >
              <Grid2x2 className="w-4 h-4" />
              <span>Poster Grid</span>
            </button>
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2.5">
            Category
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {domain === 'watch' &&
              watchFilters.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ watchFilter: opt.value })}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                    state.settings.watchFilter === opt.value
                      ? 'border-brand bg-brand/15 text-ink'
                      : 'border-white/10 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            {domain === 'read' &&
              readFilters.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ readFilter: opt.value })}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                    state.settings.readFilter === opt.value
                      ? 'border-brand bg-brand/15 text-ink'
                      : 'border-white/10 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            {domain === 'play' &&
              playFilters.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ playFilter: opt.value })}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                    state.settings.playFilter === opt.value
                      ? 'border-brand bg-brand/15 text-ink'
                      : 'border-white/10 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-2.5">
            Sort by
          </p>
          <div className="space-y-1.5">
            {sortOptions.map((opt) => {
              const active = state.settings.sortBy === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSettings({ sortBy: opt.value })}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-colors ${
                    active
                      ? 'bg-surface-raised text-ink font-medium'
                      : 'text-ink-dim hover:bg-white/5 hover:text-ink'
                  }`}
                >
                  <span>{opt.label}</span>
                  {active && <Check className="w-4 h-4 text-brand" />}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            updateSettings({ showPosterProgress: !state.settings.showPosterProgress })
          }
          className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
        >
          <span className="text-ink font-medium">Progress bars on artwork</span>
          <span
            className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${
              state.settings.showPosterProgress ? 'bg-brand justify-end' : 'bg-white/15 justify-start'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow" />
          </span>
        </button>
      </div>
    </div>
  );
}
