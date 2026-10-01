local L = WoWAILocale.Text
-- Kill summaries only. Never subscribe to either restricted combat-log event.
local K={coverage='xp-and-observed-targets'}
WoWAIKills=K
local J=WoWAIAdventure
local tracked,paired,lines={},{},{}
local patterns
local function Read(fn,...)
    if type(fn)~='function' then return end
    local ok,value=pcall(fn,...)
    if ok and not (issecretvalue and issecretvalue(value)) then return value end
end
local function Escape(s) return (s:gsub('([%^%$%(%)%%%.%[%]%*%+%-%?])','%%%1')) end
local function Compile(format)
    local out,args,index,i={'^'},{},0,1
    while i<=#format do
        local tail=format:sub(i)
        if tail:sub(1,2)=='%%' then out[#out+1]='%%';i=i+2
        elseif tail:sub(1,1)=='%' then
            local token,pos,kind=tail:match('^(%%(%d+)%$([sd]))')
            if not token then token,kind=tail:match('^(%%([sd]))');index=index+1;pos=index end
            if not token then return end
            args[#args+1]=tonumber(pos)
            out[#out+1]=kind=='s' and '(.-)' or '([%d,]+)';i=i+#token
        else out[#out+1]=Escape(tail:sub(1,1));i=i+1 end
    end
    out[#out+1]='$';return {pattern=table.concat(out),args=args}
end
function K.ParseXP(text)
    if type(text)~='string' or (issecretvalue and issecretvalue(text)) then return end
    if not patterns then
        patterns={}
        for key,value in pairs(_G)do
            if type(key)=='string' and key:match('^COMBATLOG_XPGAIN_') and not key:find('UNNAMED') and not key:find('QUEST') and type(value)=='string' then
                local pattern=Compile(value);if pattern then patterns[#patterns+1]=pattern end
            end
        end
    end
    text=text:gsub('|c%x%x%x%x%x%x%x%x',''):gsub('|r','')
    for _,p in ipairs(patterns)do
        local captures={text:match(p.pattern)};local values={}
        for i,v in ipairs(captures)do values[p.args[i]]=v end
        local name=values[1];local xp=values[2] and tonumber((values[2]:gsub(',','')))
        if name and name~='' and xp and xp>0 then return name,xp end
    end
end
local function Cleanup()
    local now=GetTime()
    for key,r in pairs(tracked)do if now-r.at>120 then tracked[key]=nil end end
    for key,at in pairs(lines)do if now-at>120 then lines[key]=nil end end
    for i=#paired,1,-1 do if now-paired[i].at>3 then table.remove(paired,i) end end
end
local function Record(name,source,data)
    Cleanup()
    -- One-to-one pairing: repeated same-name kills in a pack remain distinct.
    for i,r in ipairs(paired)do
        if r.name==name and r.source~=source then table.remove(paired,i);return end
    end
    data=data or {};data.name=name;data.count=1;data.source=source
    data.sourceLabel=source=='xp_message' and L('击杀经验提示（可能含组队参与）') or L('参与击杀：观察到已参战目标死亡')
    data.position=J.Position()
    local e=J.Record('kill',data)
    if e then paired[#paired+1]={name=name,source=source,at=GetTime()};J.Render() end
end
function K.XP(text,lineID)
    if issecretvalue and (issecretvalue(text) or issecretvalue(lineID)) then return end
    local name,xp=K.ParseXP(text);if not name then return end
    Cleanup()
    if type(lineID)=='number' and lineID>0 then
        if lines[lineID] then return end
        lines[lineID]=GetTime()
    end
    Record(name,'xp_message',{xp=xp})
end
function K.Observe(unit)
    if unit~='target' and unit~='mouseover' and not (type(unit)=='string' and unit:match('^nameplate%d+$')) then return end
    Cleanup()
    local guid=Read(UnitGUID,unit)
    if type(guid)~='string' or not guid:match('^Creature%-') then return end
    local dead=Read(UnitIsDead,unit)
    local row=tracked[guid]
    if dead==true then
        if row and row.participated and not row.dead and Read(UnitIsTapDenied,unit)==false then
            row.dead=true;row.at=GetTime()
            Record(row.name,'observed_target',{guid=guid,level=row.level})
        end
        return
    end
    if dead~=false or Read(UnitCanAttack,'player',unit)~=true or Read(UnitIsTapDenied,unit)~=false then return end
    local playerThreat=Read(UnitThreatSituation,'player',unit)
    local petThreat=Read(UnitThreatSituation,'pet',unit)
    if type(playerThreat)~='number' and type(petThreat)~='number' then return end
    local name=Read(UnitName,unit);if type(name)~='string' then return end
    if not row or row.dead then row={};tracked[guid]=row end
    row.name=name;row.participated=true;row.level=Read(UnitLevel,unit);row.at=GetTime()
end
local frame=CreateFrame('Frame')
for _,ev in ipairs({'CHAT_MSG_COMBAT_XP_GAIN','UNIT_HEALTH','UNIT_THREAT_LIST_UPDATE','PLAYER_TARGET_CHANGED','UPDATE_MOUSEOVER_UNIT','NAME_PLATE_UNIT_ADDED'})do frame:RegisterEvent(ev) end
frame:SetScript('OnEvent',function(_,ev,...)
    if ev=='CHAT_MSG_COMBAT_XP_GAIN' then local text=...;K.XP(text,select(11,...))
    elseif ev=='PLAYER_TARGET_CHANGED' then K.Observe('target')
    elseif ev=='UPDATE_MOUSEOVER_UNIT' then K.Observe('mouseover')
    else K.Observe(...) end
end)
