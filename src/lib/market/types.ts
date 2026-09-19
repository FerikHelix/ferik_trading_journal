/**
 * Market data types.
 *
 * NOTE on numbers: account money elsewhere in this app is DecimalString,
 * because cent-level rounding errors there are real bugs. Market prices are
 * different — they are analysis inputs, never summed into a balance, and every
 * upstream feed hands them to us as IEEE doubles anyway. Using `number` here
 * keeps the SMC maths readable and avoids a pointless string/Decimal round
 * trip on every candle. Do not carry these into Position/Journal fields.
 */

export type Timeframe = 'M15' | 'H1' | 'H4';

export const TIMEFRAMES: Timeframe[] = ['M15', 'H1', 'H4'];

export type AssetClass = 'forex' | 'metal' | 'energy' | 'crypto';

export interface Candle {
  /** Open time, epoch milliseconds, UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface Instrument {
  /** Stable internal id, also the Dexie key prefix. */
  id: string;
  /** What the user sees, e.g. 'XAUUSD'. */
  label: string;
  name: string;
  assetClass: AssetClass;
  /** Decimal places for display. */
  digits: number;
  /** Currencies whose news/events move this instrument, strongest first. */
  drivers: string[];
}

export type ProviderId = 'binance' | 'twelvedata' | 'proxy';

export interface CandleRequest {
  instrument: Instrument;
  timeframe: Timeframe;
  limit: number;
}

export interface CandleResult {
  candles: Candle[];
  provider: ProviderId;
  /** True when the series is a stand-in (e.g. PAXG standing in for spot gold). */
  proxied: boolean;
  proxyNote?: string;
  fetchedAt: number;
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  /** -1..1 when the provider scores it, otherwise undefined. */
  sentiment?: number;
  /** Currency / instrument codes this headline was tagged with. */
  tags: string[];
}

export type BiasDirection = 'bullish' | 'bearish' | 'neutral';

export interface InstrumentBias {
  instrumentId: string;
  direction: BiasDirection;
  /** 0..1, how strongly the inputs agree. */
  confidence: number;
  /** Human-readable reasons, shown verbatim in the UI. */
  reasons: string[];
  updatedAt: string;
}

export interface Quote {
  instrumentId: string;
  price: number;
  changePercent: number;
  at: number;
}

export interface ProviderCapability {
  provider: ProviderId;
  /** Provider-native symbol. */
  symbol: string;
  proxied?: boolean;
  proxyNote?: string;
  requiresKey?: boolean;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-provider' | 'no-key' | 'rate-limit' | 'network' | 'upstream',
    readonly provider?: ProviderId,
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}
