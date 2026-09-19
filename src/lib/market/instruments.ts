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

/** Binance interval strings, keyed by our timeframe. */
export const BINANCE_INTERVAL: Record<Timeframe, string> = { M15: '15m', H1: '1h', H4: '4h' };

/** Twelve Data interval strings. `4h` is native, no client-side aggregation. */
export const TWELVEDATA_INTERVAL: Record<Timeframe, string> = { M15: '15min', H1: '1h', H4: '4h' };

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  M15: 15 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
};

/**
 * Where each instrument's candles can come from, best first.
 *
 * Reality check, all verified against live responses:
 *  - Binance's public mirror is keyless and CORS-open, but only carries crypto.
 *    PAXG/XAUT are tokenised gold and track spot closely enough for structure,
 *    though they trade through the weekend when real gold does not.
 *  - Twelve Data is CORS-open and covers every forex major on the free tier.
 *    Its free tier does NOT include commodities: XAG and WTI need a paid plan,
 *    and XAU is a trial symbol. Those entries are kept because they work the
 *    moment a user upgrades, and the UI degrades honestly when they 403.
 *  - 'proxy' is any user-supplied endpoint (e.g. their own Cloudflare Worker)
 *    that fronts a full-coverage feed. Configured in Settings, empty by default.
 */
export const PROVIDER_MAP: Record<string, ProviderCapability[]> = {
  EURUSD: [
    { provider: 'twelvedata', symbol: 'EUR/USD', requiresKey: true },
    { provider: 'binance', symbol: 'EURUSDT', proxied: true, proxyNote: 'EURUSDT (basis USDT ~20 pip dari spot)' },
  ],
  GBPUSD: [{ provider: 'twelvedata', symbol: 'GBP/USD', requiresKey: true }],
  USDJPY: [{ provider: 'twelvedata', symbol: 'USD/JPY', requiresKey: true }],
  USDCHF: [{ provider: 'twelvedata', symbol: 'USD/CHF', requiresKey: true }],
  AUDUSD: [{ provider: 'twelvedata', symbol: 'AUD/USD', requiresKey: true }],
  USDCAD: [{ provider: 'twelvedata', symbol: 'USD/CAD', requiresKey: true }],
  NZDUSD: [{ provider: 'twelvedata', symbol: 'NZD/USD', requiresKey: true }],
  XAUUSD: [
    { provider: 'twelvedata', symbol: 'XAU/USD', requiresKey: true },
    { provider: 'binance', symbol: 'PAXGUSDT', proxied: true, proxyNote: 'PAXG (emas tokenised, jalan 24/7 termasuk weekend)' },
  ],
  XAGUSD: [{ provider: 'twelvedata', symbol: 'XAG/USD', requiresKey: true }],
  WTIUSD: [{ provider: 'twelvedata', symbol: 'WTI/USD', requiresKey: true }],
  BTCUSD: [{ provider: 'binance', symbol: 'BTCUSDT' }],
};

/** Yahoo symbols, used only when a user has configured their own proxy. */
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

export function capabilitiesFor(instrumentId: string, hasKey: boolean, hasProxy: boolean): ProviderCapability[] {
  const options: ProviderCapability[] = [];
  if (hasProxy && PROXY_SYMBOL[instrumentId]) {
    options.push({ provider: 'proxy', symbol: PROXY_SYMBOL[instrumentId] });
  }
  for (const capability of PROVIDER_MAP[instrumentId] ?? []) {
    if (capability.requiresKey && !hasKey) continue;
    options.push(capability);
  }
  return options;
}
