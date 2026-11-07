"use strict";
/* ---------- syntax highlighting ---------- */

/* ---------- markdown ---------- */
const CODE_MARK="\uE000B";
function renderCodeBlock(block){
  if(block.act)return actCardHtml(block);
  const lang=(block.lang||"").trim(),label=langLabel(lang);
  if(block.math)return `<div class="math-block">${renderTex(block.tex,true)}</div>`;
  if(block.img)return figureHtml(block);
  {const u=uiBlock(block,lang);if(u!==null)return u}
  if(/^artifact:/i.test(lang)&&state.settings.artifacts!==false)return renderArtifactCard(block,lang);
  return `<div class="code-block"><div class="code-head"><span>${escapeHtml(label)}</span><button class="code-copy" type="button" aria-label="Copy code"></button></div><pre><code>${highlightCode(block.code,lang)}</code></pre></div>`;
}
let CITES=[];
function inlineMd(text){
  const codes=[],keep=[];
  const hold=h=>"\uE003"+(keep.push(h)-1)+"\uE003";
  text=text.replace(/`([^`\n]+)`/g,(m,c)=>{const i=codes.push(c)-1;return `\uE001C${i}\uE001`});
  text=text.replace(/!\[([^\]\n]*)\]\((https:\/\/[^\s)]+)\)/g,(m,a,u)=>state.settings.webImages===false?hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">`)+(a||"image")+hold("</a>"):hold(`<img class="mimg" src="${u}" alt="${a}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`));
  text=text.replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,(m,t,u)=>hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">`)+(t||hold(u))+hold("</a>"));
  text=text.replace(/\[(\d{1,2})\](?!\()/g,(m,n)=>{const s=CITES[+n-1];return s&&/^https?:\/\//.test(s.url)?hold(`<a class="cite" href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(s.domain||"")}">${n}</a>`):m});
  text=text.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/g,(m,p,u)=>p+hold(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
  text=text.replace(/\*\*\*([^*\n]+)\*\*\*/g,"<strong><em>$1</em></strong>");
  text=text.replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>");
  text=text.replace(/__([^_\n]+)__/g,"<strong>$1</strong>");
  text=text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g,"$1<em>$2</em>");
  text=text.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g,"$1<em>$2</em>");
  text=text.replace(/~~([^~\n]+)~~/g,"<del>$1</del>");
  text=text.replace(/==([^=\n]+)==/g,"<mark>$1</mark>");
  text=text.replace(/&lt;u&gt;([^&\n]+?)&lt;\/u&gt;/g,"<u>$1</u>");
  text=text.replace(/\uE001C(\d+)\uE001/g,(m,i)=>`<code class="inline-code">${codes[+i]}</code>`);
  return text.replace(/\uE003(\d+)\uE003/g,(m,i)=>keep[+i]);
}
function figureHtml(b){
  if(state.settings.webImages===false)return "";
  const q=escapeHtml(b.q),c=escapeHtml(b.cap||"");
  return `<figure class="wimg" data-q="${q}" data-cap="${c}"><div class="wimg-ph"><span class="ring"></span></div><figcaption><span class="wimg-t">${c||q}</span></figcaption></figure>`;
}
function extractMath(text,blocks){
  const disp=t=>{const idx=blocks.push({math:true,tex:t.trim()})-1;return "\n"+CODE_MARK+idx+"\uE000\n"};
  const inl=t=>"\uE002"+(blocks.push({math:true,tex:t.trim(),inline:true})-1)+"\uE002";
  text=text.replace(/\$\$([\s\S]+?)\$\$/g,(m,t)=>disp(t));
  text=text.replace(/\\\[([\s\S]+?)\\\]/g,(m,t)=>disp(t));
  text=text.replace(/\\begin\{(equation\*?|align\*?|aligned|gather\*?|gathered|multline\*?|eqnarray\*?|split|alignat\*?|flalign\*?|cases|[pbBvV]?matrix|array)\}[\s\S]*?\\end\{\1\}/g,m=>disp(m));
  const parts=text.split(/(`[^`\n]*`)/);
  for(let i=0;i<parts.length;i+=2)
    parts[i]=parts[i].replace(/\\\(([^\n]+?)\\\)/g,(m,t)=>inl(t)).replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$(?!\d)/g,(m,pre,t)=>pre+inl(t));
  return parts.join("");
}
function buildList(items){
  let html="";const stack=[];
  const closeTop=()=>{
    const t=stack.pop();
    if(t.openLi)html+="</li>";
    html+=t.ordered?"</ol>":"</ul>";
    if(stack.length){html+="</li>";stack[stack.length-1].openLi=false}
  };
  for(const it of items){
    while(stack.length&&it.indent<stack[stack.length-1].indent)closeTop();
    if(!stack.length){
      html+=it.ordered?(it.n>1?`<ol start="${it.n}">`:"<ol>"):"<ul>";
      stack.push({ordered:it.ordered,indent:it.indent,openLi:false});
    }else{
      const top=stack[stack.length-1];
      if(it.indent>top.indent){
        html+=it.ordered?"<ol>":"<ul>";
        stack.push({ordered:it.ordered,indent:it.indent,openLi:false});
      }else{
        if(top.openLi){html+="</li>";top.openLi=false}
        if(top.ordered!==it.ordered){
          html+=top.ordered?"</ol>":"</ul>";
          stack.pop();
          html+=it.ordered?"<ol>":"<ul>";
          stack.push({ordered:it.ordered,indent:it.indent,openLi:false});
        }
      }
    }
    const tm=/^\[([ xX])\]\s+([\s\S]*)$/.exec(it.text);
    html+=tm?`<li class="task-li${tm[1]===" "?"":" is-done"}"><span class="task${tm[1]===" "?"":" on"}"></span>${inlineMd(tm[2])}`:`<li>${inlineMd(it.text)}`;
    stack[stack.length-1].openLi=true;
  }
  while(stack.length)closeTop();
  return html;
}
function renderBlocks(text,blocks){
  const lines=text.split("\n");let out="",i=0;
  const isBlank=l=>!l.trim();
  const isBlockStart=l=>/^(#{1,6})\s/.test(l)||/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)||/^\s*(?:&gt;|>)\s?/.test(l)||/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)||new RegExp("^"+CODE_MARK+"\\d+\\uE000$").test(l.trim());
  while(i<lines.length){
    const line=lines[i];let m;
    if((m=new RegExp("^"+CODE_MARK+"(\\d+)\\uE000$").exec(line.trim()))){out+=renderCodeBlock(blocks[+m[1]]);i++;continue}
    if(isBlank(line)){i++;continue}
    if((m=/^(#{1,6})\s+(.*)$/.exec(line))){const lvl=m[1].length;out+=`<h${lvl}>${inlineMd(m[2].trim())}</h${lvl}>`;i++;continue}
    if(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)){out+="<hr>";i++;continue}
    if(/^\s*(?:&gt;|>)\s?/.test(line)){
      const buf=[];
      while(i<lines.length&&/^\s*(?:&gt;|>)\s?/.test(lines[i])){buf.push(lines[i].replace(/^\s*(?:&gt;|>)\s?/,""));i++}
      const lead=/^\s*\[!(note|tip|important|warning|caution)\]\s*(.*)$/i.exec(buf[0]||"");
      if(lead){const t=lead[1].toLowerCase(),rest=(lead[2]?[lead[2]]:[]).concat(buf.slice(1));out+=`<div class="callout callout-${t}"><div class="callout-title">${t[0].toUpperCase()+t.slice(1)}</div>${renderBlocks(rest.join("\n"),blocks)}</div>`;continue}
      out+=`<blockquote>${renderBlocks(buf.join("\n"),blocks)}</blockquote>`;continue;
    }
    if(line.includes("|")&&i+1<lines.length&&/^[\s|:-]+$/.test(lines[i+1])&&lines[i+1].includes("-")){
      const splitRow=r=>r.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
      const head=splitRow(line);
      const align=splitRow(lines[i+1]).map(c=>{const l=c.startsWith(":"),r=c.endsWith(":");if(l&&r)return "center";if(r)return "right";if(l)return "left";return ""});
      i+=2;
      let t=`<div class="table-wrap"><table><thead><tr>`;
      head.forEach((c,ci)=>{t+=`<th${align[ci]?` style="text-align:${align[ci]}"`:""}>${inlineMd(c)}</th>`});
      t+=`</tr></thead><tbody>`;
      while(i<lines.length&&lines[i].includes("|")&&lines[i].trim()){
        const cells=splitRow(lines[i]);t+="<tr>";
        cells.forEach((c,ci)=>{t+=`<td${align[ci]?` style="text-align:${align[ci]}"`:""}>${inlineMd(c)}</td>`});
        t+="</tr>";i++;
      }
      out+=t+`</tbody></table></div>`;continue;
    }
    if((m=/^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line))){
      const items=[];
      while(i<lines.length){
        const lm=/^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(lines[i]);
        if(!lm)break;
        items.push({indent:lm[1].replace(/\t/g,"    ").length,ordered:!!lm[3],n:+lm[3]||0,text:lm[4]});
        i++;
        while(i<lines.length&&lines[i].trim()&&!/^(\s*)(?:([-*+])|(\d+)[.)])\s+/.test(lines[i])&&!isBlockStart(lines[i])){
          items[items.length-1].text+=" "+lines[i].trim();i++;
        }
      }
      out+=buildList(items);continue;
    }
    const buf=[];
    while(i<lines.length&&lines[i].trim()&&!isBlockStart(lines[i])){buf.push(lines[i]);i++}
    if(buf.length)out+=`<p>${inlineMd(buf.join("\n")).replace(/\n/g,"<br>")}</p>`;
    else i++;
  }
  return out;
}
function renderMarkdown(text,opts){const prevCites=CITES;try{return renderMarkdown0(text,opts)}finally{CITES=prevCites}}
function renderMarkdown0(text,opts){
  CITES=(opts&&opts.sources)||[];
  const blocks=[];
  text=String(text==null?"":text).replace(/\r\n/g,"\n");
  if(opts&&opts.build)text=extractActs(text,blocks,opts);
  text=text.replace(/```([^\n`]*)\n?([\s\S]*?)(```|$)/g,(m,lang,code,close)=>{
    const idx=blocks.push({lang:(lang||"").trim(),code:code.replace(/\n$/,""),done:close==="```"})-1;
    return "\n"+CODE_MARK+idx+"\uE000\n";
  });
  text=text.replace(/!\[\[([^\]\n|]{2,120})(?:\|([^\]\n]{0,160}))?\]\]/g,(m,q,c)=>{
    const idx=blocks.push({img:true,q:q.trim(),cap:(c||"").trim()})-1;
    return "\n"+CODE_MARK+idx+"\uE000\n";
  });
  text=extractMath(text,blocks).replace(/\\\$/g,"$");
  return renderBlocks(escapeHtml(text),blocks).replace(/\uE002(\d+)\uE002/g,(m,i)=>`<span class="math">${renderTex(blocks[+i].tex,false)}</span>`);
}
