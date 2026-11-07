"use strict";
/* ---------- theme / accent / typography ---------- */
const THEME_ICONS={
  moon:`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
  sun:`<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>`
};
function hexToRgb(hex){
  let h=String(hex||"").replace("#","").trim();
  if(h.length===3)h=h.split("").map(c=>c+c).join("");
  if(!/^[0-9a-f]{6}$/i.test(h))h="C25E3A";
  return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};
}
function applyTheme(){
  const t=state.settings.theme==="dark"?"dark":"light";
  document.documentElement.dataset.theme=t;
  const icon=$("#themeIcon");
  if(icon)icon.innerHTML=t==="light"?THEME_ICONS.moon:THEME_ICONS.sun;
}
function applyAccent(){
  const hex=state.settings.accent||"#C25E3A",{r,g,b}=hexToRgb(hex),root=document.documentElement.style;
  root.setProperty("--accent",hex);
  root.setProperty("--accent-soft",`rgba(${r},${g},${b},.10)`);
  root.setProperty("--accent-softer",`rgba(${r},${g},${b},.055)`);
  root.setProperty("--accent-border",`rgba(${r},${g},${b},.28)`);
  root.setProperty("--accent-glow",`rgba(${r},${g},${b},.22)`);
  const dr=Math.round(r*.85),dg=Math.round(g*.82),db=Math.round(b*.85);
  root.setProperty("--accent-deep","#"+[dr,dg,db].map(v=>v.toString(16).padStart(2,"0")).join(""));
  const lum=(.299*r+.587*g+.114*b)/255;
  root.setProperty("--accent-contrast",lum>.66?"#1a140e":"#ffffff");
}
function applyTypography(){
  const root=document.documentElement.style;
  root.setProperty("--fs",(state.settings.fontSize||15)+"px");
  root.setProperty("--msg-width",(state.settings.msgWidth||780)+"px");
  root.setProperty("--font",FONTS[state.settings.fontFamily]||FONTS.inter);
}

/* ---------- persistence ---------- */
function parseState(raw){
  if(!raw)return false;
  try{
    const d=JSON.parse(raw);
    if(d&&d.settings)state.settings={...DEFAULT_SETTINGS,...d.settings};
    if(!state.settings.keys||typeof state.settings.keys!=="object")state.settings.keys={};
    if(Array.isArray(d.chats)){
      state.chats=d.chats.filter(c=>c&&typeof c==="object").map(c=>({
        id:c.id||uid(),title:c.title||"New chat",titled:!!c.titled,mode:c.mode==="build"?"build":"chat",ws:typeof c.ws==="string"?c.ws:"",plan:typeof c.plan==="string"?c.plan:"",pinned:!!c.pinned,aiTitled:!!c.aiTitled,userTitled:!!c.userTitled,
        createdAt:c.createdAt||Date.now(),updatedAt:c.updatedAt||c.createdAt||Date.now(),
        messages:Array.isArray(c.messages)?c.messages.map(m=>({
          id:m.id||uid(),reasoning:typeof m.reasoning==="string"?m.reasoning:"",thinkMs:m.thinkMs||0,atts:Array.isArray(m.atts)?m.atts.filter(a=>a&&["image","pdf","text"].includes(a.kind)&&typeof a.id==="string"&&(a.kind==="text"?typeof a.text==="string":(typeof a.data==="string"&&/^[A-Za-z0-9+\/=]+$/.test(a.data)))).slice(0,12).map(a=>({id:a.id.slice(0,40),kind:a.kind,name:String(a.name||"file").slice(0,200),mime:a.kind==="image"?"image/jpeg":a.kind==="pdf"?"application/pdf":String(a.mime||"text/plain").slice(0,80),size:+a.size||0,w:+a.w||0,h:+a.h||0,...(a.kind==="text"?{text:a.text}:{data:a.data}),...(typeof a.thumb==="string"&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(a.thumb)?{thumb:a.thumb}:{})})):[],web:(m.web&&typeof m.web==="object")?{state:Array.isArray(m.web.sources)&&m.web.sources.length?"done":"none",query:String(m.web.query||"").slice(0,200),sources:(Array.isArray(m.web.sources)?m.web.sources:[]).filter(x=>x&&/^https?:\/\//.test(String(x.url))).slice(0,10).map(x=>({title:String(x.title||"").slice(0,200),url:String(x.url),snippet:String(x.snippet||"").slice(0,500),domain:String(x.domain||"")}))}:null,steps:Array.isArray(m.steps)?m.steps.filter(x=>typeof x==="string").slice(0,30):[],role:m.role==="assistant"?"assistant":"user",
          content:typeof m.content==="string"?m.content:"",ts:m.ts||Date.now(),model:m.model||"",error:!!m.error,tool:!!m.tool,acts:Array.isArray(m.acts)?m.acts:undefined
        })):[]
      }));
    }
    state.activeId=d.activeId||null;
    return true;
  }catch(e){console.warn("Nebula: corrupt state, starting fresh",e);return false}
}

/* ---------- storage: IndexedDB chats, localStorage settings, encrypted key vault ---------- */
const SET_KEY="nebula.settings.v3",VAULT_KEY="nebula.vault.v1";
const IDB={db:null,t:null,off:false};
function idbOpen(){
  return new Promise((res,rej)=>{
    if(typeof indexedDB==="undefined")return rej(new Error("IndexedDB unavailable"));
    const r=indexedDB.open("nebula",1);
    r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore("chats",{keyPath:"id"});d.createObjectStore("meta")};
    r.onsuccess=()=>res(r.result);
    r.onerror=()=>rej(r.error);
  });
}
async function idbRead(){
  try{
    const db=IDB.db=IDB.db||await idbOpen();
    return await new Promise((res,rej)=>{
      const tx=db.transaction(["chats","meta"]);
      const a=tx.objectStore("chats").getAll(),m=tx.objectStore("meta").get("active");
      tx.oncomplete=()=>res(a.result.length||m.result?{chats:a.result.sort((x,y)=>(x._o||0)-(y._o||0)),activeId:m.result||null}:null);
      tx.onerror=()=>rej(tx.error);
    });
  }catch{IDB.off=true;return null}
}
async function idbWrite(){
  if(IDB.off)return;
  try{
    const db=IDB.db=IDB.db||await idbOpen();
    await new Promise((res,rej)=>{
      const tx=db.transaction(["chats","meta"],"readwrite"),cs=tx.objectStore("chats");
      cs.clear();
      state.chats.forEach((c,i)=>cs.put({...c,_o:i}));
      tx.objectStore("meta").put(state.activeId||null,"active");
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
    });
  }catch(e){IDB.off=true;console.warn("Nebula: IndexedDB failed, falling back to localStorage",e);save()}
}
function scheduleIdb(){clearTimeout(IDB.t);IDB.t=setTimeout(idbWrite,250)}

/* encrypted key vault (PBKDF2 → AES-GCM) */
const te=new TextEncoder(),td0=new TextDecoder();
const b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let VK=null,VSALT=null,vT=null;
function vaultExists(){try{return !!localStorage.getItem(VAULT_KEY)}catch{return false}}
async function vKey(pass,salt){
  const m=await crypto.subtle.importKey("raw",te.encode(pass),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function writeVault(){
  if(!VK)return;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},VK,te.encode(JSON.stringify(state.settings.keys||{}))));
  localStorage.setItem(VAULT_KEY,JSON.stringify({v:1,salt:b64(VSALT),iv:b64(iv),data:b64(ct)}));
}
function scheduleVault(){clearTimeout(vT);vT=setTimeout(()=>writeVault().catch(e=>console.warn("Nebula: vault write failed",e)),200)}
async function vaultUnlock(pass){
  const v=JSON.parse(localStorage.getItem(VAULT_KEY)),salt=unb64(v.salt),k=await vKey(pass,salt);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(v.iv)},k,unb64(v.data));
  state.settings.keys=JSON.parse(td0.decode(pt));VK=k;VSALT=salt;
}
async function vaultEnable(pass){
  VSALT=crypto.getRandomValues(new Uint8Array(16));VK=await vKey(pass,VSALT);
  await writeVault();save();
}
function vaultDisable(){VK=null;VSALT=null;try{localStorage.removeItem(VAULT_KEY)}catch{}save()}
function trapFocus(root,e){
  const f=Array.from(root.querySelectorAll('button:not([disabled]),input:not([type="hidden"]),select,textarea,a[href]')).filter(x=>x.offsetParent!==null);
  if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
}
function passModal(o){
  return new Promise(res=>{
    const prev=document.activeElement,ov=document.createElement("div");
    ov.className="pass-ov";
    ov.innerHTML=`<form class="pass-box" role="dialog" aria-modal="true" aria-label="${escapeHtml(o.title)}"><h3>${escapeHtml(o.title)}</h3>${o.note?`<p>${escapeHtml(o.note)}</p>`:""}<input class="input" type="password" autocomplete="off" placeholder="Passphrase" aria-label="Passphrase">${o.confirm?'<input class="input" type="password" autocomplete="off" placeholder="Repeat passphrase" aria-label="Repeat passphrase">':""}<div class="pass-err" role="alert"></div><div class="btn-row">${o.cancel?'<button class="btn" type="button" data-p="cancel">Cancel</button>':""}${o.reset?'<button class="btn danger" type="button" data-p="reset">Erase saved keys</button>':""}<button class="btn primary" type="submit">${escapeHtml(o.ok||"Continue")}</button></div></form>`;
    document.body.appendChild(ov);
    const ins=$$("input",ov),err=$(".pass-err",ov);
    ins[0].focus();
    const done=v=>{ov.remove();if(prev&&prev.focus)prev.focus();res(v)};
    ov.addEventListener("click",e=>{const b=e.target.closest("[data-p]");if(b)done(b.dataset.p==="reset"?"reset":null)});
    ov.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&o.cancel){e.stopPropagation();done(null)}
      else if(e.key==="Tab")trapFocus(ov,e);
    });
    $("form",ov).addEventListener("submit",async e=>{
      e.preventDefault();
      const p=ins[0].value;
      if(!p){err.textContent="Enter a passphrase.";return}
      if(o.confirm&&ins[1].value!==p){err.textContent="The passphrases don’t match.";return}
      if(o.check){err.textContent="";const m=await o.check(p);if(m){err.textContent=m;return}}
      done(p);
    });
  });
}
async function vaultFlow(){
  if(!vaultExists())return;
  const r=await passModal({title:"Unlock your keys",note:"Your API keys are encrypted with a passphrase.",ok:"Unlock",reset:true,
    check:async p=>{try{await vaultUnlock(p);return ""}catch{return "Wrong passphrase."}}});
  if(r==="reset"){try{localStorage.removeItem(VAULT_KEY)}catch{}state.settings.keys={}}
}
async function toggleVault(){
  if(VK){
    if(confirm("Stop encrypting keys? They will be stored unencrypted in this browser.")){vaultDisable();renderPane();toast("Passphrase removed")}
    return;
  }
  const p=await passModal({title:"Set a passphrase",note:"You’ll enter it each time you open Nebula. If you forget it, saved keys can’t be recovered.",confirm:true,cancel:true,ok:"Encrypt keys"});
  if(p&&p!=="reset"){await vaultEnable(p);renderPane();toast("Keys encrypted")}
}

function save(){
  try{
    const s={...state.settings};
    if(VK)delete s.keys;
    localStorage.setItem(SET_KEY,JSON.stringify(s));
  }catch(e){console.warn("Nebula: could not persist settings",e)}
  if(VK)scheduleVault();
  if(IDB.off){
    try{localStorage.setItem(LS_KEY,JSON.stringify({chats:state.chats,activeId:state.activeId}))}
    catch(e){console.warn("Nebula: could not persist chats",e)}
  }else scheduleIdb();
}
async function loadAll(){
  let legacy=null,setRaw=null;
  try{setRaw=localStorage.getItem(SET_KEY);legacy=localStorage.getItem(LS_KEY)||localStorage.getItem("nebula.byok.v1")}catch{}
  const rec=await idbRead();
  let migrate=false;
  if(rec&&rec.chats.length)parseState(JSON.stringify({chats:rec.chats,activeId:rec.activeId}));
  else if(legacy){parseState(legacy);migrate=true}
  if(setRaw){try{state.settings={...DEFAULT_SETTINGS,...JSON.parse(setRaw)}}catch{}}
  state.settings.keys={...(state.settings.keys||{})};
  state.settings.fetched={...(state.settings.fetched||{})};
  await vaultFlow();
  migrateLegacyCustom();
  if(migrate&&!IDB.off){
    await idbWrite();
    if(!IDB.off){try{localStorage.removeItem(LS_KEY);localStorage.removeItem("nebula.byok.v1")}catch{}}
  }
  save();
}
