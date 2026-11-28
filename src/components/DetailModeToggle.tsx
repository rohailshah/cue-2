import { Layers3, Sparkles } from 'lucide-react';
import type { DetailCardMode } from '../types';

interface DetailModeToggleProps {
  mode: DetailCardMode;
  onChange: (next: DetailCardMode) => void;
}

export function DetailModeToggle({ mode, onChange }: DetailModeToggleProps) {
  const isAdvanced = mode === 'advanced';

  return (
    <div className="flex items-center justify-end mb-4">
      <div
        role="group"
        aria-label="Detail card mode"
        className="inline-flex items-center rounded-full bg-surface border border-white/10 p-0.5"
      >
        <button
          type="button"
          onClick={() => onChange('simple')}
          aria-pressed={!isAdvanced}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            !isAdvanced
              ? 'bg-brand text-brand-ink'
              : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Simple</span>
        </button>
        <button
          type="button"
          onClick={() => onChange('advanced')}
          aria-pressed={isAdvanced}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
            isAdvanced
              ? 'bg-brand text-brand-ink'
              : 'text-ink-dim hover:text-ink'
          }`}
        >
          <Layers3 className="w-3 h-3" />
          <span>Advanced</span>
        </button>
      </div>
    </div>
  );
}
