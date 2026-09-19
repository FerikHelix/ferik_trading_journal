import type { Instrument, ProviderCapability, Timeframe } from './types';

export const INSTRUMENTS: Instrument[] = [
  { id: 'EURUSD', label: 'EURUSD', name: 'Euro / US Dollar', assetClass: 'forex', digits: 5, drivers: ['EUR', 'USD'] },
  { id: 'GBPUSD', label: 'GBPUSD', name: 'British Pound / US Dollar', assetClass: 'forex', digits: 5, drivers: ['GBP', 'USD'] },
  { id: 'USDJPY', label: 'USDJPY', name: 'US Dollar / Japanese Yen', assetClass: 'forex', digits: 3, drivers: ['USD', 'JPY'] },
  { id: 'USDCHF', label: 'USDCHF', name: 'US Dollar / Swiss Franc', assetClass: 'forex', digits: 5, drivers: ['USD', 'CHF'] },
  { id: 'AUDUSD', label: 'AUDUSD', name: 'Australian Dollar / US Dollar', assetClass: 'forex', digits: 5, drivers: ['AUD', 'USD'] },
  { id: 'USDCAD', label: 'USDCAD', name: 'US Dollar / Canadian Dollar', assetClass: 'forex', digits: 5, drivers: ['USD', 'CAD'] },
  { id: 'NZDUSD', label: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', assetClass: 'forex', digits: 5, drivers: ['NZD', 'USD'] },
  { id: 'XAUUSD', label: 'XAUUSD', name: 'Emas spot', assetClass: 'metal', digits: 2, drivers: ['XAU', 'USD'] },
  { id: 'XAGUSD', label: 'XAGUSD', name: 'Perak spot', assetClass: 'metal', digits: 3, drivers: ['XAG', 'USD'] },
  { id: 'WTIUSD', label: 'WTIUSD', name: 'Minyak WTI', assetClass: 'energy', digits: 2, drivers: ['OIL', 'USD', 'CAD'] },
  { id: 'BTCUSD', label: 'BTCUSD', name: 'Bitcoin / US Dollar', assetClass: 'crypto', digits: 1, drivers: ['BTC', 'USD'] },
];

export function findInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}

export const BINANCE_INTERVAL: Record<Timeframe, string> = { M15: '15m', H1: '1h', H4: '4h' };

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  M15: 15 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
};

/**
 * Where each instrument's candles come from, best source first. No API keys
 * anywhere — everything here is either keyless or user-hosted.
 *
 * The shape of the problem, all verified against live responses:
 *
 *  - **Dukascopy** is the only free source carrying real silver, crude oil and
 *    every forex major, and it works from the browser. It has no CORS, so it
 *    is read over JSONP inside a sandboxed iframe. Fallbacks are listed where
 *    one exists because it is an undocumented widget backend with no uptime
 *    promise, not because it is normally unreachable.
 *  - **Binance / Gate.io** are keyless and CORS-open but carry only crypto.
 *    PAXG and XAUT are tokenised gold and track spot closely enough for
 *    structure, though they trade through the weekend when real gold does not.
 *  - **CoinGecko** is a last resort: it is the only keyless route to anything
 *    like silver (tokenised KAG), at 4h granularity with a ~0.5% tracking
 *    error and a harsh rate limit.
 *  - There is no fallback at all for crude oil, and GBPUSD returns no candles
 *    even though Dukascopy lists it. In both cases the UI says so rather than
 *    showing a wrong number.
 */
export const PROVIDER_MAP: Record<string, ProviderCapability[]> = {
  EURUSD: [
    { provider: 'dukascopy', symbol: 'EUR/USD' },
    { provider: 'binance', symbol: 'EURUSDT', proxied: true, proxyNote: 'EURUSDT di Binance (basis USDT, ~20 pip dari spot)' },
  ],
  // Known gap: Dukascopy lists this instrument but answers with no candles,
  // so GBPUSD is kept out of the default watchlist.
  GBPUSD: [{ provider: 'dukascopy', symbol: 'GBP/USD' }],
  USDJPY: [{ provider: 'dukascopy', symbol: 'USD/JPY' }],
  USDCHF: [{ provider: 'dukascopy', symbol: 'USD/CHF' }],
  AUDUSD: [{ provider: 'dukascopy', symbol: 'AUD/USD' }],
  USDCAD: [{ provider: 'dukascopy', symbol: 'USD/CAD' }],
  NZDUSD: [{ provider: 'dukascopy', symbol: 'NZD/USD' }],
  XAUUSD: [
    { provider: 'dukascopy', symbol: 'XAU/USD' },
    { provider: 'gateio', symbol: 'PAXG_USDT', proxied: true, proxyNote: 'PAXG (emas tokenised, jalan 24/7 termasuk akhir pekan)' },
    { provider: 'binance', symbol: 'PAXGUSDT', proxied: true, proxyNote: 'PAXG (emas tokenised, jalan 24/7 termasuk akhir pekan)' },
  ],
  XAGUSD: [
    { provider: 'dukascopy', symbol: 'XAG/USD' },
    { provider: 'coingecko', symbol: 'kinesis-silver', proxied: true, proxyNote: 'KAG (perak tokenised, hanya 4 jam-an, meleset ~0.5%)' },
  ],
  // WTI = `E_Light`, Brent = `E_Brent`. The `LIGHT.CMD/USD` form that appears
  // in Dukascopy's file names is NOT a valid API instrument key.
  WTIUSD: [{ provider: 'dukascopy', symbol: 'E_Light' }],
  BTCUSD: [
    { provider: 'binance', symbol: 'BTCUSDT' },
    { provider: 'gateio', symbol: 'BTC_USDT' },
    { provider: 'dukascopy', symbol: 'BTC/USD' },
  ],
};

/** Yahoo symbols, used only when the user has configured their own proxy. */
export const PROXY_SYMBOL: Record<string, string> = {
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  // Yahoo quotes these USD-first, so the symbol is the quote currency alone.
  USDJPY: 'JPY=X',
  USDCHF: 'CHF=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'CAD=X',
  NZDUSD: 'NZDUSD=X',
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  WTIUSD: 'CL=F',
  BTCUSD: 'BTC-USD',
};

export function capabilitiesFor(instrumentId: string, hasProxy: boolean): ProviderCapability[] {
  const options: ProviderCapability[] = [];
  // A user-hosted proxy is the most reliable source when one is configured,
  // so it goes first.
  if (hasProxy && PROXY_SYMBOL[instrumentId]) {
    options.push({ provider: 'proxy', symbol: PROXY_SYMBOL[instrumentId] });
  }
  options.push(...(PROVIDER_MAP[instrumentId] ?? []));
  return options;
}
