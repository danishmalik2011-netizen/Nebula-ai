"use strict";
/* ---------- web search, web images ---------- */
const WEB_ENGINES=[{v:"wikipedia",l:"Wikipedia"},{v:"tavily",l:"Tavily"},{v:"searxng",l:"SearXNG"}];
const WEB_MODES=[{v:"off",l:"Off"},{v:"auto",l:"Auto"},{v:"on",l:"Always"}];
const WEB_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.400 5.800 12 3Z"/></svg>';
const MATH_PROMPT="Write mathematics in LaTeX: $...$ for inline math and $$...$$ on their own lines for display math. Use standard commands (\\frac, \\sqrt, \\sum, \\int, matrices, aligned). Never put math inside code blocks unless showing source.";
const IMAGE_PROMPT="When explaining a topic that involves a well-known person, place, landmark, building, artwork or object, you may show a real photo by putting ![[Exact Wikipedia article title]] on its own line, optionally ![[Title|short caption]]. Use at most three per answer and only where a picture truly helps. Never invent image URLs.";
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,"")}catch{return ""}};
const clip=(s,n)=>{s=String(s||"").replace(/\s+/g," ").trim();return s.length>n?s.slice(0,n-1).trimEnd()+"…":s};

/* ----- Wikipedia / Wikimedia Commons ----- */
async function wikiJson(params,base,signal){
  const u=(base||"https://en.wikipedia.org/w/api.php")+"?"+new URLSearchParams({format:"json",formatversion:"2",origin:"*",...params});
  const r=await fetch(u,{signal});
  if(!r.ok)throw new Error("Wikipedia returned "+r.status);
  return r.json();
}
const byIndex=(a,b)=>(a.index||99)-(b.index||99);
async function searchWikipedia(q,signal){
  const j=await wikiJson({action:"query",generator:"search",gsrsearch:q,gsrlimit:"6",prop:"extracts|info",exintro:"1",explaintext:"1",exsentences:"4",exlimit:"max",inprop:"url"},null,signal);
  return((j.query||{}).pages||[]).slice().sort(byIndex).map(p=>({title:p.title,url:p.fullurl||"https://en.wikipedia.org/wiki/"+encodeURIComponent(String(p.title).replace(/ /g,"_")),snippet:p.extract}));
}
async function searchTavily(q,signal){
  const key=cleanKey(state.settings.keys&&state.settings.keys.tavily);
  if(!key)throw new Error("Add your Tavily key in Settings, Web search.");
  const r=await pfetch("https://api.tavily.com/search",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({query:q,max_results:6,search_depth:"basic",include_answer:false}),signal});
  if(!r.ok)throw new Error(await httpError(r));
  return((await r.json()).results||[]).map(x=>({title:x.title,url:x.url,snippet:x.content}));
}
async function searchSearx(q,signal){
  const base=(state.settings.searxUrl||"").trim().replace(/\/+$/,"");
  if(!/^https?:\/\//i.test(base))throw new Error("Add your SearXNG address in Settings, Web search.");
  const r=await pfetch(`${base}/search?q=${encodeURIComponent(q)}&format=json&safesearch=1`,{headers:{Accept:"application/json"},signal});
  if(!r.ok)throw new Error(r.status===403?"SearXNG refused JSON output. Enable the json format in its settings.yml.":await httpError(r));
  return((await r.json()).results||[]).map(x=>({title:x.title,url:x.url,snippet:x.content}));
}
async function runSearch(q,signal){
  const eng=state.settings.webEngine||"wikipedia";
  const res=eng==="tavily"?await searchTavily(q,signal):eng==="searxng"?await searchSearx(q,signal):await searchWikipedia(q,signal);
  return res.filter(x=>x&&/^https?:\/\//i.test(x.url)).slice(0,6).map(x=>({title:clip(x.title,160)||hostOf(x.url),url:x.url,snippet:clip(x.snippet,500),domain:hostOf(x.url)}));
}

/* ----- deciding when and what to search ----- */
async function planSearch(chat,force,signal){
  const msgs=chat.messages.filter(m=>m.content&&!m.error).slice(-5);
  const last=msgs.slice().reverse().find(m=>m.role==="user");
  if(!last)return null;
  const hist=msgs.map(m=>(m.role==="user"?"User: ":"Assistant: ")+clip(viewParts(m).content,400)).join("\n");
  const today=new Date().toLocaleDateString("en",{dateStyle:"long"});
  const ask=force?'Reply only with "SEARCH: <query>".':'Reply with exactly "NO" if the latest user message can be answered well without fresh or external facts. Otherwise reply only with "SEARCH: <query>".';
  const tmp={noSys:true,messages:[{id:"p",role:"user",content:`Today is ${today}. You prepare web searches for a chat assistant. ${ask} The query must be concise (at most 12 words), standalone, and in the user's language.\n\nConversation:\n${hist}`}]};
  let t="";
  try{await runCompletion(tmp,(p,k)=>{if(k!=="r")t+=p},signal)}
  catch(e){if(e&&e.name==="AbortError")throw e;return force?clip(last.content,200):null}
  t=t.replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi,"").trim();
  const m=/SEARCH:\s*(.+)/i.exec(t);
  if(m)return clip(m[1].replace(/^["“]+|["”]+$/g,""),160);
  return force?clip(last.content,200):null;
}
function webContextBlock(q,res){
  const today=new Date().toLocaleDateString("en",{dateStyle:"long"});
  const body=res.map((r,i)=>`[${i+1}] ${r.title} (${r.domain})\n${r.snippet}`).join("\n\n");
  return `Today is ${today}. Web search results for "${q}":\n\n${body}\n\nUse these results when they help. Cite them inline as [1], [2] matching the numbers above. If they do not answer the question, say so and answer from your own knowledge, noting that it may be out of date. Do not invent sources.`;
}
function paintWeb(el,msg){
  const box=el.querySelector(".web");
  if(!box)return;
  const w=msg.web;
  if(!w){box.style.display="none";box._sig="";return}
  const n=(w.sources||[]).length,sig=w.state+"|"+w.query+"|"+n;
  if(box._sig===sig)return;
  box._sig=sig;box.style.display="";
  const busy=w.state==="planning"||w.state==="searching";
  const label={planning:"Deciding what to search",searching:"Searching the web",failed:"Search failed",none:"No results"}[w.state]||(n+(n===1?" source":" sources"));
  const sub=w.state==="failed"?w.error:w.query?"“"+w.query+"”":"";
  box.innerHTML=`<div class="web-row">${busy?'<span class="ring"></span>':WEB_ICON}<span class="web-l">${escapeHtml(label)}</span>${sub?`<span class="web-q">${escapeHtml(sub)}</span>`:""}</div>`+
    (n?`<div class="web-src">${w.sources.map((s,i)=>`<a class="src" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer"><b>${i+1}</b><span>${escapeHtml(s.domain)}</span></a>`).join("")}</div>`:"");
}
function repaintWeb(msg){const el=$(`#msgsInner .msg[data-id="${msg.id}"]`);if(el)paintWeb(el,msg)}
async function webPhase(chat,msg,signal){
  msg.web={state:"planning",query:"",sources:[]};repaintWeb(msg);
  const q=await planSearch(chat,state.settings.webMode==="on",signal);
  if(!q){msg.web=null;repaintWeb(msg);return}
  msg.web={state:"searching",query:q,sources:[]};repaintWeb(msg);
  try{
    const res=await runSearch(q,signal);
    if(!res.length)msg.web={state:"none",query:q,sources:[]};
    else{msg.web={state:"done",query:q,sources:res};chat._web=webContextBlock(q,res)}
  }catch(e){
    if(e&&e.name==="AbortError")throw e;
    msg.web={state:"failed",query:q,sources:[],error:clip(e&&e.message||e,140)};
  }
  repaintWeb(msg);
}
function updateWebBtn(){
  const b=$("#webBtn");
  if(!b)return;
  const on=state.settings.webMode&&state.settings.webMode!=="off";
  b.classList.toggle("on",!!on);
  b.setAttribute("aria-pressed",String(!!on));
  b.title=on?"Web search on":"Web search off";
}
$("#webBtn").addEventListener("click",()=>{
  haptic(8);
  applySetting("webMode",state.settings.webMode==="off"?"auto":"off");
});
$("#webBtn").innerHTML=WEB_ICON;

/* ----- web images ----- */
const IMG_CACHE=new Map();
let IMG_LOADED=false;
function imgStore(){
  if(!IMG_LOADED){IMG_LOADED=true;try{const o=JSON.parse(localStorage.getItem("nebula.img.v1")||"{}");for(const k in o)IMG_CACHE.set(k,o[k])}catch{}}
}
function imgSave(){
  try{
    const o={};
    for(const[k,v]of IMG_CACHE)if(v)o[k]=v;
    const ks=Object.keys(o).slice(-120),out={};
    ks.forEach(k=>out[k]=o[k]);
    localStorage.setItem("nebula.img.v1",JSON.stringify(out));
  }catch{}
}
async function wikiImage(q){
  imgStore();
  const key=q.toLowerCase();
  if(IMG_CACHE.has(key))return IMG_CACHE.get(key);
  let out=null;
  try{
    const j=await wikiJson({action:"query",generator:"search",gsrsearch:q,gsrlimit:"5",prop:"pageimages|extracts|info",piprop:"thumbnail",pithumbsize:"1000",exintro:"1",explaintext:"1",exsentences:"1",exlimit:"max",inprop:"url"});
    const pg=((j.query||{}).pages||[]).slice().sort(byIndex).find(p=>p.thumbnail&&/^https:\/\//.test(p.thumbnail.source));
    if(pg)out={src:pg.thumbnail.source,w:pg.thumbnail.width,h:pg.thumbnail.height,title:pg.title,desc:clip(pg.extract,140),url:pg.fullurl||"https://en.wikipedia.org/wiki/"+encodeURIComponent(String(pg.title).replace(/ /g,"_")),from:"Wikipedia"};
  }catch{}
  if(!out){
    try{
      const j=await wikiJson({action:"query",generator:"search",gsrsearch:q,gsrnamespace:"6",gsrlimit:"5",prop:"imageinfo",iiprop:"url|mime|size",iiurlwidth:"1000"},"https://commons.wikimedia.org/w/api.php");
      for(const p of((j.query||{}).pages||[]).slice().sort(byIndex)){
        const ii=(p.imageinfo||[])[0];
        if(ii&&ii.thumburl&&/^image\/(jpeg|png|webp)$/.test(ii.mime||"")&&/^https:\/\//.test(ii.thumburl)){
          out={src:ii.thumburl,w:ii.thumbwidth,h:ii.thumbheight,title:String(p.title||q).replace(/^File:/,"").replace(/\.\w+$/,"").replace(/_/g," "),desc:"",url:ii.descriptionurl||"https://commons.wikimedia.org/",from:"Commons"};
          break;
        }
      }
    }catch{}
  }
  IMG_CACHE.set(key,out);
  if(out)imgSave();
  return out;
}
function closeLightbox(){const o=$("#lightbox");if(o)o.remove()}
function openLightbox(r){
  closeLightbox();
  const ov=document.createElement("div");
  ov.className="lightbox";ov.id="lightbox";
  ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");ov.setAttribute("aria-label",r.title||"Image");
  const img=new Image();
  img.src=r.src;img.alt=r.title||"";img.referrerPolicy="no-referrer";
  const cap=document.createElement("div");
  cap.className="lb-cap";cap.textContent=(r.title||"")+(r.desc?" — "+r.desc:"");
  const x=document.createElement("button");
  x.className="lb-x";x.type="button";x.setAttribute("aria-label","Close");x.innerHTML=ICX;
  ov.append(img,cap,x);
  document.body.appendChild(ov);
  haptic(6);
  let y0=0,dy=0;
  ov.addEventListener("touchstart",e=>{y0=e.touches[0].clientY;dy=0},{passive:true});
  ov.addEventListener("touchmove",e=>{dy=e.touches[0].clientY-y0;img.style.transform=`translateY(${dy}px)`;ov.style.opacity=String(Math.max(.3,1-Math.abs(dy)/400))},{passive:true});
  ov.addEventListener("touchend",()=>{if(Math.abs(dy)>110)closeLightbox();else{img.style.transform="";ov.style.opacity=""}});
  ov.addEventListener("click",closeLightbox);
  ov.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();closeLightbox()}});
  x.focus();
}
function fillFigure(fig,r){
  const ph=fig.querySelector(".wimg-ph"),cap=fig.querySelector("figcaption");
  const img=new Image();
  img.alt=r.title||"";img.decoding="async";img.referrerPolicy="no-referrer";
  if(r.w&&r.h){img.width=r.w;img.height=r.h}
  img.onload=()=>{if(ph)ph.remove();fig.classList.add("ready")};
  img.onerror=()=>fig.remove();
  img.addEventListener("click",()=>openLightbox(r));
  img.src=r.src;
  fig.insertBefore(img,cap||null);
  if(cap){
    const t=cap.querySelector(".wimg-t");
    if(t&&!fig.getAttribute("data-cap"))t.textContent=r.title||fig.getAttribute("data-q");
    const a=document.createElement("a");
    a.className="wimg-s";a.href=r.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=r.from||"Source";
    cap.appendChild(a);
  }
}
function hydrateImages(root){
  if(!root||state.settings.webImages===false)return;
  root.querySelectorAll("figure.wimg:not([data-done])").forEach(fig=>{
    fig.setAttribute("data-done","1");
    wikiImage(fig.getAttribute("data-q")||"").then(r=>{
      if(!fig.isConnected)return;
      if(!r){fig.remove();return}
      fillFigure(fig,r);
    });
  });
}
