"use strict";
/* ---------- touch helpers, sheets, pickers, settings page ---------- */
const mobileQ=()=>window.matchMedia("(max-width: 760px)").matches;
function haptic(p){try{if(navigator.vibrate)navigator.vibrate(p||8)}catch{}}
const ICX='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/* generic bottom sheet with swipe-down dismiss */
const SHEETUI={ov:null,prev:null};
function closeSheetUI(quiet){
  if(SHEETUI.ov)SHEETUI.ov.remove();
  const p=SHEETUI.prev;SHEETUI.ov=null;SHEETUI.prev=null;
  if(!quiet&&p&&p.focus)p.focus();
}
function openSheetUI(title){
  closeSheetUI(true);
  SHEETUI.prev=document.activeElement;
  const ov=document.createElement("div");
  ov.className="sheet-ov";ov.id="sheetOv";
  ov.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="sheet-top"><div class="sheet-grab"></div><div class="sheet-head"><button class="icon-btn" type="button" data-sheet-close aria-label="Close">${ICX}</button><h3>${escapeHtml(title)}</h3><span></span></div></div><div class="sheet-body"></div></div>`;
  document.body.appendChild(ov);
  SHEETUI.ov=ov;
  const sh=ov.firstElementChild,top=sh.querySelector(".sheet-top");
  let y0=0,dy=0,drag=false;
  top.addEventListener("touchstart",e=>{y0=e.touches[0].clientY;dy=0;drag=true;sh.style.transition="none"},{passive:true});
  top.addEventListener("touchmove",e=>{if(!drag)return;dy=Math.max(0,e.touches[0].clientY-y0);sh.style.transform=`translateY(${dy}px)`},{passive:true});
  top.addEventListener("touchend",()=>{if(!drag)return;drag=false;sh.style.transition="";if(dy>90){haptic(6);closeSheetUI();if(typeof SHEET!=="undefined")SHEET.id=null}else sh.style.transform=""});
  ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest("[data-sheet-close]")){closeSheetUI();if(typeof SHEET!=="undefined")SHEET.id=null}});
  ov.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.stopPropagation();closeSheetUI();if(typeof SHEET!=="undefined")SHEET.id=null}
    else if(e.key==="Tab")trapFocus(ov,e);
  });
  haptic(6);
  return{ov,body:sh.querySelector(".sheet-body"),setTitle:t=>{sh.querySelector("h3").textContent=t;sh.setAttribute("aria-label",t)}};
}
function openPicker(o){
  const s=openSheetUI(o.title),items=o.items;
  const searchable=items.length>8||o.allowCustom;
  s.body.innerHTML=(searchable?'<div class="pk-search"><input class="in" placeholder="Search" aria-label="Search" spellcheck="false" autocomplete="off"></div>':"")+'<div class="pk-list" role="listbox"></div>';
  const inp=s.body.querySelector("input"),list=s.body.querySelector(".pk-list");
  const draw=()=>{
    const raw=inp?inp.value.trim():"",q=raw.toLowerCase();
    let h="",lastG=null;
    for(const x of items){
      if(!(x.l.toLowerCase().includes(q)||(x.g&&x.g.toLowerCase().includes(q))))continue;
      if(x.g&&x.g!==lastG){h+=`<div class="pk-group">${escapeHtml(x.g)}</div>`;lastG=x.g}
      h+=`<button class="pk-item${x.v===o.value?" sel":""}" role="option" aria-selected="${x.v===o.value}" type="button" data-v="${escapeHtml(x.v)}"><span class="pk-l">${escapeHtml(x.l)}</span>${x.sub?`<span class="pk-sub">${escapeHtml(x.sub)}</span>`:""}</button>`;
    }
    if(o.allowCustom&&raw&&!items.some(x=>x.v.toLowerCase()===q))h+=`<button class="pk-item" type="button" data-v="${escapeHtml(raw)}"><span class="pk-l">Use “${escapeHtml(raw)}”</span></button>`;
    list.innerHTML=h||'<div class="pk-none">No matches</div>';
  };
  if(inp)inp.addEventListener("input",draw);
  list.addEventListener("click",e=>{const b=e.target.closest("[data-v]");if(!b)return;haptic(8);closeSheetUI(true);o.onPick(b.dataset.v)});
  draw();
  const sel=list.querySelector(".sel");if(sel)sel.scrollIntoView({block:"center"});
  if(inp&&!mobileQ())inp.focus();
}

/* ---------- settings page ---------- */
const SP={stack:[],open:false,prev:null};
const ACCENTS=["#B5532E","#C25E3A","#D97757","#A8553A","#8B5CF6","#3B82F6","#14B8A6","#3E9A6B","#C98832","#EC4899","#64748B"];
const FONT_ITEMS=[{v:"inter",l:"Inter"},{v:"system",l:"System"},{v:"serif",l:"Serif"},{v:"mono",l:"Monospace"}];
const SP_TITLES={providers:"Providers",cp:"Provider",home:"Settings",voice:"Voice",web:"Web search",key:"API key",look:"Appearance",chat:"Chat",params:"Parameters",prompt:"System prompt",data:"Data"};
const CHEVR='<svg class="r-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const spRow=o=>`<button class="row${o.danger?" danger":""}" type="button" ${o.data||""}><span class="r-l">${escapeHtml(o.label)}</span>${o.value!=null?`<span class="r-v">${escapeHtml(o.value)}</span>`:""}${o.chev===false?"":CHEVR}</button>`;
const spToggle=(key,label)=>`<label class="row tog"><span class="r-l">${label}</span><span class="switch"><input type="checkbox" data-set="${key}"${state.settings[key]?" checked":""}><span class="slider-tg"></span></span></label>`;
const spGroup=rows=>`<div class="grp">${rows.join("")}</div>`;
const spRange=(key,label,min,max,step,fmt)=>`<div class="row static col"><div class="rng-h"><span class="r-l">${label}</span><span class="r-v" data-val="${key}">${fmt(state.settings[key])}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${state.settings[key]}" data-rng="${key}" aria-label="${label}"></div>`;
const fmt2=v=>(+v).toFixed(2);

function pageHome(){
  const s=state.settings,p=PROVIDERS[s.provider]||{name:"—"};
  const saved=!!cleanKey(s.keys&&s.keys[s.provider]);
  return spGroup([
    spRow({label:"Model",value:s.model||"Choose",data:'data-act="pick-model"'}),
    spRow({label:"Providers",value:p.name,data:'data-go="providers"'}),
    spRow({label:"API key",value:p.custom?(saved?"Saved":"Optional"):p.needsKey===false?"Not needed":(saved?"Saved":"Add"),data:'data-go="key"'})
  ])+spGroup([
    spRow({label:"Appearance",data:'data-go="look"'}),
    spRow({label:"Chat",data:'data-go="chat"'}),
    spRow({label:"Web search",value:(WEB_MODES.find(x=>x.v===state.settings.webMode)||WEB_MODES[0]).l,data:'data-go="web"'}),
    spRow({label:"Voice",data:'data-go="voice"'}),
    spRow({label:"Parameters",data:'data-go="params"'}),
    spRow({label:"System prompt",data:'data-go="prompt"'})
  ])+spGroup([spRow({label:"Data",data:'data-go="data"'})]);
}
function pageKey(){
  const s=state.settings,id=s.provider,p=PROVIDERS[id],key=cleanKey(s.keys&&s.keys[id]);
  let h="";
  if(p.custom)h+=spGroup([spRow({label:"Edit provider",value:p.base?p.base.replace(/^https?:\/\//,""):"No address",data:`data-act="cp-edit" data-v="${id}"`,chev:true})]);
  if(p.needsKey!==false||p.custom){
    h+=`<div class="field-in"><input class="in mono" id="keyIn" type="password" value="${escapeHtml(key)}" placeholder="${p.needsKey===false?"API key (optional)":"API key"}" autocomplete="off" spellcheck="false" aria-label="API key"></div>`;
    h+='<div class="chips"><button class="chip-btn" data-act="paste" type="button">Paste</button><button class="chip-btn" data-act="reveal" type="button">Show</button><button class="chip-btn" data-act="clear" type="button">Clear</button></div>';
  }
  h+=`<button class="cta" data-act="save-key" type="button">${p.needsKey===false&&!p.custom?"Refresh models":"Save"}</button><div class="status" id="ms-${id}" role="status">${escapeHtml(msText(id))}</div>`;
  if(p.keyUrl)h+=spGroup([`<a class="row" href="${escapeHtml(p.keyUrl)}" target="_blank" rel="noopener noreferrer"><span class="r-l">Get a key</span>${CHEVR}</a>`]);
  return h;
}
function pageLook(){
  const s=state.settings;
  const seg=`<div class="seg2" role="radiogroup" aria-label="Theme">${["light","dark"].map(t=>`<button type="button" role="radio" aria-checked="${s.theme===t}" class="${s.theme===t?"on":""}" data-act="theme" data-v="${t}">${t==="light"?"Light":"Dark"}</button>`).join("")}</div>`;
  const sw=`<div class="swatch-row">${ACCENTS.map(c=>`<button type="button" class="swatch${s.accent.toLowerCase()===c.toLowerCase()?" active":""}" data-act="accent" data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}<input type="color" class="color-input" data-act="accent-pick" value="${escapeHtml(s.accent)}" aria-label="Custom color"></div>`;
  const fontName=(FONT_ITEMS.find(x=>x.v===s.fontFamily)||FONT_ITEMS[0]).l;
  return `<div class="grp"><div class="row static col"><span class="r-l">Theme</span>${seg}</div><div class="row static col"><span class="r-l">Accent</span>${sw}</div></div>`+
    spGroup([spRow({label:"Font",value:fontName,data:'data-act="pick-font"'}),
      `<div class="row static"><span class="r-l">Text size</span><span class="step"><button type="button" data-act="fs" data-v="-1" aria-label="Smaller">−</button><b>${s.fontSize}</b><button type="button" data-act="fs" data-v="1" aria-label="Larger">+</button></span></div>`]);
}
function pageChat(){
  return spGroup([spToggle("streaming","Stream replies"),spToggle("reasoning","Reasoning"),spToggle("artifacts","Artifacts"),spToggle("autoTitle","Auto-title"),spToggle("autoScroll","Auto-scroll"),spToggle("sendOnEnter","Enter sends"),spToggle("useProxy","Use proxy"),spToggle("webImages","Web images"),spToggle("richUI","Rich components")]);
}
function pageParams(){
  return spGroup([spRange("temperature","Temperature",0,2,.05,fmt2),spRange("topP","Top P",.1,1,.05,fmt2),spRange("maxTokens","Max tokens",0,32000,256,v=>v>0?v:"Auto")])+spGroup([spRow({label:"Reset",data:'data-act="reset-params"',chev:false})]);
}
function pagePrompt(){
  return `<div class="field-in"><textarea class="in area" data-prompt rows="12" aria-label="System prompt" spellcheck="false">${escapeHtml(state.settings.systemPrompt)}</textarea></div>`+spGroup([spRow({label:"Reset",data:'data-act="reset-prompt"',chev:false})]);
}
function pageData(){
  return spGroup([spRow({label:"Encrypt keys",value:VK?"On":"Off",data:'data-act="vault"'})])+
    spGroup([spRow({label:"Export all chats",data:'data-act="export-all"',chev:false}),spRow({label:"Export this chat",data:'data-act="export-chat"',chev:false}),spRow({label:"Import",data:'data-act="import"',chev:false})])+
    spGroup([spRow({label:"Delete all chats",danger:true,data:'data-act="delete-all"',chev:false}),spRow({label:"Reset settings",danger:true,data:'data-act="reset"',chev:false})])+
    '<input type="file" id="importIn" accept="application/json,.json" hidden>';
}
function pageProviders(){
  const s=state.settings,cps=s.customProviders||[];
  const sub=id=>{const n=modelList(id).length;return providerUsable(id)?(n?n+" models":"Ready"):"Not set up"};
  const row=(id,act)=>`<button class="row" type="button" data-act="${act}" data-v="${id}"><span class="r-l">${escapeHtml(PROVIDERS[id].name)}${s.provider===id?' <span class="r-tag">Active</span>':""}</span><span class="r-v">${escapeHtml(sub(id))}</span>${CHEVR}</button>`;
  return `<div class="sp-note">Add as many providers as you like. Their models are combined in the model menu, so you can switch mid-conversation without losing anything.</div>`+
    spGroup([...cps.map(c=>row(c.id,"cp-edit")),spRow({label:"Add custom provider",data:'data-act="cp-new"',chev:true})])+
    `<div class="sp-sub">Built in</div>`+spGroup(Object.keys(PROVIDERS).filter(id=>!PROVIDERS[id].custom).map(id=>row(id,"prov-pick")));
}
function pageCp(){
  const d=SP.cp||{},ad=d.adapter==="anthropic"?"anthropic":"openai";
  const f=(k,label,ph,extra)=>`<div class="field-in"><label class="fl" for="cp-${k}">${label}</label><input class="in${k==="key"?" mono":""}" id="cp-${k}" data-cpf="${k}" ${extra||'type="text"'} value="${escapeHtml(d[k]||"")}" placeholder="${ph}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${label}"></div>`;
  return f("name","Name","e.g. Together, My gateway")+f("base","Base URL","https://api.example.com/v1",'type="text" inputmode="url"')+
    `<div class="field-in"><span class="fl">Protocol</span><div class="seg2" role="radiogroup" aria-label="Protocol">${[["openai","OpenAI-compatible"],["anthropic","Anthropic-compatible"]].map(([v,l])=>`<button type="button" role="radio" aria-checked="${ad===v}" class="${ad===v?"on":""}" data-act="cp-proto" data-v="${v}">${l}</button>`).join("")}</div></div>`+
    f("key","API key (optional)","Paste key",'type="password"')+
    `<div class="field-in"><label class="fl" for="cp-models">Extra models</label><textarea class="in area" id="cp-models" data-cpf="modelsText" rows="4" placeholder="One model id per line. Models the server lists are added automatically." spellcheck="false" autocapitalize="off" aria-label="Extra models">${escapeHtml(d.modelsText||"")}</textarea></div>`+
    `<button class="cta" type="button" data-act="cp-save">${d.id?"Save changes":"Add provider"}</button><div class="status" id="cpStatus" role="status"></div>`+
    (d.id?spGroup([spRow({label:"Remove this provider",danger:true,data:'data-act="cp-remove"',chev:false})]):"");
}
const SP_PAGES={providers:pageProviders,cp:pageCp,home:pageHome,voice:pageVoice,web:pageWeb,key:pageKey,look:pageLook,chat:pageChat,params:pageParams,prompt:pagePrompt,data:pageData};
function spRender(dir){
  const top=SP.stack[SP.stack.length-1]||"home",body=$("#spBody"),st=body.scrollTop;
  $("#spTitle").textContent=SP_TITLES[top]||"Settings";
  body.innerHTML=SP_PAGES[top]();
  body.className="sp-body"+(dir?" in-"+dir:"");
  body.scrollTop=dir?0:st;
}
const renderPane=()=>{if(SP.open)spRender()};
function spRefresh(){if(SP.open&&SP.stack[SP.stack.length-1]==="home")spRender()}
function openSettings(tab){
  if(!SP.open){SP.prev=document.activeElement;SP.stack=["home"]}
  SP.open=true;
  if(tab==="providers")SP.stack=(PROVIDERS[state.settings.provider]&&PROVIDERS[state.settings.provider].custom)?["home","providers"]:["home","key"];
  else if(tab==="voice")SP.stack=["home","voice"];
  const pg=$("#spage");
  spRender(tab?"fwd":"");
  pg.classList.add("open");pg.setAttribute("aria-hidden","false");
  setTimeout(()=>{const b=$("#spBack");if(b)b.focus({preventScroll:true})},60);
  if(tab==="model")setTimeout(()=>spAct("pick-model"),300);
}
function closeSettings(){
  SP.open=false;SP.stack=[];
  const pg=$("#spage");pg.classList.remove("open");pg.setAttribute("aria-hidden","true");
  closeSheetUI(true);
  const p=SP.prev;SP.prev=null;if(p&&p.focus)p.focus({preventScroll:true});
  const c=activeChat();if(!c||!c.messages.length)renderMessages();
  updateBadges();
}
function spBack(){if(SP.stack.length>1){SP.stack.pop();spRender("back")}else closeSettings()}
async function spSaveKey(){
  const s=state.settings,id=s.provider,p=PROVIDERS[id],i=$("#keyIn"),st=$("#spBody .status");
  if(i){const k=cleanKey(i.value);i.value=k;s.keys[id]=k}
  save();
  if(st)st.textContent="Checking…";
  await fetchModels(id);
  const r=MODEL_ST[id],st2=$("#spBody .status");
  if(!st2)return;
  st2.textContent=r&&r.s==="ok"?"Connected":(msText(id)||(p.needsKey!==false&&i&&!i.value?"Enter a key":""));
  haptic(r&&r.s==="ok"?10:[20,40,20]);
}
async function spAct(act,el){
  const s=state.settings;
  switch(act){
    case "prov-pick":{
      const id=el.dataset.v;
      applySetting("provider",id);
      if(!providerUsable(id)){SP.stack.push("key");spRender("fwd")}else spRender();
      break}
    case "cp-new":SP.cp={name:"",base:"",adapter:"openai",key:"",modelsText:""};SP.stack.push("cp");spRender("fwd");break;
    case "cp-edit":{
      const c=cpGet(el.dataset.v);if(!c)break;
      SP.cp={id:c.id,name:c.name,base:c.base,adapter:c.adapter,key:cleanKey(s.keys&&s.keys[c.id]),modelsText:(c.models||[]).join("\n")};
      if(SP.stack[SP.stack.length-1]!=="cp")SP.stack.push("cp");
      spRender("fwd");break}
    case "cp-proto":SP.cp.adapter=el.dataset.v;Array.from(document.querySelectorAll('[data-act="cp-proto"]')).forEach(b=>{const on=b.dataset.v===SP.cp.adapter;b.classList.toggle("on",on);b.setAttribute("aria-checked",String(on))});break;
    case "cp-save":{
      const d=SP.cp||{},st=$("#cpStatus");
      if(!/^https?:\/\/[^\s/]+/i.test(String(d.base||"").trim())){if(st)st.textContent="Enter the full base URL, starting with https://";break}
      const c=cpSave({id:d.id,name:d.name,base:d.base,adapter:d.adapter,key:d.key||"",models:String(d.modelsText||"").split(/[\n,]+/)});
      SP.cp.id=c.id;haptic(8);
      if(st)st.textContent="Checking…";
      await fetchModels(c.id);
      const r=MODEL_ST[c.id],n=modelList(c.id).length;
      if(n&&(state.settings.provider===c.id||!providerUsable(state.settings.provider)||!state.settings.model))useModel(c.id,modelList(c.id)[0]);
      SP.stack=SP.stack.filter(x=>x!=="cp");spRender("back");
      toast(r&&r.s==="ok"?`${c.name}: ${n} models`:(n?`${c.name} saved (${n} models)`:`${c.name} saved. ${msText(c.id)||"Add models manually."}`),r&&r.s==="ok"?"ok":undefined);
      break}
    case "cp-remove":{
      const d=SP.cp;if(!d||!d.id)break;
      if(!confirm("Remove "+(d.name||"this provider")+"? Your chats are not affected."))break;
      cpRemove(d.id);SP.stack=SP.stack.filter(x=>x!=="cp");spRender("back");break}
    case "pick-model":{
      const groups=allModelGroups();
      if(!groups.length){SP.stack.push("providers");spRender("fwd");break}
      const items=[];for(const g of groups)for(const m of g.models)items.push({v:g.id+"\u0001"+m,l:m,g:g.name});
      openPicker({title:"Model",value:s.provider+"\u0001"+s.model,allowCustom:true,items,onPick:v=>{const i=v.indexOf("\u0001");if(i<0)applySetting("model",v);else useModel(v.slice(0,i),v.slice(i+1));spRender()}});break}
    case "pick-font":
      openPicker({title:"Font",value:s.fontFamily,items:FONT_ITEMS,onPick:v=>{applySetting("fontFamily",v);spRender()}});break;
    case "theme":applySetting("theme",el.dataset.v);haptic(6);spRender();break;
    case "accent":applySetting("accent",el.dataset.v);haptic(6);spRender();break;
    case "fs":{const n=Math.max(13,Math.min(20,(+s.fontSize||16)+(+el.dataset.v)));applySetting("fontSize",n);haptic(4);spRender();break}
    case "paste":{try{const t=await navigator.clipboard.readText(),i=$("#keyIn");if(i)i.value=cleanKey(t)}catch{toast("Paste was blocked by the browser.","err")}break}
    case "reveal":{const i=$("#keyIn");if(i){const show=i.type==="password";i.type=show?"text":"password";el.textContent=show?"Hide":"Show"}break}
    case "clear":s.keys[s.provider]="";if(s.fetched)delete s.fetched[s.provider];save();haptic(8);spRender();break;
    case "save-key":await spSaveKey();break;
    case "pick-stt":openPicker({title:"Speech input",value:s.sttMode||"auto",items:STT_ITEMS,onPick:v=>{applySetting("sttMode",v);updateMicBtn();spRender()}});break;
    case "pick-lang":openPicker({title:"Language",value:s.voiceLang||"",items:VOICE_LANGS.map(([v,l])=>({v,l})),onPick:v=>{applySetting("voiceLang",v);spRender()}});break;
    case "pick-vengine":openPicker({title:"Voice engine",value:s.voiceEngine||"device",items:VENGINE_ITEMS,onPick:v=>{if(v==="cloud"&&!cleanKey(s.keys&&s.keys.openai)){toast("Add an OpenAI key first.","err");return}applySetting("voiceEngine",v);spRender()}});break;
    case "pick-voice":{
      const eng=s.voiceEngine;
      if(eng==="eleven"){openPicker({title:"Voice",value:s.elevenVoice||ELEVEN_VOICES[0].v,allowCustom:true,items:ELEVEN_VOICES,onPick:v=>{applySetting("elevenVoice",v);spRender()}});break}
      const items=eng==="cloud"?CLOUD_VOICES.map(v=>({v,l:v})):[{v:"",l:"Best available"}].concat(deviceVoices().filter(v=>!s.voiceLang||v.lang.startsWith(String(s.voiceLang).split("-")[0])).map(v=>({v:v.name,l:v.name,sub:v.lang})));
      openPicker({title:"Voice",value:eng==="cloud"?(s.cloudVoice||"alloy"):(s.voiceName||""),items,onPick:v=>{applySetting(eng==="cloud"?"cloudVoice":"voiceName",v);spRender()}});break}
    case "vrate":{const n=Math.min(1.5,Math.max(.7,Math.round(((+s.voiceRate||1)+(+el.dataset.v)*.1)*10)/10));applySetting("voiceRate",n);haptic(4);spRender();break}
    case "voice-preview":ttsStop();try{if(window.speechSynthesis)speechSynthesis.speak(new SpeechSynthesisUtterance(""))}catch{}ttsEnqueue("Hi, this is how I sound.");break;
    case "paste-el":{try{const t=await navigator.clipboard.readText(),i=$("#elKey");if(i){i.value=cleanKey(t);s.keys.elevenlabs=i.value;save();spRender()}}catch{toast("Paste was blocked by the browser.","err")}break}
    case "clear-el":s.keys.elevenlabs="";save();haptic(8);spRender();break;
    case "pick-webmode":openPicker({title:"Web search",value:s.webMode,items:WEB_MODES,onPick:v=>{applySetting("webMode",v);spRender()}});break;
    case "pick-webeng":openPicker({title:"Engine",value:s.webEngine,items:WEB_ENGINES,onPick:v=>{applySetting("webEngine",v);spRender()}});break;
    case "paste-tav":{try{const t=await navigator.clipboard.readText(),i=$("#tavKey");if(i){i.value=cleanKey(t);s.keys.tavily=i.value;save()}}catch{toast("Paste was blocked by the browser.","err")}break}
    case "clear-tav":s.keys.tavily="";save();haptic(8);spRender();break;
    case "test-web":{
      const st=$("#webStatus");if(st)st.textContent="Checking…";
      try{const r=await runSearch("Wikipedia");const e=$("#webStatus");if(e)e.textContent=r.length?`Connected · ${r.length} results`:"No results";haptic(10)}
      catch(e){const el=$("#webStatus");if(el)el.textContent=clip(e&&e.message||e,140);haptic([20,40,20])}
      break}
    case "reset-params":applySetting("temperature",DEFAULT_SETTINGS.temperature);applySetting("topP",DEFAULT_SETTINGS.topP);applySetting("maxTokens",0);spRender();break;
    case "reset-prompt":applySetting("systemPrompt",DEFAULT_SETTINGS.systemPrompt);spRender();break;
    case "vault":await toggleVault();break;
    case "export-all":if(!state.chats.length){toast("No chats to export.","err")}else exportAllJson();break;
    case "export-chat":exportCurrentChat();break;
    case "import":{const f=$("#importIn");if(f)f.click();break}
    case "delete-all":
      if(!state.chats.length){toast("No chats to delete.","err");break}
      if(confirm("Delete all chats? This can’t be undone.")){
        if(isStreaming&&abortController)abortController.abort();
        state.chats=[];state.activeId=null;renderMessages();renderChatList();save();haptic(12);toast("All chats deleted");
      }
      break;
    case "reset":
      if(confirm("Reset all settings? Your chats are kept.")){
        state.settings={...DEFAULT_SETTINGS,customProviders:[],keys:{},fetched:{}};
        syncCustomProviders();applyTheme();applyAccent();applyTypography();save();renderMessages();renderChatList();updateBadges();spRender();toast("Settings reset");
      }
      break;
  }
}
$("#spBack").addEventListener("click",spBack);
$("#spage").addEventListener("keydown",e=>{if(e.key==="Tab")trapFocus($("#spage"),e)});
$("#spBody").addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");
  if(g){haptic(5);SP.stack.push(g.dataset.go);spRender("fwd");return}
  const a=e.target.closest("[data-act]");
  if(a)spAct(a.dataset.act,a);
});
$("#spBody").addEventListener("input",e=>{
  const t=e.target;
  if(t.dataset.rng){
    const v=parseFloat(t.value),k=t.dataset.rng;
    applySetting(k,v);
    const o=$(`[data-val="${k}"]`);
    if(o)o.textContent=k==="maxTokens"?(v>0?v:"Auto"):fmt2(v);
  }else if(t.dataset.prompt!==undefined)applySetting("systemPrompt",t.value);
  else if(t.dataset.cpf){if(SP.cp)SP.cp[t.dataset.cpf]=t.value}
  else if(t.id==="elKey"){state.settings.keys.elevenlabs=cleanKey(t.value);save()}
  else if(t.id==="tavKey"){state.settings.keys.tavily=cleanKey(t.value);save()}
  else if(t.dataset.searx!==undefined)applySetting("searxUrl",t.value);
  else if(t.dataset.act==="accent-pick")applySetting("accent",t.value);
});
$("#spBody").addEventListener("change",e=>{
  const t=e.target;
  if(t.dataset.set){applySetting(t.dataset.set,t.checked);haptic(6)}
  else if(t.id==="importIn"&&t.files&&t.files[0]){importJsonFile(t.files[0]);t.value=""}
});

/* ---------- touch navigation: edge swipes, overlay tap ---------- */
function setSidebar(open){
  const app=$("#app");
  app.classList.toggle("sidebar-closed",!open);
  state.settings.sidebarClosed=!open;
  save();haptic(6);
}
(function touchNav(){
  let x0=0,y0=0,mode=null;
  const blocked=()=>!!document.querySelector(".sheet-ov,.pass-ov,.pal-ov");
  document.addEventListener("touchstart",e=>{
    const t=e.touches[0];x0=t.clientX;y0=t.clientY;mode=null;
    if(blocked())return;
    const closed=$("#app").classList.contains("sidebar-closed");
    if(SP.open){if(x0<28)mode="spback"}
    else if(closed&&x0<24)mode="open";
    else if(!closed&&mobileQ())mode="close";
  },{passive:true});
  document.addEventListener("touchend",e=>{
    if(!mode)return;
    const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0,m=mode;
    mode=null;
    if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.6)return;
    if(m==="spback"&&dx>0){haptic(6);spBack()}
    else if(m==="open"&&dx>0)setSidebar(true);
    else if(m==="close"&&dx<0)setSidebar(false);
  },{passive:true});
  $("#app").addEventListener("click",e=>{
    if(e.target===$("#app")&&mobileQ()&&!$("#app").classList.contains("sidebar-closed"))setSidebar(false);
  });
})();

function pageWeb(){
  const s=state.settings,eng=s.webEngine||"wikipedia";
  let h=spGroup([
    spRow({label:"Mode",value:(WEB_MODES.find(x=>x.v===s.webMode)||WEB_MODES[0]).l,data:'data-act="pick-webmode"'}),
    spRow({label:"Engine",value:(WEB_ENGINES.find(x=>x.v===eng)||WEB_ENGINES[0]).l,data:'data-act="pick-webeng"'})
  ]);
  if(eng==="tavily")h+=`<div class="field-in"><input class="in mono" id="tavKey" type="password" value="${escapeHtml(cleanKey(s.keys&&s.keys.tavily))}" placeholder="Tavily API key" autocomplete="off" spellcheck="false" aria-label="Tavily API key"></div><div class="chips"><button class="chip-btn" data-act="paste-tav" type="button">Paste</button><button class="chip-btn" data-act="clear-tav" type="button">Clear</button></div>`;
  if(eng==="searxng")h+=`<div class="field-in"><input class="in" data-searx type="text" value="${escapeHtml(s.searxUrl||"")}" placeholder="https://search.example.com" autocomplete="off" spellcheck="false" inputmode="url" aria-label="SearXNG address"></div>`;
  return h+'<button class="cta" data-act="test-web" type="button">Test</button><div class="status" id="webStatus" role="status"></div>';
}

const STT_ITEMS=[{v:"auto",l:"Auto"},{v:"browser",l:"Browser"},{v:"whisper",l:"Whisper"}];
const VENGINE_ITEMS=[{v:"device",l:"This device"},{v:"cloud",l:"OpenAI"},{v:"eleven",l:"ElevenLabs"}];
function pageVoice(){
  const s=state.settings,lbl=(a,v)=>(a.find(x=>x.v===v)||a[0]).l,eng=s.voiceEngine||"device";
  const voiceVal=eng==="cloud"?(s.cloudVoice||"alloy"):eng==="eleven"?((ELEVEN_VOICES.find(x=>x.v===(s.elevenVoice||ELEVEN_VOICES[0].v))||{}).l||"Custom"):(s.voiceName||"Best available");
  let h=spGroup([
    spRow({label:"Voice engine",value:lbl(VENGINE_ITEMS,eng),data:'data-act="pick-vengine"'}),
    spRow({label:"Voice",value:voiceVal,data:'data-act="pick-voice"'}),
    `<div class="row static"><span class="r-l">Speed</span><span class="step"><button type="button" data-act="vrate" data-v="-1" aria-label="Slower">−</button><b>${(+s.voiceRate||1).toFixed(1)}</b><button type="button" data-act="vrate" data-v="1" aria-label="Faster">+</button></span></div>`
  ]);
  if(eng==="eleven")h+=`<div class="field-in"><input class="in mono" id="elKey" type="password" value="${escapeHtml(cleanKey(s.keys&&s.keys.elevenlabs))}" placeholder="ElevenLabs API key" autocomplete="off" spellcheck="false" aria-label="ElevenLabs API key"></div><div class="chips"><button class="chip-btn" data-act="paste-el" type="button">Paste</button><button class="chip-btn" data-act="clear-el" type="button">Clear</button></div>`;
  h+=spGroup([spRow({label:"Preview",data:'data-act="voice-preview"',chev:false})]);
  h+=spGroup([
    spRow({label:"Speech input",value:lbl(STT_ITEMS,s.sttMode||"auto"),data:'data-act="pick-stt"'}),
    spRow({label:"Language",value:(VOICE_LANGS.find(x=>x[0]===(s.voiceLang||""))||VOICE_LANGS[0])[1],data:'data-act="pick-lang"'}),
    spToggle("dictAutoSend","Send after dictation"),
    spToggle("liveCaptions","Live captions"),
    spToggle("bargeIn","Talk over replies")
  ]);
  return h;
}
