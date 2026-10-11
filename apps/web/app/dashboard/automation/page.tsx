'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

type Workflow = { id:string; name:string; description?:string; triggerType:string; triggerConfig:Record<string,unknown>; steps:unknown[]; enabled:boolean; nextRunAt?:string|null; webhookToken?:string; webhookPath?:string };
type Run = { id:string; workflowId:string; triggerType:string; status:string; currentStep:number; attempts:number; lastError?:string|null; createdAt:string; stepResults:unknown[] };
type Approval = { id:string; runId:string; title:string; status:string; requestedAt:string; details:Record<string,unknown> };
type Integration = { id:string; name:string; providerType:string; baseUrl?:string; enabled:boolean };
type WorkflowAlert = { id:string; runId:string; severity:string; title:string; status:string; createdAt:string; details:Record<string,unknown> };
type Data<T> = { data:T[] };

const defaultSteps = JSON.stringify([
  { type: 'CREATE_ALERT', severity: 'HIGH', title: 'Payment workflow requires operator attention', details: { source: 'workflow' } },
  { type: 'APPROVAL', title: 'Approve sensitive downstream action', details: { risk: 'medium' } },
  { type: 'EMIT_WEBHOOK', eventType: 'payment.workflow.completed', payload: { source: 'jaslyn-net' } },
  { type: 'LOG', message: 'Workflow completed' },
], null, 2);

