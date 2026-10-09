import { describe, expect, it } from 'vitest';
import { aggregatePositions, parseMt5Workbook, parseTradeHistoryFile } from '../../src/lib/import';
import { makeMt5Workbook } from '../fixtures/mt5Workbook';

const asArrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe('MT5 workbook parser', () => {
  it('extracts MT5 metadata, positions, balance events, and summary totals', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook()), 'Asia/Bangkok');

    expect(preview).toMatchObject({
      sourceFormat: 'mt5-xlsx',
      sourceLabel: 'MT5 Workbook',
      parserVersion: 1,
      detectedAccount: {
        label: 'Example Broker Ltd · 123456',
        accountNumber: '123456',
        server: 'Broker-Live',
        currency: 'USD',
        sourceTimeZone: 'Asia/Bangkok',
      },
    });
    expect(preview.deals).toHaveLength(2);
    expect(preview.balanceEvents).toHaveLength(1);
    expect(preview.balanceEvents[0]).toMatchObject({ ticketId: '700', amount: '1000', type: 'deposit' });
    expect(aggregatePositions(preview.deals).map((position) => position.netProfit)).toEqual(['18.5', '-10.5']);
    expect(preview.issues).toEqual([]);
    expect(preview.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses the supplied browser timezone for workbook timestamps', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook()), 'Asia/Bangkok');
    expect(preview.deals[0].embeddedOpenAt).toBe('2026-09-01T03:00:00.000Z');
    expect(preview.deals[0].occurredAt).toBe('2026-09-01T04:00:00.000Z');
  });

  it('finds report markers when the sheet name and section rows move', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook({ extraLeadingRows: 4, sheetName: 'Broker Export' })), 'UTC');
    expect(preview.deals.map((deal) => deal.positionId)).toEqual(['501', '502']);
    expect(preview.issues.some((issue) => issue.message.toLowerCase().includes('canceled'))).toBe(false);
  });

  it('skips an invalid position row, preserves valid rows, and records an issue', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook({ invalidSecondPosition: true })), 'UTC');
    expect(preview.deals.map((deal) => deal.positionId)).toEqual(['501']);
    expect(preview.issues.some((issue) => issue.severity === 'error' && issue.row > 0)).toBe(true);
  });

  it('warns instead of failing when Results totals differ', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook({ wrongTotalTrades: true })), 'UTC');
    expect(preview.deals).toHaveLength(2);
    expect(preview.issues).toContainEqual(expect.objectContaining({ severity: 'warning', message: expect.stringContaining('Total trade') }));
  });

  it('returns no detected account when metadata is missing but keeps parsed trades', async () => {
    const preview = await parseMt5Workbook(asArrayBuffer(makeMt5Workbook({ missingMetadata: true })), 'UTC');
    expect(preview.detectedAccount).toBeUndefined();
    expect(preview.deals).toHaveLength(2);
  });

  it('rejects a workbook without the required Positions headers', async () => {
    await expect(parseMt5Workbook(asArrayBuffer(makeMt5Workbook({ omitPositionsHeader: true })), 'UTC'))
      .rejects.toThrow(/header Positions/i);
  });
});

describe('trade history file dispatcher', () => {
  it('dispatches MT5 XLSX and existing Exness CSV into one ImportPreview shape', async () => {
    const workbook = new File([asArrayBuffer(makeMt5Workbook())], 'history.xlsx');
    const csv = new File([
      'Ticket,Open Time,Type,Size,Item,Open Price,Close Time,Close Price,Commission,Swap,Profit\n'
      + '900,2026.09.01 10:00:00,Buy,0.20,EURUSD,1.1000,2026.09.01 11:00:00,1.1050,-1,-0.5,20',
    ], 'history.csv', { type: 'text/csv' });

    await expect(parseTradeHistoryFile(workbook, 'UTC')).resolves.toMatchObject({ sourceFormat: 'mt5-xlsx', parserVersion: 1 });
    await expect(parseTradeHistoryFile(csv, 'UTC')).resolves.toMatchObject({ sourceFormat: 'exness-csv', sourceLabel: 'Exness CSV', parserVersion: 2 });
  });

  it('rejects corrupt ZIP bytes and unrelated text with neutral errors', async () => {
    const corrupt = new File([Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 1, 2, 3)], 'broken.xlsx');
    const unrelated = new File(['name,value\na,b'], 'other.csv', { type: 'text/csv' });

    await expect(parseTradeHistoryFile(corrupt, 'UTC')).rejects.toThrow('Workbook MT5 tidak dapat dibaca');
    await expect(parseTradeHistoryFile(unrelated, 'UTC')).rejects.toThrow('Format file tidak didukung');
  });
});
