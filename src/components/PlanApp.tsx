import { useEffect, useState } from 'preact/hooks';
import type { Account, Plan } from '../lib/domain/types';
import type { PlanError } from '../lib/desk/plan';
import { ruleWall } from '../lib/desk/rules';
import { Badge, Card, EmptyState, Icon, Notice, Skeleton } from './ui';
import { changeDeskKind, loadAccounts, loadPlan, submitPlanText } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;

const STARTER = `# My challenge — Phase 1

Paste the firm's rules below, then replace the numbers. Ask an AI to fill the json block from the rule text.

\`\`\`json
{
  "firm": "",
  "phase": "Phase 1",
  "startingBalance": "100000",
  "effectiveFrom": "2026-11-01",
  "resetTime": "00:00",
  "resetTimeZone": "Europe/Prague",
  "maxDailyLossPct": 5,
  "maxTotalLossPct": 10,
  "totalLossMode": "static",
  "profitTargetPct": 10,
  "minTradingDays": 4,
  "consistencyPct": null,
  "softCaps": { "tradesPerDay": 2 }
}
\`\`\`

## Rules only you can confirm

- [ ] No trading 15 minutes around high-impact news
- [ ] No positions held over the weekend
`;

export default function PlanApp() {
  const [accountId, setAccountId] = useActiveAccount();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<Plan>();
  const [markdown, setMarkdown] = useState(STARTER);
  const [errors, setErrors] = useState<PlanError[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const loaded = await loadAccounts();
        if (!alive) return;
        setAccounts(loaded);
        const active = loaded.find((account) => account.id === accountId) ?? (loaded.length === 1 ? loaded[0] : undefined);
        if (active && active.id !== accountId) setAccountId(active.id);
        const stored = active ? await loadPlan(active.id) : undefined;
        if (!alive) return;
        setPlan(stored);
        if (stored) setMarkdown(stored.markdown);
      } catch {
        if (alive) setError('Local data could not be opened.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [accountId]);

  const account = accounts.find((candidate) => candidate.id === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined);

  async function apply() {
    if (!account) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await submitPlanText(account.id, markdown);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setPlan(result.plan);
      setMessage('Plan saved. Guardrails now read from it.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The plan could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function promote() {
    if (!account) return;
    setBusy(true);
    setError('');
    try {
      await changeDeskKind(account.id, 'propfirm');
      setAccounts((current) => current.map((candidate) => candidate.id === account.id ? { ...candidate, kind: 'propfirm' } : candidate));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The desk could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card"><Skeleton height={42} /><div className="u-mt-4"><Skeleton height={260} /></div></div>;

  if (!account) {
    return (
      <Card>
        <EmptyState
          icon="shield-check"
          title="No desk selected"
          description="Import an export first — a desk is created for you — then come back to write its plan."
          action={<a className="btn primary" href={`${base}import/`}>Import history</a>}
          compact
        />
      </Card>
    );
  }

  if (account.kind !== 'propfirm') {
    return (
      <Card title="This is a personal desk" description="A plan governs a challenge. Personal desks are judged on results, not limits.">
        <Notice tone="info">
          Converting is reversible while no plan is attached, and it does not touch your imported history.
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={promote}>Make this a prop firm desk</button>
          <a className="btn" href={`${base}settings/`}>Manage desks</a>
        </div>
      </Card>
    );
  }

  const rules = plan ? ruleWall(plan) : [];

  return (
    <div className="grid two-col plan-page">
      <div className="grid">
        <Card
          title="Challenge plan"
          description="Markdown is the source of truth. One fenced json block carries the numbers the app computes with."
          badge={plan ? <Badge tone="profit">active</Badge> : <Badge>none yet</Badge>}
        >
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {errors.length > 0 && (
            <Notice tone="error" title="Plan not saved — the previous one is still in force">
              <ul className="error-list">
                {errors.map((entry) => <li key={`${entry.path}-${entry.message}`}><code>{entry.path}</code> {entry.message}</li>)}
              </ul>
            </Notice>
          )}
          <div className="field">
            <label htmlFor="plan-markdown">Plan markdown</label>
            <textarea
              id="plan-markdown"
              className="code-input"
              rows={22}
              value={markdown}
              onInput={(event) => setMarkdown(event.currentTarget.value)}
            />
          </div>
          <div className="actions">
            <a className="btn" href={`${base}plan/`} onClick={(event) => { event.preventDefault(); setMarkdown(plan?.markdown ?? STARTER); }}>Reset to saved</a>
            <button className="btn primary" disabled={busy} onClick={apply}>{busy ? 'Checking…' : 'Apply plan'}</button>
          </div>
        </Card>
      </div>

      <div className="grid">
        <Card title="The rule wall" description="Three tiers. The system computes the first, counts the second, and asks you about the third.">
          {rules.length === 0 ? (
            <EmptyState icon="shield-check" title="No rules yet" description="Apply a plan and its rules appear here." compact />
          ) : (
            <div className="rule-wall">
              {(['computed', 'soft', 'attested'] as const).map((tier) => {
                const tierRules = rules.filter((rule) => rule.tier === tier);
                if (tierRules.length === 0) return null;
                return (
                  <div className="rule-wall__group" key={tier}>
                    <div className="rule-wall__title">
                      <Icon name={tier === 'computed' ? 'bar-chart' : tier === 'soft' ? 'list' : 'calendar-check'} size={14} />
                      {tier === 'computed' ? 'Computed from your data' : tier === 'soft' ? 'Counted against a cap' : 'Only you can confirm'}
                    </div>
                    {tierRules.map((rule, index) => (
                      <div className="rule-wall__row" key={rule.tier === 'attested' ? rule.id : `rule-${index}`}>
                        {rule.tier === 'computed' && <span>{COMPUTED_LABEL[rule.kind]}</span>}
                        {rule.tier === 'soft' && <span>{rule.metric === 'tradesPerDay' ? 'Trades per day' : 'Lots per day'} ≤ {rule.cap}</span>}
                        {rule.tier === 'attested' && <span>{rule.text}</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {plan && (
          <Card title="Plan facts" description="What the guardrails will read.">
            <dl className="fact-list">
              <div><dt>Firm</dt><dd>{plan.firm || '—'}</dd></div>
              <div><dt>Phase</dt><dd>{plan.phase || '—'}</dd></div>
              <div><dt>Starting balance</dt><dd>{plan.startingBalance}</dd></div>
              <div><dt>Effective from</dt><dd>{plan.effectiveFrom}</dd></div>
              <div><dt>Daily reset</dt><dd>{plan.resetTime} · {plan.resetTimeZone}</dd></div>
              <div><dt>Daily loss</dt><dd>{plan.maxDailyLossPct === null ? 'not set' : `${plan.maxDailyLossPct}%`}</dd></div>
              <div><dt>Total loss</dt><dd>{plan.maxTotalLossPct === null ? 'not set' : `${plan.maxTotalLossPct}% · ${plan.totalLossMode}`}</dd></div>
              <div><dt>Target</dt><dd>{plan.profitTargetPct === null ? 'not set' : `${plan.profitTargetPct}%`}</dd></div>
              <div><dt>Minimum days</dt><dd>{plan.minTradingDays ?? 'not set'}</dd></div>
              <div><dt>Consistency</dt><dd>{plan.consistencyPct === null ? 'not set' : `${plan.consistencyPct}%`}</dd></div>
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}

const COMPUTED_LABEL = {
  maxDailyLoss: 'Daily loss limit',
  maxTotalLoss: 'Total drawdown floor',
  target: 'Profit target',
  minDays: 'Minimum trading days',
  consistency: 'Consistency cap',
} as const;
