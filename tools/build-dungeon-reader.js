'use strict';
const fs=require('fs'),path=require('path');
const dir=path.resolve(__dirname,'../knowledge/dungeons'),data=JSON.parse(fs.readFileSync(path.join(dir,'catalog.json'),'utf8'));
const embedded=JSON.stringify(data).replace(/</g,'\\u003c');
fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>艾泽拉斯 · 副本知识库</title>
<style>:root{color-scheme:dark;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#101413;color:#e6e9e3}body{max-width:1160px;margin:auto;padding:36px 24px}h1{font-size:30px;color:#ebc887;margin:8px 0}p{color:#aebbb1;line-height:1.7}.toolbar{position:sticky;top:0;background:#101413f2;padding:18px 0;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid #35423a}select,input{font:inherit;padding:12px;border:1px solid #465448;border-radius:7px;background:#1b241e;color:inherit}input{flex:1;min-width:180px}article{border:1px solid #35423a;border-radius:10px;padding:20px;margin:14px 0;background:#182019}h2{font-size:18px;margin:0 0 10px}pre{white-space:pre-wrap;font:inherit;line-height:1.75}small{color:#9ba99e}a{color:#e3c796;margin-right:14px}.tag{font-size:12px;color:#e3c796;background:#302c1d;padding:4px 8px;border-radius:5px;display:inline-block;margin:0 6px 4px 0}#stats{padding:18px 0;color:#c8d3c7}.empty{padding:35px;border:1px dashed #647562;border-radius:10px}button{cursor:pointer}summary{cursor:pointer;color:#debf85}footer{color:#9ca99f;padding:25px 0;font-size:13px}</style>
<header><small>AZEROTH ADVENTURE COMPANION · OFFLINE REFERENCE</small><h1>副本知识库</h1><p>任务准备、首领掉落与资料缺口。全部查询在本机完成，无需 AI，也不消耗模型额度。<br>来源各自标注版本；“经典参考”不代表无限版已验证。空白表示尚未收集，不能理解为没有任务或掉落。</p></header>
<div class="toolbar"><select id="dungeon" aria-label="副本"></select><select id="kind" aria-label="分类"><option value="quests">副本任务</option><option value="loot">副本掉落</option></select><select id="faction" aria-label="阵营"><option value="all">所有阵营</option><option value="horde">部落与双方</option><option value="alliance">联盟与双方</option></select><input id="search" type="search" placeholder="搜索任务、首领、物品或编号" aria-label="搜索"></div><div id="stats"></div><main id="results"></main><footer>数据快照 ${data.version} · 本文件只包含可发布的游戏资料；私有原始资料加密档另存。</footer>
<script id="catalog" type="application/json">${embedded}</script><script>
const db=JSON.parse(document.getElementById('catalog').textContent),$=id=>document.getElementById(id),sides={alliance:'联盟',horde:'部落',both:'双方',unknown:'阵营待核实'};
function el(tag,text,parent){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(parent)parent.append(n);return n}
for(const d of db.dungeons){const o=el('option',d.name+' · '+d.quests.length+'任务 / '+d.loot.length+'掉落',$('dungeon'));o.value=d.id;}
function render(){const d=db.dungeons.find(d=>d.id===$('dungeon').value),kind=$('kind').value,term=$('search').value.trim().toLowerCase(),side=$('faction').value;
 const rows=d[kind].filter(r=>(kind!=='quests'||side==='all'||r.faction===side||r.faction==='both')&&JSON.stringify(r).toLowerCase().includes(term));
 $('stats').textContent=d.name+' · 显示 '+rows.length+' 条 · '+d.counts.knownLevels+'/'+d.counts.quests+' 项任务已收录接取等级 · '+d.counts.classicItems+' 件经典属性参考';$('results').replaceChildren();
 if(!rows.length)el('div',d.coverage==='unavailable'?'此副本尚无足够资料，不能判断任务是否接齐。':'没有符合条件的记录。',$('results')).className='empty';
 for(const r of rows){const card=el('article',null,$('results'));el('h2',r.name+' · #'+r.id,card);const tags=el('div',null,card);
 const badge=t=>el('span',t,tags).className='tag';if(kind==='quests'){badge(sides[r.faction]);badge(r.minLevel?'最低 '+r.minLevel+' 级':'接取等级待核实');if(r.basis==='classic')badge('经典流程参考');if(!r.gatesKnown)badge('部分接取条件待核实');
 el('pre',[r.from,r.inside||r.itemStart?'副本内 / 物品触发':'',r.instructions,r.prerequisites?'前置：'+r.prerequisites:''].filter(Boolean).join('\\n'),card);
 if(r.rewards.length)el('p','奖励：'+r.rewards.map(x=>x.name).join(' / '),card);
 }else{badge(r.basis==='classic'?'经典属性参考':r.basis==='site'?'无限社区属性':'属性待核实');if(r.dropUnverified)badge('首领归属待复核');const bs=r.bosses.map(k=>d.bosses.find(b=>b.key===k)?.name||k);el('p','来源：'+(bs.join(' / ')||r.from||'待核实'),card);el('pre',(r.referenceLines||[...(r.stats||[]).map(s=>s.label+' +'+s.value),...(r.effects||[]).map(e=>e.text)]).join('\\n'),card);}
 if(r.nameEn&&r.nameEn!==r.name)el('small',r.nameEn,card);const refs=el('details',null,card);el('summary','资料来源',refs);for(const url of r.sources||d.sources||[]){if(!/^https:\\/\\//.test(url))continue;const a=el('a',new URL(url).hostname,refs);a.href=url;a.target='_blank';a.rel='noreferrer';}}
}
for(const id of ['dungeon','kind','faction','search'])$(id).addEventListener(id==='search'?'input':'change',render);render();</script></html>`);
console.log('Offline reader generated.');
