'use strict';
// Archive public page data without executing page scripts. Reruns use the dated cache.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function extract(html){
 const stream=[...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)].map(m=>JSON.parse(m[1])).join('');
 let loot,quests=[];
 const visit=o=>{if(!o||typeof o!=='object')return;
  if(Array.isArray(o.bosses)&&o.bosses.some(b=>Array.isArray(b.items)))loot=o;
  if(Array.isArray(o.quests)&&o.quests.some(q=>Number.isInteger(q.id)&&typeof q.title==='string'))quests=o.quests;
  for(const v of Object.values(o))visit(v);
 };
 for(const line of stream.split('\n')){const m=/^[\da-f]+:([\[{].*)$/.exec(line);if(m){let parsed;try{parsed=JSON.parse(m[1]);}catch{continue;}visit(parsed);}}
 const text=html.replace(/&#(?:x27|39);/g,"'");
 const questBasis=/A quest's text, objectives and rewards are not in the beta client/.test(text)?'classic':'community';
 const dropBasis=/Who drops what, and the chances, are Classic's|Nobody has seen these drops in the beta yet/.test(text)?'classic':'community';
 return JSON.parse(JSON.stringify({bosses:loot?.bosses||[],quests,questBasis,dropBasis},(_,v)=>v==='$undefined'?undefined:v));
}
async function collect(target){
 fs.mkdirSync(target,{recursive:true});
 async function page(url,file){if(fs.existsSync(file))return fs.readFileSync(file,'utf8');const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${r.status}: ${url}`);const t=await r.text();fs.writeFileSync(file,t);return t;}
 const index=await page('https://foreverchanges.pro/dungeons',path.join(target,'fc-index.html'));
 const ids=[...new Set([...index.matchAll(/href="\/dungeons\/([a-z0-9-]+)"/g)].map(m=>m[1]))];
 if(ids.length<30)throw Error('Incomplete dungeon index');
 const jobs=ids.flatMap(id=>['en','zh-cn'].map(lang=>({id,lang}))),result=[];let cursor=0;
 async function worker(){while(cursor<jobs.length){const {id,lang}=jobs[cursor++];const url=`https://foreverchanges.pro/${lang==='en'?'':lang+'/'}dungeons/${id}`;
  const html=await page(url,path.join(target,`fc-${lang}-${id}.html`));const data=extract(html);
  result.push({id,lang,url,sha256:crypto.createHash('sha256').update(html).digest('hex'),...data});
 }}
 await Promise.all([worker(),worker(),worker()]);result.sort((a,b)=>a.id.localeCompare(b.id)||a.lang.localeCompare(b.lang));
 fs.writeFileSync(path.join(target,'foreverchanges.json'),JSON.stringify({retrieved:new Date().toISOString(),records:result},null,2)+'\n');
 console.log(JSON.stringify({pages:result.length,dungeons:ids.length,quests:result.filter(r=>r.lang==='en').reduce((n,r)=>n+r.quests.length,0),bosses:result.filter(r=>r.lang==='en').reduce((n,r)=>n+r.bosses.length,0)}));
}
module.exports={extract,collect};
if(require.main===module)collect(path.resolve(process.argv[2]||path.join(__dirname,'../reference/dungeons/2026-10-01'))).catch(e=>{console.error(e);process.exitCode=1;});
