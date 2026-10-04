'use strict';
// Public, cached research only. Parse JSON literals; never execute source scripts.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reference/coverage-20261003');
fs.mkdirSync(dir,{recursive:true});
async function get(url,file,binary=false){const dest=path.join(dir,file);if(fs.existsSync(dest))return binary?fs.readFileSync(dest):fs.readFileSync(dest,'utf8');const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${r.status} ${url}`);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync(dest,b);return binary?b:b.toString('utf8');}
function values(html){const stream=[...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g)].map(m=>JSON.parse(m[1])).join('');const out=[];for(const line of stream.split('\n')){const m=/^[\da-f]+:([\[{].*)$/.exec(line);if(m)try{out.push(JSON.parse(m[1]));}catch{}}return out;}
function walk(o,fn){if(!o||typeof o!=='object')return;fn(o);for(const v of Object.values(o))walk(v,fn);}
async function main(){
 const index=await get('https://warcraftforever.games/maps','maps.html');
 const slugs=[...new Set([...index.matchAll(/href="\/maps\/([a-z0-9-]+)"/g)].map(m=>m[1]))];
 const maps=[];for(const slug of slugs){const html=await get('https://warcraftforever.games/maps/'+slug,slug+'.html');const ids=[...new Set([...html.matchAll(/\/zones\/(\d+)\.webp/g)].map(m=>+m[1]))];const images=[...new Set([...html.matchAll(/https:[^"\s<>\\]+\.webp/g)].map(m=>m[0]))];maps.push({slug,url:'https://warcraftforever.games/maps/'+slug,ids,images,sha256:crypto.createHash('sha256').update(html).digest('hex')});}
 const quests=[];for(const lang of ['en','zh-CN','zh-TW']){const html=await get(`https://warcraftforever.games/${lang==='en'?'':lang+'/'}quests`,'quests-'+lang+'.html');const arrays=[];for(const o of values(html))walk(o,v=>{if(Array.isArray(v)&&v.length>20&&v[0]&&typeof v[0]==='object'&&!Array.isArray(v[0]))arrays.push(v);});quests.push({lang,arrays});}
 fs.writeFileSync(path.join(dir,'map-index.json'),JSON.stringify(maps,null,2));fs.writeFileSync(path.join(dir,'quest-arrays.json'),JSON.stringify(quests,null,2));
 const files=JSON.parse(await get('https://api.github.com/repos/nanderson11/Atlas/contents/Images/Atlas_ClassicWoW','atlas-files.json'));
 await get('https://raw.githubusercontent.com/nanderson11/Atlas/main/Data/Classic-ClassicEra.lua','Atlas-ClassicEra.lua');
 await get('https://raw.githubusercontent.com/nanderson11/Atlas/main/LICENSE','Atlas-LICENSE');
 const assets=files.filter(f=>f.name.endsWith('.blp')&&!f.name.includes('Ent')&&!/Molten|Onyxia|Blackwing|Naxxramas|AhnQiraj|ZulGurub/.test(f.name));
 for(const f of assets)await get(f.download_url,f.name,true);
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({retrieved:new Date().toISOString(),maps:maps.length,questArrays:quests.map(q=>({lang:q.lang,arrays:q.arrays.map(a=>({length:a.length,keys:Object.keys(a[0])}))})),atlasAssets:assets.map(f=>({name:f.name,url:f.download_url,sha:f.sha}))},null,2));
 console.log(JSON.stringify({maps:maps.length,quests:quests.map(q=>[q.lang,q.arrays.map(a=>[a.length,Object.keys(a[0])])]),atlasAssets:assets.length}));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={values,walk};
