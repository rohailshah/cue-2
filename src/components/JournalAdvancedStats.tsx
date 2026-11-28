import { useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Award,
  BookOpen,
  Calendar,
  Clock,
  Compass,
  Download,
  Flame,
  Gamepad2,
  Hourglass,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Sunrise,
  TrendingUp,
  Trophy,
  Tv,
  X,
} from 'lucide-react';
import type { CollectionDetails, CueStoreState, OwnershipStatus } from '../types';
import {
  computeCollectionLedger,
  type CollectionLedgerEntry,
} from '../utils/collection';
import { computeTasteProfile } from '../utils/cueMind';
import {
  downloadTextFile,
  exportComicsCsv,
  exportLibraryCsv,
} from '../utils/mediaExport';
import {
  computeJournalAdvancedStats,
  type HeatmapDayCell,
  type InvestedTitleItem,
  type JournalStatsScope,
  type TimeBlockCell,
} from '../utils/journalAnalytics';
import { CollectionDetailsForm } from './CollectionDetailCard';
import { formatFinishedDate } from './FinishedDateCard';
import { MediaImage } from './MediaImage';

interface JournalAdvancedStatsProps {
  state: CueStoreState;
  scope: JournalStatsScope;
  onScopeChange: (next: JournalStatsScope) => void;
  onOpenItem: (item: Pick<InvestedTitleItem, 'domain' | 'kind' | 'id'>) => void;
  onOpenCueMind?: (side: 'continue' | 'discover') => void;
  onSetOwnership?: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    ownership: OwnershipStatus | undefined
  ) => void;
  onSaveCollectionDetails?: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    details: Partial<CollectionDetails>,
    ownershipOverride?: OwnershipStatus
  ) => void;
}

const SCOPE_PILLS: Array<{
  id: JournalStatsScope;
  label: string;
  activeClass: string;
  idleClass: string;
}> = [
  {
    id: 'all',
    label: 'All',
    activeClass: 'bg-white border-white text-[#131519]',
    idleClass: 'bg-surface border-white/15 text-ink hover:border-white/30',
  },
  {
    id: 'watch',
    label: 'Watch',
    activeClass: 'bg-watch border-watch text-[#0E1A1E]',
    idleClass: 'bg-watch/10 border-watch/25 text-watch hover:bg-watch/18',
  },
  {
    id: 'read',
    label: 'Read',
    activeClass: 'bg-read border-read text-[#1D160A]',
    idleClass: 'bg-read/10 border-read/25 text-read hover:bg-read/18',
  },
  {
    id: 'play',
    label: 'Play',
    activeClass: 'bg-play border-play text-[#161124]',
    idleClass: 'bg-play/10 border-play/25 text-play hover:bg-play/18',
  },
];

function accentTokensForScope(scope: JournalStatsScope) {
  if (scope === 'watch') {
    return {
      text: 'text-watch',
      bg: 'bg-watch',
      border: 'border-watch/35',
      softBg: 'bg-watch/12',
      hex: '#6EC5D4',
    };
  }
  if (scope === 'read') {
    return {
      text: 'text-read',
      bg: 'bg-read',
      border: 'border-read/35',
      softBg: 'bg-read/12',
      hex: '#DFB062',
    };
  }
  if (scope === 'play') {
    return {
      text: 'text-play',
      bg: 'bg-play',
      border: 'border-play/35',
      softBg: 'bg-play/12',
      hex: '#A894E8',
    };
  }
  return {
    text: 'text-brand',
    bg: 'bg-brand',
    border: 'border-white/15',
    softBg: 'bg-white/10',
    hex: '#6EC5D4',
  };
}

function heatCellClass(level: 0 | 1 | 2 | 3 | 4, scope: JournalStatsScope): string {
  if (level === 0) return 'bg-white/[0.05]';
  if (scope === 'read') {
    if (level === 1) return 'bg-read/25';
    if (level === 2) return 'bg-read/45';
    if (level === 3) return 'bg-read/70';
    return 'bg-read';
  }
  if (scope === 'play') {
    if (level === 1) return 'bg-play/25';
    if (level === 2) return 'bg-play/45';
    if (level === 3) return 'bg-play/70';
    return 'bg-play';
  }
  if (scope === 'watch') {
    if (level === 1) return 'bg-watch/25';
    if (level === 2) return 'bg-watch/45';
    if (level === 3) return 'bg-watch/70';
    return 'bg-watch';
  }
  if (level === 1) return 'bg-[#7AC7A4]/25';
  if (level === 2) return 'bg-[#7AC7A4]/50';
  if (level === 3) return 'bg-[#7AC7A4]/75';
  return 'bg-[#7AC7A4]';
}

