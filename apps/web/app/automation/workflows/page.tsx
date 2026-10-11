'use client';

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';

type Row = Record<string, unknown>;
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#172033' };
const button: CSSProperties = { padding: '10px 14px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const panel: CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 16 };
const cell: CSSProperties = { textAlign: 'left', padding: 10, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top', overflowWrap: 'anywhere' };
const show = (v: unknown) => v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

export default function WorkflowAutomationPage() {
  const [tab, setTab] = useState<'workflows'|'runs'|'approvals'|'integrations'|'alerts'>('workflows');
  const [workflows, setWorkflows] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Row[]>([]);
  const [integrations, setIntegrations] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<'MANUAL'|'EVENT'|'SCHEDULE'|'WEBHOOK'>('MANUAL');
  const [eventType, setEventType] = useState('PAYMENT.RECONCILED');
  const [interval, setInterval] = useState('3600');
  const [steps, setSteps] = useState('[\n  { "type": "CONDITION", "path": "status", "op": "eq", "value": "PAID" },\n  { "type": "APPROVAL", "title": "Approve customer access change" },\n  { "type": "CREATE_ALERT", "severity": "MEDIUM", "title": "Workflow action approved" },\n  { "type": "LOG", "message": "Workflow finished" }\n]');
  const [integrationName, setIntegrationName] = useState('');
  const [integrationType, setIntegrationType] = useState<'WEBHOOK'|'REST_API'|'SMS'|'PAYMENT'|'NETWORK_CONTROLLER'>('WEBHOOK');
  const [integrationUrl, setIntegrationUrl] = useState('');
  const [secretRef, setSecretRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [decisionNote, setDecisionNote] = useState('Reviewed by operator');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setError('Ingia kwanza ili kutumia workflow automation.'); return; }
    setLoading(true); setError('');
    const headers = { Authorization: 'Bearer ' + token };
    const requests = await Promise.all([
      apiFetch<{data:Row[]}>('/automation/workflows', {headers}).then(value => ({key:'workflows' as const,value})).catch(cause => ({key:'workflows' as const,cause})),
      apiFetch<{data:Row[]}>('/automation/workflows/runs', {headers}).then(value => ({key:'runs' as const,value})).catch(cause => ({key:'runs' as const,cause})),
      apiFetch<{data:Row[]}>('/automation/workflows/approvals', {headers}).then(value => ({key:'approvals' as const,value})).catch(cause => ({key:'approvals' as const,cause})),
      apiFetch<{data:Row[]}>('/automation/workflows/integrations', {headers}).then(value => ({key:'integrations' as const,value})).catch(cause => ({key:'integrations' as const,cause})),
      apiFetch<{data:Row[]}>('/automation/workflows/alerts', {headers}).then(value => ({key:'alerts' as const,value})).catch(cause => ({key:'alerts' as const,cause})),
    ]);
    for (const r of requests) {
      if ('value' in r) {
        if (r.key==='workflows') setWorkflows(r.value.data ?? []);
        if (r.key==='runs') setRuns(r.value.data ?? []);
        if (r.key==='approvals') setApprovals(r.value.data ?? []);
        if (r.key==='integrations') setIntegrations(r.value.data ?? []);
        if (r.key==='alerts') setAlerts(r.value.data ?? []);
      } else setError(current => current ? current + ' · ' + (r.cause instanceof Error ? r.cause.message : 'Request failed') : (r.cause instanceof Error ? r.cause.message : 'Request failed'));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function send(path: string, method: 'POST'|'PATCH', body: unknown, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const token = getAccessToken();
      await apiFetch(path, {method, headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}, body:JSON.stringify(body)});
      setNotice(success); await load();
    } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : 'Ombi limeshindikana'); }
    finally { setBusy(false); }
  }
  async function createWorkflow(e: FormEvent) {
    e.preventDefault();
    try {
      const parsed = JSON.parse(steps) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Steps lazima ziwe JSON array.');
      const triggerConfig = triggerType==='EVENT' ? {eventType} : triggerType==='SCHEDULE' ? {intervalSeconds:Number(interval)} : {};
      await send('/automation/workflows','POST',{name,description,triggerType,triggerConfig,steps:parsed,enabled:false},'Workflow imehifadhiwa ikiwa DISABLED. Kagua steps kabla ya kuiwezesha.');
      setName('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Workflow steps si sahihi'); }
  }
  async function createIntegration(e: FormEvent) {
    e.preventDefault();
    await send('/automation/workflows/integrations','POST',{name:integrationName,providerType:integrationType,baseUrl:integrationUrl||undefined,secretRef:secretRef||undefined,enabled:false},'Integration imehifadhiwa ikiwa disabled.');
    setIntegrationName('');
  }
  async function runWorkflow(id: string) { await send('/automation/workflows/'+encodeURIComponent(id)+'/run','POST',{idempotencyKey:'ui-'+crypto.randomUUID(),payload:{requestedAt:new Date().toISOString(),source:'operator-ui'}},'Run imeongezwa kwenye queue. Angalia Execution history.'); }
  const tabs: Array<[typeof tab,string]> = [['workflows','Workflow builder'],['runs','Execution history'],['approvals','Approvals'],['integrations','Integrations'],['alerts','Alerts']];

  return <main style={{maxWidth:1240,margin:'0 auto',padding:'24px 18px',minHeight:'100vh',background:'#f5f7fb',color:'#172033'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:14,flexWrap:'wrap'}}>
      <div><p style={{fontSize:11,fontWeight:800,letterSpacing:'.15em',color:'#64748b'}}>JASLYN NET / OPERATIONS AUTOMATION</p><h1 style={{fontSize:32,margin:'6px 0'}}>Workflow control center</h1><p style={{maxWidth:760,color:'#64748b',lineHeight:1.6}}>Build deterministic flows for network operations, customer lifecycle, billing events and integrations. No AI, no arbitrary code execution. New workflows start disabled.</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href="/automation" style={{...button,textDecoration:'none',background:'#e2e8f0',color:'#172033'}}>Event rules</a><button style={button} onClick={()=>void load()} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
    </header>
    {error && <p role="alert" style={{background:'#fff1f2',color:'#9f1239',padding:12,borderRadius:8,overflowWrap:'anywhere'}}>{error}</p>}
    {notice && <p role="status" style={{background:'#ecfdf5',color:'#065f46',padding:12,borderRadius:8}}>{notice}</p>}
    <nav aria-label="Workflow sections" style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} style={{...button,background:tab===id?'#174ea6':'#e2e8f0',color:tab===id?'#fff':'#334155'}}>{label}</button>)}</nav>
    {tab==='workflows' && <>
      <section style={panel}>
        <h2 style={{marginTop:0}}>Create workflow</h2>
        <form onSubmit={createWorkflow} style={{display:'grid',gap:12}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:12}}>
            <label>Workflow name<input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Payment exception review" style={{...field,display:'block',marginTop:6}} /></label>
            <label>Trigger<select value={triggerType} onChange={e=>setTriggerType(e.target.value as typeof triggerType)} style={{...field,display:'block',marginTop:6}}><option value="MANUAL">Manual / operator</option><option value="EVENT">Domain event</option><option value="SCHEDULE">Scheduled interval</option><option value="WEBHOOK">Inbound webhook (token)</option></select></label>
            {triggerType==='EVENT' && <label>Exact event type<input required value={eventType} onChange={e=>setEventType(e.target.value.toUpperCase())} style={{...field,display:'block',marginTop:6}} /></label>}
            {triggerType==='SCHEDULE' && <label>Run every (seconds, 60–86400)<input type="number" min={60} max={86400} required value={interval} onChange={e=>setInterval(e.target.value)} style={{...field,display:'block',marginTop:6}} /></label>}
          </div>
          <label>Description<textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000} placeholder="What should this workflow accomplish?" style={{...field,display:'block',marginTop:6}} /></label>
          <label>Workflow steps (JSON)<textarea required rows={9} value={steps} onChange={e=>setSteps(e.target.value)} spellCheck={false} style={{...field,display:'block',marginTop:6,fontFamily:'ui-monospace,monospace',fontSize:13}} /></label>
          <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',padding:12,borderRadius:8,fontSize:13,lineHeight:1.7}}>
            <strong>Supported nodes:</strong> CONDITION, APPROVAL, CREATE_ALERT, EMIT_WEBHOOK, WAIT, LOG.
            <br/>Triggers: manual, domain event, schedule, authenticated webhook. Conditions support eq, neq, gt, gte, lt, lte, exists and contains.
            <br/>External side effects are queued to tenant-configured webhook endpoints; sensitive steps should include APPROVAL.
          </div>
          <button style={{...button,justifySelf:'start'}} disabled={busy}>Save workflow disabled</button>
        </form>
      </section>
      <section style={panel}><h2>Workflows</h2><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Name','Trigger','Steps','Enabled','Next run','Actions'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>
        {workflows.map(w=><tr key={show(w.id)}>{[w.name,w.triggerType,w.steps,w.enabled?'YES':'NO',w.nextRunAt].map((v,i)=><td key={i} style={cell}>{show(v)}</td>)}<td style={cell}><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button disabled={busy||!w.enabled} onClick={()=>void runWorkflow(show(w.id))}>Run now</button><button disabled={busy} onClick={()=>void send('/automation/workflows/'+encodeURIComponent(show(w.id))+'/enabled','PATCH',{enabled:!w.enabled},w.enabled?'Workflow disabled.':'Workflow enabled.')}>{w.enabled?'Disable':'Enable'}</button></div></td></tr>)}
        {!workflows.length&&<tr><td colSpan={6} style={cell}>{loading?'Loading…':'No workflows yet. Create your first workflow above.'}</td></tr>}
      </tbody></table></div></section>
    </>}
    {tab==='runs' && <section style={panel}><h2>Execution history</h2><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Created','Workflow','Trigger','Status','Step','Attempts','Last error','Results'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{runs.map(r=><tr key={show(r.id)}>{[r.createdAt,r.workflowId,r.triggerType,r.status,r.currentStep,r.attempts,r.lastError,r.stepResults].map((v,i)=><td key={i} style={cell}>{show(v)}</td>)}</tr>)}{!runs.length&&<tr><td colSpan={8} style={cell}>{loading?'Loading…':'No executions yet.'}</td></tr>}</tbody></table></div></section>}
    {tab==='approvals' && <section style={panel}><h2>Human approvals</h2><p style={{color:'#64748b'}}>High-risk workflow actions should wait here for an authorised operator decision.</p><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Requested','Run','Step','Title','Details','Status','Decision'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{approvals.map(a=><tr key={show(a.id)}>{[a.requestedAt,a.runId,a.stepIndex,a.title,a.details,a.status].map((v,i)=><td key={i} style={cell}>{show(v)}</td>)}<td style={cell}>{a.status==='PENDING'&&<div style={{display:'grid',gap:6}}><input value={decisionNote} onChange={e=>setDecisionNote(e.target.value)} style={field} aria-label="Approval decision note"/><div style={{display:'flex',gap:6}}><button disabled={busy||decisionNote.trim().length<3} onClick={()=>void send('/automation/workflows/approvals/'+encodeURIComponent(show(a.id))+'/decision','POST',{decision:'APPROVED',note:decisionNote},'Approval granted.')}>Approve</button><button disabled={busy||decisionNote.trim().length<3} onClick={()=>void send('/automation/workflows/approvals/'+encodeURIComponent(show(a.id))+'/decision','POST',{decision:'REJECTED',note:decisionNote},'Approval rejected.')}>Reject</button></div></div>}</td></tr>)}{!approvals.length&&<tr><td colSpan={7} style={cell}>{loading?'Loading…':'No pending approvals.'}</td></tr>}</tbody></table></div></section>}
    {tab==='integrations' && <><section style={panel}><h2>Create integration</h2><form onSubmit={createIntegration} style={{display:'grid',gap:12}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}><label>Name<input required minLength={2} maxLength={120} value={integrationName} onChange={e=>setIntegrationName(e.target.value)} style={{...field,display:'block',marginTop:6}}/></label><label>Type<select value={integrationType} onChange={e=>setIntegrationType(e.target.value as typeof integrationType)} style={{...field,display:'block',marginTop:6}}>{['WEBHOOK','REST_API','SMS','PAYMENT','NETWORK_CONTROLLER'].map(t=><option key={t}>{t}</option>)}</select></label><label>HTTPS base URL<input value={integrationUrl} onChange={e=>setIntegrationUrl(e.target.value)} placeholder="https://provider.example/api" style={{...field,display:'block',marginTop:6}}/></label><label>Secret Vault reference UUID<input value={secretRef} onChange={e=>setSecretRef(e.target.value)} placeholder="Optional tenant secret ID" style={{...field,display:'block',marginTop:6}}/></label></div><p style={{fontSize:13,color:'#64748b'}}>Credentials are not stored in this form. Use a tenant-owned Secrets Vault reference. Integrations are created disabled.</p><button style={{...button,justifySelf:'start'}} disabled={busy}>Save integration disabled</button></form></section><section style={panel}><h2>Integration registry</h2><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Name','Type','Base URL','Secret ref','Enabled','Action'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{integrations.map(i=><tr key={show(i.id)}>{[i.name,i.providerType,i.baseUrl,i.secretRef,i.enabled?'YES':'NO'].map((v,j)=><td key={j} style={cell}>{show(v)}</td>)}<td style={cell}><button disabled={busy} onClick={()=>void send('/automation/workflows/integrations/'+encodeURIComponent(show(i.id))+'/enabled','PATCH',{enabled:!i.enabled},i.enabled?'Integration disabled.':'Integration enabled.')}>{i.enabled?'Disable':'Enable'}</button></td></tr>)}{!integrations.length&&<tr><td colSpan={6} style={cell}>{loading?'Loading…':'No integrations configured.'}</td></tr>}</tbody></table></div></section></>}
    {tab==='alerts' && <section style={panel}><h2>Workflow alerts</h2><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Created','Run','Step','Severity','Title','Status','Details'].map(x=><th key={x} style={cell}>{x}</th>)}</tr></thead><tbody>{alerts.map(a=><tr key={show(a.id)}>{[a.createdAt,a.runId,a.stepIndex,a.severity,a.title,a.status,a.details].map((v,i)=><td key={i} style={cell}>{show(v)}</td>)}</tr>)}{!alerts.length&&<tr><td colSpan={7} style={cell}>{loading?'Loading…':'No workflow alerts.'}</td></tr>}</tbody></table></div></section>}
    <footer style={{fontSize:12,color:'#64748b',padding:'8px 2px'}}>Automation runs with deterministic rules only. Voice transcription, Whisper and AI features are intentionally excluded.</footer>
  </main>;
}
