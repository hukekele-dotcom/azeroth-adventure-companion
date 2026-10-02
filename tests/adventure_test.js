'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {AdventureStore,milestones,sessions}=require('../bridge/adventure');
function store(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-journal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return new AdventureStore(root);}
const epoch=Math.floor(Date.now()/1000);
function event(seq,kind='heartbeat',data={}){return {v:1,ledger:'charA',seq,character:'法师 - 无限',session:'onlineA',t:epoch,kind,data};}

test('review follows latest recorded UI language without rewriting historical events',t=>{
 const s=store(t);s.ingest(event(1,'session_start',{locale:'zhCN'}));s.ingest(event(2,'heartbeat',{locale:'enUS'}));
 assert.match(s.prepare('[WOWAI_REVIEW:charA:onlineA]'),/^Answer entirely in English/);
 s.ingest(event(3,'heartbeat',{locale:'zhCN'}));assert.match(s.prepare('[WOWAI_REVIEW:charA:onlineA]'),/^请使用简体中文/);
 assert.equal(s.all()[0].data.locale,'zhCN');assert.equal(s.all()[1].data.locale,'enUS');
 s.ingest(event(4,'heartbeat',{locale:'zhTW'}));assert.match(s.prepare('[WOWAI_REVIEW:charA:onlineA]'),/^請使用繁體中文/);
});
test('persist, deduplicate and restart with contiguous acknowledgements',t=>{
 const s=store(t);s.ingest(event(2));assert.equal(s.ack()[0].seq,0);s.ingest(event(1));assert.equal(s.ack()[0].seq,2);assert.equal(s.ingest(event(1)),false);
 const reopened=new AdventureStore(s.root);assert.equal(reopened.all().length,2);assert.equal(reopened.ack()[0].seq,2);
});

test('journal acknowledgements include only durable ranges and fill gaps across restart',t=>{
 const s=store(t);for(const id of [1,3,4,7])s.ingest(event(id));
 assert.deepEqual(s.ack(),[{ledger:'charA',seq:1,ranges:[[3,4],[7,7]]}]);
 const reopened=new AdventureStore(s.root);assert.deepEqual(reopened.ack(),s.ack());
 reopened.ingest(event(2));assert.deepEqual(reopened.ack(),[{ledger:'charA',seq:4,ranges:[[7,7]]}]);
 const hex=Buffer.from(JSON.stringify(event(5))).toString('hex');reopened.ingestChunk({ledger:'charA',seq:5,part:1,total:2,hex:hex.slice(0,20)});
 assert.deepEqual(reopened.ack(),[{ledger:'charA',seq:4,ranges:[[7,7]]}],'incomplete fragments are not acknowledged');
 reopened.ingest(event(5));reopened.ingest(event(6));assert.deepEqual(reopened.ack(),[{ledger:'charA',seq:7,ranges:[]}]);
});
test('out of order UTF8 chunks only commit a complete event',t=>{
 const s=store(t),e=event(1,'note',{text:'中文任务记录',milestone:true}),hex=Buffer.from(JSON.stringify(e)).toString('hex'),cut=Math.floor(hex.length/4)*2;
 const chunks=[hex.slice(0,cut),hex.slice(cut)];
 s.ingestChunk({ledger:e.ledger,seq:1,part:2,total:2,hex:chunks[1]});assert.equal(s.all().length,0);
 s.ingestChunk({ledger:e.ledger,seq:1,part:1,total:2,hex:chunks[0]});assert.equal(s.all()[0].data.text,'中文任务记录');assert.equal(s.ack()[0].seq,1);
});
test('disk failure never acknowledges an event',t=>{const s=store(t);fs.mkdirSync(path.join(s.root,'charA.jsonl'));assert.throws(()=>s.ingest(event(1)));assert.deepEqual(s.ack(),[]);});

test('snapshot receipts acknowledge sparse data without claiming missing journal history',t=>{
 const s=store(t);s.ingest(event(100,'snapshot_begin',{snapshot:'fast',count:1,complete:true}));
 s.ingest(event(102,'snapshot_end',{snapshot:'fast',count:1}));
 assert.deepEqual(s.snapshotAck(),[{ledger:'charA',snapshot:'fast',received:[100,102],ready:false}]);
 s.ingest(event(101,'snapshot_quest',{snapshot:'fast',quest:{id:42,title:'找水'}}));
 assert.equal(s.snapshotAck()[0].ready,true);assert.equal(s.ack()[0].seq,0);
 const reopened=new AdventureStore(s.root);assert.equal(reopened.snapshotAck()[0].ready,true);
 s.ingest({...event(103,'snapshot_begin',{snapshot:'expired',count:0}),t:epoch-700});
 assert.equal(s.snapshotAck().length,1);
});

