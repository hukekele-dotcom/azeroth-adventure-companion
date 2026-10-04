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
 WoWAIMap={StopAdventure=function()end,SetAdventureRoute=function(route)STUB.route=route end,SetQuestPickup=function(point,title,detail)STUB.pickup={point=point,title=title,detail=detail}end,ClearQuestPickup=function()STUB.pickup=nil end}
 WoWAI={Send=function()error('Guide must not call AI')end,AdventureCanSend=function()return true end}
 `);
 for(const f of ['Locale.lua','QuestLocations.lua','Adventure.lua','QuestOffersData.lua','QuestOffers.lua','AdventureUI.lua'])run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI',f),'utf8'),'WoWAI');
 run(`WoWAIAdventure.Event('ADDON_LOADED','WoWAI');WoWAIAdventure.Event('PLAYER_ENTERING_WORLD',true,false);CHAR=select(2,WoWAIAdventure.Context());WoWAIAdventure.Plan();S=WoWAIQuestOffers.State();Q={min=10,level=16,races=178,classes=0,flags=0,category=0}`);
 return {run,get};
}
test('eligibility checks faction, class and minimum level; script flags are not holidays',()=>{
 const v=vm();assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 for(const mutation of ['Q.races=77','Q.classes=128','Q.min=17','Q.category=1','Q.holiday=true','Q.flags=1','Q.gatesUnverified=true']){
  v.run(`BAD={};for k,x in pairs(Q)do BAD[k]=x end;${mutation.replaceAll('Q.','BAD.')}`);assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,BAD,S)'),'false',mutation);
 }
 v.run('Q.flags=2;Q.category=4');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 v.run('S.race=95;S.faction="Horde"');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 v.run('Q.races=32');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false','race-specific quests excluded for unknown race');
});
test('prerequisites, exclusivity and parent-active gates prevent impossible pickups',()=>{
 const v=vm();v.run('Q.pre={1,2}');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('COMPLETED[2]=true;S=WoWAIQuestOffers.State()');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 v.run('Q.preAll={2,3}');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('COMPLETED[3]=true;S=WoWAIQuestOffers.State();Q.parent=4');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('S.active[4]=true');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 v.run('Q.excl={4}');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('Q.excl=nil;Q.chain=3');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
});
test('unknown history, reputation and profession requirements fail closed',()=>{
 const v=vm();v.run('S.history=false');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('S.history=true;Q.skill=1640075');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('S.skills[164]=75');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
 v.run('Q.minRep=76003000');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'false');
 v.run('S.reputation=function()return 3000 end');assert.equal(v.get('WoWAIQuestOffers.Eligible(999001,Q,S)'),'true');
});
test('actual catalog recommends Horde Barrens quests, excludes cross-zone delivery and dungeon quests',()=>{
 const v=vm();v.run('OFFERS=WoWAIQuestOffers.List();IDS={};for _,o in ipairs(OFFERS)do IDS[o.id]=true end');
 assert.equal(v.get('IDS[870]'),'true');assert.equal(v.get('IDS[1483]'),'nil');assert.equal(v.get('IDS[962]'),'nil');
 v.run("STUB.level=21;OFFERS=WoWAIQuestOffers.List();IDS={};for _,o in ipairs(OFFERS)do IDS[o.id]=true end");assert.equal(v.get('IDS[1483]'),'nil','local pickup does not justify cross-zone delivery');
 v.run('COMPLETED[870]=true;OFFERS=WoWAIQuestOffers.List();IDS={};for _,o in ipairs(OFFERS)do IDS[o.id]=true end');assert.equal(v.get('IDS[870]'),'nil');
});
test('guide advances accepting -> objectives -> turn-in -> unlocked follow-up without AI',()=>{
 const v=vm();v.run(`WoWAIQuestOffersData={maps={[1413]={999001,999002}},people={['1:7']={enUS='Giver',zhCN='接取者'}},quests={
 [999001]={name={enUS='First',zhCN='第一步'},min=1,level=16,races=0,classes=0,flags=0,category=0,start={{1413,50,30,1,7}}},
 [999002]={name={enUS='Second',zhCN='后续'},min=1,level=16,races=0,classes=0,flags=0,category=0,pre={999001},start={{1413,50,30,1,7}}}}};
 assert(WoWAIQuestOffers.Navigate(999001));QUESTS={{questID=999001,title='第一步',level=16}};C_QuestLog.GetNextWaypoint=function()return 1413,.6,.4 end
 WoWAIQuestOffers.Accepted(999001);WoWAIQuestOffers.Tick()`);
 assert.match(v.get('STUB.pickup.title'),/完成：第一步/);assert.match(v.get('STUB.pickup.detail'),/击杀目标/);
 v.run('STUB.complete=true;WoWAIQuestOffers.Tick()');assert.match(v.get('STUB.pickup.title'),/交任务：第一步/);
 v.run('QUESTS={};COMPLETED[999001]=true;WoWAIQuestOffers.Tick()');assert.equal(v.get('CHAR.questGuide.id'),'999002');assert.match(v.get('STUB.pickup.title'),/接任务：后续/);
 v.run('WoWAIQuestOffers.Stop();WoWAIQuestOffers.Tick()');assert.equal(v.get('CHAR.questGuide'),'nil');assert.equal(v.get('STUB.pickup'),'nil');
});
test('pickup UI supplies giver, minimum level and navigation in all supported languages',()=>{
 const v=vm();for(const [lang,label,body]of [['zhCN','先接哪些任务',/前往/],['zhTW','先接哪些任務',/前往/],['enUS','Quests to pick up first',/Go to/]]){
  v.run(`WoWAIDB={settings={language='${lang}'}};WoWAIAdventureUI.group='pickups';WoWAIAdventure.Show('tasks');WoWAIAdventureUI.Render()`);
  assert.equal(v.get('WoWAIAdventureUI.tasks.title:GetText()'),label);assert.match(v.get('WoWAIAdventureUI.tasks.body:GetText()'),body);assert.equal(v.get('WoWAIAdventureUI.tasks.nav:IsEnabled()'),'true');
 }
});
const projected={id:1483,title:'菲兹克斯',complete:true,objectives:[],locations:[{key:'poi1413',m:1413,x:22.282062470913,y:10.871425271034},{key:'poi1442',m:1442,x:58.993172645569,y:62.607800960541}]};
test('bridge rejects the screenshot projection but preserves lone live points and objective alternatives',()=>{
 assert.deepEqual(Planner.candidates(projected).map(w=>w.m),[1442]);
 assert.deepEqual(Planner.candidates({...projected,locations:[projected.locations[0]]}).map(w=>w.m),[1413]);
 assert.equal(Planner.candidates({...projected,complete:false}).length,2);
 const snapshot={scopeMap:1413,quests:[projected]};assert.throws(()=>Planner.prompt({snapshot:'x'},snapshot),/没有可规划/);
});
test('addon removes screenshot projection and retires its old saved region without claiming a turn-in',()=>{
 const v=vm();v.run(`QUESTS={{questID=1483,title='菲兹克斯',level=21}};STUB.complete=true;
 C_QuestLog.GetQuestsOnMap=function(m)if m==1413 then return {{questID=1483,x=.22282062470913,y=.10871425271034}} elseif m==1442 then return {{questID=1483,x=.58993172645569,y=.62607800960541}} end end
 WoWAIAdventure.Plan(false,true);
 CHAR.plan.scopeMap=1413;CHAR.plan.turnedIn={};CHAR.plan.regions={{m=1413,x=22.28,y=10.87,name='旧站',number=3,kind='turnin',members={{questID=1483,phase='turnin',title='菲兹克斯'}}}};
 WoWAIAdventure.UpdateRegions()`);
 assert.equal(v.get('#CHAR.plan.quests[1].locations'),'1');assert.equal(v.get('CHAR.plan.quests[1].locations[1].m'),'1442');
 assert.equal(v.get('CHAR.plan.regions[1].done'),'true');assert.equal(v.get('CHAR.plan.regions[1].members[1].outOfScope'),'true');
 assert.equal(v.get('CHAR.plan.turnedIn[1483]'),'nil');assert.equal(v.get('#CHAR.plan.route'),'0');assert.equal(v.get('#WoWAIAdventure.PlanningQuests(CHAR.plan)'),'0');
});
test('native zone boundary excludes a projected objective rather than making it an unknown local stop',()=>{
 const v=vm();v.run(`QUESTS={{questID=999123,title='邻区目标'}};C_QuestLog.GetNextWaypoint=function()return 1413,.2,.1 end;C_Map.GetMapInfoAtPosition=function()return {mapType=3,mapID=1442}end;WoWAIAdventure.Plan(false,true);CHAR.plan.scopeMap=1413`);
 assert.equal(v.get('CHAR.plan.quests[1].offMapPOI'),'true');assert.equal(v.get('#WoWAIAdventure.PlanningQuests(CHAR.plan)'),'0');
});
