// Runs the real Map.lua (with WoWAI.lua) in a Lua VM: syncing layers from the
// bridge, drawing pins on the world map (zone and continent), the navigator's
// distance/bearing and arrival, herb/ore nodes filtered by skill, and /wow-ai map.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const ADDON = path.join(__dirname, '..', 'addon', 'WoWAI');

test('adventure arrow persists across AI map sync and arrival does not complete task',()=>{
  const vm=newVM();
  vm.run(`WoWAIMap.SetAdventureRoute({{m=1432,x=45.2,y=67.8,label="任务",kind="quest"}}); WoWAIMap.UpdateNavigator()`);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'adventure-tasks');
  assert.equal(vm.evaluate('WoWAINavigator.shown'),'true');
  vm.run(`WoWAIMap.Sync({epoch="server",version=99,layers={}})`);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'adventure-tasks');
  vm.run('WoWAIMap.StopAdventure()');
  assert.equal(vm.evaluate('WoWAINavigator.shown'),'false');
});

test('numbered area pins keep their numbers and completed areas cannot restart navigation',()=>{
 const vm=newVM();
 vm.run(`REGIONS={{m=1432,x=45.2,y=67.8,label='岸边 (2/2)',number=1,done=true,members={},detail='两个任务完成'},{m=1432,x=60,y=60,label='山上 (0/1)',number=2,members={}},{m=1432,x=80,y=80,label='交付 (0/2)',number=3,members={}}};WoWAIMap.SetAdventureRoute(REGIONS,2)`);
 assert.deepEqual(shownPins(vm).map(p=>p.split(',')[2]),['2','3']);assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'2');
 vm.run(`WoWAIMap.Navigate('adventure-tasks',1)`);assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'2');
 vm.run('WoWAIMap.UpdateNavigator()');assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'2','arrival does not advance an area');
 vm.run(`REGIONS[2].done=true;WoWAIMap.SetAdventureRoute(REGIONS,3);WoWAIMap.Step(-1)`);
 assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'3');
 vm.run(`WoWAIMap.StopAdventure();WoWAIMap.SetAdventureRoute(REGIONS,3,true)`);assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
 assert.deepEqual(shownPins(vm).map(p=>p.split(',')[2]),['3']);
});

test('completed middle region disappears with its connectors; unfinished areas retain stable clickable numbers',()=>{
 const vm=newVM();
 const lines=()=>vm.num(`(function() local n=0;local canvas=WorldMapFrame:GetCanvas();local overlay=canvas.children[#canvas.children];for _,l in ipairs(overlay.textures) do if l.kind=='Line' and l.shown then n=n+1 end end;return n end)()`);
 vm.run(`REGIONS={{m=1432,x=20,y=20,number=1,label='Partially complete (1/2)',done=false,members={}},{m=1432,x=50,y=50,number=2,label='Turned in (2/2)',done=false,members={}},{m=1432,x=80,y=80,number=3,label='Remaining',members={}}};WoWAIMap.SetAdventureRoute(REGIONS,3)`);
 assert.equal(lines(),5,'three badge leaders and two route segments');
 vm.run(`REGIONS[2].done=true;WoWAIMap.SetAdventureRoute(REGIONS,3)`);
 assert.deepEqual(shownPins(vm).map(p=>p.split(',')[2]),['1','3']);
 assert.equal(lines(),3,'two badge leaders and one direct remaining-route segment');
 assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'3');
 // The remaining badge must still target original region 3, not compacted index 2.
 vm.run(`WoWAIMap.StopAdventure();local canvas=WorldMapFrame:GetCanvas();for _,b in ipairs(canvas.children[#canvas.children].children) do if b.kind=='Button' and b.shown and b.num.text=='3' then b.scripts.OnClick(b) end end`);
 assert.equal(vm.evaluate('WoWAIMapDB.nav.index'),'3');
 // A map refresh/reopen must also hide completed points from an older saved route.
 vm.run(`STUB.shownMap=1415;WoWAIMap.Refresh()`);
 assert.deepEqual(shownPins(vm).map(p=>p.split(',')[2]),['1','3']);
 vm.run(`for _,r in ipairs(REGIONS) do r.done=true end;WoWAIMap.SetAdventureRoute(REGIONS,1,true);WoWAIMap.StopAdventure(true);STUB.shownMap=1432;WoWAIMap.Refresh()`);
 assert.deepEqual(shownPins(vm),[]);assert.equal(lines(),0);assert.equal(vm.evaluate('WoWAINavigator.shown'),'false');
});

