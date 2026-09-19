import type { AppSettings, CachedCandles, CachedNews } from '../domain/types';
import { capabilitiesFor, findInstrument } from './instruments';
import { fetchAlphaVantageNews } from './providers/alphavantage';
import { fetchBinanceCandles } from './providers/binance';
import { fetchProxyCandles } from './providers/proxy';
import { fetchTwelveDataCandles } from './providers/twelvedata';
import { MarketDataError, type Candle, type CandleResult, type NewsItem, type ProviderId, type Timeframe } from './types';

/**
 * How stale a cached series may be before a refetch. Tuned against the tight
 * free-tier budgets (Twelve Data 800/day and 8/min, Alpha Vantage 25/day) —
 * the app is opened many times a day and must not burn the quota on reloads.
 */
const CANDLE_TTL: Record<Timeframe, number> = {
  M15: 5 * 60_000,
  H1: 15 * 60_000,
  H4: 30 * 60_000,
};

/** Alpha Vantage allows 25 calls a day; 6 hours leaves ample headroom. */
const NEWS_TTL = 6 * 60 * 60_000;

export const DEFAULT_CANDLE_LIMIT = 300;

export interface MarketCacheIO {
  getCandles: (id: string) => Promise<CachedCandles | undefined>;
  putCandles: (entry: CachedCandles) => Promise<void>;
  getNews: (limit?: number) => Promise<CachedNews[]>;
  putNews: (items: CachedNews[]) => Promise<void>;
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
    case 'binance':
      return fetchBinanceCandles(symbol, timeframe, limit, signal);
    case 'twelvedata':
      return fetchTwelveDataCandles(symbol, timeframe, limit, settings.twelveDataKey ?? '', signal);
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

  const capabilities = capabilitiesFor(
    instrumentId,
    Boolean(settings.twelveDataKey),
    Boolean(settings.dataProxyUrl),
  );

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
      `${instrument.label} tidak punya sumber data gratis dari browser. Isi API key Twelve Data atau data proxy di Settings.`,
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

export interface LoadNewsOptions {
  force?: boolean;
  signal?: AbortSignal;
}

export async function loadNews(
  settings: AppSettings,
  io: MarketCacheIO,
  options: LoadNewsOptions = {},
): Promise<{ items: NewsItem[]; fetchedAt: number | null; stale: boolean }> {
  const cached = await io.getNews(200);
  const newest = cached.reduce((max, item) => Math.max(max, item.fetchedAt), 0);
  const now = Date.now();
  const fresh = newest > 0 && now - newest < NEWS_TTL;

  const toItems = (rows: CachedNews[]): NewsItem[] =>
    rows.map(({ fetchedAt: _fetchedAt, ...item }) => item);

  if (!options.force && fresh) {
    return { items: toItems(cached), fetchedAt: newest, stale: false };
  }

  if (!settings.alphaVantageKey) {
    return { items: toItems(cached), fetchedAt: newest || null, stale: cached.length > 0 };
  }

  try {
    const items = await fetchAlphaVantageNews(settings.alphaVantageKey, options.signal);
    await io.putNews(items.map((item) => ({ ...item, fetchedAt: now })));
    return { items, fetchedAt: now, stale: false };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    // Quota exhaustion is the common case here, and yesterday's headlines are
    // still worth showing.
    if (cached.length > 0) return { items: toItems(cached), fetchedAt: newest, stale: true };
    throw error;
  }
}

export { CANDLE_TTL, NEWS_TTL };
