"use strict";
/* ---------- build mode: an agent that works in a real workspace ----------
   The model replies with XML-style action tags. Writes run as soon as they close; a blocking action
   (run, read, ...) ends the turn, its result comes back as a message, and the loop continues until <done>. */
const BUILD={base:"",err:"",pv:{},cfg:undefined,term:[],tree:null,busy:false,stop:false,execCtl:null,status:"",step:0,guides:new Map(),tab:"files",view:"",open:new Set()};
const BUILD_MAX_STEPS=80,BUILD_MAX_ACTS=40;
const GUIDE_INDEX=[["frontend","interfaces, design system, accessibility, polish (read before ANY UI)"],["backend","APIs, data, auth, security, testing"],["fullstack","project structure, scripts, preview, build loop"],["pdf","typeset PDFs with ReportLab or WeasyPrint, verify by rendering"],["pptx","python-pptx decks: layout, charts, notes, render check"],["docx","python-docx documents: styles, TOC, tables"],["xlsx","openpyxl workbooks: formulas, formatting, charts"],["dataviz","chart choice, colour, labelling"],["debugging","error-recovery protocol and common fixes"],["deliver","README, cleaning, zip, final message"]];
const BUILD_PROMPT=`You are Nebula Build, an autonomous senior engineer and designer. You build complete, polished, working software and documents inside a real workspace (a directory on the user's machine) by emitting actions. You work until the result is finished, verified and delivered. You never ask permission to install, run, create or fix things, and you never stop at an error.

HOW TO ACT
Write actions as XML-style tags in your reply. Text outside the tags is shown to the user: at most one short sentence before an action, only when it helps, and never repeat what the action cards already show.
<plan>- [ ] step one
- [ ] step two</plan>  Write it first; send <plan> again with items ticked as you progress.
<write path="src/app.js">the COMPLETE file</write>  Always the full file. No placeholders, no "rest unchanged", no ellipses.
<edit path="src/app.js"><find>exact existing text</find><replace>new text</replace></edit>  Small changes. The find text must match exactly once.
<delete path="old.txt"/>
<run label="Installing packages" cwd="." timeout="300">shell command</run>  Runs in the workspace: installs, builds, tests, scripts. Output returns to you. Always add a label of 2 to 4 words saying what the command does (Running tests, Building, Checking the app); the user sees the label, not the command.
<serve name="web" port="3000" cmd="node server.js"/>  Starts a long-running server (reads PORT) and opens the live preview.
<stop name="web"/>   <read path="p"/>   <read path="p" lines="40-120"/>   <ls path="."/>
<view path="page-1.png"/>  Shows you an image file (rendered pages, screenshots) so you can critique your own output.
<guide name="frontend"/>  Loads a detailed guideline. <search q="query"/>  Web search. <fetch url="https://..."/>  Reads a web page (docs).
<deliver name="my-app" zip="true"/>  Packages the zip. <deliver files="report.pdf,deck.pptx"/>  Offers single files.
<done>Short summary for the user: what was built, how to run it, what was verified.</done>
After <run>, <serve>, <stop>, <read>, <ls>, <view>, <guide>, <search>, <fetch>, <deliver> or <done>, STOP and wait; the result arrives as a <result> message. You may send several <write>, <edit> and <delete> actions in one reply before that. Never put action tags inside code fences (tags inside fences are ignored). Never paste whole files into the chat text.

WORKFLOW (every time)
1. Understand the request and choose the simplest stack that fully delivers it. Check the environment once: <run>uname -a; node -v; npm -v; python3 -V; pip --version; which soffice pdftoppm</run>.
2. Load the relevant guides BEFORE designing or writing: UI -> frontend; server, API, data -> backend and fullstack; PDF -> pdf; PowerPoint -> pptx; Word -> docx; spreadsheet -> xlsx; charts -> dataviz. Apply them to the letter.
3. Send a <plan>.
4. Build in small verified steps: write files, install dependencies, build, test. When anything fails: read the whole error, find the root cause, fix it, rerun, and repeat until it is green. Never leave a failing build or tell the user to fix something manually. If a package cannot be installed, use an alternative or a dependency-free approach. If you are stuck after two attempts, load the debugging guide, search, or fetch the docs.
5. Verify like a user: start the app and request its pages and endpoints with curl; for documents, render pages to PNG and <view> them; check mobile widths for web UIs. Fix whatever looks or behaves wrong.
6. Deliver: write README.md (what, how to run, structure), <deliver> the zip and key files, then <done>.

QUALITY BAR
Work like a studio: real content, no lorem ipsum, no TODOs, no dead buttons, every state handled (loading, empty, error), accessible, responsive from 360px, distinctive visual design that follows the frontend guide, typeset documents that follow the pdf/pptx/docx/xlsx guides. Prefer pinned, popular, maintained libraries and keep dependencies few.

RULES
- All paths are relative to the workspace; never touch anything outside it.
- Python: create a venv once (python3 -m venv .venv); afterwards python and pip resolve to it. Node: npm install inside the workspace.
- Servers read PORT from the environment and bind 0.0.0.0. Use <serve>, never a blocking <run>, for servers.
- The live preview may be served under a path prefix. Use RELATIVE URLs for assets and API calls (fetch("api/items"), not fetch("/api/items"); Vite base "./"; <link href="style.css">), and prefer hash routing for single-page apps.
- Never write secrets into files; provide .env.example.
- Keep going autonomously until <done>; each reply should contain concrete actions.`;
const BUILD_SUGGESTIONS=[
  ["A habit tracker web app","Build a polished habit tracker web app with streaks, a weekly heatmap, local persistence and a calm, distinctive design. Make it work great on mobile."],
  ["A REST API with a dashboard","Build a full-stack task manager: Node + SQLite REST API with validation and tests, and a fast responsive dashboard. Seed it with realistic data."],
  ["A designed PDF report","Create a beautifully typeset 6-page PDF market report with a cover, table of contents, KPI row, charts from generated data, and tables. Use Python and render it to check the layout."],
  ["A pitch deck","Create a 10-slide investor pitch deck (pptx) for a fictional climate-tech startup with native charts, a consistent grid, speaker notes and a strong visual identity. Render and review each slide."],
  ["A CLI tool","Build a command-line tool in Python that audits a folder of images (sizes, duplicates, formats), prints a clean report and exports CSV. Include tests and a README."],
  ["A landing page","Design and build a distinctive, fast, accessible landing page for an independent coffee roaster. No frameworks; hand-crafted CSS; responsive and delightful."]
];
const BUILD_CTX_CHARS=240000;
/* what the model needs to know even after older turns are condensed, or after the user switched model or provider */
function buildStateNote(chat){
  const L=["CURRENT STATE (authoritative; trust it over your memory of earlier turns)"],prov=PROVIDERS[state.settings.provider];
  L.push(`- You are running as ${state.settings.model||"a model"}${prov?" via "+prov.name:""}. The user can switch models or providers between turns; the conversation and the workspace carry over unchanged, so never restart finished work.`);
  if(BUILD.cfg&&BUILD.cfg.env==="phone")L.push("- ENVIRONMENT: an Android phone (Termux). No Docker, no LibreOffice, limited memory and CPU. Prefer pure-Python libraries (python-pptx, python-docx, openpyxl, fpdf2, PyMuPDF only if it installs), create the venv with --system-site-packages, avoid anything that must compile, keep npm dependencies few and avoid native modules, and verify documents by reopening them with the library that wrote them. Python may not be installed: check `python -V` first, and if it is missing make documents with pure-JavaScript npm libraries (pptxgenjs, docx, exceljs, pdfkit).");
  const t=BUILD.tree&&BUILD.treeWs===chat.ws?BUILD.tree:null;
  if(t){
    const files=t.files.filter(f=>!f.d&&!f.hidden);
    L.push(files.length?`- Workspace files (${files.length}): `+files.slice(0,70).map(f=>f.p).join(", ")+(files.length>70?`, and ${files.length-70} more`:""):"- The workspace is empty.");
    const up=(t.procs||[]).filter(p=>p.running);
    if(up.length)L.push("- Running servers: "+up.map(p=>p.name+(p.port?" on port "+p.port:"")).join(", "));
  }
  if(chat.plan)L.push("- Latest plan:\n"+chat.plan);
  return L.join("\n");
}
function fitBuildContext(msgs,limit){
  limit=limit||BUILD_CTX_CHARS;
  const size=m=>String(m.content||"").length;
  let total=msgs.reduce((n,m)=>n+size(m),0);
  if(total<=limit)return msgs;
  const out=msgs.map(m=>({...m})),keep=Math.max(1,out.length-4);
  for(let i=1;i<keep&&total>limit;i++){
    const m=out[i],before=size(m);
    if(m.tool){m.atts=undefined;m.content=m.content.slice(0,260)+"\n…[older output omitted]…"}
    else if(m.role==="assistant")m.content=m.content.replace(/<(write|edit)\b([^>]*)>[\s\S]*?<\/\1>/g,"<$1$2>[content omitted]</$1>").slice(0,1200);
    total-=before-size(m);
  }
  return out;
}
function buildResumable(chat){
  if(!isBuildChat(chat)||BUILD.busy||isStreaming||!chat.messages.length)return false;
  const last=chat.messages[chat.messages.length-1];
  if(last.role!=="assistant")return true;
  const acts=last.acts||[];
  if(acts.some(a=>a.type==="done"))return false;
  return acts.length>0||!!(BUILD.error&&BUILD.errorChat===chat.id);
}
function buildContinue(){
  const chat=activeChat();
  if(!chat||BUILD.busy||isStreaming)return;
  const last=chat.messages[chat.messages.length-1];
  if(last&&last.role==="assistant")chat.messages.push({id:uid(),role:"user",content:"Continue from where you stopped. Check the current workspace state, finish anything unfinished, fix any errors, then verify and finish with <done>.",ts:Date.now()});
  BUILD.error="";
  save();renderChatList();bRender(chat);
  buildAgent(chat);
}
const hasBuild=()=>!!(BUILD.cfg&&BUILD.cfg.enabled);
const isBuildChat=c=>!!c&&c.mode==="build";
function buildSystemPrompt(chat){
  const sp=(state.settings.systemPrompt||"").trim()===DEFAULT_SETTINGS.systemPrompt?"":(state.settings.systemPrompt||"").trim();
  const idx=GUIDE_INDEX.map(([n,d])=>`- ${n}: ${d}`).join("\n");
  return [BUILD_PROMPT,"AVAILABLE GUIDES (load with <guide name=\"...\"/>):\n"+idx,chat?buildStateNote(chat):"",sp&&("USER PREFERENCES:\n"+sp)].filter(Boolean).join("\n\n");
}