// Map-specific client stubs: Loch Modan (1432) sits at x .5-.6, y .4-.5 of
// Eastern Kingdoms (1415), which is 10000 x 15000 yards.
const MAP_STUB = `
Enum = { UIMapType = { Continent = 2, Zone = 3 } }
local MAPS = { [1432] = { name = "Loch Modan", mapType = 3, parentMapID = 1415 }, [1415] = { name = "Eastern Kingdoms", mapType = 2, parentMapID = 947 }, [947] = { name = "Azeroth", mapType = 1, parentMapID = 0 } }
C_Map.GetMapInfo = function(id) local m = MAPS[id]; if m then return { name = m.name, mapType = m.mapType, parentMapID = m.parentMapID, mapID = id } end end
C_Map.GetBestMapForUnit = function() return STUB.playerMap or 1432 end
C_Map.GetMapRectOnMap = function(child, parent) if child == 1432 and parent == 1415 then return 0.5, 0.6, 0.4, 0.5 end end
function CreateVector2D(x, y) return { x = x, y = y } end
C_Map.GetWorldPosFromMapPos = function(id, v) if id == 1415 then return 0, { x = v.x * 10000, y = v.y * 15000 } end end
function GetPlayerFacing() return STUB.facing or 0 end
function Methods_CreateLine() end
local canvas = CreateFrame("Frame", "WorldMapCanvas")
canvas.width, canvas.height = 1000, 700
WorldMapFrame = CreateFrame("Frame", "WorldMapFrame")
WorldMapFrame.shown = true
function WorldMapFrame:GetCanvas() return canvas end
function WorldMapFrame:GetMapID() return STUB.shownMap or 1432 end
function WorldMapFrame:GetCanvasScale() return STUB.canvasScale or 1 end
function WorldMapFrame:OnMapChanged() end
local T = getmetatable(canvas).__index
MINING, HERBALISM = "Mining", "Herbalism"
`;

