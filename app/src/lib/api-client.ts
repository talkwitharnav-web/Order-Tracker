/**
 * Shared client-side fetch wrapper: adds a timeout (fetch never resolves on
 * its own if the server hangs) and a couple of retries for failures that are
 * safe to blindly redo — a dropped connection or a timeout, not a real HTTP
 * error response. A 4xx/5xx response is NOT retried here (that's a real
 * answer from the server, e.g. "invalid password" or "order not found");
 * only network-level failures (fetch throwing) and 502/503/504 (proxy/server
 * temporarily unavailable) are retried.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [300, 800];
const RETRYABLE_STATUS = new Set([502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // If the caller already passed their own AbortSignal (e.g. to cancel a
  // superseded autocomplete request), forward its abort into this call's
  // controller too — otherwise the caller's signal would be silently
  // dropped by being overwritten below, and callers who intentionally cancel
  // in-flight requests (see RestaurantAutocomplete) would stop working.
  const externalSignal = init.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like `fetch`, but retries transient network failures/timeouts and
 * 502/503/504 with a short backoff before giving up and returning (or
 * throwing) the last result.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const delays = RETRY_DELAYS_MS.slice(0, opts.retries ?? RETRY_DELAYS_MS.length);

  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetchOnce(input, init, timeoutMs);
      if (RETRYABLE_STATUS.has(response.status) && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network request failed");
}

/** fetchWithRetry + JSON parsing + throwing a friendly Error on a non-ok response. */
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithRetry(input, init, opts);
  } catch {
    throw new Error("Network error — check your connection and try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error || `Request failed (status ${response.status})`);
  }

  return response.json();
}
