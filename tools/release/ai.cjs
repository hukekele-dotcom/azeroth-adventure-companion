'use strict';
const fs=require('fs'), path=require('path'), cp=require('child_process');
const root=__dirname, node=path.join(root,'runtime','node.exe');
const configFile=path.join(root,'app','bridge','config.json');
async function run(file,args,env) {
  return new Promise((resolve,reject)=>{
    const child=cp.spawn(file,args,{cwd:path.join(root,'app'),env,stdio:'inherit'});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(Error('命令未成功完成，退出码 '+code)));
  });
}
async function main() {
  const cfg=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const provider=process.argv[2] || cfg.agent;
  if(!['codex','workbuddy'].includes(provider))throw Error('Unknown provider');
  const versions=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8')).ai;
  const runtime=path.join(root,'ai-runtime',provider);
  const cli=path.join(runtime,'node_modules',...(provider==='codex'?['@openai','codex','bin','codex.js']:['@tencent-ai','codebuddy-code','bin','codebuddy']));
  const env={...process.env,PATH:path.join(root,'runtime')+path.delimiter+process.env.PATH};
  if(!fs.existsSync(cli)) {
    console.log('正在从 npm 官方仓库安装 AI 工具；完成后进入官方登录。');
    fs.mkdirSync(runtime,{recursive:true});
    await run(node,[path.join(root,'runtime','node_modules','npm','bin','npm-cli.js'),'install','--prefix',runtime,'--registry=https://registry.npmjs.org','--fetch-timeout=45000','--fetch-retries=1','--no-audit','--no-fund',versions[provider]],env);
  }
  cfg.agents[provider] ||= {};
  cfg.agents[provider].path=cli;
  if(provider==='workbuddy') {
    cfg.agents.workbuddy.model='auto';
    cfg.agents.workbuddy.configDir=path.join(root,'data','workbuddy-auth');
    const W=require('./app/bridge/workbuddy');
    console.log('这是 WorkBuddy 的官方 CodeBuddy 执行引擎登录。请选择中国站并登录自己的账号。若出现交互提示，可输入 /login；登录后输入 /exit 关闭。');
    fs.writeFileSync(configFile,JSON.stringify(cfg,null,2));
    await run(node,[path.join(root,'app','bridge','workbuddy-launch.cjs'),cli],W.AGENTS.workbuddy.env(env,cfg.agents.workbuddy));
  } else {
    console.log('请在官方页面登录自己的 Codex 账号。');
    fs.writeFileSync(configFile,JSON.stringify(cfg,null,2));
    await run(node,[cli,'login'],env);
  }
  console.log('登录程序已退出。请启动桥接并在游戏里发一条测试消息，确认账号可用。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
