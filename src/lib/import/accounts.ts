import type { Account, DetectedAccountMetadata } from '../domain/types';

const key = (value: string) => value.trim().toLowerCase();

export function findMatchingAccount(accounts: Account[], metadata: DetectedAccountMetadata): Account | undefined {
  const server = key(metadata.server);
  const accountNumber = key(metadata.accountNumber);
  if (accountNumber) {
    return accounts.find((account) => key(account.server) === server && key(account.accountNumber) === accountNumber);
  }
  const label = key(metadata.label);
  return accounts.find((account) => key(account.server) === server && !key(account.accountNumber) && key(account.label) === label);
}
