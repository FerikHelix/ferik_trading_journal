import Papa from 'papaparse';
import type { ImportPreview } from '../domain/types';
import { sha256Text } from './hash';
import { parseMt5ReportRows } from './mt5-workbook';

/**
 * Reads a grid out of CSV text. Papa detects the delimiter, which matters because
 * MT5 reports arrive comma-, semicolon- and tab-separated depending on locale.
 */
export function csvRows(text: string): string[][] {
  const matrix = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
  if (matrix.errors.length && matrix.data.length === 0) throw new Error(matrix.errors[0].message);
  return matrix.data.map((row) => (Array.isArray(row) ? row.map((value) => String(value ?? '').trim()) : []));
}

/**
 * An MT5 report saved as CSV instead of a workbook. Same tables, same metadata
 * rows, so it goes through the shared report parser rather than a second parser
 * that would drift from it.
 */
export async function parseMt5Csv(text: string, sourceTimeZone: string): Promise<ImportPreview> {
  return parseMt5ReportRows(csvRows(text), sourceTimeZone, {
    sourceFormat: 'mt5-csv',
    sourceLabel: 'MT5 CSV',
    fileHash: await sha256Text(text),
  });
}
