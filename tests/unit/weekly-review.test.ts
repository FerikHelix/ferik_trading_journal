import { describe, expect, it } from 'vitest';
import { calculateWeeklyReview, isMeaningfulJournal, shiftWeek, weekBounds } from '../../src/lib/review';
import type { Account, Journal, Position } from '../../src/lib/domain/types';

const account: Account = { id: 'a', label: 'Main', accountNumber: '1', platform: 'MT5', server: '', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' };
const position = (id: string, netProfit: string, closeAt: string): Position => ({ id, accountId: 'a', positionId: id, symbol: id === 'b' ? 'EURUSD' : 'XAUUSD', side: 'buy', openAt: '2026-01-01T00:00:00Z', closeAt, averageOpenPrice: '1', averageClosePrice: '1', volume: '1', grossProfit: netProfit, commission: '0', swap: '0', netProfit, status: 'closed', dealIds: [] });

describe('weekly review helpers', () => {
  it('uses Monday through Sunday UTC boundaries and shifts whole weeks', () => {
    const bounds = weekBounds(new Date('2026-09-09T14:00:00Z'));
    expect(bounds).toEqual({ weekStart: '2026-09-07T00:00:00.000Z', weekEnd: '2026-09-13T23:59:59.999Z' });
    expect(shiftWeek(bounds.weekStart, -1).weekStart).toBe('2026-08-31T00:00:00.000Z');
  });

  it('calculates coverage, insights, and top/bottom positions only inside the selected week', () => {
    const journals: Journal[] = [{ id: 'j', positionId: 'a', strategy: 'Breakout', setup: '', thesis: '', emotion: 'Tenang', mistakes: ['FOMO'], tags: ['London'], review: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }];
    const data = calculateWeeklyReview([position('a', '20', '2026-09-08T10:00:00Z'), position('b', '-8', '2026-09-10T10:00:00Z'), position('c', '99', '2026-09-14T00:00:00Z')], [account], journals, 'a', weekBounds(new Date('2026-09-09T00:00:00Z')));
    expect(data.metrics).toMatchObject({ totalPositions: 2, netProfit: '12' });
    expect(data).toMatchObject({ journalledPositions: 1, strategies: [{ value: 'Breakout', count: 1 }], emotions: [{ value: 'Tenang', count: 1 }], mistakes: [{ value: 'FOMO', count: 1 }], bestPosition: { id: 'a' }, worstPosition: { id: 'b' } });
    expect(data.unjournalledPositions.map((item) => item.id)).toEqual(['b']);
  });

  it('does not treat an empty journal record as complete', () => {
    const journal: Journal = { id: 'j', positionId: 'a', strategy: '', setup: '', thesis: '', emotion: '', mistakes: [], tags: [], review: '', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
    expect(isMeaningfulJournal(journal)).toBe(false);
  });
});
