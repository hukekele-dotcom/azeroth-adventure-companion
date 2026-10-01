'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const N=require('../bridge/narrative'),{AdventureStore}=require('../bridge/adventure');
const epoch=Math.floor(Date.now()/1000);
const event=(seq,kind,data={})=>({v:1,ledger:'charA',session:'onlineA',character:'法师',seq,t:epoch+seq,kind,data});
function store(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-story-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100}));return new AdventureStore(root);}
function result(events){return '```wowstory\n'+JSON.stringify({title:'从十字路口出发',paragraphs:N.facts(events).segments.map(s=>({text:N.material([events.find(e=>e.seq===s.sources[0])]).split('\n')[0],sources:s.sources}))})+'\n```';}

test('legacy login resurrection is omitted and opening states first confirmed location without changing raw history',()=>{
 const es=[event(1,'session_start',{position:{zone:'',subzone:''}}),event(2,'resurrect',{zone:''}),event(3,'zone',{zone:'贫瘠之地',subzone:'十字路口',x:52,y:29.9}),event(4,'note',{text:'出发'})],before=JSON.stringify(es);
 const f=N.facts(es);assert.equal(f.segments.filter(s=>s.kind==='resurrect').length,0);assert.deepEqual(f.segments[0].sources,[1,3]);
 const id={ledger:'charA',session:'onlineA',through:4,locale:'zhCN'},draft=N.parse(result(es),id,es);
 assert.match(draft.paragraphs[0].text,/上线后.*贫瘠之地.*十字路口.*52\.0, 29\.9/);assert.equal(JSON.stringify(es),before);
 assert.throws(()=>N.parse('```wowstory\n'+JSON.stringify({title:'错误复活',paragraphs:[{text:'复活了',sources:[2,4]}]})+'\n```',id,es),/之外/);
 const repeated=N.parse('```wowstory\n'+JSON.stringify(draft)+'\n```',id,es);assert.deepEqual(repeated.paragraphs,draft.paragraphs,'resuming a part does not duplicate its opening');
});

test('known login opens with its own location in every supported language; later travel never replaces missing start',()=>{
 const es=[event(1,'session_start',{position:{zone:'银松森林',subzone:'瑟伯切尔',x:43.3,y:40.8}}),event(2,'resurrect'),event(3,'note',{text:'离开旅店'})];
 for(const locale of ['zhCN','zhTW','enUS']){
   const d=N.parse(result(es),{ledger:'charA',session:'onlineA',through:3,locale},es);
   assert.match(d.paragraphs[0].text,/银松森林.*瑟伯切尔.*43\.3, 40\.8/);assert.doesNotMatch(d.paragraphs[0].text,/复活|復活|resurrect/i);
 }
 const missing=[event(1,'session_start',{position:{zone:''}}),event(2,'kill',{name:'野猪'}),event(3,'zone',{zone:'远处地点'})];
 assert.equal(N.facts(missing).segments[0].data.position.zone,'');
 const late=[missing[0],{...event(2,'zone',{zone:'远处地点'}),t:epoch+60}];assert.equal(N.facts(late).segments[0].data.position.zone,'');
 assert.match(N.parse(result(late),{ledger:'charA',session:'onlineA',through:2,locale:'zhCN'},late).paragraphs[0].text,/没有可靠记录/);
});

test('real revivals survive filtering once, with death or explicit live-state evidence',()=>{
 const es=[event(1,'session_start'),event(2,'resurrect'),event(3,'death'),event(4,'resurrect'),event(5,'resurrect'),event(6,'resurrect',{confirmed:true})];
 assert.deepEqual(N.facts(es).segments.filter(s=>s.kind==='resurrect').map(s=>s.sources),[[3,4],[6]]);
 const deadLogin=[event(1,'session_start',{dead:true}),event(2,'resurrect')];assert.equal(N.facts(deadLogin).segments.filter(s=>s.kind==='resurrect').length,1);
});

