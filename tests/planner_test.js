'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const Planner=require('../bridge/planner'),P=require('../bridge/protocol');
test('route prompt language follows snapshot locale while preserving protocol field names',()=>{
 const identity={snapshot:'one'},snap={player:{locale:'enUS'},quests:[{id:1,title:'Quest',locations:[]}]};
 const prompt=Planner.prompt(identity,snap);assert.match(prompt,/English。summary、reason、action 必须使用英文/);assert.match(prompt,/"snapshot":"one"/);
 snap.player.locale='zhCN';assert.match(Planner.prompt(identity,snap),/简体中文。summary、reason、action 使用中文/);
 snap.player.locale='zhTW';assert.match(Planner.prompt(identity,snap),/繁體中文。summary、reason、action 必須使用繁體中文/);
});
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
function vm(){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 function run(s,arg){if(lauxlib.luaL_loadstring(L,to_luastring(s))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));if(arg)lua.lua_pushstring(L,to_luastring(arg));if(lua.lua_pcall(L,arg?1:0,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));}
 function get(e){run('RESULT=tostring('+e+')');lua.lua_getglobal(L,to_luastring('RESULT'));const s=to_jsstring(lua.lua_tostring(L,-1));lua.lua_pop(L,1);return s;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));run("STUB.locale='zhCN'");
 run(`QUESTS={{questID=905,title='狂暴的镰爪龙',level=17},{questID=924,title='恶魔之种',level=14},{questID=99052,title='来自深海的威胁',level=12}}
 function UnitGUID()return 'Player-123'end
 C_QuestLog={GetNumQuestLogEntries=function()return #QUESTS,#QUESTS end,GetInfo=function(i)return QUESTS[i]end,IsComplete=function(id)return id==924 end,GetQuestObjectives=function(id)return {{text='目标一',type='object',finished=STUB.done==true},{text='目标二',type='object',finished=false}}end}
 WoWAIAdventurePage=CreateFrame('Frame',nil,UIParent)
 WoWAIMap={StopAdventure=function()end,SetAdventureRoute=function(route)STUB.route=route end}
 WoWAI={Send=function(s)STUB.sent=s;STUB.calls=(STUB.calls or 0)+1 end,AdventureCanSend=function()return true end}
 `);
 for(const f of ['Locale.lua','QuestLocations.lua','Adventure.lua','AdventureUI.lua'])run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI',f),'utf8'),'WoWAI');
 run(`WoWAIAdventure.Event('ADDON_LOADED','WoWAI');WoWAIAdventure.Event('PLAYER_ENTERING_WORLD',true,false);CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Plan()`);
 const json=e=>JSON.parse(get('WoWAIAdventure.JSON('+e+')'));
 function send(){run('WoWAIAdventure.SendPlan();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()');return {identity:{ledger:get('CHAR.ledger'),snapshot:get('CHAR.plan.id')},snap:json('CHAR.plan')};}
 function reply(plan){run(P.luaTable('REPLY',[{id:1,status:'done',text:'ok',plan,planSnapshot:plan.snapshot}]));run('WoWAIAdventure.PlanReply(REPLY.replies[1])');}
 return {run,get,json,send,reply};
}
function answer(identity,quests){return '```wowplan\n'+JSON.stringify({snapshot:identity.snapshot,summary:'顺路交付，再处理邻近目标',steps:quests.map(q=>({questID:q.id,locationKey:Planner.candidates(q)[0]?.key||'',reason:'顺路',action:'按当前目标完成'}))})+'\n```';}

