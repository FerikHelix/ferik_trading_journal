import { useEffect, useMemo, useState } from 'react';
import ChartPanel from './ChartPanel';
import { calculateAnalytics } from '../lib/analytics';
import type { Account, Journal, Position } from '../lib/domain/types';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';

export default function AnalyticsApp() {
  const [positions,setPositions]=useState<Position[]>([]); const [accounts,setAccounts]=useState<Account[]>([]); const [journals,setJournals]=useState<Journal[]>([]); const [accountId,setAccountId]=useState('');
  const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(() => { Promise.all([loadPositions(),loadAccounts(),loadJournals()]).then(([p,a,j])=>{setPositions(p);setAccounts(a);setJournals(j)}).catch(()=>setError('Analytics tidak dapat dimuat.')).finally(()=>setLoading(false)); }, []);
  const data=useMemo(()=>calculateAnalytics(positions,accounts,journals,accountId?{accountIds:[accountId]}:{}),[positions,accounts,journals,accountId]);
  if (loading) return <div className="card"><div className="skeleton" style={{height:260}} /></div>;
  if(error)return <div className="notice error">{error}</div>;
  const m=data.metrics; const money=(value:string|null)=>value===null?'Pilih account':`${m.currency??''} ${Number(value).toFixed(2)}`.trim();
  return <div className="grid">
    <div className="actions"><div className="field" style={{minWidth:240}}><label htmlFor="analytics-account">Filter account</label><select id="analytics-account" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Semua account</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.label} · {account.currency}</option>)}</select></div></div>
    {m.requiresCurrencySelection&&<div className="notice warning">Account menggunakan currency berbeda. Pilih satu account untuk melihat metrik nominal.</div>}
    <div className="grid three-col">
      <section className="card"><div className="stat-label">Expectancy</div><div className="stat-value">{money(m.expectancy)}</div><div className="stat-foot">Per closed position</div></section>
      <section className="card"><div className="stat-label">Max drawdown</div><div className="stat-value loss">{money(m.maximumDrawdown)}</div><div className="stat-foot">Closed-trade drawdown</div></section>
      <section className="card"><div className="stat-label">Average R</div><div className="stat-value">{m.averageRealizedR?`${Number(m.averageRealizedR).toFixed(2)}R`:'—'}</div><div className="stat-foot">Trade dengan risk amount</div></section>
    </div>
    <div className="grid two-col">
      <section className="card"><div className="card-head"><h2>P&amp;L bulanan</h2></div><div className="chart-box"><ChartPanel labels={data.monthly.map(x=>x.label)} values={data.monthly.map(x=>Number(x.netProfit??0))} type="bar" /></div></section>
      <section className="card"><div className="card-head"><h2>Win / Loss</h2></div><div className="chart-box"><ChartPanel labels={['Win','Loss','Breakeven']} values={[m.wins,m.losses,m.breakeven]} type="doughnut" label="Trade" /></div></section>
    </div>
    <div className="grid three-col">
      {([['Per symbol',data.bySymbol],['Per strategy',data.byStrategy],['Buy vs sell',data.bySide],['Per sesi',data.bySession],['Per hari',data.byWeekday],['Per jam',data.byHour]] as const).map(([title,series]) => <section className="card" key={title}><div className="card-head"><h2>{title}</h2></div>{series.length?<div className="chart-box" style={{height:190}}><ChartPanel labels={series.map(x=>x.label)} values={series.map(x=>Number(x.netProfit??x.count))} type="bar" label={m.currency?'P&L':'Jumlah trade'}/></div>:<div className="empty" style={{minHeight:160}}><p>Data akan muncul setelah trade selesai diimpor.</p></div>}</section>)}
    </div>
  </div>;
}
