import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyPlanText, clearAllData, createAccount, db, deletePlan, getPlan, getSession, savePlan, saveSession, setAccountKind } from '../../src/lib/db/database';

const planInput = (accountId: string) => ({
  accountId,
  startingBalance: '100000',
  effectiveFrom: '2026-11-01',
  resetTime: '00:00',
  resetTimeZone: 'Europe/Prague',
  maxDailyLossPct: 5,
  maxTotalLossPct: 10,
});

beforeEach(async () => clearAllData());
afterEach(async () => clearAllData());

describe('desk kind and plan guards', () => {
  it('refuses to attach a plan to a personal desk', async () => {
    const personal = await createAccount({ label: 'Personal', accountNumber: '1', server: 'Exness-Live', currency: 'USD', sourceTimeZone: 'UTC' });
    expect(personal.kind).toBe('personal');

    await expect(savePlan(planInput(personal.id))).rejects.toThrow('prop firm');
    expect(await getPlan(personal.id)).toBeUndefined();
  });

  it('attaches a plan to a prop firm desk and survives a re-save', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '2', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const first = await savePlan(planInput(prop.id));
    expect(first).toMatchObject({ accountId: prop.id, maxDailyLossPct: 5, totalLossMode: 'static' });

    const second = await savePlan({ ...planInput(prop.id), maxDailyLossPct: 4 });
    expect(second.id).toBe(first.id);
    expect(second.maxDailyLossPct).toBe(4);
    expect(await getPlan(prop.id)).toMatchObject({ id: first.id, maxDailyLossPct: 4 });
  });

  it('refuses to turn a desk with a plan into a personal desk', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '3', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    await savePlan(planInput(prop.id));

    await expect(setAccountKind(prop.id, 'personal')).rejects.toThrow('Lepaskan plan');
    expect((await getPlan(prop.id))?.accountId).toBe(prop.id);
  });

  it('allows the change once the plan is detached', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '4', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    await savePlan(planInput(prop.id));
    await deletePlan(prop.id);

    const downgraded = await setAccountKind(prop.id, 'personal');
    expect(downgraded.kind).toBe('personal');
    expect(await getPlan(prop.id)).toBeUndefined();
  });
});

const planMarkdown = (dailyLoss = 5) => `# FTMO

\`\`\`json
{
  "firm": "FTMO", "phase": "Phase 1", "startingBalance": "100000",
  "effectiveFrom": "2026-11-01", "resetTime": "00:00", "resetTimeZone": "Europe/Prague",
  "maxDailyLossPct": ${dailyLoss}, "maxTotalLossPct": 10, "totalLossMode": "static",
  "profitTargetPct": 10, "minTradingDays": 4, "softCaps": { "tradesPerDay": 2 }
}
\`\`\`

- [ ] No trading around high-impact news
`;

describe('plan paste', () => {
  it('stores a valid paste and its attested rules', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '10', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const applied = await applyPlanText(prop.id, planMarkdown());
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.plan).toMatchObject({ firm: 'FTMO', maxDailyLossPct: 5, softCaps: { tradesPerDay: 2 } });
    expect(applied.plan.attested).toEqual([{ id: 'no-trading-around-high-impact-news', text: 'No trading around high-impact news' }]);
    expect(await getPlan(prop.id)).toMatchObject({ id: applied.plan.id });
  });

  it('rejects a negative limit, keeps the previous plan, and returns the pasted text', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '11', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const first = await applyPlanText(prop.id, planMarkdown(5));
    expect(first.ok).toBe(true);

    const bad = planMarkdown(-5);
    const rejected = await applyPlanText(prop.id, bad);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.errors.map((error) => error.path)).toContain('maxDailyLossPct');
    expect(rejected.markdown).toBe(bad);

    const stillStored = await getPlan(prop.id);
    expect(stillStored?.maxDailyLossPct).toBe(5);
    expect(stillStored?.markdown).toBe(planMarkdown(5));
  });

  it('refuses to apply a plan to a personal desk', async () => {
    const personal = await createAccount({ label: 'Personal', accountNumber: '12', server: 'Exness-Live', currency: 'USD', sourceTimeZone: 'UTC' });
    await expect(applyPlanText(personal.id, planMarkdown())).rejects.toThrow('prop firm');
    expect(await getPlan(personal.id)).toBeUndefined();
  });
});

describe('session attestations', () => {
  it('keeps ticks and notes on their own firm day', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '20', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    await saveSession({ accountId: prop.id, firmDay: '2026-11-17', checklist: ['no-news'], note: 'Chased the open.' });
    await saveSession({ accountId: prop.id, firmDay: '2026-11-18', checklist: [], note: '' });

    expect(await getSession(prop.id, '2026-11-17')).toMatchObject({ checklist: ['no-news'], note: 'Chased the open.' });
    expect(await getSession(prop.id, '2026-11-18')).toMatchObject({ checklist: [], note: '' });
  });

  it('updates the same firm day instead of duplicating it', async () => {
    const prop = await createAccount({ label: 'FTMO', accountNumber: '21', server: 'FTMO-Server', currency: 'USD', sourceTimeZone: 'UTC', kind: 'propfirm' });
    const first = await saveSession({ accountId: prop.id, firmDay: '2026-11-17', checklist: ['no-news'] });
    const second = await saveSession({ accountId: prop.id, firmDay: '2026-11-17', checklist: ['no-news', 'no-weekend'], lowestEquity: '98760' });
    expect(second.id).toBe(first.id);
    expect(await db.sessions.count()).toBe(1);
    expect(await getSession(prop.id, '2026-11-17')).toMatchObject({ lowestEquity: '98760', checklist: ['no-news', 'no-weekend'] });
  });
});
