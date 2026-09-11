import Decimal from 'decimal.js';
import type { Account, Journal, Position, TradeSide } from '../domain/types';

export type TradeOutcome = 'win' | 'loss' | 'breakeven';

export interface AnalyticsFilters {
  accountIds?: string[];
  currency?: string;
  from?: string;
  to?: string;
}

export interface AnalyticsMetrics {
  totalPositions: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netProfit: string | null;
  averageWin: string | null;
  averageLoss: string | null;
  profitFactor: string | null;
  expectancy: string | null;
  averageRealizedR: string | null;
  currentStreak: number;
  longestWinningStreak: number;
  longestLosingStreak: number;
  maximumDrawdown: string | null;
  currency: string | null;
  requiresCurrencySelection: boolean;
}

export interface SeriesPoint {
  key: string;
  label: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  netProfit: string | null;
}

export interface EquityPoint {
  positionId: string;
  at: string;
  netProfit: string;
  cumulativeProfit: string;
}

export interface AnalyticsResult {
  metrics: AnalyticsMetrics;
  cumulativeProfit: EquityPoint[];
  monthly: SeriesPoint[];
  pnlByPeriod: SeriesPoint[];
  pnlGranularity: 'day' | 'month';
  bySymbol: SeriesPoint[];
  byStrategy: SeriesPoint[];
  bySession: SeriesPoint[];
  byWeekday: SeriesPoint[];
  byHour: SeriesPoint[];
  bySide: SeriesPoint[];
}

const decimal = (value?: string) => new Decimal(value || 0);
const normalized = (value: Decimal) => value.toDecimalPlaces(8).toString();

export function outcomeOf(position: Position): TradeOutcome {
  const net = decimal(position.netProfit);
  return net.gt(0) ? 'win' : net.lt(0) ? 'loss' : 'breakeven';
}

function resolvedCurrency(positions: Position[], accounts: Account[], requested?: string) {
  const accountCurrency = new Map(accounts.map((account) => [account.id, account.currency]));
  const available = [...new Set(positions.map((position) => accountCurrency.get(position.accountId)).filter(Boolean))] as string[];
  if (requested) return available.includes(requested) ? requested : null;
  return available.length === 1 ? available[0] : null;
}

function selectedPositions(positions: Position[], accounts: Account[], filters: AnalyticsFilters) {
  const accountCurrency = new Map(accounts.map((account) => [account.id, account.currency]));
  const ids = filters.accountIds ? new Set(filters.accountIds) : null;
  return positions.filter((position) => {
    if (position.status !== 'closed' || !position.closeAt) return false;
    if (ids && !ids.has(position.accountId)) return false;
    if (filters.currency && accountCurrency.get(position.accountId) !== filters.currency) return false;
    if (filters.from && position.closeAt < filters.from) return false;
    if (filters.to && position.closeAt > filters.to) return false;
    return true;
  }).sort((a, b) => (a.closeAt ?? '').localeCompare(b.closeAt ?? '') || a.id.localeCompare(b.id));
}

