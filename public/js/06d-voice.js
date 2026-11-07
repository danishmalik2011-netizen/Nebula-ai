"use strict";
/* ---------- voice: speech input, speech output ---------- */
const IC_MIC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const IC_MIC_OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.2 5.3M18.5 11c0 1-.2 1.9-.6 2.700M12 17.500V21M3 3l18 18"/></svg>';
const IC_SPEAK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500Z"/><path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/></svg>';
const CLOUD_VOICES=["alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer"];
const VOICE_LANGS=[["","Auto"],["en-US","English (US)"],["en-GB","English (UK)"],["es-ES","Español"],["fr-FR","Français"],["de-DE","Deutsch"],["it-IT","Italiano"],["pt-BR","Português (BR)"],["nl-NL","Nederlands"],["ru-RU","Русский"],["tr-TR","Türkçe"],["hi-IN","हिन्दी"],["ar-SA","العربية"],["zh-CN","中文"],["ja-JP","日本語"],["ko-KR","한국어"]];
const VOICE_PROMPT="You are in a live voice conversation. Reply in short, natural spoken sentences, like a thoughtful person talking. No markdown, lists, headings, code, tables or links unless the user asks for them. Keep most answers under four sentences.";

/* ----- capability ----- */
const getSR=()=>window.SpeechRecognition||window.webkitSpeechRecognition||null;
function sttProvider(){
  for(const id of["openai","groq"])if(cleanKey(state.settings.keys&&state.settings.keys[id]))return id;
  return "";
}
function sttEngine(){
  const m=state.settings.sttMode||"auto",sr=!!getSR(),wh=!!sttProvider()&&typeof MediaRecorder!=="undefined";
  if(m==="browser")return sr?"browser":"";
  if(m==="whisper")return wh?"whisper":"";
  return sr?"browser":wh?"whisper":"";
}
async function whisperTranscribe(blob,signal){
  const id=sttProvider();
  if(!id)throw new Error("Add an OpenAI or Groq key to transcribe audio.");
  const key=cleanKey(state.settings.keys[id]),ext=/mp4|aac/.test(blob.type)?"m4a":/ogg/.test(blob.type)?"ogg":"webm";
  const fd=new FormData();
  fd.append("file",blob,"speech."+ext);
  fd.append("model",id==="groq"?"whisper-large-v3-turbo":"whisper-1");
  const lang=String(state.settings.voiceLang||"").split("-")[0];
  if(lang)fd.append("language",lang);
  const r=await pfetch(PROVIDERS[id].base+"/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:fd,signal});
  if(!r.ok)throw new Error(await httpError(r));
  return String((await r.json()).text||"").trim();
}
function recMime(){
  if(typeof MediaRecorder==="undefined")return "";
  return["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t))||"";
}
const micConstraints={audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}};
function rmsOf(an,buf){
  an.getByteTimeDomainData(buf);
  let s=0;
  for(let i=0;i<buf.length;i++){const v=(buf[i]-128)/128;s+=v*v}
  return Math.sqrt(s/buf.length);
}
/* voice activity detection, pure so it can be tested: returns "start" | "end" | "drop" | "" */
function vadStep(v,rms,now){
  if(!v.speaking)v.floor=v.floor*.97+rms*.03;
  const thr=Math.max(.02,v.floor*3);
  if(rms>thr){
    v.lastVoice=now;
    if(!v.above)v.above=now;
    if(!v.speaking&&now-v.above>=60){v.speaking=true;v.start=now;return "start"}
  }else v.above=0;
  if(v.speaking&&now-v.lastVoice>900){v.speaking=false;return v.lastVoice-v.start>500?"end":"drop"}
  return "";
}
const newVad=()=>({floor:.005,speaking:false,start:0,lastVoice:0,above:0});

/* ----- dictation into the composer ----- */
const DICT={on:false,rec:null,mr:null,chunks:[],stream:null,ac:null,raf:0,stopping:false,base:""};
function updateMicBtn(){
  const b=$("#micBtn");
  if(!b)return;
  b.hidden=!sttEngine();
  b.classList.toggle("rec",DICT.on);
  b.setAttribute("aria-pressed",String(DICT.on));
  b.setAttribute("aria-label",DICT.on?"Stop dictation":"Dictate");
  b.title=DICT.on?"Stop dictation":"Dictate";
  b.innerHTML=DICT.on?IC_MIC_OFF:IC_MIC;
  $("#input").placeholder=DICT.on?"Listening…":"Message";
  if(!DICT.on)b.style.removeProperty("--lvl");
}
function dictFinish(){
  const was=DICT.on;
  DICT.on=false;DICT.rec=null;
  cancelAnimationFrame(DICT.raf);
  if(DICT.stream){DICT.stream.getTracks().forEach(t=>t.stop());DICT.stream=null}
  if(DICT.ac){try{DICT.ac.close()}catch{}DICT.ac=null}
  updateMicBtn();setSendState();
  if(was&&state.settings.dictAutoSend&&$("#input").value.trim())sendMessage();
}
function dictBrowser(){
  const SR=getSR(),ta=$("#input"),android=/Android/i.test(navigator.userAgent);
  DICT.base=ta.value?ta.value.replace(/\s+$/,"")+" ":"";
  const begin=()=>{
    const rec=new SR();
    rec.lang=state.settings.voiceLang||navigator.language||"en-US";
    rec.interimResults=true;rec.continuous=!android;
    let fin="";
    rec.onresult=e=>{
      let interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)fin+=r[0].transcript;else interim+=r[0].transcript}
      ta.value=DICT.base+fin+interim;autoGrow();setSendState();
    };
    rec.onerror=e=>{
      if(e.error==="not-allowed"||e.error==="service-not-allowed")toast("Microphone access is blocked.","err");
      else if(e.error==="network")toast("Speech recognition needs a connection.","err");
      if(e.error!=="no-speech"&&e.error!=="aborted"){DICT.stopping=true}
    };
    rec.onend=()=>{
      if(DICT.on&&!DICT.stopping){DICT.base=ta.value?ta.value.replace(/\s+$/,"")+" ":"";try{begin();return}catch{}}
      dictFinish();
    };
    DICT.rec=rec;rec.start();
  };
  begin();
}
async function dictWhisper(){
  const stream=await navigator.mediaDevices.getUserMedia(micConstraints);
  DICT.stream=stream;
  const mime=recMime(),mr=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  DICT.mr=mr;DICT.chunks=[];
  mr.ondataavailable=e=>{if(e.data&&e.data.size)DICT.chunks.push(e.data)};
  mr.onstop=async()=>{
    const blob=new Blob(DICT.chunks,{type:mr.mimeType||mime||"audio/webm"});
    $("#micBtn").classList.add("busy");
    try{
      const t=await whisperTranscribe(blob);
      const ta=$("#input");
      if(t){ta.value=(ta.value?ta.value.replace(/\s+$/,"")+" ":"")+t;autoGrow()}
    }catch(e){toast(String(e&&e.message||e),"err")}
    $("#micBtn").classList.remove("busy");
    dictFinish();
  };
  mr.start();
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    DICT.ac=new AC();
    const an=DICT.ac.createAnalyser();an.fftSize=512;
    DICT.ac.createMediaStreamSource(stream).connect(an);
    const buf=new Uint8Array(an.fftSize),b=$("#micBtn");
    const tick=()=>{if(!DICT.on)return;b.style.setProperty("--lvl",Math.min(1,rmsOf(an,buf)*6).toFixed(2));DICT.raf=requestAnimationFrame(tick)};
    tick();
  }
}
async function dictStart(){
  const eng=sttEngine();
  if(!eng){toast("Voice input isn’t available here. Add an OpenAI or Groq key, or use a browser with speech recognition.","err");return}
  if(!navigator.mediaDevices&&eng==="whisper"){toast("This browser can’t record audio.","err");return}
  DICT.on=true;DICT.stopping=false;
  haptic(10);updateMicBtn();
  try{eng==="browser"?dictBrowser():await dictWhisper()}
  catch(e){toast(e&&e.name==="NotAllowedError"?"Microphone access is blocked.":String(e&&e.message||e),"err");dictFinish()}
}
function dictStop(){
  if(!DICT.on)return;
  DICT.stopping=true;haptic(6);
  if(DICT.rec){try{DICT.rec.stop()}catch{dictFinish()}}
  else if(DICT.mr&&DICT.mr.state!=="inactive")DICT.mr.stop();
  else dictFinish();
}
$("#micBtn").addEventListener("click",()=>DICT.on?dictStop():dictStart());

