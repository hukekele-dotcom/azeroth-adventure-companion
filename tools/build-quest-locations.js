'use strict';
// Numeric tables only: never execute downloaded Lua. Keep representative spawns
// for EACH objective mask/type/map, not just the first objective in a quest.
const fs=require('fs'),path=require('path');
const root=process.argv[2];if(!root)throw Error('Pass EverythingQuests checkout');
const data={};
for(const [file,phase] of [['QuestSpawns_Forever.lua','objective'],['QuestTurnIn_Forever.lua','turnin']]){
 const src=fs.readFileSync(path.join(root,'Data',file),'utf8');
 for(const line of src.split('\n')){
  const q=line.match(/^\s*\[(\d+)\]=\{(.*)\},?\s*$/);if(!q)continue;
  const points=[];
  for(const m of q[2].matchAll(/\[(\d+)\]=\{([\d,]+)\}/g)){
   const groups=new Map();
   for(const s of m[2].split(',')){
    const v=Number(s),kind=Math.floor(v/1e8)%10,mask=phase==='objective'?Math.floor(v/1e9):0;
    if(!Number.isSafeInteger(v))throw Error('Unsafe packed value');
    const key=kind+':'+mask,group=groups.get(key)||[];
    const x=Math.floor((v%1e8)/1e4)/100,y=(v%1e4)/100;
    if(group.length<3&&!group.some(p=>Math.hypot(p[1]-x,p[2]-y)<2))group.push([Number(m[1]),x,y,kind,mask]);
    groups.set(key,group);
   }
   points.push(...[...groups.values()].flat());
  }
  if(points.length)(data[q[1]]??={})[phase]=points;
 }
}
for(const row of fs.readFileSync(path.join(root,'Data','QuestCategory_Forever.lua'),'utf8').matchAll(/^\s*\[(\d+)\]=(\d+),?\s*$/gm)){
 if(Number(row[2])%2===1)(data[row[1]]??={}).dungeon=true;
}
const serialize=v=>Array.isArray(v)?'{'+v.map(serialize).join(',')+'}':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>(/^\d+$/.test(k)?'['+k+']':k)+'='+serialize(x)).join(',')+'}':JSON.stringify(v);
const version=require('crypto').createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,24);
fs.writeFileSync('addon/WoWAI/QuestLocations.lua','-- Derived from EverythingQuests Forever data, MIT (see THIRD_PARTY.md).\n-- Columns: uiMapID, x percent, y percent, kind, objective mask.\nWoWAIQuestLocations = '+serialize(data)+'\nWoWAIQuestCatalogVersion = '+JSON.stringify(version)+'\n');
fs.writeFileSync('bridge/quest-locations.json',JSON.stringify({version,quests:data})+'\n');
console.log(Object.keys(data).length+' quests, '+fs.statSync('addon/WoWAI/QuestLocations.lua').size+' bytes');
