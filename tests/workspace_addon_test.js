'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
function vm(extra=''){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 function run(code,arg){if(lauxlib.luaL_loadstring(L,to_luastring(code))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));let n=0;if(arg!==undefined){lua.lua_pushstring(L,to_luastring(arg));n=1;}if(lua.lua_pcall(L,n,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));}
 function get(expr){run('RESULT=tostring(('+expr+'))');lua.lua_getglobal(L,to_luastring('RESULT'));const s=to_jsstring(lua.lua_tostring(L,-1));lua.lua_pop(L,1);return s;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));run("STUB.locale='zhCN'");
 run(`STUB.restrictedEvents={COMBAT_LOG_EVENT_UNFILTERED=true,COMBAT_LOG_EVENT=true}
 COMBATLOG_XPGAIN_FIRSTPERSON='%s死亡，你获得%d点经验值。'
 COMBATLOG_XPGAIN_FIRSTPERSON_GROUP='%s死亡，你获得了%d点经验值。（+%d点组队奖励）'
 COMBATLOG_XPGAIN_FIRSTPERSON_UNNAMED='你获得了%d点经验值。'
 LOOT_ITEM_SELF='你获得了物品：%s。';LOOT_ITEM_SELF_MULTIPLE='你获得了物品：%sx%d。'
 function UnitGUID(unit) if unit=='player' then return 'Player-123' end return STUB.mobGUID end
 local name=UnitName;function UnitName(unit) if unit=='player' then return name(unit) end return STUB.mobName or '野猪' end
 function UnitIsDead(unit) return STUB.dead==true end
 function UnitCanAttack() return true end
 function UnitIsTapDenied() return STUB.denied==true end
 function UnitThreatSituation() return STUB.threat end
 C_QuestLog={GetNumQuestLogEntries=function()return 2,2 end,GetInfo=function(i)return {questID=i,title='任务'..i,level=20,suggestedGroup=0}end,IsComplete=function(id)return id==2 end,GetQuestObjectives=function(id)return {{text='收集水：0/5',numFulfilled=0,numRequired=5,finished=false}}end,GetNextWaypoint=function(id)if id==1 then return 1431,.5,.5 end end}
 `);
 run(extra);
 for(const f of ['Locale.lua', 'Codec.lua','Inbox.lua','WoWAI.lua','Map.lua','Adventure.lua','Kills.lua','AdventureUI.lua'])run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI',f),'utf8'),'WoWAI');
 run(`STUB.FireEvent('ADDON_LOADED','WoWAI');STUB.FireEvent('PLAYER_LOGIN');STUB.FireEvent('PLAYER_ENTERING_WORLD',true,false);WoWAI.Toggle(true);CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]`);
 return {run,get,json:e=>JSON.parse(get('WoWAIAdventure.JSON('+e+')'))};
}

