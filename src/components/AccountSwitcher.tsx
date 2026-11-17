import { useEffect, useState } from 'preact/hooks';
import type { Account } from '../lib/domain/types';
import { resolveAccountId, setActiveAccountId } from '../lib/account-scope';
import { loadAccounts } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

export default function AccountSwitcher() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccount] = useActiveAccount();

  useEffect(() => {
    loadAccounts()
      .then((loaded) => {
        setAccounts(loaded);
        // Drop a stale id left behind by a cleared or restored database.
        const resolved = resolveAccountId(accountId, loaded.map((account) => account.id));
        if (resolved !== accountId) setActiveAccountId(resolved);
      })
      .catch(() => undefined);
    // Runs once: the account list only changes on the import/settings pages,
    // which trigger a full navigation anyway.
  }, []);

  /**
   * The sidebar is server-rendered, so prop-only entries ship hidden and are
   * revealed here once the active desk is known. A personal desk must not see a
   * plan entry at any point, which is why the default is hidden rather than shown.
   */
  useEffect(() => {
    const active = accounts.find((account) => account.id === accountId);
    const show = !active || active.kind === 'propfirm';
    document.querySelectorAll<HTMLElement>('[data-requires="propfirm"]').forEach((element) => {
      element.hidden = !show;
    });
  }, [accounts, accountId]);

  if (accounts.length === 0) return null;

  return (
    <label className="account-pill">
      <span className="status-dot" aria-hidden="true" />
      <span className="u-sr-only">Account aktif</span>
      <select value={accountId} onChange={(event) => setAccount(event.currentTarget.value)}>
        <option value="">Semua account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label} · {account.currency}
          </option>
        ))}
      </select>
    </label>
  );
}
