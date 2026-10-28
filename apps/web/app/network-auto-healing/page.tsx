'use client';

import { useCallback,useEffect,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { apiFetch,ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './network-auto-healing.css';

type Policy={enabled:boolean;maxAutoRetries:number;cooldownSeconds:number;updatedAt?:string};
type Run={id:string;commandId:string;commandType:string;failedAttemptNumber:number;status:string;networkCommandStatus:string;routerId:string|null;lastError:string|null;reason:string|null;createdAt:string;completedAt:string|null};
type RunResponse={data:Run[]};
const initial:Policy={enabled:false,maxAutoRetries:1,cooldownSeconds:60};
export default function NetworkAutoHealingPage(){
 const [policy,setPolicy]=useState<Policy>(initial),[runs,setRuns]=useState<Run[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const token=getAccessToken();if(!token){setError('Ingia kwanza.');setLoading(false);return;}setLoading(true);setError('');
  try{const [p,r]=await Promise.all([apiFetch<Policy>('/network-auto-healing/policy',{headers:{Authorization:'Bearer '+token}}),apiFetch<RunResponse>('/network-auto-healing/runs',{headers:{Authorization:'Bearer '+token}})]);setPolicy({...initial,...p});setRuns(Array.isArray(r.data)?r.data:[]);}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kupakia auto-healing.');}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const token=getAccessToken();if(!token)return;setSaving(true);setError('');setNotice('');
  try{const p=await apiFetch<Policy>('/network-auto-healing/policy',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(policy)});setPolicy({...initial,...p});await load();setNotice('Sera ya network auto-healing imehifadhiwa.');}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kuhifadhi sera.');}finally{setSaving(false);}
 }
 return <main className="nah-page">
  <header className="nah-header"><div><p className="nah-eyebrow">JASLYN NET / NETWORK RELIABILITY</p><h1>Network Auto-Healing</h1><p>Retries za bandwidth-enforcement commands zilizoshindwa, kwa mipaka iliyowekwa na msimamizi na kupitia worker ileile inayothibitisha hali ya kifaa.</p></div><Link href="/enterprise-capabilities">← Enterprise capabilities</Link></header>
  {error&&<div className="nah-alert" role="alert">{error}</div>}{notice&&<div className="nah-notice" role="status">{notice}</div>}
  <section className="nah-warning"><strong>Safety boundary</strong><p>Auto-healing imezimwa kwa default. Inajaribu tena tu command za <code>BANDWIDTH_ENFORCEMENT</code> zilizoshindwa, baada ya cooldown, na hadi mara 3. Haitawashi upya router, haibuni shell commands, na haitaruka verification ya network worker.</p></section>
  <section className="nah-grid">
   <form className="nah-panel" onSubmit={save}><h2>Sera ya tenant</h2><p>Washa baada ya kuidhinisha retry policy ya timu ya network.</p>
    <label className="nah-toggle"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy(p=>({...p,enabled:e.target.checked}))}/><span><strong>{policy.enabled?'Auto-healing imewashwa':'Auto-healing imezimwa'}</strong><small>Hali ya default ni OFF</small></span></label>
    <label>Maximum auto-retries<select value={policy.maxAutoRetries} onChange={e=>setPolicy(p=>({...p,maxAutoRetries:Number(e.target.value)}))}><option value={1}>1 retry</option><option value={2}>2 retries</option><option value={3}>3 retries</option></select></label>
    <label>Cooldown (sekunde)<input type="number" min={30} max={3600} step={1} value={policy.cooldownSeconds} onChange={e=>setPolicy(p=>({...p,cooldownSeconds:Number(e.target.value)}))}/><small>30–3600 seconds; command lazima ibaki FAILED hadi muda upite.</small></label>
    <button disabled={saving}>{saving?'Inahifadhi…':'Hifadhi sera'}</button>
   </form>
   <section className="nah-panel"><div className="nah-runs-head"><div><h2>Auto-healing history</h2><p>Historia ya retries zinazofuatiliwa na command status ya sasa.</p></div><button className="nah-secondary" type="button" onClick={()=>void load()} disabled={loading}>Refresh</button></div>
    {loading?<p>Inapakia historia…</p>:runs.length===0?<p className="nah-empty">Bado hakuna auto-healing runs.</p>:<div className="nah-table-wrap"><table><thead><tr><th>Command</th><th>Retry</th><th>Run</th><th>Device command</th><th>Time</th></tr></thead><tbody>{runs.map(run=><tr key={run.id}><td><strong>{run.commandType}</strong><small>{run.commandId}</small></td><td>{run.failedAttemptNumber}</td><td><span className={'nah-badge nah-'+run.status.toLowerCase()}>{run.status}</span><small>{run.reason??''}</small></td><td>{run.networkCommandStatus}{run.lastError&&<small>{run.lastError}</small>}</td><td>{new Date(run.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
   </section>
  </section>
  <footer className="nah-foot"><strong>Operational requirement:</strong> router-specific reboot, config rollback, and vendor-specific remediation remain unavailable until an adapter implements that command and verified read-back. This service does not report a retry as successful merely because it was queued.</footer>
 </main>;
}