test('daily book combines logins, splits midnight, turns days and pages without requesting AI',()=>{
 const v=vm();v.run(`WoWAI.SelectTab('log');DAY=WoWAIAdventureUI.session;WoWAIAdventure.Record('note',{text='第一天旅程'})
 WoWAIAdventure.Event('PLAYER_LOGOUT');STUB.now=STUB.now+2;WoWAIAdventure.Begin(false);WoWAIAdventure.Record('loot',{name='布料',count=3});WoWAIAdventureUI.Render()`);
 assert.equal(v.get('#WoWAIAdventure.Days(CHAR)'),'1');assert.equal(v.get('CHAR.days[DAY].loot'),'3');
 v.run(`STUB.now=STUB.now+86400;WoWAIAdventure.Record('note',{text='第二天旅程'});WoWAIAdventureUI.Render();WoWAIAdventureUI.logs.nextDay.scripts.OnClick()`);
 assert.notEqual(v.get('WoWAIAdventureUI.session'),v.get('DAY'));assert.match(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),/第二天旅程/);
 assert.doesNotMatch(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),/第一天旅程/);
 v.run(`for i=1,110 do WoWAIAdventure.Record('note',{text='旅途见闻'..i..string.rep('你好世界',5)})end;WoWAIAdventureUI.Render();FIRST=WoWAIAdventureUI.logs.storyText:GetText();WoWAIAdventureUI.logs.older.scripts.OnClick()`);
 assert.equal(v.get('WoWAIAdventureUI.page'),'2');assert.notEqual(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),v.get('FIRST'));
 assert.equal(v.get('WoWAIDB.outbox'),'nil');assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');
 v.run(`WoWAIAdventureUI.logs.previousDay.scripts.OnClick()`);assert.equal(v.get('WoWAIAdventureUI.session'),v.get('DAY'));assert.equal(v.get('WoWAIAdventureUI.page'),'1');
 assert.match(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),/第一天旅程/);
 v.run(`PAGES=WoWAIAdventureUI.StoryPages(string.rep('你好世界',1000))`);const pages=v.json('PAGES');assert.equal(pages.join(''),'你好世界'.repeat(1000));assert.ok(pages.length>1);
});
test('provider selection reaches chat and helpers, locks during requests and survives reload',()=>{
 const v=vm();v.run(`WoWAI.IsConnected=function()return true end;WoWAIInput:SetText('保留输入');WoWAI.SelectProvider('workbuddy');WoWAI.Send('连接测试')`);
 assert.equal(v.get('WoWAIDB.outbox.agent'),'workbuddy');assert.equal(v.get("WoWAI.SelectProvider('codex')"),'false');
 assert.equal(v.get('WoWAIDB.settings.preferredAgent'),'workbuddy');
 v.run(`WoWAI.Resend();C=WoWAIDB.chats[1];assert(C.pendingFlags:find('agent=workbuddy'));C.pendingId=nil;WoWAI.SelectProvider('codex');WoWAI.SendAdventurePlan('[WOWAI_PLAN:test:1]')`);
 assert.equal(v.get('WoWAIDB.outbox.agent'),'codex');
 v.run(`for _,c in ipairs(WoWAIDB.chats)do c.pendingId=nil end;WoWAI.SelectProvider('workbuddy');WoWAI.SendAdventureDraft('[WOWAI_DRAFT:test:session:1:zhCN]')`);
 assert.equal(v.get('WoWAIDB.outbox.agent'),'workbuddy');
 v.run(`for _,c in ipairs(WoWAIDB.chats)do c.pendingId=nil end;STUB.FireEvent('ADDON_LOADED','WoWAI');WoWAI.Send('仍使用WorkBuddy')`);
 assert.equal(v.get('WoWAIDB.outbox.agent'),'workbuddy');
});

test('WorkBuddy selector overrides the bridge default and remains scoped to that provider',()=>{
 const P=require('../bridge/protocol'),v=vm();
 v.run(`WoWAI.IsConnected=function()return true end;WoWAI.SelectProvider('workbuddy');WoWAI.Send('连接');C=WoWAIDB.chats[1]`);
 const reply={chat:v.get('C.id'),id:Number(v.get('C.pendingId')),status:'done',text:'好了',agent:'workbuddy'};
 v.run(P.luaTable('MODEL_SLOT',[reply],{agent:'codex',agents:['codex','workbuddy'],agentModels:{workbuddy:'custom-local:deepseek-v4-pro',codex:''}}));
 v.run(`STUB.onLoadAddOn=function()WoWAI_SlotData=MODEL_SLOT end;STUB.texts={};WoWAI.Send('',nil,C)`);
 assert.match(v.get('table.concat(STUB.texts,"|")'),/AI：WorkBuddy · 配置模型：自动/);
 v.run(`STUB.texts={};WoWAI.SelectProvider('codex')`);
 assert.doesNotMatch(v.get('table.concat(STUB.texts,"|")'),/配置模型：deepseek-v4-pro/);
 v.run(`WoWAI_Inbox=MODEL_SLOT;STUB.FireEvent('ADDON_LOADED','WoWAI');STUB.texts={};WoWAI.SelectProvider('workbuddy')`);
 assert.match(v.get('table.concat(STUB.texts,"|")'),/配置模型：自动/);
});

