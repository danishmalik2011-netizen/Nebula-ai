"use strict";
/* ---------- LaTeX → MathML ----------
   Covers the LaTeX that language models actually write: fractions, roots, scripts, big operators with limits,
   delimiters, matrices, cases, aligned blocks, accents, font styles, text, colour, spacing and common symbols.
   Output is assembled from escaped text only, so it is safe by construction. Browsers render MathML natively. */
const mEsc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const TEX_SYM={alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ϵ",varepsilon:"ε",zeta:"ζ",eta:"η",theta:"θ",vartheta:"ϑ",iota:"ι",kappa:"κ",lambda:"λ",mu:"μ",nu:"ν",xi:"ξ",pi:"π",varpi:"ϖ",rho:"ρ",varrho:"ϱ",sigma:"σ",varsigma:"ς",tau:"τ",upsilon:"υ",phi:"ϕ",varphi:"φ",chi:"χ",psi:"ψ",omega:"ω",Gamma:"Γ",Delta:"Δ",Theta:"Θ",Lambda:"Λ",Xi:"Ξ",Pi:"Π",Sigma:"Σ",Upsilon:"Υ",Phi:"Φ",Psi:"Ψ",Omega:"Ω",hbar:"ℏ",ell:"ℓ",infty:"∞",partial:"∂",nabla:"∇",emptyset:"∅",varnothing:"∅",aleph:"ℵ",Re:"ℜ",Im:"ℑ",wp:"℘",angle:"∠",prime:"′",top:"⊤",bot:"⊥",neg:"¬",lnot:"¬",forall:"∀",exists:"∃",nexists:"∄",therefore:"∴",because:"∵",ldots:"…",dots:"…",cdots:"⋯",vdots:"⋮",ddots:"⋱",dotsb:"⋯",triangle:"△",square:"□",blacksquare:"■",degree:"°",checkmark:"✓",star:"⋆",dagger:"†",ddagger:"‡",S:"§",P:"¶",copyright:"©",pounds:"£"};
const TEX_MO_SYM=new Set("ldots dots cdots vdots ddots dotsb forall exists nexists neg lnot therefore because top bot prime".split(" "));
const TEX_OP={pm:"±",mp:"∓",times:"×",div:"÷",cdot:"⋅",ast:"∗",circ:"∘",bullet:"∙",oplus:"⊕",ominus:"⊖",otimes:"⊗",oslash:"⊘",odot:"⊙",cup:"∪",cap:"∩",setminus:"∖",wedge:"∧",land:"∧",vee:"∨",lor:"∨",leq:"≤",le:"≤",geq:"≥",ge:"≥",neq:"≠",ne:"≠",approx:"≈",equiv:"≡",sim:"∼",simeq:"≃",cong:"≅",propto:"∝",ll:"≪",gg:"≫",in:"∈",notin:"∉",ni:"∋",subset:"⊂",supset:"⊃",subseteq:"⊆",supseteq:"⊇",nsubseteq:"⊈",to:"→",rightarrow:"→",leftarrow:"←",gets:"←",leftrightarrow:"↔",Rightarrow:"⇒",Leftarrow:"⇐",Leftrightarrow:"⇔",iff:"⟺",implies:"⟹",impliedby:"⟸",mapsto:"↦",rightleftharpoons:"⇌",leftrightarrows:"⇆",rightleftarrows:"⇄",longmapsto:"⟼",longrightarrow:"⟶",longleftarrow:"⟵",longleftrightarrow:"⟷",uparrow:"↑",downarrow:"↓",updownarrow:"↕",nearrow:"↗",searrow:"↘",hookrightarrow:"↪",parallel:"∥",perp:"⊥",mid:"∣",nmid:"∤",vdash:"⊢",models:"⊨",asymp:"≍",doteq:"≐",prec:"≺",succ:"≻",preceq:"⪯",succeq:"⪰",lt:"<",gt:">",colon:":",langle:"⟨",rangle:"⟩",lfloor:"⌊",rfloor:"⌋",lceil:"⌈",rceil:"⌉",vert:"|",Vert:"‖",lbrace:"{",rbrace:"}",backslash:"\\",triangleleft:"◁",triangleright:"▷",uplus:"⊎",sqcup:"⊔",sqcap:"⊓",wr:"≀"};
const TEX_BIG={sum:1,prod:1,coprod:1,bigcup:1,bigcap:1,bigvee:1,bigwedge:1,bigoplus:1,bigotimes:1,int:0,iint:0,iiint:0,oint:0,oiint:0};
const TEX_BIG_CH={sum:"∑",prod:"∏",coprod:"∐",bigcup:"⋃",bigcap:"⋂",bigvee:"⋁",bigwedge:"⋀",bigoplus:"⨁",bigotimes:"⨂",int:"∫",iint:"∬",iiint:"∭",oint:"∮",oiint:"∯"};
const TEX_FN=new Set("sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp min max sup inf lim limsup liminf det dim ker gcd deg hom arg Pr mod".split(" "));
const TEX_LIM=new Set("lim limsup liminf max min sup inf det gcd Pr".split(" "));
const TEX_ACC={hat:"^",widehat:"^",check:"ˇ",tilde:"~",widetilde:"~",acute:"´",grave:"`",dot:"˙",ddot:"¨",breve:"˘",bar:"¯",vec:"→",overrightarrow:"→",overleftarrow:"←",overline:"‾"};
const TEX_WIDE=new Set(["widehat","widetilde","overrightarrow","overleftarrow","overline"]);
const TEX_VARIANT={mathbf:"bold",boldsymbol:"bold-italic",bm:"bold-italic",mathit:"italic",mathrm:"normal",mathsf:"sans-serif",mathtt:"monospace",mathbb:"double-struck",mathcal:"script",mathscr:"script",mathfrak:"fraktur"};
const TEX_TEXT=new Set(["text","textrm","textbf","textit","textsf","texttt","mbox","hbox"]);
const TEX_DELIM={"(":"(",")":")","[":"[","]":"]","|":"|","\\{":"{","\\}":"}","\\langle":"⟨","\\rangle":"⟩","\\lfloor":"⌊","\\rfloor":"⌋","\\lceil":"⌈","\\rceil":"⌉","\\|":"‖","\\vert":"|","\\Vert":"‖","\\lvert":"|","\\rvert":"|","\\lVert":"‖","\\rVert":"‖","/":"/","\\backslash":"\\","<":"⟨",">":"⟩",".":""};
const TEX_SPACE={",":.1667,":":.2222,">":.2222,";":.2778,"!":-.1667," ":.25,quad:1,qquad:2,enspace:.5,thinspace:.1667,medspace:.2222,thickspace:.2778,negthinspace:-.1667};
const TEX_ENV_DELIM={matrix:["",""],pmatrix:["(",")"],bmatrix:["[","]"],Bmatrix:["{","}"],vmatrix:["|","|"],Vmatrix:["‖","‖"],smallmatrix:["",""]};
const TEX_ALIGN_ENV=new Set("aligned align align* alignat alignat* split eqnarray eqnarray* flalign flalign*".split(" "));
const TEX_GATHER_ENV=new Set("gather gather* gathered multline multline*".split(" "));
const TEX_IGNORE_ARG=new Set(["tag","label","hspace","vspace","hspace*","vspace*","tag*","ref","eqref","kern","mkern"]);
const TEX_IGNORE=new Set(["nonumber","notag","displaystyle","textstyle","scriptstyle","scriptscriptstyle","hline","hfill","limits","nolimits","relax","allowbreak","centering","protect","bigskip","medskip","smallskip","noindent","cr","toprule","midrule","bottomrule"]);
/* Unicode mathematical alphabets for \mathbb, \mathcal, \mathfrak, \mathbf ... (MathML Core only keeps mathvariant="normal") */
const TEX_ALPHA={bold:[0x1D400,0x1D41A,0x1D7CE],italic:[0x1D434,0x1D44E,0,{h:"ℎ"}],"bold-italic":[0x1D468,0x1D482,0x1D7CE],script:[0x1D49C,0x1D4B6,0,{B:"ℬ",E:"ℰ",F:"ℱ",H:"ℋ",I:"ℐ",L:"ℒ",M:"ℳ",R:"ℛ",e:"ℯ",g:"ℊ",o:"ℴ"}],fraktur:[0x1D504,0x1D51E,0,{C:"ℭ",H:"ℌ",I:"ℑ",R:"ℜ",Z:"ℨ"}],"double-struck":[0x1D538,0x1D552,0x1D7D8,{C:"ℂ",H:"ℍ",N:"ℕ",P:"ℙ",Q:"ℚ",R:"ℝ",Z:"ℤ"}],"sans-serif":[0x1D5A0,0x1D5BA,0x1D7E2],monospace:[0x1D670,0x1D68A,0x1D7F6]};
function texStyle(str,v){
  const d=TEX_ALPHA[v];
  if(!d)return str;
  return Array.from(str).map(ch=>{
    if(d[3]&&d[3][ch])return d[3][ch];
    const c=ch.charCodeAt(0);
    if(c>=65&&c<=90)return String.fromCodePoint(d[0]+c-65);
    if(c>=97&&c<=122)return String.fromCodePoint(d[1]+c-97);
    if(c>=48&&c<=57&&d[2])return String.fromCodePoint(d[2]+c-48);
    return ch;
  }).join("");
}
function texTokens(s){
  const t=[];let i=0;
  while(i<s.length){
    const c=s[i],st=i;
    if(c==="\\"){
      const m=/^\\([a-zA-Z]+\*?|[^a-zA-Z])/.exec(s.slice(i,i+48));
      if(!m){i++;continue}
      i+=m[0].length;
      t.push({k:"cmd",v:m[1],s:st,e:i});
      if(/[a-zA-Z]/.test(m[1][0]))while(s[i]===" ")i++;
    }else if("{}^_&~".includes(c)){t.push({k:"sym",v:c,s:st,e:++i})}
    else if(/\s/.test(c))i++;
    else if(/[0-9]/.test(c)||(c==="."&&/[0-9]/.test(s[i+1]||""))){const m=/^(\d+(\.\d+)?|\.\d+)/.exec(s.slice(i,i+32));i+=m[0].length;t.push({k:"num",v:m[0],s:st,e:i})}
    else{const ch=s.codePointAt(i)>0xFFFF?s.slice(i,i+2):c;i+=ch.length;t.push({k:"ch",v:ch,s:st,e:i})}
  }
  return t;
}
function texChar(c){
  if(/[A-Za-z]/.test(c))return `<mi>${c}</mi>`;
  if(c==="-")return "<mo>−</mo>";
  if(c==="*")return "<mo>∗</mo>";
  if(c==="'")return "<mo>′</mo>";
  if("()[]|".includes(c))return `<mo stretchy="false">${c}</mo>`;
  if("+=<>/!,;:?.@".includes(c))return `<mo>${mEsc(c)}</mo>`;
  return `<mi>${mEsc(c)}</mi>`;
}
function texToMathML(src){
  const T=texTokens(src);let p=0;
  const isS=(t,v)=>!!t&&t.k==="sym"&&t.v===v,isC=(t,v)=>!!t&&t.k==="cmd"&&(v===undefined||t.v===v);
  const rawGroup=()=>{
    const t=T[p];
    if(isS(t,"{")){
      let d=0,q=p;
      for(;q<T.length;q++){if(isS(T[q],"{"))d++;else if(isS(T[q],"}")&&--d===0)break}
      const raw=src.slice(t.e,q<T.length?T[q].s:src.length);
      p=Math.min(q+1,T.length);return raw;
    }
    if(t){p++;return src.slice(t.s,t.e)}
    return "";
  };
  const seq=stop=>{const o=[];while(p<T.length&&!stop(T[p])){const a=atom();if(a)o.push(scripts(a))}return o.join("")};
  const arg=()=>{
    const t=T[p];
    if(isS(t,"{")){p++;const x=seq(tt=>isS(tt,"}"));p++;return `<mrow>${x}</mrow>`}
    const a=atom();return a?a.x:"<mrow></mrow>";
  };
  function scripts(a){
    let sub=null,sup=null,pr="";
    for(;;){
      const t=T[p];
      if(isS(t,"^")){p++;sup=arg()}
      else if(isS(t,"_")){p++;sub=arg()}
      else if(t&&t.k==="ch"&&t.v==="'"){p++;pr+="′"}
      else if(isC(t,"limits")){p++;a.lim=true}
      else if(isC(t,"nolimits")){p++;a.lim=false}
      else break;
    }
    if(pr)sup=`<mrow><mo>${pr}</mo>${sup||""}</mrow>`;
    if(sub==null&&sup==null)return a.x;
    if(sub!=null&&sup!=null)return a.lim?`<munderover>${a.x}${sub}${sup}</munderover>`:`<msubsup>${a.x}${sub}${sup}</msubsup>`;
    if(sub!=null)return a.lim?`<munder>${a.x}${sub}</munder>`:`<msub>${a.x}${sub}</msub>`;
    return a.lim?`<mover>${a.x}${sup}</mover>`:`<msup>${a.x}${sup}</msup>`;
  }
  function atom(){
    const t=T[p++];
    if(!t)return null;
    if(t.k==="num")return{x:`<mn>${t.v}</mn>`};
    if(t.k==="ch")return{x:texChar(t.v)};
    if(t.k==="sym"){
      if(t.v==="{"){const x=seq(tt=>isS(tt,"}"));p++;return{x:`<mrow>${x}</mrow>`}}
      if(t.v==="~")return{x:'<mspace width="0.25em"></mspace>'};
      return null;
    }
    return command(t.v);
  }
  const delim=()=>{
    const t=T[p++];
    if(!t)return "";
    const key=t.k==="cmd"?"\\"+t.v:t.v;
    return TEX_DELIM[key]!==undefined?TEX_DELIM[key]:(t.k==="ch"?t.v:"");
  };
  const fence=d=>d?`<mo fence="true" stretchy="true">${mEsc(d)}</mo>`:"";
  const envName=()=>rawGroup().trim();
  function rowsUntil(stop){
    const rows=[];let row=[];
    for(;;){
      row.push(seq(tt=>isS(tt,"&")||isC(tt,"\\")||stop(tt)));
      const t=T[p];
      if(isS(t,"&")){p++;continue}
      if(isC(t,"\\")){p++;rows.push(row);row=[];continue}
      break;
    }
    if(row.length>1||row[0]!=="")rows.push(row);
    return rows;
  }
  const mtable=(rows,align,extra)=>`<mtable${align?` columnalign="${align}"`:""} rowspacing="0.5em" columnspacing="1em"${extra||""}>`+rows.map(r=>`<mtr>${r.map(c=>`<mtd>${c||"<mrow></mrow>"}</mtd>`).join("")}</mtr>`).join("")+"</mtable>";
  function envOut(name,rows,spec){
    const cols=Math.max(1,...rows.map(r=>r.length));
    if(/^(equation|displaymath|math)\*?$/.test(name))return `<mrow>${rows.map(r=>r.join("")).join("")}</mrow>`;
    if(TEX_ENV_DELIM[name]){const[l,r]=TEX_ENV_DELIM[name];return `<mrow>${fence(l)}${mtable(rows,"",name==="smallmatrix"?' displaystyle="false"':"")}${fence(r)}</mrow>`}
    if(/^d?cases\*?$/.test(name))return `<mrow>${fence("{")}${mtable(rows,"left left")}</mrow>`;
    if(TEX_ALIGN_ENV.has(name))return mtable(rows,Array.from({length:cols},(_,i)=>i%2?"left":"right").join(" "),' displaystyle="true"').replace('columnspacing="1em"','columnspacing="0em 2em"');
    if(TEX_GATHER_ENV.has(name)||name==="substack")return mtable(rows,"center",name==="substack"?' displaystyle="false"':' displaystyle="true"');
    if(name==="array"||name==="tabular"){
      const al=(spec||"").replace(/[^lcr]/g,"").split("").map(c=>({l:"left",c:"center",r:"right"}[c])).join(" ");
      return mtable(rows,al);
    }
    return mtable(rows,"center");
  }
  function command(n){
    if(TEX_SYM[n]!==undefined){
      const ch=TEX_SYM[n];
      if(TEX_MO_SYM.has(n))return{x:`<mo>${ch}</mo>`};
      return{x:/^[\u03b1-\u03c9\u03d1\u03d5\u03d6\u03f1\u03f5]$/.test(ch)?`<mi>${ch}</mi>`:`<mi mathvariant="normal">${ch}</mi>`};
    }
    if(TEX_OP[n]!==undefined){const f=/^(langle|rangle|lfloor|rfloor|lceil|rceil|vert|Vert|lbrace|rbrace)$/.test(n);return{x:`<mo${f?' stretchy="false"':""}>${mEsc(TEX_OP[n])}</mo>`}}
    if(TEX_BIG_CH[n]){const lim=!!TEX_BIG[n];return{x:`<mo largeop="true"${lim?' movablelimits="true"':""}>${TEX_BIG_CH[n]}</mo>`,lim}}
    if(TEX_FN.has(n)){
      if(TEX_LIM.has(n))return{x:`<mo movablelimits="true">${n}</mo>`,lim:true};
      return{x:`<mrow><mi>${n}</mi><mo>\u2061</mo></mrow>`};
    }
    if(n==="operatorname"||n==="operatorname*"){return{x:`<mi>${mEsc(rawGroup().trim())}</mi>`,lim:n.endsWith("*")}}
    if(TEX_ACC[n]){const x=arg(),w=TEX_WIDE.has(n);return{x:`<mover accent="true">${x}<mo stretchy="${w}">${TEX_ACC[n]}</mo></mover>`}}
    if(n==="underline"){const x=arg();return{x:`<munder>${x}<mo stretchy="true">_</mo></munder>`}}
    if(n==="overbrace"){const x=arg();return{x:`<mover>${x}<mo stretchy="true">⏞</mo></mover>`,lim:true}}
    if(n==="underbrace"){const x=arg();return{x:`<munder>${x}<mo stretchy="true">⏟</mo></munder>`,lim:true}}
    if(/^[dct]?frac$/.test(n)){
      const a=arg(),b=arg(),f=`<mfrac>${a}${b}</mfrac>`;
      return{x:n==="dfrac"?`<mstyle displaystyle="true">${f}</mstyle>`:n==="tfrac"?`<mstyle displaystyle="false">${f}</mstyle>`:f};
    }
    if(/^[dt]?binom$/.test(n)){const a=arg(),b=arg();return{x:`<mrow>${fence("(")}<mfrac linethickness="0">${a}${b}</mfrac>${fence(")")}</mrow>`}}
    if(n==="sqrt"){
      if(T[p]&&T[p].k==="ch"&&T[p].v==="["){p++;const idx=seq(tt=>tt.k==="ch"&&tt.v==="]");p++;const x=arg();return{x:`<mroot>${x}<mrow>${idx}</mrow></mroot>`}}
      return{x:`<msqrt>${arg()}</msqrt>`};
    }
    if(TEX_TEXT.has(n))return{x:`<mtext>${mEsc(rawGroup())}</mtext>`};
    if(TEX_VARIANT[n]){
      const save=p,raw=rawGroup(),v=TEX_VARIANT[n];
      if(/^[A-Za-z0-9 ]+$/.test(raw))return{x:v==="normal"?`<mi mathvariant="normal">${mEsc(raw)}</mi>`:`<mi>${mEsc(texStyle(raw,v))}</mi>`};
      p=save;const x=arg();return{x:n==="mathrm"||n==="mathsf"?x.replace(/<mi>/g,'<mi mathvariant="normal">'):x};
    }
    if(n==="left"){
      const l=delim(),inner=seq(tt=>isC(tt,"right"));
      let r="";if(isC(T[p],"right")){p++;r=delim()}
      return{x:`<mrow>${fence(l)}${inner}${fence(r)}</mrow>`};
    }
    if(n==="right"){delim();return null}
    if(n==="middle")return{x:fence(delim())};
    if(/^(big|Big|bigg|Bigg)[lrm]?$/.test(n)){
      const size={big:"1.2em",Big:"1.8em",bigg:"2.4em",Bigg:"3em"}[n.replace(/[lrm]$/,"")];
      const d=delim();return{x:d?`<mo fence="true" stretchy="true" minsize="${size}">${mEsc(d)}</mo>`:""};
    }
    if(TEX_SPACE[n]!==undefined)return{x:`<mspace width="${TEX_SPACE[n]}em"></mspace>`};
    if(n==="\\")return{x:'<mspace linebreak="newline"></mspace>'};
    if(n==="{"||n==="}")return{x:`<mo stretchy="false">${n}</mo>`};
    if("%&$#_".includes(n)&&n.length===1)return{x:`<mtext>${n}</mtext>`};
    if(n==="|")return{x:"<mo>‖</mo>"};
    if(n==="color"||n==="textcolor"){
      const c=rawGroup().trim(),x=n==="color"?seq(tt=>isS(tt,"}")):arg();
      return/^([a-zA-Z]+|#[0-9a-fA-F]{3,8})$/.test(c)?{x:`<mstyle mathcolor="${c}">${x}</mstyle>`}:{x};
    }
    if(n==="boxed")return{x:`<mrow class="mbox">${arg()}</mrow>`};
    if(/^(cancel|bcancel|xcancel)$/.test(n))return{x:`<mrow class="mcancel">${arg()}</mrow>`};
    if(/^[hv]?phantom$/.test(n))return{x:`<mphantom>${arg()}</mphantom>`};
    if(n==="overset"||n==="stackrel"){const a=arg(),b=arg();return{x:`<mover>${b}${a}</mover>`}}
    if(n==="underset"){const a=arg(),b=arg();return{x:`<munder>${b}${a}</munder>`}}
    if(n==="xrightarrow"||n==="xleftarrow"){
      if(T[p]&&T[p].k==="ch"&&T[p].v==="["){while(p<T.length&&!(T[p].k==="ch"&&T[p].v==="]"))p++;p++}
      const a=arg();return{x:`<mover><mo stretchy="true">${n==="xrightarrow"?"→":"←"}</mo>${a}</mover>`};
    }
    if(n==="substack"){p++;const rows=rowsUntil(tt=>isS(tt,"}"));p++;return{x:envOut("substack",rows)}}
    if(n==="begin"){
      const name=envName(),spec=(name==="array"||name==="tabular")?rawGroup():null;
      const rows=rowsUntil(tt=>isC(tt,"end"));
      if(isC(T[p],"end")){p++;envName()}
      return{x:envOut(name,rows,spec)};
    }
    if(n==="end"){envName();return null}
    if(n==="not"){
      const nx=T[p];
      if(nx&&nx.v==="="){p++;return{x:"<mo>≠</mo>"}}
      if(isC(nx,"in")){p++;return{x:"<mo>∉</mo>"}}
      const a=atom();return{x:`<mrow>${a?a.x:""}<mo>\u0338</mo></mrow>`};
    }
    if(/^math(op|rel|bin|ord|punct|open|close|inner)$/.test(n))return{x:arg()};
    if(TEX_IGNORE_ARG.has(n)){rawGroup();return null}
    if(TEX_IGNORE.has(n))return null;
    return{x:`<mtext class="merr">\\${mEsc(n)}</mtext>`};
  }
  return `<mrow>${seq(()=>false)}</mrow>`;
}
function renderTex(tex,display){
  try{return `<math class="tex"${display?' display="block"':""}>${texToMathML(tex)}</math>`}
  catch{return `<code class="math-err">${mEsc(tex)}</code>`}
}