/* ----- turning markdown into something worth saying ----- */
function speakable(md,streaming){
  let t=String(md||"").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi,"");
  if(streaming){
    const f=(t.match(/```/g)||[]).length;
    if(f%2)t=t.slice(0,t.lastIndexOf("```"));
    const d=(t.match(/\$\$/g)||[]).length;
    if(d%2)t=t.slice(0,t.lastIndexOf("$$"));
  }
  t=t.replace(/```[\s\S]*?```/g," ")
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g," formula ")
    .replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g," ")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,"$1")
    .replace(/https?:\/\/\S+/g,"link")
    .replace(/\[\d{1,2}\]/g,"")
    .replace(/`([^`\n]+)`/g,"$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm,"")
    .replace(/^\s*>\s?/gm,"")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm,"")
    .replace(/^\s*\d+[.)]\s+/gm,"")
    .replace(/^\s*\|?[-:| ]{3,}\|?\s*$/gm,"")
    .replace(/\|/g,", ")
    .replace(/(\*\*|__|~~|==)/g,"")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_]/g,"$1$2")
    .replace(/[ \t]+/g," ").replace(/\n{2,}/g,"\n").replace(/ ?\n ?/g,"\n");
  return t.replace(/\p{Extended_Pictographic}\uFE0F?/gu,"").replace(/\s*[—–]\s*/g,", ").replace(/^\s+/,"");
}
function takeSentences(buf,final,min){
  const out=[],re=new RegExp("^([\\s\\S]{"+(min||14)+",}?(?:[.!?\u2026]+[\"')\\]]*(?=\\s)|(?=\\n)))\\s*");
  let rest=buf;
  for(;;){const m=re.exec(rest);if(!m)break;out.push(m[1].trim());rest=rest.slice(m[0].length)}
  if(final&&rest.trim()){out.push(rest.trim());rest=""}
  return{out:out.filter(Boolean),rest};
}

/* ----- speech output ----- */
const TTS={q:[],playing:false,gen:0,audio:null,ac:null,an:null,buf:null,pulse:0,finalFed:false,onIdle:null,cache:new Map(),msgId:null};
const ttsLevel=()=>{
  if(TTS.an&&TTS.audio&&!TTS.audio.paused)return Math.min(1,rmsOf(TTS.an,TTS.buf)*5);
  return TTS.playing?Math.max(.18,TTS.pulse):0;
};
function deviceVoices(){return window.speechSynthesis?speechSynthesis.getVoices():[]}
function voiceScore(v,lang){
  const n=v.name||"",base=String(lang).split(/[-_]/)[0];
  let s=0;
  if(v.lang===lang||String(v.lang).replace("_","-")===lang)s+=6;
  else if(String(v.lang).split(/[-_]/)[0]===base)s+=3;
  else return -1;
  if(/natural|neural|online|premium|enhanced|siri|wavenet|studio|journey|polyglot/i.test(n))s+=8;
  if(/google/i.test(n))s+=3;
  if(!v.localService)s+=2;
  if(v.default)s+=1;
  if(/compact|espeak|robot|novelty|bad news|bahh|bells|boing|bubbles|cellos|jester|organ|whisper|zarvox|trinoids|albert|fred|junior|kathy|ralph/i.test(n))s-=20;
  return s;
}
function pickDeviceVoice(){
  const vs=deviceVoices(),s=state.settings,lang=s.voiceLang||navigator.language||"en-US";
  const named=s.voiceName&&vs.find(v=>v.name===s.voiceName);
  if(named)return named;
  let best=null,bs=-1;
  for(const v of vs){const sc=voiceScore(v,lang);if(sc>bs){bs=sc;best=v}}
  return best;
}
const ttsEngine=()=>{
  const s=state.settings,k=id=>cleanKey(s.keys&&s.keys[id]);
  if(s.voiceEngine==="eleven"&&k("elevenlabs"))return "eleven";
  if(s.voiceEngine==="cloud"&&k("openai"))return "cloud";
  return "device";
};
const cloudReady=()=>ttsEngine()==="cloud";
const TTS_STYLE="Speak naturally and conversationally, like a warm, relaxed friend. Use natural rhythm, small pauses and varied intonation. Never sound like you are reading.";
const ELEVEN_VOICES=[{v:"21m00Tcm4TlvDq8ikWAM",l:"Rachel"},{v:"EXAVITQu4vr4xnSDxMaL",l:"Bella"},{v:"MF3mGyEYCl7XYWbV9V6O",l:"Elli"},{v:"AZnzlk1XvdvUeBnXmlld",l:"Domi"},{v:"pNInz6obpgDQGcFmaJgB",l:"Adam"},{v:"TxGEqnHWrfWFTfGW9XjX",l:"Josh"},{v:"ErXwobaYiN019PkySvjV",l:"Antoni"},{v:"VR6AewLTigWG4xSOukaG",l:"Arnold"},{v:"yoZ06aMxZJJ28mfd3POQ",l:"Sam"}];
async function elevenAudio(text,signal){
  const s=state.settings,key=cleanKey(s.keys.elevenlabs),vid=encodeURIComponent(String(s.elevenVoice||ELEVEN_VOICES[0].v).trim());
  const r=await pfetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`,{method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json",Accept:"audio/mpeg"},body:JSON.stringify({text,model_id:"eleven_turbo_v2_5",voice_settings:{stability:.45,similarity_boost:.8,style:.2,use_speaker_boost:true,speed:Math.min(1.2,Math.max(.7,+s.voiceRate||1))}}),signal});
  if(!r.ok)throw new Error(await httpError(r));
  return r.blob();
}
async function cloudAudio(text,signal){
  const key=cleanKey(state.settings.keys.openai),body=m=>JSON.stringify({model:m,voice:state.settings.cloudVoice||"alloy",input:text,speed:Math.min(2,Math.max(.5,+state.settings.voiceRate||1)),response_format:"mp3",...(m==="gpt-4o-mini-tts"?{instructions:TTS_STYLE}:{})});
  const go=m=>pfetch(PROVIDERS.openai.base+"/audio/speech",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:body(m),signal});
  let r=await go("gpt-4o-mini-tts");
  if(!r.ok&&r.status>=400&&r.status<500&&r.status!==401&&r.status!==429)r=await go("tts-1");
  if(!r.ok)throw new Error(await httpError(r));
  return r.blob();
}
const cloudFetch=t=>{if(!TTS.cache.has(t))TTS.cache.set(t,ttsEngine()==="eleven"?elevenAudio(t):cloudAudio(t));return TTS.cache.get(t)};
function speakDevice(t){
  return new Promise(res=>{
    if(!window.speechSynthesis)return res();
    const u=new SpeechSynthesisUtterance(t),v=pickDeviceVoice();
    if(v)u.voice=v;
    u.lang=(v&&v.lang)||state.settings.voiceLang||navigator.language||"en-US";
    u.rate=+state.settings.voiceRate||1;
    u.onboundary=()=>{TTS.pulse=1};
    u.onend=u.onerror=()=>res();
    speechSynthesis.speak(u);
  });
}
async function speakCloud(t){
  const nxt=TTS.q[0];
  if(nxt)cloudFetch(nxt).catch(()=>{});
  const blob=await cloudFetch(t);
  TTS.cache.delete(t);
  return new Promise(res=>{
    const url=URL.createObjectURL(blob),a=new Audio(url);
    TTS.audio=a;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){
        if(!TTS.ac)TTS.ac=new AC();
        const src=TTS.ac.createMediaElementSource(a);
        TTS.an=TTS.an||TTS.ac.createAnalyser();TTS.an.fftSize=512;TTS.buf=TTS.buf||new Uint8Array(TTS.an.fftSize);
        src.connect(TTS.an);TTS.an.connect(TTS.ac.destination);
        if(TTS.ac.state==="suspended")TTS.ac.resume();
      }
    }catch{}
    const done=()=>{URL.revokeObjectURL(url);if(TTS.audio===a)TTS.audio=null;res()};
    a.onended=done;a.onerror=done;
    a.play().catch(done);
  });
}
function ttsEnqueue(text){TTS.q.push(text);ttsPump()}
async function ttsPump(){
  if(TTS.playing)return;
  const t=TTS.q.shift();
  if(!t){if(TTS.finalFed&&TTS.onIdle){const f=TTS.onIdle;TTS.onIdle=null;f()}return}
  TTS.playing=true;
  const gen=TTS.gen;
  try{await(ttsEngine()==="device"?speakDevice(t):speakCloud(t))}
  catch(e){if(gen===TTS.gen){toast("Speech output failed: "+String(e&&e.message||e).slice(0,100),"err");TTS.q.length=0}}
  if(gen!==TTS.gen)return;
  TTS.playing=false;
  ttsPump();
}
function ttsStop(){
  TTS.gen++;TTS.q.length=0;TTS.playing=false;TTS.finalFed=false;TTS.onIdle=null;TTS.cache.clear();
  try{if(window.speechSynthesis)speechSynthesis.cancel()}catch{}
  if(TTS.audio){try{TTS.audio.pause()}catch{}TTS.audio=null}
  TTS.msgId=null;
  $$(".act-btn.speaking").forEach(b=>b.classList.remove("speaking"));
}
function speakToggle(msg,btn){
  if(TTS.msgId===msg.id){ttsStop();return}
  ttsStop();
  const text=speakable(viewParts(msg).content,false);
  if(!text.trim())return;
  TTS.msgId=msg.id;btn.classList.add("speaking");
  if(window.speechSynthesis)speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  takeSentences(text,true).out.forEach(s=>ttsEnqueue(s));
  TTS.finalFed=true;
  TTS.onIdle=()=>{TTS.msgId=null;btn.classList.remove("speaking")};
}
if(window.speechSynthesis)speechSynthesis.onvoiceschanged=()=>{};