export function JournalAdvancedStats({
  state,
  scope,
  onScopeChange,
  onOpenItem,
  onOpenCueMind,
  onSetOwnership,
  onSaveCollectionDetails,
}: JournalAdvancedStatsProps) {
  const stats = useMemo(() => computeJournalAdvancedStats(state, scope), [state, scope]);
  const taste = useMemo(() => computeTasteProfile(state), [state]);
  const accent = accentTokensForScope(scope);

  const [chartMetric, setChartMetric] = useState<'logs' | 'hours'>('logs');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [selectedTimeCell, setSelectedTimeCell] = useState<TimeBlockCell | null>(null);

  const selectedDay = useMemo(
    () =>
      selectedDayIso
        ? stats.calendarHeatmap.days.find((d) => d.dateIso === selectedDayIso) || null
        : null,
    [selectedDayIso, stats.calendarHeatmap.days]
  );
  const [dailyPaceMinutes, setDailyPaceMinutes] = useState<30 | 60 | 120>(60);
  const [selectedRatingStars, setSelectedRatingStars] = useState<number | null>(null);
  const [selectedDecade, setSelectedDecade] = useState<string | null>(null);

  const weeklyMax = useMemo(() => {
    const vals = stats.activity.weeklySeries.map((w) =>
      chartMetric === 'logs' ? w.logs : w.hours
    );
    return Math.max(1, ...vals);
  }, [stats.activity.weeklySeries, chartMetric]);

  const activeWeekPoint = useMemo(() => {
    if (selectedWeekIdx !== null && stats.activity.weeklySeries[selectedWeekIdx]) {
      return stats.activity.weeklySeries[selectedWeekIdx];
    }
    const nonZero = [...stats.activity.weeklySeries].reverse().find((w) => w.logs > 0);
    return nonZero || stats.activity.weeklySeries[stats.activity.weeklySeries.length - 1];
  }, [selectedWeekIdx, stats.activity.weeklySeries]);

  const forecast = useMemo(() => {
    if (stats.backlog.remainingMinutes <= 0) {
      return {
        dateLabel: 'Caught up',
        daysLabel: '0 days left',
      };
    }
    const days = Math.max(1, Math.ceil(stats.backlog.remainingMinutes / dailyPaceMinutes));
    const target = new Date(Date.now() + days * 86400 * 1000);
    const remHours = Math.round(stats.backlog.remainingMinutes / 60);
    const timeStr =
      remHours >= 24
        ? `${Math.floor(remHours / 24)}d ${remHours % 24}h left`
        : `${Math.max(1, remHours)}h left`;
    return {
      dateLabel: target.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      daysLabel: `${timeStr} (${days}d at ${dailyPaceMinutes >= 60 ? `${dailyPaceMinutes / 60}h` : '30m'}/day)`,
    };
  }, [stats.backlog.remainingMinutes, dailyPaceMinutes]);

  const calendarWeeks = useMemo(() => {
    const weeks: HeatmapDayCell[][] = Array.from({ length: 16 }, () => []);
    for (const day of stats.calendarHeatmap.days) {
      weeks[day.weekIndex]?.push(day);
    }
    return weeks;
  }, [stats.calendarHeatmap.days]);

  const podiumTop3 = stats.topInvested.slice(0, 3);
  const podiumOthers = stats.topInvested.slice(3, 5);
  const maxRatingBucket = Math.max(1, ...stats.ratings.histogram.map((b) => b.count));
  const maxDecadeCount = Math.max(1, ...stats.decades.map((d) => d.count));

  const ringRadius = 36;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - stats.habits.completionRatePct / 100);

  return (
    <div className="space-y-4 pb-6">
      {/* Scope Filter Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {SCOPE_PILLS.map((pill) => {
            const active = scope === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  onScopeChange(pill.id);
                  setSelectedWeekIdx(null);
                  setSelectedDayIso(null);
                  setSelectedTimeCell(null);
                }}
                aria-pressed={active}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                  active ? pill.activeClass : pill.idleClass
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] font-medium text-ink-faint tabular-nums">
          {stats.habits.totalTrackedCount} titles tracked
        </span>
      </div>

      {/* 1. Hero Media Life Card */}
      <section className="rounded-[24px] bg-surface border border-white/[0.06] p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${accent.text}`}>
            {scope === 'all'
              ? 'Your Media Life'
              : scope === 'watch'
                ? 'Your Watch Life'
                : scope === 'read'
                  ? 'Your Reading Life'
                  : 'Your Play Life'}
          </p>
          <span className="text-[11px] text-ink-faint tabular-nums">
            {stats.totalHours.toLocaleString()} {stats.totalHours === 1 ? 'hour' : 'hours'} total
          </span>
        </div>

        <div>
          <p className="font-display font-extrabold text-[38px] sm:text-[44px] text-ink leading-none tracking-tight tabular-nums">
            {stats.heroPrimaryLabel}
          </p>
          <p className="text-xs sm:text-[13px] text-ink-dim mt-2 tabular-nums">
            {stats.heroSubline}
          </p>
        </div>

        {scope === 'all' && stats.totalMinutes > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-[2px]">
              {stats.domainSplit.watchPct > 0 && (
                <div
                  className="h-full bg-watch transition-all duration-300"
                  style={{ width: `${stats.domainSplit.watchPct}%` }}
                />
              )}
              {stats.domainSplit.readPct > 0 && (
                <div
                  className="h-full bg-read transition-all duration-300"
                  style={{ width: `${stats.domainSplit.readPct}%` }}
                />
              )}
              {stats.domainSplit.playPct > 0 && (
                <div
                  className="h-full bg-play transition-all duration-300"
                  style={{ width: `${stats.domainSplit.playPct}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-ink-dim flex-wrap tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-watch" />
                Watch {stats.domainSplit.watchPct}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-read" />
                Read {stats.domainSplit.readPct}%
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-play" />
                Play {stats.domainSplit.playPct}%
              </span>
            </div>
          </div>
        )}

        <p className="text-[12.5px] text-ink/80 pt-1 border-t border-white/[0.05]">
          {stats.heroComparison}
        </p>
      </section>

      {/* 2. Media Personality */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sunrise className={`w-4 h-4 ${accent.text}`} />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-dim">
            Media Personality
          </p>
        </div>

        <div className="flex items-center gap-3.5">
          <div
            className={`h-12 w-12 rounded-2xl border ${accent.border} ${accent.softBg} flex items-center justify-center shrink-0`}
          >
            {scope === 'read' ? (
              <BookOpen className={`w-5 h-5 ${accent.text}`} />
            ) : scope === 'play' ? (
              <Gamepad2 className={`w-5 h-5 ${accent.text}`} />
            ) : scope === 'watch' ? (
              <Tv className={`w-5 h-5 ${accent.text}`} />
            ) : (
              <Sparkles className={`w-5 h-5 ${accent.text}`} />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-lg text-ink leading-tight">
              {stats.personality.archetype}
            </p>
            <p className="text-xs text-ink-dim mt-0.5">{stats.personality.subtitle}</p>
          </div>
        </div>

        {stats.personality.traits.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {stats.personality.traits.map((trait) => (
              <span
                key={trait}
                className="px-2.5 py-1 rounded-full bg-background border border-white/10 text-[11px] font-semibold text-ink/90"
              >
                {trait}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Cue Mind Calibration / Taste DNA (Hidden from Cue tab during first boot <5 entries) */}
      <section
        aria-label="Cue Mind Taste Engine"
        className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3"
      >
        {!taste.isUnlocked ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                  Cue Mind · Learning silently
                </p>
              </div>
              <span className="text-xs font-semibold text-ink tabular-nums px-2.5 py-0.5 rounded-full bg-background border border-white/10">
                {taste.learnedEntriesCount} / {taste.unlockThreshold} entries
              </span>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((taste.learnedEntriesCount / taste.unlockThreshold) * 100)
                  )}%`,
                }}
              />
            </div>

            <p className="text-xs text-ink-dim leading-relaxed">
              Cue Mind stays out of your way on first boot and starts learning your genres,
              ratings, and pace from entry #1. Once you log {taste.unlockThreshold} entries, it
              unlocks on your Cue tab with both <span className="text-ink font-medium">Continue</span> and{' '}
              <span className="text-ink font-medium">Discover</span> picks.
            </p>

            {taste.learnedEntriesCount > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {taste.topGenres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 rounded-full bg-background border border-white/10 text-[11px] font-medium text-ink"
                  >
                    Learning: {g}
                  </span>
                ))}
                {taste.preferredDecade && (
                  <span className="px-2.5 py-1 rounded-full bg-background border border-white/10 text-[11px] text-ink-dim tabular-nums">
                    {taste.preferredDecade}s
                  </span>
                )}
              </div>
            )}

            <div className="pt-1 border-t border-white/[0.06]">
              <p className="text-[11px] text-ink-faint">{taste.summaryLine}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                  Cue Mind · Taste DNA
                </p>
              </div>
              <span className="text-[11px] font-medium text-ink-dim px-2.5 py-0.5 rounded-full bg-background border border-white/10 capitalize">
                Pace: {taste.pacePreference}
              </span>
            </div>

            <p className="text-xs text-ink leading-relaxed">{taste.summaryLine}</p>

            {(taste.topGenres.length > 0 || taste.anchorTitles.length > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {taste.topGenres.slice(0, 4).map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 rounded-full bg-background border border-white/10 text-[11px] font-semibold text-ink"
                  >
                    {g}
                  </span>
                ))}
                {taste.anchorTitles.slice(0, 2).map((a) => (
                  <span
                    key={`${a.kind}-${a.id}`}
                    className="px-2.5 py-1 rounded-full bg-background border border-brand/25 text-[11px] text-ink-dim truncate max-w-[190px]"
                  >
                    Loved: {a.title}
                  </span>
                ))}
              </div>
            )}

            {onOpenCueMind && (
              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenCueMind('continue')}
                  className="px-3.5 py-1.5 rounded-full bg-background border border-white/12 hover:border-white/30 text-xs font-semibold text-ink inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span>Continue picks</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCueMind('discover')}
                  className="px-3.5 py-1.5 rounded-full bg-brand text-brand-ink text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Discover flipside</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* 3. Activity Comparison & Interactive 16-Week Pulse */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <Activity className={`w-4 h-4 ${accent.text}`} />
          <h2 className="font-display font-bold text-[18px] text-ink">Activity</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] bg-surface border border-white/[0.06] p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
              Last 7 Days
            </p>
            <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
              {stats.activity.last7Hours}h
            </p>
            <p className="text-[11px] text-ink-dim mt-1 tabular-nums">
              {stats.activity.last7Logs} logs
              {stats.activity.last7DeltaPct !== null && (
                <span
                  className={
                    stats.activity.last7DeltaPct >= 0 ? ' text-[#7AC7A4]' : ' text-ink-faint'
                  }
                >
                  {' '}
                  · {stats.activity.last7DeltaPct >= 0 ? '+' : ''}
                  {stats.activity.last7DeltaPct}%
                </span>
              )}
            </p>
          </div>

          <div className="rounded-[20px] bg-surface border border-white/[0.06] p-4">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
              Last 30 Days
            </p>
            <p className="font-display font-bold text-2xl text-ink mt-1.5 tabular-nums">
              {stats.activity.last30Hours}h
            </p>
            <p className="text-[11px] text-ink-dim mt-1 tabular-nums">
              {stats.activity.last30Logs} logs
              {stats.activity.last30DeltaPct !== null && (
                <span
                  className={
                    stats.activity.last30DeltaPct >= 0 ? ' text-[#7AC7A4]' : ' text-ink-faint'
                  }
                >
                  {' '}
                  · {stats.activity.last30DeltaPct >= 0 ? '+' : ''}
                  {stats.activity.last30DeltaPct}%
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 16-Week Timeline Chart */}
        <div className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-ink">16-Week Pulse</p>
              <p className="text-[11px] text-ink-dim tabular-nums">
                Week of {activeWeekPoint.weekLabel}: {activeWeekPoint.logs} logs ·{' '}
                {activeWeekPoint.hours}h
              </p>
            </div>
            <div className="inline-flex rounded-full bg-background border border-white/10 p-0.5">
              {(
                [
                  { id: 'logs', label: 'Logs' },
                  { id: 'hours', label: 'Time' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setChartMetric(m.id)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                    chartMetric === m.id ? 'bg-white/15 text-ink' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div
            role="group"
            aria-label="16 week activity bar chart"
            className="grid grid-cols-16 gap-1 items-end h-28 pt-2 border-b border-white/[0.06]"
          >
            {stats.activity.weeklySeries.map((wk, idx) => {
              const val = chartMetric === 'logs' ? wk.logs : wk.hours;
              const pct = val > 0 ? Math.max(10, Math.round((val / weeklyMax) * 100)) : 4;
              const isSelected = activeWeekPoint.weekStartIso === wk.weekStartIso;

              const totalLogsSafe = Math.max(1, wk.logs);
              const wPct = Math.round((wk.watchLogs / totalLogsSafe) * 100);
              const rPct = Math.round((wk.readLogs / totalLogsSafe) * 100);
              const pPct = Math.max(0, 100 - wPct - rPct);

              return (
                <button
                  key={wk.weekStartIso}
                  type="button"
                  onClick={() => setSelectedWeekIdx(idx)}
                  aria-label={`Week of ${wk.weekLabel}: ${wk.logs} logs, ${wk.hours} hours`}
                  className="h-full flex flex-col justify-end items-center group"
                >
                  <div
                    className={`w-full rounded-t-[4px] overflow-hidden flex flex-col justify-end transition-all duration-300 ${
                      val === 0 ? 'bg-white/[0.06]' : ''
                    } ${isSelected ? 'ring-1 ring-white/50' : 'opacity-90 group-hover:opacity-100'}`}
                    style={{ height: `${pct}%` }}
                  >
                    {val > 0 && scope === 'all' ? (
                      <>
                        {pPct > 0 && <div className="w-full bg-play" style={{ height: `${pPct}%` }} />}
                        {rPct > 0 && <div className="w-full bg-read" style={{ height: `${rPct}%` }} />}
                        {wPct > 0 && <div className="w-full bg-watch" style={{ height: `${wPct}%` }} />}
                      </>
                    ) : val > 0 ? (
                      <div className={`w-full h-full ${accent.bg}`} />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-ink-faint tabular-nums">
            <span>{stats.activity.weeklySeries[0]?.monthLabel}</span>
            <span>
              {stats.activity.weeklySeries[Math.floor(stats.activity.weeklySeries.length / 2)]?.monthLabel}
            </span>
            <span>{stats.activity.weeklySeries[stats.activity.weeklySeries.length - 1]?.monthLabel}</span>
          </div>
        </div>
      </section>

      {/* 4. Your Days Calendar Heatmap */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Calendar className={`w-3.5 h-3.5 ${accent.text}`} />
              <p className="font-display font-bold text-base text-ink">Your Days</p>
            </div>
            <p className="text-xs text-ink-dim mt-0.5 tabular-nums">
              {selectedDay
                ? `${selectedDay.label}: ${selectedDay.count} ${selectedDay.count === 1 ? 'log' : 'logs'}`
                : `${stats.calendarHeatmap.activeDaysCount} active ${
                    stats.calendarHeatmap.activeDaysCount === 1 ? 'day' : 'days'
                  } logged`}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-ink-faint shrink-0 pt-1">
            <span>Less</span>
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                className={`h-2.5 w-2.5 rounded-[2px] ${heatCellClass(lvl, scope)}`}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="grid grid-cols-16 gap-1">
          {calendarWeeks.map((week, wIdx) => (
            <div key={`cal-w-${wIdx}`} className="flex flex-col gap-1">
              {week.map((day) => (
                <button
                  key={day.dateIso}
                  type="button"
                  onClick={() => setSelectedDayIso(day.dateIso)}
                  aria-label={`${day.label}: ${day.count} logs`}
                  className={`w-full aspect-square rounded-[3px] transition-transform ${heatCellClass(
                    day.level,
                    scope
                  )} ${
                    selectedDay?.dateIso === day.dateIso
                      ? 'ring-1 ring-white scale-110'
                      : 'hover:ring-1 hover:ring-white/40'
                  }`}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] text-ink-faint">
          {stats.calendarHeatmap.monthHeaders.map((m) => (
            <span key={`${m.weekIndex}-${m.label}`}>{m.label}</span>
          ))}
        </div>
      </section>

      {/* 5. When You Engage (Day x Hour Heatmap) */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
        <div>
          <div className="flex items-center gap-1.5">
            <Clock className={`w-3.5 h-3.5 ${accent.text}`} />
            <p className="font-display font-bold text-base text-ink">When You Engage</p>
          </div>
          <p className="text-xs text-ink-dim mt-0.5">
            {selectedTimeCell
              ? `${selectedTimeCell.dayLabel} (${selectedTimeCell.blockLabel}): ${selectedTimeCell.count} logs`
              : `Prime window: ${stats.timeHeatmap.primeWindowLabel}`}
          </p>
        </div>

        <div className="space-y-1">
          {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
            const row = stats.timeHeatmap.cells.filter((c) => c.dayIndex === dayIdx);
            const dayName = row[0]?.dayLabel || '';
            return (
              <div key={dayName} className="flex items-center gap-2">
                <span className="w-7 text-[10px] font-medium text-ink-faint shrink-0">{dayName}</span>
                <div className="grid grid-cols-6 gap-1 flex-1">
                  {row.map((cell) => (
                    <button
                      key={`${cell.dayIndex}-${cell.blockIndex}`}
                      type="button"
                      onClick={() => setSelectedTimeCell(cell)}
                      aria-label={`${cell.dayLabel} ${cell.blockLabel}: ${cell.count} logs`}
                      className={`h-4 sm:h-5 rounded-[4px] transition-all ${heatCellClass(
                        cell.level,
                        scope
                      )} ${
                        selectedTimeCell?.dayIndex === cell.dayIndex &&
                        selectedTimeCell?.blockIndex === cell.blockIndex
                          ? 'ring-1 ring-white'
                          : 'hover:ring-1 hover:ring-white/35'
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1">
            <span className="w-7 shrink-0" />
            <div className="grid grid-cols-6 gap-1 flex-1 text-center text-[10px] text-ink-faint tabular-nums">
              {['12a', '4a', '8a', '12p', '4p', '8p'].map((lbl) => (
                <span key={lbl}>{lbl}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Habits Completion Ring & Hall of Fame */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 flex items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
              <circle
                cx="44"
                cy="44"
                r={ringRadius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="7"
              />
              <circle
                cx="44"
                cy="44"
                r={ringRadius}
                fill="none"
                stroke={accent.hex}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display font-bold text-xl text-ink tabular-nums leading-none">
                {stats.habits.completionRatePct}%
              </span>
            </div>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Completion Rate
            </p>
            <p className="text-sm font-semibold text-ink tabular-nums">
              {stats.habits.finishedCount} finished · {stats.habits.inProgressCount} active
            </p>
            <p className="text-xs text-ink-dim tabular-nums">
              {stats.habits.queuedCount} queued · {stats.habits.droppedCount} dropped
            </p>
          </div>
        </section>

        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Trophy className={`w-4 h-4 ${accent.text}`} />
            <p className="font-display font-bold text-base text-ink">Hall of Fame</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Biggest Day</p>
              <p className="font-semibold text-ink mt-0.5 tabular-nums">
                {stats.hallOfFame.biggestDayCount} {stats.hallOfFame.biggestDayCount === 1 ? 'log' : 'logs'}
              </p>
              <p className="text-[11px] text-ink-dim truncate">{stats.hallOfFame.biggestDayLabel}</p>
            </div>
            <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Best Month</p>
              <p className="font-semibold text-ink mt-0.5 truncate">{stats.hallOfFame.bestMonthLabel}</p>
              <p className="text-[11px] text-ink-dim truncate tabular-nums">
                {stats.hallOfFame.bestMonthHoursLabel}
              </p>
            </div>
            <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Longest Streak</p>
              <p className="font-semibold text-ink mt-0.5 inline-flex items-center gap-1 tabular-nums">
                <Flame className="w-3.5 h-3.5 text-read shrink-0" />
                {stats.hallOfFame.longestStreakDays} days
              </p>
            </div>
            <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Tracking Since</p>
              <p className="font-semibold text-ink mt-0.5 truncate">
                {stats.hallOfFame.trackingSinceLabel}
              </p>
              {stats.hallOfFame.trackingSinceTitle && (
                <p className="text-[11px] text-ink-dim truncate">
                  {stats.hallOfFame.trackingSinceTitle}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 7. Catching Up Backlog Forecast */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Hourglass className={`w-4 h-4 ${accent.text}`} />
            <p className="font-display font-bold text-base text-ink">Catching Up</p>
          </div>
          <div className="inline-flex rounded-full bg-background border border-white/10 p-0.5">
            {(
              [
                { mins: 30, label: '30m/d' },
                { mins: 60, label: '1h/d' },
                { mins: 120, label: '2h/d' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.mins}
                type="button"
                onClick={() => setDailyPaceMinutes(opt.mins)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
                  dailyPaceMinutes === opt.mins
                    ? 'bg-white/15 text-ink'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
              Caught up by
            </p>
            <p className="font-display font-extrabold text-2xl text-ink mt-0.5 tabular-nums">
              {forecast.dateLabel}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold text-ink tabular-nums">{forecast.daysLabel}</p>
            <p className="text-[11px] text-ink-dim tabular-nums">
              {stats.backlog.remainingBreakdownLabel}
            </p>
          </div>
        </div>
      </section>

      {/* 8. Your Taste: Top 5 Invested Podium */}
      {stats.topInvested.length > 0 && (
        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-4">
          <div className="flex items-center gap-1.5">
            <Award className={`w-4 h-4 ${accent.text}`} />
            <h2 className="font-display font-bold text-base text-ink">Most Time Invested</h2>
          </div>

          <div className="grid grid-cols-3 gap-2.5 items-end">
            {([1, 0, 2] as const).map((rankIdx) => {
              const item = podiumTop3[rankIdx];
              if (!item) return <div key={`empty-pod-${rankIdx}`} />;
              const isFirst = rankIdx === 0;
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className={`text-left group ${isFirst ? '-mt-2' : ''}`}
                >
                  <div
                    className={`relative aspect-[2/3] rounded-[14px] overflow-hidden bg-background border transition-colors ${
                      isFirst
                        ? `${accent.border} ring-1 ring-white/10`
                        : 'border-white/10 group-hover:border-white/25'
                    }`}
                  >
                    <MediaImage
                      src={item.posterUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <span
                      className={`absolute top-1.5 left-1.5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums flex items-center justify-center ${
                        isFirst
                          ? 'bg-brand text-brand-ink'
                          : 'bg-[#0F1318]/85 border border-white/15 text-ink'
                      }`}
                    >
                      #{rankIdx + 1}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-semibold text-ink truncate">{item.title}</p>
                  <p className="text-[11px] text-ink-dim tabular-nums truncate">
                    {item.metricLabel} · {item.subLabel}
                  </p>
                </button>
              );
            })}
          </div>

          {podiumOthers.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              {podiumOthers.map((item, idx) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="w-full flex items-center gap-3 p-1.5 -mx-1.5 rounded-xl hover:bg-white/[0.04] text-left transition-colors"
                >
                  <span className="w-5 text-xs font-bold text-ink-faint tabular-nums text-center">
                    #{idx + 4}
                  </span>
                  <div className="w-9 h-12 rounded-lg overflow-hidden bg-surface-raised shrink-0">
                    <MediaImage
                      src={item.posterUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink truncate">{item.title}</p>
                    <p className="text-[11px] text-ink-dim truncate">{item.subLabel}</p>
                  </div>
                  <span className="text-xs font-semibold text-ink tabular-nums shrink-0">
                    {item.metricLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 9. Ratings & Histogram */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 fill-read text-read" />
            <h2 className="font-display font-bold text-base text-ink">Ratings</h2>
          </div>
          <span className="text-xs text-ink-dim tabular-nums">
            {stats.ratings.totalRated} rated
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-watch">Watch</p>
            <p className="font-display font-bold text-lg text-ink mt-0.5 tabular-nums">
              {stats.ratings.watchAvg !== null ? `★ ${stats.ratings.watchAvg}` : '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-read">Read</p>
            <p className="font-display font-bold text-lg text-ink mt-0.5 tabular-nums">
              {stats.ratings.readAvg !== null ? `★ ${stats.ratings.readAvg}` : '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-background/60 border border-white/[0.04] p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-play">Play</p>
            <p className="font-display font-bold text-lg text-ink mt-0.5 tabular-nums">
              {stats.ratings.playAvg !== null ? `★ ${stats.ratings.playAvg}` : '—'}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="grid grid-cols-5 gap-2 items-end h-20 pt-2">
            {stats.ratings.histogram.map((b) => {
              const hPct = b.count > 0 ? Math.max(12, Math.round((b.count / maxRatingBucket) * 100)) : 5;
              const isSelected = selectedRatingStars === b.stars;
              return (
                <button
                  key={b.stars}
                  type="button"
                  onClick={() =>
                    setSelectedRatingStars(isSelected ? null : b.stars)
                  }
                  aria-label={`${b.stars} stars: ${b.count} ratings`}
                  className="h-full flex flex-col justify-end items-center gap-1"
                >
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-[5px] transition-all duration-300 ${
                        b.count > 0 ? 'bg-read' : 'bg-white/[0.07]'
                      } ${isSelected ? 'ring-1 ring-white' : ''}`}
                      style={{ height: `${hPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink-dim tabular-nums">{b.stars}★</span>
                </button>
              );
            })}
          </div>
          {selectedRatingStars !== null && (
            <p className="text-[11px] text-center text-ink-dim tabular-nums">
              {selectedRatingStars}★ ·{' '}
              {stats.ratings.histogram.find((h) => h.stars === selectedRatingStars)?.count || 0}{' '}
              ratings
            </p>
          )}
        </div>
      </section>

      {/* 10. Top Genres & Moods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stats.topGenres.length > 0 && (
          <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
            <h2 className="font-display font-bold text-base text-ink">Top Genres</h2>
            <div className="space-y-2">
              {stats.topGenres.map((g) => (
                <div key={g.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink font-medium">{g.name}</span>
                    <span className="text-ink-dim tabular-nums">{g.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${accent.bg} transition-all duration-300`}
                      style={{ width: `${g.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="space-y-3">
          {stats.moods.length > 0 && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
              <h2 className="font-display font-bold text-base text-ink">How You Felt</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {stats.moods.map((m) => (
                  <span
                    key={m.key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 text-xs font-medium text-ink"
                  >
                    <span>{m.emoji}</span>
                    <span>{m.label}</span>
                    <span className="text-ink-dim tabular-nums">{m.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {stats.topSources.length > 0 && (
            <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
              <h2 className="font-display font-bold text-base text-ink">
                Networks, Publishers & Platforms
              </h2>
              <div className="flex items-center gap-1.5 flex-wrap">
                {stats.topSources.map((s) => (
                  <span
                    key={s.name}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-white/10 text-xs text-ink"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-ink-faint tabular-nums">{s.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 11. Creators & Decades */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stats.topCreators.length > 0 && (
          <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-2.5">
            <h2 className="font-display font-bold text-base text-ink">
              Creators & Studios You Return To
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {stats.topCreators.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 text-xs text-ink"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      c.domain === 'watch'
                        ? 'bg-watch'
                        : c.domain === 'read'
                          ? 'bg-read'
                          : 'bg-play'
                    }`}
                  />
                  <span className="font-medium">{c.name}</span>
                  <span className="text-ink-faint tabular-nums">{c.count}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={`w-4 h-4 ${accent.text}`} />
              <h2 className="font-display font-bold text-base text-ink">Decades</h2>
            </div>
            <span className="text-xs text-ink-dim">
              {selectedDecade
                ? `${selectedDecade} (${stats.decades.find((d) => d.label === selectedDecade)?.count || 0})`
                : `Your decade: ${stats.peakDecadeLabel}`}
            </span>
          </div>

          <div className="grid grid-cols-6 gap-2 items-end h-24 pt-2 border-b border-white/[0.06]">
            {stats.decades.map((d) => {
              const hPct = d.count > 0 ? Math.max(12, Math.round((d.count / maxDecadeCount) * 100)) : 5;
              const isPeak = d.label === stats.peakDecadeLabel && d.count > 0;
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setSelectedDecade(d.label)}
                  aria-label={`${d.label}: ${d.count} titles`}
                  className="h-full flex flex-col justify-end items-center"
                >
                  <div
                    className={`w-full rounded-t-[5px] transition-all duration-300 ${
                      d.count === 0
                        ? 'bg-white/[0.06]'
                        : isPeak
                          ? accent.bg
                          : 'bg-white/25 hover:bg-white/40'
                    }`}
                    style={{ height: `${hPct}%` }}
                  />
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-6 gap-2 text-center text-[10.5px] text-ink-dim tabular-nums">
            {stats.decades.map((d) => (
              <span key={d.label}>{d.shortLabel}</span>
            ))}
          </div>
        </section>
      </div>

      {/* 12. My Collection Ledger (Owned / Wishlist, Spend, Efficiency & Inline Editor) */}
      <AdvancedCollectionLedger
        state={state}
        scope={scope}
        onOpenItem={onOpenItem}
        onSetOwnership={onSetOwnership}
        onSaveCollectionDetails={onSaveCollectionDetails}
      />
    </div>
  );
}

interface AdvancedCollectionLedgerProps {
  state: CueStoreState;
  scope: JournalStatsScope;
  onOpenItem: (item: Pick<InvestedTitleItem, 'domain' | 'kind' | 'id'>) => void;
  onSetOwnership?: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    ownership: OwnershipStatus | undefined
  ) => void;
  onSaveCollectionDetails?: (
    kind: 'show' | 'movie' | 'read' | 'game',
    id: string,
    details: Partial<CollectionDetails>,
    ownershipOverride?: OwnershipStatus
  ) => void;
}

function AdvancedCollectionLedger({
  state,
  scope,
  onOpenItem,
  onSetOwnership,
  onSaveCollectionDetails,
}: AdvancedCollectionLedgerProps) {
  const ledger = useMemo(() => computeCollectionLedger(state, scope), [state, scope]);
  const [tab, setTab] = useState<'owned' | 'wishlist'>('owned');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const selectableTargets = useMemo(() => {
    const out: Array<{
      key: string;
      kind: 'show' | 'movie' | 'read' | 'game';
      domain: 'watch' | 'read' | 'play';
      id: string;
      title: string;
      year?: number;
      details?: CollectionDetails;
      fallbackNotes?: string;
      ownership?: OwnershipStatus;
      fallbackMinutes?: number;
      fallbackHours?: number;
    }> = [];
    const incWatch = scope === 'all' || scope === 'watch';
    const incRead = scope === 'all' || scope === 'read';
    const incPlay = scope === 'all' || scope === 'play';

    if (incWatch) {
      for (const id of state.showOrder) {
        const s = state.shows[id];
        const p = state.showProgress[id];
        if (!s || !p?.bookmarked) continue;
        out.push({
          key: `show:${s.id}`,
          kind: 'show',
          domain: 'watch',
          id: s.id,
          title: `${s.title} (Series)`,
          year: s.year,
          details: p.collection,
          ownership: p.ownership,
          fallbackMinutes: Math.max(1, s.totalEpisodes || 1) * (s.runtimeAvg || 42),
        });
      }
      for (const id of state.movieOrder) {
        const m = state.movies[id];
        const p = state.movieProgress[id];
        if (!m || !p) continue;
        out.push({
          key: `movie:${m.id}`,
          kind: 'movie',
          domain: 'watch',
          id: m.id,
          title: `${m.title} (Movie)`,
          year: m.year,
          details: p.collection,
          ownership: p.ownership,
          fallbackMinutes: m.runtime || 120,
        });
      }
    }
    if (incRead) {
      for (const id of state.readOrder) {
        const r = state.readItems[id];
        const p = state.readProgress[id];
        if (!r || !p?.bookmarked) continue;
        out.push({
          key: `read:${r.id}`,
          kind: 'read',
          domain: 'read',
          id: r.id,
          title: r.title,
          year: r.year,
          details: p.collection,
          fallbackNotes: p.collectionNote,
          ownership: p.ownership,
        });
      }
    }
    if (incPlay) {
      for (const id of state.gameOrder) {
        const g = state.games[id];
        const p = state.gameProgress[id];
        if (!g || !p?.bookmarked) continue;
        out.push({
          key: `game:${g.id}`,
          kind: 'game',
          domain: 'play',
          id: g.id,
          title: g.title,
          year: g.year,
          details: p.collection,
          ownership: p.ownership,
          fallbackHours: p.hoursPlayed || 0,
        });
      }
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }, [
    scope,
    state.showOrder,
    state.shows,
    state.showProgress,
    state.movieOrder,
    state.movies,
    state.movieProgress,
    state.readOrder,
    state.readItems,
    state.readProgress,
    state.gameOrder,
    state.games,
    state.gameProgress,
  ]);

  const activeTarget = editingKey
    ? selectableTargets.find((t) => t.key === editingKey) ||
      (() => {
        const found = [...ledger.ownedEntries, ...ledger.wishlistEntries].find(
          (e) => e.key === editingKey
        );
        if (!found) return undefined;
        return {
          key: found.key,
          kind: found.kind,
          domain: found.domain,
          id: found.id,
          title: found.title,
          year: found.year,
          details: found.collection,
          fallbackNotes: undefined,
          ownership: found.ownership,
          fallbackMinutes: found.fallbackMinutes,
          fallbackHours: found.fallbackHours,
        };
      })()
    : undefined;

  const baseList: CollectionLedgerEntry[] =
    tab === 'owned' ? ledger.ownedEntries : ledger.wishlistEntries;
  const filteredList =
    formatFilter === 'all' || tab !== 'owned'
      ? baseList
      : baseList.filter(
          (e) => (e.collection.format || '').toLowerCase() === formatFilter.toLowerCase()
        );
  const visibleList = showAll ? filteredList : filteredList.slice(0, 10);

  const efficiencySummaryLabel = useMemo(() => {
    if (scope === 'watch' && ledger.avgPricePerMin !== null) {
      return `$${ledger.avgPricePerMin.toFixed(2)}/min avg`;
    }
    if (scope === 'read' && ledger.avgPricePerPage !== null) {
      return `$${ledger.avgPricePerPage.toFixed(2)}/pg avg`;
    }
    if (scope === 'play' && ledger.avgPricePerHour !== null) {
      return `$${ledger.avgPricePerHour.toFixed(2)}/hr avg`;
    }
    const parts: string[] = [];
    if (ledger.avgPricePerMin !== null) parts.push(`$${ledger.avgPricePerMin.toFixed(2)}/m`);
    if (ledger.avgPricePerPage !== null) parts.push(`$${ledger.avgPricePerPage.toFixed(2)}/pg`);
    if (ledger.avgPricePerHour !== null) parts.push(`$${ledger.avgPricePerHour.toFixed(2)}/hr`);
    return parts.length > 0 ? parts.join(' · ') : 'Add price + size';
  }, [scope, ledger.avgPricePerMin, ledger.avgPricePerPage, ledger.avgPricePerHour]);

  return (
    <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 space-y-3.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Archive className="w-4 h-4 text-brand shrink-0" />
          <div>
            <h2 className="font-display font-bold text-base text-ink leading-tight">
              My Collection
            </h2>
            <p className="text-[11px] text-ink-dim tabular-nums">
              {ledger.ownedCount} owned · {ledger.wishlistCount} wishlist
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 10);
              const csv =
                scope === 'read' ? exportComicsCsv(state) : exportLibraryCsv(state, scope);
              const file =
                scope === 'read'
                  ? `cue-comics-books-${stamp}.csv`
                  : `cue-collection-${scope}-${stamp}.csv`;
              downloadTextFile(csv, file, 'text/csv;charset=utf-8');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 hover:border-watch/50 text-xs font-semibold text-ink-dim hover:text-ink shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-watch" />
            <span>{scope === 'read' ? 'Comics CSV' : 'Export CSV'}</span>
          </button>

          {onSaveCollectionDetails && selectableTargets.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (pickerOpen || editingKey) {
                  setPickerOpen(false);
                  setEditingKey(null);
                } else {
                  setPickerOpen(true);
                  setEditingKey(selectableTargets[0]?.key || null);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background border border-white/10 hover:border-brand/50 text-xs font-semibold text-ink shrink-0 transition-colors"
            >
              {pickerOpen || editingKey ? (
                <>
                  <X className="w-3.5 h-3.5 text-ink-dim" />
                  <span>Close editor</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-brand" />
                  <span>Add / edit details</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Compact Summary Strip */}
      {(ledger.ownedCount > 0 || ledger.wishlistCount > 0) && (
        <div className="rounded-2xl bg-background/55 border border-white/[0.05] grid grid-cols-3 divide-x divide-white/[0.06] text-center">
          <div className="py-2.5 px-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Owned
            </p>
            <p className="font-display font-bold text-sm sm:text-base text-ink tabular-nums mt-0.5">
              {ledger.ownedCount}
            </p>
          </div>
          <div className="py-2.5 px-2 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Spent
            </p>
            <p className="font-display font-bold text-sm sm:text-base text-ink tabular-nums truncate mt-0.5">
              {ledger.primarySpendLabel}
            </p>
            {ledger.freeCount > 0 && (
              <p className="text-[9.5px] text-ink-faint tabular-nums">{ledger.freeCount} free</p>
            )}
          </div>
          <div className="py-2.5 px-2 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Efficiency
            </p>
            <p className="font-display font-bold text-xs sm:text-sm text-brand tabular-nums truncate mt-1">
              {efficiencySummaryLabel}
            </p>
          </div>
        </div>
      )}

      {/* Inline Collection Editor (Title Picker + Full Spreadsheet Fields) */}
      {(pickerOpen || activeTarget) && onSaveCollectionDetails && (
        <div className="rounded-2xl bg-background/65 border border-white/10 p-3.5 space-y-3">
          {pickerOpen && selectableTargets.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                Select library title
              </label>
              <select
                value={editingKey || selectableTargets[0].key}
                onChange={(e) => setEditingKey(e.target.value)}
                aria-label="Select title to edit collection details"
                className="w-full rounded-xl bg-surface border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
              >
                {selectableTargets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeTarget && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-ink truncate">
                  {activeTarget.title}
                </p>
                {activeTarget.ownership && onSetOwnership && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetOwnership(activeTarget.kind, activeTarget.id, undefined);
                      setEditingKey(null);
                      setPickerOpen(false);
                    }}
                    className="text-[11px] text-ink-faint hover:text-red-400 shrink-0"
                  >
                    Remove from collection
                  </button>
                )}
              </div>
              <CollectionDetailsForm
                key={activeTarget.key}
                domain={activeTarget.domain}
                showOwnershipToggle
                initialOwnership={activeTarget.ownership || 'owned'}
                initialDetails={activeTarget.details}
                fallbackNotes={activeTarget.fallbackNotes}
                fallbackMinutes={activeTarget.fallbackMinutes}
                fallbackHours={activeTarget.fallbackHours}
                onSave={(nextDetails, nextOwn) => {
                  onSaveCollectionDetails(activeTarget.kind, activeTarget.id, nextDetails, nextOwn);
                  setEditingKey(null);
                  setPickerOpen(false);
                }}
                onCancel={() => {
                  setEditingKey(null);
                  setPickerOpen(false);
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Owned / Wishlist & Format Filter Row */}
      {(ledger.ownedCount > 0 || ledger.wishlistCount > 0) ? (
        <>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                setTab('owned');
                setShowAll(false);
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                tab === 'owned'
                  ? 'bg-white border-white text-[#131519]'
                  : 'bg-background border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              Owned ({ledger.ownedCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('wishlist');
                setFormatFilter('all');
                setShowAll(false);
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors ${
                tab === 'wishlist'
                  ? 'bg-white border-white text-[#131519]'
                  : 'bg-background border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              Wishlist ({ledger.wishlistCount})
            </button>
            {tab === 'owned' &&
              ledger.formatCounts.map((fc) => {
                const active = formatFilter === fc.format;
                return (
                  <button
                    key={fc.format}
                    type="button"
                    onClick={() => setFormatFilter(active ? 'all' : fc.format)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0 transition-colors ${
                      active
                        ? 'border-brand/60 bg-brand/15 text-brand'
                        : 'border-white/[0.08] bg-background text-ink-dim hover:text-ink'
                    }`}
                  >
                    {fc.format} · {fc.count}
                  </button>
                );
              })}
          </div>

          <div className="divide-y divide-white/[0.06]">
            {visibleList.length === 0 ? (
              <p className="text-xs text-ink-faint py-3">
                No {tab === 'owned' ? 'owned' : 'wishlist'} items match this filter.
              </p>
            ) : (
              visibleList.map((entry) => {
                const acquiredLabel = formatFinishedDate(entry.collection.acquiredAt);
                const subMeta = [
                  acquiredLabel,
                  entry.collection.platform,
                  entry.collection.pages ? `${entry.collection.pages}p` : null,
                  entry.collection.runtimeMinutes ? `${entry.collection.runtimeMinutes}m` : null,
                  entry.collection.owner ? `Owner: ${entry.collection.owner}` : null,
                  entry.collection.includes ? `Includes: ${entry.collection.includes}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <div
                    key={entry.key}
                    className="py-2.5 flex items-start justify-between gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onOpenItem({ domain: entry.domain, kind: entry.kind, id: entry.id })
                      }
                      className="flex items-start gap-2.5 min-w-0 flex-1 text-left group"
                    >
                      <div className="w-9 aspect-[2/3] rounded-md overflow-hidden bg-background border border-white/10 shrink-0 mt-0.5">
                        <MediaImage
                          src={entry.posterUrl}
                          alt={entry.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink truncate group-hover:text-brand transition-colors">
                          {entry.title}
                        </p>
                        <p className="text-[11px] text-ink-dim truncate tabular-nums mt-0.5">
                          {[entry.collection.format || entry.badgeText, subMeta]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {entry.collection.notes && (
                          <p className="text-[11px] text-ink-faint truncate mt-0.5">
                            {entry.collection.notes}
                          </p>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {(entry.formattedPrice || entry.efficiency) && (
                        <div className="text-right tabular-nums">
                          {entry.formattedPrice && (
                            <p className="text-xs font-semibold text-ink">
                              {entry.formattedPrice}
                            </p>
                          )}
                          {entry.efficiency && (
                            <p className="text-[10px] text-ink-dim">{entry.efficiency.short}</p>
                          )}
                        </div>
                      )}
                      {onSaveCollectionDetails && (
                        <button
                          type="button"
                          onClick={() => {
                            setPickerOpen(false);
                            setEditingKey((cur) => (cur === entry.key ? null : entry.key));
                          }}
                          aria-label={`Edit collection details for ${entry.title}`}
                          className="h-7 w-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-ink-dim hover:text-ink transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {filteredList.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full py-2 rounded-xl bg-background/60 hover:bg-background border border-white/[0.06] text-xs font-semibold text-ink-dim hover:text-ink transition-colors"
            >
              {showAll ? 'Show less' : `Show all ${filteredList.length} items`}
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-ink-faint">
          Tap the archive icon on any Show, Movie, Book, Comic, or Game — or use{' '}
          <span className="text-ink-dim font-medium">Add / edit details</span> above to log formats, dates, prices, and notes.
        </p>
      )}
    </section>
  );
}
