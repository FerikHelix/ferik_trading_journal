import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * Dukascopy's public chart feed — the only free, keyless source that carries
 * silver, crude oil and every forex major.
 *
 * Two awkward facts shape this module:
 *
 *  1. It sends no `Access-Control-Allow-Origin`, so `fetch()` can never read
 *     it. The only way in is JSONP, i.e. executing their JavaScript.
 *  2. It answers 403 unless the request carries a `Referer` (it does not check
 *     which origin, only that one exists).
 *
 * So the script is run inside a sandboxed iframe (`public/dukascopy-frame.html`)
 * that has an opaque origin and therefore no access to this app's IndexedDB,
 * and the parsed numbers come back over postMessage. See that file for why.
 *
 * This is an undocumented widget backend with no versioning promise. Treat
 * every call as failure-prone and always keep a fallback provider.
 */
const BASE = 'https://freeserv.dukascopy.com/2.0/index.php';

const FRAME_PATH = 'dukascopy-frame.html';

/** `1HOUR` etc. An unrecognised value answers `[null]` rather than an error. */
const INTERVAL: Record<Timeframe, string> = { M15: '15MIN', H1: '1HOUR', H4: '4HOUR' };

interface Pending {
  resolve: (rows: unknown[]) => void;
  reject: (error: Error) => void;
}

let frame: HTMLIFrameElement | null = null;
let ready: Promise<HTMLIFrameElement> | null = null;
const pending = new Map<string, Pending>();
let counter = 0;

/**
 * Circuit breaker.
 *
 * When this host is unreachable the request hangs until it times out, and
 * paying that once per instrument makes a whole watchlist crawl. The breaker
 * skips the provider entirely for a short while so the fallbacks answer
 * immediately.
 *
 * It takes TWO consecutive network failures to trip. Dukascopy is normally
 * healthy, so a single hiccup must not disable the only source of silver, oil
 * and the forex majors for everything else on the page.
 */
const COOLDOWN_MS = 3 * 60_000;
const FAILURES_BEFORE_TRIP = 2;
let consecutiveFailures = 0;
const COOLDOWN_KEY = 'feriktrading-dukascopy-cooldown';

/**
 * The cooldown is kept in sessionStorage, not just a module variable. This is
 * a multi-page app, so every navigation reloads the bundle — an in-memory flag
 * would be discarded and the timeout paid again on each page.
 */
function readCooldown(): number {
  try {
    return Number(sessionStorage.getItem(COOLDOWN_KEY) ?? 0);
  } catch {
    return 0;
  }
}

export function isDukascopyCoolingDown(): boolean {
  return Date.now() < readCooldown();
}

function noteFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures < FAILURES_BEFORE_TRIP) return;
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_MS));
  } catch {
    /* private mode — the in-flight page still benefits from the thrown error */
  }
}

function noteSuccess() {
  consecutiveFailures = 0;
  try {
    sessionStorage.removeItem(COOLDOWN_KEY);
  } catch {
    /* nothing to clear */
  }
}

function ensureFrame(): Promise<HTMLIFrameElement> {
  if (ready) return ready;

  ready = new Promise<HTMLIFrameElement>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new MarketDataError('Dukascopy hanya tersedia di browser.', 'no-provider', 'dukascopy'));
      return;
    }

    const element = document.createElement('iframe');
    // No allow-same-origin: the frame must stay in an opaque origin so the
    // third-party script inside it cannot reach this app's stored data.
    element.setAttribute('sandbox', 'allow-scripts');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('title', 'Market data bridge');
    element.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    element.src = `${import.meta.env.BASE_URL}${FRAME_PATH}`;

    const timer = window.setTimeout(() => {
      reject(new MarketDataError('Jembatan data Dukascopy tidak siap.', 'network', 'dukascopy'));
    }, 5_000);

    function onMessage(event: MessageEvent) {
      // The frame is sandboxed, so event.origin is the string "null" and cannot
      // be checked. Identity of the source window is the real guard.
      if (event.source !== element.contentWindow) return;
      const data = event.data as { type?: string; id?: string; rows?: unknown[]; error?: string };
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'duk:ready') {
        window.clearTimeout(timer);
        resolve(element);
        return;
      }
      if (data.type === 'duk:result' && data.id) {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        if (data.error || !Array.isArray(data.rows)) {
          entry.reject(new MarketDataError(
            data.error === 'empty'
              ? 'Dukascopy tidak mengembalikan candle.'
              : 'Dukascopy tidak dapat dihubungi.',
            data.error === 'empty' ? 'upstream' : 'network',
            'dukascopy',
          ));
          return;
        }
        entry.resolve(data.rows);
      }
    }

    window.addEventListener('message', onMessage);
    document.body.append(element);
    frame = element;
  }).catch((error) => {
    // Let a later call retry rather than caching the failure forever.
    ready = null;
    frame?.remove();
    frame = null;
    throw error;
  });

  return ready;
}

function buildUrl(symbol: string, timeframe: Timeframe, limit: number): string {
  const url = new URL(BASE);
  url.searchParams.set('path', 'chart/json3');
  url.searchParams.set('instrument', symbol);
  url.searchParams.set('offer_side', 'B');
  url.searchParams.set('interval', INTERVAL[timeframe]);
  // Both of these are mandatory: time_direction=N returns an empty array, and
  // omitting timestamp returns a bare null.
  url.searchParams.set('time_direction', 'P');
  url.searchParams.set('timestamp', String(Date.now()));
  url.searchParams.set('limit', String(Math.min(limit, 1000)));
  return url.toString();
}

export async function fetchDukascopyCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  if (isDukascopyCoolingDown()) {
    throw new MarketDataError('Dukascopy tidak dapat dihubungi dari jaringan ini.', 'network', 'dukascopy');
  }

  let element: HTMLIFrameElement;
  try {
    element = await ensureFrame();
  } catch (error) {
    noteFailure();
    throw error;
  }
  const id = `duk-${(counter += 1)}`;
  const url = buildUrl(symbol, timeframe, limit);

  const rows = await new Promise<unknown[]>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      pending.delete(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    pending.set(id, {
      resolve: (value) => { signal?.removeEventListener('abort', onAbort); resolve(value); },
      reject: (error) => { signal?.removeEventListener('abort', onAbort); reject(error); },
    });

    element.contentWindow?.postMessage({ type: 'duk:fetch', id, url, timeoutMs: 4_500 }, '*');
  }).catch((error: unknown) => {
    // A blocked or unreachable host fails the same way for every symbol, so
    // stop retrying it for the rest of the cooldown.
    if (error instanceof MarketDataError && error.kind === 'network') noteFailure();
    throw error;
  });

  // [ timestamp_ms, open, high, low, close, volume ], newest bar first.
  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const candle: Candle = {
      t: Number(row[0]),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      v: row[5] === undefined ? undefined : Number(row[5]),
    };
    if (![candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite)) continue;
    candles.push(candle);
  }

  if (candles.length === 0) {
    throw new MarketDataError('Dukascopy tidak mengembalikan candle yang valid.', 'upstream', 'dukascopy');
  }

  noteSuccess();
  return candles.sort((a, b) => a.t - b.t);
}
