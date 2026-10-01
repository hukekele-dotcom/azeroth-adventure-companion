'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const P=require('../bridge/protocol');
function vm(prelude){
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 function run(code,arg){if(lauxlib.luaL_loadstring(L,to_luastring(code))!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));let n=0;if(arg!==undefined){lua.lua_pushstring(L,to_luastring(arg));n=1;}if(lua.lua_pcall(L,n,0,0)!==lua.LUA_OK)throw Error(to_jsstring(lua.lua_tostring(L,-1)));}
 function get(expr){run('RESULT=tostring('+expr+')');lua.lua_getglobal(L,to_luastring('RESULT'));const s=to_jsstring(lua.lua_tostring(L,-1));lua.lua_pop(L,1);return s;}
 run(fs.readFileSync(path.join(__dirname,'wow_stub.lua'),'utf8'));run("STUB.locale='zhCN'");
 if(prelude)run(prelude);
 run(`function UnitGUID() return 'Player-123' end
 QUESTS={{questID=1,title='中文任务',level=20,isHeader=false,suggestedGroup=0},{questID=2,title='远方任务',level=20,isHeader=false,suggestedGroup=0}}
 C_QuestLog={GetNumQuestLogEntries=function()return #QUESTS,#QUESTS end,GetInfo=function(i)return QUESTS[i] end,IsComplete=function(id)return id==2 end,GetQuestObjectives=function(id)return {{text='收集水：0/5',numFulfilled=0,numRequired=5,finished=false}}end,GetNextWaypoint=function(id)if id==1 then return 1431,.5,.5 end end}
 WoWAIMap={SetAdventureRoute=function(route)STUB.route=route end,StopAdventure=function()STUB.stopped=true end}
 WoWAIAdventurePage=CreateFrame('Frame','WoWAIAdventurePage',UIParent)
 WoWAI={Send=function(text)STUB.sent=text end,PollAdventure=function()STUB.polled=true end,AdventureCanSend=function()return true end,SkillLines=function()return {}end}
 `);
 run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI/Locale.lua'),'utf8'),'WoWAI');
 run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI/Adventure.lua'),'utf8'),'WoWAI');
 run(fs.readFileSync(path.join(__dirname,'../addon/WoWAI/AdventureUI.lua'),'utf8'),'WoWAI');
 run(`WoWAIAdventure.Event('ADDON_LOADED','WoWAI'); WoWAIAdventure.Event('PLAYER_ENTERING_WORLD',true,false)`);
 return {run,get,json:e=>JSON.parse(get('WoWAIAdventure.JSON('+e+')'))};
}
test('login records locally without any model call, milestones derive from events',()=>{const v=vm();assert.equal(v.get('STUB.sent'),'nil');v.run(`WoWAIAdventure.Event('PLAYER_LEVEL_UP',24)`);const c=v.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]');const ms=v.json('WoWAIAdventure.Milestones(WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)].recent)');assert.equal(ms.at(-1).event.seq,c.seq);assert.equal(ms.at(-1).event.kind,'level');});

test('login alive and release-spirit signals are not resurrections; real dead-to-alive records once',()=>{
 const v=vm(`STUB.dead=false;function UnitIsDeadOrGhost() return STUB.dead end`);
 v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Event('PLAYER_ALIVE');WoWAIAdventure.Event('PLAYER_UNGHOST');WoWAIAdventure.Tick()`);
 assert.equal(v.json('CHAR.recent').filter(e=>e.kind==='resurrect').length,0);
 v.run(`STUB.dead=true;WoWAIAdventure.Tick();WoWAIAdventure.Event('PLAYER_DEAD');WoWAIAdventure.Event('PLAYER_DEAD');WoWAIAdventure.Event('PLAYER_ALIVE')`);
 assert.equal(v.json('CHAR.recent').filter(e=>e.kind==='death').length,1);
 assert.equal(v.json('CHAR.recent').filter(e=>e.kind==='resurrect').length,0,'ghost release is still dead');
 v.run(`STUB.dead=false;WoWAIAdventure.Event('PLAYER_UNGHOST');WoWAIAdventure.Event('PLAYER_ALIVE');WoWAIAdventure.Tick()`);
 const revived=v.json('CHAR.recent').filter(e=>e.kind==='resurrect');assert.equal(revived.length,1);assert.equal(revived[0].data.confirmed,true);
});

test('logging in dead allows a later real resurrection without inventing a death at login',()=>{
 const v=vm(`STUB.dead=true;function UnitIsDeadOrGhost() return STUB.dead end`);
 v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Event('PLAYER_ALIVE');STUB.dead=false;WoWAIAdventure.Event('PLAYER_UNGHOST')`);
 const rows=v.json('CHAR.recent');assert.equal(rows[0].data.dead,true);assert.equal(rows.filter(e=>e.kind==='death').length,0);assert.equal(rows.filter(e=>e.kind==='resurrect').length,1);
});

