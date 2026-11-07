"use strict";
/* ---------- boot ---------- */
async function boot(){
  await loadAll();applyTheme();applyAccent();applyTypography();
  const app=$("#app");
  if(state.settings.sidebarClosed)app.classList.add("sidebar-closed");
  if(window.matchMedia("(max-width: 760px)").matches)app.classList.add("sidebar-closed");
  if(state.activeId&&!state.chats.find(c=>c.id===state.activeId))state.activeId=state.chats.length?state.chats[0].id:null;
  {const ac=activeChat();if(ac)state.settings.mode=ac.mode==="build"?"build":"chat"}
  wire();applyMode();if(state.settings.mode==="build")buildConfig();detectServer().then(()=>fetchModels(state.settings.provider));renderMessages();renderChatList();updateBadges();setSendState();autoGrow();updateCounter();
  if(!window.matchMedia("(max-width: 760px)").matches)setTimeout(()=>$("#input").focus(),60);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
