'use strict';
// Distribution-only installer. Never reads the developer's live configuration.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const crypto = require('crypto');
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function write(file, value) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function inside(root, relative) {
  const out = path.resolve(root, relative);
  if (out === path.resolve(root) || !out.startsWith(path.resolve(root) + path.sep)) throw Error('Invalid package path: ' + relative);
  return out;
}
function verify(bundle) {
  const manifest = json(path.join(bundle, 'manifest.json'));
  for (const [relative, hash] of Object.entries(manifest.files)) {
    const file = inside(bundle, relative);
    if (fs.lstatSync(file).isSymbolicLink()) throw Error('Package links are not supported');
    if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash) throw Error('Package checksum failed: ' + relative);
  }
  return manifest;
}
function discover(client) {
  client = path.resolve(client);
  // A Forever client has WowB.exe; don't silently install into retail/classic.
  if (!fs.existsSync(path.join(client, 'WowB.exe')) || !fs.existsSync(path.join(client, 'Interface'))) {
    throw Error('请选择包含 WowB.exe 和 Interface 文件夹的无限客户端目录（通常是 _classic_beta_）。');
  }
  const root = path.join(client, 'WTF', 'Account');
  const accounts = fs.existsSync(root) ? fs.readdirSync(root, {withFileTypes:true}).filter(e => e.isDirectory() && !e.isSymbolicLink() && e.name !== 'SavedVariables').map(e => e.name) : [];
  return {client, accounts};
}
function checkRunning() {
  if (process.platform !== 'win32') return;
  const ps = "$p=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'WowB.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match '(supervisor|bridge)\\.js') }; if ($p) { exit 12 }";
  const result = cp.spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',ps], {encoding:'utf8',windowsHide:true});
  if (result.status !== 0) throw Error('请先退出游戏，并停止正在运行的 WoW AI 桥接，再安装或升级。');
}
function install({bundle, target, client, account, provider, checkProcesses = checkRunning, slotLimits}) {
  if (!['codex','workbuddy'].includes(provider)) throw Error('Invalid AI choice');
  const found = discover(client);
  if (!found.accounts.includes(account)) throw Error('请明确选择一个游戏账号；若列表为空，请先登录游戏一次并退出。');
  const manifest = verify(bundle);
  target = path.resolve(target);
  if (target === path.resolve(bundle) || target.startsWith(path.resolve(bundle) + path.sep)) throw Error('安装目录不能位于解压包内部。');
  checkProcesses();
  const configFile = path.join(target, 'app', 'bridge', 'config.json');
  const old = fs.existsSync(configFile) ? json(configFile) : null;
  if (fs.existsSync(target) && !fs.existsSync(path.join(target, 'installation.json'))) throw Error('目标目录已存在且不属于此安装器，请选择空目录。');
  const addonDir = path.join(found.client, 'Interface', 'AddOns');
  const liveAddon = path.join(addonDir, 'WoWAI');
  const backup = path.join(target, 'backups', new Date().toISOString().replace(/[:.]/g,'-'));
  // Test write access before replacing application files. No blanket elevation.
  fs.mkdirSync(addonDir, {recursive:true});
  const probe = path.join(addonDir, '.wowai-write-' + crypto.randomUUID());
  fs.writeFileSync(probe, ''); fs.unlinkSync(probe);
  write(path.join(target, 'installation.json'), {version:manifest.version, phase:'installing', backup});
  fs.mkdirSync(backup, {recursive:true});
  if (fs.existsSync(liveAddon)) fs.cpSync(liveAddon, path.join(backup,'WoWAI'), {recursive:true});
  if (old) fs.copyFileSync(configFile, path.join(backup,'config.json'));
  for (const relative of Object.keys(manifest.files)) {
    if (!(relative.startsWith('app/') || relative.startsWith('runtime/') || ['Manage.ps1','installer.cjs','ai.cjs','README.txt','LICENSE','release.json'].includes(relative))) continue;
    const dest = inside(target, relative);
    // Manifest is an explicit source allow-list; private runtime files never enter it.
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    fs.copyFileSync(inside(bundle, relative), dest);
  }
  const template = json(path.join(target,'app','bridge','config.example.json'));
  const workspace = old?.defaultCwd || path.join(target,'data','workspace');
  fs.mkdirSync(workspace, {recursive:true});
  const cfg = {...template, ...old, agent:provider, addonDir,
    savedVariablesFile:path.join(found.client,'WTF','Account',account,'SavedVariables','WoWAI.lua'),
    inboxFile:path.join(liveAddon,'Inbox.lua'), defaultCwd:workspace,
    adventureDir:old?.adventureDir || path.join(workspace,'adventure-log'),
    capture:{...template.capture,...old?.capture,processName:'WowB'},
    agents:old?.agents || {codex:{path:'',model:'',permissionMode:'default',networkAccess:false,extraArgs:[]},
      workbuddy:{path:'',model:'auto',permissionMode:'dontAsk',tools:['Read','Glob','Grep','WebSearch','WebFetch'],allowedTools:['Read','Glob','Grep','WebSearch','WebFetch'],extraArgs:[],configDir:path.join(target,'data','workbuddy-auth'),environment:'internal'}}};
  if (slotLimits) Object.assign(cfg,slotLimits); // Unit tests use a small slot count.
  write(configFile,cfg);
  fs.mkdirSync(liveAddon, {recursive:true});
  for (const entry of fs.readdirSync(path.join(target,'app','addon','WoWAI'))) {
    if (entry === 'Inbox.lua' && fs.existsSync(path.join(liveAddon,entry))) continue;
    fs.copyFileSync(path.join(target,'app','addon','WoWAI',entry),path.join(liveAddon,entry));
  }
  const node = path.join(target,'runtime','node.exe');
  const result = cp.spawnSync(node,[path.join(target,'app','bridge','install-slots.js')],{encoding:'utf8',windowsHide:true});
  if (result.status !== 0) throw Error('生成游戏通信文件失败。备份位置：' + backup + '\n' + (result.stderr || result.error?.message || ''));
  write(path.join(target,'installation.json'),{version:manifest.version,client:found.client,account,provider,installedAt:new Date().toISOString(),backup});
  return {ok:true, target, version:manifest.version, backup, message:'安装完成。下一步登录 AI，然后启动桥接并重新启动游戏。'};
}
if (require.main === module) {
  try {
    const [action, file] = process.argv.slice(2);
    const args = json(file);
    const result = action === 'discover' ? discover(args.client) : action === 'install' ? install(args) : (()=>{throw Error('Unknown action');})();
    process.stdout.write(JSON.stringify(result));
  } catch (e) { process.stderr.write(e.message); process.exitCode=1; }
}
module.exports = {install, discover, verify, inside};
