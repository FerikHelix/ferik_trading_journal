import type { ImportSourceFormat } from '../domain/types';
import { hasSupportedExnessHeader } from './parser';

const ZIP_SIGNATURES = new Set(['80,75,3,4', '80,75,5,6', '80,75,7,8']);

/**
 * The MT5 report carries a title row and a `Positions` section marker. Checking
 * for both is enough to tell it apart from a deal-history CSV, and it lets the
 * report saved as CSV reach the same parser as the workbook.
 */
export function hasMt5ReportRows(text: string): boolean {
  const marker = (label: string) =>
    new RegExp(`^[ \\t]*"?${label}"?[ \\t]*(?=[,;\\t]|$)`, 'im').test(text);
  return marker('trade history report') && marker('positions');
}

export function detectImportFormat(bytes: Uint8Array): ImportSourceFormat | undefined {
  if (bytes.length >= 4 && ZIP_SIGNATURES.has([...bytes.subarray(0, 4)].join(','))) {
    return 'mt5-xlsx';
  }
  const text = new TextDecoder().decode(bytes);
  if (hasMt5ReportRows(text)) return 'mt5-csv';
  return hasSupportedExnessHeader(text) ? 'exness-csv' : undefined;
}
