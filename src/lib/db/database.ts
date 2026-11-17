import Dexie, { type EntityTable } from 'dexie';
import Decimal from 'decimal.js';
import type {
  Account, AppSettings, BalanceEvent, Deal, DeskKind, ImportBatch, Journal,
  ImportPreview, Plan, Position, Session, WeeklyReview,
} from '../domain/types';
import { aggregatePositions } from '../import/aggregate';
import { findMatchingAccount } from '../import/accounts';
import { parsePlanMarkdown, type PlanError } from '../desk/plan';

export class TradingJournalDatabase extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  importBatches!: EntityTable<ImportBatch, 'id'>;
  deals!: EntityTable<Deal, 'id'>;
  positions!: EntityTable<Position, 'id'>;
  journals!: EntityTable<Journal, 'id'>;
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>;
  balanceEvents!: EntityTable<BalanceEvent, 'id'>;
  plans!: EntityTable<Plan, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

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
    // v4 drops the news cache. No keyless, CORS-open headline source exists, so
    // the feature was removed rather than left half-working. `null` tells Dexie
    // to delete the table instead of creating it.
    this.version(4).stores({ marketNews: null });
    // v5 drops marketCandles and signalAlerts as the application is simplified
    // back to a core trading journal with zero external market polling.
    this.version(5).stores({ marketCandles: null, signalAlerts: null });
    // v6 introduces prop firm desks. All additive: two new tables and one
    // backfilled field on accounts. Every pre-v6 account becomes personal,
    // which is what it was, and keeps no starting balance — an honest gap,
    // because a history imported mid-account cannot prove its own baseline.
    this.version(6).stores({
      plans: '&id, &accountId, updatedAt',
      sessions: '&id, &[accountId+firmDay], accountId, firmDay',
    }).upgrade(async (transaction) => {
      await transaction.table('accounts').toCollection().modify((account: Account) => {
        if (!account.kind) account.kind = 'personal';
      });
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

export type NewAccount = Pick<Account, 'label' | 'server' | 'currency' | 'sourceTimeZone'>
  & Partial<Pick<Account, 'id' | 'accountNumber' | 'createdAt' | 'kind' | 'startingBalance' | 'openedAt'>>;

function buildAccount(input: NewAccount): Account {
  const account: Account = {
    id: input.id ?? id('account'), label: input.label.trim(), accountNumber: input.accountNumber?.trim() ?? '',
    platform: 'MT5', server: input.server.trim(), currency: input.currency.trim().toUpperCase(),
    sourceTimeZone: input.sourceTimeZone, kind: input.kind ?? 'personal',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  if (input.startingBalance !== undefined) account.startingBalance = input.startingBalance;
  if (input.openedAt !== undefined) account.openedAt = input.openedAt;
  if (!account.label || !account.server || !account.currency) throw new Error('Label, server, dan currency wajib diisi.');
  return account;
}

export async function createAccount(input: NewAccount): Promise<Account> {
  const account = buildAccount(input);
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

/* ------------------------------------------------------------------ *
 * Prop firm desks: kind changes and challenge plans
 * ------------------------------------------------------------------ */

export type PlanInput = Pick<Plan, 'accountId' | 'startingBalance' | 'effectiveFrom' | 'resetTime' | 'resetTimeZone'>
  & Partial<Omit<Plan, 'accountId' | 'startingBalance' | 'effectiveFrom' | 'resetTime' | 'resetTimeZone' | 'updatedAt'>>;

export const getPlan = (accountId: string): Promise<Plan | undefined> =>
  db.plans.where('accountId').equals(accountId).first();

/**
 * A plan exists only on a prop firm desk, and a desk that carries a plan cannot
 * quietly become personal — that would leave a plan nothing evaluates.
 */
export async function savePlan(input: PlanInput): Promise<Plan> {
  return db.transaction('rw', db.accounts, db.plans, async () => {
    const account = await db.accounts.get(input.accountId);
    if (!account) throw new Error('Akun tidak ditemukan.');
    if (account.kind !== 'propfirm') throw new Error('Plan hanya dapat dipasang pada akun prop firm.');
    const existing = await db.plans.where('accountId').equals(input.accountId).first();
    const now = new Date().toISOString();
    const plan: Plan = {
      id: existing?.id ?? input.id ?? id('plan'),
      accountId: input.accountId,
      firm: input.firm ?? existing?.firm ?? '',
      phase: input.phase ?? existing?.phase ?? '',
      startingBalance: input.startingBalance,
      effectiveFrom: input.effectiveFrom,
      resetTime: input.resetTime,
      resetTimeZone: input.resetTimeZone,
      maxDailyLossPct: input.maxDailyLossPct ?? existing?.maxDailyLossPct ?? null,
      maxTotalLossPct: input.maxTotalLossPct ?? existing?.maxTotalLossPct ?? null,
      totalLossMode: input.totalLossMode ?? existing?.totalLossMode ?? 'static',
      profitTargetPct: input.profitTargetPct ?? existing?.profitTargetPct ?? null,
      minTradingDays: input.minTradingDays ?? existing?.minTradingDays ?? null,
      consistencyPct: input.consistencyPct ?? existing?.consistencyPct ?? null,
      softCaps: input.softCaps ?? existing?.softCaps ?? {},
      attested: input.attested ?? existing?.attested ?? [],
      markdown: input.markdown ?? existing?.markdown ?? '',
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    await db.plans.put(plan);
    return plan;
  });
}

export async function deletePlan(accountId: string): Promise<void> {
  await db.plans.where('accountId').equals(accountId).delete();
}

export interface AccountMergeReport {
  survivorId: string;
  mergedId: string;
  moved: { batches: number; deals: number; balanceEvents: number; positions: number; plans: number; sessions: number; journals: number };
  skipped: { batches: number; deals: number; balanceEvents: number; plans: number; sessions: number; journals: number };
}

/**
 * Folds one desk into another and deletes the one that lost.
 *
 * Duplicates are expected: before account matching keyed on the account number,
 * a broker renaming its server forked one account into two desks holding
 * overlapping history. Nothing is merged silently — callers show the counts — and
 * nothing is thrown away when a record already exists on the survivor.
 */
export async function mergeAccounts(survivorId: string, mergedId: string): Promise<AccountMergeReport> {
  if (survivorId === mergedId) throw new Error('Pilih dua akun yang berbeda.');
  return db.transaction(
    'rw',
    [db.accounts, db.importBatches, db.deals, db.balanceEvents, db.positions, db.plans, db.sessions, db.journals],
    async () => {
      const survivor = await db.accounts.get(survivorId);
      const merged = await db.accounts.get(mergedId);
      if (!survivor || !merged) throw new Error('Akun tidak ditemukan.');

      const report: AccountMergeReport = {
        survivorId, mergedId,
        moved: { batches: 0, deals: 0, balanceEvents: 0, positions: 0, plans: 0, sessions: 0, journals: 0 },
        skipped: { batches: 0, deals: 0, balanceEvents: 0, plans: 0, sessions: 0, journals: 0 },
      };

      for (const batch of await db.importBatches.where('accountId').equals(mergedId).toArray()) {
        await db.importBatches.delete(batch.id);
        const clash = await db.importBatches.where('[accountId+fileHash]').equals([survivorId, batch.fileHash]).first();
        if (clash) { report.skipped.batches += 1; continue; }
        await db.importBatches.put({ ...batch, accountId: survivorId });
        report.moved.batches += 1;
      }

      for (const deal of await db.deals.where('accountId').equals(mergedId).toArray()) {
        const nextId = `${survivorId}:${deal.ticketId}`;
        const clash = await db.deals.get(nextId);
        await db.deals.delete(deal.id);
        if (clash) { report.skipped.deals += 1; continue; }
        await db.deals.add({ ...deal, id: nextId, accountId: survivorId });
        report.moved.deals += 1;
      }

      for (const event of await db.balanceEvents.where('accountId').equals(mergedId).toArray()) {
        const nextId = `${survivorId}:${event.ticketId}`;
        const clash = await db.balanceEvents.get(nextId);
        await db.balanceEvents.delete(event.id);
        if (clash) { report.skipped.balanceEvents += 1; continue; }
        await db.balanceEvents.add({ ...event, id: nextId, accountId: survivorId });
        report.moved.balanceEvents += 1;
      }

      const mergedPositions = await db.positions.where('accountId').equals(mergedId).toArray();
      report.moved.positions = mergedPositions.length;
      await db.positions.bulkDelete(mergedPositions.map((position) => position.id));

      const allDeals = await db.deals.where('accountId').equals(survivorId).toArray();
      const rebuilt = aggregatePositions(allDeals);
      const survivorPositionIds = (await db.positions.where('accountId').equals(survivorId).primaryKeys()) as string[];
      await db.positions.bulkDelete(survivorPositionIds);
      await db.positions.bulkPut(rebuilt);

      const survivorPositionByReference = new Map(rebuilt.map((position) => [position.positionId, position.id]));
      for (const journal of await db.journals.toArray()) {
        const source = mergedPositions.find((position) => position.id === journal.positionId);
        if (!source) continue;
        const target = survivorPositionByReference.get(source.positionId);
        if (!target || target === journal.positionId) continue;
        const clash = await db.journals.where('positionId').equals(target).first();
        if (clash) { report.skipped.journals += 1; continue; }
        await db.journals.put({ ...journal, positionId: target });
        report.moved.journals += 1;
      }

      const mergedPlan = await db.plans.where('accountId').equals(mergedId).first();
      if (mergedPlan) {
        const survivorPlan = await db.plans.where('accountId').equals(survivorId).first();
        await db.plans.delete(mergedPlan.id);
        if (survivorPlan) {
          report.skipped.plans += 1;
        } else {
          await db.plans.put({ ...mergedPlan, accountId: survivorId });
          report.moved.plans += 1;
        }
      }

      for (const session of await db.sessions.where('accountId').equals(mergedId).toArray()) {
        await db.sessions.delete(session.id);
        const clash = await getSession(survivorId, session.firmDay);
        if (clash) { report.skipped.sessions += 1; continue; }
        await db.sessions.put({ ...session, accountId: survivorId });
        report.moved.sessions += 1;
      }

      await db.accounts.delete(mergedId);
      return report;
    },
  );
}

export type ApplyPlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; errors: PlanError[]; markdown: string };/**
 * The only write path for a plan: paste markdown, parse it, store it.
 *
 * A rejected paste writes nothing at all, so the plan already in force keeps
 * guarding the desk and the user can fix the text instead of retyping it.
 */
export async function applyPlanText(accountId: string, markdown: string): Promise<ApplyPlanResult> {
  const parsed = parsePlanMarkdown(markdown);
  if (!parsed.ok) return parsed;
  const plan = await savePlan({
    accountId,
    ...parsed.machine,
    attested: parsed.attested,
    markdown: parsed.markdown,
  });
  return { ok: true, plan };
}

export type AccountFactsInput = Partial<Pick<Account, 'label' | 'accountNumber' | 'server' | 'currency' | 'startingBalance' | 'openedAt'>>;

/**
 * Editing account facts re-derives every percentage but never rewrites imported
 * history: deals, positions and balance events are left exactly as they are.
 */
export async function updateAccountFacts(accountId: string, input: AccountFactsInput): Promise<Account> {
  const account = await db.accounts.get(accountId);
  if (!account) throw new Error('Akun tidak ditemukan.');
  if (input.startingBalance !== undefined) {
    let parsed: Decimal;
    try {
      parsed = new Decimal(input.startingBalance);
    } catch {
      throw new Error('Saldo awal harus angka.');
    }
    if (!parsed.isFinite() || parsed.lt(0)) throw new Error('Saldo awal tidak boleh negatif.');
  }
  const updated: Account = { ...account, ...input };
  await db.accounts.put(updated);
  return updated;
}

export async function setAccountKind(accountId: string, kind: DeskKind): Promise<Account> {  return db.transaction('rw', db.accounts, db.plans, async () => {
    const account = await db.accounts.get(accountId);
    if (!account) throw new Error('Akun tidak ditemukan.');
    if (kind === 'personal') {
      const plan = await db.plans.where('accountId').equals(accountId).first();
      if (plan) throw new Error('Lepaskan plan challenge sebelum mengubah akun menjadi personal.');
    }
    const updated: Account = { ...account, kind };
    await db.accounts.put(updated);
    return updated;
  });
}

export type SessionInput = Pick<Session, 'accountId' | 'firmDay'>
  & Partial<Omit<Session, 'accountId' | 'firmDay' | 'updatedAt'>>;

export const getSession = (accountId: string, firmDay: string): Promise<Session | undefined> =>
  db.sessions.where('[accountId+firmDay]').equals([accountId, firmDay]).first();

/**
 * One row per desk per firm day. Ticks and the note belong to that day only; the
 * day boundary is the caller's clock, which is why it is a stored label rather
 * than recomputed at read time.
 */
export async function saveSession(input: SessionInput): Promise<Session> {
  const existing = await getSession(input.accountId, input.firmDay);
  const session: Session = {
    id: existing?.id ?? input.id ?? id('session'),
    accountId: input.accountId,
    firmDay: input.firmDay,
    checklist: input.checklist ?? existing?.checklist ?? [],
    note: input.note ?? existing?.note ?? '',
    updatedAt: new Date().toISOString(),
  };
  const lowestEquity = input.lowestEquity ?? existing?.lowestEquity;
  if (lowestEquity !== undefined) session.lowestEquity = lowestEquity;
  await db.sessions.put(session);
  return session;
}

export interface ImportCommitResult {
  account: Account;
  batch?: ImportBatch;
  inserted: number;
  duplicates: number;
  failed: number;
  alreadyImported: boolean;
  positions: Position[];
}
export type ImportAccountTarget =
  | { kind: 'existing'; accountId: string }
  | { kind: 'new'; account: NewAccount };

/**
 * The zero-prompt path: the export already knows which account it belongs to.
 *
 * A detected account that is not stored yet becomes a personal desk, because that
 * is the safe default — nobody's money is governed by a challenge plan until they
 * say so. Promotion to a prop desk is an explicit later step.
 */
export async function importDetectedHistory(preview: ImportPreview, fileName: string): Promise<ImportCommitResult> {
  if (!preview.detectedAccount) throw new Error('File tidak memuat identitas akun.');
  const existing = findMatchingAccount(await getAccounts(), preview.detectedAccount);
  if (existing) return importParsedData({ kind: 'existing', accountId: existing.id }, fileName, preview);
  return importParsedData(
    { kind: 'new', account: { ...preview.detectedAccount, kind: 'personal' } },
    fileName,
    preview,
  );
}

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export async function importParsedData(
  target: ImportAccountTarget,
  fileName: string,
  parsed: ImportPreview,
): Promise<ImportCommitResult> {
  return db.transaction('rw', db.accounts, db.importBatches, db.deals, db.balanceEvents, db.positions, async () => {
    let account: Account;
    if (target.kind === 'existing') {
      const existing = await db.accounts.get(target.accountId);
      if (!existing) throw new Error('Akun tujuan import tidak ditemukan.');
      account = existing;
    } else {
      account = buildAccount(target.account);
      await db.accounts.add(account);
    }
    const accountId = account.id;
    const prior = await db.importBatches.where('[accountId+fileHash]').equals([accountId, parsed.fileHash]).first();
    if (prior) {
      return {
        account,
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
      inserted: newDeals.length + newBalances.length, duplicates, failed,
      parserVersion: parsed.parserVersion, sourceFormat: parsed.sourceFormat,
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
    return { account, batch, inserted: batch.inserted, duplicates, failed, alreadyImported: false, positions };
  });
}

/** Remove imported broker data but deliberately preserve journals, which become orphaned. */export async function deleteImportBatch(batchId: string): Promise<void> {
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

