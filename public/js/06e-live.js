"use strict";
/* ---------- live voice: hands-free conversation with a blob HUD ---------- */
const LIVE={on:false,state:"idle",muted:false,eng:"",stream:null,ac:null,an:null,buf:null,level:0,pulse:0,disp:0,raf:0,vadT:0,vadOn:false,vad:null,rec:null,mr:null,chunks:[],pending:"",commitT:0,restartT:0,user:"",msg:null,fed:0,sbuf:"",wake:null,accent:"#B5532E",t0:0,prev:null,bAt:0,heard:0};
const LV_STATE={listening:"Listening",thinking:"Thinking",speaking:"Speaking",muted:"Muted",idle:""};
const IC_END='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const IC_GEAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
const IC_DOWN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const IC_CC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="M10 10.500a2.200 2.200 0 1 0 0 3M17 10.500a2.200 2.200 0 1 0 0 3"/></svg>';
const tailText=(s,n)=>{s=String(s||"").replace(/\s+/g," ").trim();if(s.length<=n)return s;const t=s.slice(-n),i=t.indexOf(" ");return "…"+(i>=0&&i<40?t.slice(i+1):t)};

function setState(s){
  LIVE.state=s;
  const el=$("#liveHud");
  el.dataset.state=s;
  $("#lvState").textContent=LV_STATE[s]||"";
  $("#lvHint").textContent=s==="speaking"||s==="thinking"?"Tap to interrupt":"";
  const m=$("#lvMute");
  m.classList.toggle("on",LIVE.muted);
  m.setAttribute("aria-pressed",String(LIVE.muted));
  m.setAttribute("aria-label",LIVE.muted?"Unmute":"Mute");
  m.innerHTML=LIVE.muted?IC_MIC_OFF:IC_MIC;
}
function applyCaptions(){
  const on=state.settings.liveCaptions!==false;
  $("#liveHud").classList.toggle("caps",on);
  const b=$("#lvCap");
  b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));
}
function micErr(e){return e&&e.name==="NotAllowedError"?"Microphone access is blocked.":String(e&&e.message||e)}
async function openMic(){
  LIVE.stream=await navigator.mediaDevices.getUserMedia(micConstraints);
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  LIVE.ac=new AC();
  LIVE.an=LIVE.ac.createAnalyser();LIVE.an.fftSize=512;
  LIVE.buf=new Uint8Array(LIVE.an.fftSize);
  LIVE.ac.createMediaStreamSource(LIVE.stream).connect(LIVE.an);
}
async function keepAwake(){try{if(navigator.wakeLock)LIVE.wake=await navigator.wakeLock.request("screen")}catch{}}
function releaseAwake(){if(LIVE.wake){LIVE.wake.release().catch(()=>{});LIVE.wake=null}}