const styles = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '28px 20px 56px', color: '#172033' } as const,
  panel: { background: '#fff', border: '1px solid #dfe5ed', borderRadius: 14, padding: 20, marginTop: 18 } as const,
  input: { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px', background: '#fff', color: '#172033', marginTop: 6 } as const,
  button: { border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', background: '#f8fafc', color: '#172033', cursor: 'pointer' } as const,
  primary: { border: '1px solid #172033', borderRadius: 8, padding: '10px 14px', background: '#172033', color: '#fff', cursor: 'pointer' } as const,
};

export default function AutomationWorkspacePage() {
  const [workflows,setWorkflows]=useState<Workflow[]>([]);
  const [runs,setRuns]=useState<Run[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [alerts,setAlerts]=useState<WorkflowAlert[]>([]);
  const [integrations,setIntegrations]=useState<Integration[]>([]);
  const [name,setName]=useState('');
  const [description,setDescription]=useState('');
  const [triggerType,setTriggerType]=useState('MANUAL');
  const [eventType,setEventType]=useState('PAYMENT.CONFIRMED');
  const [intervalSeconds,setIntervalSeconds]=useState('3600');
  const [steps,setSteps]=useState(defaultSteps);
  const [integrationName,setIntegrationName]=useState('');
  const [integrationType,setIntegrationType]=useState('WEBHOOK');
  const [integrationUrl,setIntegrationUrl]=useState('');
  const [integrationSecretRef,setIntegrationSecretRef]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [newWebhook,setNewWebhook]=useState<Workflow|null>(null);

  const headers = useCallback(() => {
    const token=getAccessToken();
    if(!token) throw new Error('Sign in to manage automation.');
    return { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' };
  },[]);

  const load=useCallback(async()=>{
    try {
      const h=headers();
      const [w,r,a,i,al]=await Promise.all([
        apiFetch<Data<Workflow>>('/automation/workflows',{headers:h}),
        apiFetch<Data<Run>>('/automation/workflows/runs',{headers:h}),
        apiFetch<Data<Approval>>('/automation/workflows/approvals',{headers:h}),
        apiFetch<Data<Integration>>('/automation/workflows/integrations',{headers:h}),
        apiFetch<Data<WorkflowAlert>>('/automation/workflows/alerts',{headers:h}),
      ]);
      setWorkflows(w.data??[]);setRuns(r.data??[]);setApprovals(a.data??[]);setIntegrations(i.data??[]);setAlerts(al.data??[]);setError(null);
    } catch(e) { setError(e instanceof ApiError||e instanceof Error?e.message:'Could not load workflow workspace.'); }
  },[headers]);

  useEffect(()=>{void load();},[load]);

  async function createWorkflow(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError(null);setNotice(null);setNewWebhook(null);
    try {
      let parsed:unknown;try{parsed=JSON.parse(steps);}catch{throw new Error('Steps must be valid JSON.');}
      if(!Array.isArray(parsed))throw new Error('Steps must be a JSON array.');
      const triggerConfig=triggerType==='EVENT'?{eventType:eventType.trim().toUpperCase()}:triggerType==='SCHEDULE'?{intervalSeconds:Number(intervalSeconds)}:{};
      const result=await apiFetch<Workflow>('/automation/workflows',{method:'POST',headers:headers(),body:JSON.stringify({name,description,triggerType,triggerConfig,steps:parsed,enabled:false})});
      if(result.webhookToken)setNewWebhook(result);
      setName('');setDescription('');setNotice('Workflow created disabled. Review the trigger, steps and permissions, then enable it when ready.');
      await load();
    } catch(e){setError(e instanceof Error?e.message:'Workflow creation failed.');}
    finally{setBusy(false);}
  }

  async function changeEnabled(w:Workflow,enabled:boolean) {
    setBusy(true);setError(null);
    try{await apiFetch(`/automation/workflows/${w.id}/enabled`,{method:'PATCH',headers:headers(),body:JSON.stringify({enabled})});await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update workflow.');}
    finally{setBusy(false);}
  }

  async function runWorkflow(w:Workflow) {
    setBusy(true);setError(null);setNotice(null);
    try{const result=await apiFetch<{id:string;status:string}>(`/automation/workflows/${w.id}/run`,{method:'POST',headers:headers(),body:JSON.stringify({payload:{requestedFrom:'automation-console'}})});setNotice(`Execution queued: ${result.id} (${result.status}).`);await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to queue workflow.');}
    finally{setBusy(false);}
  }

  async function decide(a:Approval,decision:'APPROVED'|'REJECTED') {
    setBusy(true);setError(null);setNotice(null);
    try{await apiFetch(`/automation/workflows/approvals/${a.id}/decision`,{method:'POST',headers:headers(),body:JSON.stringify({decision,note:decision==='APPROVED'?'Approved by authorised operator':'Rejected by authorised operator'})});setNotice(`Approval ${decision.toLowerCase()}.`);await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to record approval.');}
    finally{setBusy(false);}
  }

  async function changeIntegrationEnabled(i:Integration,enabled:boolean) {
    setBusy(true);setError(null);setNotice(null);
    try{await apiFetch(`/automation/workflows/integrations/${i.id}/enabled`,{method:'PATCH',headers:headers(),body:JSON.stringify({enabled})});setNotice('Integration state updated. Provider connectivity has not been tested.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update integration.');}
    finally{setBusy(false);}
  }

  async function createIntegration(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError(null);setNotice(null);
    try{await apiFetch('/automation/workflows/integrations',{method:'POST',headers:headers(),body:JSON.stringify({name:integrationName,providerType:integrationType,baseUrl:integrationUrl||undefined,secretRef:integrationSecretRef||undefined,enabled:false,config:{createdFrom:'automation-console'}})});setIntegrationName('');setIntegrationUrl('');setIntegrationSecretRef('');setNotice('Integration saved disabled. Credentials must remain in the tenant secrets vault; this record does not test provider connectivity.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to save integration.');}
    finally{setBusy(false);}
  }

  return <main style={styles.page}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'flex-start'}}>
      <div><div style={{fontSize:12,letterSpacing:2,fontWeight:700,color:'#52627a'}}>JASLYN NET / OPERATIONS</div><h1 style={{fontSize:'clamp(28px,4vw,42px)',letterSpacing:'-0.04em',margin:'10px 0'}}>Workflow automation</h1><p style={{maxWidth:760,color:'#52627a',lineHeight:1.6,margin:0}}>Event-driven and scheduled operations, approvals, secure webhooks and integration records. Deterministic execution only — no AI features.</p></div>
      <button style={styles.button} disabled={busy} onClick={()=>void load()}>Refresh workspace</button>
    </div>
    {error&&<div role="alert" style={{...styles.panel,borderColor:'#e3a4a4',color:'#9b2424'}}>{error}</div>}
    {notice&&<div role="status" style={{...styles.panel,borderColor:'#a8b8ce'}}>{notice}</div>}
    {newWebhook&&<section style={{...styles.panel,borderColor:'#b7c7df'}}><h2 style={{marginTop:0}}>Copy the webhook secret now</h2><p>This token is shown once. Store it in the calling system’s secret manager and send it as <code>x-jaslyn-webhook-token</code>.</p><p><strong>POST path:</strong> <code>{newWebhook.webhookPath}</code></p><p style={{overflowWrap:'anywhere'}}><code>{newWebhook.webhookToken}</code></p><button style={styles.button} onClick={()=>{void navigator.clipboard?.writeText(newWebhook.webhookToken??'');}}>Copy token</button></section>}

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Create workflow</h2>
      <p style={{color:'#52627a'}}>Triggers: manual, event, schedule or authenticated webhook. The first version supports conditions, human approval gates, webhook event emission, wait steps and execution logs.</p>
      <form onSubmit={createWorkflow} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:14}}>
        <label>Workflow name<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} style={styles.input} placeholder="Payment confirmation review"/></label>
        <label>Trigger type<select value={triggerType} onChange={e=>setTriggerType(e.target.value)} style={styles.input}><option value="MANUAL">Manual</option><option value="EVENT">Domain event</option><option value="SCHEDULE">Schedule / interval</option><option value="WEBHOOK">Inbound webhook</option></select></label>
        {triggerType==='EVENT'&&<label>Event type<input required value={eventType} onChange={e=>setEventType(e.target.value)} style={styles.input}/></label>}
        {triggerType==='SCHEDULE'&&<label>Interval (60–86400 seconds)<input required type="number" min={60} max={86400} value={intervalSeconds} onChange={e=>setIntervalSeconds(e.target.value)} style={styles.input}/></label>}
        <label style={{gridColumn:'1 / -1'}}>Description<input value={description} onChange={e=>setDescription(e.target.value)} style={styles.input} maxLength={1000} placeholder="What this workflow safely automates"/></label>
        <label style={{gridColumn:'1 / -1'}}>Workflow steps (JSON)<textarea required rows={12} value={steps} onChange={e=>setSteps(e.target.value)} style={{...styles.input,fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:13}} spellCheck={false}/></label>
        <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end'}}><button disabled={busy} style={styles.primary} type="submit">{busy?'Saving…':'Create workflow'}</button></div>
      </form>
    </section>

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Workflows <small style={{fontSize:14,color:'#64748b'}}>({workflows.length})</small></h2>
      {workflows.length===0?<p style={{color:'#64748b'}}>No workflows returned for this tenant yet.</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>{workflows.map(w=><article key={w.id} style={{border:'1px solid #dfe5ed',borderRadius:12,padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{w.name}</strong><span style={{fontSize:11,fontWeight:700,color:w.enabled?'#236347':'#64748b'}}>{w.enabled?'ENABLED':'DISABLED'}</span></div>
        <p style={{color:'#64748b',fontSize:13,lineHeight:1.5}}>{w.description||'No description'}<br/>Trigger: {w.triggerType} · {w.steps.length} steps</p>
        {w.nextRunAt&&<p style={{fontSize:12}}>Next scheduled: {new Date(w.nextRunAt).toLocaleString()}</p>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={styles.button} disabled={busy} onClick={()=>void changeEnabled(w,!w.enabled)}>{w.enabled?'Disable':'Enable'}</button><button style={styles.primary} disabled={busy||!w.enabled} onClick={()=>void runWorkflow(w)}>Run now</button></div>
      </article>)}</div>}
    </section>

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Operational alerts <small style={{fontSize:14,color:'#64748b'}}>({alerts.filter(a=>a.status==='OPEN').length} open)</small></h2>
      {alerts.length===0?<p style={{color:'#64748b'}}>No workflow alerts returned.</p>:alerts.slice(0,50).map(a=><div key={a.id} style={{borderTop:'1px solid #e2e8f0',padding:'12px 0',display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}><div><strong>{a.title}</strong><p style={{margin:'5px 0',fontSize:12,color:'#64748b'}}>Run {a.runId} · {new Date(a.createdAt).toLocaleString()}</p></div><span style={{fontSize:12,fontWeight:700}}>{a.severity} · {a.status}</span></div>)}
    </section>

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Approval queue <small style={{fontSize:14,color:'#64748b'}}>({approvals.filter(a=>a.status==='PENDING').length} pending)</small></h2>
      {approvals.filter(a=>a.status==='PENDING').length===0?<p style={{color:'#64748b'}}>No pending approvals.</p>:approvals.filter(a=>a.status==='PENDING').map(a=><div key={a.id} style={{borderTop:'1px solid #e2e8f0',padding:'14px 0',display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}><div><strong>{a.title}</strong><p style={{margin:'5px 0',fontSize:12,color:'#64748b'}}>Run {a.runId} · requested {new Date(a.requestedAt).toLocaleString()}</p></div><div style={{display:'flex',gap:8}}><button style={styles.button} disabled={busy} onClick={()=>void decide(a,'REJECTED')}>Reject</button><button style={styles.primary} disabled={busy} onClick={()=>void decide(a,'APPROVED')}>Approve</button></div></div>)}
    </section>

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Integration hub <small style={{fontSize:14,color:'#64748b'}}>({integrations.length})</small></h2>
      <p style={{color:'#52627a'}}>Integration records are tenant-scoped and disabled by default. Store credentials in the Secrets Vault; connection health and provider-side actions require a validated adapter.</p>
      <form onSubmit={createIntegration} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
        <label>Name<input required value={integrationName} onChange={e=>setIntegrationName(e.target.value)} style={styles.input}/></label>
        <label>Type<select value={integrationType} onChange={e=>setIntegrationType(e.target.value)} style={styles.input}><option>WEBHOOK</option><option>REST_API</option><option>SMS</option><option>PAYMENT</option><option>NETWORK_CONTROLLER</option></select></label>
        <label>HTTPS base URL<input value={integrationUrl} onChange={e=>setIntegrationUrl(e.target.value)} style={styles.input} placeholder="https://hooks.example.com"/></label>
        <label>Tenant secret UUID<input value={integrationSecretRef} onChange={e=>setIntegrationSecretRef(e.target.value)} style={styles.input} placeholder="Optional: UUID from Secrets Vault"/></label>
        <div style={{display:'flex',alignItems:'end'}}><button style={styles.primary} disabled={busy} type="submit">Save disabled integration</button></div>
      </form>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10,marginTop:14}}>{integrations.map(i=><div key={i.id} style={{border:'1px solid #dfe5ed',borderRadius:10,padding:12}}><strong>{i.name}</strong><p style={{margin:'5px 0',fontSize:12,color:'#64748b'}}>{i.providerType} · {i.enabled?'Enabled':'Disabled'}</p>{i.baseUrl&&<code style={{fontSize:11,overflowWrap:'anywhere'}}>{i.baseUrl}</code>}<div style={{marginTop:10}}><button style={styles.button} disabled={busy} onClick={()=>void changeIntegrationEnabled(i,!i.enabled)}>{i.enabled?'Disable':'Enable'}</button></div></div>)}</div>
    </section>

    <section style={styles.panel}>
      <h2 style={{marginTop:0}}>Execution history <small style={{fontSize:14,color:'#64748b'}}>({runs.length})</small></h2>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Created','Workflow ID','Trigger','Status','Step','Attempts','Last error'].map(x=><th key={x} style={{textAlign:'left',padding:'10px 8px',borderBottom:'1px solid #dfe5ed',whiteSpace:'nowrap'}}>{x}</th>)}</tr></thead><tbody>{runs.slice(0,100).map(r=><tr key={r.id}>{[new Date(r.createdAt).toLocaleString(),r.workflowId,r.triggerType,r.status,String(r.currentStep),String(r.attempts),r.lastError||'—'].map((v,i)=><td key={i} style={{padding:'10px 8px',borderBottom:'1px solid #edf1f5',maxWidth:240,overflowWrap:'anywhere'}}>{v}</td>)}</tr>)}{runs.length===0&&<tr><td colSpan={7} style={{padding:16,color:'#64748b'}}>No workflow runs returned.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
