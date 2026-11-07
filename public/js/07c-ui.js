"use strict";
/* ---------- rich response components ----------
   The model writes ```ui:<type> blocks with compact JSON. Everything below builds HTML strings from escaped
   values only; the result is inserted after the message HTML has been sanitized. */
const UI_STORE=new Map();
const UI_PAL=["#FFD1C7","#9A39E8","#FFC9DF","#8EC5FF","#9BE5B5","#FFE08A"];
const UI_PROMPT='Rich components (use sparingly, only when they truly help; otherwise write normal Markdown). Put compact valid JSON in a fenced block whose info string is ui:<type>:\n- ui:chart {"type":"bar|line|donut|pie","title":"","labels":["Jan","Feb"],"series":[{"name":"Hours","values":[60,75]}],"xTitle":"","yTitle":"","caption":""} (donut and pie take "labels" and "values":[..])\n- ui:cards {"cards":[{"icon":"book|chart|code|doc|star|bolt|flask|globe|heart|user|clock|bulb|shield|pin","title":"","text":"","prompt":"optional follow-up sent when tapped"}]}\n- ui:media {"items":[{"image":"Exact Wikipedia article title","title":"","text":""}]} (picture left, text right)\n- ui:carousel {"items":[{"image":"Wikipedia title","title":"","text":""}]}\n- ui:explainer {"title":"","subtitle":"","image":"Wikipedia title","sections":[{"heading":"Definition","body":"Markdown"}]}\n- ui:form {"title":"","description":"","fields":[{"type":"radio|slider|checkbox|textarea|select|text","label":"","options":["A","B"],"placeholder":""}],"submit":"Show selected values","action":"show|send"}\n- ```svg blocks render as figure cards; begin them with <!-- title: Name | caption: Text -->.\nNever put backticks inside the JSON.';
const UI_ICONS={
  book:'<path d="M3 5.5c3-.8 6-.4 9 1.5 3-1.9 6-2.3 9-1.5v13c-3-.8-6-.4-9 1.5-3-1.9-6-2.3-9-1.5Z"/><path d="M12 7v13"/>',
  chart:'<path d="M4 20V11M10 20V5M16 20v-7M22 20H2"/><path d="m4 8 5-3 4 3 7-5"/>',
  code:'<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  doc:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  flask:'<path d="M9 3h6M10 3v6l-5.500 9.500A2 2 0 0 0 6.200 21h11.600a2 2 0 0 0 1.700-2.500L14 9V3"/><path d="M7.500 15h9"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.700 3.700 5.700 3.700 9s-1.200 6.300-3.700 9c-2.500-2.700-3.700-5.700-3.700-9S9.500 5.700 12 3Z"/>',
  heart:'<path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.200a4.300 4.300 0 0 1 7.500 2.600C19.500 15.400 12 20 12 20Z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.200 2 8 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulb:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.400-1.600 1-2.100A6 6 0 0 0 12 3Z"/>',
  shield:'<path d="M12 3 5 6v5.500c0 4.300 3 8 7 9.500 4-1.500 7-5.200 7-9.500V6Z"/>',
  pin:'<path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0C18.500 15.400 12 21 12 21Z"/><circle cx="12" cy="10" r="2.500"/>'
};
const E=escapeHtml;
const num=v=>Number.isFinite(+v)?+v:0;
const str=(v,n)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").slice(0,n||300);
const r1=v=>Math.round(v*10)/10;
const fmtNum=v=>{const n=Math.round(v*100)/100;return String(n)};
const uiIcon=n=>`<svg class="ui-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[String(n||"").toLowerCase()]||UI_ICONS.doc}</svg>`;
const arr=(v,n)=>Array.isArray(v)?v.slice(0,n):[];

