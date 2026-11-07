"use strict";
/* ---------- attachments ---------- */
const ATT_TEXT_EXT=new Set("txt md markdown csv tsv json xml yaml yml toml ini log html htm css js mjs ts tsx jsx py rb go rs java c cpp h hpp cs php sh sql swift kt svg tex bib".split(" "));
const ATT_MAX={count:8,side:1568,textChars:120000,pdfBytes:20*1048576,imgBytes:25*1048576,total:14*1048576};
const IC_PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const IC_PHOTO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/></svg>';
const IC_CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.4"/></svg>';
const IC_FILE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/></svg>';
let ATT=[];

const attExt=n=>(String(n).split(".").pop()||"").toLowerCase();
function fileKind(name,mime){
  const e=attExt(name),m=String(mime||"");
  if(/^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/.test(m)||/^(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/.test(e))return "image";
  if(m==="application/pdf"||e==="pdf")return "pdf";
  if(m.startsWith("text/")||ATT_TEXT_EXT.has(e)||m==="application/json"||m==="application/xml"||m==="image/svg+xml")return "text";
  return "";
}
const canPdf=()=>["anthropic","google","openai","openrouter"].includes(state.settings.provider);
const readyAtts=()=>ATT.filter(a=>a.status==="ready");
const attBusy=()=>ATT.some(a=>a.status==="loading");
const stripAtt=a=>{const o={id:a.id,kind:a.kind,name:a.name,mime:a.mime,size:a.size};for(const k of["data","text","thumb","w","h"])if(a[k]!=null)o[k]=a[k];return o};
function clearAtts(){ATT=[];renderTray();setSendState()}

function b64FromBlob(blob){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(String(r.result).split(",")[1]||"");
    r.onerror=()=>rej(r.error||new Error("Couldn’t read the file."));
    r.readAsDataURL(blob);
  });
}
async function loadBitmap(file){
  if(window.createImageBitmap){
    try{return await createImageBitmap(file,{imageOrientation:"from-image"})}catch{}
  }
  return new Promise((res,rej)=>{
    const u=URL.createObjectURL(file),im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);res(im)};
    im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error("This image format can’t be read here."))};
    im.src=u;
  });
}
function drawScaled(src,maxSide){
  const w0=src.width,h0=src.height,k=Math.min(1,maxSide/Math.max(w0,h0));
  const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(w0*k));c.height=Math.max(1,Math.round(h0*k));
  const x=c.getContext("2d");
  x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
  x.drawImage(src,0,0,c.width,c.height);
  return c;
}
function makeThumb(src){
  const s=160,c=document.createElement("canvas");
  c.width=s;c.height=s;
  const x=c.getContext("2d"),k=Math.max(s/src.width,s/src.height),w=src.width*k,h=src.height*k;
  x.fillStyle="#fff";x.fillRect(0,0,s,s);
  x.drawImage(src,(s-w)/2,(s-h)/2,w,h);
  return c.toDataURL("image/jpeg",.72);
}
async function processFile(file){
  const kind=fileKind(file.name,file.type);
  if(!kind)throw new Error("This file type isn’t supported.");
  const base={id:uid(),kind,name:file.name||(kind==="image"?"photo.jpg":"file"),size:file.size,mime:file.type||""};
  if(kind==="image"){
    if(file.size>ATT_MAX.imgBytes)throw new Error("That image is too large.");
    const bmp=await loadBitmap(file),big=drawScaled(bmp,ATT_MAX.side);
    const blob=await new Promise(r=>big.toBlob(r,"image/jpeg",.86));
    if(!blob)throw new Error("Couldn’t process the image.");
    return{...base,mime:"image/jpeg",data:await b64FromBlob(blob),thumb:makeThumb(bmp),w:big.width,h:big.height};
  }
  if(kind==="pdf"){
    if(!canPdf())throw new Error("This provider can’t read PDFs.");
    if(file.size>ATT_MAX.pdfBytes)throw new Error("That PDF is too large.");
    return{...base,mime:"application/pdf",data:await b64FromBlob(file)};
  }
  let t=await file.text();
  if(t.slice(0,4000).includes("\u0000"))throw new Error("That looks like a binary file.");
  if(t.length>ATT_MAX.textChars)t=t.slice(0,ATT_MAX.textChars)+"\n…[truncated]";
  return{...base,mime:file.type||"text/plain",text:t};
}
async function addFiles(list){
  for(const f of Array.from(list||[])){
    if(ATT.length>=ATT_MAX.count){toast(`You can attach up to ${ATT_MAX.count} files.`,"err");break}
    const ph={id:uid(),kind:fileKind(f.name,f.type)||"file",name:f.name||"file",status:"loading"};
    ATT.push(ph);
    renderTray();setSendState();
    processFile(f).then(r=>{
      const i=ATT.findIndex(a=>a.id===ph.id);
      if(i<0)return;
      const used=ATT.reduce((n,a)=>n+(a.data?a.data.length:0),0)+(r.data?r.data.length:0);
      if(used>ATT_MAX.total){ATT.splice(i,1);toast("Attachments are too large together.","err")}
      else ATT[i]={...r,status:"ready"};
    }).catch(e=>{
      const i=ATT.findIndex(a=>a.id===ph.id);
      if(i>=0)ATT.splice(i,1);
      toast(String(e&&e.message||e),"err");
    }).finally(()=>{renderTray();setSendState()});
  }
}
function renderTray(){
  const tray=$("#attTray");
  if(!tray)return;
  tray.hidden=!ATT.length;
  $(".composer-inner").classList.toggle("has-att",ATT.length>0);
  tray.innerHTML=ATT.map(a=>{
    const x=`<button class="att-x" type="button" data-rm="${a.id}" aria-label="Remove ${escapeHtml(a.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    if(a.status==="loading")return `<div class="att load" aria-busy="true"><span class="ring"></span>${x}</div>`;
    if(a.kind==="image"&&a.thumb)return `<div class="att"><img src="${escapeHtml(a.thumb)}" alt="${escapeHtml(a.name)}">${x}</div>`;
    return `<div class="att file"><span class="att-ic">${escapeHtml((attExt(a.name)||a.kind).slice(0,4))}</span><span class="att-n">${escapeHtml(a.name)}</span>${x}</div>`;
  }).join("");
}
function paintUserContent(content,msg){
  content.textContent="";
  const at=msg.atts||[];
  if(at.length){
    const row=document.createElement("div");
    row.className="m-atts";
    for(const a of at){
      const b=document.createElement("button");
      b.type="button";b.className="m-att "+(a.kind==="image"?"img":"file");b.dataset.att=msg.id+":"+a.id;
      b.setAttribute("aria-label","Open "+a.name);
      if(a.kind==="image"&&a.thumb&&/^data:image\/jpeg;base64,/.test(a.thumb)){const im=new Image();im.src=a.thumb;im.alt=a.name;b.appendChild(im)}
      else{
        const ic=document.createElement("span"),n=document.createElement("span");
        ic.className="att-ic";ic.textContent=(attExt(a.name)||a.kind).slice(0,4);
        n.className="att-n";n.textContent=a.name;
        b.append(ic,n);
      }
      row.appendChild(b);
    }
    content.appendChild(row);
  }
  if(msg.content){const t=document.createElement("div");t.className="utext";t.textContent=msg.content;content.appendChild(t)}
  content.classList.toggle("only-atts",at.length>0&&!msg.content);
}
function openAttachment(msgId,attId){
  const chat=activeChat(),m=chat&&chat.messages.find(x=>x.id===msgId),a=m&&(m.atts||[]).find(x=>x.id===attId);
  if(!a)return;
  if(a.kind==="image"&&a.data){openLightbox({src:`data:${a.mime};base64,${a.data}`,title:a.name});return}
  const id="att"+a.id;
  ART[id]={id,name:a.name,ext:attExt(a.name)||(a.kind==="pdf"?"pdf":"txt"),text:a.kind==="text",content:a.kind==="text"?a.text:a.data,size:a.size||0,bytes:null};
  openArtifact(id);
}
function openAttachMenu(){
  const s=openSheetUI("Attach"),coarse=window.matchMedia&&window.matchMedia("(pointer: coarse)").matches;
  const row=(k,ic,l)=>`<button class="pk-item" type="button" data-pick="${k}"><span class="pk-ic">${ic}</span><span class="pk-l">${l}</span></button>`;
  s.body.innerHTML=`<div class="pk-list">${row("photo",IC_PHOTO,"Photos")}${coarse?row("camera",IC_CAM,"Camera"):""}${row("file",IC_FILE,"Files")}</div>`;
  s.body.addEventListener("click",e=>{
    const b=e.target.closest("[data-pick]");
    if(!b)return;
    const f=$("#fileIn");
    f.accept=b.dataset.pick==="file"?"":"image/*";
    if(b.dataset.pick==="camera")f.setAttribute("capture","environment");else f.removeAttribute("capture");
    f.click();closeSheetUI(true);
  });
}
$("#attachBtn").innerHTML=IC_PLUS;
$("#attachBtn").addEventListener("click",()=>{haptic(6);openAttachMenu()});
$("#fileIn").addEventListener("change",e=>{addFiles(e.target.files);e.target.value=""});
$("#attTray").addEventListener("click",e=>{
  const x=e.target.closest("[data-rm]");
  if(!x)return;
  ATT=ATT.filter(a=>a.id!==x.dataset.rm);
  haptic(5);renderTray();setSendState();
});
$("#input").addEventListener("paste",e=>{
  const fs=Array.from((e.clipboardData&&e.clipboardData.files)||[]);
  if(fs.length){e.preventDefault();addFiles(fs)}
});
(function dropZone(){
  let n=0;
  const has=e=>Array.from((e.dataTransfer&&e.dataTransfer.types)||[]).includes("Files"),z=$("#dropZone");
  document.addEventListener("dragenter",e=>{if(has(e)){n++;z.classList.add("on")}});
  document.addEventListener("dragleave",e=>{if(has(e)&&--n<=0){n=0;z.classList.remove("on")}});
  document.addEventListener("dragover",e=>{if(has(e))e.preventDefault()});
  document.addEventListener("drop",e=>{if(!has(e))return;e.preventDefault();n=0;z.classList.remove("on");addFiles(e.dataTransfer.files)});
})();
