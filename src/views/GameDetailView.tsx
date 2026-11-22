import { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ListPlus,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Star,
  Trophy,
} from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import { PersonalNotesSection } from '../components/PersonalNotesSection';
import { useCueStore } from '../store/useCueStore';
import type { GamePlatform } from '../types';

const PLATFORMS: GamePlatform[] = ['PC', 'PS5', 'Switch', 'Xbox', 'Steam Deck'];

export function GameDetailView({ gameId }: { gameId: string }) {
  const {
    state,
    goBack,
    logGameSession,
    updateGameProgress,
    toggleGameCompleted,
    toggleGamePlatinum,
    incrementGamePlaythrough,
    toggleGameBookmark,
    rateGame,
    setGameMood,
    resetGameProgress,
    toggleItemInList,
    createCustomList,
  } = useCueStore();

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listPickerOpen, setListPickerOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  const game = state.games[gameId];
  const progress = state.gameProgress[gameId];

  if (!game) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg font-semibold text-ink">Game not found</p>
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

  const isCompleted = progress?.status === 'completed';
  const hours = progress?.hoursPlayed || 0;
  const pct = progress?.completionPct || 0;
  const platform = progress?.platform || game.platforms[0] || 'PC';

  return (
    <div className="min-h-dvh pb-20 bg-background">
      {/* Flat Dark Hero (no gradient) */}
      <div className="relative h-[290px] sm:h-[350px] md:h-[380px] w-full overflow-hidden border-b border-white/[0.06]">
        <MediaImage
          src={game.backdropUrl || game.coverUrl}
          alt={game.title}
          className="w-full h-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-[#131519]/55" />

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
              onClick={() => toggleGameBookmark(game.id)}
              aria-label="Bookmark game"
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
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-surface-raised border border-white/12 p-1.5 shadow-2xl animate-sheet-up">
              <button
                type="button"
                onClick={() => {
                  incrementGamePlaythrough(game.id, 1);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-ink hover:bg-white/8 text-left"
              >
                <Plus className="w-4 h-4 text-watched" />
                <span>Log new playthrough (+1)</span>
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
                  resetGameProgress(game.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/10 text-left"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset game progress</span>
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 inset-x-0 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-1">
            {game.developer} · {game.year}
          </p>
          <h1 className="font-display font-extrabold text-3xl sm:text-5xl text-ink tracking-tight">
            {game.title}
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-4">
        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => toggleGameBookmark(game.id)}
            aria-label="Toggle Play bookmark"
            className={`h-12 w-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              progress?.bookmarked
                ? 'border-watched text-watched bg-watched/10'
                : 'border-white/20 text-ink-dim hover:border-white/40'
            }`}
          >
            <Bookmark className="w-5 h-5" fill={progress?.bookmarked ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            onClick={() => toggleGameCompleted(game.id)}
            className={`flex-1 h-12 rounded-full font-semibold text-[15px] flex items-center justify-center gap-2 transition-all ${
              isCompleted
                ? 'border-2 border-watched bg-watched/[0.08] text-ink'
                : 'bg-brand text-brand-ink hover:opacity-95'
            }`}
          >
            <Check
              className={`w-5 h-5 ${isCompleted ? 'text-watched' : 'text-brand-ink'}`}
              strokeWidth={2.5}
            />
            <span>
              {isCompleted
                ? `Completed${
                    progress && progress.playthroughCount > 1
                      ? ` · x${progress.playthroughCount}`
                      : ''
                  }`
                : 'Mark Completed'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => toggleGamePlatinum(game.id)}
            aria-label="Toggle 100% Platinum trophy"
            className={`h-12 px-4 rounded-full border text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              progress?.platinum
                ? 'border-brand bg-brand/15 text-brand'
                : 'border-white/12 bg-surface-raised text-ink-dim hover:text-ink'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>100%</span>
          </button>
        </div>

        {/* Interactive Session & Completion Card */}
        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-ink-dim uppercase tracking-wider font-semibold">
                Hours played
              </p>
              <div className="flex items-center gap-2.5 mt-1">
                <button
                  type="button"
                  onClick={() => logGameSession(game.id, -1)}
                  className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-ink"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-display font-bold text-2xl text-ink tabular-nums min-w-[3.5rem] text-center">
                  {hours}h
                </span>
                <button
                  type="button"
                  onClick={() => logGameSession(game.id, 1)}
                  className="w-8 h-8 rounded-full bg-brand/20 text-brand flex items-center justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-dim">Playthroughs:</span>
              <button
                type="button"
                onClick={() => incrementGamePlaythrough(game.id, -1)}
                className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-bold text-watched tabular-nums min-w-[1.5rem] text-center">
                x{progress?.playthroughCount || 0}
              </span>
              <button
                type="button"
                onClick={() => incrementGamePlaythrough(game.id, 1)}
                className="w-7 h-7 rounded-full bg-watched/20 flex items-center justify-center text-watched"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-ink-dim">Completion</span>
              <span className="text-xs font-bold text-watched tabular-nums">{pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) =>
                updateGameProgress(game.id, { completionPct: Number(e.target.value) })
              }
              aria-label="Game completion percentage"
              className="w-full accent-[#A894E8] cursor-pointer"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-dim mb-2">Platform</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PLATFORMS.map((plat) => (
                <button
                  key={plat}
                  type="button"
                  onClick={() => updateGameProgress(game.id, { platform: plat })}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    platform === plat
                      ? 'border-brand bg-brand/15 text-ink'
                      : 'border-white/8 bg-background text-ink-dim hover:text-ink'
                  }`}
                >
                  {plat}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Info & Star Rating */}
        <section className="pb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-[16px] text-ink">Game info</h2>
              <p className="text-[13.5px] text-ink-dim mt-0.5">{game.genres.join(' · ')}</p>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = (progress?.rating || 0) >= star;
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => rateGame(game.id, star)}
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
            {game.overview}
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
          domain="play"
          mediaKind="game"
          mediaId={game.id}
          mediaTitle={game.title}
          mediaPoster={game.coverUrl}
          defaultContext={hours > 0 ? `${hours}h · ${platform}` : platform}
          currentRating={progress?.rating}
          currentMood={progress?.mood}
          onSelectMood={(mood) => setGameMood(game.id, mood)}
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
                const included = list.items.some((x) => x.kind === 'game' && x.id === game.id);
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => toggleItemInList(list.id, 'game', game.id)}
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
                  createCustomList(newListName, '', { kind: 'game', id: game.id });
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
