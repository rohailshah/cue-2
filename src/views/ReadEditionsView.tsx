import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, Layers, Loader2, Plus } from 'lucide-react';
import { MediaImage } from '../components/MediaImage';
import {
  fetchComicEditionsCatalog,
  resolveOpenLibraryCoverFromIsbn,
} from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import type { ComicEditionFormat, ComicEditionRecord } from '../types';
import {
  getComicEditionFormatLabel,
  getCuratedComicEditionRecords,
  isDcComic,
  mapFormatToCategory,
  mergeComicEditionCatalog,
  normalizeComicEditionId,
} from '../utils/editions';
import { getCompletedReadUnits } from '../utils/stats';

const FILTER_FORMAT_ORDER: ComicEditionFormat[] = [
  'compact',
  'tpb',
  'hardcover',
  'deluxe',
  'absolute',
  'omnibus',
  'digital',
];

export function ReadEditionsView({ readId }: { readId: string }) {
  const { state, goBack, selectComicEdition, updateReadEditionsCatalog, toggleComicEditionOwnership } =
    useCueStore();
  const item = state.readItems[readId];
  const progress = state.readProgress[readId];

  const [formatFilter, setFormatFilter] = useState<'all' | ComicEditionFormat>('all');
  const [scanning, setScanning] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customFormat, setCustomFormat] = useState<ComicEditionFormat>('compact');
  const [customIssues, setCustomIssues] = useState('12');
  const [customIsbn, setCustomIsbn] = useState('');

  const scannedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!item || item.format !== 'comic') return;
    if (scannedIdRef.current === item.id) return;
    scannedIdRef.current = item.id;

    let cancelled = false;
    setScanning(true);
    fetchComicEditionsCatalog(
      item.title,
      item.creator,
      item.coverUrl,
      item.baseTotalUnits ?? item.totalUnits
    )
      .then((catalog) => {
        if (cancelled) return;
        if (catalog.length > 0) {
          updateReadEditionsCatalog(item.id, catalog);
        }
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, updateReadEditionsCatalog]);

  const editions = useMemo(() => {
    if (!item) return [];
    return getCuratedComicEditionRecords(item);
  }, [item]);

  if (!item) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center bg-background">
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

  const isDc = isDcComic(item);
  const completedList = getCompletedReadUnits(item, progress);

  const activeCategory = normalizeComicEditionId(progress?.edition) || 'digital';
  const activeRecordId = useMemo(() => {
    if (progress?.editionId && editions.some((e) => e.id === progress.editionId)) {
      return progress.editionId;
    }
    const matched = editions.find((e) => e.category === activeCategory);
    return matched?.id ?? editions[0]?.id;
  }, [activeCategory, editions, progress?.editionId]);

  const formatCounts = useMemo(() => {
    const counts = new Map<ComicEditionFormat, number>();
    for (const ed of editions) {
      counts.set(ed.format, (counts.get(ed.format) || 0) + 1);
    }
    return counts;
  }, [editions]);

  const availableFilterTabs = useMemo(
    () => FILTER_FORMAT_ORDER.filter((fmt) => (formatCounts.get(fmt) || 0) > 0),
    [formatCounts]
  );

  const visibleEditions = useMemo(() => {
    if (formatFilter === 'all') return editions;
    return editions.filter((ed) => ed.format === formatFilter);
  }, [editions, formatFilter]);

  const handleCreateCustomEdition = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customTitle.trim();
    const count = Math.max(1, Math.round(Number(customIssues) || item.totalUnits || 12));
    if (!cleanName) return;

    const cleanIsbn = customIsbn.replace(/[^0-9X]/gi, '').toUpperCase();
    const resolvedCover = cleanIsbn
      ? resolveOpenLibraryCoverFromIsbn([cleanIsbn])
      : undefined;
    const category = mapFormatToCategory(customFormat);

    const customRecord: ComicEditionRecord = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      format: customFormat,
      category,
      title: `${item.title}: ${cleanName}`,
      shortLabel: cleanName,
      subtitle: `Custom ${getComicEditionFormatLabel(customFormat, isDc)} (${count} ${item.unit})`,
      issueCount: count,
      coverUrl: resolvedCover,
      isbn: cleanIsbn || undefined,
      source: 'custom',
    };

    const customSaved = mergeComicEditionCatalog(editions, [customRecord]);
    updateReadEditionsCatalog(item.id, customSaved);
    selectComicEdition(item.id, customRecord);
    setCustomTitle('');
    setCustomIsbn('');
    setCustomOpen(false);
  };

  return (
    <div className="min-h-dvh pb-24 pt-4 md:pt-24 px-4 sm:px-6 lg:px-10 max-w-5xl mx-auto bg-background">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to comic details"
            className="md:hidden h-10 w-10 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink hover:bg-surface-raised shrink-0 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Layers className="w-4 h-4 text-read shrink-0" />
              <h1 className="font-display font-extrabold text-xl sm:text-2xl text-ink tracking-tight">
                Choose edition
              </h1>
              {scanning && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-surface-raised border border-white/10 text-ink-dim">
                  <Loader2 className="w-3 h-3 animate-spin text-read" />
                  <span>Scanning live editions…</span>
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-ink-dim truncate mt-0.5">
              {item.title} · {item.creator}
            </p>
            <p className="text-xs text-ink-faint mt-1">
              {completedList.length}{' '}
              {completedList.length === 1
                ? item.unit === 'issues'
                  ? 'issue'
                  : 'chapter'
                : item.unit}{' '}
              logged · Progress syncs automatically across overlapping editions
            </p>
          </div>
        </div>
      </div>

      {/* Format Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 mb-5">
        <button
          type="button"
          onClick={() => setFormatFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
            formatFilter === 'all'
              ? 'bg-brand border-brand text-brand-ink'
              : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
          }`}
        >
          All ({editions.length})
        </button>
        {availableFilterTabs.map((fmt) => {
          const active = formatFilter === fmt;
          const count = formatCounts.get(fmt) || 0;
          return (
            <button
              key={fmt}
              type="button"
              onClick={() => setFormatFilter(fmt)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors ${
                active
                  ? 'bg-brand border-brand text-brand-ink'
                  : 'bg-surface border-white/10 text-ink-dim hover:text-ink'
              }`}
            >
              {getComicEditionFormatLabel(fmt, isDc)} ({count})
            </button>
          );
        })}
      </div>

      {/* Editions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {visibleEditions.map((ed) => {
          const isActive = ed.id === activeRecordId;
          const isEdOwned = Boolean(progress?.ownedEditionIds?.includes(ed.id));
          const isEdWish = Boolean(progress?.wishlistEditionIds?.includes(ed.id));
          const completedIssues = Math.min(
            ed.issueCount,
            completedList.filter((u) => u <= ed.issueCount).length
          );
          const pct = Math.round((completedIssues / Math.max(1, ed.issueCount)) * 100);
          const isComplete = completedIssues >= ed.issueCount;
          const fmtLabel = getComicEditionFormatLabel(ed.format, isDc);
          const metaLine = [
            ed.year,
            ed.publisher,
            ed.pageCount ? `${ed.pageCount}p` : null,
            ed.isbn ? `ISBN ${ed.isbn}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={ed.id}
              role="button"
              tabIndex={0}
              onClick={() => selectComicEdition(item.id, ed)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectComicEdition(item.id, ed);
                }
              }}
              aria-pressed={isActive}
              className={`w-full rounded-[20px] p-3.5 border text-left flex gap-3.5 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-surface-raised border-brand'
                  : 'bg-surface border-white/[0.06] hover:bg-surface-raised/70'
              }`}
            >
              <div className="w-16 sm:w-[70px] aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shrink-0 bg-surface-raised">
                <MediaImage
                  src={ed.coverUrl || item.coverUrl}
                  fallbackSrc={item.coverUrl}
                  alt={ed.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          ed.format === 'compact'
                            ? 'bg-brand/20 text-brand'
                            : 'bg-white/8 text-ink-dim'
                        }`}
                      >
                        {fmtLabel}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-watched/20 text-watched">
                          <Check className="w-3 h-3" strokeWidth={2.5} />
                          <span>Active</span>
                        </span>
                      )}
                      {ed.source === 'custom' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/8 text-ink-dim">
                          Custom
                        </span>
                      )}
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => toggleComicEditionOwnership(item.id, ed.id, 'owned')}
                        aria-pressed={isEdOwned}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                          isEdOwned
                            ? 'border-read/60 bg-read/18 text-read'
                            : 'border-white/10 text-ink-faint hover:text-ink hover:border-white/25'
                        }`}
                      >
                        {isEdOwned ? 'Owned' : 'Own'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleComicEditionOwnership(item.id, ed.id, 'wishlist')}
                        aria-pressed={isEdWish}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                          isEdWish
                            ? 'border-dashed border-read/60 bg-read/10 text-read'
                            : 'border-white/10 text-ink-faint hover:text-ink hover:border-white/25'
                        }`}
                      >
                        Want
                      </button>
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-ink leading-snug line-clamp-2 mt-1.5">
                    {ed.title}
                  </p>
                  {ed.subtitle && (
                    <p className="text-xs text-ink-dim line-clamp-2 mt-0.5">{ed.subtitle}</p>
                  )}
                  {metaLine && (
                    <p className="text-[11px] text-ink-faint mt-1 truncate tabular-nums">
                      {metaLine}
                    </p>
                  )}
                </div>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-xs tabular-nums mb-1">
                    <span className="text-ink-dim font-medium">
                      {completedIssues}/{ed.issueCount} {item.unit}
                    </span>
                    <span className={`font-bold ${isComplete ? 'text-watched' : 'text-ink-dim'}`}>
                      {isComplete ? 'Complete' : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-watched transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Custom Edition Panel */}
      <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">Don’t see your exact printing?</p>
            <p className="text-xs text-ink-dim mt-0.5">
              Add a custom edition with your own collected issue count or ISBN cover.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCustomOpen((o) => !o)}
            className="px-3.5 py-2 rounded-full bg-surface-raised border border-white/10 text-xs font-semibold text-ink hover:bg-white/10 inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-brand" />
            <span>{customOpen ? 'Close' : 'Add custom edition'}</span>
          </button>
        </div>

        {customOpen && (
          <form onSubmit={handleCreateCustomEdition} className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                Edition name
              </label>
              <input
                type="text"
                required
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. DC Compact Comics Edition"
                className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                Format
              </label>
              <select
                value={customFormat}
                onChange={(e) => setCustomFormat(e.target.value as ComicEditionFormat)}
                className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
              >
                <option value="compact">{isDc ? 'DC Compact TPB' : 'Compact TPB'}</option>
                <option value="tpb">Standard TPB</option>
                <option value="hardcover">Hardcover</option>
                <option value="deluxe">Deluxe HC</option>
                <option value="absolute">Absolute</option>
                <option value="omnibus">Omnibus</option>
                <option value="digital">Digital / Issues</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                Collected {item.unit}
              </label>
              <input
                type="number"
                min={1}
                required
                value={customIssues}
                onChange={(e) => setCustomIssues(e.target.value)}
                className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                ISBN-13 (optional cover lookup)
              </label>
              <input
                type="text"
                value={customIsbn}
                onChange={(e) => setCustomIsbn(e.target.value)}
                placeholder="e.g. 9781799502135"
                className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2 rounded-full bg-brand text-brand-ink text-xs font-semibold hover:opacity-95 transition-opacity"
              >
                Save & use edition
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