function newVM() {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const run = (code, arg) => {
    if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error('Lua load: ' + to_jsstring(lua.lua_tostring(L, -1)));
    let nargs = 0;
    if (arg !== undefined) { lua.lua_pushstring(L, to_luastring(arg)); nargs = 1; }
    if (lua.lua_pcall(L, nargs, 0, 0) !== lua.LUA_OK) throw new Error('Lua error: ' + to_jsstring(lua.lua_tostring(L, -1)));
  };
  const evaluate = (expr) => {
    run(`local v = (${expr}); if v == nil then RESULT = nil else RESULT = tostring(v) end`);
    lua.lua_getglobal(L, to_luastring('RESULT'));
    const s = lua.lua_isnil(L, -1) ? null : to_jsstring(lua.lua_tolstring(L, -1));
    lua.lua_pop(L, 1);
    return s;
  };
  const num = (expr) => Number(evaluate(expr));
  let stub = fs.readFileSync(path.join(__dirname, 'wow_stub.lua'), 'utf8');
  // Lines are frames too (Frame:CreateLine), and textures can rotate.
  stub += `
function Methods.CreateLine(self, name, layer) local l = NewObjectPublic("Line", name, self); table.insert(self.textures, l); return l end
function Methods.SetRotation(self, r) self.rotation = r end
function Methods.SetVertexColor(self, r, g, b, a) self.vcolor = { r, g, b, a } end
function Methods.SetScale(self, s) self.scale = s end
function Methods.SetAllPoints(self, rel) if rel then self.width, self.height = rel.width, rel.height end end
function Methods.GetFrameLevel(self) return self.level or 1 end
function Methods.SetFrameLevel(self, l) self.level = l end
function Methods.SetFrameStrata(self, s) self.strata = s end
function Methods.GetFrameStrata(self) return self.strata or (self.parent and self.parent:GetFrameStrata()) or "MEDIUM" end
`;
  stub = stub.replace('local function NewObject(', 'function NewObjectPublic(').replace(/NewObject\(/g, 'NewObjectPublic(');
  run(stub);
  run(MAP_STUB);
  for (const f of ['Locale.lua', 'Codec.lua', 'Inbox.lua', 'WoWAI.lua', 'Map.lua']) run(fs.readFileSync(path.join(ADDON, f), 'utf8'), 'WoWAI');
  run('STUB.FireEvent("ADDON_LOADED", "WoWAI"); STUB.FireEvent("PLAYER_LOGIN")');
  return { run, evaluate, num };
}

// Shown pins on the world map overlay: "x,y,label" (label = the numbered text).
function shownPins(vm) {
  vm.run(`
    local out = {}
    local canvas = WorldMapFrame:GetCanvas()
    local overlay = canvas.children[#canvas.children]
    for _, c in ipairs(overlay.children) do
      if c.kind == "Button" and c.shown then
        local label = c.num and c.num.text or ""
        out[#out + 1] = string.format("%.0f,%.0f,%s,%s", c.x, -c.y, label, c.info and c.info.title or "")
      end
    end
    RESULT = table.concat(out, ";")`);
  const s = vm.evaluate('RESULT');
  return s ? s.split(';') : [];
}

const LAYER = `{ epoch = "e1", version = 1, layers = { { name = "mining", title = "Copper loop", ordered = true, loop = true, points = {
  { 1432, 50, 40, "1. Copper Vein", "ore" }, { 1432, 60, 50, "2. Copper Vein", "ore" }, { 1432, 55, 70, "3. Tin Vein", "ore" } } } } }`;

test('clear AI marks stops their arrow and suppresses stale or unchanged synced layers', () => {
  const vm=newVM();
  vm.run(`WoWAIMap.Sync(${LAYER}); WoWAIMap.Refresh()`);
  assert.equal(shownPins(vm).length,3);
  vm.run('SlashCmdList.WOWAIMAP("clear")');
  assert.equal(shownPins(vm).length,0);
  assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
  assert.equal(vm.evaluate('WoWAINavigator.shown'),'false');
  vm.run(`WoWAIMap.Sync(${LAYER}); local m=${LAYER}; m.version=2; m.layers[2]={name="new",title="New",points={{1432,20,20,"New pin","poi"}}}; WoWAIMap.Sync(m)`);
  assert.equal(shownPins(vm).length,1);
  // SavedVariables survive a reload: reloading the module must not restore pins.
  vm.run(fs.readFileSync(path.join(ADDON,'Map.lua'),'utf8'),'WoWAI');
  vm.run(`STUB.FireEvent("ADDON_LOADED","WoWAI"); local m=${LAYER}; m.epoch="new-bridge"; m.version=1; WoWAIMap.Sync(m); WoWAIMap.Refresh()`);
  assert.equal(shownPins(vm).length,0);
  vm.run(`local m=${LAYER}; m.epoch="new-bridge"; m.version=2; m.layers[1].points[1][4]="Updated destination"; WoWAIMap.Sync(m)`);
  assert.equal(shownPins(vm).length,3);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'mining');
});

test('clear AI marks preserves the task assistant route and gathering settings', () => {
  const vm=newVM();
  vm.run(`WoWAIMap.Sync(${LAYER}); WoWAIMap.SetAdventureRoute({{m=1432,x=30,y=30,label="Task",kind="quest"}}); WoWAIMapDB.nodes.ore=true; WoWAIMap.ClearAILayers()`);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'adventure-tasks');
  assert.equal(vm.evaluate('WoWAIMapDB.nodes.ore'),'true');
  assert.equal(vm.evaluate('WoWAINavigator.shown'),'true');
  assert.equal(shownPins(vm).length,1);
});

