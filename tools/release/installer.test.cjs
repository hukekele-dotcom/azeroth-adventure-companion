'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os');
const {install,discover,verify,inside,wireJson}=require('./installer.cjs');
const {hash}=require('./build.cjs');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'wowai-release-test-'));
const write=(file,text)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const bundle=process.env.WOWAI_TEST_BUNDLE;
if(!bundle)throw Error('WOWAI_TEST_BUNDLE is required');
const client=path.join(fixture,'中文 游戏目录','_classic_beta_');
write(path.join(client,'WowB.exe'),'fixture');
fs.mkdirSync(path.join(client,'Interface'),{recursive:true});
for(const name of ['FIRST','SECOND']) fs.mkdirSync(path.join(client,'WTF/Account',name,'SavedVariables'),{recursive:true});
const target=path.join(fixture,'安装程序');
const options={bundle,target,client,account:'SECOND',provider:'codex',checkProcesses:()=>{},slotLimits:{slots:3,actMax:2,presenceMax:3}};
test('validates package manifest and rejects traversal',()=>{
  assert.ok(Object.keys(verify(bundle).files).length>20);
  assert.throws(()=>inside(bundle,'../outside'),/Invalid/);
});
test('requires Forever client and rejects invalid explicit account',()=>{
  assert.deepEqual(discover(client).accounts,['FIRST','SECOND']);
  assert.throws(()=>discover(fixture),/WowB/);
  assert.throws(()=>install({...options,account:'../OTHER'}),/账号目录无效/);
  assert.throws(()=>install({...options,provider:'other'}),/Invalid/);
  assert.equal(fs.existsSync(target),false);
});
test('running game guard aborts before writes',()=>{
  assert.throws(()=>install({...options,checkProcesses:()=>{throw Error('game running');}}),/game running/);
  assert.equal(fs.existsSync(target),false);
});
test('fresh install in Chinese paths creates slots, own config and private-data-free files',()=>{
  const result=install(options);
  assert.equal(result.ok,true);
  const cfg=read(path.join(target,'app/bridge/config.json'));
  assert.equal(cfg.agent,'codex');
  assert.equal(cfg.agents.codex.permissionMode,'default');
  assert.equal(cfg.agents.workbuddy.model,'auto');
  assert.match(cfg.savedVariablesFile,/SECOND/);
  assert.ok(cfg.defaultCwd.startsWith(target));
  assert.equal(fs.existsSync(path.join(client,'Interface/AddOns/WoWAI_S003/Inbox.lua')),true);
  assert.equal(fs.existsSync(path.join(target,'app/bridge/state.json')),false);
  assert.equal(fs.existsSync(path.join(client,'WTF/Account/SECOND/SavedVariables/WoWAI.lua')),false);
  for (const language of ['zhCN','zhTW','en']) {
    for (const ext of ['html','txt']) {
      const guide=`Install-Guide-${language}.${ext}`;
      assert.equal(hash(path.join(target,guide)),hash(path.join(bundle,guide)),'Installed guide must match the bundle');
    }
  }
  const chooser=fs.readFileSync(path.join(target,'README.html'),'utf8');
  for (const language of ['zhCN','zhTW','en']) assert.ok(chooser.includes(`Install-Guide-${language}.html`));
});
test('upgrade preserves chat, archived journal, auth, WTF and live inbox; backup exists',()=>{
  const files=[path.join(target,'app/bridge/transcripts.json'),path.join(target,'app/bridge/state.json'),
    path.join(target,'data/workspace/adventure-log/days/test.md'),path.join(target,'data/workbuddy-auth/test'),
    path.join(client,'WTF/Account/SECOND/SavedVariables/WoWAI.lua'),path.join(client,'Interface/AddOns/WoWAI/Inbox.lua')];
  for(const file of files)write(file,'keep-this-data');
  const cfgFile=path.join(target,'app/bridge/config.json');
  const cfg=read(cfgFile);cfg.agents.codex.path='MY-CLI';write(cfgFile,JSON.stringify(cfg));
  const result=install({...options,provider:'workbuddy'});
  for(const file of files)assert.equal(fs.readFileSync(file,'utf8'),'keep-this-data');
  assert.equal(read(cfgFile).agents.codex.path,'MY-CLI');
  assert.equal(read(cfgFile).agent,'workbuddy');
  assert.equal(fs.readFileSync(path.join(result.backup,'WoWAI/Inbox.lua'),'utf8'),'keep-this-data');
});
test('tampered source fails before target creation',()=>{
  const tiny=path.join(fixture,'tampered');
  write(path.join(tiny,'installer.cjs'),'original');
  write(path.join(tiny,'manifest.json'),JSON.stringify({version:'test',files:{'installer.cjs':hash(path.join(tiny,'installer.cjs'))}}));
  write(path.join(tiny,'installer.cjs'),'changed');
  const unused=path.join(fixture,'must-not-exist');
  assert.throws(()=>install({...options,bundle:tiny,target:unused}),/checksum/);
  assert.equal(fs.existsSync(unused),false);
});
test('existing unrelated destination cannot be overwritten',()=>{
  const unrelated=path.join(fixture,'unrelated');write(path.join(unrelated,'personal'),'safe');
  assert.throws(()=>install({...options,target:unrelated}),/不属于/);
  assert.equal(fs.readFileSync(path.join(unrelated,'personal'),'utf8'),'safe');
});
test('ASCII protocol preserves Unicode strings and paths',()=>{
  const value={ok:true,target:'D:\\中文 游戏\\安装',message:'安装完成。😀',error:'"引号"\n结束'};
  assert.match(wireJson(value),/^[\x00-\x7f]*$/);
  assert.deepEqual(JSON.parse(wireJson(value)),value);
});
test('install without a game account configures automatic discovery',()=>{
  const fresh=path.join(fixture,'首次安装 无账号');
  write(path.join(fresh,'WowB.exe'),'fixture');fs.mkdirSync(path.join(fresh,'Interface'),{recursive:true});
  const dest=path.join(fixture,'自动安装');
  assert.equal(install({...options,client:fresh,target:dest,account:undefined}).ok,true);
  const cfg=read(path.join(dest,'app/bridge/config.json'));
  assert.equal(cfg.savedVariablesFile,'');
  assert.equal(cfg.savedVariablesRoot,path.join(fresh,'WTF','Account'));
  assert.equal(fs.existsSync(cfg.savedVariablesRoot),false);
});
test('upgrade to automatic mode preserves previous account saves',()=>{
  assert.equal(install({...options,account:undefined}).ok,true);
  const cfg=read(path.join(target,'app/bridge/config.json'));
  assert.equal(cfg.savedVariablesFile,'');assert.equal(cfg.savedVariablesRoot,path.join(client,'WTF','Account'));
  assert.equal(fs.readFileSync(path.join(client,'WTF/Account/SECOND/SavedVariables/WoWAI.lua'),'utf8'),'keep-this-data');
});
test('Windows PowerShell Core decodes success and failure under GBK', {skip:process.platform!=='win32'},()=>{
  const cp=require('child_process');
  const source=fs.readFileSync(path.join(__dirname,'Install.ps1'),'utf8');
  const core=source.slice(source.indexOf('function Core('),source.indexOf('function CheckClient'));
  const q=s=>"'"+s.replace(/'/g,"''")+"'";
  const ps=`$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::GetEncoding(936); $bundle=${q(bundle)}; ${core}\n$r=Core 'discover' @{client=${q(client)}}; if ($r.client -ne ${q(client)} -or $r.accounts.Count -ne 2) {throw 'Unicode result mismatch'}; try { $null=Core 'discover' @{client=${q(fixture)}}; throw 'Expected failure' } catch { if ($_.Exception.Message -notmatch '请选择包含 WowB.exe') {throw} }; Write-Output 'GBK_PROTOCOL_PASS'`;
  const result=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/GBK_PROTOCOL_PASS/);
});
test.after(()=>{
  const resolved=path.resolve(fixture);
  if(path.dirname(resolved)!==path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('wowai-release-test-'))throw Error('Invalid cleanup target');
  fs.rmSync(resolved,{recursive:true,force:true});
});