function regionPlan(v){
 v.run(`QUESTS={{questID=100001,title='岸边收集'},{questID=100002,title='岸边清怪'},{questID=100003,title='山上任务'},{questID=100004,title='别的地图'},{questID=962,title='毒蛇花'}};DONE={}
 C_QuestLog.IsComplete=function(id)return DONE[id]==true end
 C_QuestLog.GetQuestObjectives=function(id)return {{text='目标',type='monster',finished=DONE[id]==true}}end
 C_QuestLog.GetNextWaypoint=function(id)if id==100004 then return 1413,.4,.4 elseif DONE[id] then return 1431,.8,.8 elseif id==100001 then return 1431,.1,.1 elseif id==100002 then return 1431,.12,.12 else return 1431,.6,.6 end end
 WoWAIMap.SetAdventureRoute=function(route,index,displayOnly)STUB.route=route;if not displayOnly then STUB.nav=index or 1 end end
 WoWAIMap.AdventureStatus=function()return STUB.nav end
 WoWAIMap.StopAdventure=function()STUB.nav=nil end
 WoWAIAdventure.SendPlan(false,true);WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()`);
 const identity={ledger:v.get('CHAR.ledger'),snapshot:v.get('CHAR.plan.id')},snap=v.json('CHAR.plan');
 const eligible=v.json('WoWAIAdventure.PlanningQuests(CHAR.plan)');
 const raw={snapshot:identity.snapshot,summary:'先岸边合做，再去山上',steps:eligible.map(q=>({questID:q.id,locationKey:q.locations[0].key,region:q.id===100003?'山上':'岸边',reason:'沿途合做',action:'完成目标'}))};
 v.reply(Planner.parse('```wowplan\n'+JSON.stringify(raw)+'\n```',identity,snap));
 return {identity,snap,raw};
}

test('WoW 14-digit JSON coordinates retain the selected candidate and numbered route',()=>{
 const v=vm();v.run(`QUESTS={{questID=100010,title='诅咒神教'}};
 C_QuestLog.GetNextWaypoint=function()return 1431,.6785799860954285,.6464729905128479 end
 WoWAIAdventure.SendPlan(false,true);WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()
 local build=WoWAIAdventure.BuildRegions;WoWAIAdventure.BuildRegions=function()build();STUB.built=#CHAR.plan.regions end`);
 const identity={ledger:v.get('CHAR.ledger'),snapshot:v.get('CHAR.plan.id')};
 const snap=v.json('CHAR.plan');
 // WoW Lua 5.1 tostring uses fewer digits than Fengari: emulate the actual wire.
 for(const q of snap.quests)for(const w of q.locations){w.x=Number(w.x.toPrecision(14));w.y=Number(w.y.toPrecision(14));}
 const plan=Planner.parse(answer(identity,snap.quests),identity,snap);
 assert.equal(plan.steps[0].waypoint.key,snap.quests[0].locations[0].key);
 v.reply(plan);
 assert.equal(v.get('STUB.built'),'1','coordinates must survive before refresh/recovery');
 assert.equal(v.get('#CHAR.plan.regions'),'1');assert.equal(v.get('CHAR.plan.unplanned'),'0');
 assert.equal(v.get('CHAR.plan.route[1].x==CHAR.plan.quests[1].locations[1].x'),'true');
 assert.equal(v.get('WoWAIAdventure.StartNavigation(100010)'),'true');
});

test('an old empty area route recovers from known quest coordinates without another AI call',()=>{
 const v=vm();regionPlan(v);v.run(`CHAR.plan.regions={};WoWAIAdventure.NavigationStopped();STUB.nav=nil`);
 assert.equal(v.get('#WoWAIAdventure.NavigationRoute(CHAR.plan)'),'3');
 assert.equal(v.get('WoWAIAdventure.StartNavigation(100001)'),'true');
 v.run(`WoWAIAdventure.NavigationStopped();STUB.nav=nil;WoWAIAdventure.RefreshLocations()`);
 assert.equal(v.get('#CHAR.plan.regions'),'2');assert.equal(v.get('CHAR.plan.unplanned'),'0');
 assert.equal(v.get('STUB.calls'),'1');assert.equal(v.get('STUB.nav'),'nil');
 assert.equal(v.get('WoWAIAdventure.StartNavigation(100001)'),'true');
});

