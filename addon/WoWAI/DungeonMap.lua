-- Bundled reference atlas with native-map fallback. Never project world coords onto static art.
local M={}
WoWAIDungeonMap=M
local L=WoWAILocale.Text
local function Read(fn,...)
    if type(fn)~='function' then return end
    local ok,value=pcall(fn,...);if ok then return value end
end
local function Same(name,row)
    if type(name)~='string' then return false end
    for _,key in ipairs({'name','nameEn','nameTW'}) do if WoWAILocale.SameName(name,row[key] or '') then return true end end
    for _,alias in ipairs(row.aliases or {}) do if WoWAILocale.SameName(name,alias) then return true end end
    return false
end
local function Info(id)return Read(C_Map and C_Map.GetMapInfo,id)end
local function IsDungeon(info)return type(info)=='table' and (info.mapType==4 or info.mapType==5)end
local function Static(id)
    if type(id)~='string' then return end
    local key,page=id:match('^static:([^:]+):?(%d*)$')
    local map=key and WoWAIDungeonAtlas and WoWAIDungeonAtlas[key]
    if map and map.pages then return map.pages[tonumber(page) or 1] end
    return map
end
function M.Number(d,boss)
    local map=WoWAIDungeonAtlas and WoWAIDungeonAtlas[d.id]
    for _,page in ipairs(map and (map.pages or {map}) or {}) do
    for _,pin in ipairs(page.pins or {}) do
        for _,key in ipairs(pin.bossKeys or {}) do if key==boss.key then return pin.number end end
    end
    end