test('Sync applies a new version once, starts navigation, ignores stale versions', () => {
  const vm = newVM();
  vm.run(`WoWAIMap.Sync(${LAYER})`);
  assert.equal(vm.evaluate('WoWAIMapDB.map.version'), '1');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'), 'mining');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '1');
  const prints = () => vm.num('#STUB.prints');
  const before = prints();
  vm.run(`WoWAIMap.Sync(${LAYER})`); // same version: nothing
  assert.equal(prints(), before);
  vm.run(`WoWAIMap.Sync({ epoch = "e1", version = 0, layers = {} })`); // older: ignored
  assert.equal(vm.num('#WoWAIMapDB.map.layers'), 1);
  // A new epoch (bridge state reset) replaces, even with a lower version; same content stays quiet.
  vm.run(`local m = ${LAYER}; m.epoch = "e2"; WoWAIMap.Sync(m)`);
  assert.equal(vm.evaluate('WoWAIMapDB.map.epoch'), 'e2');
  assert.equal(prints(), before);
  vm.run(`WoWAIMap.Sync({ epoch = "e2", version = 5, layers = {} })`);
  assert.equal(vm.num('#WoWAIMapDB.map.layers'), 0);
  assert.equal(vm.evaluate('WoWAIMapDB.nav'), null);
});

test('a new route does not take over a route the player is already following', () => {
  const vm = newVM();
  vm.run(`WoWAIMap.Sync(${LAYER})`);
  vm.run('SlashCmdList.WOWAIMAP("nav mining 2")');
  vm.run(`local m = ${LAYER}; m.version = 2; m.layers[2] = { name = "quests", title = "Westfall", ordered = true, loop = false,
    points = { { 1432, 10, 10, "1. Talk", "quest" }, { 1432, 20, 20, "2. Kill", "kill" } } }; WoWAIMap.Sync(m)`);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'), 'mining');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '2');
  // With nothing being followed, the next route starts by itself.
  vm.run('SlashCmdList.WOWAIMAP("stop")');
  vm.run(`local m = ${LAYER}; m.version = 3; m.layers[1].points[1][4] = "1. Rich Copper"; WoWAIMap.Sync(m)`);
  assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'), 'mining');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '1');
});

test('slot data carrying a map reaches the map module', () => {
  const vm = newVM();
  vm.run(`WoWAI_Inbox = { replies = {}, map = ${LAYER} }; STUB.FireEvent("PLAYER_LOGIN")`);
  assert.equal(vm.evaluate('WoWAIMapDB.map.layers[1].title'), 'Copper loop');
});

test('route badges sit beside projected points on zone and continent maps', () => {
  const vm = newVM();
  vm.run(`WoWAIMap.Sync(${LAYER})`);
  vm.run('WoWAIMap.Refresh()');
  let pins = shownPins(vm);
  assert.deepEqual(pins, ['518,262,1,Copper loop', '618,332,2,Copper loop', '568,472,3,Copper loop']);
  vm.run('STUB.shownMap = 1415; WoWAIMap.Refresh()');
  pins = shownPins(vm);
  // 1432 (50,40) -> 1415 (0.55, 0.44) on a 1000x700 canvas.
  assert.equal(pins[0], '568,290,1,Copper loop');
  vm.run('STUB.shownMap = 947; WoWAIMap.Refresh()'); // no rect: nothing drawn
  assert.deepEqual(shownPins(vm), []);
});

