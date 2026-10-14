'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import './network-intelligence.css';

type NodeItem={id:string;name:string;type:string;status?:string;vendor?:string;assetType?:string;latitude?:number|null;longitude?:number|null;routerId?:string|null;parentAssetId?:string|null};
type EdgeItem={id:string;sourceType:string;sourceId:string;targetType:string;targetId:string;linkType:string;status:string;capacityBps?:number|null};
type Topology={nodes:NodeItem[];edges:EdgeItem[];generatedAt:string;limitations?:string[]};
type CapacityItem={resourceType:string;resourceId:string;metricType:string;peakValue:string|number;averageValue:string|number;latestValue?:string|number;lastSampleAt?:string;assessment:string};
type Capacity={data:CapacityItem[];windowDays:number;confidence:string;note:string;thresholds:{watchPct:number;upgradeRecommendedPct:number}};

export default function NetworkIntelligencePage(){
 const [topology,setTopology]=useState<Topology|null>(null),[capacity,setCapacity]=useState<Capacity|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const load=useCallback(async()=>{
  const token=getAccessToken();if(!token){setError('Ingia kwanza ili kuona network intelligence ya tenant yako.');setLoading(false);return;}
  setLoading(true);setError('');
  try{
   const headers={Authorization:'Bearer '+token};
   const [t,c]=await Promise.all([
    apiFetch<Topology>('/network-intelligence/topology',{headers}),
    apiFetch<Capacity>('/network-intelligence/capacity',{headers}),
   ]);
   setTopology(t);setCapacity(c);
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kupakia network intelligence.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const fmt=(v:string|number|undefined)=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:2});
 return <main className="ni-page">
  <header className="ni-header"><div><p className="ni-eyebrow">JASLYN NET / NETWORK OPERATIONS</p><h1>Network topology & capacity</h1><p>Ramani ya utegemezi wa vifaa vilivyoingizwa, links zilizorekodiwa na viashiria vya matumizi vinavyotokana na telemetry.</p></div><nav><Link href="/network">Device inventory</Link><Link href="/fiber-ops">Fiber assets</Link><button onClick={()=>void load()} disabled={loading}>{loading?'Inapakia…':'Refresh data'}</button></nav></header>
  {error&&<div className="ni-error" role="alert">{error}</div>}
  <section className="ni-metrics"><article><span>Topology nodes</span><strong>{topology?.nodes.length??'—'}</strong></article><article><span>Recorded links</span><strong>{topology?.edges.length??'—'}</strong></article><article><span>Capacity signals</span><strong>{capacity?.data.length??'—'}</strong></article><article><span>Telemetry status</span><strong>{capacity?.confidence==='TELEMETRY_BACKED'?'Available':capacity?.confidence==='NO_TELEMETRY'?'No data':'—'}</strong></article></section>
  <section className="ni-panel"><div className="ni-panel-title"><div><h2>Topology inventory</h2><p>Routers, fiber assets and explicitly recorded dependency edges.</p></div><span>{topology?.generatedAt?new Date(topology.generatedAt).toLocaleString():'—'}</span></div>
   {loading&&!topology?<p>Inapakia topology…</p>:!topology?.nodes.length?<p className="ni-empty">Hakuna topology nodes zilizopatikana.</p>:<div className="ni-topology">
    <div className="ni-node-list">{topology.nodes.map(n=><article key={n.type+':'+n.id} className="ni-node"><div className="ni-node-icon">{n.type==='ROUTER'?'RTR':(n.assetType??n.type).slice(0,4)}</div><div className="ni-node-info"><strong>{n.name}</strong><span>{n.vendor??n.assetType??n.type} · {n.status??'UNKNOWN'}</span>{n.latitude!=null&&n.longitude!=null&&<small>{n.latitude}, {n.longitude}</small>}</div><code>{n.id.slice(0,8)}</code></article>)}</div>
    <div className="ni-edge-list"><h3>Dependencies / links</h3>{topology.edges.length?topology.edges.map(e=><article key={e.id}><span className={'ni-dot ni-dot-'+e.status.toLowerCase()}></span><div><strong>{e.sourceType} → {e.targetType}</strong><p>{e.linkType} · {e.status}</p><small>{e.sourceId.slice(0,8)} → {e.targetId.slice(0,8)}</small></div><span>{e.capacityBps?fmt(Number(e.capacityBps)/1e6)+' Mbps':'Capacity unknown'}</span></article>):<p className="ni-empty">Hakuna edges zilizoingizwa bado. Mfumo hautabuni links ambazo hazijathibitishwa.</p>}</div>
    </div>}
   {topology?.limitations?.map(x=><p className="ni-note" key={x}>{x}</p>)}
  </section>
  <section className="ni-panel"><div className="ni-panel-title"><div><h2>Capacity signals</h2><p>Peak and average samples over the last {capacity?.windowDays??30} days.</p></div><span>Watch ≥ {capacity?.thresholds.watchPct??75}% · Upgrade review ≥ {capacity?.thresholds.upgradeRecommendedPct??90}%</span></div>
   {!capacity?.data.length?<p className="ni-empty">Hakuna telemetry ya kutosha. Ingiza samples halisi za RX/TX/utilization ili kuona peak na wastani.</p>:<div className="ni-table-wrap"><table><thead><tr><th>Resource</th><th>Metric</th><th>Latest</th><th>Average</th><th>Peak</th><th>Assessment</th></tr></thead><tbody>{capacity.data.map((r,i)=><tr key={r.resourceType+r.resourceId+r.metricType+i}><td><strong>{r.resourceType}</strong><small>{r.resourceId.slice(0,8)}</small></td><td>{r.metricType}</td><td>{fmt(r.latestValue)}</td><td>{fmt(r.averageValue)}</td><td>{fmt(r.peakValue)}</td><td><span className={'ni-assessment ni-assessment-'+r.assessment.toLowerCase()}>{r.assessment.replaceAll('_',' ')}</span></td></tr>)}</tbody></table></div>}
   <p className="ni-note">{capacity?.note??'Capacity results require telemetry.'}</p>
  </section>
 </main>;
}
