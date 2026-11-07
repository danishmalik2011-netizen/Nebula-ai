"use strict";
/* ---------- syntax highlighting ---------- */
const HL_KW=new Set("const let var function return if else elif for while do switch case break continue class new await async import from export default try catch finally throw typeof instanceof this null undefined None True False true false of in delete void yield static extends super def lambda pass raise with as not and or is self struct impl fn pub use mut match enum trait package public private protected interface type namespace func go defer chan range except global nonlocal assert del print int float double char String boolean string number bool SELECT FROM WHERE INSERT UPDATE DELETE JOIN GROUP ORDER BY LIMIT CREATE TABLE VALUES AND OR NOT INTO SET".split(" "));
const HL_DEF=new Set(["def","function","fn","func"]);
const HL_HASH=new Set("py python rb ruby sh bash zsh shell yaml yml toml r perl pl".split(" "));
const LANG_NAMES={js:"JavaScript",javascript:"JavaScript",mjs:"JavaScript",ts:"TypeScript",typescript:"TypeScript",tsx:"TSX",jsx:"JSX",py:"Python",python:"Python",html:"HTML",css:"CSS",json:"JSON",jsonc:"JSON",mermaid:"Mermaid",sh:"Shell",bash:"Bash",zsh:"Shell",shell:"Shell",sql:"SQL",xml:"XML",svg:"SVG",yaml:"YAML",yml:"YAML",md:"Markdown",markdown:"Markdown",rb:"Ruby",ruby:"Ruby",go:"Go",rs:"Rust",rust:"Rust",java:"Java",c:"C",cpp:"C++",cs:"C#",php:"PHP",swift:"Swift",kt:"Kotlin",tex:"LaTeX",latex:"LaTeX",txt:"Text",text:"Text",diff:"Diff",toml:"TOML",r:"R"};
const langLabel=l=>{l=String(l||"").trim();return LANG_NAMES[l.toLowerCase()]||(l?l[0].toUpperCase()+l.slice(1):"Code")};
const hlSpan=(c,t)=>`<span class="tok-${c}">${escapeHtml(t)}</span>`;

function hlMarkup(code){
  let out="",last=0,m;
  const re=/<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g;
  while((m=re.exec(code))!==null){
    out+=escapeHtml(code.slice(last,m.index));
    last=m.index+m[0].length;
    if(m[0].startsWith("<!--")){out+=hlSpan("com",m[0]);continue}
    out+=hlSpan("pun","<"+m[1])+hlSpan("tag",m[2]);
    const at=m[3],ar=/([^\s=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
    let ap=0,a;
    while((a=ar.exec(at))!==null){
      out+=escapeHtml(at.slice(ap,a.index))+hlSpan("attr",a[1]);
      if(a[3])out+=hlSpan("pun",a[2])+hlSpan("val",a[3]);
      ap=a.index+a[0].length;
    }
    out+=escapeHtml(at.slice(ap))+hlSpan("pun",m[4]+">");
  }
  return out+escapeHtml(code.slice(last));
}
function hlJson(code){
  let out="",last=0,m;
  const re=/("(?:\\.|[^"\\\n])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g;
  while((m=re.exec(code))!==null){
    out+=escapeHtml(code.slice(last,m.index));
    last=m.index+m[0].length;
    if(m[1]){out+=hlSpan(m[2]?"prop":"str",m[1]);if(m[2])out+=hlSpan("pun",m[2])}
    else if(m[3])out+=hlSpan("key",m[3]);
    else if(m[4])out+=hlSpan("num",m[4]);
    else out+=hlSpan("pun",m[5]);
  }
  return out+escapeHtml(code.slice(last));
}
function hlMermaid(code){
  let out="",last=0,m;
  const re=/(%%[^\n]*)|(\[[^\]\n]*\]|\{[^}\n]*\}|\(\([^)\n]*\)\)|\([^)\n]*\))|(-->|---|==>|-\.->|--[>ox]|<-->)|(\|[^|\n]*\|)|\b(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|subgraph|end|participant|actor)\b/g;
  while((m=re.exec(code))!==null){
    out+=escapeHtml(code.slice(last,m.index));
    last=m.index+m[0].length;
    out+=hlSpan(m[1]?"com":m[2]?"str":m[3]||m[4]?"pun":"key",m[0]);
  }
  return out+escapeHtml(code.slice(last));
}
function highlightCode(code,lang){
  const l=String(lang||"").toLowerCase();
  if(code.length>30000)return escapeHtml(code);
  if(l==="html"||l==="xml"||l==="svg")return hlMarkup(code);
  if(l==="json"||l==="jsonc")return hlJson(code);
  if(l==="mermaid")return hlMermaid(code);
  const cm=["\\/\\*[\\s\\S]*?\\*\\/","\\/\\/[^\\n]*"];
  if(HL_HASH.has(l))cm.push("#[^\\n]*");
  if(l==="sql")cm.push("--[^\\n]*");
  const re=new RegExp("("+cm.join("|")+")|(\"(?:\\\\.|[^\"\\\\\\n])*\"|'(?:\\\\.|[^'\\\\\\n])*'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)|([{}()\\[\\];,]|=>|===|!==|==|!=|<=|>=|&&|\\|\\||\\+\\+|--|=|\\+|-|\\*|\\/|<|>|:|\\?|\\.)","g");
  let out="",last=0,m,defPending=false,wantParams=false,pd=0;
  while((m=re.exec(code))!==null){
    if(m.index>last)out+=escapeHtml(code.slice(last,m.index));
    const t=m[0];
    last=m.index+t.length;
    if(m[1])out+=hlSpan("com",t);
    else if(m[2])out+=hlSpan("str",t);
    else if(m[3])out+=hlSpan("num",t);
    else if(m[4]){
      if(pd>0)out+=hlSpan("param",t);
      else if(HL_DEF.has(t)){defPending=true;out+=hlSpan("key",t)}
      else if(defPending&&!HL_KW.has(t)){defPending=false;wantParams=true;out+=hlSpan("fn",t)}
      else if(HL_KW.has(t))out+=hlSpan("key",t);
      else if(code[last]==="(")out+=hlSpan("fn",t);
      else out+=escapeHtml(t);
    }else{
      if(t==="("&&wantParams){pd=1;wantParams=false}
      else if(pd>0){if(t==="(")pd++;else if(t===")")pd--}
      out+=hlSpan("pun",t);
    }
  }
  return out+escapeHtml(code.slice(last));
}
