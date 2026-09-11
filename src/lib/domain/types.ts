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
