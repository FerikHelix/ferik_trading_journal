import { useState } from 'preact/hooks';
import type { Account } from '../lib/domain/types';
import { Badge, Card, EmptyState, Notice } from './ui';
import { changeDeskKind, mergeDesks, saveDeskFacts } from './dataClient';

/**
 * Desk facts live here because they govern every percentage the product shows:
 * without a starting balance there is no 100% to measure against.
 */
export default function DeskSettings({ accounts, onChange }: { accounts: Account[]; onChange: (accounts: Account[]) => void }) {
  const [editing, setEditing] = useState<Record<string, { startingBalance: string; openedAt: string }>>({});
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const draftFor = (account: Account) => editing[account.id] ?? {
    startingBalance: account.startingBalance ?? '',
    openedAt: account.openedAt ?? '',
  };

  const update = (account: Account, patch: { startingBalance?: string; openedAt?: string }) => {
    setEditing((current) => ({ ...current, [account.id]: { ...draftFor(account), ...patch } }));
  };

  async function saveFacts(account: Account) {
    setError('');
    setMessage('');
    try {
      const draft = draftFor(account);
      const saved = await saveDeskFacts(account.id, {
        startingBalance: draft.startingBalance.trim(),
        openedAt: draft.openedAt.trim() || undefined,
      });
      onChange(accounts.map((candidate) => candidate.id === saved.id ? saved : candidate));
      setMessage(`${saved.label}: facts saved. Percentages are now based on ${saved.startingBalance ?? 'an unknown balance'}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    }
  }

  async function setKind(account: Account, kind: Account['kind']) {
    setError('');
    setMessage('');
    try {
      const saved = await changeDeskKind(account.id, kind);
      onChange(accounts.map((candidate) => candidate.id === saved.id ? saved : candidate));
      setMessage(`${saved.label} is now a ${kind === 'propfirm' ? 'prop firm' : 'personal'} desk.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the desk kind.');
    }
  }

  async function merge(account: Account) {
    const target = mergeTarget[account.id];
    if (!target) return;
    setError('');
    setMessage('');
    try {
      const report = await mergeDesks(target, account.id);
      const remaining = accounts.filter((candidate) => candidate.id !== account.id);
      onChange(remaining);
      const moved = Object.entries(report.moved).filter(([, count]) => count > 0).map(([key, count]) => `${count} ${key}`).join(', ');
      const skipped = Object.entries(report.skipped).filter(([, count]) => count > 0).map(([key, count]) => `${count} ${key}`).join(', ');
      setMessage(`Merged into ${remaining.find((candidate) => candidate.id === target)?.label ?? target}. Moved: ${moved || 'nothing'}. Already there: ${skipped || 'nothing'}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not merge those desks.');
    }
  }

  if (accounts.length === 0) {
    return (
      <Card title="Desks" description="One appears with your first import.">
        <EmptyState icon="upload" title="No desks yet" description="Drop an export on Today and the desk is created for you." compact />
      </Card>
    );
  }

  return (
    <Card title="Desks" description="Kind, starting balance and duplicates. Changing these re-derives readings; it never rewrites imported trades.">
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="desk-list">
        {accounts.map((account) => {
          const draft = draftFor(account);
          const others = accounts.filter((candidate) => candidate.id !== account.id);
          return (
            <div className="desk-card" key={account.id}>
              <div className="desk-card__head">
                <div>
                  <strong>{account.label}</strong>
                  <span className="muted"> {account.accountNumber || 'no number'} · {account.server || 'no server'} · {account.currency}</span>
                </div>
                <Badge tone={account.kind === 'propfirm' ? 'brand' : 'neutral'}>
                  {account.kind === 'propfirm' ? 'prop firm' : 'personal'}
                </Badge>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Desk kind</label>
                  <select
                    aria-label={`Kind for ${account.label}`}
                    value={account.kind}
                    onChange={(event) => setKind(account, event.currentTarget.value as Account['kind'])}
                  >
                    <option value="personal">Personal</option>
                    <option value="propfirm">Prop firm</option>
                  </select>
                </div>
                <div className="field">
                  <label>Starting balance ({account.currency})</label>
                  <input
                    aria-label={`Starting balance for ${account.label}`}
                    value={draft.startingBalance}
                    placeholder="100000"
                    onInput={(event) => update(account, { startingBalance: event.currentTarget.value })}
                  />
                </div>
                <div className="field">
                  <label>Effective from</label>
                  <input
                    aria-label={`Starting balance date for ${account.label}`}
                    type="date"
                    value={draft.openedAt}
                    onInput={(event) => update(account, { openedAt: event.currentTarget.value })}
                  />
                </div>
                <div className="field field--actions">
                  <button className="btn" onClick={() => saveFacts(account)}>Save facts</button>
                </div>
              </div>
              {account.startingBalance === undefined && (
                <p className="muted u-xs">Percentages stay blank until this is set. A blank is honest; zero would not be.</p>
              )}

              {others.length > 0 && (
                <div className="desk-card__merge">
                  <span className="u-xs muted">Duplicate of another desk?</span>
                  <select
                    aria-label={`Merge ${account.label} into`}
                    value={mergeTarget[account.id] ?? ''}
                    onChange={(event) => setMergeTarget({ ...mergeTarget, [account.id]: event.currentTarget.value })}
                  >
                    <option value="">Merge into…</option>
                    {others.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label} · {candidate.accountNumber || 'no number'}</option>)}
                  </select>
                  <button className="btn btn--sm" disabled={!mergeTarget[account.id]} onClick={() => merge(account)}>Merge</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
