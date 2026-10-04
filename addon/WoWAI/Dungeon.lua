local L = WoWAILocale.Text
-- Dungeon state uses ordinary quest/unit events, never the restricted combat log.
local D={seen={},turnedIn={},rows={},counts={},enabled=true}
WoWAIDungeon=D
local Read=WoWAIGear.Read
local function Has(mask,id) return mask==0 or (id and math.floor(mask/2^(id-1))%2==1) end
local function EqualAny(value,list)for _,v in ipairs(list or {})do if WoWAILocale.SameName(v,value) then return true end end return false end
function D.Settings()
    WoWAIDungeonDB=WoWAIDungeonDB or {version=1,alerts=true}
    return WoWAIDungeonDB
end
function D.Completed(id)
    if D.turnedIn[id] then return true end
    local done=Read(C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted or IsQuestFlaggedCompleted,id)
    if type(done)=='boolean' then return done end
    if D.completedKnown then return D.completed[id]==true or D.completed[id]==1 end
end
function D.QuestFaction(q)
    if q.faction=='alliance' or q.faction=='horde' or q.faction=='both' or q.faction=='unknown' then return q.faction end
    -- Compatibility for runtime/older records: absence is not the same as an unrestricted mask.
    if not q.gatesKnown or type(q.races)~='number' then return 'unknown' end
    if q.races==0 then return 'both' end
    local a,h=false,false
    for _,id in ipairs({1,3,4,7,11})do a=a or Has(q.races,id)end
    for _,id in ipairs({2,5,6,8,9,10})do h=h or Has(q.races,id)end
    return a and h and 'both' or a and 'alliance' or h and 'horde' or 'unknown'
end
function D.PlayerFaction()
    local factionToken=Read(UnitFactionGroup,'player');factionToken=type(factionToken)=='string' and factionToken:lower() or nil
    return (factionToken=='alliance' or factionToken=='horde') and factionToken or nil
end
function D.Eligibility(q,active)
    local p=WoWAIGear.Profile();local faction=D.PlayerFaction();local side=D.QuestFaction(q)
    if side=='unknown' then return 'unknown',L('任务阵营尚未核实') end
    if side~='both' and not faction then return 'unknown',L('阵营尚未读取') end
    if side~='both' and side~=faction then return 'unavailable',L('阵营不符') end
    if not q.gatesKnown then return 'unknown',L('接取条件资料不完整') end
    if not p.classID then return 'unknown',L('职业尚未读取') end
    if not Has(q.classes or 0,p.classID) then return 'unavailable',L('职业不符') end
    local _,_,raceID=Read(UnitRace,'player')
    if (q.races or 0)~=0 then
        if not raceID then return 'unknown',L('种族条件尚未确认') end
        if not Has(q.races,raceID)then return 'unavailable',L('种族不符') end
    end
    if p.level<(q.minLevel or 0) then return 'unavailable',L('需要 ')..q.minLevel..L(' 级') end
    local known=D.Completed(q.id)
    if known==nil then return 'unknown',L('已完成任务状态尚未读取') end
    if known and not q.repeatable then return 'done',L('已交付') end
    if q.pre then
        local found,unknown=false,false
        for _,id in ipairs(q.pre)do local v=D.Completed(id);found=found or v==true;unknown=unknown or v==nil end
        if not found then return unknown and 'unknown' or 'unavailable',unknown and L('前置完成状态待确认') or L('前置任务未完成') end
    end
    for _,id in ipairs(q.preAll or {})do local v=D.Completed(id);if not v then return v==nil and 'unknown' or 'unavailable',L('需要完成全部前置任务') end end
    if q.parent and not active[q.parent] then return 'unavailable',L('需要先接取前置任务') end
    for _,id in ipairs(q.excl or {})do
        local v=D.Completed(id);if active[id] or v then return 'unavailable',L('已选择其他任务分支') end
        if v==nil then return 'unknown',L('分支完成状态待确认') end
    end
    if q.chain then local v=D.Completed(q.chain);if active[q.chain] or v then return 'done',L('已进入后续任务') elseif v==nil then return 'unknown',L('后续任务状态待确认') end end
    -- These gates must not be assumed satisfied just because the player meets the level.
    if q.skill or q.minRep or q.maxRep then return 'unknown',L('需核对专业或声望条件') end
    if q.inside or q.itemStart then return 'inside',q.itemStart and L('副本物品触发，取得后接取') or L('在副本内接取') end
    return 'missing',L('可接，尚未接取')
