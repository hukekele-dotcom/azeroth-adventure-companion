'use strict';
const fs=require('fs'),path=require('path');
function dayKey(event){
  if(/^\d{4}-\d{2}-\d{2}$/.test(event.day||''))return 'day-'+event.day;
  const d=new Date(event.t*1000);
  return 'day-'+[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function groups(events){
  const days=new Map();
  for(const e of events){
    const key=e.ledger+':'+dayKey(e);
    if(!days.has(key))days.set(key,[]);
    days.get(key).push(e);
  }
  return [...days.values()].sort((a,b)=>b[0].t-a[0].t);
}
function exportBook(root,events,N){
  const days=groups(events).map(rows=>{
    const first=rows[0],session=dayKey(first),identity={...first,session};
    N.exportSession(root,rows,identity);
    const folder='days/'+first.ledger+'/'+session.slice(4),dir=path.join(root,folder);
    const drafts=fs.readdirSync(dir).filter(f=>/^draft-.*\.json$/.test(f)).map(file=>{
      try {const {draft}=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));return {title:draft.title,body:draft.body,through:draft.through,file:folder+'/'+file.replace(/\.json$/,'.md')};}catch{return null;}
    }).filter(Boolean).reverse();
    return {ledger:first.ledger,character:first.character,date:session.slice(4),source:N.material(rows),stats:N.facts(rows).stats,folder,drafts};
  });
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>每日旅程</title>
<style>body{background:#171b20;color:#e9e1cd;font:18px/1.9 system-ui;margin:24px auto;padding:0 22px;max-width:880px}h1{color:#e7bc64}button,select{font:inherit;border:1px solid #776445;border-radius:6px;background:#29271f;color:inherit;padding:6px 14px;margin:4px}button:disabled{opacity:.35}article{background:#24231f;padding:24px 36px;border:1px solid #655537;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;min-height:330px}small{color:#b4aa94}nav{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}a{color:#e7bc64}</style>
<h1>每日旅程</h1><small>同一角色按当地日期合并，每天一篇；刷新可查看新归档。此页面不调用 AI。</small>
<div><select id="who" aria-label="角色"></select><select id="date" aria-label="日期"></select><select id="mode" aria-label="文字版本"><option value="">行动素材</option></select></div>
<nav><button id="previous">前一天</button><strong id="heading"></strong><button id="next">后一天</button></nav><p id="stats"></p><article id="text"></article>
<nav><button id="back">上一页</button><span id="count"></span><button id="forward">下一页</button></nav><p><a id="source">查看完整素材</a> · <a href="冒险档案.html">详细记录与里程碑</a></p>
<script type="application/json" id="data">${JSON.stringify(days).replace(/</g,'\\u003c')}</script><script>
const data=JSON.parse(document.getElementById('data').textContent),el=id=>document.getElementById(id);let list=[],at=0,page=0,pages=[];
for(const d of data)if(![...el('who').options].some(o=>o.value===d.ledger))el('who').add(new Option(d.character,d.ledger));
function characters(){list=data.filter(d=>d.ledger===el('who').value).sort((a,b)=>b.date.localeCompare(a.date));el('date').replaceChildren();for(let i=0;i<list.length;i++)el('date').add(new Option(list[i].date,i));at=0;select()}
function select(){page=0;el('date').value=at;el('mode').replaceChildren(new Option('行动素材',''));for(const [i,d]of(list[at]?.drafts||[]).entries())el('mode').add(new Option(d.title+' · #'+d.through,i));content()}
function content(){const d=list[at];page=0;pages=[];if(!d){el('text').textContent='暂无旅程';return}const draft=el('mode').value===''?null:d.drafts[Number(el('mode').value)];const text=draft?draft.title+'\\n\\n'+draft.body:d.source;let p='';for(const line of text.split('\\n')){if(p.length+line.length>950&&p){pages.push(p);p=''}const chars=Array.from(line);while(chars.length>950){if(p){pages.push(p);p=''}pages.push(chars.splice(0,950).join(''))}p+=chars.join('')+'\\n'}if(p)pages.push(p);el('heading').textContent=d.date;el('stats').textContent='已记录击杀参与 '+d.stats.kills+' · 拾取 '+d.stats.loot+' · 经验 '+d.stats.xp;el('source').href=draft?draft.file:d.folder+'/source.md';draw()}
function draw(){el('text').textContent=pages[page]||'';el('count').textContent='第 '+(page+1)+' / '+Math.max(1,pages.length)+' 页';el('previous').disabled=at>=list.length-1;el('next').disabled=at<=0;el('back').disabled=page<=0;el('forward').disabled=page>=pages.length-1}
el('who').onchange=characters;el('date').onchange=()=>{at=Number(el('date').value);select()};el('mode').onchange=content;el('previous').onclick=()=>{if(at<list.length-1){at++;select()}};el('next').onclick=()=>{if(at>0){at--;select()}};el('back').onclick=()=>{if(page>0){page--;draw()}};el('forward').onclick=()=>{if(page<pages.length-1){page++;draw()}};characters();</script></html>`;
  const file=path.join(root,'每日旅程.html');fs.writeFileSync(file+'.tmp',html);fs.renameSync(file+'.tmp',file);
  return days;
}
module.exports={dayKey,groups,exportBook};
