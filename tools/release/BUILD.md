# Windows beta release tooling

This directory builds a separate player distribution without reading the live `bridge/config.json`, installed game Inbox, personal receipts or the journal workspace. It does not change the running developer installation or upload anything.

## Build inputs

- Current addon/bridge source, copied by explicit allow-list in `build.cjs`.
- Node.js v22.23.3 Windows x64 official ZIP, cached under `%TEMP%/wow-ai-release-cache/` and extracted into `node-v22.23.3-win-x64`.
- Verify the ZIP against the official `https://nodejs.org/dist/v22.23.3/SHASUMS256.txt`. Expected SHA-256 is also pinned in `build.cjs`.
- AI tools are not bundled with credentials. The player login helper installs pinned official npm packages; see `release.json` in the generated distribution.

## Commands

```powershell
node tools/release/build.cjs C:\path\to\fresh-output-directory
$env:WOWAI_TEST_BUNDLE='C:\path\to\fresh-output-directory\WoWAI-Forever-0.6.0-beta.1-win-x64'
node --test tools/release/installer.test.cjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/release/ui-smoke.ps1 -Bundle $env:WOWAI_TEST_BUNDLE
npm.cmd test
```

Tests install only into generated temporary fixtures. Their process guard is injected; the real installer always checks for running game/bridge processes. GUI smoke tests construct WinForms controls without opening a window, sending messages or logging into an AI account. Runtime CLI version checks are not proof of account authentication.

## Packaging

ZIP only the generated `WoWAI-Forever-...` directory, including its root folder. Keep the UTF-8 BOM on PowerShell scripts for Windows PowerShell 5.1 Chinese text. Verify every ZIP entry against `manifest.json`; retain an external ZIP SHA-256. The manifest provides corruption detection, not publisher authentication or a code signature.

Source code and MIT / third-party notices are included in the player distribution. The official Node runtime includes its own LICENSE. Never package this whole development repository, the game WTF directory, or an already-used player installation.

## Before a public release

Run the full player checklist from README.txt on a clean Windows account or another machine: install into a real client, log into each AI, two-turn game chat, planning/map badge visibility, journal logout persistence/daily pages/travelogue, then an upgrade with records present. Record actual results separately from automated test results. Public upload and signing are separate release steps.
