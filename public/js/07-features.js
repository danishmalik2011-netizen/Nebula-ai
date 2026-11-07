"use strict";
/* ===== server proxy ===== */
let SERVER=false;
async function detectServer(){
  try{const r=await fetch("/api/health",{cache:"no-store"});const j=await r.json();SERVER=!!(j&&j.nebula)}catch{SERVER=false}
  const d=$(".disclaimer");
  if(d&&SERVER)d.textContent="Keys stay in this browser. Requests are relayed by your local Nebula server, so CORS never gets in the way.";
}
function pfetch(url,opts={}){
  if(SERVER&&state.settings.useProxy!==false)return fetch("/proxy",{...opts,headers:{...(opts.headers||{}),"x-target-url":url}});
  return fetch(url,opts);
}

/* ===== model discovery ===== */
const MODEL_ST={},MODEL_TIMERS={};
const FONTS={
  inter:'"Inter",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  system:'ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif',
  serif:'"Iowan Old Style","Palatino Linotype",Georgia,serif',
  mono:'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
};
function modelList(id){
  const f=(state.settings.fetched&&state.settings.fetched[id])||[],p=PROVIDERS[id];
  if(p&&p.custom)return [...new Set([...f,...(p.models||[])])];
  return f.length?f:((p&&p.models)||[]);
}
function msText(id){
  const st=MODEL_ST[id];
  if(!st)return "";
  if(st.s==="loading")return "Fetching models…";
  if(st.s==="ok")return "";
  return "Couldn’t load models — "+st.m;
}
function setSt(id,st){MODEL_ST[id]=st;$$('[id="ms-'+id+'"]').forEach(el=>el.textContent=msText(id))}
async function fetchModels(id){
  const s=state.settings,p=PROVIDERS[id];
  if(!p)return;
  const key=cleanKey(s.keys&&s.keys[id]);
  const base=(p.base||"").trim().replace(/\/+$/,"");
  if(!base||(p.needsKey!==false&&!key)){setSt(id,null);return}
  setSt(id,{s:"loading"});
  try{
    let url=base+"/models";const headers={};
    if(p.adapter==="anthropic"){url+="?limit=100";headers["x-api-key"]=key;headers["anthropic-version"]="2023-06-01";headers["anthropic-dangerous-direct-browser-access"]="true"}
    else if(p.adapter==="google")url+="?pageSize=200&key="+encodeURIComponent(key);
    else if(key)headers["Authorization"]="Bearer "+key;
    const r=await pfetch(url,{headers});
    if(!r.ok)throw new Error(await httpError(r));
    const j=await r.json();
    let ids=p.adapter==="google"
      ?(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>String(m.name).replace(/^models\//,""))
      :(j.data||j.models||[]).map(m=>typeof m==="string"?m:(m.id||m.name)).filter(Boolean);
    ids=[...new Set(ids)].sort();
    if(!ids.length)throw new Error("the provider returned an empty list");
    if(!s.fetched)s.fetched={};
    s.fetched[id]=ids;save();
    setSt(id,{s:"ok",n:ids.length});
    if(id===s.provider)spRefresh();
  }catch(e){setSt(id,{s:"err",m:String(e.message||e).slice(0,110)})}
}
function scheduleFetch(id){clearTimeout(MODEL_TIMERS[id]);MODEL_TIMERS[id]=setTimeout(()=>fetchModels(id),700)}

/* ===== artifacts ===== */
const ARTIFACT_PROMPT="When the user asks you to create a file, document, web page, app, diagram, image or any other deliverable, output it as a fenced block whose info string is artifact:<filename.ext>, for example ```artifact:report.html. Text formats (html, svg, md, csv, json, code) are written as-is. Binary formats (png, jpg, pdf, zip, docx, pptx, xlsx, mp3, mp4) must be the file's base64 encoding, with no data: prefix. Prefer self-contained HTML (inline CSS and JS) and SVG for anything visual or printable. Add one or two sentences outside the block describing it. Never put triple backticks inside an artifact.";
function sysPrompt(chat){
  if(chat&&chat.noSys)return "";
  if(chat&&chat.mode==="build")return buildSystemPrompt(chat);
  const sp=(state.settings.systemPrompt||"").trim();
  if(LIVE.on)return [sp,VOICE_PROMPT,chat&&chat._web].filter(Boolean).join("\n\n");
  const parts=[sp];
  if(state.settings.artifacts!==false)parts.push(ARTIFACT_PROMPT);
  parts.push(MATH_PROMPT);
  if(state.settings.richUI!==false)parts.push(UI_PROMPT);
  if(state.settings.webImages!==false)parts.push(IMAGE_PROMPT);
  if(chat&&chat._web)parts.push(chat._web);
  return parts.filter(Boolean).join("\n\n");
}
const ART={};
const IMG_EXT=new Set("png jpg jpeg gif webp avif bmp ico".split(" "));
const BIN_EXT=new Set([...IMG_EXT,..."pdf zip pptx docx xlsx mp3 wav ogg mp4 webm ttf otf woff woff2 bin gz tar 7z".split(" ")]);
const PREV_TEXT=new Set(["html","htm","svg","md","markdown","csv","tsv"]);
const MIME={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",avif:"image/avif",bmp:"image/bmp",ico:"image/x-icon",svg:"image/svg+xml",pdf:"application/pdf",zip:"application/zip",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",mp4:"video/mp4",webm:"video/webm",html:"text/html",htm:"text/html",md:"text/markdown",csv:"text/csv",json:"application/json"};
function hashStr(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return(h>>>0).toString(36)}
function fmtSize(n){return n<1024?n+" B":n<1048576?(n/1024).toFixed(1)+" KB":(n/1048576).toFixed(1)+" MB"}
function stepsHtml(stage,size){
  const L=[stage===0?"Writing · "+fmtSize(size):"Written","Presenting","Ready"];
  return L.map((l,i)=>`<span class="pip${i<stage?" done":""}${i===stage?" on":""}">${l}</span>`).join("");
}
function setStage(card,stage){
  if(!card)return;
  const a=ART[card.dataset.art],st=card.querySelector(".art-steps");
  if(st)st.innerHTML=stepsHtml(stage,a?a.size:0);
  card.classList.toggle("writing",stage===0);
  card.classList.toggle("presenting",stage===1);
  const o=card.querySelector(".art-open");
  if(o)o.innerHTML=stage===2?"Open":'<span class="ring"></span>';
}
function renderArtifactCard(block,lang){
  const name=lang.slice(9).trim()||"artifact.txt";
  const ext=(name.split(".").pop()||"").toLowerCase();
  const text=!BIN_EXT.has(ext);
  const id="a"+hashStr(name+"|"+block.code.slice(0,40));
  const size=text?new Blob([block.code]).size:Math.floor(block.code.replace(/\s/g,"").length*.75);
  ART[id]={id,name,ext,text,content:block.code,size,bytes:null};
  const stage=block.done?2:0;
  return `<button class="art-card${stage===0?" writing":""}" type="button" data-art="${id}"><span class="art-ic">${escapeHtml(ext.slice(0,4)||"file")}</span><span class="art-meta"><b>${escapeHtml(name)}</b><span class="art-steps">${stepsHtml(stage,size)}</span></span><span class="art-open">${stage===2?"Open":'<span class="ring"></span>'}</span></button>`;
}
function toggleMsgActions(e){
  if(e.target.closest("a,button,input,textarea,.code-block,.reason,.art-card,.table-wrap,.edit-bar"))return;
  const me=e.target.closest(".msg");
  if(!me||me.classList.contains("editing"))return;
  if(window.getSelection&&String(window.getSelection())!=="")return;
  const was=me.classList.contains("tap");
  $$(".msg.tap").forEach(x=>x.classList.remove("tap"));
  if(!was)me.classList.add("tap");
}
function artBytes(a){
  if(a.bytes)return a.bytes;
  if(a.text)return a.bytes=new TextEncoder().encode(a.content);
  const bin=atob(a.content.replace(/\s/g,"").replace(/^data:[^,]*,/,""));
  const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return a.bytes=u;
}
function artBlob(a){return new Blob([artBytes(a)],{type:MIME[a.ext]||(a.text?"text/plain":"application/octet-stream")})}

function parseCsv(t,d){
  const rows=[];let r=[],c="",q=false;
  for(let i=0;i<t.length&&rows.length<501;i++){
    const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
    else if(ch==='"')q=true;
    else if(ch===d){r.push(c);c=""}
    else if(ch==="\n"){r.push(c.replace(/\r$/,""));rows.push(r);r=[];c=""}
    else c+=ch;
  }
  if(c||r.length){r.push(c);rows.push(r)}
  return rows;
}
function hexDump(b){
  let o="";
  for(let i=0;i<Math.min(b.length,512);i+=16){
    const s=b.subarray(i,i+16);
    o+=i.toString(16).padStart(6,"0")+"  "+[...s].map(x=>x.toString(16).padStart(2,"0")).join(" ").padEnd(48)+" "+[...s].map(x=>x>31&&x<127?String.fromCharCode(x):".").join("")+"\n";
  }
  return o;
}
function zipEntries(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  let e=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-70000);i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break}}
  if(e<0)return null;
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out=[];
  for(let k=0;k<n&&p+46<=b.length;k++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),us=dv.getUint32(p+24,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    out.push({name:new TextDecoder().decode(b.subarray(p+46,p+46+nl)),m,cs,us,off});
    p+=46+nl+el+cl;
  }
  return out;
}
async function zipRead(b,e){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const s=e.off+30+dv.getUint16(e.off+26,true)+dv.getUint16(e.off+28,true);
  const raw=b.subarray(s,s+e.cs);
  if(e.m===0)return raw;
  const ds=new DecompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
}
async function officeText(b,ext,es){
  const td=new TextDecoder();
  const rd=async n=>{const e=es.find(x=>x.name===n);return e?td.decode(await zipRead(b,e)):""};
  const dec=t=>t.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
  if(ext==="docx")return dec((await rd("word/document.xml")).replace(/<\/w:p>/g,"\n").replace(/<w:tab\/>/g,"\t").replace(/<[^>]+>/g,""));
  if(ext==="pptx"){
    const num=x=>parseInt(x.name.match(/(\d+)\.xml$/)[1]);
    const sl=es.filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x.name)).sort((p,q)=>num(p)-num(q));
    let o="",i=1;
    for(const e of sl){
      const x=td.decode(await zipRead(b,e));
      o+=`— Slide ${i++} —\n`+dec([...x.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m=>m[1]).join("\n"))+"\n\n";
    }
    return o;
  }
  if(ext==="xlsx")return dec([...(await rd("xl/sharedStrings.xml")).matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m=>m[1]).join("\n"));
  return "";
}

