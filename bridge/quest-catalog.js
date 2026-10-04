'use strict';
const catalog=require('./quest-locations.json');
// Masks index objectives WITHIN their type, not within the full quest log.
function objectiveIndices(q,row){
 if(q.complete)return undefined;
 const kind=row[3]>4?row[3]-4:row[3],type=['','monster','object','item'][kind];
 if(!type||!Number.isSafeInteger(row[4])||row[4]<=0)return undefined;
 const bucket=(q.objectives||[]).map((o,i)=>({...o,index:i+1})).filter(o=>o.type===type),indices=[];
 let mask=row[4],bit=0;
 while(mask>0){if(mask%2){if(!bucket[bit])return undefined;indices.push(bucket[bit].index);}mask=Math.floor(mask/2);bit++;}
 return indices.length?indices:undefined;
}
function expand(q){
 if(!q?.locationCatalog)return q;
 const c=q.locationCatalog;
 function fail(){const e=Error('任务资料库版本不一致或引用无效，请用同一安装包升级插件和桥接。');e.code='QUEST_CATALOG';throw e;}
 if(c.version!==catalog.version||!Array.isArray(c.points)||c.points.length>16||!Array.isArray(c.sources)||c.sources.length>16)return fail();
 const rows=catalog.quests[q.id]?.[q.complete?'turnin':'objective']||[];
 const locations=c.points.map(p=>{
  if(!Array.isArray(p))return fail();
  if(p.length===2){
   if(!Number.isInteger(p[0])||p[0]<1)return fail();
   const row=rows[p[0]-1],source=c.sources[p[1]-1];
   if(!row||!Number.isInteger(p[1])||typeof source!=='string')return fail();
   const indices=objectiveIndices(q,row);
   return {key:'db'+p[0],m:row[0],x:row[1],y:row[2],source,entrance:row[3]>4,...(indices?{objectiveIndices:indices}:{})};
  }
  if(p.length!==6||typeof p[0]!=='string'||!Number.isInteger(p[1])||!Number.isFinite(p[2])||!Number.isFinite(p[3])||typeof p[5]!=='boolean'||!Number.isInteger(p[4])||typeof c.sources[p[4]-1]!=='string')return fail();
  return {key:p[0],m:p[1],x:p[2],y:p[3],source:c.sources[p[4]-1],entrance:p[5]};
 });
 const copy={...q,locations};delete copy.locationCatalog;return copy;
}
module.exports={expand,version:catalog.version,objectiveIndices};