/* ----- server access ----- */
const bServer=()=>String(state.settings.buildServer||"").trim().replace(/\/+$/,"");
async function buildConfig(force){
  if(BUILD.cfg!==undefined&&!force)return BUILD.cfg;
  const base=bServer(),tok=base?cleanKey(state.settings.keys&&state.settings.keys.buildServer):"";
  BUILD.base=base;BUILD.err="";BUILD.pv={};
  try{
    const r=await fetch(base+"/api/build-config",{cache:"no-store",headers:base?{"x-build-token":tok}:{}});
    if(r.ok){BUILD.cfg=await r.json();if(base){BUILD.cfg.token=tok;BUILD.cfg.remote=true}}
    else{BUILD.cfg=null;BUILD.err=r.status===401?"That token was rejected.":r.status===403?"The server doesn’t allow this site. Add this site’s address to BUILD_REMOTE_ORIGINS.":r.status===429?"Too many failed attempts. Wait a few minutes.":"The server answered "+r.status+"."}
  }catch{
    BUILD.cfg=null;
    BUILD.err=!base?"":(location.protocol==="https:"&&/^http:/i.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1)/i.test(base))?"This page is https, so the build server address must be https too.":"Couldn’t reach "+base+"."
  }
  return BUILD.cfg;
}
async function bApi(path,opt){
  if(!BUILD.cfg)await buildConfig();
  if(!BUILD.cfg)throw new Error("Build mode isn’t enabled on this server.");
  const o=opt||{};
  const r=await fetch(BUILD.base+path,{method:o.method,body:o.body,signal:o.signal,headers:{"x-build-token":BUILD.cfg.token,"Content-Type":"application/json"}});
  if(!r.ok&&!o.stream){let m="";try{m=(await r.json()).error.message}catch{}throw new Error(m||("Request failed ("+r.status+")"))}
  return r;
}
const bJson=async(p,o)=>(await bApi(p,o)).json();
const bPost=(p,b,signal)=>bJson(p,{method:"POST",body:JSON.stringify(b||{}),signal});
const wsUrl=(chat,op)=>`/build/ws/${chat.ws}/${op}`;
async function ensureWs(chat){
  const cfg=await buildConfig();
  if(!cfg||!cfg.enabled){toast("Connect a build server first. Open the Build screen to see how.","err");return false}
  if(chat.ws){try{await bJson(wsUrl(chat,"tree"));return true}catch{chat.ws=""}}
  try{chat.ws=(await bPost("/build/ws",{name:chat.title})).id;save();return true}
  catch(e){toast(String(e.message||e),"err");return false}
}
function termPrint(text,cls){
  BUILD.term.push({c:cls||"o",t:String(text)});
  if(BUILD.term.length>2500)BUILD.term.splice(0,500);
  if(typeof benchTermAppend==="function")benchTermAppend(cls||"o",String(text));
}
async function bExec(chat,cmd,o){
  o=o||{};
  const r=await bApi(wsUrl(chat,"exec"),{method:"POST",body:JSON.stringify({cmd,cwd:o.cwd,timeout:o.timeout}),signal:o.signal,stream:true});
  if(!r.ok){let m="";try{m=(await r.json()).error.message}catch{}throw new Error(m||"The command couldn’t start.")}
  const reader=r.body.getReader(),dec=new TextDecoder();
  let buf="",out="",exit=null;
  for(;;){
    const{value,done}=await reader.read();
    if(done)break;
    buf+=dec.decode(value,{stream:true});
    let i;
    while((i=buf.indexOf("\n"))>=0){
      const line=buf.slice(0,i);buf=buf.slice(i+1);
      if(!line)continue;
      let j;try{j=JSON.parse(line)}catch{continue}
      if(j.t==="o"){out+=j.d;if(o.onData)o.onData(j.d)}else if(j.t==="x")exit=j;
    }
  }
  return{out,code:exit?exit.code:-1,ms:exit?exit.ms:0,timedOut:!!(exit&&exit.timedOut)};
}