let curArt=null,curTab="preview",curUrl=null,vTok=0;
function openArtifact(id){
  const a=ART[id];
  if(!a)return;
  if(typeof benchClose==="function")benchClose();
  curArt=a;
  curTab=(a.text&&!PREV_TEXT.has(a.ext))?"code":"preview";
  const app=$("#app");
  app.classList.add("viewer-open");
  if(window.innerWidth<1300)app.classList.add("sidebar-closed");
  renderViewer();
}
function closeViewer(){
  curArt=null;vTok++;
  if(curUrl){URL.revokeObjectURL(curUrl);curUrl=null}
  $("#app").classList.remove("viewer-open");
  $("#viewer").innerHTML="";
}
async function renderViewer(){
  const a=curArt;
  if(!a)return;
  const tok=++vTok;
  if(curUrl){URL.revokeObjectURL(curUrl);curUrl=null}
  const tabs=a.text&&PREV_TEXT.has(a.ext);
  $("#viewer").innerHTML=`<div class="v-head"><div class="v-title"><span class="art-ic">${escapeHtml(a.ext.slice(0,4)||"file")}</span><div><b>${escapeHtml(a.name)}</b><i>${fmtSize(a.size)}</i></div></div>`+
    (tabs?`<div class="v-tabs"><button data-vtab="preview" class="${curTab==="preview"?"on":""}">Preview</button><button data-vtab="code" class="${curTab==="code"?"on":""}">Code</button></div>`:"")+
    `<div class="v-actions">${a.text?`<button data-vact="copy">Copy</button>`:""}<button data-vact="download">Download</button><button data-vact="close" class="x" aria-label="Close">×</button></div></div><div class="v-body" id="vBody"></div>`;
  const body=$("#vBody");
  const url=()=>{if(!curUrl)curUrl=URL.createObjectURL(artBlob(a));return curUrl};
  try{
    if(a.text&&(!PREV_TEXT.has(a.ext)||curTab==="code")){
      let c=a.content;
      if(a.ext==="json"){try{c=JSON.stringify(JSON.parse(c),null,2)}catch{}}
      body.innerHTML=`<div class="code-block v-code"><pre><code>${highlightCode(c,a.ext)}</code></pre></div>`;
    }else if(a.ext==="html"||a.ext==="htm"){
      const f=document.createElement("iframe");
      f.className="v-frame";
      f.setAttribute("sandbox","allow-scripts allow-forms allow-modals allow-popups");
      f.srcdoc=a.content;
      body.appendChild(f);
    }else if(a.ext==="md"||a.ext==="markdown"){
      body.innerHTML=`<div class="md v-md">${sanitizeHtml(renderMarkdown(a.content))}</div>`;
    }else if(a.ext==="csv"||a.ext==="tsv"){
      const rows=parseCsv(a.content,a.ext==="tsv"?"\t":",");
      const cell=(t,c)=>`<${t}>${escapeHtml(c)}</${t}>`;
      body.innerHTML=`<div class="md v-md"><div class="table-wrap"><table><thead><tr>${(rows[0]||[]).map(c=>cell("th",c)).join("")}</tr></thead><tbody>${rows.slice(1).map(r=>`<tr>${r.map(c=>cell("td",c)).join("")}</tr>`).join("")}</tbody></table></div>${rows.length>500?'<p class="v-note">Showing the first 500 rows.</p>':""}</div>`;
    }else if(a.ext==="svg"||IMG_EXT.has(a.ext)){
      body.innerHTML=`<div class="v-img"><img alt="" src="${url()}"></div>`;
    }else if(a.ext==="pdf"){
      body.innerHTML=`<iframe class="v-frame" src="${url()}"></iframe>`;
    }else if(a.ext==="mp4"||a.ext==="webm"){
      body.innerHTML=`<div class="v-img"><video class="v-media" controls src="${url()}"></video></div>`;
    }else if(a.ext==="mp3"||a.ext==="wav"||a.ext==="ogg"){
      body.innerHTML=`<div class="v-img"><audio controls src="${url()}"></audio></div>`;
    }else{
      const bytes=artBytes(a);
      let es=null;
      if(["zip","docx","pptx","xlsx"].includes(a.ext)){try{es=zipEntries(bytes)}catch{}}
      if(es){
        body.innerHTML='<div class="v-note">Reading file…</div>';
        let txt="";
        try{if(a.ext!=="zip")txt=await officeText(bytes,a.ext,es)}catch{}
        if(tok!==vTok)return;
        body.innerHTML=`<div class="v-pad">`+(txt.trim()?`<div class="v-sec">Text content</div><pre class="v-text">${escapeHtml(txt.slice(0,20000))}</pre>`:"")+
          `<div class="v-sec">Contents · ${es.length} files</div><div class="md"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Size</th></tr></thead><tbody>${es.slice(0,300).map(e=>`<tr><td>${escapeHtml(e.name)}</td><td>${e.name.endsWith("/")?"":fmtSize(e.us)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
      }else{
        body.innerHTML=`<div class="v-pad"><div class="v-sec">No preview for .${escapeHtml(a.ext)} · first bytes</div><pre class="v-text">${escapeHtml(hexDump(bytes))}</pre></div>`;
      }
    }
  }catch(e){body.innerHTML=`<div class="v-note">Couldn’t render this file: ${escapeHtml(e.message||e)}</div>`}
}
$("#viewer").addEventListener("click",async e=>{
  const t=e.target.closest("[data-vtab]");
  if(t){curTab=t.dataset.vtab;renderViewer();return}
  const b=e.target.closest("[data-vact]");
  if(!b||!curArt)return;
  const act=b.dataset.vact;
  if(act==="close")closeViewer();
  else if(act==="copy"){try{await navigator.clipboard.writeText(curArt.content);toast("Copied","ok")}catch{toast("Copy failed.","err")}}
  else if(act==="download"){
    try{
      await saveFile(artBlob(curArt),curArt.name.split("/").pop());
    }catch{toast("Download failed.","err")}
  }
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&curArt&&!isStreaming&&!SP.open)closeViewer();
});