test('all 19 same-map route numbers stay above native icons, separated and anchored through zoom',()=>{
 const vm=newVM();
 // Coordinates from the reported Barrens route; native icons share 18 of them.
 vm.run(`
 local coords={{58.647,27.404},{58.904,25.895},{54.670,41.288},{42.818,23.526},{58.983,37.869},{39.769,15.785},{52.400,11.641},{55.608,42.753},{61.825,45.980},{63.532,46.868},{63.947,45.077},{46.233,47.253},{35.891,45.876},{43.953,51.308},{49.33,50.32},{58.035,53.869},{60.414,54.772},{60.966,33.191},{60.512,3.856}}
 ROUTE={};for i,p in ipairs(coords) do ROUTE[i]={m=1432,x=p[1],y=p[2],number=i,label='Task '..i};if i~=15 then local native=CreateFrame('Button',nil,WorldMapFrame:GetCanvas());native:SetFrameStrata('HIGH');native:SetFrameLevel(5000) end end
 ROUTE[20]={m=999,x=44.2,y=42.7,number=20,label='Other map'}
 WoWAIMap.SetAdventureRoute(ROUTE,1)
 function VerifyBadges()
   local canvas=WorldMapFrame:GetCanvas();local overlay=canvas.children[#canvas.children]
   -- Overlay was created before native pins; find it by its update handler.
   for _,child in ipairs(canvas.children) do if child.scripts.OnUpdate then overlay=child;break end end
   local shown={};for _,b in ipairs(overlay.children) do if b.kind=='Button' and b.shown then
     assert(b:GetFrameStrata()=='DIALOG','native HIGH icons would cover this badge')
     assert(b.width==24 and b.dot.vcolor[4]==1,'number background must be readable')
     for _,prior in ipairs(shown) do assert(math.abs(b.x-prior.x)>=30 or math.abs(b.y-prior.y)>=30,'route numbers overlap') end
     shown[#shown+1]=b
   end end
   assert(#shown==19,'every same-map route point must be drawn')
   for i,b in ipairs(shown) do assert(b.num.text==tostring(i));assert(b.info.index==i) end
   assert(math.abs(shown[1].x - ROUTE[1].x*10*WorldMapFrame:GetCanvasScale() - 18)<0.01,'offset is screen-size independent')
   shown[10].scripts.OnClick(shown[10]);assert(WoWAIMapDB.nav.index==10)
   assert(WoWAIMapDB.adventureRoute.points[10][2]==ROUTE[10].x,'display offset must not move the destination')
   WorldMapFrame:GetCanvas():Hide();assert(not shown[1]:IsVisible(),'high-strata badge must hide with the map');WorldMapFrame:GetCanvas():Show()
 end
 VerifyBadges();STUB.canvasScale=2;WoWAIMap.Refresh();VerifyBadges()
 `);
});

test('coincident task destinations get separate clickable number badges',()=>{
 const vm=newVM();vm.run(`local r={};for i=1,12 do r[i]={m=1432,x=50,y=50,number=i,label='Task '..i} end;WoWAIMap.SetAdventureRoute(r,1)`);
 const coords=shownPins(vm).map(p=>p.split(',').slice(0,2).map(Number));assert.equal(coords.length,12);
 for(let i=0;i<coords.length;i++)for(let j=0;j<i;j++)assert.ok(Math.abs(coords[i][0]-coords[j][0])>=30||Math.abs(coords[i][1]-coords[j][1])>=30);
});

test('navigator shows yards and bearing, and advances on arrival', () => {
  const vm = newVM();
  vm.run(`WoWAIMap.Sync(${LAYER})`);
  // Player at Loch Modan 50,50 -> continent (0.55, 0.45); stop 1 (50,40) is 150 yd due north.
  vm.run('STUB.posX, STUB.posY = 0.5, 0.5; WoWAIMap.UpdateNavigator()');
  assert.match(vm.evaluate('WoWAINavigator.text.text'), /^150 yd/);
  assert.ok(Math.abs(vm.num('WoWAINavigator.arrow.rotation')) < 1e-9, 'north is straight up');
  vm.run('STUB.facing = math.pi / 2; WoWAIMap.UpdateNavigator()'); // facing west: target is to the right
  assert.ok(Math.abs(vm.num('WoWAINavigator.arrow.rotation') + Math.PI / 2) < 1e-9);
  // Walk onto stop 1: it advances to stop 2 (60,50: 100 yd east and 150 yd south).
  vm.run('STUB.facing = 0; STUB.posX, STUB.posY = 0.5, 0.4; WoWAIMap.UpdateNavigator()');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '2');
  vm.run('WoWAIMap.UpdateNavigator()');
  assert.match(vm.evaluate('WoWAINavigator.text.text'), /^180 yd/);
  // South-east: a clockwise turn between a quarter and a half.
  assert.ok(Math.abs(vm.num('WoWAINavigator.arrow.rotation') - Math.atan2(-100, -150)) < 1e-9);
  // Due east from the same spot's latitude: exactly a clockwise quarter turn.
  vm.run('STUB.posX, STUB.posY = 0.5, 0.5; WoWAIMap.UpdateNavigator()');
  assert.match(vm.evaluate('WoWAINavigator.text.text'), /^100 yd/);
  assert.ok(Math.abs(vm.num('WoWAINavigator.arrow.rotation') + Math.PI / 2) < 1e-9, 'east is a clockwise quarter turn');
  // Loop: after the last stop it wraps to the first.
  vm.run('WoWAIMap.Step(1); WoWAIMap.Step(1)');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '1');
  // Elsewhere with no position: says so instead of pointing.
  vm.run('STUB.playerMap = 999; WoWAIMap.UpdateNavigator()');
  assert.equal(vm.evaluate('WoWAINavigator.text.text'), 'no position here');
});

