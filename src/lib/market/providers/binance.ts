import { BINANCE_INTERVAL } from '../instruments';
import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * Binance's public market-data mirror. No API key, no account, and it sends
 * `Access-Control-Allow-Origin: *`, which is what makes it callable straight
 * from a static page. api.binance.com is *not* a drop-in substitute — it is
 * geo-blocked in several regions where this mirror still answers.
 */
const BASE = 'https://data-api.binance.vision/api/v3';

/** The endpoint silently clamps anything above this. */
const MAX_LIMIT = 1000;

export async function fetchBinanceCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = new URL(`${BASE}/klines`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', BINANCE_INTERVAL[timeframe]);
  url.searchParams.set('limit', String(Math.min(limit, MAX_LIMIT)));

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Tidak bisa menghubungi Binance.', 'network', 'binance');
  }
  if (response.status === 429 || response.status === 418) {
    throw new MarketDataError('Binance membatasi permintaan, coba lagi nanti.', 'rate-limit', 'binance');
  }
  if (!response.ok) {
    throw new MarketDataError(`Binance menolak permintaan (${response.status}).`, 'upstream', 'binance');
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new MarketDataError('Respons Binance tidak dikenali.', 'upstream', 'binance');
  }

  // [openTime, open, high, low, close, volume, closeTime, ...]
  return rows
    .map((row): Candle | null => {
      if (!Array.isArray(row)) return null;
      const candle: Candle = {
        t: Number(row[0]),
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4]),
        v: Number(row[5]),
      };
      return isFiniteCandle(candle) ? candle : null;
    })
    .filter((candle): candle is Candle => candle !== null);
}

function isFiniteCandle(candle: Candle): boolean {
  return Number.isFinite(candle.t)
    && Number.isFinite(candle.o)
    && Number.isFinite(candle.h)
    && Number.isFinite(candle.l)
    && Number.isFinite(candle.c);
}