function niceMax(m){
  if(!(m>0))return 1;
  const p=Math.pow(10,Math.floor(Math.log10(m))),f=m/p;
  return[1,1.2,1.5,2,2.5,3,4,5,6,8,10].find(s=>f<=s+1e-9)*p;
}
/* ----- charts ----- */
function chartSeries(d,maxLabels){
  const labels=arr(d.labels,maxLabels).map(x=>str(x,16));
  const series=arr(d.series,4).map((s,i)=>({name:str(s&&s.name||("Series "+(i+1)),28),values:arr(s&&s.values,labels.length).map(num)}));
  if(!series.length&&Array.isArray(d.values))series.push({name:str(d.name||"Value",28),values:arr(d.values,labels.length).map(num)});
  return{labels,series};
}
function legendHtml(series,live){
  return `<div class="ui-leg${live?" live":""}">${series.map((s,i)=>`<span style="--c:${UI_PAL[i%UI_PAL.length]}" data-s="${i}"><i></i><em>${E(s.name)}</em>${live?`<b>${E(fmtNum(s.values[s.values.length-1]||0))}</b>`:""}</span>`).join("")}</div>`;
}
function chartBar(d){
  const{labels,series}=chartSeries(d,24);
  if(!labels.length||!series.length)return null;
  const W=640,H=380,L=64,R=12,T=46,B=48,pw=W-L-R,ph=H-T-B;
  const max=num(d.yMax)>0?num(d.yMax):niceMax(Math.max(1,...series.flatMap(s=>s.values)));
  const y=v=>T+ph-Math.max(0,v)/max*ph;
  let g="";
  for(let i=0;i<=4;i++){
    const v=max*i/4,yy=y(v);
    g+=`<text class="ax" x="${L-12}" y="${r1(yy+7)}" text-anchor="end">${E(fmtNum(v))}</text>`+(i?`<line class="grid" x1="${L}" y1="${r1(yy)}" x2="${W-R}" y2="${r1(yy)}"/>`:"");
  }
  const gw=pw/labels.length,bw=Math.min(72,gw*.64/series.length),gap=series.length>1?5:0;
  let bars="";
  labels.forEach((lb,i)=>{
    const gx=L+gw*i+gw/2,x0=gx-(bw*series.length+gap*(series.length-1))/2;
    series.forEach((s,k)=>{
      const v=s.values[i]||0,x=x0+k*(bw+gap),yy=y(v),h=Math.max(3,T+ph-yy);
      bars+=`<rect x="${r1(x)}" y="${r1(yy)}" width="${r1(bw)}" height="${r1(h)}" rx="11" fill="${UI_PAL[k%UI_PAL.length]}"/><text class="val" x="${r1(x+bw/2)}" y="${r1(yy-12)}" text-anchor="middle">${E(fmtNum(v))}</text>`;
    });
    bars+=`<text class="ax" x="${r1(gx)}" y="${H-12}" text-anchor="middle">${E(lb)}</text>`;
  });
  const svg=`<svg class="ui-bar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(str(d.title||"Bar chart",80))}">${g}<line class="base" x1="${L}" y1="${T+ph}" x2="${W-R}" y2="${T+ph}"/>${bars}</svg>`;
  return{svg,legend:series.length>1?legendHtml(series,false):""};
}
function smoothPath(p){
  if(p.length<2)return "";
  let s=`M${r1(p[0][0])},${r1(p[0][1])}`;
  for(let i=0;i<p.length-1;i++){
    const a=p[i-1]||p[i],b=p[i],c=p[i+1],e=p[i+2]||c;
    s+=` C${r1(b[0]+(c[0]-a[0])/6)},${r1(b[1]+(c[1]-a[1])/6)} ${r1(c[0]-(e[0]-b[0])/6)},${r1(c[1]-(e[1]-b[1])/6)} ${r1(c[0])},${r1(c[1])}`;
  }
  return s;
}
function chartLine(d){
  const{labels,series}=chartSeries(d,40);
  if(labels.length<2||!series.length)return null;
  const W=640,H=400,L=70,R=22,T=70,B=70,pw=W-L-R,ph=H-T-B;
  const max=num(d.yMax)>0?num(d.yMax):niceMax(Math.max(1,...series.flatMap(s=>s.values))),min=0;
  const px=i=>L+i*pw/(labels.length-1),py=v=>T+ph-(Math.min(max,Math.max(min,v))-min)/(max-min)*ph;
  let g="";
  for(let i=0;i<=4;i++){
    const v=min+(max-min)*i/4,yy=py(v);
    g+=`<text class="ax" x="${L-14}" y="${r1(yy+7)}" text-anchor="end">${E(fmtNum(v))}</text><line class="grid" x1="${L}" y1="${r1(yy)}" x2="${W-R}" y2="${r1(yy)}"/>`;
  }
  const step=Math.ceil(labels.length/6);
  let xl="";
  labels.forEach((lb,i)=>{if(i===0||i===labels.length-1||(i%step===0&&labels.length-1-i>=step/2))xl+=`<text class="ax" x="${r1(px(i))}" y="${H-36}" text-anchor="${i===0?"start":i===labels.length-1?"end":"middle"}">${E(lb)}</text>`});
  if(d.xTitle)xl+=`<text class="ax" x="${r1(L+pw/2)}" y="${H-36}" text-anchor="middle">${E(str(d.xTitle,24))}</text>`;
  const yt=d.yTitle?`<text class="ax" transform="rotate(-90 20 ${r1(T+ph/2)})" x="20" y="${r1(T+ph/2)}" text-anchor="middle">${E(str(d.yTitle,24))}</text>`:"";
  const lines=series.map((s,k)=>`<path class="ln" d="${smoothPath(s.values.map((v,i)=>[px(i),py(v)]))}" stroke="${UI_PAL[k%UI_PAL.length]}"/>`).join("");
  const pts=labels.map((lb,i)=>({x:r1(px(i)),label:lb,y:series.map(s=>r1(py(s.values[i]||0))),v:series.map(s=>fmtNum(s.values[i]||0))}));
  const sel=`<g class="sel"><line class="vl" x1="0" y1="${T-6}" x2="0" y2="${T+ph}"/>${series.map((s,k)=>`<circle class="dot" r="7" fill="${UI_PAL[k%UI_PAL.length]}"/>`).join("")}<text class="tip" x="0" y="${T-16}" text-anchor="middle"></text></g>`;
  const svg=`<svg class="ui-line" viewBox="0 0 ${W} ${H}" data-pts="${E(JSON.stringify(pts))}" role="img" aria-label="${E(str(d.title||"Line chart",80))}">${g}${xl}${yt}${lines}${sel}</svg>`;
  return{svg,legend:legendHtml(series,true)};
}
function arcPath(cx,cy,R,r,a0,a1){
  const large=a1-a0>Math.PI?1:0,p=(rad,a)=>`${r1(cx+Math.cos(a)*rad)},${r1(cy+Math.sin(a)*rad)}`;
  return r>0?`M${p(R,a0)} A${R},${R} 0 ${large} 1 ${p(R,a1)} L${p(r,a1)} A${r},${r} 0 ${large} 0 ${p(r,a0)} Z`:`M${cx},${cy} L${p(R,a0)} A${R},${R} 0 ${large} 1 ${p(R,a1)} Z`;
}
function chartDonut(d,pie){
  const labels=arr(d.labels,8).map(x=>str(x,22));
  const vals=arr(d.values||(d.series&&d.series[0]&&d.series[0].values),labels.length||8).map(v=>Math.max(0,num(v)));
  const total=vals.reduce((a,b)=>a+b,0);
  if(!vals.length||total<=0)return null;
  const S=300,c=S/2,R=146,r=pie?0:R*.52;
  let a=-Math.PI/2,paths="";
  vals.forEach((v,i)=>{
    const sweep=v/total*Math.PI*2;
    if(sweep<=0)return;
    const col=UI_PAL[i%UI_PAL.length];
    if(sweep>=Math.PI*2-1e-6){paths+=`<path d="${arcPath(c,c,R,r,a,a+Math.PI)} ${arcPath(c,c,R,r,a+Math.PI,a+Math.PI*2)}" fill="${col}"/>`}
    else paths+=`<path d="${arcPath(c,c,R,r,a,a+sweep)}" fill="${col}"/>`;
    a+=sweep;
  });
  const svg=`<svg class="ui-donut" viewBox="0 0 ${S} ${S}" role="img" aria-label="${E(str(d.title||"Chart",80))}">${paths}</svg>`;
  const legend=`<div class="ui-leg wide">${vals.map((v,i)=>`<span style="--c:${UI_PAL[i%UI_PAL.length]}"><i></i><em>${E(labels[i]||("Item "+(i+1)))}</em><b>${E(fmtNum(v))}</b></span>`).join("")}</div>`;
  return{svg,legend,after:true};
}
function chartHtml(d){
  const t=String(d.type||"bar").toLowerCase();
  const c=t==="line"?chartLine(d):t==="donut"||t==="doughnut"?chartDonut(d,false):t==="pie"?chartDonut(d,true):chartBar(d);
  if(!c)return null;
  return `<figure class="ui-card ui-chart ui-${t}">${d.title?`<h4 class="ui-t">${E(str(d.title,90))}</h4>`:""}${c.after?"":c.legend}<div class="ui-plot">${c.svg}</div>${c.after?c.legend:""}${d.caption?`<figcaption class="ui-cap">${E(str(d.caption,160))}</figcaption>`:""}</figure>`;
}
function uiLineSelect(svg,pts,i){
  const p=pts[i],g=svg.querySelector(".sel");
  if(!p||!g)return;
  const vl=g.querySelector(".vl");
  vl.setAttribute("x1",p.x);vl.setAttribute("x2",p.x);
  g.querySelectorAll(".dot").forEach((dot,k)=>{dot.setAttribute("cx",p.x);dot.setAttribute("cy",p.y[k])});
  const tip=g.querySelector(".tip"),w=svg.viewBox.baseVal.width;
  tip.setAttribute("x",Math.min(w-30,Math.max(30,p.x)));
  tip.textContent=p.label;
  const card=svg.closest(".ui-card");
  if(card)card.querySelectorAll(".ui-leg.live span").forEach((s,k)=>{const b=s.querySelector("b");if(b)b.textContent=p.v[k]});
}
function uiLinePointer(e){
  const svg=e.target&&e.target.closest?e.target.closest("svg.ui-line"):null;
  if(!svg||(e.type==="pointermove"&&e.pointerType==="mouse"&&!(e.buttons&1)&&e.pointerType!=="mouse"))return;
  let pts;
  try{pts=JSON.parse(svg.getAttribute("data-pts")||"[]")}catch{return}
  if(!pts.length)return;
  const r=svg.getBoundingClientRect(),vx=(e.clientX-r.left)/r.width*svg.viewBox.baseVal.width;
  let bi=0;
  pts.forEach((p,i)=>{if(Math.abs(p.x-vx)<Math.abs(pts[bi].x-vx))bi=i});
  uiLineSelect(svg,pts,bi);
}

