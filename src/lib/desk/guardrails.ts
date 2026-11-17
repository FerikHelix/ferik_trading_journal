import Decimal from 'decimal.js';
import type {
  Account, BalanceEvent, DecimalString, Plan, Position, Reading, ReadingConfidence, Session, TotalLossMode,
} from '../domain/types';
import { balanceDelta } from './balance';
import { firmDayKey, type FirmClock } from './day';
import { summarizeDays, type DaySummary } from './days';

/**
 * Guardrails measure a plan against imported history.
 *
 * The single most important thing in this file is honesty about confidence. A
 * closed-trade export cannot see an intrabar equity low, and a daily loss limit is
 * enforced on equity. So every reading says whether it is exact, an estimate, or
 * backed by a number the trader recorded.
 */

/** Limits are fixed money amounts derived from the challenge's starting balance. */
export function limitAmount(startingBalance: DecimalString, percent: number): Decimal {
  return new Decimal(startingBalance).times(percent).div(100);
}

const reading = (value: Decimal, limit: Decimal, confidence: ReadingConfidence): Reading => ({
  value: Decimal.max(0, value).toDecimalPlaces(8).toString(),
  limit: limit.toDecimalPlaces(8).toString(),
  usedPct: limit.gt(0) ? Decimal.max(0, value).div(limit).toNumber() : null,
  confidence,
});

export interface DailyLoss extends Reading {
  firmDay: string;
  /** True when a recorded low equity, not a closed result, set the value. */
  fromAttestation: boolean;
}

/**
 * Loss consumed on one firm day.
 *
 * Without a recorded low this is the realized loss only, which understates an
 * intraday dip — hence `estimate`. Recording the day's lowest equity promotes it
 * to `attested`.
 */
export function dailyLossReading(
  plan: Plan,
  day: DaySummary,
  session?: Pick<Session, 'lowestEquity'>,
): DailyLoss | null {
  if (plan.maxDailyLossPct === null) return null;
  const limit = limitAmount(plan.startingBalance, plan.maxDailyLossPct);
  const realizedLoss = Decimal.max(0, new Decimal(day.realized).neg());

  let loss = realizedLoss;
  let confidence: ReadingConfidence = 'estimate';
  let fromAttestation = false;
  if (session?.lowestEquity !== undefined && day.openingBalance !== null) {
    const floatLoss = new Decimal(day.openingBalance).minus(session.lowestEquity);
    if (floatLoss.gt(loss)) {
      loss = floatLoss;
      fromAttestation = true;
    }
    // Even when the realized loss was worse, the day now has an equity floor we
    // did not have before, so its reading is no longer a pure estimate.
    confidence = 'attested';
  }

  return { ...reading(loss, limit, confidence), firmDay: day.firmDay, fromAttestation };
}

export interface BalancePoint {
  firmDay: string;
  balance: DecimalString;
  peak: DecimalString;
}

/**
 * Running balance and its high-water mark, day by day.
 *
 * Peak is a balance peak, not an equity peak. It is the best a closed-trade export
 * allows, which is exactly why trailing drawdown is reported as an estimate.
 */
export function balanceSeries(
  plan: Plan,
  days: DaySummary[],
  balanceEvents: BalanceEvent[],
  accountId: string,
  clock: FirmClock,
): BalancePoint[] {
  const eventsByDay = new Map<string, Decimal>();
  for (const event of balanceEvents) {
    if (event.accountId !== accountId) continue;
    const key = firmDayKey(event.occurredAt, clock);
    eventsByDay.set(key, (eventsByDay.get(key) ?? new Decimal(0)).plus(balanceDelta(event)));
  }
  const realizedByDay = new Map(days.map((day) => [day.firmDay, new Decimal(day.realized)]));
  const keys = [...new Set([...realizedByDay.keys(), ...eventsByDay.keys()])].sort();

  let balance = new Decimal(plan.startingBalance);
  let peak = balance;
  const points: BalancePoint[] = [];
  for (const key of keys) {
    balance = balance.plus(eventsByDay.get(key) ?? 0).plus(realizedByDay.get(key) ?? 0);
    peak = Decimal.max(peak, balance);
    points.push({
      firmDay: key,
      balance: balance.toDecimalPlaces(8).toString(),
      peak: peak.toDecimalPlaces(8).toString(),
    });
  }
  return points;
}

export interface TotalLoss extends Reading {
  floor: DecimalString;
  mode: TotalLossMode;
  /** Balance the floor was measured from: fixed start, or the running peak. */
  base: DecimalString;
}

/**
 * Distance to the total loss floor.
 *
 * Static floors never move. Trailing floors ride the balance high-water mark, and
 * are labelled `estimate` because the firm trails equity, which the export cannot
 * see.
 */
