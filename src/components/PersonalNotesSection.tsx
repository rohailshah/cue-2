import { useState } from 'react';
import { BookMarked, Lock, Plus, Trash2 } from 'lucide-react';
import { useCueStore } from '../store/useCueStore';
import type { MediaDomain, PersonalMood } from '../types';
import { formatRelativeTime } from '../utils/stats';

export const MOOD_OPTIONS: { key: PersonalMood; emoji: string; label: string }[] = [
  { key: 'loved', emoji: '😍', label: 'Loved' },
  { key: 'mindblown', emoji: '🤯', label: 'Mindblown' },
  { key: 'emotional', emoji: '😭', label: 'Emotional' },
  { key: 'funny', emoji: '😂', label: 'Funny' },
  { key: 'intense', emoji: '🔥', label: 'Intense' },
  { key: 'cozy', emoji: '☕', label: 'Cozy' },
];

interface PersonalNotesSectionProps {
  domain: MediaDomain;
  mediaKind: 'show' | 'movie' | 'novel' | 'manga' | 'comic' | 'game';
  mediaId: string;
  mediaTitle: string;
  mediaPoster: string;
  defaultContext?: string;
  currentRating?: number;
  currentMood?: PersonalMood;
  onSelectMood: (mood: PersonalMood | undefined) => void;
}

export function PersonalNotesSection({
  domain,
  mediaKind,
  mediaId,
  mediaTitle,
  mediaPoster,
  defaultContext,
  currentRating,
  currentMood,
  onSelectMood,
}: PersonalNotesSectionProps) {
  const { state, addJournalEntry, deleteJournalEntry } = useCueStore();
  const [noteText, setNoteText] = useState('');
  const [contextInput, setContextInput] = useState(defaultContext || '');

  const entries = state.journalEntries.filter(
    (e) => e.mediaId === mediaId && e.domain === domain
  );

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    addJournalEntry({
      domain,
      mediaKind,
      mediaId,
      mediaTitle,
      mediaPoster,
      contextLabel: contextInput.trim() || undefined,
      text: noteText.trim(),
      rating: currentRating,
      mood: currentMood,
    });
    setNoteText('');
  };

  return (
    <div className="space-y-5 pt-5 border-t border-white/[0.08]">
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="font-semibold text-[15px] text-ink">Your mood</h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
            <Lock className="w-3 h-3" />
            Private
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {MOOD_OPTIONS.map((m) => {
            const active = currentMood === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onSelectMood(active ? undefined : m.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  active
                    ? 'border-brand bg-brand/15 text-ink font-semibold'
                    : 'border-white/8 bg-surface text-ink-dim hover:text-ink'
                }`}
              >
                <span className="text-base leading-none">{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-brand" />
            <h3 className="font-semibold text-[15px] text-ink">
              Personal notes ({entries.length})
            </h3>
          </div>
        </div>

        <form onSubmit={handleSaveNote} className="rounded-2xl bg-surface border border-white/8 p-3.5 space-y-2.5 mb-4">
          <textarea
            rows={2}
            placeholder={`Log a private thought on ${mediaTitle}…`}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint outline-none resize-none"
          />
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
            <input
              type="text"
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              placeholder="Tag (e.g. S03 E03, Ch. 28, Issue #4, 42h)"
              className="flex-1 bg-transparent text-xs text-ink-dim placeholder:text-ink-faint outline-none"
            />
            <button
              type="submit"
              disabled={!noteText.trim()}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-brand text-brand-ink text-xs font-semibold disabled:opacity-40 hover:opacity-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save note</span>
            </button>
          </div>
        </form>

        {entries.length > 0 && (
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl bg-surface border border-white/[0.05] p-3.5 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {entry.contextLabel && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/8 text-ink-dim tabular-nums">
                        {entry.contextLabel}
                      </span>
                    )}
                    <span className="text-[11px] text-ink-faint">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{entry.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteJournalEntry(entry.id)}
                  aria-label="Delete note"
                  className="p-1.5 rounded-full text-ink-faint hover:text-red-400 hover:bg-white/5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
