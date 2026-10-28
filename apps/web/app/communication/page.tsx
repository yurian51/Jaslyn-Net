'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, apiFetch, API_URL } from '../../lib/api';
import { getAccessToken } from '../../lib/auth';
import SuperAppPanel from './SuperAppPanel';

type Conversation = { id:string; kind:string; title?:string|null; description?:string|null; lastMessageBody?:string|null; lastMessageAt?:string|null; unreadCount:number };
type Message = { id:string; conversationId:string; body?:string|null; senderName?:string|null; senderCustomerName?:string|null; senderUserId?:string|null; createdAt:string; replyToMessageId?:string|null; reactions?:Array<{reaction:string;count:number}>; deletedAt?:string|null };
type SearchResult = { type:string; id:string; fullName?:string; email?:string; username?:string; body?:string; conversationId?:string; conversationTitle?:string; senderName?:string };
type Topic = { id:string; name:string; description?:string|null; archivedAt?:string|null; messageCount:number };

function time(value?:string|null){ if(!value) return ''; const d=new Date(value); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }

export default function CommunicationPage(){
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [topics,setTopics]=useState<Topic[]>([]);
  const [draft,setDraft]=useState('');
  const [search,setSearch]=useState('');
  const [results,setResults]=useState<SearchResult[]>([]);
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [presence,setPresence]=useState('ONLINE');
  const [command,setCommand]=useState('');
  const [commandResult,setCommandResult]=useState<string>('');
  const [commandBusy,setCommandBusy]=useState(false);
  const [commandPreview,setCommandPreview]=useState<any>(null);
  const [typingUsers,setTypingUsers]=useState<string[]>([]);
  const [replyTo,setReplyTo]=useState<Message|null>(null);
  const [notificationCount,setNotificationCount]=useState(0);
  const [view,setView]=useState<'chats'|'channels'|'saved'|'notifications'|'command'|'superapp'>('chats');
  const [channels,setChannels]=useState<Array<{id:string;publicName:string;slug:string;description?:string|null}>>([]);
  const [saved,setSaved]=useState<Array<{id:string;body?:string|null;conversationTitle?:string|null;createdAt:string}>>([]);
  const [notifications,setNotifications]=useState<Array<{id:string;title:string;body?:string|null;readAt?:string|null;createdAt:string}>>([]);
  const [editing,setEditing]=useState<Message|null>(null);
  const [editDraft,setEditDraft]=useState('');
  const readerAbort=useRef<AbortController|null>(null);
  const socketRef=useRef<WebSocket|null>(null);
  const typingTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const token=()=>getAccessToken();
  const currentUserId=useMemo(()=>{const t=token();if(!t)return null;try{return JSON.parse(atob(t.split('.')[1])).sub as string;}catch{return null;}},[]);

  const loadConversations=useCallback(async()=>{
    const t=token(); if(!t){setError('Authentication required.');setLoading(false);return;}
    try{const r=await apiFetch<{data:Conversation[]}>('/communication/conversations',{headers:{Authorization:`Bearer ${t}`}});setConversations(r.data||[]);if(!selected&&r.data?.[0])setSelected(r.data[0].id);}
    catch(e){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load conversations.')}
    finally{setLoading(false);}
  },[selected]);

  const loadTopics=useCallback(async(id:string)=>{
    const t=token();if(!t)return;
    try{const r=await apiFetch<{data:Topic[]}>(`/communication/conversations/${id}/topics`,{headers:{Authorization:`Bearer ${t}`}});setTopics(r.data||[]);}catch{setTopics([]);}
  },[]);

  const loadMessages=useCallback(async(id:string)=>{
    const t=token();if(!t)return;
    try{const r=await apiFetch<{data:Message[]}>(`/communication/conversations/${id}/messages?limit=100`,{headers:{Authorization:`Bearer ${t}`}});setMessages(r.data||[]);if(r.data?.length){void apiFetch(`/communication/conversations/${id}/read`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({messageId:r.data[r.data.length-1].id})});}}
    catch(e){setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to load messages.');}
  },[]);

  useEffect(()=>{void loadConversations();},[loadConversations]);
  useEffect(()=>{if(selected){void loadMessages(selected);void loadTopics(selected);}},[selected,loadMessages,loadTopics]);

  useEffect(()=>{
    const t=token(); if(!t||!API_URL)return;
    const base=API_URL.replace(/^http/i,API_URL.startsWith('https')?'wss':'ws');
    const socket=new WebSocket(`${base}/communication/socket?access_token=${encodeURIComponent(t)}`);
    socketRef.current=socket;
    socket.onmessage=(event)=>{try{const payload=JSON.parse(event.data); if(payload.type==='typing.started'&&payload.conversationId===selected){setTypingUsers(prev=>prev.includes(payload.data?.userId)?prev:[...prev,payload.data?.userId].filter(Boolean));} if(payload.type==='typing.stopped'&&payload.conversationId===selected){setTypingUsers(prev=>prev.filter(id=>id!==payload.data?.userId));} if(payload.type==='notification.created'&&payload.data?.userId===currentUserId){setNotificationCount(v=>v+1);}}catch{}};
    socket.onclose=()=>{if(socketRef.current===socket)socketRef.current=null;};
    socket.onerror=()=>undefined;
    return()=>{if(socketRef.current===socket)socketRef.current=null;socket.close();};
  },[selected,currentUserId]);

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

  function emitTyping(type:'typing.started'|'typing.stopped'){
    if(!selected||socketRef.current?.readyState!==WebSocket.OPEN)return;
    socketRef.current.send(JSON.stringify({type,conversationId:selected}));
  }

  function onDraftChange(value:string){
    setDraft(value);
    if(!value.trim()){emitTyping('typing.stopped');return;}
    emitTyping('typing.started');
    if(typingTimer.current)clearTimeout(typingTimer.current);
    typingTimer.current=setTimeout(()=>emitTyping('typing.stopped'),1200);
  }

  async function send(){
    const t=token();if(!t||!selected||!draft.trim()||sending)return;
    setSending(true);setError(null);const body=draft.trim();setDraft('');emitTyping('typing.stopped');
    try{const message=await apiFetch<Message>(`/communication/conversations/${selected}/messages`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({body,replyToMessageId:replyTo?.id})});setMessages(prev=>prev.some(m=>m.id===message.id)?prev:[...prev,message]);setReplyTo(null);void loadConversations();}
    catch(e){setDraft(body);setError(e instanceof ApiError||e instanceof Error?e.message:'Unable to send message.')}
    finally{setSending(false);}
  }


  async function loadCenterData(){
    const t=token();if(!t)return;const headers={Authorization:`Bearer ${t}`};
    if(view==='channels'){const r=await apiFetch<{data:any[]}>('/communication/channels',{headers}).catch(()=>({data:[]}));setChannels(r.data||[]);}
    if(view==='saved'){const r=await apiFetch<{data:any[]}>('/communication/saved-messages',{headers}).catch(()=>({data:[]}));setSaved(r.data||[]);}
    if(view==='notifications'){const r=await apiFetch<{data:any[]}>('/communication/notifications',{headers}).catch(()=>({data:[]}));setNotifications(r.data||[]);setNotificationCount(0);}
  }

  useEffect(()=>{void loadCenterData();},[view]);
  async function saveEdit(){
    const t=token(); if(!t||!editing||!editDraft.trim())return;
    try{await apiFetch('/communication/messages/'+editing.id,{method:'PATCH',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({body:editDraft.trim()})});setEditing(null);setEditDraft('');if(selected)await loadMessages(selected);}catch(e){setError(e instanceof Error?e.message:'Unable to edit message.');}
  }

  async function deleteMessage(id:string){
    const t=token();if(!t)return;
    try{await apiFetch('/communication/messages/'+id,{method:'DELETE',headers:{Authorization:`Bearer ${t}`}});if(selected)await loadMessages(selected);}catch(e){setError(e instanceof Error?e.message:'Unable to delete message.');}
  }
  async function runCommand(confirm=false){
    const t=token(); if(!t||!command.trim()||commandBusy)return;
    setCommandBusy(true); setCommandResult('');
    try{
      const r=await apiFetch<any>('/communication/commands/execute',{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({command:command.trim(),confirm})});
      if(r.status==='AWAITING_CONFIRMATION'){setCommandPreview(r.preview);setCommandResult('Review required before execution.');}
      else {setCommandPreview(null);setCommandResult(JSON.stringify(r.result ?? r));}
    }catch(e){setCommandResult(e instanceof Error?e.message:'Unable to execute command.');}
    finally{setCommandBusy(false);}
  }

  function cancelCommandPreview(){setCommandPreview(null);setCommandResult('');}

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
      .rail,.list,.chat{min-width:0}.rail{background:#111827;color:#eef2f7;padding:22px 16px;display:flex;flex-direction:column;gap:18px}.brand{font-size:18px;font-weight:800;letter-spacing:.08em}.muted{color:#9ca8b7;font-size:12px;line-height:1.5}.nav{display:grid;gap:5px}.nav div{padding:10px 12px;border-radius:8px;font-size:13px}.nav .active{background:#263142;color:#fff}.railBottom{margin-top:auto}.presence{display:flex;gap:8px;align-items:center}.dot{width:8px;height:8px;border-radius:50%;background:#28a36a}.list{background:#fff;border-right:1px solid #e1e5ea;display:flex;flex-direction:column}.listHead,.chatHead{padding:16px 18px;border-bottom:1px solid #e1e5ea;background:#fff}.listHead h1,.chatHead h2{font-size:17px;margin:0;letter-spacing:-.01em}.sub{font-size:12px;color:#7a8795;margin-top:5px}.search{margin-top:14px;width:100%;padding:10px 11px;border:1px solid #d7dce2;border-radius:8px;background:#fafbfc;outline:none}.rows{overflow:auto}.row{padding:13px 15px;border-bottom:1px solid #f0f2f4;cursor:pointer}.row:hover,.row.selected{background:#f2f5f8}.rowTitle{display:flex;justify-content:space-between;gap:10px;font-weight:700;font-size:13px}.rowPreview{color:#778291;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}.badge{font-size:10px;background:#1f6feb;color:#fff;border-radius:10px;padding:2px 6px}.chat{display:flex;flex-direction:column;background:#fff}.chatHead{display:flex;justify-content:space-between;align-items:center}.messages{flex:1;overflow:auto;padding:24px;display:flex;flex-direction:column;gap:9px;background:#fbfcfd}.message{max-width:min(72%,720px);align-self:flex-start;background:#f0f2f5;border:1px solid #e1e5e9;border-radius:10px;padding:9px 11px}.message.mine{align-self:flex-end;background:#e8f1ff;border-color:#c8dcfa}.sender{font-size:11px;font-weight:700;color:#5e6a78;margin-bottom:4px}.body{font-size:14px;white-space:pre-wrap;word-break:break-word}.time{font-size:10px;color:#8993a0;text-align:right;margin-top:5px}.commandBar{border-top:1px solid #e1e5ea;padding:10px 12px 0;display:flex;gap:8px}.commandBar input{flex:1;padding:9px 10px;border:1px solid #d7dce2;border-radius:8px;font:inherit;font-size:12px}.commandBtn{border:1px solid #c9d4e2;background:#f7f9fb;border-radius:8px;padding:0 13px;font-weight:700}.commandResult{margin:8px 12px 0;padding:9px 10px;background:#f5f7fa;border:1px solid #e1e5ea;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-word}.composer{border-top:1px solid #e1e5ea;padding:12px;display:flex;gap:9px}.composer textarea{flex:1;resize:none;min-height:42px;max-height:120px;border:1px solid #d7dce2;border-radius:9px;padding:11px;font:inherit;outline:none}.send{border:0;border-radius:9px;padding:0 18px;background:#1f6feb;color:#fff;font-weight:700}.send:disabled{opacity:.5}.error{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:20;background:#fff1f0;color:#9f2f2f;border:1px solid #f1c2be;padding:10px 14px;border-radius:8px;font-size:12px}.searchResults{position:absolute;left:0;right:0;top:48px;background:#fff;border:1px solid #dfe3e8;border-radius:8px;z-index:10;box-shadow:0 8px 24px #00000012}.searchWrap{position:relative}.result{padding:9px 11px;border-bottom:1px solid #f0f2f4;font-size:12px}.empty{margin:auto;color:#7d8896;font-size:13px;text-align:center}.statusSelect{background:transparent;color:#d7dee8;border:1px solid #374151;border-radius:7px;padding:6px;font-size:12px}.topics{display:flex;gap:6px;padding:9px 18px;border-bottom:1px solid #edf0f3;overflow:auto;background:#fcfdfe}.topic{white-space:nowrap;border:1px solid #dce2e8;background:#fff;border-radius:999px;padding:5px 9px;font-size:11px;color:#536171}.topic strong{color:#18202b}.commandPreview{margin:8px 12px 0;padding:12px;background:#fffaf0;border:1px solid #e6d3a2;border-radius:9px;font-size:12px}.commandPreviewActions{display:flex;gap:7px;margin-top:9px}.confirmBtn,.cancelBtn{border:1px solid #cbd3dc;border-radius:7px;padding:7px 10px;font-size:11px;font-weight:700}.confirmBtn{background:#18202b;color:#fff}.cancelBtn{background:#fff;color:#4c5866}
      @media(max-width:900px){.communication{grid-template-columns:230px minmax(0,1fr)}.rail{display:none}.list{border-right:1px solid #e1e5ea}.message{max-width:84%}}
      @media(max-width:650px){.communication{margin:0;border-radius:0;height:100vh;min-height:0;grid-template-columns:1fr}.list{display:${selected?'none':'flex'}}.chat{display:${selected?'flex':'none'}}.chatHead{position:sticky;top:0}.message{max-width:90%}}
    `}</style>
    {error&&<div className="error" role="alert">{error}</div>}
    <aside className="rail"><div className="brand">JASLYN NET</div><div className="muted">Communication Center</div><div className="nav"><div className={view==='chats'?'active':''} onClick={()=>setView('chats')}>Chats</div><div className={view==='channels'?'active':''} onClick={()=>setView('channels')}>Channels</div><div onClick={()=>{setView('chats');setConversations(prev=>prev)}}>NOC</div><div onClick={()=>setView('chats')}>Support</div><div className={view==='superapp'?'active':''} onClick={()=>setView('superapp')}>Super App</div><div className={view==='saved'?'active':''} onClick={()=>setView('saved')}>Saved</div><div className={view==='notifications'?'active':''} onClick={()=>setView('notifications')}>Notifications {notificationCount>0&&<span className="badge">{notificationCount}</span>}</div><div className={view==='command'?'active':''} onClick={()=>setView('command')}>Command</div></div><div className="railBottom"><div className="muted">Presence</div><div className="presence"><span className="dot"/><select className="statusSelect" value={presence} onChange={e=>void updatePresence(e.target.value)}><option>ONLINE</option><option>AWAY</option><option>BUSY</option><option>INVISIBLE</option><option>OFFLINE</option></select></div></div></aside>
    <section className="list"><div className="listHead"><h1>{view==='channels'?'Channels':view==='saved'?'Saved messages':view==='notifications'?'Notifications':view==='command'?'Command':'Chats'}</h1><div className="sub">{loading?'Loading live conversations…':`${conversations.length} conversation${conversations.length===1?'':'s'}`}</div><div className="searchWrap"><input className="search" value={search} onChange={e=>void runSearch(e.target.value)} placeholder="Search messages, users, subscribers…" />{results.length>0&&<div className="searchResults">{results.slice(0,8).map((r,i)=><div className="result" key={r.id+`-${i}`}><strong>{r.type}</strong> · {r.fullName||r.senderName||r.conversationTitle||r.body}</div>)}</div>}</div></div><div className="rows">{view==='channels'&&channels.map(ch=><div className="row" key={ch.id}><div className="rowTitle"><span>{ch.publicName}</span></div><div className="rowPreview">{ch.description||'#'+ch.slug}</div></div>)}{view==='saved'&&saved.map(item=><div className="row" key={item.id}><div className="rowTitle"><span>{item.conversationTitle||'Saved message'}</span></div><div className="rowPreview">{item.body||'Attachment or empty message'}</div></div>)}{view==='notifications'&&notifications.map(n=><div className="row" key={n.id} onClick={()=>{const t=token();void apiFetch('/communication/notifications/'+n.id+'/read',{method:'POST',headers:{Authorization:`Bearer ${t}`}}).catch(()=>undefined)}}><div className="rowTitle"><span>{n.title}</span></div><div className="rowPreview">{n.body||n.createdAt}</div></div>)}{view==='command'&&<div style={{padding:18}}><div className="sub">Use verified platform commands. Destructive operations require explicit confirmation.</div></div>}{view==='chats'&&conversations.map(c=><div key={c.id} className={`row ${selected===c.id?'selected':''}`} onClick={()=>{setSelected(c.id);setSearch('');setResults([])}}><div className="rowTitle"><span>{c.title||'Untitled conversation'}</span>{c.unreadCount>0&&<span className="badge">{c.unreadCount}</span>}</div><div className="rowPreview">{c.lastMessageBody||'No messages yet'}</div></div>)}{!loading&&!conversations.length&&<div className="empty" style={{padding:24}}>No conversations yet.<br/>The system is correctly showing no fake chats.</div>}</div></section>
    <section className="chat">{view==='superapp'?<SuperAppPanel/>:<><div className="chatHead"><div><h2>{active?.title||'Select a conversation'}</h2><div className="sub">{active?.kind||'Communication Center'} · {topics.length} topic{topics.length===1?'':'s'}</div></div><button className="statusSelect" onClick={()=>selected&&void loadMessages(selected)}>Refresh</button></div>{selected&&topics.length>0&&<div className="topics" aria-label="Conversation topics">{topics.filter(t=>!t.archivedAt).slice(0,12).map(t=><div className="topic" key={t.id}><strong>{t.name}</strong> · {t.messageCount}</div>)}</div>}<div className="messages">{selected&&messages.length?messages.map(m=><article key={m.id} className={`message ${m.senderUserId===currentUserId?'mine':''}`}><div className="sender">{m.senderName||m.senderCustomerName||'System'}</div><div className="body">{m.deletedAt?'Message deleted':m.body}</div>{m.reactions?.length? <div className="sub">{m.reactions.map(r=>`${r.reaction} ${r.count}`).join('  ')}</div>:null}<div className="messageActions"><button onClick={()=>setReplyTo(m)}>Reply</button><button onClick={()=>{const t=token();void apiFetch(`/communication/messages/${m.id}/reactions`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({reaction:'👍'})}).then(()=>loadMessages(selected!)).catch(()=>undefined)}}>👍</button><button onClick={()=>{const t=token();void apiFetch(`/communication/messages/${m.id}/save`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({})}).catch(()=>undefined)}}>Save</button>{m.senderUserId===currentUserId&&<><button onClick={()=>{setEditing(m);setEditDraft(m.body||'')}}>Edit</button><button onClick={()=>void deleteMessage(m.id)}>Delete</button></>}</div><div className="time">{time(m.createdAt)}</div></article>):<div className="empty">{selected?'No messages in this conversation.':'Choose a conversation from the left.'}</div>}</div>{selected&&typingUsers.length>0&&<div className="typing">Someone is typing…</div>}{editing&&<div className="replyBar"><span><strong>Edit message</strong><textarea value={editDraft} onChange={e=>setEditDraft(e.target.value)} style={{display:'block',width:'100%',marginTop:6,padding:8,border:'1px solid #d7dce2',borderRadius:7}} /></span><span><button onClick={()=>void saveEdit()}>Save</button><button onClick={()=>{setEditing(null);setEditDraft('')}}>Cancel</button></span></div>}{selected&&replyTo&&<div className="replyBar"><span>Replying to <strong>{replyTo.senderName||replyTo.senderCustomerName||'message'}</strong>: {replyTo.body}</span><button onClick={()=>setReplyTo(null)}>Cancel</button></div>}{selected&&<>
      <div className="commandBar"><input value={command} onChange={e=>setCommand(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void runCommand()}}} placeholder="Ask Jaslyn or run /status, /router status <name>…" /><button className="commandBtn" disabled={commandBusy||!command.trim()} onClick={()=>void runCommand()}>{commandBusy?'Checking…':'Run'}</button></div>
      {commandResult&&<div className="commandResult" role="status">{commandResult}</div>}{commandPreview&&<div className="commandPreview"><strong>Confirmation required</strong><div style={{marginTop:5}}>{commandPreview.warning||'This operation changes service state.'}</div><div className="commandPreviewActions"><button className="confirmBtn" onClick={()=>void runCommand(true)} disabled={commandBusy}>Confirm execution</button><button className="cancelBtn" onClick={cancelCommandPreview}>Cancel</button></div></div>}
      <div className="composer"><textarea value={draft} onChange={e=>onDraftChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder="Write a message…" /><button className="send" disabled={sending||!draft.trim()} onClick={()=>void send()}>{sending?'Sending…':'Send'}</button></div>
    </>}
    </>}
    </section>
  </main>;
}