test('model menu freezes selections into chat, resend, planner and travelogue requests and persists',()=>{
 const P=require('../bridge/protocol'),v=vm();
 v.run(`WoWAI.IsConnected=function()return true end;WoWAI.SelectProvider('workbuddy');WoWAIInput:SetText('保留草稿');WoWAIModelSelector.scripts.OnClick()`);
 assert.equal(v.get('WoWAIModelMenu:IsShown()'),'true');
 v.run(`WoWAIModelOption2.scripts.OnClick()`);
 assert.equal(v.get('WoWAIModelMenu:IsShown()'),'false');
 assert.equal(v.get('WoWAIDB.settings.workbuddyModel'),'glm-5.3');assert.equal(v.get('WoWAIInput:GetText()'),'保留草稿');
 v.run(`WoWAI.Send('测试');C=WoWAIDB.chats[1]`);
 assert.equal(v.get('WoWAIDB.outbox.model'),'glm-5.3');
 assert.equal(P.parseFlags(v.get('C.pendingFlags')).model,'glm-5.3');
 assert.equal(v.get("WoWAI.SelectWorkBuddyModel('deepseek-v4.1-flash')"),'false');
 assert.equal(v.get('WoWAIModelSelector:IsEnabled()'),'false');
 v.run(`WoWAI.Resend()`);assert.equal(P.parseFlags(v.get('C.pendingFlags')).model,'glm-5.3');
 v.run(`C.pendingId=nil;WoWAI.SelectWorkBuddyModel('deepseek-v4.1-flash');WoWAI.SendAdventurePlan('[WOWAI_PLAN:test:1]')`);
 assert.equal(v.get('WoWAIDB.outbox.model'),'deepseek-v4.1-flash');
 v.run(`for _,c in ipairs(WoWAIDB.chats) do c.pendingId=nil end;WoWAI.SelectWorkBuddyModel('auto');WoWAI.SendAdventureDraft('[WOWAI_DRAFT:test:session:1:zhCN]')`);
 assert.equal(v.get('WoWAIDB.outbox.model'),'auto');
 v.run(`for _,c in ipairs(WoWAIDB.chats) do c.pendingId=nil end;WoWAI.SelectWorkBuddyModel('glm-5.3');STUB.FireEvent('ADDON_LOADED','WoWAI');WoWAI.SelectProvider('codex');WoWAI.Send('Codex')`);
 assert.equal(v.get('WoWAIDB.settings.workbuddyModel'),'glm-5.3');assert.equal(v.get('WoWAIDB.outbox.model'),'nil');
 assert.equal(v.get('WoWAIModelSelector:IsShown()'),'false');
 v.run(`for _,c in ipairs(WoWAIDB.chats) do c.pendingId=nil end;WoWAI.SelectProvider('workbuddy')`);
 assert.match(v.get('WoWAIModelSelector:GetText()'),/GLM-5.3/);
 assert.equal(v.get("WoWAI.SelectWorkBuddyModel('custom-local:other')"),'false');
});

