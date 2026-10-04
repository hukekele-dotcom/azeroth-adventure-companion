'use strict';
const fs=require('fs'),path=require('path'),{readAssignment}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
function build(){
 const offers=readAssignment(path.join(root,'addon/WoWAI/QuestOffersData.lua'),'WoWAIQuestOffersData');
 const locations=read('bridge/quest-locations.json'),guide=readAssignment(path.join(root,'addon/WoWAI/ZoneGuideData.lua'),'WoWAIZoneGuideData');
 const index=read('reference/coverage-20261003/map-index.json');
 const bgs=new Set([1459,1460,1461,2524]);
 const maps=index.filter(r=>r.ids.length===1&&!bgs.has(r.ids[0])).map(r=>{
  const id=r.ids[0],q=Object.values(offers.quests).filter(q=>q.start.some(p=>p[0]===id));
  const count=phase=>Object.values(locations.quests).filter(q=>(q[phase]||[]).some(p=>p[0]===id&&p[3]<=4)).length;
  return {id,slug:r.slug,source:r.url,pickups:q.length,unverifiedPickupGates:q.filter(q=>q.gatesUnverified).length,objectives:count('objective'),turnins:count('turnin'),prerequisiteRecords:q.filter(q=>q.pre||q.preAll||q.parent).length,indexedQuests:(guide.maps[id]||[]).length,status:guide.maps[id]?'partial-local-facts':'missing-actionable-facts'};
 });
 const atlas=readAssignment(path.join(root,'addon/WoWAI/DungeonAtlas.lua'),'WoWAIDungeonAtlas');
 const raw={ 'blackrock-depths':['CL_BlackrockDepths'], 'dire-maul':['CL_DireMaulEast','CL_DireMaulNorth','CL_DireMaulWest'], 'blackrock-spire':['CL_BlackrockSpireLower','CL_BlackrockSpireUpper'],maraudon:['CL_Maraudon'],scholomance:['CL_Scholomance'],stratholme:['CL_Stratholme'],'sunken-temple':['CL_TheSunkenTemple'],zulfarrak:['CL_ZulFarrak']};
 const dungeons=read('knowledge/dungeons/catalog.json').dungeons.map(d=>{
  const pages=atlas[d.id]?(atlas[d.id].pages||[atlas[d.id]]):[],sources=raw[d.id]||[];
  for(const name of sources)if(!fs.existsSync(path.join(root,'reference/coverage-20261003',name+'.blp')))throw Error('Missing source '+name);
  return {id:d.id,name:d.name,pages:pages.length,bosses:d.bosses.length,mappedBosses:new Set(pages.flatMap(p=>Object.values(p.pins).flatMap(p=>Object.values(p.bossKeys)))).size,questRecords:d.quests.length,rawSources:sources.map(s=>'https://github.com/nanderson11/Atlas/blob/main/Images/Atlas_ClassicWoW/'+s+'.blp'),status:pages.length?'bundled-reference':sources.length?'source-collected-needs-refinement':'interior-layout-not-verified'};
 });
 const arrays=read('reference/coverage-20261003/quest-arrays.json'),en=arrays.find(a=>a.lang==='en').arrays[0];
 const result={checked:'2026-10-03',scope:'Known public outdoor/city map directory and the 28-dungeon local catalog; excludes battlegrounds, raids and unverified instances. Coverage is not completeness.',sources:['https://github.com/wheelbarrel00/EverythingQuests','https://warcraftforever.games/maps','https://warcraftforever.games/quests','https://github.com/nanderson11/Atlas'],pickupCatalog:Object.keys(offers.quests).length,coordinateCatalog:Object.keys(locations.quests).length,coordinateVersion:locations.version,workflowIndexes:Object.keys(guide.maps).length,publicQuestIndex:en.length,maps,dungeons,caveats:['A map index is generated from known local facts, not a fully authored or in-game verified walkthrough.','Classic data may differ in Forever. New quest restrictions, Chinese names and objective/turn-in points are incomplete.','Zephras pickup gates remain unverified upstream; these facts are retained but do not become recommended pickups. Already accepted quests can still use known objectives.','World map images do not prove quest positions. No positions fabricated for Riverglades, Mount Hyjal or Shendralas.','Classic refined map pins identify rooms/areas, not measured Forever spawn positions.'],additionalMapSources:[{slug:'half-pint-tavern',status:'public-layout-collected-no-verified-dungeon-catalog-entry',source:'https://warcraftforever.games/maps/half-pint-tavern'}]};
 fs.writeFileSync(path.join(root,'knowledge/world-coverage.json'),JSON.stringify(result,null,2)+'\n');
 const lines=['# 地图与任务资料覆盖清单','',`核对日期：${result.checked}。任务接取条目 ${result.pickupCatalog}；含目标或交付坐标的任务 ${result.coordinateCatalog}；本地流程索引 ${result.workflowIndexes} 张地图（含奥特兰克山谷历史条目）。`,'','索引和任务条目数量不代表完整攻略。当前已知资料按角色任务、阵营、等级和前置条件筛选；无法确认的接取条件不用于推荐。','', '## 野外与城市地图','', '| 地图 | 接取条目 | 目标坐标任务 | 交付坐标任务 | 含前置条件 | 待核接取条件 |','|---|---:|---:|---:|---:|---:|'];
 for(const m of maps)lines.push(`| ${m.slug} (${m.id}) | ${m.pickups} | ${m.objectives} | ${m.turnins} | ${m.prerequisiteRecords} | ${m.unverifiedPickupGates} |`);
 lines.push('','缺少可执行任务资料：'+maps.filter(m=>!m.indexedQuests).map(m=>m.slug).join('、')+'。','', '## 副本地图','', '| 副本 | 已接入页数 | 首领位置 / 库内首领 | 任务条目 | 状态 |','|---|---:|---:|---:|---|');
 const status={'bundled-reference':'已接入参考图，待游戏实测','source-collected-needs-refinement':'原始参考图已收集，待加工、校准','interior-layout-not-verified':'尚无核实的内部底图'};
 for(const d of dungeons)lines.push(`| ${d.name} | ${d.pages} | ${d.mappedBosses}/${d.bosses} | ${d.questRecords} | ${status[d.status]} |`);
 lines.push('','地图中库内首领未显示的例外见 dungeon-maps/boss-positions.json；例如诺莫瑞根的尖端机器人在副本外。半品脱酒馆另有公开地图条目，但尚未核实与可进入副本的对应关系。','', '## 本次资料来源','',...result.sources.map(url=>'- '+url),'','EverythingQuests 当前版本明确指出：泽菲拉斯岛部分任务仅适用于 Skyborne，现有种族字段尚不能表达；部分任务最低等级也未确认。相关条目保留研究用途，停止自动推荐。','', '公开任务索引核对了 1,537 条；其中新增条目的中文名称仍不完整。没有仅依据网页地图图像生成任务坐标。','');
 fs.writeFileSync(path.join(root,'docs/WORLD_COVERAGE.md'),lines.join('\n'));
 console.log(JSON.stringify({maps:maps.length,mapsWithFacts:maps.filter(m=>m.indexedQuests).length,missing:maps.filter(m=>!m.indexedQuests).map(m=>m.slug),bundled:dungeons.filter(d=>d.pages).length,pages:dungeons.reduce((n,d)=>n+d.pages,0),rawOnly:dungeons.filter(d=>d.status==='source-collected-needs-refinement').length}));
 return result;
}
module.exports={build};if(require.main===module)build();
