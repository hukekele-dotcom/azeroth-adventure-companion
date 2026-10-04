local L = WoWAILocale.Text
-- WoWAI map: layers the agent draws (routes, quest stops, marks), synced from the
-- bridge, plus herb and ore locations from the optional WoWAI_Nodes addon.
--
-- Layers arrive in slot files as { epoch, version, layers = { { name, title,
-- ordered, loop, points = { { uiMapID, x, y, label, kind }, ... } } } }; x/y are
-- map percent. The bridge owns them; a newer version (or another epoch) replaces
-- our copy wholesale. Everything here reads positions and draws; nothing moves,
-- targets or acts for the player.

local ADDON_NAME = ...
local M = {}
WoWAIMap = M

local ARRIVE_YARDS = 12
local NODE_SIZE, PIN_SIZE = 9, 16
local ROUTE_SIZE, ROUTE_GAP = 24, 30
local CIRCLE = "Interface\\CHARACTERFRAME\\TempPortraitAlphaMask"
local ARROW = "Interface\\Minimap\\MinimapArrow"
local CONTINENT = (Enum and Enum.UIMapType and Enum.UIMapType.Continent) or 2
local atan2 = math.atan2 or math.atan -- Lua 5.1 in game; 5.3 in the test VM

local KIND_COLOR = {
	ore = { 0.95, 0.6, 0.25 }, herb = { 0.35, 0.95, 0.35 }, quest = { 1, 0.85, 0 }, turnin = { 0.35, 0.8, 1 },
	kill = { 1, 0.3, 0.3 }, loot = { 1, 0.5, 0.85 }, object = { 0.8, 0.6, 1 }, explore = { 0.5, 1, 1 },
	npc = { 1, 1, 1 }, trainer = { 0.95, 0.95, 0.4 }, vendor = { 0.6, 0.95, 0.6 }, dungeon = { 1, 0.45, 0.1 },
	flight = { 0.55, 0.75, 1 }, poi = { 1, 1, 1 },
}

local mdb -- WoWAIMapDB: { map, hidden = { [layer] = true }, nodes = { ore, herb, filter }, nav = { layer, index }, navPos }

local function Try(fn, ...)
	if type(fn) ~= "function" then return nil end
	local ok, a, b, c, d = pcall(fn, ...)
	if ok then return a, b, c, d end
end

local function Print(msg)
	print("|cff66ccff[WoW AI map]|r " .. msg)
end

local function DB()
	if not mdb then
		WoWAIMapDB = WoWAIMapDB or {}
		mdb = WoWAIMapDB
		mdb.hidden = mdb.hidden or {}
		mdb.clearedLayers = mdb.clearedLayers or {}
		mdb.nodes = mdb.nodes or { ore = false, herb = false, filter = "skill" }
	end
	return mdb
end