test('three native tabs isolate widgets, preserve drafts and do not send AI or expose pixel strips',()=>{
 const v=vm();v.run(`WoWAI.SelectTab('chat');WoWAIInput:SetText('未发送的草稿');WoWAI.SelectTab('tasks');WoWAIAdventure.Plan(false)`);
 assert.equal(v.get('WoWAIChatPage:IsVisible()'),'false');assert.equal(v.get('WoWAIAdventureFrame:IsVisible()'),'true');
 assert.equal(v.get('WoWAIAdventureUI.tasks:IsVisible()'),'true');assert.equal(v.get('WoWAIAdventureUI.logs:IsVisible()'),'false');
 assert.equal(v.get('WoWAIAdventureButton'),'nil');assert.equal(v.get('WoWAIDB.outbox'),'nil');assert.equal(v.get('WoWAIStrip and WoWAIStrip:IsVisible()'),'nil');
 v.run(`WoWAI.SelectTab('log');WoWAIAdventureUI.logs.input:SetText('未提交的手记');WoWAI.SelectTab('chat')`);
 assert.equal(v.get('WoWAIInput:GetText()'),'未发送的草稿');assert.equal(v.get('WoWAIAdventureFrame:IsVisible()'),'false');
 v.run(`WoWAI.SelectTab('log')`);assert.equal(v.get('WoWAIJournalNote:GetText()'),'未提交的手记');
 assert.equal(v.get('#(STUB.blockedRegistrations or {})'),'0');
});
test('navigation starts explicitly, refuses missing coordinates and survives tabs/minimize',()=>{
 const v=vm();v.run(`WoWAI.SelectTab('tasks');WoWAIAdventure.Plan(false)`);
 assert.equal(v.get('WoWAIMap.AdventureStatus()'),'nil');assert.equal(v.get('WoWAIAdventure.StartNavigation(2)'),'false');
 v.run(`WoWAIAdventure.StartNavigation(1);WoWAI.SelectTab('log');WoWAI.Minimize(true)`);
 assert.equal(v.get('WoWAIMap.AdventureStatus()'),'1');assert.equal(v.get('WoWAINavigator:IsVisible()'),'true');assert.equal(v.get('WoWAIMini:IsVisible()'),'true');
 assert.equal(v.get('WoWAIAdventureFrame:IsVisible()'),'false');
 v.run(`WoWAI.SelectTab('tasks');WoWAIAdventureUI.tasks.nav.scripts.OnClick()`);
 assert.equal(v.get('WoWAIMap.AdventureStatus()'),'nil');assert.equal(v.get('WoWAINavigator:IsVisible()'),'false');
});
test('milestone source selects exact historical session and paginated event; note drafts stay local',()=>{
 const v=vm();v.run(`WoWAIAdventure.Record('level',{level=25});SOURCE=CHAR.recent[#CHAR.recent];STUB.now=STUB.now+1;WoWAIAdventure.Begin(false);for i=1,90 do WoWAIAdventure.Record('note',{text='手记 '..i}) end;WoWAI.SelectTab('log');WoWAIAdventureUI.Source(SOURCE)`);
 assert.equal(v.get('WoWAIAdventureUI.session'),v.get('WoWAIAdventure.DayKey(SOURCE)'));assert.equal(v.get('WoWAIAdventureUI.source'),v.get('SOURCE.seq'));assert.equal(v.get('WoWAIAdventureUI.logTab'),'timeline');
 v.run(`WoWAIAdventureUI.session=nil;WoWAIAdventureUI.logTab='milestones';WoWAIAdventureUI.Render();WoWAIAdventure.ToggleRecording()`);
 const before=v.get('CHAR.seq');assert.equal(v.get("WoWAIAdventure.AddNote('不能丢失',false)"),'nil');assert.equal(v.get('CHAR.seq'),before);
});
test('kill experience records names and party participation, excludes unnamed gains and damage',()=>{
 const v=vm();v.run(`WoWAIKills.XP('野猪死亡，你获得100点经验值。',51);WoWAIKills.XP('野猪死亡，你获得100点经验值。',51);WoWAIKills.XP('野猪死亡，你获得了80点经验值。（+20点组队奖励）',52);WoWAIKills.XP('你获得了100点经验值。',53);WoWAIKills.XP('火球术击中野猪，造成100点伤害。',54)`);
 const kills=v.json('CHAR.recent').filter(x=>x.kind==='kill');assert.equal(kills.length,2);assert.equal(kills[0].data.name,'野猪');assert.equal(kills[0].data.xp,100);assert.equal(kills[0].data.source,'xp_message');
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'2');assert.equal(v.get('CHAR.recent[1].data.killCoverage'),'xp-and-observed-targets');
});
test('observed zero-XP deaths need participation and ownership; XP and target observations pair once',()=>{
 const v=vm();v.run(`STUB.mobGUID='Creature-0-1';STUB.threat=0;WoWAIKills.Observe('target');STUB.dead=true;WoWAIKills.Observe('target');WoWAIKills.Observe('target');WoWAIKills.XP('野猪死亡，你获得100点经验值。',61)`);
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'1');
 v.run(`STUB.mobGUID='Creature-0-2';STUB.dead=false;STUB.denied=true;WoWAIKills.Observe('target');STUB.dead=true;WoWAIKills.Observe('target')`);
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'1');
 v.run(`STUB.mobGUID='Creature-0-3';STUB.dead=false;STUB.denied=false;STUB.threat=nil;WoWAIKills.Observe('target');STUB.dead=true;WoWAIKills.Observe('target')`);
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'1');
 v.run(`STUB.mobGUID='Creature-0-4';STUB.dead=false;STUB.threat=0;WoWAIKills.Observe('target');STUB.dead=true;WoWAIKills.Observe('target')`);
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'2');
});
test('same-name packs are counted individually in either source order and paused kills stay paused',()=>{
 const v=vm();v.run(`WoWAIKills.XP('野猪死亡，你获得100点经验值。',71);WoWAIKills.XP('野猪死亡，你获得100点经验值。',72);STUB.threat=0;for i=1,2 do STUB.mobGUID='Creature-pack-'..i;STUB.dead=false;WoWAIKills.Observe('target');STUB.dead=true;WoWAIKills.Observe('target')end`);
 assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'2');
 v.run(`WoWAIAdventure.ToggleRecording();WoWAIKills.XP('野猪死亡，你获得100点经验值。',73)`);assert.equal(v.get('CHAR.sessions[#CHAR.sessions].kills'),'2');
});
test('localized positional XP formats are parsed without interpreting quest or gathering XP as kills',()=>{
 const v=vm(`COMBATLOG_XPGAIN_FIRSTPERSON='%2$d XP from %1$s.'`);v.run(`WoWAIKills.XP('100 XP from Boar.',81)`);
 const kills=v.json('CHAR.recent').filter(e=>e.kind==='kill');assert.equal(kills.length,1);assert.equal(kills[0].data.name,'Boar');
});
test('self loot includes quantity, location and rare-item milestone; other player loot is excluded',()=>{
 const v=vm();v.run(`C_Item.GetItemInfo=function()return '蓝色披风',nil,3 end;WoWAIAdventure.Event('CHAT_MSG_LOOT','你获得了物品：|cff0070dd|Hitem:123:0|h[蓝色披风]|h|rx3。');WoWAIAdventure.Event('CHAT_MSG_LOOT','队友获得了物品：|cff0070dd|Hitem:123:0|h[蓝色披风]|h|rx2。')`);
 const loot=v.json('CHAR.recent').filter(x=>x.kind==='loot');assert.equal(loot.length,1);assert.equal(loot[0].data.count,3);assert.equal(loot[0].data.position.zone,'Duskwood');
 const ms=v.json('WoWAIAdventure.Milestones(CHAR.recent)');assert.equal(ms.at(-1).event.seq,loot[0].seq);
});
test('a long unsynced journal continues saving notes beyond the old buffer cap',()=>{
 const v=vm();v.run(`WoWAI.SelectTab('log');for i=1,10000 do WoWAIAdventureDB.queue[i]={} end;WoWAIJournalNote:SetText('需要保留的手记');WoWAIAdventureUI.logs.note.scripts.OnClick()`);
 assert.equal(v.get('WoWAIJournalNote:GetText()'),'');
 assert.equal(v.get('CHAR.recent[#CHAR.recent].data.text'),'需要保留的手记');
 assert.equal(v.get('#WoWAIAdventureDB.queue'),'10001');
 assert.equal(v.get('CHAR.days[WoWAIAdventureUI.session].events[#CHAR.days[WoWAIAdventureUI.session].events].data.text'),'需要保留的手记');
});

