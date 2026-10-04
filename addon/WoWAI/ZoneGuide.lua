-- Original local per-map workflow. Preview may simulate future steps; navigation never does.
local G={revision=0,cache={}};WoWAIZoneGuide=G
local J,O,L=WoWAIAdventure,WoWAIQuestOffers,WoWAILocale.Text
local function Try(fn,...)if type(fn)=='function' then local ok,a=pcall(fn,...);if ok then return a end end end
local function Name(q)local names=q and (q.name or q);return names and (names[WoWAILocale.Get()] or names.enUS) or '?' end
local function Copy(t)local out={};for k,v in pairs(t or {})do out[k]=v end;return out end
function G.MapName(id)local info=Try(C_Map and C_Map.GetMapInfo,id);return info and info.name or string.format(L('地图 %d'),id) end
function G.Maps()
    local covered={};local s=O.State();for _,r in ipairs(WoWAIZoneGuideData.routes or {})do if G.Matches(r.conditions,s)then for _,step in ipairs(r.steps)do covered[step.map]=true end end end
    local out={};for id,quests in pairs(WoWAIZoneGuideData.maps)do out[#out+1]={id=id,name=G.MapName(id),count=#quests,flow=covered[id]}end
    table.sort(out,function(a,b)if a.name==b.name then return a.id<b.id end;return a.name<b.name end);return out
end
function G.Active()local _,c=J.Context();return c and c.zoneGuide end
function G.Invalidate()G.revision=G.revision+1;G.cache={} end
local ClassTokens={Warrior=true,Paladin=true,Hunter=true,Rogue=true,Priest=true,Shaman=true,Mage=true,Warlock=true,Druid=true}
function G.Matches(condition,s)
    if not condition or #condition==0 then return true end
    for _,group in ipairs(condition)do
        local all=true
        for _,token in ipairs(group)do
            local negative=token:sub(1,1)=='!';local value=negative and token:sub(2) or token
            if (ClassTokens[value] and not s.classToken) or ((value=='Alliance' or value=='Horde') and not s.faction) or (not ClassTokens[value] and value~='Alliance' and value~='Horde' and not s.raceToken)then return false end
            local matched=value==s.faction or value==s.raceToken or value:upper()==s.classToken
            if negative then matched=not matched end
            if not matched then all=false;break end
        end
        if all then return true end
    end
    return false
end
function G.FlowOptions(map,s)
    s=s or O.State();local out={}
    for _,route in ipairs(WoWAIZoneGuideData.routes or {})do
        if G.Matches(route.conditions,s)then
            for _,step in ipairs(route.steps)do if step.map==map then out[#out+1]=route;break end end
        end
    end
    table.sort(out,function(a,b)if a.min==b.min then return a.id<b.id end;return a.min<b.min end);return out
end
function G.SelectFlow(map,s,id)
    local best,score
    for _,r in ipairs(G.FlowOptions(map,s))do
        if r.id==id then return r end
        local cost=(s.level<r.min and r.min-s.level or s.level>r.max and s.level-r.max or 0)*100-r.min
        if not score or cost<score then best=r;score=cost end
    end
    return best
end
local function Point(points,map,x,y,kind)
    local best,dist
    for _,p in ipairs(points or {})do
        if p[1]==map and p[4]<=4 and (kind~='accept' or p[4]==1 or p[4]==2) then
            local info=Try(C_Map and C_Map.GetMapInfoAtPosition,map,p[2]/100,p[3]/100)
            if not info or info.mapType~=3 or info.mapID==map then
                local d=(p[2]-x)^2+(p[3]-y)^2;if not dist or d<dist then best=p;dist=d end
            end
        end
    end
    return best,dist
end
local function LocalDestination(id,map)
    local entry=WoWAIQuestLocations[id];local rows=entry and (entry.objective or entry.turnin)
    if not rows or #rows==0 then return true end
    for _,p in ipairs(rows)do if p[1]==map and p[4]<=4 then return true end end
    return false
end
local function Guard(row,s,byID)
    for _,gate in ipairs(row.guards or {})do
        for _,value in ipairs(gate.ids)do
            local id=math.abs(value);local q=byID[id];local yes
            if gate.kind=='isOnQuest'then yes=s.active[id]==true
            elseif gate.kind=='isQuestTurnedIn'then yes=s.finished(id)==true
            elseif gate.kind=='isQuestComplete'then yes=q and q.complete==true
            elseif gate.kind=='isQuestAvailable'then local ref=WoWAIQuestOffersData.quests[id];yes=ref and O.Eligible(id,ref,s)
            else return false end
            if value<0 then yes=not yes end;if not yes then return false end
        end
    end
    return true
end
function G.BuildFlow(map,s,live,skipped,flow)
    local out={map=map,steps={},waiting={},ready={},flow=flow,supported=s.supported,complete=s.complete and s.history}
    if not out.supported or not out.complete then return out end
    local byID={};for _,q in ipairs(live or {})do byID[q.id]=q end
    local sim=Copy(s);sim.active=Copy(s.active);sim.allowTrivial=true
    local actual=Copy(s);actual.allowTrivial=true;local done,worked,seen,blocked={},{},{},{}
    sim.finished=function(id)if done[id]then return true end;return s.finished(id)end
    local x,y=s.position.x or 50,s.position.y or 50
    local main={};for _,r in ipairs(flow.steps)do if not r.alongside and r.map==map then main[r.id..':'..r.kind..':'..r.objective]=true end end
    for _,r in ipairs(flow.steps)do
        local id,kind=r.id,r.kind;local ref=WoWAIQuestOffersData.quests[id];local q=byID[id]
        local key=id..':'..kind..':'..r.objective
        local eligible=r.map==map and not blocked[id] and not seen[key] and not sim.finished(id) and not (q and q.dungeon) and not (ref and ref.category%2==1)
        if r.alongside and main[key]then eligible=false end
        for _,condition in ipairs(r.conditions or {})do if not G.Matches(condition,s)then eligible=false end end
        if eligible and Guard(r,sim,byID)then
            local ready,show=false,false
            if kind=='accept'then show=ref and LocalDestination(id,map) and O.Eligible(id,ref,sim);ready=show and O.Eligible(id,ref,actual)
            elseif kind=='quest'then
                local objective=q and q.objectives and q.objectives[r.objective]
                show=sim.active[id] and not (q and q.complete) and not (objective and objective.done)
                ready=show and s.active[id] and q and (r.objective==0 or objective~=nil)
            else
                local completed=worked[id]~=nil or (q and q.complete)
                if q and not q.complete then for i,o in ipairs(q.objectives or {})do if not o.done and not (worked[id] and worked[id][i])then completed=false end end end
                show=sim.active[id] and completed;ready=show and s.active[id] and q and q.complete
            end
            ready=ready and Guard(r,actual,byID)
            if show then
                local rows={}
                if kind=='accept'then
                    local matching={}
                    for _,p in ipairs(ref.start)do local names=WoWAIQuestOffersData.people[p[4]..':'..p[5]];for _,actor in ipairs(r.actors or {})do if names and names.enUS==actor then matching[#matching+1]=p;break end end end
                    rows=#matching>0 and matching or ref.start
                elseif ready then
                    for _,w in ipairs(q.locations or {})do if not w.entrance and J.PointMatchesObjective(q,w,kind=='quest' and r.objective or 0)then rows[#rows+1]={w.m,w.x,w.y,1,0}end end
                else
                    local entry=WoWAIQuestLocations[id];rows=entry and entry[kind=='quest' and 'objective' or 'turnin'] or {}
                end
                local point=Point(rows,map,x,y,kind)
                if skipped and skipped[key]then blocked[id]=true
                elseif not point then
                    out.waiting[#out.waiting+1]={id=id,title=q and q.title or Name(ref),kind=kind,reason=L('本地图位置待确认，暂不导航。')};blocked[id]=true
                else
                    local step={id=id,key=key,kind=kind,point=point,ready=ready==true,title=q and q.title or Name(ref),q=q,ref=ref,objective=r.objective,actors=r.actors,use=r.use,alongside=r.alongside,sourceOrder=r.order}
                    out.steps[#out.steps+1]=step;step.number=#out.steps;seen[key]=true
                    if step.ready then out.ready[#out.ready+1]=step end
                    x,y=point[2],point[3]
                    if kind=='accept'then sim.active[id]=true
                    elseif kind=='quest'then worked[id]=worked[id] or {};worked[id][r.objective]=true
                    else done[id]=true;sim.active[id]=nil end
                end
            end
        end
    end
    return out
end
function G.Build(map,s,live,skipped,routeID)
    local flow=G.SelectFlow(map,s,routeID);if flow then return G.BuildFlow(map,s,live,skipped,flow)end
    local out={map=map,steps={},waiting={},ready={},supported=s.supported,complete=s.complete and s.history}
    if not out.supported or not out.complete then return out end
    local catalog=WoWAIQuestOffersData;local byID={};for _,q in ipairs(live or {})do byID[q.id]=q end
    local ids,seen={},{}
    for _,id in ipairs(WoWAIZoneGuideData.maps[map] or {})do ids[#ids+1]=id;seen[id]=true end
    for id,q in pairs(byID)do if not seen[id] and not q.dungeon and J.InScope(q,map)then ids[#ids+1]=id end end
    table.sort(ids)
    local sim=Copy(s);sim.active=Copy(s.active);local done,worked,blocked={},{},{}
    sim.finished=function(id)if done[id]then return true end;return s.finished(id)end
    local x,y=s.position.map==map and (s.position.x or 50) or 50,s.position.map==map and (s.position.y or 50) or 50
    -- At most three phases per quest. A blocked dependency never becomes completed.
    for iteration=1,#ids*3 do
        local best,score
        for _,id in ipairs(ids)do
            local ref=catalog.quests[id];local q=byID[id];local kind,ready
            if not blocked[id] and not sim.finished(id) and not (q and q.dungeon) and not (ref and ref.category%2==1) then
                if sim.active[id] then
                    kind=(worked[id] or (q and q.complete)) and 'turnin' or 'quest'
                    ready=s.active[id] and q and ((kind=='turnin' and q.complete) or (kind=='quest' and not q.complete))
                elseif ref and LocalDestination(id,map) and O.Eligible(id,ref,sim) then kind='accept';ready=O.Eligible(id,ref,s) end
            end
            if kind then
                local key=id..':'..kind;local rows={}
                if kind=='accept' then rows=ref.start
                elseif ready then
                    for _,w in ipairs(q.locations or {})do if not w.entrance and J.PointMatchesObjective(q,w,0)then rows[#rows+1]={w.m,w.x,w.y,1,0}end end
                else local entry=WoWAIQuestLocations[id];rows=entry and entry[kind=='quest' and 'objective' or 'turnin'] or {} end
                local point,distance=Point(rows,map,x,y,kind)
                if skipped and skipped[key] then blocked[id]=true
                elseif not point then
                    local title=q and q.title or Name(ref)
                    out.waiting[#out.waiting+1]={id=id,title=title,kind=kind,reason=L('本地图位置待确认，暂不导航。')};blocked[id]=true
                else
                    -- Prefer actionable work over simulated future work, and nearby tasks at one hub.
                    local cost=distance+(ready and 0 or 1000000)+(kind=='turnin' and -2 or 0)
                    if not score or cost<score then
                        best={id=id,key=key,kind=kind,point=point,ready=ready==true,title=q and q.title or Name(ref),q=q,ref=ref};score=cost
                    end
                end
            end
        end
        if not best then break end
        out.steps[#out.steps+1]=best;best.number=#out.steps
        if best.ready then out.ready[#out.ready+1]=best end
        x,y=best.point[2],best.point[3]
        if best.kind=='accept'then sim.active[best.id]=true
        elseif best.kind=='quest'then worked[best.id]=true
        else done[best.id]=true;sim.active[best.id]=nil end
    end
    return out
end
function G.Preview(map,routeID)
    local _,c=J.Context();local saved=c and c.zoneGuide
    routeID=routeID or (saved and saved.map==map and saved.route)
    local key=tostring(map)..':'..WoWAILocale.Get()..':'..tostring(routeID)
    if G.cache[key] and time()-(G.cache[key].builtAt or 0)<3 then return G.cache[key] end
    local s=O.State();local quests,complete=J.Quests();s.complete=s.complete and complete
    local plan=G.Build(map,s,quests,saved and saved.map==map and saved.route==routeID and saved.skipped or nil,routeID)
    plan.builtAt=time()
    G.cache[key]=plan;return plan
end
function G.StepLines(step)
    local labels={accept=L('接取'),quest=L('完成任务'),turnin=L('交付')}
    local lines={string.format('%d. %s · %s',step.number,labels[step.kind],step.title)}
    local p=step.point;lines[#lines+1]=G.MapName(p[1])..string.format(' (%.1f, %.1f)',p[2],p[3])
    if step.kind=='accept' then
        local names=WoWAIQuestOffersData.people[p[4]..':'..p[5]];local giver=names and (names[WoWAILocale.Get()] or names.enUS)
        if giver then lines[#lines+1]=L('接取者：')..giver end
        lines[#lines+1]=string.format(L('接取：%s（%d 级可接）'),step.title,step.ref.min)
    elseif step.kind=='turnin'then lines[#lines+1]=L('与交付 NPC 交谈，交付这项已完成的任务。')
    elseif step.q then
        for i,o in ipairs(step.q.objectives or {})do if not o.done and (not step.objective or step.objective==0 or step.objective==i)then lines[#lines+1]='• '..o.text end end
        if (step.q.group or 0)>1 then lines[#lines+1]=L('此任务建议组队完成。') end
    elseif #(step.actors or {})==0 and #(step.use or {})==0 then lines[#lines+1]=L('接取后按实际任务目标推进。') end
    local actors={}
    if step.kind=='quest'then for _,actor in ipairs(step.actors or {})do local name=Name((WoWAIZoneGuideData.actors or {})[actor]);actors[#actors+1]=name~='?' and name or actor end
    elseif step.kind=='turnin'then
        local closest,distance
        for _,entry in ipairs((WoWAIZoneGuideData.turnins or {})[step.id] or {})do if entry.map==p[1]then local d=(entry.x-p[2])^2+(entry.y-p[3])^2;if d<=4 and (not distance or d<distance)then closest=entry;distance=d end end end
        if closest then actors[1]=Name(closest) end
    end
    if #actors>0 then lines[#lines+1]=(step.kind=='quest' and L('击杀目标：') or L('交谈对象：'))..table.concat(actors,' / ')end
    for _,id in ipairs(step.use or {})do local name=Try(GetItemInfo,id);lines[#lines+1]=L('使用任务物品：')..(name or ('item:'..id))end
    if step.alongside then lines[#lines+1]=L('沿途兼做，达到要求后继续下一步。')end
    if not step.ready then lines[#lines+1]=L('后续步骤：完成前面的接取或任务后开启。') end
    return lines
end
function G.Start(map,routeID)
    if not WoWAIZoneGuideData.maps[map] then return false end
    if J.PlanPhase()~='idle' then return false end
    local _,c=J.Context();if not c then return false end
    if O then O.Stop() end
    local flow=G.SelectFlow(map,O.State(),routeID)
    c.zoneGuide={map=map,route=flow and flow.id,skipped={}};J.NavigationStopped();WoWAIMap.StopAdventure(true);G.Invalidate();G.Tick();return true
end
function G.Stop()
    if G.navigating then return end
    local _,c=J.Context();if c then c.zoneGuide=nil end
    G.cache={};if WoWAIMap.ClearZoneGuide then WoWAIMap.ClearZoneGuide() end
end
function G.Skip()
    local saved=G.Active();if not saved then return end
    local p=G.Preview(saved.map);local step=p.ready[WoWAIMap.ZoneGuideIndex and WoWAIMap.ZoneGuideIndex() or 1]
    if step then saved.skipped[step.key]=true;G.Invalidate();G.Tick() end
end
function G.Tick()
    local saved=G.Active()
    if not saved then if WoWAIMap.HasZoneGuide and WoWAIMap.HasZoneGuide()then WoWAIMap.ClearZoneGuide()end;return end
    local pos=J.Position()
    if pos.map~=saved.map then if WoWAIMap.ClearZoneGuide then WoWAIMap.ClearZoneGuide()end;return end
    local plan=G.Preview(saved.map);local route={}
    -- Walking must not keep changing the current destination when two hubs are close.
    if not plan.flow then for i,step in ipairs(plan.ready)do if step.key==saved.key then table.remove(plan.ready,i);table.insert(plan.ready,1,step);break end end end
    saved.key=plan.ready[1] and plan.ready[1].key
    for _,step in ipairs(plan.ready)do
        route[#route+1]={m=step.point[1],x=step.point[2],y=step.point[3],label=step.title,kind=step.kind=='turnin' and 'turnin' or 'quest',number=step.number,detail=table.concat(G.StepLines(step),'\n')}
    end
    local signature=J.JSON(route)
    if signature~=saved.signature or not WoWAIMap.HasZoneGuide()then
        saved.signature=signature;G.navigating=true;WoWAIMap.SetZoneGuide(route);G.navigating=false
    end
end
