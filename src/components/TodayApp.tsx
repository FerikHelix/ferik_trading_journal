import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Account, AppSettings, BalanceEvent, ImportPreview, Plan, Position, Session } from '../lib/domain/types';
import { deskClock } from '../lib/desk/clock';
import { currentFirmDay } from '../lib/desk/day';
import { summarizeDays } from '../lib/desk/days';
import { dailyLossReading, evaluateDesk } from '../lib/desk/guardrails';
import { attestedRuleStatus, ruleWall, softRuleReading } from '../lib/desk/rules';
import CalendarMonth from './CalendarMonth';
import GuardrailBar from './GuardrailBar';
import WeeklyReviewApp from './WeeklyReviewApp';
import { Badge, Card, EmptyState, Icon, Notice, SideBadge, Skeleton, StatTile } from './ui';
import { money, pct } from './format';
import {
  commitDetectedHistory, commitTradeHistory, loadAccounts, loadAppSettings, loadBalanceEvents, loadPlan, loadPositions,
  loadSession, previewTradeHistory, saveDeskSession,
} from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;

interface ImportSummary {
  file: string;
  desk: string;
  inserted: number;
  duplicates: number;
  failed: number;
  alreadyImported: boolean;
  label: string;
}

const STATUS_TONE = { safe: 'profit', warning: 'warning', breach: 'loss' } as const;

