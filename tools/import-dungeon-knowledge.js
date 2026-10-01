'use strict';
// One-time/date-stamped import of factual reference data; never run guide scripts or downloaded Lua.
const fs=require('fs'),path=require('path');
const {parse,literal,readAssignment,sha256}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'knowledge/dungeons'),snap=path.join(root,'reference/dungeons/2026-10-01');
const research=process.argv[2];if(!research)throw Error('Pass the local research root explicitly');
fs.mkdirSync(dir,{recursive:true});
const baseline=path.join(dir,'baseline.json');if(!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(readAssignment(path.join(root,'addon/WoWAI/DungeonData.lua'),'WoWAIDungeonData'),null,2)+'\n');
const fc=JSON.parse(fs.readFileSync(path.join(snap,'foreverchanges.json'),'utf8'));
// Drop duplicate Classic tooltip, old drop rates and page layout. Keep facts and provenance.
for(const r of fc.records)for(const b of r.bosses)for(const i of b.items){delete i.y;delete i.z;delete i.p;}
fs.writeFileSync(path.join(dir,'community.json'),JSON.stringify(fc,null,2)+'\n');
const source=path.join(root,'reference/EverythingQuests/Data/QuestAvailable_Forever.lua');
const gates=literal(parse(fs.readFileSync(source,'utf8')).body[1].init[0]);
const selected=new Set(fc.records.flatMap(r=>r.quests.map(q=>q.id)));
const reduced={};for(const [k,rows]of Object.entries(gates))if(rows&&typeof rows==='object')reduced[k]=Object.fromEntries(Object.entries(rows).filter(([id])=>selected.has(+id)));
fs.writeFileSync(path.join(dir,'eligibility.json'),JSON.stringify({source:'https://github.com/wheelbarrel00/EverythingQuests',revision:'9c1ce1e44238d8c6c8ca36d8f49836fde70b564f',sha256:sha256(fs.readFileSync(source)),tables:reduced},null,2)+'\n');
const names={};for(const lang of ['zhCN','zhTW']){
 const file=path.join(snap,`quest-names-${lang}.lua`),text=fs.readFileSync(file,'utf8');
 const inside=text.slice(text.indexOf('[[return ')+2,text.lastIndexOf(']]'));
 const rows=literal(parse(inside).body[0].arguments[0]);
 // Classic descriptions are separately labelled references, never current quest facts.
 names[lang]=Object.fromEntries([...selected].filter(id=>rows[id]).map(id=>[id,rows[id][0]||rows[id][1]]));
 if(lang==='zhCN')names.classicInstructions=Object.fromEntries([...selected].filter(id=>rows[id]).map(id=>[id,Object.values(rows[id][1]||{}).join('\n')]));
}
fs.writeFileSync(path.join(dir,'quest-names.json'),JSON.stringify(names,null,2)+'\n');
const npcZhText=fs.readFileSync(path.join(snap,'npc-zhCN.lua'),'utf8');
const npcZh=literal(parse(npcZhText.slice(npcZhText.indexOf('[[return ')+2,npcZhText.lastIndexOf(']]'))).body[0].arguments[0]);
const npcEnText=fs.readFileSync(path.join(snap,'npc-en.lua'),'utf8'),npcTranslations={};
// Parse only each name literal, not the large spawn tables.
for(const m of npcEnText.matchAll(/^\[(\d+)\]\s*=\s*\{\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gm)){
 const n=literal(parse('return '+m[2]).body[0].arguments[0]);const z=npcZh[m[1]];
 if(z)npcTranslations[n]={id:+m[1],name:z[0]||z[1]};
}
const relevant=new Set(fc.records.filter(r=>r.lang==='en').flatMap(r=>r.bosses.flatMap(b=>[b.name,...b.name.split(' / ').map(n=>n.replace(/^Ring of Law: /,''))]).concat(r.quests.flatMap(q=>[...(q.giver||[]).slice(0,1),...(q.kill||[]).map(n=>n.n)]))));
fs.writeFileSync(path.join(dir,'npc-names.json'),JSON.stringify(Object.fromEntries(Object.entries(npcTranslations).filter(([name])=>relevant.has(name))),null,2)+'\n');
const files=[],itemNames={};
for(const name of fs.readdirSync(research).filter(n=>n.includes('专题_'))){
 const folder=path.join(research,name);for(const f of ['资料核对.md','研究/正文物品清单.json','研究/成稿物品数据.json','研究/首领与掉落_20260922.json','研究/FC物品数据.json']){
  const file=path.join(folder,f);if(!fs.existsSync(file))continue;const bytes=fs.readFileSync(file);
  files.push({document:name+'/'+f,sha256:sha256(bytes)});
  if(/(?:正文物品清单|成稿物品数据)\.json$/.test(f)){
   const obj=JSON.parse(bytes);for(const [id,v]of Object.entries(obj))if(v.name)itemNames[v.id||id]={name:v.name,nameEn:v.en,document:name+'/'+f};
  }
 }
}
fs.writeFileSync(path.join(dir,'local-research.json'),JSON.stringify({documents:files,itemNames},null,2)+'\n');
console.log(JSON.stringify({pages:fc.records.length,questNames:Object.keys(names.zhCN).length,researchDocuments:files.length,localItemNames:Object.keys(itemNames).length}));