test('herb/ore nodes toggle and follow the gathering skill', () => {
  const vm = newVM();
  vm.run(`WoWAINodes = { kinds = { { "Copper Vein", "mining", 1 }, { "Tin Vein", "mining", 65 }, { "Peacebloom", "herbalism", 1 } },
    maps = { [1432] = { [1] = "100200300400", [2] = "500500", [3] = "999999" } } }`);
  vm.run('WoWAIMap.Refresh()');
  assert.equal(shownPins(vm).length, 0, 'off by default');
  vm.run('SlashCmdList.WOWAIMAP("ore on")');
  // No Mining skill line in the stub: every ore shows, flagged as not learned.
  assert.deepEqual(shownPins(vm).map(p => p.split(',').slice(0, 2).join(',') + ',' + p.split(',')[3]), ['100,140,Copper Vein', '300,280,Copper Vein', '500,350,Tin Vein']);
  // With Mining 50 (Forever's C_SkillInfo: one table per line), Tin (65) is filtered out until "filter all".
  // Forever also lists child lines (parentSkillLineID ~= 0) that repeat the parent.
  vm.run(`C_SkillInfo = { GetNumSkillLines = function() return 3 end, GetSkillLineInfo = function(i)
    if i == 1 then return { name = "Professions", isHeader = true, rank = 0, maxRank = 0, skillID = 0, parentSkillLineID = 0 } end
    if i == 3 then return { name = "Bergbau", isHeader = false, rank = 50, maxRank = 75, skillID = 2572, parentSkillLineID = 186 } end
    return { name = "Bergbau", isHeader = false, rank = 50, maxRank = 75, skillID = 186, parentSkillLineID = 0 } end }
    WoWAIMap.Refresh()`);
  assert.equal(shownPins(vm).length, 2);
  vm.run('SlashCmdList.WOWAIMAP("filter all")');
  assert.equal(shownPins(vm).length, 3);
  vm.run('SlashCmdList.WOWAIMAP("herb on")');
  assert.equal(shownPins(vm).length, 4);
  vm.run('SlashCmdList.WOWAIMAP("ore off"); SlashCmdList.WOWAIMAP("herb off")');
  assert.equal(shownPins(vm).length, 0);
  // The game context reads professions from the same API.
  assert.match(vm.evaluate('WoWAI.GameContext()'), /Professions: Bergbau 50\/75(\n|$)/);
});

test('/wow-ai map hide, show, nav and stop', () => {
  const vm = newVM();
  vm.run(`WoWAIMap.Sync(${LAYER})`);
  vm.run('SlashCmdList.WOWAIMAP("hide mining")');
  assert.equal(shownPins(vm).length, 0);
  vm.run('SlashCmdList.WOWAIMAP("show mining")');
  assert.equal(shownPins(vm).length, 3);
  vm.run('SlashCmdList.WOWAIMAP("nav mining 3")');
  assert.equal(vm.evaluate('WoWAIMapDB.nav.index'), '3');
  vm.run('SlashCmdList.WOWAIMAP("stop")');
  assert.equal(vm.evaluate('WoWAIMapDB.nav'), null);
  assert.equal(vm.evaluate('WoWAINavigator.shown'), 'false');
  vm.run('SlashCmdList.WOWAIMAP("")'); // status never errors
});


