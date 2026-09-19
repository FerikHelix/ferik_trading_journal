export type DecimalString = string;
export type TradeSide = 'buy' | 'sell';
export type DealEvent = 'entry' | 'exit' | 'balance' | 'unknown';
export type PositionStatus = 'closed' | 'open';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Account {
  id: string;
  label: string;
  accountNumber: string;
  platform: 'MT5';
  server: string;
  currency: string;
  sourceTimeZone: string;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  accountId: string;
  fileName: string;
  fileHash: string;
  importedAt: string;
  inserted: number;
  duplicates: number;
  failed: number;
  parserVersion: number;
}

export interface Deal {
  id: string;
  accountId: string;
  ticketId: string;
  orderId: string;
  positionId: string;
  symbol: string;
  side: TradeSide;
  event: DealEvent;
  volume: DecimalString;
  price: DecimalString;
  occurredAt: string;
  sourceTime: string;
  profit: DecimalString;
  commission: DecimalString;
  swap: DecimalString;
  stopLoss?: DecimalString;
  takeProfit?: DecimalString;
  sourceRow: number;
  importBatchId?: string;
  /** Present when Exness exports a closed order as one row rather than separate deals. */
  embeddedOpenAt?: string;
  embeddedOpenPrice?: DecimalString;
}

export interface Position {
  id: string;
  accountId: string;
  positionId: string;
  symbol: string;
  side: TradeSide;
  openAt: string;
  closeAt?: string;
  averageOpenPrice: DecimalString;
  averageClosePrice: DecimalString;
  volume: DecimalString;
  grossProfit: DecimalString;
  commission: DecimalString;
  swap: DecimalString;
  netProfit: DecimalString;
  stopLoss?: DecimalString;
  takeProfit?: DecimalString;
  status: PositionStatus;
  dealIds: string[];
  groupingFallback?: boolean;
}

export interface Journal {
  id: string;
  positionId: string;
  strategy: string;
  setup: string;
  thesis: string;
  emotion: string;
  mistakes: string[];
  tags: string[];
  executionRating?: number;
  riskAmount?: DecimalString;
  plannedRiskReward?: DecimalString;
  review: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyReview {
  id: string;
  accountId: string;
  weekStart: string;
  weekEnd: string;
  wentWell: string;
  toImprove: string;
  lesson: string;
  nextWeekFocus: string;
  createdAt: string;
  updatedAt: string;
}

export interface BalanceEvent {
  id: string;
  accountId: string;
  ticketId: string;
  type: 'deposit' | 'withdrawal' | 'credit' | 'other';
  amount: DecimalString;
  occurredAt: string;
  comment: string;
  importBatchId?: string;
}

export interface AppSettings {
  id: 'app';
  schemaVersion: number;
  displayTimeZone: string;
  theme: ThemePreference;
  currencyDisplay: 'account';
  /**
   * Market data credentials and preferences. All optional so that settings
   * rows written before schema v3 keep validating.
   *
   * The two API keys are deliberately REDACTED from exported backups
   * (see dataClient.loadSnapshot) — a plain .ftj.json is not an appropriate
   * place for credentials, even low-value free-tier ones.
   */
  twelveDataKey?: string;
  alphaVantageKey?: string;
  /** User-hosted CORS proxy, e.g. a Cloudflare Worker fronting Yahoo. */
  dataProxyUrl?: string;
  /** Instrument ids shown on Fundamental and scanned for signals. */
  watchlist?: string[];
  signalTimeframe?: MarketTimeframe;
  /** Whether the browser Notification API may be used for signal alerts. */
  desktopNotifications?: boolean;
}

/** Mirrors lib/market Timeframe without importing it (keeps domain leaf-level). */
export type MarketTimeframe = 'M15' | 'H1' | 'H4';

export interface SignalAlert {
  id: string;
  instrumentId: string;
  timeframe: MarketTimeframe;
  direction: 'bullish' | 'bearish';
  status: 'approaching' | 'touched';
  /** Zone bounds at the moment the alert fired. */
  top: number;
  bottom: number;
  price: number;
  createdAt: string;
  seenAt?: string;
}

export interface CachedCandles {
  /** `${instrumentId}:${timeframe}` */
  id: string;
  instrumentId: string;
  timeframe: MarketTimeframe;
  provider: string;
  proxied: boolean;
  proxyNote?: string;
  fetchedAt: number;
  /** Stored as [t,o,h,l,c] tuples — object-per-candle roughly triples the size. */
  rows: number[][];
}

export interface CachedNews {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  sentiment?: number;
  tags: string[];
  fetchedAt: number;
}

export interface ImportIssue {
  row: number;
  message: string;
  severity: 'warning' | 'error';
}

export interface ParsedImport {
  deals: Deal[];
  balanceEvents: BalanceEvent[];
  skipped: number;
  issues: ImportIssue[];
  preview: Record<string, string>[];
  fileHash: string;
}
