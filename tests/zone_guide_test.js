'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const Planner=require('../bridge/planner');
function vm(){
 const state=lauxlib.luaL_newstate();lualib.luaL_openlibs(state);
 function run(src,arg){if(lauxlib.luaL_loadstring(state,to_luastring(src))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(state,-1)));if(arg)lua.lua_pushstring(state,to_luastring(arg));if(lua.lua_pcall(state,arg?1:0,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(state,-1)));}
 function get(e){run('RESULT=tostring('+e+')');lua.lua_getglobal(state,to_luastring('RESULT'));const value=to_jsstring(lua.lua_tostring(state,-1));lua.lua_pop(state,1);return value;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));
 run(`STUB.locale='zhCN';STUB.level=16;QUESTS={};COMPLETED={}
 function UnitGUID()return 'Player-123' end
 function UnitRace()return 'Tauren','Tauren',6 end
 function UnitClass()return 'Paladin','PALADIN',2 end
 function UnitFactionGroup()return 'Horde' end
 C_Map.GetBestMapForUnit=function()return 1413 end
 C_QuestLog={GetNumQuestLogEntries=function()return #QUESTS,#QUESTS end,GetInfo=function(i)return QUESTS[i]end,IsComplete=function(id)return STUB.complete==true end,GetQuestObjectives=function()return {{text='击杀目标 0/1',type='monster',finished=false}} end,IsQuestFlaggedCompleted=function(id)return COMPLETED[id]==true end}
 WoWAIAdventurePage=CreateFrame('Frame',nil,UIParent)
 WoWAIMap={SetZoneGuide=function(route)STUB.zoneRoute=route;STUB.hasZone=#route>0 end,ClearZoneGuide=function()STUB.zoneRoute=nil;STUB.hasZone=false end,HasZoneGuide=function()return STUB.hasZone==true end,StopAdventure=function()end,SetAdventureRoute=function(route)STUB.route=route end,SetQuestPickup=function(point,title,detail)STUB.pickup={point=point,title=title,detail=detail}end,ClearQuestPickup=function()STUB.pickup=nil end}
 WoWAI={Send=function()error('Guide must not call AI')end,AdventureCanSend=function()return true end}
 `);
 for(const f of ['Locale.lua','QuestLocations.lua','Adventure.lua','QuestOffersData.lua','QuestOffers.lua','ZoneGuideData.lua','ZoneGuide.lua','AdventureUI.lua'])run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI',f),'utf8'),'WoWAI');
 run(`WoWAIAdventure.Event('ADDON_LOADED','WoWAI');WoWAIAdventure.Event('PLAYER_ENTERING_WORLD',true,false);CHAR=select(2,WoWAIAdventure.Context());WoWAIAdventure.Plan();S=WoWAIQuestOffers.State();Q={min=10,level=16,races=178,classes=0,flags=0,category=0}`);
 return {run,get};
}
function fixture(v){v.run(`
 WoWAIZoneGuideData={maps={[1413]={900001,900002,900003,900004}}};
 WoWAIQuestOffersData={people={['1:7']={enUS='Giver',zhCN='接取者'}},maps={[1413]={900001,900002,900003,900004}},quests={}};
 for _,id in ipairs({900001,900002,900003,900004})do
  WoWAIQuestOffersData.quests[id]={name={enUS='Quest '..id,zhCN='任务 '..id},min=10,level=16,races=178,classes=0,category=0,flags=0,start={{1413,50,30,1,7}}};
  WoWAIQuestLocations[id]={objective={{1413,60,40,1,1}},turnin={{1413,50,30,1,0}}}
 end
 WoWAIQuestOffersData.quests[900002].pre={900001};WoWAIQuestOffersData.quests[900003].races=77;
 WoWAIQuestOffersData.quests[900004].category=1;WoWAIZoneGuide.Invalidate();
 `);}
