import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, db, importDetectedHistory } from '../../src/lib/db/database';
import { parseMt5Csv } from '../../src/lib/import/mt5-csv';
import { makeMt5CsvText } from '../fixtures/mt5Workbook';

beforeEach(async () => clearAllData());
afterEach(async () => clearAllData());

const preview = () => parseMt5Csv(makeMt5CsvText(), 'UTC');

describe('zero-field import', () => {
  it('creates exactly one personal desk from the export and lands the history on it', async () => {
    const parsed = await preview();
    expect(parsed.detectedAccount?.accountNumber).toBe('123456');

    const result = await importDetectedHistory(parsed, 'history.csv');

    expect(await db.accounts.count()).toBe(1);
    expect(result.account).toMatchObject({
      accountNumber: '123456',
      server: 'Broker-Live',
      currency: 'USD',
      kind: 'personal',
    });
    expect(result.inserted).toBe(parsed.deals.length + parsed.balanceEvents.length);
    expect(await db.deals.where('accountId').equals(result.account.id).count()).toBe(parsed.deals.length);
  });

  it('reuses the same desk when the same account is imported again', async () => {
    const first = await importDetectedHistory(await preview(), 'first.csv');
    const second = await importDetectedHistory(await preview(), 'second.csv');

    expect(second.account.id).toBe(first.account.id);
    expect(second.alreadyImported).toBe(true);
    expect(await db.accounts.count()).toBe(1);
  });

  it('reuses the desk even when the export names a different server', async () => {
    const first = await importDetectedHistory(await preview(), 'first.csv');
    const renamed = await preview();
    renamed.detectedAccount = { ...renamed.detectedAccount!, server: 'Broker-Live-2', label: 'Renamed' };

    const second = await importDetectedHistory(renamed, 'second.csv');
    expect(second.account.id).toBe(first.account.id);
    expect(await db.accounts.count()).toBe(1);
  });

  it('refuses a file that carries no account identity rather than inventing one', async () => {
    const parsed = await preview();
    delete parsed.detectedAccount;
    await expect(importDetectedHistory(parsed, 'anonymous.csv')).rejects.toThrow('identitas akun');
    expect(await db.accounts.count()).toBe(0);
  });

  it('inserts only the new records when an export overlaps an earlier one', async () => {
    const first = await importDetectedHistory(await preview(), 'first.csv');

    const overlap = await preview();
    overlap.deals = [
      ...overlap.deals,
      { ...overlap.deals[0], id: 'preview:mt5-position:999', ticketId: 'mt5-position:999', orderId: '999', positionId: '999' },
    ];
    overlap.fileHash = 'c'.repeat(64);

    const second = await importDetectedHistory(overlap, 'overlap.csv');
    expect(second).toMatchObject({ inserted: 1, duplicates: 3, alreadyImported: false });
    expect(second.account.id).toBe(first.account.id);
    expect(await db.accounts.count()).toBe(1);
    expect(await db.deals.where('accountId').equals(first.account.id).count()).toBe(overlap.deals.length);
  });
});
