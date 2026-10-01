'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');

test('acceptance levels remain visible for active quests, missing levels never use quest difficulty',()=>{
 const v=vm(`STUB.inside=false;local q=WoWAIDungeonData.dungeons[1].quests[1];q.minLevel=40;q.level=60;STUB.quests={{questID=1,title='副本任务'}}`);
 v.run(`WoWAI.SelectTab('dungeon')`);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/最低接取等级：40 级/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/还差/);
 v.run(`WoWAIDungeonData.dungeons[1].quests[1].minLevel=nil;WoWAIDungeonUI.Render()`);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/最低接取等级：待核实/);
 assert.doesNotMatch(v.get('WoWAIDungeonUI.preparation:GetText()'),/至少 60/);
});

test('preparation includes future quests but excludes other factions, classes, races, completed quests and chosen branches',()=>{
 const v=vm(`STUB.inside=false;local qs=WoWAIDungeonData.dungeons[1].quests
 qs[2]={id=2,name='高等级任务',faction='horde',gatesKnown=true,minLevel=24,races=16,classes=128,pre={88}}
 qs[3]={id=3,name='联盟任务',faction='alliance',gatesKnown=true,minLevel=60}
 qs[4]={id=4,name='战士任务',faction='horde',gatesKnown=true,minLevel=50,classes=1}
 qs[5]={id=5,name='兽人任务',faction='horde',gatesKnown=true,minLevel=45,races=2}
 qs[6]={id=6,name='交过的任务',faction='horde',gatesKnown=true,minLevel=40};STUB.completed[6]=true
 qs[7]={id=7,name='已选另一分支',faction='horde',gatesKnown=true,minLevel=35,excl={99}};STUB.completed[99]=true
 qs[8]={id=8,name='副本外周边任务',faction='horde',gatesKnown=true,minLevel=55,outside=true}
 function PREP()local d=WoWAIDungeonData.dungeons[1];local r,c=WoWAIDungeon.Check(d);return WoWAIDungeon.Preparation(d,r,c)end`);
 assert.equal(v.get('PREP().level'),'24');assert.equal(v.get('PREP().remaining'),'2');
 assert.match(v.get('PREP().text'),/高等级任务/);assert.match(v.get('PREP().text'),/前置/);
 assert.doesNotMatch(v.get('PREP().text'),/联盟任务|战士任务|兽人任务|交过的任务/);
 v.run(`STUB.completed[2]=true`);assert.equal(v.get('PREP().level'),'10');
});

test('unknown records block all-quests level certainty; inside/item tasks raise threshold without becoming outside missing',()=>{
 const v=vm(`STUB.inside=false;local qs=WoWAIDungeonData.dungeons[1].quests
 qs[2]={id=2,name='本内任务',faction='horde',gatesKnown=true,minLevel=25,itemStart=true}
 qs[3]={id=3,name='未查等级',faction='both',gatesKnown=false}
 qs[4]={id=4,name='未查阵营',minLevel=60}
 function PREP()local d=WoWAIDungeonData.dungeons[1];local r,c=WoWAIDungeon.Check(d);return WoWAIDungeon.Preparation(d,r,c)end`);
 assert.equal(v.get('PREP().level'),'25');assert.equal(v.get('PREP().unknown'),'2');
 assert.equal(v.get('PREP().inside'),'1');assert.match(v.get('PREP().text'),/不能确认接齐所需等级/);
 assert.match(v.get('PREP().text'),/不能要求进本前全部接好/);
 v.run(`WoWAIDungeonData.dungeons[1].quests={}`);assert.match(v.get('PREP().text'),/资料不足/);
});

