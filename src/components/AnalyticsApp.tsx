import { useEffect, useMemo, useState } from 'react';
import ChartPanel from './ChartPanel';
import { calculateAnalytics, type SeriesPoint } from '../lib/analytics';
import type { Account, Journal, Position } from '../lib/domain/types';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';

type RangePreset = '7d' | '30d' | '90d' | 'month' | 'all' | 'custom';

const dateValue = (date: Date) => date.toISOString().slice(0, 10);

function datesForPreset(preset: Exclude<RangePreset, 'custom' | 'all'>) {
  const now = new Date();
  const end = dateValue(now);
  const start = new Date(now);
  if (preset === 'month') start.setDate(1);
  else start.setDate(start.getDate() - Number.parseInt(preset, 10) + 1);
  return { from: dateValue(start), to: end };
}

function toRange(date: string, edge: 'start' | 'end') {
  return date ? `${date}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z` : undefined;
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(value);
}

function formatPercent(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function rangeLabel(granularity: 'day' | 'month') {
  return granularity === 'day' ? 'P&L harian' : 'P&L bulanan';
}

function Breakdown({ title, rows, currency }: { title: string; rows: SeriesPoint[]; currency: string | null }) {
  if (!rows.length) return <section className="card breakdown-card"><div className="card-head"><h2>{title}</h2></div><div className="empty compact"><p>Belum ada closed position pada filter ini.</p></div></section>;
  return <section className="card breakdown-card">
    <div className="card-head"><h2>{title}</h2><span className="badge">{rows.length} grup</span></div>
    <div className="breakdown-table" role="table" aria-label={`Performa ${title}`}>
      <div className="breakdown-row breakdown-header" role="row"><span>Grup</span><span>Trade</span><span>Win rate</span><span>P&amp;L</span></div>
      {rows.map((row) => <div className="breakdown-row" role="row" key={row.key}>
        <strong title={row.label}>{row.label}</strong><span>{row.count}</span><span>{formatPercent(row.winRate)}</span>
        <span className={Number(row.netProfit ?? 0) > 0 ? 'profit' : Number(row.netProfit ?? 0) < 0 ? 'loss' : ''}>{currency && row.netProfit !== null ? new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(row.netProfit)) : '—'}</span>
      </div>)}
    </div>
  </section>;
}

