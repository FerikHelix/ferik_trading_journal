import { describe, expect, it } from 'vitest';
import { deskClock } from '../../src/lib/desk/clock';
import { positionsForDay, summarizeDays } from '../../src/lib/desk/days';
import { evaluateDesk } from '../../src/lib/desk/guardrails';
import type { Account, BalanceEvent, Plan, Position } from '../../src/lib/domain/types';

const account: Account = {
  id: 'a', label: 'FTMO', accountNumber: '1', platform: 'MT5', server: 'FTMO',
  currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm',
  startingBalance: '100000', openedAt: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z',
};

const noBalance: Account = { ...account, startingBalance: undefined };

const plan: Plan = {
  id: 'p', accountId: 'a', firm: 'FTMO', phase: 'Phase 1',
  startingBalance: '100000', effectiveFrom: '2026-11-01',
  resetTime: '00:00', resetTimeZone: 'Europe/Prague',
  maxDailyLossPct: 5, maxTotalLossPct: 10, totalLossMode: 'static',
  profitTargetPct: 10, minTradingDays: 4, consistencyPct: null,
  softCaps: {}, attested: [], markdown: '',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

const clock = deskClock(account, plan, 'UTC');

const trade = (id: string, closeAt: string, netProfit: string, volume = '1'): Position => ({
  id, accountId: 'a', positionId: id, symbol: 'EURUSD', side: 'buy',
  openAt: closeAt, closeAt, averageOpenPrice: '1', averageClosePrice: '1',
  volume, grossProfit: netProfit, commission: '0', swap: '0', netProfit,
  status: 'closed', dealIds: [],
});

const deposit = (occurredAt: string, amount: string): BalanceEvent => ({
  id: `d-${occurredAt}`, accountId: 'a', ticketId: 'x', type: 'deposit', amount, occurredAt, comment: '',
});

describe('day summaries', () => {
  it('summarizes a trading day with its baseline and percentage', () => {
    const days = summarizeDays([
      trade('1', '2026-11-17T10:00:00Z', '120', '0.5'),
      trade('2', '2026-11-17T14:00:00Z', '-320', '1.5'),
    ], account, clock);

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      firmDay: '2026-11-17',
      tradeCount: 2,
      realized: '-200',
      lotVolume: '2',
      openingBalance: '100000',
    });
    expect(days[0].resultPct).toBeCloseTo(-0.2, 10);
  });

  it('keeps a flat day distinct from an empty one', () => {
    const flat = summarizeDays([trade('1', '2026-11-17T10:00:00Z', '0')], account, clock);
    expect(flat[0]).toMatchObject({ firmDay: '2026-11-17', realized: '0', tradeCount: 1 });

    const empty = summarizeDays([], account, clock);
    expect(empty).toEqual([]);
  });

  it('reports no percentage when the account has no starting balance', () => {
    const days = summarizeDays([trade('1', '2026-11-17T10:00:00Z', '-200')], noBalance, clock);
    expect(days[0]).toMatchObject({ realized: '-200', openingBalance: null, resultPct: null });
  });

  it('uses the day baseline that includes earlier deposits, not the day result', () => {
    const days = summarizeDays(
      [trade('1', '2026-11-17T10:00:00Z', '-500')],
      account, clock,
      [deposit('2026-11-16T09:00:00Z', '1000'), deposit('2026-11-17T09:00:00Z', '5000')],
    );
    expect(days[0]).toMatchObject({ openingBalance: '101000' });
    expect(days[0].resultPct).toBeCloseTo((-500 / 101000) * 100, 10);
  });

  it('reports used budget share per day through the guardrail evaluation', () => {
    const evaluation = evaluateDesk({
      account, plan, clock,
      positions: [
        trade('1', '2026-11-17T10:00:00Z', '-1000'),
        trade('2', '2026-11-18T10:00:00Z', '-4000'),
      ],
    });
    expect(evaluation.daily.map((item) => item.firmDay)).toEqual(['2026-11-17', '2026-11-18']);
    expect(evaluation.daily[0]?.usedPct).toBeCloseTo(0.2, 10);
    expect(evaluation.daily[1]?.usedPct).toBeCloseTo(0.8, 10);
  });
});

describe('day drill-down', () => {
  it('lists only the positions closed on that firm day', () => {
    const positions = [
      trade('1', '2026-11-17T10:00:00Z', '100'),
      trade('2', '2026-11-17T21:30:00Z', '200'), // 22:30 Prague, still the 17th
      trade('3', '2026-11-18T10:00:00Z', '300'),
    ];
    expect(positionsForDay(positions, 'a', '2026-11-17', clock).map((position) => position.id)).toEqual(['2', '1']);
    expect(positionsForDay(positions, 'a', '2026-11-18', clock).map((position) => position.id)).toEqual(['3']);
    expect(positionsForDay(positions, 'a', '2026-11-19', clock)).toEqual([]);
  });
});
