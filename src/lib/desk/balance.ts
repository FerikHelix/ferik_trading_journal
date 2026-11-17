import Decimal from 'decimal.js';
import type { Account, BalanceEvent, DecimalString } from '../domain/types';
import { firmDayKey, type FirmClock } from './day';

/**
 * The signed effect a balance row has on the account.
 *
 * Exports are inconsistent about sign: some carry a negative amount for a
 * withdrawal, some carry a positive amount and rely on the type. The type is the
 * authoritative field, so deposits and credits always add and withdrawals always
 * subtract. An 'other' row keeps its own sign, because we know nothing else.
 */
export function balanceDelta(event: BalanceEvent): Decimal {
  const amount = new Decimal(event.amount || 0);
  if (event.type === 'withdrawal') return amount.abs().neg();
  if (event.type === 'deposit' || event.type === 'credit') return amount.abs();
  return amount;
}

/**
 * Balance at the start of a firm day: the account's starting balance plus every
 * balance event that landed on an earlier firm day.
 *
 * Comparison is by day key rather than by timestamp because the day boundary is
 * defined by the clock, not by an instant we would have to invert a timezone to
 * find. Closed trades are deliberately excluded: the opening balance is the
 * baseline a day's percentage is measured against, so folding the day's own
 * result into it would make every percentage describe itself.
 *
 * Returns null when the account has no starting balance: a percentage computed
 * from an unknown baseline is a lie, not an estimate.
 */
export function openingBalanceForDay(
  account: Account,
  events: BalanceEvent[],
  firmDay: string,
  clock: FirmClock,
): DecimalString | null {
  if (account.startingBalance === undefined || account.startingBalance.trim() === '') return null;
  const total = events
    .filter((event) => event.accountId === account.id)
    .filter((event) => {
      try {
        return firmDayKey(event.occurredAt, clock) < firmDay;
      } catch {
        return false;
      }
    })
    .reduce((sum, event) => sum.plus(balanceDelta(event)), new Decimal(account.startingBalance));
  return total.toDecimalPlaces(8).toString();
}