export default function TodayApp() {
  const [accountId] = useActiveAccount();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balanceEvents, setBalanceEvents] = useState<BalanceEvent[]>([]);
  const [settings, setSettings] = useState<AppSettings>();
  const [plan, setPlan] = useState<Plan>();
  const [session, setSession] = useState<Session>();
  const [resolvedId, setResolvedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary>();
  const [pending, setPending] = useState<{ parsed: ImportPreview; fileName: string }>();
  const [manual, setManual] = useState({ label: '', server: '', currency: 'USD', accountNumber: '' });
  const [draft, setDraft] = useState({ lowestEquity: '', note: '', checklist: [] as string[] });
  const [saved, setSaved] = useState('');
  const [month, setMonth] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [loadedAccounts, loadedPositions, loadedEvents, loadedSettings] = await Promise.all([
          loadAccounts(), loadPositions(), loadBalanceEvents(), loadAppSettings(),
        ]);
        if (!alive) return;
        setAccounts(loadedAccounts);
        setPositions(loadedPositions);
        setBalanceEvents(loadedEvents);
        setSettings(loadedSettings);
        const id = accountId || (loadedAccounts.length === 1 ? loadedAccounts[0].id : '');
        setResolvedId(id);
        setPlan(id ? await loadPlan(id) : undefined);
      } catch {
        if (alive) setError('Local data could not be opened. Reload the page and try again.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accountId, reloadKey]);

  const account = accounts.find((candidate) => candidate.id === resolvedId);
  const displayTimeZone = settings?.displayTimeZone ?? 'UTC';

  const desk = useMemo(() => {
    if (!account) return null;
    const clock = deskClock(account, plan, displayTimeZone);
    const today = currentFirmDay(clock);
    const days = summarizeDays(positions, account, clock, balanceEvents);
    const evaluation = plan
      ? evaluateDesk({ account, plan, positions, balanceEvents, sessions: session ? [session] : [], clock })
      : null;
    const todaySummary = days.find((day) => day.firmDay === today) ?? null;
    const dailyReading = plan && todaySummary ? dailyLossReading(plan, todaySummary, session ?? undefined) : null;
    return { clock, today, days, evaluation, todaySummary, dailyReading };
  }, [account, plan, displayTimeZone, positions, balanceEvents, session]);

  useEffect(() => {
    if (!desk) return;
    setMonth((current) => current || desk.today.slice(0, 7));
  }, [desk?.today]);

  useEffect(() => {
    if (!resolvedId || !desk) return;
    let alive = true;
    loadSession(resolvedId, desk.today).then((loaded) => {
      if (!alive) return;
      setSession(loaded);
      setDraft({
        lowestEquity: loaded?.lowestEquity ?? '',
        note: loaded?.note ?? '',
        checklist: loaded?.checklist ?? [],
      });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [resolvedId, desk?.today, reloadKey]);

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setSummary(undefined);
    setPending(undefined);
    try {
      const parsed = await previewTradeHistory(file);
      if (!parsed.detectedAccount) {
        setPending({ parsed, fileName: file.name });
        return;
      }
      const result = await commitDetectedHistory(parsed, file.name);
      setSummary({
        file: file.name,
        desk: result.account.label,
        inserted: result.inserted,
        duplicates: result.duplicates,
        failed: result.failed,
        alreadyImported: result.alreadyImported,
        label: parsed.sourceLabel,
      });
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  async function commitPending() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const result = await commitTradeHistory(pending.parsed, {
        kind: 'new',
        account: {
          ...manual,
          sourceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          kind: 'personal',
        },
      }, pending.fileName);
      setSummary({
        file: pending.fileName,
        desk: result.account.label,
        inserted: result.inserted,
        duplicates: result.duplicates,
        failed: result.failed,
        alreadyImported: result.alreadyImported,
        label: pending.parsed.sourceLabel,
      });
      setPending(undefined);
      setManual({ label: '', server: '', currency: 'USD', accountNumber: '' });
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The import could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDay() {
    if (!resolvedId || !desk) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const savedSession = await saveDeskSession({
        accountId: resolvedId,
        firmDay: desk.today,
        lowestEquity: draft.lowestEquity.trim() || undefined,
        checklist: draft.checklist,
        note: draft.note,
      });
      setSession(savedSession);
      setSaved('Session saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The session could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function toggleRule(id: string) {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.includes(id)
        ? current.checklist.filter((entry) => entry !== id)
        : [...current.checklist, id],
    }));
  }

  const currency = account?.currency ?? 'USD';
  const monthDays = desk?.days.filter((day) => day.firmDay.startsWith(month || desk.today.slice(0, 7))) ?? [];
  const budget = desk?.evaluation
    ? Object.fromEntries(desk.evaluation.daily.map((reading) => [reading.firmDay, reading.usedPct]))
    : undefined;

  if (loading) {
    return (
      <div className="grid dashboard-page">
        <div className="grid stats-grid">
          {[1, 2, 3, 4].map((key) => <div className="card" key={key}><Skeleton width="40%" /><div className="u-mt-3"><Skeleton height={26} width="70%" /></div></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="grid today-page">
      {error && <Notice tone="error">{error}</Notice>}

      {!account && (
        <Card title="Start with a file" description="Drop a broker export and the desk it belongs to is created for you. No server, no currency, no wizard.">
          <ImportDrop busy={busy} onFile={handleFile} />
          {accounts.length > 1 && (
            <Notice tone="info">
              Several desks exist. Pick one in the top bar to see its session, or open Settings to manage them.
            </Notice>
          )}
          <div className="actions">
            <a className="btn" href={`${base}settings/`}><Icon name="settings" size={14} /> Manage desks</a>
          </div>
        </Card>
      )}

      {account && desk && (
        <>
          <div className="today-head">
            <div>
              <div className="today-head__label">
                {account.kind === 'propfirm' ? 'Prop firm desk' : 'Personal desk'} · {account.currency}
              </div>
              <h2 className="today-head__title">{account.label}</h2>
            </div>
            {desk.evaluation ? (
              <Badge tone={STATUS_TONE[desk.evaluation.status]}>
                {desk.evaluation.status === 'breach' ? 'Limit breached'
                  : desk.evaluation.status === 'warning' ? 'Close to a limit' : 'Inside limits'}
              </Badge>
            ) : (
              <Badge>{account.kind === 'propfirm' ? 'No plan yet' : 'Personal'}</Badge>
            )}
          </div>

          <Card
            title="Close the session"
            description="One file, one action. The export is processed locally and never uploaded."
            badge={summary ? <Badge tone="profit">imported</Badge> : undefined}
          >
            <ImportDrop busy={busy} onFile={handleFile} />
            {summary && (
              <Notice tone="success" title={summary.alreadyImported ? 'Already imported' : 'Imported'}>
                {summary.file} · {summary.label} → <strong>{summary.desk}</strong>.{' '}
                {summary.inserted} new, {summary.duplicates} duplicate, {summary.failed} failed.
              </Notice>
            )}
            {pending && (
              <div className="grid panel">
                <Notice tone="warning" title="This file does not say which desk it belongs to">
                  Name it once and the next export of the same account will land here on its own.
                </Notice>
                <div className="form-grid">
                  <Field label="Desk name" value={manual.label} onInput={(value) => setManual({ ...manual, label: value })} />
                  <Field label="Account number (optional)" value={manual.accountNumber} onInput={(value) => setManual({ ...manual, accountNumber: value })} />
                  <Field label="Broker / server" value={manual.server} onInput={(value) => setManual({ ...manual, server: value })} />
                  <Field label="Currency" value={manual.currency} onInput={(value) => setManual({ ...manual, currency: value.toUpperCase() })} />
                </div>
                <div className="actions">
                  <button className="btn" onClick={() => setPending(undefined)}>Cancel</button>
                  <button className="btn primary" disabled={busy || !manual.label.trim() || !manual.server.trim() || !manual.currency.trim()} onClick={commitPending}>
                    Save import
                  </button>
                </div>
              </div>
            )}
          </Card>

          <div className="grid stats-grid">
            <StatTile label="Trades today" value={desk.todaySummary?.tradeCount ?? 0} foot={desk.today} />
            <StatTile
              label="Result today"
              value={money(desk.todaySummary?.realized ?? '0', currency)}
              tone={Number(desk.todaySummary?.realized ?? 0) >= 0 ? 'profit' : 'loss'}
              foot="Realized, closed trades"
            />
            <StatTile
              label="Of opening balance"
              value={desk.todaySummary?.resultPct === null || desk.todaySummary === null ? '—' : pct(desk.todaySummary.resultPct)}
              foot={desk.todaySummary?.openingBalance ? `Base ${money(desk.todaySummary.openingBalance, currency)}` : 'Starting balance not set'}
            />
            <StatTile
              label={account.kind === 'propfirm' ? 'Total drawdown' : 'Net result'}
              value={account.kind === 'propfirm'
                ? (desk.evaluation?.total ? `${money(desk.evaluation.total.value, currency)}` : '—')
                : money(desk.evaluation?.target?.realized ?? sumRealized(desk.days), currency)}
              foot={account.kind === 'propfirm' ? (desk.evaluation?.total ? `Floor ${money(desk.evaluation.total.floor, currency)}` : 'No total limit in plan') : 'All closed trades'}
            />
          </div>

          {account.kind === 'propfirm' && !plan && (
            <Card title="No challenge plan yet" description="Guardrails need the firm's numbers and its reset clock.">
              <EmptyState
                icon="shield-check"
                title="Paste your challenge rules"
                description="Write the plan in markdown with one json block, or ask your AI to write it. The app validates it before it guards anything."
                action={<a className="btn primary" href={`${base}plan/`}>Open plan</a>}
                compact
              />
            </Card>
          )}

          {plan && desk.evaluation && (
            <Card
              title="Guardrails"
              description={`Day resets at ${plan.resetTime} ${plan.resetTimeZone}. Limits are fixed amounts off the challenge balance.`}
              badge={<Badge>{plan.firm || 'Plan'}</Badge>}
            >
              <div className="guardrails">
                {desk.dailyReading && (
                  <GuardrailBar
                    label="Daily loss"
                    reading={desk.dailyReading}
                    currency={currency}
                    note={desk.dailyReading.confidence === 'attested'
                      ? 'Recomputed from the lowest equity you recorded for today.'
                      : 'Closed trades only. An intraday dip below this cannot be ruled out from the file — record the day’s lowest equity to make it attested.'}
                  />
                )}
                {desk.evaluation.total && (
                  <GuardrailBar
                    label="Total drawdown"
                    reading={desk.evaluation.total}
                    currency={currency}
                    note={desk.evaluation.total.mode === 'trailing'
                      ? 'Trails your balance peak. The firm trails equity, so this is an estimate.'
                      : 'Fixed floor from the challenge balance.'}
                  />
                )}
                {desk.evaluation.target && (
                  <GuardrailBar
                    label="Profit target"
                    reading={desk.evaluation.target}
                    currency={currency}
                    inverse
                    note="Realized profit against the target."
                  />
                )}
              </div>
              <p className="guardrail__meta">
                {desk.evaluation.minDays && `${desk.evaluation.minDays.met} of ${desk.evaluation.minDays.required} minimum trading days`}
                {desk.evaluation.minDays && desk.evaluation.consistency ? ' · ' : ''}
                {desk.evaluation.consistency
                  ? `Largest day is ${(desk.evaluation.consistency.share * 100).toFixed(1)}% of profit (cap ${(desk.evaluation.consistency.cap * 100).toFixed(0)}%)${desk.evaluation.consistency.exceeded ? ' — over the cap' : ''}`
                  : ''}
              </p>
            </Card>
          )}

          {plan && (
            <Card title="Day attestation" description="The one thing a closed-trade export can never tell the app.">
              <div className="form-grid">
                <Field
                  label={`Lowest equity today (${currency})`}
                  value={draft.lowestEquity}
                  onInput={(value) => setDraft({ ...draft, lowestEquity: value })}
                />
                <Field label="One line for future you" value={draft.note} onInput={(value) => setDraft({ ...draft, note: value })} />
              </div>
              <div className="rule-list">
                {ruleWall(plan).filter((rule) => rule.tier === 'attested').map((rule) => {
                  if (rule.tier !== 'attested') return null;
                  const checked = attestedRuleStatus(rule, draft.checklist) === 'ok';
                  return (
                    <label className="rule-row" key={rule.id}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRule(rule.id)} />
                      <span>{rule.text}</span>
                      <Badge>{checked ? 'followed' : 'open'}</Badge>
                    </label>
                  );
                })}
              </div>
              {ruleWall(plan).some((rule) => rule.tier === 'soft') && desk.todaySummary && (
                <div className="rule-list">
                  {ruleWall(plan).map((rule) => {
                    if (rule.tier !== 'soft') return null;
                    const reading = softRuleReading(rule, {
                      tradeCount: desk.todaySummary?.tradeCount ?? 0,
                      lotVolume: Number(desk.todaySummary?.lotVolume ?? 0),
                    });
                    return (
                      <div className="rule-row" key={`${rule.tier}-${rule.metric}`}>
                        <span>{rule.metric === 'tradesPerDay' ? 'Trades today' : 'Lots today'}</span>
                        <span className="muted">{reading.used} / {reading.cap}</span>
                        <Badge tone={reading.status === 'breach' ? 'loss' : reading.status === 'watch' ? 'warning' : 'profit'}>
                          {reading.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="actions">
                {saved && <span className="muted">{saved}</span>}
                <a className="btn" href={`${base}plan/`}>Edit plan</a>
                <button className="btn primary" disabled={busy} onClick={saveDay}>Save session</button>
              </div>
            </Card>
          )}

          {desk.evaluation?.breaches.length ? (
            <Notice tone="error" title="A limit was breached">
              {desk.evaluation.breaches.map((breach) => breach.reason === 'maxDailyLoss'
                ? `Daily loss on ${breach.firmDay}.`
                : 'Total drawdown floor crossed.').join(' ')}{' '}
              The history is still here — nothing is hidden or deleted.
            </Notice>
          ) : null}

          <Card
            title="This month"
            description="Trade count and result per day. Days with no trades stay empty."
            action={(
              <div className="actions">
                <button className="btn btn--sm" onClick={() => setMonth(shiftMonth(month || desk.today.slice(0, 7), -1))}>←</button>
                <button className="btn btn--sm" onClick={() => setMonth(shiftMonth(month || desk.today.slice(0, 7), 1))}>→</button>
              </div>
            )}
          >
            <CalendarMonth
              month={month || desk.today.slice(0, 7)}
              days={monthDays}
              budget={account.kind === 'propfirm' ? budget : undefined}
              money={(value) => money(value, currency)}
            />
          </Card>

          <div className="today-recent">
            <Card title="Latest trades" action={<a className="btn btn--sm" href={`${base}trades/`}>All trades</a>}>
              {recentPositions(positions, account.id).length === 0 ? (
                <EmptyState icon="list" title="No closed trades yet" compact />
              ) : (
                <div className="recent-list">
                  {recentPositions(positions, account.id).map((position) => (
                    <a className="recent-row" key={position.id} href={`${base}journal/?positionId=${encodeURIComponent(position.id)}`}>
                      <span className="u-truncate"><strong className="symbol">{position.symbol}</strong> <SideBadge side={position.side} /></span>
                      <span className="u-xs muted">{position.closeAt ? new Date(position.closeAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
                      <span className={`recent-row__value ${Number(position.netProfit) >= 0 ? 'profit' : 'loss'}`}>
                        {money(position.netProfit, currency)}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <WeeklyReviewApp />
        </>
      )}
    </div>
  );
}

function ImportDrop({ busy, onFile }: { busy: boolean; onFile: (file?: File) => void }) {
  return (
    <label className="dropzone dropzone--session">
      <input
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          onFile(input.files?.[0]);
          input.value = '';
        }}
      />
      <div>
        <div className="empty-icon"><Icon name="upload" size={20} /></div>
        <h3>{busy ? 'Reading…' : 'Drop the session export'}</h3>
        <p className="muted">MT5 report (workbook or CSV) or Exness CSV. It lands on the right desk by itself.</p>
      </div>
    </label>
  );
}

function Field({ label, value, onInput }: { label: string; value: string; onInput: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input aria-label={label} value={value} onInput={(event) => onInput(event.currentTarget.value)} />
    </div>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

function recentPositions(positions: Position[], accountId: string): Position[] {
  return positions
    .filter((position) => position.accountId === accountId && position.closeAt)
    .sort((left, right) => (right.closeAt ?? '').localeCompare(left.closeAt ?? ''))
    .slice(0, 5);
}

function sumRealized(days: { realized: string }[]): string {
  return days.reduce((total, day) => total + Number(day.realized), 0).toString();
}