test('local map workflow previews prerequisites in order but only actual available steps can navigate',()=>{
 const v=vm();fixture(v);v.run('P=WoWAIZoneGuide.Preview(1413)');
 assert.equal(v.get('#P.steps'),'6');assert.equal(v.get('#P.ready'),'1');assert.equal(v.get('P.ready[1].id'),'900001');
 assert.equal(v.get('P.steps[4].id'),'900002');assert.equal(v.get('P.steps[4].ready'),'false');
 for(const [i,phase] of [[1,'accept'],[2,'quest'],[3,'turnin'],[4,'accept'],[5,'quest'],[6,'turnin']])assert.equal(v.get(`P.steps[${i}].kind`),phase);
 v.run('WoWAIZoneGuide.Start(1413)');assert.equal(v.get('#STUB.zoneRoute'),'1');assert.match(v.get('STUB.zoneRoute[1].detail'),/接取者/);
});
test('accept, objective completion and turn-in advance locally and unlock the next chain without AI',()=>{
 const v=vm();fixture(v);v.run('WoWAIZoneGuide.Start(1413);QUESTS={{questID=900001,title="第一项",level=16}};WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');
 assert.equal(v.get('WoWAIZoneGuide.Preview(1413).ready[1].kind'),'quest');assert.match(v.get('STUB.zoneRoute[1].detail'),/击杀目标/);
 v.run('STUB.complete=true;WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');assert.equal(v.get('WoWAIZoneGuide.Preview(1413).ready[1].kind'),'turnin');
 v.run('QUESTS={};COMPLETED[900001]=true;WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');assert.equal(v.get('WoWAIZoneGuide.Preview(1413).ready[1].id'),'900002');
 assert.doesNotMatch(v.get('STUB.zoneRoute[1].detail'),/900001.*交付/);
});
test('skipping is local to a map and does not complete its quest or unlock dependencies',()=>{
 const v=vm();fixture(v);v.run('WoWAIZoneGuide.Start(1413);WoWAIZoneGuide.Skip()');
 assert.equal(v.get('#WoWAIZoneGuide.Preview(1413).ready'),'0');assert.equal(v.get('COMPLETED[900001]'),'nil');
 assert.equal(v.get('CHAR.zoneGuide.skipped["900001:accept"]'),'true');
 v.run('WoWAIZoneGuide.Stop();WoWAIZoneGuide.Start(1413)');assert.equal(v.get('#STUB.zoneRoute'),'1');
});
test('map boundaries, dungeon and opposite faction tasks never become actionable',()=>{
 const v=vm();fixture(v);v.run('WoWAIQuestLocations[900001].objective={{1442,60,40,1,1}};WoWAIZoneGuide.Invalidate();P=WoWAIZoneGuide.Preview(1413)');
 assert.equal(v.get('#P.steps'),'0');assert.equal(v.get('#P.ready'),'0');
 v.run('C_QuestLog.IsQuestFlaggedCompleted=nil;GetQuestsCompleted=nil;WoWAIZoneGuide.Invalidate();P=WoWAIZoneGuide.Preview(1413)');assert.equal(v.get('P.complete'),'false');
});
test('guide is retained outside its selected map and resumes there; stopping leaves auto preference unchanged',()=>{
 const v=vm();fixture(v);v.run('CHAR.autoPlan=true;WoWAIZoneGuide.Start(1413);C_Map.GetBestMapForUnit=function()return 1442 end;WoWAIZoneGuide.Tick()');
 assert.equal(v.get('CHAR.zoneGuide.map'),'1413');assert.equal(v.get('STUB.hasZone'),'false');
 v.run('C_Map.GetBestMapForUnit=function()return 1413 end;WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');assert.equal(v.get('STUB.hasZone'),'true');
 v.run('WoWAIAdventure.SendPlan(true)');assert.equal(v.get('WoWAIAdventure.PlanPhase()'),'idle');
 v.run('WoWAIZoneGuide.Stop()');assert.equal(v.get('CHAR.autoPlan'),'true');assert.equal(v.get('CHAR.zoneGuide'),'nil');
});
test('map guide selector shows local steps and use/stop controls in all three languages',()=>{
 const v=vm();fixture(v);
 for(const [lang,label] of [['zhCN','使用此攻略'],['zhTW','使用此攻略'],['enUS','Use this guide']]){
  v.run(`WoWAIDB={settings={language='${lang}'}};WoWAIAdventureUI.group='mapguide';WoWAIAdventureUI.guideMap=1413;WoWAIAdventure.Show('tasks');WoWAIAdventureUI.Render()`);
  assert.equal(v.get('WoWAIAdventureUI.tasks.nav:GetText()'),label);assert.equal(v.get('WoWAIAdventureUI.tasks.nav:IsEnabled()'),'true');assert.equal(v.get('WoWAIAdventureUI.tasks.ai:IsShown()'),'false');
 }
 v.run('WoWAIAdventureUI.tasks.nav.scripts.OnClick();WoWAIAdventureUI.Render()');assert.equal(v.get('WoWAIAdventureUI.tasks.nav:GetText()'),'Stop guide');
});
test('catalog provides a local map workflow index for every pickup map',()=>{
 const v=vm();v.run('for id in pairs(WoWAIQuestOffersData.maps)do assert(WoWAIZoneGuideData.maps[id],id)end');assert.equal(v.get('#WoWAIZoneGuide.Maps()'),'48');
 v.run('P=WoWAIZoneGuide.Preview(1413)');assert.ok(Number(v.get('#P.steps'))>0);
});
test('current destination stays stable while moving; explicit AI planning exits local mode',()=>{
 const v=vm();fixture(v);v.run('WoWAIQuestOffersData.quests[900002].pre=nil;WoWAIQuestOffersData.quests[900002].start={{1413,95,95,1,7}};WoWAIZoneGuide.Start(1413);KEY=CHAR.zoneGuide.key;STUB.posX=.96;STUB.posY=.96;WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');
 assert.equal(v.get('CHAR.zoneGuide.key'),v.get('KEY'));
 v.run('WoWAIAdventure.SendPlan(false,true)');assert.equal(v.get('CHAR.zoneGuide'),'nil');
});

