import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, createAccount, db, getWeeklyReview, importParsedData, TradingJournalDatabase, upsertJournal, upsertWeeklyReview } from '../../src/lib/db/database';
import { aggregatePositions, parseDecimal, parseExnessCsv } from '../../src/lib/import';
import type { Deal } from '../../src/lib/domain/types';

describe('Exness MT5 CSV parser', () => {
  it('handles BOM, semicolon CSV, European decimals, balance rows, and invalid rows', async () => {
    const csv = '\uFEFFDeal;Order;Position ID;Time;Type;Entry;Symbol;Volume;Price;Commission;Swap;Profit;Comment\n'
      + '101;11;55;2026.09.01 10:00:00;Buy;In;XAUUSD;0,10;2.500,50;-1,20;0;0;\n'
      + '102;12;55;2026.09.01 11:00:00;Sell;Out;XAUUSD;0,10;2.510,50;-1,20;-0,50;10,00;\n'
      + '103;13;;2026.09.01 12:00:00;Balance;;;0;0;0;0;100,00;deposit\n'
      + ';14;55;bad;Buy;In;XAUUSD;0,1;1;0;0;0;';
    const parsed = await parseExnessCsv(csv, 'acc', 'UTC');
    expect(parsed.deals).toHaveLength(2);
    expect(parsed.deals[0].price).toBe('2500.5');
    expect(parsed.balanceEvents[0]).toMatchObject({ type: 'deposit', amount: '100' });
    expect(parsed.issues.some((issue) => issue.severity === 'error')).toBe(true);
    expect(parsed.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('supports closed-order exports and preserves embedded open values', async () => {
    const csv = 'Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n'
      + '900,2026.09.01 10:00:00,Buy,0.20,EURUSD,1.1000,2026.09.01 11:00:00,1.1050,-1,-0.5,20';
    const parsed = await parseExnessCsv(csv, 'acc', 'Asia/Bangkok');
    expect(parsed.deals[0]).toMatchObject({ event: 'exit', embeddedOpenPrice: '1.1' });
    expect(parsed.deals[0].occurredAt).toBe('2026-09-01T04:00:00.000Z');
  });

  it('accepts closed-order exports with Order but no Ticket column', async () => {
    const csv = 'Order,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n'
      + '901,2026.09.01 10:00:00,Buy,0.20,EURUSD,1.1000,2026.09.01 11:00:00,1.1050,-1,-0.5,20';
    const parsed = await parseExnessCsv(csv, 'acc', 'UTC');
    expect(parsed.deals[0]).toMatchObject({ ticketId: '901', orderId: '901', event: 'exit' });
  });

  it('supports Exness Personal Area snake_case exports with UTC timestamps', async () => {
    const csv = 'ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason\n'
      + '4324051429,2026-09-10T07:32:43,2026-09-10T07:43:15,buy,0.51,0.51,BTCUSDc,77969.81,77949,77822.32,78218.58,,,-10.61,,,user';
    const parsed = await parseExnessCsv(csv, 'acc', 'Asia/Bangkok');
    expect(parsed.deals).toHaveLength(1);
    expect(parsed.deals[0]).toMatchObject({
      ticketId: '4324051429',
      orderId: '4324051429',
      event: 'exit',
      volume: '0.51',
      price: '77949',
      profit: '-10.61',
      stopLoss: '77822.32',
      takeProfit: '78218.58',
      occurredAt: '2026-09-10T07:43:15.000Z',
      embeddedOpenAt: '2026-09-10T07:32:43.000Z',
      embeddedOpenPrice: '77969.81',
    });
    expect(parsed.issues).toHaveLength(0);
    expect(aggregatePositions(parsed.deals)[0]).toMatchObject({
      status: 'closed',
      openAt: '2026-09-10T07:32:43.000Z',
      closeAt: '2026-09-10T07:43:15.000Z',
      averageOpenPrice: '77969.81',
      averageClosePrice: '77949',
      netProfit: '-10.61',
    });
  });
});

describe('position aggregation', () => {
  const deal = (value: Partial<Deal> & Pick<Deal, 'ticketId' | 'event' | 'volume' | 'price' | 'occurredAt'>): Deal => ({
    id: `acc:${value.ticketId}`, accountId: 'acc', orderId: value.ticketId, positionId: 'p1',
    symbol: 'XAUUSD', side: value.event === 'entry' ? 'buy' : 'sell', sourceTime: value.occurredAt,
    profit: '0', commission: '0', swap: '0', sourceRow: 1, ...value,
  });

  it('combines partial exits and includes costs in net P&L', () => {
    const positions = aggregatePositions([
      deal({ ticketId: '1', event: 'entry', volume: '1', price: '100', occurredAt: '2026-01-01T00:00:00Z', commission: '-1' }),
      deal({ ticketId: '2', event: 'exit', volume: '0.4', price: '110', occurredAt: '2026-01-01T01:00:00Z', profit: '4', commission: '-0.4' }),
      deal({ ticketId: '3', event: 'exit', volume: '0.6', price: '120', occurredAt: '2026-01-01T02:00:00Z', profit: '12', commission: '-0.6', swap: '-1' }),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ status: 'closed', averageClosePrice: '116', grossProfit: '16', netProfit: '13' });
  });

  it('parses common localized numbers', () => {
    expect(parseDecimal('1,234.56 USD')).toBe('1234.56');
    expect(parseDecimal('1.234,56')).toBe('1234.56');
  });
});

describe('Dexie schema', () => {
  let database: TradingJournalDatabase;
  beforeEach(() => { database = new TradingJournalDatabase(`test-${Math.random()}`); });
  afterEach(async () => database.delete());

  it('enforces account-scoped deal identity and stores defaults', async () => {
    await database.open();
    expect(await database.settings.get('app')).toMatchObject({ schemaVersion: 1, theme: 'system' });
    await database.accounts.bulkAdd([
      { id: 'a', label: 'A', accountNumber: '1', platform: 'MT5', server: '', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', label: 'B', accountNumber: '2', platform: 'MT5', server: '', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    const base: Deal = { id: 'a:1', accountId: 'a', ticketId: '1', orderId: '1', positionId: '1', symbol: 'EURUSD', side: 'buy', event: 'entry', volume: '1', price: '1', occurredAt: '2026-01-01T00:00:00Z', sourceTime: '', profit: '0', commission: '0', swap: '0', sourceRow: 1 };
    await database.deals.bulkAdd([base, { ...base, id: 'b:1', accountId: 'b' }]);
    expect(await database.deals.count()).toBe(2);
  });

  it('stores one weekly reflection for each account and week', async () => {
    await database.open();
    await database.weeklyReviews.add({ id: 'r', accountId: 'a', weekStart: '2026-09-07T00:00:00.000Z', weekEnd: '2026-09-13T23:59:59.999Z', wentWell: '', toImprove: '', lesson: '', nextWeekFocus: '', createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z' });
    await expect(database.weeklyReviews.add({ id: 'r2', accountId: 'a', weekStart: '2026-09-07T00:00:00.000Z', weekEnd: '2026-09-13T23:59:59.999Z', wentWell: '', toImprove: '', lesson: '', nextWeekFocus: '', createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z' })).rejects.toThrow();
  });
});

describe('atomic import workflow', () => {
  beforeEach(async () => clearAllData());
  afterEach(async () => clearAllData());

  it('deduplicates a repeated file and retains journals on later imports', async () => {
    const account = await createAccount({ label: 'Utama', accountNumber: '123', currency: 'USD', sourceTimeZone: 'UTC' });
    const csv = 'Deal,Order,Position ID,Time,Type,Entry,Symbol,Volume,Price,Commission,Swap,Profit\n'
      + '1,10,99,2026.09.01 10:00:00,Buy,In,EURUSD,1,1.1,-1,0,0\n'
      + '2,10,99,2026.09.01 11:00:00,Sell,Out,EURUSD,1,1.2,-1,-0.5,10';
    const parsed = await parseExnessCsv(csv, account.id, 'UTC');
    const first = await importParsedData(account.id, 'history.csv', parsed);
    expect(first).toMatchObject({ inserted: 2, duplicates: 0, alreadyImported: false });
    expect(first.positions[0]).toMatchObject({ status: 'closed', netProfit: '7.5' });
    await upsertJournal({ positionId: first.positions[0].id, strategy: 'breakout' });
    const repeated = await importParsedData(account.id, 'history-copy.csv', parsed);
    expect(repeated).toMatchObject({ inserted: 0, duplicates: 2, alreadyImported: true });
    expect(await db.journals.where('positionId').equals(first.positions[0].id).count()).toBe(1);
  });

  it('allows the same broker ticket in separate accounts', async () => {
    const a = await createAccount({ label: 'A', accountNumber: '1', currency: 'USD', sourceTimeZone: 'UTC' });
    const b = await createAccount({ label: 'B', accountNumber: '2', currency: 'USD', sourceTimeZone: 'UTC' });
    const csv = 'Deal,Order,Position ID,Time,Type,Entry,Symbol,Volume,Price,Profit\n1,1,1,2026.09.01 10:00:00,Buy,In,EURUSD,1,1.1,0';
    await importParsedData(a.id, 'a.csv', await parseExnessCsv(csv, a.id, 'UTC'));
    await importParsedData(b.id, 'b.csv', await parseExnessCsv(csv, b.id, 'UTC'));
    expect(await db.deals.count()).toBe(2);
  });

  it('upserts a weekly review without affecting trading data', async () => {
    const account = await createAccount({ label: 'A', accountNumber: '1', currency: 'USD', sourceTimeZone: 'UTC' });
    await upsertWeeklyReview({ accountId: account.id, weekStart: '2026-09-07T00:00:00.000Z', weekEnd: '2026-09-13T23:59:59.999Z', lesson: 'Sabar' });
    const stored = await getWeeklyReview(account.id, '2026-09-07T00:00:00.000Z');
    expect(stored?.lesson).toBe('Sabar');
  });
});
