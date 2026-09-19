import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * Optional user-supplied endpoint, empty by default.
 *
 * Yahoo Finance is the only free feed that covers silver and crude oil with
 * real intraday candles, but it sends no CORS headers at all, so a browser can
 * never call it directly. The escape hatch is a ~20-line Cloudflare Worker
 * (free tier: 100k requests/day) that forwards the request and adds the CORS
 * header. Paste its URL in Settings and every instrument lights up; leave it
 * blank and the app falls back to the keyless/keyed providers.
 *
 * Expected contract: <base>?symbol=<yahoo symbol>&interval=<15m|1h|4h>&range=<range>
 * returning Yahoo's v8/finance/chart payload unmodified.
 */
const INTERVAL: Record<Timeframe, string> = { M15: '15m', H1: '1h', H4: '4h' };

/** Yahoo caps 15m history at 60 days and 1h at 730 days, server-side. */
const RANGE: Record<Timeframe, string> = { M15: '60d', H1: '730d', H4: '730d' };

interface YahooQuote {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YahooChart {
  chart?: {
    result?: Array<{ timestamp?: number[]; indicators?: { quote?: YahooQuote[] } }>;
    error?: { description?: string } | null;
  };
}

export async function fetchProxyCandles(
  baseUrl: string,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = new URL(baseUrl);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', INTERVAL[timeframe]);
  url.searchParams.set('range', RANGE[timeframe]);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Data proxy tidak bisa dihubungi.', 'network', 'proxy');
  }
  if (!response.ok) {
    throw new MarketDataError(`Data proxy menolak permintaan (${response.status}).`, 'upstream', 'proxy');
  }

  const payload = (await response.json().catch(() => null)) as YahooChart | null;
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) {
    throw new MarketDataError(payload?.chart?.error?.description ?? 'Respons proxy tidak dikenali.', 'upstream', 'proxy');
  }

  const candles: Candle[] = [];
  for (let index = 0; index < result.timestamp.length; index += 1) {
    const close = quote.close?.[index];
    const open = quote.open?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    // Yahoo returns parallel arrays with null holes at illiquid stamps. Zipping
    // without this check invents flat candles that break structure detection.
    if (close == null || open == null || high == null || low == null) continue;
    candles.push({
      t: result.timestamp[index] * 1000,
      o: open,
      h: high,
      l: low,
      c: close,
      v: quote.volume?.[index] ?? undefined,
    });
  }

  return candles.slice(-limit);
}
