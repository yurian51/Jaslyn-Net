'use client';

import { useCallback,useEffect,useState } from 'react';
import Link from 'next/link';
import { apiFetch,ApiError } from '../../../lib/api';
import { getAccessToken } from '../../../lib/auth';
import './admin.css';

type Customer={id:string;fullName:string;username:string;phone?:string|null;email?:string|null;isActive?:boolean};
type Invite={customer:{id:string;fullName:string;username:string;tenantSlug:string};invitationToken:string;expiresAt:string;delivery:string};
export default function CustomerPortalAdminPage(){
 const [customers,setCustomers]=useState<Customer[]>([]),[customerId,setCustomerId]=useState(''),[invite,setInvite]=useState<Invite|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{const token=getAccessToken();if(!token){setError('Admin login inahitajika.');setLoading(false);return;}setLoading(true);setError('');
  try{const r=await apiFetch<{data:Customer[]}>('/customers?limit=100',{headers:{Authorization:'Bearer '+token}});setCustomers(r.data.filter(c=>c.isActive!==false));if(!customerId&&r.data[0])setCustomerId(r.data[0].id);}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kupakia wateja.');}finally{setLoading(false);}
 },[customerId]);
 useEffect(()=>{void load();},[load]);
 async function issue(){const token=getAccessToken();if(!token||!customerId)return;setBusy(true);setError('');setNotice('');setInvite(null);
  try{const r=await apiFetch<Invite>('/customer-portal/customers/'+customerId+'/invitations',{method:'POST',headers:{Authorization:'Bearer '+token}});setInvite(r);setNotice('Invitation imetengenezwa. '+r.delivery);}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:'Imeshindikana kutengeneza invitation.');}finally{setBusy(false);}
 }
 async function copy(){if(!invite)return;try{await navigator.clipboard.writeText(invite.invitationToken);setNotice('Invitation token imenakiliwa.');}catch{setNotice('Copy haikuruhusiwa na browser; chagua token kisha unakili manually.');}}
 return <main className="cpa-page"><header><div><p className="cpa-eyebrow">JASLYN NET / CUSTOMER OPERATIONS</p><h1>Customer portal access</h1><p>Tengeneza one-time activation token kwa mteja. Token inaisha baada ya saa 24 na inaonyeshwa mara moja tu.</p></div><Link href="/customer-portal">Fungua customer portal ↗</Link></header>
 {error&&<div className="cpa-alert" role="alert">{error}</div>}{notice&&<div className="cpa-notice" role="status">{notice}</div>}
 <section className="cpa-panel"><h2>Washa self-service access</h2><label>Chagua mteja<select value={customerId} onChange={e=>{setCustomerId(e.target.value);setInvite(null);}} disabled={loading}><option value="">Chagua customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName} · {c.username}{c.phone?' · '+c.phone:''}</option>)}</select></label><button disabled={busy||loading||!customerId} onClick={()=>void issue()}>{busy?'Inatengeneza…':'Tengeneza invitation token'}</button>
 {invite&&<div className="cpa-token"><h3>{invite.customer.fullName}</h3><p>Tenant slug: <strong>{invite.customer.tenantSlug}</strong></p><p>Username: <strong>{invite.customer.username}</strong></p><label>One-time invitation token<textarea value={invite.invitationToken} readOnly rows={3} onFocus={e=>e.currentTarget.select()}/></label><button type="button" className="cpa-secondary" onClick={()=>void copy()}>Nakili token</button><p>Inaisha: {new Date(invite.expiresAt).toLocaleString()}</p><small>{invite.delivery}</small></div>}
 {!loading&&customers.length===0&&<p>Hakuna wateja hai. Ongeza mteja kwanza kwenye Customers.</p>}
 </section><footer className="cpa-foot"><strong>Usalama:</strong> Token haipaswi kuwekwa kwenye notes za umma au kutumwa kwenye channel isiyo salama. Database huhifadhi hash pekee; token ikitumika, ita-expire, au invitation mpya ikitengenezwa, haitatumika tena.</footer></main>;
}
