'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
const N=require('../bridge/narrative'),{DraftRun}=require('../bridge/draft-run');
function scratch(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-draft-batch-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('wow-ai-draft-batch-'));fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:150});});return root;}
const event=(seq,kind,data={})=>({v:1,ledger:'hero',session:'login',character:'测试角色',seq,t:1700000000+seq,kind,data});
const identity={ledger:'hero',session:'login',through:311,locale:'zhCN'};
function response(events){return '```wowstory\n'+JSON.stringify({title:'旅程',paragraphs:[{text:'这段旅程保留了我的手记。',sources:N.facts(events).segments.flatMap(s=>s.sources)}]})+'\n```';}

test('standard JSON fence from WorkBuddy uses the same source and content validation',()=>{
 const events=[event(1,'note',{text:'我的手记'})];
 assert.equal(N.parse(response(events).replace('```wowstory','```json'),identity,events).paragraphs.length,1);
 assert.throws(()=>N.parse(response([event(999,'note')]).replace('```wowstory','```json'),identity,events),/之外/);
 assert.throws(()=>N.parse('```json\n{"title":"普通 JSON，不是游记"}\n```',identity,events),/不完整/);
});
test('skill snapshots become genuine changes without altering original events, and chunks cover every narrative source',()=>{
 const skills=Array.from({length:35},(_,i)=>({skillID:i+1,name:'技能'+i,rank:1,maxRank:75}));
 const events=Array.from({length:350},(_,i)=>event(i+1,'skill',{skills:skills.map(s=>({...s,rank:s.skillID===1?i+1:1}))}));
 events.unshift(event(0,'note',{text:'开头的手记'}));events.push(event(351,'note',{text:'最后的手记'}));
 const before=JSON.stringify(events),parts=N.batches({...identity,through:351},events),compact=N.compactSegments(events,'zhCN');
 assert.ok(Buffer.byteLength(JSON.stringify(N.facts(events).segments))>240000);assert.ok(parts.length>1);
 assert.equal(JSON.stringify(events),before);assert.ok(compact[2].text.includes('1 → 2'));assert.ok(!compact[2].text.includes('技能20'));
 assert.deepEqual(parts.flatMap(p=>p.events.map(e=>e.seq)),events.map(e=>e.seq));assert.ok(parts.every(p=>Buffer.byteLength(p.prompt)<60000));
 assert.match(parts[0].prompt,/开头的手记/);assert.match(parts.at(-1).prompt,/最后的手记/);
});
test('failed long draft resumes validated parts; completed and changed snapshots cannot reuse them',t=>{
 const root=scratch(t),events=Array.from({length:310},(_,i)=>event(i+1,'note',{text:'手记'+i}));
 let run=new DraftRun(root,identity,events,'codex');assert.equal(run.batches.length,3);run.accept(response(run.batches[0].events));
 run=new DraftRun(root,identity,events,'codex');assert.equal(run.progress.part,2);
 assert.throws(()=>run.accept(response([event(99999,'note')])),/之外/);assert.equal(run.parts.length,1);
 while(!run.done)run.accept(response(run.batches[run.parts.length].events));
 const merged=run.combine();assert.equal(merged.paragraphs.length,3);assert.equal(new Set(merged.paragraphs.flatMap(p=>p.sources)).size,310);
 run.complete();assert.equal(new DraftRun(root,identity,events,'codex').parts.length,0);
 assert.equal(new DraftRun(root,identity,[...events,event(311,'note',{text:'新增'})],'codex').parts.length,0);
 assert.equal(new DraftRun(root,identity,events,'workbuddy').parts.length,0);
});
test('full bridge chains parts, reports progress, resumes after agent failure and publishes one complete draft',t=>{
 const root=scratch(t),src=path.resolve(__dirname,'../bridge'),journal=path.join(root,'journal'),addon=path.join(root,'addons','WoWAI');
 fs.mkdirSync(journal,{recursive:true});fs.mkdirSync(addon,{recursive:true});
 for(const f of fs.readdirSync(src).filter(f=>/\.(js|cjs)$/.test(f)))fs.copyFileSync(path.join(src,f),path.join(root,f));
 const events=Array.from({length:310},(_,i)=>event(i+1,'note',{text:'这是真实测试手记'+i}));
 fs.writeFileSync(path.join(journal,'hero.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
 fs.writeFileSync(path.join(addon,'WoWAI.toc'),'## Interface: 16001\n');
 const fake=path.join(root,'fake-agent.cjs');fs.writeFileSync(fake,`
const fs=require('fs'),path=require('path');let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{
const calls=path.join(__dirname,'calls.json');let n=0;try{n=JSON.parse(fs.readFileSync(calls))}catch{}fs.writeFileSync(calls,JSON.stringify(++n));
if(n===2){console.log(JSON.stringify({type:'turn.failed',error:{message:'simulated temporary failure'}}));return}
const data=JSON.parse(input.slice(input.lastIndexOf('\\n')+1));const text='\x60\x60\x60wowstory\\n'+JSON.stringify({title:'分段游记',paragraphs:[{text:'本段保留了 '+data.segments.length+' 条手记。',sources:data.segments.flatMap(s=>s.sources)}]})+'\\n\x60\x60\x60';
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));console.log(JSON.stringify({type:'turn.completed'}));});`);
 fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({agent:'codex',agents:{codex:{path:fake}},defaultCwd:root,addonDir:path.dirname(addon),inboxFile:path.join(addon,'Inbox.lua'),savedVariablesFile:path.join(root,'missing.lua'),adventureDir:journal,slots:3,capture:{enabled:false}}));
 const install=spawnSync(process.execPath,[path.join(root,'install-slots.js')],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(install.status,0,install.stderr);
 const args=[path.join(root,'bridge.js'),'--inject','[WOWAI_DRAFT:hero:login:310:zhCN]','--agent','codex'];
 let r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,1,r.stdout+r.stderr);
 assert.match(fs.readFileSync(path.join(addon,'Inbox.lua'),'utf8'),/simulated temporary failure/);
 r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'calls.json'))),4,'retry resumes at the failed part');
 const inbox=fs.readFileSync(path.join(addon,'Inbox.lua'),'utf8');assert.match(inbox,/status = "done"/);assert.match(inbox,/draft =/);
 const folder=path.join(journal,'sessions','hero','login'),files=fs.readdirSync(folder).filter(f=>/^draft-.*\.json$/.test(f));assert.equal(files.length,1);
 const saved=JSON.parse(fs.readFileSync(path.join(folder,files[0])));assert.equal(saved.events.length,310);assert.equal(saved.draft.paragraphs.length,3);
});