test('current-map AI plan groups numbered areas and advances only after all area tasks complete',()=>{
 const v=vm(),{identity,snap,raw}=regionPlan(v);
 assert.equal(v.get('CHAR.plan.scopeMap'),'1431');assert.equal(v.get('#CHAR.plan.regions'),'2');assert.equal(v.get('#CHAR.plan.regions[1].members'),'2');assert.equal(v.get('STUB.nav'),'1');
 assert.deepEqual(v.json('CHAR.plan.order'),[100001,100002,100003]);assert.doesNotMatch(Planner.prompt(identity,snap),/"title":"别的地图"|毒蛇花/);
 v.run(`WoWAIAdventure.ScanQuests(true);DONE[100001]=true;WoWAIAdventure.Event('QUEST_LOG_UPDATE')`);
 assert.equal(v.get('STUB.nav'),'1');assert.equal(v.get('CHAR.plan.regions[1].closed'),'1');assert.equal(v.get('CHAR.plan.regions[3].kind'),'turnin');
 v.run(`DONE[100002]=true;WoWAIAdventure.Event('QUEST_LOG_UPDATE')`);
 assert.equal(v.get('STUB.nav'),'2');assert.equal(v.get('CHAR.plan.regions[1].done'),'true');assert.equal(v.get('CHAR.plan.regions[2].number'),'2');
 v.run('WoWAIAdventure.Begin(true)');assert.equal(v.get('STUB.nav'),'2');assert.equal(v.get('CHAR.plan.regions[1].done'),'true');assert.equal(v.get('STUB.calls'),'1');
 assert.equal(v.get('#CHAR.plan.regions[3].members'),'2','nearby turn-ins share one later stop');assert.equal(v.get('CHAR.plan.regions[3].done'),'false');
 v.run(`DONE[100003]=true;WoWAIAdventure.Event('QUEST_LOG_UPDATE')`);assert.equal(v.get('STUB.nav'),'3');
 for(const id of [100001,100002,100003])v.run(`WoWAIAdventure.Event('QUEST_TURNED_IN',${id})`);
 assert.equal(v.get('STUB.nav'),'nil');assert.equal(v.get('CHAR.plan.regionIndex'),'nil');assert.equal(v.get('STUB.calls'),'1','progress never automatically spends AI quota');
});

test('area progress survives refresh, leaves abandoned tasks labeled removed, and excludes newly accepted quests until replanned',()=>{
 const v=vm();regionPlan(v);v.run(`WoWAIAdventure.ScanQuests(true);table.remove(QUESTS,1);WoWAIAdventure.Event('QUEST_LOG_UPDATE');WoWAIAdventure.Plan(false)`);
 assert.equal(v.get('CHAR.plan.regions[1].members[1].removed'),'true');assert.match(v.get('CHAR.plan.regions[1].detail'),/已移除/);assert.equal(v.get('STUB.nav'),'1');
 v.run(`QUESTS[#QUESTS+1]={questID=100009,title='新任务'};WoWAIAdventure.Event('QUEST_ACCEPTED',100009)`);
 assert.equal(v.get('CHAR.plan.unplanned'),'1');assert.equal(v.get('STUB.calls'),'1');assert.equal(v.get('#CHAR.plan.regions'),'2');
 v.run(`WoWAIAdventure.NavigationStopped();STUB.nav=nil;WoWAIAdventure.RefreshLocations()`);assert.equal(v.get('STUB.nav'),'nil','a stopped arrow stays stopped when locations update');
 v.run(`WoWAIAdventure.Show('tasks');WoWAIAdventureUI.quest=100002;WoWAIAdventureUI.NextTask()`);assert.equal(v.get('WoWAIAdventureUI.quest'),'100003');assert.equal(v.get('STUB.nav'),'nil');
 v.run(`QUESTS={{questID=100004,title='另一张地图的任务'}};C_Map.GetBestMapForUnit=function()return 1413 end;WoWAIAdventure.Event('QUEST_LOG_UPDATE');WoWAIAdventureUI.Render()`);
 assert.equal(v.get('WoWAIAdventureUI.tasks.ai:IsEnabled()'),'true','leaving the planned map must not disable planning the new map');
});

