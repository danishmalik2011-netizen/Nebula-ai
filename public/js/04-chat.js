"use strict";
/* ---------- chat helpers ---------- */
const activeChat=()=>state.chats.find(c=>c.id===state.activeId)||null;
function ensureChat(){
  let chat=activeChat();
  if(!chat){
    chat={id:uid(),title:"New chat",titled:false,mode:state.settings.mode==="build"?"build":"chat",ws:"",createdAt:Date.now(),updatedAt:Date.now(),messages:[]};
    state.chats.unshift(chat);state.activeId=chat.id;
  }
  return chat;
}
function makeTitle(text){
  const first=String(text).split("\n").find(l=>l.trim())||"New chat";
  const clean=first.replace(/\s+/g," ").trim();
  return clean.length>52?clean.slice(0,52).trimEnd()+"…":clean||"New chat";
}
function newChat(){
  if(isStreaming){toast("Stop the current response first.","err");return}
  state.activeId=null;searchQuery="";$("#searchInput").value="";
  renderMessages();renderChatList();save();closeSidebarIfMobile();
  setTimeout(()=>$("#input").focus(),30);
}
function selectChat(id){
  if(isStreaming){toast("Stop the current response first.","err");return}
  if(id===state.activeId){closeSidebarIfMobile();return}
  state.activeId=id;renderMessages();renderChatList();save();closeSidebarIfMobile();
}
function deleteChat(id){
  if(isStreaming){toast("Stop the current response first.","err");return}
  const idx=state.chats.findIndex(c=>c.id===id);
  if(idx<0)return;
  state.chats.splice(idx,1);
  if(state.activeId===id)state.activeId=state.chats.length?state.chats[0].id:null;
  renderMessages();renderChatList();save();toast("Conversation deleted");
}

/* ---------- message rendering ---------- */
function appendCursor(md){
  const cur=document.createElement("span");cur.className="cursor";
  const last=md.lastElementChild;
  if(last&&/^(P|LI|H[1-6]|TD|TH|BLOCKQUOTE|DIV)$/.test(last.tagName))last.appendChild(cur);
  else md.appendChild(cur);
}
const ACTION_ICONS={
  copy:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  regen:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>`,
  del:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`
};
function createMsgEl(msg){
  const el=document.createElement("div");
  el.className="msg enter "+(msg.role==="assistant"?"assistant":"user")+(msg.tool?" tool":"");
  el.addEventListener("animationend",()=>el.classList.remove("enter"),{once:true});
  el.dataset.id=msg.id;
  if(msg.role==="assistant"){
    const content=document.createElement("div");content.className="content";
    content.innerHTML=`<div class="web" style="display:none"></div><div class="reason" style="display:none"><button class="reason-toggle" type="button" aria-haspopup="dialog"><span class="ring rt-ring" style="display:none"></span><svg class="clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="rt-label"></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button></div><div class="md"></div><div class="stream-ind"><span class="ring"></span></div><div class="msg-meta"></div><div class="msg-actions"></div>`;
    el.appendChild(content);
  }else{
    const content=document.createElement("div");content.className="content";el.appendChild(content);
    const meta=document.createElement("div");meta.className="msg-meta";el.appendChild(meta);
    const acts=document.createElement("div");acts.className="msg-actions";el.appendChild(acts);
  }
  return el;
}
/* only the newest plan card is shown; older ones would just repeat it */
function laterPlan(msg){
  if(!Array.isArray(msg.acts))return false;
  const c=activeChat();if(!c)return false;
  const i=c.messages.indexOf(msg);
  return i>=0&&c.messages.slice(i+1).some(m=>Array.isArray(m.acts)&&m.acts.some(a=>a.type==="plan"));
}
function paintMsg(el,msg,streaming){
  if(!el)return;
  const isUser=msg.role==="user",content=el.querySelector(".content");
  el.classList.toggle("error",!!msg.error);
  if(isUser)paintUserContent(content,msg);
  else{
    paintWeb(el,msg);
    const md=content.querySelector(".md");
    if(md){
      if(msg.error)md.innerHTML=errorHtml(msg.content);
      else{const vp=viewParts(msg);morphHtml(md,sanitizeHtml(renderMarkdown(vp.content,{sources:msg.web&&msg.web.sources,build:Array.isArray(msg.acts),acts:msg.acts,hidePlan:laterPlan(msg)})));paintReason(el,msg,vp,streaming);hydrateUI(md);if(!streaming)hydrateImages(md)}
    }
  }
  const meta=el.querySelector(".msg-meta");
  if(meta){
    if(state.settings.timestamps&&!streaming){
      const parts=[];
      if(!isUser)parts.push(msg.model||state.settings.model||"");
      parts.push(fmtTime(msg.ts||Date.now()));
      if(!isUser&&!msg.error&&msg.content)parts.push(estimateTokens(msg.content)+" tok");
      meta.textContent=parts.filter(Boolean).join("  ·  ");meta.style.display="";
    }else{meta.textContent="";meta.style.display="none"}
  }
  const acts=el.querySelector(".msg-actions");
  if(acts)acts.innerHTML=streaming?"":actionsHtml(msg);
}
function paintThinking(el){
  const md=el&&el.querySelector(".md");
  if(md)md.innerHTML=`<div class="thinking"><span class="ring"></span><span>Working…</span></div>`;
}
function emptyStateHtml(){
  if(needsSetup())return setupHtml();
  if(state.settings.mode==="build")return buildEmptyHtml();
  const suggestions=[
    {t:"Explain a concept",d:"Explain how HTTPS works, step by step, for a junior developer."},
    {t:"Write code",d:"Write a Python function that retries an HTTP request with exponential backoff."},
    {t:"Summarize",d:"Summarize the key points of this article into five bullets: "},
    {t:"Plan something",d:"Create a 7-day study plan for learning the basics of machine learning."}
  ];
  return `<div class="empty"><div class="empty-logo"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#brand-logo"/></svg></div><h2>How can I help?</h2><div class="suggestions">${suggestions.map(s=>`<button class="sugg" data-sugg="${escapeHtml(s.d)}"><b>${escapeHtml(s.t)}</b><span>${escapeHtml(s.d.slice(0,58))}…</span></button>`).join("")}</div></div>`;
}
function renderMessages(){
  const inner=$("#msgsInner"),chat=activeChat();
  inner.innerHTML="";
  if(!chat||!chat.messages.length)inner.innerHTML=emptyStateHtml();
  else{
    const frag=document.createDocumentFragment();
    for(const m of chat.messages){if(m.tool)continue;const el=createMsgEl(m);el.classList.remove("enter");paintMsg(el,m,false);frag.appendChild(el)}
    inner.appendChild(frag);
  }
  
  updateBadges();updateCounter();setSendState();
  if(state.settings.autoScroll)requestAnimationFrame(()=>scrollToBottom(false));
  updateScrollBtn();
  if(typeof updateResume==="function")updateResume();
}
function updateBadges(){
  const s=state.settings,prov=PROVIDERS[s.provider]||{name:"—",needsKey:true};
  const hasKey=prov.needsKey===false||!!cleanKey(s.keys&&s.keys[s.provider]);
  $("#modelChipText").textContent=hasKey?(s.model||"Select model"):"Add API key";
  $("#modelChip").title=hasKey?`${prov.name} · change model`:"Add an API key";
  updateWebBtn();
  updateMicBtn();
}

