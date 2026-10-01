'use strict';
// Explicit archive side plus the numeric RequiredRaces field, never dungeon location.
const raceIds={alliance:[1,3,4,7,11],horde:[2,5,6,8,9,10]};
function fromMask(mask){
 if(!Number.isSafeInteger(mask)||mask<0)return 'unknown';
 if(mask===0)return 'both';
 const has=side=>raceIds[side].some(id=>Math.floor(mask/2**(id-1))%2===1);
 const a=has('alliance'),h=has('horde');
 return a&&h?'both':a?'alliance':h?'horde':'unknown';
}
function classify(faction,races,gatesKnown){
 const explicit=typeof faction==='string'?faction.toLowerCase():'';
 const mask=gatesKnown?fromMask(races):'unknown';
 if(['alliance','horde','both'].includes(explicit)){
  if(mask!=='unknown'&&mask!=='both'&&mask!==explicit)return {faction:'unknown',factionSource:'conflicting-evidence'};
  return {faction:explicit,factionSource:'archive-explicit'};
 }
 return {faction:mask,factionSource:mask==='unknown'?'unresolved':'forever-required-races'};
}
module.exports={classify,fromMask};