test('shared catalog expands from durable snapshots and mismatches return an explicit receipt',t=>{
 const s=store(t),catalog=require('../bridge/quest-catalog');
 const q={id:905,complete:false,objectives:[{text:'Current progress',have:2,need:3}],locationCatalog:{version:catalog.version,sources:['reference'],points:[[1,1]]}};
 s.ingest(event(10,'snapshot_begin',{snapshot:'catalog',count:1,complete:true}));
 s.ingest(event(11,'snapshot_quest',{snapshot:'catalog',quest:q}));s.ingest(event(12,'snapshot_end',{snapshot:'catalog',count:1}));
 assert.deepEqual(new AdventureStore(s.root).snapshot('charA','catalog').quests[0],catalog.expand(q));
 s.ingest(event(20,'snapshot_begin',{snapshot:'mismatch',count:1,complete:true}));
 s.ingest(event(21,'snapshot_quest',{snapshot:'mismatch',quest:{...q,locationCatalog:{...q.locationCatalog,version:'outdated'}}}));s.ingest(event(22,'snapshot_end',{snapshot:'mismatch',count:1}));
 const receipt=s.snapshotAck().find(a=>a.snapshot==='mismatch');assert.equal(receipt.ready,false);assert.match(receipt.error,/资料库版本/);
});
test('logout SavedVariables import never executes Lua and deduplicates',t=>{
 const s=store(t),e=event(1,'session_end'),hex=Buffer.from(JSON.stringify(e)).toString('hex');
 const src='WoWAIAdventureDB = {\n["adventureExport"] = {\n"'+hex+'",\n},\n}\nos.execute("bad")';
 assert.equal(s.importSaved(src),1);assert.equal(s.importSaved(src),0);assert.equal(sessions(s.all())[0].closed,true);
});
test('milestones cite the actual log, task removal is not completion',()=>{
 const es=[event(1,'quest_removed',{questID:10}),event(2,'quest_turnin',{questID:11,title:'任务'}),event(3,'level',{level:20}),event(4,'boss',{name:'首领',success:false}),event(5,'note',{text:'到达目的地',milestone:true})];
 assert.deepEqual(milestones(es).map(m=>m.sourceEvent),['charA:2','charA:3','charA:5']);
 assert.equal(sessions(es)[0].quests,1);assert.equal(sessions(es)[0].closed,false);
});
test('incomplete or stale snapshots refuse AI; complete snapshot uses exact data',t=>{
 const s=store(t);s.ingest(event(1,'snapshot_begin',{snapshot:'snap',count:1,complete:true,position:{map:1}}));
 assert.throws(()=>s.prepare('[WOWAI_PLAN:charA:snap]'),/未完整/);
 s.ingest(event(2,'snapshot_quest',{snapshot:'snap',quest:{id:42,title:'找水',objectives:[]}}));s.ingest(event(3,'snapshot_end',{snapshot:'snap',count:1,route:[],missing:[42]}));
 const prompt=s.prepare('[WOWAI_PLAN:charA:snap]');assert.match(prompt,/找水/);assert.match(prompt,/不能编造/);assert.match(prompt,/不要输出 wowmap/);
});
test('no invented normal logout for interrupted sessions',()=>{
 const es=[event(1,'session_start'),event(2,'ui_reload'),event(3,'heartbeat'),event(4,'interrupted',{lastObserved:123})];
 assert.equal(sessions(es).length,1);assert.equal(sessions(es)[0].closed,false);assert.equal(sessions(es)[0].gaps,1);
});
test('archive escapes game strings and source IDs are retained',t=>{
 const s=store(t);s.ingest(event(1,'note',{text:'</script><img src=x>',milestone:true}));s.export();
 const html=fs.readFileSync(path.join(s.root,'冒险档案.html'),'utf8');assert.ok(!html.includes('</script><img'));assert.match(html,/charA:1/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/source=e.sourceEvent/);
});
test('recover incomplete tails without joining two JSON records',t=>{
 const s=store(t),file=path.join(s.root,'charA.jsonl');fs.writeFileSync(file,JSON.stringify(event(1)));
 const reopened=new AdventureStore(s.root);reopened.ingest(event(2));assert.equal(new AdventureStore(s.root).all().length,2);
 fs.appendFileSync(file,'{"v":');const repaired=new AdventureStore(s.root);repaired.ingest(event(3));assert.equal(new AdventureStore(s.root).all().length,3);
 assert.ok(fs.readdirSync(s.root).some(n=>n.includes('.recovery-')));
});
test('offline time is excluded after interrupted login',()=>{
 const es=[{...event(1,'session_start'),t:100},{...event(2,'heartbeat'),t:200},{...event(3,'interrupted',{lastObserved:200}),t:1000}];
 assert.equal(sessions(es)[0].observedSeconds,100);assert.equal(sessions(es)[0].status,'缺少正常下线记录');
});
test('invalid file identities and conflicts cannot replace records',t=>{
 const s=store(t);assert.throws(()=>s.ingest({...event(1),ledger:'../escape'}));s.ingest(event(1));assert.throws(()=>s.ingest(event(1,'death')),/Conflicting/);assert.equal(s.all()[0].kind,'heartbeat');
});