test('login records zone subzone and coordinates; delayed location is an append-only observation',()=>{
 const v=vm(`STUB.zone='';STUB.subzone=''`);v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]`);
 const before=v.json('CHAR.recent')[0];assert.equal(before.kind,'session_start');assert.equal(before.data.position.zone,'');
 v.run(`STUB.now=STUB.now+2;STUB.zone='贫瘠之地';STUB.subzone='十字路口';WoWAIAdventure.Event('ZONE_CHANGED_NEW_AREA');WoWAIAdventure.Tick()`);
 const rows=v.json('CHAR.recent'),position=rows.find(e=>e.data.loginFor===before.seq);
 assert.ok(position);assert.equal(position.data.zone,'贫瘠之地');assert.equal(position.data.subzone,'十字路口');assert.equal(typeof position.data.x,'number');assert.deepEqual(rows[0],before,'do not mutate an already queued event');
 v.run(`STUB.now=STUB.now+20;STUB.zone='杜隆塔尔';WoWAIAdventure.Tick()`);assert.equal(v.json('CHAR.recent').filter(e=>e.data.loginFor).length,1);
 const ready=vm();const first=ready.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)].recent')[0];assert.ok(first.data.position.zone);assert.ok(first.data.position.subzone);
});

test('daily history survives recent-buffer eviction, durable acknowledgement and SavedVariables round trip',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];DAY=WoWAIAdventure.DayKey(CHAR.recent[1]);WoWAIAdventure.Record('note',{text='清晨出发'})
 for i=1,1205 do WoWAIAdventure.Record('heartbeat',{}) end
 WoWAIAdventure.Record('loot',{name='纪念品',count=2});WoWAIAdventure.Event('PLAYER_LOGOUT');WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}})`);
 const original=v.json('CHAR.days')[v.get('DAY')];assert.ok(original.events.some(e=>e.data.text==='清晨出发'));assert.ok(!v.json('CHAR.recent').some(e=>e.data.text==='清晨出发'));
 assert.equal(v.get('#WoWAIAdventureDB.queue'),'0');assert.equal(original.loot,2);assert.equal(original.events.at(-1).kind,'session_end');
 const saved=P.luaTable('RESTORED',[{id:1,status:'done',plan:v.json('WoWAIAdventureDB')}]);
 const restored=vm(saved+'\nWoWAIAdventureDB=RESTORED.replies[1].plan');
 const c=restored.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]');
 assert.equal(c.sessions.length,2);assert.ok(c.days[v.get('DAY')].events.some(e=>e.data.text==='清晨出发'));assert.equal(restored.get('STUB.sent'),'nil');
});

