'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Job = { id:string; title:string; status:string; priority:string; jobType:string; description?:string|null; siteName?:string|null; scheduledAt?:string|null };
type ChecklistItem = { id?:string; itemKey:string; label:string; checked:boolean };
type Operation = { operationId:string; jobId:string; operationType:'NOTE_ADDED'|'STATUS_CHANGED'|'CHECKLIST_ITEM_SET'; status?:string; expectedStatus?:string; note?:string; itemKey?:string; itemLabel?:string; checked?:boolean; clientOccurredAt:string; queuedAt:number };
type Photo = { id:string; jobId:string; file:File; fileName:string; contentType:string; queuedAt:number };
type StoreRecord = Job | Operation | Photo | {jobId:string;items:ChecklistItem[]};

const CHECKLIST_DEFAULTS:ChecklistItem[]=[
 {itemKey:'site-safety',label:'Site safety checked',checked:false},
 {itemKey:'power-cabling',label:'Power and cabling inspected',checked:false},
 {itemKey:'connectivity-test',label:'Connectivity test completed',checked:false},
 {itemKey:'customer-confirmed',label:'Customer or site contact updated',checked:false},
];

function openLocalDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('jaslyn-net-field-operations',1);
  request.onupgradeneeded=()=>{const db=request.result;for(const [name,keyPath] of [['jobs','id'],['operations','operationId'],['photos','id'],['checklists','jobId']] as const){if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath});}};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Unable to open offline storage'));
 });
}
async function readAll<T>(storeName:string):Promise<T[]>{
 const db=await openLocalDb();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readonly');const request=tx.objectStore(storeName).getAll();request.onsuccess=()=>resolve(request.result as T[]);request.onerror=()=>reject(request.error??new Error('Unable to read offline queue'));tx.oncomplete=()=>db.close();});
}
async function putRecord(storeName:string,value:StoreRecord):Promise<void>{
 const db=await openLocalDb();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).put(value);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error??new Error('Unable to save offline work'));};});
}
async function deleteRecord(storeName:string,key:string):Promise<void>{
 const db=await openLocalDb();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');tx.objectStore(storeName).delete(key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error??new Error('Unable to update offline queue'));};});
}

