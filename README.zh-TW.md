# Azeroth Adventure Companion

[簡體中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

**艾澤拉斯冒險夥伴** — 為《魔獸世界：無限》準備的 AI 任務助手、冒險日誌和副本助手。

基於 [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai) 的社群增強版。當前版本 **0.6.0-beta.9**，面向 Windows x64 / Forever 1.60 內測。

**[下載 Windows 內測安裝包](https://github.com/hukekele-dotcom/azeroth-adventure-companion/releases)** · **[簡體說明](tools/release/guides/Install-Guide-zhCN.txt)** · **[繁體說明](tools/release/guides/Install-Guide-zhTW.txt)** · **[English guide](tools/release/guides/Install-Guide-en.txt)** · **[反饋問題](https://github.com/hukekele-dotcom/azeroth-adventure-companion/issues)**

[夸克網盤下載 · beta.9 · Windows x64](https://pan.quark.cn/s/a611b721e586)

## 可以做什麼

| 功能 | 用途 |
| --- | --- |
| AI 聊天 | 在遊戲中選擇 Codex 或 WorkBuddy 接入，結合角色、位置和任務提問 |
| 任務助手 | 規劃當前地圖的野外任務，顯示區域數字順序與方向提示，按任務進度推進 |
| 冒險日誌 | 記錄上線地點、任務、擊殺、拾取等經歷，按天翻頁，增量同步到電腦 |
| 生成遊記 | 根據已有冒險記錄整理文字，長記錄分批處理，保留原始素材 |
| 副本助手 | 副本外檢查任務，按陣營及條件篩選，檢視首領掉落與天賦、裝備比較 |
| 語言 | 簡體中文、繁體中文、英文，支援自動跟隨客戶端語言 |

副本資料與裝備評分仍有覆蓋限制，不保證收錄全部隱藏任務或掉落。箭頭是方向提示，不會自動移動、戰鬥或完成任務。

## 玩家安裝

1. 從上方內測發布頁下載 `WoWAI-Forever-0.6.0-beta.9-win-x64.zip`，**完整解壓縮**。GitHub 自動生成的 “Source code” 是開發原始碼，不是玩家安裝包。
2. 退出遊戲和舊橋接，執行 `Install.cmd`。
3. 選擇包含 `WowB.exe` 和 `Interface` 的客戶端目錄（通常為 `_classic_beta_`），選擇預設 AI，無需選擇遊戲帳號。
4. 按“安裝 / 升級 → 登入所選 AI → 啟動橋接”操作。
5. 完全重啟遊戲，啟用 WoWAI 及 WoWAI_S 通訊插件，輸入 `/wow-ai`。傳送兩條訊息驗證通訊。

包內開啟 `README.html` 可離線選擇三種語言，安裝與桌面管理視窗的“說明 / 說明 / Help”也開啟同一入口。安裝程式按鈕目前仍為中文，英文說明附有對應中文按鈕名。

安裝包自帶 Node.js。AI 工具在首次登入時連網下載，玩家使用自己的帳號和額度。日常從桌面“WoW AI 無限”啟動橋接即可。

當前安裝路徑、插件檔名、遊戲命令和介面仍保留 **WoW AI / WoWAI**，以相容已有存檔。Azeroth Adventure Companion 是本社群增強版的專案名稱。

## Codex 與 WorkBuddy

AI 前置要求：至少安裝並登入一種 AI 執行元件。點選“登录所选 AI”會自動下載 Codex CLI 或 WorkBuddy 使用的 CodeBuddy Code；無需預裝桌面應用程式。兩種都要用就分別登入。日常保持橋接執行。

- Codex 使用官方 Codex CLI；WorkBuddy 接入使用官方 CodeBuddy Code 執行引擎，需要單獨完成中國站登入。
- WorkBuddy 預設選擇系統模型 `auto`，不直接操作桌面 WorkBuddy 會話，也不自動沿用其自訂 API 模型。
- 橋接需要在後臺執行，兩種 AI 的桌面聊天視窗不必一直開啟。不同產品的登入狀態、訂閱和額度不保證互通。

## 視窗與記錄

推薦全屏（視窗）或無邊框模式；當前不支援獨佔全屏。訊息傳送時左上角彩條承擔通訊功能，請保持遊戲可見，不要遮擋彩條。

正常退出或 `/reload` 儲存遊戲內記錄；“同步新增日誌”把記錄儲存到電腦。崩潰前尚未儲存、未同步的資料仍可能丟失。電腦檔案可從桌面管理視窗直接開啟。

## 隱私

發布包不包含開發者的遊戲帳號、AI 登入、配置、聊天或冒險檔案。玩家的聊天、任務規劃和遊記素材會發送給所選 AI 服務。反饋問題時只提供必要錯誤片段，不要上傳登入快取、整個 WTF 或正在使用的安裝目錄。

## 開發

需要 Node.js 22.2 或更高版本。

```sh
npm ci
npm test
```

插件在 `addon/WoWAI`，橋接在 `bridge`，安裝與打包工具在 `tools/release`。Windows 發布包構建見 [BUILD.md](tools/release/BUILD.md)。本倉庫不提交執行時配置、個人存檔和 Node 執行時二進位制。

## 最新功能

- 新增建議接取：按地圖、角色條件與已知前置篩選任務，獨立導航接取、完成、交付和已知後續。
- 新增本地圖任務攻略與區域任務流程，支持章節預覽、明確啟用、跳過和離圖暫停；本地導航期間抑制自動 AI 重排。
- 整理公開 Forever 流程的 27 個等級章節、2,958 個任務階段動作，涉及 21 張地圖。其餘地圖保持任務資料模式。
- 保留 AI 分站行動與兼做說明，箭頭懸停顯示當前行動；隱藏已完成區域並連接剩餘路線。
- 檢查目標與地點對應關係，過濾已完成目標，修正部分跨地圖 POI 投影和舊路線顯示。
- 擴充接取/前置資料、副本任務與地圖：4,103 個接取條目、4,231 個座標任務，278 條副本任務記錄、1,315 條物品，15 個副本條目/20 頁參考地圖。
- README 與 NGA 詳細說明同步，保留八張功能截圖；提供 beta.9 夸克完整安裝包下載。

地圖和流程仍需遊戲實跑核對；48 張任務索引及 21 張涉及地圖不代表完整實測攻略。任務推進以真實進度為準，不自動移動、戰鬥或接交任務。區域流程數據 CC BY-NC-SA 4.0，Atlas 地圖 GPL-2.0，原始引擎 MIT。


## 致謝與許可

原始插件與橋接來自 [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai)，保留作者署名和 [MIT LICENSE](LICENSE)。任務座標等第三方資料來源和許可見 [THIRD_PARTY.md](addon/WoWAI/THIRD_PARTY.md)。Windows 包中 Node.js 附帶其許可證。

本專案不是暴雪、OpenAI 或騰訊的官方產品，也不附帶遊戲客戶端或使用者帳號；介面截圖與副本參考地圖保留來源說明。