test('pause survives reload but a fresh login resumes recording and keeps the paused logout boundary',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.ToggleRecording();WoWAIAdventure.Begin(true)`);
 assert.equal(v.get('WoWAIAdventureDB.enabled'),'false');
 v.run(`WoWAIAdventure.Event('PLAYER_LOGOUT')`);assert.equal(v.get('CHAR.recent[#CHAR.recent].kind'),'session_end');
 v.run('STUB.now=STUB.now+20;WoWAIAdventure.Begin(false)');assert.equal(v.get('WoWAIAdventureDB.enabled'),'true');
 assert.equal(v.json('CHAR.recent').filter(e=>e.kind==='session_start').length,2);
});

test('old retained records migrate once without duplicating events or claiming complete historical coverage',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];CHAR.days=nil;DAYS=WoWAIAdventure.Days(CHAR);COUNT=#DAYS[1].events;WoWAIAdventure.Begin(true);WoWAIAdventure.Days(CHAR)`);
 const days=v.json('CHAR.days'),day=Object.values(days)[0];assert.equal(day.legacy,true);
 assert.equal(new Set(day.events.map(e=>e.seq)).size,day.events.length);
});
test('Forever login never attempts restricted combat-log registration, including inside pcall',()=>{
 const v=vm('STUB.restrictedEvents={COMBAT_LOG_EVENT_UNFILTERED=true,COMBAT_LOG_EVENT=true}');
 assert.equal(v.get('#(STUB.blockedRegistrations or {})'),'0');
 const c=v.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]');
 assert.equal(c.recent[0].kind,'session_start');assert.equal(c.recent[0].data.killTracking,false);
 v.run("WoWAIAdventure.Event('PLAYER_DEAD');WoWAIAdventure.Event('QUEST_TURNED_IN',1,100,20)");
 const after=v.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)]');
 assert.equal(after.recent.at(-2).kind,'death');assert.equal(after.recent.at(-1).kind,'quest_turnin');
});
test('planner reads objectives, never invents missing coordinates, and drives arrow',()=>{const v=vm();v.run('WoWAIAdventure.Plan()');const p=v.json('WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)].plan');assert.equal(p.quests.length,2);assert.equal(p.quests[0].objectives[0].text,'收集水：0/5');assert.deepEqual(p.missing,[2]);assert.equal(p.route.length,1);assert.equal(v.get('STUB.route'),'nil');v.run('WoWAIAdventure.StartNavigation(1)');assert.equal(v.get('#STUB.route'),'1');assert.equal(v.get('STUB.sent'),'nil');});
test('wire stays bounded and ack only removes committed events',()=>{const v=vm();v.run(`WoWAIAdventure.Record('note',{text=string.rep('中文',1500)});WoWAIAdventure.Review()`);for(let i=0;i<8;i++){const wire=v.get('(WoWAIAdventure.NextWire())');assert.ok(Buffer.byteLength(wire)<3200);JSON.parse(wire.slice(7));}v.run(`local c=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Ack({{ledger=c.ledger,seq=1}})`);const q=v.json('WoWAIAdventureDB.queue');assert.ok(q.every(r=>r.seq>1));});
test('UI reload reuses online session, fresh login starts a new one',()=>{const v=vm();v.run('WoWAIAdventure.Begin(true)');assert.equal(v.get('#WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)].sessions'),'1');v.run('WoWAIAdventure.Begin(false)');assert.equal(v.get('#WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)].sessions'),'2');});
test('AI plan waits for full snapshot acknowledgement and only then sends',()=>{const v=vm();v.run('WoWAIAdventure.SendPlan();WoWAIAdventure.Tick()');assert.equal(v.get('STUB.sent'),'nil');v.run(`local c=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Ack({{ledger=c.ledger,seq=c.seq}});WoWAIAdventure.Tick()`);assert.match(v.get('STUB.sent'),/^\[WOWAI_PLAN:/);});

test('manual journal sync freezes one batch and the next click sends only newly recorded events without AI',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}})
 WoWAIAdventure.Record('loot',{name='布料',count=2});WoWAIAdventure.Record('kill',{name='野猪',count=1});LAST=CHAR.seq
 WoWAIAdventure.Show('log');WoWAIAdventureUI.logs.sync.scripts.OnClick();WoWAIAdventure.Record('note',{text='传输期间新增'})`);
 const first=JSON.parse(v.get('(WoWAIAdventure.NextWire())').slice(7));assert.ok(first.every(p=>p.seq<=Number(v.get('LAST'))));
 assert.equal(v.get('WoWAIAdventureUI.logs.sync:IsEnabled()'),'false');
 v.run('WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=LAST}});WoWAIAdventure.Tick()');
 assert.equal(v.get('STUB.sent'),'nil');assert.equal(v.get('WoWAIAdventure.UnsyncedCount()'),'1');assert.match(v.get('WoWAIAdventure.SyncStatus()'),/本次同步完成：2/);
 v.run('WoWAIAdventure.SyncLogs()');const second=JSON.parse(v.get('(WoWAIAdventure.NextWire())').slice(7));assert.ok(second.every(p=>p.seq===Number(v.get('LAST'))+1));
 v.run('WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});WoWAIAdventure.Tick();WoWAIAdventure.SyncLogs()');
 assert.equal(v.get('WoWAIAdventure.UnsyncedCount()'),'0');assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');assert.equal(v.get('STUB.sent'),'nil');assert.match(v.get('WoWAIAdventure.SyncStatus()'),/没有新增/);
 assert.ok(v.json('CHAR.recent').some(e=>e.kind==='loot'),'local timeline preserved after sync');
});

test('sparse journal receipts survive cancellation and reload; old receipts cannot resurrect records',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});BASE=CHAR.seq
 for i=1,3 do WoWAIAdventure.Record('note',{text='记录'..i})end;WoWAIAdventure.SyncLogs()`);
 const base=Number(v.get('BASE')),ledger=v.get('CHAR.ledger');
 v.run(P.luaTable('ACK',[],{adventureAck:[{ledger,seq:base,ranges:[[base+2,base+3]]}]}));
 v.run('WoWAIAdventure.Ack(ACK.adventureAck);WoWAIAdventure.CancelSync();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=0}});WoWAIAdventure.SyncLogs()');
 const packets=JSON.parse(v.get('(WoWAIAdventure.NextWire())').slice(7));assert.ok(packets.every(p=>p.seq===base+1));assert.equal(v.get('CHAR.acked'),String(base));
 const saved=P.luaTable('RESTORED',[{id:1,status:'done',text:'',plan:v.json('WoWAIAdventureDB')}]);
 const next=vm(saved+'\nWoWAIAdventureDB=RESTORED.replies[1].plan');
 const queued=next.json('WoWAIAdventureDB.queue').map(r=>r.seq);assert.ok(queued.includes(base+1));assert.ok(!queued.includes(base+2)&&!queued.includes(base+3));
 assert.ok(next.json('WoWAIAdventureDB.adventureExport').every(hex=>![base+2,base+3].includes(JSON.parse(Buffer.from(hex,'hex').toString()).seq)));
});

