-- Original state-driven accept -> objective -> turn-in guide. No AI on render.
local O={};WoWAIQuestOffers=O
local J,L=WoWAIAdventure,WoWAILocale.Text
local function Try(fn,...) if type(fn)=='function' then local ok,a,b,c=pcall(fn,...);if ok then return a,b,c end end end
local function Has(mask,bit) return math.floor(mask/bit)%2==1 end
local function Name(names) return names and (names[WoWAILocale.Get()] or names.enUS) or '?' end
local races={Human=1,Orc=2,Dwarf=3,NightElf=4,Scourge=5,Tauren=6,Gnome=7,Troll=8,Goblin=9,BloodElf=10,Draenei=11}
local classes={WARRIOR=1,PALADIN=2,HUNTER=3,ROGUE=4,PRIEST=5,DEATHKNIGHT=6,SHAMAN=7,MAGE=8,WARLOCK=9,MONK=10,DRUID=11}
local function Membership()
    -- Availability only needs IDs. Do not rescan map POIs for every held quest on render.
    local shown,count=Try(C_QuestLog and C_QuestLog.GetNumQuestLogEntries)
    if not shown then shown,count=Try(GetNumQuestLogEntries) end
    if not shown then return {},false end
    local active,n={},0
    for i=1,shown do
        local info=Try(C_QuestLog and C_QuestLog.GetInfo,i)
        if not info and type(GetQuestLogTitle)=='function' then
            local row={pcall(GetQuestLogTitle,i)};if row[1] then info={isHeader=row[5],questID=row[9]} end
        end
        if info and not info.isHeader and info.questID and info.questID>0 then active[info.questID]=true;n=n+1 end
    end
    return active,count==nil or n==count
end
function O.State()
    local active,complete=Membership();local _,char=J.Context();local _,race,raceID=Try(UnitRace,'player');local _,class,classID=Try(UnitClass,'player')
    local s={active=active,level=Try(UnitLevel,'player') or 0,race=raceID or races[race],class=classID or classes[class],faction=Try(UnitFactionGroup,'player'),position=J.Position(),complete=complete,done={},skills={}}
    s.raceToken=race=='Scourge' and 'Undead' or race;s.classToken=class
    local version=Try(GetBuildInfo);s.supported=type(version)=='string' and version:match('^1%.60%.')~=nil
    local completed={};local available=type(GetQuestsCompleted)=='function';if available then local ok=pcall(GetQuestsCompleted,completed);available=ok end
    s.history=type(C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted)=='function' or available
    function s.finished(id)
        if s.done[id]~=nil then return s.done[id] end
        local value=Try(C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted,id)
        if value==nil and available then value=completed[id]==true or completed[id]==1 end
        if char and char.plan and char.plan.turnedIn and char.plan.turnedIn[id] then value=true end
        s.done[id]=value;return value
    end
    function s.reputation(id)
        local row=Try(C_Reputation and C_Reputation.GetFactionDataByID,id)
        if row then return row.currentStanding end
        if type(GetFactionInfoByID)=='function' then local ok,_,_,_,_,_,value=pcall(GetFactionInfoByID,id);if ok then return value end end
    end
    if type(GetProfessions)=='function' and type(GetProfessionInfo)=='function' then
        local slots={pcall(GetProfessions)}
        if slots[1] then for i=2,7 do if type(slots[i])=='number' then
            local values={pcall(GetProfessionInfo,slots[i])}
            if values[1] and type(values[8])=='number' then s.skills[values[8]]=values[4] end
        end end end
    end
    return s
end
local function RaceAllowed(mask,s)
    if mask==0 then return true end
    if s.race and s.race<=32 then return Has(mask,2^(s.race-1)) end
    local bits=s.faction=='Alliance' and {1,4,8,64} or s.faction=='Horde' and {2,16,32,128}
    if not bits then return false end
    for _,bit in ipairs(bits) do if not Has(mask,bit) then return false end end;return true
end
function O.Eligible(id,q,s)
    if q.gatesUnverified then return false end
    if not s.complete or not s.history or s.active[id] or s.finished(id)~=false then return false end
    if s.level<q.min or q.level>s.level+3 or (not s.allowTrivial and q.level>0 and q.level<s.level-6) then return false end
    if not RaceAllowed(q.races,s) or (q.classes~=0 and (not s.class or not Has(q.classes,2^(s.class-1)))) then return false end
    if Has(q.category,1) or Has(q.category,2) or Has(q.flags,1) or Has(q.flags,4) or q.holiday then return false end
    if q.parent and not s.active[q.parent] then return false end
    if q.chain and (s.active[q.chain] or s.finished(q.chain)~=false) then return false end
    for _,other in pairs(q.excl or {}) do if s.active[other] or s.finished(other)~=false then return false end end
    if q.pre then local met=false;for _,other in pairs(q.pre) do if s.finished(other)==true then met=true end end;if not met then return false end end
    for _,other in pairs(q.preAll or {}) do if s.finished(other)~=true then return false end end
    if q.skill then local skill=math.floor(q.skill/10000);if not s.skills[skill] or s.skills[skill]<q.skill%10000 then return false end end
    for _,field in ipairs({'minRep','maxRep'}) do if q[field] then local rep=s.reputation(math.floor(q[field]/1000000));local need=q[field]%1000000;if not rep or (field=='minRep' and rep<need) or (field=='maxRep' and rep>need) then return false end end end
    return true
