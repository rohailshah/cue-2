import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Link2, Loader2, Trash2, Upload, X } from 'lucide-react';
import { MediaImage } from './MediaImage';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';
import { processUploadedProfileImage } from '../utils/profileImage';

export function ProfileMediaPickerModal({
  open,
  initialTarget = 'avatar',
  onClose,
}: {
  open: boolean;
  initialTarget?: 'avatar' | 'banner';
  onClose: () => void;
}) {
  const { state, updateProfile, showToast } = useCueStore();
  const [target, setTarget] = useState<'avatar' | 'banner'>(initialTarget);
  const [urlDraft, setUrlDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useModalBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    setTarget(initialTarget);
    setErrorMsg(null);
    setUrlDraft(
      initialTarget === 'avatar'
        ? state.profile.avatarUrl.startsWith('data:')
          ? ''
          : state.profile.avatarUrl
        : state.profile.bannerUrl.startsWith('data:')
          ? ''
          : state.profile.bannerUrl
    );
  }, [open, initialTarget, state.profile.avatarUrl, state.profile.bannerUrl]);

  const switchTarget = (next: 'avatar' | 'banner') => {
    setTarget(next);
    setErrorMsg(null);
    const current = next === 'avatar' ? state.profile.avatarUrl : state.profile.bannerUrl;
    setUrlDraft(current.startsWith('data:') ? '' : current);
  };

  const libraryArtworks = useMemo(() => {
    const urls = new Set<string>();
    const out: Array<{ label: string; url: string }> = [];
    const pushUrl = (label: string, raw?: string) => {
      const clean = (raw || '').trim();
      if (!clean || urls.has(clean)) return;
      urls.add(clean);
      out.push({ label, url: clean });
    };

    if (target === 'banner') {
      for (const id of state.showOrder) {
        const s = state.shows[id];
        if (s) pushUrl(s.title, s.backdropUrl || s.posterUrl);
        if (out.length >= 12) return out;
      }
      for (const id of state.gameOrder) {
        const g = state.games[id];
        if (g) pushUrl(g.title, g.backdropUrl || g.coverUrl);
        if (out.length >= 12) return out;
      }
      for (const id of state.movieOrder) {
        const m = state.movies[id];
        if (m) pushUrl(m.title, m.backdropUrl || m.posterUrl);
        if (out.length >= 12) return out;
      }
    } else {
      for (const id of state.showOrder) {
        for (const c of state.shows[id]?.cast || []) {
          pushUrl(c.actor, c.avatarUrl);
          if (out.length >= 12) return out;
        }
      }
      for (const id of state.showOrder) {
        const s = state.shows[id];
        if (s) pushUrl(s.title, s.posterUrl);
        if (out.length >= 12) return out;
      }
      for (const id of state.readOrder) {
        const r = state.readItems[id];
        if (r) pushUrl(r.title, r.coverUrl);
        if (out.length >= 12) return out;
      }
      for (const id of state.gameOrder) {
        const g = state.games[id];
        if (g) pushUrl(g.title, g.coverUrl);
        if (out.length >= 12) return out;
      }
    }
    return out;
  }, [target, state.showOrder, state.shows, state.gameOrder, state.games, state.movieOrder, state.movies, state.readOrder, state.readItems]);

  if (!open) return null;

  const currentUrl = target === 'avatar' ? state.profile.avatarUrl : state.profile.bannerUrl;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const compressed = await processUploadedProfileImage(file, target);
      if (target === 'avatar') {
        updateProfile({ avatarUrl: compressed });
        showToast('Updated profile picture');
      } else {
        updateProfile({ bannerUrl: compressed });
        showToast('Updated journal banner');
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process image.');
    } finally {
      setUploading(false);
    }
  };

  const handleApplyUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlDraft.trim();
    if (!trimmed) return;
    setErrorMsg(null);
    if (target === 'avatar') {
      updateProfile({ avatarUrl: trimmed });
      showToast('Updated profile picture');
    } else {
      updateProfile({ bannerUrl: trimmed });
      showToast('Updated journal banner');
    }
    onClose();
  };

  const handleClear = () => {
    if (target === 'avatar') {
      updateProfile({ avatarUrl: '' });
      showToast('Removed profile picture');
    } else {
      updateProfile({ bannerUrl: '' });
      showToast('Removed journal banner');
    }
    setUrlDraft('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[88dvh] flex flex-col bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] shadow-2xl animate-sheet-up overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-brand" />
            <h3 className="font-display font-bold text-lg text-ink">Customize journal look</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-surface border border-white/8">
            {(
              [
                { id: 'avatar', label: 'Profile picture' },
                { id: 'banner', label: 'Cover banner' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTarget(tab.id)}
                className={`py-2 rounded-xl text-xs font-semibold transition-colors ${
                  target === tab.id
                    ? 'bg-brand text-brand-ink'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Live Preview + Upload */}
          <div className="rounded-2xl bg-surface border border-white/[0.08] p-4 flex items-center gap-4">
            {target === 'avatar' ? (
              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/15 bg-background flex items-center justify-center shrink-0">
                {currentUrl ? (
                  <MediaImage
                    src={currentUrl}
                    alt={state.profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-display font-bold text-2xl text-ink select-none">
                    {(state.profile.name || 'Y').trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            ) : (
              <div className="w-28 h-16 rounded-xl overflow-hidden border border-white/10 bg-background shrink-0 flex items-center justify-center">
                {currentUrl ? (
                  <MediaImage
                    src={currentUrl}
                    alt="Current cover banner"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-5 h-5 text-ink-faint" />
                )}
              </div>
            )}

            <div className="flex-1 min-w-0 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-brand text-brand-ink text-xs font-semibold hover:opacity-95 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{uploading ? 'Processing…' : 'Upload photo'}</span>
                </button>
                {currentUrl && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white/8 hover:bg-red-500/15 text-xs font-medium text-ink-dim hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-ink-faint">
                Pick any image from your device or paste an image link below.
              </p>
            </div>
          </div>

          {errorMsg && <p className="text-xs text-red-300 px-1">{errorMsg}</p>}

          {/* URL Paste */}
          <form onSubmit={handleApplyUrl} className="space-y-1.5">
            <label className="text-xs text-ink-dim flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span>Or paste any image URL</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 min-w-0 rounded-xl bg-surface border border-white/10 px-3 py-2 text-xs text-ink placeholder:text-ink-faint outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={!urlDraft.trim()}
                className="px-3.5 py-2 rounded-xl bg-surface border border-white/12 text-xs font-semibold text-ink hover:border-brand disabled:opacity-40 shrink-0"
              >
                Use URL
              </button>
            </div>
          </form>

          {/* From Library */}
          {libraryArtworks.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-ink-dim">Or pick from your library</p>
              <div
                className={
                  target === 'banner' ? 'grid grid-cols-3 gap-2' : 'flex items-center gap-2.5 flex-wrap'
                }
              >
                {libraryArtworks.map((art, idx) => (
                  <button
                    key={`${art.url}-${idx}`}
                    type="button"
                    title={art.label}
                    onClick={() => {
                      if (target === 'avatar') {
                        updateProfile({ avatarUrl: art.url });
                        showToast('Updated profile picture');
                      } else {
                        updateProfile({ bannerUrl: art.url });
                        showToast('Updated journal banner');
                      }
                      onClose();
                    }}
                    className={
                      target === 'banner'
                        ? `h-14 rounded-xl overflow-hidden border transition-all ${
                            currentUrl === art.url
                              ? 'border-brand ring-1 ring-brand'
                              : 'border-white/10 opacity-80 hover:opacity-100'
                          }`
                        : `h-12 w-12 rounded-full overflow-hidden border-2 transition-all ${
                            currentUrl === art.url
                              ? 'border-brand'
                              : 'border-white/15 opacity-80 hover:opacity-100'
                          }`
                    }
                  >
                    <MediaImage
                      src={art.url}
                      alt={art.label}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