test('automatic plan uses a separate chat and real slot replies update tasks without stealing the draft',()=>{
 const v=vm();v.run(`WoWAI.IsConnected=function()return true end;WoWAI.SelectTab('tasks');WoWAIInput:SetText('保留草稿');ACTIVE=WoWAIDB.activeChat;WoWAIAdventure.SendPlan();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();for _,c in ipairs(WoWAIDB.chats)do if c.id==WoWAIDB.plannerChat then PC=c end end`);
 assert.equal(v.get('WoWAIDB.activeChat'),v.get('ACTIVE'));assert.equal(v.get('WoWAIInput:GetText()'),'保留草稿');assert.equal(v.get('WoWAIAdventureUI.tasks:IsVisible()'),'true');assert.notEqual(v.get('PC.pendingId'),'nil');
 v.run(`STUB.onLoadAddOn=function()WoWAI_SlotData={now=time(),replies={{chat=PC.id,id=PC.pendingId,status='done',text='规划完成',planSnapshot=CHAR.plan.id,plan={ledger=CHAR.ledger,snapshot=CHAR.plan.id,summary='先交后做',steps={{questID=2,reason='先交付',action='交任务'},{questID=1,reason='顺路',action='收集',waypoint={m=1431,x=50,y=50}}}}}}}end;WoWAI.Send('',nil,PC)`);
 assert.equal(v.get('CHAR.plan.ai'),'true');assert.equal(v.get('CHAR.plan.order[1]'),'2');assert.equal(v.get('PC.pendingId'),'nil');assert.equal(v.get('WoWAIDB.activeChat'),v.get('ACTIVE'));assert.equal(v.get('WoWAIInput:GetText()'),'保留草稿');
});

