import type { ImportSourceFormat } from '../domain/types';
import { hasSupportedExnessHeader } from './parser';

const ZIP_SIGNATURES = new Set(['80,75,3,4', '80,75,5,6', '80,75,7,8']);

export function detectImportFormat(bytes: Uint8Array): ImportSourceFormat | undefined {
  if (bytes.length >= 4 && ZIP_SIGNATURES.has([...bytes.subarray(0, 4)].join(','))) {
    return 'mt5-xlsx';
  }
  return hasSupportedExnessHeader(new TextDecoder().decode(bytes)) ? 'exness-csv' : undefined;
}