export default function FieldOperationsPage(){
 const [jobs,setJobs]=useState<Job[]>([]);
 const [queue,setQueue]=useState<Operation[]>([]);
 const [photos,setPhotos]=useState<Photo[]>([]);
 const [checklists,setChecklists]=useState<Record<string,ChecklistItem[]>>({});
 const [noteDrafts,setNoteDrafts]=useState<Record<string,string>>({});
 const [online,setOnline]=useState(true);
 const [loading,setLoading]=useState(true);
 const [syncing,setSyncing]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const autoSyncAttempted=useRef(false);

 const refreshQueue=useCallback(async()=>{setQueue(await readAll<Operation>('operations'));setPhotos(await readAll<Photo>('photos'));},[]);
 const loadJobs=useCallback(async()=>{
  setLoading(true);setError(null);setOnline(navigator.onLine);
  try{
   const token=getAccessToken();if(!token)throw new Error('Sign in is required to load work orders.');
   if(navigator.onLine){
    const result=await apiFetch<{data:Job[]}>('/isp/jobs?page=1&limit=25',{headers:{Authorization:'Bearer '+token}});
    const loaded=Array.isArray(result.data)?result.data:[];
    setJobs(loaded);await Promise.all(loaded.map(job=>putRecord('jobs',job as StoreRecord)));
   }else setJobs(await readAll<Job>('jobs'));
  }catch(cause:unknown){
   const cached=await readAll<Job>('jobs').catch(()=>[]);
   if(cached.length){setJobs(cached);setNotice('Showing cached work orders. Changes will queue until the connection returns.');}
   else setError(cause instanceof Error?cause.message:'Unable to load work orders.');
  }finally{await refreshQueue();setLoading(false);}
 },[refreshQueue]);

 useEffect(()=>{void loadJobs();const onOnline=()=>{setOnline(true);void loadJobs();};const onOffline=()=>setOnline(false);window.addEventListener('online',onOnline);window.addEventListener('offline',onOffline);return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);};},[loadJobs]);

 const effectiveStatus=(job:Job)=>{
  return queue.filter(op=>op.jobId===job.id&&op.operationType==='STATUS_CHANGED'&&op.status).sort((a,b)=>a.queuedAt-b.queuedAt).reduce((status,op)=>op.status??status,job.status);
 };
 const pendingCount=queue.length+photos.length;

 const syncQueue=useCallback(async()=>{
  if(!navigator.onLine){setOnline(false);return;}
  const token=getAccessToken();if(!token){setError('Sign in before synchronizing queued work.');return;}
  setSyncing(true);setError(null);setNotice(null);
  try{
   const pendingPhotos=(await readAll<Photo>('photos')).sort((a,b)=>a.queuedAt-b.queuedAt);
   for(const photo of pendingPhotos){
    const form=new FormData();form.append('file',photo.file,photo.fileName);
    await apiFetch('/isp/jobs/'+encodeURIComponent(photo.jobId)+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
    await deleteRecord('photos',photo.id);
   }
   const pending=(await readAll<Operation>('operations')).sort((a,b)=>a.queuedAt-b.queuedAt);
   for(let offset=0;offset<pending.length;offset+=100){
    const batch=pending.slice(offset,offset+100);
    const operations=batch.map(({queuedAt,...op})=>op);
    const result=await apiFetch<{acceptedCount:number;replayedCount:number;results:Array<{operationId:string;accepted?:boolean;replayed?:boolean}>}>('/isp/jobs/offline-sync',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operations}),
    });
    for(const item of result.results){if(item.accepted||item.replayed)await deleteRecord('operations',item.operationId);}
   }
   await refreshQueue();
   const leftOps=await readAll<Operation>('operations');const leftPhotos=await readAll<Photo>('photos');
   setNotice(leftOps.length+leftPhotos.length===0?'All queued field work synchronized securely.':(leftOps.length+leftPhotos.length)+' item(s) remain queued.');
   await loadJobs();
  }catch(cause:unknown){
   setError(cause instanceof ApiError||cause instanceof Error?cause.message:'Synchronization failed. Your queued work has been kept.');
   await refreshQueue();
  }finally{setSyncing(false);}
 },[loadJobs,refreshQueue]);

 useEffect(()=>{if(!online||pendingCount===0){autoSyncAttempted.current=false;return;}if(!syncing&&!autoSyncAttempted.current){autoSyncAttempted.current=true;void syncQueue();}},[online,pendingCount,syncing,syncQueue]);

 async function enqueue(op:Omit<Operation,'queuedAt'|'clientOccurredAt'>){
  const full:Operation={...op,queuedAt:Date.now(),clientOccurredAt:new Date().toISOString()};
  await putRecord('operations',full as StoreRecord);await refreshQueue();
  if(op.operationType==='STATUS_CHANGED'&&op.status)setJobs(prev=>prev.map(job=>job.id===op.jobId?{...job,status:op.status!}:job));
  setNotice(online?'Change queued; synchronizing with Jaslyn-Net.':'Saved on this device. It will synchronize when the connection returns.');
 }

 async function setJobStatus(job:Job,status:string){
  const current=effectiveStatus(job);if(current===status)return;
  await enqueue({operationId:crypto.randomUUID(),jobId:job.id,operationType:'STATUS_CHANGED',expectedStatus:current,status});
 }
 async function addNote(job:Job){
  const note=(noteDrafts[job.id]??'').trim();if(!note)return;
  await enqueue({operationId:crypto.randomUUID(),jobId:job.id,operationType:'NOTE_ADDED',note});
  setNoteDrafts(prev=>({...prev,[job.id]:''}));
 }
 async function loadChecklist(job:Job){
  try{
   let items=CHECKLIST_DEFAULTS;
   if(navigator.onLine){
    const token=getAccessToken();
    if(token){const result=await apiFetch<{data:Array<{itemKey:string;label:string;checked:boolean}>}>('/isp/jobs/'+encodeURIComponent(job.id)+'/checklist',{headers:{Authorization:'Bearer '+token}});
     const known=new Map(result.data.map(item=>[item.itemKey,item]));items=CHECKLIST_DEFAULTS.map(item=>({...item,...known.get(item.itemKey)}));}
   }else{
    const cached=(await readAll<{jobId:string;items:ChecklistItem[]}>('checklists')).find(item=>item.jobId===job.id);
    if(cached)items=cached.items;
   }
   const pending=(await readAll<Operation>('operations')).filter(op=>op.jobId===job.id&&op.operationType==='CHECKLIST_ITEM_SET');
   for(const op of pending){items=items.map(item=>item.itemKey===op.itemKey?{...item,checked:Boolean(op.checked)}:item);}
   setChecklists(prev=>({...prev,[job.id]:items}));
   await putRecord('checklists',{jobId:job.id,items} as StoreRecord);
  }catch(cause:unknown){setError(cause instanceof Error?cause.message:'Unable to load checklist.');}
 }
 async function toggleChecklist(job:Job,item:ChecklistItem){
  const checked=!item.checked;
  const items=(checklists[job.id]??CHECKLIST_DEFAULTS).map(current=>current.itemKey===item.itemKey?{...current,checked}:current);
  setChecklists(prev=>({...prev,[job.id]:items}));await putRecord('checklists',{jobId:job.id,items} as StoreRecord);
  await enqueue({operationId:crypto.randomUUID(),jobId:job.id,operationType:'CHECKLIST_ITEM_SET',itemKey:item.itemKey,itemLabel:item.label,checked});
 }
 async function addPhoto(job:Job,file?:File){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Choose a JPEG, PNG or WebP photo no larger than 5 MB.');return;}
  const photo:Photo={id:crypto.randomUUID(),jobId:job.id,file,fileName:file.name,contentType:file.type,queuedAt:Date.now()};
  await putRecord('photos',photo as StoreRecord);await refreshQueue();setNotice(online?'Photo queued for upload.':'Photo saved on this device until connectivity returns.');
 }

 const activeJobs=jobs.filter(job=>!['COMPLETED','CANCELED'].includes(effectiveStatus(job)));
 return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 18px',color:'#172033'}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:16,flexWrap:'wrap'}}>
   <div><p style={{fontSize:11,fontWeight:800,letterSpacing:'.14em',color:'#64748b'}}>JASLYN NET / FIELD OPERATIONS</p><h1 style={{fontSize:34,margin:'8px 0'}}>Field work orders</h1><p style={{color:'#64748b',maxWidth:650}}>Inspect sites, record work, check maintenance items and capture photos. Work is stored on this device while offline.</p></div>
   <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span style={{borderRadius:99,padding:'7px 10px',background:online?'#dcfce7':'#fef3c7',color:online?'#166534':'#92400e',fontSize:12,fontWeight:800}}>{online?'ONLINE':'OFFLINE'}</span><button onClick={()=>void syncQueue()} disabled={!online||syncing||pendingCount===0}>{syncing?'Syncing…':'Sync queue ('+pendingCount+')'}</button><button onClick={()=>void loadJobs()} disabled={loading}>Refresh jobs</button></div>
  </header>
  {error&&<p role="alert" style={{padding:12,borderRadius:8,background:'#fff1f2',color:'#9f1239'}}>{error}</p>}
  {notice&&<p role="status" style={{padding:12,borderRadius:8,background:'#f0fdf4',color:'#166534'}}>{notice}</p>}
  <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,margin:'22px 0'}}><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Open work orders<h2>{activeJobs.length}</h2></article><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Queued operations<h2>{queue.length}</h2></article><article style={{padding:16,border:'1px solid #e2e8f0',borderRadius:12}}>Queued photos<h2>{photos.length}</h2></article></section>
  {loading?<p>Loading work orders…</p>:jobs.length===0?<p>No cached or assigned work orders are available.</p>:<section style={{display:'grid',gap:14}}>{jobs.map(job=>{const status=effectiveStatus(job);const items=checklists[job.id];return <article key={job.id} style={{border:'1px solid #e2e8f0',borderRadius:14,padding:18,background:'#fff'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><p style={{fontSize:11,fontWeight:800,color:'#64748b',margin:'0 0 6px'}}>{job.jobType} · {job.priority}</p><h2 style={{fontSize:19,margin:'0 0 8px'}}>{job.title}</h2><p style={{fontSize:13,color:'#64748b',margin:'0 0 8px'}}>{job.siteName||'Site not specified'} · {status.replaceAll('_',' ')}</p>{job.description&&<p style={{fontSize:13,lineHeight:1.5}}>{job.description}</p>}</div>
    <div style={{display:'flex',gap:8,alignItems:'start',flexWrap:'wrap'}}>{!['IN_PROGRESS','COMPLETED','CANCELED'].includes(status)&&<button onClick={()=>void setJobStatus(job,'IN_PROGRESS')}>Start work</button>}{['IN_PROGRESS','ASSIGNED'].includes(status)&&<button onClick={()=>void setJobStatus(job,'BLOCKED')}>Mark blocked</button>}{status==='IN_PROGRESS'&&<button onClick={()=>void setJobStatus(job,'COMPLETED')}>Complete</button>}</div></div>
   <div style={{display:'flex',gap:8,alignItems:'stretch',marginTop:14,flexWrap:'wrap'}}><textarea aria-label={'Work note for '+job.title} value={noteDrafts[job.id]??''} onChange={event=>setNoteDrafts(prev=>({...prev,[job.id]:event.target.value}))} placeholder="Add a site note…" rows={2} style={{flex:'1 1 260px',border:'1px solid #cbd5e1',borderRadius:8,padding:10}}/><button onClick={()=>void addNote(job)} disabled={!(noteDrafts[job.id]??'').trim()}>Queue note</button><label style={{border:'1px solid #cbd5e1',borderRadius:8,padding:'10px 12px',cursor:'pointer',fontSize:13,fontWeight:700}}>Add photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{display:'none'}} onChange={event=>{void addPhoto(job,event.target.files?.[0]);event.currentTarget.value='';}}/></label><button onClick={()=>void loadChecklist(job)}>Inspection checklist</button></div>
   {items&&<div style={{marginTop:14,padding:14,background:'#f8fafc',borderRadius:10}}><h3 style={{fontSize:14,margin:'0 0 10px'}}>Site inspection</h3>{items.map(item=><label key={item.itemKey} style={{display:'flex',gap:9,alignItems:'center',padding:'7px 0',fontSize:13}}><input type="checkbox" checked={item.checked} onChange={()=>void toggleChecklist(job,item)}/>{item.label}</label>)}</div>}
  </article>;})}</section>}
  <p style={{marginTop:22,fontSize:12,lineHeight:1.7,color:'#64748b'}}>Offline operations and photo files are persisted in this browser's IndexedDB. The server uses operation IDs for idempotency and rejects stale status changes rather than silently overwriting newer work. Do not clear browser site data until the sync queue is empty.</p>
 </main>;
}
