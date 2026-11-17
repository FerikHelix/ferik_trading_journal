import type { Plan, Rule } from '../domain/types';

/**
 * How a rule reads right now.
 *
 * `open` exists because an attested rule is not failed by being unticked — it is
 * simply not yet claimed. `unknown` is for a computed rule whose inputs are
 * missing, which is different from being fine.
 */
export type RuleStatus = 'ok' | 'watch' | 'breach' | 'unknown' | 'open';

export interface RuleUsage {
  /** Closed trades on the firm day being displayed. */
  tradeCount: number;
  /** Traded volume on the firm day being displayed. */
  lotVolume: number;
}

export interface SoftRuleReading {
  used: number;
  cap: number;
  status: RuleStatus;
}

/**
 * The rule wall, assembled from a plan.
 *
 * Three tiers, one renderer, three sources of truth. Computed rules are absent
 * when the plan does not configure them, because a limit of "not set" is not a
 * limit of zero.
 */
export function ruleWall(plan: Plan): Rule[] {
  const rules: Rule[] = [];
  if (plan.maxDailyLossPct !== null) rules.push({ tier: 'computed', kind: 'maxDailyLoss' });
  if (plan.maxTotalLossPct !== null) rules.push({ tier: 'computed', kind: 'maxTotalLoss' });
  if (plan.profitTargetPct !== null) rules.push({ tier: 'computed', kind: 'target' });
  if (plan.minTradingDays !== null) rules.push({ tier: 'computed', kind: 'minDays' });
  if (plan.consistencyPct !== null) rules.push({ tier: 'computed', kind: 'consistency' });
  if (plan.softCaps.tradesPerDay !== undefined) {
    rules.push({ tier: 'soft', metric: 'tradesPerDay', cap: plan.softCaps.tradesPerDay });
  }
  if (plan.softCaps.lotsPerDay !== undefined) {
    rules.push({ tier: 'soft', metric: 'lotsPerDay', cap: plan.softCaps.lotsPerDay });
  }
  for (const rule of plan.attested) rules.push({ tier: 'attested', id: rule.id, text: rule.text });
  return rules;
}

/**
 * A soft cap is counted, not judged: going over it is a fact about the day, not
 * necessarily a breach of the firm's terms.
 */
export function softRuleReading(
  rule: Extract<Rule, { tier: 'soft' }>,
  usage: RuleUsage,
): SoftRuleReading {
  const used = rule.metric === 'tradesPerDay' ? usage.tradeCount : usage.lotVolume;
  const status: RuleStatus = used > rule.cap ? 'breach' : used === rule.cap ? 'watch' : 'ok';
  return { used, cap: rule.cap, status };
}

/**
 * Attested rules read only from the day's ticks.
 *
 * This deliberately takes no trade data: a rule like "no positions held over the
 * weekend" cannot be inferred from an export, and pretending otherwise is the
 * failure mode this tier exists to prevent.
 */
export function attestedRuleStatus(
  rule: Extract<Rule, { tier: 'attested' }>,
  ticks: readonly string[],
): RuleStatus {
  return ticks.includes(rule.id) ? 'ok' : 'open';
}