local function Layers()
	local m = DB().map
	local out = {}
	for _, l in ipairs(m and m.layers or {}) do
		if not mdb.clearedLayers[l.name] then out[#out + 1] = l end
	end
	if DB().zoneGuide then out[#out+1]=DB().zoneGuide
    elseif DB().adventureRoute and not (WoWAIZoneGuide and WoWAIZoneGuide.Active()) then out[#out + 1] = DB().adventureRoute end
	if DB().pickupRoute then out[#out + 1] = DB().pickupRoute end
	return out
end

local function FindLayer(name)
	for i, l in ipairs(Layers()) do
		if l.name == name then return l, i end
	end
end

---------------------------------------------------------------------------
-- Map geometry (C_Map only; results cached)
---------------------------------------------------------------------------

local continentOf = {}
local function ContinentOf(mapID)
	if continentOf[mapID] ~= nil then return continentOf[mapID] or nil end
	local id, guard = mapID, 0
	while id and id > 0 and guard < 10 do
		local info = Try(C_Map.GetMapInfo, id)
		if type(info) ~= "table" then break end
		if info.mapType == CONTINENT then continentOf[mapID] = id; return id end
		id, guard = info.parentMapID, guard + 1
	end
	continentOf[mapID] = false
end

-- Where mapID's (x, y) (0-1) falls on `target` (0-1), or nil if it doesn't.
local function Project(mapID, x, y, target)
	if mapID == target then return x, y end
	local minX, maxX, minY, maxY = Try(C_Map.GetMapRectOnMap, mapID, target)
	if type(minX) == "number" and maxX ~= minX and maxY ~= minY then
		return minX + (maxX - minX) * x, minY + (maxY - minY) * y
	end
	-- `target` sits inside mapID (a city map shown while the point is on its zone).
	minX, maxX, minY, maxY = Try(C_Map.GetMapRectOnMap, target, mapID)
	if type(minX) == "number" and maxX ~= minX and maxY ~= minY then
		return (x - minX) / (maxX - minX), (y - minY) / (maxY - minY)
	end
end

-- Continent-space size in yards, measured from the engine's own map->world transform.
local continentSize = {}
local function ContinentYards(cont)
	if continentSize[cont] then return continentSize[cont][1], continentSize[cont][2] end
	local w, h
	if C_Map.GetWorldPosFromMapPos and CreateVector2D then
		local _, a = Try(C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(0, 0))
		local _, b = Try(C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(1, 0))
		local _, c = Try(C_Map.GetWorldPosFromMapPos, cont, CreateVector2D(0, 1))
		if a and b and c then
			w = math.sqrt((b.x - a.x) ^ 2 + (b.y - a.y) ^ 2)
			h = math.sqrt((c.x - a.x) ^ 2 + (c.y - a.y) ^ 2)
		end
	end
	if not (w and h and w > 0 and h > 0) then
		local ww, hh = Try(C_Map.GetMapWorldSize, cont)
		w, h = ww, hh
	end
	if w and h and w > 0 and h > 0 then continentSize[cont] = { w, h } end
	return w, h
end

-- The player's position as (continent, cx, cy) in continent map space.
local function PlayerOnContinent()
	local mapID = Try(C_Map.GetBestMapForUnit, "player")
	if not mapID then return end
	local pos = Try(C_Map.GetPlayerMapPosition, mapID, "player")
	if not pos then return end
	local px, py = pos.x, pos.y
	if not px or (px == 0 and py == 0) then return end
	local cont = ContinentOf(mapID)
	if not cont then return end
	local cx, cy = Project(mapID, px, py, cont)
	if cx then return cont, cx, cy end
end

-- Yards and bearing (radians, counter-clockwise from north) from the player to a point.
local function Heading(p)
	local cont, px, py = PlayerOnContinent()
	if not cont then return nil, L("no position here") end
	local tcont = ContinentOf(p[1])
	if tcont ~= cont then return nil, L("on another continent") end
	local tx, ty = Project(p[1], p[2] / 100, p[3] / 100, cont)
	if not tx then return nil, L("cannot place this point") end
	local w, h = ContinentYards(cont)
	local east, south = (tx - px) * (w or 1), (ty - py) * (h or 1)
	local dist = w and math.sqrt(east * east + south * south) or nil
	return dist, atan2(-east, -south)
end

---------------------------------------------------------------------------
-- World map drawing
---------------------------------------------------------------------------

local overlay
local pins, pinCount = {}, 0
local lines, lineCount = {}, 0
local nodePins, nodeCount = {}, 0

local function ShowTip(self)
	if not self.info then return end
	GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
	GameTooltip:AddLine(self.info.title or "Map", 0.4, 0.8, 1)
	GameTooltip:AddLine(self.info.label or "", 1, 1, 1, true)
	if self.info.hint then GameTooltip:AddLine(self.info.hint, 0.6, 0.6, 0.6) end
	GameTooltip:Show()
end

local function NewPin(size)
	local b = CreateFrame("Button", nil, overlay)
	b:SetSize(size, size)
	b.dot = b:CreateTexture(nil, "OVERLAY")
	b.dot:SetAllPoints()
	b.dot:SetTexture(CIRCLE)
	b.ring = b:CreateTexture(nil, "ARTWORK")
	b.ring:SetPoint("CENTER")
	b.ring:SetSize(size + 4, size + 4)
	b.ring:SetTexture(CIRCLE)
	b.ring:SetVertexColor(0, 0, 0, 0.85)
	b.num = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	b.num:SetPoint("CENTER", 0, 0)
	b.num:SetTextColor(0, 0, 0)
	b:SetScript("OnEnter", ShowTip)
	b:SetScript("OnLeave", function() GameTooltip:Hide() end)
	b:RegisterForClicks("LeftButtonUp")
	b:SetScript("OnClick", function(self)
		if self.info and self.info.layer then M.Navigate(self.info.layer, self.info.index) end
	end)
	return b
end

local function Place(frame, x, y, scale)
	local w, h = overlay:GetWidth(), overlay:GetHeight()
	frame:SetScale(scale)
	frame:ClearAllPoints()
	frame:SetPoint("CENTER", overlay, "TOPLEFT", x * w / scale, -y * h / scale)
	frame:Show()
end

-- Badges sit beside native quest icons. Offsets are only visual: clicks and
-- navigation still use the original point. Separate nearby route numbers.
local function BadgePosition(x, y, scale, occupied)
	local w, h = overlay:GetWidth() / scale, overlay:GetHeight() / scale
	local px, py, margin = x * w, y * h, ROUTE_SIZE / 2 + 3
	local bx, by
	for radius = 1, 8 do
		for _, delta in ipairs({{1,-1},{-1,-1},{1,1},{-1,1},{0,-1},{1,0},{0,1},{-1,0}}) do
			bx = math.max(margin, math.min(w-margin, px + delta[1] * (18+(radius-1)*ROUTE_GAP)))
			by = math.max(margin, math.min(h-margin, py + delta[2] * (18+(radius-1)*ROUTE_GAP)))
			local free = true
			for _, q in ipairs(occupied) do
				if math.abs(bx-q[1]) < ROUTE_GAP and math.abs(by-q[2]) < ROUTE_GAP then free=false;break end
			end
			if free then occupied[#occupied+1]={bx,by};return bx/w,by/h end
		end
	end
	occupied[#occupied+1]={bx,by};return bx/w,by/h
end

local function CanvasScale()
	local s = WorldMapFrame and WorldMapFrame.GetCanvasScale and Try(WorldMapFrame.GetCanvasScale, WorldMapFrame)
	return (type(s) == "number" and s > 0) and s or 1
end

local function AddLine(x1, y1, x2, y2, color, thickness)
	lineCount = lineCount + 1
	local l = lines[lineCount]
	if not l then
		l = overlay:CreateLine(nil, "ARTWORK")
		lines[lineCount] = l
	end
	local w, h = overlay:GetWidth(), overlay:GetHeight()
	l:SetThickness(thickness)
	l:SetColorTexture(color[1], color[2], color[3], 0.75)
	l:SetStartPoint("TOPLEFT", overlay, x1 * w, -y1 * h)
	l:SetEndPoint("TOPLEFT", overlay, x2 * w, -y2 * h)
	l:Show()
end

-- Skill of a profession (Mining 186, Herbalism 182), or nil if not learned.
local SKILL_IDS = { mining = 186, herbalism = 182 }
local SKILL_NAMES = { mining = MINING or "Mining", herbalism = HERBALISM or "Herbalism" }
local function SkillRank(prof)
	local lines = WoWAI and WoWAI.SkillLines and WoWAI.SkillLines() or {}
	for _, sk in ipairs(lines) do
		if not sk.isHeader and (sk.skillID == SKILL_IDS[prof] or sk.name == SKILL_NAMES[prof]) then return sk.rank end
	end
end

local function NodeFilter()
	local f = DB().nodes
	local want = {}
	if f.ore then want.mining = SkillRank("mining") or false end
	if f.herb then want.herbalism = SkillRank("herbalism") or false end
	return want, f.filter
end

local function DrawNodes(mapID, scale)
	local data = WoWAINodes
	local want, filter = NodeFilter()
	if not data or not next(want) then return end
	local perMap = data.maps and data.maps[mapID]
	if not perMap then return end
	for i, packed in pairs(perMap) do
		local kind = data.kinds[i]
		local prof = kind and kind[2]
		local rank = prof and want[prof]
		local show = rank ~= nil and (filter == "all" or rank == false or kind[3] <= rank)
		if show then
			local color = prof == "mining" and KIND_COLOR.ore or KIND_COLOR.herb
			for j = 1, #packed - 5, 6 do
				local x = tonumber(packed:sub(j, j + 2)) / 1000
				local y = tonumber(packed:sub(j + 3, j + 5)) / 1000
				nodeCount = nodeCount + 1
				local b = nodePins[nodeCount]
				if not b then
					b = NewPin(NODE_SIZE)
					b.ring:SetSize(NODE_SIZE + 2, NODE_SIZE + 2)
					-- Hover shows the tooltip; clicks and drags go through to the map (pan, zoom).
					if b.SetMouseClickEnabled then b:SetMouseClickEnabled(false) end
					b.info = {}
					nodePins[nodeCount] = b
				end
				b.dot:SetVertexColor(color[1], color[2], color[3], 0.9)
				b.num:SetText("")
				local info = b.info
				info.title = kind[1]
				info.label = (prof == "mining" and L("Mining ") or L("Herbalism ")) .. kind[3]
				info.hint = rank == false and L("You don't have this profession") or nil
				info.layer = nil
				Place(b, x, y, scale)
			end
		end
	end
end

function M.Refresh()
	if not overlay or not WorldMapFrame:IsShown() then return end
	for i = 1, pinCount do pins[i]:Hide() end
	for i = 1, lineCount do lines[i]:Hide() end
	for i = 1, nodeCount do nodePins[i]:Hide() end
	pinCount, lineCount, nodeCount = 0, 0, 0
	local mapID = WorldMapFrame:GetMapID()
	if not mapID then return end
	local scale = 1 / CanvasScale()
	overlay.drawnScale = CanvasScale()
	DrawNodes(mapID, scale)
	local nav = DB().nav
	local occupied = {}
	for _, l in ipairs(Layers()) do
		if not mdb.hidden[l.name] then
			local prev, first
			for i, p in ipairs(l.points) do
				-- Keep stored indices stable for region progress/navigation, but draw
				-- only remaining adventure stops, linking past completed regions.
				if not (l.name == "adventure-tasks" and p[7]) then
				local x, y = Project(p[1], p[2] / 100, p[3] / 100, mapID)
				local inside = x and x >= 0 and x <= 1 and y >= 0 and y <= 1
				if inside then
					local color = KIND_COLOR[p[5]] or KIND_COLOR.poi
					if l.ordered and prev then AddLine(prev[1], prev[2], x, y, color, 2.5 * scale) end
					pinCount = pinCount + 1
					local b = pins[pinCount]
					if not b then b = NewPin(PIN_SIZE); pins[pinCount] = b end
					local current = nav and nav.layer == l.name and nav.index == i
					local size = l.ordered and ROUTE_SIZE or PIN_SIZE
					b:SetSize(size,size);b.ring:SetSize(size+4,size+4)
					-- Frame levels alone cannot rise above quest pins on a higher strata.
					-- DIALOG stays below tooltips, and the canvas still controls visibility.
					b:SetFrameStrata(l.ordered and "DIALOG" or (Try(overlay.GetFrameStrata,overlay) or "MEDIUM"))
					if l.ordered then
						b.dot:SetVertexColor(0.04,0.06,0.09,1)
						b.ring:SetVertexColor(current and 0.3 or (p[7] and 0.35 or color[1]),current and 1 or (p[7] and 0.8 or color[2]),current and 1 or (p[7] and 0.35 or color[3]),1)
						b.num:SetFont(STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF",14,"OUTLINE")
						b.num:SetTextColor(1,1,1,1)
					else
						b.dot:SetVertexColor(color[1],color[2],color[3],1)
						b.ring:SetVertexColor(current and 1 or 0,current and 1 or 0,current and 1 or 0,0.9)
					end
					b.num:SetText(l.ordered and tostring(p[6] or i) or "")
					b:SetFrameLevel(overlay:GetFrameLevel() + (current and 20 or 10))
					b.info = { title = l.title, label = (p[4] ~= "" and p[4] or l.name)..(p[8] and ('\n'..p[8]) or ''), layer = l.name, index = i, hint = p[7] and L('此区域已处理') or L("Click: navigate here") }
					local bx,by=x,y
					if l.ordered then
						bx,by=BadgePosition(x,y,scale,occupied)
						AddLine(x,y,bx,by,color,1.25*scale)
					end
					Place(b, bx, by, scale)
					prev = { x, y }
					first = first or { x, y, color }
				else
					prev = nil
				end
				end
			end
			-- A loop closes back to its first stop.
			if l.loop and l.ordered and prev and first and #l.points > 2 then
				AddLine(prev[1], prev[2], first[1], first[2], first[3], 2.5 * scale)
			end
		end
	end
end

local function SetupWorldMap()
	if overlay or not WorldMapFrame or not WorldMapFrame.GetCanvas then return end
	local canvas = WorldMapFrame:GetCanvas()
	overlay = CreateFrame("Frame", nil, canvas)
	overlay:SetAllPoints(canvas)
	overlay:SetFrameLevel(canvas:GetFrameLevel() + 2000)
	hooksecurefunc(WorldMapFrame, "OnMapChanged", M.Refresh)
	WorldMapFrame:HookScript("OnShow", M.Refresh)
	-- Keep pins the same size on screen while zooming.
	overlay:SetScript("OnUpdate", function(self, elapsed)
		self.t = (self.t or 0) + elapsed
		if self.t < 0.1 then return end
		self.t = 0
		if math.abs(CanvasScale() - (self.drawnScale or 0)) > 0.01 then M.Refresh() end
	end)
end

---------------------------------------------------------------------------
-- Navigator: arrow, distance, and auto-advance along an ordered layer
---------------------------------------------------------------------------

local nav

local function NavPoint()
	local n = DB().nav
	if not n then return end
	local l = FindLayer(n.layer)
	if not l or not l.points[n.index] then return end
	return l, l.points[n.index], n.index
end

function M.NavigationTipLines()
	local l,p,i=NavPoint();if not l then return {} end
	if l.name=='adventure-tasks' and WoWAIAdventure and WoWAIAdventureUI then
		local _,character=Try(WoWAIAdventure.Context)
		local guidance=character and Try(WoWAIAdventureUI.GuidanceLines,character.plan,i)
		if type(guidance)=='table' and #guidance>0 then return guidance end
	end
	-- Saved routes remain useful before the task module restores its context.
	local lines={l.title,p[4]}
	local map=Try(C_Map.GetMapInfo,p[1])
	lines[#lines+1]=(map and map.name or string.format(L('地图 %d'),p[1]))..string.format(' (%.1f, %.1f)',p[2],p[3])
	if p[8] and p[8]~='' then lines[#lines+1]=p[8] end
	return lines
end

local function NavigatorTip(self)
	local lines=M.NavigationTipLines();if #lines==0 then return end
	local signature=table.concat(lines,'\n')
	if self.tipSignature==signature and Try(GameTooltip.IsOwned,GameTooltip,self) then return end
	self.tipSignature=signature
	GameTooltip:SetOwner(self,'ANCHOR_BOTTOM')
	GameTooltip:ClearLines()
	for i=1,math.min(#lines,16) do GameTooltip:AddLine(lines[i],1,1,1,true) end
	if #lines>16 then GameTooltip:AddLine(L('更多指引请打开任务助手。'),0.8,0.7,0.4,true) end
	GameTooltip:AddLine(' ')
	GameTooltip:AddLine(L('Drag to move, right-click to skip this stop. /wow-ai map for options.'),0.6,0.6,0.6,true)
	GameTooltip:Show()
end

local function HideNavigatorTip(self)
	self.hovering=nil;self.tipSignature=nil
	if Try(GameTooltip.IsOwned,GameTooltip,self) then GameTooltip:Hide() end
end

local function BuildNavigator()
	nav = CreateFrame("Frame", "WoWAINavigator", UIParent, "BackdropTemplate")
	nav:SetSize(250, 44)
	nav:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 } })
	nav:SetBackdropColor(0, 0, 0, 0.7)
	local p = DB().navPos
	if p then nav:SetPoint(p[1], UIParent, p[1], p[2], p[3]) else nav:SetPoint("TOP", UIParent, "TOP", 0, -120) end
	nav:SetMovable(true)
	nav:EnableMouse(true)
	nav:RegisterForDrag("LeftButton")
	nav:SetScript("OnDragStart", nav.StartMoving)
	nav:SetScript("OnDragStop", function(self)
		self:StopMovingOrSizing()
		local point, _, _, x, y = self:GetPoint()
		DB().navPos = { point, x, y }
	end)
	nav:SetScript("OnMouseUp", function(_, button)
		if button == "RightButton" then M.Step(1) end
	end)
	nav.arrow = nav:CreateTexture(nil, "ARTWORK")
	nav.arrow:SetSize(34, 34)
	nav.arrow:SetPoint("LEFT", 6, 0)
	nav.arrow:SetTexture(ARROW)
	nav.title = nav:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
	nav.title:SetPoint("TOPLEFT", 46, -7)
	nav.title:SetPoint("RIGHT", -8, 0)
	nav.title:SetJustifyH("LEFT")
	nav.title:SetWordWrap(false)
	nav.text = nav:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
	nav.text:SetPoint("BOTTOMLEFT", 46, 8)
	nav.text:SetPoint("RIGHT", -8, 0)
	nav.text:SetJustifyH("LEFT")
	nav.text:SetWordWrap(false)
	nav:SetScript("OnEnter", function(self)
		self.hovering=true;self.tipSignature=nil;NavigatorTip(self)
	end)
	nav:SetScript("OnLeave", HideNavigatorTip)
	nav:SetScript("OnHide", HideNavigatorTip)
	nav:SetScript("OnUpdate", function(self, elapsed)
		self.t = (self.t or 0) + elapsed
		if self.t < 0.1 then return end
		self.t = 0
		M.UpdateNavigator()
	end)
	nav:Hide()
end

function M.UpdateNavigator()
	local l, p, i = NavPoint()
	if not l then if nav then nav:Hide() end return end
	if not nav then BuildNavigator() end
	nav:Show()
	if nav.hovering and Try(GameTooltip.IsOwned,GameTooltip,nav) then NavigatorTip(nav) end
	nav.title:SetText(string.format("%d/%d  %s", i, #l.points, p[4] ~= "" and p[4] or l.title))
	local dist, bearing = Heading(p)
	if not dist and type(bearing) == "string" then
		nav.arrow:Hide()
		nav.text:SetText(bearing)
		return
	end
	nav.arrow:Show()
	local facing = Try(GetPlayerFacing)
	if facing and bearing then nav.arrow:SetRotation(bearing - facing) else nav.arrow:SetRotation(0) end
	if dist then
		nav.text:SetText(string.format(L("%d yd  |cff888888%s|r"), math.floor(dist + 0.5), l.title))
		if dist <= ARRIVE_YARDS and not l.manualAdvance then
			Try(PlaySound, SOUNDKIT and SOUNDKIT.MAP_PING or 3175)
			M.Step(1, true)
		end
	else
		nav.text:SetText(l.title)
	end
end

function M.Navigate(layer, index)
    if layer~='zone-guide' and WoWAIZoneGuide then WoWAIZoneGuide.Stop() end
    if layer~='quest-pickup' and WoWAIQuestOffers then WoWAIQuestOffers.Stop() end
    if layer ~= 'adventure-tasks' and WoWAIAdventure and WoWAIAdventure.NavigationStopped then WoWAIAdventure.NavigationStopped() end
	local l = FindLayer(layer)
	if not l then Print(L("no layer ") .. tostring(layer)); return end
	if l.points[index or 1] and l.points[index or 1][7] then return end
	DB().nav = { layer = layer, index = math.max(1, math.min(index or 1, #l.points)) }
	mdb.hidden[layer] = nil
	M.UpdateNavigator()
	M.Refresh()
end

function M.Step(delta, arrived)
	local l, _, i = NavPoint()
	if not l then return end
    if l.name=='zone-guide' and WoWAIZoneGuide then if not arrived and delta>0 then WoWAIZoneGuide.Skip()end;return end
	local nexti = i + delta
	while l.points[nexti] and l.points[nexti][7] do nexti=nexti+delta end
	if nexti > #l.points then
		if l.loop then nexti = 1 else
			Print(L("route finished: ") .. l.title)
			mdb.nav = nil
            if l.name=='quest-pickup' and WoWAIQuestOffers then WoWAIQuestOffers.Stop() end
            if WoWAIAdventure and WoWAIAdventure.NavigationStopped then WoWAIAdventure.NavigationStopped() end
			M.UpdateNavigator()
			M.Refresh()
			return
		end
	elseif nexti < 1 then
		if not l.loop and l.points[1] and l.points[1][7] then return end
		nexti = l.loop and #l.points or 1
	end
	mdb.nav.index = nexti
	M.Refresh()
	if not arrived then M.UpdateNavigator() end
end

function M.Stop(preserveAdventure)
	if not preserveAdventure and WoWAIAdventure and WoWAIAdventure.NavigationStopped then WoWAIAdventure.NavigationStopped() end
	DB().nav = nil
	if not preserveAdventure and WoWAIQuestOffers then WoWAIQuestOffers.Stop() end
    if not preserveAdventure and WoWAIZoneGuide then WoWAIZoneGuide.Stop() end
	M.UpdateNavigator()
	M.Refresh()
end

-- Only measured client/user coordinates enter this local layer. AI map sync
-- must not overwrite it or advance a task merely because the player arrived.
function M.SetAdventureRoute(route, index, displayOnly)
	local points = {}
	for _, r in ipairs(route or {}) do
		if type(r.m) == "number" and type(r.x) == "number" and type(r.y) == "number"
			and r.x >= 0 and r.x <= 100 and r.y >= 0 and r.y <= 100 then
			points[#points + 1] = {r.m, r.x, r.y, r.label or L("任务"), r.kind or "quest",r.number,r.done,r.detail}
		end
	end
	DB().adventureRoute = #points > 0 and {name="adventure-tasks", title=route[1].members and L('区域路线 · 完成后自动推进') or L("任务路线 · 完成后点下一步"), ordered=true, loop=false, manualAdvance=true, points=points} or nil
	if #points > 0 then if not displayOnly then M.Navigate("adventure-tasks", index or 1) else M.Refresh() end else M.StopAdventure() end
end
function M.SetQuestPickup(point,title,detail)
    DB().pickupRoute={name='quest-pickup',title=L('任务指引'),ordered=false,manualAdvance=true,points={{point[1],point[2],point[3],title,'quest',nil,false,detail}}}
    M.Navigate('quest-pickup',1)
end
function M.ClearQuestPickup()
    if DB().nav and DB().nav.layer=='quest-pickup' then M.Stop(true) end
    DB().pickupRoute=nil;M.Refresh()
end
function M.HasQuestPickup() return DB().pickupRoute~=nil end
function M.SetZoneGuide(route)
    local points={};for _,r in ipairs(route or {})do points[#points+1]={r.m,r.x,r.y,r.label,r.kind,r.number,false,r.detail}end
    DB().zoneGuide=#points>0 and {name='zone-guide',title=L('本地图任务攻略'),ordered=true,manualAdvance=true,points=points} or nil
    if #points>0 then M.Navigate('zone-guide',1) else M.ClearZoneGuide()end
end
function M.HasZoneGuide()return DB().zoneGuide~=nil end
function M.ZoneGuideIndex()local n=DB().nav;return n and n.layer=='zone-guide' and n.index or 1 end
function M.ClearZoneGuide()
    if DB().nav and DB().nav.layer=='zone-guide'then M.Stop(true)end
    DB().zoneGuide=nil;M.Refresh()
end
function M.AdventureStatus()
	local n = DB().nav
	if n and n.layer == "adventure-tasks" then return n.index end
end
function M.StopAdventure(preserveAdventure)
	if not preserveAdventure and WoWAIAdventure and WoWAIAdventure.NavigationStopped then WoWAIAdventure.NavigationStopped() end
	if DB().nav and DB().nav.layer == "adventure-tasks" then M.Stop(preserveAdventure) end
end

---------------------------------------------------------------------------
-- Sync from the bridge
---------------------------------------------------------------------------

local function LayerKey(l)
	local parts = { l.title or "", tostring(l.ordered), tostring(l.loop), #(l.points or {}) }
	for _, p in ipairs(l.points or {}) do parts[#parts + 1] = table.concat({ p[1], p[2], p[3], p[4] or "", p[5] or "" }, ",") end
	return table.concat(parts, ";")
end

function M.ClearAILayers()
	local d = DB()
	-- Keep the synchronized snapshot and content signatures: stale slot data and
	-- updates to other layers must not resurrect what the player just cleared.
	for _, layer in ipairs(d.map and d.map.layers or {}) do
		d.clearedLayers[layer.name] = LayerKey(layer)
		d.hidden[layer.name] = nil
	end
	if d.nav and d.nav.layer ~= "adventure-tasks" and d.nav.layer ~= 'quest-pickup' and d.nav.layer~='zone-guide' then M.Stop(true) end
	M.Refresh()
	Print(L("已清除 AI 地图标记及对应导航。"))
end

function M.Sync(m)
	if type(m) ~= "table" or type(m.layers) ~= "table" then return end
	local cur = DB().map
	if cur and cur.epoch == m.epoch and (tonumber(m.version) or 0) <= (tonumber(cur.version) or 0) then return end
	local old = {}
	for _, l in ipairs(cur and cur.layers or {}) do old[l.name] = LayerKey(l) end
	local layers, changed, present = {}, {}, {}
	for _, l in ipairs(m.layers) do
		if type(l) == "table" and type(l.name) == "string" and type(l.points) == "table" then
			present[l.name] = true
			local signature = LayerKey(l)
			if mdb.clearedLayers[l.name] and mdb.clearedLayers[l.name] ~= signature then mdb.clearedLayers[l.name] = nil end
			layers[#layers + 1] = l
			if not mdb.clearedLayers[l.name] and old[l.name] ~= signature then changed[#changed + 1] = l end
		end
	end
	for name in pairs(mdb.clearedLayers) do if not present[name] then mdb.clearedLayers[name] = nil end end
	mdb.map = { epoch = m.epoch, version = tonumber(m.version) or 0, layers = layers }
	-- Drop navigation that points at a layer that is gone.
	if mdb.nav and not FindLayer(mdb.nav.layer) then mdb.nav = nil end
	for _, l in ipairs(changed) do
		mdb.hidden[l.name] = nil
		Print(string.format(L("%s: %d point(s)%s. Open the map (M) to see it."), l.title or l.name, #l.points, l.ordered and L(", route") or ""))
		-- A new or changed route on the player's continent starts navigation at its first
		-- stop, unless the player is already following another route.
		local here = PlayerOnContinent()
		local free = not mdb.nav or mdb.nav.layer == l.name
		if l.ordered and #l.points > 0 and free and (not here or ContinentOf(l.points[1][1]) == here) then
			mdb.nav = { layer = l.name, index = 1 }
		end
	end
	M.UpdateNavigator()
	M.Refresh()
end

---------------------------------------------------------------------------
-- /wow-ai map (and /aimap)
---------------------------------------------------------------------------

local function Status()
	local layers = Layers()
	if #layers == 0 then Print(L("no layers yet. Ask the agent for a route, e.g. /ai route me through copper veins in Loch Modan")) end
	for _, l in ipairs(layers) do
		Print(string.format("%s%s|r  %s (%d point(s))%s", mdb.hidden[l.name] and "|cff888888" or "|cffffffff", l.name, l.title or "", #l.points, (mdb.nav and mdb.nav.layer == l.name) and string.format(L("  navigating %d/%d"), mdb.nav.index, #l.points) or ""))
	end
	local n = mdb.nodes
	Print(string.format(L("nodes: ore %s, herb %s, filter %s%s"), n.ore and "on" or "off", n.herb and "on" or "off", n.filter, WoWAINodes and "" or L("  (WoWAI_Nodes data addon not installed)")))
	Print(L("commands: /wow-ai map ore|herb [on|off], filter all|skill, show|hide <layer>, nav <layer> [n], next, prev, stop  (/aimap is the same)"))
end

function M.Command(msg)
	DB()
	local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
	cmd = (cmd or ""):lower()
	if cmd == "" then Status()
	elseif cmd == "ore" or cmd == "herb" then
		local v = rest:lower()
		mdb.nodes[cmd] = (v == "on") or (v ~= "off" and not mdb.nodes[cmd])
		Print(cmd .. L(" nodes ") .. (mdb.nodes[cmd] and "shown" or "hidden") .. L(" on the world map"))
		M.Refresh()
	elseif cmd == "filter" and (rest == "all" or rest == "skill") then
		mdb.nodes.filter = rest
		Print(rest == "all" and L("showing every node") or L("showing nodes your skill can gather"))
		M.Refresh()
	elseif (cmd == "show" or cmd == "hide") and rest ~= "" then
		if not FindLayer(rest) then Print(L("no layer ") .. rest); return end
		mdb.hidden[rest] = (cmd == "hide") or nil
		M.Refresh()
	elseif cmd == "nav" then
		local name, idx = rest:match("^(%S+)%s*(%d*)$")
		M.Navigate(name, tonumber(idx))
	elseif cmd == "next" then M.Step(1)
	elseif cmd == "prev" then M.Step(-1)
	elseif cmd == "stop" then M.Stop()
	elseif cmd == "clear" then M.ClearAILayers()
	else Status() end
end

SLASH_WOWAIMAP1 = "/aimap"
SlashCmdList["WOWAIMAP"] = M.Command

local ev = CreateFrame("Frame")
ev:RegisterEvent("ADDON_LOADED")
ev:RegisterEvent("PLAYER_LOGIN")
ev:RegisterEvent("SKILL_LINES_CHANGED")
ev:SetScript("OnEvent", function(_, event, arg1)
	if event == "ADDON_LOADED" and (arg1 == ADDON_NAME or arg1 == "Blizzard_WorldMap") then
		DB()
		SetupWorldMap()
	elseif event == "PLAYER_LOGIN" then
		DB()
		SetupWorldMap()
		M.UpdateNavigator()
	elseif event == "SKILL_LINES_CHANGED" then
		M.Refresh()
	end
end)
