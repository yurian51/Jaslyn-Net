'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Incident = {
  id: string;
  category: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  summary?: string;
  rootResourceType?: string;
  rootResourceId?: string;
  startedAt: string;
  lastSeenAt: string;
  affectedResources: number;
  affectedCustomers: number;
  affectedSessions: number;
  estimatedRevenue: string | number;
};

type IncidentResponse = { data: Incident[]; count: number };

const fmt = (value: string) => new Date(value).toLocaleString();
const money = (value: string | number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function IncidentsPage() {
  const [data, setData] = useState<IncidentResponse | null>(null);
  const [status, setStatus] = useState<'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    if (!token) { setError('Authentication required. Sign in before opening the incident center.'); return; }
    try {
      setError(null);
      const query = status ? `?status=${status}` : '';
      setData(await apiFetch<IncidentResponse>(`/incidents${query}`, { headers: { Authorization: `Bearer ${token}` } }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Unable to load incidents.'); }
  }

  useEffect(() => { void load(); }, [status]);

  async function action(id: string, kind: 'acknowledge' | 'resolve') {
    const token = getAccessToken();
    if (!token) return;
    setBusy(id);
    try {
      await apiFetch(`/incidents/${id}/${kind}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(kind === 'resolve' ? { body: JSON.stringify({ resolution: 'Resolved by operator from Incident Center' }) } : {}),
      });
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Incident action failed.'); }
    finally { setBusy(null); }
  }

  return <main style={{minHeight:'100vh',background:'#f4f7fb',color:'#152238',fontFamily:'Inter,system-ui,sans-serif',padding:'28px'}}>
    <div style={{maxWidth:1400,margin:'0 auto'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,marginBottom:22}}>
        <div><div style={{fontSize:10,letterSpacing:'.18em',fontWeight:900,color:'#71829a'}}>JASLYN NET / OPERATIONS</div><h1 style={{fontSize:30,margin:'7px 0 4px'}}>Incident Center</h1><p style={{fontSize:12,color:'#7d8ca0',margin:0}}>Technical failures connected to the infrastructure, sessions, subscribers and measurable service impact they affect.</p></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}><select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)} style={{padding:'10px 12px',border:'1px solid #dce4ed',borderRadius:9,background:'#fff'}}><option value="">Active + resolved</option><option value="OPEN">Open</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option></select><button onClick={()=>void load()} style={{padding:'10px 12px',border:'1px solid #13233a',borderRadius:9,background:'#13233a',color:'#fff',fontWeight:800}}>Refresh</button></div>
      </header>
      {error && <div style={{padding:12,border:'1px solid #efd8d1',background:'#fff8f5',borderRadius:10,color:'#8a513c',fontSize:11,marginBottom:12}}>{error}</div>}
      <section style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:14}}>
        {[['Open',data?.data.filter(i=>i.status==='OPEN').length??0],['Acknowledged',data?.data.filter(i=>i.status==='ACKNOWLEDGED').length??0],['Affected customers',data?.data.reduce((s,i)=>s+i.affectedCustomers,0)??0]].map(([label,value])=><div key={label as string} style={{background:'#fff',border:'1px solid #e3e9f0',borderRadius:12,padding:15}}><span style={{fontSize:9,color:'#8492a4',letterSpacing:'.12em',fontWeight:800}}>{label}</span><strong style={{display:'block',fontSize:24,marginTop:8}}>{value}</strong></div>)}
      </section>
      <section style={{background:'#fff',border:'1px solid #e3e9f0',borderRadius:14,overflow:'hidden'}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid #e9edf2',fontSize:11,color:'#6d7d92'}}>{data?.count ?? 0} incident records</div>
        {!data?.data.length ? <div style={{padding:60,textAlign:'center',color:'#8290a2'}}><strong style={{display:'block',color:'#53657b'}}>No incident records</strong><span style={{fontSize:11}}>The system has no stored incidents for this filter. That is an empty data state, not synthetic network health.</span></div> : <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:1000}}><thead><tr>{['Severity','Incident','Root resource','Affected','Revenue exposure','Started','Actions'].map(h=><th key={h} style={{textAlign:'left',fontSize:9,color:'#8593a5',padding:'11px 12px',borderBottom:'1px solid #edf0f4',letterSpacing:'.08em'}}>{h}</th>)}</tr></thead><tbody>{data.data.map(i=><tr key={i.id}><td style={{padding:'12px',fontSize:9,fontWeight:900,color:i.severity==='CRITICAL'?'#c54e60':i.severity==='WARNING'?'#aa7b23':'#5478a3'}}>{i.severity}</td><td style={{padding:'12px',fontSize:10}}><strong style={{display:'block'}}>{i.title}</strong><span style={{fontSize:9,color:'#8795a6'}}>{i.category} · {i.status}</span></td><td style={{padding:'12px',fontSize:9,color:'#6f8095'}}>{i.rootResourceType || '—'}<br/>{i.rootResourceId || '—'}</td><td style={{padding:'12px',fontSize:9}}>{i.affectedCustomers} customers<br/>{i.affectedSessions} sessions</td><td style={{padding:'12px',fontSize:9}}>TSh {money(i.estimatedRevenue)}</td><td style={{padding:'12px',fontSize:9,color:'#718196'}}>{fmt(i.startedAt)}</td><td style={{padding:'12px'}}><div style={{display:'flex',gap:6}}>{i.status==='OPEN'&&<button disabled={busy===i.id} onClick={()=>void action(i.id,'acknowledge')} style={{fontSize:8,padding:'7px 8px',border:'1px solid #dce4ed',borderRadius:7,background:'#fff'}}>Acknowledge</button>}{i.status!=='RESOLVED'&&<button disabled={busy===i.id} onClick={()=>void action(i.id,'resolve')} style={{fontSize:8,padding:'7px 8px',border:'1px solid #193552',borderRadius:7,background:'#13283d',color:'#fff'}}>Resolve</button>}</div></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}
