# Azeroth Adventure Companion 0.6.0-beta.8

## 简体中文
先使用已有坐标生成本地图备用数字路线，AI 继续接收完整任务目标和候选坐标并优化路线。备用算法选择邻近候选点并进行有限次折返优化，优先普通任务；副本、其他地图任务不纳入路线，未知坐标不猜测。明确显示同步、桥接未确认、等待 AI 通道和规划状态；重复点击显示原因而不重复发送。AI 结果仍须通过快照和坐标校验。备用路线不代表实际道路最短路线。

## 繁體中文
先使用已知座標產生本地備用數字路線，AI 仍接收完整任務目標及候選座標以優化路線。排除副本及其他地圖任務，不猜測未知座標。清楚顯示同步、橋接未確認、等待 AI 通道及規劃狀態；重複點擊提示原因而不重複傳送。備用路線不代表實際道路最短路線。

## English
Build an immediate local numbered fallback from known coordinates while AI still receives all eligible quest objectives and candidate positions. Greedy candidate selection plus bounded 2-opt reduces geometric backtracking and defers harder tasks. Dungeon and other-map quests are excluded; unknown coordinates are not invented. Show bridge acknowledgement, channel wait and planning stages; busy clicks explain status without duplicate requests. AI results still require snapshot and coordinate validation. The fallback does not claim a shortest walkable route.

248 automated tests passed. The affected remote PC has not yet been verified in-game.

升级 / 升級 / Upgrade: 退出游戏、停止旧桥接，完整解压并运行 Install.cmd，再启动桥接和游戏。Exit the game and stop the old bridge, extract fully and run Install.cmd, then restart. Records and sign-in settings are preserved.

**WoWAI-Forever-0.6.0-beta.8-win-x64.zip**
