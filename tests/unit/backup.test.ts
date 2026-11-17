import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, decryptBackup, encryptBackup, parseBackup, serializeBackup, type BackupSnapshot } from '../../src/lib/backup';

const snapshot: BackupSnapshot = {
  schemaVersion: BACKUP_SCHEMA_VERSION,
  exportedAt: '2026-09-10T00:00:00.000Z',
  accounts: [{ id: 'a', label: 'Main', accountNumber: '123', platform: 'MT5', server: 'demo', currency: 'USD', sourceTimeZone: 'UTC', kind: 'personal', createdAt: '2026-01-01T00:00:00Z' }],
  importBatches: [], deals: [], positions: [], journals: [], weeklyReviews: [], balanceEvents: [],
  plans: [], sessions: [],
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

  it('restores a version 1 backup as personal desks with no starting balance', () => {
    const account = { ...snapshot.accounts[0] } as Record<string, unknown>;
    delete account.kind;
    delete account.startingBalance;
    const legacy = {
      schemaVersion: 1,
      exportedAt: '2025-01-01T00:00:00.000Z',
      accounts: [account],
      importBatches: [], deals: [], positions: [], journals: [], weeklyReviews: [], balanceEvents: [],
      settings: snapshot.settings,
    };
    const restored = parseBackup(JSON.stringify(legacy));
    expect(restored.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(restored.accounts[0]).toMatchObject({ kind: 'personal' });
    expect(restored.accounts[0]?.startingBalance).toBeUndefined();
    expect(restored.plans).toEqual([]);
    expect(restored.sessions).toEqual([]);
  });

  it('preserves a prop desk plan and a session attestation', () => {
    const plan = {
      id: 'p', accountId: 'a', firm: 'FTMO', phase: 'Phase 1', startingBalance: '100000',
      effectiveFrom: '2026-11-01T00:00:00.000Z', resetTime: '00:00', resetTimeZone: 'Europe/Prague',
      maxDailyLossPct: 5, maxTotalLossPct: 10, totalLossMode: 'trailing' as const,
      profitTargetPct: 10, minTradingDays: 4, consistencyPct: null,
      softCaps: { tradesPerDay: 2 }, attested: [{ id: 'news', text: 'No trading around news' }],
      markdown: '# FTMO', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
    };
    const session = {
      id: 's', accountId: 'a', firmDay: '2026-11-17', lowestEquity: '98760',
      checklist: ['news'], note: 'Chased the open.', updatedAt: '2026-11-17T00:00:00.000Z',
    };
    const restored = parseBackup(serializeBackup({
      ...snapshot,
      accounts: [{ ...snapshot.accounts[0], kind: 'propfirm', startingBalance: '100000' }],
      plans: [plan],
      sessions: [session],
    }));
    expect(restored.plans[0]).toMatchObject({ totalLossMode: 'trailing', softCaps: { tradesPerDay: 2 } });
    expect(restored.sessions[0]).toMatchObject({ firmDay: '2026-11-17', lowestEquity: '98760', checklist: ['news'] });
  });

  it('preserves new import source metadata and accepts legacy batches without it', () => {
    const batch = { id: 'i', accountId: 'a', fileName: 'history.xlsx', fileHash: 'abc', importedAt: '2026-09-10T00:00:00.000Z', inserted: 2, duplicates: 0, failed: 0, parserVersion: 1, sourceFormat: 'mt5-xlsx' as const };
    expect(parseBackup(serializeBackup({ ...snapshot, importBatches: [batch] })).importBatches[0]?.sourceFormat).toBe('mt5-xlsx');
    const legacy = { ...batch } as Record<string, unknown>;
    delete legacy.sourceFormat;
    expect(parseBackup(JSON.stringify({ ...snapshot, importBatches: [legacy] })).importBatches[0]?.sourceFormat).toBeUndefined();
  });

  it('round-trips AES-GCM encryption and safely rejects a wrong password', async () => {
    const encrypted = await encryptBackup(snapshot, 'correct horse battery staple');
    expect(await decryptBackup(encrypted, 'correct horse battery staple')).toEqual(snapshot);
    await expect(decryptBackup(encrypted, 'wrong')).rejects.toThrow('Password salah');
  }, 20_000);
});
