local L = WoWAILocale.Text
-- Local, conservative stat comparison. These weights are a leveling aid, not a simulation.
local G = {}
WoWAIGear = G
local Unpack=unpack or table.unpack
local function Pack(...) return {n=select('#',...),...} end
function G.Read(fn, ...)
    if type(fn)~='function' then return end
    local r=Pack(pcall(fn,...))
    if not r[1] then return end
    for i=2,r.n do if issecretvalue and issecretvalue(r[i]) then return end end
    return Unpack(r,2,r.n)
end
local Read=G.Read
local CLASSES={WARRIOR=1,PALADIN=2,HUNTER=3,ROGUE=4,PRIEST=5,SHAMAN=7,MAGE=8,WARLOCK=9,DRUID=11}
local TREES={MAGE={'caster','caster','caster'},WARLOCK={'caster','caster','caster'},PRIEST={'healer','healer','caster'},DRUID={'caster','feral','healer'},SHAMAN={'caster','melee','healer'},PALADIN={'healer','tank','strength'},WARRIOR={'strength','strength','tank'},ROGUE={'melee','melee','melee'},HUNTER={'ranged','ranged','ranged'}}
local WEIGHTS={
 caster={int=0.5,spirit=0.15,stamina=0.1,spell=1,spellCrit=10,spellHit=12,mp5=1.5},
 healer={int=0.8,spirit=0.6,stamina=0.1,healing=1,spell=0.3,spellCrit=6,mp5=3},
 melee={agility=1,strength=0.5,stamina=0.15,ap=0.5,crit=10,hit=12,dps=3},
 strength={strength=1,agility=0.6,stamina=0.2,ap=0.5,crit=10,hit=12,dps=3},
 ranged={agility=1,int=0.15,stamina=0.15,rap=0.5,ap=0.3,crit=10,hit=12,rangedDps=4},
 tank={stamina=1,strength=0.45,agility=0.5,armor=0.03,defense=1,dodge=8,parry=8,block=5,ap=0.2,dps=1},
 feral={agility=1,strength=0.8,stamina=0.5,armor=0.01,ap=0.5,crit=10,hit=12},
}
local function Points(p) return type(p)=='number' and p>=0 and p<=1000 and p==math.floor(p) end
function G.TalentTabs()
    local S=C_SpecializationInfo;local result={}
    -- Use player specialization data before compatibility globals, which can
    -- return names but omit ranks (or report zero talent tabs on Forever).
    for i=1,3 do
        local tn,p,source
        for _,fn in ipairs({S and S.GetSpecializationInfo or false,GetSpecializationInfo or false})do
            if type(fn)=='function' then
                local a,n,_,_,_,_,v=Read(fn,i)
                if type(a)=='table' then n,v=a.name,a.pointsSpent end
                if type(n)=='string' and Points(v) then tn,p,source=n,v,'specialization';break end
            end
        end
        if not Points(p) then
            local a,b,c,_,e=Read(GetTalentTabInfo,i)
            if type(a)=='table' then tn,p=a.name,a.pointsSpent
            elseif type(a)=='string' then tn,p=a,c
            else tn,p=b,e end
            source='talent-tabs'
        end
        if not Points(p) and type(GetNumTalents)=='function' and type(GetTalentInfo)=='function' then
            local count=Read(GetNumTalents,i);local total,complete=0,true
            if type(count)=='number' and count>0 and count<=100 then
                for j=1,count do
                    local _,_,_,_,rank=Read(GetTalentInfo,i,j)
                    if Points(rank) then total=total+rank else complete=false end
                end
                if complete then p,source=total,'talent-ranks' end
            end
        end
        result[i]={name=type(tn)=='string' and tn or nil,points=Points(p) and p or nil,source=source}
    end
    return result
end
function G.Profile()
    local className,class,classID=Read(UnitClass,'player');class=class or 'UNKNOWN';classID=classID or CLASSES[class]
    local best,points,name,tied=nil,0,nil,false;local tabs=G.TalentTabs();local complete=true
    for i,t in ipairs(tabs)do
        local p=t.points;if p==nil then complete=false
        elseif p>points then best,points,name,tied=i,p,t.name,false
        elseif p>0 and p==points then tied=true end
    end
    local certain=best~=nil and not tied and complete
    local mode=TREES[class] and TREES[class][best or 1] or 'caster'
    if not certain then name=L('天赋未确定');mode=TREES[class] and TREES[class][1] or 'caster' end
    local school=certain and (class=='MAGE' and ({'arcane','fire','frost'})[best] or class=='PRIEST' and best==3 and 'shadow' or class=='WARLOCK' and 'shadow' or class=='SHAMAN' and best==1 and 'nature') or nil
    return {class=class,classID=classID,className=className or class,tree=best,mode=mode,weights=WEIGHTS[mode],school=school,certain=certain,name=name or L('天赋未读取'),points=points,tabs=tabs,level=Read(UnitLevel,'player') or 0}
