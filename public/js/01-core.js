"use strict";
const PROVIDERS = {
  openai:{name:"OpenAI",adapter:"openai",base:"https://api.openai.com/v1",desc:"GPT-4o, GPT-4.1, o-series reasoning models.",keyUrl:"https://platform.openai.com/api-keys",models:["gpt-4o","gpt-4o-mini","gpt-4.1","gpt-4.1-mini","gpt-4.1-nano","o3-mini","o4-mini"]},
  anthropic:{name:"Anthropic",adapter:"anthropic",base:"https://api.anthropic.com/v1",desc:"Claude Sonnet, Opus and Haiku families.",keyUrl:"https://console.anthropic.com/settings/keys",models:["claude-sonnet-4-20250514","claude-opus-4-20250514","claude-3-7-sonnet-20250219","claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022"]},
  google:{name:"Google Gemini",adapter:"google",base:"https://generativelanguage.googleapis.com/v1beta",desc:"Gemini 2.5 Pro / Flash via Google AI Studio.",keyUrl:"https://aistudio.google.com/app/apikey",models:["gemini-2.5-pro","gemini-2.5-flash","gemini-2.0-flash","gemini-1.5-pro","gemini-1.5-flash"]},
  openrouter:{name:"OpenRouter",adapter:"openai",base:"https://openrouter.ai/api/v1",desc:"One key for hundreds of models from many labs.",keyUrl:"https://openrouter.ai/keys",models:["openai/gpt-4o-mini","anthropic/claude-3.5-sonnet","google/gemini-flash-1.5","meta-llama/llama-3.3-70b-instruct","deepseek/deepseek-chat","qwen/qwen-2.5-72b-instruct"]},
  groq:{name:"Groq",adapter:"openai",base:"https://api.groq.com/openai/v1",desc:"Ultra-fast inference on LPU hardware.",keyUrl:"https://console.groq.com/keys",models:["llama-3.3-70b-versatile","llama-3.1-8b-instant","mixtral-8x7b-32768","gemma2-9b-it","deepseek-r1-distill-llama-70b"]},
  deepseek:{name:"DeepSeek",adapter:"openai",base:"https://api.deepseek.com/v1",desc:"DeepSeek Chat and DeepSeek Reasoner.",keyUrl:"https://platform.deepseek.com/api_keys",models:["deepseek-chat","deepseek-reasoner"]},
  mistral:{name:"Mistral AI",adapter:"openai",base:"https://api.mistral.ai/v1",desc:"Mistral Large, Small and Nemo.",keyUrl:"https://console.mistral.ai/api-keys/",models:["mistral-large-latest","mistral-small-latest","open-mistral-nemo","codestral-latest"]},
  xai:{name:"xAI (Grok)",adapter:"openai",base:"https://api.x.ai/v1",desc:"Grok models from xAI.",keyUrl:"https://console.x.ai/",models:["grok-2-latest","grok-2-1212","grok-beta"]},
  ollama:{name:"Ollama (local)",adapter:"openai",base:"http://localhost:11434/v1",desc:"Run open models locally. No API key required.",needsKey:false,models:["llama3.2","qwen2.5","mistral","phi4","deepseek-r1"]}
};

const LS_KEY = "nebula.byok.v2";
const DEFAULT_SETTINGS = {
  mode: "chat", buildSteps: 80, customProviders: [],
  theme:"light",accent:"#B5532E",fontSize:16,msgWidth:780,streaming:true,autoScroll:true,timestamps:true,sendOnEnter:true,
  provider:"openai",model:"gpt-4o-mini",temperature:0.7,topP:1,maxTokens:0,
  systemPrompt:"You are Nebula, a helpful and precise AI assistant. Answer clearly and concisely. Use Markdown formatting — headings, lists, tables and fenced code blocks with a language tag — whenever it improves readability.",
  keys:{},customBaseUrl:"",sidebarClosed:false,artifacts:true,useProxy:true,fontFamily:"inter",fetched:{},reasoning:true,autoTitle:true,webMode:"off",webEngine:"wikipedia",searxUrl:"",webImages:true,sttMode:"auto",voiceEngine:"device",voiceName:"",cloudVoice:"alloy",voiceRate:1,voiceLang:"",dictAutoSend:false,richUI:true,liveCaptions:true,bargeIn:false,elevenVoice:"21m00Tcm4TlvDq8ikWAM"
};

let state = { settings:{...DEFAULT_SETTINGS}, chats:[], activeId:null };
let abortController = null, isStreaming = false, searchQuery = "";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function escapeHtml(str){return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function toast(msg,type=""){
  const wrap=$("#toastWrap"),el=document.createElement("div");
  el.className="toast "+type;el.textContent=msg;wrap.appendChild(el);
  setTimeout(()=>{el.classList.add("out");setTimeout(()=>el.remove(),260)},2800);
}
const fmtTime=ts=>new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const fmtDate=ts=>new Date(ts).toLocaleDateString([],{month:"short",day:"numeric",year:"numeric"});
const estimateTokens=str=>Math.max(0,Math.round((str||"").length/4));
/* one place for every file the user saves. In the Android app the file is handed to the app (it lands in Downloads); in a browser it is a normal download. */
async function saveFile(blob,name){
  const app=window.NebulaApp;
  if(app&&typeof app.postMessage==="function"){
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let bin="";
    for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    app.postMessage(JSON.stringify({t:"save",name:String(name||"download"),mime:blob.type||"application/octet-stream",b64:btoa(bin)}));
    return;
  }
  const u=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function download(filename,text){return saveFile(new Blob([text],{type:"text/plain;charset=utf-8"}),filename)}
