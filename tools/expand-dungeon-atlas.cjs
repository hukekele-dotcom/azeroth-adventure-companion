'use strict';
// Reviewed Classic image-space references. Never substitute these for world coordinates.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {readAssignment,serialize}=require('./dungeon-knowledge');
const root=path.resolve(__dirname,'..');
const pin=(number,x,y,bossKeys=[],label,note)=>({number,x:x/512,y:y/512,bossKeys,label,note});
const definitions=[
 {dungeon:'scarlet-monastery',asset:'scarlet-library',source:'CL_SMLibrary',name:'血色修道院 · 图书馆',pins:[pin('A',14,148,[],'入口'),pin(1,129,399,['Houndmaster Loksey']),pin(2,456,353,['Arcanist Doan'])]},
 {dungeon:'scarlet-monastery',asset:'scarlet-armory',source:'CL_SMArmory',name:'血色修道院 · 武器库',pins:[pin('A',156,488,[],'入口'),pin(1,308,43,['Herod'])]},
 {dungeon:'scarlet-monastery',asset:'scarlet-cathedral',source:'CL_SMCathedral',name:'血色修道院 · 大教堂',pins:[pin('A',375,488,[],'入口'),pin(1,315,84,['High Inquisitor Fairbanks']),pin(2,258,35,['Scarlet Commander Mograine','High Inquisitor Whitemane'])]},
 {dungeon:'razorfen-downs',asset:'razorfen-downs',source:'CL_RazorfenDowns',name:'剃刀高地',pins:[pin('A',26,123,[],'入口'),pin(1,271,188,["Tuten'kash"]),pin(2,397,141,[],'亨利·斯特恩 / 贝尼斯特拉兹'),pin(3,448,245,['Mordresh Fire Eye']),pin(4,102,339,['Glutton']),pin(5,116,270,['Ragglesnout'],undefined,'稀有首领；可能出现在两个标记位置之一。'),pin(5,210,354,['Ragglesnout'],undefined,'稀有首领；可能出现在两个标记位置之一。'),pin(6,172,308,['Amnennar the Coldbringer']),pin(7,194,132,['Plaguemaw the Rotting'])]},
 {dungeon:'uldaman',asset:'uldaman',source:'CL_Uldaman',name:'奥达曼',pins:[pin('A',429,377,[],'入口'),pin('B',130,364,[],'后门'),pin(1,360,471,['Baelog','Eric "The Swift"','Olaf']),pin(2,311,328,[],'圣骑士的遗体'),pin(3,314,377,['Revelosh']),pin(4,183,384,['Ironaya']),pin(5,116,319,['Obsidian Sentinel']),pin(6,273,315,[],'安诺拉'),pin(7,268,223,['Ancient Stone Keeper']),pin(8,96,164,['Galgann Firehammer']),pin(9,72,99,['Grimlok']),pin(10,220,72,['Archaedas']),pin(11,200,29,[],'诺甘农圆盘')]}
];
function build(){
 const file=path.join(root,'addon/WoWAI/DungeonAtlas.lua'),atlas=readAssignment(file,'WoWAIDungeonAtlas');
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'knowledge/dungeon-maps/provenance.json'),'utf8'));
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const scarlet=atlas['scarlet-monastery'].pages?.[0]||atlas['scarlet-monastery'];
 delete scarlet.note;scarlet.id='static:scarlet-monastery:1';atlas['scarlet-monastery']={pages:[scarlet]};
 for(const d of definitions){
  const index=d.dungeon==='scarlet-monastery'?atlas[d.dungeon].pages.length+1:null;
  const page={id:'static:'+d.dungeon+(index?':'+index:''),name:d.name,texture:'Interface\\AddOns\\WoWAI\\Maps\\'+d.asset,width:1024,height:1024,textureWidth:1024,textureHeight:1024,basis:'classic',credit:'Atlas / Dan Gilbert',pins:d.pins};
  if(index)atlas[d.dungeon].pages.push(page);else atlas[d.dungeon]=page;
  const row={id:d.asset,dungeon:d.dungeon,source:'https://github.com/nanderson11/Atlas/blob/main/Images/Atlas_ClassicWoW/'+d.source+'.blp',credit:page.credit,basis:'classic',license:'GPL-2.0 (Atlas derivative image only)',refinedWith:'imagegen image edit',sha256:hash(path.join(root,'addon/WoWAI/Maps',d.asset+'.tga')),artSha256:hash(path.join(root,'knowledge/dungeon-maps',d.asset+'-refined.png')),pinsSource:'Atlas Data/Classic-ClassicEra.lua; normalized source numbered room positions',review:'Visual comparison against source layout. Classic room/area reference; not verified by in-game traversal in Forever.'};
  const old=provenance.findIndex(p=>p.id===d.asset);if(old>=0)provenance[old]=row;else provenance.push(row);
 }
 fs.writeFileSync(file,'-- Bundled static references. Coordinates are image-space, never world-space.\nWoWAIDungeonAtlas = '+serialize(atlas)+'\n');
 const write=(rel,obj)=>fs.writeFileSync(path.join(root,rel),JSON.stringify(obj,null,2)+'\n');
 write('knowledge/dungeon-maps/provenance.json',provenance);
 const research=JSON.parse(fs.readFileSync(path.join(root,'knowledge/dungeon-maps/boss-positions.json'),'utf8'));delete research.excluded['scarlet-monastery'];write('knowledge/dungeon-maps/boss-positions.json',research);
 const coverage=JSON.parse(fs.readFileSync(path.join(root,'knowledge/dungeon-maps/under30-coverage.json'),'utf8'));
 coverage.dungeons.find(d=>d.id==='scarlet-monastery').scope='all four wings; higher-level wings included';write('knowledge/dungeon-maps/under30-coverage.json',coverage);
 return require('./build-dungeon-map-pins').build(root);
}
module.exports={definitions,build};
if(require.main===module)console.log(JSON.stringify(build()));