test('map-scoped parser rejects a candidate on another map even if observed and does not merge distant same-named areas',()=>{
 const v=vm(),{identity,snap,raw}=regionPlan(v);
 snap.quests[0].locations.push({key:'elsewhere',m:1413,x:1,y:1});raw.steps[0].locationKey='elsewhere';
 assert.throws(()=>Planner.parse('```wowplan\n'+JSON.stringify(raw)+'\n```',identity,snap),/不存在/);
 v.run(`for _,q in ipairs(CHAR.plan.quests)do q.region='同名区域'end;WoWAIAdventure.BuildRegions();WoWAIAdventure.UpdateRegions()`);
 assert.equal(v.get('#CHAR.plan.regions'),'2','far-away coordinates cannot collapse into one pin');
});

test('snapshot bypasses a large journal backlog, recovers dropped frames, and retains every journal event',t=>{
 const os=require('os'),{AdventureStore}=require('../bridge/adventure');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-plan-sync-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new AdventureStore(dir),v=vm();
 v.run(`STUB.epoch=${Math.floor(Date.now()/1000)-1000};for i=1,300 do WoWAIAdventure.Record('loot',{itemID=i,name='测试拾取'}) end
 QUESTS={};for i=1,27 do QUESTS[i]={questID=100000+i,title='测试任务 '..i} end
 QUESTS[28]={questID=5728,title='隐藏的敌人'}
 C_QuestLog.GetQuestObjectives=function()return {{text=string.rep('收集目标',80),type='object',finished=false}}end
 WoWAIAdventure.SendPlan();BASE=#WoWAIAdventureDB.queue`);
 const before=v.json('WoWAIAdventureDB.queue');
 let frames=0,dropped=0;
 for(;frames<180&&v.get('STUB.calls')==='nil';frames++){
   const wire=v.get('(WoWAIAdventure.NextWire())');
   if(wire!=='nil'){
     assert.ok(Buffer.byteLength(wire)<3200);
     if(frames%5===0)dropped++;
     else for(const p of JSON.parse(wire.slice(7)))store.ingestChunk(p);
   }
   if(frames%8===7){
     v.run(P.luaTable('ACK',[],{adventureAck:store.ack(),snapshotAck:store.snapshotAck()}));
     v.run('WoWAIAdventure.Ack(ACK.adventureAck,ACK.snapshotAck);WoWAIAdventure.Tick()');
   }
   v.run('STUB.now=STUB.now+0.75');
 }
 assert.ok(dropped>0);assert.ok(frames<180,'bounded retries under packet loss');assert.equal(v.get('STUB.calls'),'1');
 assert.equal(store.ack()[0].seq,0,'missing historical events never falsely acknowledged');
 const history=before.filter(r=>!JSON.parse(Buffer.from(r.hex,'hex').toString()).kind.startsWith('snapshot_'));
 assert.deepEqual(v.json('WoWAIAdventureDB.queue').slice(0,history.length),history,'unconfirmed historical observations remain available for logout export');
 assert.ok(v.json('WoWAIAdventureDB.queue').every(r=>!store.records.get(r.ledger)?.has(r.seq)),'durably received snapshot events no longer need retransmission');
 const ack=store.snapshotAck()[0];assert.equal(ack.ready,true);assert.equal(ack.received.length,29);
 const snap=store.snapshot(ack.ledger,ack.snapshot);assert.equal(snap.quests.length,27);assert.ok(snap.quests.every(q=>q.dungeon!==true));
 assert.ok(store.all().every(e=>e.kind.startsWith('snapshot_')),'only this snapshot crossed the pixel channel');
 const plan=Planner.parse(answer(ack,snap.quests),ack,snap);v.reply(plan);assert.equal(v.get('CHAR.plan.ai'),'true');
 t.diagnostic(`27 outdoor quests, 300 queued journal events, ${dropped} deliberately dropped frames: sync finished after ${frames} frames (${frames*.75} simulated seconds)`);
});

test('repeated stale receipts cannot rewind a multi-part packet or match another snapshot',()=>{
 const v=vm();v.run(`C_QuestLog.GetQuestObjectives=function()return {{text=string.rep('大型任务说明',300),finished=false}}end;WoWAIAdventure.SendPlan()`);
 const parts=[];
 for(let i=0;i<14;i++){
   const wire=v.get('(WoWAIAdventure.NextWire())');if(wire!=='nil')parts.push(...JSON.parse(wire.slice(7)));
   v.run(`WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=0}},{{ledger=CHAR.ledger,snapshot='old',ready=true,received={CHAR.seq}}})`);
 }
 assert.ok(parts.some(p=>p.part>=3),'a repeated ack must not trap transfer at part one');
 v.run('WoWAIAdventure.Tick()');assert.equal(v.get('STUB.calls'),'nil');assert.equal(v.get('WoWAIAdventure.PlanPhase()'),'syncing');
 assert.match(v.get('WoWAIAdventure.PlanningStatus()'),/同步当前任务：0\/5/);
});

