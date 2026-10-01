local L = WoWAILocale.Text
-- Native views for the approved workspace layout. No demo data or AI calls on open.
local J = WoWAIAdventure
local U = {tab='tasks', group='route', logTab='story', page=1, grouping='day'}
WoWAIAdventureUI = U
local GOLD = {0.86, 0.70, 0.37}
local BACK = {bgFile='Interface\\ChatFrame\\ChatFrameBackground', edgeFile='Interface\\Tooltips\\UI-Tooltip-Border', tile=true, tileSize=16, edgeSize=12, insets={left=3,right=3,top=3,bottom=3}}
local PAGE_SIZE = 80

local function Label(parent, text, size)
    local f=parent:CreateFontString(nil,'OVERLAY','GameFontHighlight')
    if STANDARD_TEXT_FONT then f:SetFont(STANDARD_TEXT_FONT,size or 14,'') end
    f:SetJustifyH('LEFT');f:SetJustifyV('TOP');f:SetText(text or '')
    return f
end
local function Box(parent)
    local f=CreateFrame('Frame',nil,parent,'BackdropTemplate')
    f:SetBackdrop(BACK);f:SetBackdropColor(0.04,0.035,0.023,0.98);f:SetBackdropBorderColor(0.36,0.29,0.16,1)
    return f
end
local function Button(parent, text, width, fn)
    local b=CreateFrame('Button',nil,parent,'UIPanelButtonTemplate')
    b:SetSize(width or 104,28);b:SetText(text);b:SetScript('OnClick',fn)
    return b
end
local function Active(button, active)
    button:GetFontString():SetTextColor(active and 1 or 0.78, active and 0.82 or 0.73, active and 0.35 or 0.6)
end
local function Tip(button,text)
    button:SetScript('OnEnter',function(self)
        GameTooltip:SetOwner(self,'ANCHOR_TOP');GameTooltip:SetText(text,1,1,1,1,true);GameTooltip:Show()
    end)
    button:SetScript('OnLeave',function()GameTooltip:Hide()end)
end
local function Scroll(parent)
    local s=CreateFrame('ScrollFrame',nil,parent,'UIPanelScrollFrameTemplate')
    local content=CreateFrame('Frame',nil,s);content:SetSize(200,1);s:SetScrollChild(content)
    s.content=content;s.rows={}
    s:HookScript('OnSizeChanged',function(self,w) self.content:SetWidth(math.max(80,w)) end)
    return s
end
local function Row(scroll, index, title, detail, selected, onClick, height)
    local b=scroll.rows[index]
    if not b then
        b=CreateFrame('Button',nil,scroll.content,'BackdropTemplate');b:SetBackdrop(BACK)
        b.title=Label(b,'',14);b.title:SetPoint('TOPLEFT',10,-8);b.title:SetPoint('TOPRIGHT',-10,-8)
        b.detail=Label(b,'',12);b.detail:SetPoint('TOPLEFT',10,-29);b.detail:SetPoint('TOPRIGHT',-10,-29)
        b.detail:SetTextColor(0.65,0.62,0.54)
        scroll.rows[index]=b
    end
    b:SetWidth(math.max(80,scroll:GetWidth()));b:SetHeight(height or 56)
    b.title:SetText(title);b.title:SetWordWrap(false)
    b.detail:SetText(detail or '');b.detail:SetWordWrap(true)
    b:SetBackdropColor(selected and 0.18 or 0.075,selected and 0.145 or 0.062,selected and 0.08 or 0.039,1)
    b:SetBackdropBorderColor(selected and 0.83 or 0.26,selected and 0.66 or 0.22,selected and 0.32 or 0.14,1)
    b:SetScript('OnClick',onClick);b:EnableMouse(onClick~=nil);b:Show()
    return b
end
local function EndRows(scroll,n,height)
    for i=n+1,#scroll.rows do scroll.rows[i]:Hide() end
    scroll.content:SetWidth(math.max(80,scroll:GetWidth()));scroll.content:SetHeight(math.max(1,height))
end
local function Money(value) return string.format(L('%.2f 金'),(value or 0)/10000) end
local function CurrentCharacter()
    local db,c=J.Context()
    if not db then return end
    return U.character and db.characters[U.character] or c
end
local function Quest(id)
    local _,c=J.Context()
    for _,q in ipairs(c and c.plan and c.plan.quests or {}) do if q.id==id then return q end end
end
local function NavIndex() return WoWAIMap and WoWAIMap.AdventureStatus and WoWAIMap.AdventureStatus() end
local function SelectTask(id)
    U.quest=id;U.tasks.detailScroll:SetVerticalScroll(0);U.Render()
