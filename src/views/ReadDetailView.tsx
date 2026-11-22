import { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ListPlus,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Star,
} from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { useCueStore } from '../store/useCueStore';
import { getReadStats } from '../utils/stats';

export function ReadDetailView({ readId }: { readId: string }) {
  const {
    state,
    goBack,
    advanceReadProgress,
    setReadProgress,
    markReadFinished,
    incrementReread,
    toggleReadBookmark,
    rateReadItem,
    setReadMood,
    updateReadTotalUnits,
    resetReadProgress,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState('');

  const item = state.readItems[readId];
  const progress = state.readProgress[readId];

  if (!item) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Title not found</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 px-5 py-2.5 rounded-full bg-surface-raised text-sm text-ink"
        >
          Go back
        </button>
      </div>
    );
  }

  const stats = getReadStats(item, progress);
  const formatLabel =
    item.format === 'manga' ? 'Manga' : item.format === 'comic' ? 'Comic' : 'Novel';

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Flat Dark Hero (no gradient) */}
      <div className="relative h-[300px] sm:h-[360px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={item.backdropUrl || item.coverUrl}
          alt={item.title}
          className="w-full h-full object-cover object-center blur-[3px] scale-105 opacity-30"
        />
        <div className="absolute inset-0 bg-[#131519]/65" />

        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="md:hidden glass-btn fixed top-4 left-4 z-30 h-10 w-10 rounded-full flex items-center justify-center text-ink"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="fixed top-4 md:top-20 right-4 md:right-8 z-30">
          <div className="glass-pill rounded-full px-1.5 py-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleReadBookmark(item.id)}
              aria-label="Bookmark"
              className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                progress?.bookmarked ? 'text-watched' : 'text-ink'
              }`}
            >
              <Bookmark className="w-4 h-4" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="More options"
              className="h-8 w-8 rounded-full flex items-center justify-center text-ink hover:bg-white/10"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              <button
                type="button"
                onClick={() => {
                  incrementReread(item.id, 1);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log reread (+1)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setListPickerOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <ListPlus className="w-4 h-4 text-brand" />
                <span>Add to custom list</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetReadProgress(item.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset reading progress</span>
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto flex items-end gap-4">
          <div className="w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-surface">
            <MediaImage src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 pb-1">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/20 text-brand mb-1.5">
              {formatLabel}
            </span>
            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight leading-tight">
              {item.title}
            </h1>
            <p className="text-sm text-ink-dim mt-1">
              {item.creator} · {item.year}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-4">
        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => toggleReadBookmark(item.id)}
            aria-label="Toggle library bookmark"
            className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-5 h-5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          {stats.isFinished ? (
            <button
              type="button"
              onClick={() => incrementReread(item.id, 1)}
              className="flex-1 h-12 rounded-full border-2 border-watched text-ink font-semibold text-[15px] flex items-center justify-center gap-2 bg-watched/[0.08] hover:bg-watched/15 transition-colors"
            >
              <Check className="w-5 h-5 text-watched" strokeWidth={2.5} />
              <span>Finished</span>
              {stats.rereadCount > 1 && (
                <span className="text-watched font-bold text-sm ml-1">· x{stats.rereadCount}</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => advanceReadProgress(item.id, 1)}
              className="flex-1 h-12 rounded-full bg-brand text-brand-ink font-semibold text-[15px] flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
              <span>Log +1 {stats.unitSingular}</span>
            </button>
          )}

          {!stats.isFinished && (
            <button
              type="button"
              onClick={() => markReadFinished(item.id)}
              className="h-12 px-4 rounded-full bg-surface-raised border border-white/12 text-sm font-semibold text-watched hover:bg-white/10"
            >
              Finish
            </button>
          )}
        </div>

        {/* Interactive Chapter / Issue Progress Tracker */}
        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-6">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-ink">
              {item.format === 'comic' ? 'Issue run progress' : 'Chapter progress'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-watched tabular-nums">
                {stats.current} / {stats.total} {stats.unitLabel} ({Math.round(stats.ratio * 100)}%)
              </span>
              <button
                type="button"
                onClick={() => {
                  setTotalDraft(String(item.totalUnits));
                  setEditingTotal((v) => !v);
                }}
                aria-label="Edit total count"
                className="p-1 rounded-full bg-white/8 text-ink-dim hover:text-ink"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          </div>

          {editingTotal && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = Number(totalDraft);
                if (val > 0) updateReadTotalUnits(item.id, val);
                setEditingTotal(false);
              }}
              className="flex items-center gap-2 mb-3"
            >
              <input
                type="number"
                min={1}
                value={totalDraft}
                onChange={(e) => setTotalDraft(e.target.value)}
                className="w-28 rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold"
              >
                Set total {stats.unitLabel}
              </button>
            </form>
          )}

          <input
            type="range"
            min={0}
            max={stats.total}
            value={stats.current}
            onChange={(e) => setReadProgress(item.id, Number(e.target.value))}
            aria-label="Reading progress slider"
            className="w-full accent-[#DFB062] cursor-pointer mb-3"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReadProgress(item.id, stats.current - 1)}
                className="h-9 px-3 rounded-full bg-white/8 text-xs font-semibold text-ink hover:bg-white/12 flex items-center gap-1"
              >
                <Minus className="w-3.5 h-3.5" />1 {stats.unitSingular}
              </button>
              <button
                type="button"
                onClick={() => advanceReadProgress(item.id, 1)}
                className="h-9 px-3 rounded-full bg-watched/15 text-xs font-semibold text-watched hover:bg-watched/25 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />1 {stats.unitSingular}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-dim">Rereads:</span>
              <button
                type="button"
                onClick={() => incrementReread(item.id, -1)}
                className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-bold text-watched tabular-nums min-w-[1.5rem] text-center">
                x{stats.rereadCount}
              </span>
              <button
                type="button"
                onClick={() => incrementReread(item.id, 1)}
                className="w-7 h-7 rounded-full bg-watched/20 flex items-center justify-center text-watched"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* Info & Star Rating */}
        <section className="pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[16px] text-ink">About</h2>
              <p className="text-[13.5px] text-ink-dim mt-0.5">
                {item.genres.join(' · ')} · {item.totalUnits} {stats.unitLabel}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (progress?.rating || 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => rateReadItem(item.id, star)}
                    aria-label={`Rate ${star} stars`}
                    className="p-0.5 hover:scale-110 transition-transform"
                  >
                    <Star className={`w-4 h-4 ${active ? 'text-brand fill-brand' : 'text-ink-faint'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <p className={`text-[13.5px] text-ink-dim leading-relaxed mt-2.5 ${expanded ? '' : 'line-clamp-3'}`}>
            {item.overview}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand mt-1"
          >
            {expanded ? 'Show less' : 'More'}
          </button>
        </section>

        <PersonalNotesSection
          domain="read"
          mediaKind={item.format}
          mediaId={item.id}
          mediaTitle={item.title}
          mediaPoster={item.coverUrl}
          defaultContext={stats.current > 0 ? stats.unitShort : undefined}
          currentRating={progress?.rating}
          currentMood={progress?.mood}
          onSelectMood={(mood) => setReadMood(item.id, mood)}
        />
      </div>

      {listPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4"
          onClick={() => setListPickerOpen(false)}
        >
          <div
            className="w-full md:max-w-md bg-surface border border-white/10 rounded-t-[26px] md:rounded-[24px] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-lg text-ink mb-3">Add to custom list</h3>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {state.lists.map((list) => {
                const included = list.items.some((x) => x.kind === 'read' && x.id === item.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'read', item.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-background border border-white/8 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{list.name}</p>
                      <p className="text-xs text-ink-dim">{list.items.length} titles</p>
                    </div>
                    {included && <Check className="w-4 h-4 text-watched" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="New list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="flex-1 rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newListName.trim()) return;
                  createCustomList(newListName, '', { kind: 'read', id: item.id });
                  setNewListName('');
                }}
                className="px-4 py-2 rounded-xl bg-brand text-brand-ink text-sm font-semibold"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
