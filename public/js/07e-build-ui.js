"use strict";
/* ---------- build mode UI ---------- */
const BIC={
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  term:'<path d="m5 8 4 4-4 4M12 17h7"/>',
  book:'<path d="M3 5.5c3-.8 6-.4 9 1.5 3-1.900 6-2.300 9-1.500v13c-3-.8-6-.4-9 1.500-3-1.900-6-2.300-9-1.500Z"/>',
  search:'<circle cx="11" cy="11" r="6.500"/><path d="m20 20-4-4"/>',
  eye:'<path d="M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12Z"/><circle cx="12" cy="12" r="2.800"/>',
  box:'<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  play:'<path d="M7 4.500v15l12-7.500Z"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  check:'<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.700 3.700 5.700 3.700 9s-1.200 6.300-3.700 9c-2.500-2.700-3.700-5.700-3.700-9S9.500 5.700 12 3Z"/>',
  stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
  plan:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.500 6 1.200 1.200L6.800 5M3.500 12l1.200 1.200L6.800 11M3.500 18l1.200 1.200 2.100-2.200"/>'
};
const bsvg=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BIC[n]||BIC.file}</svg>`;
const ACT_META={write:["file","Wrote"],edit:["file","Edited"],delete:["trash","Deleted"],read:["file","Read"],ls:["list","Listed"],guide:["book","Guide"],search:["search","Searched"],fetch:["globe","Fetched"],view:["eye","Viewed"],serve:["play","Server"],stop:["stop","Stopped"],run:["term","Run"],deliver:["box","Deliver"],done:["check","Done"],plan:["plan","Plan"]};

/* ----- action cards inside messages ----- */
function extractActs(text,blocks,opts){
  const{acts,open}=scanActs(text);
  let out="",last=0;
  acts.forEach((a,k)=>{
    if(a.type==="plan"&&opts.hidePlan){out+=text.slice(last,a.start);last=a.end;return}
    out+=text.slice(last,a.start)+"\n"+CODE_MARK+(blocks.push({act:true,idx:k,type:a.type,attrs:a.attrs,body:a.body,rec:opts.acts&&opts.acts[k]})-1)+"\uE000\n";
    last=a.end;
  });
  if(open){out+=text.slice(last,open.start)+"\n"+CODE_MARK+(blocks.push({act:true,open:true,type:open.type,attrs:open.attrs,body:open.body})-1)+"\uE000\n";last=text.length}
  return out+text.slice(last);
}
/* file-type badges: a small page with the format on it */
const FILE_KINDS={html:["HTML","web"],htm:["HTML","web"],css:["CSS","css"],scss:["SCSS","css"],less:["LESS","css"],js:["JS","js"],mjs:["JS","js"],cjs:["JS","js"],jsx:["JSX","js"],ts:["TS","ts"],tsx:["TSX","ts"],json:["JSON","json"],md:["MD","md"],txt:["TXT","md"],py:["PY","py"],sh:["SH","sh"],bash:["SH","sh"],sql:["SQL","sql"],yml:["YML","cfg"],yaml:["YML","cfg"],toml:["TOML","cfg"],env:["ENV","cfg"],ini:["INI","cfg"],svg:["SVG","img"],png:["IMG","img"],jpg:["IMG","img"],jpeg:["IMG","img"],gif:["GIF","img"],webp:["IMG","img"],avif:["IMG","img"],ico:["ICO","img"],pdf:["PDF","pdf"],pptx:["PPT","ppt"],docx:["DOC","doc"],xlsx:["XLS","xls"],csv:["CSV","xls"],zip:["ZIP","zip"],go:["GO","code"],rs:["RS","code"],java:["JAVA","code"],c:["C","code"],cpp:["C++","code"],rb:["RB","code"],php:["PHP","code"],vue:["VUE","web"],svelte:["SV","web"],lock:["LOCK","cfg"]};
function fileIcon(name,small){
  const n=String(name||""),base=n.split("/").pop();
  const m=/\.([A-Za-z0-9+]+)$/.exec(base);
  let ext=m?m[1].toLowerCase():"";
  if(!ext&&/^(Dockerfile|Makefile)$/.test(base))ext="sh";
  const k=FILE_KINDS[ext]||[(ext||"FILE").slice(0,4).toUpperCase(),"file"];
  return `<span class="fi${small?" fi-s":""} fk-${k[1]}" aria-hidden="true"><i>${escapeHtml(k[0])}</i></span>`;
}
/* a human label for a shell command; the literal command stays available when the row is opened */
function cmdLabel(cmd){
  const c=String(cmd||"").trim();
  const T=[[/\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b/,"Installing packages"],[/\bpip3?\s+install\b|-m pip install/,"Installing Python packages"],[/-m venv|virtualenv/,"Creating Python environment"],[/\b(npm|pnpm|yarn)\s+(run\s+)?build\b|\bvite build\b|\btsc\b|\bnext build\b/,"Building"],[/\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bpytest\b|\bvitest\b|\bjest\b|node --test|go test|cargo test/,"Running tests"],[/\buname\b|\bnode -v\b|\bnpm -v\b|\bpython3? -V\b|\bwhich\b/,"Checking the environment"],[/\bcurl\b|\bwget\b/,"Checking the app"],[/\bsoffice\b|\bpdftoppm\b|get_pixmap|\bfitz\b/,"Rendering a preview"],[/^zip\b|\bzip -r\b/,"Packaging"],[/^git\b/,"Using git"],[/^(ls|find|tree|cat|head|tail|wc|du|stat)\b/,"Inspecting files"],[/^(mkdir|cp|mv|rm|touch|chmod|ln)\b/,"Organising files"]];
  for(const[re,l]of T)if(re.test(c))return l;
  const m=/^(python3?|node)\s+([^\s;&|-][^\s;&|]*)/.exec(c);
  if(m)return "Running "+m[2].split("/").pop();
  return "Running a command";
}
const planCollapsed=rec=>rec.collapsed!==false;
function planNext(body){
  const all=String(body).match(/^\s*[-*]\s*\[[ xX]\].*$/gm)||[];
  if(!all.length)return "";
  const open=all.find(l=>/\[ \]/.test(l));
  return open?open.replace(/^\s*[-*]\s*\[ \]\s*/,"").trim():"All steps done";
}
function actPlanProgress(body){
  const done=(String(body).match(/^\s*[-*]\s*\[[xX]\]/gm)||[]).length,all=(String(body).match(/^\s*[-*]\s*\[[ xX]\]/gm)||[]).length;
  return all?`${done}/${all}`:"";
}
function actCardHtml(b){
  const E2=escapeHtml,rec=b.rec||{},A=b.attrs||{},t=b.type;
  const st=b.open?"run":(rec.status==="running"||rec.status==="queued"?"run":rec.status||"wait");
  const meta=ACT_META[t]||ACT_META.file,stat='<span class="act-st" aria-hidden="true"></span>';
  const sic=`<span class="act-ic">${bsvg(meta[0])}</span>`,ai=` data-ai="${b.idx}"`;
  const row=(cls,icon,title,sub,extra,tag)=>`<${tag||"div"} class="act ${cls} st-${st}"${extra||""}>${icon}<span class="act-t">${title}</span>${sub?`<span class="act-s">${E2(sub)}</span>`:""}${stat}</${tag||"div"}>`;
  const path=rec.path||A.path||"";
  const nameHtml=p=>{const i=p.lastIndexOf("/");return `${E2(p.slice(i+1))}${i>=0?`<em>${E2(p.slice(0,i+1))}</em>`:""}`};
  if(b.open){
    if(t==="write"||t==="edit")return row("act-file",fileIcon(path||"file",true),path?nameHtml(path):"file",t==="write"?`${String(b.body).split("\n").length} lines`:"editing");
    return row("act-chip",sic,t==="run"?E2(A.label||"Running a command"):meta[1],"");
  }
  if(t==="write"||t==="edit")return row("act-link act-file",fileIcon(path,true),nameHtml(path||"file"),rec.summary||(t==="write"?"writing":"editing"),ai,"button");
  if(t==="run"){
    const full=(A.cmd||unfence(b.body)).trim(),cmd=full.split("\n")[0],open=rec.open===true||(rec.open===undefined&&rec.status==="err");
    return `<div class="act act-run st-${st}${open?" open":""}"><button class="act-h" type="button"${ai} aria-expanded="${open}">${sic}<span class="act-t">${E2(A.label||cmdLabel(cmd))}</span><span class="act-s">${E2(rec.summary||(st==="run"?"running":""))}</span>${stat}<span class="act-cv" aria-hidden="true"></span></button><div class="act-wrap"><div class="act-in"><pre class="act-out"><span class="act-cmd">$ ${E2(full)}</span>\n${E2(String(rec.out||"").slice(-2200))}</pre></div></div></div>`;
  }
  if(t==="serve")return row("act-link act-prev",sic,E2("Server · "+(A.name||"server")),rec.summary||"starting",ai,"button");
  if(t==="deliver"){
    const files=rec.files||[];
    return `<div class="act-card act-dl st-${st}"><div class="act-dh">Ready to download</div>${files.map((f,j)=>`<div class="act-df">${fileIcon(f.kind==="zip"?f.name+".zip":f.path||f.name)}<span class="act-t">${E2(f.name+(f.kind==="zip"?".zip":""))}</span><span class="act-s">${f.size?fmtSize(f.size):""}</span>${/\.(pdf|png|jpe?g|webp|gif)$/i.test(f.path||"")?`<button class="act-b" type="button"${ai} data-fi="${j}" data-pv="1">View</button>`:""}<button class="act-b pri" type="button"${ai} data-fi="${j}">Download</button></div>`).join("")}</div>`;
  }
  if(t==="done")return `<div class="act-done"><span class="act-lab">Done</span><div class="act-body md">${renderMarkdown(String(b.body).trim())}</div></div>`;
  if(t==="plan"){
    const collapsed=planCollapsed(rec),prog=actPlanProgress(b.body),next=planNext(b.body);
    return `<div class="act-card act-plan${collapsed?" collapsed":""}"><button class="act-h" type="button"${ai} aria-expanded="${!collapsed}"><span class="act-t">Plan${collapsed&&next?`<em>${E2(next)}</em>`:""}</span>${prog?`<span class="act-prog">${prog}</span>`:""}<span class="act-cv" aria-hidden="true"></span></button><div class="act-wrap"><div class="act-in"><div class="act-body md">${renderMarkdown(String(b.body).trim())}</div></div></div></div>`;
  }
  const label=t==="search"?(A.q||b.body||""):t==="fetch"?(A.url||""):t==="guide"?(A.name||""):(A.path||".");
  const icon=(t==="read"&&A.path)?fileIcon(A.path,true):sic;
  return row("act-chip",icon,E2(`${meta[1]} ${label}`.trim()),rec.summary||"",ai);
}

/* ----- modes ----- */
function applyMode(){
  const b=state.settings.mode==="build";
  document.documentElement.dataset.mode=b?"build":"chat";
  Array.from(document.querySelectorAll("#modeSeg button")).forEach(x=>{const on=x.dataset.mode===(b?"build":"chat");x.classList.toggle("on",on);x.setAttribute("aria-selected",String(on))});
  $("#input").placeholder=b?"Describe what to build":"Message";
  const f=$("#benchFab");if(f)f.hidden=!b;
}
function setMode(m){
  if(isStreaming){toast("Stop the current run first.","err");return}
  m=m==="build"?"build":"chat";
  state.settings.mode=m;
  const c=activeChat();
  if(c&&((c.mode==="build")!==(m==="build"))){const r=state.chats.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).find(x=>(x.mode==="build")===(m==="build"));state.activeId=r?r.id:null}
  if(m==="build")buildConfig();else benchClose();
  applyMode();save();renderMessages();renderChatList();updateBadges();closeSidebarIfMobile();
  haptic(6);
}
function buildConnectHtml(){
  const local=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  return `<div class="b-conn"><b>${local?"Build mode is switched off":"Connect a build server"}</b><span>${local?"Start Nebula with <code>npm run start:build</code> and reload, or connect to a remote build server:":"Build mode runs commands, so it needs a server you control (this hosting can’t run them). Enter its address and token:"}</span><input id="bsUrl" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://build.example.com" value="${escapeHtml(bServer())}" aria-label="Build server address"><input id="bsTok" type="password" autocomplete="off" placeholder="Build token" aria-label="Build token"><button class="bn-btn pri" type="button" data-bs="go">Connect</button>${BUILD.err?`<small class="b-err" role="alert">${escapeHtml(BUILD.err)}</small>`:""}</div>`;
}
function buildEmptyHtml(){
  const cfg=BUILD.cfg;let status="";
  if(cfg===undefined){status='<div class="b-status"><span class="ring"></span>Checking the build server</div>';buildConfig().then(()=>{const c=activeChat();if(state.settings.mode==="build"&&(!c||!c.messages.length))renderMessages()})}
  else if(!cfg||!cfg.enabled)status=buildConnectHtml();
  else{
    let host="";if(cfg.remote){try{host=new URL(BUILD.base).host}catch{host=BUILD.base}}
    status=`<div class="b-status">${cfg.remote?`Connected to ${escapeHtml(host)} · `:""}${cfg.sandbox==="docker"?"Docker sandbox":"Local workspace"} ready${cfg.remote?' <button class="b-link" type="button" data-bs="off">Disconnect</button>':""}</div>`;
  }
  return `<div class="empty build-empty"><div class="empty-logo"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#brand-logo"/></svg></div><h2>What shall we build?</h2>${status}<div class="bsuggs">${BUILD_SUGGESTIONS.map(([t,p])=>`<button class="bsugg" type="button" data-sugg="${escapeHtml(p)}"><b>${escapeHtml(t)}</b></button>`).join("")}</div></div>`;
}

