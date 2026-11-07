"use strict";
/* ---------- provider adapters ---------- */
async function httpError(res){
  let detail="";
  try{
    const txt=await res.text();
    try{const j=JSON.parse(txt);detail=j?.error?.message||j?.message||(typeof j?.error==="string"?j.error:"")||txt}
    catch{detail=txt}
  }catch{}
  detail=String(detail||res.statusText||"").replace(/\s+/g," ").slice(0,400);
  if(res.status===401||res.status===403)return `Authentication failed (${res.status}). Check the API key for this provider. ${detail}`;
  if(res.status===404)return `Not found (404). The model id or base URL is probably wrong. ${detail}`;
  if(res.status===429)return `Rate limit or quota exceeded (429). ${detail}`;
  if(res.status>=500)return `Provider error (${res.status}). ${detail}`;
  return `Request failed (${res.status}${res.statusText?" "+res.statusText:""}). ${detail}`;
}
async function readSSE(res,onEvent){
  const handleLine=line=>{
    const l=line.replace(/\r$/,"");
    if(!l.startsWith("data:"))return;
    const d=l.slice(5).trim();
    if(!d||d==="[DONE]")return;
    try{onEvent(JSON.parse(d))}catch{}
  };
  if(!res.body||typeof res.body.getReader!=="function"){(await res.text()).split("\n").forEach(handleLine);return}
  const reader=res.body.getReader(),dec=new TextDecoder("utf-8");
  let buf="";
  while(true){
    const{value,done}=await reader.read();
    if(done)break;
    buf+=dec.decode(value,{stream:true});
    let idx;
    while((idx=buf.indexOf("\n"))>=0){handleLine(buf.slice(0,idx));buf=buf.slice(idx+1)}
  }
  if(buf.trim())handleLine(buf);
}
const ATT_BUDGET=14*1048576;
const hasBody=m=>!!(m.content||(m.atts&&m.atts.length));
function attKeep(chat){
  const keep=new Set();let used=0;
  for(let i=chat.messages.length-1;i>=0;i--){
    const m=chat.messages[i];
    if(!m.atts||!m.atts.length)continue;
    const sz=m.atts.reduce((n,a)=>n+(a.data?a.data.length:0),0);
    if(!keep.size||used+sz<=ATT_BUDGET){keep.add(m.id);used+=sz}
  }
  return keep;
}
function userParts(m,keep){
  const parts=[];
  let text=m.content||"";
  const files=(m.atts||[]).filter(a=>a.kind==="text");
  if(files.length)text=files.map(a=>`<file name="${a.name}">\n${a.text}\n</file>`).join("\n\n")+(text?"\n\n"+text:"");
  for(const a of m.atts||[]){
    if(a.kind==="text")continue;
    if(!keep.has(m.id)){text=(text?text+"\n\n":"")+`[Attached ${a.kind}: ${a.name}, omitted from this request]`;continue}
    parts.push({t:a.kind==="image"?"img":"pdf",mime:a.mime,name:a.name,data:a.data});
  }
  if(text)parts.push({t:"text",text});
  return parts;
}
function buildOpenAIMessages(chat){
  const out=[],sp=sysPrompt(chat),keep=attKeep(chat);
  if(sp)out.push({role:"system",content:sp});
  for(const m of chat.messages){
    if(!hasBody(m)||m.error)continue;
    if(m.role==="assistant"){out.push({role:"assistant",content:m.content});continue}
    const ps=userParts(m,keep);
    if(ps.length===1&&ps[0].t==="text"){out.push({role:"user",content:ps[0].text});continue}
    out.push({role:"user",content:ps.map(p=>p.t==="text"?{type:"text",text:p.text}:p.t==="img"?{type:"image_url",image_url:{url:`data:${p.mime};base64,${p.data}`}}:{type:"file",file:{filename:p.name,file_data:`data:application/pdf;base64,${p.data}`}})});
  }
  return out;
}
function buildAnthropicMessages(chat){
  const out=[],keep=attKeep(chat);
  const blocks=ps=>ps.map(p=>p.t==="text"?{type:"text",text:p.text}:p.t==="img"?{type:"image",source:{type:"base64",media_type:p.mime,data:p.data}}:{type:"document",source:{type:"base64",media_type:"application/pdf",data:p.data}});
  for(const m of chat.messages){
    if(!hasBody(m)||m.error)continue;
    const role=m.role==="assistant"?"assistant":"user";
    const content=role==="assistant"?[{type:"text",text:m.content}]:blocks(userParts(m,keep));
    if(out.length&&out[out.length-1].role===role)out[out.length-1].content.push(...content);
    else out.push({role,content});
  }
  if(!out.length||out[0].role!=="user")out.unshift({role:"user",content:[{type:"text",text:"Hello!"}]});
  for(const o of out)if(o.content.length===1&&o.content[0].type==="text")o.content=o.content[0].text;
  return out;
}
function buildGoogleContents(chat){
  const out=[],keep=attKeep(chat);
  for(const m of chat.messages){
    if(!hasBody(m)||m.error)continue;
    const role=m.role==="assistant"?"model":"user";
    const parts=role==="model"?[{text:m.content}]:userParts(m,keep).map(p=>p.t==="text"?{text:p.text}:{inlineData:{mimeType:p.mime,data:p.data}});
    if(out.length&&out[out.length-1].role===role)out[out.length-1].parts.push(...parts);
    else out.push({role,parts});
  }
  if(!out.length||out[0].role!=="user")out.unshift({role:"user",parts:[{text:"Hello!"}]});
  return out;
}
async function openaiComplete(ctx){
  const{base,key,model,chat,stream,onDelta,signal,provId}=ctx,s=state.settings;
  const body={model,messages:buildOpenAIMessages(chat),stream:!!stream};
  if(Number.isFinite(s.temperature))body.temperature=s.temperature;
  if(Number.isFinite(s.topP)&&s.topP<1)body.top_p=s.topP;
  if(s.maxTokens>0){if(provId==="openai"&&/^(o\d|gpt-5)/.test(model))body.max_completion_tokens=s.maxTokens;else body.max_tokens=s.maxTokens}
  if(provId==="openai"&&/^(o\d|gpt-5)/.test(model)){delete body.temperature;delete body.top_p}
  const headers={"Content-Type":"application/json"};
  if(key)headers["Authorization"]="Bearer "+key;
  if(provId==="openrouter"){
    headers["HTTP-Referer"]=location.origin&&location.origin!=="null"?location.origin:"https://localhost";
    headers["X-Title"]="Nebula BYOK Chat";
  }
  const res=await pfetch(base+"/chat/completions",{method:"POST",headers,body:JSON.stringify(body),signal});
  if(!res.ok)throw new Error(await httpError(res));
  if(!stream){
    const data=await res.json();
    if(data&&data.error)throw new Error(data.error.message||"Provider error");
    const rt=data?.choices?.[0]?.message?.reasoning_content||data?.choices?.[0]?.message?.reasoning||"";if(rt)onDelta(rt,"r");const txt=data?.choices?.[0]?.message?.content||"";
    if(txt)onDelta(txt);
    return txt;
  }
  let full="";
  await readSSE(res,ev=>{
    if(ev&&ev.error)throw new Error(ev.error.message||"Provider error");
    const delta=ev?.choices?.[0]?.delta;
    if(!delta)return;
    const rp=delta.reasoning_content||delta.reasoning||"";if(rp)onDelta(rp,"r");const piece=delta.content||"";
    if(piece){full+=piece;onDelta(piece)}
  });
  return full;
}
async function anthropicComplete(ctx){
  try{return await anthropicComplete1(ctx)}
  catch(e){const m=String(e&&e.message||"");if(ctx.thinkTried&&!ctx.noThink&&/\(400\)/.test(m)&&/thinking/i.test(m)){ctx.noThink=true;return anthropicComplete1(ctx)}throw e}
}
async function anthropicComplete1(ctx){
  const{base,key,model,chat,stream,onDelta,signal}=ctx,s=state.settings;
  const body={model,max_tokens:chat.noSys?80:(chat.mode==="build"?16000:(s.maxTokens>0?s.maxTokens:4096)),messages:buildAnthropicMessages(chat),stream:!!stream};
  const sp=sysPrompt(chat);
  if(sp)body.system=sp;
  if(Number.isFinite(s.temperature))body.temperature=Math.min(s.temperature,1);
  if(Number.isFinite(s.topP)&&s.topP<1)body.top_p=s.topP;
  if(!ctx.noThink&&wantsThinking(model,chat)){ctx.thinkTried=true;const B=4000;body.thinking={type:"enabled",budget_tokens:B};delete body.temperature;delete body.top_p;body.max_tokens=Math.max(body.max_tokens,B+4096)}
  const res=await pfetch(base+"/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify(body),signal});
  if(!res.ok)throw new Error(await httpError(res));
  if(!stream){
    const data=await res.json();
    const rt=(data.content||[]).map(c=>c.thinking||"").join("");if(rt)onDelta(rt,"r");const txt=(data.content||[]).map(c=>c.text||"").join("");
    if(txt)onDelta(txt);
    return txt;
  }
  let full="";
  await readSSE(res,ev=>{
    if(!ev||!ev.type)return;
    if(ev.type==="error")throw new Error(ev.error?.message||"Anthropic stream error");
    if(ev.type==="content_block_delta"&&ev.delta&&ev.delta.type==="thinking_delta"){const rp=ev.delta.thinking||"";if(rp)onDelta(rp,"r")}
    if(ev.type==="content_block_delta"&&ev.delta&&ev.delta.type==="text_delta"){
      const piece=ev.delta.text||"";
      if(piece){full+=piece;onDelta(piece)}
    }
  });
  return full;
}
async function googleComplete(ctx){
  const{base,key,model,chat,stream,onDelta,signal}=ctx,s=state.settings;
  const body={contents:buildGoogleContents(chat)};
  const sp=sysPrompt(chat);
  if(sp)body.systemInstruction={parts:[{text:sp}]};
  const gc={};
  if(Number.isFinite(s.temperature))gc.temperature=s.temperature;
  if(Number.isFinite(s.topP)&&s.topP<1)gc.topP=s.topP;
  if(s.maxTokens>0)gc.maxOutputTokens=s.maxTokens;
  if(state.settings.reasoning!==false&&!chat.noSys&&/gemini-(2\.5|3)/.test(model))gc.thinkingConfig={includeThoughts:true};
  if(Object.keys(gc).length)body.generationConfig=gc;
  const method=stream?"streamGenerateContent":"generateContent";
  const qs=(stream?"alt=sse&":"")+"key="+encodeURIComponent(key);
  const url=`${base}/models/${encodeURIComponent(model)}:${method}?${qs}`;
  const res=await pfetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal});
  if(!res.ok)throw new Error(await httpError(res));
  const extract=data=>{
    if(data?.promptFeedback?.blockReason)throw new Error("Request blocked by safety filters: "+data.promptFeedback.blockReason);
    const ps=data?.candidates?.[0]?.content?.parts||[];const th=ps.filter(p=>p.thought&&typeof p.text==="string").map(p=>p.text).join("");if(th)onDelta(th,"r");return ps.filter(p=>!p.thought).map(p=>typeof p.text==="string"?p.text:"").join("");
  };
  if(!stream){
    const data=await res.json(),txt=extract(data);
    if(txt)onDelta(txt);
    return txt;
  }
  let full="";
  await readSSE(res,ev=>{const piece=extract(ev);if(piece){full+=piece;onDelta(piece)}});
  return full;
}
async function runCompletion(chat,onDelta,signal){
  const s=state.settings,provId=s.provider,prov=PROVIDERS[provId];
  if(!prov)throw new Error("Unknown provider: "+provId);
  const key=cleanKey(s.keys&&s.keys[provId]);
  const base=(prov.base||"").trim().replace(/\/+$/,"");
  const model=(s.model||"").trim();
  if(!base)throw new Error("No base URL configured for this provider.");
  if(!model)throw new Error("No model selected.");
  const ctx={base,key,model,chat,stream:!!s.streaming&&!chat.noSys,onDelta,signal,provId};
  if(prov.adapter==="anthropic")return anthropicComplete(ctx);
  if(prov.adapter==="google")return googleComplete(ctx);
  return openaiComplete(ctx);
}
function friendlyError(err){
  const m=(err&&err.message)?err.message:String(err);
  if(/ISO-8859-1/i.test(m))return "The API key contains a character that cannot be sent in an HTTP header, usually an invisible one from copy-paste. Clear the key and paste it again.";
  if(/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(m))
    return "Network error — the request could not reach the provider.\n\nCommon causes: the base URL is wrong, the server is offline, or the provider does not allow browser (CORS) requests from this origin. Run the bundled server (npm start) to relay requests through its proxy.";
  return m;
}

