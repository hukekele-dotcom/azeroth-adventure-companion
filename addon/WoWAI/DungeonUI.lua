local L = WoWAILocale.Text
local U={preview=1}
WoWAIDungeonUI=U
local D=WoWAIDungeon
local BACK={bgFile='Interface\\ChatFrame\\ChatFrameBackground',edgeFile='Interface\\Tooltips\\UI-Tooltip-Border',tile=true,tileSize=16,edgeSize=12,insets={left=3,right=3,top=3,bottom=3}}
local COLOR={upgrade='|cffffd45e',useful='|cff80dca0',same='|cffd2c4a4',unknown='|cffaaaaaa',low='|cff999999',unusable='|cff888888',active='|cfff1d798',missing='|cffffa860',ready='|cff80dca0',inside='|cff99bbff',done='|cff888888',unavailable='|cff888888'}
local STATUS={active='进行中',ready='可交付',missing='漏接',inside='本内 / 物品接取',unknown='条件待确认',done='已交付',unavailable='当前不可接'}
local FACTION={horde='部落任务',alliance='联盟任务',both='双方可接',unknown='当前角色已接，阵营资料待核实'}
local function Label(p,text,size)
    local f=p:CreateFontString(nil,'OVERLAY','GameFontHighlight');if STANDARD_TEXT_FONT then f:SetFont(STANDARD_TEXT_FONT,size or 14,'')end
    f:SetJustifyH('LEFT');f:SetJustifyV('TOP');f:SetWordWrap(true);f:SetText(text or '');return f
end
local function Box(p,name)
    local f=CreateFrame('Frame',name,p,'BackdropTemplate');f:SetBackdrop(BACK);f:SetBackdropColor(.045,.038,.024,.98);f:SetBackdropBorderColor(.48,.38,.18,1);return f
end
local function Button(p,text,w,fn)
    local b=CreateFrame('Button',nil,p,'UIPanelButtonTemplate');b:SetSize(w,26);b:SetText(text);b:SetScript('OnClick',fn);return b
end
local function Source(item)
    local r=item.ref or {}
    return r.basis=='classic' and L('[经典版参考] ') or (r.dropUnverified or r.basis~='site') and L('[来源待核] ') or ''
