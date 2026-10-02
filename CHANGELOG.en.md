# 0.6.0-beta.8


## 本地资料库 / 本機資料庫 / Shared local catalog
两端共用 4,228 条任务的坐标资料库；库内候选地点仅传引用编号，实时任务目标和新坐标保留。电脑端还原完整资料后交给 AI 出方案，插件校验后标记。版本不一致会明确报错，不使用错误坐标。暂未启用跨请求的进度差量传输。
兩端共用 4,228 筆任務座標資料；以引用編號減少重複傳輸，保留即時目標及新座標。電腦端還原完整資料供 AI 規劃，版本不符時明確提示。
Both sides share coordinate references for 4,228 quests. Static candidates travel as references; live objectives and new coordinates remain intact. The bridge restores full data for AI planning. Catalog mismatches fail explicitly. Cross-request progress deltas are not enabled.

Three reference quests: 4,649 -> 1,211 UTF-8 bytes, with all objectives and candidates verified after reconstruction. This is a transfer-size measurement, not an end-to-end latency guarantee.

Build an immediate local numbered fallback from known coordinates while AI still receives all eligible quest objectives and candidate positions. Greedy candidate selection plus bounded 2-opt reduces geometric backtracking and defers harder tasks. Dungeon and other-map quests are excluded; unknown coordinates are not invented. Show bridge acknowledgement, channel wait and planning stages; busy clicks explain status without duplicate requests. AI results still require snapshot and coordinate validation. The fallback does not claim a shortest walkable route.

# 0.6.0-beta.7

Open the WorkBuddy model menu to the right of its button, above chat controls. Keep it within screen bounds and hide the hover tooltip when opening it.

# 0.6.0-beta.6

Reduce planning effort/output and accept validated complete routes before CLI shutdown; preserve model selection and timeout safeguards.

# 0.6.0-beta.5

Fix Windows installer Unicode decoding; remove game-account selection and automatically discover addon saves.

# Changelog

## 0.6.0-beta.4

Fixes misleading bridge errors after prolonged route research: research has a time limit, followed by at most one tools-disabled AI attempt using the same snapshot and model. Unknown locations remain unresolved. WorkBuddy supports Auto, GLM-5.3 and DeepSeek-V4.1-Flash. The local dungeon catalogue now contains 28 entries, 21 with quest and loot data, covering 259 quest entries and 1,315 item entries. Some data remains Classic reference material, not fully verified Forever data. All three guides clarify runtime installation and separate sign-in.

## 0.6.0-beta.3

Quest details show minimum acceptance levels and any level shortfall. A preparation note uses the current character's faction, class and remaining documented quests to suggest a level for collecting dungeon quests together. Prerequisite chains, in-dungeon starts and missing data are identified separately. This is not a combat-level recommendation or a guarantee of completing everything in one run.

## 0.6.0-beta.2 — Three-language documentation

- Complete installation, AI sign-in, daily use, troubleshooting, backup and removal guides in Simplified Chinese, Traditional Chinese and English.
- Offline language selection page, HTML guides and plain-text alternatives.
- Shared help entry in the installer and desktop manager; all guides are retained after installation and upgrades.
- In-game functionality is unchanged. Installer buttons remain in Chinese; the English guide includes their original labels.

## 0.6.0-beta.1 — First Windows Beta

- AI Chat, current-map quest routes and numbered regions, daily adventure journals, travelogue generation, dungeon quests and drop assistance.
- Codex and WorkBuddy / CodeBuddy Code integration, plus Simplified Chinese, Traditional Chinese and English in game.
- Windows installer with bundled runtime, explicit account selection, independent AI sign-in and a desktop bridge manager.
- Upgrade backups and preservation of installer-managed configuration and archives, with a complete Chinese guide.
- Explicit publication allow-list excluding personal configuration, accounts, chat and journals; upstream and third-party licenses retained.

Still in Beta: dungeon data is incomplete, exclusive fullscreen is unsupported, and real sign-in and end-to-end in-game validation on new computers are pending.