/* ----- cards, media, carousel, explainer ----- */
function cardsHtml(d){
  const items=arr(d.cards||d.items,12);
  if(!items.length)return null;
  return `<div class="ui-grid">${items.map(c=>{
    const p=str(c.prompt,300),inner=`${uiIcon(c.icon)}<h5>${E(str(c.title,60))}</h5><p>${E(str(c.text,160))}</p>`;
    return p?`<button class="ui-tile tap" type="button" data-send="${E(p)}">${inner}</button>`:`<div class="ui-tile">${inner}</div>`;
  }).join("")}</div>`;
}
function uiImg(q,cls){
  q=str(q,120);
  return q?`<figure class="ui-img ${cls||""}" data-q="${E(q)}"><div class="ui-ph"></div></figure>`:"";
}
function mediaHtml(d){
  const items=arr(d.items,10);
  if(!items.length)return null;
  return `<div class="ui-media">${items.map(it=>`<div class="ui-row">${uiImg(it.image)}<div class="ui-mt"><h5>${E(str(it.title,80))}</h5><p>${E(str(it.text,260))}</p></div></div>`).join("")}</div>`;
}
function carouselHtml(d){
  const items=arr(d.items,12);
  if(!items.length)return null;
  return `<div class="ui-car">${items.map(it=>`<div class="ui-slide">${uiImg(it.image)}<h5>${E(str(it.title,60))}</h5><p>${E(str(it.text,120))}</p></div>`).join("")}</div>`;
}
function explainerHtml(d){
  const secs=arr(d.sections,8);
  if(!d.title&&!secs.length)return null;
  const md=b=>sanitizeHtml(renderMarkdown(str(b,2400)));
  return `<div class="ui-card ui-exp"><div class="ui-eh">${uiImg(d.image,"sm")}<div><h3>${E(str(d.title,80))}</h3>${d.subtitle?`<p>${E(str(d.subtitle,100))}</p>`:""}</div></div>${secs.map(s=>`<div class="ui-es"><h5>${E(str(s.heading,60))}</h5><div class="md">${md(s.body||s.text)}</div></div>`).join("")}</div>`;
}
function svgFigureHtml(src){
  let s=String(src||"").trim(),title="",cap="";
  const m=/^<!--\s*title:\s*(.*?)\s*(?:\|\s*caption:\s*(.*?)\s*)?-->/i.exec(s);
  if(m){title=m[1];cap=m[2]||"";s=s.slice(m[0].length).trim()}
  if(!/^<svg[\s>]/i.test(s)||s.length>200000)return null;
  if(!/xmlns\s*=/.test(s.slice(0,400)))s=s.replace(/^<svg/i,'<svg xmlns="http://www.w3.org/2000/svg"');
  const url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(s);
  return `<figure class="ui-card ui-fig">${title?`<h4 class="ui-t">${E(str(title,90))}</h4>`:""}<div class="ui-svg"><img src="${url}" alt="${E(str(title||"Diagram",90))}" loading="lazy"></div>${cap?`<figcaption class="ui-cap">${E(str(cap,160))}</figcaption>`:""}</figure>`;
}