/* ===== reasoning ===== */
function fmtDur(ms){const s=Math.max(1,Math.round(ms/1000));return s<60?s+"s":Math.floor(s/60)+"m "+(s%60)+"s"}
function viewParts(msg){
  let c=msg.content||"",r=msg.reasoning||"";
  c=c.replace(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/gi,(m,x)=>{r+=(r?"\n\n":"")+x.trim();return ""});
  return{reasoning:r.trim(),content:c.replace(/^\s+/,"")};
}
function cleanLine(s){
  s=String(s).replace(/[*`]+|^#+\s*|^>\s*/g,"").replace(/\s+/g," ").trim();
  s=s.replace(/[:;,\s]+$/,"");
  if(s.length<4)return "";
  s=s[0].toUpperCase()+s.slice(1);
  if(s.length>100){s=s.slice(0,100);const i=s.lastIndexOf(" ");s=(i>60?s.slice(0,i):s).replace(/[.,;:\s]+$/,"")+"…"}
  return s;
}
/* a line that looks like code must never be shown as a summary step */
function codeish(l){
  const s=String(l),sym=(s.match(/[{}\[\]();=<>]/g)||[]).length;
  return /`/.test(s)||sym>=3||/=>/.test(s)||/^(const|let|var|function|class|import|export|def|return)\s/i.test(s)||/<\/?[a-z][^>]*>/i.test(s)||/[;{]\s*$/.test(s)||/^\s{2,}\S/.test(s);
}
function stripCode(t){
  return String(t).replace(/```[\s\S]*?(```|$)/g,"").split("\n").filter(l=>!codeish(l)).join("\n").trim();
}
/* some providers already send titled summaries (**Heading**); those are model-decided lines */
function headingLines(t){
  const out=[];
  for(const p of String(t).replace(/\r/g,"").split(/\n{2,}/)){
    const m=/^\s*\*\*([^*\n]+)\*\*/.exec(p)||/^\s*#{1,4}\s+([^\n]+)/.exec(p);
    if(!m)continue;
    if(codeish(m[1]))continue;
    const l=cleanLine(m[1]);
    if(l&&!codeish(l)&&l!==out[out.length-1])out.push(l);
  }
  return out;
}
function summaryLines(msg,vp){
  const h=headingLines(vp.reasoning);
  return h.length?h:(msg.steps||[]).filter(x=>x&&!codeish(x));
}
/* otherwise the selected model writes each summary line itself */
async function modelSummary(text){
  if(!text.trim())return "";
  const tmp={noSys:true,messages:[{id:"s",role:"user",content:"Write ONE short step title that summarizes what this reasoning excerpt is doing: 3 to 8 words, present participle (for example: Checking the flex layout). No code, no quotes, no ending punctuation. Reply with the title only.\n\n"+text}]};
  let t="";
  try{await runCompletion(tmp,(p,k)=>{if(k!=="r")t+=p},undefined)}catch{return ""}
  t=t.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi,"").split("\n").map(x=>x.trim()).filter(Boolean)[0]||"";
  t=t.replace(/^["'“”‘’#*\s-]+|["'“”‘’.*\s]+$/g,"");
  return(!t||t.length>80||codeish(t))?"":t;
}
async function maybeSummarize(msg,final){
  if(msg._sumBusy||state.settings.reasoning===false)return;
  const r=viewParts(msg).reasoning;
  if(!r||headingLines(r).length)return;
  const steps=msg.steps||(msg.steps=[]),fresh=r.slice(msg._sumPos||0);
  if(fresh.length<(final?(steps.length?140:50):450)||steps.length>=14)return;
  if(!final&&Date.now()-(msg._sumAt||0)<2500)return;
  msg._sumBusy=true;msg._sumAt=Date.now();msg._sumPos=r.length;
  let line="";
  try{line=await modelSummary(stripCode(fresh).slice(-1800))}finally{msg._sumBusy=false}
  if(line&&line!==steps[steps.length-1]){steps.push(line);refreshReasonUI(msg)}
}
function refreshReasonUI(msg){
  const chat=activeChat();
  if(!chat||!chat.messages.includes(msg))return;
  const el=$(`#msgsInner .msg[data-id="${msg.id}"]`),live=isStreaming&&chat.messages[chat.messages.length-1]===msg;
  if(el)paintReason(el,msg,viewParts(msg),live);
  save();
}
const SHEET={id:null,set:null};
function sheetHtml(lines,thinking){
  if(!lines.length)return thinking?'<div class="sheet-wait"><span class="ring"></span></div>':"";
  return '<ol class="tl">'+lines.map((x,i)=>`<li${thinking&&i===lines.length-1?' class="live"':""}>${escapeHtml(x)}</li>`).join("")+"</ol>";
}
function refreshSheet(){
  const ov=$("#sheetOv");
  if(!ov||!SHEET.id)return;
  const chat=activeChat(),m=chat&&chat.messages.find(x=>x.id===SHEET.id);
  if(!m){closeSheet();return}
  const vp=viewParts(m),thinking=isStreaming&&chat.messages[chat.messages.length-1]===m&&!vp.content;
  const body=ov.querySelector(".sheet-body"),st=body.scrollTop,atEnd=body.scrollHeight-st-body.clientHeight<40;
  if(SHEET.set)SHEET.set(thinking?"Thought process":"Summary");
  body.innerHTML=sheetHtml(summaryLines(m,vp),thinking);
  body.scrollTop=thinking&&atEnd?body.scrollHeight:st;
}
function closeSheet(quiet){SHEET.id=null;SHEET.set=null;closeSheetUI(quiet)}
function openSheet(id){
  const chat=activeChat();
  if(!chat||!chat.messages.some(x=>x.id===id))return;
  const s=openSheetUI("Summary");
  SHEET.id=id;SHEET.set=s.setTitle;
  refreshSheet();
  s.ov.querySelector("[data-sheet-close]").focus({preventScroll:true});
}
function paintReason(el,msg,vp,streaming){
  const si=el.querySelector(".stream-ind");
  if(si)si.classList.toggle("on",!!streaming&&(!!vp.content||!vp.reasoning));
  const box=el.querySelector(".reason");
  if(!box)return;
  if(!vp.reasoning||state.settings.reasoning===false){box.style.display="none";return}
  const thinking=!!streaming&&!vp.content;
  box.style.display="";
  const lines=summaryLines(msg,vp),lab=box.querySelector(".rt-label");
  const txt=lines.length?lines[lines.length-1]:(thinking?"Thought process":"Summary");
  if(lab.textContent!==txt){
    lab.textContent=txt;
    if(box._n!==lines.length){box._n=lines.length;lab.classList.remove("swap");void lab.offsetWidth;lab.classList.add("swap")}
  }
  box.querySelector(".rt-ring").style.display=thinking?"":"none";
  box.querySelector(".clock").style.display=thinking?"none":"";
  if(SHEET.id===msg.id)refreshSheet();
}
function wantsThinking(model,chat){
  return state.settings.reasoning!==false&&!chat.noSys&&/claude-(3-7|(sonnet|opus|haiku)-[45]|fable|mythos)/.test(model);
}

/* ===== message actions: icons, editing ===== */
ACTION_ICONS.edit='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
function actionsHtml(msg){
  const b=(a,t,i,c="")=>`<button class="act-btn ${c}" data-action="${a}" title="${t}" aria-label="${t}">${i}</button>`;
  let h=b("copy","Copy",ACTION_ICONS.copy);
  if(!msg.error)h+=b("edit","Edit",ACTION_ICONS.edit);
  if(msg.role==="assistant"){h+=b("speak","Read aloud",IC_SPEAK);h+=b("regen","Regenerate",ACTION_ICONS.regen)}
  return h+b("delete","Delete",ACTION_ICONS.del,"danger");
}
function startEdit(msg,el){
  if(isStreaming){toast("Wait for the response to finish.","err");return}
  if(el.classList.contains("editing"))return;
  const isUser=msg.role==="user",c=el.querySelector(".content"),host=isUser?c:c.querySelector(".md");
  el.classList.add("editing");
  const ta=document.createElement("textarea");
  ta.className="edit-ta";ta.value=msg.content;ta.spellcheck=false;
  const bar=document.createElement("div");
  bar.className="edit-bar";
  bar.innerHTML=`<button class="btn" type="button" data-e="cancel">Cancel</button><button class="btn primary" type="button" data-e="save">${isUser?"Save and resend":"Save"}</button>`;
  host.innerHTML="";host.append(ta,bar);
  const grow=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight+2,420)+"px"};
  ta.addEventListener("input",grow);grow();ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
  const cancel=()=>{el.classList.remove("editing");paintMsg(el,msg,false)};
  const commit=async()=>{
    const v=ta.value.trim();
    if(!v){toast("A message can’t be empty.","err");return}
    const chat=activeChat();
    if(!chat)return;
    el.classList.remove("editing");
    if(isUser){
      if(!requireProvider()){paintMsg(el,msg,false);return}
      msg.content=v;
      const idx=chat.messages.findIndex(m=>m.id===msg.id);
      chat.messages=chat.messages.slice(0,idx+1);chat.updatedAt=Date.now();
      renderMessages();renderChatList();save();
      await runAssistant(chat);
    }else{
      msg.content=v;chat.updatedAt=Date.now();paintMsg(el,msg,false);save();
    }
  };
  bar.addEventListener("click",e=>{const b=e.target.closest("[data-e]");if(!b)return;b.dataset.e==="save"?commit():cancel()});
  ta.addEventListener("keydown",e=>{
    e.stopPropagation();
    if(e.key==="Escape")cancel();
    else if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();commit()}
  });
}

