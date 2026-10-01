'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const root=path.join(__dirname,'../addon/WoWAI');
function vm(client='enUS',setting='auto'){
 const state=lauxlib.luaL_newstate();lualib.luaL_openlibs(state);
 function run(src,arg){if(lauxlib.luaL_loadstring(state,to_luastring(src))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(state,-1)));if(arg)lua.lua_pushstring(state,to_luastring(arg));if(lua.lua_pcall(state,arg?1:0,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(state,-1)));}
 function get(expr){run('RESULT=tostring(('+expr+'))');lua.lua_getglobal(state,to_luastring('RESULT'));const s=to_jsstring(lua.lua_tostring(state,-1));lua.lua_pop(state,1);return s;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));run(`STUB.locale='${client}';function UnitFactionGroup()return 'Horde'end;function UnitClass()return 'Mage','MAGE',8 end;function UnitRace()return 'Undead','Scourge',5 end;function GetNumTalentTabs()return 3 end;function GetTalentTabInfo(i)return ({'Arcane','Fire','Frost'})[i],nil,i==3 and 11 or 0 end;function IsInInstance()return false end;C_QuestLog={GetNumQuestLogEntries=function()return 0,0 end,IsQuestFlaggedCompleted=function()return false end}`);
 // Read actual TOC order; no mock localization layer. SavedVariables arrive after files execute.
 const files=fs.readFileSync(path.join(root,'WoWAI.toc'),'utf8').split(/\r?\n/).filter(s=>s.endsWith('.lua'));
 for(const f of files)run(fs.readFileSync(path.join(root,f),'utf8'),'WoWAI');
 run(`WoWAIDB={settings={language='${setting}'},activeChat='keep',chats={{id='keep',name='连接测试',cwd='',history={{role='user',text='冒险日志 Ready 原文',t=1}},draft='未发送的草稿',created=1}}};STUB.FireEvent('ADDON_LOADED','WoWAI');STUB.FireEvent('PLAYER_LOGIN');STUB.FireEvent('PLAYER_ENTERING_WORLD',true,false)`);
 return {run,get};
}
test('actual TOC auto-detects Chinese and English clients, with safe fallback',()=>{
 for(const [client,want,label]of [['zhCN','zhCN','任务助手'],['zhTW','zhTW','任務助手'],['enUS','enUS','Quests'],['enGB','enUS','Quests'],['deDE','enUS','Quests']]){
  const v=vm(client);assert.equal(v.get('WoWAILocale.Get()'),want);v.run("WoWAI.SelectTab('tasks')");assert.equal(v.get('WoWAIAdventureUI.tasks.title:GetText()'),label);
  assert.equal(v.get('WoWAIDB.outbox'),'nil','opening localized UI must not call AI');
 }
});
test('manual override loaded after Lua files controls tabs, popups and log labels without rewriting user content',()=>{
 for(const [client,setting,title,popup,kind]of [['zhCN','enUS','Journal','Rename this chat','Kill'],['enUS','zhCN','冒险日志','重命名聊天','击杀'],['enUS','zhTW','冒險日誌','重新命名聊天','擊殺']]){
  const v=vm(client,setting);v.run("WoWAI.SelectTab('log')");assert.equal(v.get('WoWAIAdventureUI.logs.title:GetText()'),title);
  assert.equal(v.get('StaticPopupDialogs.WOWAI_RENAME.text'),popup);assert.equal(v.get('WoWAIAdventure.KindNames.kill'),kind);
  assert.equal(v.get('WoWAIDB.chats[1].name'),'连接测试');assert.equal(v.get('WoWAIDB.chats[1].history[1].text'),'冒险日志 Ready 原文');assert.equal(v.get('WoWAIInput:GetText()'),'未发送的草稿');
 }
});
test('language commands persist valid modes, reject invalid values locally and restore auto detection',()=>{
 const v=vm('zhCN');v.run(`SlashCmdList.WOWAI('language enUS')`);assert.equal(v.get('WoWAIDB.settings.language'),'enUS');
 assert.match(v.get('WoWAI.GameContext()'),/Preferred response language: English/);
 v.run(`SlashCmdList.WOWAI('language invalid')`);assert.equal(v.get('WoWAIDB.settings.language'),'enUS');assert.equal(v.get('WoWAIDB.outbox'),'nil');
 v.run(`SlashCmdList.WOWAI('language auto')`);assert.equal(v.get('WoWAILocale.Get()'),'zhCN');
 v.run('GetLocale=nil');assert.equal(v.get('WoWAILocale.Get()'),'enUS');
});
test('English dungeon rendering preserves Horde filtering and original matching aliases',()=>{
 const v=vm('enUS');v.run("WoWAI.SelectTab('dungeon')");assert.equal(v.get('WoWAIDungeonUI.sideTitle:GetText()'),'Ragefire Chasm');
 assert.equal(v.get("WoWAIDungeon.Match('怒焰裂谷').id"),v.get("WoWAIDungeon.Match('Ragefire Chasm').id"));
 assert.match(v.get('WoWAIDungeonUI.summary:GetText()'),/Horde/);assert.match(v.get('WoWAIDungeonUI.rows[1].body:GetText()'),/Accept from:/);
 v.run("for i,d in ipairs(WoWAIDungeonData.dungeons)do if d.id=='deadmines'then WoWAIDungeonUI.preview=i end end;WoWAIDungeonUI.Render()");
 assert.equal(v.get('WoWAIDungeonUI.rows[1].title:GetText()'),'No recorded quests for your faction');
 assert.equal(v.get('WoWAIDungeonData.dungeons[1].name'),'怒焰裂谷');
});
test('English class and talent APIs still evaluate Chinese reference stats and restrictions',()=>{
 const v=vm('enUS');v.run(`REF={id=123,name='测试法袍',nameEn='Test Robe',slot='胸部',type='布甲',level=1,classes='法师',stats={{label='智力',value=10}},effects={{trigger=1,text='提高所有法术和魔法效果所造成的伤害和治疗效果，最多12点。'}}};ITEM=WoWAIGear.Item(REF);PROFILE=WoWAIGear.Profile()`);
 assert.equal(v.get('WoWAIGear.Usable(ITEM,PROFILE)'),'true');assert.equal(v.get('ITEM.name'),'Test Robe');assert.equal(v.get('ITEM.stats.int'),'10');assert.equal(v.get('ITEM.stats.spell'),'12');assert.equal(v.get('PROFILE.school'),'frost');
 v.run("REF.classes='战士'");assert.equal(v.get('WoWAIGear.Usable(ITEM,PROFILE)'),'false');
});
test('catalog preserves formatting placeholders and well-formed color escapes',()=>{
 const c=require('../tools/locales.json');
 for(const map of Object.values(c))for(const [from,to]of Object.entries(map)){
  assert.deepEqual(to.match(/%[-+\d.]*[sdf]/g)||[],from.match(/%[-+\d.]*[sdf]/g)||[],from);
  assert.equal(to.includes('\ufffd'),false,from);assert.deepEqual(to.match(/\|c[0-9a-f]{8}|\|r/g)||[],from.match(/\|c[0-9a-f]{8}|\|r/g)||[],from);
 }
});

test('Traditional mode persists, sets AI language and preserves game data and player text',()=>{
 const v=vm('zhCN');v.run("SlashCmdList.WOWAI('language zhTW');WoWAI.SelectTab('dungeon')");
 assert.equal(v.get('WoWAIDB.settings.language'),'zhTW');assert.match(v.get('WoWAI.GameContext()'),/Traditional Chinese/);
 assert.equal(v.get("WoWAILocale.Text('位置待确认')"),'位置待確認');
 assert.equal(v.get("WoWAILocale.Field({name='测试法袍'})"),'测试法袍','unknown user strings must not be converted');
 assert.equal(v.get("WoWAILocale.Field(WoWAIDungeonData.dungeons[1].quests[1])"),'試探敵人');
 assert.equal(v.get('WoWAIDungeonData.dungeons[1].quests[1].name'),'试探敌人');
 assert.equal(v.get('WoWAIDB.chats[1].name'),'连接测试');
 v.run("SlashCmdList.WOWAI('language enUS')");
 assert.equal(v.get("WoWAIDungeon.Match('死亡礦井').id"),'deadmines','matching follows client names even under English UI override');
 assert.equal(v.get("WoWAIAdventure.IsDungeonQuest({area='黑暗深淵'}, {})"),'true');
});