test('preparation is localized, refreshed on level up, scrolls above tasks and hides on loot',()=>{
 const v=vm(`STUB.inside=false;WoWAIDungeonData.dungeons[1].quests[1].minLevel=24;function UnitLevel()return 20 end`);
 v.run(`WoWAI.SelectTab('dungeon')`);
 assert.match(v.get('WoWAIDungeonUI.preparation:GetText()'),/当前 20 级，还差 4 级/);
 v.run(`function UnitLevel()return 24 end;STUB.FireEvent('PLAYER_LEVEL_UP',24);for _,f in ipairs(STUB.frames)do if f.events.PLAYER_TALENT_UPDATE and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.match(v.get('WoWAIDungeonUI.preparation:GetText()'),/已达到/);
 v.run(`WoWAIDB.settings.language='enUS';WoWAIDungeonUI.Render()`);
 assert.match(v.get('WoWAIDungeonUI.preparation:GetText()'),/Aim for level 24/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/Minimum acceptance level: 24/);
 v.run(`WoWAIDB.settings.language='zhTW';WoWAIDungeonUI.Render()`);
 assert.match(v.get('WoWAIDungeonUI.preparation:GetText()'),/集中清任務建議/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/最低接取等級：24 級/);
 v.run(`WoWAIDungeonUI.allLootButton.scripts.OnClick()`);assert.equal(v.get('WoWAIDungeonUI.preparation:IsShown()'),'false');
 assert.equal(v.get('WoWAIDB.outbox'),'nil');
});

test('all drops exposes unassigned items without attaching them to a boss, and task details include rewards',()=>{
 const v=vm(`local d=WoWAIDungeonData.dungeons[1];d.loot[2]={id=102,name='小怪掉落',bosses={},from='小怪',basis='classic',icon='Interface\\\\Icons\\\\inv_misc_bag_08'};local q=d.quests[1];q.steps={{name='先找向导',from='城里 20, 30',instructions='和向导谈话',optional=true}};q.followups={{name='部落后续',faction='horde',instructions='返回部落'},{name='联盟后续',faction='alliance',instructions='返回联盟'}};q.rewards={{id=103,name='任务奖励披风',quality=3,icon='Interface\\\\Icons\\\\inv_misc_cape_18'}};q.xp=1000;STUB.quests={{questID=1,title='副本任务'}}`);
 v.run(`WoWAI.SelectTab('dungeon');WoWAIDungeonUI.allLootButton.scripts.OnClick()`);
 assert.equal(v.get('#WoWAIDungeon.Loot(WoWAIDungeonData.dungeons[1].bosses[1])'),'1');
 assert.equal(v.get('#WoWAIDungeon.Loot(nil,nil,true)'),'2');
 assert.match(v.get('WoWAIDungeonUI.rows[2].body:GetText()'),/小怪|具体来源/);
 v.run(`WoWAIDungeonUI.taskButton.scripts.OnClick()`);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/和向导谈话/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/部落后续/);
 assert.doesNotMatch(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/联盟后续/);
 assert.match(v.get('WoWAIDungeonUI.rows[2].title:GetText()'),/任务奖励披风/);
 assert.equal(v.get('WoWAIDungeonUI.rows[2].icon:IsShown()'),'true');
});
function vm(extra='',realData=false){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 function run(code,arg){if(lauxlib.luaL_loadstring(L,to_luastring(code))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));let n=0;if(arg!==undefined){lua.lua_pushstring(L,to_luastring(arg));n=1;}if(lua.lua_pcall(L,n,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));}
 function get(expr){run('RESULT=tostring(('+expr+'))');lua.lua_getglobal(L,to_luastring('RESULT'));const s=to_jsstring(lua.lua_tostring(L,-1));lua.lua_pop(L,1);return s;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));run("STUB.locale='zhCN'");
 run(`STUB.restrictedEvents={COMBAT_LOG_EVENT_UNFILTERED=true,COMBAT_LOG_EVENT=true};STUB.level=20;STUB.inside=true;STUB.instance='测试副本';STUB.completed={};STUB.quests={};STUB.items={};STUB.equipped={};STUB.points={0,0,11}
 function UnitClass()return '法师','MAGE',8 end;function UnitRace()return '亡灵','Scourge',5 end;function UnitFactionGroup()return 'Horde' end
 function IsInInstance()return STUB.inside,'party' end;function GetInstanceInfo()return STUB.instance,'party',1,'普通',5,false,false,999 end
 function GetNumTalentTabs()return 3 end;function GetTalentTabInfo(i)return ({'奥术','火焰','冰霜'})[i],nil,STUB.points[i]end
 C_QuestLog={GetNumQuestLogEntries=function()return #STUB.quests,#STUB.quests end,GetInfo=function(i)return STUB.quests[i]end,IsComplete=function(id)for _,q in ipairs(STUB.quests)do if q.questID==id then return q.done==true end end return false end,GetQuestObjectives=function()return {{text='击败测试首领：0/1',finished=false}}end,IsQuestFlaggedCompleted=function(id)return STUB.completed[id]==true end}
 function GetInventoryItemLink(_,slot)local id=STUB.equipped[slot];return id and ('item:'..id)end
 function GetInventoryItemID(_,slot)return STUB.equipped[slot]end
 C_Item.GetItemInfo=function(link)local id=tonumber(link:match('item:(%d+)'));local i=STUB.items[id];if i and not i.uncached then return i.name,link,3,20,i.level or 1,'护甲','布甲',1,i.equip or 'INVTYPE_CHEST',nil,0,i.classID or 4,i.subID or 1 end end
 C_Item.GetItemStats=function(link)local id=tonumber(link:match('item:(%d+)'));local i=STUB.items[id];return i and not i.uncached and i.stats end
 C_Item.RequestLoadItemDataByID=function(id)STUB.requested=id end
 function UnitName(unit)if unit=='player'then return '测试角色' end;return STUB.mobName end
 function UnitIsDead()return STUB.dead==true end
 `);
 for(const f of ['Locale.lua', 'Codec.lua','Inbox.lua','WoWAI.lua','Map.lua','Adventure.lua','Kills.lua','AdventureUI.lua','DungeonData.lua','Gear.lua','Dungeon.lua','DungeonUI.lua'])run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI',f),'utf8'),'WoWAI');
 if(!realData)run(`WoWAIDungeonData={dungeons={{id='test',name='测试副本',aliases={'测试副本'},source='fixture',quests={{id=1,name='副本任务',from='城里',instructions='击败测试首领',gatesKnown=true,minLevel=10,classes=128,races=16}},bosses={{key='boss',name='测试首领',aliases={'测试首领','Test Boss'}}},loot={{id=101,name='掉落法袍',bosses={'boss'},level=10,slot='胸部',type='布甲',basis='site',stats={{label='智力',value=10}}}}}}}`);
 run(extra);run(`STUB.FireEvent('ADDON_LOADED','WoWAI');STUB.FireEvent('PLAYER_LOGIN');STUB.FireEvent('PLAYER_ENTERING_WORLD',true,false)`);
 return {run,get};
}
test('entry checks missing eligible tasks, completion closes only task notice, exit closes all',()=>{
 const v=vm();assert.equal(v.get('WoWAIDungeon.counts.missing'),'1');assert.equal(v.get('WoWAIDungeon.taskVisible'),'true');
 v.run(`STUB.quests={{questID=1,title='副本任务'}};WoWAIDungeon.Refresh();STUB.mobName='测试首领';WoWAIDungeon.Observe('target')`);
 assert.equal(v.get('WoWAIDungeon.counts.active'),'1');assert.equal(v.get('WoWAIDungeon.bossVisible'),'true');
 v.run(`STUB.quests[1].done=true;WoWAIDungeon.Refresh()`);assert.equal(v.get('WoWAIDungeon.taskVisible'),'false');assert.equal(v.get('WoWAIDungeon.bossVisible'),'true');assert.equal(v.get('WoWAIDungeon.counts.ready'),'1');
 v.run(`STUB.inside=false;WoWAIDungeon.Refresh()`);assert.equal(v.get('WoWAIDungeonHUD:IsVisible()'),'false');
 assert.equal(v.get('#(STUB.blockedRegistrations or {})'),'0');assert.equal(v.get('WoWAIDB.outbox'),'nil');
});
test('gates exclude faction, race, class, level, prerequisite and alternate branches without false missing',()=>{
 const v=vm();v.run(`Q=WoWAIDungeon.instance.quests[1];function E()return WoWAIDungeon.Eligibility(Q,{})end`);
 assert.equal(v.get('E()'),'missing');
 for(const [set,clear] of [[`Q.faction='alliance'`,`Q.faction=nil`],[`Q.races=1`,`Q.races=16`],[`Q.classes=1`,`Q.classes=128`],[`Q.minLevel=40`,`Q.minLevel=10`],[`Q.pre={8}`,`Q.pre=nil`],[`Q.preAll={8,9}`,`Q.preAll=nil`],[`Q.excl={10};STUB.completed[10]=true`,`Q.excl=nil`]]){
  v.run(set);assert.equal(v.get('E()'),'unavailable',set);v.run(clear);
 }
 v.run(`Q.skill=123`);assert.equal(v.get('E()'),'unknown');v.run(`Q.skill=nil;Q.itemStart=true`);assert.equal(v.get('E()'),'inside');
 v.run(`Q.itemStart=nil;C_QuestLog.IsQuestFlaggedCompleted=nil`);assert.equal(v.get('E()'),'unknown');
});
test('quest updates and turn-in events refresh without changing outdoor exclusion',()=>{
 const v=vm();v.run(`STUB.quests={{questID=1,title='副本任务',isDungeon=true}};WoWAIDungeon.Event('QUEST_ACCEPTED',1);for _,f in ipairs(STUB.frames)do if f.events.PLAYER_TALENT_UPDATE and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.equal(v.get('WoWAIDungeon.counts.active'),'1');assert.equal(v.get('WoWAIAdventure.IsDungeonQuest({id=1},{isDungeon=true})'),'true');
 v.run(`STUB.quests={};WoWAIDungeon.Event('QUEST_TURNED_IN',1);WoWAIDungeon.Refresh()`);assert.equal(v.get('WoWAIDungeon.counts.done'),'1');
});
test('boss observations deduplicate; wipe rearms, dead units and outside units never trigger',()=>{
 const v=vm();v.run(`STUB.mobName='Test Boss';WoWAIDungeon.Observe('nameplate1')`);assert.equal(v.get('WoWAIDungeon.bossVisible'),'true');
 v.run(`WoWAIDungeon.bossVisible=false;WoWAIDungeon.Observe('target')`);assert.equal(v.get('WoWAIDungeon.bossVisible'),'false');
 v.run(`WoWAIDungeon.Encounter('Test Boss',false);WoWAIDungeon.Observe('target')`);assert.equal(v.get('WoWAIDungeon.bossVisible'),'true');
 v.run(`WoWAIDungeon.Encounter('Test Boss',true);STUB.dead=true;WoWAIDungeon.Observe('target')`);assert.equal(v.get('WoWAIDungeon.bossVisible'),'false');
 v.run(`STUB.inside=false;WoWAIDungeon.Refresh();STUB.dead=false;WoWAIDungeon.Observe('target')`);assert.equal(v.get('WoWAIDungeon.bossVisible'),'false');
});
test('legacy and Forever specialization points auto-select talents, handle ties and inaccessible APIs',()=>{
 const v=vm();assert.equal(v.get('WoWAIGear.Profile().name'),'冰霜');
 v.run(`STUB.points={0,12,0}`);assert.equal(v.get('WoWAIGear.Profile().school'),'fire');
 v.run(`STUB.points={11,11,0}`);assert.equal(v.get('WoWAIGear.Profile().certain'),'false');
 v.run(`GetTalentTabInfo=nil;C_SpecializationInfo={GetSpecializationInfo=function(i)return 100+i,({'奥术','火焰','冰霜'})[i],nil,nil,nil,nil,({2,3,10})[i]end}`);assert.equal(v.get('WoWAIGear.Profile().name'),'冰霜');
 v.run(`C_SpecializationInfo.GetSpecializationInfo=function()error('restricted')end`);assert.equal(v.get('WoWAIGear.Profile().certain'),'false');
});
const gear=`STUB.items[101]={name='新法袍',stats={ITEM_MOD_INTELLECT_SHORT=20}};STUB.items[102]={name='旧法袍',stats={ITEM_MOD_INTELLECT_SHORT=5}};STUB.equipped[5]=102;REF={id=101,name='新法袍',slot='胸部',type='布甲',stats={{label='智力',value=20}},basis='site'};function C()return WoWAIGear.Compare(REF)end`;

test('Forever points override incomplete old shims and zero tab count; talent event refreshes loot',()=>{
 const v=vm(gear+`;function GetNumTalentTabs()return 0 end;function GetTalentTabInfo(i)return ({'奥术','火焰','冰霜'})[i],134400,nil end
 C_SpecializationInfo={GetSpecializationInfo=function(i)return 100+i,({'奥术','火焰','冰霜'})[i],nil,134400,'DAMAGER',3,STUB.points[i]end}`);
 assert.equal(v.get('WoWAIGear.Profile().school'),'frost');assert.equal(v.get('C().status'),'upgrade');
 v.run(`WoWAI.SelectTab('dungeon');WoWAIDungeonUI.bossButtons[1].scripts.OnClick();STUB.points={0,8,0};STUB.FireEvent('PLAYER_TALENT_UPDATE');for _,f in ipairs(STUB.frames)do if f.events.PLAYER_TALENT_UPDATE and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/火焰.*8/);
 v.run(`C_SpecializationInfo.GetSpecializationInfo=function(i)return {name=({'奥术','火焰','冰霜'})[i],pointsSpent=STUB.points[i]}end`);
 assert.equal(v.get('WoWAIGear.Profile().school'),'fire');
});

test('numeric legacy tab layout and rank fallback work; incomplete reads never certify main talent',()=>{
 const v=vm();v.run(`GetTalentTabInfo=function(i)return 100+i,({'奥术','火焰','冰霜'})[i],'description',134400,STUB.points[i]end`);
 assert.equal(v.get('WoWAIGear.Profile().points'),'11');
 v.run(`GetTalentTabInfo=function(i)return ({'奥术','火焰','冰霜'})[i],134400,nil end;GetNumTalents=function()return 2 end;GetTalentInfo=function(i,j)return '天赋',134400,1,1,(i==2 and 3 or 0),5 end`);
 assert.equal(v.get('WoWAIGear.Profile().school'),'fire');assert.equal(v.get('WoWAIGear.Profile().points'),'6');
 v.run(`GetTalentInfo=function(i,j)if i==3 then error('unavailable')end;return '天赋',134400,1,1,3,5 end`);
 assert.equal(v.get('WoWAIGear.Profile().certain'),'false');
});

test('missing talent data still gives class guidance without inventing an upgrade',()=>{
 const v=vm(gear);v.run(`GetTalentTabInfo=nil`);
 assert.equal(v.get('C().status'),'unknown');assert.match(v.get('C().detail'),/智力、法术伤害/);
});

test('loot icons render without hover in list and HUD, refresh after item load, hide on task rows',()=>{
 const v=vm(gear);v.run(`C_Item.GetItemInfoInstant=function(link)return 101,'护甲','布甲','INVTYPE_CHEST',987654,4,1 end;WoWAI.SelectTab('dungeon');WoWAIDungeonUI.bossButtons[1].scripts.OnClick();STUB.mobName='测试首领';WoWAIDungeon.Observe('target')`);
 assert.equal(v.get('WoWAIDungeonUI.rows[1].icon.image.texture'),'987654');assert.equal(v.get('WoWAIDungeonUI.rows[1].icon:IsShown()'),'true');
 assert.equal(v.get('WoWAIDungeonUI.bossHUD.items[1].icon.image.texture'),'987654');
 v.run(`C_Item.GetItemInfoInstant=nil;WoWAIDungeonUI.Render()`);
 assert.equal(v.get('WoWAIDungeonUI.rows[1].icon.image.texture'),'134400');
 v.run(`C_Item.GetItemIconByID=function()return 123456 end;STUB.FireEvent('ITEM_DATA_LOAD_RESULT',101,true);for _,f in ipairs(STUB.frames)do if f.events.ITEM_DATA_LOAD_RESULT and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.equal(v.get('WoWAIDungeonUI.rows[1].icon.image.texture'),'123456');
 v.run(`WoWAIDungeonUI.taskButton.scripts.OnClick()`);assert.equal(v.get('WoWAIDungeonUI.rows[1].icon:IsShown()'),'false');
});

test('cached name with absent stats requests item data and recomputes recommendation after load',()=>{
 const v=vm(gear);v.run(`STUB.items[101].stats=nil;RESULT=WoWAIGear.Compare(REF)`);
 assert.equal(v.get('RESULT.status'),'useful');assert.notEqual(v.get('WoWAIGear.requested[101]'),'nil');
 v.run(`STUB.items[101].stats={ITEM_MOD_INTELLECT_SHORT=20}`);assert.equal(v.get('C().status'),'upgrade');
 v.run(`C_Item.GetItemStats=function()return nil end;GetItemStats=function(link)return STUB.items[tonumber(link:match('item:(%d+)'))].stats end`);
 assert.equal(v.get('C().status'),'upgrade');
});
test('mage improvement uses current equipment not item level; gear and talent changes recompute',()=>{
 const v=vm(gear);assert.equal(v.get('C().status'),'upgrade');assert.equal(v.get('C().compare'),'旧法袍');
 v.run(`STUB.items[102].stats.ITEM_MOD_INTELLECT_SHORT=40`);assert.equal(v.get('C().status'),'useful');
 v.run(`STUB.items[101].stats={ITEM_MOD_FIRE_DAMAGE_SHORT=20};STUB.items[102].stats={ITEM_MOD_FROST_DAMAGE_SHORT=20}`);assert.equal(v.get('C().status'),'low');
 v.run(`STUB.points={0,12,0}`);assert.equal(v.get('C().status'),'upgrade');
});
test('cannot equip armor, weapon and high-level items are never upgrades',()=>{
 const v=vm(gear);v.run(`STUB.items[101].subID=4`);assert.equal(v.get('C().status'),'unusable');
 v.run(`STUB.items[101].classID=2;STUB.items[101].subID=4;STUB.items[101].equip='INVTYPE_WEAPONMAINHAND'`);assert.equal(v.get('C().status'),'unusable');
 v.run(`STUB.items[101].classID=4;STUB.items[101].subID=1;STUB.items[101].level=60`);assert.equal(v.get('C().status'),'unusable');
});
test('uncached, unknown stats, procs and unset talents do not claim upgrades',()=>{
 const v=vm(gear);v.run(`STUB.items[101].uncached=true`);assert.notEqual(v.get('C().status'),'upgrade');assert.equal(v.get('STUB.requested'),'101');
 v.run(`STUB.items[101].uncached=false;REF.effects={{trigger=2,text='触发额外伤害'}}`);assert.equal(v.get('C().status'),'useful');
 v.run(`REF.effects=nil;STUB.items[102].stats=nil`);assert.equal(v.get('C().status'),'unknown');
 v.run(`STUB.items[102].stats={};STUB.points={0,0,0}`);assert.equal(v.get('C().status'),'unknown');
});
test('inaccessible equipment and uncached equipped links are not treated as empty slots',()=>{
 const v=vm(gear);v.run(`GetInventoryItemLink=function()error('unavailable')end`);assert.equal(v.get('C().status'),'unknown');
 const w=vm(gear);w.run(`STUB.items[102].uncached=true`);assert.equal(w.get('C().status'),'unknown');assert.equal(w.get('STUB.requested'),'102');
 w.run(`STUB.items[102].uncached=false;STUB.items[101].stats=nil`);assert.notEqual(w.get('C().status'),'upgrade');
});
test('two-handed comparison sums both hands; offhand cannot claim replacing two-handed upgrade',()=>{
 const v=vm(gear);v.run(`STUB.items[101].classID=2;STUB.items[101].subID=10;STUB.items[101].equip='INVTYPE_2HWEAPON';STUB.items[101].stats={ITEM_MOD_INTELLECT_SHORT=20};STUB.items[102].equip='INVTYPE_WEAPONMAINHAND';STUB.items[102].stats={ITEM_MOD_INTELLECT_SHORT=15};STUB.items[103]={name='副手',equip='INVTYPE_HOLDABLE',stats={ITEM_MOD_INTELLECT_SHORT=15}};STUB.equipped[16]=102;STUB.equipped[17]=103`);
 assert.equal(v.get('C().status'),'useful');assert.equal(v.get('C().baseline'),'15.0');
 v.run(`STUB.items[101].equip='INVTYPE_HOLDABLE';STUB.items[101].classID=4;STUB.items[101].subID=0;STUB.items[102].equip='INVTYPE_2HWEAPON';STUB.equipped[17]=nil`);assert.equal(v.get('C().status'),'useful');assert.match(v.get('C().text'),/整套/);
});
test('ring compares weaker slot but does not recommend duplicating a unique ring',()=>{
 const v=vm(gear);v.run(`STUB.items[101].equip='INVTYPE_FINGER';STUB.items[102].stats={ITEM_MOD_INTELLECT_SHORT=30};STUB.items[103]={name='弱戒指',stats={ITEM_MOD_INTELLECT_SHORT=2}};STUB.equipped[11]=102;STUB.equipped[12]=103`);
 assert.equal(v.get('C().status'),'upgrade');assert.equal(v.get('C().compare'),'弱戒指');
 v.run(`STUB.equipped[11]=101;REF.unique=true`);assert.equal(v.get('C().status'),'same');
 v.run(`STUB.equipped[11]=102;C_Item.GetItemUniquenessByID=function()return true,'限制组',1,7 end`);assert.equal(v.get('C().status'),'useful');assert.match(v.get('C().text'),/唯一类别/);
});
test('fourth tab preserves chat draft, renders on first open, HUD details pick boss, unknown instance explicit',()=>{
 const v=vm(gear);v.run(`WoWAI.SelectTab('chat');WoWAIInput:SetText('保留草稿');WoWAI.Toggle(false);WoWAI.SelectTab('dungeon')`);
 assert.equal(v.get('WoWAIDungeonPage:IsVisible()'),'true');assert.equal(v.get('WoWAIDungeonUI.title:GetText()'),'测试副本 · 任务');assert.equal(v.get('WoWAIChatPage:IsVisible()'),'false');
 v.run(`STUB.mobName='测试首领';WoWAIDungeon.Observe('target');WoWAIDungeonUI.bossHUD.details.scripts.OnClick()`);assert.match(v.get('WoWAIDungeonUI.title:GetText()'),/测试首领 · 掉落/);
 v.run(`WoWAI.SelectTab('log');WoWAI.SelectTab('chat')`);assert.equal(v.get('WoWAIInput:GetText()'),'保留草稿');
 v.run(`STUB.instance='未收录副本';WoWAIDungeon.Refresh();WoWAI.SelectTab('dungeon')`);assert.equal(v.get('WoWAIDungeonUI.title:GetText()'),'未收录副本 · 任务');assert.match(v.get('WoWAIDungeon.Summary()'),/暂不能判断/);
});
test('real dataset has honest coverage, merged Scarlet wings, satchel followup and usable boss mappings',()=>{
 const v=vm('',true);assert.equal(v.get('#WoWAIDungeonData.dungeons'),'28');v.run(`STUB.instance='怒焰裂谷';WoWAIDungeon.Refresh()`);assert.equal(v.get('#WoWAIDungeon.instance.quests'),'6');
 assert.equal(v.get('WoWAIDungeon.instance.quests[6].itemStart'),'true');
 v.run(`STUB.instance='血色修道院';WoWAIDungeon.Refresh()`);assert.ok(Number(v.get('#WoWAIDungeon.instance.bosses'))>=8);
 v.run(`for _,d in ipairs(WoWAIDungeonData.dungeons)do assert(d.coverage=='partial' or d.coverage=='unavailable');for _,i in ipairs(d.loot)do for _,key in ipairs(i.bosses)do local ok=false;for _,b in ipairs(d.bosses)do if b.key==key then ok=true end end;assert(ok)end end end`);
 v.run(`STUB.inside=false;WoWAIDungeon.Refresh();WoWAI.SelectTab('dungeon');for i,d in ipairs(WoWAIDungeonData.dungeons)do WoWAIDungeonUI.preview=i;WoWAIDungeonUI.boss=nil;WoWAIDungeonUI.Render();for _,b in ipairs(d.bosses)do WoWAIDungeonUI.boss=b;WoWAIDungeonUI.Render()end end`);
});
test('outside preparation checks live quests, updates after acceptance and never enables dungeon notices',()=>{
 const v=vm(`STUB.inside=false`);
 v.run(`WoWAI.SelectTab('dungeon')`);
 assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/进本前检查.*漏接 1/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].title:GetText()'),/\[漏接\]/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/接取：城里/);
 v.run(`STUB.quests={{questID=1,title='副本任务'}};STUB.FireEvent('QUEST_ACCEPTED',1);for _,f in ipairs(STUB.frames)do if f.events.PLAYER_TALENT_UPDATE and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/已接齐/);
 assert.match(v.get('WoWAIDungeonUI.rows[1].title:GetText()'),/\[进行中\]/);
 v.run(`STUB.quests={};STUB.FireEvent('QUEST_REMOVED',1);for _,f in ipairs(STUB.frames)do if f.events.PLAYER_TALENT_UPDATE and f.scripts.OnUpdate then f.scripts.OnUpdate(f,1)end end`);
 assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/漏接 1/);
 assert.equal(v.get('WoWAIDungeon.instanceKey'),'nil');assert.equal(v.get('WoWAIDungeonHUD:IsVisible()'),'false');assert.equal(v.get('WoWAIDB.outbox'),'nil');
});
test('changing preparation dungeon changes the checklist; actual instance takes over and exit restores choice',()=>{
 const v=vm(`STUB.inside=false;WoWAIDungeonData.dungeons[2]={id='other',name='另一个副本',aliases={'另一个副本'},bosses={},loot={},source='fixture',quests={{id=2,name='另一任务',gatesKnown=true,from='另一城',instructions='完成另一任务'}}};STUB.quests={{questID=2,title='另一任务'}}`);
 v.run(`WoWAI.SelectTab('dungeon');WoWAIDungeonUI.next.scripts.OnClick()`);
 assert.equal(v.get('WoWAIDungeonUI.title:GetText()'),'另一个副本 · 任务');assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/已接齐/);
 v.run(`STUB.inside=true;WoWAIDungeon.Refresh()`);
 assert.equal(v.get('WoWAIDungeonUI.title:GetText()'),'测试副本 · 任务');assert.equal(v.get('WoWAIDungeonUI.next:IsEnabled()'),'false');assert.equal(v.get('WoWAIDungeon.counts.missing'),'1');
 v.run(`STUB.inside=false;WoWAIDungeon.Refresh()`);assert.equal(v.get('WoWAIDungeonUI.title:GetText()'),'另一个副本 · 任务');assert.equal(v.get('WoWAIDungeonUI.next:IsEnabled()'),'true');
});
test('outside checklist keeps inside sources and prerequisite gates separate, incomplete data never claims ready',()=>{
 const v=vm(`STUB.inside=false;local qs=WoWAIDungeonData.dungeons[1].quests;qs[1].pre={88};qs[2]={id=2,name='物品任务',faction='both',itemStart=true,from='副本内',instructions='取得物品'};qs[3]={id=3,name='未知条件任务',faction='horde',from='待确认',instructions='待确认'}`);
 v.run(`ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);
 assert.equal(v.get('COUNTS.missing'),'0');assert.equal(v.get('COUNTS.unavailable'),'1');assert.equal(v.get('COUNTS.inside'),'1');assert.equal(v.get('COUNTS.unknown'),'1');assert.match(v.get('WoWAIDungeon.Summary(WoWAIDungeonData.dungeons[1],COUNTS)'),/条件待确认/);
 v.run(`WoWAIDungeonData.dungeons[1].quests[3]=nil;ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);
 assert.match(v.get('WoWAIDungeon.Summary(WoWAIDungeonData.dungeons[1],COUNTS)'),/当前无进本前可接任务/);
 v.run(`STUB.completed[88]=true;ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);assert.equal(v.get('COUNTS.missing'),'1');
});
test('faction classification uses explicit side and race restrictions; unknown never becomes shared',()=>{
 const {classify,fromMask}=require('../tools/dungeon-factions');
 assert.equal(fromMask(77),'alliance');assert.equal(fromMask(178),'horde');assert.equal(fromMask(162),'horde');assert.equal(fromMask(5),'alliance');assert.equal(fromMask(0),'both');assert.equal(fromMask(255),'both');assert.equal(fromMask(undefined),'unknown');
 assert.deepEqual(classify('alliance',178,true),{faction:'unknown',factionSource:'conflicting-evidence'});
 assert.equal(classify(undefined,undefined,false).faction,'unknown');assert.equal(classify('horde',undefined,false).faction,'horde');
});
test('opposite faction is absent from rows, counts and HUD, even when logged or completed; fallback cannot reinsert it',()=>{
 const v=vm(`local qs=WoWAIDungeonData.dungeons[1].quests;qs[2]={id=2,name='联盟专属秘密',faction='alliance',gatesKnown=true,races=77,from='联盟城',instructions='联盟目标'};STUB.completed[2]=true;STUB.quests={{questID=90,title='测试副本',isHeader=true},{questID=2,title='联盟专属秘密',isDungeon=true,done=true}}`);
 v.run(`WoWAI.SelectTab('dungeon')`);
 assert.equal(v.get('#WoWAIDungeon.rows'),'1');assert.equal(v.get('WoWAIDungeon.counts.oppositeHidden'),'1');assert.equal(v.get('WoWAIDungeon.counts.ready'),'0');assert.equal(v.get('WoWAIDungeon.counts.done'),'0');assert.equal(v.get('WoWAIDungeon.counts.unavailable'),'0');
 assert.doesNotMatch(v.get('WoWAIDungeonUI.taskHUD.body:GetText()'),/联盟专属秘密/);
 v.run(`for _,r in ipairs(WoWAIDungeonUI.rows)do if r:IsShown()then assert(not r.title:GetText():find('联盟专属秘密',1,true))end end`);
 v.run(`STUB.inside=false;WoWAIDungeon.Refresh()`);assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/部落 \/ 双方任务/);
 assert.doesNotMatch(v.get('WoWAIDungeonUI.rows[1].title:GetText()'),/联盟专属秘密/);
});
test('unknown faction stays withheld and blocks ready claim; shared quests and alliance counterpart work',()=>{
 const v=vm(`STUB.inside=false;local qs=WoWAIDungeonData.dungeons[1].quests;qs[2]={id=2,name='未知阵营',from='未知',instructions='未知'};qs[3]={id=3,name='共有任务',gatesKnown=true,races=0,from='中立地点',instructions='共有目标'};qs[4]={id=4,name='联盟任务',faction='alliance',gatesKnown=true,races=77,from='联盟',instructions='联盟目标'};STUB.quests={{questID=1,title='副本任务'},{questID=3,title='共有任务'}}`);
 v.run(`ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);
 assert.equal(v.get('#ROWS'),'2');assert.equal(v.get('COUNTS.factionUnknown'),'1');assert.equal(v.get('COUNTS.oppositeHidden'),'1');assert.match(v.get('WoWAIDungeon.Summary(WoWAIDungeonData.dungeons[1],COUNTS)'),/暂不能确认接齐/);
 v.run(`function UnitFactionGroup()return 'Alliance'end;function UnitRace()return '人类','Human',1 end;STUB.quests={};ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);
 assert.equal(v.get('#ROWS'),'2');assert.equal(v.get('COUNTS.missing'),'2');assert.equal(v.get('COUNTS.oppositeHidden'),'1');
 v.run(`function UnitFactionGroup()return nil end;ROWS,COUNTS=WoWAIDungeon.Check(WoWAIDungeonData.dungeons[1])`);
 assert.equal(v.get('#ROWS'),'1');assert.equal(v.get('ROWS[1].quest.name'),'共有任务');assert.equal(v.get('COUNTS.factionUnknown'),'3');
});
test('real data separates Deadmines, Stockade, RFC, same-name Lordaeron and both-faction WC tasks',()=>{
 const v=vm(`STUB.inside=false`,true);
 v.run(`function CHECK(id)local d;for _,x in ipairs(WoWAIDungeonData.dungeons)do if x.id==id then d=x end end;ROWS,COUNTS=WoWAIDungeon.Check(d);IDS={};for _,r in ipairs(ROWS)do IDS[r.quest.id]=true;assert(r.faction~='alliance')end end;CHECK('deadmines')`);
 assert.equal(v.get('#ROWS'),'0');assert.equal(v.get('COUNTS.oppositeHidden'),'8');
 v.run(`CHECK('stockade')`);assert.equal(v.get('#ROWS'),'0');assert.equal(v.get('COUNTS.oppositeHidden'),'6');
 v.run(`CHECK('ragefire-chasm')`);assert.equal(v.get('#ROWS'),'6');assert.equal(v.get('COUNTS.factionUnknown'),'0');assert.equal(v.get('IDS[5724]'),'true');
 v.run(`CHECK('ruins-of-lordaeron')`);assert.equal(v.get('IDS[95189]'),'nil');assert.equal(v.get('IDS[95204]'),'true');assert.equal(v.get('COUNTS.oppositeHidden'),'4');
 v.run(`CHECK('wailing-caverns')`);assert.equal(v.get('IDS[959]'),'true');assert.equal(v.get('IDS[962]'),'true');
 v.run(`for _,d in ipairs(WoWAIDungeonData.dungeons)do CHECK(d.id)end`);
});