/* ---------- send / stream ---------- */
async function sendMessage(rawText){
  if(isStreaming)return;
  const text=String(rawText!=null?rawText:$("#input").value).trim();
  const atts=readyAtts();
  if(!text&&!atts.length)return;
  if(attBusy()){toast("Still preparing attachments.","err");return}
  if(!requireProvider())return;
  const chat=ensureChat();
  const um={id:uid(),role:"user",content:text,ts:Date.now()};
  if(atts.length)um.atts=atts.map(stripAtt);
  chat.messages.push(um);clearAtts();
  haptic(8);
  chat.updatedAt=Date.now();
  if(!chat.titled){chat.title=makeTitle(text||(atts[0]&&atts[0].name)||"Attachment");chat.titled=true}
  $("#input").value="";
  autoGrow();updateCounter();renderMessages();renderChatList();save();
  await runAssistant(chat);
}
async function streamAssistant(chat){
  announce("Generating response");
  await streamAssistant0(chat);
  const lm=chat.messages[chat.messages.length-1];
  announce(lm&&lm.error?"Request failed":"Response complete");
  if(lm&&lm.role==="assistant"&&!lm.error&&lm.content)aiTitle(chat);
}
async function streamAssistant0(chat){
  const msg={id:uid(),role:"assistant",content:"",ts:Date.now(),model:state.settings.model};
  chat.messages.push(msg);chat.updatedAt=Date.now();
  let el=null;
  if(state.activeId===chat.id){
    renderMessages();
    el=$(`#msgsInner .msg[data-id="${msg.id}"]`);
    paintThinking(el);
    if(state.settings.autoScroll)scrollToBottom(false);
  }
  isStreaming=true;setSendState();updateBadges();
  abortController=new AbortController();
  let lastPaint=0,timer=null;
  const paint=()=>{if(!el)return;paintMsg(el,msg,true);followStream()};
  const onDelta=(piece,kind)=>{
    if(!piece)return;
    const now=Date.now();
    if(kind==="r"){msg.reasoning=(msg.reasoning||"")+piece;if(!msg._r0)msg._r0=now}
    else{msg.content+=piece;if(msg.content.indexOf("<think")>=0&&!msg._r0)msg._r0=now;if(msg._r0&&!msg.thinkMs&&viewParts(msg).content)msg.thinkMs=now-msg._r0}
    if(LIVE.on&&kind!=="r")liveFeed(msg,false);
    if(msg._r0&&!msg.thinkMs&&!LIVE.on)maybeSummarize(msg);
    if(now-lastPaint>(msg.content.length>6000?150:55)){lastPaint=now;paint()}
    else if(!timer)timer=setTimeout(()=>{timer=null;lastPaint=Date.now();paint()},55);
  };
  try{
    if(state.settings.webMode&&state.settings.webMode!=="off")await webPhase(chat,msg,abortController.signal);
    await runCompletion(chat,onDelta,abortController.signal);
    {const vp=viewParts(msg);msg.reasoning=vp.reasoning;msg.content=vp.content;if(msg._r0&&!msg.thinkMs)msg.thinkMs=Date.now()-msg._r0}
    if(LIVE.on)liveFeed(msg,true);else maybeSummarize(msg,true);
    if(!msg.content.trim())msg.content="_(The model returned an empty response.)_";
  }catch(err){
    if(err&&err.name==="AbortError")msg.content=msg.content?msg.content+"\n\n_— stopped —_":"_(Generation stopped.)_";
    else{msg.error=true;msg.content=friendlyError(err);if(LIVE.on)liveFail(msg)}
  }finally{
    delete chat._web;
    if(timer)clearTimeout(timer);
    isStreaming=false;abortController=null;chat.updatedAt=Date.now();
    setSendState();save();renderChatList();updateBadges();
    if(state.activeId===chat.id){
      const live=$(`#msgsInner .msg[data-id="${msg.id}"]`);
      if(live){paintMsg(live,msg,false);const cs=live.querySelectorAll(".art-card");if(cs.length&&state.settings.artifacts!==false){const c=cs[cs.length-1];setStage(c,1);setTimeout(()=>{setStage(c,2);openArtifact(c.dataset.art)},750)}}
      followStream();
    }
  }
}
async function regenerate(msgId){
  if(isStreaming){toast("Please wait for the current response.","err");return}
  const chat=activeChat();
  if(!chat)return;
  const idx=chat.messages.findIndex(m=>m.id===msgId);
  if(idx<0)return;
  let uIdx=idx-1;
  while(uIdx>=0&&(chat.messages[uIdx].role!=="user"||chat.messages[uIdx].tool))uIdx--;
  if(uIdx<0)return;
  if(!requireProvider())return;
  chat.messages=chat.messages.slice(0,uIdx+1);
  chat.updatedAt=Date.now();
  renderMessages();renderChatList();save();
  await runAssistant(chat);
}

