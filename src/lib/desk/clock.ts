import type { Account, Plan } from '../domain/types';
import { firmDayKey, personalClock, type FirmClock } from './day';

/**
 * Which clock a desk's days are measured on.
 *
 * A prop firm desk is bound by its plan's reset clock. A personal desk has no
 * firm to answer to, so it uses the display timezone at midnight. One function so
 * no caller has to remember the rule.
 */
export function deskClock(
  account: Pick<Account, 'kind'>,
  plan: Pick<Plan, 'resetTime' | 'resetTimeZone'> | undefined,
  displayTimeZone: string,
): FirmClock {
  if (account.kind === 'propfirm' && plan) {
    return { resetTime: plan.resetTime, resetTimeZone: plan.resetTimeZone };
  }
  return personalClock(displayTimeZone);
}

/** The firm day a single instant belongs to, for a given desk. */
export function deskDayKey(
  instant: string | Date,
  account: Pick<Account, 'kind'>,
  plan: Pick<Plan, 'resetTime' | 'resetTimeZone'> | undefined,
  displayTimeZone: string,
): string {
  return firmDayKey(instant, deskClock(account, plan, displayTimeZone));
}
