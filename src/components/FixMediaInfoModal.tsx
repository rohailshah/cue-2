import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { MediaImage } from './MediaImage';
import { useModalBackHandler } from '../store/useCueStore';
import { extractCountFromPastedText } from '../utils/fixInfoParser';

export interface FixMediaRefreshResult {
  total?: number;
  status?: 'ongoing' | 'completed' | 'hiatus';
  sourceLabel?: string;
  message?: string;
  coverUrl?: string;
  title?: string;
  creator?: string;
  year?: number;
  overview?: string;
}

export interface FixMediaSavePatch {
  totalUnits?: number;
  title?: string;
  creator?: string;
  year?: number;
  coverUrl?: string;
  overview?: string;
}

export function FixMediaInfoModal({
  open,
  onClose,
  kind,
  title,
  creator,
  year,
  coverUrl,
  overview,
  unitLabel,
  currentTotal,
  totalSource,
  publicationStatus,
  refreshLabel,
  autoExpandDetails = false,
  onRefreshLive,
  onOpenChapterFinder,
  chapterFinderLabel,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  kind: 'read' | 'show' | 'game' | 'movie';
  title: string;
  creator?: string;
  year?: number;
  coverUrl?: string;
  overview?: string;
  unitLabel: 'chapters' | 'issues' | 'episodes' | 'missions' | 'acts' | 'milestones';
  currentTotal: number;
  totalSource?: 'api' | 'estimated' | 'manual';
  publicationStatus?: 'ongoing' | 'completed' | 'hiatus';
  refreshLabel?: string;
  autoExpandDetails?: boolean;
  onRefreshLive?: () => Promise<FixMediaRefreshResult | null>;
  onOpenChapterFinder?: () => void;
  chapterFinderLabel?: string;
  onSave: (patch: FixMediaSavePatch) => void;
}) {
  const [countDraft, setCountDraft] = useState(String(currentTotal));
  const [pasteDraft, setPasteDraft] = useState('');
  const [pasteStatus, setPasteStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(autoExpandDetails);
  const [titleDraft, setTitleDraft] = useState(title);
  const [creatorDraft, setCreatorDraft] = useState(creator || '');
  const [yearDraft, setYearDraft] = useState(year ? String(year) : '');
  const [coverDraft, setCoverDraft] = useState(coverUrl || '');
  const [overviewDraft, setOverviewDraft] = useState(overview || '');

  useModalBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    setCountDraft(currentTotal > 0 ? String(currentTotal) : '');
    setPasteDraft('');
    setPasteStatus(null);
    setRefreshing(false);
    setRefreshFeedback(null);
    setDetailsOpen(Boolean(autoExpandDetails));
    setTitleDraft(title);
    setCreatorDraft(creator || '');
    setYearDraft(year ? String(year) : '');
    setCoverDraft(coverUrl || '');
    setOverviewDraft(overview || '');
  }, [open, currentTotal, title, creator, year, coverUrl, overview, autoExpandDetails]);

  if (!open) return null;

  const hasCountControls = kind !== 'movie';
  const parserUnitKind: 'chapters' | 'issues' | 'episodes' =
    unitLabel === 'issues' ? 'issues' : unitLabel === 'episodes' ? 'episodes' : 'chapters';
  const creatorLabel =
    kind === 'game' ? 'Developer / Studio' : kind === 'movie' ? 'Director' : 'Author / Publisher';

  const bumpCount = (delta: number) => {
    const cur = Math.max(0, Math.round(Number(countDraft) || currentTotal || 0));
    setCountDraft(String(Math.min(10000, Math.max(1, cur + delta))));
  };

  const handleRefresh = async () => {
    if (!onRefreshLive || refreshing) return;
    setRefreshing(true);
    setRefreshFeedback(null);
    try {
      const res = await onRefreshLive();
      if (res) {
        if (res.total && res.total > 0) setCountDraft(String(res.total));
        if (res.coverUrl) setCoverDraft(res.coverUrl);
        if (res.title) setTitleDraft(res.title);
        if (res.creator) setCreatorDraft(res.creator);
        if (res.year) setYearDraft(String(res.year));
        if (res.overview) setOverviewDraft(res.overview);

        if (res.message) {
          setRefreshFeedback(res.message);
        } else if (res.total && res.total > 0) {
          const statusBit = res.status ? ` · ${res.status}` : '';
          const srcBit = res.sourceLabel ? ` (${res.sourceLabel})` : '';
          setRefreshFeedback(
            `Updated to ${res.total.toLocaleString()} ${unitLabel}${statusBit}${srcBit}`
          );
        } else if (res.coverUrl || res.overview || res.creator) {
          const srcBit = res.sourceLabel ? ` via ${res.sourceLabel}` : '';
          setRefreshFeedback(`Matched details & cover art${srcBit}.`);
        } else {
          setRefreshFeedback('No newer match returned — edit manually below.');
        }
      } else {
        setRefreshFeedback('No live match found right now — edit details or paste below.');
      }
    } catch {
      setRefreshFeedback('Could not reach live sources right now. Edit manually below.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleExtractPaste = () => {
    const extracted = extractCountFromPastedText(pasteDraft, parserUnitKind);
    if (extracted !== null) {
      setCountDraft(String(extracted));
      setPasteStatus(`Found ${extracted.toLocaleString()} ${unitLabel}`);
    } else {
      setPasteStatus(`Couldn't find a ${unitLabel} count in that snippet.`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedCount = Math.round(Number(countDraft));
    const parsedYear = Number(yearDraft);
    const patch: FixMediaSavePatch = {};
    if (
      hasCountControls &&
      Number.isFinite(parsedCount) &&
      parsedCount >= 1 &&
      parsedCount !== currentTotal
    ) {
      patch.totalUnits = Math.min(10000, parsedCount);
    }
    if (titleDraft.trim() && titleDraft.trim() !== title) {
      patch.title = titleDraft.trim();
    }
    if (creatorDraft.trim() !== (creator || '').trim() && creatorDraft.trim()) {
      patch.creator = creatorDraft.trim();
    }
    if (
      yearDraft.trim() &&
      Number.isFinite(parsedYear) &&
      parsedYear >= 1900 &&
      parsedYear !== year
    ) {
      patch.year = parsedYear;
    }
    if (coverDraft.trim() !== (coverUrl || '').trim()) {
      patch.coverUrl = coverDraft.trim();
    }
    if (overviewDraft.trim() !== (overview || '').trim()) {
      patch.overview = overviewDraft.trim();
    }
    onSave(patch);
    onClose();
  };

  const statusTag =
    totalSource === 'manual'
      ? 'Locked by your fix'
      : totalSource === 'estimated'
        ? 'Fallback estimate — verify or sync'
        : publicationStatus === 'ongoing'
          ? 'Ongoing series'
          : !coverUrl
            ? 'Missing cover art — auto-match or add manually'
            : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[90dvh] overflow-y-auto bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 space-y-4 shadow-2xl animate-sheet-up"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-brand shrink-0" />
              <h3 className="font-display font-bold text-lg text-ink">
                Fix info {hasCountControls ? '& count' : '& art'}
              </h3>
            </div>
            <p className="text-xs text-ink-dim truncate mt-0.5">{title}</p>
            {statusTag && <p className="text-[11px] text-ink-faint mt-0.5">{statusTag}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {(onRefreshLive || onOpenChapterFinder) && (
          <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2.5">
            {onRefreshLive && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-medium text-ink">Pull latest metadata &amp; cover</p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/35 text-xs font-semibold text-brand hover:bg-brand/25 transition-colors disabled:opacity-50"
                >
                  {refreshing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>{refreshLabel || 'Check live info'}</span>
                </button>
              </div>
            )}
            {onOpenChapterFinder && (
              <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-white/[0.06]">
                <p className="text-xs text-ink-dim">Pull story mission / chapter names</p>
                <button
                  type="button"
                  onClick={onOpenChapterFinder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-play/15 border border-play/35 text-xs font-semibold text-play hover:bg-play/25 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{chapterFinderLabel || 'Find chapters & missions'}</span>
                </button>
              </div>
            )}
            {refreshFeedback && (
              <p className="text-[11.5px] text-ink-dim leading-snug">{refreshFeedback}</p>
            )}
          </div>
        )}

        {hasCountControls && (
          <>
            <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="fix-total-units"
                  className="text-xs font-semibold uppercase tracking-wider text-ink-dim"
                >
                  Total {unitLabel}
                </label>
                <span className="text-[11px] text-ink-faint">Saved overrides stay locked</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="fix-total-units"
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="Optional"
                  value={countDraft}
                  onChange={(e) => setCountDraft(e.target.value)}
                  className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-sm font-semibold text-ink tabular-nums outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => bumpCount(1)}
                  className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-semibold text-ink shrink-0 tabular-nums"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => bumpCount(10)}
                  className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-xs font-semibold text-ink shrink-0 tabular-nums"
                >
                  +10
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-surface border border-white/[0.08] p-3.5 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand shrink-0" />
                <label htmlFor="fix-paste-snippet" className="text-xs font-semibold text-ink">
                  Quick paste from Google / Wiki
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="fix-paste-snippet"
                  type="text"
                  value={pasteDraft}
                  onChange={(e) => {
                    setPasteDraft(e.target.value);
                    if (pasteStatus) setPasteStatus(null);
                  }}
                  placeholder={`e.g. "24 story ${unitLabel}..."`}
                  className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={handleExtractPaste}
                  disabled={!pasteDraft.trim()}
                  className="px-3 py-2 rounded-xl bg-surface-raised border border-white/12 text-xs font-semibold text-ink hover:border-brand disabled:opacity-40 shrink-0"
                >
                  Extract
                </button>
              </div>
              {pasteStatus && <p className="text-[11px] text-ink-dim">{pasteStatus}</p>}
            </div>
          </>
        )}

        <div className="rounded-2xl bg-surface border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-ink-dim hover:text-ink"
          >
            <span>Edit title, cover &amp; details</span>
            {detailsOpen ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>

          {detailsOpen && (
            <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-white/[0.06]">
              <div>
                <label className="block text-[11px] text-ink-dim mb-1">Title</label>
                <input
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {kind !== 'show' && (
                  <div>
                    <label className="block text-[11px] text-ink-dim mb-1">{creatorLabel}</label>
                    <input
                      type="text"
                      value={creatorDraft}
                      onChange={(e) => setCreatorDraft(e.target.value)}
                      className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                    />
                  </div>
                )}
                <div className={kind !== 'show' ? '' : 'col-span-2'}>
                  <label className="block text-[11px] text-ink-dim mb-1">Year</label>
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={yearDraft}
                    onChange={(e) => setYearDraft(e.target.value)}
                    className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink tabular-nums outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-ink-dim mb-1">Cover image URL</label>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-[52px] rounded-lg overflow-hidden bg-background border border-white/10 shrink-0">
                    <MediaImage
                      src={coverDraft}
                      alt={titleDraft || title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <input
                    type="url"
                    value={coverDraft}
                    onChange={(e) => setCoverDraft(e.target.value)}
                    placeholder="Paste Steam / IGDB / image URL (https://...)"
                    className="flex-1 min-w-0 rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-ink-dim mb-1">Summary / Overview</label>
                <textarea
                  rows={2}
                  value={overviewDraft}
                  onChange={(e) => setOverviewDraft(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full rounded-xl bg-background border border-white/12 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand resize-none"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold hover:opacity-95 transition-opacity"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