/* ---------- chat list ---------- */
function renderChatList(){
  const list=$("#chatList"),q=searchQuery.trim().toLowerCase();
  let chats=state.chats.filter(c=>(c.mode==="build")===(state.settings.mode==="build")).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  if(q)chats=chats.filter(c=>(c.title||"").toLowerCase().includes(q)||c.messages.some(m=>(m.content||"").toLowerCase().includes(q)));
  if(!chats.length){
    list.innerHTML=`<div class="list-empty">${q?"No chats match your search.":"No conversations yet.<br>Start a new chat to begin."}</div>`;
    return;
  }
  const now=new Date(),sod=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
  const groups={Pinned:[],Today:[],Yesterday:[],"Previous 7 days":[],Older:[]};
  for(const c of chats){
    const t=c.updatedAt||c.createdAt||Date.now();
    if(c.pinned)groups.Pinned.push(c);
    else if(t>=sod)groups.Today.push(c);
    else if(t>=sod-864e5)groups.Yesterday.push(c);
    else if(t>=sod-6*864e5)groups["Previous 7 days"].push(c);
    else groups.Older.push(c);
  }
  let html="";
  for(const[label,arr]of Object.entries(groups)){
    if(!arr.length)continue;
    html+=`<div class="group-label">${label}</div>`;
    html+=arr.map(c=>`<div class="chat-item ${c.id===state.activeId?"active":""}" data-id="${c.id}"><span class="ci-title">${escapeHtml(c.title||"New chat")}</span><button class="ci-del" data-more="${c.id}" title="More" aria-label="More options">⋯</button></div>`).join("");
  }
  list.innerHTML=html;
}