end
function G.Guidance(p)
    if not p.certain then
        if p.class=='MAGE' or p.class=='WARLOCK' then return L('先关注智力、法术伤害；主天赋确认后再比较对应法术属性。') end
        return L('先核对职业与装备类型；主天赋确认后再判断属性收益。')
    end
    return L(({caster='优先关注法术伤害与智力；耐力兼顾生存。',healer='优先关注治疗效果、智力与法力回复。',tank='优先关注耐力、护甲与防御属性。',melee='优先关注敏捷、攻击强度与命中。',strength='优先关注力量、攻击强度与命中。',ranged='优先关注敏捷、远程攻击强度与命中。',feral='优先关注敏捷与力量；熊形态还需兼顾耐力和护甲。'})[p.mode])
end
local STAT_KEYS={ITEM_MOD_INTELLECT_SHORT='int',ITEM_MOD_SPIRIT_SHORT='spirit',ITEM_MOD_STAMINA_SHORT='stamina',ITEM_MOD_STRENGTH_SHORT='strength',ITEM_MOD_AGILITY_SHORT='agility',ITEM_MOD_SPELL_POWER_SHORT='spell',ITEM_MOD_SPELL_DAMAGE_DONE_SHORT='spell',ITEM_MOD_SPELL_HEALING_DONE_SHORT='healing',ITEM_MOD_ATTACK_POWER_SHORT='ap',ITEM_MOD_RANGED_ATTACK_POWER_SHORT='rap',RESISTANCE0_NAME='armor',ITEM_MOD_MANA_REGENERATION_SHORT='mp5'}
local CN={['智力']='int',['精神']='spirit',['耐力']='stamina',['力量']='strength',['敏捷']='agility'}
local SCHOOLS={['奥术']='arcane',['火焰']='fire',['冰霜']='frost',['暗影']='shadow',['自然']='nature',['神圣']='holy'}
for key,value in pairs({ARCANE='arcane',FIRE='fire',FROST='frost',SHADOW='shadow',NATURE='nature',HOLY='holy'})do STAT_KEYS['ITEM_MOD_'..key..'_DAMAGE_SHORT']=value end
local SLOT={['头部']='INVTYPE_HEAD',['颈部']='INVTYPE_NECK',['肩部']='INVTYPE_SHOULDER',['背部']='INVTYPE_CLOAK',['胸部']='INVTYPE_CHEST',['手腕']='INVTYPE_WRIST',['手部']='INVTYPE_HAND',['腰部']='INVTYPE_WAIST',['腿部']='INVTYPE_LEGS',['脚']='INVTYPE_FEET',['手指']='INVTYPE_FINGER',['饰品']='INVTYPE_TRINKET',['主手']='INVTYPE_WEAPONMAINHAND',['单手']='INVTYPE_WEAPON',['双手']='INVTYPE_2HWEAPON',['副手']='INVTYPE_SHIELD',['副手物品']='INVTYPE_HOLDABLE',['远程']='INVTYPE_RANGED',['投掷']='INVTYPE_THROWN'}
local SLOTS={INVTYPE_HEAD={1},INVTYPE_NECK={2},INVTYPE_SHOULDER={3},INVTYPE_CHEST={5},INVTYPE_ROBE={5},INVTYPE_WAIST={6},INVTYPE_LEGS={7},INVTYPE_FEET={8},INVTYPE_WRIST={9},INVTYPE_HAND={10},INVTYPE_FINGER={11,12},INVTYPE_TRINKET={13,14},INVTYPE_CLOAK={15},INVTYPE_WEAPON={16},INVTYPE_WEAPONMAINHAND={16},INVTYPE_2HWEAPON={16,17},INVTYPE_WEAPONOFFHAND={17},INVTYPE_SHIELD={17},INVTYPE_HOLDABLE={17},INVTYPE_RANGED={18},INVTYPE_RANGEDRIGHT={18},INVTYPE_THROWN={18},INVTYPE_RELIC={18}}
local ARMOR={['布甲']=1,['皮甲']=2,['锁甲']=3,['板甲']=4,['盾牌']=6}
local WEAPON={['斧']=0,['弓']=2,['枪械']=3,['锤']=4,['长柄武器']=6,['剑']=7,['法杖']=10,['拳套']=13,['匕首']=15,['投掷武器']=16,['弩']=18,['魔杖']=19}
local ALLOWED={MAGE={7,10,15,19},WARLOCK={7,10,15,19},PRIEST={4,10,15,19},DRUID={4,5,6,10,13,15},ROGUE={0,4,7,13,15,2,3,16,18},HUNTER={0,1,2,3,6,7,8,10,13,15,18},SHAMAN={0,1,4,5,10,13,15},PALADIN={0,1,4,5,6,7,8},WARRIOR={0,1,2,3,4,5,6,7,8,10,13,15,16,18}}
local function Contains(t,value) for _,v in ipairs(t or {})do if v==value then return true end end return false end
local function Add(s,k,v) if k and tonumber(v) then s[k]=(s[k] or 0)+tonumber(v) end end
local function Effects(item,effects)
    for _,e in ipairs(effects or {}) do
        local t=e.text or '';local n
        -- Only passive, explicit numeric effects. Never treat damage procs as spell power.
        if e.trigger~=1 then item.special=true
        elseif t:find('治疗效果，最多') and t:find('伤害效果最多') then
            Add(item.stats,'healing',t:match('治疗效果，最多(%d+)'));Add(item.stats,'spell',t:match('伤害效果最多(%d+)'))
        elseif t:find('法术和魔法效果所造成的伤害和治疗效果') then
            n=t:match('最多(%d+)');Add(item.stats,'spell',n);Add(item.stats,'healing',n)
        elseif t:find('攻击强度') then Add(item.stats,t:find('远程') and 'rap' or 'ap',t:match('(%d+)'))
        elseif t:find('每5秒') and t:find('法力') then Add(item.stats,'mp5',t:match('恢复(%d+)'))
        else
            local found=false
            for cn,key in pairs(SCHOOLS)do if t:find(cn..'法术') and t:find('伤害') and t:find('最多') then Add(item.stats,key,t:match('最多(%d+)'));found=true end end
            if not found then item.special=true end
        end
        if e.uncertain then item.special=true end
    end