function authored(v){fixture(v);v.run(`
 WoWAIQuestOffersData.quests[900002].pre=nil;
 WoWAIQuestOffersData.quests[900001].start={{1413,90,90,1,7}};
 R={id='authored',min=12,max=17,conditions={{'Horde'}},steps={}};
 for _,kind in ipairs({'accept','quest','turnin'})do for _,id in ipairs({900001,900002})do
  R.steps[#R.steps+1]={id=id,kind=kind,objective=kind=='quest' and 1 or 0,map=1413,order=#R.steps+1,conditions={},guards={},actors={'Giver'}}
 end end
 WoWAIZoneGuideData.routes={R};WoWAIZoneGuide.Invalidate();
 `);}

test('authored regional flow batches pickups before objectives and returns, without nearest-neighbor reshuffling',()=>{
 const v=vm();authored(v);v.run('P=WoWAIZoneGuide.Preview(1413)');
 assert.equal(v.get('P.flow.id'),'authored');assert.equal(v.get('#P.steps'),'6');assert.equal(v.get('#P.ready'),'2');
 assert.equal(v.get('P.steps[1].id'),'900001','farther first stop is deliberate');
 assert.equal(v.get('P.steps[2].kind'),'accept');assert.equal(v.get('P.steps[3].kind'),'quest');assert.equal(v.get('P.steps[5].kind'),'turnin');
 v.run('WoWAIZoneGuide.Start(1413);STUB.posX=.5;STUB.posY=.3;WoWAIZoneGuide.Invalidate();WoWAIZoneGuide.Tick()');
 assert.equal(v.get('CHAR.zoneGuide.route'),'authored');assert.match(v.get('CHAR.zoneGuide.key'),/^900001:accept/);
});

test('authored objective steps advance separately and cannot turn in an unfinished quest',()=>{
 const v=vm();authored(v);v.run(`
 S.active[900001]=true;R.steps={{id=900001,kind='quest',objective=1,map=1413},{id=900001,kind='quest',objective=2,map=1413},{id=900001,kind='turnin',objective=0,map=1413}};
 LIVE={{id=900001,title='Two targets',complete=false,objectives={{text='first done',type='monster',done=true},{text='second pending',type='monster',done=false}},locations={{m=1413,x=60,y=40,objectiveIndices={2}}}}};
 P=WoWAIZoneGuide.Build(1413,S,LIVE,{},'authored');
 `);
 assert.equal(v.get('#P.ready'),'1');assert.equal(v.get('P.ready[1].objective'),'2');assert.equal(v.get('P.ready[1].kind'),'quest');
 v.run('LIVE[1].complete=true;P=WoWAIZoneGuide.Build(1413,S,LIVE,{},"authored")');assert.equal(v.get('P.ready[1].kind'),'turnin');
 v.run('COMPLETED[900001]=true;S=WoWAIQuestOffers.State();P=WoWAIZoneGuide.Build(1413,S,LIVE,{},"authored")');assert.equal(v.get('#P.steps'),'0');
});

test('regional branch filters, unknown identity, external maps and skipped prerequisites fail closed',()=>{
 const v=vm();authored(v);
 assert.equal(v.get("WoWAIZoneGuide.Matches({{'Tauren','!Mage'},{'Undead','Mage'}},S)"),'true');
 v.run('S.classToken=nil');assert.equal(v.get("WoWAIZoneGuide.Matches({{'!Mage'}},S)"),'false');
 v.run('S=WoWAIQuestOffers.State();R.steps[1].conditions={{{"Alliance"}}};R.steps[2].map=1442;P=WoWAIZoneGuide.Build(1413,S,{}, {},"authored")');assert.equal(v.get('#P.ready'),'0');
 v.run('R.steps[1].conditions={};R.steps[2].map=1413;WoWAIQuestOffersData.quests[900002].pre={900001};WoWAIZoneGuide.Start(1413);WoWAIZoneGuide.Skip()');
 assert.equal(v.get('#WoWAIZoneGuide.Preview(1413).ready'),'0');assert.equal(v.get('COMPLETED[900001]'),'nil');
});

