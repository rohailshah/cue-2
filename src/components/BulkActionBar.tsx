import { useState } from 'react';
import { Check, ListPlus, Play, RotateCcw, Trash2, X } from 'lucide-react';
import type { CustomList } from '../types';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  lists: CustomList[];
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
  onAction: (action: 'finish' | 'active' | 'queue' | 'remove' | 'add_to_list', listId?: string) => void;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  lists,
  onSelectAll,
  onClear,
  onCancel,
  onAction,
}: BulkActionBarProps) {
  const [listMenuOpen, setListMenuOpen] = useState(false);

  return (
    <div className="fixed bottom-20 md:bottom-6 inset-x-3 max-w-2xl mx-auto z-40">
      {listMenuOpen && lists.length > 0 && (
        <div className="mb-2 rounded-2xl bg-surface-raised border border-white/15 p-2 shadow-2xl max-h-48 overflow-y-auto space-y-1">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={selectedCount === 0}
              onClick={() => {
                onAction('add_to_list', l.id);
                setListMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-ink hover:bg-white/[0.06] flex items-center justify-between gap-2 disabled:opacity-40"
            >
              <span className="truncate">{l.name}</span>
              <span className="text-[11px] text-ink-dim shrink-0">
                {(l.steps?.length || l.items.length)} items
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-surface-raised border border-white/15 px-3 py-2.5 shadow-2xl space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink tabular-nums">
              {selectedCount} selected
            </span>
            {selectedCount < totalCount ? (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-[11px] font-semibold text-brand hover:underline"
              >
                Select all ({totalCount})
              </button>
            ) : (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-semibold text-ink-dim hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Exit bulk select"
            className="h-7 px-2.5 rounded-full bg-white/8 text-[11px] font-semibold text-ink-dim hover:text-ink inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onAction('finish')}
            className="px-3 py-1.5 rounded-xl bg-watched/15 border border-watched/35 text-xs font-semibold text-watched inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Finish</span>
          </button>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onAction('active')}
            className="px-3 py-1.5 rounded-xl bg-surface border border-white/12 text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Active</span>
          </button>
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onAction('queue')}
            className="px-3 py-1.5 rounded-xl bg-surface border border-white/12 text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Backlog</span>
          </button>
          {lists.length > 0 && (
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setListMenuOpen((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-surface border border-white/12 text-xs font-semibold text-ink inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
            >
              <ListPlus className="w-3.5 h-3.5 text-brand" />
              <span>List</span>
            </button>
          )}
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => onAction('remove')}
            className="px-3 py-1.5 rounded-xl bg-red-500/12 border border-red-400/25 text-xs font-semibold text-red-300 inline-flex items-center gap-1 shrink-0 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      </div>
    </div>
  );
}
