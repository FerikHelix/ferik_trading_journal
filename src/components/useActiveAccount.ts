import { useCallback, useEffect, useState } from 'preact/hooks';
import { getActiveAccountId, setActiveAccountId, subscribeToAccountChange } from '../lib/account-scope';

/**
 * Reads the shared account scope. Returns '' for "all accounts".
 *
 * This was `useSyncExternalStore`, which only exists in preact/compat. The
 * store contract in lib/account-scope is already subscribe/getSnapshot shaped,
 * so a plain subscription is equivalent here — this app has no concurrent
 * rendering for useSyncExternalStore to guard against.
 *
 * Two details that matter:
 *  - The initial value is seeded lazily, so localStorage is read during the
 *    first render rather than on every one.
 *  - The effect re-reads on mount instead of trusting that seed. During the
 *    static build there is no `window` and the store returns '', so without
 *    the re-read a stored account would stay invisible until the next change
 *    event.
 */
export function useActiveAccount(): [string, (accountId: string) => void] {
  const [accountId, setAccountId] = useState(getActiveAccountId);

  useEffect(() => {
    const sync = () => setAccountId(getActiveAccountId());
    sync();
    return subscribeToAccountChange(sync);
  }, []);

  const setAccount = useCallback((next: string) => setActiveAccountId(next), []);
  return [accountId, setAccount];
}