end
function M.Floors(d)
    local map=WoWAIDungeonAtlas and WoWAIDungeonAtlas[d.id]
    if map then
        local floors={}
        for _,page in ipairs(map.pages or {map}) do floors[#floors+1]={id=page.id,name=map.pages and L(page.name) or L('副本地图')} end
        return floors,floors[1].id
    end
    if not C_Map then return {} end
    local root
    -- An explicitly verified UI map reference takes precedence over name discovery.
    if type(d.uiMapID)=='number' and IsDungeon(Info(d.uiMapID)) then root=d.uiMapID end
    local current=Read(C_Map.GetBestMapForUnit,'player');local visited={}
    local cursor=current
    for _=1,12 do
        if not cursor or visited[cursor] then break end;visited[cursor]=true
        local info=Info(cursor);if not info then break end
        if IsDungeon(info) and Same(info.name,d) then root=root or cursor;break end
        cursor=info.parentMapID
    end
    if not root then
        local world=Read(C_Map.GetFallbackWorldMapID)
        local choices=world and Read(C_Map.GetMapChildrenInfo,world,nil,true) or {}
        for _,info in ipairs(type(choices)=='table' and choices or {}) do
            if IsDungeon(info) and Same(info.name,d) then root=info.mapID;break end
        end
    end
    if not root then return {} end
    local floors,seen={},{}
    local function Add(id,name,order)
        local info=Info(id)
        if IsDungeon(info) and not seen[id] then seen[id]=true;floors[#floors+1]={id=id,name=name or info.name,order=order or #floors+1} end
    end
    local group=Read(C_Map.GetMapGroupID,root)
    local members=group and Read(C_Map.GetMapGroupMembersInfo,group)
    for _,member in ipairs(type(members)=='table' and members or {}) do Add(member.mapID,member.name,member.floorIndex) end
    if #floors==0 then
        local children=Read(C_Map.GetMapChildrenInfo,root,nil,true)
        for _,info in ipairs(type(children)=='table' and children or {}) do Add(info.mapID,info.name) end
    end
    if #floors==0 then Add(root) end
    table.sort(floors,function(a,b)if a.order==b.order then return a.id<b.id end;return a.order<b.order end)
    return floors,current
end
function M.Art(id)
    local map=Static(id)
    if map then
        return {layerWidth=map.width,layerHeight=map.height,tileWidth=map.textureWidth,tileHeight=map.textureHeight},{map.texture},1,1
    end
    local layers=Read(C_Map and C_Map.GetMapArtLayers,id);local layer=type(layers)=='table' and layers[1]
    if type(layer)~='table' then return end
    for _,key in ipairs({'layerWidth','layerHeight','tileWidth','tileHeight'}) do
        if type(layer[key])~='number' or layer[key]<=0 or layer[key]>32768 then return end
    end
    local textures=Read(C_Map.GetMapArtLayerTextures,id,1)
    local cols,rows=math.ceil(layer.layerWidth/layer.tileWidth),math.ceil(layer.layerHeight/layer.tileHeight)
    if cols*rows>256 or type(textures)~='table' or #textures<cols*rows then return end
    return layer,textures,cols,rows
end
function M.Pins(d,id)
    local map=Static(id)
    if map then
        local pins={}
        for _,p in ipairs(map.pins or {}) do
          if not p.faction or (WoWAIDungeon and p.faction==WoWAIDungeon.PlayerFaction()) then
            local bosses={}
            for _,key in ipairs(p.bossKeys or {}) do
                for _,boss in ipairs(d.bosses or {}) do if boss.key==key then bosses[#bosses+1]=boss;break end end
            end
            if #bosses>0 or p.label then pins[#pins+1]={number=p.number,x=p.x,y=p.y,boss=bosses[1],bosses=bosses,label=p.label and L(p.label),note=p.note and L(p.note)} end
          end
        end
        return pins
    end
    local out={};local encounters=Read(C_EncounterJournal and C_EncounterJournal.GetEncountersOnMap,id)
    for _,e in ipairs(type(encounters)=='table' and encounters or {}) do
        local name=Read(EJ_GetEncounterInfo,e.encounterID)
        if type(e.mapX)=='number' and type(e.mapY)=='number' and e.mapX>=0 and e.mapX<=1 and e.mapY>=0 and e.mapY<=1 then
            for i,b in ipairs(d.bosses or {}) do
                if Same(name,b) then out[#out+1]={x=e.mapX,y=e.mapY,boss=b,number=i};break end
            end
        end
    end
    return out
end
local function Label(parent)
    local text=parent:CreateFontString(nil,'OVERLAY','GameFontHighlight');text:SetJustifyH('LEFT');text:SetWordWrap(true);return text
end
function M.Create(parent,onBoss)
    local f=CreateFrame('Frame',nil,parent);f.tiles={};f.pins={};f.onBoss=onBoss
    f.floorLabel=Label(f);f.floorLabel:SetPoint('TOPLEFT',90,-8);f.floorLabel:SetPoint('TOPRIGHT',-90,-8)
    f.note=Label(f);f.note:SetPoint('BOTTOMLEFT',0,0);f.note:SetPoint('BOTTOMRIGHT',0,0);f.note:SetHeight(64)
    f.viewport=CreateFrame('Frame',nil,f);f.viewport:SetPoint('TOPLEFT',0,-38);f.viewport:SetPoint('BOTTOMRIGHT',0,0)
    f.canvas=CreateFrame('Frame',nil,f.viewport);f.canvas:SetPoint('CENTER')
    local function Button(text,x,delta)
        local b=CreateFrame('Button',nil,f,'UIPanelButtonTemplate');b:SetSize(80,24);b:SetText(text);b:SetPoint(x,0,0)
        b:SetScript('OnClick',function()f.selected=math.max(1,math.min(#f.floors,(f.selected or 1)+delta));M.Draw(f)end);return b
    end
    f.prev=Button(L('上一层'),'TOPLEFT',-1);f.next=Button(L('下一层'),'TOPRIGHT',1)
    f.viewport:SetScript('OnSizeChanged',function()if f.dungeon and f:IsVisible() then M.Draw(f) end end)
    return f
end
function M.Draw(f)
    f.note:SetText('');f.note:Hide()
    if f.chooser then f.chooser:Hide() end
    for _,tile in ipairs(f.tiles) do tile:Hide() end
    for _,pin in ipairs(f.pins) do pin:Hide() end
    local floor=f.floors and f.floors[f.selected or 1]
    f.prev:SetEnabled(floor and f.selected>1);f.next:SetEnabled(floor and f.selected<#f.floors)
    f.floorLabel:SetText(floor and (floor.name..'  '..f.selected..' / '..#f.floors) or L('副本地图待补充'))
    local layer,textures,cols,rows;if floor then layer,textures,cols,rows=M.Art(floor.id) end
    if not layer then
        f.note:SetText(L('副本地图待补充'));f.note:Show();return
    end
    local scale=math.min(math.max(1,f.viewport:GetWidth())/layer.layerWidth,math.max(1,f.viewport:GetHeight())/layer.layerHeight)
    local width,height=layer.layerWidth*scale,layer.layerHeight*scale;f.canvas:SetSize(width,height)
    for y=0,rows-1 do for x=0,cols-1 do
        local i=y*cols+x+1;local tile=f.tiles[i]
        if not tile then tile=f.canvas:CreateTexture(nil,'ARTWORK');f.tiles[i]=tile end
        local w=math.min(layer.tileWidth,layer.layerWidth-x*layer.tileWidth);local h=math.min(layer.tileHeight,layer.layerHeight-y*layer.tileHeight)
        tile:ClearAllPoints();tile:SetPoint('TOPLEFT',x*layer.tileWidth*scale,-y*layer.tileHeight*scale);tile:SetSize(w*scale,h*scale)
        tile:SetTexCoord(0,w/layer.tileWidth,0,h/layer.tileHeight)
        local ok=tile:SetTexture(textures[i]);tile:Show()
        if ok==false then f.note:SetText(L('地图文件缺失或未加载，请重新安装后完全退出并重启游戏。'));f.note:Show();return end
    end end
    local pins=M.Pins(f.dungeon,floor.id)
    for i,p in ipairs(pins) do
        local b=f.pins[i]
        if not b then b=CreateFrame('Button',nil,f.canvas,'UIPanelButtonTemplate');b:SetSize(28,26);f.pins[i]=b end
        b:ClearAllPoints();b:SetPoint('CENTER',f.canvas,'TOPLEFT',p.x*width,-p.y*height);b:SetText(tostring(p.number));b:Show()
        b:SetScript('OnClick',function()
            if not p.boss then return end
            if not p.bosses or #p.bosses<2 then f.onBoss(p.boss);return end
            -- Several bosses can share a reference area; never invent separate coordinates.
            if not f.chooser then
                f.chooser=CreateFrame('Frame',nil,f);f.chooser:SetFrameStrata('DIALOG');f.chooser.buttons={}
                f.chooser.bg=f.chooser:CreateTexture(nil,'BACKGROUND');f.chooser.bg:SetAllPoints();f.chooser.bg:SetColorTexture(.04,.03,.02,.98)
                f.chooser.close=CreateFrame('Button',nil,f.chooser,'UIPanelCloseButton');f.chooser.close:SetPoint('TOPRIGHT');f.chooser.close:SetScript('OnClick',function()f.chooser:Hide()end)
            end
            local chooser=f.chooser;chooser:ClearAllPoints();chooser:SetPoint('CENTER',f,'CENTER');chooser:SetSize(240,35+#p.bosses*30)
            for _,button in ipairs(chooser.buttons) do button:Hide() end
            for j,boss in ipairs(p.bosses) do
                local button=chooser.buttons[j]
                if not button then button=CreateFrame('Button',nil,chooser,'UIPanelButtonTemplate');button:SetSize(224,26);chooser.buttons[j]=button end
                button:ClearAllPoints();button:SetPoint('TOPLEFT',8,-30-(j-1)*30);button:SetText(WoWAILocale.Field(boss));button:SetScript('OnClick',function()chooser:Hide();f.onBoss(boss)end);button:Show()
            end
            chooser:Show()
        end)
        b:SetScript('OnEnter',function(self)
            local names={};for _,boss in ipairs(p.bosses or (p.boss and {p.boss} or {})) do names[#names+1]=WoWAILocale.Field(boss) end
            local title=p.label or table.concat(names,' / ')
            GameTooltip:SetOwner(self,'ANCHOR_RIGHT');GameTooltip:SetText(title..(p.note and '\n'..p.note or ''));GameTooltip:Show()
        end)
        b:SetScript('OnLeave',function()GameTooltip:Hide()end)
    end
end
function M.Show(f,d)
    local floors,current=M.Floors(d);local old=f.floors and f.floors[f.selected or 1]
    local preferred=f.dungeon and f.dungeon.id==d.id and old and old.id or current
    f.dungeon=d;f.floors=floors;f.selected=1
    for i,floor in ipairs(floors) do if floor.id==preferred then f.selected=i;break end end
    f:Show();M.Draw(f)
end
