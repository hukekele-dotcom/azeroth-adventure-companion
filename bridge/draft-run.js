'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),N=require('./narrative');
// One captured request, bounded sequential prompts, and validated resumable parts.
class DraftRun {
 constructor(root,identity,events,agent,options){
  this.identity=identity;this.events=events;this.batches=N.batches(identity,events,options);this.parts=[];
  const hash=crypto.createHash('sha256').update(JSON.stringify({v:2,agent,ledger:identity.ledger,session:identity.session,locale:identity.locale,events,batches:this.batches.map(b=>b.events.map(e=>e.seq))})).digest('hex');
  const dir=path.join(root,'draft-parts');fs.mkdirSync(dir,{recursive:true});this.file=path.join(dir,hash+'.json');
  try{
   const cache=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(!cache.completed&&Array.isArray(cache.parts)&&cache.parts.length<=this.batches.length){
    this.parts=cache.parts.map((part,i)=>N.parse('```wowstory\n'+JSON.stringify(part)+'\n```',identity,this.batches[i].events));
   }
  }catch{this.parts=[];}
 }
 get done(){return this.parts.length===this.batches.length;}
 get progress(){return {part:Math.min(this.parts.length+1,this.batches.length),total:this.batches.length};}
 get prompt(){return this.batches[this.parts.length]?.prompt;}
 accept(text){
  if(this.done)throw Error('Travelogue already assembled');
  this.parts.push(N.parse(text,this.identity,this.batches[this.parts.length].events));this.save(false);
 }
 save(completed){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify({completed,parts:this.parts.map(p=>({title:p.title,paragraphs:p.paragraphs}))}));fs.renameSync(tmp,this.file);}
 combine(){if(!this.done)throw Error('Travelogue still has pending parts');return N.combine(this.identity,this.parts);}
 complete(){this.save(true);}
}
module.exports={DraftRun};
