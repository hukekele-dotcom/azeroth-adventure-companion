'use strict';
// A local phase graph for every catalogued outdoor map. No generated prose or model calls.
const fs=require('fs'),path=require('path'),{readAssignment,serialize}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..');
const offers=readAssignment(path.join(root,'addon/WoWAI/QuestOffersData.lua'),'WoWAIQuestOffersData');
const locations=require('../bridge/quest-locations.json').quests,maps={};
for(const [id,q]of Object.entries(offers.quests)){
 if(q.category%2===1)continue;
 for(const p of [...q.start,...(locations[id]?.objective||[]),...(locations[id]?.turnin||[])]){
  if(p[3]>4)continue;(maps[p[0]]??=new Set()).add(+id);
 }
}
const flows=JSON.parse(fs.readFileSync(path.join(root,'knowledge/zone-flows/flows.json'),'utf8'));
const data={version:2,maps:Object.fromEntries(Object.entries(maps).map(([id,qs])=>[id,[...qs].sort((a,b)=>a-b)])),routes:flows.routes,actors:flows.actors,turnins:flows.turnins};
fs.writeFileSync(path.join(root,'addon/WoWAI/ZoneGuideData.lua'),'-- Generated map membership. Phase facts and prerequisite links stay in the shared local catalogs.\nWoWAIZoneGuideData='+serialize(data)+'\n');
fs.writeFileSync(path.join(root,'docs/zone-guide-coverage.json'),JSON.stringify({maps:Object.entries(data.maps).map(([id,quests])=>({id:+id,quests:quests.length,authoredChapters:flows.routes.filter(r=>r.steps.some(s=>s.map===+id)).length})),mapCount:Object.keys(maps).length,method:'Public Forever authored quest phases where available; local reference graph elsewhere; actual progress and prerequisites govern navigation',authoredSource:flows.source,authoredRevision:flows.revision,authoredChapters:flows.routes.length},null,2)+'\n');
console.log('Local map guides:',Object.keys(maps).length);
