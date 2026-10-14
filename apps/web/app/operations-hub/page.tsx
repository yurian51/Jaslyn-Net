'use client';

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Row = Record<string, unknown>;
const panel: CSSProperties = { background: '#fff', border: '1px solid #dbe3ee', borderRadius: 12, padding: 16, marginBottom: 16 };
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8 };
const button: CSSProperties = { padding: '9px 13px', border: 0, borderRadius: 8, background: '#174ea6', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const value = (v: unknown) => v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
const jsonInput = (raw: string, label: string) => { try { return JSON.parse(raw) as unknown; } catch { throw new Error(label + ' lazima iwe JSON sahihi.'); } };

export default function OperationsHubPage() {
  const [tab, setTab] = useState<'artifacts'|'workspace'|'runbooks'|'integrations'|'changes'>('artifacts');
  const [artifacts, setArtifacts] = useState<Row[]>([]), [workspaces, setWorkspaces] = useState<Row[]>([]), [runbooks, setRunbooks] = useState<Row[]>([]), [integrations, setIntegrations] = useState<Row[]>([]), [changes, setChanges] = useState<Row[]>([]);
  const [title, setTitle] = useState(''), [artifactType, setArtifactType] = useState('DOCUMENT'), [artifactContent, setArtifactContent] = useState('{"summary":"","items":[]}');
  const [workspaceName, setWorkspaceName] = useState('My workspace'), [workspaceLayout, setWorkspaceLayout] = useState('{}'), [workspacePins, setWorkspacePins] = useState('["/dashboard","/network"]');
  const [runbookName, setRunbookName] = useState(''), [runbookSteps, setRunbookSteps] = useState('[{"title":"Verify the affected service","type":"CHECKLIST"}]'), [rollbackSteps, setRollbackSteps] = useState('[{"title":"Restore the previous known-good state","type":"MANUAL"}]');
  const [providerKey, setProviderKey] = useState(''), [providerName, setProviderName] = useState(''), [providerConfig, setProviderConfig] = useState('{}');
  const [changeTitle, setChangeTitle] = useState(''), [changeType, setChangeType] = useState('NETWORK_CONFIG'), [targetType, setTargetType] = useState('router'), [targetId, setTargetId] = useState(''), [proposed, setProposed] = useState('{}'), [rollbackPlan, setRollbackPlan] = useState('["Restore saved configuration"]');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');

  const headers = useCallback(() => { const token = getAccessToken(); if (!token) throw new Error('Ingia kwanza ili kutumia Operations Hub.'); return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }; }, []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const h = headers();
      const results = await Promise.all([
        apiFetch<{data:Row[]}>('/operations-hub/artifacts',{headers:h}),
        apiFetch<{data:Row[]}>('/operations-hub/workspaces',{headers:h}),
        apiFetch<{data:Row[]}>('/operations-hub/runbooks',{headers:h}),
        apiFetch<{data:Row[]}>('/operations-hub/integrations',{headers:h}),
        apiFetch<{data:Row[]}>('/operations-hub/change-reviews',{headers:h}),
      ]);
      setArtifacts(results[0].data ?? []); setWorkspaces(results[1].data ?? []); setRunbooks(results[2].data ?? []); setIntegrations(results[3].data ?? []); setChanges(results[4].data ?? []);
    } catch (e) { setError(e instanceof ApiError || e instanceof Error ? e.message : 'Imeshindwa kupakia Operations Hub.'); }
    finally { setLoading(false); }
  }, [headers]);
  useEffect(() => { void load(); }, [load]);

  async function post(path: string, body: unknown, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await apiFetch(path,{method:'POST',headers:headers(),body:JSON.stringify(body)}); setNotice(success); await load(); }
    catch(e) { setError(e instanceof Error ? e.message : 'Ombi limeshindwa.'); }
    finally { setBusy(false); }
  }
  async function submit(e: FormEvent, fn: () => Promise<void>) { e.preventDefault(); try { await fn(); } catch(err) { setError(err instanceof Error ? err.message : 'Taarifa si sahihi.'); } }

  const list = (rows: Row[], columns: string[]) => <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{columns.map(c=><th key={c} style={{textAlign:'left',padding:8,borderBottom:'1px solid #e2e8f0'}}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={value(r.id)=== '—' ? i : value(r.id)}>{columns.map(c=>{const key=c.charAt(0).toLowerCase()+c.slice(1);return <td key={c} style={{padding:8,borderBottom:'1px solid #e2e8f0',verticalAlign:'top',overflowWrap:'anywhere'}}>{value(r[key] ?? r[c])}</td>;})}</tr>)}{!rows.length&&<tr><td colSpan={columns.length} style={{padding:10,color:'#64748b'}}>Hakuna rekodi bado.</td></tr>}</tbody></table></div>;

  return <main style={{maxWidth:1200,margin:'0 auto',padding:24,background:'#f8fafc',minHeight:'100vh',color:'#172033'}}>
    <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><p style={{fontSize:11,fontWeight:800,letterSpacing:'.14em',color:'#64748b'}}>JASLYN NET / OPERATIONS</p><h1 style={{fontSize:32,margin:'6px 0'}}>Operations Hub</h1><p style={{color:'#64748b'}}>Artifacts zenye version history, workspaces, runbooks, connector registry na change review.</p></div><button style={button} onClick={()=>void load()} disabled={loading}>{loading?'Inapakia…':'Refresh data'}</button></header>
    {error&&<p role="alert" style={{background:'#fff1f2',color:'#9f1239',padding:12,borderRadius:8}}>{error}</p>}{notice&&<p role="status" style={{background:'#ecfdf5',color:'#065f46',padding:12,borderRadius:8}}>{notice}</p>}
    <nav style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>{(['artifacts','workspace','runbooks','integrations','changes'] as const).map(t=><button key={t} style={{...button,background:tab===t?'#174ea6':'#e2e8f0',color:tab===t?'white':'#334155'}} onClick={()=>setTab(t)}>{({artifacts:'Artifacts',workspace:'My workspaces',runbooks:'Runbooks',integrations:'Integrations',changes:'Change review'})[t]}</button>)}</nav>

    {tab==='artifacts'&&<><section style={panel}><h2>Create operational artifact</h2><form onSubmit={e=>void submit(e,()=>post('/operations-hub/artifacts',{title,artifactType,visibility:'PRIVATE',content:jsonInput(artifactContent,'Artifact content'),changeNote:'Initial version'},'Artifact imehifadhiwa.'))} style={{display:'grid',gap:10}}><input required maxLength={180} placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} style={field}/><select value={artifactType} onChange={e=>setArtifactType(e.target.value)} style={field}><option>DOCUMENT</option><option>DASHBOARD</option><option>REPORT</option><option>SNAPSHOT</option><option>PLAYBOOK</option></select><label>Content JSON<textarea rows={5} value={artifactContent} onChange={e=>setArtifactContent(e.target.value)} style={field}/></label><button disabled={busy} style={button}>Save artifact</button></form></section><section style={panel}><h2>Saved artifacts</h2>{list(artifacts,['Title','ArtifactType','CurrentVersion','Visibility','UpdatedAt'])}<p style={{fontSize:12,color:'#64748b'}}>API ya version history: GET /operations-hub/artifacts/:id/versions. Hifadhi toleo jipya kwa POST /operations-hub/artifacts/:id/versions.</p></section></>}

    {tab==='workspace'&&<><section style={panel}><h2>Save personal workspace</h2><form onSubmit={e=>void submit(e,()=>post('/operations-hub/workspaces',{name:workspaceName,isDefault:true,layout:jsonInput(workspaceLayout,'Layout'),pinnedRoutes:jsonInput(workspacePins,'Pinned routes'),preferences:{}},'Workspace imehifadhiwa.'))} style={{display:'grid',gap:10}}><input required maxLength={100} value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} style={field} placeholder="Workspace name"/><label>Layout JSON<textarea rows={3} value={workspaceLayout} onChange={e=>setWorkspaceLayout(e.target.value)} style={field}/></label><label>Pinned routes JSON array<textarea rows={2} value={workspacePins} onChange={e=>setWorkspacePins(e.target.value)} style={field}/></label><button disabled={busy} style={button}>Save as default</button></form></section><section style={panel}><h2>My saved workspaces</h2>{list(workspaces,['Name','PinnedRoutes','IsDefault','UpdatedAt'])}</section></>}

    {tab==='runbooks'&&<><section style={panel}><h2>Create runbook</h2><form onSubmit={e=>void submit(e,()=>post('/operations-hub/runbooks',{name:runbookName,steps:jsonInput(runbookSteps,'Steps'),rollbackSteps:jsonInput(rollbackSteps,'Rollback steps'),preconditions:[],severity:'MEDIUM'},'Runbook imehifadhiwa kama DRAFT. Activation na execution halisi bado zinahitaji lifecycle ya approval/executor.'))} style={{display:'grid',gap:10}}><input required maxLength={180} value={runbookName} onChange={e=>setRunbookName(e.target.value)} style={field} placeholder="Runbook name"/><label>Steps JSON array<textarea rows={4} value={runbookSteps} onChange={e=>setRunbookSteps(e.target.value)} style={field}/></label><label>Rollback steps JSON array<textarea rows={3} value={rollbackSteps} onChange={e=>setRollbackSteps(e.target.value)} style={field}/></label><button disabled={busy} style={button}>Save draft runbook</button></form></section><section style={panel}><h2>Runbook library</h2>{list(runbooks,['Name','Severity','Status','CurrentVersion','Steps','RollbackSteps'])}</section></>}

    {tab==='integrations'&&<><section style={panel}><h2>Register integration provider</h2><form onSubmit={e=>void submit(e,()=>post('/operations-hub/integrations',{providerKey,displayName:providerName,config:jsonInput(providerConfig,'Provider config')},'Integration registry imehifadhiwa. Hii haisemi kuwa provider ameunganishwa au health check imefaulu.'))} style={{display:'grid',gap:10}}><input required pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{1,99}" value={providerKey} onChange={e=>setProviderKey(e.target.value)} style={field} placeholder="Provider key, e.g. router_vendor_x"/><input required maxLength={160} value={providerName} onChange={e=>setProviderName(e.target.value)} style={field} placeholder="Display name"/><label>Non-secret configuration JSON<textarea rows={3} value={providerConfig} onChange={e=>setProviderConfig(e.target.value)} style={field}/></label><button disabled={busy} style={button}>Save integration record</button></form></section><section style={panel}><h2>Integration registry</h2>{list(integrations,['ProviderKey','DisplayName','Status','LastCheckedAt','LastSuccessAt','LastErrorSummary'])}<p style={{fontSize:12,color:'#64748b'}}>Live connection tests na provider-specific actions bado hazijathibitishwa; credentials hazipaswi kuwekwa kwenye config JSON.</p></section></>}

    {tab==='changes'&&<><section style={panel}><h2>Submit change for independent review</h2><form onSubmit={e=>void submit(e,()=>post('/operations-hub/change-reviews',{changeType,targetType,targetId,title:changeTitle,proposedChange:jsonInput(proposed,'Proposed change'),rollbackPlan:jsonInput(rollbackPlan,'Rollback plan'),riskLevel:'MEDIUM',idempotencyKey:crypto.randomUUID()},'Change request imewasilishwa kwa review.'))} style={{display:'grid',gap:10}}><select value={changeType} onChange={e=>setChangeType(e.target.value)} style={field}><option>NETWORK_CONFIG</option><option>WORKFLOW</option><option>INTEGRATION</option><option>POLICY</option><option>RELEASE</option></select><input required maxLength={100} value={targetType} onChange={e=>setTargetType(e.target.value)} style={field} placeholder="Target type"/><input required maxLength={180} value={targetId} onChange={e=>setTargetId(e.target.value)} style={field} placeholder="Target ID"/><input required maxLength={180} value={changeTitle} onChange={e=>setChangeTitle(e.target.value)} style={field} placeholder="Change title"/><label>Proposed change JSON<textarea rows={3} value={proposed} onChange={e=>setProposed(e.target.value)} style={field}/></label><label>Rollback plan JSON array<textarea rows={2} value={rollbackPlan} onChange={e=>setRollbackPlan(e.target.value)} style={field}/></label><button disabled={busy} style={button}>Submit for review</button></form></section><section style={panel}><h2>Review queue</h2>{list(changes,['Title','ChangeType','TargetType','TargetId','RiskLevel','Status','RequestedBy','ReviewedBy','CreatedAt'])}<p style={{fontSize:12,color:'#64748b'}}>Review API: POST /operations-hub/change-reviews/:id/review with status APPROVED or REJECTED and optional note. Approval is not the same as applying the change or executing rollback.</p></section></>}
  </main>;
}
