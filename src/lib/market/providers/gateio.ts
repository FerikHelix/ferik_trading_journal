import { MarketDataError, type Candle, type Timeframe } from '../types';

/**
 * Gate.io spot candlesticks. Keyless and sends `Access-Control-Allow-Origin: *`,
 * so it is reachable with a plain fetch. Carries BTC plus the tokenised gold
 * pairs (PAXG, XAUT) that stand in for spot gold.
 *
 * Note: Gate's leveraged tokens (XAG3L, XAU3L, …) look like metals but are
 * decaying leveraged products and must never be used as spot proxies.
 */
const BASE = 'https://api.gateio.ws/api/v4/spot/candlesticks';

const INTERVAL: Record<Timeframe, string> = { M15: '15m', H1: '1h', H4: '4h' };

export async function fetchGateioCandles(
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const url = new URL(BASE);
  url.searchParams.set('currency_pair', symbol);
  url.searchParams.set('interval', INTERVAL[timeframe]);
  url.searchParams.set('limit', String(Math.min(limit, 1000)));

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new MarketDataError('Tidak bisa menghubungi Gate.io.', 'network', 'gateio');
  }
  if (response.status === 429) {
    throw new MarketDataError('Gate.io membatasi permintaan.', 'rate-limit', 'gateio');
  }
  if (!response.ok) {
    throw new MarketDataError(`Gate.io menolak permintaan (${response.status}).`, 'upstream', 'gateio');
  }

  const rows = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(rows)) {
    throw new MarketDataError('Respons Gate.io tidak dikenali.', 'upstream', 'gateio');
  }

  /*
   * Field order is unusual and easy to get wrong silently:
   *   [ ts_seconds, quoteVolume, CLOSE, HIGH, LOW, OPEN, baseVolume, closed ]
   * Close comes BEFORE open. Reading it in the conventional OHLC order
   * produces inverted candles with no error anywhere.
   */
  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const candle: Candle = {
      t: Number(row[0]) * 1000,
      c: Number(row[2]),
      h: Number(row[3]),
      l: Number(row[4]),
      o: Number(row[5]),
      v: Number(row[6]),
    };
    if (![candle.t, candle.o, candle.h, candle.l, candle.c].every(Number.isFinite)) continue;
    candles.push(candle);
  }

  if (candles.length === 0) {
    throw new MarketDataError('Gate.io tidak mengembalikan candle.', 'upstream', 'gateio');
  }
  return candles.sort((a, b) => a.t - b.t);
}
