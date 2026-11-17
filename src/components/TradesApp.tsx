import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Account, BalanceEvent, Journal, Plan, Position } from '../lib/domain/types';
import { deskClock } from '../lib/desk/clock';
import { positionsForDay, summarizeDays } from '../lib/desk/days';
import { dailyLossReading } from '../lib/desk/guardrails';
import AnalyticsApp from './AnalyticsApp';
import CalendarMonth from './CalendarMonth';
import { Badge, Card, EmptyState, Notice, SideBadge, Skeleton, Tabs } from './ui';
import { money } from './format';
import { loadAccounts, loadBalanceEvents, loadJournals, loadPlan, loadPositions } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const base = import.meta.env.BASE_URL;
const PAGE_SIZE = 12;
type Mode = 'calendar' | 'list' | 'analytics';

export default function TradesApp() {
  const [accountId] = useActiveAccount();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [balanceEvents, setBalanceEvents] = useState<BalanceEvent[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [plan, setPlan] = useState<Plan>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode>('calendar');
  const [month, setMonth] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    Promise.all([loadAccounts(), loadPositions(), loadBalanceEvents(), loadJournals()])
      .then(async ([loadedAccounts, loadedPositions, loadedEvents, loadedJournals]) => {
        if (!alive) return;
        setAccounts(loadedAccounts);
        setPositions(loadedPositions);
        setBalanceEvents(loadedEvents);
        setJournals(loadedJournals);
        const id = accountId || (loadedAccounts.length === 1 ? loadedAccounts[0].id : '');
        setPlan(id ? await loadPlan(id) : undefined);
      })
      .catch(() => { if (alive) setError('Local data could not be opened.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId]);

  const account = accounts.find((candidate) => candidate.id === (accountId || (accounts.length === 1 ? accounts[0].id : '')));
  const currency = account?.currency ?? 'USD';
  const displayTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const clock = account ? deskClock(account, plan, displayTimeZone) : null;
  const journalByPosition = useMemo(() => new Map(journals.map((journal) => [journal.positionId, journal])), [journals]);

  const scoped = useMemo(
    () => positions.filter((position) => !account || position.accountId === account.id),
    [positions, account],
  );

  const days = useMemo(
    () => (account && clock ? summarizeDays(scoped, account, clock, balanceEvents) : []),
    [scoped, account, clock, balanceEvents],
  );

  const budget = useMemo(() => {
    if (!account || account.kind !== 'propfirm' || !plan) return undefined;
    return Object.fromEntries(
      days
        .map((day) => [day.firmDay, dailyLossReading(plan, day)?.usedPct ?? null])
        .filter(([, used]) => used !== null),
    ) as Record<string, number | null>;
  }, [account, plan, days]);

  useEffect(() => {
    if (!month && days.length) setMonth(days.at(-1)!.firmDay.slice(0, 7));
  }, [days, month]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped
      .filter((position) => {
        const journal = journalByPosition.get(position.id);
        const at = (position.closeAt ?? position.openAt).slice(0, 10);
        const pnl = Number(position.netProfit);
        const haystack = `${position.symbol} ${position.positionId} ${journal?.strategy ?? ''} ${journal?.tags.join(' ') ?? ''}`.toLowerCase();
        if (needle && !haystack.includes(needle)) return false;
        if (result === 'win' && pnl <= 0) return false;
        if (result === 'loss' && pnl >= 0) return false;
        if (result === 'be' && pnl !== 0) return false;
        if (from && at < from) return false;
        if (to && at > to) return false;
        return true;
      })
      .sort((left, right) => (right.closeAt ?? right.openAt).localeCompare(left.closeAt ?? left.openAt));
  }, [scoped, query, result, from, to, journalByPosition]);

  useEffect(() => { setPage(1); }, [query, result, from, to, accountId]);

  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const total = filtered.reduce((sum, position) => sum + Number(position.netProfit), 0);

  const dayPositions = selectedDay && account && clock
    ? positionsForDay(positions, account.id, selectedDay, clock)
    : [];

  if (loading) {
    return <div className="card"><Skeleton height={42} /><div className="u-mt-4"><Skeleton height={240} /></div></div>;
  }

  return (
    <div className="grid">
      {error && <Notice tone="error">{error}</Notice>}

      <Tabs
        label="Trades view"
        active={mode}
        onChange={setMode}
        items={[
          { id: 'calendar', label: 'Calendar' },
          { id: 'list', label: 'List', count: filtered.length },
          { id: 'analytics', label: 'Analytics' },
        ]}
      />

      {!account && (
        <Notice tone="info">Pick a desk in the top bar to see its calendar and guardrails.</Notice>
      )}

      {mode === 'calendar' && (
        <>
          {!account ? null : days.length === 0 ? (
            <Card>
              <EmptyState
                icon="upload"
                title="No trades yet"
                description="Drop a session export on Today and it lands here by itself."
                action={<a className="btn primary" href={`${base}import/`}>Import history</a>}
                compact
              />
            </Card>
          ) : (
            <>
              <Card
                title="Trading calendar"
                description="Trade count, result and — on a prop desk — how much of the daily loss budget the day used."
                action={(
                  <div className="actions">
                    <button className="btn btn--sm" onClick={() => setMonth(shiftMonth(month || '2026-01', -1))}>←</button>
                    <button className="btn btn--sm" onClick={() => setMonth(shiftMonth(month || '2026-01', 1))}>→</button>
                  </div>
                )}
              >
                <CalendarMonth
                  month={month || days.at(-1)!.firmDay.slice(0, 7)}
                  days={days.filter((day) => day.firmDay.startsWith(month || days.at(-1)!.firmDay.slice(0, 7)))}
                  budget={budget}
                  money={(value) => money(value, currency)}
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                />
              </Card>

              {selectedDay && (
                <Card
                  title={selectedDay}
                  description={`${dayPositions.length} closed ${dayPositions.length === 1 ? 'trade' : 'trades'} on this firm day.`}
                  action={<button className="btn btn--sm" onClick={() => setSelectedDay('')}>Close</button>}
                >
                  {dayPositions.length === 0 ? (
                    <EmptyState icon="list" title="Nothing closed on this day" compact />
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Closed</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Net P&amp;L</th><th>Journal</th></tr>
                        </thead>
                        <tbody>
                          {dayPositions.map((position) => {
                            const journal = journalByPosition.get(position.id);
                            return (
                              <tr key={position.id}>
                                <td>{position.closeAt ? new Date(position.closeAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                <td className="symbol">{position.symbol}</td>
                                <td><SideBadge side={position.side} /></td>
                                <td>{position.volume}</td>
                                <td className={Number(position.netProfit) >= 0 ? 'profit' : 'loss'}>{money(position.netProfit, currency)}</td>
                                <td>
                                  <a className="btn btn--sm" href={`${base}journal/?positionId=${encodeURIComponent(position.id)}`}>
                                    {journal ? 'Open' : 'Write'}
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </>
      )}

      {mode === 'list' && (
        <section className="card">
          <div className="toolbar">
            <input aria-label="Search trades" placeholder="Symbol, ticket, strategy, tag…" value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
            <select aria-label="Result filter" value={result} onChange={(event) => setResult(event.currentTarget.value)}>
              <option value="">All results</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="be">Breakeven</option>
            </select>
            <input aria-label="From date" type="date" value={from} onInput={(event) => setFrom(event.currentTarget.value)} />
            <input aria-label="To date" type="date" value={to} onInput={(event) => setTo(event.currentTarget.value)} />
          </div>
          <div className="list-summary">
            <span><strong>{filtered.length}</strong> trades</span>
            <span className={total >= 0 ? 'profit' : 'loss'}><strong>{money(total, currency)}</strong> net</span>
            <Badge>{account?.label ?? 'All desks'}</Badge>
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon="list"
              title={scoped.length ? 'No trades match' : 'No trades yet'}
              description={scoped.length ? 'Change the filters or the search.' : 'Import a session export to fill this list.'}
              compact
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Net P&amp;L</th><th>Journal</th></tr>
                </thead>
                <tbody>
                  {visible.map((position) => {
                    const journal = journalByPosition.get(position.id);
                    const pnl = Number(position.netProfit);
                    return (
                      <tr key={position.id}>
                        <td>{new Date(position.closeAt ?? position.openAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="symbol">{position.symbol}</td>
                        <td><SideBadge side={position.side} /></td>
                        <td>{position.volume}</td>
                        <td className={pnl >= 0 ? 'profit' : 'loss'}>{money(position.netProfit, currency)}</td>
                        <td>
                          <a className="btn btn--sm" href={`${base}journal/?positionId=${encodeURIComponent(position.id)}`}>
                            {journal ? 'Open' : 'Write'}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length}` : '0 trades'}</span>
            <div className="actions">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>←</button>
              <button className="btn" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>→</button>
            </div>
          </div>
        </section>
      )}

      {mode === 'analytics' && <AnalyticsApp />}
    </div>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7);
}
