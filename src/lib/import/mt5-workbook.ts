import Decimal from 'decimal.js';
import { read, utils, type WorkSheet } from 'xlsx';
import type { BalanceEvent, Deal, DetectedAccountMetadata, ImportIssue, ImportPreview, TradeSide } from '../domain/types';
import { sha256Bytes } from './hash';
import { parseDecimal } from './numbers';
import { parseBrokerTime } from './time';

export const MT5_WORKBOOK_PARSER_VERSION = 1;

type Row = string[];

const cell = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => cell(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function worksheetRows(sheet: WorkSheet): Row[] {
  return utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
    .map((row) => row.map(cell));
}

function findMarker(rows: Row[], marker: string, start = 0): number {
  const wanted = normalized(marker);
  return rows.findIndex((row, index) => index >= start && normalized(row[0]) === wanted);
}

function metadataValue(rows: Row[], label: string): string {
  const row = rows.find((candidate) => normalized(candidate[0]) === normalized(label));
  return row?.slice(1).find((value) => value.trim()) ?? '';
}

function accountMetadata(rows: Row[], sourceTimeZone: string): DetectedAccountMetadata | undefined {
  const account = metadataValue(rows, 'Account');
  const company = metadataValue(rows, 'Company');
  const match = account.match(/^\s*([^\s(]+)\s*\(([^)]*)\)/);
  const accountNumber = match?.[1]?.trim() ?? '';
  const details = match?.[2]?.split(',').map((value) => value.trim()) ?? [];
  const currency = details[0] || 'USD';
  const server = details[1] ?? '';
  if (!company || !server) return undefined;
  return {
    label: `${company} · ${accountNumber || server}`,
    accountNumber,
    server,
    currency,
    sourceTimeZone,
  };
}

function indexes(header: Row) {
  const byName = (name: string) => header
    .map((value, index) => normalized(value) === normalized(name) ? index : -1)
    .filter((index) => index >= 0);
  return {
    times: byName('Time'),
    prices: byName('Price'),
    position: byName('Position')[0] ?? -1,
    symbol: byName('Symbol')[0] ?? -1,
    type: byName('Type')[0] ?? -1,
    volume: byName('Volume')[0] ?? -1,
    stopLoss: byName('S / L')[0] ?? -1,
    takeProfit: byName('T / P')[0] ?? -1,
    commission: byName('Commission')[0] ?? -1,
    swap: byName('Swap')[0] ?? -1,
    profit: byName('Profit')[0] ?? -1,
  };
}

function positionHeaderIndex(rows: Row[], positionsIndex: number, ordersIndex: number): number {
  return rows.findIndex((row, index) => {
    if (index <= positionsIndex || (ordersIndex >= 0 && index >= ordersIndex)) return false;
    const keys = row.map(normalized);
    return keys.includes('position') && keys.includes('symbol') && keys.includes('type')
      && keys.includes('volume') && keys.filter((key) => key === 'time').length >= 2
      && keys.filter((key) => key === 'price').length >= 2;
  });
}

function sideFrom(value: string): TradeSide | undefined {
  const key = value.toLowerCase();
  if (key.includes('buy')) return 'buy';
  if (key.includes('sell')) return 'sell';
  return undefined;
}

function optionalDecimal(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const result = parseDecimal(value);
  return new Decimal(result).isZero() ? undefined : result;
}

function previewRecord(header: Row, row: Row): Record<string, string> {
  return Object.fromEntries(header.map((name, index) => [name || `Column ${index + 1}`, row[index] ?? '']));
}

function balanceKind(type: string, comment: string, amount: string): BalanceEvent['type'] {
  const text = `${type} ${comment}`.toLowerCase();
  if (text.includes('credit')) return 'credit';
  if (text.includes('withdraw')) return 'withdrawal';
  if (text.includes('deposit') || text.includes('balance')) return new Decimal(amount).isNegative() ? 'withdrawal' : 'deposit';
  return 'other';
}

function firstValueAfterLabel(row: Row): string {
  return row.slice(1).find((value) => value.trim()) ?? '';
}

export async function parseMt5Workbook(buffer: ArrayBuffer, sourceTimeZone: string): Promise<ImportPreview> {
  const workbook = read(buffer);
  let rows: Row[] | undefined;
  for (const name of workbook.SheetNames) {
    const candidate = worksheetRows(workbook.Sheets[name]);
    if (findMarker(candidate, 'Trade History Report') >= 0 && findMarker(candidate, 'Positions') >= 0) {
      rows = candidate;
      break;
    }
  }
  if (!rows) throw new Error('Worksheet report history MT5 tidak ditemukan.');

  const positionsIndex = findMarker(rows, 'Positions');
  const ordersIndex = findMarker(rows, 'Orders', positionsIndex + 1);
  const headerIndex = positionHeaderIndex(rows, positionsIndex, ordersIndex);
  if (headerIndex < 0) throw new Error('Header Positions MT5 tidak ditemukan.');
  const header = rows[headerIndex];
  const columns = indexes(header);
  const required = [columns.position, columns.symbol, columns.type, columns.volume, columns.commission, columns.swap, columns.profit];
  if (columns.times.length < 2 || columns.prices.length < 2 || required.some((index) => index < 0)) {
    throw new Error('Header Positions MT5 tidak lengkap.');
  }

  const deals: Deal[] = [];
  const balanceEvents: BalanceEvent[] = [];
  const issues: ImportIssue[] = [];
  const preview: Record<string, string>[] = [];
  let skipped = 0;
  const positionsEnd = ordersIndex >= 0 ? ordersIndex : rows.length;
  for (let index = headerIndex + 1; index < positionsEnd; index += 1) {
    const row = rows[index];
    if (!row.some((value) => value.trim())) continue;
    const sourceRow = index + 1;
    if (preview.length < 10) preview.push(previewRecord(header, row));
    try {
      const positionId = row[columns.position]?.trim();
      const symbol = row[columns.symbol]?.trim();
      const side = sideFrom(row[columns.type] ?? '');
      if (!positionId) throw new Error('Position ID kosong');
      if (!symbol || !side) throw new Error('Type buy/sell atau symbol tidak dikenali');
      const closeTime = row[columns.times[1]] ?? '';
      const openTime = row[columns.times[0]] ?? '';
      const ticketId = `mt5-position:${positionId}`;
      deals.push({
        id: `preview:${ticketId}`,
        accountId: 'preview',
        ticketId,
        orderId: positionId,
        positionId,
        symbol,
        side,
        event: 'exit',
        volume: parseDecimal(row[columns.volume]),
        price: parseDecimal(row[columns.prices[1]]),
        occurredAt: parseBrokerTime(closeTime, sourceTimeZone),
        sourceTime: closeTime,
        profit: parseDecimal(row[columns.profit]),
        commission: parseDecimal(row[columns.commission]),
        swap: parseDecimal(row[columns.swap]),
        stopLoss: columns.stopLoss >= 0 ? optionalDecimal(row[columns.stopLoss] ?? '') : undefined,
        takeProfit: columns.takeProfit >= 0 ? optionalDecimal(row[columns.takeProfit] ?? '') : undefined,
        sourceRow,
        embeddedOpenAt: parseBrokerTime(openTime, sourceTimeZone),
        embeddedOpenPrice: parseDecimal(row[columns.prices[0]]),
      });
    } catch (error) {
      skipped += 1;
      issues.push({ row: sourceRow, severity: 'error', message: error instanceof Error ? error.message : 'Baris posisi tidak valid' });
    }
  }

  const dealsIndex = findMarker(rows, 'Deals', Math.max(positionsIndex + 1, ordersIndex + 1));
  const resultsIndex = findMarker(rows, 'Results', Math.max(positionsIndex + 1, dealsIndex + 1));
  if (dealsIndex >= 0) {
    const dealsHeaderIndex = rows.findIndex((row, index) => index > dealsIndex
      && (resultsIndex < 0 || index < resultsIndex)
      && row.map(normalized).includes('deal')
      && row.map(normalized).includes('type')
      && row.map(normalized).includes('profit'));
    if (dealsHeaderIndex >= 0) {
      const dealHeader = rows[dealsHeaderIndex].map(normalized);
      const at = (name: string) => dealHeader.indexOf(normalized(name));
      const timeColumn = at('Time');
      const ticketColumn = at('Deal');
      const typeColumn = at('Type');
      const profitColumn = at('Profit');
      const commentColumn = at('Comment');
      const dealsEnd = resultsIndex >= 0 ? resultsIndex : rows.length;
      for (let index = dealsHeaderIndex + 1; index < dealsEnd; index += 1) {
        const row = rows[index];
        const type = row[typeColumn] ?? '';
        const comment = commentColumn >= 0 ? row[commentColumn] ?? '' : '';
        if (!/balance|deposit|withdraw|credit/i.test(`${type} ${comment}`)) continue;
        try {
          const ticketId = row[ticketColumn]?.trim();
          if (!ticketId) throw new Error('Deal ID balance kosong');
          const amount = parseDecimal(row[profitColumn]);
          balanceEvents.push({
            id: `preview:${ticketId}`,
            accountId: 'preview',
            ticketId,
            type: balanceKind(type, comment, amount),
            amount,
            occurredAt: parseBrokerTime(row[timeColumn] ?? '', sourceTimeZone),
            comment,
          });
        } catch (error) {
          issues.push({ row: index + 1, severity: 'error', message: error instanceof Error ? error.message : 'Balance event tidak valid' });
        }
      }
    }
  }

  if (resultsIndex >= 0) {
    const resultRows = rows.slice(resultsIndex + 1);
    const totalTradesRow = resultRows.find((row) => normalized(row[0]) === 'totaltrades');
    const totalNetRow = resultRows.find((row) => normalized(row[0]) === 'totalnetprofit');
    if (totalTradesRow) {
      const reported = Number.parseInt(firstValueAfterLabel(totalTradesRow), 10);
      if (Number.isFinite(reported) && reported !== deals.length) {
        issues.push({ row: rows.indexOf(totalTradesRow) + 1, severity: 'warning', message: `Total trade report (${reported}) berbeda dari hasil import (${deals.length}).` });
      }
    }
    if (totalNetRow) {
      const reported = new Decimal(parseDecimal(firstValueAfterLabel(totalNetRow)));
      const imported = deals.reduce((total, deal) => total.plus(deal.profit).plus(deal.commission).plus(deal.swap), new Decimal(0));
      if (reported.minus(imported).abs().gt(0.01)) {
        issues.push({ row: rows.indexOf(totalNetRow) + 1, severity: 'warning', message: `Total net profit report (${reported}) berbeda dari hasil import (${imported}).` });
      }
    }
  }

  return {
    sourceFormat: 'mt5-xlsx',
    sourceLabel: 'MT5 Workbook',
    parserVersion: MT5_WORKBOOK_PARSER_VERSION,
    detectedAccount: accountMetadata(rows, sourceTimeZone),
    deals,
    balanceEvents,
    skipped,
    issues,
    preview,
    fileHash: await sha256Bytes(buffer),
  };
}
