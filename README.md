# Azeroth Adventure Companion

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

**艾泽拉斯冒险伙伴** — 为《魔兽世界：无限》准备的 AI 任务助手、冒险日志和副本助手。

基于 [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai) 的社区增强版。当前版本 **0.6.0-beta.5**，面向 Windows x64 / Forever 1.60 内测。

**[下载 Windows 内测安装包](https://github.com/hukekele-dotcom/azeroth-adventure-companion/releases)** · **[简体说明](tools/release/guides/Install-Guide-zhCN.txt)** · **[繁體說明](tools/release/guides/Install-Guide-zhTW.txt)** · **[English guide](tools/release/guides/Install-Guide-en.txt)** · **[反馈问题](https://github.com/hukekele-dotcom/azeroth-adventure-companion/issues)**

## 可以做什么

| 功能 | 用途 |
| --- | --- |
| AI 聊天 | 在游戏中选择 Codex 或 WorkBuddy 接入，结合角色、位置和任务提问 |
| 任务助手 | 规划当前地图的野外任务，显示区域数字顺序与方向提示，按任务进度推进 |
| 冒险日志 | 记录上线地点、任务、击杀、拾取等经历，按天翻页，增量同步到电脑 |
| 生成游记 | 根据已有冒险记录整理文字，长记录分批处理，保留原始素材 |
| 副本助手 | 副本外检查任务，按阵营及条件筛选，查看首领掉落与天赋、装备比较 |
| 语言 | 简体中文、繁体中文、英文，支持自动跟随客户端语言 |

副本资料与装备评分仍有覆盖限制，不保证收录全部隐藏任务或掉落。箭头是方向提示，不会自动移动、战斗或完成任务。

## 玩家安装

1. 从上方内测发布页下载 `WoWAI-Forever-0.6.0-beta.5-win-x64.zip`，**完整解压**。GitHub 自动生成的 “Source code” 是开发源码，不是玩家安装包。
2. 退出游戏和旧桥接，运行 `Install.cmd`。
3. 选择包含 `WowB.exe` 和 `Interface` 的客户端目录（通常为 `_classic_beta_`），选择默认 AI，无需选择游戏账号。
4. 按“安装 / 升级 → 登录所选 AI → 启动桥接”操作。
5. 完全重启游戏，启用 WoWAI 及 WoWAI_S 通信插件，输入 `/wow-ai`。发送两条消息验证通信。

包内打开 `README.html` 可离线选择三种语言，安装与桌面管理窗口的“说明 / 說明 / Help”也打开同一入口。安装器按钮目前仍为中文，英文说明附有对应中文按钮名。

安装包自带 Node.js。AI 工具在首次登录时联网下载，玩家使用自己的账号和额度。日常从桌面“WoW AI 无限”启动桥接即可。

当前安装路径、插件文件名、游戏命令和界面仍保留 **WoW AI / WoWAI**，以兼容已有存档。Azeroth Adventure Companion 是本社区增强版的项目名称。

## Codex 与 WorkBuddy

AI 前置要求：至少安装并登录一种 AI 运行组件。点击“登录所选 AI”会自动下载 Codex CLI 或 WorkBuddy 所用的 CodeBuddy Code；无需预装桌面客户端。两种都要用就分别登录。日常保持桥接运行。

- Codex 使用官方 Codex CLI；WorkBuddy 接入使用官方 CodeBuddy Code 执行引擎，需要单独完成中国站登录。
- WorkBuddy 默认选择系统模型 `auto`，不直接操作桌面 WorkBuddy 会话，也不自动沿用其自定义 API 模型。
- 桥接需要在后台运行，两种 AI 的桌面聊天窗口不必一直打开。不同产品的登录状态、订阅和额度不保证互通。

## 窗口与记录

推荐全屏（窗口）或无边框模式；当前不支持独占全屏。消息发送时左上角彩条承担通信功能，请保持游戏可见，不要遮挡彩条。

正常退出或 `/reload` 保存游戏内记录；“同步新增日志”把记录保存到电脑。崩溃前尚未保存、未同步的数据仍可能丢失。电脑档案可从桌面管理窗口直接打开。

## 隐私

发布包不包含开发者的游戏账号、AI 登录、配置、聊天或冒险档案。玩家的聊天、任务规划和游记素材会发送给所选 AI 服务。反馈问题时只提供必要错误片段，不要上传登录缓存、整个 WTF 或正在使用的安装目录。

## 开发

需要 Node.js 22.2 或更高版本。

```sh
npm ci
npm test
```

插件在 `addon/WoWAI`，桥接在 `bridge`，安装与打包工具在 `tools/release`。Windows 发布包构建见 [BUILD.md](tools/release/BUILD.md)。本仓库不提交运行时配置、个人存档和 Node 运行时二进制。

## 内测状态

本地回归测试 243 项、安装测试 11 项及通信编解码检查已通过。仍需在其他电脑完成真实账号登录、游戏内通信、路线标记、下线保存及升级测试。请按 Beta 使用；这不是正式稳定版。

## 致谢与许可

原始插件与桥接来自 [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai)，保留作者署名和 [MIT LICENSE](LICENSE)。任务坐标等第三方数据来源和许可见 [THIRD_PARTY.md](addon/WoWAI/THIRD_PARTY.md)。Windows 包中 Node.js 附带其许可证。

本项目不是暴雪、OpenAI 或腾讯的官方产品，也不附带游戏客户端、游戏图片或用户账号。
