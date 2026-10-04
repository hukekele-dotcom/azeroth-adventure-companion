'use strict';
// Offline import of archived public facts. Never executes downloaded scripts or Lua.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {sha256}=require('./dungeon-knowledge');
const dir=path.resolve(process.argv[2]||'reference/dungeons/2026-10-03-quests');
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'),(k,v)=>v==='$undefined'?undefined:v);
const zh=read('wowf.json'),en=read('wowf-en.json'),fc=read('foreverchanges.json').records.filter(r=>r.lang==='en'),wft=read('wft-quests.json');
const idMap={'the-deadmines':'deadmines','the-stockade':'stockade','city-of-dalaran':'dalaran','scarlet-monastery-graveyard':'scarlet-monastery','excavation-site-wetlands':'excavation-site'};
const normalize=id=>idMap[id]||id;
function places(rows){return (rows||[]).map(p=>[p.name,p.zone,p.place,p.at&&`${p.at.x}, ${p.at.y}`].filter(Boolean).join(' · ')).join('\n');}
function nodes(rows){return (rows||[]).map(p=>({name:p.name,kind:p.kind,zone:p.zone,place:p.place,...(p.at&&{x:p.at.x,y:p.at.y})}));}
function step(z,e,side){return {name:z.name,nameEn:e?.name||z.name,optional:z.optional===true,faction:z.faction||side,from:places(z.from),fromEn:places(e?.from),instructions:z.objective||'',instructionsEn:e?.objective||''};}
const names={92456:'绿色样本',92489:'强大力量',96987:'求学良机',96988:'力量之源',96986:'墓穴骑士',98815:'高地兽皮',95697:'口味变化',95682:'深入龙喉',95663:'龙喉传闻',95664:'长者的知识',98823:'大地回响',95795:'沼泽中的逝者',95647:'灌木丛中的失踪者',95809:'编织的心',95646:'高地恐魔',98824:'史前棱镜',95810:'失落的圣物',95737:'寻找凯特林',95772:'寻找桑布雷德'};
const tasks={
 92456:['进入达拉然城，在中央花园寻找邪能花朵，带回暴风城交给莎拉米尔。','Find the fel blossom in Dalaran’s central garden and take it to Shylamiir in Stormwind.'],
 92489:['在达拉然城击败法力元素，向暴风城的高阶巫师安多玛斯复命。','Defeat the Mana Elemental in Dalaran, then report to High Sorcerer Andromath in Stormwind.'],
 96987:['在达拉然城寻找《达拉然的建立》，交给下水道入口附近的 Rexxie Copperclutch。','Find The Founding of Dalaran and deliver it to Rexxie Copperclutch near the sewer entrance.'],
 96988:['在达拉然城收集 6 个开裂的哨兵核心，回幽暗城交给马丁·费尔本。','Collect six Cracked Sentry Cores in Dalaran and deliver them to Doctor Martin Felben in Undercity.'],
 96986:['击败达拉然城内的墓穴骑士阿特雷克斯，返回塔伦米尔向梅里萨拉复命。','Defeat Atrexis in Dalaran and report to Melisara in Tarren Mill.'],
 98815:['收集 4 张灌木丛迅猛龙皮，交给米奈希尔港的制皮匠詹姆斯·哈洛兰。','Gather four Thicket Raptor Hides for James Halloran in Menethil Harbor.'],
 95697:['进入湿地挖掘场，收集 4 块灌木丛迅猛龙肉，再向奥格瑞玛的博斯坦交付。','Gather four Thicket Raptor Meat in the Excavation Site for Borstan in Orgrimmar.'],
 95682:['在挖掘场击败 2 名 Dragonmaw Saboteur、4 名 Dragonmaw Warder，取得 Dragonmaw Dispatch，交给副本外的亡灵哨兵密探。','Defeat two Dragonmaw Saboteurs and four Dragonmaw Warders, recover the dispatch, and return to the Deathstalker Agent outside.'],
 95663:['前往湿地龙喉营地上方的山坡，与亡灵哨兵密探会合。','Meet the Deathstalker Agent in the hills above the Dragonmaw camp in Wetlands.'],
 95664:['从末王遗迹守卫者取得泰坦圣物触发任务，带去雷霆崖长者高地询问用途。','Start the quest from the Relic Guardian’s Titan Relic, then take it to Elder Rise in Thunder Bluff.'],
 98823:['完成“长者的知识”后，把泰坦圣物送到莫高雷西北部观星台的穆恩·大地之怒处。','After Elder Knowledge, bring the Titan Relic to Muln Earthfury at Skywatcher Plateau in northwest Mulgore.'],
 95795:['在挖掘场找到戴温的遗体并接取后续，回赤脊山湖畔镇告知多林·桑布雷德。','Take the quest at Daewyn’s body in the dungeon and report to Dorin Songblade in Lakeshire.'],
 95647:['在挖掘场寻找 Ardin Grassman，查明他的遭遇。后续需把芦苇编织的心带回米奈希尔港。','Find Ardin Grassman and learn his fate. The follow-up returns the Reed-woven Heart to Menethil Harbor.'],
 95809:['使用芦苇编织的心触发后续，返回米奈希尔港交给凯特林·格拉斯曼。','Start the follow-up from the Reed-woven Heart and return it to Caitlin Grassman in Menethil Harbor.'],
 95646:['击败挖掘场内的高地恐魔，拾取根核，交给湿地绿带草地的绿色守卫者雷希耶尔。','Defeat Highland Horror, collect its root core, and return to Rethiel the Greenwarden in Wetlands.'],
 98824:['完成“失落的圣物”后，把泰坦圣物交给铁炉堡探险者大厅的高级探险家麦哲拉斯。','After Lost Relic Carry, take the Titan Relic to High Explorer Magellas in Ironforge’s Hall of Explorers.'],
 95810:['拾取末王遗迹守卫者掉落的泰坦圣物以触发任务，交给湿地维尔加挖掘场的勘察员维尔加。','Start the quest from the Relic Guardian’s Titan Relic and deliver it to Prospector Whelgar in Wetlands.'],
 95737:['前往米奈希尔港，与凯特林·格拉斯曼交谈。这是资料页列出的可选引导任务。','Speak with Caitlin Grassman in Menethil Harbor. The reference lists this as an optional lead-in.'],
 95772:['从湖畔镇的多林·桑布雷德处出发，到维尔加挖掘场寻找他的兄弟戴温。','Travel from Dorin Songblade in Lakeshire to Whelgar’s Excavation Site and look for his brother Daewyn.']
};
const records=[];
for(const d of zh){const ed=en.find(x=>x.id===d.id);assert(ed);for(const q of d.quests){const e=ed.quests.find(x=>x.id===q.id);assert(e);const fill={},details={};
 if(q.to?.length){details.turnIn=places(q.to);details.turnInEn=places(e.to);details.turnInLocations=nodes(q.to);}
 if(q.from?.length){details.pickupDetails=places(q.from);details.pickupDetailsEn=places(e.from);details.pickupLocations=nodes(q.from);}
 if(q.chain?.length)fill.steps=q.chain.map((z,i)=>step(z,e.chain[i],q.faction||'unknown'));
 if(q.next?.length)fill.followups=q.next.map((z,i)=>step(z,e.next[i],q.faction||'unknown'));
 records.push({dungeon:d.id,id:q.id,fill,details,sources:[d.url,ed.url]});
}}
for(const w of wft){
 const dungeon=normalize(w.dungeon),z=zh.find(d=>d.id===dungeon)?.quests.find(q=>q.id===w.id),e=en.find(d=>d.id===dungeon)?.quests.find(q=>q.id===w.id);
 const f=fc.find(d=>normalize(d.id)===dungeon),q=f?.quests.find(q=>q.id===w.id);
 let r=records.find(r=>r.id===w.id&&r.dungeon===dungeon);if(!r){r={dungeon,id:w.id,fill:{},details:{},sources:[]};records.push(r);}
 const side=/ · Alliance ·/.test(w.header)?'alliance':/ · Horde ·/.test(w.header)?'horde':q?.side==='a'?'alliance':q?.side==='h'?'horde':z?.faction||'unknown';
 const title=e?.name||q?.title||w.url.split('/').filter(Boolean).pop().replace(/-\d+$/,'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 const [instructions,instructionsEn]=tasks[w.id];assert(Number.isInteger(w.minLevel)&&w.minLevel>0);assert(instructions);
 r.quest={name:names[w.id],nameEn:title,faction:side,minLevel:w.minLevel,gatesKnown:false,basis:'site',conditionsSource:w.url,nameTranslation:'editorial',instructions,instructionsEn,from:places(z?.from)||'接取地点待核实',fromEn:places(e?.from)||'Pickup location unverified',steps:r.fill.steps||[],followups:r.fill.followups||[],rewards:[],prerequisites:'',researchNote:'无限测试版资料；中文任务名为暂译，部分接取条件仍待核实。',researchNoteEn:'Forever beta reference; Chinese quest titles are provisional translations. Some eligibility conditions remain unverified.'};
 const rewards=z?.rewards||[];r.quest.rewards=rewards.map(i=>({id:i.id,name:i.name,nameEn:e?.rewards.find(x=>x.id===i.id)?.name||i.name,icon:i.icon&&'Interface\\Icons\\'+i.icon,quality:i.quality,ilvl:i.itemLevel,level:i.requiredLevel,slot:i.slot,type:i.type,stats:i.stats||[],effects:i.effects||[],effectsEn:e?.rewards.find(x=>x.id===i.id)?.effects||[],armor:i.armor,basis:'site',uncertain:!!i.uncertain}));
 if([95795,95810,95664,95809].includes(w.id))r.quest.inside=true;
 if([95810,95664,95809].includes(w.id))r.quest.itemStart=true;
 if([95663,95737,98823,98824].includes(w.id))r.quest.outside=true;
 const pre={95682:95663,98823:95664,98824:95810,95809:95647}[w.id];if(pre)r.quest.pre=[pre];
 r.sources.push(w.url);if(q)r.sources.push(f.url);
 if(w.id===95697){r.quest.from='博斯坦 · 奥格瑞玛';r.quest.fromEn='Borstan · Orgrimmar';}
 if(w.id===95795){r.quest.from='挖掘场内 · 戴温的遗体';r.quest.fromEn='Daewyn’s body · inside the Excavation Site';}
 if(w.id===95682){r.quest.from='亡灵哨兵密探 · 湿地龙喉营地上方山坡（副本外）';r.quest.fromEn='Deathstalker Agent · hills above the Dragonmaw camp, outside the dungeon';r.quest.prerequisites='龙喉传闻 → 深入龙喉';r.quest.prerequisitesEn='Dragonmaw Rumors → Open the Maw';}
 if(w.id===95664){r.quest.followups=[{id:98823,name:names[98823],nameEn:'Earthen Echo',faction:'horde',from:'莫高雷西北部 · 观星台',fromEn:'Skywatcher Plateau · northwest Mulgore',instructions:tasks[98823][0],instructionsEn:tasks[98823][1]}];}
 if([95810,95664,98823,98824].includes(w.id)){r.quest.researchNote+=' 2026-10-02 社区报告圣物交付后可能无法继续后续；当前是否修复待实测。';r.quest.researchNoteEn+=' A community report dated 2026-10-02 describes a relic hand-in issue blocking the follow-up; current fix status is unverified.';r.sources.push('https://foreverchanges.pro/dungeons/excavation-site');}
 // Never turn an absent faction into "both" or an NPC identity into proof of faction.
 r.sources=[...new Set(r.sources)];
}
const reviewed=fc.map(r=>({dungeon:normalize(r.id),url:r.url,sha256:r.sha256,questIds:r.quests.map(q=>q.id)}));
const supplement={date:'2026-10-03',policy:'Partial references, not a completeness claim. Quest level is not acceptance level. Explicit faction only; unknown stays hidden unless active. Existing editorial corrections win.',sources:['foreverchanges.json','wowf.json','wowf-en.json','wft-quests.json'].map(f=>({file:f,sha256:sha256(fs.readFileSync(path.join(dir,f)))})),reviewed,records};
fs.writeFileSync(path.resolve(__dirname,'../knowledge/dungeons/quest-research.json'),JSON.stringify(supplement,null,2)+'\n');
console.log(JSON.stringify({reviewed:reviewed.length,records:records.length,newQuests:wft.length,locations:records.filter(r=>r.details.pickupDetails||r.details.turnIn).length}));
