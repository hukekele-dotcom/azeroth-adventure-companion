'use strict';
// Extract literal facts only. Never execute downloaded addon scripts.
const fs=require('fs'),path=require('path');
const {parse,literal,serialize,sha256}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reference/EverythingQuests/Data');
const revision=require('child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:path.dirname(dir),encoding:'utf8'}).trim();
function assigned(file,key){const ast=parse(fs.readFileSync(path.join(dir,file),'utf8'));for(const n of ast.body)if(n.type==='AssignmentStatement'&&n.variables.some(v=>v.identifier?.name===key))return literal(n.init[0]);throw Error(key);}
const data=assigned('QuestAvailable_Forever.lua','CLASSIC_QUEST_AVAILABLE');
const sources=assigned('QuestSources_Forever.lua','CLASSIC_QUEST_SOURCES');
const categories=assigned('QuestCategory_Forever.lua','CLASSIC_QUEST_CATEGORY');
const holidayAst=parse(fs.readFileSync(path.join(dir,'QuestHolidays_Classic.lua'),'utf8'));
const holidays=holidayAst.body.filter(n=>n.type==='AssignmentStatement').map(n=>literal(n.init[0])).find(x=>x.event)?.event||{};
function translation(file){const text=fs.readFileSync(path.join(root,'reference/dungeons/2026-10-01',file),'utf8');return literal(parse(text.slice(text.indexOf('[[return ')+2,text.lastIndexOf(']]'))).body[0].arguments[0]);}
const zh=translation('quest-names-zhCN.lua'),tw=translation('quest-names-zhTW.lua'),npc=translation('npc-zhCN.lua');
const convert=require('opencc-js').Converter({from:'cn',to:'tw'});
const first=x=>x&&(x[0]||x[1]);
const quests={},maps={},people={};
for(const [id,starts] of Object.entries(data.start)){
 const gate=data.gates[id];if(!gate)continue;
 const q={name:{enUS:data.names[id]||id,zhCN:first(zh[id]),zhTW:first(tw[id])},min:Math.floor(gate/1e11),level:Math.floor(gate/1e9)%100,flags:Math.floor(gate/1e8)%10,races:Math.floor(gate/1e4)%1e4,classes:gate%1e4,category:categories[id]||0,holiday:!!holidays[id],start:[]};
 for(const field of ['pre','preAll','excl','chain','parent','skill','minRep','maxRep'])if(data[field]?.[id]!=null)q[field]=data[field][id];
 for(const [map,packed] of Object.entries(starts))for(const v of packed){
  const source=Math.floor(v/1e9),kind=Math.floor(v/1e8)%10,x=Math.floor(v%1e8/1e4)/100,y=v%1e4/100;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x>100||y>100)throw Error('Invalid start '+id);
  q.start.push([+map,x,y,kind,source]);const key=kind+':'+source;
  if(!people[key]){const cn=kind===1?first(npc[source]):null;people[key]={enUS:sources[kind===1?'npc':'obj']?.[source]||String(source),zhCN:cn,zhTW:cn?convert(cn):null};}
 }
 // Upstream explicitly cannot encode Skyborne-only eligibility yet. Keep facts
 // searchable, but do not send arbitrary characters to an unverified pickup.
 if(q.start.some(p=>p[0]===2521)||q.min<1)q.gatesUnverified=true;
 quests[id]=q;
 for(const map of new Set(q.start.map(p=>p[0]))) (maps[map]??=[]).push(+id);
}
const output={quests,maps,people};
fs.writeFileSync(path.join(root,'addon/WoWAI/QuestOffersData.lua'),'-- Generated literal quest facts; attribution in THIRD_PARTY.md.\nWoWAIQuestOffersData='+serialize(output)+'\n');
fs.writeFileSync(path.join(root,'docs/quest-offers-receipt.json'),JSON.stringify({source:'https://github.com/wheelbarrel00/EverythingQuests',revision,input:sha256(fs.readFileSync(path.join(dir,'QuestAvailable_Forever.lua'))),quests:Object.keys(quests).length,maps:Object.keys(maps).length,points:Object.values(quests).reduce((n,q)=>n+q.start.length,0)},null,2)+'\n');
console.log('Quest offers:',Object.keys(quests).length,'maps:',Object.keys(maps).length);