/* ----- interactive form ----- */
function formHtml(d,id){
  const fields=arr(d.fields,10);
  if(!fields.length)return null;
  const body=fields.map((f,i)=>{
    const name=`f${i}`,lab=E(str(f.label,60)),t=String(f.type||"text").toLowerCase(),opts=arr(f.options,10).map(o=>str(o,60));
    if(t==="radio")return `<fieldset class="ui-f"><legend>${lab}</legend>${opts.map((o,k)=>`<label class="ui-opt"><input type="radio" name="${id}-${name}" value="${E(o)}"${k===0?" checked":""}><span class="ui-mark"></span><span>${E(o)}</span></label>`).join("")}</fieldset>`;
    if(t==="slider"){
      const o=opts.length>1?opts:["Low","Medium","High"],def=Math.min(o.length-1,Math.max(0,Number.isFinite(+f.value)&&f.value!=null?Math.round(+f.value):Math.floor((o.length-1)*.67)));
      return `<div class="ui-f ui-slider" data-opts="${E(JSON.stringify(o))}" data-label="${lab}"><div class="ui-sl-h">${lab}: <b>${E(o[def])}</b></div><input type="range" min="0" max="${o.length-1}" step="1" value="${def}" data-name="${name}" style="--pct:${r1(def/(o.length-1)*100)}%"><div class="ui-ticks">${o.map(x=>`<span>${E(x)}</span>`).join("")}</div></div>`;
    }
    if(t==="checkbox")return `<label class="ui-f ui-opt ui-chk"><input type="checkbox" data-name="${name}"><span class="ui-mark"></span><span>${lab}</span></label>`;
    if(t==="textarea")return `<div class="ui-f"><label class="ui-lab">${lab}</label><textarea data-name="${name}" rows="3" placeholder="${E(str(f.placeholder,80))}"></textarea></div>`;
    if(t==="select")return `<div class="ui-f"><label class="ui-lab">${lab}</label><select data-name="${name}">${opts.map(o=>`<option>${E(o)}</option>`).join("")}</select></div>`;
    return `<div class="ui-f"><label class="ui-lab">${lab}</label><input type="text" data-name="${name}" placeholder="${E(str(f.placeholder,80))}"></div>`;
  }).join("");
  return `<div class="ui-card ui-form" data-fid="${id}" data-labels="${E(JSON.stringify(fields.map(f=>str(f.label,60))))}" data-action="${d.action==="send"?"send":"show"}">${d.title?`<h3>${E(str(d.title,80))}</h3>`:""}${d.description?`<p class="ui-desc">${E(str(d.description,200))}</p>`:""}${body}<button class="ui-btn" type="button" data-ui-submit>${E(str(d.submit||"Submit",40))}</button><div class="ui-result" hidden></div></div>`;
}
function formValues(card){
  const labels=JSON.parse(card.getAttribute("data-labels")||"[]"),out=[];
  labels.forEach((lab,i)=>{
    const name="f"+i;
    const radios=card.querySelectorAll(`input[type=radio][name$="-${name}"]`);
    let v="";
    if(radios.length){const c=Array.from(radios).find(r=>r.checked);v=c?c.value:""}
    else{
      const el=card.querySelector(`[data-name="${name}"]`);
      if(!el)return;
      if(el.type==="checkbox")v=el.checked?"Yes":"No";
      else if(el.type==="range"){const o=JSON.parse(el.closest(".ui-slider").getAttribute("data-opts")||"[]");v=o[+el.value]||el.value}
      else v=el.value;
    }
    out.push([lab,v]);
  });
  return out;
}
function uiSubmit(card){
  const vals=formValues(card);
  if(card.getAttribute("data-action")==="send"){
    const t=vals.map(([l,v])=>`${l}: ${v||"(empty)"}`).join("\n");
    haptic(8);sendMessage(t);return;
  }
  const res=card.querySelector(".ui-result");
  res.hidden=false;
  res.innerHTML=vals.map(([l,v])=>`<div><span>${E(l)}</span><b>${E(v||"—")}</b></div>`).join("");
  haptic(6);
}

