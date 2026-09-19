import { TWELVEDATA_INTERVAL } from '../instruments';
import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * Twelve Data. CORS-open, so the browser can call it directly with the user's
 * own free key — no proxy and no build step required.
 *
 * Two things the docs bury:
 *  - `values` arrives NEWEST FIRST, so it has to be reversed.
 *  - every numeric field is a string.
 *
 * Free tier covers forex and crypto but not commodities; XAG/WTI answer with a
 * plan error rather than data. That surfaces as a MarketDataError the UI can
 * explain, instead of an empty chart.
 */
const BASE = 'https://api.twelvedata.com';

export async function fetchTwelveDataCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Candle[]> {
  if (!apiKey) throw new MarketDataError('API key Twelve Data belum diisi.', 'no-key', 'twelvedata');

  const url = new URL(`${BASE}/time_series`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', TWELVEDATA_INTERVAL[timeframe]);
  url.searchParams.set('outputsize', String(Math.min(limit, 5000)));
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('apikey', apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Tidak bisa menghubungi Twelve Data.', 'network', 'twelvedata');
  }

  const payload = (await response.json().catch(() => null)) as
    | { status?: string; code?: number; message?: string; values?: unknown }
    | null;

  if (!payload) throw new MarketDataError('Respons Twelve Data tidak dikenali.', 'upstream', 'twelvedata');

  // Twelve Data reports errors in the body with HTTP 200 as often as not.
  const code = payload.code ?? response.status;
  if (payload.status === 'error' || !response.ok) {
    const message = payload.message ?? `Twelve Data menolak permintaan (${code}).`;
    if (code === 429) throw new MarketDataError('Kuota Twelve Data habis (800/hari, 8/menit).', 'rate-limit', 'twelvedata');
    if (code === 401 || code === 403) throw new MarketDataError(message, 'no-key', 'twelvedata');
    throw new MarketDataError(message, 'upstream', 'twelvedata');
  }

  const values = payload.values;
  if (!Array.isArray(values)) {
    throw new MarketDataError('Twelve Data tidak mengembalikan candle.', 'upstream', 'twelvedata');
  }

  const candles = values
    .map((row): Candle | null => {
      const entry = row as Record<string, string>;
      const t = Date.parse(`${entry.datetime?.replace(' ', 'T')}Z`);
      const candle: Candle = {
        t,
        o: Number(entry.open),
        h: Number(entry.high),
        l: Number(entry.low),
        c: Number(entry.close),
        v: entry.volume ? Number(entry.volume) : undefined,
      };
      return Number.isFinite(candle.t) && Number.isFinite(candle.c) && Number.isFinite(candle.o)
        && Number.isFinite(candle.h) && Number.isFinite(candle.l)
        ? candle
        : null;
    })
    .filter((candle): candle is Candle => candle !== null);

  return candles.sort((a, b) => a.t - b.t);
}
