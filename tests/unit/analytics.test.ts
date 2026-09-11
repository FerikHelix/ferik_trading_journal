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
});
