import { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Link2,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  Unlink,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { buildPairingUrl, normalizeSyncCode } from '../services/syncApi';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';

interface DeviceSyncModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeviceSyncModal({ open, onClose }: DeviceSyncModalProps) {
  const {
    syncCode,
    syncStatus,
    lastSyncedAt,
    syncError,
    createSyncCode,
    linkSyncCode,
    syncNow,
    unlinkSyncCode,
  } = useCueStore();

  const [joinInput, setJoinInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedMode, setCopiedMode] = useState<'code' | 'link' | null>(null);

  useModalBackHandler(open, onClose);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
  }, [open]);

  useEffect(() => {
    if (!open || !syncCode) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(buildPairingUrl(syncCode), {
      width: 220,
      margin: 2,
      color: { dark: '#131519', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, syncCode]);

  if (!open) return null;

  const handleCreate = async () => {
    setWorking(true);
    setLocalError(null);
    const created = await createSyncCode();
    setWorking(false);
    if (!created) {
      setLocalError('Could not reach cloud sync. Make sure you are on the deployed app.');
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    setWorking(true);
    setLocalError(null);
    const res = await linkSyncCode(joinInput);
    setWorking(false);
    if (!res.ok) {
      setLocalError(res.message);
      return;
    }
    setJoinInput('');
  };

  const handleCopy = async (mode: 'code' | 'link') => {
    if (!syncCode) return;
    const text = mode === 'link' ? buildPairingUrl(syncCode) : syncCode;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMode(mode);
      window.setTimeout(() => setCopiedMode((prev) => (prev === mode ? null : prev)), 1800);
    } catch {
      // clipboard blocked fallback ignored
    }
  };

  const formatSyncedLabel = () => {
    if (syncStatus === 'syncing') return 'Syncing with cloud…';
    if (syncStatus === 'error') return syncError || 'Sync paused';
    if (!lastSyncedAt) return 'Connected to cloud library';
    const diffSec = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
    if (diffSec < 15) return 'Synced · just now';
    if (diffSec < 60) return `Synced · ${diffSec}s ago`;
    const mins = Math.round(diffSec / 60);
    if (mins < 60) return `Synced · ${mins}m ago`;
    return `Synced · ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/75 backdrop-blur-sm p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md bg-surface-raised border border-white/10 rounded-t-[28px] md:rounded-[26px] p-5 space-y-4 shadow-2xl animate-sheet-up max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-watch" />
            <h2 className="font-display font-bold text-lg text-ink">Sync devices</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close device sync modal"
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {syncCode ? (
          <div className="space-y-4">
            <p className="text-xs text-ink-dim leading-relaxed">
              Scan this QR code with your phone camera, or enter the sync code below on another device. Both stay synced with zero login.
            </p>

            {qrDataUrl && (
              <div className="flex flex-col items-center">
                <div className="rounded-2xl bg-white p-3 border border-white/10">
                  <img
                    src={qrDataUrl}
                    alt={`QR pairing code for ${syncCode}`}
                    className="w-[184px] h-[184px] block"
                  />
                </div>
                <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-ink-dim">
                  <Smartphone className="w-3.5 h-3.5 text-watch" />
                  Opens and links your library automatically
                </span>
              </div>
            )}

            <div className="rounded-2xl bg-surface border border-white/10 px-3.5 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint">
                  Private sync code
                </p>
                <p className="font-mono text-sm font-semibold text-ink tracking-wider mt-0.5 truncate">
                  {syncCode}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopy('code')}
                  className="px-2.5 py-1.5 rounded-xl bg-surface-raised border border-white/10 text-xs font-semibold text-ink hover:border-white/25 inline-flex items-center gap-1"
                >
                  {copiedMode === 'code' ? (
                    <Check className="w-3.5 h-3.5 text-watch" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-ink-dim" />
                  )}
                  <span>{copiedMode === 'code' ? 'Copied' : 'Code'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy('link')}
                  className="px-2.5 py-1.5 rounded-xl bg-surface-raised border border-white/10 text-xs font-semibold text-ink hover:border-white/25 inline-flex items-center gap-1"
                >
                  {copiedMode === 'link' ? (
                    <Check className="w-3.5 h-3.5 text-watch" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5 text-ink-dim" />
                  )}
                  <span>{copiedMode === 'link' ? 'Copied' : 'Link'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-ink-dim">
                <Cloud
                  className={`w-3.5 h-3.5 ${
                    syncStatus === 'error' ? 'text-red-400' : 'text-watch'
                  }`}
                />
                <span>{formatSyncedLabel()}</span>
              </span>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncStatus === 'syncing'}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface border border-white/10 text-xs font-semibold text-ink hover:bg-background disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                />
                <span>Sync now</span>
              </button>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-[11px] text-ink-faint">
                Keeps local data even after unlinking.
              </span>
              <button
                type="button"
                onClick={unlinkSyncCode}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-red-300 hover:bg-red-500/10"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Unlink</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-ink-dim leading-relaxed">
              Generate a private sync code and QR here, then scan or paste it on your phone to keep Watch, Read, Play, and Journal in sync without creating an account.
            </p>

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={working || syncStatus === 'syncing'}
              className="w-full py-2.5 rounded-full bg-brand text-brand-ink text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-50"
            >
              {working ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              <span>Create sync code & QR</span>
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                Or link existing code
              </span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <form onSubmit={(e) => void handleLinkSubmit(e)} className="space-y-2.5">
              <input
                type="text"
                value={joinInput}
                onChange={(e) => {
                  setJoinInput(e.target.value.toUpperCase());
                  setLocalError(null);
                }}
                onBlur={() => {
                  if (joinInput.trim()) setJoinInput(normalizeSyncCode(joinInput));
                }}
                placeholder="CUE-XXXX-XXXX-XXXX"
                aria-label="Enter sync code"
                className="w-full rounded-xl bg-surface border border-white/10 px-3.5 py-2.5 font-mono text-sm text-ink placeholder:text-ink-faint outline-none focus:border-brand tracking-wider"
              />
              {(localError || syncError) && (
                <p className="text-xs text-red-300">{localError || syncError}</p>
              )}
              <button
                type="submit"
                disabled={!joinInput.trim() || working || syncStatus === 'syncing'}
                className="w-full py-2.5 rounded-full bg-surface border border-white/12 text-xs font-semibold text-ink hover:bg-background disabled:opacity-40"
              >
                Pair this device
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
