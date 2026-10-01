'use strict';
const fs = require('fs'), path = require('path');

// Only the addon's own saved file is read. Never inspect account credentials.
function savedVariableFiles(cfg) {
  if (!cfg.savedVariablesRoot) return cfg.savedVariablesFile ? [String(cfg.savedVariablesFile).replace(/WoWClaude\.lua$/, 'WoWAI.lua')] : [];
  let entries;
  try { entries = fs.readdirSync(cfg.savedVariablesRoot, {withFileTypes:true}); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const folder = path.join(cfg.savedVariablesRoot, entry.name, 'SavedVariables');
    const file = path.join(folder, 'WoWAI.lua');
    try {
      if (fs.lstatSync(folder).isSymbolicLink()) continue;
      const st = fs.lstatSync(file);
      if (st.isFile() && !st.isSymbolicLink()) files.push({file,mtime:st.mtimeMs});
    } catch {}
  }
  return files.sort((a,b)=>b.mtime-a.mtime || a.file.localeCompare(b.file)).map(x=>x.file);
}
function matchesActiveSession(job, session) {
  return !!job && !!session && job.session === session;
}
module.exports = {savedVariableFiles, matchesActiveSession};
