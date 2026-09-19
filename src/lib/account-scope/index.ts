/**
 * The selected account, shared across pages.
 *
 * This is a multi-page app, so before this existed each page rendered its own
 * account <select> and the choice reset on every navigation. Modelled on
 * lib/theme: localStorage for persistence, a CustomEvent so islands on the
 * same page stay in sync.
 *
 * '' means "all accounts" and is always a valid value.
 */
export const ACCOUNT_STORAGE_KEY = 'feriktrading-account';
export const ACCOUNT_EVENT = 'feriktrading-account-change';

export function getActiveAccountId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ACCOUNT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setActiveAccountId(accountId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (accountId) window.localStorage.setItem(ACCOUNT_STORAGE_KEY, accountId);
    else window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    /* private mode — fall through, the event still keeps this page consistent */
  }
  window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: { accountId } }));
}

export function subscribeToAccountChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(ACCOUNT_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(ACCOUNT_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * Guards against a stored id that no longer exists — which happens after
 * "hapus data lokal" or after restoring a backup from another machine.
 */
export function resolveAccountId(stored: string, knownIds: string[]): string {
  return stored && knownIds.includes(stored) ? stored : '';
}
