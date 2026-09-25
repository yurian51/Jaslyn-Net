'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiFetch, API_URL } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';

type Conversation = { id:string; kind:string; title?:string|null; description?:string|null; lastMessageBody?:string|null; lastMessageAt?:string|null; unreadCount:number };
type Message = { id:string; conversationId:string; body?:string|null; senderName?:string|null; senderCustomerName?:string|null; senderUserId?:string|null; createdAt:string; replyToMessageId?:string|null; reactions?:Array<{reaction:string;count:number}>; deletedAt?:string|null };
type SearchResult = { type:string; id:string; fullName?:string; email?:string; username?:string; body?:string; conversationId?:string; conversationTitle?:string; senderName?:string };

function time(value?:string|null){ if(!value) return ''; const d=new Date(value); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }

export default function CommunicationPage(){
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [results,setResults]=useState<SearchResult[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [presence,setPresence]=useState('ONLINE');
  const readerAbort=useRef<AbortController|null>(null);

  const token=()=>getAccessToken();
  const currentUserId=useMemo(()=>{const t=token();if(!t)return null;try{return JSON.parse(atob(t.split('.')[1])).sub as string;}catch{return null;}},[]);

  const loadConversations=useCallback(async()=>{
    const t=token(); if(!t){setError('Authentication required.');setLoading(false);return;}
    try{const r=await apiFetch<{data:Conversation[]}>('/communication/conversations',{headers:{Authorization:`Bearer ${t}`}});setConversations(r.data||[]);if(!selected&&r.data?.[0])setSelected(r.data[0].id);}
    catch(e){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load conversations.')}
    finally{setLoading(false);}
  },[selected]);

  const loadMessages=useCallback(async(id:string)=>{
    const t=token();if(!t)return;
    try{const r=await apiFetch<{data:Message[]}>(`/communication/conversations/${id}/messages?limit=100`,{headers:{Authorization:`Bearer ${t}`}});setMessages(r.data||[]);if(r.data?.length){void apiFetch(`/communication/conversations/${id}/read`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({messageId:r.data[r.data.length-1].id})});}}
    catch(e){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load messages.');}
  },[]);

  useEffect(()=>{void loadConversations();},[loadConversations]);
  useEffect(()=>{if(selected)void loadMessages(selected);},[selected,loadMessages]);

  useEffect(()=>{
    const t=token(); if(!t||!API_URL)return;
    const controller=new AbortController(); readerAbort.current=controller;
    fetch(`${API_URL}/communication/events`,{headers:{Authorization:`Bearer ${t}`},signal:controller.signal}).then(async response=>{
      if(!response.ok||!response.body)return;
      const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer='';
      while(true){
        const chunk=await reader.read(); if(chunk.done)break; buffer+=decoder.decode(chunk.value,{stream:true});
        const blocks=buffer.split('\n\n'); buffer=blocks.pop()||'';
        for(const block of blocks){
          const line=block.split('\n').find(x=>x.startsWith('data: ')); if(!line)continue;
          try{const event=JSON.parse(line.slice(6));
            if(event.type==='message.created'&&event.conversationId===selected){setMessages(prev=>prev.some(m=>m.id===event.messageId)?prev:[...prev,event.data]);}
            if(event.type==='message.created')void loadConversations();
          }catch{}
        }
      }
    }).catch(()=>undefined);
    return()=>{controller.abort();readerAbort.current=null;};
  },[selected,loadConversations]);

  async function send(){
    const t=token();if(!t||!selected||!draft.trim()||sending)return;
    setSending(true);setError(null);const body=draft.trim();setDraft('');
    try{const message=await apiFetch<Message>(`/communication/conversations/${selected}/messages`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({body})});setMessages(prev=>prev.some(m=>m.id===message.id)?prev:[...prev,message]);void loadConversations();}
    catch(e){setDraft(body);setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to send message.')}
    finally{setSending(false);}
  }

  async function runSearch(value:string){
    setSearch(value);const t=token();if(!t||value.trim().length<2){setResults([]);return;}
    try{const r=await apiFetch<{data:SearchResult[]}>(`/communication/search?q=${encodeURIComponent(value)}&limit=30`,{headers:{Authorization:`Bearer ${t}`}});setResults(r.data||[]);}catch{}
  }

  async function updatePresence(value:string){
    const t=token();if(!t)return;setPresence(value);
    await apiFetch('/communication/presence',{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({status:value})}).catch(()=>undefined);
  }

  const active=useMemo(()=>conversations.find(c=>c.id===selected),[conversations,selected]);

  return <main className="communication">
    <style jsx>{`
      .communication{height:calc(100vh - 24px);min-height:680px;display:grid;grid-template-columns:280px 330px minmax(0,1fr);background:#f6f7f9;color:#18202b;border:1px solid #dfe3e8;border-radius:14px;overflow:hidden;margin:12px}
      .rail,.list,.chat{min-width:0}.rail{background:#111827;color:#eef2f7;padding:22px 16px;display:flex;flex-direction:column;gap:18px}.brand{font-size:18px;font-weight:800;letter-spacing:.08em}.muted{color:#9ca8b7;font-size:12px;line-height:1.5}.nav{display:grid;gap:5px}.nav div{padding:10px 12px;border-radius:8px;font-size:13px}.nav .active{background:#263142;color:#fff}.railBottom{margin-top:auto}.presence{display:flex;gap:8px;align-items:center}.dot{width:8px;height:8px;border-radius:50%;background:#28a36a}.list{background:#fff;border-right:1px solid #e1e5ea;display:flex;flex-direction:column}.listHead,.chatHead{padding:18px;border-bottom:1px solid #e1e5ea}.listHead h1,.chatHead h2{font-size:18px;margin:0}.sub{font-size:12px;color:#7a8795;margin-top:5px}.search{margin-top:14px;width:100%;padding:10px 11px;border:1px solid #d7dce2;border-radius:8px;background:#fafbfc;outline:none}.rows{overflow:auto}.row{padding:13px 15px;border-bottom:1px solid #f0f2f4;cursor:pointer}.row:hover,.row.selected{background:#f2f5f8}.rowTitle{display:flex;justify-content:space-between;gap:10px;font-weight:700;font-size:13px}.rowPreview{color:#778291;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}.badge{font-size:10px;background:#1f6feb;color:#fff;border-radius:10px;padding:2px 6px}.chat{display:flex;flex-direction:column;background:#fff}.chatHead{display:flex;justify-content:space-between;align-items:center}.messages{flex:1;overflow:auto;padding:24px;display:flex;flex-direction:column;gap:9px;background:#fbfcfd}.message{max-width:min(72%,720px);align-self:flex-start;background:#f0f2f5;border:1px solid #e1e5e9;border-radius:10px;padding:9px 11px}.message.mine{align-self:flex-end;background:#e8f1ff;border-color:#c8dcfa}.sender{font-size:11px;font-weight:700;color:#5e6a78;margin-bottom:4px}.body{font-size:14px;white-space:pre-wrap;word-break:break-word}.time{font-size:10px;color:#8993a0;text-align:right;margin-top:5px}.composer{border-top:1px solid #e1e5ea;padding:12px;display:flex;gap:9px}.composer textarea{flex:1;resize:none;min-height:42px;max-height:120px;border:1px solid #d7dce2;border-radius:9px;padding:11px;font:inherit;outline:none}.send{border:0;border-radius:9px;padding:0 18px;background:#1f6feb;color:#fff;font-weight:700}.send:disabled{opacity:.5}.error{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:20;background:#fff1f0;color:#9f2f2f;border:1px solid #f1c2be;padding:10px 14px;border-radius:8px;font-size:12px}.searchResults{position:absolute;left:0;right:0;top:48px;background:#fff;border:1px solid #dfe3e8;border-radius:8px;z-index:10;box-shadow:0 8px 24px #00000012}.searchWrap{position:relative}.result{padding:9px 11px;border-bottom:1px solid #f0f2f4;font-size:12px}.empty{margin:auto;color:#7d8896;font-size:13px;text-align:center}.statusSelect{background:transparent;color:#d7dee8;border:1px solid #374151;border-radius:7px;padding:6px;font-size:12px}
      @media(max-width:900px){.communication{grid-template-columns:230px minmax(0,1fr)}.rail{display:none}.list{border-right:1px solid #e1e5ea}.message{max-width:84%}}
      @media(max-width:650px){.communication{margin:0;border-radius:0;height:100vh;min-height:0;grid-template-columns:1fr}.list{display:${selected?'none':'flex'}}.chat{display:${selected?'flex':'none'}}.chatHead{position:sticky;top:0}.message{max-width:90%}}
    `}</style>
    {error&&<div className="error" role="alert">{error}</div>}
    <aside className="rail"><div className="brand">JASLYN NET</div><div className="muted">Communication Center</div><div className="nav"><div className="active">Chats</div><div>Channels</div><div>NOC</div><div>Support</div><div>Saved</div><div>Notifications</div></div><div className="railBottom"><div className="muted">Presence</div><div className="presence"><span className="dot"/><select className="statusSelect" value={presence} onChange={e=>void updatePresence(e.target.value)}><option>ONLINE</option><option>AWAY</option><option>BUSY</option><option>INVISIBLE</option><option>OFFLINE</option></select></div></div></aside>
    <section className="list"><div className="listHead"><h1>Chats</h1><div className="sub">{loading?'Loading live conversations…':`${conversations.length} conversation${conversations.length===1?'':'s'}`}</div><div className="searchWrap"><input className="search" value={search} onChange={e=>void runSearch(e.target.value)} placeholder="Search messages, users, subscribers…" />{results.length>0&&<div className="searchResults">{results.slice(0,8).map((r,i)=><div className="result" key={r.id+`-${i}`}><strong>{r.type}</strong> · {r.fullName||r.senderName||r.conversationTitle||r.body}</div>)}</div>}</div></div><div className="rows">{conversations.map(c=><div key={c.id} className={`row ${selected===c.id?'selected':''}`} onClick={()=>{setSelected(c.id);setSearch('');setResults([])}}><div className="rowTitle"><span>{c.title||'Untitled conversation'}</span>{c.unreadCount>0&&<span className="badge">{c.unreadCount}</span>}</div><div className="rowPreview">{c.lastMessageBody||'No messages yet'}</div></div>)}{!loading&&!conversations.length&&<div className="empty" style={{padding:24}}>No conversations yet.<br/>The system is correctly showing no fake chats.</div>}</div></section>
    <section className="chat"><div className="chatHead"><div><h2>{active?.title||'Select a conversation'}</h2><div className="sub">{active?.kind||'Communication Center'}</div></div><button className="statusSelect" onClick={()=>selected&&void loadMessages(selected)}>Refresh</button></div><div className="messages">{selected&&messages.length?messages.map(m=><article key={m.id} className={`message ${m.senderUserId===currentUserId?'mine':''}`}><div className="sender">{m.senderName||m.senderCustomerName||'System'}</div><div className="body">{m.deletedAt?'Message deleted':m.body}</div>{m.reactions?.length? <div className="sub">{m.reactions.map(r=>`${r.reaction} ${r.count}`).join('  ')}</div>:null}<div className="time">{time(m.createdAt)}</div></article>):<div className="empty">{selected?'No messages in this conversation.':'Choose a conversation from the left.'}</div>}</div>{selected&&<div className="composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder="Write a message…" /><button className="send" disabled={sending||!draft.trim()} onClick={()=>void send()}>{sending?'Sending…':'Send'}</button></div>}</section>
  </main>;
}
