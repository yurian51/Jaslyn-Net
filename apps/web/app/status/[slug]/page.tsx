'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '../../../lib/api';

type PublicStatus={slug:string;displayName:string;description?:string|null;overallStatus:string;generatedAt:string;components:Array<{componentKey:string;name:string;status:string;summary?:string|null}>;incidents:Array<{id:string;title:string;severity:string;status:string;startedAt:string;resolvedAt?:string|null}>;maintenanceWindows:Array<{id:string;title:string;startsAt:string;endsAt:string;status:string}>};
const date=(value?:string|null)=>value?new Date(value).toLocaleString():'—';
const statusLabel=(value:string)=>value.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,letter=>letter.toUpperCase());
const statusColor=(value:string)=>value==='OPERATIONAL'?'#166534':value==='MAINTENANCE'?'#92400e':value==='MAJOR_OUTAGE'?'#b91c1c':'#9a6700';

export default function PublicStatusPage(){
 const params=useParams();const slug=String(params.slug??'');
 const [data,setData]=useState<PublicStatus|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);try{setData(await apiFetch<PublicStatus>('/public/status/'+encodeURIComponent(slug)));}catch(cause:unknown){setError(cause instanceof ApiError||cause instanceof Error?cause.message:'Unable to load public status.');}finally{setLoading(false);}},[slug]);
 useEffect(()=>{if(slug)void load();},[slug,load]);
 return <main style={{minHeight:'100vh',background:'#f6f8fb',color:'#172033',padding:'36px 18px'}}>
  <div style={{maxWidth:900,margin:'0 auto'}}>
   <header style={{padding:'28px 26px',border:'1px solid #e2e8f0',borderRadius:18,background:'#fff'}}>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:'.14em',color:'#64748b'}}>SERVICE STATUS</p>
    <h1 style={{fontSize:34,letterSpacing:'-.04em',margin:'8px 0'}}>{data?.displayName??'Service status'}</h1>
    <p style={{color:'#64748b',lineHeight:1.6}}>{data?.description||'Current service availability and planned maintenance.'}</p>
    {data&&<div style={{display:'inline-flex',alignItems:'center',gap:9,marginTop:8,padding:'10px 13px',borderRadius:10,background:'#f8fafc',border:'1px solid #e2e8f0'}}><span style={{width:9,height:9,borderRadius:99,background:statusColor(data.overallStatus)}}/><strong style={{color:statusColor(data.overallStatus)}}>{statusLabel(data.overallStatus)}</strong></div>}
   </header>
   {error&&<div role="alert" style={{marginTop:16,padding:14,borderRadius:10,background:'#fff1f2',color:'#9f1239'}}>{error}<p><button onClick={()=>void load()}>Try again</button></p></div>}
   {loading?<p style={{padding:20,color:'#64748b'}}>Loading status…</p>:data&&<>
    <section style={{marginTop:16,padding:22,border:'1px solid #e2e8f0',borderRadius:16,background:'#fff'}}><h2 style={{fontSize:18,margin:'0 0 14px'}}>Service components</h2>{data.components.length?data.components.map(component=><article key={component.componentKey} style={{display:'flex',justifyContent:'space-between',gap:14,padding:'13px 0',borderBottom:'1px solid #f1f5f9',flexWrap:'wrap'}}><div><strong>{component.name}</strong>{component.summary&&<p style={{margin:'5px 0',fontSize:12,color:'#64748b'}}>{component.summary}</p>}</div><span style={{fontSize:12,fontWeight:750,color:statusColor(component.status)}}>{statusLabel(component.status)}</span></article>):<p style={{fontSize:13,color:'#64748b'}}>No service components have been configured.</p>}</section>
    <section style={{marginTop:16,padding:22,border:'1px solid #e2e8f0',borderRadius:16,background:'#fff'}}><h2 style={{fontSize:18,margin:'0 0 14px'}}>Incidents</h2>{data.incidents.length?data.incidents.map(item=><article key={item.id} style={{padding:'13px 0',borderBottom:'1px solid #f1f5f9'}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{item.title}</strong><span style={{fontSize:12,fontWeight:750,color:statusColor(item.severity==='CRITICAL'?'MAJOR_OUTAGE':'DEGRADED')}}>{statusLabel(item.status)} · {statusLabel(item.severity)}</span></div><p style={{fontSize:12,color:'#64748b',margin:'7px 0'}}>Started {date(item.startedAt)}{item.resolvedAt?' · Resolved '+date(item.resolvedAt):''}</p></article>):<p style={{fontSize:13,color:'#64748b'}}>No public incidents to report.</p>}</section>
    <section style={{marginTop:16,padding:22,border:'1px solid #e2e8f0',borderRadius:16,background:'#fff'}}><h2 style={{fontSize:18,margin:'0 0 14px'}}>Planned maintenance</h2>{data.maintenanceWindows.length?data.maintenanceWindows.map(item=><article key={item.id} style={{padding:'12px 0',borderBottom:'1px solid #f1f5f9'}}><strong>{item.title}</strong><p style={{fontSize:12,color:'#64748b',margin:'6px 0'}}>{date(item.startsAt)} — {date(item.endsAt)} · {statusLabel(item.status)}</p></article>):<p style={{fontSize:13,color:'#64748b'}}>No upcoming public maintenance windows.</p>}</section>
    <footer style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginTop:18,color:'#64748b',fontSize:11}}><span>Last updated {date(data.generatedAt)}</span><button onClick={()=>void load()} disabled={loading}>{loading?'Refreshing…':'Refresh status'}</button></footer>
   </>}
  </div>
 </main>;
}
