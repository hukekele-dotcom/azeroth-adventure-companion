'use strict';
// Parse only literal data; never execute addon Lua on the bridge.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),lua=require('luaparse');
const root=path.resolve(__dirname,'..'),file=path.join(root,'addon/WoWAI/QuestLocations.lua');
const source=fs.readFileSync(file,'utf8');
const tree=lua.parse(source);
function literal(n){
 if(n.type==='NumericLiteral'||n.type==='BooleanLiteral')return n.value;
 if(n.type!=='TableConstructorExpression')throw Error('Unexpected quest data');
 if(n.fields.every(f=>f.type==='TableValue'))return n.fields.map(f=>literal(f.value));
 return Object.fromEntries(n.fields.map(f=>[f.type==='TableKeyString'?f.key.name:literal(f.key),literal(f.value)]));
}
const assignment=tree.body.find(n=>n.type==='AssignmentStatement'&&n.variables[0]?.name==='WoWAIQuestLocations');
const quests=literal(assignment.init[0]);
const version=crypto.createHash('sha256').update(JSON.stringify(quests)).digest('hex').slice(0,24);
fs.writeFileSync(path.join(root,'bridge/quest-locations.json'),JSON.stringify({version,quests}));
fs.writeFileSync(file,source.replace(/\nWoWAIQuestCatalogVersion[^\n]*/g,'').trimEnd()+'\nWoWAIQuestCatalogVersion = "'+version+'"\n');
console.log(JSON.stringify({quests:Object.keys(quests).length,version}));
