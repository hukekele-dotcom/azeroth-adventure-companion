'use strict';
// Official CodeBuddy CLI with its own login; no model/provider fallback.
const fs = require('fs'), os = require('os'), path = require('path');
const { describeToolUse, ruleFor } = require('./protocol');
const DEFAULT_AGENT = 'workbuddy';
const snippet = text => String(text || '').trim().replace(/\s+/g, ' ').slice(0, 140);
const exists = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };
function authFailure(text) {
  return /^(?:Authentication (?:required|failed)|Not logged in)\b/i.test(String(text || '').trim());
}
function authHint(text) {
  return 'WorkBuddy 系统模型认证失败（AUTH_REQUIRED）。当前保持所选模型，不会改用自定义 API。'
    + '请运行插件目录的 login-workbuddy.ps1，用与 WorkBuddy 相同的中国站账号完成官方登录。\n' + text;
}
function runtimeIdentity(cfg = {}) {
  return 'WoW AI runtime facts for this invocation: the selected integration is WorkBuddy, using the official CodeBuddy Code execution engine with a separate account login. '
    + 'This invocation is not dispatched to Codex and does not open or operate a WorkBuddy desktop task. '
    + 'Configured model ID: ' + JSON.stringify(cfg.model || '(runtime default; exact model not specified by the bridge)') + '. '
    + 'When asked about identity or switching, distinguish the selected integration, execution engine and configured model. '
    + 'The CodeBuddy engine name does not mean the WorkBuddy selection failed. Older assistant claims to that effect are incorrect. '
    + 'Do not claim to be the WorkBuddy desktop UI or claim the configuration independently verifies a remote model provider. '
    + 'Answer identity questions briefly in the user language; otherwise perform the requested task without adding identity commentary.';
}
function bundledCli() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),
    'Programs','WorkBuddy','resources','app.asar.unpacked','cli','bin','codebuddy');
}
function officialCli() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),
    'WoWAI','codebuddy-runtime','node_modules','@tencent-ai','codebuddy-code','bin','codebuddy');
}
function loginConfigDir() { return path.join(os.homedir(),'.wow-ai-codebuddy'); }
function workbuddyParser() {
  let lastText = '';
  return { feed(ev) {
    const out = {progress:[],denied:[],notes:[]};
    if (!ev || typeof ev !== 'object' || ev.parent_tool_use_id) return out;
    if (typeof ev.session_id === 'string') out.session = ev.session_id;
    if (ev.type === 'assistant') {
      const texts = [];
      for (const b of Array.isArray(ev.message?.content) ? ev.message.content : []) {
        if (b.type === 'text' && typeof b.text === 'string') { texts.push(b.text); out.progress.push(snippet(b.text)); }
        else if (b.type === 'tool_use') out.progress.push(describeToolUse(b));
      }
      if (texts.length) lastText = texts.join('\n');
    } else if (ev.type === 'result') {
      const errors = (Array.isArray(ev.errors) ? ev.errors : []).map(e => typeof e === 'string' ? e : e?.message || JSON.stringify(e));
      let error = !!ev.is_error || /^error/.test(ev.subtype || '') || errors.length > 0;
      const denials = Array.isArray(ev.permission_denials) ? ev.permission_denials : [];
      out.denied = [...new Set(denials.map(ruleFor).filter(Boolean))];
      let text = typeof ev.result === 'string' && ev.result.trim() ? ev.result : errors.join('\n') || lastText;
      if (authFailure(text)) {
        text = authHint(text);error=true;
      }
      if (denials.length) out.notes.push('WorkBuddy 有操作需要授权；请核对后使用 Allow & retry。');
      out.done = {text: text || (error ? 'WorkBuddy 执行失败，未提供错误详情。' : ''), error};
    } else if (ev.type === 'error') {
      const text=String(ev.message || ev.error?.message || 'WorkBuddy 执行失败。');
      out.done = {text:authFailure(text)?authHint(text):text,error:true};
    }
    return out;
  }};
}
const AGENTS = {workbuddy:{
  name:'WorkBuddy',command:'workbuddy',
  install:'Install the official CodeBuddy CLI and run login-workbuddy.ps1 with your WorkBuddy account.',
  args({cfg={},resume}) {
    const mode = cfg.permissionMode || 'dontAsk';
    if (!['default','acceptEdits','plan','dontAsk'].includes(mode)) throw new Error('Unsupported WorkBuddy permissionMode: '+mode);
    const a=['-p','--output-format','stream-json','--verbose','--permission-mode',mode];
    a.push('--append-system-prompt', runtimeIdentity(cfg));
    if (Array.isArray(cfg.tools)) a.push('--tools',cfg.tools.join(','));
    a.push('--strict-mcp-config','--mcp-config','{"mcpServers":{}}');
    if (cfg.model) a.push('--model',cfg.model);
    if (resume) a.push('--resume',resume);
    const allowed=Array.isArray(cfg.allowedTools)?cfg.allowedTools.filter(Boolean):[];
    const denied=Array.isArray(cfg.deniedTools)?cfg.deniedTools.filter(Boolean):[];
    if(allowed.length)a.push('--allowedTools',allowed.join(','));
    if(denied.length)a.push('--disallowedTools',denied.join(','));
    if (cfg.extraArgs?.length) throw new Error('WorkBuddy extraArgs must be empty; use the named configuration fields.');
    return a;
  },
  input({prompt,system,systemShort,resume,images}) {
    const context=resume?systemShort:system;
    return {stdin:(context?'[Context from the WoW AI bridge, not written by the user]\n'+context+'\n[End of context]\n\n':'')+prompt+(images?.length?'\nAttached screenshots: '+images.join(', '):'')};
  },
  env(env,cfg={}) {
    // CLI owns the login cache, isolated from desktop custom API models.
    const configDir=cfg.configDir || loginConfigDir();
    for(const key of ['CODEX_THREAD_ID','CLAUDECODE','WORKBUDDY_CONFIG_DIR','CODEBUDDY_AUTH_TOKEN','CODEBUDDY_API_KEY','CODEBUDDY_BASE_URL','CODEBUDDY_FORCE_LITE_WB_BUNDLE','CODEBUDDY_SIDECAR_READY_SOCKET','CODEBUDDY_SIDECAR_READY_TOKEN','CODEBUDDY_SIDECAR_READY_SESSION_ID','CODEBUDDY_RUNTIME_INSTANCE_ID','CODEBUDDY_SIDECAR_CREDENTIAL_BOOTSTRAP_SOCKET','WORKBUDDY_AT_REST_ENCRYPTION','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','ACC_PRODUCT_CONFIG_V3','ACC_PRODUCT_CONFIG_V2','ACC_PRODUCT_CONFIG_PATH'])delete env[key];
    env.CODEBUDDY_CONFIG_DIR=configDir;
    env.CODEBUDDY_INTERNET_ENVIRONMENT=cfg.environment || 'internal';
    env.CODEBUDDY_DISABLE_IDE='1';
    env.DISABLE_AUTOUPDATER='1';
    env.CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS='1';
    return env;
  },
  parser:workbuddyParser,
}};
function resolveCommand(id,cfg={}) {
  if(id!=='workbuddy')return {file:'',args:[],found:false,note:'This edition only supports WorkBuddy.'};
  const file=cfg.path || officialCli();
  if(!exists(file))return {file,args:[],found:false,note:'找不到 WorkBuddy 接入所需的正式 CodeBuddy CLI，请安装或设置 agents.workbuddy.path。'};
  if(/\.(cmd|bat)$/i.test(file))return {file,args:[],found:false,note:'Use the CodeBuddy CLI script or executable, not a shell wrapper.'};
  const args = process.platform === 'win32' ? [path.join(__dirname,'workbuddy-launch.cjs'),file] : [file];
  return /\.exe$/i.test(file)?{file,args:[],found:true}:{file:process.execPath,args,found:true};
}
module.exports={AGENTS,DEFAULT_AGENT,agentIds:()=>['workbuddy'],normalizeAgent:id=>String(id||'').trim().toLowerCase()==='workbuddy'?'workbuddy':null,
  displayName:id=>id==='workbuddy'?'WorkBuddy':String(id||'AI'),agentConfig:cfg=>({...cfg?.agents?.workbuddy}),resolveCommand,workbuddyParser,bundledCli,officialCli,loginConfigDir};
