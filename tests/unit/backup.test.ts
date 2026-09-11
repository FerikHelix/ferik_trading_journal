import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, decryptBackup, encryptBackup, parseBackup, serializeBackup, type BackupSnapshot } from '../../src/lib/backup';

const snapshot: BackupSnapshot = {
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: '2026-09-10T00:00:00.000Z',
  accounts: [{ id: 'a', label: 'Main', accountNumber: '123', platform: 'MT5', server: 'demo', currency: 'USD', sourceTimeZone: 'UTC', createdAt: '2026-01-01T00:00:00Z' }],
  importBatches: [], deals: [], positions: [], journals: [], weeklyReviews: [], balanceEvents: [],
  settings: [{ id: 'app', schemaVersion: 1, displayTimeZone: 'Asia/Bangkok', theme: 'dark', currencyDisplay: 'account' }],
};

describe('backup', () => {
  it('round-trips a validated plain backup', () => {
    expect(parseBackup(serializeBackup(snapshot))).toEqual(snapshot);
    expect(() => parseBackup('{bad')).toThrow('bukan JSON');
  });

  it('preserves weekly reflections in a backup', () => {
    const withReview: BackupSnapshot = { ...snapshot, weeklyReviews: [{ id: 'w', accountId: 'a', weekStart: '2026-09-07T00:00:00.000Z', weekEnd: '2026-09-13T23:59:59.999Z', wentWell: 'Patuh plan', toImprove: 'Kurangi FOMO', lesson: 'Tunggu konfirmasi', nextWeekFocus: 'Risk konsisten', createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:00.000Z' }] };
    expect(parseBackup(serializeBackup(withReview)).weeklyReviews).toEqual(withReview.weeklyReviews);
  });

  it('accepts every supported theme preference in a backup', () => {
    expect(parseBackup(serializeBackup({ ...snapshot, settings: [{ ...snapshot.settings[0], theme: 'light' }] })).settings[0]?.theme).toBe('light');
    expect(parseBackup(serializeBackup({ ...snapshot, settings: [{ ...snapshot.settings[0], theme: 'system' }] })).settings[0]?.theme).toBe('system');
  });

  it('restores a legacy backup without weekly reviews as an empty list', () => {
    const legacy = { ...snapshot } as Record<string, unknown>;
    delete legacy.weeklyReviews;
    expect(parseBackup(JSON.stringify(legacy)).weeklyReviews).toEqual([]);
  });

  it('round-trips AES-GCM encryption and safely rejects a wrong password', async () => {
    const encrypted = await encryptBackup(snapshot, 'correct horse battery staple');
    expect(await decryptBackup(encrypted, 'correct horse battery staple')).toEqual(snapshot);
    await expect(decryptBackup(encrypted, 'wrong')).rejects.toThrow('Password salah');
  }, 20_000);
});