end
function U.NextTask()
    local _,c=J.Context();local p=c and c.plan
    if not p then return end
    local at=NavIndex()
    local route=J.NavigationRoute(p)
    if at and WoWAIMap then
        WoWAIMap.Step(1)
        at=NavIndex();if at and route[at] then U.quest=route[at].questID end
    else
        if p.regions then
            local selected=0
            for i,r in ipairs(route) do for _,member in ipairs(r.members) do if member.questID==U.quest and not member.done then selected=i;break end end;if selected>0 then break end end
            for i=selected+1,#route do if not route[i].done then U.quest=route[i].questID;break end end
            U.Render();return
        end
        for i,r in ipairs(p.route) do if r.questID==U.quest then
            if p.route[i+1] then U.quest=p.route[i+1].questID end
            break
        end end
    end
    U.Render()
end

local function BuildTasks(parent)
    local t=CreateFrame('Frame',nil,parent);t:SetAllPoints(parent);U.tasks=t
    local side=Box(t);side:SetPoint('TOPLEFT');side:SetPoint('BOTTOMLEFT');side:SetWidth(200)
    t.groups={}
    for i,v in ipairs({{'route',L('任务顺序')},{'ready',L('可交付')},{'missing',L('位置待确认')},{'skipped',L('副本已跳过')}}) do
        local key=v[1]
        local b=Button(side,v[2],180,function()U.group=key;t.list:SetVerticalScroll(0);U.Render()end)
        b:SetPoint('TOPLEFT',10,-10-(i-1)*34);t.groups[key]=b
    end
    t.list=Scroll(side);t.list:SetPoint('TOPLEFT',8,-152);t.list:SetPoint('BOTTOMRIGHT',-26,8)
    local right=Box(t);right:SetPoint('TOPLEFT',side,'TOPRIGHT',10,0);right:SetPoint('BOTTOMRIGHT');t.right=right
    t.title=Label(right,L('任务助手'),18);t.title:SetPoint('TOPLEFT',14,-14);t.title:SetPoint('TOPRIGHT',-124,-14);t.title:SetTextColor(GOLD[1],GOLD[2],GOLD[3]);t.title:SetWordWrap(false)
    t.refresh=Button(right,L('刷新任务'),100,function()J.Plan(false)end);t.refresh:SetPoint('TOPRIGHT',-12,-10)
    t.summary=Label(right,'');t.summary:SetPoint('TOPLEFT',14,-48);t.summary:SetPoint('TOPRIGHT',-14,-48);t.summary:SetHeight(42)
    t.detailScroll=Scroll(right);t.detailScroll:SetPoint('TOPLEFT',14,-96);t.detailScroll:SetPoint('BOTTOMRIGHT',-32,112)
    t.body=Label(t.detailScroll.content,'',15);t.body:SetPoint('TOPLEFT');t.body:SetPoint('TOPRIGHT');t.body:SetWordWrap(true)
    t.detailScroll:HookScript('OnSizeChanged',function() if U.frame and U.frame:IsShown() then U.Render() end end)
    t.hint=Label(right,L('箭头为直线方位，请自行绕开地形；到达后不会自动判定任务完成。'),12)
    t.hint:SetPoint('BOTTOMLEFT',14,82);t.hint:SetPoint('BOTTOMRIGHT',-14,82);t.hint:SetHeight(26);t.hint:SetTextColor(0.66,0.62,0.52)
    t.auto=Button(right,L('任务变化自动重算：关'),180,J.ToggleAutoPlan);t.auto:SetPoint('BOTTOMLEFT',14,48)
    Tip(t.auto,L('独立开关。开启后，接取、交付或关键目标变化会自动请求 AI；连续变化合并处理，会使用 AI 额度。开关本身不立即规划。'))
    t.cancel=Button(right,L('取消 AI 同步'),115,J.CancelSync);t.cancel:SetPoint('LEFT',t.auto,'RIGHT',8,0)
    t.ai=Button(right,L('AI 规划本地图'),150,function()J.SendPlan(false,true)end);t.ai:SetPoint('BOTTOMLEFT',14,12)
    Tip(t.ai,L('按当前所在地图规划已接任务，合并任务区域并标记数字；完成后自动推进。副本和其他地图任务跳过，不改变自动重算开关。'))
    t.next=Button(right,L('跳到下一区'),110,U.NextTask);t.next:SetPoint('LEFT',t.ai,'RIGHT',8,0)
    Tip(t.next,L('手动切换导航目标，不会把当前区域标为完成。通常无需点击，区域任务完成后自动推进。'))
    t.nav=Button(right,L('开始导航'),120,function()
        if NavIndex() or J.NavigationWanted() then WoWAIMap.StopAdventure() else J.StartNavigation(U.quest) end
        U.Render()
    end);t.nav:SetPoint('BOTTOMRIGHT',-14,12)
