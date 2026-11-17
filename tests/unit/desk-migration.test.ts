import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { TradingJournalDatabase } from '../../src/lib/db/database';

/**
 * A v5-era database, declared exactly as the pre-desk schema was, so the v6
 * upgrade has real pre-existing rows to backfill. Defining the old schema in the
 * test is deliberate: if a future version silently changes what v5 stored, this
 * test stops modelling the upgrade users will actually run.
 */
class LegacyDatabase extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      accounts: '&id, accountNumber, currency, createdAt',
      importBatches: '&id, &[accountId+fileHash], accountId, importedAt',
      deals: '&id, &[accountId+ticketId], accountId, positionId, importBatchId, occurredAt',
      positions: '&id, accountId, positionId, status, closeAt, symbol',
      journals: '&id, &positionId, strategy, updatedAt, *tags',
      balanceEvents: '&id, &[accountId+ticketId], accountId, occurredAt, type, importBatchId',
      settings: '&id',
    });
    this.version(2).stores({
      weeklyReviews: '&id, &[accountId+weekStart], accountId, weekStart, updatedAt',
    });
    this.version(5).stores({});
  }
}

const legacyAccount = {
  id: 'legacy',
  label: 'Legacy Exness',
  accountNumber: '1234567',
  platform: 'MT5' as const,
  server: 'Exness-Live8',
  currency: 'USD',
  sourceTimeZone: 'Asia/Bangkok',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const names: string[] = [];
const freshName = () => {
  const name = `migration-${Math.random().toString(36).slice(2)}`;
  names.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('v6 desk migration', () => {
  it('backfills existing accounts as personal desks and leaves the balance unset', async () => {
    const name = freshName();
    const legacy = new LegacyDatabase(name);
    await legacy.open();
    await legacy.table('accounts').add(legacyAccount);
    legacy.close();

    const upgraded = new TradingJournalDatabase(name);
    await upgraded.open();
    const account = await upgraded.accounts.get('legacy');
    expect(account?.kind).toBe('personal');
    expect(account?.startingBalance).toBeUndefined();
    expect(account?.openedAt).toBeUndefined();
    upgraded.close();
  });

  it('preserves every existing record through the upgrade', async () => {
    const name = freshName();
    const legacy = new LegacyDatabase(name);
    await legacy.open();
    await legacy.table('accounts').add(legacyAccount);
    await legacy.table('deals').add({
      id: 'legacy:1', accountId: 'legacy', ticketId: '1', orderId: '1', positionId: '1',
      symbol: 'EURUSD', side: 'buy', event: 'entry', volume: '1', price: '1.1',
      occurredAt: '2026-01-01T00:00:00.000Z', sourceTime: '2026-01-01T00:00:00.000Z',
      profit: '0', commission: '0', swap: '0', sourceRow: 1,
    });
    legacy.close();

    const upgraded = new TradingJournalDatabase(name);
    await upgraded.open();
    expect(await upgraded.accounts.count()).toBe(1);
    expect(await upgraded.deals.count()).toBe(1);
    expect(await upgraded.plans.count()).toBe(0);
    expect(await upgraded.sessions.count()).toBe(0);
    upgraded.close();
  });

  it('opens an already-migrated database without changing its desks', async () => {
    const name = freshName();
    const first = new TradingJournalDatabase(name);
    await first.open();
    await first.accounts.add({ ...legacyAccount, id: 'prop', kind: 'propfirm' });
    first.close();

    const second = new TradingJournalDatabase(name);
    await second.open();
    expect((await second.accounts.get('prop'))?.kind).toBe('propfirm');
    second.close();
  });
});
