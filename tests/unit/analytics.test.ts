import { describe, expect, it } from 'vitest';
import { calculateAnalytics } from '../../src/lib/analytics';
import type { Account, Journal, Position } from '../../src/lib/domain/types';

const accounts: Account[] = [
  { id: 'usd', label: 'USD', accountNumber: '1', platform: 'MT5', server: 'demo', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'eur', label: 'EUR', accountNumber: '2', platform: 'MT5', server: 'demo', currency: 'EUR', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' },
];
const position = (id: string, netProfit: string, closeAt: string, accountId = 'usd'): Position => ({ id, accountId, positionId: id, symbol: 'XAUUSD', side: 'buy', openAt: '2026-01-01T00:00:00Z', closeAt, averageOpenPrice: '2000', averageClosePrice: '2001', volume: '0.1', grossProfit: netProfit, commission: '0', swap: '0', netProfit, status: 'closed', dealIds: [] });

describe('calculateAnalytics', () => {
  it('calculates core metrics, R and drawdown from closed positions', () => {
    const rows = [position('a', '100', '2026-01-01T10:00:00Z'), position('b', '-40', '2026-01-02T10:00:00Z'), position('c', '0', '2026-01-03T10:00:00Z'), position('d', '-20', '2026-01-04T10:00:00Z')];
    const journals = [{ id: 'j', positionId: 'a', strategy: 'Breakout', setup: '', thesis: '', emotion: '', mistakes: [], tags: [], riskAmount: '50', review: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }] satisfies Journal[];
    const result = calculateAnalytics(rows, accounts, journals);
    expect(result.metrics).toMatchObject({ totalPositions: 4, wins: 1, losses: 2, breakeven: 1, winRate: 1 / 3, netProfit: '40', profitFactor: '1.66666667', expectancy: '10', averageRealizedR: '2', maximumDrawdown: '60' });
    expect(result.cumulativeProfit.at(-1)?.cumulativeProfit).toBe('40');
    expect(result.byStrategy.find((group) => group.key === 'Breakout')?.count).toBe(1);
  });

  it('does not combine monetary metrics across currencies', () => {
    const result = calculateAnalytics([position('a', '100', '2026-01-01T00:00:00Z'), position('b', '90', '2026-01-02T00:00:00Z', 'eur')], accounts);
    expect(result.metrics.totalPositions).toBe(2);
    expect(result.metrics.netProfit).toBeNull();
    expect(result.metrics.requiresCurrencySelection).toBe(true);
    expect(result.cumulativeProfit).toEqual([]);
    expect(calculateAnalytics([position('a', '100', '2026-01-01T00:00:00Z'), position('b', '90', '2026-01-02T00:00:00Z', 'eur')], accounts, [], { currency: 'USD' }).metrics.netProfit).toBe('100');
  });

  it('filters by close date and exposes win rate for breakdown rows', () => {
    const rows = [
      position('a', '100', '2026-01-01T10:00:00Z'),
      position('b', '-20', '2026-01-03T10:00:00Z'),
      { ...position('c', '40', '2026-01-04T10:00:00Z'), symbol: 'EURUSD', side: 'sell' as const },
    ];
    const result = calculateAnalytics(rows, accounts, [], { from: '2026-01-02T00:00:00.000Z', to: '2026-01-03T23:59:59.999Z' });
    expect(result.metrics).toMatchObject({ totalPositions: 1, netProfit: '-20', winRate: 0 });
    expect(result.bySymbol).toEqual([expect.objectContaining({ key: 'XAUUSD', count: 1, winRate: 0 })]);
    expect(result.pnlGranularity).toBe('day');
    expect(result.pnlByPeriod).toEqual([expect.objectContaining({ key: '2026-01-03', netProfit: '-20' })]);
  });

  it('uses monthly P&L buckets for a period longer than 92 days', () => {
    const rows = [position('a', '10', '2026-01-01T10:00:00Z'), position('b', '20', '2026-05-10T10:00:00Z')];
    const result = calculateAnalytics(rows, accounts);
    expect(result.pnlGranularity).toBe('month');
    expect(result.pnlByPeriod.map((point) => point.key)).toEqual(['2026-01', '2026-05']);
  });
});
