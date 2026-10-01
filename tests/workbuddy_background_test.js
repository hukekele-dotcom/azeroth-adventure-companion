'use strict';
// Opt-in live test: uses the configured account, isolated reply slots and state.
// Run with node tests/workbuddy_background_test.js on Windows after login.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'bridge');
if(process.platform!=='win32')throw new Error('This test checks Windows hidden startup.');
const dir=fs.mkdtempSync(path.join(require('os').tmpdir(),'wow-ai-background-'));
for(const name of fs.readdirSync(source).filter(n=>/\.(js|cjs)$/.test(n)))fs.copyFileSync(path.join(source,name),path.join(dir,name));
const cfg=JSON.parse(fs.readFileSync(path.join(source,'config.json'),'utf8'));
cfg.addonDir=path.join(dir,'addons');cfg.inboxFile=path.join(cfg.addonDir,'WoWAI','Inbox.lua');
cfg.savedVariablesFile=path.join(dir,'missing.lua');cfg.adventureDir=path.join(dir,'journal');cfg.slots=5;
cfg.primerFile=path.join(root,'docs','WOW-ADDON-PRIMER.md');
fs.mkdirSync(path.dirname(cfg.inboxFile),{recursive:true});
fs.writeFileSync(path.join(path.dirname(cfg.inboxFile),'WoWAI.toc'),'## Interface: 16001\n');
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(cfg));
fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({lastId:0,context:{text:'Character: BackgroundTest, level 11 paladin (Horde)\nLocation: Undercity, Trade Quarter (65.9, 46.9)'}}));
const install=spawnSync(process.execPath,[path.join(dir,'install-slots.js')],{cwd:dir,encoding:'utf8'});
assert.equal(install.status,0,install.stderr);
const runner=path.join(dir,'hidden-test.cjs');
fs.writeFileSync(runner,`
const fs=require('fs'),cp=require('child_process'),p=require('path');
const prompts=['记住暗号星光湖。这是通信测试，请只回复星光湖。不要调用工具。','上一轮的暗号是什么？请只回复暗号。不要调用工具。','请只回复 BACKGROUND_OK。不要调用工具。'];
const results=[];
for(let i=0;i<prompts.length;i++){
 const r=cp.spawnSync(process.execPath,[p.join(__dirname,'bridge.js'),'--project',${JSON.stringify(cfg.defaultCwd)},'--inject',prompts[i],'--agent','workbuddy'],{cwd:__dirname,encoding:'utf8',windowsHide:true,timeout:120000});
 fs.writeFileSync(p.join(__dirname,'run-'+i+'.log'),(r.stdout||'')+(r.stderr||''));
 const state=JSON.parse(fs.readFileSync(p.join(__dirname,'state.json'),'utf8'));
 results.push({code:r.status,session:Object.values(state.sessions||{})[0]||'',inbox:fs.readFileSync(${JSON.stringify(cfg.inboxFile)},'utf8')});
 if(r.status!==0)break;
}
fs.writeFileSync(p.join(__dirname,'results.json'),JSON.stringify(results));
`);
const quote=s=>"'"+s.replace(/'/g,"''")+"'";
const command=`$p=Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${quote('"'+runner+'"')} -WorkingDirectory ${quote(dir)} -WindowStyle Hidden -RedirectStandardOutput ${quote(path.join(dir,'launch.log'))} -RedirectStandardError ${quote(path.join(dir,'launch-error.log'))} -PassThru; $p.WaitForExit(); exit $p.ExitCode`;
const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:380000,windowsHide:true});
console.log('Evidence directory:',dir);
assert.equal(r.status,0,r.stderr);
const results=JSON.parse(fs.readFileSync(path.join(dir,'results.json'),'utf8'));
assert.equal(results.length,3);
for(let i=0;i<results.length;i++){
 assert.equal(results[i].code,0,`Round ${i+1} failed`);
 assert.match(results[i].inbox,/status\s*=\s*"done"/);
 assert.ok(results[i].session,'Missing session');
 assert.match(results[i].inbox,i<2?/星光湖/:/BACKGROUND_OK/);
 assert.equal(results[i].session,results[0].session,'Conversation was not resumed');
}
for(let i=1;i<=5;i++){
 const slot=fs.readFileSync(path.join(cfg.addonDir,'WoWAI_S'+String(i).padStart(3,'0'),'Inbox.lua'),'utf8');
 assert.equal(slot.slice(slot.indexOf('replies =')),results[2].inbox.slice(results[2].inbox.indexOf('replies =')));
}
console.log('PASS: 3 hidden bridge requests, session continuity, Inbox and all 5 slots.');