/* ===== conversation titles ===== */
async function aiTitle(chat,force){
  if(chat.mode==="build")return;
  if(!force&&(chat.aiTitled||chat.userTitled||state.settings.autoTitle===false))return;
  chat.aiTitled=true;
  const first=chat.messages.find(m=>m.role==="user"),ans=chat.messages.find(m=>m.role==="assistant"&&m.content&&!m.error);
  if(!first||!ans)return;
  const tmp={noSys:true,messages:[{id:"t",role:"user",content:"Write a title of at most 5 words for this conversation. Reply with the title only, with no quotes and no ending punctuation.\n\nUser: "+String(first.content||(first.atts&&first.atts[0]&&first.atts[0].name)||"").slice(0,600)+"\n\nAssistant: "+viewParts(ans).content.slice(0,600)}]};
  let t="";
  try{await runCompletion(tmp,(p,k)=>{if(k!=="r")t+=p},undefined)}catch{return}
  t=t.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi,"").split("\n").map(x=>x.trim()).filter(Boolean)[0]||"";
  t=t.replace(/^["'“”‘’#*\s]+|["'“”‘’.*\s]+$/g,"").slice(0,60);
  if(!t||(!force&&chat.userTitled))return;
  chat.title=t;chat.titled=true;save();renderChatList();
  
}

/* ===== conversation context menu ===== */
let ctxT=0;
function closeCtx(){const m=$("#ctxMenu");if(m)m.remove()}
function openChatMenu(id,x,y){
  closeCtx();
  const c=state.chats.find(k=>k.id===id);
  if(!c)return;
  ctxT=Date.now();
  const m=document.createElement("div");
  m.id="ctxMenu";m.className="ctx";
  const items=[["rename","Rename"],["pin",c.pinned?"Unpin":"Pin to top"],["title","Generate title"],["dup","Duplicate"],["export","Export as Markdown"],["clear","Clear messages"],["sep"],["del","Delete",true]];
  m.innerHTML=items.map(([k,l,d])=>k==="sep"?'<div class="ctx-sep"></div>':`<button type="button" role="menuitem" data-ctx="${k}"${d?' class="danger"':""}>${l}</button>`).join("");
  document.body.appendChild(m);
  const r=m.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+"px";
  m.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+"px";
  m.setAttribute("role","menu");
  const mi=()=>Array.from(m.querySelectorAll("[data-ctx]"));
  m.addEventListener("keydown",e=>{
    const it=mi(),i=it.indexOf(document.activeElement);
    if(e.key==="ArrowDown"){e.preventDefault();it[Math.min(i+1,it.length-1)].focus()}
    else if(e.key==="ArrowUp"){e.preventDefault();it[Math.max(i-1,0)].focus()}
    else if(e.key==="Escape"){e.preventDefault();closeCtx();if(CTX_PREV&&CTX_PREV.focus)CTX_PREV.focus()}
    else if(e.key==="Tab")e.preventDefault();
  });
  CTX_PREV=document.activeElement;mi()[0].focus();
  m.addEventListener("click",e=>{
    if(Date.now()-ctxT<450)return;
    const b=e.target.closest("[data-ctx]");
    if(!b)return;
    closeCtx();chatAction(b.dataset.ctx,id);
  });
}
function chatAction(k,id){
  const c=state.chats.find(x=>x.id===id);
  if(!c)return;
  if(k==="rename")renameChat(id);
  else if(k==="pin"){c.pinned=!c.pinned;save();renderChatList()}
  else if(k==="title"){
    if(c.messages.some(m=>m.role==="assistant"&&m.content&&!m.error)&&requireProvider())aiTitle(c,true);
    else toast("Nothing to title yet.","err");
  }else if(k==="dup"){
    const n=JSON.parse(JSON.stringify(c));
    n.id=uid();n.title=c.title+" (copy)";n.pinned=false;n.createdAt=n.updatedAt=Date.now();
    n.messages.forEach(m=>m.id=uid());
    state.chats.unshift(n);save();renderChatList();
  }else if(k==="export"){
    const safe=(c.title||"chat").replace(/[^\w\d\- ]+/g,"").trim().slice(0,40)||"chat";
    download(`${safe}.md`,chatToMarkdown(c));
  }else if(k==="clear"){
    if(isStreaming){toast("Stop the current response first.","err");return}
    if(confirm("Clear all messages in this chat?")){c.messages=[];c.aiTitled=false;c.updatedAt=Date.now();if(id===state.activeId)renderMessages();renderChatList();save()}
  }else if(k==="del")deleteChat(id);
}
function renameChat(id){
  const t=$(`.chat-item[data-id="${id}"] .ci-title`),c=state.chats.find(x=>x.id===id);
  if(!t||!c)return;
  const inp=document.createElement("input");
  inp.className="ci-edit";inp.value=c.title;inp.maxLength=120;
  t.replaceWith(inp);inp.focus();inp.select();
  let done=false;
  const commit=ok=>{
    if(done)return;
    done=true;
    const v=inp.value.trim();
    if(ok&&v){c.title=v;c.titled=true;c.userTitled=true;save();}
    renderChatList();
  };
  inp.addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Enter")commit(true);else if(e.key==="Escape")commit(false)});
  inp.addEventListener("blur",()=>commit(true));
  inp.addEventListener("click",e=>e.stopPropagation());
}
$("#chatList").addEventListener("contextmenu",e=>{
  const it=e.target.closest(".chat-item");
  if(!it)return;
  e.preventDefault();openChatMenu(it.dataset.id,e.clientX,e.clientY);
});
let lpT=null;
$("#chatList").addEventListener("touchstart",e=>{
  const it=e.target.closest(".chat-item");
  if(!it||e.target.closest(".ci-edit"))return;
  const t=e.touches[0];
  lpT=setTimeout(()=>{lpT=null;openChatMenu(it.dataset.id,t.clientX,t.clientY)},500);
},{passive:true});
["touchend","touchmove","touchcancel"].forEach(ev=>$("#chatList").addEventListener(ev,()=>clearTimeout(lpT),{passive:true}));
document.addEventListener("click",e=>{if(Date.now()-ctxT>450&&!e.target.closest("#ctxMenu"))closeCtx()});

/* ===== composer model menu ===== */
function closeModelPop(){const p=$("#modelPop");if(p)p.classList.remove("open")}
function openModelPop(){
  const s=state.settings,pop=$("#modelPop"),groups=allModelGroups();
  if(!groups.length){openSettings("providers");return}
  if(pop.classList.contains("open")){closeModelPop();return}
  const total=groups.reduce((n,g)=>n+g.models.length,0);
  pop.innerHTML=(total>8?'<input class="mp-search" placeholder="Search models" spellcheck="false" autocomplete="off" aria-label="Search models">':"")+'<div class="mp-list" role="listbox"></div><button class="mp-foot" type="button">Providers and models</button>';
  const box=pop.querySelector(".mp-list"),inp=pop.querySelector(".mp-search");
  const build=()=>{
    const q=inp?inp.value.trim().toLowerCase():"";
    box.textContent="";
    let any=false;
    for(const g of groups){
      const f=g.models.filter(m=>!q||m.toLowerCase().includes(q)||g.name.toLowerCase().includes(q));
      if(!f.length)continue;
      any=true;
      if(groups.length>1){const h=document.createElement("div");h.className="mp-group";h.textContent=g.name;box.appendChild(h)}
      for(const m of f){
        const it=document.createElement("div");
        it.className="dd-item"+(g.id===s.provider&&m===s.model?" sel":"");
        it.setAttribute("role","option");
        const sp=document.createElement("span");sp.textContent=m;it.appendChild(sp);
        it.addEventListener("click",()=>{useModel(g.id,m);closeModelPop();haptic(6)});
        box.appendChild(it);
      }
    }
    if(!any)box.innerHTML='<div class="dd-empty">No models found</div>';
  };
  if(inp){inp.addEventListener("input",build);inp.addEventListener("keydown",e=>e.stopPropagation())}
  pop.querySelector(".mp-foot").addEventListener("click",()=>{closeModelPop();openSettings("providers")});
  pop.classList.add("open");build();
  if(inp&&!(window.matchMedia&&window.matchMedia("(max-width: 760px)").matches))inp.focus();
  const sl=box.querySelector(".sel");if(sl)sl.scrollIntoView({block:"nearest"});
}
document.addEventListener("click",e=>{if(!e.target.closest("#modelPop,#modelChip"))closeModelPop()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeCtx();closeModelPop()}});

