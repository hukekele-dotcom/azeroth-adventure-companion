QuestLocations.lua contains a reduced coordinate dataset derived from EverythingQuests:
https://github.com/wheelbarrel00/EverythingQuests
Revision: 9c1ce1e44238d8c6c8ca36d8f49836fde70b564f (2026-09-29).
Sources: Data/QuestSpawns_Forever.lua, Data/QuestTurnIn_Forever.lua, Data/QuestCategory_Forever.lua.
DungeonData.lua additionally uses literal eligibility fields from Data/QuestAvailable_Forever.lua at the same revision and license. Dungeon tasks and item facts are imported from the user's dated wowf.io research archive and curated loot records; provenance, incompleteness and Classic-reference labels are documented in docs/DUNGEON_ASSISTANT.md. No executable code is imported from those guide records.
Build: node tools/build-quest-locations.js reference/EverythingQuests

The source combines Classic quest data adjusted to Forever maps and observed Forever quests. It is incomplete. Map changes and custom quest changes can invalidate older locations. Dungeon entrance coordinates indicate entrances, not interior objectives. Each objective mask retains at most three representative points per map/type.

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