end
function G.Item(ref,link)
    ref=ref or {};local id=ref.id or (type(link)=='string' and tonumber(link:match('item:(%d+)')));link=link or ('item:'..tostring(id or 0))
    local info= C_Item and C_Item.GetItemInfo or GetItemInfo
    local name,itemLink,quality,ilvl,level,typ,sub,_,equip,icon,_,classID,subID=Read(info,link)
    local _,_,_,instantEquip,instantIcon,instantClass,instantSub=Read(C_Item and C_Item.GetItemInfoInstant or GetItemInfoInstant,link)
    equip=equip or instantEquip;classID=classID or instantClass;subID=subID or instantSub
    icon=icon or instantIcon or Read(C_Item and C_Item.GetItemIconByID,id) or Read(GetItemIcon,id)
    local item={id=id or tonumber(link:match('item:(%d+)')),name=name or (ref.name and WoWAILocale.Field(ref)) or link,link=itemLink or link,quality=quality or ref.quality,ilvl=ilvl or ref.ilvl,level=level or ref.level or 0,equip=equip or SLOT[ref.slot],classID=classID,subID=subID,stats={},icon=icon or ref.icon or 134400,iconKnown=icon~=nil or ref.icon~=nil,live=name~=nil,ref=ref}
    if not item.classID then
        if ARMOR[ref.type] then item.classID,item.subID=4,ARMOR[ref.type]
        elseif WEAPON[ref.type] then item.classID,item.subID=2,WEAPON[ref.type];if ref.slot=='双手' and Contains({0,4,7},item.subID)then item.subID=item.subID+1 end end
    end
    local stats=Read(C_Item and C_Item.GetItemStats,item.link) or Read(GetItemStats,item.link)
    if type(stats)=='table' then
        item.statsKnown=true
        for k,v in pairs(stats)do if not (issecretvalue and issecretvalue(v)) then
            if STAT_KEYS[k] then Add(item.stats,STAT_KEYS[k],v)
            elseif k:find('RATING') then item.special=true end
        end end
    else
        for _,s in ipairs(ref.stats or {})do Add(item.stats,CN[s.label],s.value) end
        if ref.armor then Add(item.stats,'armor',ref.armor)end
        Effects(item,ref.effects)
        item.statsKnown=false;item.referenceStats=ref.id~=nil
    end
    if ref.weapon and ref.weapon.dps then item.stats[Contains({'INVTYPE_RANGED','INVTYPE_RANGEDRIGHT','INVTYPE_THROWN'},item.equip) and 'rangedDps' or 'dps']=ref.weapon.dps end
    -- Tooltip lines identify unscored procs/set bonuses on equipped and candidate items.
    local tip=Read(C_TooltipInfo and C_TooltipInfo.GetHyperlink,item.link)
    if type(tip)=='table' and tip.lines then for _,line in ipairs(tip.lines)do
        local t=line.leftText
        if not (issecretvalue and issecretvalue(t)) and type(t)=='string' and (t:find('击中时') or t:find('使用：') or t:find('触发') or t:find('套装') or t:find('Chance on hit') or t:find('Use:') or t:find('Set:')) then item.special=true end
    end end
    if ref.set or ref.uncertain or Read(C_Item and C_Item.GetItemSpell or GetItemSpell,item.link) then item.special=true end
    local probe={stats={}};Effects(probe,ref.effects);item.special=item.special or probe.special
    if (not name or not item.statsKnown or not item.iconKnown) and id and C_Item and C_Item.RequestLoadItemDataByID then
        G.requested=G.requested or {};local r=G.requested[id];local now=Read(GetTime) or 0
        if not r or (type(r)=='table' and r.attempts<3 and now-r.time>=10) then
            G.requested[id]={time=now,attempts=type(r)=='table' and r.attempts+1 or 1};Read(C_Item.RequestLoadItemDataByID,id)
        end
    end
    return item