test('navigator hover shows live task guidance for its actual stop, refreshes progress, and closes on stop',()=>{
 const vm=newVM();
 vm.run(`
 function GameTooltip:SetOwner(owner)self.owner=owner end
 function GameTooltip:IsOwned(owner)return self.owner==owner end
 function GameTooltip:ClearLines()self.tipLines={} end
 function GameTooltip:AddLine(text)self.tipLines[#self.tipLines+1]=text end
 PLAN={complete=true,regionIndex=1,quests={{id=1,title='Coastal hunt',objectives={{text='1/5 enemies',done=false}}},{id=2,title='Report back',complete=true,objectives={}}},regions={
 {m=1432,x=20,y=20,number=1,name='Coast',label='Coast (0/1)',members={{questID=1,phase='quest',action='Defeat enemies along the shore.'}}},
 {m=1432,x=60,y=60,number=2,name='Town',label='Town (0/1)',kind='turnin',members={{questID=2,phase='turnin',action='Speak to the captain.'}}}}}
 WoWAIAdventure={Context=function()return {},{plan=PLAN}end}
 `);
 vm.run(fs.readFileSync(path.join(ADDON,'AdventureUI.lua'),'utf8'),'WoWAI');
 vm.run(`WoWAIMap.SetAdventureRoute(PLAN.regions,1);WoWAINavigator.scripts.OnEnter(WoWAINavigator)`);
 const text=()=>vm.evaluate("table.concat(GameTooltip.tipLines,'\\n')");
 assert.match(text(),/Coastal hunt[\s\S]*Defeat enemies along the shore\.[\s\S]*1\/5 enemies/);
 vm.run(`PLAN.quests[1].objectives[1].text='3/5 enemies';WoWAIMap.UpdateNavigator()`);
 assert.match(text(),/3\/5 enemies/);assert.doesNotMatch(text(),/1\/5 enemies/);
 vm.run(`WoWAIMap.Navigate('adventure-tasks',2)`);
 assert.match(text(),/Main task: Report back[\s\S]*Speak to the captain/);
 assert.doesNotMatch(text(),/Coastal hunt|3\/5 enemies/);
 assert.equal(vm.evaluate('PLAN.regionIndex'),'1','tooltip must not depend on stale UI selection or mutate progress');
 vm.run(`WoWAIMap.StopAdventure()`);assert.equal(vm.evaluate('GameTooltip.shown'),'false');
 vm.run(`WoWAIMap.SetAdventureRoute(PLAN.regions,1);WoWAINavigator.scripts.OnEnter(WoWAINavigator);GameTooltip:SetOwner(WorldMapFrame);GameTooltip:ClearLines();GameTooltip:AddLine('Unrelated tooltip');WoWAIMap.UpdateNavigator();WoWAINavigator.scripts.OnLeave(WoWAINavigator)`);
 assert.equal(text(),'Unrelated tooltip');assert.equal(vm.evaluate('GameTooltip.shown'),'true','do not steal or hide another owner tooltip');
});

test('navigator tooltip falls back to saved route details when live quest context is unavailable',()=>{
 const vm=newVM();vm.run(`WoWAIMap.SetAdventureRoute({{m=1432,x=45,y=65,label='Coast (1/2)',detail='Hunt: 3/5; Collect: 1/1',members={}}})`);
 const text=vm.evaluate("table.concat(WoWAIMap.NavigationTipLines(),'\\n')");
 assert.match(text,/Coast \(1\/2\)/);assert.match(text,/45.0, 65.0/);assert.match(text,/Hunt: 3\/5/);
});

