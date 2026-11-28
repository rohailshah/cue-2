import { useState } from 'react';
import { CalendarCheck2, Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { CompletionRun } from '../types';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Formats an ISO or YYYY-MM-DD date string cleanly without local timezone day drift. */
export function formatFinishedDate(iso?: string): string | null {
  if (!iso) return null;
  const trimmed = iso.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const year = Number(ymd[1]);
    const monthIdx = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    if (monthIdx >= 0 && monthIdx < 12 && day >= 1 && day <= 31) {
      return `${MONTH_NAMES[monthIdx]} ${day}, ${year}`;
    }
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Extracts a safe YYYY-MM-DD value for native <input type="date"> controls. */
export function toDateInputValue(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const ymd = iso.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

interface FinishedDateRowProps {
  isFinished: boolean;
  finishedAt?: string;
  fallbackDate?: string;
  verbLabel?: 'Finished' | 'Watched' | 'Completed';
  onChangeDate: (ymd: string) => void;
  onMarkFinished?: () => void;
  completedRuns?: CompletionRun[];
  runVerb?: 'rewatch' | 'reread' | 'replay';
  onAddRun?: (ymd: string, note?: string) => void;
  onUpdateRunDate?: (runId: string, ymd: string) => void;
  onDeleteRun?: (runId: string) => void;
}

/** Clean inline completion date & multi-run history editor for Advanced detail cards. */
export function FinishedDateRow({
  isFinished,
  finishedAt,
  fallbackDate,
  verbLabel = 'Finished',
  onChangeDate,
  onMarkFinished,
  completedRuns,
  runVerb = 'rewatch',
  onAddRun,
  onUpdateRunDate,
  onDeleteRun,
}: FinishedDateRowProps) {
  const effectiveDate = finishedAt || (isFinished ? fallbackDate : undefined);
  const formatted = formatFinishedDate(effectiveDate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDateInputValue(effectiveDate));
  const [addingRun, setAddingRun] = useState(false);
  const [runDraftDate, setRunDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [runDraftNote, setRunDraftNote] = useState('');
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editingRunDate, setEditingRunDate] = useState('');

  const openEditor = () => {
    setDraft(toDateInputValue(effectiveDate));
    setEditing(true);
  };

  if (!isFinished) {
    return (
      <div className="rounded-2xl bg-background/45 border border-white/[0.06] px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <CalendarCheck2 className="w-3.5 h-3.5 shrink-0" />
          <span>Not {verbLabel.toLowerCase()} yet</span>
        </div>
        {onMarkFinished && (
          <button
            type="button"
            onClick={onMarkFinished}
            className="text-xs font-semibold text-watched hover:opacity-85 transition-opacity inline-flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>Mark {verbLabel.toLowerCase()}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-background/55 border border-white/[0.07] px-3.5 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarCheck2 className="w-4 h-4 text-watched shrink-0" />
          <p className="text-xs font-medium text-ink truncate">
            {formatted ? (
              <>
                <span className="text-ink-dim">{verbLabel} </span>
                <span className="font-semibold text-ink tabular-nums">{formatted}</span>
              </>
            ) : (
              <span className="text-ink-dim">{verbLabel} · Date not set</span>
            )}
          </p>
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            {onAddRun && (
              <button
                type="button"
                onClick={() => {
                  setRunDraftDate(new Date().toISOString().slice(0, 10));
                  setRunDraftNote('');
                  setAddingRun((v) => !v);
                }}
                aria-label={`Log ${runVerb}`}
                className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1 transition-colors shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>Log {runVerb}</span>
              </button>
            )}
            <button
              type="button"
              onClick={openEditor}
              aria-label={`Edit ${verbLabel.toLowerCase()} date`}
              className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1 transition-colors shrink-0"
            >
              <Pencil className="w-3 h-3" />
              <span>Edit date</span>
            </button>
          </div>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft) onChangeDate(draft);
            setEditing(false);
          }}
          className="flex items-center gap-2 flex-wrap pt-1 border-t border-white/[0.06]"
        >
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`${verbLabel} date`}
            className="[color-scheme:dark] flex-1 min-w-[140px] rounded-xl bg-surface border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => setDraft(new Date().toISOString().slice(0, 10))}
            className="px-2.5 py-1.5 rounded-xl bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-ink"
          >
            Today
          </button>
          <button
            type="submit"
            disabled={!draft}
            className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Cancel editing date"
            className="h-7 w-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {addingRun && onAddRun && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!runDraftDate) return;
            onAddRun(runDraftDate, runDraftNote.trim() || undefined);
            setAddingRun(false);
            setRunDraftNote('');
          }}
          className="space-y-2 pt-2 border-t border-white/[0.06]"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={runDraftDate}
              onChange={(e) => setRunDraftDate(e.target.value)}
              aria-label={`New ${runVerb} date`}
              className="[color-scheme:dark] flex-1 min-w-[135px] rounded-xl bg-surface border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
            />
            <input
              type="text"
              value={runDraftNote}
              onChange={(e) => setRunDraftNote(e.target.value)}
              placeholder={`Note (optional, e.g. ${runVerb})`}
              className="flex-1 min-w-[140px] rounded-xl bg-surface border border-white/12 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={!runDraftDate}
              className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40"
            >
              Add run
            </button>
            <button
              type="button"
              onClick={() => setAddingRun(false)}
              aria-label="Cancel new run"
              className="h-7 w-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}

      {completedRuns && completedRuns.length > 0 && (
        <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-faint">
            <RotateCcw className="w-3 h-3" />
            <span>Completion Runs ({completedRuns.length})</span>
          </div>
          <div className="space-y-1">
            {completedRuns.map((run, idx) => {
              const isEd = editingRunId === run.id;
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded-lg bg-surface/60"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-semibold text-ink-dim shrink-0">
                      Run #{idx + 1}
                    </span>
                    {isEd && onUpdateRunDate ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (editingRunDate) onUpdateRunDate(run.id, editingRunDate);
                          setEditingRunId(null);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="date"
                          value={editingRunDate}
                          onChange={(e) => setEditingRunDate(e.target.value)}
                          className="[color-scheme:dark] rounded-lg bg-background border border-white/15 px-2 py-0.5 text-[11px] text-ink outline-none"
                        />
                        <button
                          type="submit"
                          className="px-2 py-0.5 rounded bg-brand text-brand-ink text-[11px] font-semibold"
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <span className="text-ink tabular-nums truncate">
                        {formatFinishedDate(run.finishedAt) || run.finishedAt}
                        {run.note ? ` · ${run.note}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onUpdateRunDate && !isEd && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRunId(run.id);
                          setEditingRunDate(toDateInputValue(run.finishedAt));
                        }}
                        aria-label={`Edit Run #${idx + 1} date`}
                        className="p-1 text-ink-faint hover:text-ink"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {onDeleteRun && completedRuns.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteRun(run.id)}
                        aria-label={`Remove Run #${idx + 1}`}
                        className="p-1 text-ink-faint hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface CompactFinishedDateRowProps {
  finishedAt?: string;
  label?: string;
  emptyLabel?: string;
  onChangeDate: (ymd: string | undefined) => void;
  variant?: 'drawer' | 'inline';
}

/** Compact single-atom, season, or collection finished-date editor with Set / Edit / Clear. */
export function CompactFinishedDateRow({
  finishedAt,
  label = 'Finished',
  emptyLabel = 'No finished date',
  onChangeDate,
  variant = 'drawer',
}: CompactFinishedDateRowProps) {
  const formatted = formatFinishedDate(finishedAt);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDateInputValue(finishedAt));

  const shellClass =
    variant === 'drawer'
      ? 'rounded-2xl bg-surface border border-white/8 p-3 space-y-2.5'
      : 'rounded-xl bg-background/50 border border-white/[0.06] px-3 py-2 space-y-2';

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarCheck2
            className={`w-3.5 h-3.5 shrink-0 ${formatted ? 'text-watched' : 'text-ink-faint'}`}
          />
          <p className="text-xs font-medium text-ink truncate">
            {formatted ? (
              <>
                <span className="text-ink-dim">{label}: </span>
                <span className="font-semibold text-ink tabular-nums">{formatted}</span>
              </>
            ) : (
              <span className="text-ink-dim">
                {label} · <span className="text-ink-faint">{emptyLabel}</span>
              </span>
            )}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(toDateInputValue(finishedAt));
              setEditing(true);
            }}
            aria-label={formatted ? `Edit ${label.toLowerCase()} date` : `Set ${label.toLowerCase()} date`}
            className="px-2.5 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1 transition-colors shrink-0"
          >
            <Pencil className="w-3 h-3" />
            <span>{formatted ? 'Edit date' : 'Add date'}</span>
          </button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft) onChangeDate(draft);
            setEditing(false);
          }}
          className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-white/[0.06]"
        >
          <input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`${label} date`}
            className="[color-scheme:dark] flex-1 min-w-[135px] rounded-xl bg-background border border-white/12 px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => setDraft(new Date().toISOString().slice(0, 10))}
            className="px-2.5 py-1.5 rounded-xl bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-ink"
          >
            Today
          </button>
          <button
            type="submit"
            disabled={!draft}
            className="px-3 py-1.5 rounded-xl bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40"
          >
            Save
          </button>
          {formatted && (
            <button
              type="button"
              onClick={() => {
                onChangeDate(undefined);
                setEditing(false);
              }}
              aria-label={`Clear ${label.toLowerCase()} date`}
              className="px-2.5 py-1.5 rounded-xl bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-red-400"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label={`Cancel editing ${label.toLowerCase()} date`}
            className="h-7 w-7 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}