/* ----- status bar above the composer: working, or paused with a way to carry on ----- */
function ensureBar(){
  let bar=$("#bbar");
  if(bar)return bar;
  bar=document.createElement("div");bar.id="bbar";bar.className="bbar";bar.hidden=true;
  bar.innerHTML='<span class="ring"></span><span class="bb-t"></span><span class="bb-s"></span><button class="bb-alt" type="button" hidden>Model</button><button class="bb-go" type="button">Stop</button>';
  $(".composer").prepend(bar);
  bar.querySelector(".bb-go").addEventListener("click",()=>{haptic(8);BUILD.busy?buildStop():buildContinue()});
  bar.querySelector(".bb-alt").addEventListener("click",()=>{haptic(5);openModelPop()});
  return bar;
}
function showBar(v){const bar=ensureBar();bar.hidden=!v;const a=$("#app");if(a)a.classList.toggle("has-bbar",!!v)}
function bStatus(text){
  const bar=ensureBar();
  BUILD.status=text;
  if(!text){return}
  showBar(true);bar.classList.remove("attn");
  bar.querySelector(".bb-t").textContent=text;
  bar.querySelector(".bb-s").textContent=BUILD.step?`step ${BUILD.step}`:"";
  bar.querySelector(".bb-alt").hidden=true;
  bar.querySelector(".bb-go").textContent="Stop";
}
function updateResume(){
  const bar=ensureBar(),c=activeChat();
  if(BUILD.busy)return;
  if(!isBuildChat(c)||!buildResumable(c)){showBar(false);bar.classList.remove("attn");return}
  const err=BUILD.error&&BUILD.errorChat===c.id?BUILD.error:"";
  showBar(true);bar.classList.add("attn");
  bar.querySelector(".bb-t").textContent=err||"Paused. Continue where it left off.";
  bar.querySelector(".bb-s").textContent="";
  bar.querySelector(".bb-alt").hidden=!err;
  bar.querySelector(".bb-go").textContent="Continue";
}
function benchTick(){
  if(!BUILD.busy)return;
  const c=activeChat();if(!c)return;
  const m=c.messages[c.messages.length-1];if(!m||m.role!=="assistant")return;
  const run=(m.acts||[]).find(r=>r.status==="running");
  if(m.open)bStatus(m.open.type==="write"?`Writing ${m.open.path||"file"} · ${m.open.lines} lines`:"Working");
  else if(run)bStatus(run.type==="run"?"Running "+String(run.cmd||"").slice(0,60):run.type==="serve"?"Starting server":run.type==="guide"?"Reading guide":"Working");
  else bStatus("Thinking");
}

