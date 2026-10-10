'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './finance.css';

type Row = Record<string, any>;
const money=(v:any,c='TZS')=>new Intl.NumberFormat('en-TZ',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(v||0));

export default function FinancePage(){
  const [invoices,setInvoices]=useState<Row[]>([]),[resellers,setResellers]=useState<Row[]>([]),[commissions,setCommissions]=useState<Row[]>([]);
  const [refunds,setRefunds]=useState<Row[]>([]),[disputes,setDisputes]=useState<Row[]>([]),[recons,setRecons]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
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
    for(const item of results){if('value' in item.result){item.apply(Array.isArray(item.result.value.data)?item.result.value.data:[]);}else{failures.push(item.name+': '+(item.result.cause instanceof Error?item.result.cause.message:'request failed'));}}
    setError(failures.length?failures.join(' · '):'');setLoading(false);
  };
  useEffect(()=>{void load()},[]);
  const stats=useMemo(()=>({invoiceTotal:invoices.reduce((s,x)=>s+Number(x.total||0),0),pendingRefunds:refunds.filter(x=>['REQUESTED','APPROVED','PROCESSING'].includes(x.status)).length,openDisputes:disputes.filter(x=>['OPEN','UNDER_REVIEW'].includes(x.status)).length,approvedCommission:commissions.filter(x=>x.status==='APPROVED').reduce((s,x)=>s+Number(x.commission_amount||0),0)}),[invoices,refunds,disputes,commissions]);
  return <main className="finance-page"><header className="finance-head"><div><span className="finance-kicker">FINANCIAL CONTROL PLANE</span><h1>Finance & Settlement</h1><p>Invoices, reseller commissions, refunds, disputes and reconciliation in one tenant-isolated surface.</p></div><button onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></header>
    {error&&<div className="finance-error">{error}</div>}
    <section className="finance-stats"><article><small>Invoice value</small><strong>{money(stats.invoiceTotal)}</strong><span>{invoices.length} invoices</span></article><article><small>Pending refunds</small><strong>{stats.pendingRefunds}</strong><span>Awaiting operational settlement</span></article><article><small>Open disputes</small><strong>{stats.openDisputes}</strong><span>Requires review</span></article><article><small>Approved commissions</small><strong>{money(stats.approvedCommission)}</strong><span>{commissions.filter(x=>x.status==='APPROVED').length} approved</span></article></section>
    <section className="finance-grid"><article className="finance-card wide"><div className="finance-card-head"><div><h2>Invoices</h2><span>Real records only</span></div></div><div className="finance-table">{invoices.length?<table><thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Total</th><th>Issued</th></tr></thead><tbody>{invoices.slice(0,12).map(x=><tr key={x.id}><td><b>{x.invoice_number}</b></td><td>{x.customerName||x.customer_id||'—'}</td><td><span className="pill">{x.status}</span></td><td>{money(x.total,x.currency)}</td><td>{x.issued_at?new Date(x.issued_at).toLocaleDateString():'—'}</td></tr>)}</tbody></table>:<div className="empty">No invoices recorded.</div>}</div></article>
    <article className="finance-card"><h2>Resellers</h2><span className="sub">{resellers.length} configured</span>{resellers.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.name}</b><small>{x.code} · {x.commission_rate}%</small></span><em>{x.status}</em></div>)}{!resellers.length&&<div className="empty">No resellers recorded.</div>}</article>
    <article className="finance-card"><h2>Refund queue</h2><span className="sub">{refunds.length} requests</span>{refunds.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{money(x.amount,x.currency)}</b><small>{x.paymentReference||x.payment_id}</small></span><em>{x.status}</em></div>)}{!refunds.length&&<div className="empty">No refund requests.</div>}</article>
    <article className="finance-card"><h2>Disputes</h2><span className="sub">{disputes.length} cases</span>{disputes.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.providerCaseId||x.provider_case_id||x.id.slice(0,8)}</b><small>{x.reason||'Payment dispute'}</small></span><em>{x.status}</em></div>)}{!disputes.length&&<div className="empty">No disputes recorded.</div>}</article>
    <article className="finance-card"><h2>Reconciliation</h2><span className="sub">{recons.length} runs</span>{recons.slice(0,8).map(x=><div className="mini-row" key={x.id}><span><b>{x.provider||'All providers'}</b><small>{x.matched_count} matched · {x.unmatched_count} unmatched</small></span><em>{x.status}</em></div>)}{!recons.length&&<div className="empty">No reconciliation runs.</div>}</article>
    </section>
  </main>
}