/* ===== sanitizer (allowlist, applied to all rendered HTML) ===== */
const OK_TAGS=new Set("A B I EM STRONG DEL MARK KBD U CODE PRE P BR UL OL LI H1 H2 H3 H4 H5 H6 BLOCKQUOTE HR TABLE THEAD TBODY TR TH TD DIV SPAN BUTTON FIGURE FIGCAPTION IMG".split(" "));
const MATH_TAGS=new Set("MATH MROW MI MN MO MTEXT MSPACE MFRAC MSQRT MROOT MSUB MSUP MSUBSUP MUNDER MOVER MUNDEROVER MTABLE MTR MTD MSTYLE MPHANTOM".split(" "));
const OK_CLASS=/^(code-block|code-head|code-copy|done|tok-\w+|inline-code|table-wrap|art-card|art-ic|art-meta|art-open|art-steps|pip|on|writing|err-title|err-body|err-detail|err-acts|btn|thinking|steps|live|ring|math|math-block|math-err|tex|merr|mbox|mcancel|wimg|wimg-ph|wimg-t|wimg-s|mimg|callout|callout-(note|tip|important|warning|caution)|callout-title|task|task-li|is-done|ui-host|ui-skel|cite|md|pri|open|collapsed|fi|fi-s|fk-[a-z]+|act|act-(ic|t|s|st|chip|link|file|prev|run|h|out|dl|dh|df|b|done|plan|body|wrap|in|cv|lab|prog|card|cmd)|st-(ok|err|run|wait))$/;
const MATH_ATTR=/^(display|mathvariant|stretchy|fence|separator|accent|accentunder|largeop|movablelimits|symmetric|lspace|rspace|minsize|maxsize|width|height|linethickness|rowspacing|columnspacing|columnalign|rowalign|displaystyle|scriptlevel|linebreak)$/;
function sanitizeHtml(html){
  const t=document.createElement("template");
  t.innerHTML=html;
  const walk=n=>{
    for(const c of Array.from(n.childNodes)){
      if(c.nodeType===3)continue;
      if(c.nodeType!==1){c.remove();continue}
      const tag=c.tagName.toUpperCase(),isMath=MATH_TAGS.has(tag);
      if(!isMath&&!OK_TAGS.has(tag)){c.replaceWith(document.createTextNode(c.textContent));continue}
      for(const a of Array.from(c.attributes)){
        const k=a.name.toLowerCase(),v=a.value;
        let keep=false;
        if(k==="class")keep=v.split(/\s+/).filter(Boolean).every(x=>OK_CLASS.test(x));
        else if(isMath){
          if(MATH_ATTR.test(k))keep=/^[\w\s.%+\-]*$/.test(v);
          else if(k==="mathcolor")keep=/^([a-zA-Z]+|#[0-9a-fA-F]{3,8})$/.test(v);
        }
        else if(k==="href"&&tag==="A")keep=/^(https?:|mailto:)/i.test(v.trim());
        else if((k==="target"||k==="rel")&&tag==="A")keep=true;
        else if(k==="title"&&tag==="A")keep=v.length<120;
        else if(k==="type"&&tag==="BUTTON")keep=v==="button";
        else if(k==="data-ui"&&tag==="DIV")keep=/^u[0-9a-z]+$/.test(v);
        else if(k==="aria-label"&&tag==="BUTTON")keep=v.length<48;
        else if(k==="data-art"&&tag==="BUTTON")keep=/^a[0-9a-z]+$/.test(v);
        else if((k==="data-ai"||k==="data-fi"||k==="data-pv")&&tag==="BUTTON")keep=/^\d{1,3}$/.test(v);
        else if(k==="style"&&(tag==="TH"||tag==="TD"))keep=/^text-align:(left|right|center)$/.test(v);
        else if(tag==="OL"&&k==="start")keep=/^\d{1,4}$/.test(v);
        else if(tag==="FIGURE"&&(k==="data-q"||k==="data-cap"))keep=v.length<=200;
        else if(tag==="IMG"){
          if(k==="src")keep=/^https:\/\//i.test(v);
          else if(k==="alt")keep=true;
          else if(k==="loading")keep=v==="lazy";
          else if(k==="decoding")keep=v==="async";
          else if(k==="referrerpolicy")keep=v==="no-referrer";
        }
        if(!keep)c.removeAttribute(a.name);
      }
      if(tag==="IMG"){
        if(!c.getAttribute("src")){c.remove();continue}
        c.setAttribute("referrerpolicy","no-referrer");c.setAttribute("loading","lazy");
      }
      walk(c);
    }
  };
  walk(t.content);
  return t.innerHTML;
}

/* ===== accessibility helpers ===== */
let SET_PREV=null,CTX_PREV=null,PAL_PREV=null;
function announce(t){const l=$("#live");if(!l)return;l.textContent="";setTimeout(()=>{l.textContent=t},30)}

/* ===== error states with next actions ===== */
function errorHtml(t){
  const m=String(t);
  let title="Request failed",hint="",acts=[["retry","Try again"]];
  if(/Authentication failed|\(40[13]\)/.test(m)){title="The provider rejected your API key";hint="Check that the key is correct and has access to this model.";acts=[["providers","Open keys"],["retry","Try again"]]}
  else if(/Not found \(404\)/.test(m)){title="Model or URL not found";hint="The model id or base URL looks wrong for this provider.";acts=[["model","Choose model"],["retry","Try again"]]}
  else if(/\(429\)/.test(m)){title="Rate limit or quota reached";hint="Wait a moment, or switch to another model or provider.";acts=[["retry","Try again"],["model","Choose model"]]}
  else if(/^Network error/.test(m)){title="Couldn’t reach the provider";hint=SERVER?"Check the base URL and your connection.":"Browsers block this request (CORS). Run the bundled server, or deploy with its proxy.";acts=[["retry","Try again"],["providers","Check base URL"]]}
  else if(/Provider error \(5/.test(m)){title="The provider had a problem";hint="This is usually temporary."}
  else if(/blocked/i.test(m)&&/proxy|private|loopback/i.test(m)){title="The proxy blocked this address";hint="Private network addresses are blocked by default. See ALLOW_PRIVATE in the README."}
  const detail=m.replace(/\s+/g," ").slice(0,160);
  return `<div class="err-title">${escapeHtml(title)}</div>${hint?`<div class="err-body">${escapeHtml(hint)}</div>`:""}<div class="err-detail">${escapeHtml(detail)}</div><div class="err-acts">${acts.map(([a,l])=>`<button class="btn" type="button" data-err="${a}">${l}</button>`).join("")}</div>`;
}

/* ===== first-run setup ===== */
const SETUP=[["openai","OpenAI"],["anthropic","Anthropic"],["google","Gemini"],["openrouter","OpenRouter"]];
function needsSetup(){
  const s=state.settings,p=PROVIDERS[s.provider];
  return !(p&&(p.needsKey===false||cleanKey(s.keys&&s.keys[s.provider])));
}
function setupHtml(){
  const sel=SETUP.some(x=>x[0]===state.settings.provider)?state.settings.provider:"openai";
  return `<div class="empty"><div class="empty-logo"><svg viewBox="0 0 40 40" aria-hidden="true"><use href="#brand-logo"/></svg></div><h2>Connect a model</h2><div class="setup"><div class="seg" role="radiogroup" aria-label="Provider">${SETUP.map(([id,n])=>`<button type="button" role="radio" aria-checked="${id===sel}" class="${id===sel?"on":""}" data-setup-prov="${id}">${n}</button>`).join("")}</div><div class="key-row"><input class="input" id="setupKey" type="password" placeholder="Paste your API key" autocomplete="off" spellcheck="false" aria-label="API key"><button class="btn primary" id="setupGo" type="button">Connect</button></div><div class="setup-msg" id="setupMsg" role="status"></div><button class="mini-link" type="button" data-setup-more>Other providers and local models</button></div></div>`;
}
async function setupConnect(root){
  const on=root.querySelector(".seg .on"),inp=root.querySelector("#setupKey"),msg=root.querySelector("#setupMsg");
  if(!on||!inp)return;
  const prov=on.dataset.setupProv,key=cleanKey(inp.value);
  if(!key){msg.textContent="Paste a key first.";return}
  msg.textContent="Checking…";
  const prevKey=state.settings.keys[prov];
  state.settings.keys[prov]=key;
  await fetchModels(prov);
  const st=MODEL_ST[prov];
  if(st&&st.s==="ok"){applySetting("provider",prov);save();renderMessages();setTimeout(()=>{const i=$("#input");if(i)i.focus()},30)}
  else{
    if(prevKey===undefined)delete state.settings.keys[prov];else state.settings.keys[prov]=prevKey;
    msg.textContent=(st&&st.m)?("Couldn’t verify the key: "+st.m):"Couldn’t verify the key.";
  }
}
$("#msgsInner").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&e.target.id==="setupKey"){e.preventDefault();setupConnect($("#msgsInner"))}
});