test('manual button captures current quests once, leaves auto off and blocks duplicate clicks',()=>{
 const v=vm();v.run(`QUESTS[#QUESTS+1]={questID=887,title='新接任务'};WoWAIAdventure.Show('tasks');WoWAIAdventureUI.tasks.ai.scripts.OnClick();FIRST=CHAR.plan.id;SEQ=CHAR.seq;WoWAIAdventureUI.tasks.ai.scripts.OnClick()`);
 assert.equal(v.get('CHAR.autoPlan'),'false');assert.equal(v.get('#CHAR.plan.quests'),'4');assert.equal(v.get('CHAR.plan.id'),v.get('FIRST'));assert.equal(v.get('CHAR.seq'),v.get('SEQ'));
 assert.equal(v.get('WoWAIAdventureUI.tasks.ai:IsEnabled()'),'false');assert.equal(v.get('WoWAIAdventureUI.tasks.ai:GetText()'),'正在同步当前任务…');
 v.run("WoWAIAdventure.Event('QUEST_LOG_UPDATE')");assert.equal(v.get('CHAR.plan.stale'),'false','a delayed log event matching the captured snapshot must not invalidate it');
 v.run('WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();WoWAIAdventure.SendPlan()');
 assert.equal(v.get('STUB.calls'),'1');assert.equal(v.get('WoWAIAdventureUI.tasks.ai:GetText()'),'AI 正在规划…');
 const identity={ledger:v.get('CHAR.ledger'),snapshot:v.get('FIRST')},snap=v.json('CHAR.plan');v.reply(Planner.parse(answer(identity,v.json('WoWAIAdventure.PlanningQuests(CHAR.plan)')),identity,snap));
 v.run('STUB.now=STUB.now+120;WoWAIAdventure.Tick()');assert.equal(v.get('STUB.calls'),'1');assert.equal(v.get('CHAR.autoPlan'),'false');
});

test('manual stale reply is discarded without automatically purchasing a replacement',()=>{
 const v=vm(),{identity,snap}=v.send(),old=Planner.parse(answer(identity,snap.quests),identity,snap);
 v.run(`QUESTS[#QUESTS+1]={questID=887,title='新任务'};WoWAIAdventure.Event('QUEST_ACCEPTED',887);STUB.now=STUB.now+4;WoWAIAdventure.Tick()`);v.reply(old);
 v.run('STUB.now=STUB.now+120;WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()');
 assert.equal(v.get('STUB.calls'),'1');assert.notEqual(v.get('CHAR.plan.ai'),'true');assert.match(v.get('WoWAIAdventure.PlanningStatus()'),/旧结果未应用/);
 const next=v.send();assert.equal(next.snap.quests.length,4);assert.equal(v.get('STUB.calls'),'2');assert.equal(v.get('CHAR.autoPlan'),'false');
});

test('auto switch only handles future changes and switching off does not cancel a manual sync',()=>{
 const v=vm();v.run('WoWAIAdventure.ToggleAutoPlan();STUB.now=STUB.now+40;WoWAIAdventure.Tick()');assert.equal(v.get('STUB.calls'),'nil');
 v.run('WoWAIAdventure.SendPlan();WoWAIAdventure.ToggleAutoPlan();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()');
 assert.equal(v.get('CHAR.autoPlan'),'false');assert.equal(v.get('STUB.calls'),'1');assert.equal(v.get('WoWAIAdventure.PlanPhase()'),'planning');
});

