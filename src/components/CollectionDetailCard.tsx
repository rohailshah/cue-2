import { useState, type ReactNode } from 'react';
import { Archive, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import type { CollectionDetails, MediaDomain, OwnershipStatus } from '../types';
import {
  COLLECTION_CURRENCIES,
  PLAY_COLLECTION_FORMATS,
  PLAY_COLLECTION_PLATFORMS,
  READ_COLLECTION_FORMATS,
  WATCH_COLLECTION_FORMATS,
  computeCollectionValueMetric,
  formatCollectionPrice,
} from '../utils/collection';
import { formatFinishedDate, toDateInputValue } from './FinishedDateCard';

function accentBorderForDomain(domain: MediaDomain) {
  if (domain === 'watch') {
    return {
      text: 'text-watch',
      ownedBtn: 'border-watch text-watch bg-watch/12',
      wishBtn: 'border-dashed border-watch/65 text-watch/85 bg-watch/[0.05]',
      pillActive: 'bg-watch/20 text-watch',
      focus: 'focus:border-watch',
      saveBtn: 'bg-watch text-[#0E1A1E]',
    };
  }
  if (domain === 'play') {
    return {
      text: 'text-play',
      ownedBtn: 'border-play text-play bg-play/12',
      wishBtn: 'border-dashed border-play/65 text-play/85 bg-play/[0.05]',
      pillActive: 'bg-play/20 text-play',
      focus: 'focus:border-play',
      saveBtn: 'bg-play text-[#161124]',
    };
  }
  return {
    text: 'text-read',
    ownedBtn: 'border-read text-read bg-read/12',
    wishBtn: 'border-dashed border-read/65 text-read/85 bg-read/[0.05]',
    pillActive: 'bg-read/20 text-read',
    focus: 'focus:border-read',
    saveBtn: 'bg-read text-[#1E1608]',
  };
}

interface CollectionHeroButtonProps {
  domain: MediaDomain;
  ownership?: OwnershipStatus;
  onCycle: (next: OwnershipStatus | undefined) => void;
}

/** Quiet circular collection toggle beside the Bookmark icon (None -> Owned -> Wishlist -> None). */
export function CollectionHeroButton({
  domain,
  ownership,
  onCycle,
}: CollectionHeroButtonProps) {
  const tokens = accentBorderForDomain(domain);
  const nextCycle: OwnershipStatus | undefined =
    ownership === 'owned' ? 'wishlist' : ownership === 'wishlist' ? undefined : 'owned';
  const ownActive = ownership === 'owned';
  const wishActive = ownership === 'wishlist';

  return (
    <button
      type="button"
      onClick={() => onCycle(nextCycle)}
      aria-label={
        ownActive
          ? 'Owned in collection (tap for wishlist)'
          : wishActive
            ? 'On collection wishlist (tap to clear)'
            : 'Add to collection'
      }
      title={
        ownActive
          ? 'Owned (tap for Wishlist)'
          : wishActive
            ? 'Wishlist (tap to clear)'
            : 'Collect item'
      }
      className={`h-11 w-11 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-95 ${
        ownActive
          ? tokens.ownedBtn
          : wishActive
            ? tokens.wishBtn
            : 'border-white/20 text-ink-faint hover:border-white/40 hover:text-ink-dim'
      }`}
    >
      <Archive className="w-4.5 h-4.5" />
    </button>
  );
}

interface CollectionDetailsFormProps {
  domain: MediaDomain;
  initialOwnership?: OwnershipStatus;
  showOwnershipToggle?: boolean;
  initialDetails?: CollectionDetails;
  fallbackNotes?: string;
  fallbackMinutes?: number;
  fallbackHours?: number;
  onSave: (details: Partial<CollectionDetails>, ownership?: OwnershipStatus) => void;
  onCancel: () => void;
}

/** Reusable flat-matte form for editing format, acquisition date, price, efficiency metrics, and notes. */
export function CollectionDetailsForm({
  domain,
  initialOwnership = 'owned',
  showOwnershipToggle = false,
  initialDetails,
  fallbackNotes,
  fallbackMinutes,
  fallbackHours,
  onSave,
  onCancel,
}: CollectionDetailsFormProps) {
  const tokens = accentBorderForDomain(domain);
  const presetFormats =
    domain === 'watch'
      ? WATCH_COLLECTION_FORMATS
      : domain === 'read'
        ? READ_COLLECTION_FORMATS
        : PLAY_COLLECTION_FORMATS;

  const [ownershipDraft, setOwnershipDraft] = useState<OwnershipStatus>(initialOwnership);
  const [formatDraft, setFormatDraft] = useState(initialDetails?.format || '');
  const [acquiredDraft, setAcquiredDraft] = useState(() =>
    initialDetails?.acquiredAt ? toDateInputValue(initialDetails.acquiredAt) : ''
  );
  const [currencyDraft, setCurrencyDraft] = useState(initialDetails?.currency || '$');
  const [priceDraft, setPriceDraft] = useState(() =>
    typeof initialDetails?.price === 'number' && Number.isFinite(initialDetails.price)
      ? String(initialDetails.price)
      : ''
  );
  const [pagesDraft, setPagesDraft] = useState(() =>
    typeof initialDetails?.pages === 'number' && initialDetails.pages > 0
      ? String(initialDetails.pages)
      : ''
  );
  const [minutesDraft, setMinutesDraft] = useState(() =>
    typeof initialDetails?.runtimeMinutes === 'number' && initialDetails.runtimeMinutes > 0
      ? String(initialDetails.runtimeMinutes)
      : ''
  );
  const [platformDraft, setPlatformDraft] = useState(initialDetails?.platform || '');
  const [notesDraft, setNotesDraft] = useState(initialDetails?.notes || fallbackNotes || '');
  const [ownerDraft, setOwnerDraft] = useState(initialDetails?.owner || '');
  const [includesDraft, setIncludesDraft] = useState(initialDetails?.includes || '');
  const [showExtra, setShowExtra] = useState(
    Boolean(initialDetails?.owner || initialDetails?.includes)
  );

  const parsedPrice = priceDraft.trim() === '' ? undefined : Number(priceDraft);
  const parsedPages = pagesDraft.trim() === '' ? undefined : Number(pagesDraft);
  const parsedMinutes = minutesDraft.trim() === '' ? undefined : Number(minutesDraft);

  const liveEfficiency = computeCollectionValueMetric(
    domain,
    {
      price: typeof parsedPrice === 'number' && Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : undefined,
      currency: currencyDraft,
      pages: parsedPages,
      runtimeMinutes: parsedMinutes,
    },
    { minutes: fallbackMinutes, hoursPlayed: fallbackHours }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(
      {
        format: formatDraft,
        acquiredAt: acquiredDraft || undefined,
        price:
          typeof parsedPrice === 'number' && Number.isFinite(parsedPrice) && parsedPrice >= 0
            ? parsedPrice
            : undefined,
        currency: currencyDraft,
        pages:
          domain === 'read' &&
          typeof parsedPages === 'number' &&
          Number.isFinite(parsedPages) &&
          parsedPages > 0
            ? parsedPages
            : undefined,
        runtimeMinutes:
          domain === 'watch' &&
          typeof parsedMinutes === 'number' &&
          Number.isFinite(parsedMinutes) &&
          parsedMinutes > 0
            ? parsedMinutes
            : undefined,
        platform: domain === 'play' ? platformDraft : undefined,
        owner: ownerDraft,
        includes: includesDraft,
        notes: notesDraft,
      },
      ownershipDraft
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2.5 border-t border-white/[0.06]">
      {showOwnershipToggle && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Status
          </span>
          <div className="inline-flex rounded-full bg-background border border-white/[0.08] p-0.5 text-[11px] font-semibold">
            {(['owned', 'wishlist'] as const).map((statusOpt) => (
              <button
                key={statusOpt}
                type="button"
                onClick={() => setOwnershipDraft(statusOpt)}
                className={`px-3 py-1 rounded-full capitalize transition-colors ${
                  ownershipDraft === statusOpt ? tokens.pillActive : 'text-ink-dim hover:text-ink'
                }`}
              >
                {statusOpt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Format / Storefront Presets + Custom */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-semibold text-ink-dim">
            {domain === 'play' ? 'Storefront / Edition' : 'Format'}
          </label>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {presetFormats.map((fmt) => {
            const active = formatDraft.toLowerCase() === fmt.toLowerCase();
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => setFormatDraft(active ? '' : fmt)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border shrink-0 transition-colors ${
                  active
                    ? `${tokens.pillActive} border-white/15`
                    : 'bg-background border-white/[0.08] text-ink-dim hover:text-ink'
                }`}
              >
                {fmt}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={formatDraft}
          onChange={(e) => setFormatDraft(e.target.value)}
          placeholder={
            domain === 'watch'
              ? 'e.g. Blu-ray, 4K Steelbook, DVD'
              : domain === 'read'
                ? 'e.g. DC Compact, Hardcover, Omnibus'
                : 'e.g. Steam, Epic Games, PS5 Disc'
          }
          className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none ${tokens.focus}`}
        />
      </div>

      {/* Date Acquired & Price + Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-ink-dim mb-1">
            Date acquired
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={acquiredDraft}
              onChange={(e) => setAcquiredDraft(e.target.value)}
              className={`[color-scheme:dark] flex-1 min-w-0 rounded-xl bg-background border border-white/10 px-2.5 py-1.5 text-xs text-ink outline-none ${tokens.focus}`}
            />
            <button
              type="button"
              onClick={() => setAcquiredDraft(new Date().toISOString().slice(0, 10))}
              className="px-2.5 py-1.5 rounded-xl bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-ink shrink-0"
            >
              Today
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="text-[11px] font-semibold text-ink-dim">
              Price (0 = Free)
            </label>
            {liveEfficiency && (
              <span className={`text-[10.5px] font-semibold tabular-nums ${tokens.text}`}>
                {liveEfficiency.short}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={currencyDraft}
              onChange={(e) => setCurrencyDraft(e.target.value)}
              aria-label="Currency"
              className={`rounded-xl bg-background border border-white/10 px-2 py-1.5 text-xs text-ink outline-none ${tokens.focus}`}
            >
              {COLLECTION_CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={priceDraft}
              onChange={(e) => setPriceDraft(e.target.value)}
              placeholder="0.00"
              className={`flex-1 min-w-0 rounded-xl bg-background border border-white/10 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none tabular-nums ${tokens.focus}`}
            />
          </div>
        </div>
      </div>

      {/* Domain Metric + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {domain === 'watch' && (
          <div>
            <label className="block text-[11px] font-semibold text-ink-dim mb-1">
              Disc runtime (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={minutesDraft}
              onChange={(e) => setMinutesDraft(e.target.value)}
              placeholder={fallbackMinutes ? `${fallbackMinutes} min (default)` : 'e.g. 665'}
              className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none tabular-nums ${tokens.focus}`}
            />
          </div>
        )}
        {domain === 'read' && (
          <div>
            <label className="block text-[11px] font-semibold text-ink-dim mb-1">Pages</label>
            <input
              type="number"
              min={1}
              value={pagesDraft}
              onChange={(e) => setPagesDraft(e.target.value)}
              placeholder="e.g. 312"
              className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none tabular-nums ${tokens.focus}`}
            />
          </div>
        )}
        {domain === 'play' && (
          <div>
            <label className="block text-[11px] font-semibold text-ink-dim mb-1">Platform</label>
            <select
              value={platformDraft}
              onChange={(e) => setPlatformDraft(e.target.value)}
              aria-label="Collection platform"
              className={`w-full rounded-xl bg-background border border-white/10 px-2.5 py-1.5 text-xs text-ink outline-none ${tokens.focus}`}
            >
              <option value="">Use progress platform</option>
              {PLAY_COLLECTION_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-ink-dim mb-1">
            Notes / Store / Shelf
          </label>
          <input
            type="text"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="e.g. Deja Vu Discs, Dollarama, Short Box #2…"
            className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none ${tokens.focus}`}
          />
        </div>
      </div>

      {/* Expandable Owner & Includes */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-dim hover:text-ink"
        >
          {showExtra ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>Owner &amp; Includes (gift / box contents)</span>
        </button>

        {showExtra && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">Owner</label>
              <input
                type="text"
                value={ownerDraft}
                onChange={(e) => setOwnerDraft(e.target.value)}
                placeholder="e.g. Self, Mazra"
                className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none ${tokens.focus}`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-ink-dim mb-1">
                Includes / Edition contents
              </label>
              <input
                type="text"
                value={includesDraft}
                onChange={(e) => setIncludesDraft(e.target.value)}
                placeholder="e.g. Seasons 1–2, Eps 1–64 + Movie"
                className={`w-full rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none ${tokens.focus}`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-xl bg-white/8 text-xs font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          <span>Cancel</span>
        </button>
        <button
          type="submit"
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold hover:opacity-95 ${tokens.saveBtn}`}
        >
          Save details
        </button>
      </div>
    </form>
  );
}

interface CollectionDetailCardProps {
  domain: MediaDomain;
  ownership?: OwnershipStatus;
  details?: CollectionDetails;
  fallbackNotes?: string;
  badgeText?: string | null;
  fallbackMinutes?: number;
  fallbackHours?: number;
  extraHeaderAction?: ReactNode;
  onChangeOwnership: (next: OwnershipStatus | undefined) => void;
  onSaveDetails: (details: Partial<CollectionDetails>, ownership?: OwnershipStatus) => void;
}

/** Subtle Advanced-mode Collection card shared cleanly across Watch, Read, and Play detail views. */
export function CollectionDetailCard({
  domain,
  ownership,
  details,
  fallbackNotes,
  badgeText,
  fallbackMinutes,
  fallbackHours,
  extraHeaderAction,
  onChangeOwnership,
  onSaveDetails,
}: CollectionDetailCardProps) {
  const [editing, setEditing] = useState(false);
  const tokens = accentBorderForDomain(domain);

  const effectiveNotes = details?.notes || fallbackNotes;
  const formattedPrice = formatCollectionPrice(details?.price, details?.currency);
  const formattedDate = formatFinishedDate(details?.acquiredAt);
  const efficiency = computeCollectionValueMetric(domain, details, {
    minutes: fallbackMinutes,
    hoursPlayed: fallbackHours,
  });

  const summaryBits = [
    details?.format,
    formattedDate ? `Acquired ${formattedDate}` : null,
    formattedPrice,
    efficiency ? efficiency.short : null,
    details?.pages ? `${details.pages}p` : null,
    details?.platform,
    details?.owner ? `Owner: ${details.owner}` : null,
    details?.includes ? `Includes: ${details.includes}` : null,
    effectiveNotes,
  ].filter(Boolean);

  return (
    <section className="rounded-[22px] bg-surface border border-white/[0.06] p-4 mb-5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Archive className={`w-4 h-4 shrink-0 ${tokens.text}`} />
          <h2 className="text-sm font-semibold text-ink">Collection</h2>
          {badgeText && (
            <span className={`text-[11px] font-medium tabular-nums truncate ${tokens.text}`}>
              · {badgeText}
            </span>
          )}
        </div>

        <div className="inline-flex rounded-full bg-background border border-white/[0.08] p-0.5 text-[11px] font-semibold">
          {(
            [
              { id: 'none', label: 'None', val: undefined },
              { id: 'owned', label: 'Owned', val: 'owned' },
              { id: 'wishlist', label: 'Wishlist', val: 'wishlist' },
            ] as const
          ).map((opt) => {
            const active = opt.val === undefined ? !ownership : ownership === opt.val;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeOwnership(opt.val)}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  active
                    ? opt.val
                      ? tokens.pillActive
                      : 'bg-surface-raised text-ink'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {!editing && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          {summaryBits.length > 0 ? (
            <p className="text-ink-dim tabular-nums leading-relaxed min-w-0 flex-1">
              {summaryBits.join(' · ')}
            </p>
          ) : (
            <span className="text-ink-faint">
              {ownership
                ? 'Optional: format, purchase date, price & notes'
                : 'Mark Owned or Wishlist to log physical/digital copy'}
            </span>
          )}
          <div className="flex items-center gap-3 shrink-0">
            {extraHeaderAction}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 font-semibold text-ink-dim hover:text-ink"
            >
              <Pencil className="w-3 h-3" />
              <span>{summaryBits.length > 0 ? 'Edit details' : 'Add details'}</span>
            </button>
          </div>
        </div>
      )}

      {editing && (
        <CollectionDetailsForm
          domain={domain}
          initialOwnership={ownership || 'owned'}
          initialDetails={details}
          fallbackNotes={fallbackNotes}
          fallbackMinutes={fallbackMinutes}
          fallbackHours={fallbackHours}
          onSave={(nextDetails, nextOwn) => {
            onSaveDetails(nextDetails, ownership || nextOwn);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </section>
  );
}