test('daily drafts combine same-date logins and isolate character, midnight and captured sequence',t=>{
 const s=store(t),es=[
 {...event(1,'session_start'),day:'2026-09-29'},
 {...event(2,'session_end'),day:'2026-09-29'},
 {...event(3,'session_start'),session:'onlineB',day:'2026-09-29'},
 {...event(4,'loot',{name:'宝物',count:2}),session:'onlineB',day:'2026-09-29'},
 {...event(5,'note',{text:'过了午夜'}),session:'onlineB',day:'2026-09-30'},
 {...event(6,'note',{text:'晚到记录'}),session:'onlineB',day:'2026-09-29'}];
 for(const e of es)s.ingest(e);s.ingest({...event(1,'note',{text:'另一角色'}),ledger:'charB',day:'2026-09-29'});
 const id=N.request('[WOWAI_DRAFT:charA:day-2026-09-29:4:zhCN]'),selected=s.draftEvents(id);
 assert.deepEqual(selected.map(e=>e.seq),[1,2,3,4]);assert.equal(N.facts(selected).closed,false);
 assert.match(N.prompt(id,selected),/每日游记/);assert.doesNotMatch(N.prompt(id,selected),/过了午夜|晚到记录|另一角色/);
 const draft=s.saveDraft(result(selected),id,selected);assert.ok(draft.file.includes(path.join('days','charA','2026-09-29')));
 assert.ok(fs.existsSync(path.join(s.root,'每日旅程.html')));
 const html=fs.readFileSync(path.join(s.root,'每日旅程.html'),'utf8');assert.match(html,/前一天/);assert.match(html,/从十字路口出发/);
 const rows=JSON.parse(fs.readFileSync(path.join(s.root,'days','charA','2026-09-29','records.json')));assert.deepEqual(rows.map(e=>e.seq),[1,2,3,4,6]);
 const restored=new AdventureStore(s.root);assert.equal(restored.draftEvents(id).length,4);
});

