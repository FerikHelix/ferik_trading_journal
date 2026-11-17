import Decimal from 'decimal.js';
import type { Account, BalanceEvent, DecimalString, Position } from '../domain/types';
import { openingBalanceForDay } from './balance';
import { firmDayKey, type FirmClock } from './day';

/**
 * One trading day, as the calendar and the guardrails both need it.
 *
 * `openingBalance` and `resultPct` are null rather than zero when the account has
 * no starting balance: an unknown baseline must not read as "flat".
 */
export interface DaySummary {
  firmDay: string;
  tradeCount: number;
  lotVolume: DecimalString;
  realized: DecimalString;
  openingBalance: DecimalString | null;
  resultPct: number | null;
}

export function summarizeDays(
  positions: Position[],
  account: Account,
  clock: FirmClock,
  balanceEvents: BalanceEvent[] = [],
): DaySummary[] {
  const buckets = new Map<string, Position[]>();
  for (const position of positions) {
    if (position.accountId !== account.id) continue;
    if (position.status !== 'closed' || !position.closeAt) continue;
    const key = firmDayKey(position.closeAt, clock);
    buckets.set(key, [...(buckets.get(key) ?? []), position]);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([firmDay, rows]) => {
      const realized = rows.reduce((sum, row) => sum.plus(row.netProfit), new Decimal(0));
      const lotVolume = rows.reduce((sum, row) => sum.plus(row.volume), new Decimal(0));
      const openingBalance = openingBalanceForDay(account, balanceEvents, firmDay, clock);
      const base = openingBalance === null ? null : new Decimal(openingBalance);
      return {
        firmDay,
        tradeCount: rows.length,
        lotVolume: lotVolume.toDecimalPlaces(8).toString(),
        realized: realized.toDecimalPlaces(8).toString(),
        openingBalance,
        resultPct: base && base.gt(0) ? realized.div(base).times(100).toNumber() : null,
      };
    });
}

/** Positions inside one firm day, newest first, for a day drill-down. */
export function positionsForDay(
  positions: Position[],
  accountId: string,
  firmDay: string,
  clock: FirmClock,
): Position[] {
  return positions
    .filter((position) => position.accountId === accountId)
    .filter((position) => position.status === 'closed' && position.closeAt)
    .filter((position) => firmDayKey(position.closeAt!, clock) === firmDay)
    .sort((a, b) => (b.closeAt ?? '').localeCompare(a.closeAt ?? ''));
}
