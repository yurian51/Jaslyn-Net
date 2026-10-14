'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './fiber-ops.css';

type FiberAsset = {
  id:string; assetType:string; name:string; assetCode:string; status:string;
  latitude:number|null; longitude:number|null; parentAssetId:string|null; parentAssetName?:string|null;
  routerId:string|null; routerName?:string|null; vendor?:string|null; model?:string|null; serialNumber?:string|null;
  metadata?:Record<string,unknown>; createdAt:string; updatedAt:string;
};
type AssetResponse={data:FiberAsset[]};
const assetTypes=['OLT','ONU','CABINET','SPLITTER','FIBER_ROUTE','DROP_CABLE','POLE','PATCH_PANEL'];
const statuses=['PLANNED','ACTIVE','DEGRADED','FAULTY','RETIRED'];
const initial={assetType:'OLT',name:'',assetCode:'',status:'PLANNED',latitude:'',longitude:'',parentAssetId:'',routerId:'',vendor:'',model:'',serialNumber:''};

export default function FiberOpsPage(){
 const [assets,setAssets]=useState<FiberAsset[]>([]);
 const [form,setForm]=useState(initial);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [filterType,setFilterType]=useState(''),[filterStatus,setFilterStatus]=useState('');
 const load=useCallback(async()=>{
  const token=getAccessToken();if(!token){setError('Ingia kwanza ili kuona assets za fiber za tenant yako.');setLoading(false);return;}
  setLoading(true);setError('');
  try{const qs=new URLSearchParams();if(filterType)qs.set('assetType',filterType);if(filterStatus)qs.set('status',filterStatus);
   const result=await apiFetch<AssetResponse>('/fiber/assets'+(qs.size?'?'+qs.toString():''),{headers:{Authorization:'Bearer '+token}});
   setAssets(Array.isArray(result.data)?result.data:[]);
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kupakia fiber assets.');}
  finally{setLoading(false);}
 },[filterType,filterStatus]);
 useEffect(()=>{void load();},[load]);
 function field(key:keyof typeof initial,value:string){setForm(v=>({...v,[key]:value}));}
 async function createAsset(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const token=getAccessToken();if(!token){setError('Ingia kwanza.');return;}
  if((form.latitude.trim()==='')!==(form.longitude.trim()==='')){setError('Weka latitude na longitude zote mbili au acha zote wazi.');return;}
  setSaving(true);setError('');setNotice('');
  const body:Record<string,unknown>={assetType:form.assetType,name:form.name.trim(),assetCode:form.assetCode.trim(),status:form.status};
  for(const key of ['latitude','longitude'] as const){if(form[key].trim()!=='')body[key]=Number(form[key]);}
  for(const [key,value] of Object.entries({parentAssetId:form.parentAssetId,routerId:form.routerId,vendor:form.vendor,model:form.model,serialNumber:form.serialNumber})){if(value.trim())body[key]=value.trim();}
  try{await apiFetch('/fiber/assets',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});setForm(initial);setNotice('Fiber asset imehifadhiwa.');await load();}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kuhifadhi asset.');}
  finally{setSaving(false);}
 }
 async function changeStatus(asset:FiberAsset,status:string){
  const token=getAccessToken();if(!token)return;setError('');setNotice('');
  try{await apiFetch('/fiber/assets/'+asset.id,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({status})});setNotice('Hali ya '+asset.assetCode+' imebadilishwa.');await load();}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kubadilisha hali.');}
 }
 const active=assets.filter(a=>a.status==='ACTIVE').length;
 const mapped=assets.filter(a=>a.latitude!==null&&a.longitude!==null).length;
 return <main className="fiber-page">
  <header className="fiber-header"><div><p className="fiber-eyebrow">JASLYN NET / NETWORK ENGINEERING</p><h1>Fiber GIS & topology</h1><p>Orodhesha OLT, ONU, splitter, cabinet, route na drop-cable; unganisha parent-child topology na coordinates kwa tenant husika.</p></div><Link href="/enterprise-capabilities" className="fiber-link">← Enterprise capabilities</Link></header>
  <section className="fiber-stats"><article><span>Assets zote</span><strong>{assets.length}</strong></article><article><span>Active</span><strong>{active}</strong></article><article><span>Zenye coordinates</span><strong>{mapped}</strong></article><article><span>Inahitaji ukaguzi</span><strong>{assets.filter(a=>['DEGRADED','FAULTY'].includes(a.status)).length}</strong></article></section>
  {error&&<div role="alert" className="fiber-alert">{error}</div>}{notice&&<div role="status" className="fiber-notice">{notice}</div>}
  <section className="fiber-layout">
   <form className="fiber-panel fiber-form" onSubmit={createAsset}>
    <h2>Ongeza network asset</h2><p>Coordinates ni za hiari; ukiweka moja lazima uweke zote mbili.</p>
    <label>Asset type<select value={form.assetType} onChange={e=>field('assetType',e.target.value)}>{assetTypes.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Jina<input value={form.name} onChange={e=>field('name',e.target.value)} minLength={2} maxLength={160} required /></label>
    <label>Asset code<input value={form.assetCode} onChange={e=>field('assetCode',e.target.value)} minLength={2} maxLength={80} required /></label>
    <label>Hali<select value={form.status} onChange={e=>field('status',e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
    <div className="fiber-two"><label>Latitude<input inputMode="decimal" type="number" step="any" min="-90" max="90" value={form.latitude} onChange={e=>field('latitude',e.target.value)} /></label><label>Longitude<input inputMode="decimal" type="number" step="any" min="-180" max="180" value={form.longitude} onChange={e=>field('longitude',e.target.value)} /></label></div>
    <label>Parent asset<select value={form.parentAssetId} onChange={e=>field('parentAssetId',e.target.value)}><option value="">Hakuna parent</option>{assets.map(a=><option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>)}</select></label>
    <label>Router ID (hiari)<input value={form.routerId} onChange={e=>field('routerId',e.target.value)} placeholder="UUID ya router iliyopo" /></label>
    <div className="fiber-two"><label>Vendor<input value={form.vendor} onChange={e=>field('vendor',e.target.value)} maxLength={120} /></label><label>Model<input value={form.model} onChange={e=>field('model',e.target.value)} maxLength={120} /></label></div>
    <label>Serial number<input value={form.serialNumber} onChange={e=>field('serialNumber',e.target.value)} maxLength={160} /></label>
    <button type="submit" disabled={saving}>{saving?'Inahifadhi…':'Hifadhi asset'}</button>
   </form>
   <section className="fiber-panel">
    <div className="fiber-list-head"><div><h2>Topology inventory</h2><p>Data imehifadhiwa kwa tenant yako; parent links zisivuke tenants.</p></div><button type="button" className="fiber-secondary" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
    <div className="fiber-filters"><label>Asset type<select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="">Aina zote</option>{assetTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Hali<select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">Hali zote</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></label></div>
    {loading?<p className="fiber-empty">Inapakia assets…</p>:assets.length===0?<p className="fiber-empty">Hakuna fiber assets zilizopatikana. Ongeza asset ya kwanza kupitia fomu.</p>:<div className="fiber-table-wrap"><table><thead><tr><th>Asset</th><th>Type</th><th>Parent / router</th><th>Location</th><th>Status</th><th>Badili hali</th></tr></thead><tbody>{assets.map(a=><tr key={a.id}><td><strong>{a.name}</strong><small>{a.assetCode}</small>{a.vendor&&<small>{a.vendor} {a.model??''}</small>}</td><td>{a.assetType}</td><td>{a.parentAssetName??'—'}<small>{a.routerName??(a.routerId?'Router linked':'No router link')}</small></td><td>{a.latitude!==null&&a.longitude!==null?<a href={'https://www.openstreetmap.org/?mlat='+a.latitude+'&mlon='+a.longitude+'#map=17/'+a.latitude+'/'+a.longitude} target="_blank" rel="noreferrer">{Number(a.latitude).toFixed(5)}, {Number(a.longitude).toFixed(5)} ↗</a>:'Not mapped'}</td><td><span className={'fiber-badge fiber-'+a.status.toLowerCase()}>{a.status}</span></td><td><select aria-label={'Badili hali ya '+a.assetCode} value={a.status} onChange={e=>void changeStatus(a,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table></div>}
   </section>
  </section>
  <footer className="fiber-foot"><strong>Integration truth:</strong> inventory CRUD, tenant-scoped parent relationships and coordinates are available after migration 078. OLT/ONU provisioning, optical signal polling and a live vendor GIS map are not enabled by this inventory alone; they require tested vendor adapters and real device telemetry.</footer>
 </main>;
}
