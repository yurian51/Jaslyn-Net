'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

type IncidentEvent={id:string;eventType:string;actorUserId?:string|null;fromStatus?:string|null;toStatus?:string|null;note?:string|null;createdAt:string;metadata?:Record<string,unknown>};
type Impact={id:string;resourceType:string;resourceId?:string|null;impactType:string;state:string;estimatedRevenue?:string|number|null};
type IncidentDetail={id:string;title:string;summary?:string|null;category:string;severity:string;status:string;startedAt:string;lastSeenAt:string;resolvedAt?:string|null;resolution?:string|null;ownerUserId?:string|null;ownerName?:string|null;slaTargetMinutes:number;slaBreached:boolean;publicVisible:boolean;publicSummary?:string|null;rootResourceType?:string|null;rootResourceId?:string|null;impacts:Impact[];events:IncidentEvent[]};
const date=(value?:string|null)=>value?new Date(value).toLocaleString():'—';

export default function IncidentDetailPage(){
 const params=useParams();const id=String(params.id??'');
 const [incident,setIncident]=useState<IncidentDetail|null>(null);
 const [ownerId,setOwnerId]=useState('');
 const [publicVisible,setPublicVisible]=useState(false);
 const [publicSummary,setPublicSummary]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const load=useCallback(async()=>{
  const token=getAccessToken();if(!token){setError('Authentication required.');setLoading(false);return;}
  setLoading(true);setError(null);
  try{const result=await apiFetch<IncidentDetail>('/incidents/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token}});
   setIncident(result);setOwnerId(result.ownerUserId??'');setPublicVisible(result.publicVisible);setPublicSummary(result.publicSummary??'');
  }catch(cause:unknown){setError(cause instanceof ApiError||cause instanceof Error?cause.message:'Unable to load incident.');}
  finally{setLoading(false);}
 },[id]);
 useEffect(()=>{if(id)void load();},[id,load]);

 async function saveOwner(){
  const token=getAccessToken();if(!token||!incident)return;setBusy(true);setError(null);setNotice(null);
  try{await apiFetch('/incidents/'+encodeURIComponent(incident.id)+'/owner',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({ownerUserId:ownerId.trim()||null})});setNotice('Incident owner updated and audited.');await load();}
  catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to update incident owner.');}finally{setBusy(false);}
 }
 async function saveVisibility(){
  const token=getAccessToken();if(!token||!incident)return;
  if(publicVisible&&!publicSummary.trim()){setError('A customer-safe public summary is required before publishing.');return;}
  setBusy(true);setError(null);setNotice(null);
  try{await apiFetch('/incidents/'+encodeURIComponent(incident.id)+'/public-visibility',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({visible:publicVisible,...(publicSummary.trim()?{publicSummary:publicSummary.trim()}:{})})});setNotice('Public visibility updated and audited.');await load();}
  catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to update public visibility.');}finally{setBusy(false);}
 }
 async function incidentAction(kind:'acknowledge'|'resolve'){
  const token=getAccessToken();if(!token||!incident)return;setBusy(true);setError(null);setNotice(null);
  try{await apiFetch('/incidents/'+encodeURIComponent(incident.id)+'/'+kind,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(kind==='resolve'?{body:JSON.stringify({resolution:'Resolved by operator from Incident Detail'})}:{})});setNotice('Incident action saved.');await load();}
  catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to update incident.');}finally{setBusy(false);}
 }

 if(loading&&!incident)return <main style={{maxWidth:1000,margin:'0 auto',padding:24}}>Loading incident…</main>;
 if(!incident)return <main style={{maxWidth:1000,margin:'0 auto',padding:24}}><a href="/incidents">← Incident Center</a><h1>Incident unavailable</h1>{error&&<p role="alert">{error}</p>}</main>;
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'28px 18px',color:'#172033'}}>
  <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'start',flexWrap:'wrap'}}><div><p style={{fontSize:11,fontWeight:800,letterSpacing:'.14em',color:'#64748b'}}>JASLYN NET / INCIDENT TIMELINE</p><h1 style={{fontSize:32,margin:'8px 0'}}>{incident.title}</h1><p style={{color:'#64748b'}}>{incident.category} · {incident.severity} · {incident.status}</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href="/incidents" style={{padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none',color:'#334155'}}>Incident Center</a><a href="/incident-operations" style={{padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:8,textDecoration:'none',color:'#334155'}}>Maintenance &amp; status</a>{incident.status==='OPEN'&&<button disabled={busy} onClick={()=>void incidentAction('acknowledge')}>Acknowledge</button>}{incident.status!=='RESOLVED'&&<button disabled={busy} onClick={()=>void incidentAction('resolve')}>Resolve</button>}</div></header>
  {error&&<p role="alert" style={{padding:12,borderRadius:8,background:'#fff1f2',color:'#9f1239'}}>{error}</p>}{notice&&<p role="status" style={{padding:12,borderRadius:8,background:'#f0fdf4',color:'#166534'}}>{notice}</p>}
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,margin:'22px 0'}}><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Started<strong style={{display:'block',marginTop:8}}>{date(incident.startedAt)}</strong></article><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>SLA target<strong style={{display:'block',marginTop:8}}>{incident.slaTargetMinutes} minutes</strong><small style={{color:incident.slaBreached?'#b91c1c':'#64748b'}}>{incident.slaBreached?'SLA target breached':'Within target'}</small></article><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Root resource<strong style={{display:'block',marginTop:8}}>{incident.rootResourceType||'—'}</strong><small>{incident.rootResourceId||'No resource ID'}</small></article><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Timeline events<strong style={{display:'block',marginTop:8}}>{incident.events?.length??0}</strong></article></section>
  {incident.summary&&<section style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12,marginBottom:16}}><h2 style={{fontSize:16,marginTop:0}}>Internal summary</h2><p style={{lineHeight:1.6,color:'#475569'}}>{incident.summary}</p></section>}
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,alignItems:'start'}}>
   <article style={{padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}><h2 style={{fontSize:18,margin:'0 0 12px'}}>Ownership</h2><p style={{fontSize:12,color:'#64748b'}}>Current owner: {incident.ownerName||'Unassigned'}</p><label style={{display:'grid',gap:6,fontSize:12,fontWeight:700}}>Owner user UUID<input value={ownerId} onChange={e=>setOwnerId(e.target.value)} placeholder="Paste active tenant user UUID" style={{padding:10,border:'1px solid #cbd5e1',borderRadius:8}}/></label><button style={{marginTop:10}} disabled={busy} onClick={()=>void saveOwner()}>{busy?'Saving…':'Save owner'}</button></article>
   <article style={{padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}><h2 style={{fontSize:18,margin:'0 0 12px'}}>Customer status page</h2><label style={{display:'flex',gap:9,alignItems:'center',fontSize:13}}><input type="checkbox" checked={publicVisible} onChange={e=>setPublicVisible(e.target.checked)}/> Publish this incident</label><label style={{display:'grid',gap:6,fontSize:12,fontWeight:700,marginTop:12}}>Public-safe summary<textarea value={publicSummary} onChange={e=>setPublicSummary(e.target.value)} rows={3} maxLength={500} placeholder="Describe the customer impact without internal details." style={{padding:10,border:'1px solid #cbd5e1',borderRadius:8}}/></label><button style={{marginTop:10}} disabled={busy} onClick={()=>void saveVisibility()}>{busy?'Saving…':'Save visibility'}</button><p style={{fontSize:11,color:'#64748b'}}>Internal summary and evidence are never exposed through the public status endpoint.</p></article>
  </section>
  <section style={{marginTop:18,padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}><h2 style={{fontSize:19,margin:'0 0 16px'}}>Incident timeline</h2>{!incident.events?.length?<p style={{color:'#64748b'}}>No timeline events are recorded yet. The timeline trigger will record new incident state changes after migration 064 is applied.</p>:<div style={{display:'grid',gap:0}}>{incident.events.map((event,index)=><article key={event.id} style={{display:'grid',gridTemplateColumns:'18px 1fr',gap:12,paddingBottom:16}}><div style={{display:'flex',flexDirection:'column',alignItems:'center'}}><span style={{width:9,height:9,borderRadius:99,background:'#64748b',marginTop:5}}/>{index<incident.events.length-1&&<span style={{width:1,background:'#e2e8f0',flex:1,marginTop:5}}/>}</div><div><strong style={{fontSize:13}}>{event.eventType.replaceAll('_',' ')}</strong><p style={{fontSize:12,color:'#64748b',margin:'5px 0'}}>{date(event.createdAt)}{event.actorUserId?' · Actor '+event.actorUserId:''}</p>{event.fromStatus&&<p style={{fontSize:12,color:'#475569',margin:'4px 0'}}>Status: {event.fromStatus} → {event.toStatus}</p>}{event.note&&<p style={{fontSize:12,lineHeight:1.5}}>{event.note}</p>}</div></article>)}</div>}</section>
  <section style={{marginTop:18,padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}><h2 style={{fontSize:19,margin:'0 0 12px'}}>Affected resources</h2>{incident.impacts?.length?incident.impacts.map(item=><article key={item.id} style={{padding:'10px 0',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',gap:12}}><div><strong style={{fontSize:13}}>{item.resourceType}</strong><p style={{fontSize:11,color:'#64748b',margin:'4px 0'}}>{item.resourceId||'Aggregate impact'} · {item.impactType}</p></div><span style={{fontSize:11,color:'#64748b'}}>{item.state}{item.estimatedRevenue?' · TSh '+Number(item.estimatedRevenue).toLocaleString():''}</span></article>):<p style={{color:'#64748b'}}>No impact rows recorded.</p>}</section>
 </main>;
}
