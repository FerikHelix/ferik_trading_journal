import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, decryptBackup, encryptBackup, parseBackup, serializeBackup, type BackupSnapshot } from '../../src/lib/backup';

const snapshot: BackupSnapshot = {
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: '2026-09-10T00:00:00.000Z',
  accounts: [{ id: 'a', label: 'Main', accountNumber: '123', platform: 'MT5', server: 'demo', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' }],
  importBatches: [], deals: [], positions: [], journals: [], balanceEvents: [],
  settings: [{ id: 'app', schemaVersion: 1, displayTimeZone: 'Asia/Bangkok', theme: 'dark', currencyDisplay: 'account' }],
};

describe('backup', () => {
  it('round-trips a validated plain backup', () => {
    expect(parseBackup(serializeBackup(snapshot))).toEqual(snapshot);
    expect(() => parseBackup('{bad')).toThrow('bukan JSON');
  });

  it('accepts every supported theme preference in a backup', () => {
    expect(parseBackup(serializeBackup({ ...snapshot, settings: [{ ...snapshot.settings[0], theme: 'light' }] })).settings[0]?.theme).toBe('light');
    expect(parseBackup(serializeBackup({ ...snapshot, settings: [{ ...snapshot.settings[0], theme: 'system' }] })).settings[0]?.theme).toBe('system');
  });

  it('round-trips AES-GCM encryption and safely rejects a wrong password', async () => {
    const encrypted = await encryptBackup(snapshot, 'correct horse battery staple');
    expect(await decryptBackup(encrypted, 'correct horse battery staple')).toEqual(snapshot);
    await expect(decryptBackup(encrypted, 'wrong')).rejects.toThrow('Password salah');
  }, 20_000);
});