/* ----- workbench ----- */
let benchEl=null;
function ensureBench(){
  if(benchEl)return benchEl;
  benchEl=document.createElement("aside");
  benchEl.className="bench";benchEl.id="bench";benchEl.setAttribute("aria-label","Workbench");
  $("#app").appendChild(benchEl);
  benchEl.addEventListener("click",benchClick);
  benchEl.addEventListener("submit",benchSubmit);
  return benchEl;
}
const benchIsOpen=()=>$("#app").classList.contains("bench-open");
function benchOpen(tab){
  if(!isBuildChat(activeChat()))return;
  ensureBench();
  if(typeof closeViewer==="function"&&curArt)closeViewer();
  if(tab&&tab!==BUILD.tab){BUILD.tab=tab;BUILD.view=""}
  $("#app").classList.add("bench-open");
  if(window.innerWidth<1300)$("#app").classList.add("sidebar-closed");
  renderBench();benchRefresh();
}
function benchClose(){const a=$("#app");if(a)a.classList.remove("bench-open")}
function renderBench(){
  const b=ensureBench(),c=activeChat();
  const tabs=[["files","Files"],["term","Terminal"],["prev","Preview"]];
  b.innerHTML=`<div class="bn-head"><div class="bn-title">${escapeHtml((BUILD.tree&&BUILD.tree.name)||(c&&c.title)||"Workbench")}</div><div class="bn-tabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" role="tab" data-bt="${k}" class="${BUILD.tab===k?"on":""}" aria-selected="${BUILD.tab===k}">${l}</button>`).join("")}</div><button class="icon-btn" type="button" data-bn="close" aria-label="Close workbench">${ICX}</button></div><div class="bn-body" id="bnBody"></div>`;
  renderBnBody();
}
function renderBnBody(){
  const body=$("#bnBody");if(!body)return;
  if(BUILD.tab==="files")bnFiles(body);else if(BUILD.tab==="term")bnTerm(body);else bnPrev(body);
}
async function benchRefresh(){
  const c=activeChat();
  if(!isBuildChat(c)||!c.ws||!hasBuild())return;
  try{BUILD.tree=await bJson(wsUrl(c,"tree"));BUILD.treeWs=c.ws}catch{return}
  if(benchIsOpen()&&BUILD.tab==="files"&&!BUILD.view)renderBnBody();
  const f=$("#benchFab");if(f)f.classList.toggle("has",!!(BUILD.tree&&BUILD.tree.files.some(x=>!x.d)));
}
function bnFiles(body){
  if(BUILD.view){bnFile(body,BUILD.view);return}
  const t=BUILD.tree,files=t?t.files:[];
  const head='<div class="bn-bar"><button class="bn-btn" type="button" data-bn="refresh">Refresh</button><button class="bn-btn pri" type="button" data-bn="zip">Download zip</button></div>';
  if(!files.length){body.innerHTML=head+'<div class="bn-empty">Files the agent writes appear here.</div>';return}
  const rows=[];
  for(const f of files){
    const parts=f.p.split("/"),depth=parts.length-1;
    let hidden=false;
    for(let i=1;i<parts.length;i++)if(BUILD.open.has(parts.slice(0,i).join("/"))){hidden=true;break}
    if(hidden)continue;
    const name=parts[parts.length-1];
    rows.push(f.d?`<button class="bn-row dir${f.hidden?" dim":""}" type="button" data-bd="${escapeHtml(f.p)}" style="--d:${depth}"><span class="bn-caret${BUILD.open.has(f.p)?"":" open"}"></span>${escapeHtml(name)}</button>`
      :`<button class="bn-row file" type="button" data-bf="${escapeHtml(f.p)}" style="--d:${depth}">${fileIcon(f.p,true)}<span class="bn-n">${escapeHtml(name)}</span><span class="bn-sz">${fmtSize(f.s||0)}</span></button>`);
  }
  body.innerHTML=head+`<div class="bn-tree">${rows.join("")}</div>`;
}
async function bnFile(body,p){
  const c=activeChat(),ext=attExt(p);
  body.innerHTML=`<div class="bn-bar"><button class="bn-btn" type="button" data-bn="back">Back</button><span class="bn-path">${escapeHtml(p)}</span></div><div class="bn-load"><span class="ring"></span></div>`;
  try{
    const r=await bJson(wsUrl(c,"file")+"?path="+encodeURIComponent(p));
    if(BUILD.view!==p)return;
    const bar=`<div class="bn-bar"><button class="bn-btn" type="button" data-bn="back">Back</button>${fileIcon(p,true)}<span class="bn-path">${escapeHtml(p)}</span><button class="bn-btn" type="button" data-bn="copy">Copy</button><button class="bn-btn" type="button" data-bn="edit">Edit</button><button class="bn-btn" type="button" data-bn="dl">Download</button></div>`;
    if(r.binary){
      const rr=await bApi(wsUrl(c,"file")+"?path="+encodeURIComponent(p)+"&raw=1"),blob=await rr.blob(),u=URL.createObjectURL(blob);
      if(BUILD.blobUrl)URL.revokeObjectURL(BUILD.blobUrl);BUILD.blobUrl=u;
      const view=/^(png|jpe?g|gif|webp|avif|svg)$/.test(ext)?`<div class="v-img"><img alt="" src="${u}"></div>`:ext==="pdf"?`<iframe class="v-frame" src="${u}"></iframe>`:`<div class="bn-empty">Binary file · ${fmtSize(r.size)}</div>`;
      body.innerHTML=bar.replace('<button class="bn-btn" type="button" data-bn="copy">Copy</button><button class="bn-btn" type="button" data-bn="edit">Edit</button>','')+`<div class="bn-view">${view}</div>`;return;
    }
    BUILD.cur=r.content;
    body.innerHTML=bar+`<div class="bn-view"><pre class="bn-code"><code>${highlightCode(r.content,ext)}</code></pre></div>`;
  }catch(e){body.innerHTML=`<div class="bn-bar"><button class="bn-btn" type="button" data-bn="back">Back</button></div><div class="bn-empty">${escapeHtml(String(e.message||e))}</div>`}
}
function benchFile(p){BUILD.tab="files";BUILD.view=p;if(!benchIsOpen())benchOpen("files");else renderBench()}
function bnTerm(body){
  body.innerHTML=`<pre class="bn-term" id="bnTerm">${BUILD.term.map(l=>`<span class="t-${l.c}">${escapeHtml(l.t)}</span>`).join("")||'<span class="t-dim">Command output appears here.</span>'}</pre><form class="bn-cmd" id="bnCmd"><span>$</span><input placeholder="Run a command in the workspace" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command"><button class="bn-btn pri" type="submit">Run</button></form>`;
  const t=$("#bnTerm");t.scrollTop=t.scrollHeight;
}
function benchTermAppend(cls,text){
  const t=$("#bnTerm");
  if(!t||BUILD.tab!=="term")return;
  const dim=t.querySelector(".t-dim");if(dim)dim.remove();
  const s=document.createElement("span");s.className="t-"+cls;s.textContent=text;t.appendChild(s);
  while(t.childElementCount>1500)t.firstChild.remove();
  t.scrollTop=t.scrollHeight;
}
async function benchSubmit(e){
  if(!e.target.closest("#bnCmd"))return;
  e.preventDefault();
  const inp=e.target.querySelector("input"),cmd=inp.value.trim(),c=activeChat();
  if(!cmd||!c||!c.ws)return;
  if(BUILD.busy){toast("The agent is working. Stop it first.","err");return}
  inp.value="";inp.disabled=true;
  termPrint("$ "+cmd+"\n","c");
  try{const r=await bExec(c,cmd,{timeout:600,onData:d=>termPrint(d,"o")});termPrint(`exit ${r.code}\n`,r.code===0?"ok":"err")}
  catch(er){termPrint(String(er.message||er)+"\n","err")}
  inp.disabled=false;inp.focus();benchRefresh();
}
async function ensurePreview(chat){
  if(!BUILD.cfg||!BUILD.cfg.remote||!chat||!chat.ws||BUILD.pv[chat.ws])return;
  try{const r=await bJson(wsUrl(chat,"preview-url"));if(r.path)BUILD.pv[chat.ws]=BUILD.base+r.path}catch{}
}
function previewUrl(){
  const c=activeChat();
  if(!c||!c.ws||!BUILD.cfg)return "";
  if(BUILD.cfg.remote)return BUILD.pv[c.ws]||"";
  return BUILD.cfg.previewOrigin?BUILD.cfg.previewOrigin.replace("{id}",c.ws)+"/":"";
}
function bnPrev(body){
  const c=activeChat(),remote=!!(BUILD.cfg&&BUILD.cfg.remote);
  if(remote&&c&&c.ws&&!BUILD.pv[c.ws]){body.innerHTML='<div class="bn-load"><span class="ring"></span></div>';ensurePreview(c).then(()=>{if(BUILD.tab==="prev"&&benchIsOpen())renderBnBody()});return}
  const u=previewUrl(),local=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if(!u||(!remote&&!local)){body.innerHTML='<div class="bn-empty">Live preview needs a server that is running an app, and works when Nebula is opened from localhost or connected to a build server.</div>';return}
  body.innerHTML=`<div class="bn-bar"><div class="bn-dev" role="group" aria-label="Device"><button class="bn-btn ${BUILD.dev==="phone"?"on":""}" type="button" data-dev="phone">Phone</button><button class="bn-btn ${BUILD.dev==="tablet"?"on":""}" type="button" data-dev="tablet">Tablet</button><button class="bn-btn ${!BUILD.dev||BUILD.dev==="full"?"on":""}" type="button" data-dev="full">Full</button></div><button class="bn-btn" type="button" data-bn="reload">Reload</button><a class="bn-btn" href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">Open</a></div><div class="bn-frame ${BUILD.dev||"full"}"><iframe id="bnFrame" title="Preview" src="${escapeHtml(u)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"></iframe></div>`;
}
function benchPreviewRefresh(openIt){
  if(openIt&&isBuildChat(activeChat())){
    if(window.innerWidth>=900){BUILD.tab="prev";BUILD.view="";benchOpen("prev")}
    else toast("Server running. Open the workbench to preview.");
    return;
  }
  if(BUILD.tab==="prev"&&benchIsOpen()){const f=$("#bnFrame");if(f)f.src=f.src}
}
function saveBlob(blob,name){return saveFile(blob,name)}
async function bDownload(chat,f){
  const url=f.kind==="zip"?wsUrl(chat,"zip")+"?name="+encodeURIComponent(f.name)+(f.paths&&f.paths.length?"&paths="+encodeURIComponent(f.paths.join(",")):""):wsUrl(chat,"file")+"?path="+encodeURIComponent(f.path)+"&raw=1";
  const r=await bApi(url),blob=await r.blob();
  saveBlob(blob,f.kind==="zip"?f.name+".zip":f.name);
}
async function benchClick(e){
  const c=activeChat();if(!c)return;
  const t=e.target.closest("[data-bt],[data-bn],[data-bd],[data-bf],[data-dev]");
  if(!t)return;
  if(t.dataset.bt){BUILD.tab=t.dataset.bt;BUILD.view="";renderBench();if(BUILD.tab==="files")benchRefresh();return}
  if(t.dataset.bd){const p=t.dataset.bd;BUILD.open.has(p)?BUILD.open.delete(p):BUILD.open.add(p);renderBnBody();return}
  if(t.dataset.bf){BUILD.view=t.dataset.bf;renderBnBody();return}
  if(t.dataset.dev){BUILD.dev=t.dataset.dev;renderBnBody();return}
  const a=t.dataset.bn;
  if(a==="close")benchClose();
  else if(a==="refresh")benchRefresh();
  else if(a==="back"){BUILD.view="";renderBnBody()}
  else if(a==="reload"){const f=$("#bnFrame");if(f)f.src=f.src}
  else if(a==="copy"){try{await navigator.clipboard.writeText(BUILD.cur||"");toast("Copied","ok")}catch{toast("Copy failed.","err")}}
  else if(a==="dl"){try{const r=await bApi(wsUrl(c,"file")+"?path="+encodeURIComponent(BUILD.view)+"&raw=1");saveBlob(await r.blob(),BUILD.view.split("/").pop())}catch(er){toast(String(er.message||er),"err")}}
  else if(a==="zip"){try{await bDownload(c,{kind:"zip",name:(c.title||"project").replace(/[^\w.-]+/g,"_"),paths:[]})}catch(er){toast(String(er.message||er),"err")}}
  else if(a==="edit"){
    const body=$("#bnBody");
    body.innerHTML=`<div class="bn-bar"><button class="bn-btn" type="button" data-bn="back">Cancel</button><span class="bn-path">${escapeHtml(BUILD.view)}</span><button class="bn-btn pri" type="button" data-bn="save">Save</button></div><textarea class="bn-edit" id="bnEdit" spellcheck="false"></textarea>`;
    const ta=$("#bnEdit");ta.value=BUILD.cur||"";ta.focus();
  }else if(a==="save"){
    try{await bJson(wsUrl(c,"file"),{method:"PUT",body:JSON.stringify({path:BUILD.view,content:$("#bnEdit").value})});toast("Saved","ok");renderBnBody()}
    catch(er){toast(String(er.message||er),"err")}
  }
}