function group(
  positions: Position[],
  currencyAvailable: boolean,
  keyFor: (position: Position) => string,
  labelFor: (key: string) => string = (key) => key,
): SeriesPoint[] {
  const buckets = new Map<string, Position[]>();
  for (const position of positions) {
    const key = keyFor(position) || 'Belum diisi';
    buckets.set(key, [...(buckets.get(key) ?? []), position]);
  }
  return [...buckets.entries()].map(([key, rows]) => ({
    key,
    label: labelFor(key),
    count: rows.length,
    wins: rows.filter((row) => outcomeOf(row) === 'win').length,
    losses: rows.filter((row) => outcomeOf(row) === 'loss').length,
    breakeven: rows.filter((row) => outcomeOf(row) === 'breakeven').length,
    winRate: (() => {
      const wins = rows.filter((row) => outcomeOf(row) === 'win').length;
      const losses = rows.filter((row) => outcomeOf(row) === 'loss').length;
      return wins + losses ? wins / (wins + losses) : null;
    })(),
    netProfit: currencyAvailable ? normalized(rows.reduce((sum, row) => sum.plus(row.netProfit), new Decimal(0))) : null,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function periodGranularity(positions: Position[]) {
  if (positions.length < 2) return 'day' as const;
  const first = new Date(positions[0].closeAt!).getTime();
  const last = new Date(positions.at(-1)!.closeAt!).getTime();
  return last - first <= 1000 * 60 * 60 * 24 * 92 ? 'day' as const : 'month' as const;
}

function sessionFor(timestamp: string) {
  const hour = new Date(timestamp).getUTCHours();
  if (hour < 7) return 'Asia';
  if (hour < 12) return 'London';
  if (hour < 16) return 'Overlap';
  if (hour < 21) return 'New York';
  return 'Di luar sesi';
}

/** All time-based groupings intentionally use UTC so results stay stable across devices. */
export function calculateAnalytics(
  allPositions: Position[],
  accounts: Account[],
  journals: Journal[] = [],
  filters: AnalyticsFilters = {},
): AnalyticsResult {
  const filtered = selectedPositions(allPositions, accounts, filters);
  const currency = resolvedCurrency(filtered, accounts, filters.currency);
  const monetary = currency !== null || filtered.length === 0;
  const positions = currency && !filters.currency
    ? filtered.filter((position) => accounts.find((account) => account.id === position.accountId)?.currency === currency)
    : filtered;
  const journalByPosition = new Map(journals.map((journal) => [journal.positionId, journal]));
  const wins = positions.filter((position) => outcomeOf(position) === 'win');
  const losses = positions.filter((position) => outcomeOf(position) === 'loss');
  const breakeven = positions.length - wins.length - losses.length;
  const decided = wins.length + losses.length;
  const grossWins = wins.reduce((sum, row) => sum.plus(row.netProfit), new Decimal(0));
  const grossLosses = losses.reduce((sum, row) => sum.plus(decimal(row.netProfit).abs()), new Decimal(0));
  const net = positions.reduce((sum, row) => sum.plus(row.netProfit), new Decimal(0));

  let peak = new Decimal(0);
  let cumulative = new Decimal(0);
  let maxDrawdown = new Decimal(0);
  const cumulativeProfit = monetary ? positions.map((position) => {
    cumulative = cumulative.plus(position.netProfit);
    peak = Decimal.max(peak, cumulative);
    maxDrawdown = Decimal.max(maxDrawdown, peak.minus(cumulative));
    return { positionId: position.id, at: position.closeAt!, netProfit: normalized(decimal(position.netProfit)), cumulativeProfit: normalized(cumulative) };
  }) : [];

  let currentStreak = 0;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;
  for (const position of positions) {
    const outcome = outcomeOf(position);
    if (outcome === 'breakeven') currentStreak = 0;
    else if (outcome === 'win') currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
    else currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
    longestWinningStreak = Math.max(longestWinningStreak, currentStreak);
    longestLosingStreak = Math.max(longestLosingStreak, -currentStreak);
  }

  const realizedR = positions.flatMap((position) => {
    const risk = journalByPosition.get(position.id)?.riskAmount;
    return risk && decimal(risk).gt(0) ? [decimal(position.netProfit).div(risk)] : [];
  });
  const resultMetrics: AnalyticsMetrics = {
    totalPositions: positions.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRate: decided ? wins.length / decided : null,
    netProfit: monetary ? normalized(net) : null,
    averageWin: monetary && wins.length ? normalized(grossWins.div(wins.length)) : null,
    averageLoss: monetary && losses.length ? normalized(grossLosses.div(losses.length).neg()) : null,
    profitFactor: monetary && grossLosses.gt(0) ? normalized(grossWins.div(grossLosses)) : null,
    expectancy: monetary && positions.length ? normalized(net.div(positions.length)) : null,
    averageRealizedR: realizedR.length ? normalized(realizedR.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(realizedR.length)) : null,
    currentStreak,
    longestWinningStreak,
    longestLosingStreak,
    maximumDrawdown: monetary ? normalized(maxDrawdown) : null,
    currency,
    requiresCurrencySelection: !monetary,
  };

  const keyDate = (position: Position) => new Date(position.closeAt!);
  const pnlGranularity = periodGranularity(positions);
  const pnlByPeriod = group(positions, monetary, (position) => position.closeAt!.slice(0, pnlGranularity === 'day' ? 10 : 7));
  return {
    metrics: resultMetrics,
    cumulativeProfit,
    monthly: group(positions, monetary, (p) => p.closeAt!.slice(0, 7)),
    pnlByPeriod,
    pnlGranularity,
    bySymbol: group(positions, monetary, (p) => p.symbol),
    byStrategy: group(positions, monetary, (p) => journalByPosition.get(p.id)?.strategy ?? ''),
    bySession: group(positions, monetary, (p) => sessionFor(p.closeAt!)),
    byWeekday: group(positions, monetary, (p) => String(keyDate(p).getUTCDay()), (key) => ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][Number(key)]),
    byHour: group(positions, monetary, (p) => String(keyDate(p).getUTCHours()).padStart(2, '0'), (key) => `${key}:00 UTC`),
    bySide: group(positions, monetary, (p) => p.side, (key) => key === ('buy' satisfies TradeSide) ? 'Buy' : 'Sell'),
  };
}

export { cumulativeChart, outcomeChart, performanceBarChart } from './charts';
