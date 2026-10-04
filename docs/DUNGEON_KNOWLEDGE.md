# 副本知识库 / 副本知識庫 / Dungeon knowledge base

## 简体中文

副本助手改为从本地知识库构建。游戏内查看任务与掉落不需要联网，也不调用 AI。`knowledge/dungeons/index.html` 是可直接用浏览器打开的离线查询页，支持副本、阵营、任务/掉落筛选和文字搜索。

资料包含此前核对过的副本专题、WOWF 存档、ForeverChanges 2026-10-01 页面事实、EverythingQuests 的 Forever 接取条件及 Questie 的中文名称。低等级已有的人工核对结果优先保留。新资料分为无限社区记录、经典参考、待核实；不能将经典版掉落归属当成无限版实测。未公开的新副本资料保留缺口，不能显示为“已接齐”。同一副本的多个分区合并保存，避免游戏只返回整个副本名称时无法识别。

`catalog.json` 是规范化知识库，`corrections.json` 保存人工纠正，`docs/dungeon-data-receipt.json` 记录来源、文件摘要、覆盖统计与冲突。更新先收集到新日期目录，审核与合并后再构建，不在玩家查询时抓取网页。接取条件未知仍显示待确认；阵营未知不混入联盟或部落的正常漏接清单。经典任务的中文流程单独标注参考，不套用其装备属性和等级。

原始来源档案支持 AES-256-GCM 加密，密钥由 Windows 当前用户的 DPAPI 保护，独立存放于私有工作目录。加密档需与 `key.dpapi` 一同保留；仅复制到另一台机器不能保证解密。原研究文件未删除或改动。供游戏使用的 Lua 数据和离线查询页是可读取的，不属于防复制加密；发布包不得包含私有加密档、密钥、账号、配置或聊天日志。

## 繁體中文

副本助手使用本地知識庫；查閱任務及掉落不需要連線或消耗 AI 額度。開啟 `knowledge/dungeons/index.html`，即可按副本、陣營與資料類別搜尋。

已核對的專題資料優先保留；新資料明確區分無限社群記錄、經典版參考及待核實。未公開的副本資料不代表沒有任務；未知接取條件不當成已滿足，未知陣營不混入一般漏接清單。人工修正、來源、版本及覆蓋統計分開保存，更新後離線產生遊戲資料。

私有原始資料以 AES-256-GCM 加密，密鑰由 Windows 當前使用者的 DPAPI 保護；需保存加密檔及 `key.dpapi`，換電腦不保證可以解密。原研究檔案保持原樣。遊戲使用的 Lua 資料及查詢頁可被讀取，不是防複製保護；發布包不得攜帶私有檔案、密鑰或帳號資料。

## English

The dungeon assistant reads a local reference catalog; viewing quests and loot needs no network or AI requests. Open `knowledge/dungeons/index.html` for offline dungeon, faction, category and text filters.

Reviewed research takes precedence over imported records. Forever community observations, Classic references and unverified information are labelled separately. Observed item stats do not establish a verified boss drop. Missing sources are not evidence that a dungeon has no quests. Unknown faction and eligibility never become unrestricted availability. Related wings are merged for reliable whole-instance name matching.

The source archive uses AES-256-GCM with a separate key protected by Windows CurrentUser DPAPI. Keep the archive and `key.dpapi`; moving them to another computer may not permit decryption. Existing research files remain untouched. Runtime Lua and the offline reader are readable reference exports, not copy protection. Never distribute private archives, keys, accounts, configuration or chat logs.

## Maintenance

2026-10-03 更新：重新核对 13 个低等级副本条目（血色地图范围为墓地；任务库保留整个血色修道院）。新增湿地挖掘场 14 条任务与前后续、达拉然城 5 条任务，并补充 85 条任务的接取或交付位置。新任务最低接取等级来自独立任务详情页，不能用任务难度等级代替。未知阵营不显示为本阵营漏接；可选引导不是强制前置；物品触发和本内任务不能要求进本前接好。新任务中文名为暂译，完整条件仍待实测。

2026-10-03 更新：重新核對 13 個低等級副本項目，新增濕地挖掘場 14 條任務與前後續、達拉然城 5 條任務，並補充 85 條任務的接取或交付位置。最低接取等級與任務難度分開；未知陣營不當成己方漏接，可選引導不當成強制前置。本內及物品觸發任務不要求進本前接好。新任務中文名為暫譯，完整條件仍待實測。

2026-10-03 update: reviewed 13 low-level dungeon entries, including Scarlet Graveyard (the quest catalog retains all Scarlet wings). Added 14 Excavation Site quests/chain steps and 5 Dalaran quests; enriched 85 records with pickup or turn-in references. Acceptance levels come from individual quest pages, never quest difficulty. Unknown faction/eligibility remains unknown. Optional leads are not mandatory prerequisites; item-start and inside quests are not pre-entry omissions. Chinese names of new quests are provisional translations.

`quest-research.json` contains the reviewed supplement with dated sources. `import-under30-quest-research.js <snapshot directory>` rebuilds it from the 2026-10-03 archived public facts without network calls. `merge-dungeon-quest-research.js` applies it before `corrections.json`, preserving prior editorial corrections. Sources: [WOWF quest pages](https://wowf.io/zh/dungeons/dalaran/quests), [Forever Talents quest details](https://wowforevertalents.com/dungeons/excavation-site-wetlands/), [ForeverChanges](https://foreverchanges.pro/dungeons/excavation-site). Reference coordinates are world-zone coordinates, not positions on the static dungeon atlas. No unverified indoor pins are generated.

Normal offline rebuild (no network, no private files):

```text
node tools/build-dungeon-data.js
node tools/build-locales.js
node tools/build-dungeon-reader.js
node --test tests/dungeon_knowledge_test.js tests/dungeon_addon_test.js tests/locale_test.js
```

`collect-dungeon-knowledge.js <new snapshot directory>` archives public facts without evaluating scripts. Review its result before import. `import-dungeon-knowledge.js <research directory>` imports the currently pinned snapshot; advance its dated snapshot path deliberately for an update. Keep the versioned initial baseline; never replace it with an already merged output. The importer also expects the pinned Questie v11.22.0 locale/name snapshots and EverythingQuests revision documented below.

`dungeon-vault.js <research directory> <snapshot directory> <private destination>` archives only whitelisted research files and public snapshots. It verifies authenticated decryption after writing. The destination must be outside this repository. It does not change game data, accounts or the original research files.

Sources: [ForeverChanges](https://foreverchanges.pro/dungeons), [WOWF](https://wowf.io/en/dungeons), [EverythingQuests](https://github.com/wheelbarrel00/EverythingQuests), [Questie v11.22.0](https://github.com/Questie/Questie/tree/v11.22.0). Source scripts are parsed as literal data and never executed. NPC/quest lookup strings retain their game meaning; no third-party addon runtime is bundled.