test('switching auto off cancels queued automatic sync while local task refresh continues',()=>{
 const v=vm();v.run(`WoWAIAdventure.ToggleAutoPlan();QUESTS[#QUESTS+1]={questID=887,title='新任务'};WoWAIAdventure.Event('QUEST_ACCEPTED',887);STUB.now=STUB.now+4;WoWAIAdventure.Tick()`);
 assert.equal(v.get('WoWAIAdventure.PlanPhase()'),'syncing');
 v.run(`WoWAIAdventure.ToggleAutoPlan();table.remove(QUESTS,2);WoWAIAdventure.Event('QUEST_REMOVED',924);STUB.now=STUB.now+40;WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()`);
 assert.equal(v.get('STUB.calls'),'nil');assert.equal(v.get('#CHAR.plan.quests'),'3');assert.equal(v.get('CHAR.plan.stale'),'false');
});

test('canceling a manual sync preserves auto preference and does not requeue the canceled request',()=>{
 const v=vm();v.run('WoWAIAdventure.ToggleAutoPlan();WoWAIAdventure.SendPlan();WoWAIAdventure.CancelSync();STUB.now=STUB.now+40;WoWAIAdventure.Tick()');
 assert.equal(v.get('CHAR.autoPlan'),'true');assert.equal(v.get('STUB.calls'),'nil');
 v.run(`QUESTS[#QUESTS+1]={questID=887,title='新任务'};WoWAIAdventure.Event('QUEST_ACCEPTED',887);STUB.now=STUB.now+4;WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()`);
 assert.equal(v.get('STUB.calls'),'1');
});

test('legacy implicit opt-in resets once and later explicit choice survives reload without an idle AI request',()=>{
 const v=vm();v.run('CHAR.independentPlanning=nil;CHAR.autoPlan=true;WoWAIAdventure.Begin(true)');assert.equal(v.get('CHAR.autoPlan'),'false');assert.equal(v.get('CHAR.autoPlanBeforeIndependent'),'true');
 v.run('WoWAIAdventure.ToggleAutoPlan();WoWAIAdventure.Begin(true);STUB.now=STUB.now+60;WoWAIAdventure.Tick()');
 assert.equal(v.get('CHAR.autoPlan'),'true');assert.equal(v.get('STUB.calls'),'nil');
});