end
function G.Usable(item,p)
    local ref=item.ref or {}
    if item.level>p.level then return false,L('需要 ')..item.level..L(' 级') end
    if type(ref.classes)=='table' and #ref.classes>0 then
        local ok=false;for _,c in ipairs(ref.classes)do if c==p.class or c==p.className or c==p.classID then ok=true end end
        if not ok then return false,L('职业限制') end
    elseif type(ref.classes)=='string' and ref.classes~='' then
        -- Reference class restrictions use Chinese names; compare stable class tokens too.
        local names={WARRIOR='战士',PALADIN='圣骑士',HUNTER='猎人',ROGUE='潜行者',PRIEST='牧师',SHAMAN='萨满祭司',MAGE='法师',WARLOCK='术士',DRUID='德鲁伊'}
        local cn=names[p.class]
        if not ref.classes:find(p.className,1,true) and not ref.classes:find(p.class,1,true) and not (cn and ref.classes:find(cn,1,true)) then return false,L('职业限制') end
    end
    if item.classID==4 and item.subID then
        local max=({MAGE=1,WARLOCK=1,PRIEST=1,DRUID=2,ROGUE=2,HUNTER=p.level>=40 and 3 or 2,SHAMAN=p.level>=40 and 3 or 2,WARRIOR=p.level>=40 and 4 or 3,PALADIN=p.level>=40 and 4 or 3})[p.class]
        if item.subID<=4 and max and item.subID>max then return false,L('当前职业不能穿戴此护甲') end
        if item.subID==6 and not Contains({'WARRIOR','PALADIN','SHAMAN'},p.class) then return false,L('当前职业不能使用盾牌') end
    elseif item.classID==2 and item.subID and not Contains(ALLOWED[p.class],item.subID) then return false,L('当前职业不能使用此武器') end
    if not SLOTS[item.equip or ''] then return nil,L('不是可比较的装备') end
    if ref.skill then return nil,L('需要核对装备所需技能') end
    return true
end
function G.Score(item,p)
    local score=0;for k,v in pairs(item.stats)do score=score+v*(p.weights[k] or 0)end
    if p.school then score=score+(item.stats[p.school] or 0) end
    return score
end
local function Result(status,text,item,p,extra)
    local r=extra or {};r.status,r.text,r.item,r.profile=status,text,item,p;return r
