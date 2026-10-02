'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const A=require('../bridge/agents');

test('request model overrides are isolated and only accept the three hosted WorkBuddy options',()=>{
 const cfg={agents:{workbuddy:{model:'auto',path:'official-cli'},codex:{model:'codex-model'}}};
 for(const model of ['auto','glm-5.3','deepseek-v4.1-flash']){
  const own=A.requestConfig(cfg,'workbuddy',model);
  const args=A.AGENTS.workbuddy.args({cfg:own});
  assert.equal(args[args.indexOf('--model')+1],model);
  assert.equal(cfg.agents.workbuddy.model,'auto');
 }
 for(const model of ['other','custom-local:private','--model=other'])assert.throws(()=>A.requestConfig(cfg,'workbuddy',model),/Unsupported/);
 assert.throws(()=>A.requestConfig(cfg,'codex','glm-5.3'),/Unsupported/);
 assert.equal(A.requestConfig(cfg,'codex').model,'codex-model');
});

test('actual bridge launches the selected model, reuses only same-model sessions, and publishes its reply',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wow-ai-model-test-'));
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.resolve(__dirname,'../bridge');
 for(const file of fs.readdirSync(source))if(/\.(js|cjs)$/.test(file)||file==='quest-locations.json')fs.copyFileSync(path.join(source,file),path.join(root,file));
 const addons=path.join(root,'addons'),project=path.join(root,'project'),saved=path.join(root,'SavedVariables.lua');
 fs.mkdirSync(path.join(addons,'WoWAI'),{recursive:true});fs.mkdirSync(project);
 fs.writeFileSync(path.join(addons,'WoWAI','WoWAI.toc'),'## Interface: 16001\n');
 const cli=path.join(root,'fake-cli.cjs');
 fs.writeFileSync(cli,`const fs=require('fs'),path=require('path');const args=process.argv.slice(2);const model=args[args.indexOf('--model')+1];fs.appendFileSync(path.join(__dirname,'launches.jsonl'),JSON.stringify({model,resume:args.includes('--resume')?args[args.indexOf('--resume')+1]:null})+'\\n');process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'system',session_id:'session-'+model}));console.log(JSON.stringify({type:'result',result:'reply-'+model}));});`);
 const cfg={agent:'workbuddy',agents:{workbuddy:{path:cli,model:'auto',tools:[]}},addonDir:addons,savedVariablesFile:saved,defaultCwd:project,slots:2,capture:{enabled:false},timeoutMs:10000,primerFile:false};
 fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(cfg));
 let id=0;
 for(const model of ['auto','auto','glm-5.3','deepseek-v4.1-flash']){
  fs.writeFileSync(saved,'["outbox"] = {["id"] = '+(++id)+', ["session"] = "s", ["chat"] = "c", ["text"] = "6869", ["agent"] = "workbuddy", ["model"] = "'+model+'"}');
  const r=cp.spawnSync(process.execPath,[path.join(root,'bridge.js'),'--once'],{cwd:root,encoding:'utf8',timeout:20000,windowsHide:true});
  assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
  const inbox=fs.readFileSync(path.join(addons,'WoWAI','Inbox.lua'),'utf8');
  assert.match(inbox,new RegExp('reply-'+model.replaceAll('.','\\.')));
 }
 const launches=fs.readFileSync(path.join(root,'launches.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(launches,[{model:'auto',resume:null},{model:'auto',resume:'session-auto'},{model:'glm-5.3',resume:null},{model:'deepseek-v4.1-flash',resume:null}]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'config.json'))).agents.workbuddy.model,'auto');
});