test('manual request is not retried when synchronization times out',()=>{
 const v=vm();v.run('WoWAIAdventure.SendPlan();STUB.now=STUB.now+241;WoWAIAdventure.Tick();STUB.now=STUB.now+60;WoWAIAdventure.Tick()');
 assert.equal(v.get('STUB.calls'),'nil');assert.equal(v.get('WoWAIAdventure.CanPlan()'),'true');assert.equal(v.get('CHAR.autoPlan'),'false');assert.match(v.get('WoWAIAdventure.PlanningStatus()'),/同步未完成/);
});
test('Forever reference automatically resolves objectives and separate turn-in locations; unknown quests remain listed',()=>{
 const v=vm(),qs=v.json('CHAR.plan.quests');
 assert.equal(qs[0].waypoint.m,1413);assert.match(qs[1].waypoint.source,/EverythingQuests/);assert.equal(qs[2].waypoint,undefined);
 assert.equal(v.get('#CHAR.plan.order'),'3');assert.equal(v.get('STUB.sent'),'nil');
 v.run("WoWAIAdventure.Show('tasks')");assert.equal(v.get('WoWAIAdventureUI.tasks.marker'),'nil');assert.equal(v.get('#WoWAIAdventureUI.tasks.list.rows'),'3');
 v.run('WoWAIQuestLocations[905].objective={{1413,40,40,2,1},{1413,50,50,2,2}};WoWAIAdventure.Plan()');
 const before=v.json('CHAR.plan.quests[1].locations').map(p=>p.key);v.run("STUB.done=true;WoWAIAdventure.Plan()");const after=v.json('CHAR.plan.quests[1].locations').map(p=>p.key);
 assert.ok(after.length>0);assert.ok(before.some(k=>!after.includes(k)),'completed objective candidates removed');
});
test('native map POIs win over reference data and never read player markers',()=>{
 const v=vm();v.run(`C_Map.GetUserWaypoint=function()error('manual marker must not be read')end;C_QuestLog.GetQuestsOnMap=function(m)return {{questID=905,x=.12,y=.34}}end;WoWAIAdventure.Plan()`);
 assert.equal(v.get('CHAR.plan.quests[1].waypoint.x'),'12.0');assert.equal(v.get('CHAR.plan.quests[1].waypoint.source'),'游戏地图任务标记');
});
test('AI order, reasons and selected coordinates round trip through real Lua reply serializer',()=>{
 const v=vm(),{identity,snap}=v.send();const reversed=[...snap.quests].reverse();
 const plan=Planner.parse(answer(identity,reversed),identity,snap);v.reply(plan);
 assert.equal(v.get('CHAR.plan.ai'),'true');assert.equal(v.get('CHAR.plan.order[1]'),'99052');assert.equal(v.get('CHAR.plan.quests[1].reason'),'顺路');assert.equal(v.get('#CHAR.plan.route'),'2');
 assert.equal(v.get('WoWAIAdventure.StartNavigation(905)'),'true');assert.equal(v.get('#STUB.route'),'2');
});
test('new quest invalidates in-flight AI result and sends one merged replacement after cooldown',()=>{
 const v=vm();v.run('WoWAIAdventure.ToggleAutoPlan()');const {identity,snap}=v.send(),old=Planner.parse(answer(identity,snap.quests),identity,snap);
 v.run(`QUESTS[#QUESTS+1]={questID=887,title='南海海盗',level=14};WoWAIAdventure.Event('QUEST_ACCEPTED',887);WoWAIAdventure.Event('QUEST_LOG_UPDATE');STUB.now=STUB.now+4;WoWAIAdventure.Tick()`);
 assert.equal(v.get('#CHAR.plan.quests'),'4');v.reply(old);assert.notEqual(v.get('CHAR.plan.ai'),'true');
 v.run('STUB.now=STUB.now+31;WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick()');
 assert.equal(v.get('STUB.calls'),'2');v.run('STUB.now=STUB.now+31;WoWAIAdventure.Tick()');assert.equal(v.get('STUB.calls'),'2');
});
test('turn-in and removed tasks cause automatic replanning; disabled auto never calls AI',()=>{
 const v=vm();v.run("table.remove(QUESTS,2);WoWAIAdventure.Event('QUEST_TURNED_IN',924);WoWAIAdventure.Event('QUEST_LOG_UPDATE');STUB.now=STUB.now+4;WoWAIAdventure.Tick()");
 assert.equal(v.get('#CHAR.plan.quests'),'2');assert.equal(v.get('STUB.sent'),'nil');
});
test('reference coordinates are disabled for other client versions',()=>{
 const v=vm();v.run("GetBuildInfo=function()return '1.15.7' end;WoWAIAdventure.Plan()");assert.equal(v.get('#CHAR.plan.route'),'0');
});
test('newly available game POIs fill missing positions without any manual marker',()=>{
 const v=vm();v.run(`C_QuestLog.GetQuestsOnMap=function(m)return {{questID=99052,x=.3,y=.4}}end;WoWAIAdventure.Event('QUEST_POI_UPDATE');STUB.now=STUB.now+4;WoWAIAdventure.Tick()`);
 assert.equal(v.get('#CHAR.plan.route'),'3');assert.equal(v.get('STUB.sent'),'nil');
});
test('model cannot invent coordinates, quest IDs, duplicate tasks or reuse an old snapshot',()=>{
 const v=vm(),{identity,snap}=v.send();const raw=JSON.parse(answer(identity,snap.quests).match(/```wowplan\s*([\s\S]*?)```/)[1]);
 const block=x=>'```wowplan\n'+JSON.stringify(x)+'\n```';
 assert.throws(()=>Planner.parse(block({...raw,snapshot:'old'}),identity,snap),/快照/);
 const duplicate=structuredClone(raw);duplicate.steps[1]=duplicate.steps[0];assert.throws(()=>Planner.parse(block(duplicate),identity,snap),/重复/);
 const fake=structuredClone(raw);fake.steps[0].locationKey='invented';fake.steps[0].x=12;assert.throws(()=>Planner.parse(block(fake),identity,snap),/不存在/);
 raw.steps[0].waypoint={m:1,x:99,y:99};const safe=Planner.parse(block(raw),identity,snap);assert.equal(safe.steps[0].waypoint.m,1413);
});

