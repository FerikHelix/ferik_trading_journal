import { describe, expect, it } from 'vitest';
import { deskClock } from '../../src/lib/desk/clock';
import {
  consistencyReport, dailyLossReading, evaluateDesk, limitAmount, minDaysProgress, targetProgress, totalLossReading,
} from '../../src/lib/desk/guardrails';
import { summarizeDays } from '../../src/lib/desk/days';
import type { Account, Plan, Position } from '../../src/lib/domain/types';

const account: Account = {
  id: 'a', label: 'FTMO', accountNumber: '1', platform: 'MT5', server: 'FTMO-Server',
  currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm',
  startingBalance: '100000', openedAt: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z',
};

const plan: Plan = {
  id: 'p', accountId: 'a', firm: 'FTMO', phase: 'Phase 1',
  startingBalance: '100000', effectiveFrom: '2026-11-01',
  resetTime: '00:00', resetTimeZone: 'Europe/Prague',
  maxDailyLossPct: 5, maxTotalLossPct: 10, totalLossMode: 'static',
  profitTargetPct: 10, minTradingDays: 4, consistencyPct: 30,
  softCaps: {}, attested: [], markdown: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

const clock = deskClock(account, plan, 'UTC');

const trade = (value: { id: string; closeAt: string; netProfit: string; volume?: string }): Position => ({
  id: value.id, accountId: 'a', positionId: value.id, symbol: 'EURUSD', side: 'buy',
  openAt: value.closeAt, closeAt: value.closeAt, averageOpenPrice: '1', averageClosePrice: '1',
  volume: value.volume ?? '1', grossProfit: value.netProfit, commission: '0', swap: '0',
  netProfit: value.netProfit, status: 'closed', dealIds: [],
});

const day = (firmDay: string, realized: string, tradeCount = 1) =>
  ({ firmDay, realized, tradeCount, lotVolume: String(tradeCount), openingBalance: '100000', resultPct: Number(realized) / 1000 });

describe('daily loss', () => {
  it('reports the used share of the limit', () => {
    expect(limitAmount('100000', 5).toString()).toBe('5000');
    const reading = dailyLossReading(plan, day('2026-11-17', '-1000'));
    expect(reading).toMatchObject({ value: '1000', limit: '5000', confidence: 'estimate' });
    expect(reading?.usedPct).toBeCloseTo(0.2, 10);
  });

  it('reports a day that exceeds the limit', () => {
    const reading = dailyLossReading(plan, day('2026-11-17', '-6000'));
    expect(reading?.usedPct).toBeCloseTo(1.2, 10);
  });

  it('treats a profitable day as zero used', () => {
    expect(dailyLossReading(plan, day('2026-11-17', '2000'))?.value).toBe('0');
  });

  it('is absent when the plan sets no daily limit', () => {
    expect(dailyLossReading({ ...plan, maxDailyLossPct: null }, day('2026-11-17', '-1000'))).toBeNull();
  });
});

describe('total loss floor', () => {
  const events: never[] = [];
  const dropTo = (realized: string) => summarizeDays([trade({ id: 't', closeAt: '2026-11-17T12:00:00Z', netProfit: realized })], account, clock);

  it('keeps a static floor fixed no matter what the balance does', () => {
    const gain = totalLossReading(plan, dropTo('4000'), events, 'a', clock);
    const loss = totalLossReading(plan, dropTo('-6000'), events, 'a', clock);
    expect(gain).toMatchObject({ floor: '90000', base: '100000', mode: 'static', confidence: 'exact' });
    expect(loss).toMatchObject({ floor: '90000', base: '100000', mode: 'static', confidence: 'exact' });
    expect(loss?.value).toBe('6000');
  });

  it('raises a trailing floor with the balance peak and labels it an estimate', () => {
    const trailing: Plan = { ...plan, totalLossMode: 'trailing' };
    const gain = totalLossReading(trailing, dropTo('4000'), events, 'a', clock);
    expect(gain).toMatchObject({ floor: '94000', base: '104000', confidence: 'estimate' });
    expect(gain?.usedPct).toBe(0);

    const afterFall = totalLossReading(
      trailing,
      summarizeDays([
        trade({ id: 'up', closeAt: '2026-11-17T12:00:00Z', netProfit: '4000' }),
        trade({ id: 'down', closeAt: '2026-11-18T12:00:00Z', netProfit: '-6000' }),
      ], account, clock),
      events, 'a', clock,
    );
    expect(afterFall).toMatchObject({ base: '104000', floor: '94000' });
    expect(afterFall?.value).toBe('6000');
  });

  it('is absent when the plan sets no total limit', () => {
    expect(totalLossReading({ ...plan, maxTotalLossPct: null }, [], [], 'a', clock)).toBeNull();
  });
});

describe('confidence labels', () => {
  it('marks a day without a recorded low as an estimate and with one as attested', () => {
    const unrecorded = dailyLossReading(plan, day('2026-11-17', '-1000'));
    expect(unrecorded?.confidence).toBe('estimate');

    const recorded = dailyLossReading(plan, day('2026-11-17', '-1000'), { lowestEquity: '97500' });
    expect(recorded?.confidence).toBe('attested');
    expect(recorded?.value).toBe('2500');
    expect(recorded?.usedPct).toBeCloseTo(0.5, 10);
  });

  it('keeps the realized loss when it is worse than the recorded low', () => {
    const reading = dailyLossReading(plan, day('2026-11-17', '-3000'), { lowestEquity: '99000' });
    expect(reading?.value).toBe('3000');
    expect(reading?.fromAttestation).toBe(false);
    expect(reading?.confidence).toBe('attested');
  });
});

describe('lowest equity attestation', () => {
  it('recomputes the day from the low it recorded', () => {
    const evaluation = evaluateDesk({
      account, plan, clock, positions: [trade({ id: 't', closeAt: '2026-11-17T12:00:00Z', netProfit: '-1240' })],
      sessions: [{ id: 's', accountId: 'a', firmDay: '2026-11-17', lowestEquity: '96960', checklist: [], note: '', updatedAt: '' }],
    });
    expect(evaluation.daily[0]).toMatchObject({ value: '3040', confidence: 'attested' });
  });

  it('leaves the day computable when no low is recorded', () => {
    const evaluation = evaluateDesk({
      account, plan, clock, positions: [trade({ id: 't', closeAt: '2026-11-17T12:00:00Z', netProfit: '-1240' })],
    });
    expect(evaluation.daily[0]).toMatchObject({ value: '1240', confidence: 'estimate' });
  });
});

describe('target, minimum days, consistency', () => {
  it('reads a half-reached target as half complete', () => {
    const progress = targetProgress(plan, [day('2026-11-17', '5000')]);
    expect(progress?.value).toBe('5000');
    expect(progress?.limit).toBe('10000');
    expect(progress?.usedPct).toBeCloseTo(0.5, 10);
  });

  it('counts trading days toward the minimum', () => {
    expect(minDaysProgress(plan, [day('2026-11-17', '0'), day('2026-11-18', '0')])).toEqual({ met: 2, required: 4, complete: false });
    expect(minDaysProgress({ ...plan, minTradingDays: null }, [])).toBeNull();
  });

  it('names the day that exceeds the consistency cap', () => {
    const report = consistencyReport(plan, [day('2026-11-17', '3000'), day('2026-11-18', '1000')]);
    expect(report).toMatchObject({ day: '2026-11-17', exceeded: true });
    expect(report?.share).toBeCloseTo(0.75, 10);
  });

  it('reports consistency as undefined with no cap or no profit', () => {
    expect(consistencyReport({ ...plan, consistencyPct: null }, [day('2026-11-17', '3000')])).toBeNull();
    expect(consistencyReport(plan, [day('2026-11-17', '-3000')])).toBeNull();
  });
});

describe('breach reporting', () => {
  it('marks a day as breached and keeps the history readable', () => {
    const evaluation = evaluateDesk({
      account, plan, clock,
      positions: [
        trade({ id: 'ok', closeAt: '2026-11-17T12:00:00Z', netProfit: '-1000' }),
        trade({ id: 'bad', closeAt: '2026-11-18T12:00:00Z', netProfit: '-6000' }),
      ],
    });
    expect(evaluation.status).toBe('breach');
    expect(evaluation.breaches).toEqual([{ reason: 'maxDailyLoss', firmDay: '2026-11-18' }]);
    expect(evaluation.days).toHaveLength(2);
    expect(evaluation.days[0]?.realized).toBe('-1000');
    expect(evaluation.days[1]?.realized).toBe('-6000');
  });

  it('warns before a limit is crossed', () => {
    const evaluation = evaluateDesk({
      account, plan, clock,
      positions: [trade({ id: 'near', closeAt: '2026-11-17T12:00:00Z', netProfit: '-4200' })],
    });
    expect(evaluation.status).toBe('warning');
    expect(evaluation.breaches).toEqual([]);
  });

  it('is safe when nothing is close', () => {
    const evaluation = evaluateDesk({
      account, plan, clock,
      positions: [trade({ id: 'calm', closeAt: '2026-11-17T12:00:00Z', netProfit: '-500' })],
    });
    expect(evaluation.status).toBe('safe');
  });
});