end
function O.List(state)
    local s=state or O.State();local data=WoWAIQuestOffersData;local out={}
    if not data or not s.supported or not s.position.map then return out,s end
    for _,id in ipairs(data.maps[s.position.map] or {}) do
        local q=data.quests[id]
        if O.Eligible(id,q,s) then
            -- A local giver can offer a journey to another zone. Keep it out of this-map guidance.
            local ref=WoWAIQuestLocations and WoWAIQuestLocations[id];local destinations=ref and (ref.objective or ref.turnin)
            local localGoal=not destinations or #destinations==0
            for _,p in ipairs(destinations or {}) do if p[1]==s.position.map and p[4]<=4 then localGoal=true end end
            local best,distance
            for _,p in ipairs(q.start) do if p[1]==s.position.map and (p[4]==1 or p[4]==2) then
                local actual=Try(C_Map and C_Map.GetMapInfoAtPosition,p[1],p[2]/100,p[3]/100)
                local inZone=not actual or actual.mapType~=3 or actual.mapID==p[1]
                local d=(p[2]-(s.position.x or 50))^2+(p[3]-(s.position.y or 50))^2
                if inZone and (not distance or d<distance) then best=p;distance=d end
            end end
            if best and localGoal then out[#out+1]={id=id,title=Name(q.name),q=q,point=best,distance=distance,giver=Name(data.people[best[4]..':'..best[5]]),knownGoal=destinations and #destinations>0} end
        end
    end
    table.sort(out,function(a,b)if a.distance==b.distance then return a.id<b.id end;return a.distance<b.distance end)
    return out,s
end
function O.Lines(offer,list)
    if not offer then return {L('本地图暂无符合条件的接取建议。')} end
    local p,q=offer.point,offer.q
    local lines={L('下一步：先接任务'),string.format(L('前往 %s · (%.1f, %.1f)'),offer.giver,p[2],p[3]),string.format(L('接取：%s（%d 级可接）'),offer.title,q.min)}
    for _,other in ipairs(list or {}) do if other.id~=offer.id and other.point[4]==p[4] and other.point[5]==p[5] and (other.point[2]-p[2])^2+(other.point[3]-p[3])^2<=1 then lines[#lines+1]=string.format(L('一起接：%s（%d 级可接）'),other.title,other.q.min) end end
    local data=WoWAIQuestOffersData
    for _,field in ipairs({'pre','preAll'}) do for _,id in pairs(q[field] or {}) do local prev=data.quests[id];lines[#lines+1]=L('已满足前置：')..(prev and Name(prev.name) or tostring(id)) end end
    if q.parent then local parent=data.quests[q.parent];lines[#lines+1]=L('需保留任务：')..(parent and Name(parent.name) or tostring(q.parent)) end
    lines[#lines+1]=offer.knownGoal and L('接取后按目标逐步指引；完成后切换到交付位置。') or L('接取后读取任务目标，再确认完成地点。')
    return lines
end
function O.Navigate(id)
    local list=O.List();for _,offer in ipairs(list) do if offer.id==id then
        local _,char=J.Context();if char then char.questGuide={id=id,stage='accept',giver=offer.point,collect=true} end
        O.navigating=true;WoWAIMap.SetQuestPickup(offer.point,L('接任务：')..offer.title,table.concat(O.Lines(offer,list),'\n'));O.navigating=false;return true
    end end
    return false
end
function O.Accepted(id)
    local _,char=J.Context();local guide=char and char.questGuide
    if guide and guide.id==id then guide.stage='objective';guide.signature=nil end
end
function O.Stop()
    if O.navigating then return end
    local _,char=J.Context();if char then char.questGuide=nil end
    if WoWAIMap.ClearQuestPickup then WoWAIMap.ClearQuestPickup() end
end
function O.Tick()
    local _,char=J.Context();local guide=char and char.questGuide
    if not guide then if WoWAIMap.HasQuestPickup and WoWAIMap.HasQuestPickup() then WoWAIMap.ClearQuestPickup() end;return end
    local qs,complete=J.Quests();if not complete then return end
    local q;for _,row in ipairs(qs) do if row.id==guide.id then q=row;break end end
    if guide.stage=='accept' and not q then return end
    if not q then
        local offers,state=O.List()
        local finished=state.finished(guide.id)==true
        local previous=guide.id;O.Stop()
        if finished then for _,offer in ipairs(offers) do
            local follows=false;for _,key in ipairs({'pre','preAll'}) do for _,id in pairs(offer.q[key] or {}) do if id==previous then follows=true end end end
            if follows then O.Navigate(offer.id);break end
        end end
        return
    end
    if guide.collect and guide.giver then
        local p=guide.giver
        for _,offer in ipairs(O.List()) do local w=offer.point
            if w[1]==p[1] and w[4]==p[4] and w[5]==p[5] and (w[2]-p[2])^2+(w[3]-p[3])^2<=1 then O.Navigate(offer.id);return end
        end
        guide.collect=nil
    end
    guide.stage=q.complete and 'turnin' or 'objective'
    local pos=J.Position();local w
    for _,point in ipairs(q.locations or {}) do if point.m==pos.map then w=point;break end end
    local title=(q.complete and L('交任务：') or L('完成：'))..q.title
    local lines={title}
    if q.complete then lines[#lines+1]=L('与交付 NPC 交谈，交付这项已完成的任务。')
    else for _,objective in ipairs(q.objectives or {}) do if not objective.done then lines[#lines+1]='• '..objective.text end end end
    if not w then
        if WoWAIMap.ClearQuestPickup then O.navigating=true;WoWAIMap.ClearQuestPickup();O.navigating=false end
        guide.signature=nil;return
    end
    local detail=table.concat(lines,'\n');local signature=title..detail..w.m..':'..w.x..':'..w.y
    if signature~=guide.signature then
        guide.signature=signature;O.navigating=true
        WoWAIMap.SetQuestPickup({w.m,w.x,w.y},title,detail);O.navigating=false
    end
end