end

function U.EventText(e)
    local d=e.data or {};local kind=e.kind
    if kind=='session_start' then
        local p=d.position or {};local place=p.zone or ''
        if p.subzone and p.subzone~='' and p.subzone~=place then place=place..(place~='' and ' · ' or '')..p.subzone end
        if place=='' then place=L('上线位置暂未确认') end
        if type(p.x)=='number' and type(p.y)=='number' and (p.x~=0 or p.y~=0) then place=place..string.format(' (%.1f, %.1f)',p.x,p.y) end
        return L('上线'),place
    elseif kind=='kill' then return (d.name or L('未知目标'))..' ×'..(d.count or 1),(d.sourceLabel or d.source or L('击杀记录'))..' · '..(d.position and d.position.zone or '')
    elseif kind=='loot' then return (d.name or d.text or L('物品'))..' ×'..(d.count or 1),L('拾取 · ')..(d.position and d.position.zone or '')
    elseif kind=='boss' then return (d.success and L('击败首领：') or L('首领挑战未完成：'))..(d.name or '?'),L('来源：副本首领结束事件')
    elseif kind=='quest_progress' then local a={};for _,o in ipairs(d.objectives or {})do a[#a+1]=o.text end;return d.title or L('任务进度'),table.concat(a,' / ')
    elseif kind:match('^quest_') then return d.title or (L('任务 ')..tostring(d.questID or '')),d.xp and (L('经验 ')..d.xp..' · '..Money(d.money)) or ''
    elseif kind=='level' then return L('升到 ')..tostring(d.level)..L(' 级'),''
    elseif kind=='xp' then return L('获得 ')..tostring(d.delta or 0)..L(' 点经验'),''
    elseif kind=='money' then return L('金币变化 ')..Money(d.delta),L('余额 ')..Money(d.balance)
    elseif kind=='zone' or kind=='position' then return (d.loginFor and L('上线后首次确认位置：') or '')..(d.zone or '')..' · '..(d.subzone or ''),d.x and string.format('(%.1f, %.1f)',d.x,d.y or 0) or ''
    elseif kind=='note' then return d.text or '',d.milestone and L('手动标记为里程碑') or L('冒险手记')
    elseif kind=='equipment' then return L('装备栏 ')..tostring(d.slot),tostring(d.before or L('空'))..' → '..tostring(d.after or L('空'))
    elseif kind=='achievement' then return d.name or tostring(d.id),L('获得成就')
    elseif kind=='skill' then return L('专业技能更新'),L('已保存技能快照')
    elseif kind=='death' or kind=='resurrect' then return J.KindNames[kind],d.zone or ''
    elseif kind=='gap' then return L('记录缺口：')..tostring(d.count or 0)..L(' 条'),d.reason or ''
    end
    return J.KindNames[kind] or kind,d.reason or (d.position and d.position.zone) or ''
end
function U.Source(e)
    local c=CurrentCharacter();if not c then return end
    U.session=U.grouping=='day' and J.DayKey(e) or e.session;U.logTab='timeline';U.source=e.seq;U.page=1
    local count=0
    local events=J.Events(c,U.session)
    for i=#events,1,-1 do local row=events[i]
        if J.Matches(row,U.session) and J.KindNames[row.kind] and row.kind~='heartbeat' and row.kind~='position' then
            count=count+1;if row.seq==e.seq then U.page=math.floor((count-1)/PAGE_SIZE)+1;break end
        end
    end
    U.Render()
    if U.sourceY then U.logs.events:SetVerticalScroll(U.sourceY) end
end
function U.Preview(character,session)
    local lines={L('每天的经历自动整理在这里。点击“生成游记”可让 AI 写成连贯文字。')}
    local found=false;local lastKey,lastCount,lastAt
    for _,e in ipairs(J.Events(character,session)) do
        if J.Matches(e,session) and J.KindNames[e.kind] and e.kind~='heartbeat' and e.kind~='position' and e.kind~='xp' and e.kind~='money' then
            if e.kind=='session_start' then found=true end
            local title,detail=U.EventText(e)
            local key=(e.kind=='kill' or e.kind=='loot') and (e.kind..':'..tostring(e.data.itemID or e.data.name)..':'..tostring(e.data.position and e.data.position.zone)) or nil
            if key and key==lastKey and e.t-lastAt<=300 then
                lastCount=lastCount+(e.data.count or 1)
                lines[#lines]=date('%H:%M',e.t)..'  '..(e.data.name or L('未知目标'))..' ×'..lastCount..' · '..J.KindNames[e.kind]
            else
                lines[#lines+1]=date('%H:%M',e.t)..'  '..title..(detail~='' and '。'..detail or '')
                lastCount=e.data.count or 1
            end
            lastKey=key;lastAt=e.t
        end
    end
    local day=character.days and character.days[session]
    if day and day.legacy then table.insert(lines,2,L('旧版记录可能不完整，早期经历可在电脑冒险档案查看。'))
    elseif not found then table.insert(lines,2,L('本页从当天已记录的经历开始；跨午夜的旅程会分到两天。')) end
    return table.concat(lines,'\n\n')
end

function U.TurnDay(step)
    local viewed=CurrentCharacter();if not viewed then return end
    local days=J.Days(viewed);local at=1
    for i,d in ipairs(days) do if d.id==U.session then at=i;break end end
    local day=days[at+step];if not day then return end
    U.session=day.id;U.source=nil;U.page=1
    U.logs.events:SetVerticalScroll(0);U.Render()
end

local function BuildLogs(parent)
    local l=CreateFrame('Frame',nil,parent);l:SetAllPoints(parent);U.logs=l
    local side=Box(l);side:SetPoint('TOPLEFT');side:SetPoint('BOTTOMLEFT');side:SetWidth(200)
    l.character=Label(side,'',15);l.character:SetPoint('TOPLEFT',12,-12);l.character:SetPoint('TOPRIGHT',-12,-12);l.character:SetHeight(42)
    l.switch=Button(side,L('切换角色'),172,function()
        local db,c=J.Context();local keys={};local at=0
        for key in pairs(db.characters)do keys[#keys+1]=key end;table.sort(keys)
        for i,key in ipairs(keys)do if (U.character and key==U.character) or (not U.character and db.characters[key]==c) then at=i end end
        U.character=keys[at%#keys+1];U.session=nil;U.source=nil;U.page=1;l.sessions:SetVerticalScroll(0);U.Render()
    end);l.switch:SetPoint('TOPLEFT',12,-52)
    l.grouping=Button(side,L('按天查看'),172,function()
        U.grouping=U.grouping=='day' and 'session' or 'day';U.session=nil;U.page=1;U.source=nil;l.events:SetVerticalScroll(0);l.sessions:SetVerticalScroll(0);U.Render()
    end);l.grouping:SetPoint('TOPLEFT',12,-84)
    Tip(l.grouping,L('按天合并同一天的多次上线；点击可切换为按次查看旧游记。'))
    l.previousDay=Button(side,L('前一天'),82,function()U.TurnDay(1)end);l.previousDay:SetPoint('TOPLEFT',12,-116)
    l.nextDay=Button(side,L('后一天'),82,function()U.TurnDay(-1)end);l.nextDay:SetPoint('LEFT',l.previousDay,'RIGHT',8,0)
    l.sessions=Scroll(side);l.sessions:SetPoint('TOPLEFT',8,-152);l.sessions:SetPoint('BOTTOMRIGHT',-26,8)
    local right=Box(l);right:SetPoint('TOPLEFT',side,'TOPRIGHT',10,0);right:SetPoint('BOTTOMRIGHT');l.right=right
    l.title=Label(right,L('冒险日志'),18);l.title:SetPoint('TOPLEFT',14,-14);l.title:SetPoint('TOPRIGHT',-136,-14);l.title:SetTextColor(GOLD[1],GOLD[2],GOLD[3])
    l.pause=Button(right,L('暂停记录'),112,J.ToggleRecording);l.pause:SetPoint('TOPRIGHT',-12,-10)
    l.summary=Label(right,'',14);l.summary:SetPoint('TOPLEFT',14,-48);l.summary:SetPoint('TOPRIGHT',-14,-48);l.summary:SetHeight(42)
    l.timeline=Button(right,L('时间线'),95,function()U.logTab='timeline';U.source=nil;U.page=1;l.events:SetVerticalScroll(0);U.Render()end);l.timeline:SetPoint('TOPLEFT',14,-94)
    l.milestones=Button(right,L('里程碑'),95,function()U.logTab='milestones';U.page=1;l.events:SetVerticalScroll(0);U.Render()end);l.milestones:SetPoint('LEFT',l.timeline,'RIGHT',6,0)
    l.story=Button(right,L('旅程与游记'),108,function()U.logTab='story';U.page=1;l.events:SetVerticalScroll(0);U.Render()end);l.story:SetPoint('LEFT',l.milestones,'RIGHT',6,0)
    l.newer=Button(right,L('较新'),58,function()U.page=math.max(1,U.page-1);l.events:SetVerticalScroll(0);U.Render()end);l.newer:SetPoint('TOPRIGHT',-80,-94)
    l.older=Button(right,L('较早'),58,function()U.page=U.page+1;l.events:SetVerticalScroll(0);U.Render()end);l.older:SetPoint('TOPRIGHT',-14,-94)
    l.events=Scroll(right);l.events:SetPoint('TOPLEFT',14,-132);l.events:SetPoint('BOTTOMRIGHT',-32,145)
    l.storyText=Label(l.events.content,'',15);l.storyText:SetPoint('TOPLEFT');l.storyText:SetPoint('TOPRIGHT');l.storyText:SetWordWrap(true);l.storyText:Hide()
    l.hint=Label(right,'',12);l.hint:SetPoint('BOTTOMLEFT',14,86);l.hint:SetPoint('BOTTOMRIGHT',-162,86);l.hint:SetHeight(52);l.hint:SetTextColor(0.65,0.62,0.54)
    l.sync=Button(right,L('同步新增日志'),136,function()J.SyncLogs(CurrentCharacter())end);l.sync:SetPoint('BOTTOMRIGHT',-14,92)
    Tip(l.sync,L('只传当前角色尚未确认保存的记录，不请求 AI。已完成的记录不会重传；本次传输期间的新记录留待下次。'))
    l.input=CreateFrame('EditBox','WoWAIJournalNote',right,'InputBoxTemplate');l.input:SetAutoFocus(false);l.input:SetMaxLetters(600)
    l.input:SetHeight(26);l.input:SetPoint('BOTTOMLEFT',20,53);l.input:SetPoint('BOTTOMRIGHT',-14,53)
    l.input:SetScript('OnEscapePressed',function(self)self:ClearFocus()end)
    Tip(l.input,L('可以记下迷路、组队、心情或特别经历；手记会加入当前这次冒险的底稿素材。'))
    l.note=Button(right,L('记一笔'),84,function()if J.AddNote(l.input:GetText(),false)then l.input:SetText('');l.input:ClearFocus()end end);l.note:SetPoint('BOTTOMLEFT',14,12)
    l.mark=Button(right,L('记为里程碑'),110,function()if J.AddNote(l.input:GetText(),true)then l.input:SetText('');l.input:ClearFocus();U.logTab='milestones';U.Render()end end);l.mark:SetPoint('LEFT',l.note,'RIGHT',6,0)
    l.review=Button(right,L('生成游记'),172,function()U.logTab='story';J.Draft(U.session,CurrentCharacter());U.Render()end);l.review:SetPoint('BOTTOMRIGHT',-14,12)
    Tip(l.review,L('只在点击时调用 AI；按所选日期整理已同步的真实经历，重新生成会保留旧文件。'))
    l.cancel=Button(right,L('取消同步'),90,J.CancelSync);l.cancel:SetPoint('RIGHT',l.review,'LEFT',-6,0)
end

local function RenderTasks(c,pending)
    local t,p=U.tasks,c.plan;local list={};local counts={route=0,ready=0,missing=0,skipped=0}
    if p then
        counts.route=#J.PlanningQuests(p)
        for _,q in ipairs(p.quests)do
            if q.dungeon then
                counts.skipped=counts.skipped+1
                if U.group=='skipped' then list[#list+1]=q end
            else
            if q.complete then counts.ready=counts.ready+1 end
            if not q.waypoint then counts.missing=counts.missing+1 end
            if (U.group=='ready' and q.complete) or (U.group=='missing' and not q.waypoint) then list[#list+1]=q end
            end
        end
        if U.group=='route' then for _,id in ipairs(p.order or {})do local q=Quest(id);if q then list[#list+1]=q end end end
    end
    for _,v in ipairs({{'route',p and p.ai and L('AI 推荐顺序') or L('任务顺序')},{'ready',L('可交付')},{'missing',L('位置待确认')},{'skipped',L('副本已跳过')}})do
        t.groups[v[1]]:SetText(v[2]..' ('..counts[v[1]]..')');Active(t.groups[v[1]],U.group==v[1])
    end
    local found=false;for _,q in ipairs(list)do if q.id==U.quest then found=true end end
    if not found then U.quest=list[1] and list[1].id or nil end
    for i,q in ipairs(list)do local id=q.id
        local prefix=''
        for _,r in ipairs(p and p.regions or {}) do for _,member in ipairs(r.members) do if member.questID==id and not member.done then prefix='['..r.number..'] ';break end end;if prefix~='' then break end end
        local b=Row(t.list,i,prefix..q.title,(q.complete and L('可交付') or L('进行中'))..' · '..(q.level or '?')..L(' 级'),id==U.quest,function()SelectTask(id)end)
        b:SetPoint('TOPLEFT',0,-(i-1)*59)
    end
    EndRows(t.list,#list,#list*59)
    local q=Quest(U.quest);t.title:SetText(q and q.title or L('任务助手'))
    t.summary:SetText(p and (counts.route..L(' 个非副本任务 · ')..#p.route..L(' 个定位点 · 跳过 ')..counts.skipped..L(' 个副本任务\n')..(not p.complete and L('任务分组不完整，请展开游戏任务日志的分组。') or J.PlanningStatus())) or L('点击“刷新任务”读取身上的任务。'))
    local lines={}
    if p and p.regions then
        local completed=0;for _,r in ipairs(p.regions) do if r.done then completed=completed+1 end end
        t.summary:SetText(string.format(L('本地图 %d 个区域 · 已处理 %d · 当前 %s'),#p.regions,completed,p.regionIndex and tostring(p.regionIndex) or L('全部处理'))..'\n'..J.PlanningStatus())
        t.hint:SetText(p.unplanned>0 and string.format(L('%d 个任务尚未纳入区域路线，可点击 AI 重新规划。'),p.unplanned) or L('数字顺序保持不变；区域内任务全部完成后自动推进，交付单独安排。'))
    end
    if q and q.dungeon then
        lines={L('|cffe0b75e副本任务已跳过|r'),L('此任务不参与 AI 规划，不安排进本、交付或箭头导航。'),q.skipReason or L('副本任务')}
        for _,o in ipairs(q.objectives) do lines[#lines+1]=(o.done and L('[完成] ') or '· ')..o.text end
    elseif q then
        lines={L('|cffe0b75e任务目标|r'),q.complete and L('任务已完成，前往交付。') or L('按下列目标推进：')}
        for _,o in ipairs(q.objectives)do lines[#lines+1]=(o.done and L('[完成] ') or '· ')..o.text end
        lines[#lines+1]=L('\n|cffe0b75e位置信息|r')
        if q.waypoint then local w=q.waypoint;lines[#lines+1]=string.format(L('地图 %d · (%.1f, %.1f)\n来源：%s'),w.m,w.x,w.y,w.source)
        else lines[#lines+1]=L('位置尚待确认。AI 会自动查找资料；取得可核对的位置后才能开启箭头，无需手动标记。') end
        lines[#lines+1]=L('\n|cffe0b75e推荐顺序|r')
        for i,id in ipairs(p.order or {})do if id==q.id then lines[#lines+1]=L('第 ')..i..L(' 个任务') end end
        lines[#lines+1]=q.reason or L('当前为地点邻近顺序；点击“AI 规划当前任务”获取顺路合并和交付安排。')
        if q.action then lines[#lines+1]=L('下一步：')..q.action end
        if q.sourceURL and q.sourceURL~='' then lines[#lines+1]=L('检索资料：')..q.sourceURL end
        if p.summary then lines[#lines+1]=L('\n整体安排：')..p.summary end
        if (q.group or 0)>1 then lines[#lines+1]=L('此任务建议组队完成。') end
    else lines={L('此分组暂无任务。')} end
    if p and p.regions then
        lines[#lines+1]=L('本地图区域顺序')
        for _,r in ipairs(p.regions) do lines[#lines+1]=(r.number==p.regionIndex and '> ' or '')..r.number..'. '..r.label..'\n'..(r.detail or '') end
    end
    t.body:SetWidth(math.max(80,t.detailScroll:GetWidth()));t.body:SetText(table.concat(lines,'\n\n'))
    t.detailScroll.content:SetHeight(math.max(1,t.body:GetStringHeight()+20))
    local at=NavIndex();t.nav:SetText((at or J.NavigationWanted()) and L('停止导航') or L('开始导航'))
    t.nav:SetEnabled(at~=nil or J.NavigationWanted() or (q~=nil and not q.dungeon and q.waypoint~=nil and p.complete and not p.stale))
    t.auto:SetText(c.autoPlan and L('任务变化自动重算：开') or L('任务变化自动重算：关'))
    local phase=J.PlanPhase()
    t.ai:SetText(phase=='syncing' and L('正在同步当前任务…') or phase=='planning' and L('AI 正在规划…') or L('AI 规划本地图'))
    t.ai:SetEnabled(p~=nil and p.complete and #J.EligibleQuests(p.quests)>0 and J.CanPlan());t.next:SetEnabled(p~=nil and #p.route>0)
    t.cancel:SetShown(pending~=nil)
end

function U.StoryPages(text)
    local pages,buffer={},''
    for paragraph in (text..'\n\n'):gmatch('(.-)\n\n') do
        while #paragraph>2100 do
            if buffer~='' then pages[#pages+1]=buffer;buffer='' end
            local n=2100
            while paragraph:byte(n+1) and paragraph:byte(n+1)>=128 and paragraph:byte(n+1)<192 do n=n-1 end
            pages[#pages+1]=paragraph:sub(1,n);paragraph=paragraph:sub(n+1)
        end
        if #buffer+#paragraph>2100 and buffer~='' then pages[#pages+1]=buffer;buffer='' end
        buffer=buffer..(buffer~='' and '\n\n' or '')..paragraph
    end
    if buffer~='' or #pages==0 then pages[#pages+1]=buffer end
    return pages
end
local function RenderLogs(db,c,current,pending)
    local l=U.logs;local viewed=CurrentCharacter();if not viewed then return end
    local days=J.Days(viewed)
    if U.grouping=='day' and not U.session then U.session=days[1] and days[1].id end
    if U.logTab=='story' and not U.session then U.session=viewed==c and current.id or (viewed.sessions[#viewed.sessions] and viewed.sessions[#viewed.sessions].id) end
    local day=viewed.days[U.session or ''];local events=J.Events(viewed,U.session)
    l.character:SetText(viewed.name);l.title:SetText(day and (day.id:sub(5)..' · '..L('冒险日志')) or L('冒险日志'))
    l.pause:SetText(db.enabled and L('暂停记录') or L('恢复记录'))
    l.grouping:SetText(U.grouping=='day' and L('按天查看') or L('按次查看'))
    local sessions={};local dayAt=1
    if U.grouping=='day' then
        for i,s in ipairs(days) do sessions[#sessions+1]={id=s.id,label=s.id:sub(5),value=s};if s.id==U.session then dayAt=i end end
    else
        for i=#viewed.sessions,1,-1 do local s=viewed.sessions[i];sessions[#sessions+1]={id=s.id,label=date('%m-%d %H:%M',s.start),value=s} end
    end
    l.previousDay:SetEnabled(U.grouping=='day' and dayAt<#days);l.nextDay:SetEnabled(U.grouping=='day' and dayAt>1)
    for i,s in ipairs(sessions)do
        local id=s.id;local v=s.value
        local detail=U.grouping=='day' and string.format(L('交付 %d · 击杀 %d · 拾取 %d'),v.quests or 0,v.kills or 0,v.loot or 0) or (math.floor(math.max(0,v.last-v.start)/60)..L(' 分钟 · 交任务 ')..(v.quests or 0))
        local b=Row(l.sessions,i,s.label,detail,(U.session or false)==id,function()U.session=id or nil;U.page=1;U.source=nil;l.events:SetVerticalScroll(0);U.Render()end)
        b:SetPoint('TOPLEFT',0,-(i-1)*59)
    end
    EndRows(l.sessions,#sessions,#sessions*59)
    local seconds,quests,kills,money=0,0,0,0
    for _,s in ipairs(viewed.sessions)do if not U.session or s.id==U.session then
        seconds=seconds+math.max(0,s.last-s.start);quests=quests+(s.quests or 0);kills=kills+(s.kills or 0);money=money+(s.money or 0)
    end end
    l.summary:SetText(string.format(L('在线 %d 分钟  ·  交付 %d 个任务  ·  已确认击杀 %d 次\n金币净变化 %s  ·  %s'),math.floor(seconds/60),quests,kills,Money(money),db.enabled and L('本地记录中') or L('记录已暂停')))
    if day then l.summary:SetText(string.format(L('交付 %d · 击杀 %d · 拾取 %d'),day.quests,day.kills,day.loot)..'\n'..(db.enabled and L('上线自动记录；正常下线自动保存。') or L('本次上线已暂停记录，下次登录自动恢复。'))) end
    Active(l.timeline,U.logTab=='timeline');Active(l.milestones,U.logTab=='milestones');Active(l.story,U.logTab=='story')
    local entries={}
    if U.logTab=='milestones' then
        local milestones=J.Milestones(events)
        for i=#milestones,1,-1 do local m=milestones[i];if J.Matches(m.event,U.session) then entries[#entries+1]={event=m.event,title=m.title,milestone=true} end end
    else
        for i=#events,1,-1 do local e=events[i]
            if J.KindNames[e.kind] and e.kind~='heartbeat' and e.kind~='position' and J.Matches(e,U.session) then entries[#entries+1]={event=e} end
        end
    end
    if U.logTab~='story' then U.page=math.min(math.max(1,U.page),math.max(1,math.ceil(#entries/PAGE_SIZE))) end
    l.newer:SetEnabled(U.page>1);l.older:SetEnabled(U.page*PAGE_SIZE<#entries)
    local n,y=0,0;U.sourceY=nil
    for i=(U.page-1)*PAGE_SIZE+1,math.min(U.page*PAGE_SIZE,#entries)do
        n=n+1;local item=entries[i];local e=item.event;local title,detail=U.EventText(e)
        title=item.title or title
        local prefix=date('%H:%M:%S',e.t)..'  '..(J.KindNames[e.kind] or '')..'  '
        if item.milestone then detail=L('查看来源日志 → ')..date('%m-%d %H:%M',e.t)..L(' · 记录 #')..e.seq end
        local b=Row(l.events,n,prefix..title,detail,U.source==e.seq,item.milestone and function()U.Source(e)end or nil)
        local h=math.max(58,b.detail:GetStringHeight()+39);b:SetHeight(h);b:SetPoint('TOPLEFT',0,-y)
        if U.source==e.seq then U.sourceY=y end;y=y+h+5
    end
    if n==0 then local b=Row(l.events,1,L('暂无记录'),U.logTab=='milestones' and L('关键事件出现后，从日志生成里程碑。') or L('进入游戏后的冒险事件会出现在这里。'),false,nil,64);b:SetPoint('TOPLEFT');n=1;y=64 end
    EndRows(l.events,n,y)
    l.storyText:SetShown(U.logTab=='story');l.newer:Show();l.older:Show()
    l.newer:SetText(L('上一页'));l.older:SetText(L('下一页'))
    local pageCount=math.max(1,math.ceil(#entries/PAGE_SIZE))
    if U.logTab=='story' then
        EndRows(l.events,0,1)
        local draft=viewed.drafts and viewed.drafts[U.session]
        local text=draft and (draft.title..'\n\n'..draft.body..'\n\n'..L('已导出：')..(draft.file or '')..'\n'..L('AI 底稿供继续加工，请核对事实与个人感受。')) or U.Preview(viewed,U.session)
        if draft then
            for _,e in ipairs(events) do if J.Matches(e,U.session) and e.seq>draft.through and J.KindNames[e.kind] and e.kind~='heartbeat' and e.kind~='position' then text=L('底稿生成后有新增记录，可再次整理；旧文件会保留。')..'\n\n'..text;break end end
        end
        local pages=U.StoryPages(text);pageCount=#pages;U.page=math.min(math.max(1,U.page),pageCount)
        l.newer:SetEnabled(U.page>1);l.older:SetEnabled(U.page<pageCount)
        l.storyText:SetWidth(math.max(80,l.events:GetWidth()));l.storyText:SetText(pages[U.page])
        l.events.content:SetHeight(math.max(1,l.storyText:GetStringHeight()+20))
    end
    l.hint:SetText(J.SyncStatus(viewed)..'\n'..string.format(L('第 %d / %d 页 · 日记按日期保留，不随同步清除。'),U.page,pageCount)..'\n'..L('正常下线或 /reload 保存；异常退出前未保存的记录可能丢失。'))
    local same=viewed==c
    local noteAllowed=same and db.enabled and (not U.session or U.session==current.id or U.session=='day-'..date('%Y-%m-%d'))
    l.note:SetEnabled(noteAllowed);l.mark:SetEnabled(noteAllowed)
    l.sync:SetEnabled(same and J.CanPlan());l.sync:SetText(pending and not pending.snapshot and L('正在同步日志…') or L('同步新增日志'))
    l.review:SetText(L('生成游记'))
    l.review:SetEnabled(same and U.session~=nil and J.CanPlan());l.cancel:SetShown(pending~=nil)
    if U.logTab=='story' and same and J.DraftStatus()~='' then l.summary:SetText(J.DraftStatus()) end
end

function U.Render()
    if not U.frame or not U.frame:IsVisible() or U.rendering then return end
    local db,c,current,pending=J.Context();if not c then return end
    U.rendering=true
    if U.tab=='tasks' then RenderTasks(c,pending) else RenderLogs(db,c,current,pending) end
    U.rendering=false
end
function U.Show(tab,host)
    if not U.frame then
        host=host or WoWAIAdventurePage;if not host then return end
        U.frame=CreateFrame('Frame','WoWAIAdventureFrame',host);U.frame:SetAllPoints(host)
        BuildTasks(U.frame);BuildLogs(U.frame)
        U.frame:HookScript('OnSizeChanged',function()U.Render()end)
    end
    if tab=='milestones' then U.logTab='milestones';U.page=1 end
    U.tab=tab=='tasks' and 'tasks' or 'log'
    U.tasks:SetShown(U.tab=='tasks');U.logs:SetShown(U.tab=='log')
    local _,c=J.Context();if U.tab=='tasks' and c and not c.plan then J.Plan(false) end
    U.logs.input:ClearFocus();U.frame:Show();U.Render()
end
