'use strict';
// Reproducible offline build from versioned facts, without private paths or live AI calls.
const fs=require('fs'),path=require('path');
const {serialize,validate,sha256}=require('./dungeon-knowledge');
const {classify}=require('./dungeon-factions');
const {mergeQuestResearch}=require('./merge-dungeon-quest-research');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'knowledge/dungeons');
const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const arrays=new Set(['dungeons','bosses','quests','loot','aliases','stats','effects','effectsEn','steps','followups','rewards','pre','preAll','excl','classes','rep','repEn']);
function fix(v){if(!v||typeof v!=='object')return v;for(const [k,x]of Object.entries(v)){if(arrays.has(k)&&x&&typeof x==='object'&&!Object.keys(x).length)v[k]=[];else fix(x);}return v;}
const data=fix(read('baseline.json')),fc=read('community.json'),local=read('local-research.json'),names=read('quest-names.json'),gates=read('eligibility.json').tables,patch=read('corrections.json');
const npc=read('npc-names.json');
const questResearch=read('quest-research.json');
data.version='2026-10-03.1';data.schema=1;data.client='1.60.1';
const idOf=id=>id.startsWith('scarlet-monastery-')?'scarlet-monastery':id.startsWith('dire-maul-')?'dire-maul':id.startsWith('stratholme-')?'stratholme':id.endsWith('-blackrock-spire')?'blackrock-spire':({'the-deadmines':'deadmines','the-stockade':'stockade','city-of-dalaran':'dalaran'})[id]||id;
const dungeonNames={
 'razorfen-downs':['剃刀高地','Razorfen Downs'],uldaman:['奥达曼','Uldaman'],zulfarrak:['祖尔法拉克',"Zul'Farrak"],maraudon:['玛拉顿','Maraudon'],'sunken-temple':['阿塔哈卡神庙','Sunken Temple'],
 'blackrock-depths':['黑石深渊','Blackrock Depths'],'blackrock-spire':['黑石塔','Blackrock Spire'],'dire-maul':['厄运之槌','Dire Maul'],scholomance:['通灵学院','Scholomance'],stratholme:['斯坦索姆','Stratholme'],
 'the-drowned-city':['沉没之城','The Drowned City'],'kroldok-stronghold':['克罗多克要塞',"Krol'dok Stronghold"],'alcaz-prison':['奥卡兹监狱','Alcaz Prison'],'blackmaw-hold':['黑喉要塞','Blackmaw Hold'],'shapers-terrace':['塑形者露台',"Shaper's Terrace"]
};
const slots={Head:'头部',Neck:'颈部',Shoulder:'肩部',Back:'背部',Chest:'胸部',Wrist:'手腕',Hands:'手部',Waist:'腰部',Legs:'腿部',Feet:'脚',Finger:'手指',Trinket:'饰品','Main Hand':'主手','One-Hand':'单手','Two-Hand':'双手','Off Hand':'副手','Held In Off-hand':'副手物品',Ranged:'远程',Thrown:'投掷',Relic:'圣物'};
const types={4:{1:'布甲',2:'皮甲',3:'锁甲',4:'板甲',6:'盾牌'},2:{0:'斧',1:'斧',2:'弓',3:'枪械',4:'锤',5:'锤',6:'长柄武器',7:'剑',8:'剑',10:'法杖',13:'拳套',15:'匕首',16:'投掷武器',18:'弩',19:'魔杖'}};
const statNames={3:'敏捷',4:'力量',5:'智力',6:'精神',7:'耐力'};
const localizedItems=new Map(fc.records.filter(r=>r.lang==='zh-cn').flatMap(r=>r.bosses.flatMap(b=>b.items)).map(i=>[i.i,i]));
const npcNames=new Map(fc.records.filter(r=>r.lang==='zh-cn').flatMap(r=>r.bosses).filter(b=>b.english).map(b=>[b.english,b.name]));
const conflicts=[],sources=[];
for(const [en,n]of Object.entries(npc))if(!npcNames.has(en))npcNames.set(en,n.name);
function item(e,z){
 z=z||localizedItems.get(e.i)||e;const current=e.w===1;const stats=Object.entries(e.v||{}).filter(([k])=>statNames[k]).map(([k,value])=>({label:statNames[k],value}));
 return {id:e.i,name:local.itemNames[e.i]?.name||z.n,nameEn:e.n,quality:e.q,level:e.r||0,ilvl:e.l,slot:slots[e.s]||e.s,type:types[e.c]?.[e.u],icon:e.k&&'Interface\\Icons\\'+e.k,stats,armor:e.v?.[50],
  effects:[],effectsEn:[],referenceLines:z.x||[],referenceLinesEn:e.x||[],basis:current?'site':'classic',mapping:current?'reported':'classic-reference',uncertain:!current,bosses:[],sourceDate:'2026-10-01'};
}
function details(q){
 const lines=[];for(const n of q.need||[])lines.push(`收集 ${localizedItems.get(n.i)?.n||n.n} ×${n.c}`);
 for(const n of q.kill||[])lines.push(`击败 ${npcNames.get(n.n)||n.n} ×${n.c}`);
 return lines.length?lines.join('；'):q.text||'请按游戏内任务目标完成；详细流程待核实。';
}
function addQuest(d,q,r){
 let existing=d.quests.find(x=>x.id===q.id);const old=existing;
 if(!existing){existing={id:q.id,name:names.zhCN[q.id]||q.title,nameEn:q.title,instructions:details(q),instructionsEn:q.text||'',from:[...(q.giver||[]).slice(0,2),q.starts,q.where].filter(Boolean).join(' · ')||'接取位置资料待补充',fromEn:[...(q.giver||[]).slice(0,2),q.starts,q.where].filter(Boolean).join(' · '),gatesKnown:false,itemStart:!!q.starts,rewards:[],steps:[],followups:[],prerequisites:''};d.quests.push(existing);}
 if(!old){existing.basis=r.questBasis==='classic'?'classic':'site';if(existing.basis==='classic'&&names.classicInstructions?.[q.id])existing.instructions=names.classicInstructions[q.id];}
 const packed=gates.gates[q.id];
 if(packed&&!existing.gatesKnown){existing.gatesKnown=true;existing.races=Math.floor(packed%1e8/1e4);existing.classes=packed%1e4;existing.minLevel=Math.floor(packed/1e11);existing.repeatable=Math.floor(packed%1e9/1e8)%2===1;
  for(const k of ['pre','preAll','excl'])if(gates[k]?.[q.id])existing[k]=Object.values(gates[k][q.id]);
  for(const k of ['parent','chain','skill','minRep','maxRep'])if(gates[k]?.[q.id])existing[k]=gates[k][q.id];
  const starts=Object.values(gates.start[q.id]||{}).flatMap(Object.values).map(v=>Math.floor(v/1e8)%10);existing.inside=starts.length>0&&starts.every(k=>k>4);existing.itemStart=existing.itemStart||starts.some(k=>k%4===3);
 }
 const side=q.side==='a'?'alliance':q.side==='h'?'horde':q.side===''?'both':'unknown';
 if(existing.faction&&existing.faction!=='unknown'&&existing.faction!==side){conflicts.push({dungeon:d.id,type:'faction',id:q.id,kept:existing.faction,candidate:side,source:r.url});}
 else Object.assign(existing,classify(side,existing.races,existing.gatesKnown));
 if(q.min>0&&!existing.minLevel)existing.minLevel=q.min;
 else if(q.min>0&&existing.minLevel!==q.min)conflicts.push({dungeon:d.id,type:'minimum-level',id:q.id,kept:existing.minLevel,candidate:q.min,source:r.url});
 existing.nameTw=names.zhTW[q.id];
 if(q.prev&&!existing.prerequisites){existing.prerequisites=q.prev.title;existing.prerequisitesEn=q.prev.title;existing.steps.push({name:q.prev.title,nameEn:q.prev.title,from:(q.prev.giver||[]).slice(0,2).join(' · '),instructions:''});if(!existing.pre&&!existing.preAll)existing.gatesKnown=false;}
 for(const reward of [...(q.given||[]),...(q.choice||[])])if(!existing.rewards.some(x=>x.id===reward.i))existing.rewards.push({...item(reward),rewardMode:(q.choice||[]).includes(reward)?'choice':'given'});
 if(!existing.rewardNote&&q.choice?.length)existing.rewardNote=`可选奖励 ${q.choice.length} 选 1`;if(!existing.rewardNoteEn&&q.choice?.length)existing.rewardNoteEn=`Choose 1 of ${q.choice.length} rewards`;
 if(!old&&q.then)existing.followups=q.then.map(next=>({name:names.zhCN[next.id]||next.title,nameEn:next.title,faction:side,instructions:(next.texts||[]).map(x=>x[1]).join('\n'),instructionsEn:(next.texts||[]).map(x=>x[1]).join('\n')}));
 existing.sources=[...new Set([...(existing.sources||[]),r.url])];existing.sourceDate='2026-10-01';existing.conditionsSource=packed?'EverythingQuests Forever':'Community minimum only; other conditions unverified';
}
for(const r of fc.records.filter(r=>r.lang==='en')){
 const id=idOf(r.id),z=fc.records.find(x=>x.id===r.id&&x.lang==='zh-cn');let d=data.dungeons.find(d=>d.id===id);
 if(!d){const n=dungeonNames[id];if(!n)throw Error('Missing dungeon translation '+id);d={id,name:n[0],nameEn:n[1],aliases:n,quests:[],bosses:[],loot:[],coverage:'partial'};data.dungeons.push(d);}
 d.sources=[...new Set([...(d.sources||[]),r.url])];d.source='Local knowledge base · 2026-10-01';d.sourceDate='2026-10-01';
 sources.push({dungeon:id,page:r.url,sha256:r.sha256,lang:r.lang});
 for(const q of r.quests)addQuest(d,q,r);
 for(let bi=0;bi<r.bosses.length;bi++){
  const b=r.bosses[bi],zb=z?.bosses.find(x=>(x.english||x.name)===b.name)||z?.bosses[bi];
  const bossLike=['boss','rare'].includes(b.kind);let boss;
  if(bossLike){
   const parts=b.name.split(' / ').map(n=>n.replace(/^Ring of Law: /,'')),translated=parts.map(n=>npc[n]?.name||n).join(' / ');
   boss=d.bosses.find(x=>[x.key,...x.aliases].includes(b.name)||x.key==='The Butcher(The Baron)'&&b.name==='The Baron');
   if(!boss){boss={key:b.name,name:translated!==b.name?translated:zb?.name||b.name,nameEn:b.name,aliases:[],kind:b.kind};d.bosses.push(boss);}
   boss.aliases=[...new Set([...boss.aliases,b.name,zb?.name,boss.name,...parts,...parts.map(n=>npc[n]?.name)].filter(Boolean))];
  }
  for(const e of b.items){
   if(e.c===12||e.c===13)continue;
   const block=patch.blockMappings.find(x=>x.dungeon===d.id&&x.item===e.i);let i=d.loot.find(x=>x.id===e.i);
   if(!i){i=item(e,zb?.items.find(x=>x.i===e.i));d.loot.push(i);}
   if(e.w===1&&!['site','classic'].includes(i.basis))i.basis='site';
   if(boss&&!block&&!i.bosses.includes(boss.key)){i.bosses.push(boss.key);i.mapping=r.dropBasis==='classic'?'classic-reference':'reported';if(r.dropBasis==='classic'||e.w!==1)i.dropUnverified=true;}
   if(!boss&&!i.from){i.from=zb?.name||b.name;i.fromEn=b.name;}
   i.sources=[...new Set([...(i.sources||[]),r.url])];
  }
 }
}
for(const p of patch.sharedQuests||[]){const source=data.dungeons.find(d=>d.id===p.from)?.quests.find(q=>q.id===p.id),target=data.dungeons.find(d=>d.id===p.to);if(!source||!target)throw Error('Missing shared quest '+p.id);if(!target.quests.some(q=>q.id===p.id)){const q=structuredClone(source);Object.assign(q,p.set);q.sources=[...new Set([...(q.sources||[]),p.source])];target.quests.push(q);}}
mergeQuestResearch(data,questResearch);
for(const p of patch.quests){const d=data.dungeons.find(d=>d.id===p.dungeon),q=d?.quests.find(q=>q.id===p.id);if(!q)throw Error('Missing corrected quest '+p.id);Object.assign(q,p.set);q.sources=[...new Set([...(q.sources||[]),...p.sources])];}
for(const p of patch.blockMappings){const d=data.dungeons.find(d=>d.id===p.dungeon),i=d?.loot.find(i=>i.id===p.item);if(i){i.bosses=[];i.mapping='unknown';i.dropUnverified=true;i.from=p.reason;i.fromEn=p.reasonEn;}}
for(const d of data.dungeons){
 d.aliases=[...new Set([...d.aliases,d.name,d.nameEn])];d.coverage=d.quests.length||d.loot.length?'partial':'unavailable';
 for(const q of d.quests){q.faction=q.faction||'unknown';q.rewards=q.rewards||[];q.steps=q.steps||[];q.followups=q.followups||[];}
 for(const i of d.loot){if(!['site','classic'].includes(i.basis)){i.originalBasis=i.basis;i.basis='unspecified';}i.sourceDate=i.sourceDate||'2026-09-30';}
 d.counts={quests:d.quests.length,classicQuests:d.quests.filter(q=>q.basis==='classic').length,bosses:d.bosses.length,items:d.loot.length,knownLevels:d.quests.filter(q=>q.minLevel).length,knownGates:d.quests.filter(q=>q.gatesKnown).length,observedItems:d.loot.filter(i=>i.basis==='site').length,classicItems:d.loot.filter(i=>i.basis==='classic').length,unassignedItems:d.loot.filter(i=>!i.bosses.length).length};
}
validate(data);
const output=path.join(root,'addon/WoWAI/DungeonData.lua');fs.writeFileSync(output,'-- Generated offline from knowledge/dungeons. See docs/DUNGEON_KNOWLEDGE.md.\nWoWAIDungeonData = '+serialize(data)+'\n');
fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify(data,null,2)+'\n');
const report={version:data.version,policy:'Partial reference only. Observed item stats do not prove boss drops. Classic references are labelled. Unknown eligibility stays unknown.',coverage:data.dungeons.map(d=>({id:d.id,name:d.name,coverage:d.coverage,...d.counts})),conflicts,sources,questResearch:{date:questResearch.date,reviewed:questResearch.reviewed,records:questResearch.records.length,sources:questResearch.sources},localResearch:local.documents,outputSha256:sha256(fs.readFileSync(output))};
fs.writeFileSync(path.join(root,'docs/dungeon-data-receipt.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs/dungeon-faction-audit.json'),JSON.stringify({version:data.version,quests:data.dungeons.flatMap(d=>d.quests.map(q=>({dungeon:d.id,id:q.id,name:q.name,faction:q.faction,gatesKnown:q.gatesKnown,minLevel:q.minLevel,sources:q.sources||[]})))},null,2)+'\n');
console.log(JSON.stringify({dungeons:data.dungeons.length,quests:data.dungeons.reduce((n,d)=>n+d.quests.length,0),items:data.dungeons.reduce((n,d)=>n+d.loot.length,0),conflicts:conflicts.length}));
