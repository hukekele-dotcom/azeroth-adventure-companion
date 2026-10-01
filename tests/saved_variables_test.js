'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),os=require('os');
const {savedVariableFiles,matchesActiveSession}=require('../bridge/saved-variables');
test('automatically discovers new accounts and only reads WoWAI save files',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wowai-saves-'));
  try {
    assert.deepEqual(savedVariableFiles({savedVariablesRoot:path.join(root,'missing')}),[]);
    const put=(account,time)=>{const file=path.join(root,account,'SavedVariables','WoWAI.lua');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');fs.utimesSync(file,time,time);return file;};
    const first=put('FIRST',10);
    fs.writeFileSync(path.join(root,'FIRST','SavedVariables','OtherAddon.lua'),'private');
    const cfg={savedVariablesRoot:root,savedVariablesFile:'stale'};
    assert.deepEqual(savedVariableFiles(cfg),[first]);
    const second=put('SECOND',20);
    assert.deepEqual(savedVariableFiles(cfg),[second,first]);
    assert.deepEqual(savedVariableFiles({savedVariablesFile:first}),[first]);
    assert.deepEqual(savedVariableFiles({}),[]);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('automatic fallback never replays another account or unknown active session',()=>{
  assert.equal(matchesActiveSession({session:'old'},'new'),false);
  assert.equal(matchesActiveSession({session:'old'},undefined),false);
  assert.equal(matchesActiveSession(null,'active'),false);
  assert.equal(matchesActiveSession({session:'active'},'active'),true);
});
