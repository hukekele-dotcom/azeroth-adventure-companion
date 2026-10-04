'use strict';
// Read public Forever guide strings as data, never execute their Lua/DSL.
// Ordering is adapted under CC BY-NC-SA 4.0; attribution accompanies the data.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{parse,literal}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..');
const tokens=new Set('Alliance Horde Human Orc Dwarf NightElf Undead Scourge Tauren Gnome Troll Skyborne Warrior Paladin Hunter Rogue Priest Shaman Mage Warlock Druid'.split(' '));
function condition(s){
 if(!s)return [];
 const ors=s.trim().split('/').map(part=>part.trim().split(/\s+/));
 return ors.every(and=>and.every(t=>tokens.has(t.replace(/^!/,''))))?ors:null;
}
function extract(text,source){
 const out=[],rejected={};const reject=k=>rejected[k]=(rejected[k]||0)+1;
 for(const [chapter,match]of [...text.matchAll(/RegisterGuide\(\[\[([\s\S]*?)\]\]/g)].entries()){
  const chunks=match[1].split(/^step\b/gm),header=chunks.shift(),title=header.match(/^#name (.+)$/m)?.[1],levels=title?.match(/^(\d+)-(\d+)/);
  if(!levels)continue;
  const headerCondition=condition(header.match(/^<<\s*(.+)$/m)?.[1]);if(!headerCondition)continue;
  const route={id:source+':'+chapter,title,min:+levels[1],max:+levels[2],conditions:headerCondition,steps:[]};
  for(const [order,chunk]of chunks.entries()){
   const lines=chunk.split('\n'),stepCondition=condition(lines[0].split('<<')[1]);
   if(!stepCondition){reject('unknown-condition');continue;}
   if(/^\s*(?:#hardcore|#ssf|#ah|\.dungeon|\.deathskip|\.train|\.itemcount|\.itemStat|\.money|\.cooldown)\b/m.test(chunk)){reject('unsupported-mode-or-gate');continue;}
   const gotos=[...chunk.matchAll(/^\s*\.goto\s+(\d+)(?:\/\d+)?,/gm)],map=gotos.length?+gotos[0][1]:null;
   if(!map){reject('no-explicit-map');continue;}
   if(gotos.some(g=>+g[1]!==map)){reject('mixed-map-step');continue;}
   const guards=[];let unsupported=false;
   for(const g of chunk.matchAll(/^\s*\.(isOnQuest|isQuestTurnedIn|isQuestComplete|isQuestAvailable)\s+([^\n]+)/gm)){
    const value=g[2].split(/>>|--|<</)[0].trim();
    if(!/^-?\d+(?:\s*,\s*-?\d+)*$/.test(value)){unsupported=true;break;}
    guards.push({kind:g[1],ids:value.split(',').map(Number)});
   }
   if(unsupported){reject('unsupported-guard');continue;}
   for(const line of lines){
    const action=line.match(/^\s*\.(accept|complete|turnin)\s+(\d+)(?:,(\d+))?/);if(!action)continue;
    const inline=condition(line.split('<<')[1]?.split('--')[0]);if(!inline){reject('unknown-inline-condition');continue;}
    const kind={accept:'accept',complete:'quest',turnin:'turnin'}[action[1]];
    // Actor directives with their own branch are omitted unless the whole step supplies it.
    const actor=tag=>[...chunk.matchAll(new RegExp('^\\s*\\.'+tag+'\\s+([^\\n]+)','gm'))].filter(m=>!m[1].includes('<<')).map(m=>m[1].split(/>>|--/)[0].trim().replace(/^\+/,'' )).filter(Boolean);
    const actors=actor(kind==='quest'?'mob':'target');if(kind==='quest'&&chunk.includes('|cRXP_ENEMY_'))actors.push(...actor('unitscan'));
    route.steps.push({id:+action[2],kind,objective:kind==='quest'?+(action[3]||0):0,map,order:order+1,conditions:[stepCondition,inline],guards,actors:[...new Set(actors)],use:kind==='quest'?[...chunk.matchAll(/^\s*\.use\s+(\d+)(?:\s*$|\s*(?:--|>>))/gm)].map(m=>+m[1]):[],alongside:/^\s*#completewith\b/m.test(chunk)});
   }
  }
  if(route.steps.length)out.push(route);
 }
 return {routes:out,rejected};
}
function build(){
 const dir=path.join(root,'reference/RestedXP'),tree=JSON.parse(fs.readFileSync(path.join(dir,'tree.json'),'utf8'));
 const files=fs.readdirSync(dir).filter(n=>/^Guides__forever__(?:Horde|Alliance)-/.test(n)&&!/Mage/.test(n)).sort();
 const data={version:1,source:'https://github.com/RestedXP/RXPGuides',revision:tree.sha,license:'CC-BY-NC-SA-4.0',routes:[],actors:{},turnins:{},sourceFiles:[],rejected:{}};
 function lookup(name){const text=fs.readFileSync(path.join(root,'reference/dungeons/2026-10-01',name),'utf8');return literal(parse(text.slice(text.indexOf('[[return ')+2,text.lastIndexOf(']]'))).body[0].arguments[0]);}
 const en=lookup('npc-en.lua'),cn=lookup('npc-zhCN.lua'),first=v=>v&&(v[0]||v[1]),reverse={};for(const [id,n]of Object.entries(en))reverse[first(n)]=id;
 const tw=require('opencc-js').Converter({from:'cn',to:'tw'});
 for(const file of files){const buf=fs.readFileSync(path.join(dir,file)),name=file.replaceAll('__','/'),entry=tree.tree.find(r=>r.path===name);const sha=crypto.createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');if(!entry||entry.sha!==sha)throw Error('Source integrity mismatch: '+file);const result=extract(buf.toString('utf8'),name);data.routes.push(...result.routes);data.rejected[file]=result.rejected;data.sourceFiles.push({path:name,sha,url:data.source+'/blob/'+tree.sha+'/'+name});}
 for(const route of data.routes)for(const step of route.steps)for(const name of step.actors){const zh=first(cn[reverse[name]]);data.actors[name]={enUS:name,...(zh?{zhCN:zh,zhTW:tw(zh)}:{})};}
 const assigned=(file,key)=>{const ast=parse(fs.readFileSync(path.join(root,'reference/EverythingQuests/Data',file),'utf8'));const n=ast.body.find(n=>n.type==='AssignmentStatement'&&n.variables.some(v=>v.identifier?.name===key));if(!n)throw Error(key);return literal(n.init[0]);};
 const turnins=assigned('QuestTurnIn_Forever.lua','CLASSIC_QUEST_TURNIN'),names=assigned('QuestSources_Forever.lua','CLASSIC_QUEST_SOURCES');
 const ids=new Set(data.routes.flatMap(r=>r.steps.map(s=>s.id)));
 for(const id of ids)for(const [map,rows]of Object.entries(turnins[id]||{}))for(const value of rows){const kind=Math.floor(value/1e8)%10,npc=Math.floor(value/1e9);if(kind>2)continue;const en=names[kind===1?'npc':'obj']?.[npc],zh=kind===1&&first(cn[npc]);if(!en)continue;(data.turnins[id]??=[]).push({map:+map,x:Math.floor(value%1e8/1e4)/100,y:value%1e4/100,name:{enUS:en,...(zh?{zhCN:zh,zhTW:tw(zh)}:{})}});}
 const dest=path.join(root,'knowledge/zone-flows');fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'flows.json'),JSON.stringify(data,null,2)+'\n');fs.copyFileSync(path.join(dir,'LICENSE'),path.join(dest,'CC-BY-NC-SA-4.0.txt'));
 console.log(JSON.stringify({chapters:data.routes.length,actions:data.routes.reduce((n,r)=>n+r.steps.length,0),maps:[...new Set(data.routes.flatMap(r=>r.steps.map(s=>s.map)))].sort(),revision:data.revision}));return data;
}
module.exports={condition,extract,build};if(require.main===module)build();
