'use strict';
// Reviewed factual supplement. Unknown conditions never promote a quest to eligible.
function mergeQuestResearch(data, supplement) {
 for (const record of supplement.records) {
  const d=data.dungeons.find(d=>d.id===record.dungeon);
  if(!d)throw Error('Unknown research dungeon '+record.dungeon);
  let q=d.quests.find(q=>q.id===record.id);
  if(!q){q={id:record.id,...record.quest};d.quests.push(q);}
  for(const [key,value] of Object.entries(record.fill||{})) {
   if(q[key]==null||q[key]===''||(Array.isArray(q[key])&&!q[key].length))q[key]=value;
  }
  Object.assign(q,record.details||{});
  q.sources=[...new Set([...(q.sources||[]),...record.sources])];
  q.sourceDate=supplement.date;
  d.sources=[...new Set([...(d.sources||[]),...record.sources])];
  d.sourceDate=supplement.date;
  d.source='Local knowledge base · '+supplement.date;
 }
 return data;
}
module.exports={mergeQuestResearch};
