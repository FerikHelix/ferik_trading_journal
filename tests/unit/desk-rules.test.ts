import { describe, expect, it } from 'vitest';
import { attestedRuleStatus, ruleWall, softRuleReading } from '../../src/lib/desk/rules';
import type { Plan } from '../../src/lib/domain/types';

const basePlan: Plan = {
  id: 'p', accountId: 'a', firm: 'FTMO', phase: 'Phase 1',
  startingBalance: '100000', effectiveFrom: '2026-11-01',
  resetTime: '00:00', resetTimeZone: 'Europe/Prague',
  maxDailyLossPct: 5, maxTotalLossPct: 10, totalLossMode: 'static',
  profitTargetPct: 10, minTradingDays: 4, consistencyPct: 30,
  softCaps: { tradesPerDay: 2, lotsPerDay: 3 },
  attested: [{ id: 'no-news', text: 'No trading around news' }],
  markdown: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('rule wall assembly', () => {
  it('lists every configured limit as a computed rule', () => {
    expect(ruleWall(basePlan).filter((rule) => rule.tier === 'computed')).toEqual([
      { tier: 'computed', kind: 'maxDailyLoss' },
      { tier: 'computed', kind: 'maxTotalLoss' },
      { tier: 'computed', kind: 'target' },
      { tier: 'computed', kind: 'minDays' },
      { tier: 'computed', kind: 'consistency' },
    ]);
  });

  it('omits a computed rule the plan does not configure', () => {
    const noConsistency: Plan = { ...basePlan, consistencyPct: null, profitTargetPct: null };
    expect(ruleWall(noConsistency).filter((rule) => rule.tier === 'computed').map((rule) => rule.kind))
      .toEqual(['maxDailyLoss', 'maxTotalLoss', 'minDays']);
  });

  it('turns soft caps and attested rules into rules of their own tier', () => {
    const tiers = ruleWall(basePlan).map((rule) => rule.tier);
    expect(tiers).toContain('soft');
    expect(tiers).toContain('attested');
    expect(ruleWall(basePlan).find((rule) => rule.tier === 'attested')).toEqual({
      tier: 'attested', id: 'no-news', text: 'No trading around news',
    });
  });
});

describe('soft caps', () => {
  const trades = { tier: 'soft' as const, metric: 'tradesPerDay' as const, cap: 2 };
  const lots = { tier: 'soft' as const, metric: 'lotsPerDay' as const, cap: 3 };

  it('reports a count against its cap', () => {
    expect(softRuleReading(trades, { tradeCount: 1, lotVolume: 0 })).toEqual({ used: 1, cap: 2, status: 'ok' });
    expect(softRuleReading(trades, { tradeCount: 2, lotVolume: 0 })).toEqual({ used: 2, cap: 2, status: 'watch' });
    expect(softRuleReading(trades, { tradeCount: 3, lotVolume: 0 })).toEqual({ used: 3, cap: 2, status: 'breach' });
    expect(softRuleReading(lots, { tradeCount: 0, lotVolume: 2.5 })).toEqual({ used: 2.5, cap: 3, status: 'ok' });
  });
});

describe('attested rules', () => {
  const rule = { tier: 'attested' as const, id: 'no-news', text: 'No trading around news' };

  it('is never satisfied by trade data, only by the day tick', () => {
    expect(attestedRuleStatus(rule, [])).toBe('open');
    expect(attestedRuleStatus(rule, ['no-weekend-holds'])).toBe('open');
    expect(attestedRuleStatus(rule, ['no-news'])).toBe('ok');
  });
});
