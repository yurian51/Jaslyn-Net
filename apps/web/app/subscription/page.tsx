'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

type Plan = {
  id:string; code:string; name:string; description:string; price:string|number; currency:string;
  billingInterval:string; pricingMode:string; limits:Record<string,unknown>; features:Record<string,boolean>;
};
type Current = Plan & { subscriptionId:string; status:string; startsAt:string; currentPeriodEnd:string; cancelAtPeriodEnd:boolean };
type UsageItem = { used:number; limit:number|null };

const labels:Record<string,string> = {
  hotspot:'HotSpot / captive portal', pppoe:'PPPoE', radius:'RADIUS / AAA', advancedBilling:'Advanced billing',
  onlinePayments:'Online payments', customerPortal:'Customer portal', telegram:'Telegram communication',
  automation:'Automation', advancedAnalytics:'Advanced analytics', multiWan:'Multi-WAN', ipam:'IPAM',
  networkCommands:'Network command fabric', qos:'QoS / traffic shaping', loadBalancing:'Load balancing',
  incidentManagement:'Incident management', api:'API & webhooks', whiteLabel:'White-label',
  multiTenant:'Multi-tenant', dedicatedInfrastructure:'Dedicated infrastructure', ha:'High availability',
  sso:'SSO', customIntegrations:'Custom integrations', reseller:'Reseller hierarchy', agentHierarchy:'Agent hierarchy',
  developerPortal:'Developer portal'
};

function money(plan:Plan) {
  if (plan.pricingMode==='CUSTOM') return 'Custom';
  return `${plan.currency} ${Number(plan.price).toLocaleString()}`;
}
function limit(v:number|null){ return v===null?'Unlimited':v.toLocaleString(); }

