QuestLocations.lua contains a reduced coordinate dataset derived from EverythingQuests:
https://github.com/wheelbarrel00/EverythingQuests

QuestOffersData.lua (2026-10-03) additionally extracts literal quest pickup,
level/race/class/prerequisite/exclusivity facts and giver names from the same
MIT-licensed repository at 5044142504baf75e69e67a46158cca5f889325cc.
Files: QuestAvailable_Forever.lua, QuestSources_Forever.lua,
QuestCategory_Forever.lua and QuestHolidays_Classic.lua (holiday exclusion only).
Chinese quest and NPC names use the Questie name lookups documented below;
Traditional NPC labels are build-time conversions. No Classic walkthrough
descriptions or third-party runtime scripts are imported into this guide.
The original state-driven guide implementation references the public RestedXP
custom-guide concepts: https://community.restedxp.com/custom-guides/ .
No RestedXP route scripts or premium guide content is bundled.

Refined static dungeon atlas (2026-10-03)
----------------------------------------
Under-30 expansion: Blackfathom Deeps A/B/C (Arith / Atlas Team), Gnomeregan
(worldofwar.net / Dan Gilbert), Razorfen Kraul and The Stockade (wowguru.com /
Dan Gilbert), and Scarlet Graveyard (Dan Gilbert) are also Atlas GPL-2.0 image
derivatives. City of Dalaran is an imagegen-edited Forever build 1.60.1.69893
minimap composite: https://warcraftforever.games/maps/city-of-dalaran .
Original assets, edit prompts, reviewed versions and checksums are recorded in
Maps/manifest.json and knowledge/dungeon-maps/provenance.json. Coverage is 12
low-level dungeons plus Scarlet Graveyard, 15 pages including 3 Blackfathom pages;
this does not certify complete quest locations or current beta access.

Maps/ragefire-chasm.tga, wailing-caverns.tga, shadowfang-keep.tga and deadmines.tga
are imagegen-edited derivatives of Atlas Classic reference maps. Original map
credits: Niflheim (RFC/Deadmines), Grimm (WC), worldofwar.net (SFK); Atlas addon:
Dan Gilbert. Source: https://github.com/nanderson11/Atlas/tree/main/Images/Atlas_ClassicWoW
The Atlas-derived images retain GPL-2.0 licensing; see Maps/Atlas-GPL-2.0.txt.
This asset license is separate from the addon's own code license. Original BLPs,
refined PNGs and editing prompts are retained in knowledge/dungeon-maps in the
source workspace; Maps/manifest.json records sources and texture checksums.

Maps/ruins-of-lordaeron.tga, excavation-site.tga and hall-of-thanes.tga are
imagegen-edited references based on Warcraft Forever's community composites
of Blizzard client minimap tiles from build 1.60.1.69893:
https://warcraftforever.games/zh-CN/dungeons/ruins-of-lordaeron
https://warcraftforever.games/zh-CN/dungeons/excavation-site
https://warcraftforever.games/zh-CN/dungeons/hall-of-thanes
Original game artwork belongs to Blizzard. These assets are not relicensed MIT;
community mosaic redistribution terms have not been established.

地图经图像编辑精修；经典位置仅供参考，未作无限版实地逐点验收。
地圖經圖像編輯精修；經典位置僅供參考，未作無限版實地逐點驗收。
Refinement changes appearance only. Maps are static references, not a live
navigation mesh or verified Forever boss/quest coordinates. No player position
or unverified objective location is projected onto these images.
Revision: 5044142504baf75e69e67a46158cca5f889325cc (2026-09-29).
Sources: Data/QuestSpawns_Forever.lua, Data/QuestTurnIn_Forever.lua, Data/QuestCategory_Forever.lua.
DungeonData.lua additionally uses literal eligibility fields from Data/QuestAvailable_Forever.lua at the same revision and license. Dungeon tasks and item facts are imported from the user's dated wowf.io research archive and curated loot records; provenance, incompleteness and Classic-reference labels are documented in docs/DUNGEON_ASSISTANT.md and docs/dungeon-data-receipt.json. No executable code is imported from those guide records.
Build: node tools/build-quest-locations.js reference/EverythingQuests

The source combines Classic quest data adjusted to Forever maps and observed Forever quests. It is incomplete. Map changes and custom quest changes can invalidate older locations. Dungeon entrance coordinates indicate entrances, not interior objectives. Each objective mask retains at most three representative points per map/type.

Dungeon knowledge expansion (2026-10-01): public factual records from
https://foreverchanges.pro/dungeons and the existing WOWF research archive.
Classic item/boss references are explicitly labelled; observed item stats do not
prove the same boss drops that item in Forever. Chinese game quest/NPC names and
separately labelled Classic quest descriptions use Questie v11.22.0 reference
lookups: https://github.com/Questie/Questie/tree/v11.22.0/Localization/lookups/Classic
Only literal reference strings and facts are imported, not third-party runtime code.
See docs/DUNGEON_KNOWLEDGE.md and docs/dungeon-data-receipt.json for provenance.

MIT License

Copyright (c) 2026 Wheelbarrel00

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Quest catalog refreshed 2026-10-03 from EverythingQuests revision 5044142504baf75e69e67a46158cca5f889325cc.
The upstream pickup expansion includes AllTheThings factual records. Its license follows.

The WoW Forever quest data in Data/Quest*_Forever.lua includes quests, quest givers, pickup locations,
required levels, race, class and profession limits, prerequisites and mutually exclusive quests taken
from AllTheThings (https://github.com/ATTWoWAddon/AllTheThings), which is distributed under the license
below.

MIT License

Copyright (c) 2026 AllTheThings WoW Addon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Additional refined Classic maps: Scarlet Library / Armory / Cathedral, Razorfen Downs, Uldaman.
Source: https://github.com/nanderson11/Atlas (GPL-2.0). Embedded author credits retained.
Full source and transformation records: knowledge/dungeon-maps/provenance.json.


Regional quest flow data (2026-10-04)
Source: RestedXP / RXPGuides public Forever guides, revision f3570d06a6b46cf1d080502a9578c50e396e963c
https://github.com/RestedXP/RXPGuides/tree/f3570d06a6b46cf1d080502a9578c50e396e963c/Guides/forever
The ordered quest phase facts in ZoneGuideData.lua routes are adapted under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International. See RXP-FLOWS-LICENSE.txt. This data license is separate from the original addon engine.
Changes: extracts supported accept/complete/turnin phase ordering, actor names, item IDs and class/race gates; slices by actual map ID; excludes unsupported modes/gates; uses separately maintained local/game coordinates instead of source world coordinates. No downloaded runtime code is executed. Quest progress remains authoritative. NPC translations use the Questie reference lookups described above. Full source attribution and per-file Git hashes are recorded in knowledge/zone-flows/flows.json.
