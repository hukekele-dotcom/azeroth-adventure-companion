'use strict';
// Apply reviewed image-space pins. Source percentages belong to their source art,
// never to the client mosaic. The research file records each manual calibration.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readAssignment, serialize } = require('./dungeon-knowledge');
function build(root = path.resolve(__dirname, '..')) {
  const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const write = (rel, data) => fs.writeFileSync(path.join(root, rel), JSON.stringify(data, null, 2) + '\n');
  const file = path.join(root, 'addon/WoWAI/DungeonAtlas.lua');
  const atlas = readAssignment(file, 'WoWAIDungeonAtlas');
  const research = read('knowledge/dungeon-maps/boss-positions.json');
  const catalog = read('knowledge/dungeons/catalog.json');
  for (const [id, row] of Object.entries(research.maps)) {
    const art = fs.readFileSync(path.join(root, 'knowledge/dungeon-maps', id + '-refined.png'));
    if (crypto.createHash('sha256').update(art).digest('hex') !== row.artSha256)
      throw Error('Recalibrate pins after changing map art: ' + id);
    if (!atlas[id] || atlas[id].pages) throw Error('Expected single map: ' + id);
    atlas[id].pins = structuredClone(row.pins);
  }
  for (const [id, row] of Object.entries(research.extraPins)) {
    const keys = new Set(row.pins.flatMap(p => p.bossKeys));
    atlas[id].pins = Object.values(atlas[id].pins).filter(p => !Object.values(p.bossKeys).some(k => keys.has(k)));
    atlas[id].pins.push(...structuredClone(row.pins));
  }
  for (const row of research.sharedRooms) {
    const pin = Object.values(atlas[row.dungeon].pins).find(p => Object.values(p.bossKeys).includes(row.with));
    if (!pin) throw Error('Shared room anchor missing: ' + row.with);
    if (!pin.bossKeys.includes(row.boss)) pin.bossKeys.push(row.boss);
  }
  let pages = 0, bosses = 0;
  const coverage = read('knowledge/dungeon-maps/under30-coverage.json');
  for (const [id, map] of Object.entries(atlas)) {
    const dungeon = catalog.dungeons.find(d => d.id === id);
    const valid = new Set(dungeon.bosses.map(b => b.key)), located = new Set();
    for (const page of map.pages || [map]) {
      pages++;
      if (!Object.values(page.pins).some(p => Object.values(p.bossKeys).length)) throw Error('No boss on page: ' + page.id);
      for (const pin of Object.values(page.pins)) {
        if (![pin.x, pin.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw Error('Invalid pin: ' + page.id);
        for (const key of Object.values(pin.bossKeys)) {
          if (!valid.has(key)) throw Error('Unknown map boss: ' + key);
          located.add(key);
        }
      }
    }
    const missing = [...valid].filter(key => !located.has(key));
    if (missing.some(key => !research.excluded[id]?.[key])) throw Error('Unaccounted boss without map location: ' + id + ': ' + missing.join(', '));
    bosses += located.size;
    const row = coverage.dungeons.find(d => d.id === id);
    if (!row) continue; // Higher-level additions are tracked in world coverage.
    row.pages = (map.pages || [map]).length;
    row.mappedBosses = located.size;
    row.bossPositionBasis = research.maps[id] ? 'community room/area reference' : 'classic reference';
    row.unlocated = research.maps[id]?.unlocated || [];
    row.excluded = research.excluded[id] || {};
  }
  fs.writeFileSync(file, '-- Bundled static references. Coordinates are image-space, never world-space.\nWoWAIDungeonAtlas = ' + serialize(atlas) + '\n');
  write('knowledge/dungeon-maps/under30-coverage.json', coverage);
  const provenance = read('knowledge/dungeon-maps/provenance.json');
  for (const row of provenance) if (research.maps[row.id]) {
    row.pinsSource = research.maps[row.id].source;
    row.pinsPrecision = 'room-or-area';
    row.pinsReview = 'Landmarks matched to refined client mosaic; not measured in-game spawn coordinates.';
  }
  write('knowledge/dungeon-maps/provenance.json', provenance);
  write('addon/WoWAI/Maps/manifest.json', provenance.map(({ prompt, ...row }) => row));
  return { dungeonEntries: Object.keys(atlas).length, pages, mappedBosses: bosses };
}
module.exports = { build };
if (require.main === module) console.log(JSON.stringify(build()));