test('local pickup guidance survives AI clear and arrival, and is removed cleanly on cancellation',()=>{
 const vm=newVM();vm.run(`WoWAIMap.SetAdventureRoute({{m=1432,x=70,y=70,label='Existing task'}},1,true);WoWAIMap.SetQuestPickup({1432,45.2,67.8},'Accept a quest','Talk to the giver');WoWAIMap.UpdateNavigator();WoWAIMap.ClearAILayers()`);
 assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'quest-pickup');
 assert.equal(vm.evaluate('WoWAIMapDB.adventureRoute.points[1][4]'),'Existing task');
 assert.match(vm.evaluate("table.concat(WoWAIMap.NavigationTipLines(),'\\n')"),/Talk to the giver/);
 vm.run('WoWAIMap.ClearQuestPickup()');assert.equal(vm.evaluate('WoWAIMapDB.pickupRoute'),null);assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
});
test('real guide and map modules cancel together and never revive another character guide',()=>{
 const vm=newVM();
 vm.run(`CHAR={questGuide={id=999,stage='objective'}};WoWAIAdventure={Context=function()return {},CHAR end,Position=function()return {map=1432}end,Quests=function()return {{id=999,title='Hunt',objectives={{text='1/5 wolves'}},locations={{m=1432,x=50,y=60}}}},true end};WoWAIQuestOffersData={quests={},maps={}}`);
 vm.run(fs.readFileSync(path.join(ADDON,'QuestOffers.lua'),'utf8'),'WoWAI');
 vm.run('WoWAIQuestOffers.Tick()');assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'quest-pickup');
 vm.run('WoWAIMap.Stop();WoWAIQuestOffers.Tick()');assert.equal(vm.evaluate('CHAR.questGuide'),null);assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
 vm.run(`CHAR.questGuide={id=999,stage='objective'};WoWAIQuestOffers.Tick();WoWAIMap.SetAdventureRoute({{m=1432,x=70,y=70,label='Route'}})`);
 assert.equal(vm.evaluate('CHAR.questGuide'),null);assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'adventure-tasks');
 vm.run(`CHAR.questGuide={id=999,stage='objective'};WoWAIQuestOffers.Tick();CHAR={};WoWAIQuestOffers.Tick()`);
 assert.equal(vm.evaluate('WoWAIMapDB.pickupRoute'),null);assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
});

test('zone workflow pins are separate from AI, survive AI clear, and never auto-complete on arrival',()=>{
 const vm=newVM();vm.run(`ACTIVE={map=1432};WoWAIZoneGuide={Active=function()return ACTIVE end,Stop=function()ACTIVE=nil;WoWAIMap.ClearZoneGuide()end,Skip=function()SKIPS=(SKIPS or 0)+1 end};WoWAIMap.SetAdventureRoute({{m=1432,x=80,y=80,label='Old AI'}} ,1,true);WoWAIMap.SetZoneGuide({{m=1432,x=45.2,y=67.8,label='Accept',kind='quest',number=1,detail='Talk to giver'},{m=1432,x=70,y=75,label='Work',kind='quest',number=2}});WoWAIMap.UpdateNavigator();WoWAIMap.ClearAILayers()`);
 assert.equal(vm.evaluate('WoWAIMapDB.nav.layer'),'zone-guide');assert.equal(vm.evaluate('SKIPS'),null);
 assert.equal(vm.evaluate('WoWAIMapDB.adventureRoute.points[1][4]'),'Old AI');
 assert.equal(shownPins(vm).length,2,'AI route is hidden while the local workflow is active');
 vm.run("WoWAIMap.Navigate('zone-guide',2);WoWAIMap.Step(1)");assert.equal(vm.evaluate('WoWAIMap.ZoneGuideIndex()'),'2');assert.equal(vm.evaluate('SKIPS'),'1');
 vm.run('WoWAIMap.Stop()');assert.equal(vm.evaluate('ACTIVE'),null);assert.equal(vm.evaluate('WoWAIMapDB.zoneGuide'),null);assert.equal(vm.evaluate('WoWAIMapDB.nav'),null);
});
