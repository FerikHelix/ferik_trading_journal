import { useCallback, useSyncExternalStore } from 'react';
import { getActiveAccountId, setActiveAccountId, subscribeToAccountChange } from '../lib/account-scope';

/** Reads the shared account scope. Returns '' for "all accounts". */
export function useActiveAccount(): [string, (accountId: string) => void] {
  const accountId = useSyncExternalStore(
    subscribeToAccountChange,
    getActiveAccountId,
    () => '',
  );
  const setAccount = useCallback((next: string) => setActiveAccountId(next), []);
  return [accountId, setAccount];
}