/* ----- listening ----- */
function stopListening(){
  clearTimeout(LIVE.commitT);clearTimeout(LIVE.restartT);
  if(LIVE.rec){const r=LIVE.rec;LIVE.rec=null;r.onend=null;r.onresult=null;r.onerror=null;try{r.abort()}catch{}}
  LIVE.vadOn=false;
  if(LIVE.mr){const m=LIVE.mr;LIVE.mr=null;m.onstop=null;if(m.state!=="inactive"){try{m.stop()}catch{}}}
}
function listen(){
  if(!LIVE.on||LIVE.muted||LIVE.state!=="listening")return;
  LIVE.eng==="browser"?listenBrowser():listenWhisper();
}
function listenBrowser(){
  const SR=getSR();
  if(!SR||LIVE.rec)return;
  const rec=new SR();
  LIVE.rec=rec;LIVE.pending="";
  rec.lang=state.settings.voiceLang||navigator.language||"en-US";
  rec.interimResults=true;rec.continuous=true;
  rec.onresult=e=>{
    let interim="";
    for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)LIVE.pending+=" "+r[0].transcript;else interim+=r[0].transcript}
    LIVE.pulse=1;
    $("#lvUser").textContent=(LIVE.pending+" "+interim).trim();
    clearTimeout(LIVE.commitT);
    if(!interim&&LIVE.pending.trim())LIVE.commitT=setTimeout(()=>commitUtterance(LIVE.pending),650);
  };
  rec.onerror=e=>{
    if(e.error==="not-allowed"||e.error==="service-not-allowed"){toast("Microphone access is blocked.","err");endLive()}
    else if(e.error==="network"){toast("Speech recognition needs a connection.","err");endLive()}
  };
  rec.onend=()=>{
    if(LIVE.rec!==rec)return;
    LIVE.rec=null;
    if(LIVE.on&&!LIVE.muted&&LIVE.state==="listening")LIVE.restartT=setTimeout(listen,200);
  };
  try{rec.start()}catch{LIVE.rec=null}
}
function listenWhisper(){
  if(LIVE.vadOn||!LIVE.stream||!LIVE.an)return;
  LIVE.vad=newVad();LIVE.vadOn=true;
}
function recStart(){
  const mime=recMime();
  LIVE.chunks=[];
  const mr=new MediaRecorder(LIVE.stream,mime?{mimeType:mime}:undefined);
  LIVE.mr=mr;
  mr.ondataavailable=e=>{if(e.data&&e.data.size)LIVE.chunks.push(e.data)};
  mr.start();
  $("#lvUser").textContent="…";
}
function recFinish(send){
  const mr=LIVE.mr;
  LIVE.vadOn=false;
  if(!mr)return;
  LIVE.mr=null;
  mr.onstop=async()=>{
    if(!send||!LIVE.on){if(LIVE.on){setState(LIVE.muted?"muted":"listening");listen()}return}
    setState("thinking");
    let text="";
    try{text=await whisperTranscribe(new Blob(LIVE.chunks,{type:mr.mimeType||"audio/webm"}))}
    catch(e){toast(String(e&&e.message||e).slice(0,120),"err")}
    if(!LIVE.on)return;
    if(text.replace(/\s/g,"").length<2){setState("listening");$("#lvUser").textContent="";listen();return}
    commitUtterance(text);
  };
  try{mr.stop()}catch{}
}
function vadTick(){
  if(!LIVE.on||LIVE.muted||!LIVE.an)return;
  const rms=rmsOf(LIVE.an,LIVE.buf),now=performance.now();
  LIVE.level=Math.min(1,rms*7);
  if(LIVE.state==="speaking"&&state.settings.bargeIn){
    if(rms>.075){if(!LIVE.bAt)LIVE.bAt=now;else if(now-LIVE.bAt>380){LIVE.bAt=0;liveInterrupt()}}
    else LIVE.bAt=0;
    return;
  }
  if(!LIVE.vadOn)return;
  const ev=vadStep(LIVE.vad,rms,now);
  if(ev==="start")recStart();
  else if(ev==="end")recFinish(true);
  else if(ev==="drop")recFinish(false);
}

/* ----- one turn: user speech → model → spoken reply ----- */
function commitUtterance(text){
  text=String(text||"").replace(/\s+/g," ").trim();
  if(text.length<2){LIVE.pending="";return}
  stopListening();
  LIVE.pending="";LIVE.user=text;LIVE.msg=null;LIVE.fed=0;LIVE.sbuf="";
  $("#lvUser").textContent=text;$("#lvAi").textContent="";
  setState("thinking");haptic(8);
  TTS.finalFed=false;TTS.onIdle=liveSpeechIdle;
  sendMessage(text);
  if(!isStreaming){setState(LIVE.muted?"muted":"listening");listen()}
}
function liveFeed(msg,final){
  if(!LIVE.on)return;
  if(LIVE.msg!==msg){LIVE.msg=msg;LIVE.fed=0;LIVE.sbuf=""}
  const full=speakable(viewParts(msg).content,!final).trimEnd();
  if(full.length>LIVE.fed){LIVE.sbuf+=full.slice(LIVE.fed);LIVE.fed=full.length}
  const{out,rest}=takeSentences(LIVE.sbuf,final,ttsEngine()==="device"?14:26);
  LIVE.sbuf=rest;
  if(out.length){
    if(LIVE.state!=="speaking")setState("speaking");
    out.forEach(s=>ttsEnqueue(s));
  }
  $("#lvAi").textContent=tailText(full,230);
  if(final){
    TTS.finalFed=true;TTS.onIdle=liveSpeechIdle;
    if(!TTS.playing&&!TTS.q.length)liveSpeechIdle();
  }
}
function liveSpeechIdle(){
  if(!LIVE.on)return;
  LIVE.msg=null;
  setState(LIVE.muted?"muted":"listening");
  if(!LIVE.muted)listen();
}
function liveFail(msg){
  if(!LIVE.on)return;
  toast(String(msg.content||"Request failed").slice(0,120),"err");
  haptic([20,40,20]);
  liveSpeechIdle();
}
function liveInterrupt(){
  if(!LIVE.on)return;
  haptic(10);
  if(isStreaming&&abortController)abortController.abort();
  ttsStop();stopListening();
  setState(LIVE.muted?"muted":"listening");
  $("#lvAi").textContent="";
  listen();
}
function liveMute(){
  if(!LIVE.on)return;
  LIVE.muted=!LIVE.muted;haptic(8);
  if(LIVE.stream)LIVE.stream.getAudioTracks().forEach(t=>{t.enabled=!LIVE.muted});
  if(LIVE.muted){stopListening();setState(LIVE.state==="listening"?"muted":LIVE.state)}
  else if(LIVE.state==="muted"){setState("listening");listen()}
  else setState(LIVE.state);
}

