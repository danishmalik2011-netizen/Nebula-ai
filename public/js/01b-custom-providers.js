"use strict";
/* ---------- custom providers: any number of OpenAI- or Anthropic-compatible endpoints ----------
   Each one is registered in PROVIDERS at runtime (id "cp_xxxx"), so every place that looks up a provider
   (sending, model fetching, pickers) works unchanged. Models from all usable providers are merged for switching. */
const cpNewId=()=>"cp_"+Math.random().toString(36).slice(2,9);
const cpClean=u=>String(u||"").trim().replace(/\/+$/,"");
const cpModels=a=>[...new Set((a||[]).map(x=>String(x).trim()).filter(Boolean))].slice(0,300);
const cpGet=id=>(state.settings.customProviders||[]).find(c=>c.id===id);
function syncCustomProviders(){
  for(const k of Object.keys(PROVIDERS))if(k.startsWith("cp_"))delete PROVIDERS[k];
  for(const c of state.settings.customProviders||[])
    PROVIDERS[c.id]={name:c.name||"Custom",adapter:c.adapter==="anthropic"?"anthropic":"openai",base:cpClean(c.base),desc:"Custom endpoint",needsKey:false,custom:true,models:cpModels(c.models)};
}
function cpSave(o){
  const s=state.settings;s.customProviders=s.customProviders||[];s.keys=s.keys||{};
  let c=o.id&&cpGet(o.id);
  if(!c){c={id:cpNewId(),models:[]};s.customProviders.push(c)}
  c.name=String(o.name||"").trim().slice(0,40)||"Custom provider";
  c.base=cpClean(o.base);
  c.adapter=o.adapter==="anthropic"?"anthropic":"openai";
  if(Array.isArray(o.models))c.models=cpModels(o.models);
  if(o.key!==undefined)s.keys[c.id]=cleanKey(o.key);
  syncCustomProviders();save();
  return c;
}
function providerUsable(id){
  const p=PROVIDERS[id],s=state.settings;
  if(!p)return false;
  if(p.custom)return !!p.base;
  return p.needsKey===false||!!cleanKey(s.keys&&s.keys[id]);
}
function cpRemove(id){
  const s=state.settings;
  s.customProviders=(s.customProviders||[]).filter(c=>c.id!==id);
  if(s.keys)delete s.keys[id];
  if(s.fetched)delete s.fetched[id];
  syncCustomProviders();
  if(s.provider===id){
    const next=Object.keys(PROVIDERS).find(providerUsable)||"openai";
    s.provider=next;const ml=modelList(next);s.model=ml[0]||"";
  }
  save();updateBadges();setSendState();
}
/* every model from every usable provider, current provider first */
function allModelGroups(){
  const s=state.settings,ids=Object.keys(PROVIDERS).filter(providerUsable);
  ids.sort((a,b)=>(a===s.provider?-1:0)-(b===s.provider?-1:0));
  return ids.map(id=>{
    const list=modelList(id).slice();
    if(id===s.provider&&s.model&&!list.includes(s.model))list.unshift(s.model);
    return{id,name:PROVIDERS[id].name,models:list};
  }).filter(g=>g.models.length);
}
/* switch provider and model together; the conversation and workspace carry over untouched */
function useModel(provId,model){
  const s=state.settings;
  if(!PROVIDERS[provId])return;
  s.provider=provId;s.model=model;
  save();updateBadges();setSendState();
  if(!(s.fetched&&s.fetched[provId]))fetchModels(provId);
}
function migrateLegacyCustom(){
  const s=state.settings;
  if(!Array.isArray(s.customProviders))s.customProviders=[];
  if(s.customBaseUrl&&!s.customProviders.length){
    const c=cpSave({name:"Custom endpoint",base:s.customBaseUrl,adapter:"openai",key:(s.keys&&s.keys.custom)||"",models:(s.fetched&&s.fetched.custom)||[]});
    if(s.provider==="custom")s.provider=c.id;
  }
  s.customBaseUrl="";
  if(s.keys)delete s.keys.custom;
  if(s.fetched)delete s.fetched.custom;
  if(s.provider==="custom")s.provider="openai";
  syncCustomProviders();
}