/* ----- placeholders, hydration, images ----- */
const UI_TYPES=new Set("chart cards media carousel explainer form".split(" "));
function buildUI(type,d,id){
  try{
    if(type==="chart")return chartHtml(d);
    if(type==="cards")return cardsHtml(d);
    if(type==="media")return mediaHtml(d);
    if(type==="carousel")return carouselHtml(d);
    if(type==="explainer")return explainerHtml(d);
    if(type==="form")return formHtml(d,id);
  }catch{}
  return null;
}
/* returns HTML, or null when the block should be shown as ordinary code */
function uiBlock(block,lang){
  const l=String(lang||"").trim().toLowerCase();
  if(state.settings.richUI===false)return null;
  const isUi=l.startsWith("ui:"),isSvg=l==="svg";
  if(!isUi&&!isSvg)return null;
  const type=isSvg?"svg":l.slice(3).trim();
  if(isUi&&!UI_TYPES.has(type))return null;
  if(!block.done)return '<div class="ui-host ui-skel"><span class="ring"></span></div>';
  const id="u"+hashStr(type+"|"+block.code);
  if(!UI_STORE.has(id)){
    let html=null;
    if(isSvg)html=svgFigureHtml(block.code);
    else{let d;try{d=JSON.parse(block.code)}catch{return null}if(d&&typeof d==="object")html=buildUI(type,d,id)}
    if(!html)return null;
    UI_STORE.set(id,html);
    if(UI_STORE.size>200)UI_STORE.delete(UI_STORE.keys().next().value);
  }
  return `<div class="ui-host" data-ui="${id}"></div>`;
}
function fillUiImg(fig,r){
  const img=new Image();
  img.alt=r.title||"";img.decoding="async";img.referrerPolicy="no-referrer";
  img.onload=()=>{const ph=fig.querySelector(".ui-ph");if(ph)ph.remove();fig.classList.add("ready")};
  img.onerror=()=>fig.classList.add("none");
  img.addEventListener("click",()=>openLightbox(r));
  img.src=r.src;
  fig.appendChild(img);
}
function hydrateUiImages(root){
  if(state.settings.webImages===false){root.querySelectorAll("figure.ui-img").forEach(f=>f.classList.add("none"));return}
  root.querySelectorAll("figure.ui-img[data-q]:not([data-done])").forEach(fig=>{
    fig.setAttribute("data-done","1");
    const q=fig.getAttribute("data-q")||"";
    if(/^https:\/\//i.test(q)){fillUiImg(fig,{src:q,title:""});return}
    wikiImage(q).then(r=>{if(!fig.isConnected)return;if(!r){fig.classList.add("none");return}fillUiImg(fig,r)});
  });
}
function hydrateUI(root){
  if(!root)return;
  root.querySelectorAll(".ui-host[data-ui]:not([data-ready])").forEach(h=>{
    const html=UI_STORE.get(h.getAttribute("data-ui"));
    if(!html)return;
    h.innerHTML=html;h.setAttribute("data-ready","1");
    h.querySelectorAll("svg.ui-line").forEach(s=>{
      try{const pts=JSON.parse(s.getAttribute("data-pts")||"[]");uiLineSelect(s,pts,pts.length-1)}catch{}
    });
    hydrateUiImages(h);
    hydrateImages(h);
  });
}
$("#msgsInner").addEventListener("pointerdown",uiLinePointer);
$("#msgsInner").addEventListener("pointermove",e=>{if(e.pointerType!=="mouse"||e.buttons&1)uiLinePointer(e)});
$("#msgsInner").addEventListener("input",e=>{
  const r=e.target;
  if(!r.matches||!r.matches(".ui-slider input[type=range]"))return;
  const wrap=r.closest(".ui-slider"),o=JSON.parse(wrap.getAttribute("data-opts")||"[]");
  wrap.querySelector(".ui-sl-h b").textContent=o[+r.value]||"";
  r.style.setProperty("--pct",(o.length>1?+r.value/(o.length-1)*100:0)+"%");
  haptic(3);
});
$("#msgsInner").addEventListener("click",e=>{
  const s=e.target.closest&&e.target.closest("[data-ui-submit]");
  if(s){uiSubmit(s.closest(".ui-form"));return}
  const t=e.target.closest&&e.target.closest("[data-send]");
  if(t&&!isStreaming){haptic(8);sendMessage(t.getAttribute("data-send"))}
});
