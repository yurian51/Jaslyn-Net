'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type WindowRecord={id:string;title:string;description?:string|null;scopeType:string;scopeId?:string|null;startsAt:string;endsAt:string;status:string;isPublic:boolean;publicSummary?:string|null};
type StatusSettings={slug:string;displayName:string;description?:string|null;isPublished:boolean};
type ComponentRecord={id:string;componentKey:string;name:string;status:string;publicSummary?:string|null};
type SettingsResponse={configured:boolean;settings:StatusSettings|null;components:ComponentRecord[]};

const fieldStyle:CSSProperties={width:'100%',border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 11px',fontSize:13,background:'#fff',color:'#172033'};
const labelStyle:CSSProperties={display:'grid',gap:6,fontSize:12,fontWeight:700,color:'#475569'};

export default function IncidentOperationsPage(){
 const [windows,setWindows]=useState<WindowRecord[]>([]);
 const [settings,setSettings]=useState<StatusSettings>({slug:'my-isp-status',displayName:'My ISP',description:'Service availability and planned maintenance.',isPublished:false});
 const [components,setComponents]=useState<ComponentRecord[]>([]);
 const [title,setTitle]=useState('');
 const [scopeType,setScopeType]=useState('TENANT');
 const [scopeId,setScopeId]=useState('');
 const [startsAt,setStartsAt]=useState('');
 const [endsAt,setEndsAt]=useState('');
 const [isPublic,setIsPublic]=useState(false);
 const [publicSummary,setPublicSummary]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);

 const load=useCallback(async()=>{
  const accessToken=getAccessToken();if(!accessToken){setError('Authentication required.');setLoading(false);return;}
  setLoading(true);setError(null);
  try{
   const auth={Authorization:'Bearer '+accessToken};
   const [windowResult,statusResult]=await Promise.all([
    apiFetch<{data:WindowRecord[]}>('/incidents/maintenance-windows',{headers:auth}),
    apiFetch<SettingsResponse>('/incidents/status-page',{headers:auth}),
   ]);
   setWindows(windowResult.data??[]);
   setComponents(statusResult.components??[]);
   if(statusResult.settings)setSettings(statusResult.settings);
  }catch(cause:unknown){setError(cause instanceof ApiError||cause instanceof Error?cause.message:'Unable to load incident operations.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 async function createWindow(event:React.FormEvent){
  event.preventDefault();const accessToken=getAccessToken();if(!accessToken)return;
  if(!startsAt||!endsAt){setError('Choose both a start and end time.');return;}
  setBusy(true);setError(null);setNotice(null);
  try{
   const body={title,scopeType,...(scopeType==='TENANT'?{}:{scopeId}),startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString(),isPublic,...(isPublic?{publicSummary}: {})};
   await apiFetch('/incidents/maintenance-windows',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)});
   setTitle('');setScopeId('');setStartsAt('');setEndsAt('');setIsPublic(false);setPublicSummary('');
   setNotice('Maintenance window created and audited.');await load();
  }catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to create maintenance window.');}
  finally{setBusy(false);}
 }
 async function cancelWindow(id:string){
  if(!window.confirm('Cancel this maintenance window?'))return;
  const accessToken=getAccessToken();if(!accessToken)return;setBusy(true);setError(null);setNotice(null);
  try{await apiFetch('/incidents/maintenance-windows/'+encodeURIComponent(id)+'/cancel',{method:'POST',headers:{Authorization:'Bearer '+accessToken}});setNotice('Maintenance window canceled.');await load();}
  catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to cancel maintenance window.');}
  finally{setBusy(false);}
 }
 async function saveStatusSettings(event:React.FormEvent){
  event.preventDefault();const accessToken=getAccessToken();if(!accessToken)return;setBusy(true);setError(null);setNotice(null);
  try{
   const saved=await apiFetch<StatusSettings>('/incidents/status-page',{method:'PUT',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify(settings)});
   setSettings(saved);setNotice('Status page settings saved.');
  }catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to save status page settings.');}
  finally{setBusy(false);}
 }

 return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 18px',color:'#172033'}}>
  <header style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'start',flexWrap:'wrap',marginBottom:24}}>
   <div><p style={{fontSize:11,fontWeight:800,letterSpacing:'.14em',color:'#64748b'}}>JASLYN NET / INCIDENT OPERATIONS</p><h1 style={{fontSize:34,margin:'8px 0'}}>Maintenance &amp; status page</h1><p style={{color:'#64748b',maxWidth:680}}>Schedule maintenance, scope affected resources, and publish controlled customer-facing service status.</p></div>
   <div style={{display:'flex',gap:8}}><a href="/incidents" style={{border:'1px solid #cbd5e1',borderRadius:9,padding:'10px 13px',textDecoration:'none',fontSize:13,color:'#334155'}}>Incident Center</a><button onClick={()=>void load()} disabled={loading||busy}>Refresh</button></div>
  </header>
  {error&&<p role="alert" style={{padding:12,borderRadius:8,background:'#fff1f2',color:'#9f1239'}}>{error}</p>}
  {notice&&<p role="status" style={{padding:12,borderRadius:8,background:'#f0fdf4',color:'#166534'}}>{notice}</p>}
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16,alignItems:'start'}}>
   <form onSubmit={event=>void createWindow(event)} style={{border:'1px solid #e2e8f0',borderRadius:14,padding:18,background:'#fff',display:'grid',gap:14}}>
    <div><h2 style={{fontSize:18,margin:'0 0 5px'}}>Schedule maintenance</h2><p style={{fontSize:12,color:'#64748b',margin:0}}>Use tenant-wide, site or router scope.</p></div>
    <label style={labelStyle}>Title<input required minLength={3} maxLength={180} style={fieldStyle} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Core router upgrade"/></label>
    <label style={labelStyle}>Scope<select style={fieldStyle} value={scopeType} onChange={e=>setScopeType(e.target.value)}><option value="TENANT">Entire tenant</option><option value="SITE">Specific site</option><option value="ROUTER">Specific router</option></select></label>
    {scopeType!=='TENANT'&&<label style={labelStyle}>Scope resource UUID<input required style={fieldStyle} value={scopeId} onChange={e=>setScopeId(e.target.value)} placeholder="Paste site/router ID"/></label>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}><label style={labelStyle}>Starts<input required type="datetime-local" style={fieldStyle} value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label><label style={labelStyle}>Ends<input required type="datetime-local" style={fieldStyle} value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label></div>
    <label style={{display:'flex',alignItems:'center',gap:9,fontSize:13}}><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)}/> Publish this window on the status page</label>
    {isPublic&&<label style={labelStyle}>Customer-facing summary<textarea required maxLength={500} style={fieldStyle} rows={3} value={publicSummary} onChange={e=>setPublicSummary(e.target.value)} placeholder="Customers may notice a brief interruption."/></label>}
    <button type="submit" disabled={busy||loading}>{busy?'Saving…':'Create maintenance window'}</button>
   </form>
   <form onSubmit={event=>void saveStatusSettings(event)} style={{border:'1px solid #e2e8f0',borderRadius:14,padding:18,background:'#fff',display:'grid',gap:14}}>
    <div><h2 style={{fontSize:18,margin:'0 0 5px'}}>Public status page</h2><p style={{fontSize:12,color:'#64748b',margin:0}}>Only incidents explicitly marked public are exposed.</p></div>
    <label style={labelStyle}>Public URL slug<input required pattern="[a-z0-9][a-z0-9-]{2,62}" style={fieldStyle} value={settings.slug} onChange={e=>setSettings(s=>({...s,slug:e.target.value}))}/></label>
    <label style={labelStyle}>Display name<input required minLength={2} maxLength={120} style={fieldStyle} value={settings.displayName} onChange={e=>setSettings(s=>({...s,displayName:e.target.value}))}/></label>
    <label style={labelStyle}>Description<textarea maxLength={1000} rows={3} style={fieldStyle} value={settings.description??''} onChange={e=>setSettings(s=>({...s,description:e.target.value}))}/></label>
    <label style={{display:'flex',alignItems:'center',gap:9,fontSize:13}}><input type="checkbox" checked={settings.isPublished} onChange={e=>setSettings(s=>({...s,isPublished:e.target.checked}))}/> Publish status page</label>
    <button type="submit" disabled={busy||loading}>{busy?'Saving…':'Save status page'}</button>
    {settings.isPublished&&<a href={'/status/'+encodeURIComponent(settings.slug)} target="_blank" rel="noreferrer" style={{fontSize:13,color:'#1d4ed8',overflowWrap:'anywhere'}}>Open public status page ↗</a>}
    <div style={{borderTop:'1px solid #e2e8f0',paddingTop:12}}><strong style={{fontSize:13}}>Components</strong>{components.length?components.map(component=><p key={component.id} style={{fontSize:12,color:'#64748b',margin:'7px 0'}}>{component.name} · {component.status}</p>):<p style={{fontSize:12,color:'#64748b'}}>No components configured yet. Components can be managed through the status-page component API.</p>}</div>
   </form>
  </section>
  <section style={{marginTop:22,border:'1px solid #e2e8f0',borderRadius:14,background:'#fff',overflow:'hidden'}}>
   <div style={{padding:18,borderBottom:'1px solid #e2e8f0'}}><h2 style={{fontSize:18,margin:'0 0 5px'}}>Maintenance windows</h2><p style={{fontSize:12,color:'#64748b',margin:0}}>All times are shown in your browser's local time.</p></div>
   {loading?<p style={{padding:18}}>Loading maintenance windows…</p>:windows.length===0?<p style={{padding:18,color:'#64748b'}}>No maintenance windows scheduled.</p>:windows.map(item=><article key={item.id} style={{padding:16,borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'start',gap:12,flexWrap:'wrap'}}><div><strong>{item.title}</strong><p style={{fontSize:12,color:'#64748b',margin:'6px 0'}}>{item.scopeType}{item.scopeId?' · '+item.scopeId:''} · {item.status}{item.isPublic?' · PUBLIC':''}</p><p style={{fontSize:12,color:'#64748b',margin:'4px 0'}}>{new Date(item.startsAt).toLocaleString()} → {new Date(item.endsAt).toLocaleString()}</p>{item.description&&<p style={{fontSize:12,color:'#64748b'}}>{item.description}</p>}</div>{['PLANNED','ACTIVE'].includes(item.status)&&<button disabled={busy} onClick={()=>void cancelWindow(item.id)}>Cancel</button>}</article>)}
  </section>
  <p style={{fontSize:12,lineHeight:1.7,color:'#64748b',marginTop:20}}>Publishing the status page does not automatically publish every incident. An authorized operator must set an incident's public visibility and provide a customer-safe summary. The public API intentionally omits tenant IDs and internal incident evidence.</p>
 </main>;
}