test('all four current dungeon quests are skipped including completed quests, and all-skipped never calls AI',()=>{
 const v=vm();v.run(`QUESTS={{questID=962,title='毒蛇花'},{questID=959,title='港口的麻烦'},{questID=5728,title='隐藏的敌人'},{questID=5761,title='饥饿者塔拉加曼'}};C_QuestLog.IsComplete=function(id)return id==962 end;WoWAIAdventure.Plan();WoWAIAdventure.Show('tasks');WoWAIAdventureUI.group='skipped';WoWAIAdventureUI.Render();WoWAIAdventure.SendPlan();WoWAIAdventure.Tick()`);
 assert.equal(v.get('#CHAR.plan.order'),'0');assert.equal(v.get('#CHAR.plan.route'),'0');assert.equal(v.get('#CHAR.plan.missing'),'0');assert.equal(v.get('#WoWAIAdventureUI.tasks.list.rows'),'4');assert.equal(v.get('WoWAIAdventureUI.tasks.ai:IsEnabled()'),'false');assert.equal(v.get('STUB.sent'),'nil');assert.equal(v.get('WoWAIAdventure.StartNavigation(962)'),'false');
 assert.ok(v.json('CHAR.plan.quests').every(q=>q.dungeon));
});
test('live dungeon/raid tags exclude new tasks while outdoor elite group tasks remain eligible',()=>{
 const v=vm();v.run(`QUESTS={{questID=100001,title='新副本'},{questID=100002,title='新团本'},{questID=100003,title='野外精英',suggestedGroup=5}};C_QuestLog.GetQuestTagInfo=function(id)if id==100001 then return {worldQuestType=6} elseif id==100002 then return {worldQuestType=8} else return {tagName='精英'} end end;WoWAIAdventure.Plan()`);
 assert.equal(v.get('#CHAR.plan.order'),'1');assert.equal(v.get('CHAR.plan.order[1]'),'100003');assert.equal(v.get('CHAR.plan.quests[3].dungeon'),'false');
});
test('AI payload excludes dungeon quests and rejects an AI result trying to restore them',()=>{
 const v=vm();v.run(`QUESTS[#QUESTS+1]={questID=962,title='毒蛇花'};WoWAIAdventure.Plan()`);
 const {identity,snap}=v.send(),eligible=snap.quests.filter(q=>!q.dungeon),prompt=Planner.prompt(identity,snap);
 assert.ok(!prompt.includes('毒蛇花'));assert.match(prompt,/跳过所有副本/);
 const parsed=Planner.parse(answer(identity,eligible),identity,snap);v.reply(parsed);assert.equal(v.get('CHAR.plan.ai'),'true');assert.equal(v.get('#CHAR.plan.order'),'3');
 const wrong=[...eligible];wrong[0]=snap.quests.at(-1);assert.throws(()=>Planner.parse(answer(identity,wrong),identity,snap),/未知/);
});
test('dungeon header recognition works without data and invalidates an older in-flight plan',()=>{
 const v=vm(),{identity,snap}=v.send(),old=Planner.parse(answer(identity,snap.quests),identity,snap);
 v.run(`C_QuestLog.GetQuestTagInfo=function(id)if id==905 then return {tagName='地下城'} end end;WoWAIAdventure.Event('QUEST_LOG_UPDATE');STUB.now=STUB.now+4;WoWAIAdventure.Tick()`);v.reply(old);
 assert.notEqual(v.get('CHAR.plan.ai'),'true');assert.equal(v.get('WoWAIAdventure.StartNavigation(905)'),'false');
 v.run(`QUESTS={{isHeader=true,title='哀嚎洞穴'},{questID=123456,title='新增副本任务'}};C_QuestLog.GetNumQuestLogEntries=function()return 2,1 end;WoWAIAdventure.Plan()`);assert.equal(v.get('CHAR.plan.quests[1].dungeon'),'true');assert.equal(v.get('#CHAR.plan.order'),'0');
});