/* ===== command palette ===== */
function closePalette(){const p=$("#palette");if(p)p.remove();if(PAL_PREV&&PAL_PREV.focus)PAL_PREV.focus();PAL_PREV=null}
function openPalette(){
  if($("#palette")){closePalette();return}
  PAL_PREV=document.activeElement;
  const ov=document.createElement("div");
  ov.id="palette";ov.className="pal-ov";
  ov.innerHTML='<div class="pal" role="dialog" aria-modal="true" aria-label="Command palette"><input class="pal-in" placeholder="Search chats, models and commands" aria-label="Search" spellcheck="false" autocomplete="off"><div class="pal-list" role="listbox"></div></div>';
  document.body.appendChild(ov);
  const inp=$(".pal-in",ov),box=$(".pal-list",ov);
  const dark=state.settings.theme==="dark";
  const all=[
    {g:"Commands",t:"New chat",f:newChat},
    {g:"Commands",t:"Open settings",f:()=>openSettings()},
    {g:"Commands",t:"Providers and keys",f:()=>openSettings("providers")},
    {g:"Commands",t:dark?"Switch to light theme":"Switch to dark theme",f:()=>applySetting("theme",dark?"light":"dark")}
  ];
  state.chats.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).forEach(c=>all.push({g:"Chats",t:c.title||"New chat",f:()=>selectChat(c.id)}));
  modelList(state.settings.provider).slice(0,80).forEach(m=>all.push({g:"Models",t:m,f:()=>applySetting("model",m)}));
  let vis=[],idx=0;
  const draw=()=>{
    const q=inp.value.trim().toLowerCase();
    vis=all.filter(x=>x.t.toLowerCase().includes(q)).slice(0,30);
    idx=Math.max(0,Math.min(idx,vis.length-1));
    let g="",h="";
    vis.forEach((x,i)=>{
      if(x.g!==g){g=x.g;h+=`<div class="pal-g">${g}</div>`}
      h+=`<div class="pal-i${i===idx?" on":""}" role="option" aria-selected="${i===idx}" data-i="${i}">${escapeHtml(x.t)}</div>`;
    });
    box.innerHTML=h||'<div class="dd-empty">No results</div>';
    const on=box.querySelector(".pal-i.on");if(on)on.scrollIntoView({block:"nearest"});
  };
  const run=i=>{const x=vis[i];if(!x)return;closePalette();x.f()};
  inp.addEventListener("input",()=>{idx=0;draw()});
  inp.addEventListener("keydown",e=>{
    e.stopPropagation();
    if(e.key==="ArrowDown"){e.preventDefault();idx=Math.min(idx+1,vis.length-1);draw()}
    else if(e.key==="ArrowUp"){e.preventDefault();idx=Math.max(idx-1,0);draw()}
    else if(e.key==="Enter"){e.preventDefault();run(idx)}
    else if(e.key==="Escape")closePalette();
    else if(e.key==="Tab")e.preventDefault();
  });
  box.addEventListener("click",e=>{const i=e.target.closest("[data-i]");if(i)run(+i.dataset.i)});
  ov.addEventListener("mousedown",e=>{if(e.target===ov)closePalette()});
  draw();inp.focus();
}