export default function AnalyticsApp() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [accountId, setAccountId] = useState('');
  const [preset, setPreset] = useState<RangePreset>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([loadPositions(), loadAccounts(), loadJournals()])
      .then(([loadedPositions, loadedAccounts, loadedJournals]) => { setPositions(loadedPositions); setAccounts(loadedAccounts); setJournals(loadedJournals); })
      .catch(() => setError('Analytics tidak dapat dimuat.'))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(() => calculateAnalytics(positions, accounts, journals, {
    ...(accountId ? { accountIds: [accountId] } : {}),
    ...(toRange(from, 'start') ? { from: toRange(from, 'start') } : {}),
    ...(toRange(to, 'end') ? { to: toRange(to, 'end') } : {}),
  }), [positions, accounts, journals, accountId, from, to]);

  const selectPreset = (next: RangePreset) => {
    setPreset(next);
    if (next === 'all') { setFrom(''); setTo(''); return; }
    if (next !== 'custom') { const range = datesForPreset(next); setFrom(range.from); setTo(range.to); }
  };

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 320 }} /></div>;
  if (error) return <div className="notice error">{error}</div>;

  const metrics = data.metrics;
  const currencyFormatter = (value: number) => metrics.currency
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: metrics.currency, maximumFractionDigits: 2 }).format(value)
    : formatNumber(value);
  const money = (value: string | null) => value === null ? (metrics.requiresCurrencySelection ? 'Pilih 1 account' : '—') : currencyFormatter(Number(value));
  const currentStreak = metrics.currentStreak === 0 ? '—' : `${metrics.currentStreak > 0 ? '+' : ''}${metrics.currentStreak} ${metrics.currentStreak > 0 ? 'win' : 'loss'}`;
  const dateDescription = from || to ? `${from || 'awal'} s.d. ${to || 'hari ini'}` : 'Semua waktu';
  const breakdowns: Array<[string, SeriesPoint[]]> = [['Per symbol', data.bySymbol], ['Per strategi', data.byStrategy], ['Per sesi', data.bySession], ['Per hari', data.byWeekday], ['Per jam', data.byHour], ['Buy vs sell', data.bySide]];

  return <div className="grid analytics-page">
    <section className="card analytics-filters" aria-label="Filter analytics">
      <div className="analytics-filter-heading"><div><span className="eyebrow">Filter performa</span><h2>{dateDescription}</h2></div><span className="badge">{metrics.totalPositions} closed position</span></div>
      <div className="analytics-filter-controls">
        <div className="field"><label htmlFor="analytics-account">Account</label><select id="analytics-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Semua account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.currency}</option>)}</select></div>
        <div className="field"><label htmlFor="analytics-period">Periode</label><select id="analytics-period" value={preset} onChange={(event) => selectPreset(event.target.value as RangePreset)}><option value="7d">7 hari terakhir</option><option value="30d">30 hari terakhir</option><option value="90d">90 hari terakhir</option><option value="month">Bulan ini</option><option value="all">Semua waktu</option><option value="custom">Tanggal kustom</option></select></div>
        {preset === 'custom' && <><div className="field"><label htmlFor="analytics-from">Dari</label><input id="analytics-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div className="field"><label htmlFor="analytics-to">Sampai</label><input id="analytics-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div></>}
      </div>
    </section>
    {metrics.requiresCurrencySelection && <div className="notice warning">Account menggunakan currency berbeda. Pilih satu account untuk melihat metrik nominal dan P&amp;L per grup.</div>}
    {metrics.totalPositions === 0 ? <section className="card empty"><div className="empty-icon">⌁</div><h3>Belum ada closed position pada filter ini</h3><p>Ubah rentang waktu atau import riwayat trade yang sudah selesai untuk melihat performa.</p></section> : <>
      <section className="analytics-kpis primary-kpis" aria-label="Metrik utama">
        <div className="card"><div className="stat-label">Net P&amp;L</div><div className={`stat-value ${Number(metrics.netProfit ?? 0) > 0 ? 'profit' : Number(metrics.netProfit ?? 0) < 0 ? 'loss' : ''}`}>{money(metrics.netProfit)}</div><div className="stat-foot">Closed position pada periode ini</div></div>
        <div className="card"><div className="stat-label">Win rate</div><div className="stat-value">{formatPercent(metrics.winRate)}</div><div className="stat-foot">{metrics.wins} win · {metrics.losses} loss</div></div>
        <div className="card"><div className="stat-label">Profit factor</div><div className="stat-value">{metrics.profitFactor ? `${formatNumber(Number(metrics.profitFactor))}x` : '—'}</div><div className="stat-foot">Gross profit ÷ gross loss</div></div>
        <div className="card"><div className="stat-label">Expectancy</div><div className="stat-value">{money(metrics.expectancy)}</div><div className="stat-foot">Rata-rata per posisi</div></div>
        <div className="card"><div className="stat-label">Maximum drawdown</div><div className="stat-value loss">{money(metrics.maximumDrawdown)}</div><div className="stat-foot">Dari cumulative P&amp;L</div></div>
      </section>
      <section className="analytics-main-grid">
        <div className="card analytics-equity"><div className="card-head"><div><h2>Cumulative P&amp;L</h2><p className="muted">Akumulasi hasil closed position, bukan equity curve real-time.</p></div><span className="badge">{metrics.currency ?? 'Pilih account'}</span></div><div className="chart-box chart-box-large"><ChartPanel labels={data.cumulativeProfit.map((point) => point.at.slice(0, 10))} values={data.cumulativeProfit.map((point) => Number(point.cumulativeProfit))} valueFormatter={currencyFormatter} /></div></div>
        <div className="card analytics-secondary-metrics"><div className="card-head"><h2>Statistik pendukung</h2></div><div className="metric-list"><div className="metric-row"><span>Average win</span><strong className="profit">{money(metrics.averageWin)}</strong></div><div className="metric-row"><span>Average loss</span><strong className="loss">{money(metrics.averageLoss)}</strong></div><div className="metric-row"><span>Average realized R</span><strong>{metrics.averageRealizedR ? `${formatNumber(Number(metrics.averageRealizedR))}R` : '—'}</strong></div><div className="metric-row"><span>Current streak</span><strong className={metrics.currentStreak > 0 ? 'profit' : metrics.currentStreak < 0 ? 'loss' : ''}>{currentStreak}</strong></div><div className="metric-row"><span>Longest streak</span><strong>+{metrics.longestWinningStreak} / -{metrics.longestLosingStreak}</strong></div></div></div>
      </section>
      <section className="analytics-supporting-grid">
        <div className="card"><div className="card-head"><div><h2>{rangeLabel(data.pnlGranularity)}</h2><p className="muted">Hasil bersih per periode</p></div></div><div className="chart-box"><ChartPanel labels={data.pnlByPeriod.map((point) => point.label)} values={data.pnlByPeriod.map((point) => Number(point.netProfit ?? 0))} type="bar" label="Net P&L" valueFormatter={currencyFormatter} /></div></div>
        <div className="card"><div className="card-head"><div><h2>Distribusi hasil</h2><p className="muted">Breakeven tidak dihitung dalam win rate.</p></div></div><div className="chart-box"><ChartPanel labels={['Win', 'Loss', 'Breakeven']} values={[metrics.wins, metrics.losses, metrics.breakeven]} type="doughnut" label="Posisi" valueFormatter={(value) => `${formatNumber(value)} posisi`} /></div></div>
      </section>
      <section className="analytics-breakdowns"><div className="card-head"><div><span className="eyebrow">Breakdown</span><h2>Di mana performa terbaikmu?</h2></div><p className="muted">Bandingkan konsistensi hasil berdasarkan karakteristik trade.</p></div><div className="analytics-breakdown-grid">{breakdowns.map(([title, rows]) => <Breakdown key={title} title={title} rows={rows} currency={metrics.currency} />)}</div></section>
    </>}
  </div>;
}
