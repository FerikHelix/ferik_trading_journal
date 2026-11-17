import type { Account, DetectedAccountMetadata } from '../domain/types';

const key = (value: string) => value.trim().toLowerCase();

/**
 * Which desk an export belongs to.
 *
 * The account number is the only stable identity a broker gives us. Server labels
 * are renamed by brokers without warning, so keying on them used to fork the same
 * account into two desks after a rename. When no number is present on either
 * side, the label is the best remaining guess — and only then.
 */
export function findMatchingAccount(accounts: Account[], metadata: DetectedAccountMetadata): Account | undefined {
  const accountNumber = key(metadata.accountNumber);
  if (accountNumber) {
    return accounts.find((account) => key(account.accountNumber) === accountNumber);
  }
  const label = key(metadata.label);
  return accounts.find((account) => !key(account.accountNumber) && key(account.label) === label);
}