export function totalLossReading(
  plan: Plan,
  days: DaySummary[],
  balanceEvents: BalanceEvent[],
  accountId: string,
  clock: FirmClock,
): TotalLoss | null {
  if (plan.maxTotalLossPct === null) return null;
  const limit = limitAmount(plan.startingBalance, plan.maxTotalLossPct);
  const points = balanceSeries(plan, days, balanceEvents, accountId, clock);
  const current = points.length ? new Decimal(points.at(-1)!.balance) : new Decimal(plan.startingBalance);
  const base = plan.totalLossMode === 'trailing' && points.length
    ? new Decimal(points.at(-1)!.peak)
    : new Decimal(plan.startingBalance);
  const consumed = Decimal.max(0, base.minus(current));
  return {
    ...reading(consumed, limit, plan.totalLossMode === 'trailing' ? 'estimate' : 'exact'),
    floor: base.minus(limit).toDecimalPlaces(8).toString(),
    mode: plan.totalLossMode,
    base: base.toDecimalPlaces(8).toString(),
  };
}

export interface TargetProgress extends Reading {
  realized: DecimalString;
}

export function targetProgress(plan: Plan, days: DaySummary[]): TargetProgress | null {
  if (plan.profitTargetPct === null) return null;
  const limit = limitAmount(plan.startingBalance, plan.profitTargetPct);
  const realized = days.reduce((sum, day) => sum.plus(day.realized), new Decimal(0));
  return { ...reading(Decimal.max(0, realized), limit, 'exact'), realized: realized.toDecimalPlaces(8).toString() };
}

export interface MinDaysProgress {
  met: number;
  required: number;
  complete: boolean;
}

export function minDaysProgress(plan: Plan, days: DaySummary[]): MinDaysProgress | null {
  if (plan.minTradingDays === null) return null;
  const met = days.filter((day) => day.tradeCount > 0).length;
  return { met, required: plan.minTradingDays, complete: met >= plan.minTradingDays };
}

export interface ConsistencyReport {
  share: number;
  cap: number;
  /** The day contributing the largest share of total profit. */
  day: string;
  exceeded: boolean;
}

/**
 * Consistency: no single day may supply too much of the total profit.
 *
 * Undefined while the desk is not in profit, because a share of zero or a
 * negative total is not meaningful.
 */
export function consistencyReport(plan: Plan, days: DaySummary[]): ConsistencyReport | null {
  if (plan.consistencyPct === null) return null;
  const total = days.reduce((sum, day) => sum.plus(day.realized), new Decimal(0));
  if (total.lte(0)) return null;
  const best = days.reduce(
    (winner, day) => (new Decimal(day.realized).gt(new Decimal(winner.realized)) ? day : winner),
    days[0],
  );
  const share = new Decimal(best.realized).div(total).toNumber();
  return { share, cap: plan.consistencyPct / 100, day: best.firmDay, exceeded: share > plan.consistencyPct / 100 };
}

export type BreachReason = 'maxDailyLoss' | 'maxTotalLoss';

export interface Breach {
  reason: BreachReason;
  firmDay?: string;
}

export type DeskStatus = 'safe' | 'warning' | 'breach';

export interface DeskEvaluation {
  clock: FirmClock;
  days: DaySummary[];
  daily: DailyLoss[];
  total: TotalLoss | null;
  target: TargetProgress | null;
  minDays: MinDaysProgress | null;
  consistency: ConsistencyReport | null;
  breaches: Breach[];
  status: DeskStatus;
}

const WATCH_SHARE = 0.8;

/**
 * The whole desk in one pass.
 *
 * A breach never removes or hides anything: the days that produced it stay in the
 * result so the trader can see what happened.
 */
export function evaluateDesk(input: {
  account: Account;
  plan: Plan;
  positions: Position[];
  balanceEvents?: BalanceEvent[];
  sessions?: Session[];
  clock: FirmClock;
}): DeskEvaluation {
  const { account, plan, positions, clock } = input;
  const balanceEvents = input.balanceEvents ?? [];
  const sessions = input.sessions ?? [];

  const days = summarizeDays(positions, account, clock, balanceEvents);
  const daily = days
    .map((day) => dailyLossReading(plan, day, sessions.find((session) => session.firmDay === day.firmDay)))
    .filter((item): item is DailyLoss => item !== null);
  const total = totalLossReading(plan, days, balanceEvents, account.id, clock);
  const target = targetProgress(plan, days);
  const minDays = minDaysProgress(plan, days);
  const consistency = consistencyReport(plan, days);

  const breaches: Breach[] = daily
    .filter((item) => item.usedPct !== null && item.usedPct >= 1)
    .map((item) => ({ reason: 'maxDailyLoss' as const, firmDay: item.firmDay }));
  if (total && total.usedPct !== null && total.usedPct >= 1) {
    breaches.push({ reason: 'maxTotalLoss' });
  }

  const nearLimit = [...daily.map((item) => item.usedPct), total?.usedPct ?? 0]
    .some((used) => used !== null && used >= WATCH_SHARE);

  return {
    clock,
    days,
    daily,
    total,
    target,
    minDays,
    consistency,
    breaches,
    status: breaches.length ? 'breach' : nearLimit ? 'warning' : 'safe',
  };
}
