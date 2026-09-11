import Papa from 'papaparse';
import { z } from 'zod';
import type { BalanceEvent, Deal, ImportIssue, ParsedImport, TradeSide } from '../domain/types';
import { parseDecimal } from './numbers';
import { parseBrokerTime } from './time';

export const EXNESS_PARSER_VERSION = 2;

const aliases = {
  ticket: ['deal', 'dealid', 'ticket', 'ticketid'],
  order: ['order', 'orderid'],
  position: ['position', 'positionid', 'position id'],
  symbol: ['symbol', 'item', 'instrument'],
  type: ['type', 'dealtype', 'direction'],
  entry: ['entry', 'dealentry'],
  volume: ['volume', 'size', 'lots', 'lot'],
  time: ['time', 'dealtime', 'date', 'closetime'],
  openTime: ['opentime', 'openingtime'],
  closeTime: ['closetime', 'closingtime'],
  openTimeUtc: ['opentimeutc', 'openingtimeutc'],
  closeTimeUtc: ['closetimeutc', 'closingtimeutc'],
  price: ['price', 'closeprice', 'closingprice'],
  openPrice: ['openprice', 'openingprice'],
  profit: ['profit', 'pnl', 'profitloss'],
  commission: ['commission', 'fee'],
  swap: ['swap'],
  sl: ['sl', 'stoploss'],
  tp: ['tp', 'takeprofit'],
  comment: ['comment', 'description'],
  amount: ['amount'],
} as const;

const cleanHeader = (value: string) => value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const requiredRow = z.record(z.string(), z.string());

function findHeader(rows: string[][]): number {
  return rows.findIndex((row) => {
    const keys = row.map(cleanHeader);
    return keys.some((key) => [...aliases.ticket, ...aliases.order].map(cleanHeader).includes(key))
      && keys.some((key) => [...aliases.type, ...aliases.symbol].map(cleanHeader).includes(key));
  });
}

function get(row: Record<string, string>, names: readonly string[]): string {
  for (const alias of names) {
    const value = row[cleanHeader(alias)];
    if (value !== undefined) return value.trim();
  }
  return '';
}

function sideFrom(type: string): TradeSide | null {
  const normalized = type.toLowerCase();
  if (normalized.includes('buy')) return 'buy';
  if (normalized.includes('sell')) return 'sell';
  return null;
}

function balanceType(type: string, comment: string, amount: string): BalanceEvent['type'] {
  const text = `${type} ${comment}`.toLowerCase();
  if (text.includes('credit')) return 'credit';
  if (text.includes('withdraw') || text.includes('penarikan')) return 'withdrawal';
  if (text.includes('deposit') || text.includes('balance')) return Number(amount) < 0 ? 'withdrawal' : 'deposit';
  return 'other';
}

export async function sha256Text(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Parse an Exness MT5 deal-history or closed-order CSV without uploading it. */
export async function parseExnessCsv(
  text: string,
  accountId: string,
  sourceTimeZone: string,
): Promise<ParsedImport> {
  const matrix = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (matrix.errors.length && matrix.data.length === 0) throw new Error(matrix.errors[0].message);
  const headerIndex = findHeader(matrix.data);
  if (headerIndex < 0) throw new Error('Header CSV Exness tidak ditemukan. Pastikan file adalah riwayat MT5.');
  const headers = matrix.data[headerIndex].map(cleanHeader);
  const rows = matrix.data.slice(headerIndex + 1);
  const deals: Deal[] = [];
  const balanceEvents: BalanceEvent[] = [];
  const issues: ImportIssue[] = [];
  const preview: Record<string, string>[] = [];
  let skipped = 0;

  rows.forEach((values, index) => {
    const sourceRow = headerIndex + index + 2;
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? '']));
    if (!requiredRow.safeParse(row).success) return;
    if (preview.length < 10) preview.push(Object.fromEntries(matrix.data[headerIndex].map((h, i) => [h, values[i] ?? ''])));
    try {
      const orderValue = get(row, aliases.order);
      const ticketId = get(row, aliases.ticket) || orderValue;
      const orderId = orderValue || ticketId;
      const positionId = get(row, aliases.position);
      const type = get(row, aliases.type);
      const symbol = get(row, aliases.symbol);
      const comment = get(row, aliases.comment);
      const profitRaw = get(row, aliases.profit) || get(row, aliases.amount);
      if (!ticketId) throw new Error('Ticket/deal ID kosong');

      const balanceLike = /balance|deposit|withdraw|credit/i.test(`${type} ${comment}`)
        || (!symbol && !sideFrom(type) && Boolean(profitRaw));
      const closeTimeUtc = get(row, aliases.closeTimeUtc);
      const openTimeUtc = get(row, aliases.openTimeUtc);
      const closeTime = closeTimeUtc || get(row, aliases.closeTime);
      const openTime = openTimeUtc || get(row, aliases.openTime);
      const rawTime = get(row, aliases.time) || closeTime || openTime;
      const occurredAt = parseBrokerTime(rawTime, closeTimeUtc || (!closeTime && openTimeUtc) ? 'UTC' : sourceTimeZone);
      if (balanceLike) {
        const amount = parseDecimal(profitRaw);
        balanceEvents.push({
          id: `${accountId}:${ticketId}`,
          accountId, ticketId, type: balanceType(type, comment, amount), amount, occurredAt, comment,
        });
        return;
      }

      if (/limit|\bstop\b|pending/i.test(type)) {
        skipped += 1;
        issues.push({ row: sourceRow, severity: 'warning', message: 'Pending order dilewati.' });
        return;
      }
      const side = sideFrom(type);
      if (!side || !symbol) throw new Error('Type buy/sell atau symbol tidak dikenali');
      const entryValue = get(row, aliases.entry).toLowerCase();
      const event = /^(in|entry|open)$/.test(entryValue) ? 'entry'
        : /out|exit|close/.test(entryValue) || Boolean(closeTime) ? 'exit' : 'unknown';
      if (event === 'unknown') {
        skipped += 1;
        issues.push({ row: sourceRow, severity: 'warning', message: 'Status entry/exit tidak dikenali; baris dilewati.' });
        return;
      }
      deals.push({
        id: `${accountId}:${ticketId}`,
        accountId, ticketId, orderId, positionId, symbol, side, event,
        volume: parseDecimal(get(row, aliases.volume)),
        price: parseDecimal(get(row, aliases.price)),
        occurredAt, sourceTime: rawTime,
        profit: parseDecimal(profitRaw),
        commission: parseDecimal(get(row, aliases.commission)),
        swap: parseDecimal(get(row, aliases.swap)),
        stopLoss: get(row, aliases.sl) ? parseDecimal(get(row, aliases.sl)) : undefined,
        takeProfit: get(row, aliases.tp) ? parseDecimal(get(row, aliases.tp)) : undefined,
        sourceRow,
        embeddedOpenAt: closeTime && openTime ? parseBrokerTime(openTime, openTimeUtc ? 'UTC' : sourceTimeZone) : undefined,
        embeddedOpenPrice: closeTime && get(row, aliases.openPrice) ? parseDecimal(get(row, aliases.openPrice)) : undefined,
      });
      if (!positionId && !closeTime) issues.push({ row: sourceRow, severity: 'warning', message: 'Position ID kosong; grouping memakai order/ticket.' });
    } catch (error) {
      issues.push({ row: sourceRow, severity: 'error', message: error instanceof Error ? error.message : 'Baris tidak valid' });
    }
  });

  return { deals, balanceEvents, skipped, issues, preview, fileHash: await sha256Text(text) };
}

export const supportedHeaderAliases = aliases;
