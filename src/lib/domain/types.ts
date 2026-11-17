export type DecimalString = string;
export type TradeSide = 'buy' | 'sell';
export type DealEvent = 'entry' | 'exit' | 'balance' | 'unknown';
export type PositionStatus = 'closed' | 'open';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ImportSourceFormat = 'exness-csv' | 'mt5-xlsx' | 'mt5-csv';

/**
 * What a desk is being judged on. A personal desk is judged on P&L; a prop firm
 * desk is judged on how much of each limit is left. The kind is declared, never
 * inferred from a broker or a file format.
 */
export type DeskKind = 'personal' | 'propfirm';

export interface DetectedAccountMetadata {
  label: string;
  accountNumber: string;
  server: string;
  currency: string;
  sourceTimeZone: string;
}

export interface Account {
  id: string;
  label: string;
  accountNumber: string;
  platform: 'MT5';
  server: string;
  currency: string;
  sourceTimeZone: string;
  kind: DeskKind;
  /**
   * Balance in account currency when tracking began. Every percentage in the
   * product is derived from this plus the balance events that precede a day.
   * Absent means "unknown", and percentages report as unavailable — never 0%.
   */
  startingBalance?: DecimalString;
  /** Date `startingBalance` took effect, as YYYY-MM-DD. */
  openedAt?: string;
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
  sourceFormat?: ImportSourceFormat;
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

export interface ImportPreview extends ParsedImport {
  sourceFormat: ImportSourceFormat;
  sourceLabel: string;
  parserVersion: number;
  detectedAccount?: DetectedAccountMetadata;
}

/* ------------------------------------------------------------------ *
 * Prop firm desks
 * ------------------------------------------------------------------ */

export type TotalLossMode = 'static' | 'trailing';

/**
 * How much a reading can be trusted, given that exports only ever contain
 * closed trades. The label is part of the reading so it cannot drift in the UI.
 *
 * - exact:    fully determined by imported history
 * - estimate: closed-trade approximation of an equity-based measure
 * - attested: refined by a value the trader recorded
 */
export type ReadingConfidence = 'exact' | 'estimate' | 'attested';

export interface Reading {
  /** Amount consumed against the limit, in account currency. */
  value: DecimalString;
  /** The limit being measured against, in account currency. */
  limit: DecimalString;
  /** value / limit as a fraction. Null when the limit is zero or unset. */
  usedPct: number | null;
  confidence: ReadingConfidence;
}

export interface AttestedRule {
  id: string;
  text: string;
}

/** Caps the system can count against but cannot judge intent from. */
export interface SoftRuleCaps {
  tradesPerDay?: number;
  lotsPerDay?: number;
}

/**
 * A prop firm challenge plan.
 *
 * `markdown` is the source of truth the user and their AI edit; the flat fields
 * beside it are the parse of its machine block, denormalised so guardrail reads
 * never depend on re-parsing. Only the paste path writes both together.
 */
export interface Plan {
  id: string;
  accountId: string;
  firm: string;
  phase: string;
  startingBalance: DecimalString;
  /** Date the starting balance took effect, as YYYY-MM-DD. */
  effectiveFrom: string;
  /** Daily reset as HH:mm in `resetTimeZone`. Firms rarely reset at UTC midnight. */
  resetTime: string;
  resetTimeZone: string;
  maxDailyLossPct: number | null;
  maxTotalLossPct: number | null;
  totalLossMode: TotalLossMode;
  profitTargetPct: number | null;
  minTradingDays: number | null;
  consistencyPct: number | null;
  softCaps: SoftRuleCaps;
  attested: AttestedRule[];
  markdown: string;
  createdAt: string;
  updatedAt: string;
}

/** One trading day's attestations. Keyed by desk and firm day. */
export interface Session {
  id: string;
  accountId: string;
  /** Firm-day label from the plan clock, YYYY-MM-DD. */
  firmDay: string;
  /** The day's lowest equity, which a closed-trade export can never contain. */
  lowestEquity?: DecimalString;
  /** Ids of attested rules ticked for this day. */
  checklist: string[];
  note: string;
  updatedAt: string;
}

export type ComputedRuleKind = 'maxDailyLoss' | 'maxTotalLoss' | 'target' | 'minDays' | 'consistency';
export type SoftRuleMetric = 'tradesPerDay' | 'lotsPerDay';

/**
 * The rule wall is three different objects. Collapsing them into one checklist
 * is how a wall of ticks ends up pretending to be a risk system.
 */
export type Rule =
  | { tier: 'computed'; kind: ComputedRuleKind }
  | { tier: 'soft'; metric: SoftRuleMetric; cap: number }
  | { tier: 'attested'; id: string; text: string };
