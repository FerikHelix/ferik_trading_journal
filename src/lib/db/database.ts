import Dexie, { type EntityTable } from 'dexie';
import type {
  Account, AppSettings, BalanceEvent, CachedCandles, CachedNews, Deal, ImportBatch, Journal,
  ParsedImport, Position, SignalAlert, WeeklyReview,
} from '../domain/types';
import { aggregatePositions } from '../import/aggregate';
import { EXNESS_PARSER_VERSION } from '../import/parser';

export class TradingJournalDatabase extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  deals!: EntityTable<Deal, 'id'>;
  positions!: EntityTable<Position, 'id'>;
  journals!: EntityTable<Journal, 'id'>;
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>;
  balanceEvents!: EntityTable<BalanceEvent, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  marketCandles!: EntityTable<CachedCandles, 'id'>;
  marketNews!: EntityTable<CachedNews, 'id'>;
  signalAlerts!: EntityTable<SignalAlert, 'id'>;

  /**
   * The database name is load-bearing: changing it does not migrate anything,
   * it silently opens a brand-new empty database and strands every trade the
   * user has imported. It stays 'ferik-trading-journal' regardless of branding.
   */
  constructor(name = 'ferik-trading-journal') {
    super(name);
    this.version(1).stores({
      accounts: '&id, accountNumber, currency, createdAt',
      importBatches: '&id, &[accountId+fileHash], accountId, importedAt',
      deals: '&id, &[accountId+ticketId], accountId, positionId, importBatchId, occurredAt',
      positions: '&id, accountId, positionId, status, closeAt, symbol',
      journals: '&id, &positionId, strategy, updatedAt, *tags',
      balanceEvents: '&id, &[accountId+ticketId], accountId, occurredAt, type, importBatchId',
      settings: '&id',
    });
    this.version(2).stores({
      weeklyReviews: '&id, &[accountId+weekStart], accountId, weekStart, updatedAt',
    });
    // v3 adds the market-data layer. These three tables are all disposable
    // caches or derived state — nothing here is user-authored, so they are
    // safe to clear and are excluded from backups.
    this.version(3).stores({
      marketCandles: '&id, instrumentId, timeframe, fetchedAt',
      marketNews: '&id, publishedAt, fetchedAt, *tags',
      signalAlerts: '&id, instrumentId, createdAt, status, seenAt',
    });
    this.on('populate', () => this.settings.add(defaultSettings()));
  }
}

function defaultSettings(): AppSettings {
  return {
    id: 'app', schemaVersion: 1,
    displayTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    theme: 'system', currencyDisplay: 'account',
  };
}

export const db = new TradingJournalDatabase();

const id = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export type NewAccount = Pick<Account, 'label' | 'accountNumber' | 'currency' | 'sourceTimeZone'>
  & Partial<Pick<Account, 'id' | 'server' | 'createdAt'>>;

export async function createAccount(input: NewAccount): Promise<Account> {
  const account: Account = {
    id: input.id ?? id('account'), label: input.label.trim(), accountNumber: input.accountNumber.trim(),
    platform: 'MT5', server: input.server?.trim() ?? '', currency: input.currency.trim().toUpperCase(),
    sourceTimeZone: input.sourceTimeZone, createdAt: input.createdAt ?? new Date().toISOString(),
  };
  if (!account.label || !account.accountNumber || !account.currency) throw new Error('Label, nomor akun, dan currency wajib diisi.');
  await db.accounts.add(account);
  return account;
}

export const getAccounts = () => db.accounts.orderBy('createdAt').toArray();

export async function getAppSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? defaultSettings();
}

export async function updateThemePreference(theme: AppSettings['theme']): Promise<AppSettings> {
  const settings = { ...await getAppSettings(), theme };
  await db.settings.put(settings);
  return settings;
}

export async function getPositions(accountFilter?: string | string[]): Promise<Position[]> {
  const positions = await db.positions.orderBy('closeAt').reverse().toArray();
  const accountIds = typeof accountFilter === 'string' ? [accountFilter] : accountFilter;
  return accountIds?.length ? positions.filter((position) => accountIds.includes(position.accountId)) : positions;
}

