"use strict";
/* ---------- settings values, sidebar, event wiring ---------- */
function applySetting(key,value,opts={}){
  const s=state.settings;
  s[key]=value;
  if(key==="theme")applyTheme();
  if(key==="accent")applyAccent();
  if(key==="fontSize"||key==="msgWidth"||key==="fontFamily")applyTypography();
  if(key==="provider"){
    const p=PROVIDERS[value];
    const ml=modelList(value);if(ml.length)s.model=ml[0];
    else if(value==="custom"&&!s.model)s.model="";
  }
  save();updateBadges();setSendState();
  if(key==="provider")fetchModels(value);
  if(opts.fullRepaint)renderMessages();
  if(opts.rerenderPane)renderPane();
}

function closeSidebarIfMobile(){
  if(window.matchMedia("(max-width: 760px)").matches){
    $("#app").classList.add("sidebar-closed");state.settings.sidebarClosed=true;save();
  }
}
function toggleSidebar(){
  const app=$("#app");
  app.classList.toggle("sidebar-closed");
  state.settings.sidebarClosed=app.classList.contains("sidebar-closed");
  save();
}

const cleanKey=v=>String(v||"").replace(/[^\x21-\x7E]/g,"");

function wire(){
  $("#toggleSidebar").addEventListener("click",toggleSidebar);
  $("#closeSidebar").addEventListener("click",()=>{$("#app").classList.add("sidebar-closed");state.settings.sidebarClosed=true;save()});
  $("#newChat").addEventListener("click",newChat);
  $("#newChatFab").addEventListener("click",()=>{haptic(6);newChat()});
  $("#moreFab").addEventListener("click",()=>{const c=activeChat();if(!c){toast("Start a chat first.","err");return}const r=$("#moreFab").getBoundingClientRect();haptic(5);openChatMenu(c.id,r.right-210,r.bottom+6)});
  $("#openSettings").addEventListener("click",()=>openSettings());
  $("#themeToggle").addEventListener("click",()=>{haptic(6);applySetting("theme",state.settings.theme==="dark"?"light":"dark")});
  $("#searchInput").addEventListener("input",e=>{searchQuery=e.target.value;renderChatList()});
  $("#chatList").addEventListener("click",e=>{
    const del=e.target.closest(".ci-del");
    if(del){e.stopPropagation();const r=del.getBoundingClientRect();openChatMenu(del.dataset.more,r.left,r.bottom+4);return}
    const item=e.target.closest(".chat-item");
    if(item&&Date.now()-ctxT>450)selectChat(item.dataset.id);
  });
    const ta=$("#input");
  ta.addEventListener("input",()=>{autoGrow();updateCounter();setSendState()});
  ta.addEventListener("keydown",e=>{
    if(e.key!=="Enter"||e.shiftKey)return;
    const mod=e.metaKey||e.ctrlKey;
    if(state.settings.sendOnEnter?!mod:mod){e.preventDefault();sendMessage()}
  });
  $("#sendBtn").addEventListener("click",()=>{
    if(isStreaming){if(BUILD.busy)buildStop();else if(abortController)abortController.abort();return}
    if(!hasDraft()){startLive();return}
    sendMessage();
  });
  $("#modelChip").addEventListener("click",openModelPop);
  $("#msgsInner").addEventListener("click",async e=>{
    const at=e.target.closest("[data-att]");
    if(at){const[mi,ai]=at.dataset.att.split(":");openAttachment(mi,ai);return}
    const eb=e.target.closest("[data-err]");
    if(eb){const me=eb.closest(".msg"),a=eb.dataset.err;if(a==="retry")regenerate(me.dataset.id);else if(a==="providers")openSettings("providers");else openModelPop();return}
    const sp=e.target.closest("[data-setup-prov]");
    if(sp){$$("[data-setup-prov]").forEach(b=>{const on=b===sp;b.classList.toggle("on",on);b.setAttribute("aria-checked",on)});return}
    if(e.target.closest("#setupGo")){setupConnect($("#msgsInner"));return}
    if(e.target.closest("[data-setup-more]")){openSettings("providers");return}
    const rt=e.target.closest(".reason-toggle");
    if(rt){
      const me=rt.closest(".msg"),ch=activeChat(),mm=ch&&ch.messages.find(x=>x.id===me.dataset.id);
      if(mm)openSheet(mm.id);
      return;
    }
    const ac=e.target.closest(".art-card");
    if(ac){openArtifact(ac.dataset.art);return}
    const sugg=e.target.closest("[data-sugg]");
    if(sugg){ta.value=sugg.dataset.sugg;autoGrow();updateCounter();setSendState();ta.focus();return}
    const codeCopy=e.target.closest(".code-copy");
    if(codeCopy){
      const block=codeCopy.closest(".code-block"),code=block?block.querySelector("code"):null;
      if(code){
        try{
          await navigator.clipboard.writeText(code.innerText);
          codeCopy.classList.add("done");setTimeout(()=>codeCopy.classList.remove("done"),1500);
        }catch{toast("Copy failed — clipboard access blocked.","err")}
      }
      return;
    }
    const btn=e.target.closest(".act-btn");
    if(!btn){toggleMsgActions(e);return}
    const msgEl=btn.closest(".msg");
    if(!msgEl)return;
    const chat=activeChat();
    if(!chat)return;
    const msg=chat.messages.find(m=>m.id===msgEl.dataset.id);
    if(!msg)return;
    const action=btn.dataset.action;
    if(action==="copy"){
      try{
        await navigator.clipboard.writeText(msg.content);
        const orig=btn.innerHTML;btn.innerHTML="✓";
        setTimeout(()=>{btn.innerHTML=orig},1400);
      }catch{toast("Copy failed.","err")}
    }else if(action==="speak")speakToggle(msg,btn);else if(action==="edit")startEdit(msg,msgEl);else if(action==="regen")regenerate(msg.id);
    else if(action==="delete"){
      chat.messages=chat.messages.filter(m=>m.id!==msg.id);
      chat.updatedAt=Date.now();renderMessages();renderChatList();save();
    }
  });
  $("#scrollBtn").addEventListener("click",()=>scrollToBottom(true));
  initScrollFollow();
  document.addEventListener("keydown",e=>{
    const mod=e.metaKey||e.ctrlKey,tag=(e.target.tagName||"").toLowerCase();
    const typing=tag==="input"||tag==="textarea"||e.target.isContentEditable;
    if(e.key==="Escape"){
      if(SP.open){spBack();return}
      if(isStreaming&&abortController){if(BUILD.busy)buildStop();else abortController.abort();return}
    }
    if(mod&&e.key.toLowerCase()==="k"){e.preventDefault();openPalette();return}
    if(mod&&e.shiftKey&&e.key.toLowerCase()==="o"){e.preventDefault();newChat();return}
    if(mod&&e.key.toLowerCase()==="b"){e.preventDefault();toggleSidebar();return}
    if(mod&&e.key===","){e.preventDefault();openSettings();return}
    if(mod&&e.shiftKey&&e.key.toLowerCase()==="e"){e.preventDefault();exportCurrentChat();return}
    if(!typing&&e.key==="/"){e.preventDefault();ta.focus()}
  });
  window.addEventListener("beforeunload",()=>{save();clearTimeout(IDB.t);idbWrite()});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"){clearTimeout(IDB.t);idbWrite()}});
}
