import { useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { ImportBatchRecord } from '../utils/importHistory';

interface RecentImportsListProps {
  records: ImportBatchRecord[];
  onUndo: (importId: string) => void;
  onDismiss?: (importId: string) => void;
  maxItems?: number;
}

function formatImportTimestamp(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function RecentImportsList({
  records,
  onUndo,
  onDismiss,
  maxItems = 5,
}: RecentImportsListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const visible = records.slice(0, maxItems);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-watch" />
          <span>Recent Imports (Undoable)</span>
        </p>
        <span className="text-[10.5px] text-ink-faint tabular-nums">
          Saved across reloads
        </span>
      </div>

      <div className="space-y-1.5">
        {visible.map((rec) => {
          const isConfirming = confirmId === rec.id;
          const summaryBits: string[] = [];
          if (rec.kind === 'backup-restore') {
            summaryBits.push('Full backup snapshot');
          } else {
            if (rec.addedCount > 0) summaryBits.push(`+${rec.addedCount} added`);
            if (rec.updatedCount > 0) summaryBits.push(`${rec.updatedCount} updated`);
          }
          const timeLabel = formatImportTimestamp(rec.importedAt);

          return (
            <div
              key={rec.id}
              className="rounded-xl bg-background border border-white/8 px-3 py-2 flex items-center justify-between gap-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink truncate">
                  {rec.fileName || rec.sourceLabel}
                </p>
                <p className="text-[11px] text-ink-dim truncate tabular-nums">
                  {rec.fileName ? `${rec.sourceLabel} · ` : ''}
                  {summaryBits.join(' · ')}
                  {timeLabel ? ` · ${timeLabel}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (isConfirming) {
                      onUndo(rec.id);
                      setConfirmId(null);
                    } else {
                      setConfirmId(rec.id);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    isConfirming
                      ? 'bg-red-500/20 border-red-400 text-red-200'
                      : 'bg-surface border-white/12 text-ink hover:border-watch/50'
                  }`}
                >
                  <RotateCcw className="w-3 h-3 shrink-0" />
                  <span>{isConfirming ? 'Confirm?' : 'Undo'}</span>
                </button>
                {onDismiss && (
                  <button
                    type="button"
                    aria-label={`Dismiss ${rec.fileName || rec.sourceLabel} from history`}
                    onClick={() => {
                      if (confirmId === rec.id) setConfirmId(null);
                      onDismiss(rec.id);
                    }}
                    className="h-6 w-6 rounded-full flex items-center justify-center text-ink-faint hover:text-ink hover:bg-white/8"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
