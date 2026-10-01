'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const Planner=require('../bridge/planner'),Limits=require('../bridge/job-limits');
test('planning avoids web tools when coordinates exist, and retry does not mutate snapshot',()=>{
 const snap={scopeMap:1,player:{locale:'enUS',level:13,money:12345},quests:[{id:1,title:'known',locations:[{key:'a',m:1,x:20,y:30}]}]};
 assert.equal(Planner.needsResearch(snap),false);
 assert.match(Planner.prompt({snapshot:'s'},snap),/不调用任何工具/);
 snap.quests.push({id:2,title:'unknown',locations:[]});
 const original=JSON.stringify(snap);
 assert.equal(Planner.needsResearch(snap),true);
 assert.match(Planner.prompt({snapshot:'s'},snap),/最多调用网页工具 4 次/);
 const prompt=Planner.prompt({snapshot:'s'},snap,{research:false});
 assert.match(prompt,/locationKey 和 sourceURL 必须为空/);
 assert.doesNotMatch(prompt,/money/);
 assert.equal(JSON.stringify(snap),original);
 assert.equal(Limits.timeoutMs({planRequest:{},planResearch:true},{}),90000);
 assert.equal(Limits.timeoutMs({planRequest:{}},{}),150000);
 assert.match(Limits.timeoutMessage({planSnapshot:snap},'WorkBuddy',150000),/TIMEOUT/);
});

function setup(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-planner-limit-'));
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.resolve(__dirname,'../bridge');
 for(const file of fs.readdirSync(source))if(/\.(js|cjs)$/.test(file))fs.copyFileSync(path.join(source,file),path.join(root,file));
 const addons=path.join(root,'addons'),project=path.join(root,'project'),saved=path.join(root,'SavedVariables.lua'),archive=path.join(root,'archive');
 fs.mkdirSync(path.join(addons,'WoWAI'),{recursive:true});fs.mkdirSync(project);fs.mkdirSync(archive);
 fs.writeFileSync(path.join(addons,'WoWAI','WoWAI.toc'),'## Interface: 16001\n');
 const cli=path.join(root,'fake-cli.cjs');
 fs.writeFileSync(cli,`const fs=require('fs'),path=require('path');const args=process.argv.slice(2);const tools=args[args.indexOf('--tools')+1];fs.appendFileSync(path.join(__dirname,'launches.jsonl'),JSON.stringify({tools,model:args[args.indexOf('--model')+1],resume:args.includes('--resume')})+'\\n');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 if(${JSON.stringify(mode)}==='auth'){console.log(JSON.stringify({type:'result',is_error:true,result:'Authentication required'}));return;}
 if(tools||${JSON.stringify(mode)}==='hang'){setInterval(()=>{},1000);return;}
 const plan={snapshot:'s',summary:'Verified route first',steps:[{questID:1,locationKey:'a',region:'known',reason:'nearby',action:'complete'},{questID:2,locationKey:'',reason:'unknown',action:'位置待确认'}]};
 console.log(JSON.stringify({type:'result',result:'\x60\x60\x60wowplan\\n'+JSON.stringify(plan)+'\\n\x60\x60\x60'}));});`);
 const cfg={agent:'workbuddy',agents:{workbuddy:{path:cli,model:'deepseek-v4.1-flash'}},addonDir:addons,savedVariablesFile:saved,defaultCwd:project,adventureDir:archive,slots:2,capture:{enabled:false},plannerResearchTimeoutMs:750,plannerTimeoutMs:1500,primerFile:false};
 fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(cfg));
 const quests=[{id:1,title:'known',locations:[{key:'a',m:1,x:20,y:30}]},{id:2,title:'unknown',locations:[]}];
 const rows=[['snapshot_begin',{count:2,complete:true,player:{locale:'zhCN'},scopeMap:1}],...quests.map(quest=>['snapshot_quest',{quest}]),['snapshot_end',{count:2}]].map(([kind,data],i)=>({v:1,ledger:'l',session:'game',seq:i+1,t:Math.floor(Date.now()/1000),character:'Test',kind,data:{...data,snapshot:'s'}}));
 fs.writeFileSync(path.join(archive,'l.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');
 const text=Buffer.from('[WOWAI_PLAN:l:s]').toString('hex');
 fs.writeFileSync(saved,'["outbox"] = {["id"] = 1, ["session"] = "game", ["chat"] = "plan", ["text"] = "'+text+'", ["agent"] = "workbuddy", ["model"] = "deepseek-v4.1-flash"}');
 const result=cp.spawnSync(process.execPath,[path.join(root,'bridge.js'),'--once'],{cwd:root,encoding:'utf8',timeout:15000,windowsHide:true});
 return {result,inbox:fs.readFileSync(path.join(addons,'WoWAI','Inbox.lua'),'utf8'),launches:fs.readFileSync(path.join(root,'launches.jsonl'),'utf8').trim().split('\n').map(JSON.parse)};
}
test('real bridge recovers research timeout with a single tools-disabled same-model AI attempt',t=>{
 const {result,inbox,launches}=setup(t,'recover');
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 assert.match(inbox,/Verified route first/);assert.match(inbox,/位置待确认/);
 assert.doesNotMatch(inbox,/exited with code/);
 assert.deepEqual(launches,[{tools:'WebSearch,WebFetch',model:'deepseek-v4.1-flash',resume:false},{tools:'',model:'deepseek-v4.1-flash',resume:false}]);
});
test('both stages hanging give a truthful timeout and never loop or change models',t=>{
 const {result,inbox,launches}=setup(t,'hang');
 assert.equal(result.status,1);assert.equal(launches.length,2);
 assert.match(inbox,/TIMEOUT/);assert.doesNotMatch(inbox,/exited with code/);
});
test('authentication errors do not retry or get hidden as research timeouts',t=>{
 const {result,inbox,launches}=setup(t,'auth');
 assert.equal(result.status,1);assert.equal(launches.length,1);assert.match(inbox,/AUTH_REQUIRED/);
});
