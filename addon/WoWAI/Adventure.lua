local L = WoWAILocale.Text
-- Observations stay local. Manual planning and opt-in automatic planning are independent.
local ADDON_NAME = ...
local J = {}
WoWAIAdventure = J
local db, char, current
local cursor, part = 1, 1
local questCache, equipmentCache = {}, {}
local pendingAI, reloadRequested
local inFlight, planDue, nextAI = nil, nil, 0
local autoDue, planNotice
local syncNotice
local draftFlight
local navigationWanted = false
local lastMoney, lastXP, lastXPMax, lastLevel
local nextHeartbeat, nextSample, nextPoll = 0, 0, 0
local LIMIT = 10000

local function Try(fn, ...)
    if type(fn) ~= "function" then return nil end
    local ok,a,b,c,d,e,f,g,h,i,j = pcall(fn,...)
    if ok then return a,b,c,d,e,f,g,h,i,j end
end
local function Text(v) return tostring(v or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|H.-|h(.-)|h", "%1") end
local function Hex(s) return (s:gsub(".",function(c)return string.format("%02x",c:byte())end)) end
local function Quote(s) return '"'..tostring(s):gsub('[%z\1-\31\\"]',function(c) return string.format('\\u%04x',c:byte()) end)..'"' end
function J.JSON(v)
    if v == nil then return "null" end
    if type(v)=="boolean" then return v and "true" or "false" end
    if type(v)=="number" then return (v==v and v~=math.huge and v~=-math.huge) and tostring(v) or "null" end
    if type(v)=="string" then return Quote(v) end
    local out={}
    if #v>0 then for _,x in ipairs(v) do out[#out+1]=J.JSON(x) end; return '['..table.concat(out,',')..']' end
    local keys={};for k in pairs(v) do keys[#keys+1]=k end;table.sort(keys)
    for _,k in ipairs(keys) do out[#out+1]=Quote(k)..':'..J.JSON(v[k]) end
    return '{'..table.concat(out,',')..'}'
end
local function Notify(s) print(L('|cff66ccff[冒险助手]|r ')..s) end
local function Token() return tostring(time())..'-'..tostring(math.random(100000,999999)) end
function J.Position()
    local m=Try(C_Map and C_Map.GetBestMapForUnit,'player')
    local p=m and Try(C_Map.GetPlayerMapPosition,m,'player')
    local zone=Try(GetZoneText) or ''
    if zone=='' then zone=Try(GetRealZoneText) or '' end
    return {map=m,zone=zone,subzone=Try(GetSubZoneText) or '',x=p and p.x and p.x*100,y=p and p.y and p.y*100}
end
local function DeadState()
    if type(UnitIsDeadOrGhost)=='function' then
        local ok,dead=pcall(UnitIsDeadOrGhost,'player')
        if ok then return dead==true or dead==1 end
    end
    local corpse,ghost=Try(UnitIsDead,'player'),Try(UnitIsGhost,'player')
    if corpse==true or corpse==1 or ghost==true or ghost==1 then return true end
    if corpse~=nil and ghost~=nil then return false end
end
local function State()
    return {locale=WoWAILocale.Get(),dead=DeadState(),level=Try(UnitLevel,'player'),xp=Try(UnitXP,'player'),xpMax=Try(UnitXPMax,'player'),money=Try(GetMoney),position=J.Position(),killTracking=WoWAIKills~=nil,killCoverage=WoWAIKills and WoWAIKills.coverage or 'unavailable'}
end
-- Daily pages are independent of the rolling transport/recent-event buffers.
function J.DayKey(e) return 'day-'..(e.day or date('%Y-%m-%d',e.t)) end
local function KeepDay(owner,e,legacy)
    if e.kind=='heartbeat' or e.kind=='position' or e.kind:match('^snapshot_') then return end
    local key=J.DayKey(e)
    local day=owner.days[key]
    if not day then day={id=key,start=e.t,last=e.t,events={},quests=0,kills=0,loot=0,money=0};owner.days[key]=day end
    day.events[#day.events+1]=e;day.start=math.min(day.start,e.t);day.last=math.max(day.last,e.t)
    day.legacy=day.legacy or legacy
    if e.kind=='quest_turnin' then day.quests=day.quests+1 end
    if e.kind=='kill' then day.kills=day.kills+(e.data.count or 1) end
    if e.kind=='loot' then day.loot=day.loot+(e.data.count or 1) end
    if e.kind=='money' then day.money=day.money+(e.data.delta or 0) end
end
function J.Days(owner)
    if not owner.days then
        owner.days={}
        for _,e in ipairs(owner.recent or {}) do KeepDay(owner,e,true) end
    end
    local days={};for _,day in pairs(owner.days) do days[#days+1]=day end
    table.sort(days,function(a,b)return a.id>b.id end);return days
end
function J.Events(owner,selection)
    J.Days(owner)
    if selection and owner.days[selection] then return owner.days[selection].events end
    return owner.recent or {}
end
function J.Matches(e,selection) return not selection or e.session==selection or J.DayKey(e)==selection end
function J.Record(kind,data,force)
    if not db or not char or not current then return end
    if not db.enabled and not force then return end
    if #db.queue>=LIMIT then
        -- A long offline bridge session must not discard the player's history.
        if not db.warned then Notify(L('待归档记录较多，仍在本地保存；正常下线或 /reload 后由桥接归档。'));db.warned=true end
    end
    char.seq=char.seq+1
    local e={v=1,ledger=char.ledger,seq=char.seq,character=char.name,session=current.id,t=time(),kind=kind,data=data or {}}
    if kind=='interrupted' and data.lastObserved then e.t=data.lastObserved;e.data.detectedAt=time() end
    e.day=date('%Y-%m-%d',e.t)
    if not char.days then J.Days(char) end;KeepDay(char,e)
    local raw=J.JSON(e)
    db.queue[#db.queue+1]={ledger=e.ledger,seq=e.seq,hex=Hex(raw)}
    db.adventureExport[#db.adventureExport+1]=Hex(raw)
    char.recent[#char.recent+1]=e
    if #char.recent>1200 then table.remove(char.recent,1) end
    current.last=e.t
    if kind=='quest_turnin' then current.quests=(current.quests or 0)+1 end
    if kind=='death' then current.deaths=(current.deaths or 0)+1 end
    if kind=='money' then current.money=(current.money or 0)+(data.delta or 0) end
    if kind=='xp' then current.xp=(current.xp or 0)+(data.delta or 0) end
    if kind=='kill' then current.kills=(current.kills or 0)+(data.count or 1) end
    return e
end
function J.Milestones(events)
    local out,seenZone,seenItem={},{},{}
    for _,e in ipairs(events or {}) do
        local d=e.data;local title
        if e.kind=='level' then title=L('升到 ')..d.level..L(' 级')
        elseif e.kind=='quest_turnin' then title=L('完成任务：')..(d.title or tostring(d.questID))
        elseif e.kind=='zone' and d.zone~='' and not seenZone[d.zone] then seenZone[d.zone]=true; title=L('当前日志内首次到访：')..d.zone
        elseif e.kind=='loot' and (d.quality or 0)>=3 and not seenItem[d.itemID or d.name] then seenItem[d.itemID or d.name]=true;title=L('当前日志内首次获得：')..(d.name or tostring(d.itemID))
        elseif e.kind=='boss' and d.success then title=L('击败首领：')..d.name
        elseif e.kind=='achievement' then title=L('获得成就：')..(d.name or tostring(d.id))
        elseif e.kind=='note' and d.milestone then title=d.text end
        if title then out[#out+1]={title=title,event=e} end
    end
    return out
end
local function Receipted(r, receipts, watermarks)
    if r.seq<=(watermarks[r.ledger] or 0) then return true end
    local a=receipts[r.ledger]
    for _,range in ipairs(a and a.ranges or {}) do
        if type(range)=='table' and type(range[1])=='number' and type(range[2])=='number' and r.seq>=range[1] and r.seq<=range[2] then return true end
    end
    return false
end
function J.Ack(acks, snapshots)
    if not db or type(acks)~='table' then return end
    local got,receipts={},{}
    for _,c in pairs(db.characters) do got[c.ledger]=c.acked or 0 end
    for _,a in ipairs(acks) do got[a.ledger]=math.max(got[a.ledger] or 0,tonumber(a.seq) or 0);receipts[a.ledger]=a end
    local q,export={},{}
    for _,r in ipairs(db.queue) do if not Receipted(r,receipts,got) then q[#q+1]=r;export[#export+1]=r.hex end end
    local removed=#q~=#db.queue
    db.queue,db.adventureExport=q,export
    for _,c in pairs(db.characters) do c.acked=math.max(c.acked or 0,got[c.ledger] or 0) end
    -- An unchanged cumulative receipt must not rewind a multi-frame transfer.
    if removed then cursor,part=1,1 end
    if pendingAI and pendingAI.wire then
        local count=0
        for _,r in ipairs(pendingAI.wire) do
            if Receipted(r,receipts,got) then pendingAI.received[r.seq]=true end
            if pendingAI.received[r.seq] then count=count+1 end
        end
        if not pendingAI.snapshot then pendingAI.ready=count==#pendingAI.wire end
    end
    if pendingAI and pendingAI.snapshot then
        local request=pendingAI
        for _,a in ipairs(type(snapshots)=='table' and snapshots or {}) do
            if a.ledger==char.ledger and a.snapshot==request.snapshot then
                if a.error then
                    char.plan.error=L('任务资料库版本不一致或引用无效，请用同一安装包升级插件和桥接。')
                    Notify(char.plan.error);pendingAI=nil;break
                end
                for _,seq in ipairs(a.received or {}) do
                    if request.sequences[seq] then request.received[seq]=true end
                end
                if a.ready==true then request.ready=true end
            end
        end
    end
    if db.dropped and db.dropped>0 and #q<LIMIT-2 then
        local count=db.dropped;db.dropped=0;db.warned=nil
        J.Record('gap',{count=count,reason=L('未同步缓冲达到上限，部分事件未记录')},true)
    end
    if J.Render then J.Render() end
end
function J.NextWire()
    -- Routine observations remain in SavedVariables. Pixel transfer is opt-in
    -- for an explicit sync or AI request, never an idle background loop.
    if not db or not pendingAI or #db.queue==0 then return nil end
    if (char.acked or 0)>=pendingAI.seq or time()-pendingAI.started>240 then return nil end
    if pendingAI.snapshot and (not char.plan or char.plan.id~=pendingAI.snapshot or char.plan.stale) then return nil end
    if cursor>#db.queue then cursor=1;part=1 end
    local source=db.queue
    if pendingAI.wire then
        if pendingAI.ready then return nil end
        source=pendingAI.wire
        cursor=pendingAI.cursor or 1;part=pendingAI.part or 1
        if cursor>#source then cursor=1;part=1 end
    end
    local chunks,size,last={},0,0
    for _=1,6 do
        local r=source[cursor];if not r then break end
        if pendingAI.wire and pendingAI.received[r.seq] then
            cursor=cursor+1;part=1
        else
        local total=math.ceil(#r.hex/1800)
        local payload=J.JSON({ledger=r.ledger,seq=r.seq,part=part,total=total,hex=r.hex:sub((part-1)*1800+1,part*1800)})
        if size+#payload>2700 then break end
        chunks[#chunks+1]=payload;size=size+#payload+1;last=r.seq
        part=part+1;if part>total then part=1;cursor=cursor+1 end
        end
    end
    if pendingAI.wire then pendingAI.cursor=cursor;pendingAI.part=part end
    if #chunks==0 then return nil end
    return 'WOWAIJ:['..table.concat(chunks,',')..']',last
end
local DUNGEON_AREAS={}
for _,area in ipairs({'哀嚎洞穴','怒焰裂谷','死亡矿井','影牙城堡','黑暗深渊','监狱','诺莫瑞根','剃刀沼泽','剃刀高地','血色修道院','奥达曼','祖尔法拉克','玛拉顿','沉没的神庙','阿塔哈卡神庙','黑石深渊','黑石塔','通灵学院','斯坦索姆','厄运之槌','熔火之心','黑翼之巢','奥妮克希亚的巢穴','祖尔格拉布','安其拉废墟','安其拉神殿','纳克萨玛斯','Wailing Caverns','Ragefire Chasm','The Deadmines','Shadowfang Keep','Blackfathom Deeps','The Stockade','Gnomeregan','Razorfen Kraul','Razorfen Downs','Scarlet Monastery','Uldaman','Zul\'Farrak','Maraudon','The Temple of Atal\'Hakkar','Blackrock Depths','Blackrock Spire','Scholomance','Stratholme','Dire Maul','Molten Core','Blackwing Lair','Onyxia\'s Lair','Zul\'Gurub','Ruins of Ahn\'Qiraj','Temple of Ahn\'Qiraj','Naxxramas'}) do DUNGEON_AREAS[area]=true;DUNGEON_AREAS[WoWAILocale.Traditional(area)]=true end
function J.IsDungeonQuest(q,info)
    local tag=Try(C_QuestLog and C_QuestLog.GetQuestTagInfo,q.id)
    local enum=Enum and Enum.QuestTag
    if info and (info.isDungeon==true or info.isRaid==true) then return true,L('游戏副本任务标记') end
    if type(tag)=='table' then
        local name=tag.tagName or ''
        if (enum and tag.tagID and (tag.tagID==enum.Dungeon or tag.tagID==enum.Raid or tag.tagID==enum.Raid10 or tag.tagID==enum.Raid25))
            or tag.worldQuestType==6 or tag.worldQuestType==8
            or name=='地下城' or name=='副本' or name=='团队' or name=='团队副本' or name=='團隊' or name=='團隊副本' or name=='Dungeon' or name=='Raid' then return true,L('游戏副本任务标记') end
    end
    if DUNGEON_AREAS[q.area] then return true,L('副本任务分组：')..q.area end
    local version=Try(GetBuildInfo)
    local data=type(version)=='string' and version:match('^1%.60%.') and WoWAIQuestLocations and WoWAIQuestLocations[q.id]
    if data then
        if data.dungeon then return true,L('无限任务资料：副本分类') end
        for _,phase in ipairs({'objective','turnin'}) do for _,point in ipairs(data[phase] or {}) do
            if point[4]>4 then return true,L('无限任务资料：目标或交付位于副本内') end
        end end
    end
    return false
end
function J.EligibleQuests(quests)
    local out={};for _,q in ipairs(quests or {}) do if not q.dungeon then out[#out+1]=q end end;return out
end
function J.PlanningQuests(p)
    local out={}
    for _,q in ipairs(J.EligibleQuests(p.quests)) do
        local localPoint=false
        for _,w in ipairs(q.locations or {}) do if w.m==p.scopeMap then localPoint=true end end
        if not p.scopeMap or localPoint or #(q.locations or {})==0 then out[#out+1]=q end
    end
    return out
end
function J.NavigationRoute(p)
    if not p then return {} end
    return p.regions and #p.regions>0 and p.regions or p.route or {}
end
function J.BuildRegions()
    local p=char.plan;p.regions={};p.turnedIn={}
    local byID={};for _,q in ipairs(p.quests) do byID[q.id]=q end
    for _,stop in ipairs(p.route) do
        local q=byID[stop.questID];local name=q.region or '';local r=p.regions[#p.regions]
        -- Never merge far-apart points or cross objective/turn-in phases.
        if not r or name=='' or r.name~=name or r.m~=stop.m or r.kind~=stop.kind or (r.x-stop.x)^2+(r.y-stop.y)^2>64 then
            r={m=stop.m,x=stop.x,y=stop.y,name=name~='' and name or q.title,kind=stop.kind,members={},number=#p.regions+1};p.regions[#p.regions+1]=r
        end
        r.members[#r.members+1]={questID=q.id,phase=stop.kind,title=q.title}
    end
end
function J.UpdateRegions()
    local p=char and char.plan;if not p or not p.regions then return false end
    local qs,complete=J.Quests();if not complete then return true end
    local old={};for _,q in ipairs(p.quests) do old[q.id]=q end
    local byID={};for _,q in ipairs(qs) do
        local prev=old[q.id];if prev then
            q.reason=prev.reason;q.action=prev.action;q.region=prev.region;q.sourceURL=prev.sourceURL
            for _,w in ipairs(q.locations) do if prev.waypoint and w.key==prev.waypoint.key then q.waypoint=w;break end end
        end
        if q.waypoint and q.waypoint.m~=p.scopeMap then q.waypoint=nil;for _,w in ipairs(q.locations) do if w.m==p.scopeMap then q.waypoint=w;break end end end
        byID[q.id]=q
    end
    -- Repair saved plans whose coordinates were lost during a numeric round trip.
    -- Rebuild only an empty region list; never reset completed area progress.
    if #p.regions==0 then
        p.quests=qs;J.ReorderRoute();J.BuildRegions()
    end
    local turnins={};for _,r in ipairs(p.regions) do for _,member in ipairs(r.members) do if member.phase=='turnin' then turnins[member.questID]=true end end end
    local additions={};local planned={}
    for _,r in ipairs(p.regions) do
        local closed,removed,lines=0,0,{};local target
        for _,member in ipairs(r.members) do
            local q=byID[member.questID];planned[member.questID]=true
            member.removed=not q and not p.turnedIn[member.questID] or false
            member.done=p.turnedIn[member.questID] or (member.phase~='turnin' and q and q.complete) or member.removed or false
            if member.done then closed=closed+1;if member.removed then removed=removed+1 end
            elseif not target and q and q.waypoint then target=q.waypoint;r.questID=q.id end
            lines[#lines+1]=(member.removed and L('[已移除] ') or member.done and L('[完成] ') or L('[进行中] '))..member.title
            if member.phase~='turnin' and q and q.complete and not p.turnedIn[q.id] and not turnins[q.id] and q.waypoint and q.waypoint.m==p.scopeMap then
                local w=q.waypoint;additions[#additions+1]={m=w.m,x=w.x,y=w.y,name=L('交任务：')..q.title,kind='turnin',members={{questID=q.id,phase='turnin',title=q.title}}};turnins[q.id]=true
            end
        end
        r.done=closed==#r.members;r.closed=closed;r.total=#r.members;r.removed=removed
        if target then r.x=target.x;r.y=target.y;r.source=target.source end
        r.label=r.name..' ('..closed..'/'..#r.members..')';r.detail=table.concat(lines,'\n')
    end
    for _,r in ipairs(additions) do
        local merged
        for _,existing in ipairs(p.regions) do
            if existing.kind=='turnin' and not existing.done and existing.m==r.m and (existing.x-r.x)^2+(existing.y-r.y)^2<=1 then
                existing.members[#existing.members+1]=r.members[1];existing.name=L('集中交付任务');merged=true;break
            end
        end
        if not merged then r.number=#p.regions+1;p.regions[#p.regions+1]=r end
    end
    if #additions>0 then return J.UpdateRegions() end
    p.quests=qs;p.complete=true;p.stale=false;p.fingerprint=J.Fingerprint(qs);p.unplanned=0
    for _,q in ipairs(J.PlanningQuests(p)) do if not planned[q.id] then p.unplanned=p.unplanned+1 end end
    J.ReorderRoute()
    local at=WoWAIMap and WoWAIMap.AdventureStatus and WoWAIMap.AdventureStatus()
    if at then navigationWanted=true end
    local nextIndex=at and p.regions[at] and not p.regions[at].done and at or nil
    if not nextIndex then for i,r in ipairs(p.regions) do if not r.done then nextIndex=i;break end end end
    p.regionIndex=nextIndex
    if WoWAIMap then
        WoWAIMap.SetAdventureRoute(p.regions,nextIndex or 1,not navigationWanted or not nextIndex)
        if not nextIndex then WoWAIMap.StopAdventure(true) end
    end
    return true
end
function J.Locations(q)
    if q.dungeon then return {} end
    local out,maps,seen={},{},{}
    local function Add(m,x,y,source,entrance,key)
        if type(m)~='number' or type(x)~='number' or type(y)~='number' or x~=x or y~=y or x<0 or x>100 or y<0 or y>100 or (x==0 and y==0) then return end
        out[#out+1]={m=m,x=x,y=y,source=source,entrance=entrance or false,key=key or ('p'..(#out+1))}
    end
    local function Map(m)if type(m)=='number' and not seen[m] then seen[m]=true;maps[#maps+1]=m end end
    local pos=J.Position();Map(pos.map);Map(Try(C_QuestLog and C_QuestLog.GetMapForQuestPOIs))
    local version=Try(GetBuildInfo)
    local data=type(version)=='string' and version:match('^1%.60%.') and WoWAIQuestLocations and WoWAIQuestLocations[q.id]
    local points=data and data[q.complete and 'turnin' or 'objective'] or {}
    for _,p in ipairs(points) do Map(p[1]) end
    local m,x,y=Try(C_QuestLog and C_QuestLog.GetNextWaypoint,q.id)
    if type(x)=='number' and type(y)=='number' then Add(m,x*100,y*100,L('游戏任务导航接口'),false,'native') end
    for _,map in ipairs(maps) do
        local px,py=Try(C_QuestLog and C_QuestLog.GetNextWaypointForMap,q.id,map)
        if type(px)=='number' and type(py)=='number' then Add(map,px*100,py*100,L('游戏地图任务导航'),false,'map'..map) end
        local pois=Try(C_QuestLog and C_QuestLog.GetQuestsOnMap,map)
        for _,poi in ipairs(type(pois)=='table' and pois or {}) do
            if poi.questID==q.id and type(poi.x)=='number' and type(poi.y)=='number' then Add(map,poi.x*100,poi.y*100,L('游戏地图任务标记'),false,'poi'..map) end
        end
    end
    -- Live locations take precedence over the shipped reference database.
    if #out>0 then return out end
    local buckets={};for _,o in ipairs(q.objectives) do local t=o.type or '';buckets[t]=buckets[t] or {};table.insert(buckets[t],o) end
    local kindType={'monster','object','item'}
    for i,p in ipairs(points) do
        local kind=p[4]>4 and p[4]-4 or p[4];local bucket=buckets[kindType[kind] or ''];local wanted=q.complete or not bucket or #bucket==0
        local mask,bit=p[5],1
        while mask>0 do if mask%2==1 and (not bucket or not bucket[bit] or not bucket[bit].done) then wanted=true end;mask=math.floor(mask/2);bit=bit+1 end
        if wanted then Add(p[1],p[2],p[3],L('无限任务资料 / EverythingQuests')..(p[4]>4 and L('（副本入口）') or ''),p[4]>4,'db'..i) end
    end
    table.sort(out,function(a,b)
        local function Score(w)return (w.m==pos.map and 0 or 1000000)+(w.x-(pos.x or 50))^2+(w.y-(pos.y or 50))^2 end
        local aScore,bScore=Score(a),Score(b);if aScore==bScore then return a.key<b.key end;return aScore<bScore
    end)
    -- Keep at least one candidate per map/type/mask before adding alternatives.
    local chosen,groups={},{}
    for _,w in ipairs(out) do local p=points[tonumber(w.key:sub(3))];local key=w.m..':'..p[4]..':'..p[5];if not groups[key] and #chosen<16 then chosen[#chosen+1]=w;groups[key]=true;w.chosen=true end end
    for _,w in ipairs(out) do if not w.chosen and #chosen<16 then chosen[#chosen+1]=w end;w.chosen=nil end
    return chosen
end
function J.Quests()
    local quests,header={},''
    local shown,count=Try(C_QuestLog and C_QuestLog.GetNumQuestLogEntries)
    if not shown then shown,count=Try(GetNumQuestLogEntries) end
    for i=1,(shown or 0) do
        local info=Try(C_QuestLog and C_QuestLog.GetInfo,i)
        if type(info)~='table' then
            local title,level,_,isHeader,_,complete,_,id=Try(GetQuestLogTitle,i)
            info={title=title,level=level,isHeader=isHeader,questID=id,isComplete=complete}
        end
        if info.isHeader then header=info.title or ''
        elseif info.questID and info.questID>0 then
            local id=info.questID
            local q={id=id,title=info.title or tostring(id),level=info.level,group=info.suggestedGroup or 0,area=header,complete=Try(C_QuestLog and C_QuestLog.IsComplete,id)==true or info.isComplete==1,objectives={}}
            local objectives=Try(C_QuestLog and C_QuestLog.GetQuestObjectives,id)
            if type(objectives)=='table' then
                for _,o in ipairs(objectives) do q.objectives[#q.objectives+1]={text=Text(o.text),done=o.finished==true,have=o.numFulfilled,need=o.numRequired,type=o.type} end
            else
                local n=Try(GetNumQuestLeaderBoards,i) or 0
                for k=1,n do local text,kind,done=Try(GetQuestLogLeaderBoard,k,i);q.objectives[#q.objectives+1]={text=Text(text),type=kind,done=done==true} end
            end
            q.dungeon,q.skipReason=J.IsDungeonQuest(q,info)
            q.locations=J.Locations(q);q.waypoint=q.locations[1]
            quests[#quests+1]=q
        end
    end
    return quests,count==nil or #quests==count
end
function J.SortRoute(quests,pos)
    local pool,missing={},{}
    for _,q in ipairs(J.EligibleQuests(quests)) do if q.waypoint then pool[#pool+1]=q else missing[#missing+1]=q.id end end
    local route={}; local m,x,y=pos.map,pos.x or 50,pos.y or 50
    while #pool>0 do
        local best,score=1,math.huge
        for i,q in ipairs(pool) do
            local w=q.waypoint;local d=(w.x-x)^2+(w.y-y)^2
            local s=(w.m==m and 0 or 1000000)+d
            if not q.complete and ((q.group or 0)>1 or (q.level or 0)>(Try(UnitLevel,'player') or 1)+3) then s=s+100000 end
            if s<score then best,score=i,s end
        end
        local q=table.remove(pool,best);local w=q.waypoint
        route[#route+1]={questID=q.id,m=w.m,x=w.x,y=w.y,label=(q.complete and L('交任务：') or L('完成：'))..q.title,kind=q.complete and 'turnin' or 'quest',source=w.source}
        m,x,y=w.m,w.x,w.y
    end
    return route,missing
end
-- Immediate, bounded fallback using observed coordinates only. AI still receives
-- every eligible quest and its full objectives/candidate list below.
function J.LocalMapRoute(p)
    if not p.scopeMap then return end
    local pool,missing,chosen={},{},{}
    local level=Try(UnitLevel,'player') or 1
    for _,q in ipairs(J.PlanningQuests(p)) do
        q.waypoint=nil;q.reason=nil;q.action=nil;q.region=nil;q.sourceURL=nil
        local options={}
        for _,w in ipairs(q.locations or {}) do if w.m==p.scopeMap and not w.entrance then options[#options+1]=w end end
        if #options==0 then missing[#missing+1]=q.id
        else pool[#pool+1]={q=q,options=options,risk=not q.complete and ((q.group or 0)>1 or (q.level or 0)>level+3) and 1 or 0} end
    end
    local start={x=p.position.x or 50,y=p.position.y or 50}
    local function Dist(a,b)return math.sqrt((a.x-b.x)^2+(a.y-b.y)^2) end
    local at=start
    while #pool>0 do
        local best,point,score
        for i,item in ipairs(pool) do for _,w in ipairs(item.options) do
            local d=Dist(at,w)+item.risk*10000
            if not score or d<score then best,point,score=i,w,d end
        end end
        local item=table.remove(pool,best);item.q.waypoint=point;chosen[#chosen+1]=item;at=point
    end
    -- At most four 2-opt passes remove crossings; risky tasks stay in their band.
    for pass=1,4 do
        local changed=false
        for i=1,#chosen-1 do for j=i+1,#chosen do
            if chosen[i].risk==chosen[j].risk then
                local a=i==1 and start or chosen[i-1].q.waypoint
                local b,c=chosen[i].q.waypoint,chosen[j].q.waypoint
                local d=chosen[j+1] and chosen[j+1].q.waypoint
                if Dist(a,c)+(d and Dist(b,d) or 0)+0.001<Dist(a,b)+(d and Dist(c,d) or 0) then
                    local l,r=i,j;while l<r do chosen[l],chosen[r]=chosen[r],chosen[l];l=l+1;r=r-1 end;changed=true
                end
            end
        end end
        if not changed then break end
    end
    p.order={};p.ai=false;p.localRoute=true
    for _,item in ipairs(chosen) do
        local q=item.q;q.region=q.area~='' and q.area or nil
        q.reason=L('备用路线按已知坐标减少折返；直线距离不代表实际道路，AI 仍会检查完整任务。')
        p.order[#p.order+1]=q.id
    end
    for _,id in ipairs(missing) do p.order[#p.order+1]=id end
    p.summary=L('本地备用路线已生成，AI 完成后再优化；缺少可靠坐标的任务仍保留。')
    J.ReorderRoute();J.BuildRegions();p.unplanned=#missing
    for _,r in ipairs(p.regions) do
        r.total=#r.members;r.closed=0;r.label=r.name..' (0/'..r.total..')';r.detail=''
    end
    p.regionIndex=#p.regions>0 and 1 or nil
    if WoWAIMap then WoWAIMap.SetAdventureRoute(p.regions,1,true) end
end
function J.Plan(startNavigation,reset)
    if not current then Notify(L('请等待角色进入世界。'));return end
    if not reset and not inFlight and not pendingAI and J.UpdateRegions() then J.Render();return end
    local qs,complete=J.Quests();local pos=J.Position();local id=Token()
    local route,missing=J.SortRoute(qs,pos)
    local order={};for _,r in ipairs(route) do order[#order+1]=r.questID end;for _,qid in ipairs(missing) do order[#order+1]=qid end
    local old=char.plan;local fingerprint=J.Fingerprint(qs)
    local at=WoWAIMap and WoWAIMap.AdventureStatus and WoWAIMap.AdventureStatus()
    local activeID=at and old and old.route[at] and old.route[at].questID
    char.plan={id=id,t=time(),quests=qs,complete=complete,position=pos,route=route,order=order,missing=missing,stale=false,fingerprint=fingerprint}
    if old and old.fingerprint==fingerprint then
        char.plan.id=old.id;char.plan.ai=old.ai;char.plan.summary=old.summary;char.plan.order=old.order or order
        for _,q in ipairs(qs) do for _,prev in ipairs(old.quests) do if prev.id==q.id then
            q.reason=prev.reason;q.action=prev.action;q.region=prev.region;q.sourceURL=prev.sourceURL
            if old.ai and prev.waypoint then for _,w in ipairs(q.locations) do if w.key==prev.waypoint.key then q.waypoint=w end end end
        end end end
        J.ReorderRoute()
    end
    if WoWAIMap then WoWAIMap.StopAdventure(true) end
    if startNavigation==true and complete and #route>0 and WoWAIMap then WoWAIMap.SetAdventureRoute(route) end
    if activeID and complete then for i,r in ipairs(char.plan.route) do if r.questID==activeID then WoWAIMap.SetAdventureRoute(char.plan.route,i) end end end
    if navigationWanted and complete and #char.plan.route>0 and not activeID and WoWAIMap then WoWAIMap.SetAdventureRoute(char.plan.route) end
    J.Render()
    if not complete then Notify(L('任务分组可能折叠，任务列表不完整；请展开全部分组后刷新。'))
    end
end
function J.Fingerprint(qs)
    local rows={}
    for _,q in ipairs(qs) do local objectives={};for _,o in ipairs(q.objectives) do objectives[#objectives+1]={done=o.done,type=o.type,need=o.need} end;rows[#rows+1]={id=q.id,complete=q.complete,objectives=objectives,dungeon=q.dungeon==true} end
    table.sort(rows,function(a,b)return a.id<b.id end);return J.JSON(rows)
end
function J.ReorderRoute()
    local p=char.plan;local byID={};for _,q in ipairs(p.quests) do byID[q.id]=q end
    p.route={};p.missing={}
    local order={}
    for _,id in ipairs(p.order) do local q=byID[id];if q and not q.dungeon then local w=q.waypoint
        order[#order+1]=id
        if w then p.route[#p.route+1]={questID=id,m=w.m,x=w.x,y=w.y,source=w.source,label=(q.complete and L('交任务：') or L('完成：'))..q.title,kind=q.complete and 'turnin' or 'quest'}
        else p.missing[#p.missing+1]=id end
    end end
    p.order=order
end
function J.ToggleAutoPlan()
    if not char then return end
    char.autoPlan=not char.autoPlan
    autoDue=nil
    if char.autoPlan then
        Notify(L('自动重算已开启：仅后续任务变化时请求 AI；规划当前任务请点击“AI 规划当前任务”。'))
    else
        if pendingAI and pendingAI.snapshot and pendingAI.automatic then pendingAI=nil end
        Notify(L('已关闭自动规划。'))
    end
    J.Render()
end
function J.PackQuest(q)
    -- Keep all live objectives and metadata. Shared static coordinates travel as
    -- indices; native POIs remain exact inline coordinates and take precedence.
    if not WoWAIQuestCatalogVersion then return q end
    local packed={}
    for k,v in pairs(q) do if k~='locations' and k~='waypoint' and k~='reason' and k~='action' and k~='region' and k~='sourceURL' then packed[k]=v end end
    local sources,sourceIDs,points={},{},{}
    local entry=WoWAIQuestLocations and WoWAIQuestLocations[q.id]
    local rows=entry and entry[q.complete and 'turnin' or 'objective'] or {}
    for _,w in ipairs(q.locations or {}) do
        local source=w.source or ''
        if not sourceIDs[source] then sources[#sources+1]=source;sourceIDs[source]=#sources end
        local i=tonumber((w.key or ''):match('^db(%d+)$'));local row=i and rows[i]
        if row and row[1]==w.m and row[2]==w.x and row[3]==w.y and (row[4]>4)==(w.entrance==true) then points[#points+1]={i,sourceIDs[source]}
        else points[#points+1]={w.key,w.m,w.x,w.y,sourceIDs[source],w.entrance==true} end
    end
    packed.locationCatalog={version=WoWAIQuestCatalogVersion,points=points,sources=sources}
    -- A one-point or empty quest may be smaller in the legacy representation.
    local raw={};for k,v in pairs(packed) do if k~='locationCatalog' then raw[k]=v end end;raw.locations=q.locations or {}
    return #J.JSON(packed)<#J.JSON(raw) and packed or raw
end
function J.SendPlan(automatic,mapOnly)
    if not current or not char then Notify(L('请等待角色进入世界。'));return end
    if automatic==true and not char.autoPlan then return end
    if not db.enabled then Notify(L('请先开启冒险记录，以同步本次任务快照。'));return end
    if inFlight or pendingAI or draftFlight then
        Notify(J.PlanningStatus()~='' and J.PlanningStatus() or L('已有同步或规划正在进行，请等待完成。'));J.Render();return
    end
    local scoped=mapOnly==true or (automatic==true and char.plan and char.plan.scopeMap~=nil)
    J.Plan(false,true);local p=char.plan
    if not p or not p.complete then return end
    if scoped then p.scopeMap=p.position.map;if not p.scopeMap then Notify(L('当前地图暂不可用，请稍后重试。'));return end end
    if #J.PlanningQuests(p)==0 then planDue=nil;autoDue=nil;planNotice=nil;p.summary=L('当前地图没有可规划的任务，副本及其他地图任务已跳过。');J.Render();return end
    if #db.queue+#p.quests+3>=LIMIT then Notify(L('待同步缓冲不足，请先同步日志。'));return end
    p.id=Token();planDue=nil;autoDue=nil;planNotice=nil;nextAI=time()+30
    if scoped then J.LocalMapRoute(p) end
    local quests=J.PlanningQuests(p)
    local first=#db.queue+1
    J.Record('snapshot_begin',{snapshot=p.id,count=#quests,complete=p.complete,position=p.position,scopeMap=p.scopeMap,player=State()})
    for _,q in ipairs(quests) do J.Record('snapshot_quest',{snapshot=p.id,quest=J.PackQuest(q)}) end
    -- Coordinates already live on each quest; do not transmit a duplicate route.
    local e=J.Record('snapshot_end',{snapshot=p.id,count=#quests})
    if e then
        local wire,sequences={},{}
        for i=first,#db.queue do local r=db.queue[i];wire[#wire+1]=r;sequences[r.seq]=true end
        pendingAI={text='[WOWAI_PLAN:'..char.ledger..':'..p.id..']',seq=e.seq,started=time(),snapshot=p.id,automatic=automatic==true,wire=wire,sequences=sequences,received={}}
        cursor,part=1,1;Notify(L('正在同步任务，期间会显示彩色通信条；完整确认后才请求 AI，可点击“取消同步”。'));nextPoll=time()+6
    else p.error=L('任务快照未能建立，尚未发送给 AI；请刷新任务后重试。');Notify(p.error) end
    J.Render()
end
function J.CancelSync()
    if pendingAI and pendingAI.snapshot then autoDue=nil;planNotice=L('已取消本次规划同步，自动重算开关保持不变。') end
    if pendingAI and not pendingAI.snapshot then syncNotice=L('同步已取消；已确认记录不会重传，下次继续剩余记录。') end
    pendingAI=nil
    Notify(L('已取消日志同步，继续本地记录。'))
    if J.Render then J.Render() end
end
function J.UnsyncedCount(character)
    local n=0;local c=character or char
    for _,r in ipairs(db and db.queue or {}) do if c and r.ledger==c.ledger then n=n+1 end end
    return n
end
local function StartJournalSync(text)
    local wire={}
    for _,r in ipairs(db.queue) do if r.ledger==char.ledger and r.seq<=char.seq then wire[#wire+1]=r end end
    if #wire==0 and not text then syncNotice=L('没有新增日志需要同步。');Notify(syncNotice);J.Render();return end
    -- Freeze this batch. Observations made during transfer belong to the next click.
    pendingAI={text=text,seq=char.seq,started=time(),wire=wire,received={},ready=#wire==0}
    syncNotice=nil;nextPoll=time()+6
    Notify(L('仅同步尚未确认的日志；传输期间产生的新记录留待下次同步。'))
    J.Render()
end
function J.SyncLogs(character)
    if not current then return end
    if character and character~=char then Notify(L('请切换到当前角色进行日志同步。'));return end
    if pendingAI or inFlight or draftFlight then Notify(L('已有同步或规划正在进行，请等待完成。'));return end
    StartJournalSync()
end
function J.Review(session, character)
    if not current then return end
    if pendingAI or inFlight or draftFlight then Notify(L('已有同步或规划正在进行，请等待完成。'));return end
    if not db.enabled then Notify(L('请先恢复记录，再同步日志复盘。'));return end
    if character and character~=char then Notify(L('请切换到当前角色进行 AI 复盘。'));return end
    session=session or current.id
    local exists=false;for _,s in ipairs(char.sessions)do if s.id==session then exists=true end end
    if not exists then return end
    J.Record('heartbeat',State())
    StartJournalSync('[WOWAI_REVIEW:'..char.ledger..':'..session..']')
    Notify(L('正在同步日志，期间会显示彩色通信条；同步后开始 AI 复盘，可点击“取消同步”。'))
end
function J.TasksChanged()
    if not inFlight and not pendingAI and J.UpdateRegions() then
        if char.autoPlan then autoDue=time()+3 end
        J.Render();return
    end
    if char.plan then char.plan.stale=true end
    if WoWAIMap then WoWAIMap.StopAdventure(true) end
    planDue=time()+3
    if char.autoPlan then autoDue=planDue else planNotice=L('任务已变化，点击“AI 规划当前任务”重新安排路线。') end
end
function J.Draft(session,character)
    if not current or not char then return end
    if character and character~=char then Notify(L('请切换到当前角色整理冒险底稿。'));return end
    if pendingAI or inFlight or draftFlight then Notify(L('已有同步或规划正在进行，请等待完成。'));return end
    session=session or current.id
    J.Days(char)
    local exists=char.days[session]~=nil;for _,s in ipairs(char.sessions) do if s.id==session then exists=true end end
    if not exists then return end
    StartJournalSync('[WOWAI_DRAFT:'..char.ledger..':'..session..':'..char.seq..':'..WoWAILocale.Get()..']')
    pendingAI.draft={session=session,through=char.seq}
    char.draftError=nil;J.Render()
end
function J.DraftReply(reply)
    if not db or type(reply.draftRequest)~='table' then return false end
    local identity=reply.draftRequest;local owner
    for _,c in pairs(db.characters) do if c.ledger==identity.ledger then owner=c;break end end
    local flight=owner and owner.draftRequest
    if not flight or reply.id~=flight.requestID or identity.session~=flight.session or identity.through~=flight.through then return false end
    if reply.status=='working' then
        local progress=reply.draftProgress
        if type(progress)=='table' and (tonumber(progress.stamp) or 0)>(flight.progressStamp or 0) then
            flight.lastProgress=time();flight.progressStamp=tonumber(progress.stamp)
            flight.part=tonumber(progress.part);flight.total=tonumber(progress.total)
        end
        J.Render();return false
    end
    owner.draftRequest=nil;if owner==char then draftFlight=nil end
    local d=reply.draft
    if reply.status~='done' or type(d)~='table' or d.ledger~=owner.ledger or d.session~=flight.session or d.through~=flight.through or type(d.body)~='string' then
        owner.draftError=reply.text or L('冒险底稿整理失败，原始记录已保留。');J.Render();return false
    end
    owner.drafts=owner.drafts or {};owner.drafts[d.session]={title=Text(d.title),body=Text(d.body),file=d.file,through=d.through,created=time()}
    owner.draftError=nil;J.Render();return true
end
function J.PlanReply(reply)
    if not inFlight or (reply.id~=inFlight.requestID and reply.planSnapshot~=inFlight.snapshot) then return false end
    local request=inFlight;inFlight=nil
    local p=char.plan;local result=reply.plan
    if not p or p.stale or p.id~=request.snapshot or J.Fingerprint(J.Quests())~=request.fingerprint then
        J.TasksChanged()
        if not char.autoPlan then planNotice=L('规划期间任务已变化，旧结果未应用；请重新规划当前任务。') end
        J.Render();return false
    end
    if reply.status~='done' or type(result)~='table' or result.ledger~=char.ledger or result.snapshot~=p.id or type(result.steps)~='table' or #result.steps~=#J.PlanningQuests(p) then
        p.error=reply.text or L('AI 规划失败，请重试。');J.Render();return false
    end
    local byID,seen={},{};for _,q in ipairs(J.PlanningQuests(p)) do byID[q.id]=q end
    for _,step in ipairs(result.steps) do if not byID[step.questID] or byID[step.questID].dungeon or seen[step.questID] then p.error=L('任务规划包含已跳过的副本任务或数据不完整。');J.Render();return false end;seen[step.questID]=true end
    local at=WoWAIMap and WoWAIMap.AdventureStatus and WoWAIMap.AdventureStatus()
    p.order={};p.summary=result.summary;p.ai=true;p.localRoute=nil;p.error=nil;planNotice=nil
    for _,step in ipairs(result.steps) do
        local q=byID[step.questID];q.reason=step.reason;q.action=step.action;q.region=Text(step.region);q.sourceURL=step.sourceURL;q.waypoint=nil
        local w=step.waypoint
        if type(w)=='table' then for _,candidate in ipairs(q.locations or {}) do
            -- WoW Lua's tostring rounds doubles in outgoing JSON. Compare the
            -- observed candidate key/map and tiny numeric tolerance, then use
            -- the original local coordinates rather than values from the AI.
            if (not w.key or candidate.key==w.key) and candidate.m==w.m
                and type(w.x)=='number' and type(w.y)=='number'
                and math.abs(candidate.x-w.x)<=0.000001 and math.abs(candidate.y-w.y)<=0.000001
                and (not p.scopeMap or w.m==p.scopeMap) then q.waypoint=candidate;break end
        end end
        p.order[#p.order+1]=q.id
    end
    J.ReorderRoute()
    if p.scopeMap then J.BuildRegions();navigationWanted=true;J.UpdateRegions()
    elseif (at or navigationWanted) and WoWAIMap then WoWAIMap.SetAdventureRoute(p.route) end
    Notify(L('AI 路线已更新：')..#p.route..L(' 个已定位任务，')..#p.missing..L(' 个位置待确认。'));J.Render();return true
end
function J.ScanQuests(initial)
    local qs,complete=J.Quests();local nextCache={}
    for _,q in ipairs(qs) do
        nextCache[q.id]=q;local old=questCache[q.id]
        if not initial and old and J.JSON(old.objectives)~=J.JSON(q.objectives) then J.Record('quest_progress',{questID=q.id,title=q.title,objectives=q.objectives}) end
        if not initial and old and not old.complete and q.complete then J.Record('quest_ready',{questID=q.id,title=q.title});char.waypoints[q.id]=nil end
    end
    if complete then
        local old={};for _,q in pairs(questCache) do old[#old+1]=q end
        if not initial and J.Fingerprint(old)~=J.Fingerprint(qs) and (not char.plan or char.plan.fingerprint~=J.Fingerprint(qs)) then J.TasksChanged() end
        questCache=nextCache
    end
end
function J.RefreshLocations()
    if not inFlight and not pendingAI and J.UpdateRegions() then J.Render();return end
    local p=char and char.plan;if not p or p.stale then return end
    local qs,complete=J.Quests();if not complete then return end
    if J.Fingerprint(qs)~=p.fingerprint then J.TasksChanged();return end
    local old={};for _,q in ipairs(p.quests)do old[q.id]=q end
    for _,q in ipairs(qs)do
        local prior=old[q.id] and old[q.id].waypoint;local found=false
        for _,w in ipairs(q.locations)do if prior and w.m==prior.m and math.abs(w.x-prior.x)<0.05 and math.abs(w.y-prior.y)<0.05 then found=true end end
        if (not prior and #q.locations>0) or (prior and not found) then J.TasksChanged();return end
    end
end
local KIND_NAMES={session_start='上线',session_end='下线',interrupted='异常中断',ui_reload='界面重载',heartbeat='在线快照',pause='暂停记录',resume='恢复记录',gap='记录缺口',zone='区域变化',position='位置',quest_accept='接受任务',quest_progress='任务进度',quest_ready='任务可交付',quest_turnin='交付任务',quest_removed='任务移除',level='升级',xp='经验',money='金币',loot='拾取',equipment='装备',skill='专业技能',kill='击杀',death='死亡',resurrect='复活',boss='首领',achievement='成就',note='手动记录'}
-- Views consume this narrow API; observations and transport remain independent.
J.KindNames = setmetatable({}, {__index=function(_,key) return KIND_NAMES[key] and L(KIND_NAMES[key]) end})
function J.Context() return db, char, current, pendingAI end
function J.CanPlan() return pendingAI==nil and inFlight==nil and draftFlight==nil end
function J.DraftStatus()
    if draftFlight and draftFlight.part and draftFlight.total then return string.format(L('正在整理游记：第 %d / %d 段，已完成的段落会保留。'),draftFlight.part,draftFlight.total) end
    if draftFlight then return string.format(L('正在整理冒险底稿，已等待 %d 秒'),time()-draftFlight.started) end
    return char and char.draftError or ''
end
function J.PlanPhase()
    if pendingAI and pendingAI.snapshot then return 'syncing' end
    if inFlight then return 'planning' end
    return 'idle'
end
function J.NavigationWanted() return navigationWanted end
function J.NavigationStopped() navigationWanted=false end
function J.PlanningStatus()
    local fallback=char and char.plan and char.plan.localRoute and L('备用路线可先使用。')..' ' or ''
    if pendingAI and pendingAI.snapshot then
        if pendingAI.ready then return fallback..string.format(L('任务已送达桥接，等待 AI 通道空闲：%d 秒'),time()-pendingAI.started) end
        local received=0;for _ in pairs(pendingAI.received) do received=received+1 end
        local status=string.format(L('同步当前任务：%d/%d，已等待 %d 秒'),received,#pendingAI.wire,time()-pendingAI.started)
        if received==0 and time()-pendingAI.started>=15 then status=status..' '..L('桥接尚未确认收到，请检查桥接是否启动、游戏彩条是否可见。') end
        return fallback..status
    end
    if inFlight then return fallback..string.format(L('AI 正在规划路线，已等待 %d 秒'),time()-inFlight.started) end
    if draftFlight then return L('正在生成游记，完成后可规划任务。') end
    if pendingAI then return L('冒险日志正在同步，完成或取消同步后可规划任务。') end
    if autoDue and char.autoPlan then return L('任务已变化，等待合并更新') end
    return planNotice or (char and char.plan and (char.plan.error or (char.plan.ai and L('AI 规划已更新')))) or ''
end
function J.SyncStatus(character)
    if character and character~=char then return string.format(L('待同步：%d 条记录'),J.UnsyncedCount(character)) end
    if pendingAI and not pendingAI.snapshot then
        local n=0;for _ in pairs(pendingAI.received) do n=n+1 end
        return string.format(L('本次日志同步：%d/%d，已等待 %d 秒'),n,#pendingAI.wire,time()-pendingAI.started)
    end
    return (syncNotice and syncNotice..' ' or '')..string.format(L('待同步：%d 条记录'),J.UnsyncedCount())
end
function J.Render() if WoWAIAdventureUI then WoWAIAdventureUI.Render() end end
function J.Show(tab)
    if not char then Notify(L('等待进入游戏世界。'));return end
    if WoWAI.SelectTab then WoWAI.SelectTab(tab=='tasks' and 'tasks' or 'log') end
    if WoWAIAdventureUI then WoWAIAdventureUI.Show(tab or 'tasks') end
end
function J.ToggleRecording()
    if db.enabled then J.Record('pause',{reason=L('玩家暂停记录')});db.enabled=false
    else db.enabled=true;J.Record('resume',{reason=L('玩家恢复记录')});lastMoney=Try(GetMoney);lastXP=Try(UnitXP,'player') end
    J.Render()
end
function J.AddNote(text, milestone)
    text=Text(text)
    if text=='' then return end
    if not db.enabled then Notify(L('记录已暂停，请恢复记录后再记一笔。'));return end
    local event=J.Record('note',{text=text,milestone=milestone==true,position=J.Position()});J.Render()
    return event~=nil
end
function J.StartNavigation(id)
    local p=char and char.plan
    for _,q in ipairs(p and p.quests or {}) do if q.id==id and q.dungeon then Notify(L('副本任务已跳过，不加入导航。'));return false end end
    if not p or p.stale or not p.complete then Notify(L('请先刷新完整任务列表。'));return false end
    local index
    local route=J.NavigationRoute(p)
    for i,r in ipairs(route) do
        if r.members then for _,member in ipairs(r.members) do if member.questID==id and not member.done then index=index or i end end
        elseif r.questID==id then index=i end
    end
    if not index or not WoWAIMap then Notify(L('此任务缺少可靠坐标，无法导航。'));return false end
    navigationWanted=true
    WoWAIMap.SetAdventureRoute(route, index)
    J.Render();return true
end
local function CaptureLoginPosition()
    local pending=current and current.loginPending
    if not pending then return end
    if time()-pending.t>15 then current.loginPending=nil;return end
    local pos=J.Position()
    if pos.zone=='' then return end
    pos.loginFor=pending.seq
    if J.Record('zone',pos) then current.loginPending=nil end
end
local function CheckLife()
    local dead=DeadState()
    if dead==true then current.deathPending=true
    elseif dead==false and current.deathPending then
        local pos=J.Position();pos.confirmed=true;pos.source='observed_dead_to_alive'
        J.Record('resurrect',pos);current.deathPending=nil;current.deathEventRecorded=nil
    end
end
function J.Begin(isReload)
    if not db then return end
    local key=(Try(UnitGUID,'player') or '')..':'..(Try(GetRealmName) or '')..':'..(Try(UnitName,'player') or '')
    if key=='::' then return end
    char=db.characters[key]
    if not char then char={ledger=Token(),name=(Try(UnitName,'player') or '?')..' - '..(Try(GetRealmName) or '?'),seq=0,acked=0,recent={},sessions={},waypoints={}};db.characters[key]=char end
    J.Days(char)
    -- Pause applies to this login only. Reload preserves the user's pause.
    if not isReload then db.enabled=true end
    draftFlight=char.draftRequest
    -- Old versions implicitly enabled this preference on a manual click. Require a
    -- fresh explicit opt-in once; preserve all later choices across reloads.
    if not char.independentPlanning then char.autoPlanBeforeIndependent=char.autoPlan;char.autoPlan=false;char.independentPlanning=true end
    local old=char.sessions[#char.sessions]
    if isReload and old and not old.closed then current=old;J.Record('ui_reload',{reason=L('重新加载界面')})
    else
        if old and not old.closed then current=old;J.Record('interrupted',{lastObserved=old.last,reason=L('上次未收到正常下线事件')});old.closed=true;old.interrupted=true end
        current={id=Token(),start=time(),last=time(),closed=false};char.sessions[#char.sessions+1]=current
        local start=J.Record('session_start',State())
        if start and start.data.position.zone=='' then current.loginPending={seq=start.seq,t=start.t} end
    end
    current.deathPending=DeadState()==true or nil
    lastMoney,lastXP,lastXPMax,lastLevel=Try(GetMoney),Try(UnitXP,'player'),Try(UnitXPMax,'player'),Try(UnitLevel,'player')
    J.Record('zone',J.Position());J.ScanQuests(true)
    equipmentCache={};for slot=1,19 do equipmentCache[slot]=Try(GetInventoryItemLink,'player',slot) end
    J.Ack(WoWAI_Inbox and WoWAI_Inbox.adventureAck)
    for _,reply in ipairs(WoWAI_Inbox and WoWAI_Inbox.replies or {}) do J.DraftReply(reply) end
    local previousFingerprint=char.plan and char.plan.fingerprint
    if char.plan then J.Plan(false) end
    if char.autoPlan and previousFingerprint and char.plan.fingerprint~=previousFingerprint then autoDue=time()+5 end
    J.Render()
end
function J.Tick()
    if not current then return end
    CaptureLoginPosition();CheckLife()
    if time()>=nextHeartbeat then nextHeartbeat=time()+30;J.Record('heartbeat',State()) end
    if time()>=nextSample then nextSample=time()+60;J.Record('position',J.Position()) end
    if pendingAI and #db.queue>0 and time()>=nextPoll and WoWAI.PollAdventure then nextPoll=time()+6;WoWAI.PollAdventure() end
    if pendingAI then
        if pendingAI.snapshot and (not char.plan or char.plan.id~=pendingAI.snapshot or char.plan.stale) then pendingAI=nil;J.TasksChanged()
        elseif time()-pendingAI.started>240 then
            if pendingAI.snapshot then
                if char.plan then char.plan.error=L('同步未完成，请检查桥接连接后重试。') end
                Notify(L('同步未完成，尚未请求 AI。请检查桥接程序后重试。'))
            else syncNotice=L('同步超时；已确认记录已保留，下次仅补传剩余记录。');Notify(syncNotice) end
            pendingAI=nil
        elseif (pendingAI.ready or (char.acked or 0)>=pendingAI.seq) and (not pendingAI.text or WoWAI.AdventureCanSend()) then
            local request=pendingAI
            if request.snapshot then
                local id
                if WoWAI.SendAdventurePlan then id=WoWAI.SendAdventurePlan(request.text) else WoWAI.Send(request.text);id=true end
                if id then pendingAI=nil;inFlight={snapshot=request.snapshot,requestID=id,started=time(),fingerprint=char.plan.fingerprint,automatic=request.automatic} end
            elseif request.draft then
                local id=WoWAI.SendAdventureDraft and WoWAI.SendAdventureDraft(request.text)
                if id then
                    draftFlight={session=request.draft.session,through=request.draft.through,requestID=id,started=time()}
                    char.draftRequest=draftFlight;pendingAI=nil
                end
            else
                if not request.text then
                    pendingAI=nil;syncNotice=string.format(L('本次同步完成：%d 条记录。'),#request.wire);Notify(syncNotice)
                else
                    if WoWAI.SelectTab then WoWAI.SelectTab('chat') end
                    local id=WoWAI.Send(request.text)
                    if id~=nil and id~=false then pendingAI=nil;syncNotice=string.format(L('本次同步完成：%d 条记录。'),#request.wire) end
                end
            end
        end
    end
    if inFlight and time()-inFlight.started>600 then inFlight=nil;char.plan.error=L('AI 响应超时，请重试。') end
    if draftFlight and time()-(draftFlight.lastProgress or draftFlight.started)>600 then draftFlight=nil;char.draftRequest=nil;char.draftError=L('冒险底稿整理超时，原始记录已保留。') end
    if planDue and time()>=planDue then
        if not pendingAI then
            if not char.plan or char.plan.stale then J.Plan(false) end
            planDue=nil
        end
    end
    if autoDue and time()>=autoDue and time()>=nextAI and char.autoPlan and db.enabled and not pendingAI and not inFlight and not draftFlight then
        autoDue=nil;J.SendPlan(true)
    end
    J.Render()
end
function J.Event(event,...)
    if event=='ADDON_LOADED' then
        if ...~=ADDON_NAME then return end
        WoWAIAdventureDB=WoWAIAdventureDB or {enabled=true,characters={},queue={},adventureExport={}}
        db=WoWAIAdventureDB
        if hooksecurefunc then hooksecurefunc('ReloadUI',function()reloadRequested=true end) end
        C_Timer.NewTicker(3,J.Tick)
        return
    elseif event=='PLAYER_ENTERING_WORLD' then
        local initial,reloading=...
        if not current then J.Begin(reloading==true) end
        return
    end
    if not current then return end
    local a,b,c,d=...
    if event=='PLAYER_LOGOUT' then
        if reloadRequested then J.Record('ui_reload',{reason=L('准备重新加载')},true) else J.Record('session_end',State(),true);current.closed=true;current.ended=time() end
    elseif event=='ZONE_CHANGED_NEW_AREA' or event=='ZONE_CHANGED' or event=='ZONE_CHANGED_INDOORS' then CaptureLoginPosition();J.Record('zone',J.Position())
    elseif event=='QUEST_LOG_UPDATE' then J.ScanQuests(false)
    elseif event=='QUEST_POI_UPDATE' then J.RefreshLocations()
    elseif event=='QUEST_ACCEPTED' or event=='QUEST_TURNED_IN' or event=='QUEST_REMOVED' then
        local id=event=='QUEST_ACCEPTED' and (type(b)=='number' and b or a) or a
        if event=='QUEST_TURNED_IN' and char.plan and char.plan.regions then char.plan.turnedIn[id]=true end
        local q=questCache[id];local title=q and q.title or Try(C_QuestLog and C_QuestLog.GetTitleForQuestID,id)
        local kind=event=='QUEST_ACCEPTED' and 'quest_accept' or event=='QUEST_TURNED_IN' and 'quest_turnin' or 'quest_removed'
        J.Record(kind,{questID=id,title=title,xp=event=='QUEST_TURNED_IN' and b or nil,money=event=='QUEST_TURNED_IN' and c or nil})
        J.TasksChanged()
        if event~='QUEST_ACCEPTED' then char.waypoints[id]=nil end
    elseif event=='PLAYER_LEVEL_UP' then J.Record('level',{level=a});lastLevel=a
    elseif event=='PLAYER_XP_UPDATE' and a=='player' then
        local xp=Try(UnitXP,'player');local max=Try(UnitXPMax,'player')
        if xp and lastXP then local delta=xp-lastXP;if delta<0 then delta=(lastXPMax or lastXP)-lastXP+xp end;if delta>0 then J.Record('xp',{delta=delta,xp=xp,xpMax=max}) end end
        lastXP,lastXPMax=xp,max
    elseif event=='PLAYER_MONEY' then local m=Try(GetMoney);if m and lastMoney and m~=lastMoney then J.Record('money',{delta=m-lastMoney,balance=m})end;lastMoney=m
    elseif event=='PLAYER_DEAD' then
        if not current.deathEventRecorded then J.Record('death',J.Position());current.deathEventRecorded=true end
        current.deathPending=true
    elseif event=='PLAYER_ALIVE' or event=='PLAYER_UNGHOST' then CheckLife()
    elseif event=='CHAT_MSG_LOOT' then
        -- Loot messages may describe another player. Match the localised SELF formats only.
        local selfLoot=false
        for _,fmt in ipairs({LOOT_ITEM_SELF or '',LOOT_ITEM_SELF_MULTIPLE or '',LOOT_ITEM_CREATED_SELF or '',LOOT_ITEM_CREATED_SELF_MULTIPLE or ''}) do
            if fmt~='' then local prefix=fmt:match('^(.-)%%s');if prefix and a:sub(1,#prefix)==prefix then selfLoot=true end end
        end
        if selfLoot then
            local link=a:match('(|Hitem:.-|h.-|h)');local id=tonumber(a:match('item:(%d+)'))
            local name,_,quality=Try((C_Item and C_Item.GetItemInfo) or GetItemInfo,id)
            local displayName=a:match('|h%[(.-)%]|h')
            local count=tonumber(a:match('|h|r?%s*[x×]%s*(%d+)')) or tonumber(a:match('[x×](%d+)[。%.]?$')) or 1
            J.Record('loot',{itemID=id,name=name or displayName or Text(a),count=count,quality=quality,text=Text(a),link=link,position=J.Position()})
        end
    elseif event=='PLAYER_EQUIPMENT_CHANGED' then local link=Try(GetInventoryItemLink,'player',a);J.Record('equipment',{slot=a,before=equipmentCache[a],after=link});equipmentCache[a]=link
    elseif event=='SKILL_LINES_CHANGED' then if WoWAI.SkillLines then J.Record('skill',{skills=WoWAI.SkillLines()})end
    elseif event=='ENCOUNTER_END' then local _,name,_,_,success=...;J.Record('boss',{id=a,name=name,success=success==1})
    elseif event=='ACHIEVEMENT_EARNED' then local _,name=Try(GetAchievementInfo,a);J.Record('achievement',{id=a,name=name}) end
end
local journalFrame=CreateFrame('Frame')
-- Forever restricts combat-log event registration itself; pcall cannot prevent
-- ADDON_ACTION_FORBIDDEN. Never subscribe to either combat-log event here.
for _,name in ipairs({'ADDON_LOADED','PLAYER_ENTERING_WORLD','PLAYER_LOGOUT','ZONE_CHANGED','ZONE_CHANGED_INDOORS','ZONE_CHANGED_NEW_AREA','QUEST_LOG_UPDATE','QUEST_POI_UPDATE','QUEST_ACCEPTED','QUEST_TURNED_IN','QUEST_REMOVED','PLAYER_LEVEL_UP','PLAYER_XP_UPDATE','PLAYER_MONEY','PLAYER_DEAD','PLAYER_ALIVE','PLAYER_UNGHOST','CHAT_MSG_LOOT','PLAYER_EQUIPMENT_CHANGED','SKILL_LINES_CHANGED','ENCOUNTER_END','ACHIEVEMENT_EARNED'}) do pcall(journalFrame.RegisterEvent,journalFrame,name) end
journalFrame:SetScript('OnEvent',function(_,event,...)J.Event(event,...)end)
SLASH_WOWAIADVENTURE1='/aiplan';SLASH_WOWAIJOURNAL1='/ailog';SLASH_WOWAIMILESTONE1='/aimilestone'
SlashCmdList.WOWAIADVENTURE=function()J.Show('tasks');J.Plan(false)end
SlashCmdList.WOWAIJOURNAL=function()J.Show('log')end
SlashCmdList.WOWAIMILESTONE=function(msg)if msg and msg~='' then J.Record('note',{text=Text(msg),milestone=true})end;J.Show('milestones')end
