# Azeroth Adventure Companion 0.6.0-beta.6

## 简体中文
优化 WorkBuddy 任务规划超时：规划请求使用低推理强度，保留玩家选择的系统模型；缩短路线输出，减少逐任务重复说明。收到完整路线后先校验快照、全部任务和候选坐标，合格即返回，不再等待 CLI 结束信号。缺失或无效坐标不会生成箭头，未完成或过期的路线不能覆盖原路线。

查资料仍有 90 秒上限；必要时仅用同一模型和快照进行一次不联网规划（150 秒）。服务端无响应仍可能超时，不会自动切换模型。新增阶段、模型、输出量与无响应时长诊断信息，便于后续排查。

246 项功能测试通过。历史 7 任务快照在 DeepSeek-V4.1-Flash 上约 37 秒返回有效规划；这不是所有请求的时间保证，也不等于报错电脑已通过游戏内验收。

## 繁體中文
優化 WorkBuddy 任務規劃逾時：降低規劃推理強度、縮短路線輸出，保留玩家選擇的系統模型。完整路線通過快照、任務及候選座標檢查後即返回，不再等待 CLI 結束訊號。不完整或過期的結果不會覆蓋原路線，也不會猜測箭頭座標。保留 90 秒查詢與必要時同模型 150 秒不聯網規劃上限；服務端無回應仍可能逾時。

## English
Reduces WorkBuddy planning latency with low reasoning effort and compact route output, preserving the selected hosted model. A complete assistant route is returned immediately after validating its snapshot, quest coverage and coordinate candidates, without waiting for CLI shutdown. Invalid, stale or incomplete routes cannot replace the previous route. Research remains capped at 90 seconds with at most one same-model, tools-disabled 150-second planning attempt. Service-side stalls may still time out.

246 tests passed. A historical seven-quest snapshot produced a valid plan in about 37 seconds with DeepSeek-V4.1-Flash; this is not a latency guarantee or validation on the affected PC.

下载 / 下載 / Download: **WoWAI-Forever-0.6.0-beta.6-win-x64.zip**. Exit the game, stop the old bridge, extract fully, run Install.cmd, then start the updated bridge. Existing records and AI sign-in configuration are preserved. No game-account selection is required. Windows x64 Beta.
