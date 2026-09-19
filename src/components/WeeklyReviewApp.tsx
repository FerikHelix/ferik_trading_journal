import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Account, Journal, Position, WeeklyReview } from '../lib/domain/types';
import { calculateWeeklyReview, shiftWeek, weekBounds } from '../lib/review';
import { loadAccounts, loadJournals, loadPositions, loadWeeklyReview, saveWeeklyReview } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const blankReview = (accountId: string, weekStart: string, weekEnd: string): WeeklyReview => ({ id: crypto.randomUUID(), accountId, weekStart, weekEnd, wentWell: '', toImprove: '', lesson: '', nextWeekFocus: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const weekLabel = (start: string, end: string) => `${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(start))} – ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(end))}`;
const percent = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 }).format(value);

function InsightList({ title, values }: { title: string; values: Array<{ value: string; count: number }> }) {
  return <section className="card review-insight"><div className="card-head"><h3>{title}</h3></div>{values.length ? <div className="review-value-list">{values.slice(0, 4).map((item) => <div key={item.value}><span>{item.value}</span><strong>{item.count}×</strong></div>)}</div> : <p className="muted">Belum ada data journal yang cukup.</p>}</section>;
}

function TradeSpotlight({ title, position, tone }: { title: string; position?: Position; tone: 'profit' | 'loss' }) {
  if (!position) return <section className="card review-spotlight"><div className="card-head"><h3>{title}</h3></div><p className="muted">Belum ada posisi pada minggu ini.</p></section>;
  return <section className="card review-spotlight"><div className="card-head"><h3>{title}</h3><span className={`badge ${tone}`}>{position.symbol}</span></div><strong className={`review-trade-value ${tone}`}>{Number(position.netProfit).toFixed(2)}</strong><p className="muted">{position.side.toUpperCase()} · selesai {new Date(position.closeAt!).toLocaleString('id-ID', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</p><a className="btn" href={`${import.meta.env.BASE_URL}journal/?positionId=${encodeURIComponent(position.id)}`}>Buka jurnal</a></section>;
}

export default function WeeklyReviewApp() {
  const [accounts, setAccounts] = useState<Account[]>([]); const [positions, setPositions] = useState<Position[]>([]); const [journals, setJournals] = useState<Journal[]>([]);
  // Weekly review needs a concrete account, so '' ("Semua account" in the
  // topbar) falls back to the first one rather than rendering nothing.
  const [scopedAccountId] = useActiveAccount();
  const [fallbackAccountId, setFallbackAccountId] = useState('');
  const accountId = scopedAccountId || fallbackAccountId; const [bounds, setBounds] = useState(() => weekBounds()); const [review, setReview] = useState<WeeklyReview>();
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const ready = useRef(false);

  useEffect(() => { Promise.all([loadAccounts(), loadPositions(), loadJournals()]).then(([loadedAccounts, loadedPositions, loadedJournals]) => { setAccounts(loadedAccounts); setPositions(loadedPositions); setJournals(loadedJournals); setFallbackAccountId(loadedAccounts[0]?.id || ''); }).catch(() => setError('Weekly Review tidak dapat dimuat.')).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false; ready.current = false;
    loadWeeklyReview(accountId, bounds.weekStart).then((stored) => { if (!cancelled) { setReview(stored ?? blankReview(accountId, bounds.weekStart, bounds.weekEnd)); setSaveState('idle'); setTimeout(() => { if (!cancelled) ready.current = true; }, 0); } }).catch(() => !cancelled && setError('Refleksi mingguan tidak dapat dimuat.'));
    return () => { cancelled = true; };
  }, [accountId, bounds.weekStart, bounds.weekEnd]);
  useEffect(() => {
    if (!review || !ready.current) return;
    setSaveState('saving');
    const timer = setTimeout(() => saveWeeklyReview({ ...review, updatedAt: new Date().toISOString() }).then(() => setSaveState('saved')).catch(() => setSaveState('error')), 650);
    return () => clearTimeout(timer);
  }, [review]);

  const data = useMemo(() => accountId ? calculateWeeklyReview(positions, accounts, journals, accountId, bounds) : undefined, [positions, accounts, journals, accountId, bounds]);
  const account = accounts.find((item) => item.id === accountId);
  const money = (value: string | null | undefined) => value === null || value === undefined || !account ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: account.currency, maximumFractionDigits: 2 }).format(Number(value));
  const update = (key: 'wentWell' | 'toImprove' | 'lesson' | 'nextWeekFocus', value: string) => setReview((current) => current ? { ...current, [key]: value } : current);

  if (loading) return <div className="card"><div className="skeleton" style={{ height: 320 }} /></div>;
  if (error) return <div className="notice error">{error}</div>;
  if (!accounts.length) return <div className="empty card"><div className="empty-icon">✓</div><h3>Belum ada account untuk direview</h3><p>Import riwayat Exness terlebih dahulu. Setelah ada closed position, review mingguan akan tersedia.</p><a className="btn primary" href={`${import.meta.env.BASE_URL}import/`}>Import CSV</a></div>;
  if (!data) return null;

  return <div className="grid review-page">
    <section className="card review-controls"><div><h2>{weekLabel(bounds.weekStart, bounds.weekEnd)}</h2><p className="muted">Senin–Minggu · UTC</p></div><div className="review-actions"><div className="actions"><button className="btn" aria-label="Minggu sebelumnya" onClick={() => setBounds(shiftWeek(bounds.weekStart, -1))}>←</button><button className="btn" onClick={() => setBounds(weekBounds())}>Minggu ini</button><button className="btn" aria-label="Minggu berikutnya" onClick={() => setBounds(shiftWeek(bounds.weekStart, 1))}>→</button></div></div></section>
    {!data.positions.length ? <section className="card empty"><div className="empty-icon">⌁</div><h3>Belum ada closed position minggu ini</h3><p>Pilih minggu lain atau import riwayat trade yang sudah selesai untuk account ini.</p></section> : <>
      <section className="review-kpis"><div className="card"><div className="stat-label">Net P&amp;L</div><div className={`stat-value ${Number(data.metrics.netProfit ?? 0) >= 0 ? 'profit' : 'loss'}`}>{money(data.metrics.netProfit)}</div><div className="stat-foot">{data.metrics.totalPositions} posisi selesai</div></div><div className="card"><div className="stat-label">Win rate</div><div className="stat-value">{percent(data.metrics.winRate)}</div><div className="stat-foot">{data.metrics.wins} win · {data.metrics.losses} loss</div></div><div className="card"><div className="stat-label">Profit factor</div><div className="stat-value">{data.metrics.profitFactor ? `${Number(data.metrics.profitFactor).toFixed(2)}x` : '—'}</div><div className="stat-foot">Gross profit ÷ gross loss</div></div><div className="card"><div className="stat-label">Expectancy</div><div className="stat-value">{money(data.metrics.expectancy)}</div><div className="stat-foot">Rata-rata per posisi</div></div><div className="card"><div className="stat-label">Max drawdown</div><div className="stat-value loss">{money(data.metrics.maximumDrawdown)}</div><div className="stat-foot">Closed-trade drawdown</div></div><div className="card"><div className="stat-label">Average R</div><div className="stat-value">{data.metrics.averageRealizedR ? `${Number(data.metrics.averageRealizedR).toFixed(2)}R` : '—'}</div><div className="stat-foot">Trade dengan risk amount</div></div></section>
      <section className="review-summary-grid"><div className="card"><div className="card-head"><div><h2>Kelengkapan journal</h2><p className="muted">{data.journalledPositions} dari {data.positions.length} posisi memiliki catatan bermakna.</p></div><span className="badge">{data.positions.length ? Math.round(data.journalledPositions / data.positions.length * 100) : 0}%</span></div>{data.unjournalledPositions.length ? <div className="review-missing-list">{data.unjournalledPositions.slice(0, 5).map((position) => <a key={position.id} href={`${import.meta.env.BASE_URL}journal/?positionId=${encodeURIComponent(position.id)}`}><strong>{position.symbol}</strong><span>{position.side.toUpperCase()} · {Number(position.netProfit).toFixed(2)}</span><span>Isi jurnal →</span></a>)}</div> : <div className="notice success">Semua posisi minggu ini sudah memiliki journal bermakna.</div>}</div><div className="card"><div className="card-head"><h2>Hasil minggu ini</h2></div><div className="metric-list"><div className="metric-row"><span>Breakeven</span><strong>{data.metrics.breakeven}</strong></div><div className="metric-row"><span>Average realized R</span><strong>{data.metrics.averageRealizedR ? `${Number(data.metrics.averageRealizedR).toFixed(2)}R` : '—'}</strong></div><div className="metric-row"><span>Winning streak terpanjang</span><strong className="profit">{data.metrics.longestWinningStreak}</strong></div><div className="metric-row"><span>Losing streak terpanjang</span><strong className="loss">{data.metrics.longestLosingStreak}</strong></div></div></div></section>
      <section className="review-insight-grid"><InsightList title="Strategy terbanyak" values={data.strategies} /><InsightList title="Emotion tercatat" values={data.emotions} /><InsightList title="Mistake paling sering" values={data.mistakes} /><InsightList title="Tag dominan" values={data.tags} /></section>
      <section className="review-spotlight-grid"><TradeSpotlight title="Trade terbaik" position={data.bestPosition} tone="profit" /><TradeSpotlight title="Trade terburuk" position={data.worstPosition} tone="loss" /></section>
    </>}
    {review && <section className="card review-reflection"><div className="card-head"><div><h2>Refleksi mingguan</h2><p className="muted">Catatan ini tersimpan lokal untuk account dan minggu ini.</p></div><span className={`save-state ${saveState === 'error' ? 'loss' : ''}`}>{saveState === 'saving' ? 'Menyimpan…' : saveState === 'saved' ? '✓ Tersimpan' : saveState === 'error' ? 'Gagal menyimpan' : 'Autosave aktif'}</span></div><div className="form-grid"><label className="field"><span>Yang berjalan baik</span><textarea value={review.wentWell} onInput={(event) => update('wentWell', event.currentTarget.value)} placeholder="Apa yang kamu lakukan dengan baik?" /></label><label className="field"><span>Hal yang perlu diperbaiki</span><textarea value={review.toImprove} onInput={(event) => update('toImprove', event.currentTarget.value)} placeholder="Pola atau keputusan apa yang perlu diperbaiki?" /></label><label className="field"><span>Lesson minggu ini</span><textarea value={review.lesson} onInput={(event) => update('lesson', event.currentTarget.value)} placeholder="Pelajaran paling penting dari minggu ini" /></label><label className="field"><span>Fokus minggu depan</span><textarea value={review.nextWeekFocus} onInput={(event) => update('nextWeekFocus', event.currentTarget.value)} placeholder="Satu atau dua fokus yang spesifik" /></label></div></section>}
  </div>;
}
