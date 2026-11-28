import { useMemo, useState } from 'react';
import { Award, Calendar, Download, Flame, Sparkles, Star, X } from 'lucide-react';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import { computeYearWrapped, getAvailableWrappedYears } from '../utils/wrapped';
import { MediaImage } from './MediaImage';

interface YearWrappedModalProps {
  open: boolean;
  onClose: () => void;
}

export function YearWrappedModal({ open, onClose }: YearWrappedModalProps) {
  const { state } = useCueStore();
  useModalBackHandler(open, onClose);

  const years = useMemo(() => getAvailableWrappedYears(state), [state]);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(() => years[0] || 2026);
  const wrapped = useMemo(
    () => computeYearWrapped(state, selectedYear),
    [state, selectedYear]
  );

  if (!open) return null;

  const handleSavePng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flat matte dark background (#131519) & card surface (#1B1E23) — zero gradients
    ctx.fillStyle = '#131519';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1B1E23';
    ctx.beginPath();
    ctx.roundRect(56, 56, 968, 1238, 40);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Header
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('CUE · WATCH · READ · PLAY', 104, 134);

    ctx.fillStyle = '#F5F7FA';
    ctx.font = 'bold 74px system-ui, sans-serif';
    ctx.fillText(`${wrapped.yearLabel} Wrapped`, 104, 224);

    ctx.fillStyle = '#6EC5D4';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(wrapped.archetype, 104, 278);

    // Hero Hours
    ctx.fillStyle = '#131519';
    ctx.beginPath();
    ctx.roundRect(104, 326, 872, 210, 28);
    ctx.fill();

    ctx.fillStyle = '#F5F7FA';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.fillText(`${wrapped.totalHours.toLocaleString()}h`, 144, 440);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillText(
      `Watch ${wrapped.watchPct}%  ·  Read ${wrapped.readPct}%  ·  Play ${wrapped.playPct}%`,
      144,
      496
    );

    // 4 stat boxes
    const statCells = [
      { label: 'EPISODES', val: String(wrapped.episodesCount), color: '#6EC5D4' },
      { label: 'ISSUES & CH.', val: String(wrapped.issuesCount + wrapped.chaptersCount), color: '#DFB062' },
      { label: 'FILMS & GAMES', val: String(wrapped.moviesCount + wrapped.gamesCompletedCount), color: '#A894E8' },
      { label: 'LONGEST STREAK', val: `${wrapped.longestStreakDays}d`, color: '#7AC7A4' },
    ];
    statCells.forEach((cell, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 104 + col * 448;
      const y = 568 + row * 140;
      ctx.fillStyle = '#131519';
      ctx.beginPath();
      ctx.roundRect(x, y, 424, 120, 24);
      ctx.fill();
      ctx.fillStyle = cell.color;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(cell.label, x + 28, y + 42);
      ctx.fillStyle = '#F5F7FA';
      ctx.font = 'bold 46px system-ui, sans-serif';
      ctx.fillText(cell.val, x + 28, y + 96);
    });

    // Top titles
    ctx.fillStyle = '#9CA3AF';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('TOP RATED HIGHLIGHTS', 104, 898);

    wrapped.topTitles.slice(0, 4).forEach((t, idx) => {
      const y = 924 + idx * 72;
      ctx.fillStyle = '#F5F7FA';
      ctx.font = '600 30px system-ui, sans-serif';
      const line = `${idx + 1}. ${t.title}`.slice(0, 38);
      ctx.fillText(line, 104, y + 36);
      ctx.fillStyle = '#DFB062';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(`★ ${t.rating.toFixed(1)}`, 860, y + 36);
    });

    // Footer
    ctx.fillStyle = '#6B7280';
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText(
      `${wrapped.activeDaysCount} active days · Peak month: ${wrapped.bestMonthLabel}`,
      104,
      1242
    );

    const link = document.createElement('a');
    link.download = `cue-${String(wrapped.year).toLowerCase()}-wrapped.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${wrapped.yearLabel} Wrapped`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[90dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 space-y-4 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Year in Review</span>
            </p>
            <h2 className="font-display font-extrabold text-2xl text-ink mt-0.5">
              {wrapped.yearLabel} Wrapped
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Wrapped"
            className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Year selector pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setSelectedYear(y)}
              className={`px-3.5 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                selectedYear === y
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              {y}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedYear('all')}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
              selectedYear === 'all'
                ? 'bg-brand border-brand text-brand-ink'
                : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
            }`}
          >
            All-Time
          </button>
        </div>

        {/* Hero Hours + Domain Split */}
        <div className="rounded-[22px] bg-background border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display font-extrabold text-[40px] text-ink leading-none tabular-nums">
              {wrapped.totalHours.toLocaleString()}h
            </p>
            <span className="text-xs font-semibold text-watch">{wrapped.archetype}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-[2px]">
            {wrapped.watchPct > 0 && (
              <div className="h-full bg-watch" style={{ width: `${wrapped.watchPct}%` }} />
            )}
            {wrapped.readPct > 0 && (
              <div className="h-full bg-read" style={{ width: `${wrapped.readPct}%` }} />
            )}
            {wrapped.playPct > 0 && (
              <div className="h-full bg-play" style={{ width: `${wrapped.playPct}%` }} />
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-ink-dim flex-wrap tabular-nums">
            <span>Watch {wrapped.watchPct}%</span>
            <span>Read {wrapped.readPct}%</span>
            <span>Play {wrapped.playPct}%</span>
          </div>
        </div>

        {/* Atom Counts Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-surface border border-white/[0.06] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-watch">Watch</p>
            <p className="font-display font-bold text-xl text-ink tabular-nums mt-1">
              {wrapped.episodesCount} eps · {wrapped.moviesCount} films
            </p>
          </div>
          <div className="rounded-2xl bg-surface border border-white/[0.06] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-read">Read</p>
            <p className="font-display font-bold text-xl text-ink tabular-nums mt-1">
              {wrapped.issuesCount} iss · {wrapped.chaptersCount} ch
            </p>
          </div>
          <div className="rounded-2xl bg-surface border border-white/[0.06] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-play">Play</p>
            <p className="font-display font-bold text-xl text-ink tabular-nums mt-1">
              {wrapped.gamesCompletedCount} beaten
            </p>
          </div>
          <div className="rounded-2xl bg-surface border border-white/[0.06] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7AC7A4] inline-flex items-center gap-1">
              <Flame className="w-3 h-3" /> Streak
            </p>
            <p className="font-display font-bold text-xl text-ink tabular-nums mt-1">
              {wrapped.longestStreakDays} days · {wrapped.activeDaysCount} active
            </p>
          </div>
        </div>

        {/* Top Rated Highlights */}
        {wrapped.topTitles.length > 0 && (
          <div className="rounded-[20px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-dim inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-brand" />
              <span>Highest Rated of {wrapped.yearLabel}</span>
            </p>
            <div className="space-y-2">
              {wrapped.topTitles.map((t, idx) => (
                <div key={`${t.kind}-${t.id}`} className="flex items-center gap-3">
                  <span className="w-4 text-xs font-bold text-ink-faint tabular-nums">
                    {idx + 1}
                  </span>
                  <div className="h-11 w-8 rounded-md overflow-hidden bg-background shrink-0">
                    <MediaImage
                      src={t.posterUrl}
                      alt={t.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{t.title}</p>
                    <p className="text-[11px] text-ink-dim truncate">{t.subtitle}</p>
                  </div>
                  <span className="text-xs font-bold text-read inline-flex items-center gap-0.5 tabular-nums shrink-0">
                    <Star className="w-3 h-3 fill-current" />
                    {t.rating.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Highlights row */}
        <div className="flex items-center justify-between gap-2 text-xs text-ink-dim bg-background rounded-2xl border border-white/[0.05] px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 truncate">
            <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
            <span>
              Biggest day: <strong className="text-ink">{wrapped.biggestDayLabel}</strong>
            </span>
          </span>
          <span className="shrink-0">
            Peak: <strong className="text-ink">{wrapped.bestMonthLabel}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={handleSavePng}
          className="w-full py-3 rounded-2xl bg-brand text-brand-ink text-sm font-bold inline-flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
        >
          <Download className="w-4 h-4" />
          <span>Save PNG Share Card</span>
        </button>
      </div>
    </div>
  );
}
