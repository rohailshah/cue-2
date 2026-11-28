/**
 * Resilient client-side fetch wrapper adding default timeouts and lightweight
 * per-host 429 rate-limit cooldown / single-retry backoff.
 */

export interface ResilientFetchOptions {
  timeoutMs?: number;
  retryOn429?: boolean;
}

const DEFAULT_TIMEOUT_MS = 8000;
const cooldownUntil = new Map<string, number>();

export function resetRateLimitCooldowns(): void {
  cooldownUntil.clear();
}

function getRateLimitKey(input: RequestInfo | URL): string {
  try {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://cue.local';
    const parsed = new URL(raw, base);
    if (parsed.pathname.startsWith('/api/')) {
      const seg = parsed.pathname.split('/')[2] || '';
      return `${parsed.host}:/api/${seg}`;
    }
    return parsed.host || 'default';
  } catch {
    return 'default';
  }
}

function parseRetryAfterMs(headerVal: string | null): number {
  if (!headerVal) return 1000;
  const secs = Number(headerVal.trim());
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(15000, Math.max(300, Math.round(secs * 1000)));
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.min(15000, Math.max(300, dateMs - Date.now()));
  }
  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnceWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  if (init?.signal) {
    return globalThis.fetch(input, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: ResilientFetchOptions
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = (init?.method || 'GET').toUpperCase();
  const allowRetry = opts?.retryOn429 ?? (method === 'GET' || method === 'HEAD');
  const key = getRateLimitKey(input);

  const blockedUntil = cooldownUntil.get(key) || 0;
  const remaining = blockedUntil - Date.now();
  if (remaining > 0) {
    if (remaining <= 1200) {
      await sleep(remaining);
    } else {
      return new Response(null, { status: 429, statusText: 'Rate limit cooldown' });
    }
  }

  let res = await fetchOnceWithTimeout(input, init, timeoutMs);
  if (res.status === 429) {
    const waitMs = parseRetryAfterMs(res.headers.get('Retry-After'));
    cooldownUntil.set(key, Date.now() + waitMs);
    if (allowRetry && waitMs <= 2000 && !init?.signal?.aborted) {
      await sleep(Math.min(waitMs, 1500));
      res = await fetchOnceWithTimeout(input, init, timeoutMs);
      if (res.status !== 429) {
        cooldownUntil.delete(key);
      } else {
        const nextWait = parseRetryAfterMs(res.headers.get('Retry-After'));
        cooldownUntil.set(key, Date.now() + nextWait);
      }
    }
  }

  return res;
}