/* ----- lifecycle ----- */
async function startLive(){
  if(LIVE.on)return;
  if(!requireProvider())return;
  const eng=sttEngine();
  if(!eng){toast("Live voice needs speech recognition, or an OpenAI or Groq key.","err");return}
  if(isStreaming){toast("Wait for the current response.","err");return}
  closeSheetUI(true);
  Object.assign(LIVE,{on:true,muted:false,eng,user:"",pending:"",msg:null,fed:0,sbuf:"",level:0,pulse:0,disp:0,bAt:0,prev:document.activeElement});
  const el=$("#liveHud");
  el.classList.add("open");el.setAttribute("aria-hidden","false");
  applyCaptions();
  $("#lvModel").textContent=state.settings.model||"";
  $("#lvUser").textContent="";$("#lvAi").textContent="";
  haptic(12);
  try{if(window.speechSynthesis)speechSynthesis.speak(new SpeechSynthesisUtterance(""))}catch{}
  if(eng==="whisper"||state.settings.bargeIn){
    try{await openMic()}catch(e){if(eng==="whisper"){toast(micErr(e),"err");endLive();return}}
  }
  keepAwake();
  setState("listening");startRender();listen();
  $("#lvEnd").focus({preventScroll:true});
}
function endLive(){
  if(!LIVE.on)return;
  LIVE.on=false;
  stopListening();ttsStop();
  if(isStreaming&&abortController)abortController.abort();
  cancelAnimationFrame(LIVE.raf);clearInterval(LIVE.vadT);
  if(LIVE.stream){LIVE.stream.getTracks().forEach(t=>t.stop());LIVE.stream=null}
  if(LIVE.ac){try{LIVE.ac.close()}catch{}LIVE.ac=null}
  LIVE.an=null;
  releaseAwake();
  const el=$("#liveHud");
  el.classList.remove("open");el.setAttribute("aria-hidden","true");
  if(LIVE.prev&&LIVE.prev.focus)LIVE.prev.focus({preventScroll:true});
  haptic(8);setSendState();
}

