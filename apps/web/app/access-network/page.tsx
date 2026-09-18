'use client';

import { useCallback,useEffect,useMemo,useState } from 'react';
import { ApiError,apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Item={id:string;customerName?:string;username:string;accessType:string;state:string;expiresAt?:string|null};
type Page={data:Item[];pagination:{total:number}};
const headers=(): Record<string,string>=>{const t=getAccessToken();return t?{Authorization:'Bearer '+t}:{} };

export default function AccessNetworkPage(){
 const [data,setData]=useState<Page|null>(null),[type,setType]=useState<'ALL'|'HOTSPOT'|'RADIUS'|'PPPOE'|'STATIC'>('ALL'),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await apiFetch<Page>('/isp/access-bindings?page=1&limit=100',{headers:headers()}));}catch(e:unknown){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load access network.')}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const rows=useMemo(()=>type==='ALL'?(data?.data??[]):(data?.data??[]).filter(x=>x.accessType===type),[data,type]);
 const change=async(x:Item)=>{const next=x.state==='ACTIVE'?'SUSPENDED':'ACTIVE';setBusy(x.id);setError(null);try{await apiFetch('/isp/access-bindings/'+x.id+'/state',{method:'PUT',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({state:next,reason:'Operator changed access state to '+next})});await load()}catch(e:unknown){setError(e instanceof ApiError||e instanceof Error?e.message:'Access state update failed.')}finally{setBusy(null)}};
 return <main className="app-shell"><section className="content"><header className="topbar"><div><div className="eyebrow">JASLYN NET / ACCESS NETWORK</div><h1>WiFi, Hotspot &amp; AAA access</h1><p className="context">Operational access bindings backed by the existing ISP access API.</p></div><div className="top-actions"><span className="data-state"><i/> {loading?'SYNCING':'LIVE API DATA'}</span><button className="selector" onClick={()=>void load()} disabled={loading}>{loading?'Refreshing…':'Refresh access'}</button></div></header>
 {error&&<div className="error-banner" role="alert">{error}</div>}
 <section className="kpi-grid"><article className="kpi"><div className="kpi-label"><span>Access records</span><b>ACCESS</b></div><strong>{data?.pagination.total??'—'}</strong></article><article className="kpi"><div className="kpi-label"><span>Active</span><b>LIVE</b></div><strong>{rows.filter(x=>x.state==='ACTIVE').length}</strong></article></section>
 <section className="panel"><div className="panel-head"><div><div className="panel-kicker">ACCESS FABRIC</div><h2>WiFi / Hotspot / RADIUS / PPPoE</h2><p>Filter the real access types supported by the existing API.</p></div></div><div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>{(['ALL','HOTSPOT','RADIUS','PPPOE','STATIC'] as const).map(x=><button key={x} className="selector" onClick={()=>setType(x)} aria-pressed={type===x}>{x}</button>)}</div><div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>USERNAME</th><th>ACCESS TYPE</th><th>STATE</th><th>EXPIRES</th><th>ACTION</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><strong>{x.customerName??'—'}</strong></td><td>{x.username}</td><td>{x.accessType}</td><td>{x.state}</td><td>{x.expiresAt?new Date(x.expiresAt).toLocaleString():'—'}</td><td><button className="selector" disabled={busy===x.id||['DISABLED','EXPIRED'].includes(x.state)} onClick={()=>void change(x)}>{busy===x.id?'Saving…':x.state==='ACTIVE'?'Suspend':'Resume'}</button></td></tr>)}</tbody></table>{loading&&<div className="empty-state">Loading access records…</div>}{!loading&&!rows.length&&<div className="empty-state"><strong>No access records for this filter.</strong></div>}</div></section>
 </section></main>
}