/* ----- clicks on cards in the conversation ----- */
$("#msgsInner").addEventListener("click",async e=>{
  const el=e.target.closest(".act [data-ai],.act-card [data-ai],.act-link[data-ai]");
  if(!el)return;
  const me=el.closest(".msg"),chat=activeChat(),m=chat&&me&&chat.messages.find(x=>x.id===me.dataset.id),rec=m&&m.acts&&m.acts[+el.dataset.ai];
  if(!rec)return;
  if(e.target.closest(".act-h")){
    if(rec.type==="plan")rec.collapsed=planCollapsed(rec)?false:true;
    else rec.open=!(rec.open===true||(rec.open===undefined&&rec.status==="err"));
    paintMsg(me,m,BUILD.busy&&chat.messages[chat.messages.length-1]===m);save();
    return;
  }
  if(el.matches(".act-b")){
    const f=rec.files&&rec.files[+el.dataset.fi];if(!f)return;
    try{
      if(el.dataset.pv){
        const r=await bApi(wsUrl(chat,"file")+"?path="+encodeURIComponent(f.path)+"&raw=1"),b64=await b64FromBlob(await r.blob()),id="att"+uid();
        ART[id]={id,name:f.name,ext:attExt(f.name),text:false,content:b64,size:f.size||0,bytes:null};openArtifact(id);
      }else await bDownload(chat,f);
    }catch(er){toast(String(er.message||er),"err")}
    return;
  }
  if(rec.type==="serve"){benchOpen("prev");return}
  if(rec.path&&(rec.type==="write"||rec.type==="edit")){BUILD.view=rec.path;BUILD.tab="files";if(benchIsOpen())renderBench();else benchOpen("files")}
});