test('adventure draft button syncs once, preserves chat input and displays a real serialized reply in its session',()=>{
 const P=require('../bridge/protocol'),v=vm();
 v.run(`WoWAI.IsConnected=function()return true end;WoWAI.SelectTab('log');WoWAIInput:SetText('聊天草稿不动');ACTIVE=WoWAIDB.activeChat
 WoWAIJournalNote:SetText('第一次在路口迷路');WoWAIAdventureUI.logs.note.scripts.OnClick();SESSION=WoWAIAdventureUI.session
 WoWAIAdventureUI.logs.review.scripts.OnClick();WoWAIAdventureUI.logs.review.scripts.OnClick()`);
 assert.equal(v.get('WoWAIDB.outbox'),'nil','wait for durable sync before any AI call');
 v.run('WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();for _,c in ipairs(WoWAIDB.chats)do if c.id==WoWAIDB.draftChat then DC=c end end');
 assert.match(v.get('DC.history[#DC.history].text'),/^\[WOWAI_DRAFT:/);assert.equal(v.get('WoWAIDB.activeChat'),v.get('ACTIVE'));assert.equal(v.get('WoWAIInput:GetText()'),'聊天草稿不动');
 assert.equal(v.get('WoWAIAdventure.CanPlan()'),'false');
 const identity={ledger:v.get('CHAR.ledger'),session:v.get('SESSION'),through:Number(v.get('CHAR.draftRequest.through')),locale:'zhCN'};
 const reply={chat:v.get('DC.id'),id:Number(v.get('DC.pendingId')),status:'done',text:'底稿已完成',draftRequest:identity,draft:{...identity,title:'路口的冒险',body:'我在路口记下了第一次迷路的经历。',file:'C:/archive/draft.md'}};
 v.run(P.luaTable('TESTREPLY',[reply]));v.run("STUB.onLoadAddOn=function()WoWAI_SlotData=TESTREPLY end;WoWAI.Send('',nil,DC)");
 assert.equal(v.get('CHAR.drafts[SESSION].body'),'我在路口记下了第一次迷路的经历。');assert.equal(v.get('WoWAIAdventureUI.logs.storyText:IsShown()'),'true');
 assert.match(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),/路口的冒险/);assert.equal(v.get('WoWAIAdventure.CanPlan()'),'true');
 assert.equal(v.get('WoWAIInput:GetText()'),'聊天草稿不动');assert.equal(v.get('WoWAIAdventureUI.logs:IsVisible()'),'true');
});

test('draft result matches saved request across UI reload and cannot overwrite another session',()=>{
 const v=vm();v.run(`WoWAI.IsConnected=function()return true end;WoWAIAdventure.Draft();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();FLIGHT=CHAR.draftRequest;SESSION=FLIGHT.session;WoWAIAdventure.Begin(true)`);
 v.run(`BAD={id=FLIGHT.requestID,status='done',draftRequest={ledger=CHAR.ledger,session='another',through=FLIGHT.through},draft={body='错误底稿'}};WoWAIAdventure.DraftReply(BAD)`);
 assert.equal(v.get('CHAR.drafts'),'nil');assert.notEqual(v.get('CHAR.draftRequest'),'nil');
 v.run(`GOOD={id=FLIGHT.requestID,status='done',draftRequest={ledger=CHAR.ledger,session=SESSION,through=FLIGHT.through},draft={ledger=CHAR.ledger,session=SESSION,through=FLIGHT.through,title='原来的冒险',body='保留在原来这次冒险。',file='draft.md'}};WoWAIAdventure.DraftReply(GOOD)`);
 assert.equal(v.get('CHAR.drafts[SESSION].title'),'原来的冒险');assert.equal(v.get('#CHAR.sessions'),'1');
 v.run('STUB.now=STUB.now+1;WoWAIAdventure.Begin(false);WoWAI.SelectTab("log");WoWAIAdventureUI.session=CHAR.sessions[#CHAR.sessions].id;WoWAIAdventureUI.Render()');
 assert.equal(v.get('#CHAR.sessions'),'2');assert.doesNotMatch(v.get('WoWAIAdventureUI.logs.storyText:GetText()'),/保留在原来这次冒险/);
});

test('multi-part draft progress refreshes timeout only for new matching heartbeat receipts',()=>{
 const v=vm(),P=require('../bridge/protocol');v.run(`WoWAI.IsConnected=function()return true end;WoWAIAdventure.Draft();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();FLIGHT=CHAR.draftRequest`);
 const request={ledger:v.get('CHAR.ledger'),session:v.get('FLIGHT.session'),through:Number(v.get('FLIGHT.through'))};
 v.run(P.luaTable('PROGRESS',[{id:Number(v.get('FLIGHT.requestID')),status:'working',draftRequest:request,draftProgress:{part:2,total:4,stamp:1000}}]));
 v.run('STUB.now=STUB.now+550;WoWAIAdventure.DraftReply(PROGRESS.replies[1]);WoWAIAdventure.Tick()');
 assert.match(v.get('WoWAIAdventure.DraftStatus()'),/2 \/ 4/);assert.notEqual(v.get('CHAR.draftRequest'),'nil');
 v.run('STUB.now=STUB.now+601;WoWAIAdventure.DraftReply(PROGRESS.replies[1]);WoWAIAdventure.Tick()');
 assert.equal(v.get('CHAR.draftRequest'),'nil');assert.match(v.get('CHAR.draftError'),/超时/);
});
