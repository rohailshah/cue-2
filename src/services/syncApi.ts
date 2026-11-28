import type { CueStoreState } from '../types';

const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SYNC_CODE_REGEX = /^CUE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function normalizeSyncCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('CUE') && compact.length === 15 ? compact.slice(3) : compact;
  if (body.length !== 12) return raw.trim().toUpperCase();
  return `CUE-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function isValidSyncCode(code: string): boolean {
  return SYNC_CODE_REGEX.test(normalizeSyncCode(code));
}

export function generateSyncCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let body = '';
  for (let i = 0; i < 12; i++) {
    body += SYNC_ALPHABET[bytes[i] % SYNC_ALPHABET.length];
  }
  return `CUE-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function buildPairingUrl(code: string): string {
  if (typeof window === 'undefined') return `/?pair=${encodeURIComponent(code)}`;
  return `${window.location.origin}/?pair=${encodeURIComponent(code)}`;
}

export interface PullSyncResult {
  exists: boolean;
  updatedAt?: number;
  state?: CueStoreState;
  error?: string;
}

export async function pullCloudLibrary(code: string): Promise<PullSyncResult> {
  const normalized = normalizeSyncCode(code);
  if (!isValidSyncCode(normalized)) {
    return { exists: false, error: 'Enter a valid sync code (e.g. CUE-XXXX-XXXX-XXXX).' };
  }

  try {
    const res = await fetch(`/api/sync?code=${encodeURIComponent(normalized)}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (!isJson) {
      return {
        exists: false,
        error: 'Cloud sync endpoint is unavailable on local dev (works on live deployment or vercel dev).',
      };
    }

    const data = (await res.json()) as {
      exists?: boolean;
      updatedAt?: number;
      state?: CueStoreState;
      error?: string;
    };

    if (res.status === 404) {
      return { exists: false };
    }
    if (!res.ok) {
      return { exists: false, error: data.error || 'Could not reach cloud sync.' };
    }

    return {
      exists: Boolean(data.exists && data.state),
      updatedAt: data.updatedAt,
      state: data.state,
    };
  } catch {
    return { exists: false, error: 'Network error while syncing.' };
  }
}

export async function pushCloudLibrary(
  code: string,
  state: CueStoreState,
  updatedAt = Date.now()
): Promise<{ ok: boolean; updatedAt: number; error?: string }> {
  const normalized = normalizeSyncCode(code);
  if (!isValidSyncCode(normalized)) {
    return { ok: false, updatedAt, error: 'Invalid sync code.' };
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalized, updatedAt, state }),
    });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (!isJson) {
      return {
        ok: false,
        updatedAt,
        error: 'Cloud sync endpoint is unavailable on local dev (works on live deployment or vercel dev).',
      };
    }

    const data = (await res.json()) as { ok?: boolean; updatedAt?: number; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, updatedAt, error: data.error || 'Failed to save to cloud.' };
    }
    return { ok: true, updatedAt: Number(data.updatedAt) || updatedAt };
  } catch {
    return { ok: false, updatedAt, error: 'Network error while saving to cloud.' };
  }
}