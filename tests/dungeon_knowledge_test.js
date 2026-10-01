'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),data=require('../knowledge/dungeons/catalog.json');
const {validate,readAssignment}=require('../tools/dungeon-knowledge'),{encrypt,decrypt}=require('../tools/dungeon-vault'),{extract}=require('../tools/collect-dungeon-knowledge');
const dungeon=id=>data.dungeons.find(d=>d.id===id),quest=(d,id)=>dungeon(d).quests.find(q=>q.id===id);
test('catalog expands populated instances, has real coverage gaps and every quest has a faction',()=>{
 validate(data);assert.ok(data.dungeons.filter(d=>d.quests.length&&d.loot.length).length>=21);
 assert.ok(data.dungeons.reduce((n,d)=>n+d.loot.length,0)>1000);
 for(const d of data.dungeons)assert.equal(d.counts.items,d.loot.length);
 assert.equal(dungeon('excavation-site').coverage,'unavailable');assert.equal(dungeon('excavation-site').counts.quests,0);
});
test('reviewed local knowledge survives import: treaty, turn-in, class materials and unsupported mappings',()=>{
 const q=quest('hall-of-thanes',98423);assert.equal(q.faction,'alliance');assert.equal(q.minLevel,9);assert.equal(q.itemStart,true);assert.equal(q.gatesKnown,false);assert.match(q.instructions,/石板/);
 assert.match(quest('shadowfang-keep',1098).instructions,/庭院内/);
 assert.equal(quest('ruins-of-lordaeron',97288).minLevel,16);
 assert.equal(quest('blackfathom-deeps',1740).classes,256);
 assert.equal(quest('deadmines',1654).faction,'alliance');
 for(const id of [273840,273841,273842])assert.equal(dungeon('blackfathom-deeps').loot.find(i=>i.id===id).bosses.length,0);
});
test('classic boss assignments stay unverified even when item stats have been observed in beta',()=>{
 assert.ok(dungeon('scholomance').loot.some(i=>i.basis==='site'&&i.dropUnverified));
 assert.ok(dungeon('blackrock-depths').quests.every(q=>q.basis==='classic'));
 const b=dungeon('blackrock-depths').bosses.find(b=>b.key==='Lord Roccor');assert.ok(b.aliases.includes('洛考尔'));
 assert.equal(dungeon('ruins-of-lordaeron').bosses.filter(b=>b.key.includes('Baron')).length,1);
});
test('same-name faction counterparts stay distinct and incomplete conditions are never assumed satisfied',()=>{
 assert.equal(quest('ruins-of-lordaeron',95189).faction,'alliance');assert.equal(quest('ruins-of-lordaeron',95204).faction,'horde');
 assert.equal(quest('hall-of-thanes',96393).gatesKnown,false);assert.equal(quest('hall-of-thanes',96393).minLevel,9);
 for(const d of data.dungeons)for(const q of d.quests)assert.ok(q.instructions&&q.name);
});
test('Lua export matches catalog without private paths or embedded credentials',()=>{
 const exported=readAssignment(path.join(root,'addon/WoWAI/DungeonData.lua'),'WoWAIDungeonData');assert.equal(exported.version,data.version);assert.equal(exported.dungeons.length,data.dungeons.length);
 const text=fs.readFileSync(path.join(root,'addon/WoWAI/DungeonData.lua'),'utf8');assert.doesNotMatch(text,/C:\\\\Users\\\\|api_key|access_token|refresh_token|key\.dpapi/i);
});
test('source parser preserves Classic caveats and never evaluates scripts',()=>{
 const payload=['$',null,null,{bosses:[{name:'Boss',items:[{i:1}]}],quests:[{id:1,title:'Quest',forever:true}]}];
 const html="<p>A quest&#x27;s text, objectives and rewards are not in the beta client</p><p>Who drops what, and the chances, are Classic&#x27;s</p><script>throw Error('do not execute')</script>"+'self.__next_f.push([1,'+JSON.stringify('1:'+JSON.stringify(payload)+'\n')+'])';
 const r=extract(html);assert.equal(r.quests.length,1);assert.equal(r.questBasis,'classic');assert.equal(r.dropBasis,'classic');
});
test('encrypted archives authenticate data, reject the wrong key and never reuse a nonce',()=>{
 const key=crypto.randomBytes(32),plain=Buffer.from('副本任务、掉落与来源档案'),a=encrypt(plain,key),b=encrypt(plain,key);
 assert.deepEqual(decrypt(a,key),plain);assert.notEqual(a.iv,b.iv);assert.doesNotMatch(JSON.stringify(a),/副本任务/);
 assert.throws(()=>decrypt(a,crypto.randomBytes(32)));const corrupt=structuredClone(a),bytes=Buffer.from(corrupt.ciphertext,'base64');bytes[0]^=1;corrupt.ciphertext=bytes.toString('base64');assert.throws(()=>decrypt(corrupt,key));
 assert.throws(()=>decrypt({...a,version:2},key));
});
test('offline reader embeds valid JavaScript and safe JSON without network dependencies',()=>{
 const html=fs.readFileSync(path.join(root,'knowledge/dungeons/index.html'),'utf8');
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,1);new (require('vm').Script)(scripts[0]);
 const embedded=html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(embedded).version,data.version);assert.doesNotMatch(html,/<script[^>]+src=/);
});