test('daily reader escapes game text and preserves previously edited AI drafts',t=>{
 const s=store(t);s.ingest({...event(1,'note',{text:'</script><script>alert(1)</script>'}),day:'2026-09-30'});s.export();
 const html=fs.readFileSync(path.join(s.root,'每日旅程.html'),'utf8');assert.ok(!html.includes('</script><script>alert(1)'));
 const inline=html.match(/<\/script><script>([\s\S]*)<\/script>/)[1];new(require('node:vm').Script)(inline);
 const id=N.request('[WOWAI_DRAFT:charA:day-2026-09-30:1:zhCN]'),rows=s.draftEvents(id),a=s.saveDraft(result(rows),id,rows);fs.writeFileSync(a.file,'手工加工后的游记');
 s.saveDraft(result(rows),id,rows);assert.equal(fs.readFileSync(a.file,'utf8'),'手工加工后的游记');
});
test('draft request isolates exact character, session, language and captured boundary',t=>{
 const s=store(t);s.ingest(event(1,'session_start',{locale:'zhCN'}));s.ingest(event(2,'note',{text:'我在路口迷路了'}));s.ingest({...event(3,'session_start'),session:'onlineB'});
 const id=N.request('[WOWAI_DRAFT:charA:onlineA:2:zhTW]');assert.deepEqual(id,{ledger:'charA',session:'onlineA',through:2,locale:'zhTW'});
 assert.equal(s.draftEvents(id).length,2);assert.match(s.prepare('[WOWAI_DRAFT:charA:onlineA:2:zhTW]'),/繁體中文/);
 assert.throws(()=>s.draftEvents({...id,through:4}),/尚未完整/);assert.equal(N.request('[WOWAI_DRAFT:../escape:a:1:zhCN]'),null);
});
test('long sessions retain early and late notes and combine repeated kills without combat details',()=>{
 const es=[event(1,'session_start',{position:{zone:'十字路口'}}),event(2,'note',{text:'刚上线时迷路了'})];
 for(let i=3;i<160;i++)es.push(event(i,'kill',{name:'野猪',count:1}));es.push(event(160,'note',{text:'最后遇到了队友'}));
 const f=N.facts(es);assert.equal(f.stats.kills,157);assert.equal(f.segments.filter(s=>s.kind==='kill').length,1);
 const p=N.prompt({ledger:'charA',session:'onlineA',through:160,locale:'enUS'},es);assert.match(p,/刚上线时迷路了/);assert.match(p,/最后遇到了队友/);assert.match(p,/English/);assert.match(p,/不得编造/);
 assert.equal(N.facts(es).closed,false);assert.match(N.material(es),/尚无正常下线/);
});
test('only valid source references can be used and personal notes cannot be dropped',()=>{
 const es=[event(1,'session_start'),event(2,'note',{text:'真实手记'}),event(3,'level',{level:17})],id={ledger:'charA',session:'onlineA',through:3,locale:'zhCN'};
 const encode=p=>'```wowstory\n'+JSON.stringify({title:'底稿',paragraphs:p})+'\n```';
 assert.throws(()=>N.parse(encode([{text:'猜的',sources:[999]}]),id,es),/之外/);
 assert.throws(()=>N.parse(encode([{text:'升级了',sources:[3]}]),id,es),/遗漏/);
 assert.throws(()=>N.parse('plain text',id,es),/格式/);
 const draft=N.parse(encode([{text:'我记下了自己的经历，随后升到了 17 级。',sources:[2,3]}]),id,es);assert.match(draft.body,/17/);
});
test('automatic per-login archive preserves reloads, raw data, notes and separately edited drafts',t=>{
 const s=store(t);for(const e of [event(1,'session_start'),event(2,'ui_reload'),event(3,'note',{text:'<script>个人手记</script>'}),event(4,'session_end')])s.ingest(e);
 s.ingest({...event(5,'session_start'),session:'onlineB'});s.export();
 const dir=path.join(s.root,'sessions','charA','onlineA');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'records.json'))).length,4);
 assert.match(fs.readFileSync(path.join(dir,'source.md'),'utf8'),/已正常下线/);assert.ok(fs.existsSync(path.join(s.root,'sessions','charA','onlineB','source.md')));
 const id={ledger:'charA',session:'onlineA',through:4,locale:'zhCN'},events=s.draftEvents(id);
 const a=s.saveDraft(result(events),id,events);fs.writeFileSync(a.file,'作者已经修改');
 const b=s.saveDraft(result(events),id,events);assert.notEqual(a.file,b.file);assert.equal(fs.readFileSync(a.file,'utf8'),'作者已经修改');
 s.ingest({...event(6,'note',{text:'新一轮冒险'}),session:'onlineB'});s.export();assert.equal(fs.readFileSync(a.file,'utf8'),'作者已经修改');
 const saved=JSON.parse(fs.readFileSync(b.file.replace(/\.md$/,'.json')));assert.equal(saved.events.length,4);
});
test('source material distinguishes quest readiness/removal from turn-in and flags recording gaps',()=>{
 const es=[event(1,'quest_ready',{title:'找水'}),event(2,'quest_removed',{title:'取消的任务'}),event(3,'pause'),event(4,'interrupted',{lastObserved:epoch})];
 const md=N.material(es,'zhTW');assert.match(md,/任務目標完成/);assert.match(md,/任務移除/);assert.match(md,/記錄缺口/);assert.doesNotMatch(md,/已正常下線/);
});

test('legacy Lua empty objective tables can be archived without dropping other events',()=>{
 const es=[event(1,'session_start'),event(2,'quest_progress',{title:'旧任务',objectives:{}}),event(3,'note',{text:'保留手记'})];
 const text=N.material(es);assert.match(text,/旧任务/);assert.match(text,/保留手记/);
});
