# Azeroth Adventure Companion

> Source and three-language guides are updated for 0.6.0-beta.2. The new Windows package is still pending upload and is not public yet. The release page currently provides the previous 0.6.0-beta.1 package.

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md)

AI quest assistance, daily adventure journals and dungeon assistance for **WoW: Forever**. A community enhancement of [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai).

**0.6.0-beta.2** · Windows x64 · Forever 1.60 Beta

**[Download the Windows package](https://github.com/hukekele-dotcom/azeroth-adventure-companion/releases)** · **[English installation guide](tools/release/guides/Install-Guide-en.txt)** · **[Report an issue](https://github.com/hukekele-dotcom/azeroth-adventure-companion/issues)**

## Features

| Feature | Purpose |
| --- | --- |
| AI Chat | Ask Codex or WorkBuddy questions with character, location and quest context. |
| Quest Assistant | Plan outdoor quests on the current map, with numbered task areas, direction hints and progress tracking. |
| Adventure Journal | Record login locations, quests, kills and loot; browse daily pages and sync new entries to your computer. |
| Travelogues | Turn recorded adventures into readable drafts; process long records in batches and preserve the source records. |
| Dungeon Assistant | Check quests before entering, filter by faction and requirements, and view boss drops with talent and equipment comparisons. |
| Languages | Simplified Chinese, Traditional Chinese and English in game, with an automatic client-language option. |

Dungeon coverage and equipment scoring remain incomplete. Not every hidden quest or drop is included. The arrow provides direction; it does not move, fight or complete quests for you.

## Player installation

1. Download **WoWAI-Forever-0.6.0-beta.2-win-x64.zip** from the release page and extract everything. GitHub's generated “Source code” archives are not player installers.
2. Open **README.html** and choose English, or open **Install-Guide-en.txt**. The complete guides work offline.
3. Exit the game and stop the old bridge. Run **Install.cmd**.
4. Select the client folder containing **WowB.exe** and **Interface** (usually **_classic_beta_**), then your game account and default AI.
5. Install → sign in to the selected AI → start the bridge → completely restart the game.
6. Enable WoWAI and the WoWAI_S communication addons. Type **/wow-ai**, then send two messages to test communication.

The installer and desktop manager have a **说明 / 說明 / Help** button. Their other buttons are currently in Chinese; the English guide includes the original labels. The in-game language setting is independent.

Node.js is bundled. Official AI tools download on first sign-in. Each player uses their own account and allowance. For daily use, start the bridge from the **WoW AI 无限** desktop shortcut.

Installed names, paths, interface branding and commands remain **WoW AI / WoWAI** for save compatibility. Azeroth Adventure Companion is the community project's name.

## Codex and WorkBuddy

- Codex uses the official Codex CLI. WorkBuddy integration uses the official CodeBuddy Code execution engine and requires its own China-region sign-in.
- WorkBuddy defaults to the system model selection **auto**. It does not control a WorkBuddy desktop session or automatically reuse its custom API configuration.
- Keep the bridge running; the AI desktop chat windows do not have to remain open. Authentication, subscriptions and quotas are not guaranteed to be shared between products.

## Display mode and saving

Use Fullscreen (Windowed) or borderless mode. Exclusive fullscreen is unsupported. The colored bars at the top left transmit data: keep the game visible and do not cover them.

Normal logout or **/reload** saves in-game records. **Sync new entries** stores another copy on your computer. Unsaved and unsynchronized records may be lost in a crash. The desktop manager can open the computer archive.

## Privacy

The distribution contains no developer game account, AI credentials, personal configuration, chat or adventure archive. Your chat, quest-planning context and travelogue material are sent to your selected AI service. Share only necessary error excerpts when reporting issues, never sign-in caches, an entire WTF folder or a used installation.

## Development

Requires Node.js 22.2 or later.

```sh
npm ci
npm test
```

Addon source is in `addon/WoWAI`, bridge source in `bridge`, and installer/build tools in `tools/release`. See [BUILD.md](tools/release/BUILD.md) for Windows packaging. Runtime configuration, personal saves and Node.js binaries are excluded from this source repository.

## Beta status

The baseline passed 219 regression tests, seven installer tests and codec round-trip checks. Real account sign-in and the complete in-game flow still need validation on other computers, including route markers, logout persistence and upgrades. This is a Beta, not a stable release.

## Credits and licensing

Based on [chelinho139/wow-ai](https://github.com/chelinho139/wow-ai), with upstream attribution and [MIT LICENSE](LICENSE) preserved. Third-party data sources and notices are in [THIRD_PARTY.md](addon/WoWAI/THIRD_PARTY.md). The Windows bundle includes Node.js's own license. Original legal texts are preserved verbatim.

This is not an official Blizzard, OpenAI or Tencent product. It includes no game client, game images or user accounts.
