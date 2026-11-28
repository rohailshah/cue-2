import { useEffect, useState } from 'react';
import {
  Activity,
  Download,
  FileSpreadsheet,
  FileText,
  HeartPulse,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { testTmdbConnection } from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';
import {
  downloadTextFile,
  exportComicsCsv,
  exportFinishedLogTxt,
  exportLibraryCsv,
} from '../utils/mediaExport';
import { RecentImportsList } from './RecentImportsList';
import { ProfileMediaPickerModal } from './ProfileMediaPickerModal';
import {
  fetchLiveHealth,
  scanAndRepairLibrary,
  type LibraryRepairSummary,
  type LiveHealthReport,
} from '../utils/libraryHeal';

export function SettingsModal() {
  const {
    state,
    settingsOpen,
    setSettingsOpen,
    setImportModalOpen,
    updateProfile,
    updateSettings,
    patchMediaMetadata,
    exportLibraryJson,
    recentImports,
    undoImportById,
    dismissImportRecord,
    selectiveReset,
    clearAllData,
    showToast,
  } = useCueStore();

  const [name, setName] = useState(state.profile.name);
  const [bio, setBio] = useState(state.profile.bio);
  const [profileMediaTarget, setProfileMediaTarget] = useState<'avatar' | 'banner' | null>(null);
  const [tmdbKey, setTmdbKey] = useState(state.settings.tmdbApiKey);
  const [tmdbStatus, setTmdbStatus] = useState<'idle' | 'testing' | 'ok' | 'err'>('idle');
  const [confirmScope, setConfirmScope] = useState<'watch' | 'read' | 'play' | 'all' | 'wipe' | null>(null);
  const [health, setHealth] = useState<LiveHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairSummary, setRepairSummary] = useState<LibraryRepairSummary | null>(null);

  useEffect(() => {
    if (!settingsOpen) {
      setConfirmScope(null);
      setProfileMediaTarget(null);
      return;
    }
    setName(state.profile.name);
    setBio(state.profile.bio);
    setTmdbKey(state.settings.tmdbApiKey);
    setLoadingHealth(true);
    fetchLiveHealth(false).then((rep) => {
      setHealth(rep);
      setLoadingHealth(false);
    });
  }, [settingsOpen, state.profile.name, state.profile.bio, state.settings.tmdbApiKey]);

  if (!settingsOpen) return null;

  const bannerOptions = [
    ...state.showOrder.slice(0, 2).map((id) => ({
      label: state.shows[id]?.title || id,
      url: state.shows[id]?.backdropUrl || state.shows[id]?.posterUrl || '',
    })),
    ...state.gameOrder.slice(0, 2).map((id) => ({
      label: state.games[id]?.title || id,
      url: state.games[id]?.backdropUrl || state.games[id]?.coverUrl || '',
    })),
  ].filter((b) => b.url);

  const avatarOptions = [
    ...state.showOrder
      .flatMap((id) => state.shows[id]?.cast?.slice(0, 2).map((c) => c.avatarUrl) || []),
    ...state.showOrder.slice(0, 2).map((id) => state.shows[id]?.posterUrl),
  ]
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);

  const handleSaveProfile = () => {
    updateProfile({
      name: name.trim() || 'You',
      bio: bio.trim(),
    });
  };

  const handleDownloadBackup = () => {
    const json = exportLibraryJson();
    downloadTextFile(
      json,
      `cue-journal-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
    showToast('Exported cue backup JSON');
  };

  const todayStamp = () => new Date().toISOString().slice(0, 10);

  const handleDownloadLibraryCsv = () => {
    const csv = exportLibraryCsv(state, 'all');
    downloadTextFile(csv, `cue-library-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
    showToast('Exported readable Library CSV');
  };

  const handleDownloadComicsCsv = () => {
    const csv = exportComicsCsv(state);
    downloadTextFile(csv, `cue-comics-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
    showToast('Exported Comics & Books CSV');
  };

  const handleDownloadFinishedTxt = () => {
    const txt = exportFinishedLogTxt(state);
    downloadTextFile(txt, `cue-finished-log-${todayStamp()}.txt`, 'text/plain;charset=utf-8');
    showToast('Exported Finished Log TXT');
  };

  const handleTestTmdb = async () => {
    if (!tmdbKey.trim()) {
      updateSettings({ tmdbApiKey: '' });
      setTmdbStatus('idle');
      return;
    }
    setTmdbStatus('testing');
    try {
      const ok = await testTmdbConnection(tmdbKey);
      setTmdbStatus(ok ? 'ok' : 'err');
      if (ok) {
        updateSettings({ tmdbApiKey: tmdbKey.trim() });
        showToast('TMDB live search connected');
      }
    } catch {
      setTmdbStatus('err');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="w-full md:max-w-xl max-h-[88dvh] flex flex-col bg-surface border border-white/10 rounded-t-[28px] md:rounded-[28px] shadow-2xl animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h3 className="font-display font-bold text-lg text-ink">Settings & Library</h3>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Calm Section Palette Summary */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-ink-dim" />
              <h4 className="text-sm font-semibold text-ink">Soft Dark Appearance</h4>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-watch shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Watch</p>
                  <p className="text-[11px] text-ink-dim">Soft Cyan</p>
                </div>
              </div>
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-read shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Read</p>
                  <p className="text-[11px] text-ink-dim">Soft Amber</p>
                </div>
              </div>
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-play shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Play</p>
                  <p className="text-[11px] text-ink-dim">Soft Purple</p>
                </div>
              </div>
            </div>
          </section>

          {/* Edit Profile */}
          <section className="space-y-3 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Journal Profile</h4>
              </div>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand text-brand-ink hover:opacity-90"
              >
                Save profile
              </button>
            </div>

            <div>
              <label className="text-xs text-ink-dim block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-ink-dim block mb-1">Bio</label>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-ink-dim">Cover banner</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileMediaTarget('banner')}
                    className="text-[11px] font-semibold text-brand hover:underline"
                  >
                    Upload or paste URL
                  </button>
                  {state.profile.bannerUrl && (
                    <button
                      type="button"
                      onClick={() => updateProfile({ bannerUrl: '' })}
                      className="text-[11px] text-ink-dim hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {bannerOptions.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {bannerOptions.map((b, idx) => (
                    <button
                      key={`${b.label}-${idx}`}
                      type="button"
                      onClick={() => updateProfile({ bannerUrl: b.url })}
                      className={`relative h-12 rounded-xl overflow-hidden border ${
                        state.profile.bannerUrl === b.url
                          ? 'border-brand ring-1 ring-brand'
                          : 'border-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={b.url} alt={b.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs text-ink-dim">Avatar</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProfileMediaTarget('avatar')}
                    className="text-[11px] font-semibold text-brand hover:underline"
                  >
                    Upload or paste URL
                  </button>
                  {state.profile.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => updateProfile({ avatarUrl: '' })}
                      className="text-[11px] text-ink-dim hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {avatarOptions.length > 0 && (
                <div className="flex items-center gap-2.5 flex-wrap">
                  {avatarOptions.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => updateProfile({ avatarUrl: url })}
                      className={`h-11 w-11 rounded-full overflow-hidden border-2 ${
                        state.profile.avatarUrl === url ? 'border-brand' : 'border-white/15 opacity-80'
                      }`}
                    >
                      <img src={url} alt="Avatar option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Preferences */}
          <section className="space-y-2.5 pt-2 border-t border-white/8">
            <h4 className="text-sm font-semibold text-ink mb-2">Preferences</h4>
            <button
              type="button"
              onClick={() =>
                updateSettings({ showPosterProgress: !state.settings.showPosterProgress })
              }
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
            >
              <span>Show progress bars on artwork</span>
              <span
                className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                  state.settings.showPosterProgress ? 'bg-brand justify-end' : 'bg-white/15 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow" />
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  groupChapters: !(state.settings.groupChapters !== false),
                })
              }
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
            >
              <span>Group long chapter lists</span>
              <span
                className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                  state.settings.groupChapters !== false
                    ? 'bg-brand justify-end'
                    : 'bg-white/15 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow" />
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  detailMode: state.settings.detailMode === 'advanced' ? 'simple' : 'advanced',
                })
              }
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
            >
              <span>Default detail card mode</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-brand capitalize">
                {state.settings.detailMode || 'simple'}
              </span>
            </button>
          </section>

            {/* Live Search */}
          <section className="space-y-2.5 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Live Catalog APIs</h4>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-watch/15 text-watch">
                {health?.integrations?.tmdbServerConfigured && health?.integrations?.igdbServerConfigured
                  ? 'TMDB + IGDB Active'
                  : health?.integrations?.tmdbServerConfigured
                    ? 'TMDB Proxy Active'
                    : health?.integrations?.igdbServerConfigured
                      ? 'IGDB Proxy Active'
                      : 'Zero-Config Active'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-background border border-white/8 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      health?.integrations?.tmdbServerConfigured || state.settings.tmdbApiKey
                        ? 'bg-[#7AC7A4]'
                        : 'bg-white/25'
                    }`}
                  />
                  <span className="text-ink truncate">TMDB Movies & TV</span>
                </span>
                <span className="text-[11px] text-ink-dim shrink-0">
                  {health?.integrations?.tmdbServerConfigured
                    ? 'Vercel proxy'
                    : state.settings.tmdbApiKey
                      ? 'Personal key'
                      : 'Fallback (TVMaze)'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-background border border-white/8 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      health?.integrations?.igdbServerConfigured
                        ? 'bg-[#7AC7A4]'
                        : 'bg-white/25'
                    }`}
                  />
                  <span className="text-ink truncate">IGDB Games</span>
                </span>
                <span className="text-[11px] text-ink-dim shrink-0">
                  {health?.integrations?.igdbServerConfigured
                    ? 'Vercel proxy'
                    : 'Fallback (Steam)'}
                </span>
              </div>
            </div>

            <p className="text-xs text-ink-dim">
              Server proxies (<code className="text-ink/80">/api/tmdb</code> &{' '}
              <code className="text-ink/80">/api/igdb</code>) activate automatically on every device
              once <code className="text-ink/80">TMDB_API_KEY</code> and{' '}
              <code className="text-ink/80">TWITCH_CLIENT_ID</code> /{' '}
              <code className="text-ink/80">TWITCH_CLIENT_SECRET</code> are set on Vercel. You can
              also override TMDB below.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="TMDB v3 API key (optional)"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                className="flex-1 rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
              <button
                type="button"
                onClick={handleTestTmdb}
                className="px-3.5 py-2 rounded-xl bg-surface-raised border border-white/10 text-xs font-semibold text-ink hover:bg-white/10"
              >
                {tmdbStatus === 'testing' ? 'Testing…' : 'Save & Test'}
              </button>
            </div>
            {tmdbStatus === 'ok' && (
              <p className="text-xs text-watch">TMDB API key verified and enabled.</p>
            )}
            {tmdbStatus === 'err' && (
              <p className="text-xs text-red-300">
                Could not verify key; zero-config search remains active.
              </p>
            )}
          </section>

          {/* System Health & Self-Healing */}
          <section className="space-y-3 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-[#7AC7A4]" />
                <h4 className="text-sm font-semibold text-ink">System Health & Self-Healing</h4>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setLoadingHealth(true);
                  const rep = await fetchLiveHealth(true);
                  setHealth(rep);
                  setLoadingHealth(false);
                }}
                disabled={loadingHealth}
                className="text-xs font-medium text-ink-dim hover:text-ink inline-flex items-center gap-1"
              >
                {loadingHealth ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Refresh</span>
              </button>
            </div>

            {health ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {health.services.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-background border border-white/8 text-xs"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          s.ok ? 'bg-[#7AC7A4]' : 'bg-red-400'
                        }`}
                      />
                      <span className="text-ink truncate">{s.name}</span>
                    </span>
                    <span className="text-[11px] text-ink-faint tabular-nums shrink-0">
                      {s.ok ? `${s.latencyMs}ms` : s.note || 'Down'}
                    </span>
                  </div>
                ))}
              </div>
            ) : loadingHealth ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={`svc-skel-${i}`}
                    className="h-8 rounded-xl bg-background/60 border border-white/[0.04] animate-pulse"
                  />
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={repairing}
              onClick={async () => {
                setRepairing(true);
                try {
                  const summary = await scanAndRepairLibrary(state, patchMediaMetadata);
                  setRepairSummary(summary);
                  showToast(
                    summary.repaired > 0 || summary.clearedStaleComics > 0
                      ? `Repaired ${summary.repaired} covers & refreshed ${summary.clearedStaleComics} comics`
                      : `Verified ${summary.scanned} library items — all healthy`
                  );
                } finally {
                  setRepairing(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-background border border-white/10 hover:border-watch/50 text-sm font-medium text-ink disabled:opacity-50"
            >
              {repairing ? (
                <Loader2 className="w-4 h-4 animate-spin text-watch" />
              ) : (
                <Wrench className="w-4 h-4 text-watch" />
              )}
              <span>{repairing ? 'Scanning & repairing…' : 'Check & repair broken covers'}</span>
            </button>

            {repairSummary && (
              <p className="text-xs text-[#7AC7A4] flex items-center gap-1.5 tabular-nums">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {repairSummary.scanned} scanned · {repairSummary.healthy} healthy ·{' '}
                  {repairSummary.repaired} repaired · {repairSummary.clearedStaleComics} caches
                  refreshed
                </span>
              </p>
            )}
          </section>

          {/* Data Import / Export */}
          <section className="space-y-3 pt-2 border-t border-white/8">
            <h4 className="text-sm font-semibold text-ink">Local Backup & Smart Import</h4>
            <p className="text-xs text-ink-dim">
              Export a lossless JSON backup, human-readable spreadsheets/logs for Excel or Google
              Sheets, or import IMDb, Letterboxd, Goodreads, Comic Geeks CSV, JSON, and .txt logs.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-background border border-white/10 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                <Download className="w-4 h-4 text-ink-dim" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setImportModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-background border border-white/10 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                <Upload className="w-4 h-4 text-watch" />
                <span>Smart Import</span>
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Readable Exports (Excel, Sheets & Text)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadLibraryCsv}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-background border border-white/10 text-xs font-medium text-ink hover:border-watch/40 hover:bg-surface-raised"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-watch shrink-0" />
                  <span>Library CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadComicsCsv}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-background border border-white/10 text-xs font-medium text-ink hover:border-read/40 hover:bg-surface-raised"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-read shrink-0" />
                  <span>Comics CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadFinishedTxt}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-background border border-white/10 text-xs font-medium text-ink hover:border-play/40 hover:bg-surface-raised"
                >
                  <FileText className="w-3.5 h-3.5 text-play shrink-0" />
                  <span>Finished Log TXT</span>
                </button>
              </div>
            </div>

            {recentImports.length > 0 && (
              <div className="pt-2 border-t border-white/8">
                <RecentImportsList
                  records={recentImports}
                  onUndo={undoImportById}
                  onDismiss={dismissImportRecord}
                />
              </div>
            )}
          </section>

          {/* Reset Progress Data vs Remove All Data */}
          <section className="space-y-3 pt-2 border-t border-white/8 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Reset Progress Data</h4>
              </div>
              <p className="text-xs text-ink-dim mt-1">
                Keep your saved titles, but reset watched, read, and played progress and history.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['watch', 'read', 'play', 'all'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    if (confirmScope === scope) {
                      selectiveReset(scope);
                      setConfirmScope(null);
                    } else {
                      setConfirmScope(scope);
                    }
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    confirmScope === scope
                      ? 'bg-red-500/20 border-red-400 text-red-300'
                      : 'bg-background border-white/10 text-ink-dim hover:text-ink'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {confirmScope === scope
                      ? 'Confirm?'
                      : scope === 'watch'
                        ? 'Reset Watch'
                        : scope === 'read'
                          ? 'Reset Read'
                          : scope === 'play'
                            ? 'Reset Play'
                            : 'Reset All'}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-white/8">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h4 className="text-sm font-semibold text-ink">Remove All Data</h4>
              </div>
              <p className="text-xs text-ink-dim mt-1 mb-2.5">
                Erase every title, progress log, diary entry, custom list, and local sync link to
                start completely from scratch.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (confirmScope === 'wipe') {
                    clearAllData();
                    setConfirmScope(null);
                    setSettingsOpen(false);
                  } else {
                    setConfirmScope('wipe');
                  }
                }}
                className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  confirmScope === 'wipe'
                    ? 'bg-red-500/25 border-red-400 text-red-200'
                    : 'bg-red-500/10 border-red-400/25 text-red-300 hover:bg-red-500/15'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {confirmScope === 'wipe' ? 'Confirm remove all data?' : 'Remove all data'}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <ProfileMediaPickerModal
        open={profileMediaTarget !== null}
        initialTarget={profileMediaTarget || 'avatar'}
        onClose={() => setProfileMediaTarget(null)}
      />
    </div>
  );
}