end
local function Inventory(slot)
    if type(GetInventoryItemLink)~='function' then return nil,false end
    local ok,link=pcall(GetInventoryItemLink,'player',slot)
    if not ok or (issecretvalue and issecretvalue(link)) then return nil,false end
    if not link and Read(GetInventoryItemID,'player',slot) then return nil,false end
    return link,true
end
function G.Compare(ref,p)
    p=p or G.Profile();local item=G.Item(ref);local usable,why=G.Usable(item,p)
    if usable==false then return Result('unusable',why,item,p) end
    if usable==nil then return Result('unknown',why,item,p) end
    local score=G.Score(item,p)
    if not p.certain then return Result('unknown',L('当前天赋未确定；暂不判定升级'),item,p,{detail=G.Guidance(p)}) end
    if not item.live or not item.statsKnown then return Result(score>0 and 'useful' or 'unknown',L('属性缓存待载入；可查看参考属性'),item,p,{detail=G.Guidance(p)})end
    if not GetInventoryItemLink then return Result('unknown',L('当前装备尚未读取'),item,p)end
    local slots=SLOTS[item.equip];local baseline=0;local names={};local special=item.special
    local twoHand=item.equip=='INVTYPE_2HWEAPON'
    local multi=item.equip=='INVTYPE_FINGER' or item.equip=='INVTYPE_TRINKET'
    local chosen
    for _,slot in ipairs(slots)do
        local link,known=Inventory(slot)
        if not known then return Result('unknown',L('当前装备缓存待载入'),item,p)end
        local s=0;local nm=L('空栏位');local old
        if link then
            old=G.Item(nil,link);if not old.live or not old.statsKnown then return Result('unknown',L('当前装备属性待载入'),item,p)end
            s=G.Score(old,p);nm=old.name;special=special or old.special
        end
        if multi then if not chosen or s<baseline then baseline=s;names={nm};chosen=slot end
        else baseline=baseline+s;names[#names+1]=nm;chosen=slot end
    end
    -- Unique rings/trinkets may replace only their existing copy, not the weaker second slot.
    if multi then
        local unique,_,_,category=Read(C_Item and C_Item.GetItemUniquenessByID,ref.id)
        if unique or ref.unique then for _,slot in ipairs(slots)do
            local link=Read(GetInventoryItemLink,'player',slot)
            if link and tonumber(link:match('item:(%d+)'))==ref.id then return Result('same',L('已装备同款唯一物品'),item,p)end
            if link and category and category>0 then
                local _,_,_,otherCategory=Read(C_Item and C_Item.GetItemUniquenessByID,tonumber(link:match('item:(%d+)')))
                if otherCategory==category then return Result('useful',L('唯一类别限制；需替换同类别物品再比较'),item,p)end
            end
        end end
    end
    if item.equip=='INVTYPE_HOLDABLE' or item.equip=='INVTYPE_SHIELD' or item.equip=='INVTYPE_WEAPONOFFHAND' or item.equip=='INVTYPE_WEAPON' or item.equip=='INVTYPE_WEAPONMAINHAND' then
        local main=Read(GetInventoryItemLink,'player',16)
        if main and G.Item(nil,main).equip=='INVTYPE_2HWEAPON' then return Result('useful',L('需搭配另一手，与现用双手武器整套比较'),item,p)end
    end
    if item.classID==2 and (p.mode=='melee' or p.mode=='strength' or p.mode=='ranged' or p.mode=='tank') then return Result('useful',L('武器需结合伤害、速度及双持整套比较'),item,p)end
    local delta=score-baseline;local detail=string.format(L('基础属性评分 %.1f → %.1f（%+.1f）'),baseline,score,delta)
    local extra={delta=delta,score=score,baseline=baseline,compare=table.concat(names,' + '),detail=detail,slot=chosen}
    if special or item.equip=='INVTYPE_TRINKET' then return Result('useful',delta>0 and L('基础属性有提升；特效需另行比较') or L('需比较触发、使用或套装效果'),item,p,extra)end
    if delta>math.max(0.5,baseline*0.03) then return Result('upgrade',L('重点：预计升级'),item,p,extra) end
    if delta>=-0.5 then return Result('same',L('与现用装备相近'),item,p,extra)end
    return Result(score>0 and 'useful' or 'low',score>0 and L('当前天赋可用，基础属性不如现用') or L('当前天赋优先级低'),item,p,extra)
end
