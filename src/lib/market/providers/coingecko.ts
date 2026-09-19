import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * CoinGecko OHLC — last-resort only.
 *
 * It is the single keyless, CORS-open route to anything resembling silver
 * (via the tokenised `kinesis-silver`), which no exchange lists as a spot
 * pair. It is a poor source and is treated as such:
 *
 *  - Granularity is derived from `days` and cannot be requested directly:
 *    1-2 days gives 30m bars, 3-30 days gives 4h, beyond that 4d. So M15 is
 *    impossible and H1 is unavailable.
 *  - No volume is returned.
 *  - The free rate limit is brutal — HTTP 429 after roughly six requests in
 *    twenty seconds from a shared IP — so callers must lean on the cache.
 */
const BASE = 'https://api.coingecko.com/api/v3/coins';

/** Smallest `days` window that still yields the granularity we want. */
const DAYS: Record<Timeframe, string> = { M15: '2', H1: '2', H4: '14' };

export async function fetchCoinGeckoCandles(
  id: string,
  timeframe: Timeframe,
  _limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = new URL(`${BASE}/${encodeURIComponent(id)}/ohlc`);
  url.searchParams.set('vs_currency', 'usd');
  url.searchParams.set('days', DAYS[timeframe]);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Tidak bisa menghubungi CoinGecko.', 'network', 'coingecko');
  }
  if (response.status === 429) {
    throw new MarketDataError('Kuota CoinGecko habis, coba lagi nanti.', 'rate-limit', 'coingecko');
  }
  if (!response.ok) {
    throw new MarketDataError(`CoinGecko menolak permintaan (${response.status}).`, 'upstream', 'coingecko');
  }

  const rows = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(rows)) {
    throw new MarketDataError('Respons CoinGecko tidak dikenali.', 'upstream', 'coingecko');
  }

  // [ ts_ms, open, high, low, close ] — ascending, no volume.
  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const candle: Candle = {
      t: Number(row[0]),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
    };
    if (![candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite)) continue;
    candles.push(candle);
  }

  if (candles.length === 0) {
    throw new MarketDataError('CoinGecko tidak mengembalikan candle.', 'upstream', 'coingecko');
  }
  return candles.sort((a, b) => a.t - b.t);
}
