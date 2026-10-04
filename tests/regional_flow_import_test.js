'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extract,condition}=require('../tools/build-regional-flows.cjs');
test('public DSL importer reads only supported quest facts, preserving order and source map without executing Lua',()=>{
 const text=`error('never execute')
 RXPGuides.RegisterGuide([[\n#forever\n<< Horde\n#name 12-17 Area\nstep << Tauren !Mage
 .goto 1413/1,-2672,-544
 .target Someone
 .accept 870 >>Text
 .accept 848
 step
 .goto 1413/1,-3000,200
 .complete 870,1
 step
 .goto 1442/1,-3000,200
 .turnin 870
 step << UnknownMode
 .goto 1413/1,-3000,200
 .accept 123
 step
 #hardcore
 .goto 1413/1,-3000,200
 .accept 456
 ]])`.replace(/^ +step/gm,'step');
 const r=extract(text,'test');assert.equal(r.routes.length,1);
 assert.deepEqual(r.routes[0].steps.map(s=>[s.kind,s.id,s.map]),[['accept',870,1413],['accept',848,1413],['quest',870,1413],['turnin',870,1442]]);
 assert.deepEqual(r.routes[0].steps[0].actors,['Someone']);assert.equal(condition('Tauren Unknown'),null);
 assert.ok(r.rejected['unknown-condition']);assert.ok(r.rejected['unsupported-mode-or-gate']);
});
test('regional data has licensed provenance and only public Forever source chapters',()=>{
 const data=require('../knowledge/zone-flows/flows.json');assert.equal(data.license,'CC-BY-NC-SA-4.0');assert.match(data.revision,/^[a-f0-9]{40}$/);
 assert.equal(data.routes.length,27);assert.equal(new Set(data.routes.flatMap(r=>r.steps.map(s=>s.map))).size,21);
 for(const r of data.routes){assert.match(r.id,/Guides\/forever\//);assert.ok(r.min<=r.max);for(const s of r.steps){assert.ok(['accept','quest','turnin'].includes(s.kind));assert.ok(s.id>0);assert.equal(s.x,undefined,'Never reinterpret world coordinates as map percentages');}}
});