end
local function Objective(row)
    local a={};for _,o in ipairs(row.live and row.live.objectives or {})do a[#a+1]=(o.done and '✓ ' or '· ')..(o.text or '')end
    return table.concat(a,'\n')
end
local function ResetRows()
    U.offset=0;U.rowIndex=0
    if U.preparation then U.preparation:Hide()end
end
local function ItemIcon(parent,size)
    local frame=Box(parent);frame:SetSize(size,size)
    frame.image=frame:CreateTexture(nil,'ARTWORK');frame.image:SetPoint('TOPLEFT',3,-3);frame.image:SetPoint('BOTTOMRIGHT',-3,3)
    frame.image:SetTexCoord(.07,.93,.07,.93)
    return frame
end
local function PaintIcon(frame,item)
    frame:SetShown(item~=nil)
    if not item then return end
    frame.image:SetTexture(item.icon or 134400)
    local c=ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[item.quality or 1]
    frame:SetBackdropBorderColor(c and c.r or .6,c and c.g or .6,c and c.b or .6,1)
end
local function Row(title,body,item)
    U.rowIndex=U.rowIndex+1;local r=U.rows[U.rowIndex]
    if not r then
        r=CreateFrame('Button',nil,U.content);r.title=Label(r,'',15);r.title:SetPoint('TOPLEFT',4,-4);r.title:SetPoint('TOPRIGHT',-8,-4)
        r.body=Label(r,'',13);r.body:SetPoint('TOPLEFT',4,-30);r.body:SetPoint('TOPRIGHT',-8,-30);r.body:SetTextColor(.8,.77,.68)
        r.icon=ItemIcon(r,46);r.icon:SetPoint('TOPLEFT',4,-4)
        U.rows[U.rowIndex]=r
    end
    local left=item and 60 or 4;PaintIcon(r.icon,item)
    r:SetWidth(math.max(240,U.scroll:GetWidth()));r.title:ClearAllPoints();r.title:SetPoint('TOPLEFT',left,-4);r.title:SetPoint('TOPRIGHT',-8,-4);r.title:SetText(title);r.body:SetText(body)
    local titleH=math.max(20,r.title:GetStringHeight());r.body:ClearAllPoints();r.body:SetPoint('TOPLEFT',left,-titleH-12);r.body:SetPoint('TOPRIGHT',-8,-titleH-12)
    local h=math.max(item and 60 or 0,titleH+math.max(20,r.body:GetStringHeight())+32);r:SetHeight(h);r:ClearAllPoints();r:SetPoint('TOPLEFT',0,-U.offset);U.offset=U.offset+h;r:Show()
    r:SetScript('OnEnter',item and function(self)GameTooltip:SetOwner(self,'ANCHOR_RIGHT');pcall(GameTooltip.SetHyperlink,GameTooltip,item.link);GameTooltip:Show()end or nil)
    r:SetScript('OnLeave',function()GameTooltip:Hide()end)
    r:SetScript('OnClick',item and function()if IsShiftKeyDown and IsShiftKeyDown() and ChatEdit_InsertLink then ChatEdit_InsertLink(item.link)end end or nil)
end
local function FinishRows()
    for i=U.rowIndex+1,#U.rows do U.rows[i]:Hide()end
    U.content:SetWidth(math.max(240,U.scroll:GetWidth()));U.content:SetHeight(math.max(1,U.offset))
end
local function DisplayedDungeon()
    if D.instanceKey then return D.instance or {id=D.instanceKey,name=D.instanceName,bosses={},quests={},source=L('暂无此副本资料')}end
    return WoWAIDungeonData and WoWAIDungeonData.dungeons[U.preview]
end
local function Build(parent)
    local f=CreateFrame('Frame','WoWAIDungeonPageContent',parent);f:SetAllPoints();U.frame=f
    local side=Box(f);side:SetPoint('TOPLEFT');side:SetPoint('BOTTOMLEFT');side:SetWidth(208)
    U.sideTitle=Label(side,L('副本助手'),16);U.sideTitle:SetPoint('TOPLEFT',12,-14);U.sideTitle:SetPoint('TOPRIGHT',-12,-14)
    U.prev=Button(side,L('上一个'),84,function()local n=#WoWAIDungeonData.dungeons;U.preview=(U.preview-2+n)%n+1;U.boss=nil;U.Render()end);U.prev:SetPoint('TOPLEFT',12,-58)
    U.next=Button(side,L('下一个'),84,function()U.preview=U.preview%#WoWAIDungeonData.dungeons+1;U.boss=nil;U.Render()end);U.next:SetPoint('LEFT',U.prev,'RIGHT',8,0)
    U.taskButton=Button(side,L('任务检查'),180,function()U.mode=nil;U.boss=nil;U.allLoot=false;U.scroll:SetVerticalScroll(0);D.Refresh();U.Render()end);U.taskButton:SetPoint('TOPLEFT',12,-96)
    U.allLootButton=Button(side,L('全部掉落'),180,function()U.mode=nil;U.boss=nil;U.allLoot=true;U.scroll:SetVerticalScroll(0);U.Render()end);U.allLootButton:SetPoint('TOPLEFT',12,-130)
    U.mapButton=Button(side,L('副本地图'),180,function()U.mode='map';U.boss=nil;U.allLoot=false;U.Render()end);U.mapButton:SetPoint('TOPLEFT',12,-164)
    U.checklistButton=Button(side,L('本次目标清单'),180,function()U.mode='checklist';U.boss=nil;U.allLoot=false;U.scroll:SetVerticalScroll(0);U.Render()end);U.checklistButton:SetPoint('TOPLEFT',12,-198)
    U.bossButtons={}
    U.bossScroll=CreateFrame('ScrollFrame',nil,side,'UIPanelScrollFrameTemplate');U.bossScroll:SetPoint('TOPLEFT',12,-234);U.bossScroll:SetPoint('BOTTOMRIGHT',-28,10)
    U.bossContent=CreateFrame('Frame',nil,U.bossScroll);U.bossContent:SetSize(160,1);U.bossScroll:SetScrollChild(U.bossContent)
    local right=Box(f);right:SetPoint('TOPLEFT',side,'TOPRIGHT',10,0);right:SetPoint('BOTTOMRIGHT')
    U.title=Label(right,L('副本助手'),18);U.title:SetPoint('TOPLEFT',14,-14);U.title:SetPoint('TOPRIGHT',-145,-14)
    U.alerts=Button(right,L('浮窗：开'),112,function()local s=D.Settings();s.alerts=not s.alerts;D.taskDismissed=false;D.Refresh()end);U.alerts:SetPoint('TOPRIGHT',-12,-10)
    U.summary=Label(right,'',13);U.summary:SetPoint('TOPLEFT',14,-46);U.summary:SetPoint('TOPRIGHT',-14,-46);U.summary:SetHeight(42)
    U.scroll=CreateFrame('ScrollFrame',nil,right,'UIPanelScrollFrameTemplate');U.scroll:SetPoint('TOPLEFT',14,-96);U.scroll:SetPoint('BOTTOMRIGHT',-32,14)
    U.content=CreateFrame('Frame',nil,U.scroll);U.content:SetSize(500,1);U.scroll:SetScrollChild(U.content);U.rows={}
    U.preparation=Label(U.content,'',13);U.preparation:SetPoint('TOPLEFT',4,-4);U.preparation:SetTextColor(.95,.83,.52)
    if WoWAIDungeonMap then
        U.mapFrame=WoWAIDungeonMap.Create(right,function(boss)U.mode=nil;U.boss=boss;U.allLoot=false;U.scroll:SetVerticalScroll(0);U.Render()end)
        U.mapFrame:SetPoint('TOPLEFT',14,-96);U.mapFrame:SetPoint('BOTTOMRIGHT',-14,14);U.mapFrame:Hide()
    end
    U.scroll:HookScript('OnSizeChanged',function()if U.frame:IsVisible()then U.Render()end end)
end
local function BuildHUD()
    local f=CreateFrame('Frame','WoWAIDungeonHUD',UIParent);U.hud=f;f:SetSize(370,492);f:SetFrameStrata('MEDIUM');f:SetClampedToScreen(true);f:SetMovable(true)
    local s=D.Settings();if s.point then f:SetPoint(s.point,UIParent,s.relPoint or s.point,s.x or 0,s.y or 0)else f:SetPoint('TOPLEFT',UIParent,'TOPLEFT',280,-180)end
    for _,key in ipairs({'task','boss'})do
        local p=Box(f);p:SetWidth(370);p:SetHeight(206);U[key..'HUD']=p
        p:SetPoint('TOPLEFT',0,key=='task' and 0 or -214);p:EnableMouse(true);p:RegisterForDrag('LeftButton')
        p:SetScript('OnDragStart',function()f:StartMoving()end);p:SetScript('OnDragStop',function()f:StopMovingOrSizing();local point,_,relative,x,y=f:GetPoint();s.point,s.relPoint,s.x,s.y=point,relative,x,y end)
        p.title=Label(p,key=='task' and L('副本任务') or L('首领掉落'),15);p.title:SetPoint('TOPLEFT',12,-10);p.title:SetPoint('TOPRIGHT',-35,-10)
        p.body=Label(p,'',13);p.body:SetPoint('TOPLEFT',12,-36);p.body:SetPoint('BOTTOMRIGHT',-12,40)
        p.close=Button(p,'×',24,function()if key=='task'then D.taskVisible=false;D.taskDismissed=true else D.bossVisible=false end;U.Render()end);p.close:SetPoint('TOPRIGHT',-6,-6)
        p.details=Button(p,L('查看详情'),100,function()U.mode=key=='task' and 'checklist' or nil;U.lastDungeon=D.instance and D.instance.id;U.allLoot=false;U.boss=key=='boss' and D.boss or nil;WoWAI.SelectTab('dungeon')end);p.details:SetPoint('BOTTOMRIGHT',-10,9)
        if key=='boss' then
            p:SetHeight(278);p.body:ClearAllPoints();p.body:SetPoint('TOPLEFT',12,-36);p.body:SetPoint('TOPRIGHT',-12,-36);p.body:SetHeight(32)
            p.items={}
            for i=1,3 do
                local row=CreateFrame('Button',nil,p);row:SetPoint('TOPLEFT',12,-72-(i-1)*54);row:SetPoint('TOPRIGHT',-12,-72-(i-1)*54);row:SetHeight(50)
                row.icon=ItemIcon(row,42);row.icon:SetPoint('TOPLEFT');row.text=Label(row,'',12);row.text:SetPoint('TOPLEFT',50,-2);row.text:SetPoint('BOTTOMRIGHT',0,0)
                row:SetScript('OnEnter',function(self)if self.item then GameTooltip:SetOwner(self,'ANCHOR_RIGHT');pcall(GameTooltip.SetHyperlink,GameTooltip,self.item.link);GameTooltip:Show()end end)
                row:SetScript('OnLeave',function()GameTooltip:Hide()end);p.items[i]=row
            end
        end
    end
end
function U.RenderHUD()
    if not U.hud then BuildHUD()end
    local visible=D.Settings().alerts~=false and D.instanceKey~=nil
    U.hud:SetShown(visible);U.taskHUD:SetShown(visible and D.taskVisible==true);U.bossHUD:SetShown(visible and D.bossVisible==true)
    U.bossHUD:ClearAllPoints();U.bossHUD:SetPoint('TOPLEFT',0,D.taskVisible and -214 or 0)
    if not visible then return end
    U.taskHUD.title:SetText(L('副本任务 · ')..D.instanceName)
    local lines={D.Summary()};local n=0
    for _,r in ipairs(D.rows)do if r.status=='active' or r.status=='missing' or r.status=='inside' then
        n=n+1;if n<=2 then lines[#lines+1]=(COLOR[r.status]or'')..(r.live and r.live.title or WoWAILocale.Field(r.quest))..'|r · '..r.reason
            if r.status=='active' then lines[#lines+1]=Objective(r)~='' and Objective(r) or WoWAILocale.Field(r.quest,'instructions') end
        end
    end end
    if n>2 then lines[#lines+1]=L('其余 ')..(n-2)..L(' 项见详情') end
    U.taskHUD.body:SetText(table.concat(lines,'\n'))
    if D.boss then
        U.bossHUD.title:SetText(L('首领掉落 · ')..WoWAILocale.Field(D.boss))
        local loot=D.Loot(D.boss);local p=WoWAIGear.Profile();local a={p.className..' · '..p.name..L('（自动）')}
        for i,row in ipairs(U.bossHUD.items)do
            local r=loot[i];row:SetShown(r~=nil);row.item=r and r.item
            if r then
                PaintIcon(row.icon,r.item)
                local prefix=r.item.ref.basis=='classic' and L('[经典版参考] ') or (r.item.ref.dropUnverified or r.item.ref.basis~='site') and L('[来源待核] ') or ''
                row.text:SetText((COLOR[r.status]or'')..prefix..r.item.name..'|r\n'..r.text)
            end
        end
        if #loot==0 then a[#a+1]=L('尚无可靠掉落记录，待补充。')end
        U.bossHUD.body:SetText(table.concat(a,'\n'))
    end
end
function U.Render(force)
    U.RenderHUD()
    if not U.frame or (not force and not U.frame:IsVisible())then return end
    local d=DisplayedDungeon();if not d then return end
    if U.lastDungeon~=d.id then U.boss=nil;U.allLoot=false;U.lastDungeon=d.id;U.scroll:SetVerticalScroll(0);U.bossScroll:SetVerticalScroll(0)end
    U.sideTitle:SetText(WoWAILocale.Field(d));U.prev:SetEnabled(not D.instanceKey);U.next:SetEnabled(not D.instanceKey)
    U.taskButton:SetText(D.instanceKey and L('任务检查') or L('进本前检查'))
    U.alerts:SetText(D.Settings().alerts==false and L('浮窗：关') or L('浮窗：开'))
    for i,b in ipairs(d.bosses)do
        local button=U.bossButtons[i]
        if not button then button=Button(U.bossContent,'',160,nil);button:SetPoint('TOPLEFT',0,-(i-1)*34);U.bossButtons[i]=button end
        local number=WoWAIDungeonMap and WoWAIDungeonMap.Number(d,b)
        local bundled=WoWAIDungeonAtlas and WoWAIDungeonAtlas[d.id]
        button:SetText((number and tostring(number)..'. ' or (not bundled and i..'. ' or ''))..WoWAILocale.Field(b));button:SetScript('OnClick',function()U.mode=nil;U.boss=b;U.allLoot=false;U.scroll:SetVerticalScroll(0);U.Render()end);button:Show()
    end
    for i=#d.bosses+1,#U.bossButtons do U.bossButtons[i]:Hide()end
    U.bossContent:SetHeight(math.max(1,#d.bosses*34))
    ResetRows()
    if U.mapFrame then U.mapFrame:Hide() end;U.scroll:Show()
    if U.mode=='map' then
        U.title:SetText(WoWAILocale.Field(d)..' · '..L('副本地图'));U.summary:SetText(L('按楼层查看；首领编号可打开掉落详情。'))
        if U.mapFrame then U.scroll:Hide();WoWAIDungeonMap.Show(U.mapFrame,d);return end
        Row(L('副本地图待补充'),L('请重新加载插件以启用副本地图。'))
    elseif U.mode=='checklist' then
        local checked,counts,complete=D.Check(d);local active=0
        U.title:SetText(WoWAILocale.Field(d)..' · '..L('本次目标清单'));U.summary:SetText(D.Summary(d,counts))
        for _,r in ipairs(checked) do
            if r.live and r.status=='active' then
                local lines={}
                for _,o in ipairs(r.live.objectives or {}) do if not o.done then lines[#lines+1]='· '..(o.text or '') end end
                if #lines==0 then lines[1]=WoWAILocale.Field(r.quest,'instructions') end
                Row(r.live.title,table.concat(lines,'\n'));active=active+1
            end
        end
        if not complete then Row(L('任务列表正在读取'),L('任务列表暂不完整，暂不能判断目标是否全部完成。'))
        elseif active==0 then Row(L('没有待完成的已接目标'),L('已完成目标会自动移出清单；漏接、前置条件和交付地点请查看任务检查。')) end
    elseif U.boss or U.allLoot then
        U.title:SetText(U.allLoot and (WoWAILocale.Field(d)..' · '..L('全部掉落')) or (WoWAILocale.Field(U.boss)..L(' · 掉落')));local p=WoWAIGear.Profile();U.summary:SetText(p.className..' · '..p.name..' · '..p.points..L(' 点主系天赋')..'\n'..WoWAIGear.Guidance(p))
        local loot=D.Loot(U.boss,d,U.allLoot)
        for _,r in ipairs(loot)do
            local a={r.text};if r.compare then a[#a+1]=L('对比：')..r.compare end;if r.detail then a[#a+1]=r.detail end
            local reference=WoWAILocale.Get()=='enUS' and r.item.ref.referenceLinesEn or r.item.ref.referenceLines
            if reference then for _,line in ipairs(reference)do a[#a+1]=WoWAILocale.Reference(line)end
            else for _,s in ipairs(r.item.ref.stats or {})do a[#a+1]='+'..tostring(s.value)..' '..L(s.label) end end
            for _,e in ipairs((WoWAILocale.Get()=='enUS' and r.item.ref.effectsEn or r.item.ref.effects) or {})do a[#a+1]=WoWAILocale.Reference(e.text or '') end
            a[#a+1]=Source(r.item)..L(' · 装备需求 ')..r.item.level..L(' 级')
            local origins={};for _,key in ipairs(r.item.ref.bosses or {})do for _,b in ipairs(d.bosses)do if b.key==key then origins[#origins+1]=WoWAILocale.Field(b)end end end
            a[#a+1]=L('掉落来源：')..(#origins>0 and table.concat(origins,' / ') or (WoWAILocale.Field(r.item.ref,'from')~='' and WoWAILocale.Field(r.item.ref,'from') or L('具体来源待核实')))
            Row((COLOR[r.status]or'')..r.item.name..'|r',table.concat(a,'\n'),r.item)
        end
        if #loot==0 then Row(L('掉落资料待补充'),L('当前资料没有可靠的首领掉落归属，暂不推荐物品。'))end
    else
        local checked,counts
        if D.instanceKey then checked,counts=D.rows,D.counts else checked,counts=D.Check(d)end
        local side=D.PlayerFaction();local scope=side=='horde' and L('部落 / 双方任务') or side=='alliance' and L('联盟 / 双方任务') or L('角色阵营待读取')
        U.title:SetText(WoWAILocale.Field(d)..L(' · 任务'));U.summary:SetText(scope..' · '..(D.instanceKey and '' or L('进本前检查 · '))..D.Summary(d,counts))
        local prep=D.Preparation(d,checked,counts)
        U.preparation:SetWidth(math.max(220,U.scroll:GetWidth()-16))
        U.preparation:SetText(L('集中清任务建议')..'\n'..prep.text);U.preparation:Show()
        U.offset=math.max(24,U.preparation:GetStringHeight())+24
        do
            local rank={missing=1,active=2,inside=3,unknown=4,ready=5,unavailable=6,done=7};local rows={};for _,r in ipairs(checked)do rows[#rows+1]=r end;table.sort(rows,function(a,b)if rank[a.status]~=rank[b.status]then return rank[a.status]<rank[b.status]end;return a.quest.id<b.quest.id end)
            for _,r in ipairs(rows)do
                local q=r.quest;local a={L(FACTION[r.faction] or '阵营待核实')..' · '..r.reason,D.LevelText(q),L('接取：')..WoWAILocale.Field(q,'from'),WoWAILocale.Field(q,'instructions')};if q.prerequisites and q.prerequisites~='' then a[#a+1]=L('前置链：')..WoWAILocale.Field(q,'prerequisites') end
                local prerequisites=D.PrerequisiteText(q);if prerequisites~='' then a[#a+1]=prerequisites end
                if q.pickupDetails and q.pickupDetails~=q.from then a[#a+1]=L('接取位置详情：')..WoWAILocale.Field(q,'pickupDetails')end
                if q.turnIn then a[#a+1]=L('交付：')..WoWAILocale.Field(q,'turnIn')end
                if q.basis=='classic' then a[1]=a[1]..' · '..L('[经典版参考] ')end
                if r.status=='active' then a[#a+1]=Objective(r)end
                for i,s in ipairs(q.steps or {})do
                    a[#a+1]=L('前置步骤 ')..i..'：'..WoWAILocale.Field(s)..(s.optional and L('（可选）') or '')..'\n'..WoWAILocale.Field(s,'from')..'\n'..WoWAILocale.Field(s,'instructions')
                end
                for _,s in ipairs(q.followups or {})do if s.faction==side or s.faction=='both' then a[#a+1]=L('后续任务：')..WoWAILocale.Field(s)..' · '..WoWAILocale.Field(s,'from')..'\n'..WoWAILocale.Field(s,'instructions')end end
                if q.xp then a[#a+1]=L('参考经验：')..q.xp end
                if q.rep then a[#a+1]=L('声望：')..WoWAILocale.Field(q,'rep')end
                if q.rewardNote then a[#a+1]=WoWAILocale.Field(q,'rewardNote')end
                Row((COLOR[r.status]or'')..'['..L(STATUS[r.status])..'] '..(r.live and r.live.title or WoWAILocale.Field(q))..'|r',table.concat(a,'\n'))
                for _,reward in ipairs(q.rewards or {})do
                    local item=WoWAIGear.Item(reward);local info={}
                    for _,s in ipairs(reward.stats or {})do info[#info+1]='+'..s.value..' '..L(s.label)end
                    Row(L('任务奖励：')..item.name,table.concat(info,'\n'),item)
                end
            end
        end
        if (counts.factionUnknown or 0)>0 then Row(L('阵营待核实：')..counts.factionUnknown..L(' 项'),'')end
        if #checked==0 and #d.quests>0 and (counts.factionUnknown or 0)==0 then Row(L('暂无适合当前阵营的已收录任务'),L('对方阵营的任务已隐藏。'))end
        if #d.quests==0 then Row(L('任务资料待补充'),L('暂不能判断是否接满。'))end
    end
    FinishRows()
end
function U.Show(parent)
    if not U.frame then Build(parent)end
    U.frame:Show();U.Render(true)
end
