import { describe, expect, it } from 'vitest';
import { balanceDelta, openingBalanceForDay } from '../../src/lib/desk/balance';
import { deskClock, deskDayKey } from '../../src/lib/desk/clock';
import type { Account, BalanceEvent, Plan } from '../../src/lib/domain/types';

const account: Account = {
  id: 'a', label: 'Main', accountNumber: '1', platform: 'MT5', server: 'Broker-Live',
  currency: 'USD', sourceTimeZone: 'UTC', kind: 'personal',
  startingBalance: '10000', openedAt: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z',
};

const propAccount: Account = { ...account, kind: 'propfirm' };
const plan: Pick<Plan, 'resetTime' | 'resetTimeZone'> = { resetTime: '22:00', resetTimeZone: 'Europe/Prague' };

const event = (value: Partial<BalanceEvent> & Pick<BalanceEvent, 'type' | 'amount' | 'occurredAt'>): BalanceEvent => ({
  id: `${value.type}-${value.amount}-${value.occurredAt}`, accountId: 'a', ticketId: '1', comment: '', ...value,
});

describe('balance deltas', () => {
  it('uses the type, not the export sign', () => {
    expect(balanceDelta(event({ type: 'deposit', amount: '100', occurredAt: '2026-11-01T00:00:00Z' })).toString()).toBe('100');
    expect(balanceDelta(event({ type: 'withdrawal', amount: '-200', occurredAt: '2026-11-01T00:00:00Z' })).toString()).toBe('-200');
    expect(balanceDelta(event({ type: 'withdrawal', amount: '200', occurredAt: '2026-11-01T00:00:00Z' })).toString()).toBe('-200');
    expect(balanceDelta(event({ type: 'credit', amount: '25', occurredAt: '2026-11-01T00:00:00Z' })).toString()).toBe('25');
    expect(balanceDelta(event({ type: 'other', amount: '-7.5', occurredAt: '2026-11-01T00:00:00Z' })).toString()).toBe('-7.5');
  });
});

describe('day opening balance', () => {
  const clock = deskClock(account, undefined, 'UTC');

  it('adds deposits and subtracts withdrawals that precede the day', () => {
    const events = [
      event({ type: 'deposit', amount: '500', occurredAt: '2026-11-10T09:00:00Z' }),
      event({ type: 'withdrawal', amount: '-200', occurredAt: '2026-11-15T09:00:00Z' }),
    ];
    expect(openingBalanceForDay(account, events, '2026-11-17', clock)).toBe('10300');
  });

  it('excludes events on the day itself', () => {
    const events = [
      event({ type: 'deposit', amount: '500', occurredAt: '2026-11-17T00:00:00Z' }),
      event({ type: 'deposit', amount: '900', occurredAt: '2026-11-18T00:00:00Z' }),
    ];
    expect(openingBalanceForDay(account, events, '2026-11-17', clock)).toBe('10000');
  });

  it('follows the firm reset clock rather than the calendar day', () => {
    const propClock = deskClock(propAccount, plan, 'UTC');
    // 21:00Z is 22:00 Prague: the last instant of the 17th's firm day.
    const events = [event({ type: 'deposit', amount: '500', occurredAt: '2026-11-17T21:00:00Z' })];
    expect(openingBalanceForDay(propAccount, events, '2026-11-17', propClock)).toBe('10000');
    expect(openingBalanceForDay(propAccount, events, '2026-11-18', propClock)).toBe('10500');
  });

  it('ignores other accounts and never includes trading results', () => {
    const events = [event({ type: 'deposit', amount: '500', occurredAt: '2026-11-10T09:00:00Z', accountId: 'other' })];
    expect(openingBalanceForDay(account, events, '2026-11-17', clock)).toBe('10000');
  });

  it('returns null when the account has no starting balance', () => {
    const unknown: Account = { ...account, startingBalance: undefined };
    expect(openingBalanceForDay(unknown, [], '2026-11-17', clock)).toBeNull();
    expect(openingBalanceForDay({ ...account, startingBalance: '  ' }, [], '2026-11-17', clock)).toBeNull();
  });
});

describe('per-desk day keys', () => {
  it('buckets the same instant differently for a prop desk and a personal desk', () => {
    const instant = '2026-11-17T21:30:00Z'; // 22:30 Prague = firm day 17, 04:30 next day in Bangkok
    expect(deskDayKey(instant, propAccount, plan, 'Asia/Bangkok')).toBe('2026-11-17');
    expect(deskDayKey(instant, account, undefined, 'Asia/Bangkok')).toBe('2026-11-18');
  });

  it('falls back to the display zone for a prop desk without a plan', () => {
    expect(deskDayKey('2026-11-17T18:30:00Z', propAccount, undefined, 'Asia/Bangkok')).toBe('2026-11-18');
    expect(deskClock(propAccount, undefined, 'Asia/Bangkok')).toEqual({ resetTime: '00:00', resetTimeZone: 'Asia/Bangkok' });
  });
});
