import type { Account, AppSettings, Journal, Position, Deal, ParsedImport, WeeklyReview } from '../lib/domain/types';
import { db, clearAllData, createAccount, getAccounts, getAppSettings, getJournals, getPositions, getPositionWithDeals, getWeeklyReview, importParsedData, updateThemePreference, upsertJournal, upsertWeeklyReview, type ImportCommitResult } from '../lib/db';
import { parseExnessCsv } from '../lib/import';
import type { BackupSnapshot } from '../lib/backup';

export async function loadAccounts(): Promise<Account[]> {
  return getAccounts();
}

export async function loadPositions(): Promise<Position[]> {
  return getPositions();
}

export async function loadJournals(): Promise<Journal[]> {
  return getJournals();
}

export async function loadAppSettings(): Promise<AppSettings> {
  return getAppSettings();
}

export async function saveThemePreference(theme: AppSettings['theme']): Promise<AppSettings> {
  return updateThemePreference(theme);
}

export async function loadPositionBundle(id: string): Promise<{ position?: Position; deals: Deal[]; journal?: Journal }> {
  const bundle = await getPositionWithDeals(id);
  const journal = (await getJournals([id]))[0];
  return { ...bundle, journal };
}

export async function addAccount(input: Omit<Account, 'id' | 'createdAt' | 'platform'>): Promise<Account> {
  return createAccount(input);
}

export async function saveJournal(journal: Journal): Promise<void> {
  await upsertJournal(journal);
}

export async function loadWeeklyReview(accountId: string, weekStart: string): Promise<WeeklyReview | undefined> {
  return getWeeklyReview(accountId, weekStart);
}

export async function saveWeeklyReview(review: WeeklyReview): Promise<void> {
  await upsertWeeklyReview(review);
}

export async function previewCsv(file: File, account: Account): Promise<ParsedImport> {
  return parseExnessCsv(await file.text(), account.id, account.sourceTimeZone);
}

export async function commitCsv(parsed: ParsedImport, account: Account, fileName: string): Promise<ImportCommitResult> {
  return importParsedData(account.id, fileName, parsed);
}

export async function loadSnapshot(): Promise<BackupSnapshot> {
  const [accounts, importBatches, deals, positions, journals, weeklyReviews, balanceEvents, settings] = await Promise.all([db.accounts.toArray(), db.importBatches.toArray(), db.deals.toArray(), db.positions.toArray(), db.journals.toArray(), db.weeklyReviews.toArray(), db.balanceEvents.toArray(), db.settings.toArray()]);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), accounts, importBatches, deals, positions, journals, weeklyReviews, balanceEvents, settings };
}

export async function restoreSnapshot(snapshot: BackupSnapshot, mode: 'merge' | 'replace'): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') await Promise.all(db.tables.map(table => table.clear()));
    await db.accounts.bulkPut(snapshot.accounts); await db.importBatches.bulkPut(snapshot.importBatches ?? []); await db.deals.bulkPut(snapshot.deals); await db.positions.bulkPut(snapshot.positions); await db.journals.bulkPut(snapshot.journals); await db.weeklyReviews.bulkPut(snapshot.weeklyReviews ?? []); await db.balanceEvents.bulkPut(snapshot.balanceEvents); await db.settings.bulkPut(snapshot.settings);
  });
}

export async function clearLocalData(): Promise<void> {
  return clearAllData();
}