export async function getPositionWithDeals(positionRecordId: string): Promise<{ position?: Position; deals: Deal[] }> {
  const position = await db.positions.get(positionRecordId);
  if (!position) return { deals: [] };
  const deals = await db.deals.bulkGet(position.dealIds);
  return { position, deals: deals.filter((deal): deal is Deal => Boolean(deal)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
}

export async function getJournals(positionIds?: string[]): Promise<Journal[]> {
  const journals = await db.journals.toArray();
  return positionIds?.length ? journals.filter((journal) => positionIds.includes(journal.positionId)) : journals;
}

export type JournalInput = Pick<Journal, 'positionId'> & Partial<Omit<Journal, 'positionId' | 'updatedAt'>>;

export async function upsertJournal(input: JournalInput): Promise<Journal> {
  const existing = await db.journals.where('positionId').equals(input.positionId).first();
  const now = new Date().toISOString();
  const journal: Journal = {
    id: existing?.id ?? input.id ?? id('journal'), positionId: input.positionId,
    strategy: input.strategy ?? existing?.strategy ?? '', setup: input.setup ?? existing?.setup ?? '',
    thesis: input.thesis ?? existing?.thesis ?? '', emotion: input.emotion ?? existing?.emotion ?? '',
    mistakes: input.mistakes ?? existing?.mistakes ?? [], tags: input.tags ?? existing?.tags ?? [],
    executionRating: input.executionRating ?? existing?.executionRating,
    riskAmount: input.riskAmount ?? existing?.riskAmount,
    plannedRiskReward: input.plannedRiskReward ?? existing?.plannedRiskReward,
    review: input.review ?? existing?.review ?? '',
    createdAt: existing?.createdAt ?? input.createdAt ?? now, updatedAt: now,
  };
  await db.journals.put(journal);
  return journal;
}

export type WeeklyReviewInput = Pick<WeeklyReview, 'accountId' | 'weekStart' | 'weekEnd'> & Partial<Omit<WeeklyReview, 'accountId' | 'weekStart' | 'weekEnd' | 'updatedAt'>>;

export async function getWeeklyReview(accountId: string, weekStart: string): Promise<WeeklyReview | undefined> {
  return db.weeklyReviews.where('[accountId+weekStart]').equals([accountId, weekStart]).first();
}

export async function upsertWeeklyReview(input: WeeklyReviewInput): Promise<WeeklyReview> {
  const existing = await getWeeklyReview(input.accountId, input.weekStart);
  const now = new Date().toISOString();
  const review: WeeklyReview = {
    id: existing?.id ?? input.id ?? id('weekly-review'), accountId: input.accountId, weekStart: input.weekStart, weekEnd: input.weekEnd,
    wentWell: input.wentWell ?? existing?.wentWell ?? '', toImprove: input.toImprove ?? existing?.toImprove ?? '',
    lesson: input.lesson ?? existing?.lesson ?? '', nextWeekFocus: input.nextWeekFocus ?? existing?.nextWeekFocus ?? '',
    createdAt: existing?.createdAt ?? input.createdAt ?? now, updatedAt: now,
  };
  await db.weeklyReviews.put(review);
  return review;
}

export interface ImportCommitResult {
  batch?: ImportBatch;
  inserted: number;
  duplicates: number;
  failed: number;
  alreadyImported: boolean;
  positions: Position[];
}

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export async function importParsedData(
  accountId: string,
  fileName: string,
  parsed: ParsedImport,
): Promise<ImportCommitResult> {
  return db.transaction('rw', db.accounts, db.importBatches, db.deals, db.balanceEvents, db.positions, async () => {
    if (!await db.accounts.get(accountId)) throw new Error('Akun tujuan import tidak ditemukan.');
    const prior = await db.importBatches.where('[accountId+fileHash]').equals([accountId, parsed.fileHash]).first();
    if (prior) {
      return {
        batch: prior, inserted: 0, duplicates: parsed.deals.length + parsed.balanceEvents.length,
        failed: parsed.issues.filter((issue) => issue.severity === 'error').length,
        alreadyImported: true, positions: await db.positions.where('accountId').equals(accountId).toArray(),
      };
    }
    const mappedDeals = parsed.deals.map((deal) => ({ ...deal, accountId, id: `${accountId}:${deal.ticketId}` }));
    const mappedBalances = parsed.balanceEvents.map((event) => ({ ...event, accountId, id: `${accountId}:${event.ticketId}` }));
    const candidateDeals = uniqueById(mappedDeals);
    const candidateBalances = uniqueById(mappedBalances);
    const existingDeals = await db.deals.bulkGet(candidateDeals.map((deal) => deal.id));
    const existingBalances = await db.balanceEvents.bulkGet(candidateBalances.map((event) => event.id));
    const newDeals = candidateDeals.filter((_, index) => !existingDeals[index]);
    const newBalances = candidateBalances.filter((_, index) => !existingBalances[index]);
    const duplicates = mappedDeals.length + mappedBalances.length - newDeals.length - newBalances.length;
    const failed = parsed.issues.filter((issue) => issue.severity === 'error').length;
    const batch: ImportBatch = {
      id: id('import'), accountId, fileName, fileHash: parsed.fileHash, importedAt: new Date().toISOString(),
      inserted: newDeals.length + newBalances.length, duplicates, failed, parserVersion: EXNESS_PARSER_VERSION,
    };
    newDeals.forEach((deal) => { deal.importBatchId = batch.id; });
    newBalances.forEach((event) => { event.importBatchId = batch.id; });
    await db.importBatches.add(batch);
    await db.deals.bulkAdd(newDeals);
    await db.balanceEvents.bulkAdd(newBalances);
    const allDeals = await db.deals.where('accountId').equals(accountId).toArray();
    const positions = aggregatePositions(allDeals);
    const oldPositionIds = (await db.positions.where('accountId').equals(accountId).primaryKeys()) as string[];
    await db.positions.bulkDelete(oldPositionIds);
    await db.positions.bulkPut(positions);
    return { batch, inserted: batch.inserted, duplicates, failed, alreadyImported: false, positions };
  });
}

/** Remove imported broker data but deliberately preserve journals, which become orphaned. */
export async function deleteImportBatch(batchId: string): Promise<void> {
  await db.transaction('rw', db.importBatches, db.deals, db.balanceEvents, db.positions, async () => {
    const batch = await db.importBatches.get(batchId);
    if (!batch) return;
    const dealIds = (await db.deals.where('importBatchId').equals(batchId).primaryKeys()) as string[];
    const balanceIds = (await db.balanceEvents.where('importBatchId').equals(batchId).primaryKeys()) as string[];
    await db.deals.bulkDelete(dealIds);
    await db.balanceEvents.bulkDelete(balanceIds);
    await db.importBatches.delete(batchId);
    const allDeals = await db.deals.where('accountId').equals(batch.accountId).toArray();
    const positionIds = (await db.positions.where('accountId').equals(batch.accountId).primaryKeys()) as string[];
    await db.positions.bulkDelete(positionIds);
    await db.positions.bulkPut(aggregatePositions(allDeals));
  });
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => Promise.all(db.tables.map((table) => table.clear())));
  await db.settings.put(defaultSettings());
}

/* ------------------------------------------------------------------ market */

export async function updateMarketSettings(
  patch: Partial<Pick<AppSettings,
    'twelveDataKey' | 'alphaVantageKey' | 'dataProxyUrl' | 'watchlist' | 'signalTimeframe' | 'desktopNotifications'>>,
): Promise<AppSettings> {
  const settings = { ...await getAppSettings(), ...patch };
  await db.settings.put(settings);
  return settings;
}

export async function getCachedCandles(id: string): Promise<CachedCandles | undefined> {
  return db.marketCandles.get(id);
}

export async function putCachedCandles(entry: CachedCandles): Promise<void> {
  await db.marketCandles.put(entry);
}

export async function getCachedNews(limit = 120): Promise<CachedNews[]> {
  const news = await db.marketNews.orderBy('publishedAt').reverse().limit(limit).toArray();
  return news;
}

export async function putCachedNews(items: CachedNews[]): Promise<void> {
  if (items.length === 0) return;
  await db.marketNews.bulkPut(items);
  // Keep the cache bounded; headlines older than the newest 300 are noise.
  const stale = await db.marketNews.orderBy('publishedAt').reverse().offset(300).primaryKeys();
  if (stale.length) await db.marketNews.bulkDelete(stale as string[]);
}

export async function getSignalAlerts(limit = 50): Promise<SignalAlert[]> {
  return db.signalAlerts.orderBy('createdAt').reverse().limit(limit).toArray();
}

/**
 * Adds only alerts whose id is not already stored, so reopening the app does
 * not re-raise the same zone touch over and over. Returns the ones that were
 * genuinely new, which is what the notification layer should announce.
 */
export async function addSignalAlerts(alerts: SignalAlert[]): Promise<SignalAlert[]> {
  if (alerts.length === 0) return [];
  const existing = await db.signalAlerts.bulkGet(alerts.map((alert) => alert.id));
  const fresh = alerts.filter((_, index) => !existing[index]);
  if (fresh.length) await db.signalAlerts.bulkAdd(fresh);
  return fresh;
}

export async function markAlertsSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const seenAt = new Date().toISOString();
  await db.transaction('rw', db.signalAlerts, async () => {
    for (const id of ids) await db.signalAlerts.update(id, { seenAt });
  });
}

/** Market caches only — never touches trades, journals or reviews. */
export async function clearMarketCache(): Promise<void> {
  await db.transaction('rw', db.marketCandles, db.marketNews, db.signalAlerts, async () => {
    await Promise.all([db.marketCandles.clear(), db.marketNews.clear(), db.signalAlerts.clear()]);
  });
}
