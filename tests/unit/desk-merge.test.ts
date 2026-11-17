import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllData, createAccount, db, getSession, importParsedData, mergeAccounts, savePlan, saveSession, upsertJournal,
} from '../../src/lib/db/database';
import { aggregatePositions } from '../../src/lib/import/aggregate';
import { parseExnessCsv } from '../../src/lib/import/parser';

beforeEach(async () => clearAllData());
afterEach(async () => clearAllData());

const opening = 'Deal,Order,Position ID,Time,Type,Entry,Symbol,Volume,Price,Commission,Swap,Profit\n';
const csvFor = (rows: string[]) => new File([opening + rows.join('\n')], 'history.csv', { type: 'text/csv' });

/** Two desks for the same real account: the duplicate the old server-keyed matching produced. */
const duplicateDesks = async () => {
  const survivor = await createAccount({ label: 'Exness', accountNumber: '777', server: 'Exness-MT5Real8', currency: 'USD', sourceTimeZone: 'UTC' });
  const merged = await createAccount({ label: 'Exness', accountNumber: '777', server: 'Exness Technologies Ltd', currency: 'USD', sourceTimeZone: 'UTC' });
  return { survivor, merged };
};

const importRows = async (accountId: string, rows: string[]) => {
  const file = csvFor(rows);
  const parsed = await parseExnessCsv(await file.text(), accountId, 'UTC');
  return importParsedData({ kind: 'existing', accountId }, 'history.csv', {
    ...parsed, sourceFormat: 'exness-csv', sourceLabel: 'Exness CSV', parserVersion: 2,
  });
};

describe('duplicate account merge', () => {
  it('moves unique records, drops overlaps, and reports both counts', async () => {
    const { survivor, merged } = await duplicateDesks();
    const shared = '1,10,99,2026.09.01 10:00:00,Buy,In,EURUSD,1,1.1,0,0,0\n2,10,99,2026.09.01 11:00:00,Sell,Out,EURUSD,1,1.2,0,0,10';
    const onlyMerged = '3,20,100,2026.09.02 10:00:00,Buy,In,EURUSD,1,1.1,0,0,0\n4,20,100,2026.09.02 11:00:00,Sell,Out,EURUSD,1,1.3,0,0,20';

    await importRows(survivor.id, shared.split('\n'));
    await importRows(merged.id, [...shared.split('\n'), ...onlyMerged.split('\n')]);

    const report = await mergeAccounts(survivor.id, merged.id);

    expect(report).toMatchObject({
      survivorId: survivor.id,
      mergedId: merged.id,
      moved: { deals: 2, balanceEvents: 0, positions: 2 },
      skipped: { deals: 2 },
    });
    expect(await db.accounts.get(merged.id)).toBeUndefined();
    expect(await db.deals.where('accountId').equals(merged.id).count()).toBe(0);

    const deals = await db.deals.where('accountId').equals(survivor.id).toArray();
    expect(deals).toHaveLength(4);
    const positions = await db.positions.where('accountId').equals(survivor.id).toArray();
    expect(positions.map((position) => position.positionId).sort()).toEqual(['100', '99']);
    expect(positions.find((position) => position.positionId === '100')?.netProfit).toBe('20');
    expect(aggregatePositions(deals)).toHaveLength(2);
  });

  it('retargets a journal when its position record is absorbed', async () => {
    const { survivor, merged } = await duplicateDesks();
    const shared = '1,10,99,2026.09.01 10:00:00,Buy,In,EURUSD,1,1.1,0,0,0\n2,10,99,2026.09.01 11:00:00,Sell,Out,EURUSD,1,1.2,0,0,10';
    await importRows(survivor.id, shared.split('\n'));
    const result = await importRows(merged.id, shared.split('\n'));

    const mergedPosition = result.positions[0];
    await upsertJournal({ positionId: mergedPosition.id, strategy: 'breakout', thesis: 'kept' });

    const report = await mergeAccounts(survivor.id, merged.id);

    expect(report.moved.journals).toBe(1);
    const journals = await db.journals.toArray();
    expect(journals).toHaveLength(1);
    expect(journals[0]).toMatchObject({ positionId: `${survivor.id}:99`, strategy: 'breakout', thesis: 'kept' });
  });

  it('carries a plan and sessions onto the survivor', async () => {
    const survivor = await createAccount({ label: 'FTMO', accountNumber: '888', server: 'FTMO', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const merged = await createAccount({ label: 'FTMO old', accountNumber: '888', server: 'FTMO-renamed', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    await savePlan({ accountId: merged.id, startingBalance: '100000', effectiveFrom: '2026-11-01', resetTime: '00:00', resetTimeZone: 'Europe/Prague' });
    await saveSession({ accountId: merged.id, firmDay: '2026-11-17', checklist: ['no-news'] });

    const report = await mergeAccounts(survivor.id, merged.id);

    expect(report.moved).toMatchObject({ plans: 1, sessions: 1 });
    expect(await db.plans.where('accountId').equals(survivor.id).count()).toBe(1);
    expect(await getSession(survivor.id, '2026-11-17')).toMatchObject({ checklist: ['no-news'] });
  });

  it('keeps the survivor plan and the survivor session when both sides have one', async () => {
    const survivor = await createAccount({ label: 'FTMO', accountNumber: '999', server: 'FTMO', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const merged = await createAccount({ label: 'FTMO', accountNumber: '999', server: 'FTMO-2', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    await savePlan({ accountId: survivor.id, startingBalance: '50000', effectiveFrom: '2026-11-01', resetTime: '00:00', resetTimeZone: 'Europe/Prague' });
    await savePlan({ accountId: merged.id, startingBalance: '100000', effectiveFrom: '2026-11-01', resetTime: '00:00', resetTimeZone: 'Europe/Prague' });
    await saveSession({ accountId: survivor.id, firmDay: '2026-11-17', note: 'survivor' });
    await saveSession({ accountId: merged.id, firmDay: '2026-11-17', note: 'merged' });

    const report = await mergeAccounts(survivor.id, merged.id);

    expect(report.skipped).toMatchObject({ plans: 1, sessions: 1 });
    expect(await db.plans.where('accountId').equals(survivor.id).first()).toMatchObject({ startingBalance: '50000' });
    expect(await getSession(survivor.id, '2026-11-17')).toMatchObject({ note: 'survivor' });
  });

  it('refuses to merge a desk into itself', async () => {
    const { survivor } = await duplicateDesks();
    await expect(mergeAccounts(survivor.id, survivor.id)).rejects.toThrow('berbeda');
  });
});