test('journal timeout preserves receipts, duplicate clicks do not replace the batch, and characters stay isolated',()=>{
 const v=vm();v.run(`CHAR=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Tick();WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=CHAR.seq}});BASE=CHAR.seq
 WoWAIAdventure.Record('note',{text='一'});WoWAIAdventure.Record('note',{text='二'});WoWAIAdventure.SyncLogs();WoWAIAdventure.Record('note',{text='三'});WoWAIAdventure.SyncLogs();WoWAIAdventure.Review()
 WoWAIAdventure.Ack({{ledger='other-character',seq=99999}})`);
 assert.match(v.get('WoWAIAdventure.SyncStatus()'),/0\/2/);assert.equal(v.get('STUB.sent'),'nil');
 v.run('WoWAIAdventure.Ack({{ledger=CHAR.ledger,seq=BASE+1}});STUB.now=STUB.now+241;WoWAIAdventure.Tick()');
 assert.match(v.get('WoWAIAdventure.SyncStatus()'),/同步超时/);assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');
 v.run('WoWAIAdventure.SyncLogs()');assert.ok(JSON.parse(v.get('(WoWAIAdventure.NextWire())').slice(7)).every(p=>p.seq>Number(v.get('BASE'))+1));
});
test('folded/incomplete quest list does not launch navigation or AI',()=>{const v=vm();v.run('C_QuestLog.GetNumQuestLogEntries=function()return 2,3 end;WoWAIAdventure.SendPlan()');assert.equal(v.get('STUB.sent'),'nil');assert.equal(v.get('STUB.route'),'nil');});
test('paused log ignores new game events and renders all three screens',()=>{const v=vm();const before=v.get('#WoWAIAdventureDB.queue');v.run(`WoWAIAdventureDB.enabled=false;WoWAIAdventure.Event('PLAYER_DEAD');WoWAIAdventure.Show('tasks');WoWAIAdventure.Show('log');WoWAIAdventure.Show('milestones')`);assert.equal(v.get('#WoWAIAdventureDB.queue'),before);assert.equal(v.get('WoWAIAdventureFrame.shown'),'true');});
test('idle journaling and local planning never expose a pixel strip or poll reply slots',()=>{
 const v=vm();v.run("WoWAIAdventure.Tick();WoWAIAdventure.Plan();WoWAIAdventure.Event('PLAYER_LEVEL_UP',24)");
 assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');assert.equal(v.get('STUB.polled'),'nil');
 assert.ok(Number(v.get('#WoWAIAdventureDB.adventureExport'))>0,'logout export stays queued');
});
test('explicit AI transfer stops on acknowledgement, cancellation, expiry or stale quests',()=>{
 const v=vm();v.run('WoWAIAdventure.Review()');assert.match(v.get('(WoWAIAdventure.NextWire())'),/^WOWAIJ:/);
 v.run('WoWAIAdventure.CancelSync()');assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');
 v.run('WoWAIAdventure.Review();STUB.now=STUB.now+241');assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');
 v.run('WoWAIAdventure.Tick();WoWAIAdventure.SendPlan();local c=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];c.plan.stale=true');assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil');
 v.run('WoWAIAdventure.SendPlan();local c=WoWAIAdventureDB.characters[next(WoWAIAdventureDB.characters)];WoWAIAdventure.Ack({{ledger=c.ledger,seq=c.seq}});WoWAIAdventure.Record("heartbeat",{})');
 assert.equal(v.get('(WoWAIAdventure.NextWire())'),'nil','newer background observations do not extend AI transfer');
});
