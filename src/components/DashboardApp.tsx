import { useEffect, useMemo, useState } from 'react';
import ChartPanel from './ChartPanel';
import { calculateAnalytics } from '../lib/analytics';
import type { Account, Journal, Position } from '../lib/domain/types';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';

export default function DashboardApp() {
  const [positions,setPositions]=useState<Position[]>([]); const [accounts,setAccounts]=useState<Account[]>([]); const [journals,setJournals]=useState<Journal[]>([]); const [accountId,setAccountId]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  useEffect(()=>{Promise.all([loadPositions(),loadAccounts(),loadJournals()]).then(([p,a,j])=>{setPositions(p);setAccounts(a);setJournals(j)}).catch(()=>setError('Data lokal tidak dapat dibuka.')).finally(()=>setLoading(false))},[]);
  const data=useMemo(()=>calculateAnalytics(positions,accounts,journals,accountId?{accountIds:[accountId]}:{}),[positions,accounts,journals,accountId]);
  if(loading)return <div className="grid stats-grid">{[1,2,3,4].map(n=><div className="card" key={n}><div className="skeleton"/><div className="skeleton" style={{width:'55%',height:28,marginTop:18}}/></div>)}</div>;
  if(error)return <div className="notice error">{error}</div>;
  const m=data.metrics; const empty=m.totalPositions===0; const money=m.netProfit===null?'Pilih account':new Intl.NumberFormat('id-ID',{style:'currency',currency:m.currency??'USD'}).format(Number(m.netProfit)); const incomplete=data.metrics.totalPositions-journals.filter(j=>positions.some(p=>p.id===j.positionId&&(!accountId||p.accountId===accountId))).length;
  return <>
    <div className="actions" style={{marginBottom:16}}><div className="field" style={{minWidth:240}}><label htmlFor="dashboard-account">Filter account</label><select id="dashboard-account" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Semua account</option>{accounts.map(account=><option value={account.id} key={account.id}>{account.label} · {account.currency}</option>)}</select></div></div>
    {m.requiresCurrencySelection&&<div className="notice warning" style={{marginBottom:16}}>Pilih satu account agar nominal dari currency berbeda tidak digabungkan.</div>}
    <div className="grid stats-grid"><div className="card"><div className="stat-label">Net P&amp;L</div><div className={`stat-value ${Number(m.netProfit??0)>=0?'profit':'loss'}`}>{money}</div><div className="stat-foot">Closed positions</div></div><div className="card"><div className="stat-label">Win rate</div><div className="stat-value">{m.winRate===null?'—':`${(m.winRate*100).toFixed(1)}%`}</div><div className="stat-foot">Breakeven dikecualikan</div></div><div className="card"><div className="stat-label">Profit factor</div><div className="stat-value">{m.profitFactor===null?'—':Number(m.profitFactor).toFixed(2)}</div><div className="stat-foot">Gross profit ÷ gross loss</div></div><div className="card"><div className="stat-label">Total trade</div><div className="stat-value">{m.totalPositions}</div><div className="stat-foot">Posisi selesai</div></div></div>
    <div className="grid two-col"><section className="card"><div className="card-head"><h2>Cumulative P&amp;L</h2><span className="badge">Semua waktu</span></div>{empty?<Empty/>:<div className="chart-box"><ChartPanel labels={data.cumulativeProfit.map(p=>new Date(p.at).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}))} values={data.cumulativeProfit.map(p=>Number(p.cumulativeProfit))}/></div>}</section><section className="card"><div className="card-head"><h2>Fokus berikutnya</h2><span className="badge">Insight</span></div><div className="metric-list"><div className="metric-row"><span>Journal belum lengkap</span><strong>{Math.max(0,incomplete)}</strong></div><div className="metric-row"><span>Average realized R</span><strong>{m.averageRealizedR?`${Number(m.averageRealizedR).toFixed(2)}R`:'—'}</strong></div><div className="metric-row"><span>Winning streak terpanjang</span><strong>{m.longestWinningStreak}</strong></div></div></section></div>
  </>;
}

function Empty(){return <div className="empty"><div className="empty-icon">↗</div><h3>Belum ada trade</h3><p>Import riwayat Exness MT5 untuk mulai melihat kurva performa dan statistik trading.</p><a className="btn primary" href={`${import.meta.env.BASE_URL}import/`}>Import CSV</a></div>}
