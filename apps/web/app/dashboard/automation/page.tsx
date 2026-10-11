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
  const [stepDraftType,setStepDraftType]=useState('CONDITION');

  let visualSteps: Record<string,unknown>[] = [];
  try {
    const parsed: unknown = JSON.parse(steps);
    if (Array.isArray(parsed)) visualSteps = parsed.filter((item): item is Record<string,unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
  } catch { /* Keep the JSON editor available to correct malformed input. */ }

  function writeSteps(next: Record<string,unknown>[]) { setSteps(JSON.stringify(next,null,2)); }
  function addStep(type=stepDraftType) {
    const templates: Record<string,Record<string,unknown>> = {
      CONDITION:{type:'CONDITION',path:'payment.status',op:'eq',value:'CONFIRMED'},
      TRANSFORM:{type:'TRANSFORM',mappings:[{from:'payment.status',to:'workflow.paymentStatus'}]},
      CREATE_ALERT:{type:'CREATE_ALERT',severity:'HIGH',title:'Operator attention required',details:{}},
      APPROVAL:{type:'APPROVAL',title:'Approve sensitive operation',details:{}},
      EMIT_WEBHOOK:{type:'EMIT_WEBHOOK',eventType:'workflow.completed',payload:{}},
      WAIT:{type:'WAIT',seconds:60},
      LOG:{type:'LOG',message:'Workflow step completed'},
    };
    writeSteps([...visualSteps,templates[type]??templates.CONDITION]);
  }
  function updateStep(index:number,key:string,value:unknown) {
    writeSteps(visualSteps.map((step,i)=>i===index?{...step,[key]:value}:step));
  }
  function updateStepValue(index:number,raw:string) {
    let value:unknown=raw;
    try { value=JSON.parse(raw); } catch { /* Unquoted text remains a string. */ }
    updateStep(index,'value',value);
  }
  function moveStep(index:number,delta:number) {
    const next=[...visualSteps], target=index+delta;
    if(target<0||target>=next.length)return;
    [next[index],next[target]]=[next[target],next[index]];
    writeSteps(next);
  }
  function removeStep(index:number) { writeSteps(visualSteps.filter((_,i)=>i!==index)); }
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

  async function exportWorkflow(w:Workflow) {
    setError(null);
    try {
      const definition=await apiFetch<Record<string,unknown>>(`/automation/workflows/${w.id}/export`,{headers:headers()});
      const blob=new Blob([JSON.stringify(definition,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);const anchor=document.createElement('a');
      anchor.href=url;anchor.download=`jaslyn-workflow-${w.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.json`;
      document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
      setNotice('Workflow definition exported. Secret values are not included.');
    } catch(e){setError(e instanceof Error?e.message:'Workflow export failed.');}
  }

  async function importWorkflow(file:File|null) {
    if(!file)return;
    setBusy(true);setError(null);setNotice(null);
    try {
      const parsed:unknown=JSON.parse(await file.text());
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Import file must be a workflow JSON object.');
      const record=parsed as Record<string,unknown>;
      const definition=(record.kind==='jaslyn-workflow'&&record.definition&&typeof record.definition==='object')?record.definition:record;
      const imported=await apiFetch<Workflow>('/automation/workflows/import',{method:'POST',headers:headers(),body:JSON.stringify(definition)});
      setNotice(`Imported "${imported.name}" as disabled. Review it before enabling.`);
      await load();
    } catch(e){setError(e instanceof Error?e.message:'Workflow import failed.');}
    finally{setBusy(false);}
  }

  async function replayRun(run:Run) {
    setBusy(true);setError(null);setNotice(null);
    try{const result=await apiFetch<{id:string;status:string}>(`/automation/workflows/runs/${run.id}/replay`,{method:'POST',headers:headers()});setNotice(`Replay queued: ${result.id} (${result.status}).`);await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to replay run.');}
    finally{setBusy(false);}
  }

  async function cancelRun(run:Run) {
    setBusy(true);setError(null);setNotice(null);
    try{await apiFetch(`/automation/workflows/runs/${run.id}/cancel`,{method:'PATCH',headers:headers()});setNotice('Queued workflow run cancelled.');await load();}
    catch(e){setError(e instanceof Error?e.message:'Unable to cancel run.');}
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
        <div style={{gridColumn:'1 / -1',border:'1px solid #dfe5ed',borderRadius:12,padding:14,background:'#f8fafc'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
            <div><h3 style={{margin:'0 0 4px'}}>Visual step builder</h3><p style={{margin:0,fontSize:13,color:'#64748b'}}>Add nodes, edit their fields, reorder the flow, or remove steps. The JSON below stays synchronised.</p></div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><select aria-label="Node type to add" value={stepDraftType} onChange={e=>setStepDraftType(e.target.value)} style={{...styles.input,marginTop:0,width:'auto'}}>{['CONDITION','TRANSFORM','CREATE_ALERT','APPROVAL','EMIT_WEBHOOK','WAIT','LOG'].map(t=><option key={t}>{t}</option>)}</select><button type="button" style={styles.primary} onClick={()=>addStep()}>+ Add node</button></div>
          </div>
          <div style={{display:'grid',gap:10,marginTop:14}}>
            {visualSteps.map((step,index)=><article key={index} style={{background:'#fff',border:'1px solid #d7e0eb',borderRadius:10,padding:12,boxShadow:'0 2px 8px rgba(15,23,42,.03)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{display:'grid',placeItems:'center',width:28,height:28,borderRadius:8,background:'#e8eef8',fontSize:12,fontWeight:800}}>{index+1}</span><div><strong>{String(step.type??'NODE')}</strong><div style={{fontSize:12,color:'#64748b'}}>{step.type==='CONDITION'?'Branch condition':step.type==='TRANSFORM'?'Map payload fields safely':step.type==='APPROVAL'?'Human approval gate':step.type==='CREATE_ALERT'?'Create operational alert':step.type==='EMIT_WEBHOOK'?'Queue subscribed webhook event':step.type==='WAIT'?'Delay before next step':'Execution log entry'}</div></div></div>
                <div style={{display:'flex',gap:5}}><button type="button" aria-label="Move node up" style={styles.button} disabled={index===0} onClick={()=>moveStep(index,-1)}>↑</button><button type="button" aria-label="Move node down" style={styles.button} disabled={index===visualSteps.length-1} onClick={()=>moveStep(index,1)}>↓</button><button type="button" style={{...styles.button,color:'#9f1239'}} onClick={()=>removeStep(index)}>Remove</button></div>
              </div>
              {step.type==='CONDITION'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}><label>Payload path<input value={String(step.path??'')} onChange={e=>updateStep(index,'path',e.target.value)} style={styles.input} placeholder="payment.status"/></label><label>Operator<select value={String(step.op??'eq')} onChange={e=>updateStep(index,'op',e.target.value)} style={styles.input}>{['eq','neq','gt','gte','lt','lte','contains','exists'].map(op=><option key={op}>{op}</option>)}</select></label><label>Expected value<input value={step.value===undefined?'':typeof step.value==='string'?step.value:JSON.stringify(step.value)} onChange={e=>updateStepValue(index,e.target.value)} style={styles.input} placeholder={'CONFIRMED or 100'}/></label></div>}
              {step.type==='TRANSFORM'&&<div style={{display:'grid',gap:10}}>
                <p style={{margin:0,fontSize:12,color:'#64748b'}}>Copy values from the trigger payload into workflow payload paths. Missing source fields are skipped; no code is executed.</p>
                {Array.isArray(step.mappings)&&step.mappings.map((raw:unknown,mappingIndex:number)=>{
                  const mapping=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
                  return <div key={mappingIndex} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,alignItems:'end'}}>
                    <label>Source path<input value={String(mapping.from??'')} onChange={e=>updateStep(index,'mappings',(step.mappings as Record<string,unknown>[]).map((m,i)=>i===mappingIndex?{...m,from:e.target.value}:m))} style={styles.input} placeholder="payment.status"/></label>
                    <label>Target path<input value={String(mapping.to??'')} onChange={e=>updateStep(index,'mappings',(step.mappings as Record<string,unknown>[]).map((m,i)=>i===mappingIndex?{...m,to:e.target.value}:m))} style={styles.input} placeholder="workflow.paymentStatus"/></label>
                    <button type="button" style={styles.button} onClick={()=>updateStep(index,'mappings',(step.mappings as Record<string,unknown>[]).filter((_,i)=>i!==mappingIndex))}>Remove</button>
                  </div>;
                })}
                <div><button type="button" style={styles.button} onClick={()=>updateStep(index,'mappings',[...((step.mappings as Record<string,unknown>[])??[]),{from:'',to:''}])}>+ Add mapping</button></div>
              </div>}
              {step.type==='CREATE_ALERT'&&<div style={{display:'grid',gridTemplateColumns:'minmax(150px,220px) 1fr',gap:10}}><label>Severity<select value={String(step.severity??'HIGH')} onChange={e=>updateStep(index,'severity',e.target.value)} style={styles.input}>{['CRITICAL','HIGH','MEDIUM','LOW','INFO'].map(v=><option key={v}>{v}</option>)}</select></label><label>Alert title<input value={String(step.title??'')} onChange={e=>updateStep(index,'title',e.target.value)} style={styles.input} maxLength={180}/></label></div>}
              {step.type==='APPROVAL'&&<label>Approval prompt<input value={String(step.title??'')} onChange={e=>updateStep(index,'title',e.target.value)} style={styles.input} maxLength={180}/></label>}
              {step.type==='EMIT_WEBHOOK'&&<label>Event type<input value={String(step.eventType??'')} onChange={e=>updateStep(index,'eventType',e.target.value.toUpperCase())} style={styles.input} placeholder="workflow.completed"/></label>}
              {step.type==='WAIT'&&<label>Wait seconds (1–86400)<input type="number" min={1} max={86400} value={String(step.seconds??60)} onChange={e=>updateStep(index,'seconds',Number(e.target.value))} style={styles.input}/></label>}
              {step.type==='LOG'&&<label>Log message<input value={String(step.message??'')} onChange={e=>updateStep(index,'message',e.target.value)} style={styles.input} maxLength={500}/></label>}
            </article>)}
            {visualSteps.length===0&&<div style={{padding:18,border:'1px dashed #cbd5e1',borderRadius:8,color:'#64748b',textAlign:'center'}}>No nodes yet. Add a node to begin the workflow.</div>}
          </div>
        </div>
        <label style={{gridColumn:'1 / -1'}}>Advanced JSON (synchronised with visual nodes)<textarea required rows={10} value={steps} onChange={e=>setSteps(e.target.value)} style={{...styles.input,fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:13}} spellCheck={false}/></label>
        <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end'}}><button disabled={busy} style={styles.primary} type="submit">{busy?'Saving…':'Create workflow'}</button></div>
      </form>
    </section>

    <section style={styles.panel}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><h2 style={{marginTop:0}}>Workflows <small style={{fontSize:14,color:'#64748b'}}>({workflows.length})</small></h2><label style={{...styles.button,display:'inline-flex',alignItems:'center',gap:8}}>Import JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void importWorkflow(e.target.files?.[0]??null);e.currentTarget.value='';}} style={{maxWidth:190}}/></label></div>
      {workflows.length===0?<p style={{color:'#64748b'}}>No workflows returned for this tenant yet.</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>{workflows.map(w=><article key={w.id} style={{border:'1px solid #dfe5ed',borderRadius:12,padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{w.name}</strong><span style={{fontSize:11,fontWeight:700,color:w.enabled?'#236347':'#64748b'}}>{w.enabled?'ENABLED':'DISABLED'}</span></div>
        <p style={{color:'#64748b',fontSize:13,lineHeight:1.5}}>{w.description||'No description'}<br/>Trigger: {w.triggerType} · {w.steps.length} steps</p>
        {w.nextRunAt&&<p style={{fontSize:12}}>Next scheduled: {new Date(w.nextRunAt).toLocaleString()}</p>}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={styles.button} disabled={busy} onClick={()=>void exportWorkflow(w)}>Export</button><button style={styles.button} disabled={busy} onClick={()=>void changeEnabled(w,!w.enabled)}>{w.enabled?'Disable':'Enable'}</button><button style={styles.primary} disabled={busy||!w.enabled} onClick={()=>void runWorkflow(w)}>Run now</button></div>
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
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Created','Workflow ID','Trigger','Status','Step','Attempts','Last error','Actions'].map(x=><th key={x} style={{textAlign:'left',padding:'10px 8px',borderBottom:'1px solid #dfe5ed',whiteSpace:'nowrap'}}>{x}</th>)}</tr></thead><tbody>{runs.slice(0,100).map(r=><tr key={r.id}>{[new Date(r.createdAt).toLocaleString(),r.workflowId,r.triggerType,r.status,String(r.currentStep),String(r.attempts),r.lastError||'—'].map((v,i)=><td key={i} style={{padding:'10px 8px',borderBottom:'1px solid #edf1f5',maxWidth:240,overflowWrap:'anywhere'}}>{v}</td>)}<td style={{padding:'10px 8px',borderBottom:'1px solid #edf1f5',whiteSpace:'nowrap'}}><button style={styles.button} disabled={busy||!(r.status==='FAILED'&&r.currentStep===0)} onClick={()=>void replayRun(r)}>Replay</button>{['QUEUED','WAITING_APPROVAL'].includes(r.status)&&<button style={{...styles.button,marginLeft:6}} disabled={busy} onClick={()=>void cancelRun(r)}>Cancel</button>}</td></tr>)}{runs.length===0&&<tr><td colSpan={8} style={{padding:16,color:'#64748b'}}>No workflow runs returned.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}