/* ----- wiring ----- */
$("#msgsInner").addEventListener("click",async e=>{
  const b=e.target.closest("[data-bs]");
  if(!b)return;
  if(b.dataset.bs==="off"){state.settings.buildServer="";if(state.settings.keys)delete state.settings.keys.buildServer;save();BUILD.cfg=undefined;BUILD.err="";benchClose();renderMessages();return}
  const url=($("#bsUrl").value||"").trim().replace(/\/+$/,""),tok=cleanKey($("#bsTok").value);
  if(!/^https?:\/\/[^\s/]+/i.test(url)){BUILD.err="Enter the full address, starting with https://";renderMessages();return}
  if(!tok){BUILD.err="Enter the build token.";renderMessages();return}
  state.settings.buildServer=url;state.settings.keys=state.settings.keys||{};state.settings.keys.buildServer=tok;
  b.disabled=true;b.textContent="Connecting…";
  BUILD.cfg=undefined;await buildConfig(true);
  if(BUILD.cfg){save();toast("Connected","ok")}else{state.settings.buildServer=url}
  renderMessages();
});
$("#modeSeg").addEventListener("click",e=>{const b=e.target.closest("[data-mode]");if(b)setMode(b.dataset.mode)});
$("#benchFab").addEventListener("click",()=>{haptic(5);benchIsOpen()?benchClose():benchOpen("files")});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&benchIsOpen()&&!document.querySelector(".sheet-ov,.pal-ov,.pass-ov")&&!SP.open&&!isStreaming)benchClose()});
