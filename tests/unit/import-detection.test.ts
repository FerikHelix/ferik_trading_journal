import { describe, expect, it } from 'vitest';
import { detectImportFormat, sha256Bytes } from '../../src/lib/import';

const bytes = (value: string) => new TextEncoder().encode(value);

describe('trade history format detection', () => {
  it('recognizes OOXML ZIP signatures as MT5 workbook candidates', () => {
    expect(detectImportFormat(Uint8Array.of(0x50, 0x4b, 0x03, 0x04))).toBe('mt5-xlsx');
    expect(detectImportFormat(Uint8Array.of(0x50, 0x4b, 0x05, 0x06))).toBe('mt5-xlsx');
    expect(detectImportFormat(Uint8Array.of(0x50, 0x4b, 0x07, 0x08))).toBe('mt5-xlsx');
  });

  it('recognizes supported Exness CSV headers', () => {
    expect(detectImportFormat(bytes('Ticket,Open Time,Type,Item\n1,2026.09.01 10:00:00,Buy,EURUSD'))).toBe('exness-csv');
    expect(detectImportFormat(bytes('Deal;Order;Position ID;Time;Type;Entry;Symbol\n1;2;3;2026.09.01 10:00:00;Buy;In;EURUSD'))).toBe('exness-csv');
    expect(detectImportFormat(bytes('ticket,opening_time_utc,closing_time_utc,type,lots,symbol\n1,2026-09-01T10:00:00,2026-09-01T11:00:00,buy,1,EURUSD'))).toBe('exness-csv');
  });

  it('does not treat unrelated text as a supported import', () => {
    expect(detectImportFormat(bytes('name,value\na,b'))).toBeUndefined();
  });
});

describe('binary import hashing', () => {
  it('hashes the exact file bytes with SHA-256', async () => {
    expect(await sha256Bytes(bytes('hello')))
      .toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
