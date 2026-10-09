import { utils, write } from 'xlsx';

export interface Mt5FixtureOptions {
  extraLeadingRows?: number;
  sheetName?: string;
  missingMetadata?: boolean;
  invalidSecondPosition?: boolean;
  wrongTotalTrades?: boolean;
  omitPositionsHeader?: boolean;
}

export function makeMt5Workbook(options: Mt5FixtureOptions = {}): Uint8Array {
  const rows: Array<Array<string | number>> = [];
  for (let index = 0; index < (options.extraLeadingRows ?? 0); index += 1) rows.push([]);
  rows.push(['Trade History Report']);
  if (!options.missingMetadata) {
    rows.push(['Name:', '', '', 'Test Trader']);
    rows.push(['Account:', '', '', '123456 (USD, Broker-Live, real, Hedge)']);
    rows.push(['Company:', '', '', 'Example Broker Ltd']);
  }
  rows.push(['Date:', '', '', '2026.09.02 14:00']);
  rows.push(['Positions']);
  if (!options.omitPositionsHeader) {
    rows.push(['Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit']);
  }
  rows.push(['2026.09.01 10:00:00', '501', 'EURUSD', 'buy', '0.20', '1.1000', '1.0900', '1.1200', '2026.09.01 11:00:00', '1.1050', '-1', '-0.5', '20']);
  rows.push(['2026.09.01 12:00:00', '502', 'XAUUSD', 'sell', '0.10', '2500', '2520', '2470', options.invalidSecondPosition ? 'bad-time' : '2026.09.01 13:00:00', '2510', '-0.5', '0', '-10']);
  rows.push(['Orders']);
  rows.push(['Open Time', 'Order', 'Symbol', 'Type', 'Volume', 'Price', 'S / L', 'T / P', 'Time', 'State', '', 'Comment']);
  rows.push(['2026.09.01 08:00:00', '499', 'EURUSD', 'buy limit', '0.20 / 0', '1.0900', '', '', '2026.09.01 08:30:00', 'canceled']);
  rows.push(['Deals']);
  rows.push(['Time', 'Deal', 'Symbol', 'Type', 'Direction', 'Volume', 'Price', 'Order', 'Commission', 'Fee', 'Swap', 'Profit', 'Balance', 'Comment']);
  rows.push(['2026.09.01 09:00:00', '700', '', 'balance', '', '', '', '', '0', '0', '0', '1000', '1000', 'Deposit test']);
  rows.push(['2026.09.01 10:00:00', '701', 'EURUSD', 'buy', 'in', '0.20', '1.1000', '501', '0', '0', '0', '0', '1000', '']);
  rows.push(['Results']);
  rows.push(['Total Net Profit:', '', '', '8.00']);
  rows.push(['Total Trades:', '', '', options.wrongTotalTrades ? '99' : '2']);

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), options.sheetName ?? 'Statement');
  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }));
}
