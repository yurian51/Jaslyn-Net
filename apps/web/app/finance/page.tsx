'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './finance.css';

type Row = Record<string, any>;
const money=(v:any,c='TZS')=>{const amount=Number(v||0);if(!Number.isFinite(amount))return '—';try{return new Intl.NumberFormat('en-TZ',{style:'currency',currency:c||'TZS',maximumFractionDigits:2}).format(amount)}catch{return `${c||'Unknown currency'} ${amount.toLocaleString()}`}};

export default function FinancePage(){
  const [invoices,setInvoices]=useState<Row[]>([]),[resellers,setResellers]=useState<Row[]>([]),[commissions,setCommissions]=useState<Row[]>([]);
  const [refunds,setRefunds]=useState<Row[]>([]),[disputes,setDisputes]=useState<Row[]>([]),[recons,setRecons]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [loadedDomains,setLoadedDomains]=useState<string[]>([]);
  const load=async()=>{const token=getAccessToken();if(!token){setError('Sign in to load tenant finance data.');setLoading(false);return;}setLoading(true);setError('');const h={Authorization:`Bearer ${token}`};
    const endpoints=[
      {name:'Invoices',request:apiFetch<{data:Row[]}>('/finance/invoices',{headers:h}),apply:(rows:Row[])=>setInvoices(rows)},
      {name:'Resellers',request:apiFetch<{data:Row[]}>('/finance/resellers',{headers:h}),apply:(rows:Row[])=>setResellers(rows)},
      {name:'Commissions',request:apiFetch<{data:Row[]}>('/finance/commissions',{headers:h}),apply:(rows:Row[])=>setCommissions(rows)},
      {name:'Refunds',request:apiFetch<{data:Row[]}>('/finance/refunds',{headers:h}),apply:(rows:Row[])=>setRefunds(rows)},
      {name:'Disputes',request:apiFetch<{data:Row[]}>('/finance/disputes',{headers:h}),apply:(rows:Row[])=>setDisputes(rows)},
      {name:'Reconciliation',request:apiFetch<{data:Row[]}>('/finance/reconciliation',{headers:h}),apply:(rows:Row[])=>setRecons(rows)},
    ];
    const results=await Promise.all(endpoints.map(async endpoint=>({name:endpoint.name,apply:endpoint.apply,result:await endpoint.request.then(value=>({value})).catch(cause=>({cause}))})));
    const failures:string[]=[];
    for(const item of results){if('value' in item.result){item.apply(Array.isArray(item.result.value.data)?item.result.value.data:[]);setLoadedDomains(current=>current.includes(item.name)?current:[...current,item.name]);}else{failures.push(item.name+': '+(item.result.cause instanceof Error?item.result.cause.message:'request failed'));}}
    setError(failures.length?failures.join(' · '):'');setLoading(false);
  };
  useEffect(()=>{void load()},[]);
  const stats=useMemo(()=>({invoiceTotal:invoices.reduce((s,x)=>s+Number(x.total||0),0),pendingRefunds:refunds.filter(x=>['REQUESTED','APPROVED','PROCESSING'].includes(x.status)).length,openDisputes:disputes.filter(x=>['OPEN','UNDER_REVIEW'].includes(x.status)).length,approvedCommission:commissions.filter(x=>x.status==='APPROVED').reduce((s,x)=>s+Number(x.commission_amount||0),0)}),[invoices,refunds,disputes,commissions]);
  return <main className="finance-page"><header className="finance-head"><div><span className="finance-kicker">FINANCIAL CONTROL PLANE</span><h1>Finance & Settlement</h1><p>Invoices, reseller commissions, refunds, disputes and reconciliation in one tenant-isolated surface.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href="/procurement" style={{padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none',color:'#334155'}}>Procurement & Inventory</a><a href="/platform-integrations" style={{padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none',color:'#334155'}}>API & Webhooks</a><button onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div></header>
    {error&&<div className="finance-error">{error}</div>}
    <section className="finance-stats"><article><small>Invoice value</small><strong>{loadedDomains.includes('Invoices')?money(stats.invoiceTotal):'—'}</strong><span>{loadedDomains.includes('Invoices')?invoices.length+' invoices':'Invoice data unavailable'}</span></article><article><small>Pending refunds</small><strong>{loadedDomains.includes('Refunds')?stats.pendingRefunds:'—'}</strong><span>{loadedDomains.includes('Refunds')?'Awaiting operational settlement':'Refund data unavailable'}</span></article><article><small>Open disputes</small><strong>{loadedDomains.includes('Disputes')?stats.openDisputes:'—'}</strong><span>{loadedDomains.includes('Disputes')?'Requires review':'Dispute data unavailable'}</span></article><article><small>Approved commissions</small><strong>{loadedDomains.includes('Commissions')?money(stats.approvedCommission):'—'}</strong><span>{loadedDomains.includes('Commissions')?commissions.filter(x=>x.status==='APPROVED').length+' approved':'Commission data unavailable'}</span></article></section>
    <section className="finance-grid"><article className="finance-card wide"><div className="finance-card-head"><div><h2>Invoices</h2><span>Real records only</span></div></div><div className="finance-table">{invoices.length?<table><thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Total</th><th>Issued</th></tr></thead><tbody>{invoices.slice(0,12).map(x=><tr key={x.id}><td><b>{x.invoice_number}</b></td><td>{x.customerName||x.customer_id||'—'}</td><td><span className="pill">{x.status}</span></td><td>{money(x.total,x.currency)}</td><td>{x.issued_at?new Date(x.issued_at).toLocaleDateString():'—'}</td></tr>)}</tbody></table>:<div className="empty">{loadedDomains.includes('Invoices')?'No invoices recorded.':'Invoice data unavailable; an empty result cannot be confirmed.'}</div>}</div></article>
    <article className="finance-card"><h2>Resellers</h2><span className="sub">{resellers.length} configured</span>{resellers.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.name}</b><small>{x.code} · {x.commission_rate}%</small></span><em>{x.status}</em></div>)}{!resellers.length&&<div className="empty">{loadedDomains.includes('Resellers')?'No resellers recorded.':'Reseller data unavailable.'}</div>}</article>
    <article className="finance-card"><h2>Refund queue</h2><span className="sub">{refunds.length} requests</span>{refunds.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{money(x.amount,x.currency)}</b><small>{x.paymentReference||x.payment_id}</small></span><em>{x.status}</em></div>)}{!refunds.length&&<div className="empty">{loadedDomains.includes('Refunds')?'No refund requests.':'Refund data unavailable.'}</div>}</article>
    <article className="finance-card"><h2>Disputes</h2><span className="sub">{disputes.length} cases</span>{disputes.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.providerCaseId||x.provider_case_id||x.id.slice(0,8)}</b><small>{x.reason||'Payment dispute'}</small></span><em>{x.status}</em></div>)}{!disputes.length&&<div className="empty">{loadedDomains.includes('Disputes')?'No disputes recorded.':'Dispute data unavailable.'}</div>}</article>
    <article className="finance-card"><h2>Reconciliation</h2><span className="sub">{recons.length} runs</span>{recons.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.provider||'All providers'}</b><small>{x.matched_count} matched · {x.unmatched_count} unmatched</small></span><em>{x.status}</em></div>)}{!recons.length&&<div className="empty">{loadedDomains.includes('Reconciliation')?'No reconciliation runs.':'Reconciliation data unavailable.'}</div>}</article>
    </section>
  </main>
}