end
function D.Match(name,mapID)
    for _,d in ipairs(WoWAIDungeonData and WoWAIDungeonData.dungeons or {})do
        if (d.mapID and mapID==d.mapID) or EqualAny(name,d.aliases) then return d end
    end
end
function D.Notify() if WoWAIDungeonUI then WoWAIDungeonUI.Render() end end
-- minLevel is the requiredLevel from Forever quest gates, never the quest's difficulty level.
function D.AcceptLevel(q)
    local n=q.minLevel
    if type(n)=='number' and n>=1 and n==math.floor(n) then return n end
end
function D.LevelText(q)
    local n=D.AcceptLevel(q)
    if not n then return L('最低接取等级：待核实') end
    local text=string.format(L('最低接取等级：%d 级'),n)
    local level=WoWAIGear.Profile().level
    if type(level)=='number' and level>0 and level<n then text=text..string.format(L('（还差 %d 级）'),n-level)end
    return text
end
-- Reuse the faction-filtered checklist, but do not discard higher-level quests.
-- Completed quests and incompatible/selected branches must not raise this character's target.
function D.Preparation(dungeon,rows,counts)
    local p=WoWAIGear.Profile();local _,_,raceID=Read(UnitRace,'player')
    local active={};for _,r in ipairs(rows)do if r.live then active[r.quest.id]=true end end
    local a={level=0,known=0,unknown=(counts and counts.factionUnknown)or 0,remaining=0,inside=0,prerequisites=0,conditions=0,limiters={}}
    for _,r in ipairs(rows)do
        local q=r.quest;local include=r.status~='done' and r.status~='ready' and not q.outside
        if p.classID and not Has(q.classes or 0,p.classID)then include=false end
        if raceID and not Has(q.races or 0,raceID)then include=false end
        for _,id in ipairs(q.excl or {})do if active[id] or D.Completed(id)==true then include=false end end
        if q.chain and (active[q.chain] or D.Completed(q.chain)==true)then include=false end
        if include then
            a.remaining=a.remaining+1
            local n=D.AcceptLevel(q)
            local identityKnown=p.classID and ((q.races or 0)==0 or raceID) and r.faction~='unknown'
            if n and identityKnown then
                a.known=a.known+1
                if n>a.level then a.level=n;a.limiters={}end
                if n==a.level then a.limiters[#a.limiters+1]=r.live and r.live.title or WoWAILocale.Field(q)end
            else a.unknown=a.unknown+1 end
            if q.inside or q.itemStart then a.inside=a.inside+1 end
            if q.pre or q.preAll or q.parent or (q.prerequisites and q.prerequisites~='') or #(q.steps or {})>0 then a.prerequisites=a.prerequisites+1 end
            if not q.gatesKnown or q.skill or q.minRep or q.maxRep then a.conditions=a.conditions+1 end
        end
    end
    local lines={}
    if a.level>0 then
        lines[#lines+1]=string.format(L('建议至少 %d 级，再集中处理本角色剩余的已知副本任务。'),a.level)
        if type(p.level)=='number' and p.level>0 then
            lines[#lines+1]=p.level<a.level and string.format(L('当前 %d 级，还差 %d 级；现在进本可能漏掉高等级任务。'),p.level,a.level-p.level) or L('已达到上述等级门槛；进本前仍请检查漏接和前置任务。')
        end
        lines[#lines+1]=L('最高接取等级任务：')..table.concat(a.limiters,L('、'))
    elseif dungeon and #(dungeon.quests or {})>0 and a.remaining==0 and a.unknown==0 then
        lines[#lines+1]=L('当前没有需要补接的已收录适用任务。')
    else
        lines[#lines+1]=L('接取等级资料不足，暂不能给出集中清任务的建议等级。')
    end
    if a.unknown>0 then lines[#lines+1]=string.format(L('另有 %d 项等级或适用条件待核实，不能确认接齐所需等级。'),a.unknown)end
    if a.prerequisites>0 then lines[#lines+1]=L('先完成下方前置链；前置可能另有等级要求，或需要先下一次副本。')end
    if a.inside>0 then lines[#lines+1]=string.format(L('%d 项在副本内或由物品触发，不能要求进本前全部接好。'),a.inside)end
    if a.conditions>0 then lines[#lines+1]=L('部分任务还需核对职业、专业、声望等接取条件。')end
    lines[#lines+1]=L('仅按已收录任务的接取等级推算，不是战斗等级建议，也不保证一趟完成全部任务。')
    a.text=table.concat(lines,'\n');return a
end
-- The same character check powers preparation outside and reminders inside.
-- It does not change the actual instance, boss detection or floating notices.
function D.Check(dungeon,name)
    name=name or (dungeon and dungeon.name)
    local qs,complete=WoWAIAdventure.Quests();local active={};for _,q in ipairs(qs)do active[q.id]=q end
    D.completed={};D.completedKnown=false
    if GetQuestsCompleted then local ok=pcall(GetQuestsCompleted,D.completed);D.completedKnown=ok and next(D.completed)~=nil end
    local rows,counts={}, {active=0,ready=0,missing=0,inside=0,unknown=0,done=0,unavailable=0,factionUnknown=0,oppositeHidden=0}
    local faction=D.PlayerFaction();local catalogued={}
    local catalog={};for _,q in ipairs(dungeon and dungeon.quests or {})do catalog[#catalog+1]=q end
    local function add(q)
        local live=active[q.id];local status,reason
        local side=D.QuestFaction(q)
        if side~='both' and side~='unknown' and faction and side~=faction then counts.oppositeHidden=counts.oppositeHidden+1;return end
        if (side=='unknown' or (side~='both' and not faction)) and not live then counts.factionUnknown=counts.factionUnknown+1;return end
        if live then status=live.complete and 'ready' or 'active';reason=live.complete and L('目标完成，可交付') or L('进行中')
        elseif not complete then status,reason='unknown',L('任务列表正在读取')
        elseif D.Completed(q.id) and not q.repeatable then status,reason='done',L('已交付')
        else status,reason=D.Eligibility(q,active) end
        -- Item/in-instance sources are not outside missing quests, even if their gates are undocumented.
        if status=='unknown' and (q.inside or q.itemStart) then status,reason='inside',L('副本内或物品触发；接取条件待确认') end
        counts[status]=counts[status]+1
        rows[#rows+1]={quest=q,live=live,status=status,reason=reason,faction=side}
    end
    for _,q in ipairs(catalog)do catalogued[q.id]=true;add(q)end
    -- Unknown dungeons can still display the player's tasks only when their header matches this instance.
    for _,q in ipairs(qs)do
        if q.dungeon and q.area and (q.area==name or (dungeon and EqualAny(q.area,dungeon.aliases))) then
            if not catalogued[q.id] then add({id=q.id,name=q.title,instructions=L('按下方实时任务目标完成。'),from=L('已在任务日志中')})end
        end
    end
    return rows,counts,complete
end
function D.PrerequisiteText(q)
    if not q.pre and not q.preAll and not q.parent then return '' end
    local catalog={};for _,d in ipairs(WoWAIDungeonData and WoWAIDungeonData.dungeons or {}) do for _,entry in ipairs(d.quests or {}) do catalog[entry.id]=entry end end
    local qs,complete=WoWAIAdventure.Quests();local active={};for _,entry in ipairs(qs) do active[entry.id]=true end
    local lines={};local faction=D.PlayerFaction()
    local function Group(ids,label,held)
        if type(ids)~='table' or #ids==0 then return end
        lines[#lines+1]=L(label)
        for _,id in ipairs(ids) do
            local entry=catalog[id];local side=entry and D.QuestFaction(entry)
            -- A malformed cross-faction dependency must not leak the opposing quest list.
            if not entry or side=='both' or side==faction then
                local state
                if held then state=active[id];if state==nil and complete then state=false end else state=D.Completed(id) end
                local name=entry and WoWAILocale.Field(entry) or (L('任务 ID：')..tostring(id))
                lines[#lines+1]=(state and L('[已满足] ') or state==false and L('[未满足] ') or L('[待确认] '))..name
            else lines[#lines+1]=L('前置资料与当前阵营不匹配，待核实。') end
        end
    end
    Group(q.pre,'前置任务：任一已交付')
    Group(q.preAll,'前置任务：全部已交付')
    if q.parent then Group({q.parent},'需要持有任务',true) end
    return table.concat(lines,'\n')
end
function D.Refresh()
    local inside,kind=Read(IsInInstance)
    local name,itype,_,_,_,_,_,mapID=Read(GetInstanceInfo)
    inside=inside==true and (kind=='party' or kind=='raid' or itype=='party' or itype=='raid')
    if not inside then
        D.instance,D.instanceName,D.instanceKey,D.boss,D.taskVisible,D.bossVisible=nil,nil,nil,nil,false,false
        D.rows={};D.counts={};D.Notify();return
    end
    local key=tostring(mapID or '')..':'..tostring(name or '')
    local entering=D.instanceKey~=key
    if entering then D.seen={};D.boss=nil;D.taskDismissed=false;D.bossVisible=false;D.noticeUntil=(Read(GetTime)or 0)+18 end
    D.instanceKey,D.instanceName=key,name or L('当前副本');D.instance=D.Match(name,mapID)
    local rows,counts=D.Check(D.instance,name)
    D.rows,D.counts=rows,counts
    D.taskVisible=not D.taskDismissed and (counts.active+counts.missing+counts.inside>0 or (entering or D.taskVisible) and (Read(GetTime)or 0)<(D.noticeUntil or 0))
    -- Completion removes the task notice immediately, while a boss loot notice remains independent.
    if counts.active+counts.missing+counts.inside==0 and counts.ready>0 then D.taskVisible=false end
    D.profile=WoWAIGear.Profile();D.Notify()
end
function D.Summary(dungeon,counts)
    if not dungeon and not D.instanceKey then return L('选择准备前往的副本，即可检查当前角色的任务。') end
    dungeon=dungeon or D.instance;local c=counts or D.counts
    if not dungeon or #dungeon.quests==0 then return L('此副本任务资料尚不完整，暂不能判断是否接满。') end
    local pending=c.factionUnknown or 0
    if (c.missing or 0)>0 then return string.format(L('漏接 %d · 进行中 %d · 已完成 %d'),c.missing,c.active,c.ready)..(pending>0 and (L(' · 阵营待核实 ')..pending)or'') end
    if pending>0 then return string.format(L('已接 %d · 阵营待核实 %d 项，暂不能确认接齐'),c.active+c.ready,pending)end
    if (c.unknown or 0)>0 then return string.format(L('已接 %d · 条件待确认 %d · 本内/物品任务 %d'),c.active+c.ready,c.unknown,c.inside) end
    if c.active+c.ready==0 then return string.format(L('当前无进本前可接任务 · 未满足条件 %d · 已交付 %d · 本内/物品 %d'),c.unavailable,c.done,c.inside) end
    return string.format(L('已收录且当前可接的任务已接齐 · 进行中 %d · 可交付 %d · 本内/物品 %d'),c.active,c.ready,c.inside)
end
function D.Loot(boss,dungeon,all)
    local rows={};local p=WoWAIGear.Profile()
    for _,item in ipairs((dungeon or D.instance or {}).loot or {})do if all or EqualAny(boss and boss.key,item.bosses) then rows[#rows+1]=WoWAIGear.Compare(item,p)end end
    local rank={upgrade=1,useful=2,same=3,unknown=4,low=5,unusable=6}
    table.sort(rows,function(a,b)local x,y=rank[a.status],rank[b.status];if x~=y then return x<y end return (a.item.id or 0)<(b.item.id or 0)end)
    return rows
end
function D.Observe(unit)
    if not D.instance then return end
    local name=Read(UnitName,unit)
    if not name or Read(UnitIsDeadOrGhost,unit) or Read(UnitIsDead,unit) then return end
    for _,b in ipairs(D.instance.bosses)do if EqualAny(name,b.aliases) then
        if not D.seen[b.key] then D.seen[b.key]=true;D.boss=b;D.bossVisible=true;D.Notify()end
        return
    end end
end
function D.Encounter(name,success)
    if not D.instance then return end
    for _,b in ipairs(D.instance.bosses)do if EqualAny(name,b.aliases) then
        if success~=nil then
            if not success then D.seen[b.key]=nil end
            if D.boss==b then D.bossVisible=false end
        elseif not D.seen[b.key] then D.seen[b.key]=true;D.boss=b;D.bossVisible=true end
        D.Notify();return
    end end
end
function D.Event(event,...)
    if event=='ADDON_LOADED' then if ...=='WoWAI' then D.Settings()end;return end
    if event=='NAME_PLATE_UNIT_ADDED' then D.Observe(...);return end
    if event=='PLAYER_TARGET_CHANGED' then D.Observe('target');return end
    if event=='UPDATE_MOUSEOVER_UNIT' then D.Observe('mouseover');return end
    if event=='INSTANCE_ENCOUNTER_ENGAGE_UNIT' then for i=1,5 do D.Observe('boss'..i)end;return end
    if event=='ENCOUNTER_START' then local _,name=...;D.Encounter(name);return end
    if event=='ENCOUNTER_END' then local _,name,_,_,success=...;D.Encounter(name,success==1);return end
    if event=='QUEST_TURNED_IN' then local id=...;D.turnedIn[id]=true end
    if event=='PLAYER_ENTERING_WORLD' or event=='ZONE_CHANGED_NEW_AREA' then D.Refresh();return end
    if event=='GET_ITEM_INFO_RECEIVED' or event=='ITEM_DATA_LOAD_RESULT' then
        local id=...;if not (WoWAIGear.requested and WoWAIGear.requested[id]) then return end
    end
    D.dirty=true
end
local f=CreateFrame('Frame')
for _,e in ipairs({'ADDON_LOADED','PLAYER_LOGIN','SPELLS_CHANGED','TRAIT_CONFIG_UPDATED','PLAYER_ENTERING_WORLD','ZONE_CHANGED_NEW_AREA','QUEST_LOG_UPDATE','QUEST_ACCEPTED','QUEST_REMOVED','QUEST_TURNED_IN','QUEST_DATA_LOAD_RESULT','PLAYER_LEVEL_UP','PLAYER_EQUIPMENT_CHANGED','PLAYER_TALENT_UPDATE','CHARACTER_POINTS_CHANGED','ACTIVE_TALENT_GROUP_CHANGED','PLAYER_SPECIALIZATION_CHANGED','GET_ITEM_INFO_RECEIVED','ITEM_DATA_LOAD_RESULT','PLAYER_TARGET_CHANGED','UPDATE_MOUSEOVER_UNIT','NAME_PLATE_UNIT_ADDED','INSTANCE_ENCOUNTER_ENGAGE_UNIT','ENCOUNTER_START','ENCOUNTER_END'})do pcall(f.RegisterEvent,f,e)end
f:SetScript('OnEvent',function(_,e,...)D.Event(e,...)end)
local elapsed=0
f:SetScript('OnUpdate',function(_,dt)
    elapsed=elapsed+dt;if elapsed<0.75 then return end;elapsed=0
    if D.dirty then D.dirty=false;D.Refresh()end
    if D.instance then
        D.Observe('target');for i=1,5 do D.Observe('boss'..i)end
        if D.taskVisible and (Read(GetTime)or 0)>(D.noticeUntil or 0) and (D.counts.active or 0)+(D.counts.missing or 0)+(D.counts.inside or 0)==0 then D.taskVisible=false;D.Notify()end
    end
end)
