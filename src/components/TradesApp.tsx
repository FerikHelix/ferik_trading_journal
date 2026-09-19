import { useEffect, useMemo, useState } from 'react';
import type { Account, Journal, Position } from '../lib/domain/types';
import { Icon, SideBadge } from './ui';
import { loadAccounts, loadJournals, loadPositions } from './dataClient';
import { useActiveAccount } from './useActiveAccount';

const PAGE_SIZE = 12;

export default function TradesApp() {
  const [rows,setRows]=useState<Position[]>([]); const [journals,setJournals]=useState<Journal[]>([]); const [accounts,setAccounts]=useState<Account[]>([]);
  // Account scope lives in the topbar so it survives navigation between pages.
  const [account]=useActiveAccount();
  const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [side,setSide]=useState(''); const [result,setResult]=useState(''); const [strategy,setStrategy]=useState(''); const [journalStatus,setJournalStatus]=useState(''); const [from,setFrom]=useState(''); const [to,setTo]=useState(''); const [sort,setSort]=useState('date-desc'); const [page,setPage]=useState(1);
  useEffect(()=>{Promise.all([loadPositions(),loadJournals(),loadAccounts()]).then(([p,j,a])=>{setRows(p);setJournals(j);setAccounts(a)}).catch(()=>setError('Data lokal tidak dapat dibuka. Muat ulang halaman dan coba lagi.')).finally(()=>setLoading(false))},[]);
  const journalByPosition=useMemo(()=>new Map(journals.map(j=>[j.positionId,j])),[journals]);
  const filtered=useMemo(()=>rows.filter(p=>{
    const j=journalByPosition.get(p.id); const pnl=Number(p.netProfit); const at=(p.closeAt??p.openAt).slice(0,10); const haystack=`${p.symbol} ${p.positionId} ${j?.strategy??''} ${j?.tags.join(' ')??''}`.toLowerCase();
    return (!query||haystack.includes(query.toLowerCase()))&&(!side||p.side===side)&&(!account||p.accountId===account)&&(!strategy||j?.strategy===strategy)&&(!journalStatus||(journalStatus==='complete'?Boolean(j):!j))&&(!from||at>=from)&&(!to||at<=to)&&(!result||(result==='win'?pnl>0:result==='loss'?pnl<0:pnl===0));
  }).sort((a,b)=>sort==='date-asc'?Date.parse(a.closeAt??a.openAt)-Date.parse(b.closeAt??b.openAt):sort==='pnl-desc'?Number(b.netProfit)-Number(a.netProfit):sort==='pnl-asc'?Number(a.netProfit)-Number(b.netProfit):sort==='volume-desc'?Number(b.volume)-Number(a.volume):Date.parse(b.closeAt??b.openAt)-Date.parse(a.closeAt??a.openAt)),[rows,query,side,result,account,strategy,journalStatus,from,to,sort,journalByPosition]);
  useEffect(()=>setPage(1),[query,side,result,account,strategy,journalStatus,from,to,sort]);
  const visible=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE); const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); const total=filtered.reduce((n,p)=>n+Number(p.netProfit),0); const accountById=new Map(accounts.map(a=>[a.id,a])); const currencies=new Set(filtered.map(p=>accountById.get(p.accountId)?.currency).filter(Boolean)); const monetary=currencies.size<=1; const currency=[...currencies][0]??''; const strategies=[...new Set(journals.map(j=>j.strategy).filter(Boolean))].sort();
  if(loading)return <div className="card"><div className="skeleton" style={{height:42}}/><div className="skeleton" style={{height:240,marginTop:16}}/></div>;
  if(error)return <div className="notice error">{error}</div>;
  return <>
    {!monetary&&<div className="notice warning" style={{marginBottom:16}}>Pilih satu account agar nominal dari currency berbeda tidak dijumlahkan.</div>}
    <div className="grid stats-grid"><Mini label="Posisi" value={String(filtered.length)}/><Mini label="Net P&L" value={monetary?`${currency} ${total.toFixed(2)}`:'Pilih account'} tone={monetary?(total>=0?'profit':'loss'):''}/><Mini label="Commission" value={monetary?filtered.reduce((n,p)=>n+Number(p.commission),0).toFixed(2):'—'}/><Mini label="Swap" value={monetary?filtered.reduce((n,p)=>n+Number(p.swap),0).toFixed(2):'—'}/></div>
    <section className="card">
      <div className="toolbar">
        <input aria-label="Cari trade" placeholder="Cari symbol, ticket, strategy, tag…" value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="Filter arah" value={side} onChange={e=>setSide(e.target.value)}><option value="">Buy & sell</option><option value="buy">Buy</option><option value="sell">Sell</option></select>
        <select aria-label="Filter hasil" value={result} onChange={e=>setResult(e.target.value)}><option value="">Semua hasil</option><option value="win">Win</option><option value="loss">Loss</option><option value="be">Breakeven</option></select>
        <select aria-label="Filter strategy" value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="">Semua strategy</option>{strategies.map(value=><option key={value}>{value}</option>)}</select>
        <select aria-label="Filter journal" value={journalStatus} onChange={e=>setJournalStatus(e.target.value)}><option value="">Semua journal</option><option value="complete">Sudah diisi</option><option value="empty">Belum diisi</option></select>
        <input aria-label="Tanggal mulai" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input aria-label="Tanggal akhir" type="date" value={to} onChange={e=>setTo(e.target.value)}/>
        <select aria-label="Urutkan" value={sort} onChange={e=>setSort(e.target.value)}><option value="date-desc">Terbaru</option><option value="date-asc">Terlama</option><option value="pnl-desc">P&amp;L terbesar</option><option value="pnl-asc">P&amp;L terkecil</option><option value="volume-desc">Volume terbesar</option></select>
      </div>
      {!visible.length?<div className="empty"><div className="empty-icon"><Icon name="list" size={20} /></div><h3>{rows.length?'Tidak ada hasil':'Belum ada trade'}</h3><p>{rows.length?'Coba ubah filter atau kata pencarian.':'Import file CSV Exness untuk mengisi daftar trade.'}</p>{!rows.length&&<a className="btn primary" href={`${import.meta.env.BASE_URL}import/`}>Import CSV</a>}</div>:<div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Symbol</th><th>Side</th><th>Volume</th><th>Net P&amp;L</th><th>Strategy</th><th>Journal</th></tr></thead><tbody>{visible.map(p=>{const j=journalByPosition.get(p.id);const pnl=Number(p.netProfit);return <tr key={p.id}><td>{new Date(p.closeAt??p.openAt).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})}</td><td className="symbol">{p.symbol}</td><td><SideBadge side={p.side} /></td><td>{p.volume}</td><td className={pnl>=0?'profit':'loss'}>{pnl.toFixed(2)}</td><td>{j?.strategy||'—'}</td><td><a className="btn" href={`${import.meta.env.BASE_URL}journal/?positionId=${encodeURIComponent(p.id)}`}>{j?'Buka':'Isi jurnal'}</a></td></tr>})}</tbody></table></div>}
      <div className="pagination"><span>{filtered.length?`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,filtered.length)} dari ${filtered.length}`:'0 trade'}</span><div className="actions"><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>←</button><button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>→</button></div></div>
    </section>
  </>;
}

function Mini({label,value,tone=''}:{label:string;value:string;tone?:string}){return <div className="card"><div className="stat-label">{label}</div><div className={`stat-value ${tone}`}>{value}</div></div>}