test('chapter preview selection does not silently replace the active route',()=>{
 const v=vm();authored(v);v.run(`
 R2={id='second',min=17,max=22,conditions={{'Horde'}},steps=R.steps};WoWAIZoneGuideData.routes[2]=R2;
 WoWAIAdventureUI.group='mapguide';WoWAIAdventureUI.guideMap=1413;WoWAIAdventure.Show('tasks');WoWAIAdventureUI.Render();
 WoWAIAdventureUI.tasks.nav.scripts.OnClick();WoWAIAdventureUI.tasks.flowNext.scripts.OnClick();
 `);
 assert.equal(v.get('CHAR.zoneGuide.route'),'authored');assert.equal(v.get('WoWAIAdventureUI.guideRoute'),'second');
 assert.equal(v.get('WoWAIAdventureUI.tasks.nav:GetText()'),'使用此攻略');assert.equal(v.get('WoWAIAdventureUI.tasks.next:IsShown()'),'false');
 v.run('WoWAIAdventureUI.tasks.nav.scripts.OnClick()');assert.equal(v.get('CHAR.zoneGuide.route'),'second');
});

test('an authored chapter can retain a trivial prerequisite while normal pickup recommendations stay filtered',()=>{
 const v=vm();authored(v);v.run('WoWAIQuestOffersData.quests[900001].level=1;WoWAIQuestOffersData.quests[900001].min=1;WoWAIQuestOffersData.quests[900002].pre={900001};P=WoWAIZoneGuide.Preview(1413)');
 assert.equal(v.get('P.ready[1].id'),'900001');assert.equal(v.get('WoWAIQuestOffers.Eligible(900001,WoWAIQuestOffersData.quests[900001],S)'),'false');
});

test('turn-in instructions use the NPC at the resolved coordinate rather than an unrelated source actor',()=>{
 const v=vm();authored(v);v.run(`
 WoWAIZoneGuideData.turnins={[900001]={{map=1413,x=50,y=30,name={enUS='Actual NPC',zhCN='实际交付者'}}}};
 TXT=table.concat(WoWAIZoneGuide.StepLines({id=900001,number=1,kind='turnin',point={1413,50,30},ready=true,title='任务',actors={'Wrong NPC'}}),'\\n');
 `);
 assert.match(v.get('TXT'),/实际交付者/);assert.doesNotMatch(v.get('TXT'),/Wrong NPC/);
});

test('simulated earlier progress cannot satisfy a guard for live navigation',()=>{
 const v=vm();authored(v);v.run(`
 S.active[900002]=true;
 R.steps={R.steps[1],R.steps[3],R.steps[5],R.steps[4]};R.steps[4].guards={{kind='isQuestTurnedIn',ids={900001}}};
 LIVE={{id=900002,title='Later task',complete=false,objectives={{text='pending',type='monster',done=false}},locations={{m=1413,x=60,y=40,objectiveIndices={1}}}}};
 P=WoWAIZoneGuide.Build(1413,S,LIVE,{},'authored');
 `);
 assert.equal(v.get('#P.ready'),'1');assert.equal(v.get('P.ready[1].id'),'900001');assert.equal(v.get('P.steps[4].ready'),'false');
});

test('real Barrens and Westfall chapter text and actor dictionaries render in all languages',()=>{
 const v=vm();v.run('WoWAIDB={settings={}}');
 for(const [map,faction,race]of [[1413,'Horde','Tauren'],[1436,'Alliance','Human']])for(const lang of ['zhCN','zhTW','enUS']){
  v.run(`S=WoWAIQuestOffers.State();S.faction='${faction}';S.raceToken='${race}';S.race=${race==='Human'?1:6};S.level=16;WoWAIDB.settings.language='${lang}';P=WoWAIZoneGuide.Build(${map},S,{},{});TEXTS={};for _,step in ipairs(P.steps)do TEXTS[#TEXTS+1]=table.concat(WoWAIZoneGuide.StepLines(step),'\\n')end;assert(P.flow);assert(#TEXTS>0)`);
  assert.ok(v.get("table.concat(TEXTS,'\\n')").length>20);
 }
 v.run(`for name in pairs(WoWAIZoneGuideData.actors)do local lines=WoWAIZoneGuide.StepLines({id=1,kind='quest',objective=1,number=1,point={1413,50,30},title='Quest',ready=true,actors={name}});assert(#lines>2)end`);
});
