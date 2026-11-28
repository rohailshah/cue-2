import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  Copy,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { fetchGameChapterSuggestions } from '../services/mediaApi';
import { useModalBackHandler } from '../store/useCueStore';
import type { GameChapterSource, GameChapterUnit } from '../types';
import { parsePastedChapterList } from '../utils/gameChapters';

interface GameChapterSuggestSheetProps {
  open: boolean;
  gameTitle: string;
  initialUnit: GameChapterUnit;
  onClose: () => void;
  onConfirm: (
    chapters: string[],
    unit: GameChapterUnit,
    source: GameChapterSource,
    note?: string
  ) => void;
}

const UNITS: GameChapterUnit[] = ['chapters', 'missions', 'acts', 'milestones'];

function buildGoogleAiModeUrl(gameTitle: string): string {
  const prompt = `List all main story chapters or missions in order for "${gameTitle}" as a clean numbered list of titles only.`;
  return `https://www.google.com/search?udm=50&q=${encodeURIComponent(prompt)}`;
}

export function GameChapterSuggestSheet({
  open,
  gameTitle,
  initialUnit,
  onClose,
  onConfirm,
}: GameChapterSuggestSheetProps) {
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState<GameChapterUnit>(initialUnit);
  const [sourceTag, setSourceTag] = useState<string>('');
  const [resolvedSource, setResolvedSource] = useState<GameChapterSource>('web');
  const [draftItems, setDraftItems] = useState<string[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [copied, setCopied] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useModalBackHandler(open, () => onCloseRef.current());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSourceTag('');
    setDraftItems([]);
    setPasteOpen(false);
    setPasteText('');
    setUnit(initialUnit);

    fetchGameChapterSuggestions(gameTitle)
      .then((res) => {
        if (cancelled) return;
        if (res.found && res.chapters.length > 0) {
          setDraftItems(res.chapters);
          setUnit(res.unit);
          setResolvedSource(
            res.source === 'catalog'
              ? 'catalog'
              : res.source === 'wikipedia'
                ? 'wikipedia'
                : 'web'
          );
          setSourceTag(res.sourceLabel || 'Web guide');
        } else {
          setPasteOpen(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, gameTitle, initialUnit]);

  if (!open) return null;

  const cleanPrompt = `List all main story chapters or missions in chronological order for "${gameTitle}" as a clean numbered list of titles only.`;
  const aiUrl = buildGoogleAiModeUrl(gameTitle);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(cleanPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleParsePaste = () => {
    const parsed = parsePastedChapterList(pasteText);
    if (parsed.chapters.length === 0) return;
    setDraftItems(parsed.chapters);
    setUnit(parsed.detectedUnit);
    setResolvedSource('manual');
    setSourceTag('Pasted list');
    setPasteOpen(false);
  };

  const cleanDrafts = draftItems.map((d) => d.trim()).filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suggest story chapters and missions"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col bg-surface border border-white/10 rounded-t-[26px] sm:rounded-[24px] shadow-2xl animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-play flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Suggest Story List</span>
            </p>
            <h2 className="font-display font-bold text-base sm:text-lg text-ink truncate mt-0.5">
              {gameTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close suggest dialog"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Live auto-suggest banner */}
          {loading ? (
            <div className="rounded-2xl bg-background/70 border border-white/[0.06] p-3.5 flex items-center gap-2.5 text-xs text-ink-dim">
              <Loader2 className="w-4 h-4 text-play animate-spin shrink-0" />
              <span>Searching game wikis &amp; walkthroughs for main missions/chapters…</span>
            </div>
          ) : draftItems.length > 0 && sourceTag ? (
            <div className="rounded-2xl bg-play/10 border border-play/25 px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-medium text-ink">
                Loaded {cleanDrafts.length} {unit} ·{' '}
                <span className="text-play font-semibold">{sourceTag}</span>
              </span>
              <button
                type="button"
                onClick={() => setPasteOpen((v) => !v)}
                className="text-[11px] font-semibold text-ink-dim hover:text-ink"
              >
                {pasteOpen ? 'Hide Google AI / paste' : 'Use Google AI instead'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-background/70 border border-white/[0.06] px-3.5 py-2.5 text-xs text-ink-dim">
              No automatic list matched this title. Search with Google AI Mode below and paste the
              result, or add items manually.
            </div>
          )}

          {/* Google AI Mode + Paste Helper */}
          {(pasteOpen || (!loading && draftItems.length === 0)) && (
            <div className="rounded-2xl bg-background/65 border border-white/[0.08] p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-semibold text-ink">Google AI Mode Helper</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="px-2.5 py-1.5 rounded-full bg-surface border border-white/10 text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-watched" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy prompt'}</span>
                  </button>
                  <a
                    href={aiUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-full bg-play text-[#161124] text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-95"
                  >
                    <span>Google AI Mode</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Paste the numbered/bulleted chapter or mission list for ${gameTitle} here…`}
                className="w-full rounded-xl bg-surface border border-white/10 p-3 text-xs text-ink outline-none focus:border-play resize-y"
              />
              <button
                type="button"
                onClick={handleParsePaste}
                disabled={!pasteText.trim()}
                className="w-full py-2 rounded-full bg-surface-raised border border-white/12 text-xs font-semibold text-ink hover:bg-white/10 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-play" />
                <span>Parse into editable list</span>
              </button>
            </div>
          )}

          {/* Unit selector */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-dim">Track as</span>
            <div className="inline-flex items-center gap-1 bg-background border border-white/10 rounded-full p-0.5">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${
                    unit === u ? 'bg-play text-[#161124]' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Editable checklist review */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink inline-flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-play" />
                <span>Review &amp; edit ({draftItems.length})</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraftItems((prev) => [
                    ...prev,
                    `${
                      unit === 'missions'
                        ? 'Mission'
                        : unit === 'acts'
                          ? 'Act'
                          : unit === 'milestones'
                            ? 'Milestone'
                            : 'Chapter'
                    } ${prev.length + 1}`,
                  ])
                }
                className="text-xs font-semibold text-play hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add item</span>
              </button>
            </div>

            {draftItems.length > 0 && (
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {draftItems.map((title, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-6 text-[11px] font-semibold text-ink-faint tabular-nums text-right shrink-0">
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftItems((prev) => prev.map((it, i) => (i === idx ? val : it)));
                      }}
                      className="flex-1 min-w-0 rounded-xl bg-background border border-white/10 px-3 py-1.5 text-xs text-ink outline-none focus:border-play"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label={`Remove item ${idx + 1}`}
                      className="h-7 w-7 rounded-full bg-white/[0.05] hover:bg-red-500/15 text-ink-faint hover:text-red-300 flex items-center justify-center shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-white/[0.06] flex items-center justify-between gap-2.5 bg-surface">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-ink-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={cleanDrafts.length === 0}
            onClick={() => {
              if (cleanDrafts.length === 0) return;
              onConfirm(
                cleanDrafts,
                unit,
                resolvedSource,
                sourceTag ? `${cleanDrafts.length} ${unit} (${sourceTag})` : `${cleanDrafts.length} ${unit}`
              );
              onClose();
            }}
            className="px-5 py-2 rounded-full bg-play text-[#161124] text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1.5 hover:opacity-95"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>
              Confirm &amp; Use ({cleanDrafts.length} {unit})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
