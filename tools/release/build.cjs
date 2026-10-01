'use strict';
const fs=require('fs'), path=require('path'), os=require('os'), crypto=require('crypto');
const repo=path.resolve(__dirname,'../..');
const version=require('../../package.json').version;
const nodeVersion='v22.23.3';
const nodeHash='2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71';
const addon=['Adventure.lua','AdventureUI.lua','Codec.lua','Dungeon.lua','DungeonData.lua','DungeonUI.lua','Gear.lua','Kills.lua','Locale.lua','Map.lua','QuestLocations.lua','WoWAI.lua','WoWAI.toc','THIRD_PARTY.md'];
const bridge=['adventure.js','agents.js','bridge.js','capture.ps1','diary.js','draft-run.js','install-slots.js','job-limits.js','saved-variables.js','narrative.js','planner.js','protocol.js','supervisor.js','workbuddy-launch.cjs','workbuddy.js'];
function walk(root) { return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)]); }
function hash(file) {return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function build(output) {
  const cache=path.join(os.tmpdir(),'wow-ai-release-cache');
  const nodeZip=path.join(cache,`node-${nodeVersion}-win-x64.zip`);
  if(hash(nodeZip)!==nodeHash)throw Error('Official Node archive checksum mismatch');
  const runtime=path.join(cache,`node-${nodeVersion}-win-x64`);
  const stage=path.join(path.resolve(output),`WoWAI-Forever-${version}-win-x64`);
  if(fs.existsSync(stage))throw Error('Output already exists; use a fresh build directory');
  fs.mkdirSync(stage,{recursive:true});
  function copy(from,to) {fs.mkdirSync(path.dirname(path.join(stage,to)),{recursive:true});fs.copyFileSync(path.join(repo,from),path.join(stage,to));}
  for(const name of addon)copy('addon/WoWAI/'+name,'app/addon/WoWAI/'+name);
  fs.writeFileSync(path.join(stage,'app/addon/WoWAI/Inbox.lua'),'-- Clean distribution placeholder\nWoWAI_Inbox = { id = 0, replies = {} }\n');
  const toc=path.join(stage,'app/addon/WoWAI/WoWAI.toc');
  fs.writeFileSync(toc,fs.readFileSync(toc,'utf8').replace(/^## Version:.*$/m,'## Version: '+version));
  for(const name of bridge)copy('bridge/'+name,'app/bridge/'+name);
  const cfg={tocInterface:'16001',slots:200,actMax:60,presenceMax:2000,presenceIntervalMs:30000,maxParallel:3,
    capture:{enabled:true,processName:'WowB',cellPx:4,cellsPerRow:200,maxRows:48,intervalMs:250,keepComposited:false},
    agent:'codex',agents:{},gameContext:true,primerFile:'docs/WOW-ADDON-PRIMER.md',pollMs:750,progressWriteMs:3000,timeoutMs:1800000};
  fs.writeFileSync(path.join(stage,'app/bridge/config.example.json'),JSON.stringify(cfg,null,2));
  copy('docs/WOW-ADDON-PRIMER.md','app/docs/WOW-ADDON-PRIMER.md');
  copy('LICENSE','LICENSE');
  for(const file of ['installer.cjs','ai.cjs','Install.ps1','Manage.ps1','Install.cmd','README.txt']) {
    copy('tools/release/'+file,file);
    // Windows PowerShell 5.1 requires BOM to read Chinese scripts correctly.
    if(/\.(ps1|txt)$/.test(file)) {const dest=path.join(stage,file);fs.writeFileSync(dest,'\uFEFF'+fs.readFileSync(dest,'utf8').replace(/^\uFEFF/,''));}
  }
  require('./build-guides.cjs').render(stage,version);
  fs.cpSync(runtime,path.join(stage,'runtime'),{recursive:true});
  fs.writeFileSync(path.join(stage,'release.json'),JSON.stringify({name:'Azeroth Adventure Companion',version,
    documentation:{languages:['zhCN','zhTW','en'],entry:'README.html'},
    platform:'win32-x64',client:'Forever 1.60 / 16001',upstream:'https://github.com/chelinho139/wow-ai',
    node:{version:nodeVersion,archiveSha256:nodeHash,source:`https://nodejs.org/dist/${nodeVersion}/`},
    ai:{codex:'@openai/codex@0.159.3',workbuddy:'@tencent-ai/codebuddy-code@2.160.0'}},null,2));
  const files={};
  for(const file of walk(stage)) {
    const rel=path.relative(stage,file).split(path.sep).join('/');
    if(!rel.startsWith('runtime/')) {
      const text=fs.readFileSync(file,'utf8');
      if(/[A-Z]:[\\/]+Users[\\/]+[^\\/]+[\\/]/.test(text))throw Error('Personal home path leaked: '+rel);
      if(/(^|\/)(config\.json|state\.json|transcripts\.json|.*\.log|.*\.pid)$/.test(rel))throw Error('Private runtime file: '+rel);
    }
    files[rel]=hash(file);
  }
  fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify({version,files},null,2));
  return stage;
}
if(require.main===module)console.log(build(process.argv[2] || path.join(os.homedir(),'wow-ai-releases',Date.now().toString())));
module.exports={build,walk,hash};