/* ----- parsing ----- */
const ACT_TYPES="write|edit|run|read|ls|delete|guide|view|serve|stop|deliver|search|fetch|done|plan";
const BODY_TYPES=new Set(["write","edit","run","done","plan"]);
const BLOCKING=new Set(["run","read","ls","guide","view","serve","stop","deliver","search","fetch","done"]);
function parseAttrs(s){
  const o={};
  String(s).replace(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,(m,k,a,b)=>{o[k]=a!==undefined?a:b;return ""});
  return o;
}
/* finds action tags, skipping fenced code; returns closed acts and an unfinished one (while streaming) */
function scanActs(text){
  const acts=[];let i=0,open=null;
  const re=new RegExp("<("+ACT_TYPES+")\\b|```","g");
  for(;;){
    re.lastIndex=i;
    const m=re.exec(text);
    if(!m)break;
    if(m[0]==="```"){const e=text.indexOf("```",m.index+3);if(e<0)break;i=e+3;continue}
    const type=m[1],tagEnd=text.indexOf(">",m.index);
    if(tagEnd<0){open={type,attrs:{},body:"",start:m.index};break}
    const head=text.slice(m.index+type.length+1,tagEnd),attrs=parseAttrs(head);
    if(head.trimEnd().endsWith("/")){acts.push({type,attrs,body:"",start:m.index,end:tagEnd+1});i=tagEnd+1;continue}
    const close="</"+type+">",ce=text.indexOf(close,tagEnd+1);
    if(ce<0){
      if(BODY_TYPES.has(type)){open={type,attrs,body:text.slice(tagEnd+1),start:m.index};break}
      acts.push({type,attrs,body:"",start:m.index,end:tagEnd+1});i=tagEnd+1;continue;
    }
    acts.push({type,attrs,body:text.slice(tagEnd+1,ce),start:m.index,end:ce+close.length});
    i=ce+close.length;
  }
  return{acts,open};
}
function unfence(s){
  const m=/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(s);
  return m?m[1]:s;
}
function fileBody(body){
  let t=String(body).replace(/^\r?\n/,"");
  t=unfence(t);
  t=t.replace(/\s+$/,"");
  return t?t+"\n":"";
}
function editPairs(body){
  const out=[],re=/<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/g;
  let m;
  const trim=s=>s.replace(/^\r?\n/,"").replace(/\r?\n$/,"");
  while((m=re.exec(body))!==null)out.push([trim(m[1]),trim(m[2])]);
  return out;
}
const cleanRel=p=>String(p||"").trim().replace(/\\/g,"/").replace(/^\.\//,"").replace(/^\/+/,"");
const clipText=(s,n)=>{s=String(s);return s.length<=n?s:s.slice(0,n)+"\n…[truncated]"};
function tailOutput(out,max){
  out=String(out).replace(/\u001b\[[0-9;]*[A-Za-z]/g,"");
  if(out.length<=max)return out;
  const head=Math.floor(max*.25),tail=max-head;
  return out.slice(0,head)+`\n…[${out.length-max} characters omitted]…\n`+out.slice(-tail);
}

/* ----- executing one action ----- */
async function loadGuide(name){
  name=String(name||"").toLowerCase().replace(/[^a-z0-9-]/g,"");
  if(BUILD.guides.has(name))return BUILD.guides.get(name);
  const r=await fetch(`guides/${name}.md`);
  if(!r.ok)throw new Error(`No guide named "${name}". Available: ${GUIDE_INDEX.map(g=>g[0]).join(", ")}`);
  const t=await r.text();BUILD.guides.set(name,t);return t;
}
async function execAct(chat,act,rec,tm){
  const A=act.attrs,sig=BUILD.execCtl&&BUILD.execCtl.signal;
  rec.status="running";
  try{
    switch(act.type){
      case "write":{
        const p=cleanRel(A.path);if(!p)throw new Error("write needs a path");
        const content=fileBody(act.body),exec=A.exec==="true"||/^#!/.test(content)||/\.sh$/.test(p);
        const r=await bJson(wsUrl(chat,"file"),{method:"PUT",body:JSON.stringify({path:p,content,exec}),signal:sig});
        rec.path=p;rec.summary=`${r.lines} lines`;rec.detail=`Wrote ${p} (${r.lines} lines, ${r.bytes} bytes).`;break;
      }
      case "edit":{
        const p=cleanRel(A.path),pairs=editPairs(act.body);
        if(!p||!pairs.length)throw new Error("edit needs a path and <find>/<replace> blocks");
        for(const[f,rp]of pairs)await bPost(wsUrl(chat,"edit"),{path:p,find:f,replace:rp,all:A.all==="true"},sig);
        rec.path=p;rec.summary=`${pairs.length} edit${pairs.length>1?"s":""}`;rec.detail=`Edited ${p} (${pairs.length} change${pairs.length>1?"s":""}).`;break;
      }
      case "delete":{const p=cleanRel(A.path);await bPost(wsUrl(chat,"delete"),{path:p},sig);rec.path=p;rec.summary="deleted";rec.detail=`Deleted ${p}.`;break}
      case "read":{
        const p=cleanRel(A.path),r=await bJson(wsUrl(chat,"file")+"?path="+encodeURIComponent(p),{signal:sig});
        rec.path=p;
        if(r.binary){rec.summary="binary";rec.detail=`${p} is a binary file (${r.size} bytes).`;break}
        let t=r.content;
        const m=/^(\d+)\s*-\s*(\d+)$/.exec(A.lines||"");
        if(m){const L=t.split("\n");t=L.slice(+m[1]-1,+m[2]).map((x,i)=>`${+m[1]+i}: ${x}`).join("\n")}
        rec.summary=`${t.split("\n").length} lines`;rec.detail=clipText(t,24000)+(r.truncated?"\n[file truncated at 400 KB]":"");break;
      }
      case "ls":{
        const base=cleanRel(A.path||"."),t=await bJson(wsUrl(chat,"tree")+(A.all==="true"?"?all=1":""),{signal:sig});BUILD.tree=t;
        const items=t.files.filter(f=>!base||base==="."||f.p===base||f.p.startsWith(base+"/"));
        rec.path=base||".";rec.summary=`${items.length} items`;
        rec.detail=items.slice(0,500).map(f=>f.d?f.p+"/"+(f.hidden?"  (hidden, not listed)":""):`${f.p}  ${f.s} B`).join("\n")||"(empty)";break;
      }
      case "run":{
        const cmd=(A.cmd||unfence(act.body)).trim();if(!cmd)throw new Error("run needs a command");
        rec.cmd=cmd;rec.out="";termPrint("$ "+cmd+"\n","c");
        const r=await bExec(chat,cmd,{cwd:A.cwd,timeout:+A.timeout||180,signal:sig,onData:d=>{termPrint(d,"o");rec.out=(rec.out+d).slice(-4000);if(tm.tick)tm.tick()}});
        rec.exit=r.code;rec.ms=r.ms;rec.status=r.code===0?"ok":"err";
        rec.summary=r.timedOut?`timed out · ${Math.round(r.ms/1000)}s`:`exit ${r.code} · ${(r.ms/1000).toFixed(1)}s`;
        rec.detail=`$ ${cmd}\nexit code ${r.code}${r.timedOut?" (timed out; raise the timeout attribute or run it in the background)":""} · ${(r.ms/1000).toFixed(1)}s\n`+tailOutput(r.out,6500);
        termPrint(`exit ${r.code} · ${(r.ms/1000).toFixed(1)}s\n`,r.code===0?"ok":"err");
        return;
      }
      case "serve":{
        const cmd=(A.cmd||unfence(act.body)).trim(),port=+A.port||0;
        if(!cmd)throw new Error("serve needs cmd");
        termPrint("$ "+cmd+(port?`   (port ${port})`:"")+"\n","c");
        const r=await bPost(wsUrl(chat,"proc/start"),{name:A.name||"server",cmd,port,cwd:A.cwd,wait:+A.wait||40},sig);
        termPrint(r.log||"","o");
        rec.summary=r.exit?`exited ${r.exit.code}`:r.ready?`running on :${port}`:"started";
        rec.status=r.exit?"err":"ok";
        rec.detail=r.exit?`The process exited with code ${r.exit.code}.\n${r.log}`:`${r.ready?"Server is up":"Process started"}${port?` on port ${port}`:""}. Preview is open.\n${tailOutput(r.log||"",2500)}`;
        if(typeof benchPreviewRefresh==="function")benchPreviewRefresh(true);
        return;
      }
      case "stop":{const r=await bPost(wsUrl(chat,"proc/stop"),{name:A.name},sig);rec.summary=`stopped ${r.stopped}`;rec.detail=`Stopped ${r.stopped} process(es).`;break}
      case "guide":{
        const name=String(A.name||"").toLowerCase();rec.path=name;
        const t=await loadGuide(name);rec.summary="loaded";rec.detail=`GUIDE ${name}\n\n`+clipText(t,26000);break;
      }
      case "search":{
        const q=A.q||act.body||"";rec.path=q;
        const res=await runSearch(String(q).trim());
        rec.summary=`${res.length} results`;rec.detail=res.map((x,i)=>`[${i+1}] ${x.title}\n${x.url}\n${x.snippet}`).join("\n\n")||"No results.";break;
      }
      case "fetch":{
        const r=await bPost("/build/fetch",{url:A.url,max:+A.max||14000},sig);rec.path=A.url;
        rec.summary=`HTTP ${r.status}`;rec.detail=clipText(r.text,16000);break;
      }
      case "view":{
        const p=cleanRel(A.path);rec.path=p;
        if(!/\.(png|jpe?g|webp|gif)$/i.test(p))throw new Error("view only shows png, jpg, webp or gif images. Render pages to PNG first.");
        const r=await bApi(wsUrl(chat,"file")+"?path="+encodeURIComponent(p)+"&raw=1",{signal:sig}),blob=await r.blob();
        const att=await processFile(new File([blob],p.split("/").pop(),{type:blob.type||"image/png"}));
        tm.atts.push(stripAtt({...att,status:"ready"}));rec.summary="attached";rec.detail=`Image ${p} is attached to this message.`;break;
      }
      case "deliver":{
        const files=[];
        const paths=String(A.paths||"").split(",").map(s=>cleanRel(s)).filter(Boolean);
        if(A.zip==="true"||(!A.files&&!paths.length))files.push({kind:"zip",name:(A.name||chat.title||"project").replace(/[^\w.-]+/g,"_").slice(0,60),paths});
        for(const f of String(A.files||"").split(",").map(s=>cleanRel(s)).filter(Boolean)){
          const r=await bJson(wsUrl(chat,"file")+"?path="+encodeURIComponent(f)+"&max=1");
          files.push({kind:"file",name:f.split("/").pop(),path:f,size:r.size});
        }
        rec.files=files;rec.summary=`${files.length} item${files.length>1?"s":""}`;
        rec.detail="Offered to the user: "+files.map(f=>f.name+(f.kind==="zip"?".zip":"")).join(", ")+".";break;
      }
      case "done":rec.summary="done";rec.detail="Acknowledged.";break;
      case "plan":chat.plan=String(act.body||"").trim().slice(0,2000);for(const m of chat.messages)if(Array.isArray(m.acts)&&!m.acts.includes(rec)&&m.acts.some(a=>a.type==="plan"))bPaint(chat,m);rec.summary="plan";rec.detail="Plan noted.";break;
    }
    rec.status="ok";
  }catch(e){
    if(e&&e.name==="AbortError"){rec.status="err";rec.summary="stopped";rec.detail="Stopped by the user.";return}
    rec.status="err";rec.summary=String(e.message||e).slice(0,160);rec.detail="ERROR: "+String(e.message||e);
    if(act.type==="run")termPrint(rec.detail+"\n","err");
  }
}

/* ----- history the model sees: older bulk is condensed ----- */
function compactBuildMessages(msgs){
  const aIdx=[];msgs.forEach((m,i)=>{if(m.role==="assistant")aIdx.push(i)});
  const from=aIdx.length>6?aIdx[aIdx.length-6]:0;
  return msgs.map((m,i)=>{
    if(i>=from)return m;
    if(m.role==="assistant")return{...m,content:String(m.content||"").replace(/(<write\b[^>]*>)([\s\S]*?)(<\/write>)/g,(a,o,b,c)=>`${o}\n[${b.split("\n").length} lines written]\n${c}`).replace(/(<edit\b[^>]*>)([\s\S]*?)(<\/edit>)/g,(a,o,b,c)=>`${o}[edit applied]${c}`)};
    if(m.tool)return{...m,atts:undefined,content:m.content.length>700?m.content.slice(0,520)+"\n…[older output omitted]…":m.content};
    return m;
  });
}
function toolMessage(recs,atts,note){
  const esc=s=>String(s).replace(/"/g,"&quot;");
  const body=recs.map(r=>`<result type="${r.type}"${r.path?` path="${esc(r.path)}"`:""} status="${r.status}">\n${r.detail||r.summary||""}\n</result>`).join("\n");
  const m={id:uid(),role:"user",tool:true,content:body+"\n\n"+note,ts:Date.now()};
  if(atts&&atts.length)m.atts=atts;
  return m;
}

/* ----- one model turn, executing actions as they complete ----- */
function bPaint(chat,msg){
  const el=$(`#msgsInner .msg[data-id="${msg.id}"]`);
  if(!el)return;
  paintMsg(el,msg,BUILD.busy&&chat.messages[chat.messages.length-1]===msg);
  el.classList.toggle("pending",!msg.content&&!(msg.acts&&msg.acts.length)&&!msg.open);
  followStream();
}
/* add or remove only what changed; existing messages are never rebuilt, so nothing flickers or jumps */
function bRender(chat){
  if(chat.id!==state.activeId)return;
  const inner=$("#msgsInner"),shown=chat.messages.filter(m=>!m.tool);
  if(!shown.length||inner.querySelector(".empty")){renderMessages();return}
  const want=new Set(shown.map(m=>m.id));
  for(const e of Array.from(inner.querySelectorAll(":scope > .msg")))if(!want.has(e.dataset.id))e.remove();
  const have=new Set(Array.from(inner.querySelectorAll(":scope > .msg")).map(e=>e.dataset.id));
  for(const m of shown)if(!have.has(m.id)){
    const el=createMsgEl(m);
    paintMsg(el,m,false);
    if(m.role==="assistant"&&!m.content&&BUILD.busy)el.classList.add("pending");
    inner.appendChild(el);
  }
  setSendState();followStream();
}
async function buildTurn(chat,msg,ctl){
  const tm={atts:[],tick:null};
  let n=0,queue=Promise.resolve(),cut=false,lastPaint=0,timer=null;
  const paint=()=>{if(timer)return;const d=Math.max(0,90-(Date.now()-lastPaint));timer=setTimeout(()=>{timer=null;lastPaint=Date.now();bPaint(chat,msg);if(typeof benchTick==="function")benchTick()},d)};
  tm.tick=paint;
  const view={...chat,messages:fitBuildContext(compactBuildMessages(chat.messages.filter(m=>m!==msg)))};
  const onDelta=(piece,kind)=>{
    if(cut||!piece)return;
    if(kind==="r"){msg.reasoning=(msg.reasoning||"")+piece;if(!msg._r0)msg._r0=Date.now();paint();return}
    msg.content+=piece;
    const{acts,open}=scanActs(msg.content);
    msg.open=open?{type:open.type,path:open.attrs.path||"",lines:open.body.split("\n").length}:null;
    for(;n<acts.length;n++){
      const a=acts[n],rec={id:uid(),type:a.type,attrs:a.attrs,status:"queued",summary:""};
      msg.acts[n]=rec;
      queue=queue.then(()=>BUILD.stop?undefined:execAct(chat,a,rec,tm)).then(()=>paint());
      if(BLOCKING.has(a.type)||n+1>=BUILD_MAX_ACTS){msg.content=msg.content.slice(0,a.end);msg.open=null;cut=true;ctl.abort();n++;break}
    }
    paint();
  };
  let error=null;
  try{await runCompletion(view,onDelta,ctl.signal)}
  catch(e){if(!(e&&e.name==="AbortError"))error=e}
  await queue;
  if(timer){clearTimeout(timer);timer=null}
  msg.open=null;
  const vp=viewParts(msg);msg.reasoning=vp.reasoning;msg.content=vp.content;
  return{recs:msg.acts,atts:tm.atts,error,cut,done:msg.acts.some(r=>r.type==="done")};
}

/* ----- the loop ----- */
function buildStop(){
  BUILD.stop=true;
  if(abortController)abortController.abort();
  if(BUILD.execCtl)BUILD.execCtl.abort();
}
async function buildAgent(chat){
  if(BUILD.busy)return;
  if(!await ensureWs(chat))return;
  BUILD.busy=true;BUILD.stop=false;BUILD.step=0;BUILD.error="";isStreaming=true;setSendState();
  if(typeof bStatus==="function")bStatus("Starting");
  const fails=new Map(),maxSteps=Math.min(200,Math.max(5,+state.settings.buildSteps||BUILD_MAX_STEPS));
  let steps=0;
  try{
    while(steps<maxSteps&&!BUILD.stop){
      steps++;BUILD.step=steps;
      try{BUILD.tree=await bJson(wsUrl(chat,"tree"));BUILD.treeWs=chat.ws}catch{}
      const msg={id:uid(),role:"assistant",content:"",ts:Date.now(),model:state.settings.model,acts:[]};
      chat.messages.push(msg);chat.updatedAt=Date.now();bRender(chat);
      const ctl=new AbortController();abortController=ctl;BUILD.execCtl=new AbortController();
      if(typeof bStatus==="function")bStatus("Thinking");
      const turn=await buildTurn(chat,msg,ctl);
      BUILD.execCtl=null;
      if(BUILD.stop)break;
      if(turn.error){
        BUILD.error=String(friendlyError(turn.error)).replace(/[*_`#>]/g,"").split("\n").find(Boolean)||"The model request failed.";BUILD.errorChat=chat.id;
        if(msg.acts.length){chat.messages.push(toolMessage(turn.recs,turn.atts,"The model request failed after these actions. Continue from the current workspace state."));turn.recs.forEach(r=>{delete r.detail})}
        else if(!msg.content.trim()){const i=chat.messages.indexOf(msg);if(i>=0)chat.messages.splice(i,1)}
        bRender(chat);break
      }
      if(!msg.acts.length)break;
      if(typeof benchRefresh==="function")benchRefresh();
      if(turn.done){bPaint(chat,msg);break}
      let note=`[step ${steps} of ${maxSteps}] Continue with the next action. When everything is built, verified and delivered, finish with <done>.`;
      const failed=turn.recs.filter(r=>r.status==="err"&&(r.type==="run"||r.type==="serve"));
      for(const r of failed){
        const k=(r.cmd||r.type)+"|"+String(r.detail||"").slice(0,160),c=(fails.get(k)||0)+1;
        fails.set(k,c);
        if(c>=3)note+=`\nThis same failure has now happened ${c} times. Stop repeating it: change approach (different package or version, simpler code, or a different tool), and load the debugging guide if you have not.`;
      }
      if(failed.length)note+="\nA command failed. Diagnose the root cause from the output above, fix it, and rerun until it succeeds.";
      chat.messages.push(toolMessage(turn.recs,turn.atts,note));
      turn.recs.forEach(r=>{delete r.detail});
      save();bRender(chat);
    }
    if(steps>=maxSteps&&!BUILD.stop)toast(`Stopped after ${maxSteps} steps. Send a message to continue.`);
  }finally{
    BUILD.busy=false;BUILD.execCtl=null;isStreaming=false;abortController=null;chat.updatedAt=Date.now();
    setSendState();save();renderChatList();
    if(typeof bStatus==="function")bStatus("");
    if(typeof benchRefresh==="function")benchRefresh();
    bRender(chat);
    if(typeof updateResume==="function")updateResume();
  }
}
function runAssistant(chat){return chat.mode==="build"?buildAgent(chat):streamAssistant(chat)}
