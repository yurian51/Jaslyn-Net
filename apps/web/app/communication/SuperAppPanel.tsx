'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Story={id:string;authorName:string;kind:string;body?:string|null;expiresAt:string;viewed:boolean};
type Identity={username:string;phoneVisibility:'EVERYONE'|'CONTACTS'|'NOBODY';discoverableByUsername:boolean;discoverableByPhone:boolean};
type MiniApp={id:string;name:string;slug:string;description?:string|null;installed:boolean};
type Props={onOpenConversation?:(id:string)=>void};

export default function SuperAppPanel(_:Props){
  const [identity,setIdentity]=useState<Identity|null>(null);
  const [username,setUsername]=useState('');
  const [stories,setStories]=useState<Story[]>([]);
  const [apps,setApps]=useState<MiniApp[]>([]);
  const [saving,setSaving]=useState(false);
  const [story,setStory]=useState('');
  const [status,setStatus]=useState('');
  const token=()=>getAccessToken();
  const headers=()=>({Authorization:`Bearer ${token()}`,'Content-Type':'application/json'});

  async function load(){
    const h=headers();
    const [i,s,a]=await Promise.all([
      apiFetch<Identity|null>('/communication/identity',{headers:h}).catch(()=>null),
      apiFetch<{data:Story[]}>('/communication/stories',{headers:h}).catch(()=>({data:[]})),
      apiFetch<{data:MiniApp[]}>('/communication/mini-apps',{headers:h}).catch(()=>({data:[]})),
    ]);
    setIdentity(i);setUsername(i?.username||'');setStories(s.data||[]);setApps(a.data||[]);
  }
  useEffect(()=>{void load()},[]);

  async function saveIdentity(){
    if(!username.trim())return;setSaving(true);setStatus('');
    try{
      const value=await apiFetch<Identity>('/communication/identity',{method:'PUT',headers:headers(),body:JSON.stringify({username,phoneVisibility:identity?.phoneVisibility||'CONTACTS',discoverableByUsername:true,discoverableByPhone:identity?.discoverableByPhone!==false})});
      setIdentity(value);setStatus('Identity updated.');
    }catch(e){setStatus(e instanceof Error?e.message:'Unable to update identity.')}
    finally{setSaving(false)}
  }

  async function publishStory(){
    if(!story.trim())return;setSaving(true);
    try{await apiFetch('/communication/stories',{method:'POST',headers:headers(),body:JSON.stringify({kind:'TEXT',body:story,audience:'CONTACTS'})});setStory('');setStatus('Story published for 24 hours.');await load();}
    catch(e){setStatus(e instanceof Error?e.message:'Unable to publish story.')}
    finally{setSaving(false)}
  }

  async function install(app:MiniApp){
    try{await apiFetch('/communication/mini-apps/'+app.id+'/install',{method:'POST',headers:headers()});setStatus(`${app.name} installed.`);await load();}
    catch(e){setStatus(e instanceof Error?e.message:'Unable to install mini app.')}
  }

  return <section className="superPanel">
    <div className="superHeader"><div><span className="eyebrow">JASLYN SUPERAPP</span><h2>Communication + Services</h2><p>Identity, ephemeral updates and embedded services in one operational surface.</p></div><span className="live">LIVE</span></div>
    <div className="superGrid">
      <article className="superCard"><div className="cardTitle">Identity</div><div className="handle"><span>@</span><input value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} placeholder="your-handle"/></div><div className="privacy"><select value={identity?.phoneVisibility||'CONTACTS'} onChange={e=>setIdentity(v=>v?{...v,phoneVisibility:e.target.value as Identity['phoneVisibility']}:v)}><option>EVERYONE</option><option>CONTACTS</option><option>NOBODY</option></select><span>phone visibility</span></div><button onClick={()=>void saveIdentity()} disabled={saving}>Save identity</button>{status&&<small>{status}</small>}</article>
      <article className="superCard storyCard"><div className="cardTitle">Story</div><textarea value={story} onChange={e=>setStory(e.target.value)} maxLength={1000} placeholder="Share an operational update…"/><div className="storyFoot"><span>{story.length}/1000 · expires in 24h</span><button onClick={()=>void publishStory()} disabled={saving||!story.trim()}>Publish</button></div></article>
    </div>
    <div className="superSection"><div className="sectionTitle">Active stories <span>{stories.length}</span></div><div className="storyStrip">{stories.slice(0,8).map(s=><div className={`storyChip ${s.viewed?'seen':''}`} key={s.id}><strong>{s.authorName}</strong><span>{s.body||s.kind}</span></div>)}{!stories.length&&<span className="emptySuper">No active stories. Humanity survives another hour without status updates.</span>}</div></div>
    <div className="superSection"><div className="sectionTitle">Mini apps <span>{apps.length}</span></div><div className="appStrip">{apps.slice(0,8).map(a=><div className="miniApp" key={a.id}><div><strong>{a.name}</strong><span>{a.description||a.slug}</span></div>{a.installed?<em>Installed</em>:<button onClick={()=>void install(a)}>Install</button>}</div>)}{!apps.length&&<span className="emptySuper">No enabled mini apps registered for this workspace.</span>}</div></div>
    <style jsx>{`
      .superPanel{height:100%;overflow:auto;background:#f7f8fa;padding:24px;color:#18202b}.superHeader{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.eyebrow{font-size:10px;letter-spacing:.16em;font-weight:800;color:#64748b}.superHeader h2{margin:5px 0 4px;font-size:25px;letter-spacing:-.03em}.superHeader p{margin:0;color:#748091;font-size:13px}.live{font-size:10px;font-weight:800;letter-spacing:.12em;border:1px solid #b8dec9;background:#edf9f2;color:#187044;border-radius:999px;padding:6px 9px}.superGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.superCard,.superSection{background:#fff;border:1px solid #e1e6eb;border-radius:14px;padding:16px;box-shadow:0 2px 8px #0b12200a}.cardTitle,.sectionTitle{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.handle{display:flex;align-items:center;margin-top:14px;border:1px solid #d9dfe6;border-radius:9px;overflow:hidden}.handle span{padding-left:11px;color:#7b8794}.handle input{border:0;outline:0;padding:10px;width:100%;font:inherit}.privacy{display:flex;gap:8px;align-items:center;margin:10px 0;color:#7b8794;font-size:11px}.privacy select{border:1px solid #d9dfe6;border-radius:7px;padding:7px;background:#fff}.superCard button,.miniApp button{border:1px solid #cbd5e1;background:#172033;color:#fff;border-radius:8px;padding:8px 11px;font-weight:700;font-size:11px}.superCard small{display:block;margin-top:8px;color:#607080}.storyCard textarea{width:100%;height:76px;resize:none;border:1px solid #d9dfe6;border-radius:9px;margin-top:12px;padding:10px;font:inherit;outline:none}.storyFoot{display:flex;justify-content:space-between;align-items:center;margin-top:8px;color:#7b8794;font-size:10px}.storyStrip,.appStrip{display:flex;gap:9px;overflow:auto;margin-top:11px}.superSection{margin-top:14px}.sectionTitle span{font-size:10px;color:#7b8794;margin-left:4px}.storyChip{min-width:150px;border:1px solid #dbe2e8;border-radius:10px;padding:10px;background:#fbfcfd}.storyChip.seen{opacity:.58}.storyChip strong,.storyChip span{display:block}.storyChip strong{font-size:12px}.storyChip span{font-size:11px;color:#6f7b89;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.miniApp{min-width:190px;border:1px solid #dbe2e8;border-radius:10px;padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center}.miniApp strong,.miniApp span{display:block}.miniApp strong{font-size:12px}.miniApp span{font-size:10px;color:#788493;margin-top:3px}.miniApp em{font-style:normal;font-size:9px;color:#187044}.emptySuper{font-size:11px;color:#8a95a1}@media(max-width:760px){.superGrid{grid-template-columns:1fr}.superPanel{padding:16px}}
    `}</style>
  </section>;
}
