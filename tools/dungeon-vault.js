'use strict';
// Local source archive: authenticated AES-256-GCM, key protected by Windows CurrentUser DPAPI.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const AAD=Buffer.from('WoWAI-DungeonKnowledge-v1');
function encrypt(bytes,key){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(AAD);const ciphertext=Buffer.concat([c.update(bytes),c.final()]);return {version:1,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
function decrypt(record,key){if(record.version!==1||record.algorithm!=='AES-256-GCM')throw Error('Unsupported vault');const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv,'base64'));d.setAAD(AAD);d.setAuthTag(Buffer.from(record.tag,'base64'));return Buffer.concat([d.update(Buffer.from(record.ciphertext,'base64')),d.final()]);}
function key(file){
 if(process.platform!=='win32')throw Error('Windows DPAPI required');
 const helper=path.join(__dirname,'dungeon-vault-key.ps1');
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',helper,'-KeyPath',path.resolve(file)],{encoding:'utf8',windowsHide:true});
 if(r.status!==0)throw Error('Cannot unlock local knowledge key for this Windows account');
 const result=Buffer.from(r.stdout.trim(),'base64');if(result.length!==32)throw Error('Invalid key');return result;
}
function seal({research,snapshots,destination}){
 destination=path.resolve(destination);const repo=path.resolve(__dirname,'..');
 if(destination===repo||destination.toLowerCase().startsWith(repo.toLowerCase()+path.sep))throw Error('Keep private vault outside the release repository');
 fs.mkdirSync(destination,{recursive:true});const records=[];
 // Only whitelisted research facts; no publishing receipts, login settings, saved games or chats.
 for(const folder of fs.readdirSync(research).filter(n=>n.includes('专题_'))){for(const f of ['资料核对.md','研究/正文物品清单.json','研究/成稿物品数据.json','研究/首领与掉落_20260922.json','研究/FC物品数据.json']){const file=path.join(research,folder,f);if(fs.existsSync(file))records.push({name:folder+'/'+f,text:fs.readFileSync(file,'utf8')});}}
 for(const name of fs.readdirSync(snapshots).filter(n=>/^fc-(?:en|zh-cn)-.*\.html$/.test(n)))records.push({name:'public-snapshots/'+name,text:fs.readFileSync(path.join(snapshots,name),'utf8')});
 const plaintext=Buffer.from(JSON.stringify({schema:1,created:new Date().toISOString(),records})),k=key(path.join(destination,'key.dpapi'));
 try{const cipher=encrypt(plaintext,k),file=path.join(destination,'sources.vault.json');fs.writeFileSync(file,JSON.stringify(cipher)+'\n');
  if(!decrypt(JSON.parse(fs.readFileSync(file,'utf8')),k).equals(plaintext))throw Error('Vault verification failed');
  const receipt={files:records.length,algorithm:cipher.algorithm,keyProtection:'Windows DPAPI CurrentUser',roundTrip:true,plaintextSha256:crypto.createHash('sha256').update(plaintext).digest('hex')};fs.writeFileSync(path.join(destination,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{k.fill(0);plaintext.fill(0);}
}
module.exports={encrypt,decrypt,seal};
if(require.main===module){const [research,snapshots,destination]=process.argv.slice(2);if(!research||!snapshots||!destination)throw Error('Usage: node dungeon-vault.js RESEARCH SNAPSHOTS PRIVATE_DESTINATION');console.log(JSON.stringify(seal({research,snapshots,destination})));}