/* ---------- export / import ---------- */
function chatToMarkdown(chat){
  let md=`# ${chat.title||"Conversation"}\n\n`;
  md+=`_Exported ${fmtDate(Date.now())} · model: \`${state.settings.model}\` · provider: ${PROVIDERS[state.settings.provider]?.name||state.settings.provider}_\n\n---\n\n`;
  for(const m of chat.messages){
    if(!m.content)continue;
    md+=`## ${m.role==="assistant"?"Nebula":"You"}\n\n${m.content}\n\n`;
  }
  return md;
}
function exportCurrentChat(){
  const chat=activeChat();
  if(!chat||!chat.messages.length){toast("Nothing to export yet.","err");return}
  const safe=(chat.title||"chat").replace(/[^\w\d\- ]+/g,"").trim().slice(0,40)||"chat";
  download(`${safe}.md`,chatToMarkdown(chat));
  toast("Exported as Markdown","ok");
}
function exportAllJson(){
  const data={exportedAt:new Date().toISOString(),version:2,settings:{...state.settings,keys:{}},
    chats:state.chats.map(c=>({id:c.id,title:c.title,createdAt:c.createdAt,updatedAt:c.updatedAt,
      messages:c.messages.map(m=>({role:m.role,content:m.content,ts:m.ts,model:m.model,error:m.error}))}))};
  download(`nebula-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2));
  toast("Backup downloaded","ok");
}
function normalizeImportedChat(c){
  if(!c||typeof c!=="object")return null;
  const msgs=Array.isArray(c.messages)?c.messages:[];
  return{id:uid(),title:typeof c.title==="string"&&c.title.trim()?c.title.trim():"Imported chat",titled:true,
    createdAt:c.createdAt||Date.now(),updatedAt:Date.now(),
    messages:msgs.filter(m=>m&&typeof m==="object").map(m=>({id:uid(),role:m.role==="assistant"?"assistant":"user",
      content:typeof m.content==="string"?m.content:"",ts:m.ts||Date.now(),model:m.model||"",error:!!m.error}))};
}
function importJsonFile(file,onDone){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result),imported=[];
      if(Array.isArray(data)){for(const c of data)imported.push(normalizeImportedChat(c))}
      else if(data&&Array.isArray(data.chats)){for(const c of data.chats)imported.push(normalizeImportedChat(c))}
      else throw new Error("Unrecognized file format.");
      const valid=imported.filter(Boolean);
      if(!valid.length)throw new Error("No valid conversations found in file.");
      state.chats=valid.concat(state.chats);state.activeId=valid[0].id;
      renderMessages();renderChatList();save();
      toast(`Imported ${valid.length} conversation${valid.length===1?"":"s"}`,"ok");
      onDone&&onDone();
    }catch(e){toast("Import failed: "+(e.message||"invalid file"),"err")}
  };
  reader.onerror=()=>toast("Could not read that file.","err");
  reader.readAsText(file);
}