/* ---------- scrolling ---------- */
/* follow the stream only while the reader is at the bottom; scrolling up releases it until they return */
let stickBottom=true,followRaf=0,lastScrollTop=0;
function scrollToBottom(smooth){stickBottom=true;const m=$("#messages");m.scrollTo({top:m.scrollHeight,behavior:smooth?"smooth":"auto"})}
function followStream(){
  if(!stickBottom||!state.settings.autoScroll||followRaf)return;
  followRaf=requestAnimationFrame(()=>{followRaf=0;const m=$("#messages");m.scrollTop=m.scrollHeight});
}
function onMsgScroll(){
  const m=$("#messages"),d=m.scrollHeight-m.scrollTop-m.clientHeight;
  if(d<=32)stickBottom=true;
  else if(m.scrollTop<lastScrollTop-1)stickBottom=false;
  lastScrollTop=m.scrollTop;
  updateScrollBtn();
}
function initScrollFollow(){
  const m=$("#messages");
  m.addEventListener("scroll",onMsgScroll,{passive:true});
  m.addEventListener("wheel",e=>{if(e.deltaY<0)stickBottom=false},{passive:true});
  m.addEventListener("touchmove",()=>{if(m.scrollHeight-m.scrollTop-m.clientHeight>32)stickBottom=false},{passive:true});
}
/* patch the DOM in place so unchanged nodes (spinners, charts, code, open toggles) are never recreated */
function opaqueNode(n){return n.nodeType===1&&(n.classList.contains("ui-host")||(n.tagName==="FIGURE"&&n.classList.contains("wimg")))}
function sameOpaque(a,b){
  if(a.classList.contains("ui-host"))return b.classList.contains("ui-host")&&a.getAttribute("data-ui")===b.getAttribute("data-ui");
  return b.tagName==="FIGURE"&&a.getAttribute("data-q")===b.getAttribute("data-q");
}
function patchNode(o,n){
  if(o.nodeType===3&&n.nodeType===3){if(o.data!==n.data)o.data=n.data;return}
  if(o.nodeType!==1||n.nodeType!==1||o.tagName!==n.tagName){o.replaceWith(n);return}
  if(opaqueNode(o)||opaqueNode(n)){if(!(opaqueNode(o)&&opaqueNode(n)&&sameOpaque(o,n)))o.replaceWith(n);return}
  if(o.isEqualNode(n))return;
  for(const a of Array.from(o.attributes))if(!n.hasAttribute(a.name))o.removeAttribute(a.name);
  for(const a of Array.from(n.attributes))if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);
  reconcileChildren(o,n);
}
function reconcileChildren(op,np){
  const o=Array.from(op.childNodes),n=Array.from(np.childNodes);
  for(let i=0;i<n.length;i++){if(i>=o.length)op.appendChild(n[i]);else patchNode(o[i],n[i])}
  for(let i=o.length-1;i>=n.length;i--)op.removeChild(o[i]);
}
function morphHtml(el,html){
  const t=document.createElement("template");
  t.innerHTML=html;
  reconcileChildren(el,t.content);
}
function updateScrollBtn(){
  const m=$("#messages"),near=m.scrollHeight-m.scrollTop-m.clientHeight<140;
  $("#scrollBtn").classList.toggle("show",!near&&m.scrollHeight>m.clientHeight+60);
}

/* ---------- composer ---------- */
function autoGrow(){const t=$("#input");t.style.height="auto";t.style.height=Math.min(t.scrollHeight,220)+"px"}
function updateCounter(){}
const IC_SEND=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
const IC_STOP=`<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>`;
const IC_LIVE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>';
function hasDraft(){return !!($("#input").value.trim()||(typeof readyAtts==="function"&&readyAtts().length))}
function setSendState(){
  const btn=$("#sendBtn"),busy=typeof attBusy==="function"&&attBusy();
  btn.classList.remove("stop","live");
  if(isStreaming){btn.classList.add("stop");btn.disabled=false;btn.title="Stop generating";btn.setAttribute("aria-label","Stop generating");btn.innerHTML=IC_STOP}
  else if(hasDraft()){btn.disabled=busy;btn.title="Send";btn.setAttribute("aria-label","Send");btn.innerHTML=IC_SEND}
  else{btn.classList.add("live");btn.disabled=false;btn.title="Live voice";btn.setAttribute("aria-label","Live voice");btn.innerHTML=IC_LIVE}
  const pill=$("#streamPill");
  if(pill)pill.style.display=isStreaming?"":"none";
}
function requireProvider(){
  const s=state.settings,prov=PROVIDERS[s.provider];
  if(!prov){toast("Unknown provider — pick one in Settings.","err");openSettings("providers");return false}
  const key=cleanKey(s.keys&&s.keys[s.provider]);
  if(prov.needsKey!==false&&!key){toast(`Add an API key for ${prov.name} first.`,"err");openSettings("providers");return false}
  if(prov&&prov.custom&&!prov.base){toast("Add a base URL for this provider.","err");openSettings("providers");return false}
  if(!(s.model||"").trim()){toast("Choose a model in Settings → Model.","err");openSettings("model");return false}
  return true;
}
