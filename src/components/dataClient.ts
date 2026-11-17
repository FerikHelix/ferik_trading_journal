import type { Account, AppSettings, BalanceEvent, Journal, Position, Deal, ImportPreview, Plan, Session, WeeklyReview } from '../lib/domain/types';
import {
  db, applyPlanText, clearAllData, createAccount, getAccounts, getAppSettings, getJournals, getPlan, getPositions,
  getPositionWithDeals, getSession, getWeeklyReview, importDetectedHistory, importParsedData, mergeAccounts,
  saveSession, setAccountKind, updateAccountFacts, updateThemePreference, upsertJournal, upsertWeeklyReview,
  type ApplyPlanResult, type ImportAccountTarget, type ImportCommitResult,
} from '../lib/db';
import { findMatchingAccount, parseTradeHistoryFile } from '../lib/import';
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

export async function loadBalanceEvents(): Promise<BalanceEvent[]> {
  return db.balanceEvents.toArray();
}

export async function loadPlan(accountId: string): Promise<Plan | undefined> {
  return getPlan(accountId);
}

export async function loadSession(accountId: string, firmDay: string): Promise<Session | undefined> {
  return getSession(accountId, firmDay);
}

export async function saveDeskSession(session: { accountId: string; firmDay: string; lowestEquity?: string; checklist?: string[]; note?: string }): Promise<Session> {
  return saveSession(session);
}

export async function submitPlanText(accountId: string, markdown: string): Promise<ApplyPlanResult> {
  return applyPlanText(accountId, markdown);
}

export async function changeDeskKind(accountId: string, kind: Account['kind']): Promise<Account> {
  return setAccountKind(accountId, kind);
}

export async function saveDeskFacts(accountId: string, input: { label?: string; server?: string; currency?: string; accountNumber?: string; startingBalance?: string; openedAt?: string }): Promise<Account> {
  return updateAccountFacts(accountId, input);
}

export async function createDesk(input: Parameters<typeof createAccount>[0]): Promise<Account> {
  return createAccount(input);
}

export async function mergeDesks(survivorId: string, mergedId: string) {
  return mergeAccounts(survivorId, mergedId);
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

export async function saveJournal(journal: Journal): Promise<void> {
  await upsertJournal(journal);
}

export async function loadWeeklyReview(accountId: string, weekStart: string): Promise<WeeklyReview | undefined> {
  return getWeeklyReview(accountId, weekStart);
}

export async function saveWeeklyReview(review: WeeklyReview): Promise<void> {
  await upsertWeeklyReview(review);
}

export async function previewTradeHistory(file: File): Promise<ImportPreview> {
  const sourceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return parseTradeHistoryFile(file, sourceTimeZone);
}

export function resolveDetectedAccount(accounts: Account[], preview: ImportPreview): Account | undefined {
  return preview.detectedAccount ? findMatchingAccount(accounts, preview.detectedAccount) : undefined;
}

export async function commitTradeHistory(parsed: ImportPreview, target: ImportAccountTarget, fileName: string): Promise<ImportCommitResult> {
  return importParsedData(target, fileName, parsed);
}

/** The zero-prompt path: the export knows which desk it belongs to. */
export async function commitDetectedHistory(parsed: ImportPreview, fileName: string): Promise<ImportCommitResult> {
  return importDetectedHistory(parsed, fileName);
}

export async function loadSnapshot(): Promise<BackupSnapshot> {
  const [accounts, importBatches, deals, positions, journals, weeklyReviews, balanceEvents, plans, sessions, settings] = await Promise.all([
    db.accounts.toArray(),
    db.importBatches.toArray(),
    db.deals.toArray(),
    db.positions.toArray(),
    db.journals.toArray(),
    db.weeklyReviews.toArray(),
    db.balanceEvents.toArray(),
    db.plans.toArray(),
    db.sessions.toArray(),
    db.settings.toArray(),
  ]);
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    accounts,
    importBatches,
    deals,
    positions,
    journals,
    weeklyReviews,
    balanceEvents,
    plans,
    sessions,
    settings,
  };
}

export async function restoreSnapshot(snapshot: BackupSnapshot, mode: 'merge' | 'replace'): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') await Promise.all(db.tables.map(table => table.clear()));
    await db.accounts.bulkPut(snapshot.accounts);
    await db.importBatches.bulkPut(snapshot.importBatches ?? []);
    await db.deals.bulkPut(snapshot.deals);
    await db.positions.bulkPut(snapshot.positions);
    await db.journals.bulkPut(snapshot.journals);
    await db.weeklyReviews.bulkPut(snapshot.weeklyReviews ?? []);
    await db.balanceEvents.bulkPut(snapshot.balanceEvents);
    await db.plans.bulkPut(snapshot.plans ?? []);
    await db.sessions.bulkPut(snapshot.sessions ?? []);
    await db.settings.bulkPut(snapshot.settings);
  });
}

export async function clearLocalData(): Promise<void> {
  return clearAllData();
}
