import type { ImportPreview } from '../domain/types';
import { detectImportFormat } from './detect';
import { parseMt5Workbook } from './mt5-workbook';
import { EXNESS_PARSER_VERSION, parseExnessCsv } from './parser';

export async function parseTradeHistoryFile(file: File, sourceTimeZone: string): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = detectImportFormat(bytes);
  if (!format) throw new Error('Format file tidak didukung. Pilih MT5 workbook atau Exness CSV.');
  if (format === 'mt5-xlsx') {
    try {
      return await parseMt5Workbook(buffer, sourceTimeZone);
    } catch {
      throw new Error('Workbook MT5 tidak dapat dibaca. Pastikan file adalah report history MT5.');
    }
  }
  try {
    const parsed = await parseExnessCsv(new TextDecoder().decode(bytes), 'preview', sourceTimeZone);
    return {
      ...parsed,
      sourceFormat: 'exness-csv',
      sourceLabel: 'Exness CSV',
      parserVersion: EXNESS_PARSER_VERSION,
    };
  } catch {
    throw new Error('CSV Exness tidak dapat dibaca. Pastikan file adalah riwayat trading yang didukung.');
  }
}