export default function SubscriptionPage(){
  const [plans,setPlans]=useState<Plan[]>([]),[current,setCurrent]=useState<Current|null>(null),[usage,setUsage]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const auth=()=>{const t=getAccessToken(); return t?{Authorization:`Bearer ${t}`}:{}};
  useEffect(()=>{Promise.all([
    apiFetch<{data:Plan[]}>('/subscription/plans'),
    apiFetch<Current>('/subscription/current',{headers:auth()}),
    apiFetch<any>('/subscription/usage',{headers:auth()})
  ]).then(([p,c,u])=>{setPlans(p.data);setCurrent(c);setUsage(u)}).catch(e=>setError(e instanceof Error?e.message:'Unable to load subscription')).finally(()=>setLoading(false))},[]);
  if(loading)return <main className="subscription-page"><div className="subscription-loading">Loading plan catalogue…</div></main>;
  return <main className="subscription-page">
    <header className="subscription-hero">
      <div><span className="subscription-eyebrow">JASLYN NET / PLATFORM PLANS</span><h1>Choose the operating capacity your network needs.</h1><p>Platform plans govern workspace scale and access to advanced network, billing, automation and communication capabilities. Internet packages sold to subscribers remain separate.</p></div>
      {current&&<div className="current-plan"><small>CURRENT WORKSPACE PLAN</small><strong>{current.name}</strong><span>{current.status} · {current.pricingMode==='CUSTOM'?'Contract pricing':money(current)+' / '+current.billingInterval.toLowerCase()}</span></div>}
    </header>
    {error&&<div className="subscription-error">{error}</div>}
    <section className="plan-grid">{plans.map(plan=><article className={`plan-card ${current?.code===plan.code?'current':''}`} key={plan.code}>
      <div className="plan-top"><div><span className="plan-code">{plan.code}</span><h2>{plan.name}</h2></div>{current?.code===plan.code&&<b className="current-badge">CURRENT</b>}</div>
      <p className="plan-description">{plan.description}</p><div className="plan-price">{money(plan)}{plan.pricingMode!=='CUSTOM'&&<small> / {plan.billingInterval.toLowerCase()}</small>}</div>
      <div className="plan-capacity">
        <span><b>{limit(Number(plan.limits.subscribers ?? plan.maxCustomers ?? null))}</b> subscribers</span>
        <span><b>{limit(Number(plan.limits.routers ?? plan.maxRouters ?? null))}</b> routers</span>
        <span><b>{limit(Number(plan.limits.sites ?? plan.maxSites ?? null))}</b> sites</span>
      </div>
      <ul>{Object.entries(plan.features).filter(([,enabled])=>enabled).map(([key])=><li key={key}>✓ {labels[key]??key.replaceAll('_',' ')}</li>)}</ul>
      <button disabled={current?.code===plan.code} onClick={()=>window.location.href='/account'}>{current?.code===plan.code?'Active plan':plan.pricingMode==='CUSTOM'?'Contact billing':'Request upgrade'}</button>
    </article>)}</section>
    {usage&&<section className="usage-panel"><div><span className="subscription-eyebrow">LIVE WORKSPACE USAGE</span><h2>Capacity</h2><p>Limits are enforced at the database boundary for routers, sites, subscribers and service packages.</p></div><div className="usage-grid">{Object.entries(usage.usage as Record<string,UsageItem>).map(([key,item])=><div className="usage-item" key={key}><span>{key}</span><strong>{item.used.toLocaleString()} <small>/ {limit(item.limit)}</small></strong><div className="usage-track"><i style={{width:item.limit?Math.min(100,(item.used/item.limit)*100):0}} /></div></div>)}</div></section>}
    <style jsx>{`.subscription-page{min-height:100vh;background:#f5f7fa;color:#152033;padding:36px 42px}.subscription-hero{max-width:1500px;display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:22px}.subscription-eyebrow,.plan-code{font-size:8px;letter-spacing:.14em;font-weight:900;color:#8793a6}.subscription-hero h1{font-size:31px;line-height:1.08;max-width:760px;margin:7px 0}.subscription-hero p{max-width:820px;color:#738096;font-size:11px;line-height:1.65}.current-plan{min-width:250px;background:#111827;color:#fff;border-radius:12px;padding:18px;display:grid;gap:6px}.current-plan small{font-size:7px;letter-spacing:.12em;color:#aeb8c7}.current-plan strong{font-size:18px}.current-plan span{font-size:8px;color:#b8c2d1}.subscription-error{background:#fff0f1;color:#a33e49;padding:11px;border-radius:8px;margin-bottom:12px;font-size:9px}.plan-grid{max-width:1500px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.plan-card{background:#fff;border:1px solid #e1e6ed;border-radius:12px;padding:18px;display:flex;flex-direction:column;min-height:460px}.plan-card.current{border-color:#1e67d8;box-shadow:0 0 0 1px #1e67d8}.plan-top{display:flex;justify-content:space-between;gap:10px}.plan-card h2{font-size:18px;margin:6px 0}.current-badge{font-size:7px;background:#eaf2ff;color:#1e67d8;border-radius:5px;padding:5px 7px;height:max-content}.plan-description{font-size:9px;color:#778397;line-height:1.5;min-height:40px}.plan-price{font-size:24px;font-weight:900;margin:7px 0 14px}.plan-price small{font-size:8px;color:#8590a1;font-weight:700}.plan-capacity{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:13px}.plan-capacity span{font-size:7px;color:#8792a3;background:#f6f8fb;padding:8px;border-radius:7px}.plan-capacity b{display:block;color:#1a2537;font-size:11px;margin-bottom:2px}.plan-card ul{list-style:none;padding:0;margin:0 0 15px;display:grid;gap:7px;flex:1}.plan-card li{font-size:8px;color:#566276}.plan-card button{height:38px;border:1px solid #dce2ea;background:#fff;border-radius:7px;font-size:9px;font-weight:800;color:#1c2a3e}.plan-card.current button{background:#1e67d8;color:#fff;border-color:#1e67d8}.usage-panel{max-width:1500px;background:#fff;border:1px solid #e1e6ed;border-radius:12px;margin-top:14px;padding:20px;display:grid;grid-template-columns:280px 1fr;gap:25px}.usage-panel h2{font-size:17px;margin:5px 0}.usage-panel p{font-size:9px;color:#7b8798;line-height:1.5}.usage-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.usage-item{border:1px solid #e6eaf0;border-radius:9px;padding:12px}.usage-item>span{display:block;text-transform:capitalize;font-size:8px;color:#7d899a;margin-bottom:6px}.usage-item strong{font-size:15px}.usage-item strong small{font-size:8px;color:#8994a5}.usage-track{height:4px;background:#edf1f5;border-radius:9px;margin-top:9px;overflow:hidden}.usage-track i{display:block;height:100%;background:#2563eb;border-radius:9px}.subscription-loading{padding:80px;text-align:center;color:#7d899a;font-size:10px}@media(max-width:1100px){.plan-grid{grid-template-columns:repeat(2,1fr)}.subscription-hero{align-items:stretch;flex-direction:column}.usage-panel{grid-template-columns:1fr}}@media(max-width:650px){.subscription-page{padding:20px 13px}.plan-grid{grid-template-columns:1fr}.plan-capacity{grid-template-columns:1fr 1fr 1fr}.usage-grid{grid-template-columns:1fr 1fr}}`}</style>
  </main>;
}
