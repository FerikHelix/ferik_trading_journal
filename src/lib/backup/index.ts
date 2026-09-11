import { z } from 'zod';
import Decimal from 'decimal.js';
import type { Account, AppSettings, BalanceEvent, Deal, ImportBatch, Journal, Position, WeeklyReview } from '../domain/types';

export const BACKUP_SCHEMA_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

export interface BackupSnapshot {
  schemaVersion: number;
  exportedAt: string;
  accounts: Account[];
  importBatches: ImportBatch[];
  deals: Deal[];
  positions: Position[];
  journals: Journal[];
  weeklyReviews: WeeklyReview[];
  balanceEvents: BalanceEvent[];
  settings: AppSettings[];
}

export interface EncryptedBackupEnvelope {
  format: 'ferik-trading-journal-encrypted';
  version: 1;
  algorithm: 'AES-GCM';
  keyDerivation: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const decimalString = z.string().refine((value) => {
  if (!value.trim()) return false;
  try { return new Decimal(value).isFinite(); } catch { return false; }
}, 'Nilai desimal tidak valid');
const isoString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Tanggal tidak valid');
const accountSchema = z.object({ id: z.string(), label: z.string(), accountNumber: z.string(), platform: z.literal('MT5'), server: z.string(), currency: z.string(), sourceTimeZone: z.string(), createdAt: isoString });
const importBatchSchema = z.object({ id: z.string(), accountId: z.string(), fileName: z.string(), fileHash: z.string(), importedAt: isoString, inserted: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), parserVersion: z.number().int().nonnegative() });
const dealSchema = z.object({ id: z.string(), accountId: z.string(), ticketId: z.string(), orderId: z.string(), positionId: z.string(), symbol: z.string(), side: z.enum(['buy', 'sell']), event: z.enum(['entry', 'exit', 'balance', 'unknown']), volume: decimalString, price: decimalString, occurredAt: isoString, sourceTime: z.string(), profit: decimalString, commission: decimalString, swap: decimalString, stopLoss: decimalString.optional(), takeProfit: decimalString.optional(), sourceRow: z.number().int().positive(), importBatchId: z.string().optional() });
const positionSchema = z.object({ id: z.string(), accountId: z.string(), positionId: z.string(), symbol: z.string(), side: z.enum(['buy', 'sell']), openAt: isoString, closeAt: isoString.optional(), averageOpenPrice: decimalString, averageClosePrice: decimalString, volume: decimalString, grossProfit: decimalString, commission: decimalString, swap: decimalString, netProfit: decimalString, stopLoss: decimalString.optional(), takeProfit: decimalString.optional(), status: z.enum(['closed', 'open']), dealIds: z.array(z.string()), groupingFallback: z.boolean().optional() });
const journalSchema = z.object({ id: z.string(), positionId: z.string(), strategy: z.string(), setup: z.string(), thesis: z.string(), emotion: z.string(), mistakes: z.array(z.string()), tags: z.array(z.string()), executionRating: z.number().min(1).max(5).optional(), riskAmount: decimalString.optional(), plannedRiskReward: decimalString.optional(), review: z.string(), createdAt: isoString, updatedAt: isoString });
const weeklyReviewSchema = z.object({ id: z.string(), accountId: z.string(), weekStart: isoString, weekEnd: isoString, wentWell: z.string(), toImprove: z.string(), lesson: z.string(), nextWeekFocus: z.string(), createdAt: isoString, updatedAt: isoString });
const balanceEventSchema = z.object({ id: z.string(), accountId: z.string(), ticketId: z.string(), type: z.enum(['deposit', 'withdrawal', 'credit', 'other']), amount: decimalString, occurredAt: isoString, comment: z.string() });
const settingsSchema = z.object({ id: z.literal('app'), schemaVersion: z.number().int().positive(), displayTimeZone: z.string(), theme: z.enum(['light', 'dark', 'system']), currencyDisplay: z.literal('account') });

const snapshotSchema = z.object({
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: isoString,
  accounts: z.array(accountSchema),
  importBatches: z.array(importBatchSchema).default([]),
  deals: z.array(dealSchema),
  positions: z.array(positionSchema),
  journals: z.array(journalSchema),
  weeklyReviews: z.array(weeklyReviewSchema).default([]),
  balanceEvents: z.array(balanceEventSchema),
  settings: z.array(settingsSchema),
});

const envelopeSchema = z.object({
  format: z.literal('ferik-trading-journal-encrypted'),
  version: z.literal(1),
  algorithm: z.literal('AES-GCM'),
  keyDerivation: z.literal('PBKDF2-SHA-256'),
  iterations: z.literal(PBKDF2_ITERATIONS),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Data backup base64 tidak valid.');
  }
}

export function validateSnapshot(input: unknown): BackupSnapshot {
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Backup tidak valid: ${parsed.error.issues[0]?.message ?? 'format tidak dikenali'}`);
  return parsed.data as BackupSnapshot;
}

export function serializeBackup(snapshot: BackupSnapshot): string {
  return JSON.stringify(validateSnapshot(snapshot), null, 2);
}

/** UI-facing name for creating the contents of a `.ftj.json` download. */
export const createPlainBackup = serializeBackup;

export function parseBackup(serialized: string): BackupSnapshot {
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new Error('Backup bukan JSON yang valid.'); }
  return validateSnapshot(value);
}

/** UI-facing name for previewing a `.ftj.json` restore before any DB mutation. */
export const parsePlainBackup = parseBackup;

function cryptoApi(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto tidak tersedia di browser ini.');
  return globalThis.crypto;
}

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]) {
  if (!password) throw new Error('Password backup tidak boleh kosong.');
  const crypto = cryptoApi();
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  );
}

export async function encryptBackup(snapshot: BackupSnapshot, password: string): Promise<string> {
  const crypto = cryptoApi();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoder.encode(serializeBackup(snapshot)));
  const envelope: EncryptedBackupEnvelope = {
    format: 'ferik-trading-journal-encrypted', version: 1, algorithm: 'AES-GCM', keyDerivation: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS, salt: encodeBase64(salt), iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackup(serialized: string, password: string): Promise<BackupSnapshot> {
  let unknownEnvelope: unknown;
  try { unknownEnvelope = JSON.parse(serialized); } catch { throw new Error('Backup terenkripsi bukan JSON yang valid.'); }
  const result = envelopeSchema.safeParse(unknownEnvelope);
  if (!result.success) throw new Error('Format backup terenkripsi tidak valid atau tidak didukung.');
  const envelope = result.data;
  try {
    const salt = decodeBase64(envelope.salt);
    const iv = decodeBase64(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('length');
    const key = await deriveKey(password, salt, ['decrypt']);
    const plaintext = await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, decodeBase64(envelope.ciphertext) as BufferSource);
    return parseBackup(decoder.decode(plaintext));
  } catch {
    throw new Error('Password salah atau file backup rusak. Data tidak diubah.');
  }
}