/* ----- the blob ----- */
function hexRgb(h){
  h=String(h||"").replace("#","");
  if(h.length===3)h=h.split("").map(c=>c+c).join("");
  if(!/^[0-9a-f]{6}$/i.test(h))h="B5532E";
  const n=parseInt(h,16);
  return[n>>16&255,n>>8&255,n&255];
}
const hexA=(h,a)=>{const[r,g,b]=hexRgb(h);return `rgba(${r},${g},${b},${a})`};
const mixHex=(h,k)=>{const[r,g,b]=hexRgb(h),t=k>0?255:0,a=Math.abs(k);return "#"+[r,g,b].map(v=>Math.round(v+(t-v)*a).toString(16).padStart(2,"0")).join("")};
function orbTarget(){
  if(LIVE.state==="speaking")return ttsLevel();
  if(LIVE.state==="listening"){
    if(LIVE.an)return LIVE.level;
    LIVE.pulse*=.93;return LIVE.pulse*.7;
  }
  return 0;
}
function blobPath(x,cx,cy,R,t,amp,seed){
  const N=96;
  x.beginPath();
  for(let i=0;i<=N;i++){
    const a=i/N*Math.PI*2,n=Math.sin(a*2+t*1.1+seed)*.5+Math.sin(a*3-t*.8+seed*1.7)*.3+Math.sin(a*5+t*1.7+seed*.6)*.2,r=R*(1+amp*n);
    const px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;
    i?x.lineTo(px,py):x.moveTo(px,py);
  }
  x.closePath();
}
function drawOrb(x,W,H,t,reduce){
  const st=LIVE.state;
  LIVE.disp+=(orbTarget()-LIVE.disp)*.16;
  const lv=reduce?.12:LIVE.disp,cx=W/2,cy=H/2,R=Math.min(W,H)*.25,muted=st==="muted",acc=muted?"#6f655a":LIVE.accent;
  const tt=t*(reduce?0:st==="thinking"?1.5:st==="speaking"?1.1+lv*1.6:.7);
  x.clearRect(0,0,W,H);
  const g=x.createRadialGradient(cx,cy,R*.5,cx,cy,R*2.1);
  g.addColorStop(0,hexA(acc,muted?.12:.34+lv*.2));g.addColorStop(1,hexA(acc,0));
  x.fillStyle=g;x.beginPath();x.arc(cx,cy,R*2.1,0,7);x.fill();
  /* HUD ring: fine ticks that follow the voice, or a comet while thinking */
  const TN=72,r0=R*1.62;
  x.lineCap="round";x.lineWidth=Math.max(1.5,R*.03);
  for(let i=0;i<TN;i++){
    const a=i/TN*Math.PI*2-Math.PI/2;
    let b;
    if(st==="thinking"){const d=(((a+Math.PI/2-t*2)%(Math.PI*2))+Math.PI*2)%(Math.PI*2);b=d<1.7?1-d/1.7:0}
    else b=muted?0:lv*(Math.sin(a*3+t*2.2)*.5+.5);
    const len=R*(.04+.13*b);
    x.strokeStyle=hexA(muted?"#9a8f82":"#F6C9B1",.16+.74*b);
    x.beginPath();x.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);x.lineTo(cx+Math.cos(a)*(r0+len),cy+Math.sin(a)*(r0+len));x.stroke();
  }
  const base=R*(1+(reduce?0:Math.sin(t*1.4)*.015)+lv*.1);
  const amp=muted?.02:st==="thinking"?.07:st==="speaking"?.06+lv*.3:.045+lv*.2;
  const g1=x.createRadialGradient(cx-base*.35,cy-base*.4,base*.1,cx,cy,base*1.15);
  g1.addColorStop(0,mixHex(acc,.55));g1.addColorStop(.55,acc);g1.addColorStop(1,mixHex(acc,-.35));
  blobPath(x,cx,cy,base,tt,amp,0);
  x.fillStyle=g1;x.fill();
  x.save();
  x.globalCompositeOperation="lighter";
  const g2=x.createRadialGradient(cx+base*.3,cy+base*.35,0,cx,cy,base);
  g2.addColorStop(0,hexA("#F6C9B1",.5));g2.addColorStop(1,hexA("#F6C9B1",0));
  blobPath(x,cx,cy,base*.97,tt*1.2,amp*1.25,2.3);
  x.fillStyle=g2;x.fill();
  x.restore();
  const g3=x.createRadialGradient(cx-base*.3,cy-base*.38,0,cx-base*.3,cy-base*.38,base*.55);
  g3.addColorStop(0,"rgba(255,255,255,.34)");g3.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=g3;x.beginPath();x.arc(cx-base*.3,cy-base*.38,base*.55,0,7);x.fill();
  blobPath(x,cx,cy,base,tt,amp,0);
  x.strokeStyle="rgba(255,255,255,.16)";x.lineWidth=Math.max(1.5,R*.02);x.stroke();
}
function startRender(){
  const c=$("#lvOrb"),x=c.getContext("2d");
  const reduce=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const want=()=>Math.round(c.getBoundingClientRect().width*Math.min(2,window.devicePixelRatio||1));
  const fit=()=>{const w=want();c.width=w;c.height=w};
  fit();
  LIVE.accent=(getComputedStyle(document.documentElement).getPropertyValue("--accent")||"").trim()||"#B5532E";
  LIVE.t0=performance.now();
  clearInterval(LIVE.vadT);LIVE.vadT=setInterval(vadTick,40);
  const frame=now=>{
    if(!LIVE.on)return;
    if(c.width!==want())fit();
    drawOrb(x,c.width,c.height,(now-LIVE.t0)/1000,reduce);
    LIVE.raf=requestAnimationFrame(frame);
  };
  LIVE.raf=requestAnimationFrame(frame);
}

$("#lvMute").addEventListener("click",liveMute);
$("#lvEnd").addEventListener("click",endLive);
$("#lvClose").addEventListener("click",endLive);
$("#lvGear").addEventListener("click",()=>openSettings("voice"));
$("#lvCap").addEventListener("click",()=>{haptic(5);applySetting("liveCaptions",state.settings.liveCaptions===false);applyCaptions()});
$("#lvOrb").addEventListener("click",()=>{if(LIVE.state==="speaking"||LIVE.state==="thinking")liveInterrupt()});
$("#liveHud").addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();endLive()}});
$("#lvEnd").innerHTML=IC_END;$("#lvGear").innerHTML=IC_GEAR;$("#lvClose").innerHTML=IC_DOWN;$("#lvCap").innerHTML=IC_CC;
document.addEventListener("visibilitychange",()=>{if(LIVE.on&&document.visibilityState==="visible")keepAwake()});
