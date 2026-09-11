import { calculateAnalytics, type AnalyticsMetrics } from '../analytics';
import type { Account, Journal, Position } from '../domain/types';

export interface WeekBounds { weekStart: string; weekEnd: string; }
export interface ValueCount { value: string; count: number; }
export interface WeeklyReviewData {
  bounds: WeekBounds;
  metrics: AnalyticsMetrics;
  positions: Position[];
  journalledPositions: number;
  unjournalledPositions: Position[];
  strategies: ValueCount[];
  emotions: ValueCount[];
  mistakes: ValueCount[];
  tags: ValueCount[];
  bestPosition?: Position;
  worstPosition?: Position;
}

function iso(value: Date) { return value.toISOString(); }

export function weekBounds(value = new Date()): WeekBounds {
  const start = new Date(value);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { weekStart: iso(start), weekEnd: iso(end) };
}

export function shiftWeek(weekStart: string, weeks: number): WeekBounds {
  const next = new Date(weekStart);
  next.setUTCDate(next.getUTCDate() + weeks * 7);
  return weekBounds(next);
}

export function isMeaningfulJournal(journal?: Journal): boolean {
  return Boolean(journal && (journal.strategy.trim() || journal.setup.trim() || journal.thesis.trim() || journal.emotion.trim() || journal.review.trim() || journal.mistakes.length || journal.tags.length));
}

function counts(values: string[]): ValueCount[] {
  const found = new Map<string, number>();
  values.map((value) => value.trim()).filter(Boolean).forEach((value) => found.set(value, (found.get(value) ?? 0) + 1));
  return [...found.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function calculateWeeklyReview(
  allPositions: Position[],
  accounts: Account[],
  journals: Journal[],
  accountId: string,
  bounds: WeekBounds,
): WeeklyReviewData {
  const positions = allPositions.filter((position) => position.accountId === accountId && position.status === 'closed' && Boolean(position.closeAt) && position.closeAt! >= bounds.weekStart && position.closeAt! <= bounds.weekEnd)
    .sort((a, b) => (a.closeAt ?? '').localeCompare(b.closeAt ?? ''));
  const metrics = calculateAnalytics(allPositions, accounts, journals, { accountIds: [accountId], from: bounds.weekStart, to: bounds.weekEnd }).metrics;
  const byPosition = new Map(journals.map((journal) => [journal.positionId, journal]));
  const journalled = positions.filter((position) => isMeaningfulJournal(byPosition.get(position.id)));
  const journalEntries = journalled.map((position) => byPosition.get(position.id)!);
  const profitOrder = [...positions].sort((a, b) => Number(b.netProfit) - Number(a.netProfit));
  return {
    bounds, metrics, positions, journalledPositions: journalled.length, unjournalledPositions: positions.filter((position) => !isMeaningfulJournal(byPosition.get(position.id))),
    strategies: counts(journalEntries.map((journal) => journal.strategy)), emotions: counts(journalEntries.map((journal) => journal.emotion)),
    mistakes: counts(journalEntries.flatMap((journal) => journal.mistakes)), tags: counts(journalEntries.flatMap((journal) => journal.tags)),
    bestPosition: profitOrder[0], worstPosition: profitOrder.at(-1),
  };
}
