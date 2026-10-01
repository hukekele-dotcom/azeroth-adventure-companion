'use strict';
const fs=require('fs'),lua=require('luaparse'),crypto=require('crypto');
function literal(n){
 if(['NumericLiteral','StringLiteral','BooleanLiteral'].includes(n.type))return n.type==='StringLiteral'?Buffer.from(n.value,'latin1').toString('utf8'):n.value;
 if(n.type==='NilLiteral')return null;
 if(n.type==='UnaryExpression'&&n.operator==='-'&&n.argument.type==='NumericLiteral')return -n.argument.value;
 if(n.type==='TableConstructorExpression'){
  if(n.fields.length&&n.fields.every(f=>f.type==='TableValue'))return n.fields.map(f=>literal(f.value));
  const o={};let i=1;for(const f of n.fields)o[f.type==='TableValue'?i++:f.key.type==='Identifier'?f.key.name:literal(f.key)]=literal(f.value);return o;
 }
 throw Error('Nonliteral data: '+n.type);
}
function parse(text){return lua.parse(Buffer.from(text,'utf8').toString('latin1'),{encodingMode:'pseudo-latin1',luaVersion:'5.1'});}
function readAssignment(file,name){const ast=parse(fs.readFileSync(file,'utf8'));for(const n of ast.body)if(n.type==='AssignmentStatement'&&n.variables.some(v=>v.name===name))return literal(n.init[0]);throw Error('Missing '+name);}
const quote=s=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')+'"';
function serialize(v){if(v==null)return 'nil';if(typeof v==='string')return quote(v);if(typeof v!=='object')return String(v);if(Array.isArray(v))return '{'+v.map(serialize).join(',')+'}';return '{'+Object.entries(v).filter(([,v])=>v!==undefined).map(([k,v])=>'['+(isNaN(Number(k))?quote(k):k)+']='+serialize(v)).join(',')+'}';}
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function validate(data){
 const ids=new Set();for(const d of data.dungeons){if(ids.has(d.id))throw Error('Duplicate dungeon '+d.id);ids.add(d.id);
  const bs=new Set(d.bosses.map(b=>b.key));for(const collection of [d.quests,d.loot]){const seen=new Set();for(const x of collection){if(!Number.isInteger(x.id)||seen.has(x.id))throw Error('Duplicate/invalid ID '+d.id+':'+x.id);seen.add(x.id);}}
  for(const i of d.loot){for(const b of i.bosses)if(!bs.has(b))throw Error('Unknown boss '+b);if(!['site','classic','unspecified'].includes(i.basis))throw Error('Unknown evidence '+i.id);}
  for(const q of d.quests){if(!['alliance','horde','both','unknown'].includes(q.faction))throw Error('Missing faction '+q.id);if(q.minLevel!=null&&(!Number.isInteger(q.minLevel)||q.minLevel<1||q.minLevel>60))throw Error('Invalid minimum '+q.id);}
 }
 if(/[A-Z]:[\\/](?:Users|个人文档)/i.test(JSON.stringify(data)))throw Error('Private path in public catalog');
 return data;
}
module.exports={literal,parse,readAssignment,serialize,sha256,validate};
