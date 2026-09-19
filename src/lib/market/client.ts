import type { AppSettings, CachedCandles } from '../domain/types';
import { capabilitiesFor, findInstrument } from './instruments';
import { fetchBinanceCandles } from './providers/binance';
import { fetchCoinGeckoCandles } from './providers/coingecko';
import { fetchDukascopyCandles } from './providers/dukascopy';
import { fetchGateioCandles } from './providers/gateio';
import { fetchProxyCandles } from './providers/proxy';
import { MarketDataError, type Candle, type CandleResult, type ProviderId, type Timeframe } from './types';

/**
 * How stale a cached series may be before a refetch. Every source here is a
 * free public endpoint with its own rate limiting (CoinGecko starts refusing
 * after roughly six requests in twenty seconds), and the app is opened many
 * times a day, so the cache does most of the work.
 */
const CANDLE_TTL: Record<Timeframe, number> = {
  M15: 5 * 60_000,
  H1: 15 * 60_000,
  H4: 30 * 60_000,
};

export const DEFAULT_CANDLE_LIMIT = 300;

export interface MarketCacheIO {
  getCandles: (id: string) => Promise<CachedCandles | undefined>;
  putCandles: (entry: CachedCandles) => Promise<void>;
}

export function cacheKey(instrumentId: string, timeframe: Timeframe): string {
  return `${instrumentId}:${timeframe}`;
}

function toRows(candles: Candle[]): number[][] {
  return candles.map((candle) => [candle.t, candle.o, candle.h, candle.l, candle.c]);
}

function fromRows(rows: number[][]): Candle[] {
  return rows.map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
}

async function fetchFromProvider(
  provider: ProviderId,
  symbol: string,
  timeframe: Timeframe,
  limit: number,
  settings: AppSettings,
  signal?: AbortSignal,
): Promise<Candle[]> {
  switch (provider) {
    case 'dukascopy':
      return fetchDukascopyCandles(symbol, timeframe, limit, signal);
    case 'binance':
      return fetchBinanceCandles(symbol, timeframe, limit, signal);
    case 'gateio':
      return fetchGateioCandles(symbol, timeframe, limit, signal);
    case 'coingecko':
      return fetchCoinGeckoCandles(symbol, timeframe, limit, signal);
    case 'proxy':
      return fetchProxyCandles(settings.dataProxyUrl ?? '', symbol, timeframe, limit, signal);
    default:
      throw new MarketDataError('Provider tidak dikenal.', 'no-provider');
  }
}

export interface LoadCandlesOptions {
  force?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * Cache-first candle load with provider fallback.
 *
 * On a network failure it returns the cached series rather than throwing, so
 * opening the app offline shows the last known structure instead of an empty
 * page. `fetchedAt` lets the UI say how stale that is.
 */
export async function loadCandles(
  instrumentId: string,
  timeframe: Timeframe,
  settings: AppSettings,
  io: MarketCacheIO,
  options: LoadCandlesOptions = {},
): Promise<CandleResult> {
  const instrument = findInstrument(instrumentId);
  if (!instrument) throw new MarketDataError(`Instrumen ${instrumentId} tidak dikenal.`, 'no-provider');

  const key = cacheKey(instrumentId, timeframe);
  const cached = await io.getCandles(key);
  const now = Date.now();

  if (!options.force && cached && now - cached.fetchedAt < CANDLE_TTL[timeframe]) {
    return {
      candles: fromRows(cached.rows),
      provider: cached.provider as ProviderId,
      proxied: cached.proxied,
      proxyNote: cached.proxyNote,
      fetchedAt: cached.fetchedAt,
    };
  }

  const capabilities = capabilitiesFor(instrumentId, Boolean(settings.dataProxyUrl));

  if (capabilities.length === 0) {
    if (cached) {
      return {
        candles: fromRows(cached.rows),
        provider: cached.provider as ProviderId,
        proxied: cached.proxied,
        proxyNote: cached.proxyNote,
        fetchedAt: cached.fetchedAt,
      };
    }
    throw new MarketDataError(
      `${instrument.label} belum punya sumber data. Isi data proxy di Settings untuk mengaktifkannya.`,
      'no-provider',
    );
  }

  const limit = options.limit ?? DEFAULT_CANDLE_LIMIT;
  let lastError: unknown;

  for (const capability of capabilities) {
    try {
      const candles = await fetchFromProvider(
        capability.provider,
        capability.symbol,
        timeframe,
        limit,
        settings,
        options.signal,
      );
      if (candles.length === 0) throw new MarketDataError('Provider mengembalikan nol candle.', 'upstream', capability.provider);

      await io.putCandles({
        id: key,
        instrumentId,
        timeframe,
        provider: capability.provider,
        proxied: Boolean(capability.proxied),
        proxyNote: capability.proxyNote,
        fetchedAt: now,
        rows: toRows(candles),
      });

      return {
        candles,
        provider: capability.provider,
        proxied: Boolean(capability.proxied),
        proxyNote: capability.proxyNote,
        fetchedAt: now,
      };
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
      lastError = error;
    }
  }

  // Every provider failed. Stale data beats a blank screen.
  if (cached) {
    return {
      candles: fromRows(cached.rows),
      provider: cached.provider as ProviderId,
      proxied: cached.proxied,
      proxyNote: cached.proxyNote,
      fetchedAt: cached.fetchedAt,
    };
  }
  throw lastError instanceof Error
    ? lastError
    : new MarketDataError(`Gagal memuat ${instrument.label}.`, 'network');
}

export { CANDLE_TTL };
