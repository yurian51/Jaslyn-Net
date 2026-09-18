'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type FiberLine={id:string;name:string;customerName?:string;technology:string;serviceStatus:string;upstreamBps?:number|null;downstreamBps?:number|null;installationAddress?:string|null};
type Page={data:FiberLine[];pagination:{total:number}};
const rate=(bps?:number|null)=>bps==null?'—':Math.round(bps/1000000)+' Mbps';
const headers=(): Record<string,string>=>{const t=getAccessToken();return t?{Authorization:'Bearer '+t}:{} };

export default function FiberPage(){
 const [data,setData]=useState<Page|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await apiFetch<Page>('/isp/fiber-lines?page=1&limit=100',{headers:headers()}));}catch(e:unknown){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load fiber lines.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const change=async(x:FiberLine)=>{const next=x.serviceStatus==='ACTIVE'?'SUSPENDED':'ACTIVE';setBusy(x.id);setError(null);try{await apiFetch('/isp/fiber-lines/'+x.id+'/status',{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({status:next,reason:'Operator changed fiber service to '+next})});await load()}catch(e:unknown){setError(e instanceof ApiError||e instanceof Error?e.message:'Fiber status update failed.')}finally{setBusy(null)}};
 const rows=data?.data??[],active=rows.filter(x=>x.serviceStatus==='ACTIVE').length,fault=rows.filter(x=>x.serviceStatus==='FAULT').length;
 return <main className="app-shell"><section className="content"><header className="topbar"><div><div className="eyebrow">JASLYN NET / ACCESS NETWORK / FIBER</div><h1>Fiber service control</h1><p className="context">Tenant-scoped fiber lines and service state from the production ISP API.</p></div><div className="top-actions"><span className="data-state"><i/> {loading?'SYNCING':'LIVE API DATA'}</span><button className="selector" onClick={()=>void load()} disabled={loading}>{loading?'Refreshing…':'Refresh fiber'}</button></div></header>
 {error&&<div className="error-banner" role="alert">{error}</div>}
 <section className="kpi-grid"><article className="kpi"><div className="kpi-label"><span>Total fiber lines</span><b>FIBER</b></div><strong>{loading?'—':rows.length}</strong></article><article className="kpi"><div className="kpi-label"><span>Active services</span><b>LIVE</b></div><strong>{loading?'—':active}</strong></article><article className="kpi"><div className="kpi-label"><span>Fault services</span><b>FAULT</b></div><strong>{loading?'—':fault}</strong></article><article className="kpi"><div className="kpi-label"><span>Total records</span><b>API</b></div><strong>{data?.pagination.total??'—'}</strong></article></section>
 <section className="panel"><div className="panel-head"><div><div className="panel-kicker">FIBER FABRIC</div><h2>Service lines</h2><p>Direct exposure of the existing ISP fiber service.</p></div></div><div className="table-wrap"><table><thead><tr><th>LINE</th><th>CUSTOMER</th><th>TECHNOLOGY</th><th>STATUS</th><th>UP / DOWN</th><th>INSTALLATION</th><th>ACTION</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><strong>{x.name}</strong></td><td>{x.customerName??'—'}</td><td>{x.technology||'—'}</td><td>{x.serviceStatus}</td><td>{rate(x.upstreamBps)} ↑ / {rate(x.downstreamBps)} ↓</td><td>{x.installationAddress??'—'}</td><td><button className="selector" disabled={busy===x.id||['FAULT','DISCONNECTED','PLANNED'].includes(x.serviceStatus)} onClick={()=>void change(x)}>{busy===x.id?'Saving…':x.serviceStatus==='ACTIVE'?'Suspend':'Resume'}</button></td></tr>)}</tbody></table>{loading&&<div className="empty-state">Loading fiber lines…</div>}{!loading&&!rows.length&&<div className="empty-state"><strong>No fiber lines configured.</strong><span>Create fiber lines from ISP Operations.</span></div>}</div></section>
 </section></main>
}